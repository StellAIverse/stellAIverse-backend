import { Injectable, Logger } from "@nestjs/common";
import { Agent } from "./entities/agent.entity";
import { AgentTelemetryService } from "../websocket/agent-telemetry.service";
import { AgentTelemetryGateway } from "../websocket/agent-telemetry.gateway";
import { ProvenanceService } from "../audit/provenance.service";
import {
  ProvenanceAction,
  ProvenanceStatus,
} from "../audit/entities/provenance-record.entity";

@Injectable()
export class AgentService {
  private readonly logger = new Logger(AgentService.name);

  constructor(
    private readonly telemetryService: AgentTelemetryService,
    private readonly telemetryGateway: AgentTelemetryGateway,
    private readonly provenanceService: ProvenanceService,
  ) {}

  private readonly agents: Agent[] = [
    {
      id: "1",
      name: "AlphaScout",
      description: "Finds early-stage opportunities on-chain.",
      creator: "0xAlpha",
      capabilities: ["discovery", "on-chain-analysis"],
      usageCount: 150,
      performanceScore: 92,
    },
    {
      id: "2",
      name: "BetaGuard",
      description: "Monitors liquidity pools for unusual activity.",
      creator: "0xBeta",
      capabilities: ["security", "monitoring"],
      usageCount: 80,
      performanceScore: 88,
    },
    {
      id: "3",
      name: "GammaTrade",
      description: "Executes high-frequency trades based on sentiment.",
      creator: "0xGamma",
      capabilities: ["trading", "sentiment-analysis"],
      usageCount: 300,
      performanceScore: 75,
    },
    {
      id: "4",
      name: "DeltaOracle",
      description: "Provides real-time price feeds for obscure tokens.",
      creator: "0xDelta",
      capabilities: ["oracle", "pricing"],
      usageCount: 45,
      performanceScore: 95,
    },
    {
      id: "5",
      name: "EpsilonBot",
      description: "Automates social media engagement for projects.",
      creator: "0xEpsilon",
      capabilities: ["social", "automation"],
      usageCount: 20,
      performanceScore: 60,
    },
  ];

  findAll(): Agent[] {
    return this.agents;
  }

  findOne(id: string): Agent {
    return this.agents.find((agent) => agent.id === id);
  }

  // --- Telemetry Methods ---

  emitHeartbeat(agentId: string, data?: any) {
    this.telemetryGateway.broadcastTelemetry({
      agentId,
      type: "heartbeat",
      severity: "info",
      data: data || { status: "active" },
      timestamp: new Date().toISOString(),
    });
  }

  updateStatus(agentId: string, status: string, details?: any) {
    this.telemetryGateway.broadcastTelemetry({
      agentId,
      type: "status_update",
      severity: "info",
      data: { status, details },
      timestamp: new Date().toISOString(),
    });
  }

  reportError(agentId: string, error: string, severity: "warning" | "error" | "critical" = "error") {
    this.telemetryGateway.broadcastTelemetry({
      agentId,
      type: "error",
      severity,
      data: { error },
      timestamp: new Date().toISOString(),
    });
  }

  // --- Provenance Tracking Methods ---

  /**
   * Log provenance when agent request is received
   */
  async logRequestReceived(
    agentId: string,
    userId: string | null,
    input: Record<string, any>,
    metadata?: { clientIp?: string; userAgent?: string },
  ): Promise<string> {
    const record = await this.provenanceService.createProvenanceRecord({
      agentId,
      userId: userId || undefined,
      action: ProvenanceAction.REQUEST_RECEIVED,
      input,
      status: ProvenanceStatus.SUCCESS,
      clientIp: metadata?.clientIp,
      userAgent: metadata?.userAgent,
      metadata: { event: 'request_received' },
    });

    this.logger.log(`Logged request received for agent ${agentId}`);
    return record.id;
  }

  /**
   * Log provenance before provider call
   */
  async logProviderCall(
    agentId: string,
    userId: string | null,
    provider: string,
    providerModel: string,
    input: Record<string, any>,
  ): Promise<string> {
    const record = await this.provenanceService.createProvenanceRecord({
      agentId,
      userId: userId || undefined,
      action: ProvenanceAction.PROVIDER_CALL,
      input,
      status: ProvenanceStatus.PENDING,
      provider,
      providerModel,
      metadata: { event: 'provider_call_initiated' },
    });

    this.logger.log(`Logged provider call for agent ${agentId} to ${provider}`);
    return record.id;
  }

  /**
   * Log provenance after result normalization
   */
  async logResultNormalization(
    agentId: string,
    userId: string | null,
    provider: string,
    input: Record<string, any>,
    output: Record<string, any>,
    processingDurationMs?: number,
  ): Promise<string> {
    const record = await this.provenanceService.createProvenanceRecord({
      agentId,
      userId: userId || undefined,
      action: ProvenanceAction.RESULT_NORMALIZATION,
      input,
      output,
      status: ProvenanceStatus.SUCCESS,
      provider,
      processingDurationMs,
      metadata: { event: 'result_normalized' },
    });

    this.logger.log(`Logged result normalization for agent ${agentId}`);
    return record.id;
  }

  /**
   * Log provenance on successful submission
   */
  async logSubmission(
    agentId: string,
    userId: string | null,
    input: Record<string, any>,
    output: Record<string, any>,
    onChainTxHash: string,
    provider?: string,
  ): Promise<string> {
    const record = await this.provenanceService.createProvenanceRecord({
      agentId,
      userId: userId || undefined,
      action: ProvenanceAction.SUBMISSION,
      input,
      output,
      status: ProvenanceStatus.SUCCESS,
      provider,
      onChainTxHash,
      metadata: { event: 'submission_confirmed' },
    });

    this.logger.log(`Logged submission for agent ${agentId} with tx ${onChainTxHash}`);
    return record.id;
  }

  /**
   * Log provenance on error
   */
  async logError(
    agentId: string,
    userId: string | null,
    action: ProvenanceAction,
    input: Record<string, any>,
    error: string,
    provider?: string,
  ): Promise<string> {
    const record = await this.provenanceService.createProvenanceRecord({
      agentId,
      userId: userId || undefined,
      action,
      input,
      status: ProvenanceStatus.FAILED,
      error,
      provider,
      metadata: { event: 'error_occurred' },
    });

    this.logger.log(`Logged error for agent ${agentId}: ${error}`);
    return record.id;
  }

  /**
   * Update an existing provenance record (e.g., to mark as completed)
   */
  async updateProvenanceRecord(
    recordId: string,
    updates: {
      output?: Record<string, any>;
      status?: ProvenanceStatus;
      error?: string;
      onChainTxHash?: string;
      processingDurationMs?: number;
    },
  ): Promise<void> {
    await this.provenanceService.updateProvenanceRecord(recordId, updates);
    this.logger.log(`Updated provenance record ${recordId}`);
  }
}

