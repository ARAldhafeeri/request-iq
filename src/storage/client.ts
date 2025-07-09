import { Redis } from "@upstash/redis";

export const createRedisClient = (url: string, token: string): Redis => {
  return new Redis({
    url: url,
    token: token,
  });
};
