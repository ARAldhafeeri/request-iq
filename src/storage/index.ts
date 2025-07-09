import { Redis } from "@upstash/redis";
import { RequestMetrics, RequestIQConfig } from "../types";

export class RedisStorage {
  constructor(private config: RequestIQConfig, private redis: Redis) {}

  async storeMetrics(metrics: RequestMetrics): Promise<void> {
    const key = `requestiq:metrics:${metrics.id}`;
    const timeKey = `requestiq:time:${Math.floor(metrics.timestamp / 1000)}`;

    // Store individual metric
    await this.redis.setex(
      key,
      this.config.storage.retentionDays * 24 * 60 * 60,
      JSON.stringify(metrics)
    );

    // Add to time-based index
    await this.redis.zadd(timeKey, {
      score: metrics.timestamp,
      member: metrics.id,
    });

    // Set expiration for time index
    await this.redis.expire(
      timeKey,
      this.config.storage.retentionDays * 24 * 60 * 60
    );

    // Update path statistics
    await this.updatePathStats(metrics);
  }

  private async updatePathStats(metrics: RequestMetrics): Promise<void> {
    const pathKey = `requestiq:path:${metrics.path}`;
    const statsKey = `requestiq:stats:${metrics.path}`;

    // Increment request count
    await this.redis.incr(`${pathKey}:count`);

    // Update latency stats
    await this.redis.lpush(`${pathKey}:latencies`, metrics.duration);
    await this.redis.ltrim(`${pathKey}:latencies`, 0, 1000); // Keep last 1000 requests

    // Update error count if needed
    if (metrics.statusCode >= 400) {
      await this.redis.incr(`${pathKey}:errors`);
    }

    // Update slow request count
    if (metrics.duration > this.config.sampling.slowThreshold) {
      await this.redis.incr(`${pathKey}:slow`);
    }
  }

  async getMetrics(
    startTime: number,
    endTime: number,
    limit: number = 100
  ): Promise<RequestMetrics[]> {
    const timeKeys = this.getTimeKeys(startTime, endTime);
    const metricIds: string[] = [];

    for (const timeKey of timeKeys) {
      // const ids = await this.redis.zrangebyscore(timeKey, startTime, endTime, {
      //   count: limit,
      // });
      // metricIds.push(...ids);
    }

    const metrics: RequestMetrics[] = [];
    for (const id of metricIds.slice(0, limit)) {
      const data = await this.redis.get(`requestiq:metrics:${id}`);
      if (data) {
        metrics.push(JSON.parse(data as string));
      }
    }

    return metrics.sort((a, b) => b.timestamp - a.timestamp);
  }

  async getPathStats(path: string): Promise<any> {
    const pathKey = `requestiq:path:${path}`;

    const [count, errors, slow, latencies] = await Promise.all([
      this.redis.get(`${pathKey}:count`),
      this.redis.get(`${pathKey}:errors`),
      this.redis.get(`${pathKey}:slow`),
      this.redis.lrange(`${pathKey}:latencies`, 0, -1),
    ]);

    return {
      count: parseInt(count as string) || 0,
      errors: parseInt(errors as string) || 0,
      slow: parseInt(slow as string) || 0,
      latencies: (latencies as string[]).map(Number),
    };
  }

  private getTimeKeys(startTime: number, endTime: number): string[] {
    const keys: string[] = [];
    const startSecond = Math.floor(startTime / 1000);
    const endSecond = Math.floor(endTime / 1000);

    for (let second = startSecond; second <= endSecond; second++) {
      keys.push(`requestiq:time:${second}`);
    }

    return keys;
  }
}
