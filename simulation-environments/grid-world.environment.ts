/**
 * Grid World Simulation Environment
 * 
 * A simple grid-based simulation where agents navigate a 2D grid,
 * collect resources, and avoid obstacles.
 * 
 * @version 1.0.0
 */

import {
  ISimulationEnvironment,
  EnvironmentMetadata,
  EnvironmentInitConfig,
  EnvironmentRunConfig,
  EnvironmentInitResult,
  EnvironmentRunResult,
  EnvironmentTeardownResult,
  SimulationEvent,
} from '../src/simulator/environment.interface';

interface GridCell {
  x: number;
  y: number;
  type: 'empty' | 'obstacle' | 'resource' | 'agent';
  agentId?: string;
  resourceValue?: number;
}

interface GridState {
  width: number;
  height: number;
  grid: GridCell[][];
  agents: Map<string, AgentState>;
  resourcesCollected: number;
  steps: number;
}

interface AgentState {
  id: string;
  x: number;
  y: number;
  energy: number;
  resourcesCollected: number;
}

export class GridWorldEnvironment implements ISimulationEnvironment {
  private state: GridState | null = null;
  private config: EnvironmentInitConfig | null = null;
  private events: SimulationEvent[] = [];
  private isRunning = false;
  private isPaused = false;

  getMetadata(): EnvironmentMetadata {
    return {
      id: 'grid-world',
      name: 'Grid World',
      version: '1.0.0',
      description: 'A 2D grid-based simulation environment where agents navigate, collect resources, and avoid obstacles',
      author: 'stellAIverse',
      tags: ['grid', 'navigation', 'resource-collection'],
    };
  }

  async init(config: EnvironmentInitConfig): Promise<EnvironmentInitResult> {
    try {
      this.config = config;
      const seed = config.seed || Math.floor(Math.random() * 10000);
      const params = config.parameters || {};

      const width = params.width || 20;
      const height = params.height || 20;
      const obstacleDensity = params.obstacleDensity || 0.1;
      const resourceDensity = params.resourceDensity || 0.05;

      // Initialize grid
      const grid: GridCell[][] = [];
      for (let y = 0; y < height; y++) {
        grid[y] = [];
        for (let x = 0; x < width; x++) {
          const random = this.seededRandom(seed + y * width + x);
          let type: GridCell['type'] = 'empty';
          
          if (random < obstacleDensity) {
            type = 'obstacle';
          } else if (random < obstacleDensity + resourceDensity) {
            type = 'resource';
          }

          grid[y][x] = {
            x,
            y,
            type,
            resourceValue: type === 'resource' ? Math.floor(this.seededRandom(seed + x + y) * 10) + 1 : undefined,
          };
        }
      }

      this.state = {
        width,
        height,
        grid,
        agents: new Map(),
        resourcesCollected: 0,
        steps: 0,
      };

      // Initialize agents if provided
      if (config.parameters?.agents) {
        for (const agentConfig of config.parameters.agents) {
          this.addAgent(agentConfig.id, agentConfig.initialState);
        }
      }

      return {
        success: true,
        state: this.getState(),
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.message,
      };
    }
  }

  async run(config: EnvironmentRunConfig): Promise<EnvironmentRunResult> {
    if (!this.state) {
      return {
        success: false,
        steps: 0,
        durationMs: 0,
        error: 'Environment not initialized',
      };
    }

    const startTime = Date.now();
    const maxSteps = config.maxSteps || 1000;
    this.isRunning = true;
    this.isPaused = false;

    try {
      while (this.state.steps < maxSteps && this.isRunning && !this.isPaused) {
        const result = await this.step();
        
        if (config.onStep) {
          await config.onStep(this.state.steps, this.getState());
        }

        if (!result.continue) {
          break;
        }

        // Check time limit
        if (config.timeLimitMs && Date.now() - startTime > config.timeLimitMs) {
          break;
        }
      }

      const durationMs = Date.now() - startTime;

      return {
        success: true,
        steps: this.state.steps,
        durationMs,
        finalState: this.getState(),
        agentStates: this.getAgentStates(),
        events: this.events,
        metrics: {
          resourcesCollected: this.state.resourcesCollected,
          agentCount: this.state.agents.size,
        },
        terminated: !this.isRunning,
        terminationReason: this.isRunning ? 'max-steps-reached' : 'completed',
      };
    } catch (error: any) {
      return {
        success: false,
        steps: this.state.steps,
        durationMs: Date.now() - startTime,
        error: error.message,
        finalState: this.getState(),
      };
    } finally {
      this.isRunning = false;
    }
  }

  async step(): Promise<{ continue: boolean; state: any }> {
    if (!this.state) {
      throw new Error('Environment not initialized');
    }

    this.state.steps++;

    // Move each agent
    for (const [agentId, agent] of this.state.agents) {
      if (this.isPaused) break;

      const action = this.decideAction(agent);
      const result = this.executeAction(agent, action);

      // Log event
      this.events.push({
        step: this.state.steps,
        timestamp: Date.now(),
        type: 'agent-action',
        agentId,
        data: { action, result },
      });
    }

    // Check if all resources collected
    const hasResources = this.state.grid.some(row =>
      row.some(cell => cell.type === 'resource')
    );

    return {
      continue: hasResources && this.state.steps < 1000,
      state: this.getState(),
    };
  }

  async pause(): Promise<void> {
    this.isPaused = true;
  }

  async resume(): Promise<void> {
    this.isPaused = false;
  }

  getState(): any {
    if (!this.state) return null;

    return {
      width: this.state.width,
      height: this.state.height,
      steps: this.state.steps,
      resourcesCollected: this.state.resourcesCollected,
      agentCount: this.state.agents.size,
      grid: this.state.grid.map(row =>
        row.map(cell => ({
          x: cell.x,
          y: cell.y,
          type: cell.type,
          agentId: cell.agentId,
          resourceValue: cell.resourceValue,
        }))
      ),
    };
  }

  async teardown(): Promise<EnvironmentTeardownResult> {
    this.isRunning = false;
    this.state = null;
    this.config = null;
    this.events = [];

    return {
      success: true,
    };
  }

  validateConfig(config: EnvironmentInitConfig): { valid: boolean; errors?: string[] } {
    const errors: string[] = [];
    const params = config.parameters || {};

    if (params.width !== undefined && (params.width < 5 || params.width > 100)) {
      errors.push('Width must be between 5 and 100');
    }
    if (params.height !== undefined && (params.height < 5 || params.height > 100)) {
      errors.push('Height must be between 5 and 100');
    }
    if (params.obstacleDensity !== undefined && (params.obstacleDensity < 0 || params.obstacleDensity > 0.5)) {
      errors.push('Obstacle density must be between 0 and 0.5');
    }

    return {
      valid: errors.length === 0,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  getParameterSchema(): Record<string, any> {
    return {
      width: {
        type: 'number',
        default: 20,
        min: 5,
        max: 100,
        description: 'Grid width',
      },
      height: {
        type: 'number',
        default: 20,
        min: 5,
        max: 100,
        description: 'Grid height',
      },
      obstacleDensity: {
        type: 'number',
        default: 0.1,
        min: 0,
        max: 0.5,
        description: 'Density of obstacles (0-0.5)',
      },
      resourceDensity: {
        type: 'number',
        default: 0.05,
        min: 0,
        max: 0.3,
        description: 'Density of resources (0-0.3)',
      },
    };
  }

  // Helper methods
  private addAgent(id: string, initialState?: Record<string, any>): void {
    if (!this.state) return;

    let x = initialState?.x ?? Math.floor(Math.random() * this.state.width);
    let y = initialState?.y ?? Math.floor(Math.random() * this.state.height);

    // Find empty spot
    while (this.state.grid[y][x].type !== 'empty') {
      x = Math.floor(Math.random() * this.state.width);
      y = Math.floor(Math.random() * this.state.height);
    }

    const agent: AgentState = {
      id,
      x,
      y,
      energy: 100,
      resourcesCollected: 0,
    };

    this.state.agents.set(id, agent);
    this.state.grid[y][x].type = 'agent';
    this.state.grid[y][x].agentId = id;
  }

  private decideAction(agent: AgentState): string {
    const actions = ['up', 'down', 'left', 'right', 'collect'];
    return actions[Math.floor(Math.random() * actions.length)];
  }

  private executeAction(agent: AgentState, action: string): boolean {
    if (!this.state) return false;

    const oldX = agent.x;
    const oldY = agent.y;

    let newX = oldX;
    let newY = oldY;

    switch (action) {
      case 'up':
        newY = Math.max(0, oldY - 1);
        break;
      case 'down':
        newY = Math.min(this.state.height - 1, oldY + 1);
        break;
      case 'left':
        newX = Math.max(0, oldX - 1);
        break;
      case 'right':
        newX = Math.min(this.state.width - 1, oldX + 1);
        break;
      case 'collect':
        const cell = this.state.grid[oldY][oldX];
        if (cell.type === 'resource') {
          agent.resourcesCollected += cell.resourceValue || 1;
          this.state.resourcesCollected += cell.resourceValue || 1;
          cell.type = 'empty';
          cell.resourceValue = undefined;
          return true;
        }
        return false;
    }

    // Check if new position is valid
    if (this.state.grid[newY][newX].type === 'obstacle') {
      return false;
    }

    // Move agent
    this.state.grid[oldY][oldX].type = 'empty';
    this.state.grid[oldY][oldX].agentId = undefined;

    agent.x = newX;
    agent.y = newY;

    this.state.grid[newY][newX].type = 'agent';
    this.state.grid[newY][newX].agentId = agent.id;

    return true;
  }

  private getAgentStates(): Record<string, any> {
    if (!this.state) return {};

    const states: Record<string, any> = {};
    for (const [id, agent] of this.state.agents) {
      states[id] = { ...agent };
    }
    return states;
  }

  private seededRandom(seed: number): number {
    const x = Math.sin(seed) * 10000;
    return x - Math.floor(x);
  }
}

// Export factory function
export default function createEnvironment(): ISimulationEnvironment {
  return new GridWorldEnvironment();
}
