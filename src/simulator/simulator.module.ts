import { Module } from "@nestjs/common";
import { SimulatorService } from "./simulator.service";
import { SimulatorController } from "./simulator.controller";
import { MockProviderFactory } from "./mock-provider.factory";
import { EnvironmentConfigService } from "./enviroment-config.service";
import { SimulationStateManager } from "./state/simulation-state.manager";
import { AgentExecutor } from "./agent-executor";
import { MockHttpProvider } from "./mock-http.provider";
import { MockDatabaseProvider } from "./mock-database.provider";
import { MockMessageQueueProvider } from "./mock-message-queue.provider";
import { SimulationLogger } from "./simulation.logger";
import { EnvironmentLoaderService } from "./environment-loader.service";
import { EnvironmentRegistryService } from "./environment-registry.service";

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
    EnvironmentLoaderService,
    EnvironmentRegistryService,
  ],
  controllers: [SimulatorController],
  exports: [
    SimulatorService,
    EnvironmentConfigService,
    EnvironmentLoaderService,
    EnvironmentRegistryService,
  ],
})
export class SimulatorModule {}
