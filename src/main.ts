// src/main.ts - Fixed version
import { NestFactory } from "@nestjs/core";
import { ValidationPipe } from "@nestjs/common";
import { AppModule } from "./app.module";
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

  // Create app
  const app = await NestFactory.create(AppModule);

  // Global configuration
  app.setGlobalPrefix("api/v1");

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  // CORS
  app.enableCors({
    origin: process.env.CORS_ORIGIN || "http://localhost:3001",
    credentials: true,
  });

  const port = process.env.PORT || 3000;
  await app.listen(port);

  // Use the logger directly instead of app.get(PinoLogger)
  logger.info(`🚀 Application running on http://localhost:${port}/api/v1`);
}

bootstrap().catch((error) => {
  logger.error({ error }, "Bootstrap failed");
  process.exit(1);
});