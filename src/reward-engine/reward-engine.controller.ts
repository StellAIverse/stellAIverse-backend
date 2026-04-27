import {
  Controller,
  Post,
  Get,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
  HttpStatus,
  HttpCode,
} from '@nestjs/common';
import { RolesGuard } from '../common/guard/roles.guard';
import { Roles } from '../common/guard/roles.decorator';
import { UserRole } from '../user/entities/user.entity';
import { RuleEngineService } from './rule-engine.service';
import { RewardPipelineService } from './reward-pipeline.service';
import { RuleEvaluationContext } from './interfaces/rule.interface';
import { RewardRule } from './entities/reward-rule.entity';
import { RewardCalculation } from './entities/reward-calculation.entity';

@Controller('reward-engine')
@UseGuards(RolesGuard)
export class RewardEngineController {
  constructor(
    private readonly ruleEngine: RuleEngineService,
    private readonly pipeline: RewardPipelineService,
  ) {}

  /**
   * Evaluates rules for a given context (admin/testing endpoint)
   */
  @Post('evaluate')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async evaluateRules(@Body() context: RuleEvaluationContext) {
    return this.ruleEngine.evaluateRules(context);
  }

  /**
   * Processes a reward event
   */
  @Post('process-event')
  @HttpCode(HttpStatus.ACCEPTED)
  async processRewardEvent(@Body() context: RuleEvaluationContext) {
    await this.pipeline.processRewardEvent(context);
    return { message: 'Reward event queued for processing' };
  }

  /**
   * Gets processing statistics
   */
  @Get('stats')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async getProcessingStats() {
    return this.pipeline.getProcessingStats();
  }

  /**
   * Gets pending calculations
   */
  @Get('pending-calculations')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async getPendingCalculations() {
    return this.pipeline.getPendingCalculations();
  }

  /**
   * Retries a failed calculation
   */
  @Post('retry-calculation/:id')
  @Roles(UserRole.ADMIN)
  async retryCalculation(@Param('id') calculationId: string) {
    await this.pipeline.retryFailedCalculation(calculationId);
    return { message: 'Calculation re-queued for processing' };
  }

  // Rule Management Endpoints

  /**
   * Creates a new reward rule
   */
  @Post('rules')
  @Roles(UserRole.ADMIN)
  async createRule(@Body() ruleData: Partial<RewardRule>) {
    // Validation will be handled by service
    const validation = await this.ruleEngine.validateRule(ruleData);
    if (!validation.valid) {
      return { error: 'Invalid rule', details: validation.errors };
    }

    // In a real implementation, you'd save the rule
    return { message: 'Rule validation successful', rule: ruleData };
  }

  /**
   * Gets all reward rules
   */
  @Get('rules')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async getRules(
    @Query('type') type?: string,
    @Query('active') active?: boolean,
  ) {
    // Implementation would query the database
    return { message: 'Rules endpoint - to be implemented' };
  }

  /**
   * Updates a reward rule
   */
  @Put('rules/:id')
  @Roles(UserRole.ADMIN)
  async updateRule(@Param('id') ruleId: string, @Body() updates: Partial<RewardRule>) {
    return { message: `Rule ${ruleId} update - to be implemented` };
  }

  /**
   * Deletes a reward rule
   */
  @Delete('rules/:id')
  @Roles(UserRole.ADMIN)
  async deleteRule(@Param('id') ruleId: string) {
    return { message: `Rule ${ruleId} deletion - to be implemented` };
  }

  /**
   * Validates a rule configuration
   */
  @Post('rules/validate')
  @Roles(UserRole.ADMIN, UserRole.OPERATOR)
  async validateRule(@Body() rule: Partial<RewardRule>) {
    return this.ruleEngine.validateRule(rule);
  }
}