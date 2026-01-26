// src/config/nest-pino-logger.ts
import { Injectable, LoggerService } from "@nestjs/common";
import { logger } from "./logger";

@Injectable()
export class PinoLogger implements LoggerService {
  private context?: string;

  setContext(context: string) {
    this.context = context;
  }

  log(message: any, ...optionalParams: any[]) {
    this.callLog("info", message, optionalParams);
  }

  error(message: any, ...optionalParams: any[]) {
    this.callLog("error", message, optionalParams);
  }

  warn(message: any, ...optionalParams: any[]) {
    this.callLog("warn", message, optionalParams);
  }

  debug(message: any, ...optionalParams: any[]) {
    this.callLog("debug", message, optionalParams);
  }

  verbose(message: any, ...optionalParams: any[]) {
    this.callLog("trace", message, optionalParams);
  }

  private callLog(level: string, message: any, optionalParams: any[]) {
    const context = optionalParams[0] || this.context;
    const logMessage = typeof message === "object" ? message : { message };

    if (context) {
      logMessage.context = context;
    }

    // Handle additional parameters
    if (optionalParams.length > 1) {
      logMessage.params = optionalParams.slice(1);
    }

    logger[level](logMessage);
  }
}
