import { Redis } from "@upstash/redis";
import { RedisStorage } from "../src/storage";
import {
  RequestIQConfig,
  AnalyticsData,
  QueryFilters,
  TimeWindow,
} from "../src/types";
import { defaultConfig } from "../src/index";

// Mock the Redis client
jest.mock("@upstash/redis");

const mockConfig: RequestIQConfig = defaultConfig;

const mockRedis = {
  pipeline: jest.fn().mockReturnThis(),
  setbit: jest.fn().mockReturnThis(),
  zadd: jest.fn().mockReturnThis(),
  zincrby: jest.fn().mockReturnThis(),
  pfadd: jest.fn().mockReturnThis(),
  expire: jest.fn().mockReturnThis(),
  bitcount: jest.fn().mockReturnThis(),
  zcard: jest.fn().mockReturnThis(),
  zrange: jest.fn().mockReturnThis(),
  zrevrange: jest.fn().mockReturnThis(),
  pfcount: jest.fn().mockReturnThis(),
  scan: jest.fn().mockReturnThis(),
  del: jest.fn().mockReturnThis(),
  exec: jest.fn().mockResolvedValue([]),
};

describe("RedisStorage", () => {
  let storage: RedisStorage;

  beforeEach(() => {
    (Redis as unknown as jest.Mock).mockImplementation(() => mockRedis);
    storage = new RedisStorage(mockConfig, new Redis({ url: "", token: "" }));
    jest.clearAllMocks();
  });

  describe("constructor", () => {
    it("should initialize with default values", () => {
      const defaultStorage = new RedisStorage(
        { storage: {} } as RequestIQConfig,
        new Redis({ url: "", token: "" })
      );
      expect(defaultStorage).toBeInstanceOf(RedisStorage);
    });

    it("should use provided configuration values", () => {
      expect(storage).toBeInstanceOf(RedisStorage);
    });
  });

  describe("writeAnalytics", () => {
    const mockData: AnalyticsData = {
      timestamp: Date.now(),
      duration: 1500,
      statusCode: 200,
      path: "/api/test",
      method: "GET",
      country: "US",
      ip: "192.168.1.1",
    };

    it("should write analytics data to Redis", async () => {
      await storage.writeAnalytics(mockData);

      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockRedis.setbit).toHaveBeenCalled();
      expect(mockRedis.zadd).toHaveBeenCalled();
      expect(mockRedis.zincrby).toHaveBeenCalled();
      expect(mockRedis.pfadd).toHaveBeenCalled();
      expect(mockRedis.expire).toHaveBeenCalled();
      expect(mockRedis.exec).toHaveBeenCalled();
    });

    it("should handle slow requests", async () => {
      await storage.writeAnalytics({ ...mockData, duration: 1500 });
      expect(mockRedis.setbit).toHaveBeenCalledWith(
        expect.stringContaining(":slow"),
        expect.any(Number),
        1
      );
    });

    it("should handle error requests", async () => {
      await storage.writeAnalytics({ ...mockData, statusCode: 500 });
      expect(mockRedis.setbit).toHaveBeenCalledWith(
        expect.stringContaining(":errors"),
        expect.any(Number),
        1
      );
    });
  });

  describe("writeBatchAnalytics", () => {
    const mockBatchData: AnalyticsData[] = [
      {
        timestamp: Date.now(),
        duration: 500,
        statusCode: 200,
        path: "/api/test1",
        method: "GET",
        country: "US",
        ip: "192.168.1.1",
      },
      {
        timestamp: Date.now(),
        duration: 1500,
        statusCode: 404,
        path: "/api/test2",
        method: "POST",
        country: "CA",
        ip: "192.168.1.2",
      },
    ];

    it("should write batch analytics data to Redis", async () => {
      await storage.writeBatchAnalytics(mockBatchData);
      expect(mockRedis.pipeline).toHaveBeenCalled();
      expect(mockRedis.exec).toHaveBeenCalled();
    });

    it("should process in batches", async () => {
      const largeBatch = Array(150).fill(mockBatchData[0]);
      await storage.writeBatchAnalytics(largeBatch);
      expect(mockRedis.exec).toHaveBeenCalledTimes(2); // 150 / 100 = 2 batches
    });
  });

  describe("readAnalytics", () => {
    it("should read analytics data from Redis", async () => {
      mockRedis.exec.mockResolvedValueOnce([
        100, // total requests
        10, // slow requests
        5, // error requests
        100, // durations count
        [
          ["/api/test", "50"],
          ["/api/test2", "30"],
        ], // paths
        [
          ["US", "70"],
          ["CA", "30"],
        ], // countries
        [
          ["GET", "80"],
          ["POST", "20"],
        ], // methods
        [], // timeseries
        75, // unique ips
      ]);

      const filters: QueryFilters = {
        timeWindow: {
          bucket: "minute",
          start: Date.now() - 3600000,
          end: Date.now(),
        },
      };

      const result = await storage.readAnalytics(filters);
      expect(result).toEqual({
        totalRequests: expect.any(Number),
        slowRequests: expect.any(Number),
        errorRate: expect.any(Number),
        percentiles: expect.any(Object),
        averageDuration: expect.any(Number),
        topPaths: expect.any(Array),
        countryDistribution: expect.any(Array),
        methodDistribution: expect.any(Array),
        timeSeriesData: expect.any(Array),
      });
    });
  });

  describe("readTimeSeries", () => {
    it("should read time series data for requests", async () => {
      mockRedis.exec.mockResolvedValueOnce([10, 20, 30]);

      const timeWindow: TimeWindow = {
        start: Date.now() - 3600000,
        end: Date.now(),
        bucket: "minute",
      };

      const result = await storage.readTimeSeries("requests", timeWindow);
      expect(result).toEqual(
        expect.arrayContaining([
          { timestamp: expect.any(Number), value: expect.any(Number) },
        ])
      );
    });
  });

  describe("readTopEntries", () => {
    it("should return top paths", async () => {
      mockRedis.zrange.mockResolvedValueOnce([
        "/api/test",
        "50",
        "/api/test2",
        "30",
      ]);

      const timeWindow: TimeWindow = {
        start: Date.now() - 3600000,
        end: Date.now(),
        bucket: "minute",
      };

      const result = await storage.readTopEntries("paths", timeWindow);
      expect(result).toEqual([
        { name: "/api/test", count: "050" },
        { name: "/api/test2", count: "030" },
      ]);
    });
  });

  describe("cleanupOldData", () => {
    it("should delete old data based on retention policy", async () => {
      mockRedis.scan.mockResolvedValueOnce([
        0,
        ["test-analytics:minute:202301010000"],
      ]);
      await storage.cleanupOldData();
      expect(mockRedis.del).toHaveBeenCalled();
    });

    it("should handle no keys to delete", async () => {
      mockRedis.scan.mockResolvedValueOnce([0, []]);
      await storage.cleanupOldData();
      expect(mockRedis.del).not.toHaveBeenCalled();
    });
  });

  describe("helper methods", () => {
    it("should generate request IDs", () => {
      const data: AnalyticsData = {
        timestamp: Date.now(),
        duration: 100,
        statusCode: 200,
        path: "/api/test",
        method: "GET",
      };
      const id = (storage as any).generateRequestId(data);
      expect(typeof id).toBe("number");
    });

    it("should create time buckets", () => {
      const timestamp = Date.now();
      const buckets = (storage as any).getTimeBuckets(timestamp);
      expect(buckets).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ type: "minute" }),
          expect.objectContaining({ type: "hour" }),
          expect.objectContaining({ type: "day" }),
        ])
      );
    });

    it("should create time buckets for range", () => {
      const timeWindow: TimeWindow = {
        start: Date.now() - 3600000,
        end: Date.now(),
        bucket: "minute",
      };
      const buckets = (storage as any).getTimeBucketsForRange(timeWindow);
      expect(buckets.length).toBeGreaterThan(0);
    });
  });
});
