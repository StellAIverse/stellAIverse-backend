import { Injectable, Logger } from "@nestjs/common";
import {
  HealthIndicator,
  HealthIndicatorResult,
  HealthCheckError,
} from "@nestjs/terminus";
import { HttpService } from "@nestjs/axios";
import { ConfigService } from "@nestjs/config";
import { firstValueFrom } from "rxjs";

@Injectable()
export class OpenAIProviderHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(OpenAIProviderHealthIndicator.name);

  constructor(
    private readonly httpService: HttpService,
    private readonly configService: ConfigService,
  ) {
    super();
  }

  /**
   * Check if the OpenAI provider is accessible
   */
  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    const openaiApiKey = this.configService.get<string>("OPENAI_API_KEY");

    // If no API key is configured, mark as healthy but with a warning
    if (!openaiApiKey) {
      const result = this.getStatus(key, true, {
        status: "up",
        message: "OpenAI API key not configured - provider check skipped",
        configured: false,
      });
      return result;
    }

    try {
      // Try to fetch models list from OpenAI API
      const response = await firstValueFrom(
        this.httpService.get("https://api.openai.com/v1/models", {
          headers: {
            Authorization: `Bearer ${openaiApiKey}`,
          },
          timeout: 5000, // 5 second timeout
        }),
      );

      if (response.status === 200) {
        const result = this.getStatus(key, true, {
          status: "up",
          message: "OpenAI API is accessible",
          configured: true,
        });
        return result;
      }

      throw new Error(`Unexpected status code: ${response.status}`);
    } catch (error) {
      this.logger.error("OpenAI provider health check failed", error.message);

      const result = this.getStatus(key, false, {
        status: "down",
        message: `OpenAI API check failed: ${error.message}`,
        configured: true,
      });

      throw new HealthCheckError("OpenAI provider health check failed", result);
    }
  }
}
