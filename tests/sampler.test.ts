import { defaultConfig } from "../src";
import { RequestSampler } from "../src/sampler";
import { RequestIQConfig } from "../src/types";

describe("RequestSampler", () => {
  let config: RequestIQConfig;
  let sampler: RequestSampler;

  beforeEach(() => {
    config = defaultConfig;
    config.sampling.rate = 0.5;
    config.sampling.slowThreshold = 500;

    sampler = new RequestSampler(config);
  });

  describe("shouldSample", () => {
    it("should sample if duration exceeds slowThreshold", () => {
      const result = sampler.shouldSample("/api/test", 600);
      expect(result).toBe(true);
    });

    it("should sample based on random rate when duration is below threshold", () => {
      jest.spyOn(Math, "random").mockReturnValue(0.3); // less than rate (0.5)
      expect(sampler.shouldSample("/api/test", 200)).toBe(true);

      jest.spyOn(Math, "random").mockReturnValue(0.7); // more than rate
      expect(sampler.shouldSample("/api/test", 200)).toBe(false);
    });

    it("should sample based on rate if duration is undefined", () => {
      jest.spyOn(Math, "random").mockReturnValue(0.2);
      expect(sampler.shouldSample("/api/no-duration")).toBe(true);
    });
  });

  describe("shouldExcludePath", () => {
    it("should return false if no excludePaths are defined", () => {
      config.excludePaths = [];
      sampler = new RequestSampler(config);
      expect(sampler.shouldExcludePath("/api/test")).toBe(false);
    });

    it("should return true for exact match", () => {
      config.excludePaths = ["/health"];
      sampler = new RequestSampler(config);
      expect(sampler.shouldExcludePath("/health")).toBe(true);
      expect(sampler.shouldExcludePath("/metrics")).toBe(false);
    });

    it("should return true for wildcard match", () => {
      config.excludePaths = ["/internal/*"];
      sampler = new RequestSampler(config);
      expect(sampler.shouldExcludePath("/internal/metrics")).toBe(true);
      expect(sampler.shouldExcludePath("/internal/logs/debug")).toBe(true);
      expect(sampler.shouldExcludePath("/external/test")).toBe(false);
    });

    it("should return false if no path matches", () => {
      config.excludePaths = ["/auth", "/config"];
      sampler = new RequestSampler(config);
      expect(sampler.shouldExcludePath("/api/user")).toBe(false);
    });
  });
});
