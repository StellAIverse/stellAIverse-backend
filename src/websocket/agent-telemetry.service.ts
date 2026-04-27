import { Injectable, Logger } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";

export interface TelemetryEvent {
  agentId: string;
  type: "heartbeat" | "status_update" | "error" | "disconnect";
  severity: "info" | "warning" | "error" | "critical";
  data: any;
  timestamp: string;
}

export interface TelemetryFilter {
  agentId?: string;
  types?: string[];
  severities?: string[];
}

@Injectable()
export class AgentTelemetryService {
  private readonly logger = new Logger(AgentTelemetryService.name);

  constructor() {}

  /**
   * Processes a telemetry event and determines which clients should receive it.
   * This is a placeholder for more complex logic like rate limiting or persistence.
   */
  processTelemetry(event: TelemetryEvent): TelemetryEvent {
    // Strip sensitive information if any
    const sanitizedData = this.sanitizeData(event.data);

    return {
      ...event,
      data: sanitizedData,
      timestamp: event.timestamp || new Date().toISOString(),
    };
  }

  /**
   * Sanitizes telemetry data to ensure no PII or sensitive info is leaked.
   */
  private sanitizeData(data: any): any {
    if (!data) return data;

    const sensitiveKeys = [
      "apiKey",
      "secret",
      "password",
      "token",
      "privateKey",
      "email",
    ];
    const sanitized = { ...data };

    for (const key of sensitiveKeys) {
      if (key in sanitized) {
        sanitized[key] = "[REDACTED]";
      }
    }

    return sanitized;
  }

  /**
   * Checks if an event matches the client's filter criteria.
   */
  matchesFilter(event: TelemetryEvent, filter: TelemetryFilter): boolean {
    if (filter.agentId && filter.agentId !== event.agentId) {
      return false;
    }

    if (
      filter.types &&
      filter.types.length > 0 &&
      !filter.types.includes(event.type)
    ) {
      return false;
    }

    if (
      filter.severities &&
      filter.severities.length > 0 &&
      !filter.severities.includes(event.severity)
    ) {
      return false;
    }

    return true;
  }
}
