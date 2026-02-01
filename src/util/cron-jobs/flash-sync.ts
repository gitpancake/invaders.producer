import { getUnixTime } from "date-fns";
import { config } from "dotenv";
import { FlashcastrFlashesDb } from "../database/flashcastr-flashes";
import { FlashcastrFlash } from "../database/flashcastr-flashes/types";
import { FlashcastrUsersDb } from "../database/flashcastr-users";
import { FlashIdentificationsDb } from "../database/flash-identifications";
import { FlashIdentification } from "../database/flash-identifications/types";
import { PostgresFlashesDb } from "../database/invader-flashes";
import { Flash } from "../database/invader-flashes/types";
import { decrypt } from "../encrypt";
import { NeynarUsers } from "../neynar/users";
import { formattedCurrentTime } from "../times";
import { CronTask } from "./base";
import { castsPublishedTotal, castsFailedTotal } from "../metrics";

config({ path: ".env" });

const CONFIDENCE_THRESHOLD = 0.8;

/**
 * Generate the cast message for a flash
 * If high-confidence identification exists, use the flash name
 * Otherwise, fall back to city name
 */
function generateCastMessage(
    flash: { city: string },
    identification: FlashIdentification | null,
): string {
    if (identification && identification.confidence >= CONFIDENCE_THRESHOLD && identification.matched_flash_name) {
        return `I just flashed ${identification.matched_flash_name} in ${flash.city}! 👾`;
    }
    return `I just flashed an Invader in ${flash.city}! 👾`;
}

export class FlashSyncCron extends CronTask {
    private static flashTimespanMins = 60; // 1 hour lookback
    private static retryLookbackDays = 7; // 7 days lookback for retries
    private static maxRetriesPerRun = 50; // Max flashes to retry per run

    constructor(schedule: string) {
        super("flash-sync", schedule);
    }

    public async task(): Promise<void> {
        return FlashSyncCron.executeTask();
    }

    public static async executeTask(): Promise<void> {
        try {
            /* ------------------------------------------------------------------ */
            /* 1.  Fetch registered users                                         */
            /* ------------------------------------------------------------------ */
            const users = await new FlashcastrUsersDb().getMany({});
            if (!users.length) return;

            const usersByUsername = new Map(users.map((u) => [u.username, u]));

            /* ------------------------------------------------------------------ */
            /* 2.  Fetch flashes from the last N minutes                          */
            /* ------------------------------------------------------------------ */
            const sinceUnix = getUnixTime(
                new Date(Date.now() - FlashSyncCron.flashTimespanMins * 60_000),
            );
            const flashes = await new PostgresFlashesDb().getSinceByPlayers(
                sinceUnix,
                [...usersByUsername.keys()].map((u) => u.toLowerCase()),
            );
            if (!flashes.length) return;

            /* ------------------------------------------------------------------ */
            /* 3.  Remove flashes we already processed                            */
            /* ------------------------------------------------------------------ */
            const flashIds = flashes.map((f) => f.flash_id);
            const flashcastrFlashesDb = new FlashcastrFlashesDb();
            const alreadyStored =
                await flashcastrFlashesDb.getByFlashIds(flashIds);
            const newFlashes = flashes.filter(
                (f) => !alreadyStored.some((e) => e.flash_id === f.flash_id),
            );
            if (!newFlashes.length) return;

            /* ------------------------------------------------------------------ */
            /* 4.  Fetch Neynar profiles (dedup with Set for speed)               */
            /* ------------------------------------------------------------------ */
            const uniqueFids = [...new Set(users.map((u) => u.fid))];
            const neynarUsers = await new NeynarUsers().getUsersByFids(
                uniqueFids,
            );
            const neynarByFid = new Map(neynarUsers.map((u) => [u.fid, u]));

            /* ------------------------------------------------------------------ */
            /* 5.  Fetch flash identifications for all new flashes                */
            /* ------------------------------------------------------------------ */
            const ipfsCids = newFlashes
                .filter((f) => f.ipfs_cid && f.ipfs_cid.trim() !== "")
                .map((f) => f.ipfs_cid);
            const identificationsDb = new FlashIdentificationsDb();
            const identificationsByCid = await identificationsDb.getByIpfsCids(ipfsCids);

            /* ------------------------------------------------------------------ */
            /* 6.  Build flash-documents & optionally publish auto-casts          */
            /* ------------------------------------------------------------------ */
            const publisher = new NeynarUsers(); // reuse 1 instance
            const docs: FlashcastrFlash[] = [];

            for (const flash of newFlashes) {
                const appUser = [...usersByUsername.entries()].find(
                    ([username]) =>
                        username.toLowerCase() === flash.player.toLowerCase(),
                )?.[1];
                if (!appUser) continue; // should not happen

                const neynarUsr = neynarByFid.get(appUser.fid);
                if (!neynarUsr) continue;

                let castHash: string | null = null;
                if (appUser.auto_cast) {
                    // Only cast if IPFS hash is populated
                    if (!flash.ipfs_cid || flash.ipfs_cid.trim() === "") {
                        console.log(
                            `Skipping auto-cast for flash ${flash.flash_id} - IPFS hash not yet populated`,
                        );
                        continue;
                    }

                    try {
                        const decryptionKey = process.env.SIGNER_ENCRYPTION_KEY;

                        if (!decryptionKey)
                            throw new Error(
                                "SIGNER_ENCRYPTION_KEY is not defined",
                            );

                        // Get identification for this flash
                        const identification = identificationsByCid.get(flash.ipfs_cid) || null;
                        const castMessage = generateCastMessage(flash, identification);

                        castHash = await publisher.publishCast({
                            signerUuid: decrypt(
                                appUser.signer_uuid,
                                decryptionKey,
                            ),
                            msg: castMessage,
                            embeds: [
                                {
                                    url: `https://www.flashcastr.app/flash/${flash.flash_id}`,
                                },
                            ],
                            channelId: "invaders",
                        });

                        // Log which message was used
                        if (identification && identification.confidence >= CONFIDENCE_THRESHOLD) {
                            console.log(
                                `[FlashSyncCron] Cast with identification: ${identification.matched_flash_name} (${(identification.confidence * 100).toFixed(1)}% confidence)`,
                            );
                        }

                        castsPublishedTotal.inc();
                    } catch (err) {
                        castsFailedTotal.inc();
                        console.error(
                            `Failed to auto-cast flash ${flash.flash_id}:`,
                            err,
                        );
                    }
                }

                docs.push({
                    flash_id: flash.flash_id,
                    user_fid: appUser.fid,
                    user_pfp_url: neynarUsr.pfp_url ?? "",
                    user_username: neynarUsr.username,
                    cast_hash: castHash,
                });
            }

            /* ------------------------------------------------------------------ */
            /* 7.  Persist & log                                                  */
            /* ------------------------------------------------------------------ */
            if (docs.length) await flashcastrFlashesDb.insertMany(docs);

            console.log(
                `${docs.length} flashes processed, ` +
                    `${docs.filter((d) => d.cast_hash).length} auto-casts. ` +
                    formattedCurrentTime(),
            );
        } catch (error) {
            console.error("flash-sync cron failed:", error);
        }
    }

    public static async retryFailedCasts(): Promise<void> {
        try {
            console.log("[FlashSyncCron] Starting retry of failed casts...");

            const flashcastrFlashesDb = new FlashcastrFlashesDb();
            const failedFlashes =
                await flashcastrFlashesDb.getFailedCastsForRetry(
                    FlashSyncCron.maxRetriesPerRun,
                    FlashSyncCron.retryLookbackDays,
                );

            if (!failedFlashes.length) {
                console.log("[FlashSyncCron] No failed casts to retry");
                return;
            }

            console.log(
                `[FlashSyncCron] Found ${failedFlashes.length} failed casts to retry`,
            );

            const flashIds = failedFlashes.map((f) => f.flash_id);
            const flashesDb = new PostgresFlashesDb();
            const flashDetails = await flashesDb.getByIds(flashIds);
            const flashDetailsMap = new Map(flashDetails.map((f) => [f.flash_id, f]));

            const ipfsCids = flashDetails
                .filter((f) => f.ipfs_cid && f.ipfs_cid.trim() !== "")
                .map((f) => f.ipfs_cid);
            const identificationsDb = new FlashIdentificationsDb();
            const identificationsByCid = await identificationsDb.getByIpfsCids(ipfsCids);

            const publisher = new NeynarUsers();
            let successCount = 0;
            let failCount = 0;

            for (const flash of failedFlashes) {
                try {
                    const decryptionKey = process.env.SIGNER_ENCRYPTION_KEY;

                    if (!decryptionKey) {
                        console.error("SIGNER_ENCRYPTION_KEY is not defined");
                        continue;
                    }

                    const flashDetail = flashDetailsMap.get(flash.flash_id);
                    let identification: FlashIdentification | null = null;
                    
                    if (flashDetail?.ipfs_cid) {
                        identification = identificationsByCid.get(flashDetail.ipfs_cid) || null;
                    }

                    const castMessage = generateCastMessage(
                        { city: flash.city },
                        identification,
                    );

                    const castHash = await publisher.publishCast({
                        signerUuid: decrypt(flash.signer_uuid, decryptionKey),
                        msg: castMessage,
                        embeds: [
                            {
                                url: `https://www.flashcastr.app/flash/${flash.flash_id}`,
                            },
                        ],
                        channelId: "invaders",
                    });

                    await flashcastrFlashesDb.updateCastHash(
                        flash.flash_id,
                        castHash,
                    );
                    successCount++;
                    castsPublishedTotal.inc();
                    console.log(
                        `[FlashSyncCron] Successfully retried cast for flash ${flash.flash_id}`,
                    );
                } catch (err) {
                    failCount++;
                    castsFailedTotal.inc();
                    console.error(
                        `[FlashSyncCron] Failed to retry cast for flash ${flash.flash_id}:`,
                        err,
                    );
                }
            }

            console.log(
                `[FlashSyncCron] Retry complete: ${successCount} successful, ${failCount} failed. ` +
                    formattedCurrentTime(),
            );
        } catch (error) {
            console.error(
                "[FlashSyncCron] Retry failed casts task failed:",
                error,
            );
        }
    }
}
