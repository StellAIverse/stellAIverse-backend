import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { JaegerExporter } from "@opentelemetry/exporter-jaeger";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { SemanticResourceAttributes } from "@opentelemetry/semantic-conventions";

const jaegerExporter = new JaegerExporter({
  endpoint:
    process.env.OTEL_EXPORTER_JAEGER_ENDPOINT ||
    "http://localhost:14268/api/traces",
});

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [SemanticResourceAttributes.SERVICE_NAME]:
      process.env.OTEL_SERVICE_NAME || "stellAIverse-backend",
  }),
  traceExporter: jaegerExporter,
  instrumentations: [getNodeAutoInstrumentations()],
});

export async function startTracing() {
  await sdk.start();
  process.on("SIGTERM", async () => {
    await sdk.shutdown();
    process.exit(0);
  });
}
