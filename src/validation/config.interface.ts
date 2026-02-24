// Database configuration
export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
}

// JWT configuration
export interface JwtConfig {
  secret: string;
  expiresIn: string;
}

// OpenAI configuration
export interface OpenAiConfig {
  apiKey: string;
  organization?: string;
  project?: string;
}

// Feature flags
export interface FeatureFlags {
  enableCache: boolean;
  enableRateLimiting: boolean;
  enableTracing: boolean;
  enableMetrics: boolean;
  enableEncryption: boolean;
}

// Miscellaneous configuration
export interface MiscConfig {
  appName: string;
  appVersion: string;
  environment: string;
  port: number;
  corsOrigin: string;
}