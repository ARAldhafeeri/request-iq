import { NextRequest, NextResponse } from "next/server";
import { getDashboardHTML } from "./html";
import { IDashboard, QueryFilters, RequestIQConfig } from "../types";
import { Authentication } from "../auth";
import { RedisStorage } from "../storage";

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
    private storage: RedisStorage
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

    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");

    // Handle API routes
    if (action === "dashboard-data" || action === "metrices") {
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
    const searchParams = request.nextUrl.searchParams;
    const action = searchParams.get("action");

    if (action === "metrics") {
      const searchParams = request.nextUrl.searchParams;
      const hours = parseInt(searchParams.get("hours") || "24");
      const endTime = Date.now();
      const startTime = endTime - hours * 60 * 60 * 1000;

      const queryFilter: QueryFilters = {
        timeWindow: { start: startTime, end: endTime, bucket: "minute" },
      };
      const metrics = await this.storage.readAnalytics(queryFilter);
      return NextResponse.json(metrics);
    }

    if (action === "dashboard-data") {
      const searchParams = request.nextUrl.searchParams;
      const hours = parseInt(searchParams.get("hours") || "24");
      const endTime = Date.now();
      const startTime = endTime - hours * 60 * 60 * 1000;
      const queryFilter: QueryFilters = {
        timeWindow: { start: startTime, end: endTime, bucket: "minute" },
      };
      const metrics = await this.storage.readAnalytics(queryFilter);
      return NextResponse.json(metrics);
    }

    return new NextResponse("Not Found", { status: 404 });
  }

  // get dashboard data from storage
  public async getDashboardData(
    startTime: number,
    endTime: number
  ): Promise<any> {
    const queryFilter: QueryFilters = {
      timeWindow: { start: startTime, end: endTime, bucket: "minute" },
    };

    const metrics = await this.storage.readAnalytics(queryFilter);

    return metrics;
  }
}
