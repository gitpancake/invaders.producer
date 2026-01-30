import { Injectable } from "@nestjs/common";
import { Pool } from "pg";
import { HealthChecker } from "../health";

@Injectable()
export class HealthService {
    private dbPool: Pool;
    private healthChecker: HealthChecker;
    private lastHealthCheck: any = null;
    private lastCheckTime: number = 0;
    private readonly CACHE_TTL = 30000;

    constructor() {
        this.dbPool = new Pool({
            connectionString: process.env.DATABASE_URL,
            max: 2,
            idleTimeoutMillis: 30000,
        });

        this.healthChecker = new HealthChecker(
            this.dbPool,
            process.env.RABBITMQ_URL || "",
            process.env.API_URL,
        );
    }

    async getQuickHealth() {
        return {
            service: "invaders-bot",
            status: "healthy",
            timestamp: new Date().toISOString(),
            version: "1.0.0",
        };
    }

    async getDetailedHealth() {
        if (
            this.lastHealthCheck &&
            Date.now() - this.lastCheckTime < this.CACHE_TTL
        ) {
            return this.lastHealthCheck;
        }

        try {
            const health = await this.healthChecker.checkHealth();

            const transformed = {
                service: "invaders-bot",
                status: health.status,
                timestamp: health.timestamp,
                uptime: Math.floor(process.uptime()),
                lastSync: await this.getLastSyncTime(),
                metrics: {
                    memoryUsage: Math.round(
                        (health.metrics.memoryUsage.heapUsed /
                            health.metrics.memoryUsage.heapTotal) *
                            100,
                    ),
                    failedFlashes: health.metrics.failedFlashesCount,
                    processUptime: health.metrics.processUptime,
                },
                checks: {
                    database: health.services.database.status,
                    rabbitmq: health.services.rabbitmq.status,
                    spaceInvadersAPI: health.services.spaceInvadersAPI.status,
                    diskPersistence: health.services.diskPersistence.status,
                },
                responseTimes: {
                    database: health.services.database.responseTime,
                    rabbitmq: health.services.rabbitmq.responseTime,
                    api: health.services.spaceInvadersAPI.responseTime,
                },
            };

            this.lastHealthCheck = transformed;
            this.lastCheckTime = Date.now();

            return transformed;
        } catch (error: any) {
            return {
                service: "invaders-bot",
                status: "unhealthy",
                timestamp: new Date().toISOString(),
                error: error.message,
            };
        }
    }

    private async getLastSyncTime(): Promise<string> {
        try {
            const result = await this.dbPool.query(
                "SELECT MAX(timestamp) as last_sync FROM flashes LIMIT 1",
            );
            return result.rows[0]?.last_sync?.toISOString() || "never";
        } catch {
            return "unknown";
        }
    }

    async getMetrics() {
        const memUsage = process.memoryUsage();
        return {
            process: {
                uptime: process.uptime(),
                pid: process.pid,
                version: process.version,
            },
            memory: {
                rss: memUsage.rss,
                heapTotal: memUsage.heapTotal,
                heapUsed: memUsage.heapUsed,
                external: memUsage.external,
            },
            timestamp: Date.now(),
        };
    }
}
