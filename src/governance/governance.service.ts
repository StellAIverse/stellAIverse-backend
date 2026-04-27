import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { GovernanceProposal, ProposalStatus } from './entities/governance-proposal.entity';
import { QueueProposalDto, CancelProposalDto } from './dto/queue-proposal.dto';

/** Minimum enforced timelock delay: 1 hour */
export const MIN_DELAY_MS = 3_600_000;
const DEFAULT_DELAY_MS = 86_400_000; // 24 hours

@Injectable()
export class GovernanceService {
  private readonly logger = new Logger(GovernanceService.name);

  constructor(
    @InjectRepository(GovernanceProposal)
    private readonly repo: Repository<GovernanceProposal>,
  ) {}

  /**
   * Queue a new governance proposal for execution after the timelock delay.
   */
  async queueProposal(dto: QueueProposalDto): Promise<GovernanceProposal> {
    const delayMs = dto.delayMs ?? DEFAULT_DELAY_MS;

    if (delayMs < MIN_DELAY_MS) {
      throw new BadRequestException(
        `Timelock delay must be at least ${MIN_DELAY_MS / 3_600_000} hour(s).`,
      );
    }

    // Prevent duplicate pending proposals for the same key
    const existing = await this.repo.findOne({
      where: { targetKey: dto.targetKey, status: ProposalStatus.PENDING },
    });
    if (existing) {
      throw new ConflictException(
        `A pending proposal for key "${dto.targetKey}" already exists (id: ${existing.id}).`,
      );
    }

    const executeAfter = Date.now() + delayMs;

    const proposal = this.repo.create({
      title: dto.title,
      targetKey: dto.targetKey,
      proposedValue: dto.proposedValue,
      proposedBy: dto.proposedBy,
      delayMs,
      executeAfter,
      status: ProposalStatus.PENDING,
    });

    const saved = await this.repo.save(proposal);
    this.logger.log(
      `Proposal "${saved.id}" queued for key "${dto.targetKey}" — executable after ${new Date(executeAfter).toISOString()}`,
    );
    return saved;
  }

  /**
   * Attempt to execute a proposal. Fails if the timelock has not yet elapsed.
   */
  async executeProposal(id: string): Promise<GovernanceProposal> {
    const proposal = await this.findOrFail(id);

    if (proposal.status !== ProposalStatus.PENDING && proposal.status !== ProposalStatus.READY) {
      throw new BadRequestException(
        `Proposal "${id}" cannot be executed (status: ${proposal.status}).`,
      );
    }

    const now = Date.now();
    if (now < proposal.executeAfter) {
      const remainingMs = proposal.executeAfter - now;
      throw new BadRequestException(
        `Timelock not elapsed. ${Math.ceil(remainingMs / 1000)}s remaining before execution is allowed.`,
      );
    }

    proposal.status = ProposalStatus.EXECUTED;
    proposal.executedAt = now;
    const executed = await this.repo.save(proposal);

    this.logger.log(
      `Proposal "${id}" executed: key="${proposal.targetKey}" value="${proposal.proposedValue}"`,
    );

    return executed;
  }

  async cancelProposal(id: string, dto: CancelProposalDto): Promise<GovernanceProposal> {
    const proposal = await this.findOrFail(id);

    if (proposal.status === ProposalStatus.EXECUTED) {
      throw new BadRequestException('An already-executed proposal cannot be cancelled.');
    }
    if (proposal.status === ProposalStatus.CANCELLED) {
      throw new BadRequestException('Proposal is already cancelled.');
    }

    proposal.status = ProposalStatus.CANCELLED;
    proposal.cancelledReason = dto.reason;
    const cancelled = await this.repo.save(proposal);
    this.logger.log(`Proposal "${id}" cancelled: ${dto.reason}`);
    return cancelled;
  }

  async findOne(id: string): Promise<GovernanceProposal> {
    return this.findOrFail(id);
  }

  async findAll(status?: ProposalStatus): Promise<GovernanceProposal[]> {
    const where = status ? { status } : {};
    return this.repo.find({ where, order: { createdAt: 'DESC' } });
  }

  /**
   * Scheduled job: mark PENDING proposals as READY once their timelock has elapsed.
   * Runs every minute.
   */
  @Cron(CronExpression.EVERY_MINUTE)
  async markReadyProposals(): Promise<void> {
    const now = Date.now();
    const pending = await this.repo.find({ where: { status: ProposalStatus.PENDING } });

    for (const p of pending) {
      if (now >= p.executeAfter) {
        p.status = ProposalStatus.READY;
        await this.repo.save(p);
        this.logger.log(`Proposal "${p.id}" is now READY for execution`);
      }
    }
  }

  private async findOrFail(id: string): Promise<GovernanceProposal> {
    const p = await this.repo.findOne({ where: { id } });
    if (!p) throw new NotFoundException(`Proposal "${id}" not found`);
    return p;
  }
}
