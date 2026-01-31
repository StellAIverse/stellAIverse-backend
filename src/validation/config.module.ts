import { Global, Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule, ConfigService } from '@nestjs/config';
import {
  appConfig,
  databaseConfig,
  redisConfig,
  jwtConfig,
  securityConfig,
  awsConfig,
  emailConfig,
  loggingConfig,
  monitoringConfig,
  integrationsConfig,
  featureConfig,
  miscConfig,
} from './configuration';
import { validate } from './env-validator';
import { ConfigService as AppConfigService } from './config.service';

/**
 * Global configuration module
 * Makes configuration available throughout the entire application
 */
@Global()
@Module({
  imports: [
    NestConfigModule.forRoot({
      isGlobal: true,
      cache: true,
      expandVariables: true,
      envFilePath: ['.env.local', '.env'],
      validate,
      load: [
        appConfig,
        databaseConfig,
        redisConfig,
        jwtConfig,
        securityConfig,
        awsConfig,
        emailConfig,
        loggingConfig,
        monitoringConfig,
        integrationsConfig,
        featureConfig,
        miscConfig,
      ],
    }),
  ],
  providers: [ConfigService, AppConfigService],
  exports: [ConfigService, AppConfigService],
})
export class ConfigModule {}