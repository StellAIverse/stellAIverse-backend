import { Test, TestingModule } from '@nestjs/testing';
import { ComplianceService } from '../../src/compliance/compliance.service';
import { AuditLogService } from '../../src/audit/audit-log.service';
import { RiskManagementService } from '../../src/risk-management/risk-management.service';
import { KycStatusTransitionService } from '../../src/compliance/kyc-status-transition.service';
import {
  KycStatus,
  ComplianceTransactionDto,
  WatchlistEntryDto,
  KycProfileDto,
  FrameworkConfigDto,
} from '../../src/compliance/dto/compliance.dto';

describe('ComplianceService', () => {
  let service: ComplianceService;
  let auditService: AuditLogService;
  const operator = { id: 'kyc-operator-1', role: 'kyc_operator' };
  const mockRiskService = {
    calculatePortfolioRisk: jest.fn().mockResolvedValue({
      userId: 'user1',
      totalValue: 100000,
      riskScore: 20,
      var95: 0,
      var99: 0,
      cvar95: 0,
      sharpeRatio: 0,
      maxDrawdown: 0,
      currentDrawdown: 0,
      diversificationScore: 0.5,
      alerts: [],
      calculatedAt: new Date(),
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComplianceService,
        AuditLogService,
        KycStatusTransitionService,
        { provide: RiskManagementService, useValue: mockRiskService },
      ],
    }).compile();

    service = module.get<ComplianceService>(ComplianceService);
    auditService = module.get<AuditLogService>(AuditLogService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should add and remove watchlist entries', () => {
    const entry: WatchlistEntryDto = { id: '1', name: 'Bad Actor', address: '0xBADD', country: 'US', riskCategory: 'high' };
    expect(service.addWatchlistEntry(entry)).toEqual(entry);
    expect(service.listWatchlist()).toHaveLength(1);
    expect(service.removeWatchlistEntry('1')).toEqual({ removed: true });
    expect(service.listWatchlist()).toHaveLength(0);
  });

  it('should submit KYC profile and mask id', () => {
    const profile: KycProfileDto = {
      userId: 'user1',
      fullName: 'Alice',
      dateOfBirth: '1990-01-01',
      country: 'US',
      idNumber: '123456789',
      status: KycStatus.PENDING,
    };

    const result = service.submitKyc(profile, operator);
    expect(result.idNumber).not.toEqual('123456789');
    expect(result.status).toEqual(KycStatus.PENDING);
  });

  it('should reject pending to verified transition', () => {
    const baseProfile = {
      userId: 'skip-user',
      fullName: 'Skip User',
      dateOfBirth: '1991-01-01',
      country: 'US',
      idNumber: '222333444',
    };

    service.submitKyc({ ...baseProfile, status: KycStatus.PENDING }, operator);

    expect(() =>
      service.submitKyc({ ...baseProfile, status: KycStatus.VERIFIED }, operator),
    ).toThrowError(/KYC_INVALID_STATUS_TRANSITION/);
  });

  it('should evaluate transaction and generate alerts/report', async () => {
    const profile: KycProfileDto = {
      userId: 'userTx',
      fullName: 'Bob',
      dateOfBirth: '1985-05-05',
      country: 'US',
      idNumber: '987654321',
    };
    service.submitKyc({ ...profile, status: KycStatus.PENDING }, operator);
    service.submitKyc({ ...profile, status: KycStatus.IN_REVIEW }, operator);
    service.submitKyc({ ...profile, status: KycStatus.VERIFIED }, operator);

    const tx: ComplianceTransactionDto = {
      txId: 'tx1',
      userId: 'userTx',
      fromAddress: '0xFROM',
      toAddress: '0xTO',
      amount: 150000,
      asset: 'USD',
      sourceCountry: 'US',
      destinationCountry: 'US',
      timestamp: new Date().toISOString(),
    };

    const result = await service.evaluateTransaction(tx);
    expect(result.riskScore).toBeGreaterThanOrEqual(0);
    expect(result.alert).toHaveProperty('txId', 'tx1');
    expect(service.getTransaction('tx1')).toBeDefined();
    expect(service.getAlerts('userTx')).toHaveLength(1);

    const report = service.generateRegulatoryReport();
    expect(report.totalTransactions).toBeGreaterThan(0);
    expect(report.suspiciousCount).toBeGreaterThanOrEqual(0);
    expect(report.openAlerts).toHaveProperty('userTx');
  });

  it('should support framework management', () => {
    const frameworks = service.getFrameworks();
    expect(frameworks.length).toBeGreaterThan(0);

    const newFramework: FrameworkConfigDto = {
      framework: 'CUSTOM',
      requiredKycLevels: ['verified'],
      transactionThreshold: 200000,
    };

    expect(service.addOrUpdateFramework(newFramework)).toEqual(newFramework);
    expect(service.getFrameworks().map((f) => f.framework)).toContain('CUSTOM');
  });

  it('should create audit logs for compliance actions', async () => {
    await service.evaluateTransaction({
      txId: 'tx2',
      userId: 'userTx',
      fromAddress: '0xFROM',
      toAddress: '0xTO',
      amount: 1,
      asset: 'USD',
      sourceCountry: 'US',
      destinationCountry: 'US',
      timestamp: new Date().toISOString(),
    });

    const logs = auditService.getLogs();
    expect(logs.length).toBeGreaterThan(0);
    expect(logs.some((log) => log.action === 'transaction_surveillance')).toBe(true);
  });
});
