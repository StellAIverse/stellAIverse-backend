import { Module } from '@nestjs/common';
import { SimulatorService } from './simulator.service';
import { SimulatorController } from './simulator.controller';
import { MockProviderFactory } from './providers/mock-provider.factory';
import { EnvironmentConfigService } from './config/environment-config.service';
import { SimulationStateManager } from './state/simulation-state.manager';
import { AgentExecutor } from './executors/agent.executor';
import { MockHttpProvider } from './providers/mock-http.provider';
import { MockDatabaseProvider } from './providers/mock-database.provider';
import { MockMessageQueueProvider } from './providers/mock-message-queue.provider';
import { SimulationLogger } from './logging/simulation.logger';

@Module({
  providers: [
    SimulatorService,
    MockProviderFactory,
    EnvironmentConfigService,
    SimulationStateManager,
    AgentExecutor,
    MockHttpProvider,
    MockDatabaseProvider,
    MockMessageQueueProvider,
    SimulationLogger,
  ],
  controllers: [SimulatorController],
  exports: [SimulatorService, EnvironmentConfigService],
})
export class SimulatorModule {}