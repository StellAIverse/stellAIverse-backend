import { Injectable, Logger } from '@nestjs/common';
import { SimulationConfig, SimulationState, SimulationEvent, StepResult } from '../interfaces/simulation.interface';
import { v4 as uuidv4 } from 'uuid';

@Injectable()
export class SimulationStateManager {
  private readonly logger = new Logger(SimulationStateManager.name);
  private simulations: Map<string, SimulationState> = new Map();

  /**
   * Create a new simulation
   */
  async createSimulation(config: SimulationConfig): Promise<string> {
    const id = uuidv4();
    
    const state: SimulationState = {
      id,
      config,
      currentStep: 0,
      completed: false,
      createdAt: new Date(),
      agentStates: new Map(),
      eventLog: [],
    };

    // Initialize agent states
    config.agents.forEach(agentConfig => {
      state.agentStates.set(agentConfig.id, {
        ...agentConfig.initialState,
        type: agentConfig.type,
        parameters: agentConfig.parameters,
      });
    });

    this.simulations.set(id, state);
    this.logger.log(`Created simulation ${id} with ${config.agents.length} agents`);
    
    return id;
  }

  /**
   * Get simulation state
   */
  async getSimulation(id: string): Promise<SimulationState | undefined> {
    return this.simulations.get(id);
  }

  /**
   * Record a simulation step
   */
  async recordStep(simulationId: string, stepResult: StepResult): Promise<void> {
    const simulation = this.simulations.get(simulationId);
    if (!simulation) {
      throw new Error(`Simulation ${simulationId} not found`);
    }

    simulation.currentStep++;
    
    // Update agent state
    if (stepResult.agentId) {
      const currentAgentState = simulation.agentStates.get(stepResult.agentId);
      simulation.agentStates.set(stepResult.agentId, {
        ...currentAgentState,
        lastAction: stepResult.action,
        lastOutcome: stepResult.outcome,
      });
    }

    // Add events to log
    stepResult.events.forEach(event => {
      simulation.eventLog.push({
        ...event,
        step: simulation.currentStep,
      });
    });

    this.logger.debug(`Recorded step ${simulation.currentStep} for simulation ${simulationId}`);
  }

  /**
   * Reset simulation to initial state
   */
  async resetSimulation(id: string): Promise<void> {
    const simulation = this.simulations.get(id);
    if (!simulation) {
      throw new Error(`Simulation ${id} not found`);
    }

    // Reset to initial state
    simulation.currentStep = 0;
    simulation.completed = false;
    simulation.eventLog = [];

    // Reset agent states to initial
    simulation.config.agents.forEach(agentConfig => {
      simulation.agentStates.set(agentConfig.id, {
        ...agentConfig.initialState,
        type: agentConfig.type,
        parameters: agentConfig.parameters,
      });
    });

    this.logger.log(`Reset simulation ${id}`);
  }

  /**
   * Get all events for a simulation
   */
  async getEventLog(id: string): Promise<SimulationEvent[]> {
    const simulation = this.simulations.get(id);
    return simulation?.eventLog || [];
  }

  /**
   * Get agent state
   */
  async getAgentState(simulationId: string, agentId: string): Promise<any> {
    const simulation = this.simulations.get(simulationId);
    return simulation?.agentStates.get(agentId);
  }

  /**
   * Export simulation state for reproducibility verification
   */
  async exportState(id: string): Promise<string> {
    const simulation = this.simulations.get(id);
    if (!simulation) {
      throw new Error(`Simulation ${id} not found`);
    }

    // Convert Map to object for serialization
    const exportData = {
      ...simulation,
      agentStates: Object.fromEntries(simulation.agentStates),
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Clean up old simulations
   */
  async cleanup(maxAge: number = 3600000): Promise<number> {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, state] of this.simulations.entries()) {
      const age = now - state.createdAt.getTime();
      if (age > maxAge) {
        this.simulations.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} old simulations`);
    }

    return cleaned;
  }
}