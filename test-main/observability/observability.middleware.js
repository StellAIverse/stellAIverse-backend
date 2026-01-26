"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ObservabilityMiddleware = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const logger_1 = require("../config/logger");
const metrics_1 = require("../config/metrics");
const api_1 = require("@opentelemetry/api");
const tracing_1 = require("../config/tracing");
let ObservabilityMiddleware = class ObservabilityMiddleware {
    use(req, res, next) {
        // Add request ID
        req.id = req.headers["x-request-id"] || (0, uuid_1.v4)();
        res.setHeader("X-Request-Id", req.id);
        const start = Date.now();
        const route = req.route?.path || req.path;
        // Create request logger
        const requestLogger = logger_1.logger.child({
            requestId: req.id,
            method: req.method,
            url: req.url,
            userAgent: req.headers["user-agent"],
            ip: req.ip,
        });
        // Log incoming request
        requestLogger.info("Incoming request");
        // Create tracing span
        const tracer = (0, tracing_1.getTracer)();
        const span = tracer.startSpan(`${req.method} ${route}`, {
            attributes: {
                "http.method": req.method,
                "http.url": req.url,
                "http.target": req.path,
                "http.host": req.hostname,
                "http.user_agent": req.headers["user-agent"] || "",
                "http.request_id": req.id,
            },
        });
        req.span = span;
        // Increment in-progress requests
        metrics_1.httpRequestsInProgress.inc({ method: req.method, route });
        // Handle response
        res.on("finish", () => {
            const duration = Date.now() - start;
            const durationSeconds = duration / 1000;
            const logLevel = res.statusCode >= 500
                ? "error"
                : res.statusCode >= 400
                    ? "warn"
                    : "info";
            // Log response
            requestLogger[logLevel]({
                statusCode: res.statusCode,
                duration,
                contentLength: res.getHeader("content-length"),
            }, "Request completed");
            // Record metrics
            const labels = {
                method: req.method,
                route,
                status_code: res.statusCode.toString(),
            };
            metrics_1.httpRequestDuration.observe(labels, durationSeconds);
            metrics_1.httpRequestTotal.inc(labels);
            metrics_1.httpRequestsInProgress.dec({ method: req.method, route });
            // Track errors
            if (res.statusCode >= 400) {
                metrics_1.errorTotal.inc({
                    type: "http_error",
                    severity: res.statusCode >= 500 ? "error" : "warning",
                });
            }
            // Update span
            span.setAttribute("http.status_code", res.statusCode);
            if (res.statusCode >= 400) {
                span.setStatus({
                    code: api_1.SpanStatusCode.ERROR,
                    message: `HTTP ${res.statusCode}`,
                });
            }
            else {
                span.setStatus({ code: api_1.SpanStatusCode.OK });
            }
            span.end();
        });
        // Run next middleware in the span context
        api_1.context.with(api_1.trace.setSpan(api_1.context.active(), span), next);
    }
};
exports.ObservabilityMiddleware = ObservabilityMiddleware;
exports.ObservabilityMiddleware = ObservabilityMiddleware = __decorate([
    (0, common_1.Injectable)()
], ObservabilityMiddleware);
