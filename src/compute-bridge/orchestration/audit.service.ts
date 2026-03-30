import { Injectable, Logger } from "@nestjs/common";
import * as crypto from "crypto";
import { AIProviderType } from "../provider.interface";
import { CompletionRequestDto } from "../base.dto";
import {
  ProviderAuditLogEntry,
  OrchestrationStrategy,
  NormalizedProviderResponse,
} from "./orchestration.interface";

/**
 * Audit Service
 *
 * Provides comprehensive auditing for all provider interactions.
 * All calls and responses are logged with timestamps, request IDs,
 * and digital signatures for integrity verification.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);
  private readonly auditLog: ProviderAuditLogEntry[] = [];
  private readonly maxLogSize: number;
  private readonly signingKey: string;

  constructor() {
    this.maxLogSize = parseInt(process.env.AUDIT_MAX_LOG_SIZE || "10000", 10);
    // In production, this should be loaded from a secure key management system
    this.signingKey =
      process.env.AUDIT_SIGNING_KEY || this.generateSigningKey();
  }

  /**
   * Log a provider request
   */
  logRequest(
    requestId: string,
    provider: AIProviderType,
    request: CompletionRequestDto,
    orchestrationContext?: {
      strategy: OrchestrationStrategy;
      isFinalSelection: boolean;
      consensusReached?: boolean;
    },
  ): string {
    const auditId = this.generateAuditId();

    // Sanitize request data (remove sensitive info like API keys)
    const sanitizedRequest = this.sanitizeRequest(request);

    const entry: Omit<ProviderAuditLogEntry, "signature"> = {
      auditId,
      requestId,
      timestamp: new Date(),
      provider,
      request: sanitizedRequest,
      orchestrationContext,
    };

    // Generate digital signature
    const signature = this.generateSignature(entry);

    const fullEntry: ProviderAuditLogEntry = {
      ...entry,
      signature,
    };

    this.addToLog(fullEntry);

    this.logger.debug(`Audit log created: ${auditId} for request ${requestId}`);

    return auditId;
  }

  /**
   * Log a provider response
   */
  logResponse(auditId: string, response: NormalizedProviderResponse): void {
    const existingEntry = this.auditLog.find((e) => e.auditId === auditId);

    if (!existingEntry) {
      this.logger.warn(`Cannot log response: audit entry ${auditId} not found`);
      return;
    }

    // Add response data
    existingEntry.response = {
      id: response.id,
      content: response.content,
      tokensUsed: response.usage.totalTokens,
      latencyMs: response.latencyMs,
    };

    // Regenerate signature with response data
    const { signature: _, ...entryWithoutSig } = existingEntry;
    existingEntry.signature = this.generateSignature(entryWithoutSig);

    this.logger.debug(`Response logged for audit: ${auditId}`);
  }

  /**
   * Log a provider error
   */
  logError(auditId: string, error: string): void {
    const existingEntry = this.auditLog.find((e) => e.auditId === auditId);

    if (!existingEntry) {
      this.logger.warn(`Cannot log error: audit entry ${auditId} not found`);
      return;
    }

    existingEntry.error = error;

    // Regenerate signature
    const { signature: _, ...entryWithoutSig } = existingEntry;
    existingEntry.signature = this.generateSignature(entryWithoutSig);

    this.logger.debug(`Error logged for audit: ${auditId}`);
  }

  /**
   * Get audit log entries with optional filtering
   */
  getAuditLog(options?: {
    requestId?: string;
    provider?: AIProviderType;
    startTime?: Date;
    endTime?: Date;
    limit?: number;
    offset?: number;
  }): ProviderAuditLogEntry[] {
    let entries = [...this.auditLog];

    if (options?.requestId) {
      entries = entries.filter((e) => e.requestId === options.requestId);
    }

    if (options?.provider) {
      entries = entries.filter((e) => e.provider === options.provider);
    }

    if (options?.startTime) {
      entries = entries.filter((e) => e.timestamp >= options.startTime!);
    }

    if (options?.endTime) {
      entries = entries.filter((e) => e.timestamp <= options.endTime!);
    }

    // Sort by timestamp descending
    entries.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Apply pagination
    const offset = options?.offset || 0;
    const limit = options?.limit || entries.length;

    return entries.slice(offset, offset + limit);
  }

  /**
   * Get a single audit entry by ID
   */
  getAuditEntry(auditId: string): ProviderAuditLogEntry | undefined {
    return this.auditLog.find((e) => e.auditId === auditId);
  }

  /**
   * Verify the integrity of an audit entry
   */
  verifyIntegrity(auditId: string): boolean {
    const entry = this.getAuditEntry(auditId);

    if (!entry) {
      return false;
    }

    const { signature, ...entryWithoutSig } = entry;
    const expectedSignature = this.generateSignature(entryWithoutSig);

    return signature === expectedSignature;
  }

  /**
   * Export audit log to JSON
   */
  exportAuditLog(options?: {
    startTime?: Date;
    endTime?: Date;
    format?: "json" | "csv";
  }): string {
    const entries = this.getAuditLog({
      startTime: options?.startTime,
      endTime: options?.endTime,
    });

    if (options?.format === "csv") {
      return this.exportToCSV(entries);
    }

    return JSON.stringify(entries, null, 2);
  }

  /**
   * Get audit statistics
   */
  getStatistics(options?: { startTime?: Date; endTime?: Date }): {
    totalEntries: number;
    entriesByProvider: Record<string, number>;
    successRate: number;
    averageLatencyMs: number;
    totalTokensUsed: number;
  } {
    const entries = this.getAuditLog({
      startTime: options?.startTime,
      endTime: options?.endTime,
    });

    const entriesByProvider: Record<string, number> = {};
    let successCount = 0;
    let totalLatency = 0;
    let totalTokens = 0;

    for (const entry of entries) {
      // Count by provider
      entriesByProvider[entry.provider] =
        (entriesByProvider[entry.provider] || 0) + 1;

      // Success rate
      if (entry.response && !entry.error) {
        successCount++;
      }

      // Latency
      if (entry.response?.latencyMs) {
        totalLatency += entry.response.latencyMs;
      }

      // Tokens
      if (entry.response?.tokensUsed) {
        totalTokens += entry.response.tokensUsed;
      }
    }

    return {
      totalEntries: entries.length,
      entriesByProvider,
      successRate: entries.length > 0 ? successCount / entries.length : 0,
      averageLatencyMs: entries.length > 0 ? totalLatency / entries.length : 0,
      totalTokensUsed: totalTokens,
    };
  }

  /**
   * Clear the audit log (use with caution)
   */
  clearAuditLog(): void {
    this.auditLog.length = 0;
    this.logger.warn("Audit log cleared");
  }

  /**
   * Generate a unique audit ID
   */
  private generateAuditId(): string {
    return `audit-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
  }

  /**
   * Generate a signing key
   */
  private generateSigningKey(): string {
    return crypto.randomBytes(32).toString("hex");
  }

  /**
   * Generate a digital signature for an audit entry
   */
  private generateSignature(
    entry: Omit<ProviderAuditLogEntry, "signature">,
  ): string {
    const data = JSON.stringify(entry);
    return crypto
      .createHmac("sha256", this.signingKey)
      .update(data)
      .digest("hex");
  }

  /**
   * Sanitize request data to remove sensitive information
   */
  private sanitizeRequest(request: CompletionRequestDto): {
    model: string;
    messageCount: number;
    maxTokens?: number;
    temperature?: number;
  } {
    return {
      model: request.model,
      messageCount: request.messages?.length || 0,
      maxTokens: request.maxTokens,
      temperature: request.temperature,
    };
  }

  /**
   * Add entry to log with size management
   */
  private addToLog(entry: ProviderAuditLogEntry): void {
    // Remove oldest entries if log is full
    while (this.auditLog.length >= this.maxLogSize) {
      this.auditLog.shift();
    }

    this.auditLog.push(entry);
  }

  /**
   * Export entries to CSV format
   */
  private exportToCSV(entries: ProviderAuditLogEntry[]): string {
    const headers = [
      "auditId",
      "requestId",
      "timestamp",
      "provider",
      "model",
      "messageCount",
      "responseId",
      "tokensUsed",
      "latencyMs",
      "error",
      "signature",
    ];

    const rows = entries.map((entry) => [
      entry.auditId,
      entry.requestId,
      entry.timestamp.toISOString(),
      entry.provider,
      entry.request.model,
      entry.request.messageCount,
      entry.response?.id || "",
      entry.response?.tokensUsed || 0,
      entry.response?.latencyMs || 0,
      entry.error || "",
      entry.signature,
    ]);

    return [
      headers.join(","),
      ...rows.map((row) => row.map((cell) => `"${cell}"`).join(",")),
    ].join("\n");
  }
}
