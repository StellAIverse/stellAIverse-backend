/**
 * Standard interface for pluggable simulation environments
 * 
 * This interface defines the contract that all simulation environments must implement
 * to be dynamically loaded and executed by the simulator system.
 */

/**
 * Environment metadata for versioning and identification
 */
export interface EnvironmentMetadata {
  /** Unique identifier for the environment */
  id: string;
  /** Human-readable name */
  name: string;
  /** Semantic version (e.g., "1.0.0") */
  version: string;
  /** Brief description of the environment */
  description: string;
  /** Author or organization that created the environment */
  author?: string;
  /** Timestamp when the environment was created */
  createdAt?: Date;
  /** Timestamp when the environment was last updated */
  updatedAt?: Date;
  /** Tags for categorization */
  tags?: string[];
}

/**
 * Configuration options for environment initialization
 */
export interface EnvironmentInitConfig {
  /** Random seed for deterministic behavior */
  seed?: number;
  /** Environment-specific parameters */
  parameters?: Record<string, any>;
  /** Timeout for initialization in milliseconds */
  timeoutMs?: number;
  /** Working directory for the environment */
  workingDirectory?: string;
}

/**
 * Configuration options for running a simulation
 */
export interface EnvironmentRunConfig {
  /** Maximum number of steps to run */
  maxSteps?: number;
  /** Time limit in milliseconds */
  timeLimitMs?: number;
  /** Whether to enable real-time visualization */
  enableVisualization?: boolean;
  /** Callback for step-by-step progress */
  onStep?: (step: number, state: any) => void | Promise<void>;
  /** Agent configurations */
  agents?: AgentConfiguration[];
}

/**
 * Agent configuration for simulation
 */
export interface AgentConfiguration {
  id: string;
  type: string;
  initialState?: Record<string, any>;
  parameters?: Record<string, any>;
}

/**
 * Result of environment initialization
 */
export interface EnvironmentInitResult {
  /** Whether initialization was successful */
  success: boolean;
  /** Environment state after initialization */
  state?: any;
  /** Error message if initialization failed */
  error?: string;
  /** Warnings during initialization */
  warnings?: string[];
}

/**
 * Result of a simulation run
 */
export interface EnvironmentRunResult {
  /** Whether the simulation completed successfully */
  success: boolean;
  /** Number of steps executed */
  steps: number;
  /** Duration in milliseconds */
  durationMs: number;
  /** Final state of the environment */
  finalState?: any;
  /** Agent states at completion */
  agentStates?: Record<string, any>;
  /** Events that occurred during simulation */
  events?: SimulationEvent[];
  /** Metrics collected during simulation */
  metrics?: Record<string, number>;
  /** Error message if simulation failed */
  error?: string;
  /** Whether simulation was terminated early */
  terminated?: boolean;
  /** Reason for termination */
  terminationReason?: string;
}

/**
 * Simulation event for audit trail
 */
export interface SimulationEvent {
  /** Step number when event occurred */
  step: number;
  /** Timestamp */
  timestamp: number;
  /** Event type */
  type: string;
  /** Event data */
  data: any;
  /** Agent ID if event is agent-related */
  agentId?: string;
}

/**
 * Result of environment teardown
 */
export interface EnvironmentTeardownResult {
  /** Whether teardown was successful */
  success: boolean;
  /** Any cleanup warnings */
  warnings?: string[];
  /** Error message if teardown failed */
  error?: string;
}

/**
 * Current state of an environment instance
 */
export interface EnvironmentInstanceState {
  /** Instance ID */
  instanceId: string;
  /** Environment metadata */
  metadata: EnvironmentMetadata;
  /** Current status */
  status: EnvironmentStatus;
  /** Created timestamp */
  createdAt: Date;
  /** Last activity timestamp */
  lastActivityAt: Date;
  /** Current state data */
  state?: any;
  /** Current step number */
  currentStep?: number;
  /** Configuration used for initialization */
  config?: EnvironmentInitConfig;
}

/**
 * Environment status enum
 */
export enum EnvironmentStatus {
  UNINITIALIZED = 'uninitialized',
  INITIALIZING = 'initializing',
  READY = 'ready',
  RUNNING = 'running',
  PAUSED = 'paused',
  COMPLETED = 'completed',
  ERROR = 'error',
  TEARING_DOWN = 'tearing_down',
  DESTROYED = 'destroyed',
}

/**
 * Audit log entry for simulation activities
 */
export interface AuditLogEntry {
  /** Unique entry ID */
  id: string;
  /** Timestamp */
  timestamp: number;
  /** Environment instance ID */
  instanceId: string;
  /** Environment ID */
  environmentId: string;
  /** Environment version */
  version: string;
  /** Action performed */
  action: 'init' | 'run' | 'step' | 'pause' | 'resume' | 'teardown' | 'error';
  /** Input data */
  input?: any;
  /** Output data */
  output?: any;
  /** Error information */
  error?: any;
  /** User or system that performed the action */
  actor?: string;
}

/**
 * Standard interface that all simulation environments must implement
 */
export interface ISimulationEnvironment {
  /**
   * Get environment metadata including version information
   */
  getMetadata(): EnvironmentMetadata;

  /**
   * Initialize the environment with given configuration
   * @param config - Initialization configuration
   * @returns Promise resolving to initialization result
   */
  init(config: EnvironmentInitConfig): Promise<EnvironmentInitResult>;

  /**
   * Run the simulation
   * @param config - Run configuration
   * @returns Promise resolving to run result
   */
  run(config: EnvironmentRunConfig): Promise<EnvironmentRunResult>;

  /**
   * Run a single step of the simulation
   * @returns Promise resolving to true if simulation should continue
   */
  step(): Promise<{ continue: boolean; state: any }>;

  /**
   * Pause the simulation (if running)
   */
  pause(): Promise<void>;

  /**
   * Resume the simulation (if paused)
   */
  resume(): Promise<void>;

  /**
   * Get current environment state
   */
  getState(): any;

  /**
   * Teardown and cleanup the environment
   * @returns Promise resolving to teardown result
   */
  teardown(): Promise<EnvironmentTeardownResult>;

  /**
   * Validate environment configuration
   * @param config - Configuration to validate
   * @returns Validation result with errors if invalid
   */
  validateConfig?(config: EnvironmentInitConfig): { valid: boolean; errors?: string[] };

  /**
   * Get environment schema for UI generation
   */
  getParameterSchema?(): Record<string, any>;
}

/**
 * Factory function type for creating environment instances
 */
export type EnvironmentFactory = () => ISimulationEnvironment;

/**
 * Loaded environment module information
 */
export interface LoadedEnvironment {
  /** Module path or identifier */
  path: string;
  /** Environment factory function */
  factory: EnvironmentFactory;
  /** Environment metadata */
  metadata: EnvironmentMetadata;
  /** Load timestamp */
  loadedAt: Date;
  /** Module hash for change detection */
  hash?: string;
  /** Whether hot-reloading is enabled */
  hotReloadEnabled: boolean;
}

/**
 * Environment load options
 */
export interface EnvironmentLoadOptions {
  /** Path to environment module */
  path: string;
  /** Enable hot-reloading */
  hotReload?: boolean;
  /** Watch patterns for hot-reload */
  watchPatterns?: string[];
  /** Remote URL if loading from remote source */
  remoteUrl?: string;
  /** Authentication token for remote loading */
  authToken?: string;
}
