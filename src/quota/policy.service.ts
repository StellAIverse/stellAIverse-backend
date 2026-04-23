import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource } from "typeorm";
import { QuotaPolicy, PolicyScope, PolicyStatus } from "./policy.entity";

@Injectable()
export class PolicyService {
  private readonly logger = new Logger(PolicyService.name);
  private policyCache: Map<string, QuotaPolicy[]> = new Map();
  private lastCacheUpdate: number = 0;
  private readonly CACHE_TTL = 60000; // 1 minute

  constructor(
    @InjectRepository(QuotaPolicy)
    private readonly policyRepository: Repository<QuotaPolicy>,
    private readonly dataSource: DataSource,
  ) {}

  async createPolicy(data: Partial<QuotaPolicy>): Promise<QuotaPolicy> {
    const policy = this.policyRepository.create(data);
    const saved = await this.policyRepository.save(policy);
    await this.refreshCache();
    return saved;
  }

  async updatePolicy(id: string, data: Partial<QuotaPolicy>): Promise<QuotaPolicy> {
    const policy = await this.policyRepository.findOne({ where: { id } });
    if (!policy) throw new NotFoundException(`Policy ${id} not found`);
    
    Object.assign(policy, data);
    policy.version += 1;
    const saved = await this.policyRepository.save(policy);
    await this.refreshCache();
    return saved;
  }

  async deletePolicy(id: string): Promise<void> {
    const result = await this.policyRepository.delete(id);
    if (result.affected === 0) throw new NotFoundException(`Policy ${id} not found`);
    await this.refreshCache();
  }

  async listPolicies(): Promise<QuotaPolicy[]> {
    return this.policyRepository.find({ order: { priority: "DESC" } });
  }

  async getApplicablePolicy(
    userId: string,
    scope: PolicyScope,
    targetId?: string,
    context: { tier?: string; segment?: string; region?: string } = {},
  ): Promise<QuotaPolicy | null> {
    const policies = await this.getCachedPolicies();
    
    // Resolution logic:
    // 1. Filter by status ACTIVE
    // 2. Check time-based availability
    // 3. Check targeting (segment, tier, region)
    // 4. Sort by priority
    // 5. Hierarchical fallback: USER -> GROUP -> AGENT -> GLOBAL

    const now = new Date();
    const currentHour = now.getHours();
    const currentDay = now.getDay();

    const filtered = policies.filter(p => {
      if (p.status !== PolicyStatus.ACTIVE) return false;
      
      // Time-based check
      if (p.timeWindow) {
        const { startHour, endHour, daysOfWeek } = p.timeWindow;
        if (startHour !== undefined && currentHour < startHour) return false;
        if (endHour !== undefined && currentHour > endHour) return false;
        if (daysOfWeek && !daysOfWeek.includes(currentDay)) return false;
      }

      // Targeting check
      if (p.targeting) {
        const { userSegments, userTiers, regions } = p.targeting;
        if (userSegments && context.segment && !userSegments.includes(context.segment)) return false;
        if (userTiers && context.tier && !userTiers.includes(context.tier)) return false;
        if (regions && context.region && !regions.includes(context.region)) return false;
      }

      return true;
    });

    // Try to find the most specific policy
    // Hierarchy: USER (specific) -> GROUP (if user belongs) -> GLOBAL
    
    // 1. Check for USER policy
    const userPolicy = filtered.find(p => p.scope === PolicyScope.USER && p.targetId === userId);
    if (userPolicy) return userPolicy;

    // 2. Check for specific scope/target (e.g. AGENT, ENDPOINT)
    if (targetId) {
      const specificPolicy = filtered.find(p => p.scope === scope && p.targetId === targetId);
      if (specificPolicy) return specificPolicy;
    }

    // 3. Check for GLOBAL policy
    const globalPolicy = filtered.find(p => p.scope === PolicyScope.GLOBAL);
    return globalPolicy || null;
  }

  private async getCachedPolicies(): Promise<QuotaPolicy[]> {
    const now = Date.now();
    if (now - this.lastCacheUpdate > this.CACHE_TTL || !this.policyCache.has("all")) {
      await this.refreshCache();
    }
    return this.policyCache.get("all") || [];
  }

  private async refreshCache() {
    const policies = await this.policyRepository.find({
      where: { status: PolicyStatus.ACTIVE },
      order: { priority: "DESC" },
    });
    this.policyCache.set("all", policies);
    this.lastCacheUpdate = Date.now();
    this.logger.log(`Policy cache refreshed: ${policies.length} active policies`);
  }
}
