import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import axios, { AxiosInstance } from "axios";
import {
  IComputeProvider,
  ProviderType,
} from "../interfaces/provider.interface";

@Injectable()
export class OpenAIAdapter implements IComputeProvider {
  private readonly logger = new Logger(OpenAIAdapter.name);
  private client: AxiosInstance;
  private apiKey: string;
  private baseURL: string;
  private initialized = false;

  constructor(private readonly configService: ConfigService) {}

  async initialize(config: any = {}): Promise<void> {
    this.apiKey =
      config.apiKey || this.configService.get<string>("OPENAI_API_KEY");
    this.baseURL =
      config.baseURL ||
      this.configService.get<string>(
        "OPENAI_BASE_URL",
        "https://api.openai.com/v1",
      );

    if (!this.apiKey) {
      throw new Error("OpenAI API key is missing");
    }

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.apiKey}`,
      },
      timeout: 60000,
    });

    this.initialized = true;
    this.logger.log("OpenAI Provider initialized");
  }

  async execute(request: any): Promise<any> {
    if (!this.initialized) {
      await this.initialize();
    }

    try {
      this.logger.debug(`Executing OpenAI request for model: ${request.model}`);
      const response = await this.client.post("/chat/completions", request);
      return response.data;
    } catch (error) {
      this.logger.error(
        "OpenAI execution failed",
        error.response?.data || error.message,
      );
      throw error;
    }
  }

  async getStatus(): Promise<{ status: string; healthy: boolean }> {
    try {
      if (!this.initialized)
        return { status: "not_initialized", healthy: false };
      const response = await this.client.get("/models");
      const healthy = response.status === 200;
      return { status: healthy ? "ready" : "unhealthy", healthy };
    } catch (error) {
      return { status: "error", healthy: false };
    }
  }

  getProviderType(): ProviderType {
    return ProviderType.OPENAI;
  }
}
