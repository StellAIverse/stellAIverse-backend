import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Query,
  Delete,
  Patch,
} from "@nestjs/common";
import { SimulatorService } from "./simulator.service";
import { SimulationConfig } from "./simulation.interface";
import { EnvironmentLoaderService } from "./environment-loader.service";
import { EnvironmentRegistryService } from "./environment-registry.service";
import {
  EnvironmentLoadOptions,
  EnvironmentInitConfig,
  EnvironmentRunConfig,
} from "./environment.interface";

@Controller("simulator")
export class SimulatorController {
  constructor(
    private readonly simulatorService: SimulatorService,
    private readonly environmentLoader: EnvironmentLoaderService,
    private readonly environmentRegistry: EnvironmentRegistryService,
  ) {}

  @Post("initialize")
  @HttpCode(HttpStatus.CREATED)
  async initializeSimulation(@Body() config: SimulationConfig) {
    const simulationId =
      await this.simulatorService.initializeSimulation(config);
    return { simulationId, message: "Simulation initialized successfully" };
  }

  @Post(":id/run")
  @HttpCode(HttpStatus.OK)
  async runSimulation(@Param("id") id: string) {
    const result = await this.simulatorService.runSimulation(id);
    return result;
  }

  @Post(":id/reset")
  @HttpCode(HttpStatus.OK)
  async resetSimulation(@Param("id") id: string) {
    await this.simulatorService.resetSimulation(id);
    return { message: "Simulation reset successfully" };
  }

  @Get(":id/state")
  async getSimulationState(@Param("id") id: string) {
    const state = await this.simulatorService.getSimulationState(id);
    return state;
  }

  @Post("verify-reproducibility")
  @HttpCode(HttpStatus.OK)
  async verifyReproducibility(
    @Body() body: { config: SimulationConfig; runs?: number },
  ) {
    const isReproducible = await this.simulatorService.verifyReproducibility(
      body.config,
      body.runs || 2,
    );
    return {
      reproducible: isReproducible,
      message: isReproducible
        ? "Simulation is reproducible"
        : "Simulation is NOT reproducible",
    };
  }

  // ==================== Environment Management Endpoints ====================

  /**
   * List all available simulation environments
   */
  @Get("environments")
  async listEnvironments() {
    const environments = this.environmentRegistry.listAvailableEnvironments();
    return {
      environments,
      count: environments.length,
    };
  }

  /**
   * Get all versions of a specific environment
   */
  @Get("environments/:id/versions")
  async getEnvironmentVersions(@Param("id") id: string) {
    const versions = this.environmentRegistry.getEnvironmentVersions(id);
    return {
      id,
      versions: versions.map(v => v.metadata),
      count: versions.length,
    };
  }

  /**
   * Load an environment from a file path
   */
  @Post("environments/load")
  @HttpCode(HttpStatus.CREATED)
  async loadEnvironment(@Body() options: EnvironmentLoadOptions) {
    const loadedEnv = await this.environmentLoader.loadFromPath(
      options.path,
      options,
    );
    return {
      message: "Environment loaded successfully",
      environment: loadedEnv.metadata,
      hotReloadEnabled: loadedEnv.hotReloadEnabled,
    };
  }

  /**
   * Load an environment from a remote URL
   */
  @Post("environments/load-remote")
  @HttpCode(HttpStatus.CREATED)
  async loadEnvironmentRemote(@Body() options: EnvironmentLoadOptions) {
    const loadedEnv = await this.environmentLoader.loadFromRemote(options);
    return {
      message: "Environment loaded successfully from remote",
      environment: loadedEnv.metadata,
    };
  }

  /**
   * Load all environments from a directory
   */
  @Post("environments/load-directory")
  @HttpCode(HttpStatus.CREATED)
  async loadEnvironmentsFromDirectory(@Body("path") dirPath: string) {
    const loadedEnvs = await this.environmentLoader.loadFromDirectory(dirPath);
    return {
      message: `Loaded ${loadedEnvs.length} environments`,
      environments: loadedEnvs.map(e => e.metadata),
    };
  }

  /**
   * Unload an environment
   */
  @Delete("environments/:id/:version")
  async unloadEnvironment(
    @Param("id") id: string,
    @Param("version") version: string,
  ) {
    const result = await this.environmentLoader.unloadEnvironment(id, version);
    return {
      message: result
        ? "Environment unloaded successfully"
        : "Environment not found",
      success: result,
    };
  }

  /**
   * Reload an environment (hot-reload)
   */
  @Post("environments/:id/:version/reload")
  async reloadEnvironment(
    @Param("id") id: string,
    @Param("version") version: string,
  ) {
    const reloaded = await this.environmentLoader.reloadEnvironment(id, version);
    return {
      message: "Environment reloaded successfully",
      environment: reloaded.metadata,
    };
  }

  /**
   * Enable hot-reloading for an environment
   */
  @Post("environments/:id/:version/hot-reload/enable")
  async enableHotReload(
    @Param("id") id: string,
    @Param("version") version: string,
    @Body("watchPatterns") watchPatterns?: string[],
  ) {
    this.environmentLoader.enableHotReload(id, version, watchPatterns);
    return {
      message: "Hot-reload enabled",
      environmentId: id,
      version,
    };
  }

  /**
   * Disable hot-reloading for an environment
   */
  @Post("environments/:id/:version/hot-reload/disable")
  async disableHotReload(
    @Param("id") id: string,
    @Param("version") version: string,
  ) {
    this.environmentLoader.disableHotReload(id, version);
    return {
      message: "Hot-reload disabled",
      environmentId: id,
      version,
    };
  }

  // ==================== Environment Instance Endpoints ====================

  /**
   * Create and initialize a new environment instance
   */
  @Post("environments/:id/:version/instances")
  @HttpCode(HttpStatus.CREATED)
  async createInstance(
    @Param("id") id: string,
    @Param("version") version: string,
    @Body() config: EnvironmentInitConfig,
  ) {
    const { instanceId, result } =
      await this.environmentLoader.createAndInitializeInstance(id, version, config);
    return {
      message: result.success
        ? "Instance created and initialized successfully"
        : "Instance creation failed",
      instanceId,
      success: result.success,
      state: result.state,
      warnings: result.warnings,
    };
  }

  /**
   * List all environment instances
   */
  @Get("instances")
  async listInstances(
    @Query("environmentId") environmentId?: string,
    @Query("version") version?: string,
  ) {
    const instances = environmentId
      ? this.environmentRegistry.getInstancesForEnvironment(environmentId, version)
      : this.environmentRegistry.getAllInstances();
    return {
      instances,
      count: instances.length,
    };
  }

  /**
   * Get a specific instance
   */
  @Get("instances/:instanceId")
  async getInstance(@Param("instanceId") instanceId: string) {
    const instance = this.environmentRegistry.getInstance(instanceId);
    if (!instance) {
      return { message: "Instance not found", status: HttpStatus.NOT_FOUND };
    }
    return {
      instance: instance.state,
    };
  }

  /**
   * Run a simulation on an instance
   */
  @Post("instances/:instanceId/run")
  async runInstance(
    @Param("instanceId") instanceId: string,
    @Body() config: EnvironmentRunConfig,
  ) {
    const result = await this.environmentLoader.runSimulation(instanceId, config);
    return {
      message: result.success
        ? "Simulation completed successfully"
        : "Simulation failed",
      result,
    };
  }

  /**
   * Teardown an environment instance
   */
  @Delete("instances/:instanceId")
  async teardownInstance(@Param("instanceId") instanceId: string) {
    const result = await this.environmentLoader.teardownInstance(instanceId);
    return {
      message: "Instance torn down successfully",
      result,
    };
  }

  // ==================== Audit Log Endpoints ====================

  /**
   * Get audit logs
   */
  @Get("audit-logs")
  async getAuditLogs(
    @Query("instanceId") instanceId?: string,
    @Query("environmentId") environmentId?: string,
    @Query("version") version?: string,
    @Query("action") action?: string,
    @Query("limit") limit?: number,
  ) {
    const logs = this.environmentLoader.getAuditLogs({
      instanceId,
      environmentId,
      version,
      action,
      limit: limit ? parseInt(limit as any, 10) : undefined,
    });
    return {
      logs,
      count: logs.length,
    };
  }

  /**
   * Get audit logs for a specific instance
   */
  @Get("instances/:instanceId/audit-logs")
  async getInstanceAuditLogs(
    @Param("instanceId") instanceId: string,
    @Query("limit") limit?: number,
  ) {
    const logs = this.environmentLoader.getAuditLogs({
      instanceId,
      limit: limit ? parseInt(limit as any, 10) : undefined,
    });
    return {
      instanceId,
      logs,
      count: logs.length,
    };
  }

  /**
   * Export all audit logs
   */
  @Get("audit-logs/export")
  async exportAuditLogs() {
    const logs = this.environmentRegistry.exportAuditLog();
    return {
      data: logs,
      format: "json",
    };
  }

  // ==================== Statistics Endpoints ====================

  /**
   * Get environment and instance statistics
   */
  @Get("statistics")
  async getStatistics() {
    const stats = this.environmentRegistry.getStatistics();
    return {
      statistics: stats,
    };
  }
}
