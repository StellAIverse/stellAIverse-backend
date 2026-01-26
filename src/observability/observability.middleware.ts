import { Injectable, NestMiddleware } from "@nestjs/common";
import { Request, Response, NextFunction } from "express";
import { v4 as uuidv4 } from "uuid";
import { logger } from "../config/logger";
import {
  httpRequestDuration,
  httpRequestTotal,
  httpRequestsInProgress,
  errorTotal,
} from "../config/metrics";
import { context, trace, SpanStatusCode, Span } from "@opentelemetry/api";
import { getTracer } from "../config/tracing";

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      id: string;
      span?: Span;
    }
  }
}

@Injectable()
export class ObservabilityMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    // Add request ID
    req.id = (req.headers["x-request-id"] as string) || uuidv4();
    res.setHeader("X-Request-Id", req.id);

    const start = Date.now();
    const route = req.route?.path || req.path;

    // Create request logger
    const requestLogger = logger.child({
      requestId: req.id,
      method: req.method,
      url: req.url,
      userAgent: req.headers["user-agent"],
      ip: req.ip,
    });

    // Log incoming request
    requestLogger.info("Incoming request");

    // Create tracing span
    const tracer = getTracer();
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
    httpRequestsInProgress.inc({ method: req.method, route });

    // Handle response
    res.on("finish", () => {
      const duration = Date.now() - start;
      const durationSeconds = duration / 1000;
      const logLevel =
        res.statusCode >= 500
          ? "error"
          : res.statusCode >= 400
            ? "warn"
            : "info";

      // Log response
      requestLogger[logLevel](
        {
          statusCode: res.statusCode,
          duration,
          contentLength: res.getHeader("content-length"),
        },
        "Request completed",
      );

      // Record metrics
      const labels = {
        method: req.method,
        route,
        status_code: res.statusCode.toString(),
      };
      httpRequestDuration.observe(labels, durationSeconds);
      httpRequestTotal.inc(labels);
      httpRequestsInProgress.dec({ method: req.method, route });

      // Track errors
      if (res.statusCode >= 400) {
        errorTotal.inc({
          type: "http_error",
          severity: res.statusCode >= 500 ? "error" : "warning",
        });
      }

      // Update span
      span.setAttribute("http.status_code", res.statusCode);
      if (res.statusCode >= 400) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: `HTTP ${res.statusCode}`,
        });
      } else {
        span.setStatus({ code: SpanStatusCode.OK });
      }
      span.end();
    });

    // Run next middleware in the span context
    context.with(trace.setSpan(context.active(), span), next);
  }
}
