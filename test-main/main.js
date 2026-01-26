"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
console.log("🟢 VERY FIRST LINE OF main.ts");
// Global error handlers at the TOP
process.on('unhandledRejection', (reason, promise) => {
    console.error('🔴 UNHANDLED REJECTION at:', promise, 'reason:', reason);
    if (reason instanceof Error) {
        console.error('🔴 Error stack:', reason.stack);
    }
    process.exit(1);
});
process.on('uncaughtException', (error) => {
    console.error('🔴 UNCAUGHT EXCEPTION:', error);
    console.error('🔴 Stack trace:', error.stack);
    process.exit(1);
});
console.log("========================================");
console.log("MAIN.TS FILE IS LOADING");
console.log("Node version:", process.version);
console.log("========================================");
const core_1 = require("@nestjs/core");
const common_1 = require("@nestjs/common");
const app_module_1 = require("./app.module");
const logger_1 = require("./config/logger");
console.log("========== IMPORTS LOADED ==========");
async function bootstrap() {
    console.log("🚀 INSIDE BOOTSTRAP FUNCTION");
    try {
        console.log("🏗️  Creating NestJS application...");
        // Try creating app with minimal options
        const app = await core_1.NestFactory.create(app_module_1.AppModule, {
            logger: ['error', 'warn', 'log', 'debug', 'verbose']
        });
        console.log("✅ App created successfully");
        app.setGlobalPrefix("api/v1");
        console.log("✅ Global prefix set");
        app.useGlobalPipes(new common_1.ValidationPipe({
            whitelist: true,
            forbidNonWhitelisted: true,
            transform: true,
        }));
        console.log("✅ Global pipes configured");
        app.enableCors({
            origin: process.env.CORS_ORIGIN || "http://localhost:3001",
            credentials: true,
        });
        console.log("✅ CORS enabled");
        const port = process.env.PORT || 3000;
        console.log(`🎧 Starting server on port ${port}...`);
        await app.listen(port);
        console.log(`✅ Server listening on port ${port}`);
        console.log(`🚀 Application is running on: http://localhost:${port}/api/v1`);
        logger_1.logger.info({ port }, "Application started successfully");
        // Keep alive
        console.log("✅ Bootstrap completed successfully");
    }
    catch (error) {
        console.error("❌ CATCH BLOCK: Bootstrap failed:");
        console.error("❌ Error name:", error.name);
        console.error("❌ Error message:", error.message);
        console.error("❌ Full error:", error);
        if (error instanceof Error) {
            console.error("❌ Stack trace:", error.stack);
        }
        // Try to get more details
        if (error.cause) {
            console.error("❌ Error cause:", error.cause);
        }
        process.exit(1);
    }
}
console.log("========== CALLING BOOTSTRAP() ==========");
// Wrap bootstrap in try-catch for synchronous errors
try {
    bootstrap();
}
catch (syncError) {
    console.error("❌ SYNCHRONOUS ERROR in bootstrap call:", syncError);
    process.exit(1);
}
console.log("========== END OF main.ts ==========");
