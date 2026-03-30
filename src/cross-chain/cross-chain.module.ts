import { Module } from "@nestjs/common";
import { CrossChainService } from "./cross-chain.service";
import { CrossChainController } from "./cross-chain.controller";

@Module({
  controllers: [CrossChainController],
  providers: [CrossChainService],
  exports: [CrossChainService],
})
export class CrossChainModule {}
