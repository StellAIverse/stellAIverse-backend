import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from "@nestjs/common";
import { Request, Response } from "express";
import { v4 as uuidv4 } from "uuid";

/**
 * Global exception filter that sanitizes error responses in production.
 * - Never exposes stack traces or internal details to clients.
 * - Logs full error details server-side with a correlation ID.
 * - Returns structured, generic error responses to clients.
 */
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name);
  private readonly isProduction = process.env.NODE_ENV === "production";

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const correlationId = uuidv4();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let clientMessage: string | object = "An unexpected error occurred";

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const exceptionResponse = exception.getResponse();

      // In production, only expose safe HTTP exception messages
      if (this.isProduction) {
        clientMessage =
          typeof exceptionResponse === "string"
            ? exceptionResponse
            : (exceptionResponse as any).message ?? "Request failed";
      } else {
        clientMessage =
          typeof exceptionResponse === "string"
            ? exceptionResponse
            : exceptionResponse;
      }
    }

    // Log full details server-side only
    this.logger.error({
      correlationId,
      method: request.method,
      url: request.url,
      status,
      error:
        exception instanceof Error
          ? {
              name: exception.name,
              message: exception.message,
              stack: this.isProduction ? undefined : exception.stack,
            }
          : String(exception),
    });

    response.status(status).json({
      statusCode: status,
      correlationId,
      message: clientMessage,
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
