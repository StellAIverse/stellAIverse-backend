export interface SimulationConfig {
  seed: number; // Deterministic seed for reproducibility
  maxSteps?: number;
  environment: EnvironmentType;
  agents: AgentConfig[];
  mockProviders?: MockProviderConfig;
  timeScale?: number; // Time multiplier for simulation
}

export interface AgentConfig {
  id: string;
  type: string;
  initialState: Record<string, any>;
  parameters?: Record<string, any>;
}

export interface EnvironmentType {
  name: string;
  parameters: Record<string, any>;
}

export interface MockProviderConfig {
  http?: {
    enabled: boolean;
    responses?: Record<string, any>;
  };
  database?: {
    enabled: boolean;
    initialData?: Record<string, any[]>;
  };
  messageQueue?: {
    enabled: boolean;
    latency?: number;
  };
}

export interface SimulationState {
  id: string;
  config: SimulationConfig;
  currentStep: number;
  completed: boolean;
  createdAt: Date;
  agentStates: Map<string, any>;
  eventLog: SimulationEvent[];
}

export interface SimulationEvent {
  step: number;
  timestamp: number;
  agentId: string;
  eventType: string;
  data: any;
}

export interface SimulationResult {
  simulationId: string;
  steps: number;
  duration: number;
  finalState: SimulationState;
  reproducible: boolean;
  liveSubmissions: number; // Should always be 0
}

export interface StepResult {
  agentId: string;
  action: string;
  outcome: any;
  terminated: boolean;
  events: SimulationEvent[];
}