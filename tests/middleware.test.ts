import { NextRequest, NextResponse } from "next/server";
import { RequestIQMiddleware } from "../src/middleware";
import { RequestIQConfig } from "../src/types";

const mockRequest = (url: string): NextRequest =>
  ({
    nextUrl: new URL(url, "http://localhost"),
  } as unknown as NextRequest);

describe("RequestIQMiddleware", () => {
  let config: RequestIQConfig;
  let sampler: any;
  let dashboard: any;
  let metrices: any;
  let middleware: RequestIQMiddleware;

  beforeEach(() => {
    config = {
      dashboard: {
        enabled: true,
        path: "/requestiq",
      },
    } as RequestIQConfig;

    sampler = {
      shouldExcludePath: jest.fn().mockReturnValue(false),
    };

    dashboard = {
      handleDashboard: jest
        .fn()
        .mockResolvedValue(new NextResponse("Dashboard")),
    };

    metrices = {
      collectMetrics: jest.fn().mockResolvedValue(undefined),
    };

    middleware = new RequestIQMiddleware(config, sampler, dashboard, metrices);
  });

  it("should skip excluded paths", async () => {
    sampler.shouldExcludePath.mockReturnValue(true);
    const req = mockRequest("/health");
    const res = await middleware.handle(req);

    expect(res).toBeInstanceOf(NextResponse);
    expect(metrices.collectMetrics).not.toHaveBeenCalled();
    expect(dashboard.handleDashboard).not.toHaveBeenCalled();
  });

  it("should route to dashboard if path matches dashboard path", async () => {
    const req = mockRequest("/requestiq");
    const res = await middleware.handle(req);

    expect(dashboard.handleDashboard).toHaveBeenCalledWith(req);
    expect(res).toBeInstanceOf(NextResponse);
  });

  it("should collect metrics for non-dashboard, non-excluded requests", async () => {
    const req = mockRequest("/api/users");
    const res = await middleware.handle(req);

    expect(metrices.collectMetrics).toHaveBeenCalledWith(
      req,
      expect.any(NextResponse),
      expect.any(Number)
    );
    expect(res).toBeInstanceOf(NextResponse);
  });

  it("should log error if metric collection fails", async () => {
    const consoleSpy = jest
      .spyOn(console, "error")
      .mockImplementation(() => {});
    metrices.collectMetrics.mockRejectedValue(new Error("Metrics failed"));

    const req = mockRequest("/api/fail");
    await middleware.handle(req);

    expect(consoleSpy).toHaveBeenCalledWith(expect.any(Error));
    consoleSpy.mockRestore();
  });
});
