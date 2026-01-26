// test-logger.ts
// import { logger } from './src/config/logger';

import { logger } from "./src/config/logger";

logger.info("TEST: Logger is working!");
logger.error("TEST: This is an error");
logger.warn({ custom: "data" }, "TEST: Warning with data");
