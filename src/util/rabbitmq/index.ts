import { Channel, ChannelModel, connect } from "amqplib";
import { Flash } from "../database/invader-flashes/types";

// Message counter for health monitoring
class MessageCounter {
    private published: number = 0;
    private failed: number = 0;
    private lastPublishedAt: Date | null = null;
    private startedAt: Date = new Date();

    increment() {
        this.published++;
        this.lastPublishedAt = new Date();
    }

    incrementFailed() {
        this.failed++;
    }

    getStats() {
        return {
            published: this.published,
            failed: this.failed,
            lastPublishedAt: this.lastPublishedAt?.toISOString() || null,
            startedAt: this.startedAt.toISOString(),
        };
    }
}

export const messageCounter = new MessageCounter();

export interface ExecuteResponse {
    status: string;
    message: string;
    flash: Flash;
}

export interface WrapUnwrapPayload {
    tokenId: string;
}

// --- Base Class ---
export abstract class RabbitMQBase {
    protected rabbitUrl: string;

    constructor() {
        this.rabbitUrl = process.env.RABBITMQ_URL!;

        if (!this.rabbitUrl) {
            throw new Error(
                `RABBITMQ_URL is not defined in the environment variables`,
            );
        }
    }

    protected async withChannel<T>(
        fn: (channel: Channel) => Promise<T>,
    ): Promise<T> {
        let connection: ChannelModel | undefined = undefined;
        let channel: Channel | undefined = undefined;
        try {
            connection = await connect(this.rabbitUrl);
            channel = await connection.createChannel();
            return await fn(channel);
        } finally {
            if (channel) {
                try {
                    await channel.close();
                } catch {}
            }
            if (connection) {
                try {
                    await connection.close();
                } catch {}
            }
        }
    }

    protected async publishToQueue(
        queue: string,
        payload: Flash,
    ): Promise<ExecuteResponse> {
        return this.withChannel(async (channel) => {
            await channel.assertQueue(queue, { durable: true });
            const sent = channel.sendToQueue(
                queue,
                Buffer.from(JSON.stringify(payload)),
                { persistent: true },
            );
            if (!sent) {
                messageCounter.incrementFailed();
                throw new Error(
                    `Failed to send message to RabbitMQ queue: ${queue}`,
                );
            }
            messageCounter.increment();
            return {
                status: "queued",
                message: `Event published to RabbitMQ queue: ${queue}: ${payload.flash_id}`,
                flash: payload,
            };
        });
    }
}

// --- Subclasses ---
export class RabbitImagePush extends RabbitMQBase {
    private queue: string;
    constructor() {
        super();

        this.queue = process.env.RABBITMQ_QUEUE!;
        if (!this.queue) {
            throw new Error(
                "RABBITMQ_QUEUE is not defined in the environment variables",
            );
        }
    }
    async publish(payload: Flash): Promise<ExecuteResponse> {
        return this.publishToQueue(this.queue, payload);
    }
}
