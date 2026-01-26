// import pino from "pino";
const pino = require("pino");

const isDevelopment = process.env.NODE_ENV === "development";

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
});

// Helper function to create child loggers with context
export const createLogger = (context: Record<string, any>) => {
  return logger.child(context);
};
