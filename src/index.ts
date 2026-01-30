import { config } from "dotenv";
import { CombinedSyncCron } from "./util/cron-jobs/combined-sync";
import { startHealthApi } from "./util/health-api";

config({ path: ".env" });

const main = async () => {
    // Start the health API server
    await startHealthApi();

    // Start the cron jobs
    const combinedSyncCron = new CombinedSyncCron("*/5 * * * *");

    combinedSyncCron.register();

    await combinedSyncCron.task();
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
