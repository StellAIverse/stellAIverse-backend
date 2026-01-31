import { Injectable, Logger } from '@nestjs/common';
import { SimulationConfig, EnvironmentType } from '../interfaces/simulation.interface';
import * as seedrandom from 'seedrandom';

@Injectable()
export class EnvironmentConfigService {
  private readonly logger = new Logger(EnvironmentConfigService.name);
  private currentConfig: SimulationConfig | null = null;
  private rng: seedrandom.PRNG | null = null;

  /**
   * Configure the environment with deterministic settings
   */
  async configure(config: SimulationConfig): Promise<void> {
    this.currentConfig = config;
    
    // Initialize deterministic random number generator
    this.rng = seedrandom(config.seed.toString());
    
    // Override Math.random for deterministic behavior
    this.injectDeterministicRandom();
    
    // Override Date.now for deterministic timestamps
    this.injectDeterministicTime();
    
    this.logger.log(`Environment configured with seed: ${config.seed}`);
  }

  /**
   * Get current environment configuration
   */
  getConfig(): SimulationConfig {
    if (!this.currentConfig) {
      throw new Error('Environment not configured');
    }
    return this.currentConfig;
  }

  /**
   * Get deterministic random number
   */
  random(): number {
    if (!this.rng) {
      throw new Error('RNG not initialized');
    }
    return this.rng();
  }

  /**
   * Get deterministic random integer between min and max (inclusive)
   */
  randomInt(min: number, max: number): number {
    return Math.floor(this.random() * (max - min + 1)) + min;
  }

  /**
   * Get deterministic random element from array
   */
  randomChoice<T>(array: T[]): T {
    return array[this.randomInt(0, array.length - 1)];
  }

  /**
   * Inject deterministic random number generator
   */
  private injectDeterministicRandom(): void {
    const originalRandom = Math.random;
    const rng = this.rng;
    
    // Store original for potential restoration
    (Math as any)._originalRandom = originalRandom;
    
    // Override Math.random
    Math.random = function () {
      if (!rng) {
        throw new Error('Deterministic RNG not initialized');
      }
      return rng();
    };
  }

  /**
   * Inject deterministic time function
   */
  private injectDeterministicTime(): void {
    let simulatedTime = new Date('2024-01-01T00:00:00Z').getTime();
    const timeScale = this.currentConfig?.timeScale || 1;
    
    // Store original
    (Date as any)._originalNow = Date.now;
    
    // Override Date.now
    Date.now = function () {
      simulatedTime += 1000 * timeScale; // Advance by 1 second * timeScale
      return simulatedTime;
    };
  }

  /**
   * Restore original random and time functions (for cleanup)
   */
  restore(): void {
    if ((Math as any)._originalRandom) {
      Math.random = (Math as any)._originalRandom;
    }
    if ((Date as any)._originalNow) {
      Date.now = (Date as any)._originalNow;
    }
    this.logger.log('Environment restored to original state');
  }

  /**
   * Get environment-specific parameters
   */
  getEnvironmentParameter(key: string): any {
    return this.currentConfig?.environment.parameters[key];
  }

  /**
   * Check if simulation mode is active
   */
  isSimulationMode(): boolean {
    return this.currentConfig !== null;
  }
}