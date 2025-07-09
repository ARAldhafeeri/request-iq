import { Redis } from "@upstash/redis";
import { RequestMetrics, RequestIQConfig } from "../types";

export class RedisStorage {
  constructor(private config: RequestIQConfig, private redis: Redis) {}

  async storeMetrics(metrics: RequestMetrics): Promise<void> {
    const secondKey = `requestiq:metrics:${Math.floor(
      metrics.timestamp / 1000
    )}`;

    // Push metric JSON into second-level bucket
    await this.redis.lpush(secondKey, JSON.stringify(metrics));
    await this.redis.expire(
      secondKey,
      this.config.storage.retentionDays * 24 * 60 * 60
    );

    // Update stats
    await this.updatePathStats(metrics);
  }

  private async updatePathStats(metrics: RequestMetrics): Promise<void> {
    const pathKey = `requestiq:path:${metrics.path}`;

    await Promise.all([
      this.redis.incr(`${pathKey}:count`),
      this.redis.lpush(`${pathKey}:latencies`, metrics.duration),
      metrics.statusCode >= 400 ? this.redis.incr(`${pathKey}:errors`) : null,
      metrics.duration > this.config.sampling.slowThreshold
        ? this.redis.incr(`${pathKey}:slow`)
        : null,
      this.redis.ltrim(`${pathKey}:latencies`, 0, 1000),
    ]);
  }

  async getMetrics(
    startTime: number,
    endTime: number,
    limit = 100
  ): Promise<RequestMetrics[]> {
    const keys = this.getTimeKeys(startTime, endTime);
    console.log("lol", keys);
    const metricArrays = await Promise.all(
      keys.map((key) =>
        this.redis
          .lrange(key, 0, -1)
          .then((entries) => entries.map((e) => JSON.parse(e)))
          .catch(() => [])
      )
    );

    const allMetrics = metricArrays
      .flat()
      .filter((m) => m.timestamp >= startTime && m.timestamp <= endTime);

    return allMetrics.sort((a, b) => b.timestamp - a.timestamp).slice(0, limit);
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
    const start = Math.floor(startTime / 1000);
    const end = Math.floor(endTime / 1000);

    for (let sec = start; sec <= end; sec++) {
      keys.push(`requestiq:metrics:${sec}`);
    }

    return keys;
  }
}
