import { NextRequest, NextResponse } from "next/server";
import { getDashboardHTML } from "./html";
import { IDashboard, RequestIQConfig } from "../types";
import { Authentication } from "../auth";
import { RedisStorage } from "../storage";
import { Metrices } from "../metrices";
import { isValidJSON } from "../utils";

/**
 * handles the dashboard fucntioanlity in request iq:
 * 1. handle next request for displaying the dashboard.
 * 2. adds authentication when the authentication is enabled.
 * 3. handles the api requests for the analaytics data.
 *
 */
export class Dashboard implements IDashboard {
  // handle authentication
  constructor(
    private config: RequestIQConfig,
    private authentication: Authentication,
    private storage: RedisStorage,
    private metrices: Metrices
  ) {}

  // handles dashboard request with authentication
  public async handleDashboard(request: NextRequest) {
    // Basic auth check
    if (this.config.dashboard.enableAuth) {
      const authHeader = request.headers.get("authorization");
      if (!authHeader || !this.authentication.isValidAuth(authHeader)) {
        return new NextResponse("Unauthorized", {
          status: 401,
          headers: {
            "WWW-Authenticate": 'Basic realm="RequestIQ Dashboard"',
          },
        });
      }
    }

    // Handle API routes
    if (
      request.nextUrl.pathname.startsWith(`${this.config.dashboard.path}/api/`)
    ) {
      return this.handleDashboardAPI(request);
    }

    // Serve dashboard HTML
    return new NextResponse(getDashboardHTML(this.config.dashboard.path), {
      headers: {
        "Content-Type": "text/html",
      },
    });
  }

  // dashboard api requests
  public async handleDashboardAPI(request: NextRequest) {
    const pathname = request.nextUrl.pathname;
    const apiPrefix = `${this.config.dashboard.path}/api`;

    const apiPath = pathname.slice(apiPrefix.length);

    if (apiPath === "/metrics") {
      const searchParams = request.nextUrl.searchParams;
      const hours = parseInt(searchParams.get("hours") || "24");
      const endTime = Date.now();
      const startTime = endTime - hours * 60 * 60 * 1000;

      const metrics = await this.storage.getMetrics(startTime, endTime, 1000);
      if (isValidJSON(JSON.stringify(metrics)))
        return NextResponse.json(metrics);
      return NextResponse.json({ message: "dashboard data malformed" });
    }

    if (apiPath === "/dashboard-data") {
      const searchParams = request.nextUrl.searchParams;
      const hours = parseInt(searchParams.get("hours") || "24");
      const endTime = Date.now();
      const startTime = endTime - hours * 60 * 60 * 1000;

      const dashboardData = await this.getDashboardData(startTime, endTime);
      if (isValidJSON(JSON.stringify(dashboardData)))
        return NextResponse.json(dashboardData);
      return NextResponse.json({ message: "dashboard data malformed" });
    }

    return new NextResponse("Not Found", { status: 404 });
  }

  // get dashboard data from storage
  public async getDashboardData(
    startTime: number,
    endTime: number
  ): Promise<any> {
    const metrics = await this.storage.getMetrics(startTime, endTime, 1000);

    const totalRequests = metrics.length;
    const averageLatency =
      metrics.reduce((sum, m) => sum + m.duration, 0) / totalRequests || 0;
    const slowRequests = metrics.filter(
      (m) => m.duration > this.config.sampling.slowThreshold
    ).length;
    const errorRate =
      metrics.filter((m) => m.statusCode >= 400).length / totalRequests || 0;

    const requestsByPath = metrics.reduce((acc, m) => {
      acc[m.path] = (acc[m.path] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sortedLatencies = metrics
      .map((m) => m.duration)
      .sort((a, b) => a - b);
    const latencyPercentiles = {
      p50: this.metrices.getPercentile(sortedLatencies, 50),
      p90: this.metrices.getPercentile(sortedLatencies, 90),
      p95: this.metrices.getPercentile(sortedLatencies, 95),
      p99: this.metrices.getPercentile(sortedLatencies, 99),
    };

    return {
      totalRequests,
      averageLatency,
      slowRequests,
      errorRate,
      requestsByPath,
      latencyPercentiles,
      recentRequests: metrics.slice(0, 50),
    };
  }
}
