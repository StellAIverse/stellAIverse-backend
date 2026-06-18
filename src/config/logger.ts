const pino = require("pino");
import { getCurrentTraceId } from "./tracing";

const isDevelopment = process.env.NODE_ENV === "development";

// Create a Pino logger that automatically includes trace IDs
export const logger = pino({
  level: process.env.LOG_LEVEL || "info",
  transport: isDevelopment
    ? {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "HH:MM:ss Z",
          ignore: "pid,hostname",
        },
      }
    : undefined,
  formatters: {
    level: (label) => {
      return { level: label };
    },
  },
  base: {
    env: process.env.NODE_ENV,
    service: "stellAIverse-backend",
  },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Mixin to add trace ID to every log entry
  mixin() {
    const traceId = getCurrentTraceId();
    if (traceId) {
      return {
        trace_id: traceId,
      };
    }
    return {};
  },
});

// Helper function to create child loggers with context
export const createLogger = (context: Record<string, any>) => {
  const traceId = getCurrentTraceId();
  const contextWithTrace = traceId ? { ...context, trace_id: traceId } : context;
  return logger.child(contextWithTrace);
};