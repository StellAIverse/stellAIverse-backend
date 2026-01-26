"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createLogger = exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const isDevelopment = process.env.NODE_ENV === "development";
exports.logger = (0, pino_1.default)({
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
    timestamp: pino_1.default.stdTimeFunctions.isoTime,
});
// Helper function to create child loggers with context
const createLogger = (context) => {
    return exports.logger.child(context);
};
exports.createLogger = createLogger;
