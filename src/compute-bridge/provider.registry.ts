import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ModuleRef } from "@nestjs/core";
import {
  IAIProvider,
  AIProviderType,
  IProviderConfig,
} from "./provider.interface";

/**
 * Provider metadata for registration
 */
export interface ProviderMetadata {
  type: AIProviderType;
  providerClass: new (...args: any[]) => IAIProvider;
  config?: IProviderConfig;
}

/**
 * Provider Registry Service
 *
 * Central registry for managing AI provider plugins.
 * Supports dynamic registration, lookup, and lifecycle management.
 */
@Injectable()
export class ProviderRegistry implements OnModuleInit {
  private readonly logger = new Logger(ProviderRegistry.name);
  private readonly providers = new Map<AIProviderType, IAIProvider>();
  private readonly metadata = new Map<AIProviderType, ProviderMetadata>();

  constructor(private readonly moduleRef: ModuleRef) {}

  async onModuleInit() {
    this.logger.log("Provider registry initialized");
  }

  /**
   * Register a provider instance
   */
  async register(
    type: AIProviderType,
    provider: IAIProvider,
    config: IProviderConfig,
  ): Promise<void> {
    if (this.providers.has(type)) {
      throw new Error(`Provider ${type} is already registered`);
    }

    await provider.initialize(config);
    this.providers.set(type, provider);
    this.logger.log(`Registered provider: ${type}`);
  }

  /**
   * Register a provider class for lazy instantiation
   */
  registerClass(metadata: ProviderMetadata): void {
    if (this.metadata.has(metadata.type)) {
      throw new Error(`Provider class ${metadata.type} is already registered`);
    }

    this.metadata.set(metadata.type, metadata);
    this.logger.log(`Registered provider class: ${metadata.type}`);
  }

  /**
   * Get a provider by type (lazy instantiation if needed)
   */
  async get(type: AIProviderType): Promise<IAIProvider | undefined> {
    if (this.providers.has(type)) {
      return this.providers.get(type);
    }

    const meta = this.metadata.get(type);
    if (meta && meta.config) {
      const instance = new meta.providerClass();
      await this.register(type, instance, meta.config);
      return instance;
    }

    return undefined;
  }

  /**
   * Check if a provider is registered
   */
  has(type: AIProviderType): boolean {
    return this.providers.has(type) || this.metadata.has(type);
  }

  /**
   * List all registered provider types
   */
  list(): AIProviderType[] {
    const types = new Set<AIProviderType>();
    this.providers.forEach((_, key) => types.add(key));
    this.metadata.forEach((_, key) => types.add(key));
    return Array.from(types);
  }

  /**
   * Unregister a provider
   */
  unregister(type: AIProviderType): boolean {
    const removed = this.providers.delete(type);
    this.metadata.delete(type);
    if (removed) {
      this.logger.log(`Unregistered provider: ${type}`);
    }
    return removed;
  }

  /**
   * Get provider metadata
   */
  getMetadata(type: AIProviderType): ProviderMetadata | undefined {
    return this.metadata.get(type);
  }
}
