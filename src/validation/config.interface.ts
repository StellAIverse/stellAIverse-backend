/**
 * Application configuration interfaces
 * Defines the structure for all configuration sections
 */

export interface AppConfig {
  name: string;
  port: number;
  host: string;
  url: string;
  env: string;
}

export interface DatabaseConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  url: string;
  synchronize: boolean;
  logging: boolean;
  ssl: boolean;
  maxConnections: number;
  connectionTimeout: number;
  idleTimeout: number;
}

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  url: string;
  db?: number;
  keyPrefix?: string;
  maxRetriesPerRequest?: number;
  retryDelayOnFailover?: number;
  lazyConnect?: boolean;
}

export interface JwtConfig {
  secret: string;
  refreshSecret: string;
  expiresIn: string;
  refreshExpiresIn: string;
  audience?: string;
  issuer?: string;
  algorithm?: string;
}

export interface SecurityConfig {
  encryptionKey: string;
  bcryptRounds: number;
  sessionSecret?: string;
  maxLoginAttempts: number;
  lockoutDuration: number;
  passwordMinLength: number;
  passwordRequireUppercase: boolean;
  passwordRequireLowercase: boolean;
  passwordRequireNumbers: boolean;
  passwordRequireSymbols: boolean;
}

export interface AwsConfig {
  accessKeyId?: string;
  secretAccessKey?: string;
  region?: string;
  s3Bucket?: string;
  cloudFrontDomain?: string;
  sesRegion?: string;
  sesFromEmail?: string;
}

export interface EmailConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: {
    user?: string;
    pass?: string;
  };
  from?: string;
  templates?: {
    welcome?: string;
    verification?: string;
    passwordReset?: string;
  };
}

export interface LoggingConfig {
  level: string;
  format?: string;
  colorize?: boolean;
  timestamp?: boolean;
  file?: {
    enabled?: boolean;
    filename?: string;
    maxSize?: string;
    maxFiles?: number;
  };
  console?: {
    enabled?: boolean;
    level?: string;
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  metricsPath?: string;
  defaultMetrics?: boolean;
  customMetrics?: boolean;
  prometheus?: {
    enabled?: boolean;
    port?: number;
    endpoint?: string;
  };
  healthCheck?: {
    enabled?: boolean;
    path?: string;
    interval?: number;
  };
}

export interface IntegrationsConfig {
  openai?: {
    apiKey?: string;
    organization?: string;
    maxTokens?: number;
    model?: string;
    temperature?: number;
  };
  web3?: {
    rpcUrl?: string;
    chainId?: number;
    confirmations?: number;
    gasLimit?: number;
    gasPrice?: string;
  };
  ipfs?: {
    gateway?: string;
    projectId?: string;
    secretKey?: string;
  };
}

export interface FeatureConfig {
  enableRegistration?: boolean;
  enableEmailVerification?: boolean;
  enablePasswordReset?: boolean;
  enableSocialLogin?: boolean;
  enableTwoFactor?: boolean;
  enableRateLimiting?: boolean;
  enableAuditLogging?: boolean;
  enableMetrics?: boolean;
  enableTracing?: boolean;
  maintenanceMode?: boolean;
  betaFeatures?: boolean;
}

export interface MiscConfig {
  corsOrigins?: string[];
  maxFileSize?: number;
  allowedFileTypes?: string[];
  cacheTimeout?: number;
  sessionTimeout?: number;
  defaultLanguage?: string;
  timezone?: string;
  dateFormat?: string;
  pagination?: {
    defaultLimit?: number;
    maxLimit?: number;
  };
}

export interface AllConfig {
  app: AppConfig;
  database: DatabaseConfig;
  redis: RedisConfig;
  jwt: JwtConfig;
  security: SecurityConfig;
  aws: AwsConfig;
  email: EmailConfig;
  logging: LoggingConfig;
  monitoring: MonitoringConfig;
  integrations: IntegrationsConfig;
  features: FeatureConfig;
  misc: MiscConfig;
}
