"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createSpan = exports.getTracer = exports.shutdownTracing = exports.startTracing = exports.sdk = void 0;
const sdk_node_1 = require("@opentelemetry/sdk-node");
const auto_instrumentations_node_1 = require("@opentelemetry/auto-instrumentations-node");
const exporter_trace_otlp_http_1 = require("@opentelemetry/exporter-trace-otlp-http");
const resources_1 = require("@opentelemetry/resources");
const sdk_trace_base_1 = require("@opentelemetry/sdk-trace-base");
const api_1 = require("@opentelemetry/api");
// Configure the trace exporter
const traceExporter = new exporter_trace_otlp_http_1.OTLPTraceExporter({
    url: process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
        "http://localhost:4318/v1/traces",
});
exports.sdk = new sdk_node_1.NodeSDK({
    resource: (0, resources_1.resourceFromAttributes)({
        "service.name": "stellAIverse-backend",
        "service.version": process.env.npm_package_version || "1.0.0",
        "deployment.environment": process.env.NODE_ENV || "development",
    }),
    spanProcessor: new sdk_trace_base_1.BatchSpanProcessor(traceExporter),
    instrumentations: [
        (0, auto_instrumentations_node_1.getNodeAutoInstrumentations)({
            "@opentelemetry/instrumentation-fs": {
                enabled: false,
            },
        }),
    ],
});
// Start the SDK
const startTracing = async () => {
    try {
        exports.sdk.start();
        console.log("OpenTelemetry tracing initialized");
    }
    catch (err) {
        console.error("Failed to start OpenTelemetry SDK:", err);
    }
};
exports.startTracing = startTracing;
// Graceful shutdown
const shutdownTracing = async () => {
    try {
        await exports.sdk.shutdown();
        console.log("OpenTelemetry tracing shut down");
    }
    catch (error) {
        console.error("Error shutting down tracing:", error);
    }
};
exports.shutdownTracing = shutdownTracing;
// Helper to get the tracer
const getTracer = () => {
    return api_1.trace.getTracer("stellAIverse-backend", "1.0.0");
};
exports.getTracer = getTracer;
// Helper to create a span with automatic error handling
const createSpan = async (name, fn) => {
    const tracer = (0, exports.getTracer)();
    return tracer.startActiveSpan(name, async (span) => {
        try {
            const result = await fn(span);
            span.setStatus({ code: api_1.SpanStatusCode.OK });
            return result;
        }
        catch (error) {
            span.setStatus({
                code: api_1.SpanStatusCode.ERROR,
                message: error instanceof Error ? error.message : "Unknown error",
            });
            if (error instanceof Error) {
                span.recordException(error);
            }
            throw error;
        }
        finally {
            span.end();
        }
    });
};
exports.createSpan = createSpan;
