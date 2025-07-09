import { NextRequest, NextResponse } from "next/server";
import { RequestIQConfig } from "../types";
import { RequestSampler } from "../sampler";
import { Dashboard } from "../dashboard";
import { Metrices } from "../metrices";

/**
 * Orchestrates the RequestIQ core functionality,
 * encapsulating complex logic to provide a simple interface for users.
 */
export class RequestIQMiddleware {
  constructor(
    private config: RequestIQConfig,
    private sampler: RequestSampler,
    private dashboard: Dashboard,
    private metrices: Metrices
  ) {}

  /**
   * Handles incoming requests through the core middleware pipeline.
   * Designed to execute efficiently on every request with minimal computational overhead.
   *
   * @param request - The incoming Next.js request object
   * @returns A NextResponse object representing the middleware outcome
   */
  async handle(request: NextRequest) {
    const start = Date.now();
    const path = request.nextUrl.pathname;

    // Check if path should be excluded
    if (this.sampler.shouldExcludePath(path)) {
      return NextResponse.next();
    }

    // Handle dashboard requests
    if (this.config.dashboard.enabled && path === this.config.dashboard.path) {
      return this.dashboard.handleDashboard(request);
    }

    // Continue with request processing
    const response = NextResponse.next();

    // Collect metrics after response (in background)
    this.metrices.collectMetrics(request, response, start).catch(console.error);

    return response;
  }
}
