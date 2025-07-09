import { NextRequest, NextResponse } from "next/server";
import { IMetrices, RequestIQConfig, RequestMetrics } from "../types";
import { v4 as uuidv4 } from "uuid";

export class Metrices implements IMetrices {
  constructor(
    private config: RequestIQConfig,
    private sampler,
    private storage
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
    const metrics: RequestMetrics = {
      id: uuidv4(),
      timestamp: startTime,
      path,
      method: request.method,
      statusCode,
      duration,
      userAgent: request.headers.get("user-agent") || undefined,
      ip: request.ip || request.headers.get("x-forwarded-for") || undefined,
      country: request.geo?.country || undefined,
      query: Object.fromEntries(request.nextUrl.searchParams),
    };

    // Include specified headers
    if (this.config.includeHeaders) {
      metrics.headers = {};
      for (const headerName of this.config.includeHeaders) {
        const value = request.headers.get(headerName);
        if (value) {
          metrics.headers[headerName] = value;
        }
      }
    }

    await this.storage.storeMetrics(metrics);
  }

  // return the precentile of the request
  public getPercentile(sortedArray: number[], percentile: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil((percentile / 100) * sortedArray.length) - 1;
    return sortedArray[index] || 0;
  }
}
