import { Injectable, Logger, OnModuleInit } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  AuthStrategy,
  AuthStrategyConfig,
} from "./interfaces/auth-strategy.interface";

/**
 * Registry for managing authentication strategies
 * Provides centralized strategy registration and lookup
 */
@Injectable()
export class StrategyRegistry implements OnModuleInit {
  private readonly logger = new Logger(StrategyRegistry.name);
  private readonly strategies = new Map<string, AuthStrategy>();

  constructor(private readonly configService: ConfigService) {}

  onModuleInit(): void {
    this.logger.log("Strategy registry initialized");
    this.loadStrategyConfigurations();
  }

  /**
   * Register an authentication strategy
   * @param strategy - The strategy to register
   */
  register(strategy: AuthStrategy): void {
    if (this.strategies.has(strategy.name)) {
      this.logger.warn(
        `Strategy ${strategy.name} is already registered. Overwriting.`,
      );
    }

    if (!strategy.isEnabled) {
      this.logger.log(
        `Strategy ${strategy.name} is disabled and will not be available`,
      );
      return;
    }

    this.strategies.set(strategy.name, strategy);
    this.logger.log(`Registered authentication strategy: ${strategy.name}`);
  }

  /**
   * Unregister an authentication strategy
   * @param name - The name of the strategy to unregister
   */
  unregister(name: string): void {
    if (this.strategies.delete(name)) {
      this.logger.log(`Unregistered authentication strategy: ${name}`);
    }
  }

  /**
   * Get a strategy by name
   * @param name - The strategy name
   * @returns The strategy or undefined if not found
   */
  get(name: string): AuthStrategy | undefined {
    return this.strategies.get(name);
  }

  /**
   * Get all registered strategies
   * @returns Array of all registered strategies
   */
  getAll(): AuthStrategy[] {
    return Array.from(this.strategies.values());
  }

  /**
   * Get all enabled strategy names
   * @returns Array of enabled strategy names
   */
  getEnabledStrategies(): string[] {
    return Array.from(this.strategies.values())
      .filter((s) => s.isEnabled)
      .map((s) => s.name);
  }

  /**
   * Check if a strategy is registered and enabled
   * @param name - The strategy name
   * @returns True if the strategy is available
   */
  has(name: string): boolean {
    const strategy = this.strategies.get(name);
    return strategy?.isEnabled ?? false;
  }

  /**
   * Load strategy configurations from environment
   */
  private loadStrategyConfigurations(): void {
    const configJson = this.configService.get<string>("AUTH_STRATEGIES");
    if (configJson) {
      try {
        const configs: AuthStrategyConfig[] = JSON.parse(configJson);
        this.logger.log(
          `Loaded ${configs.length} strategy configurations from environment`,
        );
      } catch (error) {
        this.logger.error(
          "Failed to parse AUTH_STRATEGIES configuration",
          error,
        );
      }
    }
  }

  /**
   * Clear all registered strategies
   */
  clear(): void {
    this.strategies.clear();
    this.logger.log("All strategies cleared from registry");
  }
}
