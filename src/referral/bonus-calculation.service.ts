import { Injectable, Logger, NotFoundException, BadRequestException } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, MoreThanOrEqual, LessThanOrEqual } from "typeorm";
import { BonusConfiguration, BonusCategory, TimeDecayType } from "./bonus-configuration.entity";
import { BonusCalculation } from "./bonus-calculation.entity";
import { CalculateBonusDto, BonusCalculationResultDto, CreateBonusConfigurationDto, UpdateBonusConfigurationDto } from "./dto/bonus-calculation.dto";
import { User } from "../user/entities/user.entity";
import { AuditLogService } from "../audit/audit-log.service";

@Injectable()
export class BonusCalculationService {
  private readonly logger = new Logger(BonusCalculationService.name);

  constructor(
    @InjectRepository(BonusConfiguration)
    private readonly bonusConfigRepository: Repository<BonusConfiguration>,
    @InjectRepository(BonusCalculation)
    private readonly bonusCalculationRepository: Repository<BonusCalculation>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditLogService: AuditLogService,
  ) {}

  /**
   * Create a new bonus configuration
   */
  async createConfiguration(dto: CreateBonusConfigurationDto): Promise<BonusConfiguration> {
    const config = this.bonusConfigRepository.create(dto);
    const saved = await this.bonusConfigRepository.save(config);
    this.logger.log(`Created bonus configuration: ${saved.name}`);
    
    await this.auditLogService.recordVerification({
      event: "BONUS_CONFIG_CREATED",
      configId: saved.id,
      category: saved.category,
      timestamp: new Date(),
    });
    
    return saved;
  }

  /**
   * Update an existing bonus configuration
   */
  async updateConfiguration(id: string, dto: UpdateBonusConfigurationDto): Promise<BonusConfiguration> {
    const config = await this.bonusConfigRepository.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`Bonus configuration with ID ${id} not found`);
    }

    Object.assign(config, dto);
    const updated = await this.bonusConfigRepository.save(config);
    this.logger.log(`Updated bonus configuration: ${updated.name}`);
    
    await this.auditLogService.recordVerification({
      event: "BONUS_CONFIG_UPDATED",
      configId: updated.id,
      category: updated.category,
      timestamp: new Date(),
    });
    
    return updated;
  }

  /**
   * Get all active bonus configurations
   */
  async getActiveConfigurations(category?: BonusCategory): Promise<BonusConfiguration[]> {
    const query = this.bonusConfigRepository
      .createQueryBuilder("config")
      .where("config.isActive = :isActive", { isActive: true });

    if (category) {
      query.andWhere("config.category = :category", { category });
    }

    const now = new Date();
    query.andWhere(
      "(config.startDate IS NULL OR config.startDate <= :now) AND (config.endDate IS NULL OR config.endDate >= :now)",
      { now }
    );

    return query.getMany();
  }

  /**
   * Calculate bonus for a user with weighted calculations, time decay, and compounding
   */
  async calculateBonus(dto: CalculateBonusDto): Promise<BonusCalculationResultDto> {
    const { userId, category, baseAmount, metadata } = dto;

    // Verify user exists
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Get active configurations for this category
    const configs = await this.getActiveConfigurations(category);
    if (configs.length === 0) {
      throw new BadRequestException(`No active bonus configurations found for category: ${category}`);
    }

    let totalFinalAmount = 0;
    let totalCompoundBonus = 0;
    const calculationDetails: any[] = [];

    for (const config of configs) {
      // Check minimum threshold
      if (baseAmount < config.minimumThreshold) {
        this.logger.debug(`Base amount ${baseAmount} below threshold ${config.minimumThreshold} for config ${config.name}`);
        continue;
      }

      // Calculate weighted amount
      const weightedAmount = baseAmount * config.baseWeight;

      // Apply bonus multiplier
      const multipliedAmount = weightedAmount * (1 + config.bonusMultiplier / 100);

      // Calculate time decay factor
      const decayFactor = this.calculateDecayFactor(config);

      // Apply decay
      const decayedAmount = multipliedAmount * decayFactor;

      // Calculate compound bonus if enabled
      let compoundBonus = 0;
      if (config.allowCompounding && config.compoundMultiplier > 0) {
        compoundBonus = await this.calculateCompoundBonus(userId, config);
      }

      // Calculate final amount with compound bonus
      let finalAmount = decayedAmount + compoundBonus;

      // Apply maximum bonus cap
      if (finalAmount > config.maximumBonus) {
        finalAmount = config.maximumBonus;
      }

      totalFinalAmount += finalAmount;
      totalCompoundBonus += compoundBonus;

      calculationDetails.push({
        configId: config.id,
        configName: config.name,
        baseWeight: config.baseWeight,
        bonusMultiplier: config.bonusMultiplier,
        decayFactor,
        compoundBonus,
        finalAmount,
      });
    }

    // Create bonus calculation record
    const calculation = this.bonusCalculationRepository.create({
      userId,
      category,
      baseAmount,
      appliedWeight: configs.reduce((sum, c) => sum + c.baseWeight, 0) / configs.length,
      decayFactor: calculationDetails.length > 0 
        ? calculationDetails.reduce((sum, d) => sum + d.decayFactor, 0) / calculationDetails.length 
        : 1,
      compoundBonus: totalCompoundBonus,
      finalAmount: totalFinalAmount,
      decayType: configs[0]?.decayType || TimeDecayType.NONE,
      status: "calculated",
      daysSinceEligible: 0,
      calculationDetails: {
        configurations: calculationDetails,
        metadata,
      },
    });

    await this.bonusCalculationRepository.save(calculation);

    this.logger.log(`Calculated bonus for user ${userId}: ${totalFinalAmount} (category: ${category})`);

    await this.auditLogService.recordVerification({
      event: "BONUS_CALCULATED",
      userId,
      category,
      baseAmount,
      finalAmount: totalFinalAmount,
      timestamp: new Date(),
    });

    return {
      userId,
      category,
      baseAmount,
      appliedWeight: calculation.appliedWeight,
      decayFactor: calculation.decayFactor,
      compoundBonus: totalCompoundBonus,
      finalAmount: totalFinalAmount,
      decayType: calculation.decayType,
      calculationDetails: calculation.calculationDetails,
    };
  }

  /**
   * Calculate time decay factor based on configuration
   */
  private calculateDecayFactor(config: BonusConfiguration): number {
    if (config.decayType === TimeDecayType.NONE || config.decayRate === 0) {
      return 1.0;
    }

    const now = new Date();
    const startDate = config.startDate || config.createdAt;
    const daysElapsed = Math.floor(
      (now.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    switch (config.decayType) {
      case TimeDecayType.LINEAR:
        // Linear decay: reduces by decayRate% per day
        const linearFactor = 1 - (config.decayRate / 100) * daysElapsed;
        return Math.max(0, Math.min(1, linearFactor));

      case TimeDecayType.EXPONENTIAL:
        // Exponential decay: e^(-rate * time)
        const exponentialFactor = Math.exp(-(config.decayRate / 100) * daysElapsed);
        return Math.max(0, Math.min(1, exponentialFactor));

      case TimeDecayType.LOGARITHMIC:
        // Logarithmic decay: 1 / (1 + rate * log(time + 1))
        const logFactor = 1 / (1 + (config.decayRate / 100) * Math.log(daysElapsed + 1));
        return Math.max(0, Math.min(1, logFactor));

      default:
        return 1.0;
    }
  }

  /**
   * Calculate compound bonus based on user's previous bonuses
   */
  private async calculateCompoundBonus(
    userId: string,
    config: BonusConfiguration
  ): Promise<number> {
    // Get user's previous bonuses in the same category
    const previousBonuses = await this.bonusCalculationRepository.find({
      where: {
        userId,
        category: config.category,
        status: "calculated",
      },
      order: { calculatedAt: "DESC" },
      take: 10, // Look at last 10 bonuses
    });

    if (previousBonuses.length === 0) {
      return 0;
    }

    // Calculate average of previous bonuses
    const totalPrevious = previousBonuses.reduce(
      (sum, bonus) => sum + Number(bonus.finalAmount),
      0
    );
    const averagePrevious = totalPrevious / previousBonuses.length;

    // Apply compound multiplier
    return averagePrevious * (config.compoundMultiplier / 100);
  }

  /**
   * Get bonus calculations for a user
   */
  async getUserBonuses(userId: string, category?: BonusCategory): Promise<BonusCalculation[]> {
    const query = this.bonusCalculationRepository
      .createQueryBuilder("calculation")
      .where("calculation.userId = :userId", { userId });

    if (category) {
      query.andWhere("calculation.category = :category", { category });
    }

    return query.orderBy("calculation.calculatedAt", "DESC").getMany();
  }

  /**
   * Get total bonuses for a user across all categories
   */
  async getUserTotalBonuses(userId: string): Promise<Record<string, number>> {
    const bonuses = await this.bonusCalculationRepository.find({
      where: { userId, status: "calculated" },
    });

    const totals: Record<string, number> = {};
    for (const bonus of bonuses) {
      const category = bonus.category;
      if (!totals[category]) {
        totals[category] = 0;
      }
      totals[category] += Number(bonus.finalAmount);
    }

    return totals;
  }

  /**
   * Detect potential gaming patterns and apply fair distribution
   */
  async detectGamingPatterns(userId: string): Promise<{ isGaming: boolean; riskScore: number }> {
    const recentBonuses = await this.bonusCalculationRepository.find({
      where: {
        userId,
        calculatedAt: MoreThanOrEqual(new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)), // Last 7 days
      },
      order: { calculatedAt: "ASC" },
    });

    if (recentBonuses.length < 3) {
      return { isGaming: false, riskScore: 0 };
    }

    // Check for unusual frequency
    const timeDiffs = [];
    for (let i = 1; i < recentBonuses.length; i++) {
      const diff = recentBonuses[i].calculatedAt.getTime() - recentBonuses[i - 1].calculatedAt.getTime();
      timeDiffs.push(diff);
    }

    const avgTimeDiff = timeDiffs.reduce((sum, diff) => sum + diff, 0) / timeDiffs.length;
    const variance = timeDiffs.reduce((sum, diff) => sum + Math.pow(diff - avgTimeDiff, 2), 0) / timeDiffs.length;
    const stdDev = Math.sqrt(variance);

    // Low variance in timing suggests automated behavior
    const timingRisk = stdDev < 3600000 ? 0.5 : 0; // Less than 1 hour variance

    // Check for unusual amounts
    const amounts = recentBonuses.map(b => Number(b.finalAmount));
    const avgAmount = amounts.reduce((sum, amt) => sum + amt, 0) / amounts.length;
    const amountVariance = amounts.reduce((sum, amt) => sum + Math.pow(amt - avgAmount, 2), 0) / amounts.length;
    const amountStdDev = Math.sqrt(amountVariance);

    // Very consistent amounts suggest gaming
    const amountRisk = amountStdDev < avgAmount * 0.1 ? 0.5 : 0; // Less than 10% variance

    const totalRisk = timingRisk + amountRisk;

    return {
      isGaming: totalRisk >= 0.7,
      riskScore: Math.min(1, totalRisk),
    };
  }

  /**
   * Apply fair distribution adjustments
   */
  async applyFairDistribution(
    userId: string,
    calculatedAmount: number,
    category: BonusCategory
  ): Promise<number> {
    const { isGaming, riskScore } = await this.detectGamingPatterns(userId);

    if (isGaming) {
      // Reduce bonus based on risk score
      const adjustedAmount = calculatedAmount * (1 - riskScore * 0.5);
      this.logger.warn(`Gaming detected for user ${userId}, reducing bonus by ${riskScore * 100}%`);
      
      await this.auditLogService.recordVerification({
        event: "BONUS_GAMING_DETECTED",
        userId,
        category,
        originalAmount: calculatedAmount,
        adjustedAmount,
        riskScore,
        timestamp: new Date(),
      });

      return adjustedAmount;
    }

    return calculatedAmount;
  }

  /**
   * Delete a bonus configuration
   */
  async deleteConfiguration(id: string): Promise<void> {
    const config = await this.bonusConfigRepository.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`Bonus configuration with ID ${id} not found`);
    }

    await this.bonusConfigRepository.remove(config);
    this.logger.log(`Deleted bonus configuration: ${config.name}`);
  }

  /**
   * Get a specific bonus configuration
   */
  async getConfiguration(id: string): Promise<BonusConfiguration> {
    const config = await this.bonusConfigRepository.findOne({ where: { id } });
    if (!config) {
      throw new NotFoundException(`Bonus configuration with ID ${id} not found`);
    }
    return config;
  }
}
