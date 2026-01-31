import { Injectable, Logger } from '@nestjs/common';
import * as seedrandom from 'seedrandom';

interface QueuedMessage {
  id: string;
  queue: string;
  payload: any;
  timestamp: number;
  processed: boolean;
}

@Injectable()
export class MockMessageQueueProvider {
  private readonly logger = new Logger(MockMessageQueueProvider.name);
  private rng: seedrandom.PRNG;
  private queues: Map<string, QueuedMessage[]> = new Map();
  private messageLog: QueuedMessage[] = [];
  private liveSubmissionCount = 0;
  private simulatedLatency = 100; // Default latency in ms

  /**
   * Initialize the mock message queue provider
   */
  async initialize(seed: number, latency?: number): Promise<void> {
    this.rng = seedrandom(seed.toString() + '-mq');
    this.queues.clear();
    this.messageLog = [];
    this.liveSubmissionCount = 0;
    
    if (latency !== undefined) {
      this.simulatedLatency = latency;
    }

    // Initialize default queues
    this.queues.set('default', []);
    this.queues.set('tasks', []);
    this.queues.set('events', []);

    this.logger.log('Mock Message Queue provider initialized');
  }

  /**
   * Publish a message to a queue
   */
  async publish(queue: string, payload: any): Promise<string> {
    // Check for live queue
    if (this.isLiveQueue(queue)) {
      this.logger.warn(`Blocked live message queue submission to: ${queue}`);
      this.liveSubmissionCount++;
      throw new Error('Live message queue submissions are blocked in simulation mode');
    }

    const message: QueuedMessage = {
      id: this.generateMessageId(),
      queue,
      payload,
      timestamp: Date.now(),
      processed: false,
    };

    // Add to queue
    const queueMessages = this.queues.get(queue) || [];
    queueMessages.push(message);
    this.queues.set(queue, queueMessages);

    // Log message
    this.messageLog.push(message);

    this.logger.debug(`Published message ${message.id} to queue ${queue}`);
    return message.id;
  }

  /**
   * Consume a message from a queue
   */
  async consume(queue: string): Promise<QueuedMessage | null> {
    // Simulate latency
    await this.simulateLatency();

    const queueMessages = this.queues.get(queue) || [];
    
    // Find first unprocessed message
    const message = queueMessages.find(m => !m.processed);
    
    if (message) {
      message.processed = true;
      this.logger.debug(`Consumed message ${message.id} from queue ${queue}`);
      return message;
    }

    return null;
  }

  /**
   * Peek at next message without consuming
   */
  async peek(queue: string): Promise<QueuedMessage | null> {
    const queueMessages = this.queues.get(queue) || [];
    const message = queueMessages.find(m => !m.processed);
    return message || null;
  }

  /**
   * Get queue size
   */
  async getQueueSize(queue: string): Promise<number> {
    const queueMessages = this.queues.get(queue) || [];
    return queueMessages.filter(m => !m.processed).length;
  }

  /**
   * Purge a queue
   */
  async purgeQueue(queue: string): Promise<number> {
    if (this.isLiveQueue(queue)) {
      this.logger.warn(`Blocked live queue purge: ${queue}`);
      this.liveSubmissionCount++;
      throw new Error('Live queue operations are blocked in simulation mode');
    }

    const queueMessages = this.queues.get(queue) || [];
    const unprocessedCount = queueMessages.filter(m => !m.processed).length;
    
    this.queues.set(queue, []);
    this.logger.debug(`Purged ${unprocessedCount} messages from queue ${queue}`);
    
    return unprocessedCount;
  }

  /**
   * Acknowledge message processing
   */
  async ack(messageId: string): Promise<boolean> {
    for (const [queue, messages] of this.queues) {
      const message = messages.find(m => m.id === messageId);
      if (message) {
        message.processed = true;
        this.logger.debug(`Acknowledged message ${messageId}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Requeue a message (mark as unprocessed)
   */
  async requeue(messageId: string): Promise<boolean> {
    for (const [queue, messages] of this.queues) {
      const message = messages.find(m => m.id === messageId);
      if (message) {
        message.processed = false;
        this.logger.debug(`Requeued message ${messageId}`);
        return true;
      }
    }
    return false;
  }

  /**
   * Get all messages in a queue (for debugging)
   */
  async getAllMessages(queue: string): Promise<QueuedMessage[]> {
    return this.queues.get(queue) || [];
  }

  /**
   * Check if queue is a live queue
   */
  private isLiveQueue(queue: string): boolean {
    const livePatterns = [
      /^production-/i,
      /^live-/i,
      /-prod$/i,
    ];

    return livePatterns.some(pattern => pattern.test(queue));
  }

  /**
   * Simulate network latency
   */
  private async simulateLatency(): Promise<void> {
    // Add some deterministic randomness to latency
    const jitter = Math.floor(this.rng() * 20) - 10; // -10 to +10 ms
    const delay = Math.max(0, this.simulatedLatency + jitter);
    
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Generate deterministic message ID
   */
  private generateMessageId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = 'msg-';
    for (let i = 0; i < 12; i++) {
      id += chars[Math.floor(this.rng() * chars.length)];
    }
    return id;
  }

  /**
   * Get message log
   */
  getMessageLog(): QueuedMessage[] {
    return this.messageLog;
  }

  /**
   * Get live submission count
   */
  async getLiveSubmissionCount(): Promise<number> {
    return this.liveSubmissionCount;
  }

  /**
   * Set simulated latency
   */
  setLatency(latency: number): void {
    this.simulatedLatency = latency;
    this.logger.debug(`Set simulated latency to ${latency}ms`);
  }

  /**
   * Reset provider
   */
  async reset(): Promise<void> {
    this.queues.clear();
    this.messageLog = [];
    this.liveSubmissionCount = 0;
    
    // Reinitialize default queues
    this.queues.set('default', []);
    this.queues.set('tasks', []);
    this.queues.set('events', []);
    
    this.logger.log('Mock Message Queue provider reset');
  }
}