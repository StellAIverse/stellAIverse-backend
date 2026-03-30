import { Injectable, Logger, OnModuleDestroy } from "@nestjs/common";
import {
  ISimulationEnvironment,
  EnvironmentMetadata,
  LoadedEnvironment,
  EnvironmentInstanceState,
  EnvironmentStatus,
  AuditLogEntry,
} from "./environment.interface";

/**
 * Service for managing registered simulation environments and their instances
 *
 * Handles:
 * - Environment registration and versioning
 * - Instance lifecycle management
 * - Audit logging
 * - Parallel version execution
 */
@Injectable()
export class EnvironmentRegistryService implements OnModuleDestroy {
  private readonly logger = new Logger(EnvironmentRegistryService.name);

  /** Map of environment ID + version -> LoadedEnvironment */
  private environments = new Map<string, LoadedEnvironment>();

  /** Map of instance ID -> EnvironmentInstanceState and instance */
  private instances = new Map<
    string,
    {
      state: EnvironmentInstanceState;
      environment: ISimulationEnvironment;
    }
  >();

  /** Audit log for all environment activities */
  private auditLog: AuditLogEntry[] = [];

  /** Counter for generating instance IDs */
  private instanceCounter = 0;

  /**
   * Register a loaded environment
   */
  registerEnvironment(loadedEnv: LoadedEnvironment): void {
    const key = this.getEnvironmentKey(
      loadedEnv.metadata.id,
      loadedEnv.metadata.version,
    );

    if (this.environments.has(key)) {
      this.logger.warn(`Environment ${key} already registered. Overwriting.`);
    }

    this.environments.set(key, loadedEnv);
    this.logger.log(
      `Registered environment: ${loadedEnv.metadata.name} v${loadedEnv.metadata.version}`,
    );
  }

  /**
   * Unregister an environment
   */
  unregisterEnvironment(id: string, version: string): boolean {
    const key = this.getEnvironmentKey(id, version);
    const existed = this.environments.delete(key);

    if (existed) {
      this.logger.log(`Unregistered environment: ${id} v${version}`);
    }

    return existed;
  }

  /**
   * Get a registered environment
   */
  getEnvironment(id: string, version: string): LoadedEnvironment | undefined {
    const key = this.getEnvironmentKey(id, version);
    return this.environments.get(key);
  }

  /**
   * Get all registered environments
   */
  getAllEnvironments(): LoadedEnvironment[] {
    return Array.from(this.environments.values());
  }

  /**
   * Get all versions of a specific environment
   */
  getEnvironmentVersions(id: string): LoadedEnvironment[] {
    return this.getAllEnvironments().filter((env) => env.metadata.id === id);
  }

  /**
   * List available environments (latest version of each)
   */
  listAvailableEnvironments(): EnvironmentMetadata[] {
    const latestVersions = new Map<string, LoadedEnvironment>();

    for (const env of this.environments.values()) {
      const existing = latestVersions.get(env.metadata.id);
      if (
        !existing ||
        this.compareVersions(env.metadata.version, existing.metadata.version) >
          0
      ) {
        latestVersions.set(env.metadata.id, env);
      }
    }

    return Array.from(latestVersions.values()).map((env) => env.metadata);
  }

  /**
   * Create a new environment instance
   */
  async createInstance(
    environmentId: string,
    version: string,
  ): Promise<{ instanceId: string; environment: ISimulationEnvironment }> {
    const loadedEnv = this.getEnvironment(environmentId, version);

    if (!loadedEnv) {
      throw new Error(`Environment ${environmentId} v${version} not found`);
    }

    const instanceId = this.generateInstanceId();
    const environment = loadedEnv.factory();

    const instanceState: EnvironmentInstanceState = {
      instanceId,
      metadata: loadedEnv.metadata,
      status: EnvironmentStatus.UNINITIALIZED,
      createdAt: new Date(),
      lastActivityAt: new Date(),
    };

    this.instances.set(instanceId, { state: instanceState, environment });

    this.logger.log(
      `Created instance ${instanceId} for environment ${environmentId} v${version}`,
    );

    return { instanceId, environment };
  }

  /**
   * Get an instance by ID
   */
  getInstance(
    instanceId: string,
  ):
    | { state: EnvironmentInstanceState; environment: ISimulationEnvironment }
    | undefined {
    return this.instances.get(instanceId);
  }

  /**
   * Update instance state
   */
  updateInstanceState(
    instanceId: string,
    updates: Partial<EnvironmentInstanceState>,
  ): void {
    const instance = this.instances.get(instanceId);
    if (instance) {
      Object.assign(instance.state, updates);
      instance.state.lastActivityAt = new Date();
    }
  }

  /**
   * Remove an instance
   */
  removeInstance(instanceId: string): boolean {
    const existed = this.instances.delete(instanceId);
    if (existed) {
      this.logger.log(`Removed instance: ${instanceId}`);
    }
    return existed;
  }

  /**
   * Get all active instances
   */
  getAllInstances(): EnvironmentInstanceState[] {
    return Array.from(this.instances.values()).map((i) => i.state);
  }

  /**
   * Get instances for a specific environment
   */
  getInstancesForEnvironment(
    environmentId: string,
    version?: string,
  ): EnvironmentInstanceState[] {
    return this.getAllInstances().filter((instance) => {
      if (instance.metadata.id !== environmentId) return false;
      if (version && instance.metadata.version !== version) return false;
      return true;
    });
  }

  /**
   * Add audit log entry
   */
  addAuditEntry(entry: Omit<AuditLogEntry, "id" | "timestamp">): void {
    const fullEntry: AuditLogEntry = {
      ...entry,
      id: this.generateAuditId(),
      timestamp: Date.now(),
    };

    this.auditLog.push(fullEntry);
    this.logger.debug(
      `Audit: ${entry.action} on ${entry.environmentId} v${entry.version}`,
    );
  }

  /**
   * Get audit log entries
   */
  getAuditLog(options?: {
    instanceId?: string;
    environmentId?: string;
    version?: string;
    action?: string;
    startTime?: number;
    endTime?: number;
    limit?: number;
  }): AuditLogEntry[] {
    let entries = [...this.auditLog];

    if (options?.instanceId) {
      entries = entries.filter((e) => e.instanceId === options.instanceId);
    }
    if (options?.environmentId) {
      entries = entries.filter(
        (e) => e.environmentId === options.environmentId,
      );
    }
    if (options?.version) {
      entries = entries.filter((e) => e.version === options.version);
    }
    if (options?.action) {
      entries = entries.filter((e) => e.action === options.action);
    }
    if (options?.startTime) {
      entries = entries.filter((e) => e.timestamp >= options.startTime!);
    }
    if (options?.endTime) {
      entries = entries.filter((e) => e.timestamp <= options.endTime!);
    }

    // Sort by timestamp descending (newest first)
    entries.sort((a, b) => b.timestamp - a.timestamp);

    if (options?.limit) {
      entries = entries.slice(0, options.limit);
    }

    return entries;
  }

  /**
   * Export audit log as JSON
   */
  exportAuditLog(): string {
    return JSON.stringify(this.auditLog, null, 2);
  }

  /**
   * Clear audit log (use with caution)
   */
  clearAuditLog(): void {
    this.auditLog = [];
    this.logger.warn("Audit log cleared");
  }

  /**
   * Get statistics about environments and instances
   */
  getStatistics(): {
    totalEnvironments: number;
    totalInstances: number;
    instancesByStatus: Record<string, number>;
    auditLogEntries: number;
  } {
    const instancesByStatus: Record<string, number> = {};

    for (const instance of this.instances.values()) {
      const status = instance.state.status;
      instancesByStatus[status] = (instancesByStatus[status] || 0) + 1;
    }

    return {
      totalEnvironments: this.environments.size,
      totalInstances: this.instances.size,
      instancesByStatus,
      auditLogEntries: this.auditLog.length,
    };
  }

  /**
   * Cleanup on module destroy
   */
  async onModuleDestroy(): Promise<void> {
    this.logger.log("Cleaning up environment registry...");

    // Teardown all active instances
    for (const [instanceId, { environment, state }] of this.instances) {
      try {
        if (
          state.status !== EnvironmentStatus.DESTROYED &&
          state.status !== EnvironmentStatus.TEARING_DOWN
        ) {
          this.logger.log(`Tearing down instance: ${instanceId}`);
          await environment.teardown();
        }
      } catch (error) {
        this.logger.error(`Error tearing down instance ${instanceId}:`, error);
      }
    }

    this.instances.clear();
    this.environments.clear();
  }

  /**
   * Generate a unique instance ID
   */
  private generateInstanceId(): string {
    return `env-instance-${Date.now()}-${++this.instanceCounter}`;
  }

  /**
   * Generate a unique audit entry ID
   */
  private generateAuditId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get the storage key for an environment
   */
  private getEnvironmentKey(id: string, version: string): string {
    return `${id}@${version}`;
  }

  /**
   * Compare semantic versions
   * @returns positive if v1 > v2, negative if v1 < v2, 0 if equal
   */
  private compareVersions(v1: string, v2: string): number {
    const parts1 = v1.split(".").map(Number);
    const parts2 = v2.split(".").map(Number);

    for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
      const p1 = parts1[i] || 0;
      const p2 = parts2[i] || 0;

      if (p1 > p2) return 1;
      if (p1 < p2) return -1;
    }

    return 0;
  }
}
