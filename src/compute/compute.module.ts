import { Module } from "@nestjs/common";
import { ComputeController } from "./compute.controller";
import { ComputeService } from "./compute.service";
import { ComputeBridgeService } from "./compute-bridge.service";
import { OpenAIAdapter } from "./providers/openai.adapter";
import { MockAdapter } from "./providers/mock.adapter";

@Module({
  controllers: [ComputeController],
  providers: [ComputeService, ComputeBridgeService, OpenAIAdapter, MockAdapter],
  exports: [ComputeService, ComputeBridgeService],
})
export class ComputeModule {}
