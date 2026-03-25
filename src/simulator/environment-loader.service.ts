import { Injectable, Logger } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import { EventEmitter } from 'events';
import {
  ISimulationEnvironment,
  EnvironmentMetadata,
  LoadedEnvironment,
  EnvironmentLoadOptions,
  EnvironmentFactory,
  EnvironmentInitConfig,
  EnvironmentRunConfig,
  EnvironmentInitResult,
  EnvironmentRunResult,
  EnvironmentTeardownResult,
  EnvironmentInstanceState,
  EnvironmentStatus,
  AuditLogEntry,
} from './environment.interface';
import { EnvironmentRegistryService } from './environment-registry.service';

/**
 * Service for dynamically loading and managing simulation environments
 * 
 * Features:
 * - Dynamic loading from disk or remote sources
 * - Hot-reloading without restarting the backend
 * - Version tracking and enforcement
 * - Isolation and auditability
 */
@Injectable()
export class EnvironmentLoaderService extends EventEmitter {
  private readonly logger = new Logger(EnvironmentLoaderService.name);
  
  /** Map of file paths to their watch handles */
  private watchers = new Map<string, ReturnType<typeof setInterval>>();
  
  /** Map of file paths to their last known hash */
  private fileHashes = new Map<string, string>();
  
  /** Base directory for environment modules */
  private environmentsDir: string;

  constructor(private readonly registry: EnvironmentRegistryService) {
    super();
    this.environmentsDir = process.env.SIMULATION_ENV_DIR || './simulation-environments';
  }

  /**
   * Load an environment from a file path
   */
  async loadFromPath(
    filePath: string,
    options: Omit<EnvironmentLoadOptions, 'path'> = {},
  ): Promise<LoadedEnvironment> {
    this.logger.log(`Loading environment from: ${filePath}`);

    try {
      // Resolve absolute path
      const absolutePath = path.resolve(filePath);
      
      // Check if file exists
      await fs.access(absolutePath);
      
      // Calculate file hash for change detection
      const hash = await this.calculateFileHash(absolutePath);
      
      // Clear require cache to enable reloading
      this.clearRequireCache(absolutePath);
      
      // Dynamically import the module
      const module = await import(absolutePath);
      
      // Extract factory function
      const factory = module.default || module.createEnvironment || module.environmentFactory;
      
      if (typeof factory !== 'function') {
        throw new Error(`Module at ${filePath} does not export a valid environment factory`);
      }

      // Create instance to get metadata
      const tempInstance = factory();
      const metadata = tempInstance.getMetadata();
      
      // Validate metadata
      this.validateMetadata(metadata);

      const loadedEnv: LoadedEnvironment = {
        path: absolutePath,
        factory: factory as EnvironmentFactory,
        metadata,
        loadedAt: new Date(),
        hash,
        hotReloadEnabled: options.hotReload ?? false,
      };

      // Register with registry
      this.registry.registerEnvironment(loadedEnv);

      // Setup hot-reloading if enabled
      if (options.hotReload) {
        this.setupHotReload(absolutePath, options);
      }

      this.emit('environmentLoaded', loadedEnv);
      this.logger.log(`Successfully loaded environment: ${metadata.name} v${metadata.version}`);

      return loadedEnv;
    } catch (error) {
      this.logger.error(`Failed to load environment from ${filePath}:`, error);
      throw new Error(`Failed to load environment: ${error.message}`);
    }
  }

  /**
   * Load an environment from a remote URL
   */
  async loadFromRemote(options: EnvironmentLoadOptions): Promise<LoadedEnvironment> {
    if (!options.remoteUrl) {
      throw new Error('Remote URL is required');
    }

    this.logger.log(`Loading environment from remote: ${options.remoteUrl}`);

    try {
      // Download the module
      const response = await fetch(options.remoteUrl, {
        headers: options.authToken ? { 'Authorization': `Bearer ${options.authToken}` } : {},
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const code = await response.text();
      
      // Save to temporary file
      const tempDir = path.join(process.cwd(), 'temp', 'environments');
      await fs.mkdir(tempDir, { recursive: true });
      
      const fileName = `remote-env-${Date.now()}.js`;
      const tempPath = path.join(tempDir, fileName);
      
      await fs.writeFile(tempPath, code, 'utf-8');

      // Load from the temp file
      return this.loadFromPath(tempPath, { ...options, hotReload: false });
    } catch (error) {
      this.logger.error(`Failed to load environment from remote:`, error);
      throw new Error(`Failed to load remote environment: ${error.message}`);
    }
  }

  /**
   * Load all environments from a directory
   */
  async loadFromDirectory(dirPath: string): Promise<LoadedEnvironment[]> {
    this.logger.log(`Loading environments from directory: ${dirPath}`);

    const loaded: LoadedEnvironment[] = [];
    
    try {
      const entries = await fs.readdir(dirPath, { withFileTypes: true });
      
      for (const entry of entries) {
        if (entry.isFile() && (entry.name.endsWith('.js') || entry.name.endsWith('.ts'))) {
          try {
            const env = await this.loadFromPath(path.join(dirPath, entry.name));
            loaded.push(env);
          } catch (error) {
            this.logger.warn(`Skipping invalid environment file ${entry.name}:`, error.message);
          }
        }
      }
    } catch (error) {
      this.logger.error(`Failed to read directory ${dirPath}:`, error);
      throw error;
    }

    this.logger.log(`Loaded ${loaded.length} environments from ${dirPath}`);
    return loaded;
  }

  /**
   * Unload an environment
   */
  async unloadEnvironment(id: string, version: string): Promise<boolean> {
    const key = `${id}@${version}`;
    
    // Stop any watchers
    const env = this.registry.getEnvironment(id, version);
    if (env && this.watchers.has(env.path)) {
      clearInterval(this.watchers.get(env.path));
      this.watchers.delete(env.path);
      this.fileHashes.delete(env.path);
    }

    // Teardown any active instances
    const instances = this.registry.getInstancesForEnvironment(id, version);
    for (const instance of instances) {
      try {
        const fullInstance = this.registry.getInstance(instance.instanceId);
        if (fullInstance) {
          await fullInstance.environment.teardown();
          this.registry.removeInstance(instance.instanceId);
        }
      } catch (error) {
        this.logger.error(`Error tearing down instance ${instance.instanceId}:`, error);
      }
    }

    const result = this.registry.unregisterEnvironment(id, version);
    
    if (result) {
      this.emit('environmentUnloaded', { id, version });
      this.logger.log(`Unloaded environment: ${id} v${version}`);
    }

    return result;
  }

  /**
   * Reload an environment (hot-reload)
   */
  async reloadEnvironment(id: string, version: string): Promise<LoadedEnvironment> {
    this.logger.log(`Reloading environment: ${id} v${version}`);

    const existing = this.registry.getEnvironment(id, version);
    if (!existing) {
      throw new Error(`Environment ${id} v${version} not found`);
    }

    // Store hot-reload setting
    const hadHotReload = existing.hotReloadEnabled;

    // Unload existing
    await this.unloadEnvironment(id, version);

    // Reload from path
    const reloaded = await this.loadFromPath(existing.path, {
      hotReload: hadHotReload,
    });

    this.emit('environmentReloaded', reloaded);
    this.logger.log(`Successfully reloaded environment: ${id} v${version}`);

    return reloaded;
  }

  /**
   * Enable hot-reloading for an environment
   */
  enableHotReload(id: string, version: string, watchPatterns?: string[]): void {
    const env = this.registry.getEnvironment(id, version);
    if (!env) {
      throw new Error(`Environment ${id} v${version} not found`);
    }

    this.setupHotReload(env.path, { watchPatterns });
    
    // Update the loaded environment
    const updatedEnv = { ...env, hotReloadEnabled: true };
    this.registry.registerEnvironment(updatedEnv);
  }

  /**
   * Disable hot-reloading for an environment
   */
  disableHotReload(id: string, version: string): void {
    const env = this.registry.getEnvironment(id, version);
    if (!env) {
      throw new Error(`Environment ${id} v${version} not found`);
    }

    const watcher = this.watchers.get(env.path);
    if (watcher) {
      clearInterval(watcher);
      this.watchers.delete(env.path);
    }

    // Update the loaded environment
    const updatedEnv = { ...env, hotReloadEnabled: false };
    this.registry.registerEnvironment(updatedEnv);
  }

  /**
   * Create and initialize a new environment instance
   */
  async createAndInitializeInstance(
    environmentId: string,
    version: string,
    config: EnvironmentInitConfig,
  ): Promise<{ instanceId: string; result: EnvironmentInitResult }> {
    // Create instance
    const { instanceId, environment } = await this.registry.createInstance(environmentId, version);

    // Update status
    this.registry.updateInstanceState(instanceId, { 
      status: EnvironmentStatus.INITIALIZING,
      config,
    });

    try {
      // Initialize the environment
      const result = await environment.init(config);

      // Update status based on result
      const newStatus = result.success ? EnvironmentStatus.READY : EnvironmentStatus.ERROR;
      this.registry.updateInstanceState(instanceId, { 
        status: newStatus,
        state: result.state,
      });

      // Add audit entry
      this.registry.addAuditEntry({
        instanceId,
        environmentId,
        version,
        action: 'init',
        input: config,
        output: result,
        actor: 'system',
      });

      return { instanceId, result };
    } catch (error) {
      // Update status to error
      this.registry.updateInstanceState(instanceId, { status: EnvironmentStatus.ERROR });

      // Add audit entry for error
      this.registry.addAuditEntry({
        instanceId,
        environmentId,
        version,
        action: 'error',
        input: config,
        error: error.message,
        actor: 'system',
      });

      throw error;
    }
  }

  /**
   * Run a simulation on an initialized instance
   */
  async runSimulation(
    instanceId: string,
    config: EnvironmentRunConfig,
  ): Promise<EnvironmentRunResult> {
    const instance = this.registry.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    const { environment, state } = instance;

    if (state.status !== EnvironmentStatus.READY && state.status !== EnvironmentStatus.PAUSED) {
      throw new Error(`Instance ${instanceId} is not ready to run (status: ${state.status})`);
    }

    // Update status
    this.registry.updateInstanceState(instanceId, { status: EnvironmentStatus.RUNNING });

    try {
      // Run the simulation
      const result = await environment.run(config);

      // Update status based on result
      const newStatus = result.success ? EnvironmentStatus.COMPLETED : EnvironmentStatus.ERROR;
      this.registry.updateInstanceState(instanceId, { 
        status: newStatus,
        state: result.finalState,
        currentStep: result.steps,
      });

      // Add audit entry
      this.registry.addAuditEntry({
        instanceId,
        environmentId: state.metadata.id,
        version: state.metadata.version,
        action: 'run',
        input: config,
        output: result,
        actor: 'system',
      });

      return result;
    } catch (error) {
      // Update status to error
      this.registry.updateInstanceState(instanceId, { status: EnvironmentStatus.ERROR });

      // Add audit entry for error
      this.registry.addAuditEntry({
        instanceId,
        environmentId: state.metadata.id,
        version: state.metadata.version,
        action: 'error',
        input: config,
        error: error.message,
        actor: 'system',
      });

      throw error;
    }
  }

  /**
   * Teardown an environment instance
   */
  async teardownInstance(instanceId: string): Promise<EnvironmentTeardownResult> {
    const instance = this.registry.getInstance(instanceId);
    if (!instance) {
      throw new Error(`Instance ${instanceId} not found`);
    }

    const { environment, state } = instance;

    // Update status
    this.registry.updateInstanceState(instanceId, { status: EnvironmentStatus.TEARING_DOWN });

    try {
      const result = await environment.teardown();

      // Update status
      this.registry.updateInstanceState(instanceId, { status: EnvironmentStatus.DESTROYED });

      // Add audit entry
      this.registry.addAuditEntry({
        instanceId,
        environmentId: state.metadata.id,
        version: state.metadata.version,
        action: 'teardown',
        output: result,
        actor: 'system',
      });

      // Remove from registry
      this.registry.removeInstance(instanceId);

      return result;
    } catch (error) {
      // Update status to error
      this.registry.updateInstanceState(instanceId, { status: EnvironmentStatus.ERROR });

      // Add audit entry for error
      this.registry.addAuditEntry({
        instanceId,
        environmentId: state.metadata.id,
        version: state.metadata.version,
        action: 'error',
        error: error.message,
        actor: 'system',
      });

      throw error;
    }
  }

  /**
   * Get audit logs for an instance or environment
   */
  getAuditLogs(options?: Parameters<EnvironmentRegistryService['getAuditLog']>[0]): AuditLogEntry[] {
    return this.registry.getAuditLog(options);
  }

  /**
   * Calculate file hash for change detection
   */
  private async calculateFileHash(filePath: string): Promise<string> {
    const content = await fs.readFile(filePath, 'utf-8');
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Setup hot-reload watching for a file
   */
  private setupHotReload(filePath: string, options: EnvironmentLoadOptions): void {
    // Clear existing watcher
    if (this.watchers.has(filePath)) {
      clearInterval(this.watchers.get(filePath));
    }

    // Setup polling-based watcher (more reliable than fs.watch for network drives)
    const interval = setInterval(async () => {
      try {
        const newHash = await this.calculateFileHash(filePath);
        const oldHash = this.fileHashes.get(filePath);

        if (oldHash && oldHash !== newHash) {
          this.logger.log(`File changed detected: ${filePath}`);
          
          // Find the environment
          for (const env of this.registry.getAllEnvironments()) {
            if (env.path === filePath) {
              try {
                await this.reloadEnvironment(env.metadata.id, env.metadata.version);
                this.emit('hotReload', env);
              } catch (error) {
                this.logger.error(`Hot-reload failed for ${env.metadata.id}:`, error);
              }
              break;
            }
          }
        }

        this.fileHashes.set(filePath, newHash);
      } catch (error) {
        this.logger.error(`Error watching file ${filePath}:`, error);
      }
    }, 1000); // Check every second

    this.watchers.set(filePath, interval);
    this.logger.log(`Hot-reload enabled for: ${filePath}`);
  }

  /**
   * Clear Node.js require cache for a module
   */
  private clearRequireCache(modulePath: string): void {
    const resolvedPath = require.resolve(modulePath);
    
    // Remove from cache
    if (require.cache[resolvedPath]) {
      delete require.cache[resolvedPath];
    }

    // Also clear any children
    for (const key in require.cache) {
      if (require.cache[key]?.children?.some(c => c.id === resolvedPath)) {
        delete require.cache[key];
      }
    }
  }

  /**
   * Validate environment metadata
   */
  private validateMetadata(metadata: EnvironmentMetadata): void {
    if (!metadata.id) {
      throw new Error('Environment metadata must include an id');
    }
    if (!metadata.name) {
      throw new Error('Environment metadata must include a name');
    }
    if (!metadata.version) {
      throw new Error('Environment metadata must include a version');
    }
    
    // Validate semantic version format
    const versionRegex = /^\d+\.\d+\.\d+$/;
    if (!versionRegex.test(metadata.version)) {
      throw new Error(`Invalid version format: ${metadata.version}. Expected: x.x.x`);
    }
  }

  /**
   * Cleanup on destroy
   */
  onModuleDestroy(): void {
    // Clear all watchers
    for (const [path, watcher] of this.watchers) {
      clearInterval(watcher);
      this.logger.log(`Stopped watching: ${path}`);
    }
    this.watchers.clear();
  }
}
