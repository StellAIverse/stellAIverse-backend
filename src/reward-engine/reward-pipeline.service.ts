import { Injectable, Logger, Inject, OnModuleInit } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RewardCalculation } from './entities/reward-calculation.entity';
import { RuleEngineService } from './rule-engine.service';
import { RuleEvaluationContext, RuleAction } from './interfaces/rule.interface';
import { ClientProxy } from '@nestjs/microservices';
import { catchError, timeout } from 'rxjs/operators';
import { of } from 'rxjs';

@Injectable()
export class RewardPipelineService implements OnModuleInit {
  private readonly logger = new Logger(RewardPipelineService.name);
  private processingQueue: string[] = [];
  private isProcessing = false;

  constructor(
    @InjectRepository(RewardCalculation)
    private readonly calculationRepository: Repository<RewardCalculation>,
    private readonly ruleEngine: RuleEngineService,
    @Inject('REWARD_PROCESSOR') private readonly rewardProcessorClient: ClientProxy,
  ) {}

  onModuleInit() {
    // Start background processing
    this.startProcessingQueue();
  }

  /**
   * Processes a reward event through the pipeline
   */
  async processRewardEvent(context: RuleEvaluationContext): Promise<void> {
    this.logger.log(`Processing reward event: ${context.eventType} for user ${context.userId}`);

    try {
      // 1. Evaluate rules
      const actions = await this.ruleEngine.evaluateRules(context);

      if (actions.length === 0) {
        this.logger.debug(`No matching rules for event ${context.eventType}`);
        return;
      }

      // 2. Create calculations for each action
      const calculations = [];
      for (const action of actions) {
        const calculation = this.calculationRepository.create({
          ruleId: 'pending', // Will be set by rule engine
          userId: context.userId,
          eventType: context.eventType,
          context,
          action,
          calculatedAmount: typeof action.amount === 'number' ? action.amount : 0,
        });
        calculations.push(calculation);
      }

      await this.calculationRepository.save(calculations);

      // 3. Queue for processing
      for (const calc of calculations) {
        this.processingQueue.push(calc.id);
      }

      this.logger.log(`Queued ${calculations.length} reward calculations for processing`);

    } catch (error) {
      this.logger.error(`Error processing reward event:`, error);
      throw error;
    }
  }

  /**
   * Processes pending reward calculations
   */
  private async startProcessingQueue(): Promise<void> {
    setInterval(async () => {
      if (this.isProcessing || this.processingQueue.length === 0) {
        return;
      }

      this.isProcessing = true;

      try {
        const calculationId = this.processingQueue.shift();
        if (calculationId) {
          await this.processCalculation(calculationId);
        }
      } catch (error) {
        this.logger.error('Error processing calculation from queue:', error);
      } finally {
        this.isProcessing = false;
      }
    }, 1000); // Process every second
  }

  /**
   * Processes a single reward calculation
   */
  private async processCalculation(calculationId: string): Promise<void> {
    const calculation = await this.calculationRepository.findOne({
      where: { id: calculationId, processed: false },
      relations: ['rule'],
    });

    if (!calculation) {
      return;
    }

    try {
      this.logger.debug(`Processing calculation ${calculationId}`);

      // Send to reward processor service
      const result = await this.rewardProcessorClient
        .send('process_reward', {
          calculationId,
          action: calculation.action,
          userId: calculation.userId,
          context: calculation.context,
        })
        .pipe(
          timeout(30000), // 30 second timeout
          catchError(error => {
            this.logger.error(`Reward processing failed for ${calculationId}:`, error);
            return of({ success: false, error: error.message });
          })
        )
        .toPromise();

      // Update calculation status
      calculation.processed = true;
      calculation.processedAt = new Date();
      calculation.processingResult = result;

      await this.calculationRepository.save(calculation);

      if (result.success) {
        this.logger.log(`Successfully processed reward calculation ${calculationId}`);
      } else {
        this.logger.warn(`Reward calculation ${calculationId} failed: ${result.error}`);
      }

    } catch (error) {
      this.logger.error(`Error processing calculation ${calculationId}:`, error);

      // Mark as failed
      calculation.processed = true;
      calculation.processedAt = new Date();
      calculation.processingResult = { success: false, error: error.message };

      await this.calculationRepository.save(calculation);
    }
  }

  /**
   * Gets pending calculations for monitoring
   */
  async getPendingCalculations(): Promise<RewardCalculation[]> {
    return this.calculationRepository.find({
      where: { processed: false },
      order: { calculatedAt: 'ASC' },
      take: 100,
    });
  }

  /**
   * Manually retry failed calculations
   */
  async retryFailedCalculation(calculationId: string): Promise<void> {
    const calculation = await this.calculationRepository.findOne({
      where: { id: calculationId, processed: true },
    });

    if (!calculation || !calculation.processingResult?.success === false) {
      throw new Error('Calculation not found or not failed');
    }

    // Reset and re-queue
    calculation.processed = false;
    calculation.processedAt = null;
    calculation.processingResult = null;

    await this.calculationRepository.save(calculation);
    this.processingQueue.push(calculationId);

    this.logger.log(`Re-queued failed calculation ${calculationId} for retry`);
  }

  /**
   * Gets processing statistics
   */
  async getProcessingStats(): Promise<{
    queueLength: number;
    pendingCount: number;
    processedToday: number;
    failedToday: number;
  }> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [pendingCount, processedToday, failedToday] = await Promise.all([
      this.calculationRepository.count({ where: { processed: false } }),
      this.calculationRepository.count({
        where: {
          processed: true,
          processedAt: { $gte: today } as any,
          'processingResult.success': true,
        },
      }),
      this.calculationRepository.count({
        where: {
          processed: true,
          processedAt: { $gte: today } as any,
          'processingResult.success': false,
        },
      }),
    ]);

    return {
      queueLength: this.processingQueue.length,
      pendingCount,
      processedToday,
      failedToday,
    };
  }
}