import { Module } from '@nestjs/common';
import { ComputeBridgeService } from './compute-bridge.service';
import { ComputeBridgeController } from './compute-bridge.controller';

/**
 * ComputeBridge Module
 * 
 * Orchestrates AI provider calls across multiple providers.
 * Provides a unified interface for interacting with different AI services
 * while maintaining provider-specific implementations.
 * 
 * @module ComputeBridgeModule
 */
@Module({
  imports: [],
  controllers: [ComputeBridgeController],
  providers: [ComputeBridgeService],
  exports: [ComputeBridgeService],
})
export class ComputeBridgeModule {}