import { Injectable, Logger } from "@nestjs/common";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { DataSource } from "typeorm";

@Injectable()
export class DatabaseHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(DatabaseHealthIndicator.name);

  constructor(private readonly dataSource: DataSource) {
    super();
  }

  /**
   * Check if the database connection is healthy
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      // Try to execute a simple query to verify connection
      await this.dataSource.query("SELECT 1");

      const result = this.getStatus(key, true, {
        status: "up",
        message: "Database connection is healthy",
      });

      return result;
    } catch (error) {
      this.logger.error("Database health check failed", error.message);

      const result = this.getStatus(key, false, {
        status: "down",
        message: `Database connection failed: ${error.message}`,
      });

      throw new HealthCheckError("Database health check failed", result);
    }
  }
}
