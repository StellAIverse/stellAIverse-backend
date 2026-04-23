import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { RuleEngineService } from './rule-engine.service';
import { RewardPipelineService } from './reward-pipeline.service';
import { RewardEngineController } from './reward-engine.controller';
import { RewardRule } from './entities/reward-rule.entity';
import { RewardCalculation } from './entities/reward-calculation.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([RewardRule, RewardCalculation]),
    ClientsModule.register([
      {
        name: 'REWARD_PROCESSOR',
        transport: Transport.REDIS,
        options: {
          host: process.env.REDIS_HOST || 'localhost',
          port: parseInt(process.env.REDIS_PORT || '6379'),
        },
      },
    ]),
  ],
  controllers: [RewardEngineController],
  providers: [RuleEngineService, RewardPipelineService],
  exports: [RuleEngineService, RewardPipelineService],
})
export class RewardEngineModule {}