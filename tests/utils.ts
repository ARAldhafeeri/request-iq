import { defaultConfig } from "../src";
import { RequestIQConfig } from "../src/types";

function deepMerge<T>(target: T, source: Partial<T>): T {
  const isObject = (obj: any): obj is Record<string, any> =>
    obj && typeof obj === "object" && !Array.isArray(obj);

  const output = { ...target };

  for (const key in source) {
    const sourceValue = source[key];
    const targetValue = (target as any)[key];

    if (isObject(targetValue) && isObject(sourceValue)) {
      (output as any)[key] = deepMerge(targetValue, sourceValue);
    } else {
      (output as any)[key] = sourceValue;
    }
  }

  return output;
}

/**
 * Creates a mock configuration by merging partial config with defaults
 * @param overrides Partial configuration to override defaults
 * @returns Complete RequestIQConfig with defaults merged with overrides
 */
export function createMockConfig(
  overrides: Partial<RequestIQConfig>
): RequestIQConfig {
  return deepMerge(defaultConfig, overrides) as RequestIQConfig;
}
