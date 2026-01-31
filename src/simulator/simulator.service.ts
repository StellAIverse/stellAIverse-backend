import { Injectable, Logger } from '@nestjs/common';
import { EnvironmentConfigService } from './config/environment-config.service';
import { SimulationStateManager } from './state/simulation-state.manager';
import { AgentExecutor } from './executors/agent.executor';
import { SimulationConfig, SimulationResult } from './interfaces/simulation.interface';
import { MockProviderFactory } from './providers/mock-provider.factory';

@Injectable()
export class SimulatorService {
  private readonly logger = new Logger(SimulatorService.name);

  constructor(
    private readonly envConfig: EnvironmentConfigService,
    private readonly stateManager: SimulationStateManager,
    private readonly agentExecutor: AgentExecutor,
    private readonly mockProviderFactory: MockProviderFactory,
  ) {}

  /**
   * Initialize a new simulation environment with given configuration
   */
  async initializeSimulation(config: SimulationConfig): Promise<string> {
    this.logger.log(`Initializing simulation with seed: ${config.seed}`);

    // Set up deterministic environment
    await this.envConfig.configure(config);
    
    // Initialize mock providers with seed
    await this.mockProviderFactory.initializeProviders(config.seed);
    
    // Create new simulation state
    const simulationId = await this.stateManager.createSimulation(config);
    
    this.logger.log(`Simulation ${simulationId} initialized successfully`);
    return simulationId;
  }

  /**
   * Run a simulation to completion or until max steps reached
   */
  async runSimulation(simulationId: string): Promise<SimulationResult> {
    this.logger.log(`Starting simulation: ${simulationId}`);

    const state = await this.stateManager.getSimulation(simulationId);
    if (!state) {
      throw new Error(`Simulation ${simulationId} not found`);
    }

    const startTime = Date.now();
    let stepCount = 0;
    const maxSteps = state.config.maxSteps || 1000;

    while (stepCount < maxSteps && !state.completed) {
      // Execute one simulation step
      const stepResult = await this.agentExecutor.executeStep(simulationId);
      
      // Update simulation state
      await this.stateManager.recordStep(simulationId, stepResult);
      
      stepCount++;

      // Check termination conditions
      if (stepResult.terminated) {
        state.completed = true;
        break;
      }
    }

    const endTime = Date.now();
    const result: SimulationResult = {
      simulationId,
      steps: stepCount,
      duration: endTime - startTime,
      finalState: await this.stateManager.getSimulation(simulationId),
      reproducible: true,
      liveSubmissions: 0, // Always 0 in simulation mode
    };

    this.logger.log(`Simulation ${simulationId} completed in ${stepCount} steps`);
    return result;
  }

  /**
   * Reset a simulation to initial state (for reproducibility testing)
   */
  async resetSimulation(simulationId: string): Promise<void> {
    this.logger.log(`Resetting simulation: ${simulationId}`);
    await this.stateManager.resetSimulation(simulationId);
  }

  /**
   * Get current simulation state
   */
  async getSimulationState(simulationId: string) {
    return this.stateManager.getSimulation(simulationId);
  }

  /**
   * Verify simulation reproducibility
   */
  async verifyReproducibility(config: SimulationConfig, runs: number = 2): Promise<boolean> {
    const results: string[] = [];

    for (let i = 0; i < runs; i++) {
      const simId = await this.initializeSimulation(config);
      const result = await this.runSimulation(simId);
      results.push(JSON.stringify(result.finalState));
    }

    // All results should be identical for same seed
    const allIdentical = results.every(r => r === results[0]);
    this.logger.log(`Reproducibility check: ${allIdentical ? 'PASSED' : 'FAILED'}`);
    
    return allIdentical;
  }
}