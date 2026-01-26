// examples/usage.ts
// Examples of how to use the observability features in your code

import { logger, createLogger } from "../config/logger";
import { createSpan, getTracer } from "../config/tracing";
import { databaseQueryDuration, userSignups } from "../config/metrics";
import { Request, Response } from "express";

// ============================================
// LOGGING EXAMPLES
// ============================================

// Basic logging
logger.info("Application started");
logger.warn("Low memory warning");
logger.error({ err: new Error("Something went wrong") }, "Error occurred");

// Structured logging with context
const userLogger = createLogger({ userId: "12345", email: "user@example.com" });
userLogger.info("User logged in");
userLogger.debug({ action: "profile_update" }, "User updated profile");

// Logging in a route handler
export async function getUserHandler(req: Request, res: Response) {
  const requestLogger = createLogger({
    requestId: req.id,
    userId: req.params.userId,
  });

  requestLogger.info("Fetching user data");

  try {
    // Your logic here
    const userData = { id: req.params.userId, name: "Example" };
    requestLogger.info("User data retrieved successfully");
    res.json({ data: userData });
  } catch (error) {
    requestLogger.error({ err: error }, "Failed to fetch user");
    res.status(500).json({ error: "Internal server error" });
  }
}

// ============================================
// TRACING EXAMPLES
// ============================================

// Using createSpan helper (recommended)
export async function processOrder(orderId: string) {
  return await createSpan("process-order", async (span) => {
    // Add custom attributes
    span.setAttribute("order.id", orderId);

    // Your business logic
    const order = await fetchOrder(orderId);
    span.addEvent("Order fetched");

    await validateOrder(order);
    span.addEvent("Order validated");

    await saveOrder(order);
    span.addEvent("Order saved");

    return order;
  });
}

// Manual nested spans for complex operations
export async function complexOperation() {
  const tracer = getTracer();

  return tracer.startActiveSpan("complex-operation", async (parentSpan) => {
    try {
      // Step 1
      await tracer.startActiveSpan("step-1-database-query", async (span1) => {
        try {
          // Do database work
          span1.addEvent("Step 1 completed");
          span1.setStatus({ code: 0 }); // OK
        } finally {
          span1.end();
        }
      });

      // Step 2
      await tracer.startActiveSpan("step-2-external-api", async (span2) => {
        try {
          span2.setAttribute("api.endpoint", "/external/resource");
          // Do API call
        } finally {
          span2.end();
        }
      });

      parentSpan.setStatus({ code: 0 }); // OK
      return { success: true };
    } catch (error) {
      if (error instanceof Error) {
        parentSpan.recordException(error);
        parentSpan.setStatus({ code: 2, message: error.message }); // ERROR
      }
      throw error;
    } finally {
      parentSpan.end();
    }
  });
}

// ============================================
// METRICS EXAMPLES
// ============================================

// Mock database for examples
const db = {
  query: async (q: string) => ({ rows: [] }),
};

// Recording database query metrics
export async function queryDatabase(query: string, table: string) {
  const end = databaseQueryDuration.startTimer({
    operation: "select",
    table,
  });

  try {
    const result = await db.query(query);
    return result;
  } finally {
    end(); // Records the duration automatically
  }
}

// Tracking business metrics
export async function registerUser(userData: any) {
  // Registration logic
  const user = { id: "123", ...userData };

  // Increment signup counter
  userSignups.inc();

  return user;
}

// Tracking custom metrics with labels
import { Counter } from "prom-client";
import { register } from "../config/metrics";

const checkoutCounter = new Counter({
  name: "stellaiverse_checkouts_total",
  help: "Total number of checkouts",
  labelNames: ["payment_method", "country"],
  registers: [register],
});

export async function processCheckout(payment: {
  method: string;
  country: string;
}) {
  // Process checkout logic
  checkoutCounter.inc({
    payment_method: payment.method,
    country: payment.country,
  });

  return { success: true };
}

// ============================================
// COMBINED EXAMPLE - Complete Route Handler
// ============================================

// Mock functions for example
async function validatePost(body: any) {
  return true;
}
async function savePost(body: any) {
  return { id: "1", ...body };
}

export async function createPostHandler(req: Request, res: Response) {
  const requestLogger = createLogger({
    requestId: req.id,
    userId: req.body?.userId,
    action: "create_post",
  });

  return await createSpan("create-post", async (span) => {
    requestLogger.info("Creating new post");
    span.setAttribute("post.type", req.body?.type || "unknown");

    try {
      // Validation
      const validationEnd = databaseQueryDuration.startTimer({
        operation: "validate",
        table: "posts",
      });
      await validatePost(req.body);
      validationEnd();

      // Database operation with timing
      const dbEnd = databaseQueryDuration.startTimer({
        operation: "insert",
        table: "posts",
      });
      const post = await savePost(req.body);
      dbEnd();

      requestLogger.info({ postId: post.id }, "Post created successfully");
      res.status(201).json({ data: post });
    } catch (error) {
      requestLogger.error({ err: error }, "Failed to create post");
      res.status(500).json({ error: "Failed to create post" });
    }
  });
}

// Mock function for example
async function fetchOrder(orderId: string) {
  return { id: orderId };
}
async function validateOrder(order: any) {
  return true;
}
async function saveOrder(order: any) {
  return order;
}
