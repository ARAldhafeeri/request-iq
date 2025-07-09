import { Metrices } from "../src/metrices";
import { NextRequest, NextResponse } from "next/server";
import { defaultConfig } from "../src";
import { RedisStorage } from "../src/storage";
import { RequestSampler } from "../src/sampler";

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
        sampleRate: 1.0,
      },
      includeHeaders: ["x-custom-header"],
    };

    sampler = {
      shouldSample: jest.fn().mockReturnValue(false),
    } as unknown as RequestSampler;

    storage = {
      writeAnalytics: jest.fn().mockResolvedValue(undefined),
    } as unknown as RedisStorage;

    metrices = new Metrices(config, sampler, storage);
  });

  describe("collectMetrics", () => {
    it("should store metrics when sampler returns true", async () => {
      jest.spyOn(sampler, "shouldSample").mockReturnValue(true);
      const req = mockRequest("/api/test", {
        method: "POST",
        headers: { "user-agent": "jest", "x-custom-header": "test-value" },
        ip: "192.168.1.1",
        geo: { country: "US" },
      });
      const res = mockResponse(200);
      const startTime = Date.now() - 100;

      await metrices.collectMetrics(req, res, startTime);

      expect(storage.writeAnalytics).toHaveBeenCalledWith({
        timestamp: expect.any(Number),
        path: "/api/test",
        method: "POST",
        statusCode: 200,
        duration: expect.any(Number),
        userAgent: "jest",
        ip: "192.168.1.1",
        country: "US",
      });
    });

    it("should store metrics for error responses (status >= 400)", async () => {
      const req = mockRequest("/api/error");
      const res = mockResponse(404);
      const startTime = Date.now() - 50;

      await metrices.collectMetrics(req, res, startTime);

      expect(storage.writeAnalytics).toHaveBeenCalled();
      expect(sampler.shouldSample).not.toHaveBeenCalled();
    });

    it("should store metrics for slow requests (duration > threshold)", async () => {
      const req = mockRequest("/api/slow");
      const res = mockResponse(200);
      const startTime = Date.now() - 600; // 600ms > 500ms threshold

      await metrices.collectMetrics(req, res, startTime);

      expect(storage.writeAnalytics).toHaveBeenCalled();
      expect(sampler.shouldSample).not.toHaveBeenCalled();
    });

    it("should not store metrics for normal requests", async () => {
      const req = mockRequest("/api/normal");
      const res = mockResponse(200);
      const startTime = Date.now() - 100; // 100ms < 500ms threshold

      await metrices.collectMetrics(req, res, startTime);

      expect(storage.writeAnalytics).not.toHaveBeenCalled();
    });

    it("should use x-forwarded-for when ip is not available", async () => {
      const req = mockRequest("/api/test", {
        headers: { "x-forwarded-for": "10.0.0.1" },
      });
      const res = mockResponse(200);
      jest.spyOn(sampler, "shouldSample").mockReturnValue(true);

      await metrices.collectMetrics(req, res, Date.now() - 100);

      expect(storage.writeAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          ip: "10.0.0.1",
        })
      );
    });

    it("should handle missing geo information", async () => {
      const req = mockRequest("/api/test", { geo: undefined });
      const res = mockResponse(200);
      jest.spyOn(sampler, "shouldSample").mockReturnValue(true);

      await metrices.collectMetrics(req, res, Date.now() - 100);

      expect(storage.writeAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          country: undefined,
        })
      );
    });

    it("should handle missing user-agent header", async () => {
      const req = mockRequest("/api/test", { headers: {} });
      const res = mockResponse(200);
      jest.spyOn(sampler, "shouldSample").mockReturnValue(true);

      await metrices.collectMetrics(req, res, Date.now() - 100);

      expect(storage.writeAnalytics).toHaveBeenCalledWith(
        expect.objectContaining({
          userAgent: undefined,
        })
      );
    });
  });

  describe("getPercentile", () => {
    it("should return correct percentile value", () => {
      const testData = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100];

      expect(metrices.getPercentile(testData, 0)).toBe(10);
      expect(metrices.getPercentile(testData, 50)).toBe(50);
      expect(metrices.getPercentile(testData, 90)).toBe(90);
      expect(metrices.getPercentile(testData, 100)).toBe(100);
    });

    it("should return 0 for empty array", () => {
      expect(metrices.getPercentile([], 50)).toBe(0);
    });

    it("should handle single element array", () => {
      expect(metrices.getPercentile([100], 50)).toBe(100);
      expect(metrices.getPercentile([100], 100)).toBe(100);
    });

    it("should handle out-of-bounds percentiles", () => {
      const testData = [10, 20, 30];
      expect(metrices.getPercentile(testData, 150)).toBe(30);
      expect(metrices.getPercentile(testData, -10)).toBe(10);
    });
  });
});
