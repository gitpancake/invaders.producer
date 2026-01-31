import http from "http";
import {
  Registry,
  Counter,
  Gauge,
  Histogram,
  collectDefaultMetrics,
} from "prom-client";

// Create a new registry
export const register = new Registry();

// Collect default Node.js metrics (CPU, memory, event loop, etc.)
collectDefaultMetrics({ register });

// ============================================
// COUNTERS
// ============================================

export const flashesNewTotal = new Counter({
  name: "invaders_bot_flashes_new_total",
  help: "New flashes discovered and stored in database",
  registers: [register],
});

export const apiCallsTotal = new Counter({
  name: "invaders_bot_api_calls_total",
  help: "Total API calls made to Space Invaders API",
  labelNames: ["result"],
  registers: [register],
});

export const syncSkippedTotal = new Counter({
  name: "invaders_bot_sync_skipped_total",
  help: "Number of sync runs skipped",
  labelNames: ["reason"],
  registers: [register],
});

export const messagesPublishedTotal = new Counter({
  name: "invaders_bot_messages_published_total",
  help: "Messages published to RabbitMQ",
  registers: [register],
});

export const messagesFailedTotal = new Counter({
  name: "invaders_bot_messages_failed_total",
  help: "Failed message publishes to RabbitMQ",
  registers: [register],
});

export const castsPublishedTotal = new Counter({
  name: "invaders_bot_casts_published_total",
  help: "Farcaster casts published",
  registers: [register],
});

export const castsFailedTotal = new Counter({
  name: "invaders_bot_casts_failed_total",
  help: "Failed Farcaster casts",
  registers: [register],
});

// ============================================
// GAUGES
// ============================================

export const lastSyncTimestamp = new Gauge({
  name: "invaders_bot_last_sync_timestamp",
  help: "Unix timestamp of last successful sync with new flashes",
  registers: [register],
});

export const lastApiCallTimestamp = new Gauge({
  name: "invaders_bot_last_api_call_timestamp",
  help: "Unix timestamp of last API call (successful or not)",
  registers: [register],
});

export const consecutiveUnchangedSyncs = new Gauge({
  name: "invaders_bot_consecutive_unchanged_syncs",
  help: "Number of consecutive syncs with no new flashes",
  registers: [register],
});

export const lastFlashCount = new Gauge({
  name: "invaders_bot_last_flash_count",
  help: "Flash count from the last API response",
  registers: [register],
});

export const uptimeSeconds = new Gauge({
  name: "invaders_bot_uptime_seconds",
  help: "Process uptime in seconds",
  registers: [register],
});

export const memoryBytes = new Gauge({
  name: "invaders_bot_memory_bytes",
  help: "Memory usage in bytes",
  labelNames: ["type"],
  registers: [register],
});

// ============================================
// HISTOGRAMS
// ============================================

export const syncDurationSeconds = new Histogram({
  name: "invaders_bot_sync_duration_seconds",
  help: "Duration of sync operations in seconds",
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30, 60, 120],
  registers: [register],
});

// ============================================
// METRICS SERVER
// ============================================

const startTime = Date.now();

// Update uptime and memory gauges periodically
setInterval(() => {
  uptimeSeconds.set((Date.now() - startTime) / 1000);

  const mem = process.memoryUsage();
  memoryBytes.set({ type: "heap_used" }, mem.heapUsed);
  memoryBytes.set({ type: "heap_total" }, mem.heapTotal);
  memoryBytes.set({ type: "rss" }, mem.rss);
  memoryBytes.set({ type: "external" }, mem.external);
}, 5000);

export function startMetricsServer(port: number = 9090): void {
  const server = http.createServer(async (req, res) => {
    const url = req.url?.split("?")[0] || "";
    if (url === "/metrics" || url === "/") {
      try {
        res.setHeader("Content-Type", register.contentType);
        res.end(await register.metrics());
      } catch (err) {
        res.statusCode = 500;
        res.end("Error collecting metrics");
      }
    } else if (url === "/health") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ status: "ok" }));
    } else {
      res.statusCode = 404;
      res.end("Not found");
    }
  });

  server.listen(port, () => {
    console.log(`[Metrics] Prometheus metrics available at http://localhost:${port}/metrics`);
  });
}
