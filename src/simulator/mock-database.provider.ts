import { Injectable, Logger } from "@nestjs/common";

@Injectable()
export class MockDatabaseProvider {
  private readonly logger = new Logger(MockDatabaseProvider.name);
  private liveSubmissionCount = 0;
  private rows: any[] = [];

  async initialize(seed: number): Promise<void> {
    this.liveSubmissionCount = 0;
    this.rows = [];
    this.logger.log("Mock Database initialized");
  }

  async reset(): Promise<void> {
    this.liveSubmissionCount = 0;
    this.rows = [];
  }

  async query(_sql: string): Promise<any[]> {
    return this.rows;
  }

  async getLiveSubmissionCount(): Promise<number> {
    return this.liveSubmissionCount;
  }
}
