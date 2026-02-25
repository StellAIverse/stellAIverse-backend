// Application configuration
export interface AppConfig {
  env: string;
  name: string;
  port: number;
  host: string;
  url: string;
  apiPrefix: string;
  apiVersion: string;
  isDevelopment: boolean;
  isProduction: boolean;
  isStaging: boolean;
  isTest: boolean;
}

// Database configuration
export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  synchronize: boolean;
  logging: boolean;
  ssl: boolean;
  poolMin: number;
  poolMax: number;
}

// Redis configuration
export interface RedisConfig {
  host: string;
  port: number;
  password: string;
  db: number;
  ttl: number;
}

// JWT configuration
export interface JwtConfig {
  secret: string;
  expiresIn: string;
  refreshSecret: string;
  refreshExpiresIn: string;
}

// Security configuration
export interface SecurityConfig {
  encryptionKey: string;
  cors: {
    enabled: boolean;
    origin: string[];
  };
  rateLimit: {
    ttl: number;
    max: number;
  };
}

// AWS configuration
export interface AwsConfig {
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  s3Bucket: string;
}

// Email configuration
export interface EmailConfig {
  smtp: {
    host: string;
    port: number;
    secure: boolean;
    user: string;
    password: string;
    from: string;
  };
  sendgrid: {
    apiKey: string;
  };
}

// Logging configuration
export interface LoggingConfig {
  level: string;
  fileEnabled: boolean;
  filePath: string;
}

// Monitoring configuration
export interface MonitoringConfig {
  sentry: {
    dsn: string;
    environment: string;
  };
}

// Third-party integrations configuration
export interface IntegrationsConfig {
  stripe: {
    secretKey: string;
    webhookSecret: string;
  };
  google: {
    clientId: string;
    clientSecret: string;
    callbackUrl: string;
  };
}

// OpenAI configuration
export interface OpenAiConfig {
  apiKey: string;
  organization?: string;
  project?: string;
}

// Feature flags
export interface FeatureFlags {
  registrationEnabled: boolean;
  emailVerification: boolean;
  swaggerEnabled: boolean;
}

// Miscellaneous configuration
export interface MiscConfig {
  maxFileSize: number;
  allowedFileTypes: string[];
  defaultPageSize: number;
  maxPageSize: number;
  timezone: string;
}