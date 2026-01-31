import { Injectable, Logger } from '@nestjs/common';
import { MockHttpProvider } from './mock-http.provider';
import { MockDatabaseProvider } from './mock-database.provider';
import { MockMessageQueueProvider } from './mock-message-queue.provider';

@Injectable()
export class MockProviderFactory {
  private readonly logger = new Logger(MockProviderFactory.name);
  private providers: {
    http?: MockHttpProvider;
    database?: MockDatabaseProvider;
    messageQueue?: MockMessageQueueProvider;
  } = {};

  constructor(
    private readonly httpProvider: MockHttpProvider,
    private readonly databaseProvider: MockDatabaseProvider,
    private readonly messageQueueProvider: MockMessageQueueProvider,
  ) {}

  /**
   * Initialize all mock providers with a seed for determinism
   */
  async initializeProviders(seed: number): Promise<void> {
    this.logger.log('Initializing mock providers');

    // Initialize HTTP provider
    await this.httpProvider.initialize(seed);
    this.providers.http = this.httpProvider;

    // Initialize Database provider
    await this.databaseProvider.initialize(seed);
    this.providers.database = this.databaseProvider;

    // Initialize Message Queue provider
    await this.messageQueueProvider.initialize(seed);
    this.providers.messageQueue = this.messageQueueProvider;

    this.logger.log('All mock providers initialized');
  }

  /**
   * Get all initialized providers
   */
  getProviders() {
    return this.providers;
  }

  /**
   * Get specific provider by type
   */
  getProvider(type: 'http' | 'database' | 'messageQueue') {
    return this.providers[type];
  }

  /**
   * Reset all providers
   */
  async resetProviders(): Promise<void> {
    this.logger.log('Resetting all mock providers');
    
    await this.httpProvider.reset();
    await this.databaseProvider.reset();
    await this.messageQueueProvider.reset();
  }

  /**
   * Verify no live submissions occurred
   */
  async verifyNoLiveSubmissions(): Promise<boolean> {
    const httpSubmissions = await this.httpProvider.getLiveSubmissionCount();
    const dbSubmissions = await this.databaseProvider.getLiveSubmissionCount();
    const mqSubmissions = await this.messageQueueProvider.getLiveSubmissionCount();

    const totalSubmissions = httpSubmissions + dbSubmissions + mqSubmissions;

    if (totalSubmissions > 0) {
      this.logger.error(`LIVE SUBMISSIONS DETECTED: ${totalSubmissions} total`);
      return false;
    }

    this.logger.log('Verified: No live submissions');
    return true;
  }
}