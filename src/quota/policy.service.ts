import { Injectable, Logger } from "@nestjs/common";
import { PolicyEntity, PolicyScope } from "./policy.entity";
import { v4 as uuidv4 } from "uuid";

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);
  private policies: Map<string, PolicyEntity> = new Map();

  createPolicy(
    data: Omit<PolicyEntity, "id" | "createdAt" | "updatedAt">,
  ): PolicyEntity {
    const policy: PolicyEntity = {
      ...data,
      id: uuidv4(),
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    this.policies.set(policy.id, policy);
    this.logger.log(`Policy created: ${policy.id}`);
    return policy;
  }

  updatePolicy(id: string, data: Partial<PolicyEntity>): PolicyEntity | null {
    const existing = this.policies.get(id);
    if (!existing) return null;
    const updated = { ...existing, ...data, updatedAt: new Date() };
    this.policies.set(id, updated);
    this.logger.log(`Policy updated: ${id}`);
    return updated;
  }

  deletePolicy(id: string): boolean {
    const deleted = this.policies.delete(id);
    if (deleted) this.logger.log(`Policy deleted: ${id}`);
    return deleted;
  }

  getPolicy(id: string): PolicyEntity | null {
    return this.policies.get(id) || null;
  }

  listPolicies(): PolicyEntity[] {
    return Array.from(this.policies.values());
  }

  // Enforcement hook
  getApplicablePolicy(
    scope: PolicyScope,
    targetId?: string,
  ): PolicyEntity | null {
    // Simplified: match exact scope/target, fallback to GLOBAL
    const match = Array.from(this.policies.values()).find(
      (p) => p.scope === scope && (!targetId || p.targetId === targetId),
    );
    return (
      match ||
      Array.from(this.policies.values()).find(
        (p) => p.scope === PolicyScope.GLOBAL,
      ) ||
      null
    );
  }
}
