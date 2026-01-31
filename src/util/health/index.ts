import { Pool } from "pg";
import { connect } from "amqplib";
import axios from "axios";
import { DiskPersistence } from "../disk-persistence";

export interface HealthStatus {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    uptime: number;
    services: {
        database: ServiceHealth;
        rabbitmq: ServiceHealth;
        spaceInvadersAPI: ServiceHealth;
        diskPersistence: ServiceHealth;
    };
    metrics: {
        memoryUsage: NodeJS.MemoryUsage;
        processUptime: number;
        failedFlashesCount: number;
    };
}

export interface ServiceHealth {
    status: "healthy" | "degraded" | "unhealthy";
    responseTime?: number;
    error?: string;
    lastCheck: string;
}

export class HealthChecker {
    private startTime: number;

    constructor(
        private dbPool: Pool,
        private rabbitmqUrl: string,
        private apiUrl: string = "https://api.space-invaders.com",
    ) {
        this.startTime = Date.now();
    }

    /**
     * Perform comprehensive health check
     */
    async checkHealth(): Promise<HealthStatus> {
        const startTime = Date.now();

        console.log("[HealthChecker] Starting health check...");

        // Run all service checks in parallel for speed
        const [database, rabbitmq, spaceInvadersAPI, diskPersistence] =
            await Promise.allSettled([
                this.checkDatabase(),
                this.checkRabbitMQ(),
                this.checkSpaceInvadersAPI(),
                this.checkDiskPersistence(),
            ]);

        const services = {
            database: this.getServiceResult(database),
            rabbitmq: this.getServiceResult(rabbitmq),
            spaceInvadersAPI: this.getServiceResult(spaceInvadersAPI),
            diskPersistence: this.getServiceResult(diskPersistence),
        };

        // Calculate overall status
        const serviceStatuses = Object.values(services).map((s) => s.status);
        let overallStatus: "healthy" | "degraded" | "unhealthy";

        if (serviceStatuses.every((s) => s === "healthy")) {
            overallStatus = "healthy";
        } else if (serviceStatuses.some((s) => s === "unhealthy")) {
            overallStatus = "unhealthy";
        } else {
            overallStatus = "degraded";
        }

        const diskPersistence_instance = new DiskPersistence();

        const health: HealthStatus = {
            status: overallStatus,
            timestamp: new Date().toISOString(),
            uptime: Date.now() - this.startTime,
            services,
            metrics: {
                memoryUsage: process.memoryUsage(),
                processUptime: process.uptime(),
                failedFlashesCount:
                    diskPersistence_instance.getFailedFlashesCount(),
            },
        };

        const checkDuration = Date.now() - startTime;
        console.log(
            `[HealthChecker] Health check completed in ${checkDuration}ms - Status: ${overallStatus}`,
        );

        return health;
    }

    private getServiceResult(
        result: PromiseSettledResult<ServiceHealth>,
    ): ServiceHealth {
        if (result.status === "fulfilled") {
            return result.value;
        } else {
            return {
                status: "unhealthy",
                error: result.reason?.message || "Unknown error",
                lastCheck: new Date().toISOString(),
            };
        }
    }

    /**
     * Check database connectivity and basic query performance
     */
    private async checkDatabase(): Promise<ServiceHealth> {
        const startTime = Date.now();

        try {
            // Simple query to test connectivity and performance
            const result = await this.dbPool.query(
                "SELECT COUNT(*) as count FROM flashes LIMIT 1",
            );
            const responseTime = Date.now() - startTime;

            // Consider degraded if query takes > 1 second
            const status = responseTime > 1000 ? "degraded" : "healthy";

            return {
                status,
                responseTime,
                lastCheck: new Date().toISOString(),
            };
        } catch (error) {
            return {
                status: "unhealthy",
                responseTime: Date.now() - startTime,
                error: (error as Error).message,
                lastCheck: new Date().toISOString(),
            };
        }
    }

    /**
     * Check RabbitMQ connectivity
     */
    private async checkRabbitMQ(): Promise<ServiceHealth> {
        const startTime = Date.now();
        let connection;

        try {
            connection = await connect(this.rabbitmqUrl);
            const channel = await connection.createChannel();

            // Test channel operations
            await channel.checkQueue(
                process.env.RABBITMQ_QUEUE || "test_queue",
            );

            await channel.close();
            const responseTime = Date.now() - startTime;

            return {
                status: "healthy",
                responseTime,
                lastCheck: new Date().toISOString(),
            };
        } catch (error) {
            return {
                status: "unhealthy",
                responseTime: Date.now() - startTime,
                error: (error as Error).message,
                lastCheck: new Date().toISOString(),
            };
        } finally {
            if (connection) {
                try {
                    await connection.close();
                } catch {}
            }
        }
    }

    /**
     * Check Space Invaders API availability
     */
    private async checkSpaceInvadersAPI(): Promise<ServiceHealth> {
        const startTime = Date.now();

        try {
            // Use a lightweight endpoint check with timeout
            const response = await axios.get(
                `${this.apiUrl}/flashinvaders/flashes/`,
                {
                    timeout: 30000,
                    validateStatus: (status) => status >= 200 && status < 500,
                },
            );

            const responseTime = Date.now() - startTime;

            // Consider API health based on response
            let status: "healthy" | "degraded" | "unhealthy";
            if (response.status >= 200 && response.status < 300) {
                if (responseTime >= 30000) {
                    status = "unhealthy";
                } else if (responseTime >= 10000) {
                    status = "degraded";
                } else {
                    status = "healthy";
                }
            } else if (response.status >= 400 && response.status < 500) {
                status = "degraded"; // Client errors might be temporary (rate limiting, etc.)
            } else {
                status = "unhealthy";
            }

            return {
                status,
                responseTime,
                lastCheck: new Date().toISOString(),
            };
        } catch (error) {
            const responseTime = Date.now() - startTime;

            // Timeouts are degraded (slow but reachable), other errors are unhealthy
            const isTimeout =
                (error as any).code === "ECONNABORTED" ||
                (error as any).code === "ETIMEDOUT";

            return {
                status: isTimeout ? "degraded" : "unhealthy",
                responseTime,
                error: (error as Error).message,
                lastCheck: new Date().toISOString(),
            };
        }
    }

    /**
     * Check disk persistence system
     */
    private async checkDiskPersistence(): Promise<ServiceHealth> {
        const startTime = Date.now();

        try {
            const diskPersistence = new DiskPersistence();
            const failedCount = diskPersistence.getFailedFlashesCount();

            const responseTime = Date.now() - startTime;

            // Consider degraded if too many failed flashes accumulating
            const status = failedCount > 10 ? "degraded" : "healthy";

            return {
                status,
                responseTime,
                lastCheck: new Date().toISOString(),
            };
        } catch (error) {
            return {
                status: "unhealthy",
                responseTime: Date.now() - startTime,
                error: (error as Error).message,
                lastCheck: new Date().toISOString(),
            };
        }
    }

    /**
     * Quick health check for endpoints that need fast response
     */
    async quickHealthCheck(): Promise<{ status: string; timestamp: string }> {
        try {
            // Just check if we can connect to database quickly
            await this.dbPool.query("SELECT 1");

            return {
                status: "healthy",
                timestamp: new Date().toISOString(),
            };
        } catch {
            return {
                status: "unhealthy",
                timestamp: new Date().toISOString(),
            };
        }
    }
}
