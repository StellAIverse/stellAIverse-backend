"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.activeUsers = exports.userSignups = exports.errorTotal = exports.activeConnections = exports.databaseQueryDuration = exports.httpRequestsInProgress = exports.httpRequestTotal = exports.httpRequestDuration = exports.register = void 0;
const prom_client_1 = __importDefault(require("prom-client"));
// Create a Registry to register the metrics
exports.register = new prom_client_1.default.Registry();
// Add default metrics (CPU, memory, etc.)
prom_client_1.default.collectDefaultMetrics({
    register: exports.register,
    prefix: "stellaiverse_",
});
// Custom metrics
exports.httpRequestDuration = new prom_client_1.default.Histogram({
    name: "stellaiverse_http_request_duration_seconds",
    help: "Duration of HTTP requests in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
    registers: [exports.register],
});
exports.httpRequestTotal = new prom_client_1.default.Counter({
    name: "stellaiverse_http_requests_total",
    help: "Total number of HTTP requests",
    labelNames: ["method", "route", "status_code"],
    registers: [exports.register],
});
exports.httpRequestsInProgress = new prom_client_1.default.Gauge({
    name: "stellaiverse_http_requests_in_progress",
    help: "Number of HTTP requests currently in progress",
    labelNames: ["method", "route"],
    registers: [exports.register],
});
exports.databaseQueryDuration = new prom_client_1.default.Histogram({
    name: "stellaiverse_database_query_duration_seconds",
    help: "Duration of database queries in seconds",
    labelNames: ["operation", "table"],
    buckets: [0.01, 0.05, 0.1, 0.3, 0.5, 1, 2, 5],
    registers: [exports.register],
});
exports.activeConnections = new prom_client_1.default.Gauge({
    name: "stellaiverse_active_connections",
    help: "Number of active connections",
    labelNames: ["type"],
    registers: [exports.register],
});
exports.errorTotal = new prom_client_1.default.Counter({
    name: "stellaiverse_errors_total",
    help: "Total number of errors",
    labelNames: ["type", "severity"],
    registers: [exports.register],
});
// Business metrics examples
exports.userSignups = new prom_client_1.default.Counter({
    name: "stellaiverse_user_signups_total",
    help: "Total number of user signups",
    registers: [exports.register],
});
exports.activeUsers = new prom_client_1.default.Gauge({
    name: "stellaiverse_active_users",
    help: "Number of currently active users",
    registers: [exports.register],
});
