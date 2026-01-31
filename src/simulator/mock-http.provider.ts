import { Injectable, Logger } from '@nestjs/common';
import * as seedrandom from 'seedrandom';

@Injectable()
export class MockHttpProvider {
  private readonly logger = new Logger(MockHttpProvider.name);
  private rng: seedrandom.PRNG;
  private requestLog: Array<{ method: string; url: string; timestamp: number }> = [];
  private liveSubmissionCount = 0;
  private mockResponses: Map<string, any> = new Map();

  /**
   * Initialize the mock HTTP provider with deterministic behavior
   */
  async initialize(seed: number): Promise<void> {
    this.rng = seedrandom(seed.toString() + '-http');
    this.requestLog = [];
    this.liveSubmissionCount = 0;
    
    // Set up default mock responses
    this.setupDefaultResponses();
    
    this.logger.log('Mock HTTP provider initialized');
  }

  /**
   * Setup default mock responses
   */
  private setupDefaultResponses(): void {
    this.mockResponses.set('/api/interact', {
      success: true,
      data: { message: 'Interaction successful' },
    });

    this.mockResponses.set('/api/status', {
      success: true,
      status: 'running',
    });

    this.mockResponses.set('/api/submit', {
      success: true,
      message: 'Submission received (mock)',
    });
  }

  /**
   * Mock GET request
   */
  async get(url: string, params?: any): Promise<any> {
    this.logRequest('GET', url);
    
    // Prevent live submissions
    if (this.isLiveEndpoint(url)) {
      this.logger.warn(`Blocked live submission to: ${url}`);
      this.liveSubmissionCount++;
      throw new Error('Live submissions are blocked in simulation mode');
    }

    // Return mock response
    const mockResponse = this.mockResponses.get(url) || {
      success: true,
      data: this.generateMockData(),
    };

    // Add deterministic delay
    await this.simulateNetworkDelay();

    return mockResponse;
  }

  /**
   * Mock POST request
   */
  async post(url: string, data?: any): Promise<any> {
    this.logRequest('POST', url);

    // Prevent live submissions
    if (this.isLiveEndpoint(url)) {
      this.logger.warn(`Blocked live submission to: ${url}`);
      this.liveSubmissionCount++;
      throw new Error('Live submissions are blocked in simulation mode');
    }

    // Return mock response
    const mockResponse = this.mockResponses.get(url) || {
      success: true,
      data: { id: this.generateId(), ...data },
    };

    await this.simulateNetworkDelay();

    return mockResponse;
  }

  /**
   * Mock PUT request
   */
  async put(url: string, data?: any): Promise<any> {
    this.logRequest('PUT', url);

    if (this.isLiveEndpoint(url)) {
      this.logger.warn(`Blocked live submission to: ${url}`);
      this.liveSubmissionCount++;
      throw new Error('Live submissions are blocked in simulation mode');
    }

    const mockResponse = {
      success: true,
      data: { updated: true, ...data },
    };

    await this.simulateNetworkDelay();

    return mockResponse;
  }

  /**
   * Mock DELETE request
   */
  async delete(url: string): Promise<any> {
    this.logRequest('DELETE', url);

    if (this.isLiveEndpoint(url)) {
      this.logger.warn(`Blocked live submission to: ${url}`);
      this.liveSubmissionCount++;
      throw new Error('Live submissions are blocked in simulation mode');
    }

    const mockResponse = {
      success: true,
      data: { deleted: true },
    };

    await this.simulateNetworkDelay();

    return mockResponse;
  }

  /**
   * Register custom mock response
   */
  registerMockResponse(url: string, response: any): void {
    this.mockResponses.set(url, response);
    this.logger.debug(`Registered mock response for ${url}`);
  }

  /**
   * Check if endpoint is a live endpoint that should be blocked
   */
  private isLiveEndpoint(url: string): boolean {
    const livePatterns = [
      /\/live\//,
      /\/production\//,
      /\/submit$/,
      /\/deploy$/,
      /\/publish$/,
    ];

    return livePatterns.some(pattern => pattern.test(url));
  }

  /**
   * Simulate network delay deterministically
   */
  private async simulateNetworkDelay(): Promise<void> {
    const delay = Math.floor(this.rng() * 100) + 50; // 50-150ms
    await new Promise(resolve => setTimeout(resolve, delay));
  }

  /**
   * Generate deterministic mock data
   */
  private generateMockData(): any {
    return {
      id: this.generateId(),
      value: Math.floor(this.rng() * 1000),
      timestamp: Date.now(),
    };
  }

  /**
   * Generate deterministic ID
   */
  private generateId(): string {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let id = '';
    for (let i = 0; i < 8; i++) {
      id += chars[Math.floor(this.rng() * chars.length)];
    }
    return id;
  }

  /**
   * Log request for debugging
   */
  private logRequest(method: string, url: string): void {
    this.requestLog.push({
      method,
      url,
      timestamp: Date.now(),
    });
  }

  /**
   * Get request log
   */
  getRequestLog() {
    return this.requestLog;
  }

  /**
   * Get live submission count
   */
  async getLiveSubmissionCount(): Promise<number> {
    return this.liveSubmissionCount;
  }

  /**
   * Reset provider
   */
  async reset(): Promise<void> {
    this.requestLog = [];
    this.liveSubmissionCount = 0;
    this.logger.log('Mock HTTP provider reset');
  }
}