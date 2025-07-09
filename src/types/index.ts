import { NextRequest, NextResponse } from "next/server";

/**
 * Configuration interface for RequestIQ middleware
 * Defines all configurable options for the request monitoring system
 */
export interface RequestIQConfig {
  redis: {
    url: string; // Redis server connection URL
    token: string; // Authentication token for Redis
  };
  sampling: {
    rate: number; // Sampling rate (0-1) - percentage of requests to monitor
    slowThreshold: number; // Threshold in milliseconds for considering a request "slow"
  };
  dashboard: {
    enabled: boolean; // Whether to enable the monitoring dashboard
    path: string; // URL path where dashboard will be accessible
    enableAuth: boolean; // enable or disable auth,
    auth?: {
      // Optional basic auth credentials for dashboard access
      username: string;
      password: string;
    };
  };
  storage: {
    retentionDays: number; // How many days to keep metrics data
    batchSize: number; // Batch size for storage operations
    keyPrefix?: string; // Prefix for storing the keys in redis
    slowThreshold?: number; // acceptable latency for each request
  };
  excludePaths?: string[]; // Path patterns to exclude from monitoring
  includeHeaders?: string[]; // Specific headers to include in metrics
}

/**
 * Anlaytics payload
 */
export interface AnalyticsData {
  timestamp: number;
  path: string;
  method: string;
  statusCode: number;
  duration: number;
  country?: string;
  userAgent?: string;
  ip?: string;
}

/**
 * Window for batch size
 */
export interface TimeWindow {
  start: number;
  end: number;
  bucket: "minute" | "hour" | "day";
}

/**
 * Anlaytics filters
 */
export interface QueryFilters {
  timeWindow?: TimeWindow;
  path?: string;
  statusCode?: number | number[];
  country?: string;
  method?: string;
}

/**
 * Dashboard data
 */
export interface MetricsResult {
  totalRequests: number;
  slowRequests: number;
  errorRate: number;
  percentiles: {
    p50: number;
    p90: number;
    p95: number;
    p99: number;
  };
  averageDuration: number;
  topPaths: Array<{ path: string; count: number }>;
  countryDistribution: Array<{ country: string; count: number }>;
  methodDistribution: Array<{ method: string; count: number }>;
  timeSeriesData: Array<{ timestamp: number; value: number }>;
}

/**
 * Authentication interface for dashboard access
 */
export interface IAuth {
  // Validates authentication header for dashboard access
  isValidAuth(authHeader: string): boolean;
}

/**
 * Dashboard interface for handling UI and API requests
 */
export interface IDashboard {
  // Handles dashboard HTML page requests
  handleDashboard(request: NextRequest): Promise<NextResponse>;
  // Handles dashboard API data requests
  handleDashboardAPI(request: NextRequest): Promise<NextResponse>;
  // Retrieves aggregated dashboard data for given time period
  getDashboardData(startTime: number, endTime: number): Promise<any>;
}

/**
 * Metrics collection interface
 */
export interface IMetrices {
  // Collects and stores metrics for a request/response pair
  collectMetrics(
    request: NextRequest,
    response: NextResponse,
    startTime: number
  ): Promise<void>;
  // Calculates percentile value from sorted array of numbers
  getPercentile(sortedArray: number[], percentile: number): number;
}

/**
 * Request sampling interface
 * Determines which requests should be monitored
 */
export interface ISampler {
  // Decides whether to sample a given request
  shouldSample(path: string, duration?: number): boolean;
  // Checks if path should be excluded from monitoring
  shouldExcludePath(path: string): boolean;
}

/**
 * Metrics storage interface
 * Handles persistence and retrieval of request metrics
 */
export interface IStorage {}

/**
 * Main middleware interface
 * Entry point for request monitoring functionality
 */
export interface RequestIQMiddleware {
  // Processes incoming requests and applies monitoring
  handle(request: NextRequest): Promise<NextResponse>;
}
