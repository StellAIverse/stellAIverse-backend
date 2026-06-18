import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";
import { resourceFromAttributes } from "@opentelemetry/resources";
import {
  BatchSpanProcessor,
  ParentBasedSampler,
  TraceIdRatioBasedSampler,
  AlwaysOnSampler,
} from "@opentelemetry/sdk-trace-base";
import { trace, SpanStatusCode, Span, propagation, context } from "@opentelemetry/api";
import { W3CTraceContextPropagator } from "@opentelemetry/core";

// Configure global context propagation
propagation.setGlobalPropagator(new W3CTraceContextPropagator());

// Sampling configuration
const samplingRatio = parseFloat(process.env.OTEL_TRACE_SAMPLING_RATIO || "0.1");
const isProduction = process.env.NODE_ENV === "production";

const sampler = isProduction
  ? new ParentBasedSampler({
      root: new TraceIdRatioBasedSampler(samplingRatio),
    })
  : new AlwaysOnSampler();

// Configure the trace exporter
const traceExporter = new OTLPTraceExporter({
  url:
    process.env.OTEL_EXPORTER_OTLP_ENDPOINT ||
    "http://localhost:4318/v1/traces",
  headers: process.env.OTEL_EXPORTER_OTLP_HEADERS
    ? JSON.parse(process.env.OTEL_EXPORTER_OTLP_HEADERS)
    : {},
});

export const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    "service.name": "stellAIverse-backend",
    "service.version": process.env.npm_package_version || "1.0.0",
    "deployment.environment": process.env.NODE_ENV || "development",
  }),
  sampler,
  spanProcessor: new BatchSpanProcessor(traceExporter),
  instrumentations: [
    getNodeAutoInstrumentations({
      "@opentelemetry/instrumentation-fs": {
        enabled: false,
      },
      "@opentelemetry/instrumentation-pg": {
        enabled: true,
        enhancedDatabaseReporting: true,
      },
    }),
  ],
});

// Start the SDK
export const startTracing = async () => {
  try {
    sdk.start();
    console.log("OpenTelemetry tracing initialized with configurable sampling");
    console.log("Jaeger endpoint:", process.env.OTEL_EXPORTER_JAEGER_ENDPOINT || "http://localhost:14268/api/traces");
    console.log("Jaeger UI available at:", "http://localhost:16686");
  } catch (err) {
    console.error("Failed to start OpenTelemetry SDK:", err);
  }
};

// Graceful shutdown
export const shutdownTracing = async () => {
  try {
    await sdk.shutdown();
    console.log("OpenTelemetry tracing shut down");
  } catch (error) {
    console.error("Error shutting down tracing:", error);
  }
};

// Helper to get the tracer
export const getTracer = () => {
  return trace.getTracer("stellAIverse-backend", "1.0.0");
};

// Helper to get current trace ID for logging
export const getCurrentTraceId = (): string | undefined => {
  const currentSpan = trace.getSpan(context.active());
  if (currentSpan) {
    const spanContext = currentSpan.spanContext();
    return spanContext.traceId;
  }
  return undefined;
};

// Helper to create a span with automatic error handling
export const createSpan = async <T>(
  name: string,
  fn: (span: Span) => Promise<T>,
  attributes?: Record<string, any>,
): Promise<T> => {
  const tracer = getTracer();
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      const result = await fn(span);
      span.setStatus({ code: SpanStatusCode.OK });
      return result;
    } catch (error) {
      span.setStatus({
        code: SpanStatusCode.ERROR,
        message: error instanceof Error ? error.message : "Unknown error",
      });
      if (error instanceof Error) {
        span.recordException(error);
        span.setAttribute("error.type", error.name);
        span.setAttribute("error.stack", error.stack || "");
      }
      throw error;
    } finally {
      span.end();
    }
  });
};

// Manual span creation example (for documentation)
/**
 * Example usage of manual span creation:
 * 
 * await createSpan("process-user-data", async (span) => {
 *   span.setAttribute("user.id", userId);
 *   span.setAttribute("operation", "data-processing");
 *   
 *   // Create child span for nested operation
 *   return await createSpan("validate-user-input", async (childSpan) => {
 *     childSpan.setAttribute("input.size", inputData.length);
 *     return validateInput(inputData);
 *   }, { "operation.type": "validation" });
 * }, { "module": "user-service" });
 */