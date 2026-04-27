import { Injectable, Logger, BadRequestException } from "@nestjs/common";
import { AuditLogService } from "../audit/audit-log.service";
import { RiskManagementService } from "../risk-management/risk-management.service";
import {
  WatchlistEntryDto,
  KycProfileDto,
  ComplianceTransactionDto,
  ComplianceAlertDto,
  FrameworkConfigDto,
  KycStatus,
  ComplianceAlertSeverity,
} from "./dto/compliance.dto";

interface StoredTransaction {
  tx: ComplianceTransactionDto;
  riskScore: number;
  passed: boolean;
  flaggedReasons: string[];
  timestamp: string;
}

interface StoredFrameworkConfig extends FrameworkConfigDto {}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  private readonly watchlist = new Map<string, WatchlistEntryDto>();
  private readonly kycProfiles = new Map<string, KycProfileDto>();
  private readonly transactions = new Map<string, StoredTransaction>();
  private readonly alerts = new Map<string, ComplianceAlertDto[]>();
  private readonly frameworks = new Map<string, StoredFrameworkConfig>();

  constructor(
    private readonly auditLogService: AuditLogService,
    private readonly riskManagementService: RiskManagementService,
  ) {
    // Default frameworks
    this.frameworks.set("FINRA", {
      framework: "FINRA",
      requiredKycLevels: ["verified"],
      transactionThreshold: 100000,
    });
    this.frameworks.set("MiFID", {
      framework: "MiFID",
      requiredKycLevels: ["pending", "verified"],
      transactionThreshold: 50000,
    });
    this.frameworks.set("SEC", {
      framework: "SEC",
      requiredKycLevels: ["verified"],
      transactionThreshold: 250000,
    });
  }

  private maskSensitive(value: string): string {
    if (!value) return value;
    const length = value.length;
    if (length <= 6) return "*".repeat(length);
    return `${value.slice(0, 3)}${"*".repeat(length - 6)}${value.slice(-3)}`;
  }

  addWatchlistEntry(entry: WatchlistEntryDto) {
    if (!entry?.id || !entry?.name) {
      throw new BadRequestException("Watchlist entry must include id and name");
    }
    this.watchlist.set(entry.id, entry);
    this.auditLogService.recordVerification({
      type: "COMPLIANCE",
      action: "watchlist_add",
      entry,
    });
    return entry;
  }

  removeWatchlistEntry(entryId: string) {
    const existed = this.watchlist.delete(entryId);
    this.auditLogService.recordVerification({
      type: "COMPLIANCE",
      action: "watchlist_remove",
      entryId,
      success: existed,
    });
    return { removed: existed };
  }

  listWatchlist() {
    return Array.from(this.watchlist.values());
  }

  submitKyc(profile: KycProfileDto) {
    if (!profile.userId || !profile.fullName || !profile.idNumber) {
      throw new BadRequestException("Missing required KYC profile fields");
    }

    const sanitized: KycProfileDto = {
      ...profile,
      idNumber: this.maskSensitive(profile.idNumber),
    };

    this.kycProfiles.set(profile.userId, sanitized);
    this.auditLogService.recordVerification({
      type: "COMPLIANCE",
      action: "kyc_submit",
      profile: { ...sanitized, idNumber: "REDACTED" },
    });

    return sanitized;
  }

  getKycStatus(userId: string) {
    const profile = this.kycProfiles.get(userId);
    if (!profile) {
      return { userId, status: "not_found" };
    }

    return {
      ...profile,
      idNumber: this.maskSensitive(profile.idNumber),
    };
  }

  getFrameworks() {
    return Array.from(this.frameworks.values());
  }

  addOrUpdateFramework(config: FrameworkConfigDto) {
    if (!config.framework) {
      throw new BadRequestException("Framework name is required");
    }
    this.frameworks.set(config.framework, config);
    this.auditLogService.recordVerification({
      type: "COMPLIANCE",
      action: "framework_update",
      config,
    });
    return config;
  }

  async evaluateTransaction(tx: ComplianceTransactionDto) {
    if (
      !tx ||
      !tx.txId ||
      !tx.userId ||
      !tx.fromAddress ||
      !tx.toAddress ||
      tx.amount === undefined
    ) {
      throw new BadRequestException("Missing required transaction fields");
    }

    if (tx.amount <= 0) {
      throw new BadRequestException("Transaction amount must be positive");
    }

    const suspiciousReasons: string[] = [];

    let riskScore = 10;

    if (tx.amount >= 1000000) {
      riskScore += 40;
      suspiciousReasons.push("High value transaction");
    } else if (tx.amount >= 100000) {
      riskScore += 20;
      suspiciousReasons.push("Large transaction");
    }

    if (this.isAddressWatchlisted(tx.fromAddress)) {
      riskScore += 40;
      suspiciousReasons.push("From address is watchlisted");
    }

    if (this.isAddressWatchlisted(tx.toAddress)) {
      riskScore += 40;
      suspiciousReasons.push("To address is watchlisted");
    }

    const sourceHighRisk =
      tx.sourceCountry &&
      ["IR", "KP", "SY", "CU"].includes(tx.sourceCountry.toUpperCase());
    const destHighRisk =
      tx.destinationCountry &&
      ["IR", "KP", "SY", "CU"].includes(tx.destinationCountry.toUpperCase());

    if (sourceHighRisk || destHighRisk) {
      riskScore += 20;
      suspiciousReasons.push("High-risk jurisdiction involved");
    }

    const kycProfile = this.kycProfiles.get(tx.userId);
    if (!kycProfile || kycProfile.status !== KycStatus.VERIFIED) {
      riskScore += 20;
      suspiciousReasons.push("Unverified or missing KYC profile");
    }

    // Integrate with existing risk management heuristics
    try {
      const fakePosition = [
        {
          asset: tx.asset,
          value: tx.amount,
          weight: 1,
          volatility: 0.5,
          entryPrice: 0,
          currentPrice: 0,
        },
      ];
      const portfolioRisk =
        await this.riskManagementService.calculatePortfolioRisk(
          tx.userId,
          fakePosition,
        );
      // Normalize by total value and use as additional factor
      riskScore += Math.min(
        20,
        portfolioRisk?.riskScore ? portfolioRisk.riskScore / 5 : 0,
      );
    } catch (error) {
      this.logger.warn(
        "Risk calculation integration failed",
        error?.message ?? error,
      );
    }

    riskScore = Math.min(100, Math.max(0, riskScore));
    const flagged = riskScore >= 70;
    const severity =
      riskScore >= 90
        ? ComplianceAlertSeverity.CRITICAL
        : riskScore >= 75
          ? ComplianceAlertSeverity.HIGH
          : riskScore >= 50
            ? ComplianceAlertSeverity.MEDIUM
            : ComplianceAlertSeverity.LOW;

    const alert: ComplianceAlertDto = {
      type: "transaction_surveillance",
      severity,
      message: flagged
        ? `Transaction ${tx.txId} flagged for review`
        : `Transaction ${tx.txId} cleared`,
      txId: tx.txId,
      score: riskScore,
      triggeredAt: new Date().toISOString(),
    };

    const txRecord: StoredTransaction = {
      tx,
      riskScore,
      passed: !flagged,
      flaggedReasons: suspiciousReasons,
      timestamp: tx.timestamp || new Date().toISOString(),
    };

    this.transactions.set(tx.txId, txRecord);

    const userAlerts = this.alerts.get(tx.userId) ?? [];
    userAlerts.push(alert);
    this.alerts.set(tx.userId, userAlerts);

    this.auditLogService.recordVerification({
      type: "COMPLIANCE",
      action: "transaction_surveillance",
      txId: tx.txId,
      userId: tx.userId,
      riskScore,
      flagged,
      flaggedReasons: suspiciousReasons,
      framework: this.getApplicableFramework(tx),
    });

    return {
      ...txRecord,
      alert,
    };
  }

  private isAddressWatchlisted(address: string): boolean {
    const normalized = address.trim().toLowerCase();
    return Array.from(this.watchlist.values()).some(
      (entry) => entry.address?.toLowerCase() === normalized,
    );
  }

  private getApplicableFramework(tx: ComplianceTransactionDto): string | null {
    for (const config of this.frameworks.values()) {
      if (
        config.transactionThreshold &&
        tx.amount >= config.transactionThreshold
      ) {
        return config.framework;
      }
    }
    return null;
  }

  getTransaction(txId: string) {
    const record = this.transactions.get(txId);
    if (!record) {
      throw new BadRequestException(`Transaction ${txId} not found`);
    }
    return record;
  }

  getAlerts(userId: string) {
    return this.alerts.get(userId) ?? [];
  }

  generateRegulatoryReport(framework?: string) {
    const selected = framework ? this.frameworks.get(framework) : null;
    const transactions = Array.from(this.transactions.values());
    const totalTransactions = transactions.length;
    const suspiciousCount = transactions.filter(
      (t) => t.riskScore >= 70,
    ).length;
    const highRiskCount = transactions.filter((t) => t.riskScore >= 90).length;

    const report = {
      framework: framework || "Global",
      totalTransactions,
      suspiciousCount,
      highRiskCount,
      openAlerts: Array.from(this.alerts.entries()).reduce(
        (acc, [userId, alerts]) => {
          acc[userId] = alerts.filter(
            (a) =>
              a.severity === ComplianceAlertSeverity.HIGH ||
              a.severity === ComplianceAlertSeverity.CRITICAL,
          );
          return acc;
        },
        {} as Record<string, ComplianceAlertDto[]>,
      ),
      generatedAt: new Date().toISOString(),
      detectedWatchlistMatches: transactions
        .filter(
          (t) =>
            this.isAddressWatchlisted(t.tx.fromAddress) ||
            this.isAddressWatchlisted(t.tx.toAddress),
        )
        .map((t) => t.tx.txId),
    };

    this.auditLogService.recordVerification({
      type: "COMPLIANCE",
      action: "regulatory_report",
      report: { ...report, sensitive: "redacted" },
    });
    return selected ? { ...report, framework: selected.framework } : report;
  }
}
