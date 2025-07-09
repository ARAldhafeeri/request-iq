import { RedisStorage } from "../src/storage";
import { RequestIQConfig, RequestMetrics } from "../src/types";

const mockRedis = () => ({
  setex: jest.fn(),
  zadd: jest.fn(),
  expire: jest.fn(),
  incr: jest.fn(),
  lpush: jest.fn(),
  ltrim: jest.fn(),
  get: jest.fn(),
  lrange: jest.fn(),
});

describe("RedisStorage", () => {
  let redis: any;
  let config: RequestIQConfig;
  let storage: RedisStorage;
  let sampleMetrics: RequestMetrics;

  beforeEach(() => {
    redis = mockRedis();

    config = {
      storage: {
        retentionDays: 1,
      },
      sampling: {
        slowThreshold: 500,
        rate: 1,
      },
    } as unknown as RequestIQConfig;

    storage = new RedisStorage(config, redis as any);

    sampleMetrics = {
      id: "metric123",
      timestamp: 1720000000000,
      path: "/api/test",
      method: "GET",
      statusCode: 200,
      duration: 300,
      userAgent: "test-agent",
      ip: "127.0.0.1",
      country: "KW",
      query: {},
    };
  });

  describe("storeMetrics", () => {
    it("should store metric, update time index, and update path stats", async () => {
      await storage.storeMetrics(sampleMetrics);

      const secondsTTL = 1 * 24 * 60 * 60;

      expect(redis.setex).toHaveBeenCalledWith(
        "requestiq:metrics:metric123",
        secondsTTL,
        JSON.stringify(sampleMetrics)
      );

      expect(redis.zadd).toHaveBeenCalledWith("requestiq:time:1720000000", {
        score: 1720000000000,
        member: "metric123",
      });

      expect(redis.expire).toHaveBeenCalledWith(
        "requestiq:time:1720000000",
        secondsTTL
      );

      expect(redis.incr).toHaveBeenCalledWith("requestiq:path:/api/test:count");
      expect(redis.lpush).toHaveBeenCalledWith(
        "requestiq:path:/api/test:latencies",
        300
      );
      expect(redis.ltrim).toHaveBeenCalledWith(
        "requestiq:path:/api/test:latencies",
        0,
        1000
      );
    });

    it("should increment error and slow counters when needed", async () => {
      const errorMetrics = { ...sampleMetrics, statusCode: 500, duration: 600 };

      await storage.storeMetrics(errorMetrics);

      expect(redis.incr).toHaveBeenCalledWith(
        "requestiq:path:/api/test:errors"
      );
      expect(redis.incr).toHaveBeenCalledWith("requestiq:path:/api/test:slow");
    });
  });

  describe("getPathStats", () => {
    it("should return parsed stats", async () => {
      redis.get.mockImplementation((key: string) => {
        if (key.includes(":count")) return Promise.resolve("20");
        if (key.includes(":errors")) return Promise.resolve("4");
        if (key.includes(":slow")) return Promise.resolve("5");
        return null;
      });

      redis.lrange.mockResolvedValue(["100", "200", "300"]);

      const stats = await storage.getPathStats("/api/test");

      expect(stats).toEqual({
        count: 20,
        errors: 4,
        slow: 5,
        latencies: [100, 200, 300],
      });
    });

    it("should fallback to 0 if values are undefined", async () => {
      redis.get.mockResolvedValue(undefined);
      redis.lrange.mockResolvedValue([]);

      const stats = await storage.getPathStats("/api/unknown");

      expect(stats).toEqual({
        count: 0,
        errors: 0,
        slow: 0,
        latencies: [],
      });
    });
  });

  describe("getTimeKeys", () => {
    it("should return array of time keys between two timestamps", () => {
      const start = 1720000000000;
      const end = 1720000002000;
      const keys = (storage as any).getTimeKeys(start, end);

      expect(keys).toEqual([
        "requestiq:time:1720000000",
        "requestiq:time:1720000001",
        "requestiq:time:1720000002",
      ]);
    });
  });

  // Optional: Add getMetrics test if zrangebyscore is re-enabled
});
