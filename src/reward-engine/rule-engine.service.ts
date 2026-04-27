import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { RewardRule } from './entities/reward-rule.entity';
import { RewardCalculation } from './entities/reward-calculation.entity';
import { RuleCondition, RuleAction, RuleEvaluationContext } from './interfaces/rule.interface';

@Injectable()
export class RuleEngineService {
  private readonly logger = new Logger(RuleEngineService.name);

  constructor(
    @InjectRepository(RewardRule)
    private readonly ruleRepository: Repository<RewardRule>,
    @InjectRepository(RewardCalculation)
    private readonly calculationRepository: Repository<RewardCalculation>,
  ) {}

  /**
   * Evaluates all active rules against the given context
   */
  async evaluateRules(context: RuleEvaluationContext): Promise<RuleAction[]> {
    const activeRules = await this.ruleRepository.find({
      where: { isActive: true },
      order: { priority: 'ASC' },
    });

    const actions: RuleAction[] = [];

    for (const rule of activeRules) {
      try {
        const matches = await this.evaluateRule(rule, context);
        if (matches) {
          const action = await this.executeRuleAction(rule, context);
          if (action) {
            actions.push(action);

            // Log the calculation
            await this.logCalculation(rule, context, action);
          }
        }
      } catch (error) {
        this.logger.error(`Error evaluating rule ${rule.id}:`, error);
      }
    }

    return actions;
  }

  /**
   * Evaluates a single rule against the context
   */
  private async evaluateRule(rule: RewardRule, context: RuleEvaluationContext): Promise<boolean> {
    const conditions = rule.conditions as RuleCondition[];

    for (const condition of conditions) {
      const result = await this.evaluateCondition(condition, context);
      if (!result) {
        return false;
      }
    }

    return true;
  }

  /**
   * Evaluates a single condition
   */
  private async evaluateCondition(condition: RuleCondition, context: RuleEvaluationContext): Promise<boolean> {
    const { field, operator, value, type } = condition;

    // Get the actual value from context
    const actualValue = this.getFieldValue(context, field);

    switch (operator) {
      case 'equals':
        return actualValue === value;
      case 'not_equals':
        return actualValue !== value;
      case 'greater_than':
        return this.compareValues(actualValue, value, type) > 0;
      case 'less_than':
        return this.compareValues(actualValue, value, type) < 0;
      case 'greater_equal':
        return this.compareValues(actualValue, value, type) >= 0;
      case 'less_equal':
        return this.compareValues(actualValue, value, type) <= 0;
      case 'contains':
        return Array.isArray(actualValue) ? actualValue.includes(value) : String(actualValue).includes(String(value));
      case 'in':
        return Array.isArray(value) ? value.includes(actualValue) : false;
      case 'regex':
        return new RegExp(value).test(String(actualValue));
      default:
        return false;
    }
  }

  /**
   * Executes the rule action
   */
  private async executeRuleAction(rule: RewardRule, context: RuleEvaluationContext): Promise<RuleAction | null> {
    const action = rule.action as RuleAction;

    // Calculate dynamic values
    if (action.amount && typeof action.amount === 'string') {
      action.amount = this.calculateDynamicValue(action.amount, context);
    }

    return action;
  }

  /**
   * Gets field value from context using dot notation
   */
  private getFieldValue(context: RuleEvaluationContext, field: string): any {
    return field.split('.').reduce((obj, key) => obj?.[key], context);
  }

  /**
   * Compares values based on type
   */
  private compareValues(actual: any, expected: any, type: string): number {
    if (type === 'number') {
      return Number(actual) - Number(expected);
    }
    if (type === 'date') {
      return new Date(actual).getTime() - new Date(expected).getTime();
    }
    return String(actual).localeCompare(String(expected));
  }

  /**
   * Calculates dynamic values using expressions
   */
  private calculateDynamicValue(expression: string, context: RuleEvaluationContext): number {
    // Simple expression evaluation (e.g., "user.level * 10" or "transaction.amount * 0.05")
    try {
      // Replace context variables
      let processedExpression = expression;

      // Replace field references
      const fieldRegex = /\b(\w+(?:\.\w+)*)\b/g;
      processedExpression = processedExpression.replace(fieldRegex, (match) => {
        const value = this.getFieldValue(context, match);
        return typeof value === 'number' ? value.toString() : `'${value}'`;
      });

      // Evaluate the expression (in production, use a safer evaluation method)
      return Function(`"use strict"; return (${processedExpression})`)();
    } catch (error) {
      this.logger.error(`Error evaluating expression "${expression}":`, error);
      return 0;
    }
  }

  /**
   * Logs the reward calculation
   */
  private async logCalculation(rule: RewardRule, context: RuleEvaluationContext, action: RuleAction): Promise<void> {
    const calculation = this.calculationRepository.create({
      ruleId: rule.id,
      userId: context.userId,
      eventType: context.eventType,
      context: context,
      action: action,
      calculatedAt: new Date(),
    });

    await this.calculationRepository.save(calculation);
  }

  /**
   * Validates a rule configuration
   */
  async validateRule(rule: Partial<RewardRule>): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    if (!rule.name) errors.push('Rule name is required');
    if (!rule.conditions || !Array.isArray(rule.conditions)) errors.push('Conditions must be an array');
    if (!rule.action) errors.push('Action is required');

    // Validate conditions
    if (rule.conditions) {
      for (let i = 0; i < rule.conditions.length; i++) {
        const condition = rule.conditions[i] as RuleCondition;
        if (!condition.field) errors.push(`Condition ${i}: field is required`);
        if (!condition.operator) errors.push(`Condition ${i}: operator is required`);
        if (condition.value === undefined) errors.push(`Condition ${i}: value is required`);
      }
    }

    // Validate action
    if (rule.action) {
      const action = rule.action as RuleAction;
      if (!action.type) errors.push('Action type is required');
      if (action.amount !== undefined && typeof action.amount !== 'number' && typeof action.amount !== 'string') {
        errors.push('Action amount must be a number or expression string');
      }
    }

    return { valid: errors.length === 0, errors };
  }
}