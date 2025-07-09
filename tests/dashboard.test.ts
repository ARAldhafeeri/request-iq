import { Dashboard } from "../src/dashboard";
import { NextRequest } from "next/server";

import { defaultConfig } from "../src";

jest.mock("../src/auth");
jest.mock("../src/storage");
jest.mock("../src/metrices");
jest.mock("../src/dashboard/html", () => ({
  getDashboardHTML: jest.fn().mockReturnValue("<html>Dashboard</html>"),
}));

const mockRequest = (url: string, headers: Record<string, string> = {}) =>
  ({
    headers: {
      get: (key: string) => headers[key],
    },
    nextUrl: new URL(url, "http://localhost"),
  } as unknown as NextRequest);

describe("Dashboard", () => {
  let config: any;
  let auth: any;
  let storage: any;
  let metrices: any;
  let dashboard: any;

  beforeEach(() => {
    config = defaultConfig;

    auth = {
      isValidAuth: jest.fn(),
    } as any;

    storage = {
      getMetrics: jest.fn(),
    } as any;

    metrices = {
      getPercentile: jest.fn((_, p) => p),
    } as any;

    dashboard = new Dashboard(config, auth, storage, metrices);
  });

  it("returns 401 if auth is enabled and header is invalid", async () => {
    config.dashboard.enableAuth = true;
    auth.isValidAuth.mockReturnValue(false);
    const req = mockRequest("http://localhost/requestiq");
    const res = await dashboard.handleDashboard(req);
    expect(res.status).toBe(401);
    config.dashboard.enableAuth = false;
  });

  it("returns HTML if path is valid and auth is disabled", async () => {
    config.dashboard.auth = undefined;
    const req = mockRequest("http://localhost/requestiq");
    const res = await dashboard.handleDashboard(req);
    expect(res.headers.get("Content-Type")).toBe("text/html");
  });

  it("calls handleDashboardAPI for API routes", async () => {
    config.dashboard.auth = undefined;
    const spy = jest.spyOn(dashboard, "handleDashboardAPI");
    const req = mockRequest("http://localhost/requestiq?action=metrics");
    await dashboard.handleDashboard(req);
    expect(spy).toHaveBeenCalled();
  });

  it("returns metrics data for /v1/metrics route", async () => {
    const req = mockRequest(
      "http://localhost/requestiq?hours=1&action=metrics"
    );
    const fakeMetrics = [
      { duration: 100, path: "/a", statusCode: 200 },
      { duration: 600, path: "/b", statusCode: 500 },
    ];
    storage.getMetrics.mockResolvedValue(fakeMetrics);
    const res = await dashboard.handleDashboardAPI(req);
    const json = await res.json();
    expect(json).toEqual(fakeMetrics);
  });

  it("returns dashboard data for /v1/dashboard-data route", async () => {
    const req = mockRequest(
      "http://localhost/requestiq?action=dashboard-data&hours=1"
    );
    const metrics = [
      { duration: 200, path: "/a", statusCode: 200 },
      { duration: 800, path: "/b", statusCode: 500 },
    ];
    storage.getMetrics.mockResolvedValue(metrics);
    const res = await dashboard.handleDashboardAPI(req);
    const json = await res.json();
    expect(json.totalRequests).toBe(2);
    expect(json.errorRate).toBe(0.5);
    expect(json.requestsByPath).toEqual({ "/a": 1, "/b": 1 });
    expect(json.latencyPercentiles).toEqual({
      p50: 50,
      p90: 90,
      p95: 95,
      p99: 99,
    });
  });

  it("returns 404 for unknown api routes", async () => {
    const req = mockRequest("http://localhost/requestiq?action=unknown");
    const res = await dashboard.handleDashboardAPI(req);
    expect(res.status).toBe(404);
  });

  it("parses the correct apiPath from request URL", async () => {
    const req = mockRequest(
      "http://localhost/requestiq?action=metrics&test=1&test=2"
    );
    const spy = jest.spyOn(dashboard as any, "getDashboardData");
    storage.getMetrics.mockResolvedValue([]);

    // Ensure we don't hit getDashboardData (because this is the metrics path)
    await dashboard.handleDashboardAPI(req);

    expect(storage.getMetrics).toHaveBeenCalled();
    expect(spy).not.toHaveBeenCalled(); // not called unless path is dashboard-data
  });

  it("should log the actual config path value", () => {
    expect(config.dashboard.path).toBeDefined();
  });
});
