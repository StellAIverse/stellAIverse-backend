import { Injectable, Logger } from "@nestjs/common";

export interface AgentStatus {
  agentId: string;
  status: "idle" | "running" | "paused" | "error" | "offline";
  lastHeartbeat: Date;
  metadata: {
    name?: string;
    version?: string;
    capabilities?: string[];
    performance?: {
      tasksCompleted: number;
      successRate: number;
      avgResponseTime: number;
    };
  };
}

@Injectable()
export class AgentStatusService {
  private readonly logger = new Logger(AgentStatusService.name);
  private agentStatuses: Map<string, AgentStatus> = new Map();

  async getAgentStatus(agentId: string): Promise<AgentStatus | null> {
    return this.agentStatuses.get(agentId) || null;
  }

  async getAllAgents(): Promise<AgentStatus[]> {
    return Array.from(this.agentStatuses.values());
  }

  async updateAgentStatus(agentId: string, updates: Partial<AgentStatus>) {
    const existing = this.agentStatuses.get(agentId) || {
      agentId,
      status: "idle",
      lastHeartbeat: new Date(),
      metadata: {},
    };

    const updated = {
      ...existing,
      ...updates,
      lastHeartbeat: new Date(),
    };

    this.agentStatuses.set(agentId, updated);
    this.logger.log(`Updated status for agent ${agentId}: ${updated.status}`);

    return updated;
  }

  async removeAgent(agentId: string) {
    this.agentStatuses.delete(agentId);
    this.logger.log(`Removed agent ${agentId}`);
  }

  // Simulate agent heartbeat updates
  async recordHeartbeat(agentId: string, data?: any) {
    const agent = this.agentStatuses.get(agentId);
    if (agent) {
      agent.lastHeartbeat = new Date();
      if (data) {
        agent.metadata = { ...agent.metadata, ...data };
      }
      this.agentStatuses.set(agentId, agent);
    }
  }
}
