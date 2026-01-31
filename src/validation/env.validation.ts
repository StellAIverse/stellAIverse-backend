import {
  IsString,
  IsNumber,
  IsEnum,
  IsBoolean,
  IsOptional,
  IsUrl,
  Min,
  Max,
  MinLength,
  IsEmail,
  ValidateIf,
} from 'class-validator';
import { Transform, Type } from 'class-transformer';

export enum Environment {
  Development = 'development',
  Production = 'production',
  Staging = 'staging',
  Test = 'test',
}

export enum LogLevel {
  Error = 'error',
  Warn = 'warn',
  Info = 'info',
  Debug = 'debug',
  Verbose = 'verbose',
}

/**
 * Environment variables validation schema
 * All required environment variables must be defined here with appropriate validators
 */
export class EnvironmentVariables {
  // ==========================================
  // APPLICATION
  // ==========================================

  @IsEnum(Environment)
  NODE_ENV: Environment;

  @IsString()
  @MinLength(1)
  APP_NAME: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(65535)
  APP_PORT: number;

  @IsString()
  APP_HOST: string;

  @IsUrl({ require_tld: false })
  APP_URL: string;

  @IsString()
  @IsOptional()
  API_PREFIX?: string = 'api';

  @IsString()
  @IsOptional()
  API_VERSION?: string = 'v1';

  // ==========================================
  // DATABASE
  // ==========================================

  @IsString()
  DB_HOST: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(65535)
  DB_PORT: number;

  @IsString()
  DB_USERNAME: string;

  @IsString()
  DB_PASSWORD: string;

  @IsString()
  DB_NAME: string;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  DB_SYNCHRONIZE?: boolean = false;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  DB_LOGGING?: boolean = false;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  DB_SSL?: boolean = false;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  DB_POOL_MIN?: number = 2;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  DB_POOL_MAX?: number = 10;

  // ==========================================
  // REDIS
  // ==========================================

  @IsString()
  @IsOptional()
  REDIS_HOST?: string = 'localhost';

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  REDIS_PORT?: number = 6379;

  @IsString()
  @IsOptional()
  REDIS_PASSWORD?: string = '';

  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @IsOptional()
  REDIS_DB?: number = 0;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  REDIS_TTL?: number = 3600;

  // ==========================================
  // SECURITY & AUTHENTICATION
  // ==========================================

  @IsString()
  @MinLength(32)
  JWT_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_EXPIRES_IN?: string = '1h';

  @IsString()
  @MinLength(32)
  JWT_REFRESH_SECRET: string;

  @IsString()
  @IsOptional()
  JWT_REFRESH_EXPIRES_IN?: string = '7d';

  @IsString()
  @MinLength(32)
  @ValidateIf((o) => o.NODE_ENV === Environment.Production)
  ENCRYPTION_KEY: string;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  CORS_ENABLED?: boolean = true;

  @IsString()
  @IsOptional()
  CORS_ORIGIN?: string = 'http://localhost:3000';

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_TTL?: number = 60;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  RATE_LIMIT_MAX?: number = 100;

  // ==========================================
  // AWS
  // ==========================================

  @IsString()
  @IsOptional()
  AWS_REGION?: string;

  @IsString()
  @IsOptional()
  AWS_ACCESS_KEY_ID?: string;

  @IsString()
  @IsOptional()
  AWS_SECRET_ACCESS_KEY?: string;

  @IsString()
  @IsOptional()
  AWS_S3_BUCKET?: string;

  // ==========================================
  // EMAIL
  // ==========================================

  @IsString()
  @IsOptional()
  SMTP_HOST?: string;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @Max(65535)
  @IsOptional()
  SMTP_PORT?: number;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  SMTP_SECURE?: boolean = false;

  @IsString()
  @IsOptional()
  SMTP_USER?: string;

  @IsString()
  @IsOptional()
  SMTP_PASSWORD?: string;

  @IsEmail()
  @IsOptional()
  SMTP_FROM?: string;

  @IsString()
  @IsOptional()
  SENDGRID_API_KEY?: string;

  // ==========================================
  // MONITORING & LOGGING
  // ==========================================

  @IsEnum(LogLevel)
  @IsOptional()
  LOG_LEVEL?: LogLevel = LogLevel.Info;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  LOG_FILE_ENABLED?: boolean = false;

  @IsString()
  @IsOptional()
  LOG_FILE_PATH?: string = './logs';

  @IsString()
  @IsOptional()
  SENTRY_DSN?: string;

  @IsString()
  @IsOptional()
  SENTRY_ENVIRONMENT?: string;

  // ==========================================
  // THIRD-PARTY INTEGRATIONS
  // ==========================================

  @IsString()
  @IsOptional()
  STRIPE_SECRET_KEY?: string;

  @IsString()
  @IsOptional()
  STRIPE_WEBHOOK_SECRET?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_ID?: string;

  @IsString()
  @IsOptional()
  GOOGLE_CLIENT_SECRET?: string;

  @IsUrl({ require_tld: false })
  @IsOptional()
  GOOGLE_CALLBACK_URL?: string;

  // ==========================================
  // FEATURE FLAGS
  // ==========================================

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  FEATURE_REGISTRATION_ENABLED?: boolean = true;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  FEATURE_EMAIL_VERIFICATION?: boolean = true;

  @Transform(({ value }) => value === 'true' || value === true)
  @IsBoolean()
  @IsOptional()
  FEATURE_SWAGGER_ENABLED?: boolean = true;

  // ==========================================
  // MISCELLANEOUS
  // ==========================================

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  MAX_FILE_SIZE?: number = 10485760; // 10MB

  @IsString()
  @IsOptional()
  ALLOWED_FILE_TYPES?: string = 'image/jpeg,image/png,application/pdf';

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  DEFAULT_PAGE_SIZE?: number = 20;

  @Type(() => Number)
  @IsNumber()
  @Min(1)
  @IsOptional()
  MAX_PAGE_SIZE?: number = 100;

  @IsString()
  @IsOptional()
  TZ?: string = 'UTC';
}