import { NextRequest, NextResponse } from "next/server";
import { AnalyticsData, IMetrices, RequestIQConfig } from "../types";
import { RequestSampler } from "../sampler";
import { RedisStorage } from "../storage";

export class Metrices implements IMetrices {
  constructor(
    private config: RequestIQConfig,
    private sampler: RequestSampler,
    private storage: RedisStorage
  ) {}

  // method called to collect metrices on every request.
  public async collectMetrics(
    request: NextRequest,
    response: NextResponse,
    startTime: number
  ): Promise<void> {
    const duration = Date.now() - startTime;
    const path = request.nextUrl.pathname;
    const statusCode = response.status;

    // Determine if we should sample this request
    const shouldSample =
      this.sampler.shouldSample(path, duration) ||
      statusCode >= 400 ||
      duration > this.config.sampling.slowThreshold;

    if (!shouldSample) {
      return;
    }

    // request meterices to collect
    const metrics: AnalyticsData = {
      timestamp: startTime,
      path,
      method: request.method,
      statusCode,
      duration,
      userAgent: request.headers.get("user-agent") as string,
      ip: request.ip || (request.headers.get("x-forwarded-for") as string),
      country: request.geo?.country as string,
    };

    await this.storage.writeAnalytics(metrics);
  }

  // return the precentile of the request
  public getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[index] || 0;
  }
}
