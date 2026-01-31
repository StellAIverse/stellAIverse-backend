import { Injectable, Logger } from '@nestjs/common';
import { SimulationStateManager } from '../state/simulation-state.manager';
import { StepResult, SimulationEvent } from '../interfaces/simulation.interface';
import { EnvironmentConfigService } from '../config/environment-config.service';
import { MockProviderFactory } from '../providers/mock-provider.factory';

@Injectable()
export class AgentExecutor {
  private readonly logger = new Logger(AgentExecutor.name);

  constructor(
    private readonly stateManager: SimulationStateManager,
    private readonly envConfig: EnvironmentConfigService,
    private readonly mockProviderFactory: MockProviderFactory,
  ) {}

  /**
   * Execute one step for all agents in the simulation
   */
  async executeStep(simulationId: string): Promise<StepResult> {
    const simulation = await this.stateManager.getSimulation(simulationId);
    if (!simulation) {
      throw new Error(`Simulation ${simulationId} not found`);
    }

    const events: SimulationEvent[] = [];
    let terminated = false;

    // Execute actions for each agent
    for (const [agentId, agentState] of simulation.agentStates) {
      try {
        const action = await this.selectAction(agentId, agentState);
        const outcome = await this.executeAction(agentId, action, agentState);

        events.push({
          step: simulation.currentStep,
          timestamp: Date.now(),
          agentId,
          eventType: 'action',
          data: { action, outcome },
        });

        // Check termination conditions
        if (outcome.terminated) {
          terminated = true;
        }
      } catch (error) {
        this.logger.error(`Error executing step for agent ${agentId}:`, error);
        events.push({
          step: simulation.currentStep,
          timestamp: Date.now(),
          agentId,
          eventType: 'error',
          data: { error: error.message },
        });
      }
    }

    // Return results for first agent (or aggregate as needed)
    const firstAgentId = Array.from(simulation.agentStates.keys())[0];
    const firstAgentState = simulation.agentStates.get(firstAgentId);

    return {
      agentId: firstAgentId,
      action: firstAgentState?.lastAction || 'idle',
      outcome: firstAgentState?.lastOutcome || {},
      terminated,
      events,
    };
  }

  /**
   * Select action for agent (deterministic based on current state and seed)
   */
  private async selectAction(agentId: string, agentState: any): Promise<string> {
    // Use deterministic random to select action
    const actions = agentState.parameters?.availableActions || ['idle', 'move', 'interact'];
    const selectedAction = this.envConfig.randomChoice(actions);
    
    this.logger.debug(`Agent ${agentId} selected action: ${selectedAction}`);
    return selectedAction;
  }

  /**
   * Execute action and return outcome (using mock providers)
   */
  private async executeAction(agentId: string, action: string, agentState: any): Promise<any> {
    const providers = this.mockProviderFactory.getProviders();
    
    switch (action) {
      case 'move':
        return this.executeMoveAction(agentState);
      
      case 'interact':
        return this.executeInteractAction(agentId, agentState, providers);
      
      case 'query':
        return this.executeQueryAction(agentState, providers);
      
      case 'idle':
      default:
        return { success: true, terminated: false };
    }
  }

  /**
   * Execute move action
   */
  private async executeMoveAction(agentState: any): Promise<any> {
    const directions = ['north', 'south', 'east', 'west'];
    const direction = this.envConfig.randomChoice(directions);
    
    return {
      success: true,
      direction,
      terminated: false,
    };
  }

  /**
   * Execute interact action (using mock providers)
   */
  private async executeInteractAction(agentId: string, agentState: any, providers: any): Promise<any> {
    // Use mock HTTP provider to simulate interaction
    if (providers.http) {
      const response = await providers.http.get('/api/interact', {
        agentId,
        state: agentState,
      });
      
      return {
        success: response.success,
        data: response.data,
        terminated: false,
      };
    }

    return { success: false, terminated: false };
  }

  /**
   * Execute query action (using mock database)
   */
  private async executeQueryAction(agentState: any, providers: any): Promise<any> {
    if (providers.database) {
      const results = await providers.database.query('SELECT * FROM entities LIMIT 1');
      
      return {
        success: true,
        results,
        terminated: results.length === 0, // Terminate if no more entities
      };
    }

    return { success: false, terminated: false };
  }
}