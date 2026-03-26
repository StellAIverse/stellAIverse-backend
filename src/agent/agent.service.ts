import { Injectable } from "@nestjs/common";
import { Agent } from "./entities/agent.entity";
import { AgentTelemetryService } from "../websocket/agent-telemetry.service";
import { AgentTelemetryGateway } from "../websocket/agent-telemetry.gateway";

@Injectable()
export class AgentService {
  constructor(
    private readonly telemetryService: AgentTelemetryService,
    private readonly telemetryGateway: AgentTelemetryGateway,
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
}

