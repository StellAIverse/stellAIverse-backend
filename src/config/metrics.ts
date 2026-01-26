import client from "prom-client";

// Create a Registry to register the metrics
export const register = new client.Registry();

// Add default metrics (CPU, memory, etc.)
client.collectDefaultMetrics({
  register,
  prefix: "stellaiverse_",
});

// Custom metrics
export const httpRequestDuration = new client.Histogram({
  name: "stellaiverse_http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
  registers: [register],
});

export const httpRequestTotal = new client.Counter({
  name: "stellaiverse_http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route", "status_code"],
  registers: [register],
});

export const httpRequestsInProgress = new client.Gauge({
  name: "stellaiverse_http_requests_in_progress",
  help: "Number of HTTP requests currently in progress",
  labelNames: ["method", "route"],
  registers: [register],
});

export const databaseQueryDuration = new client.Histogram({
  name: "stellaiverse_database_query_duration_seconds",
  help: "Duration of database queries in seconds",
  labelNames: ["operation", "table"],
  buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
  registers: [register],
});

export const activeConnections = new client.Gauge({
  name: "stellaiverse_active_connections",
  help: "Number of active connections",
  labelNames: ["type"],
  registers: [register],
});

export const errorTotal = new client.Counter({
  name: "stellaiverse_errors_total",
  help: "Total number of errors",
  labelNames: ["type", "severity"],
  registers: [register],
});

// Business metrics examples
export const userSignups = new client.Counter({
  name: "stellaiverse_user_signups_total",
  help: "Total number of user signups",
  registers: [register],
});

export const activeUsers = new client.Gauge({
  name: "stellaiverse_active_users",
  help: "Number of currently active users",
  registers: [register],
});
