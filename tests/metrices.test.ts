import { Metrices } from "../src/metrices";
import { NextRequest, NextResponse } from "next/server";
import { defaultConfig } from "../src";

jest.mock("uuid", () => ({
  v4: jest.fn(() => "mock-uuid"),
}));

const mockRequest = (
  url: string,
  {
    method = "GET",
    headers = {},
    ip,
    geo,
  }: {
    method?: string;
    headers?: Record<string, string>;
    ip?: string;
    geo?: { country?: string };
  } = {}
): NextRequest =>
  ({
    method,
    headers: {
      get: (key: string) => headers[key],
    },
    ip,
    geo,
    nextUrl: new URL(url, "http://localhost"),
  } as unknown as NextRequest);

const mockResponse = (status: number): NextResponse =>
  ({
    status,
  } as NextResponse);

describe("Metrices", () => {
  let config: any;
  let sampler: any;
  let storage: any;
  let metrices: any;

  beforeEach(() => {
    config = {
      ...defaultConfig,
      sampling: {
        slowThreshold: 500,
      },
      includeHeaders: ["x-custom-header"],
    };

    sampler = {
      shouldSample: jest.fn(),
    };

    storage = {
      storeMetrics: jest.fn(),
    };

    metrices = new Metrices(config, sampler, storage);
  });

  it("should store metrics if sampled by sampler", async () => {
    const req = mockRequest("/api/hello", {
      headers: { "user-agent": "jest", "x-custom-header": "abc" },
      ip: "127.0.0.1",
      geo: { country: "KW" },
    });

    const res = mockResponse(200);
    sampler.shouldSample.mockReturnValue(true);

    const start = Date.now() - 100; // simulate 100ms latency
    await metrices.collectMetrics(req, res, start);

    expect(storage.storeMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "mock-uuid",
        method: "GET",
        statusCode: 200,
        duration: expect.any(Number),
        path: "/api/hello",
        ip: "127.0.0.1",
        country: "KW",
        userAgent: "jest",
        headers: { "x-custom-header": "abc" },
      })
    );
  });

  it("should store metrics if statusCode >= 400", async () => {
    const req = mockRequest("/bad");
    const res = mockResponse(404);
    sampler.shouldSample.mockReturnValue(false);

    const start = Date.now() - 200;
    await metrices.collectMetrics(req, res, start);

    expect(storage.storeMetrics).toHaveBeenCalled();
  });

  it("should store metrics if duration > slowThreshold", async () => {
    const req = mockRequest("/slow");
    const res = mockResponse(200);
    sampler.shouldSample.mockReturnValue(false);

    const start = Date.now() - 600; // above 500ms
    await metrices.collectMetrics(req, res, start);

    expect(storage.storeMetrics).toHaveBeenCalled();
  });

  it("should skip storing metrics if not sampled", async () => {
    const req = mockRequest("/normal");
    const res = mockResponse(200);
    sampler.shouldSample.mockReturnValue(false);

    const start = Date.now() - 100; // below threshold
    await metrices.collectMetrics(req, res, start);

    expect(storage.storeMetrics).not.toHaveBeenCalled();
  });

  it("should not include headers if config.includeHeaders is empty", async () => {
    config.includeHeaders = [];
    const req = mockRequest("/no-headers", {
      headers: { "x-custom-header": "abc" },
    });
    const res = mockResponse(200);
    sampler.shouldSample.mockReturnValue(true);

    const start = Date.now() - 200;
    await metrices.collectMetrics(req, res, start);

    const stored = storage.storeMetrics.mock.calls[0][0];
    expect(stored.headers).toEqual({});
  });

  it("getPercentile returns correct value", () => {
    const sorted = [10, 20, 30, 40, 50];
    expect(metrices.getPercentile(sorted, 50)).toBe(30); // index 2
    expect(metrices.getPercentile(sorted, 100)).toBe(50); // index 4
    expect(metrices.getPercentile([], 90)).toBe(0);
  });
});
