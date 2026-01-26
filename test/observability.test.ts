// test/observability.test.ts
// Simple test to verify all observability components work

import { logger, createLogger } from "../src/config/logger";
import { getTracer, createSpan } from "../src/config/tracing";
import { register } from "../src/config/metrics";

console.log("🧪 Testing Observability Setup...\n");

// Test 1: Logger
console.log("✅ Test 1: Logger");
try {
  logger.info("Test log message");
  const childLogger = createLogger({ testContext: "value" });
  childLogger.debug("Child logger test");
  console.log("   Logger working!\n");
} catch (error) {
  console.error("❌ Logger failed:", error);
  process.exit(1);
}

// Test 2: Tracer
console.log("✅ Test 2: Tracer");
try {
  const tracer = getTracer();
  const span = tracer.startSpan("test-span");
  span.setAttribute("test.attribute", "value");
  span.end();
  console.log("   Tracer working!\n");
} catch (error) {
  console.error("❌ Tracer failed:", error);
  process.exit(1);
}

// Test 3: Create Span Helper
console.log("✅ Test 3: Create Span Helper");
async function testCreateSpan() {
  try {
    const result = await createSpan("test-operation", async (span) => {
      span.addEvent("Test event");
      return "success";
    });
    if (result === "success") {
      console.log("   Create span helper working!\n");
    }
  } catch (error) {
    console.error("❌ Create span helper failed:", error);
    process.exit(1);
  }
}

// Test 4: Metrics
console.log("✅ Test 4: Metrics");
async function testMetrics() {
  try {
    const metrics = await register.metrics();
    if (metrics.includes("process_cpu_user_seconds_total")) {
      console.log("   Metrics working!\n");
    } else {
      throw new Error("Default metrics not found");
    }
  } catch (error) {
    console.error("❌ Metrics failed:", error);
    process.exit(1);
  }
}

// Run async tests
(async () => {
  await testCreateSpan();
  await testMetrics();

  console.log("🎉 All observability tests passed!\n");
  console.log("Next steps:");
  console.log("1. Start the observability stack: docker-compose up -d");
  console.log("2. Run your app: npm run dev");
  console.log("3. Check metrics: http://localhost:3000/metrics");
  console.log("4. Check Jaeger UI: http://localhost:16686");
  console.log("5. Check Prometheus: http://localhost:9090");
})();
