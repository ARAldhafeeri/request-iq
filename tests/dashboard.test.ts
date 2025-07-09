import { Dashboard } from "../src/dashboard";
import { NextRequest } from "next/server";
import { defaultConfig } from "../src";
import { Authentication } from "../src/auth";
import { RedisStorage } from "../src/storage";
import { getDashboardHTML } from "../src/dashboard/html";

// Mock dependencies
jest.mock("../src/auth");
jest.mock("../src/storage");
jest.mock("../src/dashboard/html", () => ({
  getDashboardHTML: jest.fn().mockReturnValue("<html>Dashboard</html>"),
}));

const mockRequest = (
  url: string,
  {
    headers = {},
    method = "GET",
    authHeader,
  }: {
    headers?: Record<string, string>;
    method?: string;
    authHeader?: string;
  } = {}
): NextRequest => {
  const requestHeaders = new Map();
  if (authHeader) {
    requestHeaders.set("authorization", authHeader);
  }
  Object.entries(headers).forEach(([key, value]) => {
    requestHeaders.set(key, value);
  });

  return {
    method,
    headers: {
      get: (key: string) => requestHeaders.get(key),
      has: (key: string) => requestHeaders.has(key),
    },
    nextUrl: new URL(url, "http://localhost"),
  } as unknown as NextRequest;
};

describe("Dashboard", () => {
  let config: any;
  let auth: any;
  let storage: any;
  let dashboard: any;

  beforeEach(() => {
    config = {
      ...defaultConfig,
      dashboard: {
        ...defaultConfig.dashboard,
        enableAuth: false,
      },
    };

    auth = {
      isValidAuth: jest.fn().mockReturnValue(true),
    } as unknown as Authentication;

    storage = {
      readAnalytics: jest.fn().mockResolvedValue({
        totalRequests: 10,
        slowRequests: 2,
        errorRate: 20,
        percentiles: { p50: 100, p90: 500, p95: 800, p99: 1200 },
        topPaths: [{ name: "/api/test", count: 5 }],
        countryDistribution: [{ country: "US", count: 8 }],
        methodDistribution: [{ method: "GET", count: 7 }],
        timeSeriesData: [],
      }),
    } as unknown as RedisStorage;

    dashboard = new Dashboard(config, auth, storage);
  });

  describe("handleDashboard", () => {
    it("should return HTML when no action specified", async () => {
      const req = mockRequest("http://localhost/requestiq");
      const response = await dashboard.handleDashboard(req);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("text/html");
      expect(getDashboardHTML).toHaveBeenCalled();
    });

    it("should return 401 when auth is enabled and invalid credentials", async () => {
      config.dashboard.enableAuth = true;
      auth.isValidAuth = jest.fn().mockReturnValue(false);
      const req = mockRequest("http://localhost/requestiq", {
        authHeader: "Basic invalid",
      });

      const response = await dashboard.handleDashboard(req);

      expect(response.status).toBe(401);
      expect(response.headers.get("WWW-Authenticate")).toBe(
        'Basic realm="RequestIQ Dashboard"'
      );
    });

    it("should allow access when auth is enabled and valid credentials", async () => {
      config.dashboard.enableAuth = true;
      auth.isValidAuth = jest.fn().mockReturnValue(true);
      const req = mockRequest("http://localhost/requestiq", {
        authHeader: "Basic valid",
      });

      const response = await dashboard.handleDashboard(req);

      expect(response.status).toBe(200);
    });

    it("should handle dashboard-data action", async () => {
      const req = mockRequest(
        "http://localhost/requestiq?action=dashboard-data"
      );
      const response = await dashboard.handleDashboard(req);

      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });

    it("should handle metrics action", async () => {
      const req = mockRequest("http://localhost/requestiq?action=metrics");
      const response = await dashboard.handleDashboard(req);

      console.log("metrices", response.data);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Type")).toBe("application/json");
    });
  });

  describe("handleDashboardAPI", () => {
    it("should return metrics data for metrics action", async () => {
      const req = mockRequest(
        "http://localhost/requestiq?action=metrics&hours=24"
      );
      const response = await dashboard.handleDashboardAPI(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        totalRequests: 10,
        slowRequests: 2,
        errorRate: 20,
        percentiles: { p50: 100, p90: 500, p95: 800, p99: 1200 },
        topPaths: [{ name: "/api/test", count: 5 }],
        countryDistribution: [{ country: "US", count: 8 }],
        methodDistribution: [{ method: "GET", count: 7 }],
        timeSeriesData: [],
      });
      expect(storage.readAnalytics).toHaveBeenCalled();
    });

    it("should return dashboard data for dashboard-data action", async () => {
      const req = mockRequest(
        "http://localhost/requestiq?action=dashboard-data&hours=48"
      );
      const response = await dashboard.handleDashboardAPI(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({
        totalRequests: 10,
        slowRequests: 2,
        errorRate: 20,
        percentiles: { p50: 100, p90: 500, p95: 800, p99: 1200 },
        topPaths: [{ name: "/api/test", count: 5 }],
        countryDistribution: [{ country: "US", count: 8 }],
        methodDistribution: [{ method: "GET", count: 7 }],
        timeSeriesData: [],
      });
    });

    it("should return 404 for unknown actions", async () => {
      const req = mockRequest("http://localhost/requestiq?action=unknown");
      const response = await dashboard.handleDashboardAPI(req);

      expect(response.status).toBe(404);
    });

    it("should handle malformed JSON data", async () => {
      // Create circular reference to make JSON.stringify fail
      const circularData: any = { data: {} };
      circularData.data.circular = circularData;

      storage.readAnalytics = jest.fn().mockResolvedValue(circularData);
      const req = mockRequest("http://localhost/requestiq?action=metrics");

      const response = await dashboard.handleDashboardAPI(req);
      const data = await response.json();

      expect(response.status).toBe(200);
      expect(data).toEqual({ message: "dashboard data malformed" });
    });

    it("should use default 24 hours when not specified", async () => {
      const req = mockRequest("http://localhost/requestiq?action=metrics");
      await dashboard.handleDashboardAPI(req);

      expect(storage.readAnalytics).toHaveBeenCalledWith({
        timeWindow: {
          start: expect.any(Number),
          end: expect.any(Number),
          bucket: "minute",
        },
      });
    });

    it("should use specified hours parameter", async () => {
      const req = mockRequest(
        "http://localhost/requestiq?action=metrics&hours=12"
      );
      await dashboard.handleDashboardAPI(req);

      expect(storage.readAnalytics).toHaveBeenCalledWith({
        timeWindow: {
          start: expect.any(Number),
          end: expect.any(Number),
          bucket: "minute",
        },
      });
    });
  });

  describe("getDashboardData", () => {
    it("should return data from storage", async () => {
      const startTime = Date.now() - 24 * 60 * 60 * 1000;
      const endTime = Date.now();
      const data = await dashboard.getDashboardData(startTime, endTime);

      expect(data).toEqual({
        totalRequests: 10,
        slowRequests: 2,
        errorRate: 20,
        percentiles: { p50: 100, p90: 500, p95: 800, p99: 1200 },
        topPaths: [{ name: "/api/test", count: 5 }],
        countryDistribution: [{ country: "US", count: 8 }],
        methodDistribution: [{ method: "GET", count: 7 }],
        timeSeriesData: [],
      });
      expect(storage.readAnalytics).toHaveBeenCalledWith({
        timeWindow: {
          start: startTime,
          end: endTime,
          bucket: "minute",
        },
      });
    });
  });
});
