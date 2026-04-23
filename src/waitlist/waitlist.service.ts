import { Injectable, NotFoundException, BadRequestException, Logger } from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository, DataSource, In } from "typeorm";
import { Waitlist, WaitlistStatus, WaitlistType } from "./entities/waitlist.entity";
import { WaitlistEntry, WaitlistEntryStatus } from "./entities/waitlist-entry.entity";
import { WaitlistEvent, WaitlistEventType } from "./entities/waitlist-event.entity";
import { WaitlistGateway } from "../websocket/gateways/waitlist.gateway";

@Injectable()
export class WaitlistService {
  private readonly logger = new Logger(WaitlistService.name);

  constructor(
    @InjectRepository(Waitlist)
    private readonly waitlistRepository: Repository<Waitlist>,
    @InjectRepository(WaitlistEntry)
    private readonly entryRepository: Repository<WaitlistEntry>,
    @InjectRepository(WaitlistEvent)
    private readonly eventRepository: Repository<WaitlistEvent>,
    private readonly dataSource: DataSource,
    private readonly waitlistGateway: WaitlistGateway,
  ) {}

  async createWaitlist(data: { name: string; type: WaitlistType }): Promise<Waitlist> {
    const waitlist = this.waitlistRepository.create({
      ...data,
      status: WaitlistStatus.ACTIVE,
    });
    return this.waitlistRepository.save(waitlist);
  }

  async updateWaitlist(id: string, data: Partial<Waitlist>): Promise<Waitlist> {
    const waitlist = await this.waitlistRepository.findOne({ where: { id } });
    if (!waitlist) {
      throw new NotFoundException(`Waitlist with ID ${id} not found`);
    }
    Object.assign(waitlist, data);
    return this.waitlistRepository.save(waitlist);
  }

  async advanceWaitlist(waitlistId: string, count: number): Promise<any> {
    const waitlist = await this.waitlistRepository.findOne({ where: { id: waitlistId } });
    if (!waitlist) {
      throw new NotFoundException(`Waitlist with ID ${waitlistId} not found`);
    }

    // Find the next 'count' users in order of position
    const entries = await this.entryRepository.find({
      where: { waitlistId, status: WaitlistEntryStatus.ACTIVE, isDeleted: false },
      order: { position: "ASC" },
      take: count,
    });

    if (entries.length === 0) {
      return { message: "No active entries to advance" };
    }

    const promotedUserIds: string[] = [];

    await this.dataSource.transaction(async (manager) => {
      for (const entry of entries) {
        const oldStatus = entry.status;
        entry.status = WaitlistEntryStatus.PROMOTED;
        await manager.save(entry);

        // Record event
        const event = manager.create(WaitlistEvent, {
          entryId: entry.id,
          eventType: WaitlistEventType.PROMOTED,
          oldValue: { status: oldStatus },
          newValue: { status: WaitlistEntryStatus.PROMOTED },
          metadata: { advancedAt: new Date() },
        });
        await manager.save(event);
        
        promotedUserIds.push(entry.userId);
      }
    });

    // Notify users via WebSocket
    for (const userId of promotedUserIds) {
      this.waitlistGateway.notifyAccessGranted(userId, {
        message: "Congratulations! You have been granted access.",
        waitlistId,
      });
    }

    // After promotion, we might need to re-calculate positions for others
    // For simplicity, we just return the promoted users
    return {
      waitlistId,
      promotedCount: entries.length,
      userIds: promotedUserIds,
    };
  }

  async removeEntry(waitlistId: string, userId: string): Promise<void> {
    const entry = await this.entryRepository.findOne({
      where: { waitlistId, userId, isDeleted: false },
    });

    if (!entry) {
      throw new NotFoundException(`Waitlist entry for user ${userId} not found in waitlist ${waitlistId}`);
    }

    await this.dataSource.transaction(async (manager) => {
      entry.isDeleted = true;
      entry.status = WaitlistEntryStatus.REMOVED;
      await manager.save(entry);

      const event = manager.create(WaitlistEvent, {
        entryId: entry.id,
        eventType: WaitlistEventType.REMOVED,
        oldValue: { isDeleted: false, status: WaitlistEntryStatus.ACTIVE },
        newValue: { isDeleted: true, status: WaitlistEntryStatus.REMOVED },
      });
      await manager.save(event);
    });

    this.waitlistGateway.notifyStatusChanged(userId, {
      status: WaitlistEntryStatus.REMOVED,
      waitlistId,
    });
  }

  async getAnalytics(waitlistId: string): Promise<any> {
    const waitlist = await this.waitlistRepository.findOne({ where: { id: waitlistId } });
    if (!waitlist) {
      throw new NotFoundException(`Waitlist with ID ${waitlistId} not found`);
    }

    const totalEntries = await this.entryRepository.count({ where: { waitlistId, isDeleted: false } });
    const activeEntries = await this.entryRepository.count({
      where: { waitlistId, status: WaitlistEntryStatus.ACTIVE, isDeleted: false },
    });
    const promotedEntries = await this.entryRepository.count({
      where: { waitlistId, status: WaitlistEntryStatus.PROMOTED, isDeleted: false },
    });

    // Simple conversion rate: promoted / total
    const conversionRate = totalEntries > 0 ? (promotedEntries / totalEntries) * 100 : 0;

    // Get historical trend (last 30 days)
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const historicalData = await this.eventRepository
      .createQueryBuilder("event")
      .select("DATE(event.createdAt)", "date")
      .addSelect("COUNT(*)", "count")
      .where("event.eventType = :type", { type: WaitlistEventType.JOINED })
      .andWhere("event.createdAt >= :date", { date: thirtyDaysAgo })
      .groupBy("DATE(event.createdAt)")
      .orderBy("date", "ASC")
      .getRawMany();

    return {
      waitlistId,
      name: waitlist.name,
      metrics: {
        totalEntries,
        activeEntries,
        promotedEntries,
        conversionRate: `${conversionRate.toFixed(2)}%`,
      },
      historicalTrend: historicalData,
    };
  }

  // Bulk operations
  async bulkUpdateStatus(waitlistId: string, userIds: string[], status: WaitlistEntryStatus): Promise<any> {
    const entries = await this.entryRepository.find({
      where: { waitlistId, userId: In(userIds), isDeleted: false },
    });

    if (entries.length === 0) {
      throw new BadRequestException("No valid entries found for the provided user IDs");
    }

    await this.dataSource.transaction(async (manager) => {
      for (const entry of entries) {
        const oldStatus = entry.status;
        entry.status = status;
        await manager.save(entry);

        const event = manager.create(WaitlistEvent, {
          entryId: entry.id,
          eventType: status === WaitlistEntryStatus.PROMOTED ? WaitlistEventType.PROMOTED : WaitlistEventType.POSITION_CHANGED,
          oldValue: { status: oldStatus },
          newValue: { status },
        });
        await manager.save(event);
      }
    });

    // Notify users
    for (const entry of entries) {
      this.waitlistGateway.notifyStatusChanged(entry.userId, {
        status,
        waitlistId,
      });
    }

    return {
      updatedCount: entries.length,
    };
  }
}
