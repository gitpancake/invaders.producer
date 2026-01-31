import { PostgresFlashesDb } from "../database/invader-flashes";
import { FlashcastrUsersDb } from "../database/flashcastr-users";
import SpaceInvadersAPI from "../flash-invaders";
import { RabbitImagePush } from "../rabbitmq";
import { formattedCurrentTime } from "../times";
import { CronTask } from "./base";
import { DiskPersistence } from "../disk-persistence";
import {
    flashesSyncedTotal,
    flashesNewTotal,
    apiRequestsTotal,
    apiErrorsTotal,
    lastSyncTimestamp,
    syncDurationSeconds,
} from "../metrics";

export class StoreFlashesCron extends CronTask {
    private static diskPersistence: DiskPersistence = new DiskPersistence();
    private static lastFlashCount: string | null = null;
    private static consecutiveNoChanges: number = 0;

    constructor(schedule: string) {
        super("store-flashes", schedule);
    }

    public async task(): Promise<void> {
        return StoreFlashesCron.executeTask();
    }

    public static async executeTask(): Promise<void> {
        // Smart scheduling: skip some runs during European night hours (11 PM - 6 AM CET)
        if (!StoreFlashesCron.isPeakFlashTime()) {
            // During off-peak, only run every other scheduled time (reduces frequency by 50%)
            const shouldSkip = Math.random() < 0.5;
            if (shouldSkip) {
                console.log(
                    `[StoreFlashesCron] Skipping run during off-peak hours (European night)`,
                );
                return;
            }
        }

        const syncStartTime = Date.now();
        const invaderApi = new SpaceInvadersAPI();

        // First, try to retry any previously failed flashes
        const previouslyFailedFlashes =
            await StoreFlashesCron.diskPersistence.retryFailedFlashes();
        if (previouslyFailedFlashes.length > 0) {
            console.log(
                `[StoreFlashesCron] Retrying ${previouslyFailedFlashes.length} previously failed flashes...`,
            );
            await StoreFlashesCron.processFlashes(
                previouslyFailedFlashes,
                "retry-failed-flashes",
            );
        }

        apiRequestsTotal.inc();
        let flashes;
        try {
            flashes = await invaderApi.getFlashes();
        } catch (error) {
            apiErrorsTotal.inc();
            throw error;
        }

        if (
            !flashes ||
            !flashes.with_paris.length ||
            !flashes.without_paris.length
        ) {
            console.error("No flashes found since " + formattedCurrentTime());
            throw new Error("No flashes found since " + formattedCurrentTime());
        }

        // Track synced flashes
        flashesSyncedTotal.inc(
            flashes.with_paris.length + flashes.without_paris.length,
        );

        // Check if flash count has changed to avoid unnecessary processing
        const currentFlashCount = flashes.flash_count;
        if (StoreFlashesCron.lastFlashCount === currentFlashCount) {
            StoreFlashesCron.consecutiveNoChanges++;

            // Implement backoff: skip more frequently if we've seen many unchanged results
            const backoffThreshold = Math.min(
                StoreFlashesCron.consecutiveNoChanges,
                10,
            ); // Max backoff at 10 consecutive
            const shouldSkipDueToBackoff =
                Math.random() < backoffThreshold * 0.1; // 10% skip rate per consecutive no-change

            if (shouldSkipDueToBackoff) {
                console.log(
                    `[StoreFlashesCron] Backoff skip (${StoreFlashesCron.consecutiveNoChanges} consecutive unchanged, count: ${currentFlashCount})`,
                );
                return;
            }

            console.log(
                `[StoreFlashesCron] No new flashes detected (${StoreFlashesCron.consecutiveNoChanges} consecutive, count: ${currentFlashCount}) - skipping processing`,
            );
            return;
        }

        // Reset backoff counter when we detect changes
        console.log(
            `[StoreFlashesCron] Flash count changed: ${StoreFlashesCron.lastFlashCount} → ${currentFlashCount} (after ${StoreFlashesCron.consecutiveNoChanges} unchanged)`,
        );
        StoreFlashesCron.consecutiveNoChanges = 0;
        StoreFlashesCron.lastFlashCount = currentFlashCount;

        const flattened = [...flashes.with_paris, ...flashes.without_paris];
        await StoreFlashesCron.processFlashes(
            flattened,
            "new-flashes",
            flashes,
        );

        // Record sync completion metrics
        lastSyncTimestamp.set(Date.now() / 1000);
        syncDurationSeconds.observe((Date.now() - syncStartTime) / 1000);
    }

    private static async processFlashes(
        flattened: any[],
        context: string,
        originalFlashes?: any,
    ): Promise<void> {
        try {
            // Get flashcastr users to filter paris flashes
            const flashcastrUsers = await new FlashcastrUsersDb().getMany({});
            const flashcastrUsernames = new Set(
                flashcastrUsers.map((user) => user.username.toLowerCase()),
            );

            // Clear flashcastrUsers array to free memory immediately
            flashcastrUsers.length = 0;

            // Filter which flashes to write to database and publish to RabbitMQ
            let flashesToProcess: any[];

            if (!originalFlashes) {
                // For retry scenarios, we don't have original flash categories, so process all
                flashesToProcess = flattened;
            } else {
                // Process without_paris flashes (no filtering) - create shallow copy to avoid memory issues
                const withoutParisToProcess = [
                    ...(originalFlashes.without_paris || []),
                ];

                // Process with_paris flashes (only flashcastr users) - filter in-place for memory efficiency
                const withParisToProcess = (
                    originalFlashes.with_paris || []
                ).filter((flash: any) =>
                    flashcastrUsernames.has(flash.player.toLowerCase()),
                );

                flashesToProcess = [
                    ...withoutParisToProcess,
                    ...withParisToProcess,
                ];

                // Clear original arrays to free memory
                originalFlashes.without_paris = null;
                originalFlashes.with_paris = null;
            }

            // Clear flattened array reference to free memory
            flattened.length = 0;

            console.log(
                `[StoreFlashesCron] Processing ${flashesToProcess.length} flashes (${context})`,
            );

            // First, check which flashes already exist in DB
            const flashIds = flashesToProcess.map((f) => f.flash_id);
            const existingFlashes =
                await StoreFlashesCron.getFlashesByIds(flashIds);
            const existingFlashIds = new Set(
                existingFlashes.map((f) => f.flash_id),
            );

            // Clear flashIds array to free memory
            flashIds.length = 0;

            // Database write with error handling and persistence
            let writtenDocuments: any[] = [];
            try {
                writtenDocuments = await new PostgresFlashesDb().writeMany(
                    flashesToProcess,
                );
                console.log(
                    `[StoreFlashesCron] Successfully wrote ${writtenDocuments.length} documents to database`,
                );
                flashesNewTotal.inc(writtenDocuments.length);
            } catch (dbError) {
                console.error(
                    `[StoreFlashesCron] Database write failed (${context}):`,
                    dbError,
                );

                // Persist failed flashes to disk for retry
                await StoreFlashesCron.diskPersistence.persistFailedFlashes(
                    flashesToProcess,
                    `database-write-failure-${context}: ${(dbError as Error).message}`,
                );

                // Don't proceed to RabbitMQ if database write failed
                return;
            }

            // Flashes to publish: newly written + existing ones without ipfs_cid
            const newlyWrittenFlashes = flashesToProcess.filter((flash) => {
                return writtenDocuments.some(
                    (doc) => Number(doc.flash_id) === flash.flash_id,
                );
            });

            const existingFlashesWithoutIpfs = existingFlashes.filter(
                (flash) => !flash.ipfs_cid || flash.ipfs_cid.trim() === "",
            );

            const flashesToPublish = [
                ...newlyWrittenFlashes,
                ...existingFlashesWithoutIpfs,
            ];

            if (flashesToPublish.length === 0) {
                console.log(
                    `[StoreFlashesCron] No flashes to publish to RabbitMQ (${context})`,
                );
                return;
            }

            // RabbitMQ publishing with error handling and persistence
            const rabbit = new RabbitImagePush();
            const failedPublishes: any[] = [];
            let publishCount = 0;

            // Process in smaller batches to reduce memory usage
            const batchSize = parseInt(process.env.RABBITMQ_BATCH_SIZE || "50");
            for (let i = 0; i < flashesToPublish.length; i += batchSize) {
                const batch = flashesToPublish.slice(i, i + batchSize);

                // Process batch in parallel but with concurrency limit
                const concurrencyLimit = parseInt(
                    process.env.RABBITMQ_CONCURRENCY || "5",
                );
                for (let j = 0; j < batch.length; j += concurrencyLimit) {
                    const concurrentBatch = batch.slice(
                        j,
                        j + concurrencyLimit,
                    );

                    await Promise.allSettled(
                        concurrentBatch.map(async (flash) => {
                            try {
                                await rabbit.publish(flash);
                                publishCount++;
                            } catch (rabbitError) {
                                console.error(
                                    `[StoreFlashesCron] Failed to publish flash ${flash.flash_id} to RabbitMQ:`,
                                    rabbitError,
                                );
                                failedPublishes.push(flash);
                            }
                        }),
                    );
                }

                // Small delay between batches to prevent overwhelming RabbitMQ
                if (i + batchSize < flashesToPublish.length) {
                    await new Promise((resolve) => setTimeout(resolve, 100));
                }
            }

            // Persist any failed RabbitMQ publishes to disk
            if (failedPublishes.length > 0) {
                await StoreFlashesCron.diskPersistence.persistFailedFlashes(
                    failedPublishes,
                    `rabbitmq-publish-failure-${context}`,
                );
            }

            // Logging for successful operations
            if (originalFlashes) {
                const newWithoutParisCount = flashesToPublish.filter((f) =>
                    originalFlashes.without_paris?.some(
                        (wp: any) => wp.flash_id === f.flash_id,
                    ),
                ).length;
                const newWithParisFromFlashcastrCount = flashesToPublish.filter(
                    (f) =>
                        originalFlashes.with_paris?.some(
                            (wp: any) => wp.flash_id === f.flash_id,
                        ) && flashcastrUsernames.has(f.player.toLowerCase()),
                ).length;

                console.log(
                    `[StoreFlashesCron] Found ${flashesToProcess.length} flashes to process, ${flashesToPublish.length} flashes to publish (${newlyWrittenFlashes.length} new + ${existingFlashesWithoutIpfs.length} existing without ipfs_cid) (${newWithoutParisCount} without_paris + ${newWithParisFromFlashcastrCount} with_paris from flashcastr users)`,
                );
            }

            if (publishCount > 0 || writtenDocuments.length > 0) {
                console.log(
                    `[StoreFlashesCron] ${flattened.length} flashes. ${publishCount} new events published. ${writtenDocuments.length} new documents. ${formattedCurrentTime()}`,
                );
            }

            // Clear successfully processed failed flashes if this was a retry
            if (context === "retry-failed-flashes" && publishCount > 0) {
                await StoreFlashesCron.diskPersistence.clearFailedFlashes();
            }
        } catch (error) {
            console.error(
                `[StoreFlashesCron] Unexpected error processing flashes (${context}):`,
                error,
            );

            // Persist all flashes to disk if we hit an unexpected error
            await StoreFlashesCron.diskPersistence.persistFailedFlashes(
                flattened,
                `unexpected-error-${context}: ${(error as Error).message}`,
            );
        }
    }

    private static async getFlashesByIds(flashIds: number[]): Promise<any[]> {
        const flashesDb = new PostgresFlashesDb();
        return await flashesDb.getByIds(flashIds);
    }

    private static isPeakFlashTime(): boolean {
        // Peak flash times: European daytime (6 AM - 11 PM CET/CEST)
        // CET is UTC+1, CEST is UTC+2. Using UTC+1 as baseline.
        const now = new Date();
        const cetHour = (now.getUTCHours() + 1) % 24;

        // Peak hours: 6 AM to 11 PM CET (18 hours)
        // Off-peak: 11 PM to 6 AM CET (7 hours)
        return cetHour >= 6 && cetHour < 23;
    }
}
