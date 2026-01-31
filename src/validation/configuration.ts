import { registerAs } from '@nestjs/config';
import { Environment } from './env.validation';
import {
  AppConfig,
  DatabaseConfig,
  RedisConfig,
  JwtConfig,
  SecurityConfig,
  AwsConfig,
  EmailConfig,
  LoggingConfig,
  MonitoringConfig,
  IntegrationsConfig,
  FeatureFlags,
  MiscConfig,
} from './config.interface';

/**
 * Application configuration factory
 */
export const appConfig = registerAs(
  'app',
  (): AppConfig => ({
    env: process.env.NODE_ENV as Environment,
    name: process.env.APP_NAME || 'NestJS Application',
    port: parseInt(process.env.APP_PORT || '3000', 10),
    host: process.env.APP_HOST || 'localhost',
    url: process.env.APP_URL || 'http://localhost:3000',
    apiPrefix: process.env.API_PREFIX || 'api',
    apiVersion: process.env.API_VERSION || 'v1',
    isDevelopment: process.env.NODE_ENV === Environment.Development,
    isProduction: process.env.NODE_ENV === Environment.Production,
    isStaging: process.env.NODE_ENV === Environment.Staging,
    isTest: process.env.NODE_ENV === Environment.Test,
  }),
);

/**
 * Database configuration factory
 */
export const databaseConfig = registerAs(
  'database',
  (): DatabaseConfig => ({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432', 10),
    username: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'nestjs_db',
    synchronize: process.env.DB_SYNCHRONIZE === 'true',
    logging: process.env.DB_LOGGING === 'true',
    ssl: process.env.DB_SSL === 'true',
    poolMin: parseInt(process.env.DB_POOL_MIN || '2', 10),
    poolMax: parseInt(process.env.DB_POOL_MAX || '10', 10),
  }),
);

/**
 * Redis configuration factory
 */
export const redisConfig = registerAs(
  'redis',
  (): RedisConfig => ({
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT || '6379', 10),
    password: process.env.REDIS_PASSWORD || '',
    db: parseInt(process.env.REDIS_DB || '0', 10),
    ttl: parseInt(process.env.REDIS_TTL || '3600', 10),
  }),
);

/**
 * JWT configuration factory
 */
export const jwtConfig = registerAs(
  'jwt',
  (): JwtConfig => ({
    secret: process.env.JWT_SECRET || 'change-this-secret',
    expiresIn: process.env.JWT_EXPIRES_IN || '1h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'change-this-refresh-secret',
    refreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '7d',
  }),
);

/**
 * Security configuration factory
 */
export const securityConfig = registerAs(
  'security',
  (): SecurityConfig => ({
    encryptionKey: process.env.ENCRYPTION_KEY || 'change-this-32-character-key!!!',
    cors: {
      enabled: process.env.CORS_ENABLED !== 'false',
      origin: (process.env.CORS_ORIGIN || 'http://localhost:3000')
        .split(',')
        .map((origin) => origin.trim()),
    },
    rateLimit: {
      ttl: parseInt(process.env.RATE_LIMIT_TTL || '60', 10),
      max: parseInt(process.env.RATE_LIMIT_MAX || '100', 10),
    },
  }),
);

/**
 * AWS configuration factory
 */
export const awsConfig = registerAs(
  'aws',
  (): AwsConfig => ({
    region: process.env.AWS_REGION || 'us-east-1',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    s3Bucket: process.env.AWS_S3_BUCKET || '',
  }),
);

/**
 * Email configuration factory
 */
export const emailConfig = registerAs(
  'email',
  (): EmailConfig => ({
    smtp: {
      host: process.env.SMTP_HOST || 'smtp.gmail.com',
      port: parseInt(process.env.SMTP_PORT || '587', 10),
      secure: process.env.SMTP_SECURE === 'true',
      user: process.env.SMTP_USER || '',
      password: process.env.SMTP_PASSWORD || '',
      from: process.env.SMTP_FROM || 'noreply@example.com',
    },
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY || '',
    },
  }),
);

/**
 * Logging configuration factory
 */
export const loggingConfig = registerAs(
  'logging',
  (): LoggingConfig => ({
    level: (process.env.LOG_LEVEL as any) || 'info',
    fileEnabled: process.env.LOG_FILE_ENABLED === 'true',
    filePath: process.env.LOG_FILE_PATH || './logs',
  }),
);

/**
 * Monitoring configuration factory
 */
export const monitoringConfig = registerAs(
  'monitoring',
  (): MonitoringConfig => ({
    sentry: {
      dsn: process.env.SENTRY_DSN || '',
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    },
  }),
);

/**
 * Third-party integrations configuration factory
 */
export const integrationsConfig = registerAs(
  'integrations',
  (): IntegrationsConfig => ({
    stripe: {
      secretKey: process.env.STRIPE_SECRET_KEY || '',
      webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || '',
    },
    google: {
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
      callbackUrl: process.env.GOOGLE_CALLBACK_URL || '',
    },
  }),
);

/**
 * Feature flags configuration factory
 */
export const featureConfig = registerAs(
  'features',
  (): FeatureFlags => ({
    registrationEnabled: process.env.FEATURE_REGISTRATION_ENABLED !== 'false',
    emailVerification: process.env.FEATURE_EMAIL_VERIFICATION !== 'false',
    swaggerEnabled: process.env.FEATURE_SWAGGER_ENABLED !== 'false',
  }),
);

/**
 * Miscellaneous configuration factory
 */
export const miscConfig = registerAs(
  'misc',
  (): MiscConfig => ({
    maxFileSize: parseInt(process.env.MAX_FILE_SIZE || '10485760', 10),
    allowedFileTypes: (process.env.ALLOWED_FILE_TYPES || 'image/jpeg,image/png,application/pdf')
      .split(',')
      .map((type) => type.trim()),
    defaultPageSize: parseInt(process.env.DEFAULT_PAGE_SIZE || '20', 10),
    maxPageSize: parseInt(process.env.MAX_PAGE_SIZE || '100', 10),
    timezone: process.env.TZ || 'UTC',
  }),
);