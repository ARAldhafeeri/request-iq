import { Authentication } from "./auth";
import { RequestIQMiddleware } from "./middleware";
import { RequestSampler } from "./sampler";
import { RedisStorage } from "./storage";
import { RequestIQConfig } from "./types";
import { createRedisClient } from "./storage/client";
import { Dashboard } from "./dashboard";
import { Metrices } from "./metrices";

// Default configuration
export const defaultConfig: RequestIQConfig = {
  redis: {
    url: "",
    token: "",
  },
  sampling: {
    rate: 0.1, // 10% sampling rate
    slowThreshold: 1000, // 1 second
  },
  dashboard: {
    enabled: true,
    path: "/requestiq",
    enableAuth: false,
  },
  storage: {
    keyPrefix: "test-analytics",
    slowThreshold: 1000,
    retentionDays: 7,
    batchSize: 100,
  },
  excludePaths: ["/favicon.ico", "/_next/*", "/api/auth/*"],
  includeHeaders: ["x-forwarded-for", "user-agent", "referer"],
};

// Helper function to create middleware
export function createRequestIQ(config: RequestIQConfig) {
  const sampler = new RequestSampler(config);
  const auth = new Authentication(config);
  const storage = new RedisStorage(
    config,
    createRedisClient(config.redis.url, config.redis.token)
  );
  const metrices = new Metrices(config, sampler, storage);
  const dashboard = new Dashboard(config, auth, storage);
  return new RequestIQMiddleware(config, sampler, dashboard, metrices);
}
