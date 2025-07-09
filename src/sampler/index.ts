import { ISampler, RequestIQConfig } from "../types";

export class RequestSampler implements ISampler {
  private config: RequestIQConfig;

  constructor(config: RequestIQConfig) {
    this.config = config;
  }

  shouldSample(path: string, duration?: number): boolean {
    // Always sample slow requests
    if (duration && duration > this.config.sampling.slowThreshold) {
      return true;
    }

    // TODO: Always sample errors (we'll check status code in middleware)

    // Sample based on configured rate
    return Math.random() < this.config.sampling.rate;
  }

  shouldExcludePath(path: string): boolean {
    if (!this.config.excludePaths) return false;

    return this.config.excludePaths.some((excludePath) => {
      if (excludePath.includes("*")) {
        const regex = new RegExp(excludePath.replace(/\*/g, ".*"));
        return regex.test(path);
      }
      return path === excludePath;
    });
  }
}
