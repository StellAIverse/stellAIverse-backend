import { Module } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { BullModule } from "@nestjs/bull";

// Entities
import { DeFiPosition } from "./entities/defi-position.entity";
import { DeFiYieldRecord } from "./entities/defi-yield-record.entity";
import { DeFiTransaction } from "./entities/defi-transaction.entity";
import { DeFiYieldStrategy } from "./entities/defi-yield-strategy.entity";
import { DeFiRiskAssessment } from "./entities/defi-risk-assessment.entity";

// Services
import { PositionTrackingService } from "./services/position-tracking.service";
import { YieldOptimizationService } from "./services/yield-optimization.service";
import { RiskAssessmentService } from "./services/risk-assessment.service";
import { TransactionOptimizationService } from "./services/transaction-optimization.service";

// Protocol Adapters
import { AaveAdapter } from "./protocols/aave.adapter";
import { CompoundAdapter } from "./protocols/compound.adapter";
import { ProtocolRegistry } from "./protocols/protocol-registry";

// Controller
import { DeFiController } from "./defi.controller";
import { TradeController } from "./trade.controller";
import { TradeLockService } from "./trade-lock.service";

@Module({
  imports: [
    TypeOrmModule.forFeature([
      DeFiPosition,
      DeFiYieldRecord,
      DeFiTransaction,
      DeFiYieldStrategy,
      DeFiRiskAssessment,
    ]),
    BullModule.registerQueue(
      {
        name: "defi-position-sync",
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        },
      },
      {
        name: "defi-yield-optimization",
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: "exponential",
            delay: 5000,
          },
        },
      },
      {
        name: "defi-risk-monitoring",
        defaultJobOptions: {
          attempts: 2,
          backoff: {
            type: "exponential",
            delay: 3000,
          },
        },
      },
      {
        name: "defi-transaction-execution",
        defaultJobOptions: {
          attempts: 5,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
        },
      },
      {
        name: "defi-emergency-exit",
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 1000,
          },
          priority: 10, // High priority
        },
      },
    ),
  ],
  providers: [
    // Protocol Adapters
    AaveAdapter,
    CompoundAdapter,
    ProtocolRegistry,

    // Services
    PositionTrackingService,
    YieldOptimizationService,
    RiskAssessmentService,
    TransactionOptimizationService,
    TradeLockService,
  ],
  controllers: [DeFiController, TradeController],
  exports: [
    ProtocolRegistry,
    PositionTrackingService,
    YieldOptimizationService,
    RiskAssessmentService,
    TransactionOptimizationService,
    TradeLockService,
  ],
})
export class DeFiModule {}
