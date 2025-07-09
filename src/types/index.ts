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
  };
  excludePaths?: string[]; // Path patterns to exclude from monitoring
  includeHeaders?: string[]; // Specific headers to include in metrics
}

/**
 * Interface representing collected request metrics
 * Contains all data captured about each HTTP request
 */
export interface RequestMetrics {
  id: string; // Unique request identifier
  timestamp: number; // Unix timestamp of request
  path: string; // Request URL path
  method: string; // HTTP method (GET, POST, etc.)
  statusCode: number; // HTTP response status code
  duration: number; // Request duration in milliseconds
  userAgent?: string; // User-Agent header value
  ip?: string; // Client IP address
  country?: string; // GeoIP-detected country
  headers?: Record<string, string>; // Selected HTTP headers
  query?: Record<string, string>; // URL query parameters
  error?: string; // Error message if request failed
}

/**
 * Interface for dashboard statistical data
 * Represents aggregated metrics shown in the monitoring dashboard
 */
export interface DashboardData {
  totalRequests: number; // Total requests in time period
  averageLatency: number; // Average request duration
  slowRequests: number; // Count of slow requests
  errorRate: number; // Percentage of errored requests
  requestsByPath: Record<string, number>; // Request count by path
  latencyPercentiles: {
    // Latency distribution percentiles
    p50: number; // 50th percentile (median)
    p90: number; // 90th percentile
    p95: number; // 95th percentile
    p99: number; // 99th percentile
  };
  recentRequests: RequestMetrics[]; // List of most recent requests
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
export interface IStorage {
  // Stores individual request metrics
  storeMetrics(metrics: RequestMetrics): Promise<void>;
  // Retrieves metrics within time range with optional limit
  getMetrics(
    startTime: number,
    endTime: number,
    limit: number
  ): Promise<RequestMetrics[]>;
  // Gets statistics for a specific path
  getPathStats(path: string): Promise<any>;
  // Generates storage keys for given time range
  getTimeKeys(startTime: number, endTime: number): string[];
}

/**
 * Main middleware interface
 * Entry point for request monitoring functionality
 */
export interface RequestIQMiddleware {
  // Processes incoming requests and applies monitoring
  handle(request: NextRequest): Promise<NextResponse>;
}
