import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan, MoreThan, Not } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { TimeBasedEvent, EventType, EventStatus, RecurrenceType } from './entities/time-based-event.entity';
import { EventParticipation } from './entities/event-participation.entity';
import { RewardPipelineService } from '../reward-engine/reward-pipeline.service';
import { RuleEvaluationContext } from '../reward-engine/interfaces/rule.interface';

@Injectable()
export class EventSchedulerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(EventSchedulerService.name);
  private intervalId: NodeJS.Timeout;

  constructor(
    @InjectRepository(TimeBasedEvent)
    private readonly eventRepository: Repository<TimeBasedEvent>,
    @InjectRepository(EventParticipation)
    private readonly participationRepository: Repository<EventParticipation>,
    private readonly rewardPipeline: RewardPipelineService,
  ) {}

  onModuleInit() {
    // Start the event monitoring loop
    this.startEventMonitoring();
  }

  onModuleDestroy() {
    if (this.intervalId) {
      clearInterval(this.intervalId);
    }
  }

  /**
   * Starts the event monitoring loop
   */
  private startEventMonitoring(): void {
    // Check every minute for events to activate/deactivate
    this.intervalId = setInterval(() => {
      this.checkAndUpdateEventStatuses();
    }, 60000); // 1 minute

    this.logger.log('Event scheduler monitoring started');
  }

  /**
   * Cron job to check for recurring events to create
   */
  @Cron(CronExpression.EVERY_HOUR)
  async processRecurringEvents(): Promise<void> {
    this.logger.debug('Processing recurring events');

    const recurringEvents = await this.eventRepository.find({
      where: {
        recurrenceType: { $ne: RecurrenceType.NONE } as any,
        status: EventStatus.COMPLETED,
      },
    });

    for (const event of recurringEvents) {
      try {
        const nextOccurrence = this.calculateNextOccurrence(event);
        if (nextOccurrence && nextOccurrence <= new Date()) {
          await this.createRecurringEventInstance(event);
        }
      } catch (error) {
        this.logger.error(`Error processing recurring event ${event.id}:`, error);
      }
    }
  }

  /**
   * Checks and updates event statuses based on current time
   */
  private async checkAndUpdateEventStatuses(): Promise<void> {
    const now = new Date();

    try {
      // Activate scheduled events
      const eventsToActivate = await this.eventRepository.find({
        where: {
          status: EventStatus.SCHEDULED,
          startDate: LessThan(now),
        },
      });

      for (const event of eventsToActivate) {
        await this.activateEvent(event);
      }

      // Complete expired events
      const eventsToComplete = await this.eventRepository.find({
        where: {
          status: EventStatus.ACTIVE,
          endDate: LessThan(now),
        },
      });

      for (const event of eventsToComplete) {
        await this.completeEvent(event);
      }

    } catch (error) {
      this.logger.error('Error updating event statuses:', error);
    }
  }

  /**
   * Activates an event
   */
  private async activateEvent(event: TimeBasedEvent): Promise<void> {
    event.status = EventStatus.ACTIVE;
    await this.eventRepository.save(event);

    this.logger.log(`Activated event: ${event.name} (${event.id})`);

    // Notify participants or trigger activation logic
    await this.notifyEventActivation(event);
  }

  /**
   * Completes an event
   */
  private async completeEvent(event: TimeBasedEvent): Promise<void> {
    event.status = EventStatus.COMPLETED;
    await this.eventRepository.save(event);

    this.logger.log(`Completed event: ${event.name} (${event.id})`);

    // Process final rewards and cleanup
    await this.processEventCompletion(event);
  }

  /**
   * Creates a new instance of a recurring event
   */
  private async createRecurringEventInstance(templateEvent: TimeBasedEvent): Promise<void> {
    const nextStartDate = this.calculateNextOccurrence(templateEvent);
    if (!nextStartDate) return;

    const duration = templateEvent.endDate.getTime() - templateEvent.startDate.getTime();
    const nextEndDate = new Date(nextStartDate.getTime() + duration);

    const newEvent = this.eventRepository.create({
      name: templateEvent.name,
      description: templateEvent.description,
      type: templateEvent.type,
      status: EventStatus.SCHEDULED,
      startDate: nextStartDate,
      endDate: nextEndDate,
      recurrenceType: templateEvent.recurrenceType,
      recurrenceConfig: templateEvent.recurrenceConfig,
      rewardConfig: templateEvent.rewardConfig,
      targetingConfig: templateEvent.targetingConfig,
      maxParticipants: templateEvent.maxParticipants,
      metadata: {
        ...templateEvent.metadata,
        parentEventId: templateEvent.id,
        instanceNumber: (templateEvent.metadata?.instanceNumber || 0) + 1,
      },
    });

    await this.eventRepository.save(newEvent);

    this.logger.log(`Created recurring event instance: ${newEvent.name} (${newEvent.id})`);
  }

  /**
   * Calculates the next occurrence of a recurring event
   */
  private calculateNextOccurrence(event: TimeBasedEvent): Date | null {
    const now = new Date();
    const config = event.recurrenceConfig;

    if (!config) return null;

    switch (event.recurrenceType) {
      case RecurrenceType.DAILY:
        const nextDaily = new Date(event.endDate);
        nextDaily.setDate(nextDaily.getDate() + 1);
        return nextDaily > now ? nextDaily : null;

      case RecurrenceType.WEEKLY:
        const nextWeekly = new Date(event.endDate);
        nextWeekly.setDate(nextWeekly.getDate() + 7);
        return nextWeekly > now ? nextWeekly : null;

      case RecurrenceType.MONTHLY:
        const nextMonthly = new Date(event.endDate);
        nextMonthly.setMonth(nextMonthly.getMonth() + 1);
        return nextMonthly > now ? nextMonthly : null;

      case RecurrenceType.YEARLY:
        const nextYearly = new Date(event.endDate);
        nextYearly.setFullYear(nextYearly.getFullYear() + 1);
        return nextYearly > now ? nextYearly : null;

      case RecurrenceType.CUSTOM:
        return this.calculateCustomNextOccurrence(event, config);

      default:
        return null;
    }
  }

  /**
   * Calculates next occurrence for custom recurrence
   */
  private calculateCustomNextOccurrence(event: TimeBasedEvent, config: any): Date | null {
    // Implementation for custom recurrence logic
    // This would handle complex patterns like "every 2 weeks on Monday and Wednesday"
    return null; // Placeholder
  }

  /**
   * Notifies participants when an event is activated
   */
  private async notifyEventActivation(event: TimeBasedEvent): Promise<void> {
    // Implementation for notifications (email, websocket, etc.)
    this.logger.debug(`Notifying participants for event ${event.id}`);
  }

  /**
   * Processes event completion and final rewards
   */
  private async processEventCompletion(event: TimeBasedEvent): Promise<void> {
    // Get all active participations
    const participations = await this.participationRepository.find({
      where: { eventId: event.id, status: 'active' },
      relations: ['user'],
    });

    // Process final rewards for each participant
    for (const participation of participations) {
      try {
        const context: RuleEvaluationContext = {
          userId: participation.userId,
          eventType: 'event_completion',
          timestamp: new Date(),
          event: {
            id: event.id,
            type: event.type,
            completionBonus: true,
          },
          participation: {
            claimsCount: participation.claimsCount,
            totalEarned: participation.totalEarned,
          },
        };

        await this.rewardPipeline.processRewardEvent(context);

        participation.status = 'completed';
        participation.completedAt = new Date();
        await this.participationRepository.save(participation);

      } catch (error) {
        this.logger.error(`Error processing completion for participation ${participation.id}:`, error);
      }
    }

    this.logger.log(`Processed completion for event ${event.id}, ${participations.length} participants`);
  }

  /**
   * Checks if a user is eligible for an event
   */
  async checkUserEligibility(event: TimeBasedEvent, userId: string): Promise<boolean> {
    const config = event.targetingConfig;
    if (!config) return true;

    // Check user level
    if (config.minUserLevel || config.maxUserLevel) {
      // Would need to fetch user level from user service
      // Placeholder logic
    }

    // Check if user is excluded
    if (config.excludedUsers?.includes(userId)) {
      return false;
    }

    // Check if user is specifically included
    if (config.includedUsers?.length > 0 && !config.includedUsers.includes(userId)) {
      return false;
    }

    // Check participant limit
    if (event.maxParticipants > 0 && event.currentParticipants >= event.maxParticipants) {
      return false;
    }

    return true;
  }

  /**
   * Gets active events for a user
   */
  async getActiveEventsForUser(userId: string): Promise<TimeBasedEvent[]> {
    const now = new Date();

    const events = await this.eventRepository.find({
      where: {
        status: EventStatus.ACTIVE,
        startDate: LessThan(now),
        endDate: MoreThan(now),
      },
    });

    const eligibleEvents = [];
    for (const event of events) {
      if (await this.checkUserEligibility(event, userId)) {
        eligibleEvents.push(event);
      }
    }

    return eligibleEvents;
  }

  /**
   * Returns the current time in the given IANA timezone (or UTC if invalid).
   */
  getTimeInZone(timezone: string): Date {
    try {
      const str = new Date().toLocaleString('en-US', { timeZone: timezone });
      return new Date(str);
    } catch {
      return new Date();
    }
  }

  /**
   * Converts a local date/time string to UTC using the given IANA timezone.
   */
  localToUtc(localIso: string, timezone: string): Date {
    try {
      // Use Intl to get the offset at that moment
      const local = new Date(localIso);
      const utcStr = local.toLocaleString('en-US', { timeZone: 'UTC' });
      const tzStr = local.toLocaleString('en-US', { timeZone: timezone });
      const offsetMs = new Date(utcStr).getTime() - new Date(tzStr).getTime();
      return new Date(local.getTime() + offsetMs);
    } catch {
      return new Date(localIso);
    }
  }

  /**
   * Creates a seasonal campaign event (quarterly/yearly).
   */
  async createSeasonalCampaign(data: {
    name: string;
    description?: string;
    startDate: Date;
    endDate: Date;
    timezone?: string;
    rewardConfig: TimeBasedEvent['rewardConfig'];
    targetingConfig?: TimeBasedEvent['targetingConfig'];
  }): Promise<TimeBasedEvent> {
    await this.resolveConflicts(data.startDate, data.endDate);

    const event = this.eventRepository.create({
      ...data,
      type: EventType.SEASONAL_CAMPAIGN,
      status: EventStatus.SCHEDULED,
      recurrenceType: RecurrenceType.YEARLY,
      recurrenceConfig: { timeZone: data.timezone || 'UTC' },
    });
    return this.eventRepository.save(event);
  }

  /**
   * Creates an anniversary reward event for a user (fires yearly on their signup date).
   */
  async createAnniversaryEvent(data: {
    name: string;
    userId: string;
    signupDate: Date;
    rewardConfig: TimeBasedEvent['rewardConfig'];
    timezone?: string;
  }): Promise<TimeBasedEvent> {
    const now = new Date();
    const anniversary = new Date(data.signupDate);
    anniversary.setFullYear(now.getFullYear());
    if (anniversary < now) anniversary.setFullYear(now.getFullYear() + 1);

    const endDate = new Date(anniversary);
    endDate.setDate(endDate.getDate() + 1);

    const event = this.eventRepository.create({
      name: data.name,
      type: EventType.ANNIVERSARY_REWARD,
      status: EventStatus.SCHEDULED,
      startDate: anniversary,
      endDate,
      recurrenceType: RecurrenceType.YEARLY,
      recurrenceConfig: { timeZone: data.timezone || 'UTC' },
      rewardConfig: data.rewardConfig,
      targetingConfig: { includedUsers: [data.userId] },
      metadata: { userId: data.userId, signupDate: data.signupDate },
    });
    return this.eventRepository.save(event);
  }

  /**
   * Detects and resolves overlapping events by pausing lower-priority ones.
   * Priority order: SEASONAL_CAMPAIGN > ANNIVERSARY_REWARD > others.
   */
  async resolveConflicts(startDate: Date, endDate: Date): Promise<void> {
    const overlapping = await this.eventRepository.find({
      where: [
        { status: EventStatus.ACTIVE, startDate: LessThan(endDate), endDate: MoreThan(startDate) },
        { status: EventStatus.SCHEDULED, startDate: LessThan(endDate), endDate: MoreThan(startDate) },
      ],
    });

    const priority: Record<string, number> = {
      [EventType.SEASONAL_CAMPAIGN]: 3,
      [EventType.ANNIVERSARY_REWARD]: 2,
    };

    for (const ev of overlapping) {
      const p = priority[ev.type] ?? 1;
      if (p < 2) {
        ev.status = EventStatus.PAUSED;
        await this.eventRepository.save(ev);
        this.logger.warn(`Paused conflicting event ${ev.id} (${ev.name}) due to higher-priority overlap`);
      }
    }
  }

  /**
   * Terminates an event immediately (emergency stop).
   */
  async terminateEvent(eventId: string): Promise<TimeBasedEvent> {
    const event = await this.eventRepository.findOneOrFail({ where: { id: eventId } });
    event.status = EventStatus.CANCELLED;
    await this.eventRepository.save(event);
    this.logger.warn(`Event ${eventId} terminated by admin`);
    return event;
  }

  /**
   * Extends an active event's end date.
   */
  async extendEvent(eventId: string, newEndDate: Date): Promise<TimeBasedEvent> {
    const event = await this.eventRepository.findOneOrFail({ where: { id: eventId } });
    event.endDate = newEndDate;
    return this.eventRepository.save(event);
  }
}