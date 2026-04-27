import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { GovernanceService, MIN_DELAY_MS } from './governance.service';
import { GovernanceProposal, ProposalStatus } from './entities/governance-proposal.entity';

const makePending = (overrides: Partial<GovernanceProposal> = {}): GovernanceProposal => ({
  id: 'proposal-1',
  title: 'Increase fee',
  targetKey: 'fee_rate',
  proposedValue: '0.02',
  proposedBy: 'admin',
  delayMs: MIN_DELAY_MS,
  executeAfter: Date.now() + MIN_DELAY_MS,
  status: ProposalStatus.PENDING,
  executedAt: null,
  cancelledReason: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const mockRepo = () => ({
  create: jest.fn((dto) => dto),
  save: jest.fn(async (e) => e),
  findOne: jest.fn(),
  find: jest.fn().mockResolvedValue([]),
});

describe('GovernanceService', () => {
  let service: GovernanceService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    repo = mockRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        GovernanceService,
        { provide: getRepositoryToken(GovernanceProposal), useValue: repo },
      ],
    }).compile();
    service = module.get<GovernanceService>(GovernanceService);
  });

  describe('queueProposal', () => {
    it('queues a proposal with correct executeAfter', async () => {
      repo.findOne.mockResolvedValue(null);
      const before = Date.now();
      const result = await service.queueProposal({
        title: 'Increase fee',
        targetKey: 'fee_rate',
        proposedValue: '0.02',
        proposedBy: 'admin',
        delayMs: MIN_DELAY_MS,
      });
      expect(result.executeAfter).toBeGreaterThanOrEqual(before + MIN_DELAY_MS);
      expect(result.status).toBe(ProposalStatus.PENDING);
    });

    it('rejects delay below MIN_DELAY_MS', async () => {
      await expect(
        service.queueProposal({
          title: 'Bad delay',
          targetKey: 'fee_rate',
          proposedValue: '0.02',
          proposedBy: 'admin',
          delayMs: 1000,
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('rejects duplicate pending proposals for same key', async () => {
      repo.findOne.mockResolvedValue(makePending());
      await expect(
        service.queueProposal({
          title: 'Duplicate',
          targetKey: 'fee_rate',
          proposedValue: '0.03',
          proposedBy: 'admin',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('executeProposal', () => {
    it('fails when timelock has not elapsed', async () => {
      const future = makePending({ executeAfter: Date.now() + 999_999 });
      repo.findOne.mockResolvedValue(future);
      await expect(service.executeProposal('proposal-1')).rejects.toThrow(BadRequestException);
    });

    it('succeeds when timelock has elapsed', async () => {
      const past = makePending({ executeAfter: Date.now() - 1000 });
      repo.findOne.mockResolvedValue(past);
      const result = await service.executeProposal('proposal-1');
      expect(result.status).toBe(ProposalStatus.EXECUTED);
      expect(result.executedAt).toBeGreaterThan(0);
    });

    it('throws NotFoundException for unknown id', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(service.executeProposal('bad-id')).rejects.toThrow(NotFoundException);
    });
  });

  describe('cancelProposal', () => {
    it('cancels a pending proposal', async () => {
      repo.findOne.mockResolvedValue(makePending());
      const result = await service.cancelProposal('proposal-1', { reason: 'No longer needed' });
      expect(result.status).toBe(ProposalStatus.CANCELLED);
    });

    it('cannot cancel an already-executed proposal', async () => {
      repo.findOne.mockResolvedValue(makePending({ status: ProposalStatus.EXECUTED }));
      await expect(service.cancelProposal('proposal-1', { reason: 'late' })).rejects.toThrow(BadRequestException);
    });
  });
});
