import { Injectable } from '@nestjs/common';
import { ConfigService as NestConfigService } from '@nestjs/config';
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
 * Typed configuration service wrapper
 * Provides strongly-typed access to all configuration namespaces
 */
@Injectable()
export class ConfigService {
  constructor(private readonly configService: NestConfigService) {}

  /**
   * Get application configuration
   */
  get app(): AppConfig {
    return this.configService.get<AppConfig>('app')!;
  }

  /**
   * Get database configuration
   */
  get database(): DatabaseConfig {
    return this.configService.get<DatabaseConfig>('database')!;
  }

  /**
   * Get Redis configuration
   */
  get redis(): RedisConfig {
    return this.configService.get<RedisConfig>('redis')!;
  }

  /**
   * Get JWT configuration
   */
  get jwt(): JwtConfig {
    return this.configService.get<JwtConfig>('jwt')!;
  }

  /**
   * Get security configuration
   */
  get security(): SecurityConfig {
    return this.configService.get<SecurityConfig>('security')!;
  }

  /**
   * Get AWS configuration
   */
  get aws(): AwsConfig {
    return this.configService.get<AwsConfig>('aws')!;
  }

  /**
   * Get email configuration
   */
  get email(): EmailConfig {
    return this.configService.get<EmailConfig>('email')!;
  }

  /**
   * Get logging configuration
   */
  get logging(): LoggingConfig {
    return this.configService.get<LoggingConfig>('logging')!;
  }

  /**
   * Get monitoring configuration
   */
  get monitoring(): MonitoringConfig {
    return this.configService.get<MonitoringConfig>('monitoring')!;
  }

  /**
   * Get integrations configuration
   */
  get integrations(): IntegrationsConfig {
    return this.configService.get<IntegrationsConfig>('integrations')!;
  }

  /**
   * Get feature flags
   */
  get features(): FeatureFlags {
    return this.configService.get<FeatureFlags>('features')!;
  }

  /**
   * Get miscellaneous configuration
   */
  get misc(): MiscConfig {
    return this.configService.get<MiscConfig>('misc')!;
  }

  /**
   * Check if running in development mode
   */
  get isDevelopment(): boolean {
    return this.app.isDevelopment;
  }

  /**
   * Check if running in production mode
   */
  get isProduction(): boolean {
    return this.app.isProduction;
  }

  /**
   * Check if running in staging mode
   */
  get isStaging(): boolean {
    return this.app.isStaging;
  }

  /**
   * Check if running in test mode
   */
  get isTest(): boolean {
    return this.app.isTest;
  }

  /**
   * Get a specific configuration value using dot notation
   * For advanced use cases or accessing nested values
   */
  get<T = any>(key: string, defaultValue?: T): T {
    return this.configService.get<T>(key, defaultValue)!;
  }
}