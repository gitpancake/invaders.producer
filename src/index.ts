// Initialize tracing before all other imports
import { initTracing } from "./util/tracing";
const tracingSdk = initTracing();

import { config } from "dotenv";
import { CombinedSyncCron } from "./util/cron-jobs/combined-sync";
import { startMetricsServer } from "./util/metrics";

config({ path: ".env" });

const main = async () => {
    // Start Prometheus metrics server
    const metricsPort = parseInt(process.env.METRICS_PORT || "9090");
    startMetricsServer(metricsPort);

    const combinedSyncCron = new CombinedSyncCron("*/5 * * * *");

    combinedSyncCron.register();

    await combinedSyncCron.task();
};

main().catch((error) => {
    console.error(error);
    process.exit(1);
});
