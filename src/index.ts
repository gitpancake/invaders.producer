import { config } from "dotenv";
import { CombinedSyncCron } from "./util/cron-jobs/combined-sync";

config({ path: ".env" });

const main = async () => {
    const combinedSyncCron = new CombinedSyncCron("*/5 * * * *");

    combinedSyncCron.register();

    await combinedSyncCron.task();
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
