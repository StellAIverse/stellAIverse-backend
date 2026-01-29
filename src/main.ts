import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
import * as helmet from "helmet";
import { logger } from "./config/logger";

async function bootstrap() {
  // Initialize tracing safely
  try {
    const { startTracing } = await import("./config/tracing");
    await startTracing();
    logger.info("Tracing initialized");
  } catch (error) {
    logger.warn({ error: error.message }, "Tracing skipped");
  }

  // Create app with appropriate logging
  const app = await NestFactory.create(AppModule, {
    logger:
      process.env.NODE_ENV === "production"
        ? ["error", "warn"]
        : ["log", "error", "warn", "debug", "verbose"],
  });

  // Security Headers - Helmet
  app.use(
    helmet.default({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true,
      },
    }),
  );

  // Global configuration
  app.setGlobalPrefix("api/v1");
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      disableErrorMessages: process.env.NODE_ENV === "production",
      forbidUnknownValues: true,
    }),
  );

  // CORS configuration with stricter settings
  const allowedOrigins = process.env.CORS_ORIGIN
    ? process.env.CORS_ORIGIN.split(",").map((origin) => origin.trim())
    : ["http://localhost:3001"];

  app.enableCors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, etc.)
      if (!origin || allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
    exposedHeaders: ["X-Total-Count"],
    maxAge: 3600,
  });

  // Disable x-powered-by header
  app.getHttpAdapter().getInstance().disable("x-powered-by");

  const port = process.env.PORT || 3000;
  await app.listen(port);

  logger.info(`🚀 Application running on http://localhost:${port}/api/v1`);
}

bootstrap().catch((error) => {
  logger.error({ error }, "Bootstrap failed");
  process.exit(1);
});

// Handle uncaught exceptions
process.on("uncaughtException", (error: Error) => {
  logger.error({ error }, "Uncaught Exception");
  process.exit(1);
});

process.on("unhandledRejection", (reason: any) => {
  logger.error({ reason }, "Unhandled Rejection");
  process.exit(1);
});
