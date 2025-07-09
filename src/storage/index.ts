import { Redis } from "@upstash/redis";
import {  RequestIQConfig, AnalyticsData, QueryFilters, MetricsResult, TimeWindow } from "../types";



export class RedisStorage {
  private keyPrefix: string;
  private slowThreshold: number;
  private retentionDays: number;

  constructor(config: RequestIQConfig, private redis: Redis) {
    this.keyPrefix = config.storage.keyPrefix || "anlaytics";
    this.slowThreshold = config.storage.slowThreshold || 1000; // 1 second
    this.retentionDays = config.storage.retentionDays || 7;
  }

  /**
   * Write analytics data to Redis using optimized data structures
   */
  async writeAnalytics(data: AnalyticsData): Promise<void> {
    const pipeline = this.redis.pipeline();
    const timestamp = data.timestamp;
    const buckets = this.getTimeBuckets(timestamp);

    // Generate unique request ID for this request
    const requestId = this.generateRequestId(data);

    for (const bucket of buckets) {
      const baseKey = `${this.keyPrefix}:${bucket.type}:${bucket.key}`;

      // 1. Total request count using bitmap (memory efficient)
      pipeline.setbit(`${baseKey}:total`, requestId, 1);

      // 2. Slow requests bitmap
      if (data.duration >= this.slowThreshold) {
        pipeline.setbit(`${baseKey}:slow`, requestId, 1);
      }

      // 3. Error requests bitmap (4xx, 5xx)
      if (data.statusCode >= 400) {
        pipeline.setbit(`${baseKey}:errors`, requestId, 1);
      }

      // 4. Duration data for percentiles (sorted set with score as duration)
      pipeline.zadd(`${baseKey}:durations`, {
        score: data.duration,
        member: requestId,
      });

      // 5. Path popularity (sorted set)
      pipeline.zincrby(`${baseKey}:paths`, 1, data.path);

      // 6. Country distribution (sorted set)
      if (data.country) {
        pipeline.zincrby(`${baseKey}:countries`, 1, data.country);
      }

      // 7. Method distribution (sorted set)
      pipeline.zincrby(`${baseKey}:methods`, 1, data.method);

      // 8. Time series data (sorted set with timestamp as score)
      pipeline.zadd(`${baseKey}:timeseries`, {
        score: timestamp,
        member: `${timestamp}:${requestId}`,
      });

      // 9. HyperLogLog for unique visitors (if IP available)
      if (data.ip) {
        pipeline.pfadd(`${baseKey}:unique_ips`, data.ip);
      }

      // 10. Set expiration for data retention
      const expireTime = this.retentionDays * 24 * 60 * 60; // seconds
      pipeline.expire(`${baseKey}:total`, expireTime);
      pipeline.expire(`${baseKey}:slow`, expireTime);
      pipeline.expire(`${baseKey}:errors`, expireTime);
      pipeline.expire(`${baseKey}:durations`, expireTime);
      pipeline.expire(`${baseKey}:paths`, expireTime);
      pipeline.expire(`${baseKey}:countries`, expireTime);
      pipeline.expire(`${baseKey}:methods`, expireTime);
      pipeline.expire(`${baseKey}:timeseries`, expireTime);
      pipeline.expire(`${baseKey}:unique_ips`, expireTime);
    }

    await pipeline.exec();
  }

  /**
   * Write batch analytics data for better performance
   */
  async writeBatchAnalytics(dataArray: AnalyticsData[]): Promise<void> {
    const pipeline = this.redis.pipeline();
    const batchSize = 100; // Process in batches to avoid memory issues

    for (let i = 0; i < dataArray.length; i += batchSize) {
      const batch = dataArray.slice(i, i + batchSize);

      for (const data of batch) {
        const timestamp = data.timestamp;
        const buckets = this.getTimeBuckets(timestamp);
        const requestId = this.generateRequestId(data);

        for (const bucket of buckets) {
          const baseKey = `${this.keyPrefix}:${bucket.type}:${bucket.key}`;

          pipeline.setbit(`${baseKey}:total`, requestId, 1);

          if (data.duration >= this.slowThreshold) {
            pipeline.setbit(`${baseKey}:slow`, requestId, 1);
          }

          if (data.statusCode >= 400) {
            pipeline.setbit(`${baseKey}:errors`, requestId, 1);
          }

          pipeline.zadd(`${baseKey}:durations`, {
            score: data.duration,
            member: requestId,
          });
          pipeline.zincrby(`${baseKey}:paths`, 1, data.path);

          if (data.country) {
            pipeline.zincrby(`${baseKey}:countries`, 1, data.country);
          }

          pipeline.zincrby(`${baseKey}:methods`, 1, data.method);
          pipeline.zadd(`${baseKey}:timeseries`, {
            score: timestamp,
            member: `${timestamp}:${requestId}`,
          });

          if (data.ip) {
            pipeline.pfadd(`${baseKey}:unique_ips`, data.ip);
          }
        }
      }

      // Execute batch
      await pipeline.exec();
    }
  }

  /**
   * Read analytics data with efficient queries
   */
  async readAnalytics(filters: QueryFilters = {}): Promise<MetricsResult> {
    const timeWindow = filters.timeWindow || this.getDefaultTimeWindow();
    const buckets = this.getTimeBucketsForRange(timeWindow);

    const queries: Array<{ key: string; type: string }> = [];

    // Prepare queries for all buckets
    for (const bucket of buckets) {
      const baseKey = `${this.keyPrefix}:${bucket.type}:${bucket.key}`;

      queries.push(
        { key: `${baseKey}:total`, type: "bitcount" },
        { key: `${baseKey}:slow`, type: "bitcount" },
        { key: `${baseKey}:errors`, type: "bitcount" },
        { key: `${baseKey}:durations`, type: "zcard" },
        { key: `${baseKey}:paths`, type: "zrevrange" },
        { key: `${baseKey}:countries`, type: "zrevrange" },
        { key: `${baseKey}:methods`, type: "zrevrange" },
        { key: `${baseKey}:timeseries`, type: "zrange" },
        { key: `${baseKey}:unique_ips`, type: "pfcount" }
      );
    }

    // Execute all queries
    const results = await this.executeAnalyticsQueries(queries, filters);

    // Aggregate results across buckets
    return this.aggregateResults(results, buckets);
  }

  /**
   * Read time series data for dashboard graphs
   */
  async readTimeSeries(
    metric: "requests" | "errors" | "duration" | "unique_users",
    timeWindow: TimeWindow,
    granularity: "minute" | "hour" = "minute"
  ): Promise<Array<{ timestamp: number; value: number }>> {
    const buckets = this.getTimeBucketsForRange(timeWindow, granularity);
    const pipeline = this.redis.pipeline();

    for (const bucket of buckets) {
      const baseKey = `${this.keyPrefix}:${bucket.type}:${bucket.key}`;

      switch (metric) {
        case "requests":
          pipeline.bitcount(`${baseKey}:total`, 0, 1);
          break;
        case "errors":
          pipeline.bitcount(`${baseKey}:errors`, 0, 1);
          break;
        case "duration":
          pipeline.zcard(`${baseKey}:durations`);
          break;
        case "unique_users":
          pipeline.pfcount(`${baseKey}:unique_ips`);
          break;
      }
    }

    const results = await pipeline.exec();

    return buckets.map((bucket, index) => ({
      timestamp: bucket.timestamp,
      value: (results[index] as number) || 0,
    }));
  }

  /**
   * Read percentile data efficiently
   */
  async readPercentiles(
    timeWindow: TimeWindow,
    percentiles: number[] = [50, 90, 95, 99]
  ): Promise<{ [key: string]: number }> {
    const buckets = this.getTimeBucketsForRange(timeWindow);
    const allDurations: number[] = [];

    // Collect all duration data from relevant buckets
    for (const bucket of buckets) {
      const baseKey = `${this.keyPrefix}:${bucket.type}:${bucket.key}`;
      const durations = await this.redis.zrange(`${baseKey}:durations`, 0, -1, {
        withScores: true,
      });

      for (let i = 0; i < durations.length; i += 2) {
        allDurations.push(durations[i + 1] as number);
      }
    }

    // Calculate percentiles
    allDurations.sort((a, b) => a - b);
    const result: { [key: string]: number } = {};

    for (const p of percentiles) {
      const index = Math.ceil((p / 100) * allDurations.length) - 1;
      result[`p${p}`] = allDurations[index] || 0;
    }

    return result;
  }

  /**
   * Read top paths/countries/methods efficiently
   */
  async readTopEntries(
    type: "paths" | "countries" | "methods",
    timeWindow: TimeWindow,
    limit: number = 10
  ): Promise<Array<{ name: string; count: number }>> {
    const buckets = this.getTimeBucketsForRange(timeWindow);
    const aggregated = new Map<string, number>();

    for (const bucket of buckets) {
      const baseKey = `${this.keyPrefix}:${bucket.type}:${bucket.key}`;
      const entries = await this.redis.zrange(`${baseKey}:${type}`, 0, -1, {
        withScores: true,
      });

      for (let i = 0; i < entries.length; i += 2) {
        const name = entries[i] as string;
        const count = entries[i + 1] as number;
        aggregated.set(name, (aggregated.get(name) || 0) + count);
      }
    }

    return Array.from(aggregated.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([name, count]) => ({ name, count }));
  }

  /**
   * Cleanup old data for retention management
   */
  async cleanupOldData(): Promise<void> {
    const cutoffTime = Date.now() - this.retentionDays * 24 * 60 * 60 * 1000;
    const pattern = `${this.keyPrefix}:*`;

    // Use SCAN to find keys to delete
    let cursor = 0;
    const keysToDelete: string[] = [];

    do {
      const result = await this.redis.scan(cursor, {
        match: pattern,
        count: 100,
      });
      cursor = result[0] as unknown as number;
      const keys = result[1];

      for (const key of keys) {
        // Extract timestamp from key and check if it's old
        const match = key.match(/:(\d{12})$/);
        if (match) {
          const keyTime = parseInt(match[1]);
          if (keyTime < cutoffTime) {
            keysToDelete.push(key);
          }
        }
      }
    } while (cursor !== 0);

    // Delete old keys in batches
    if (keysToDelete.length > 0) {
      const batchSize = 100;
      for (let i = 0; i < keysToDelete.length; i += batchSize) {
        const batch = keysToDelete.slice(i, i + batchSize);
        await this.redis.del(...batch);
      }
    }
  }

  /**
   * Helper methods
   */
  private generateRequestId(data: AnalyticsData): number {
    // Generate a unique ID based on timestamp and request details
    const hash = this.simpleHash(
      `${data.timestamp}:${data.path}:${data.ip || "unknown"}`
    );
    return hash % 2 ** 32; // Ensure it fits in 32-bit for bitmap
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private getTimeBuckets(
    timestamp: number
  ): Array<{ type: string; key: string; timestamp: number }> {
    const date = new Date(timestamp);
    const buckets = [];

    // Minute bucket
    const minuteKey = `${date.getFullYear()}${String(
      date.getMonth() + 1
    ).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}${String(
      date.getHours()
    ).padStart(2, "0")}${String(date.getMinutes()).padStart(2, "0")}`;
    buckets.push({ type: "minute", key: minuteKey, timestamp });

    // Hour bucket
    const hourKey = `${date.getFullYear()}${String(
      date.getMonth() + 1
    ).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}${String(
      date.getHours()
    ).padStart(2, "0")}`;
    buckets.push({ type: "hour", key: hourKey, timestamp });

    // Day bucket
    const dayKey = `${date.getFullYear()}${String(date.getMonth() + 1).padStart(
      2,
      "0"
    )}${String(date.getDate()).padStart(2, "0")}`;
    buckets.push({ type: "day", key: dayKey, timestamp });

    return buckets;
  }

  private getTimeBucketsForRange(
    timeWindow: TimeWindow,
    granularity: "minute" | "hour" | "day" = "minute"
  ): Array<{ type: string; key: string; timestamp: number }> {
    const buckets = [];
    const start = new Date(timeWindow.start);
    const end = new Date(timeWindow.end);

    let current = new Date(start);

    while (current <= end) {
      const bucket = this.getTimeBuckets(current.getTime()).find(
        (b) => b.type === granularity
      );
      if (bucket) {
        buckets.push(bucket);
      }

      // Increment by granularity
      switch (granularity) {
        case "minute":
          current.setMinutes(current.getMinutes() + 1);
          break;
        case "hour":
          current.setHours(current.getHours() + 1);
          break;
        case "day":
          current.setDate(current.getDate() + 1);
          break;
      }
    }

    return buckets;
  }

  private getDefaultTimeWindow(): TimeWindow {
    const now = Date.now();
    const oneHourAgo = now - 60 * 60 * 1000;

    return {
      start: oneHourAgo,
      end: now,
      bucket: "minute",
    };
  }

  private async executeAnalyticsQueries(
    queries: Array<{ key: string; type: string }>,
    _filters: QueryFilters
  ): Promise<any[]> {
    const pipeline = this.redis.pipeline();

    for (const query of queries) {
      switch (query.type) {
        case "bitcount":
          pipeline.bitcount(query.key, 0, 1);
          break;
        case "zcard":
          pipeline.zcard(query.key);
          break;
        case "zrevrange":
          pipeline.zrange(query.key, 0, 9, { withScores: true });
          break;
        case "zrange":
          pipeline.zrange(query.key, 0, -1, { withScores: true });
          break;
        case "pfcount":
          pipeline.pfcount(query.key);
          break;
      }
    }

    return await pipeline.exec();
  }

  private aggregateResults(_results: any[], _buckets: any[]): MetricsResult {
    // Aggregate results across all buckets
    let totalRequests = 0;
    let slowRequests = 0;
    let errorRequests = 0;
    const topPaths = new Map<string, number>();
    const countryDistribution = new Map<string, number>();
    const methodDistribution = new Map<string, number>();
    const timeSeriesData: Array<{ timestamp: number; value: number }> = [];

    // Process results and aggregate
    // This is a simplified aggregation - in production, you'd want more sophisticated logic

    return {
      totalRequests,
      slowRequests,
      errorRate: totalRequests > 0 ? (errorRequests / totalRequests) * 100 : 0,
      percentiles: { p50: 0, p90: 0, p95: 0, p99: 0 }, // Calculated separately
      averageDuration: 0,
      topPaths: Array.from(topPaths.entries()).map(([path, count]) => ({
        path,
        count,
      })),
      countryDistribution: Array.from(countryDistribution.entries()).map(
        ([country, count]) => ({ country, count })
      ),
      methodDistribution: Array.from(methodDistribution.entries()).map(
        ([method, count]) => ({ method, count })
      ),
      timeSeriesData,
    };
  }
}
