import {
  Controller,
  Post,
  Get,
  Body,
  Param,
  HttpCode,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { ComputeBridgeService } from './compute-bridge.service';
import {
  CompletionRequestDto,
  CompletionResponseDto,
  EmbeddingRequestDto,
  EmbeddingResponseDto,
  ErrorResponseDto,
} from './dto/base.dto';
import { AIProviderType } from './interfaces/provider.interface';

/**
 * ComputeBridge Controller
 * 
 * Handles HTTP endpoints for AI provider orchestration.
 * Provides REST API for completions, embeddings, and provider management.
 * 
 * @class ComputeBridgeController
 */
@ApiTags('compute-bridge')
@Controller('compute-bridge')
export class ComputeBridgeController {
  private readonly logger = new Logger(ComputeBridgeController.name);

  constructor(private readonly computeBridgeService: ComputeBridgeService) {}

  /**
   * Generate a completion
   * 
   * POST /compute-bridge/completions
   */
  @Post('completions')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate a text completion',
    description:
      'Generate a text completion using the specified AI provider and model',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Completion generated successfully',
    type: CompletionResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Internal server error',
    type: ErrorResponseDto,
  })
  async createCompletion(
    @Body() request: CompletionRequestDto,
  ): Promise<CompletionResponseDto> {
    this.logger.log(
      `Completion request received for provider: ${request.provider}, model: ${request.model}`,
    );
    return await this.computeBridgeService.complete(request);
  }

  /**
   * Generate embeddings
   * 
   * POST /compute-bridge/embeddings
   */
  @Post('embeddings')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate embeddings',
    description:
      'Generate embeddings for input text using the specified AI provider and model',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Embeddings generated successfully',
    type: EmbeddingResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.BAD_REQUEST,
    description: 'Invalid request',
    type: ErrorResponseDto,
  })
  @ApiResponse({
    status: HttpStatus.INTERNAL_SERVER_ERROR,
    description: 'Internal server error',
    type: ErrorResponseDto,
  })
  async createEmbedding(
    @Body() request: EmbeddingRequestDto,
  ): Promise<EmbeddingResponseDto> {
    this.logger.log(
      `Embedding request received for provider: ${request.provider}, model: ${request.model}`,
    );
    return await this.computeBridgeService.generateEmbeddings(request);
  }

  /**
   * List available providers
   * 
   * GET /compute-bridge/providers
   */
  @Get('providers')
  @ApiOperation({
    summary: 'List available providers',
    description: 'Get a list of all registered AI providers',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of registered providers',
    type: [String],
  })
  listProviders(): AIProviderType[] {
    this.logger.log('Listing available providers');
    return this.computeBridgeService.listProviders();
  }

  /**
   * Get available models for a provider
   * 
   * GET /compute-bridge/providers/:provider/models
   */
  @Get('providers/:provider/models')
  @ApiOperation({
    summary: 'Get available models for a provider',
    description: 'List all available models for a specific AI provider',
  })
  @ApiParam({
    name: 'provider',
    enum: AIProviderType,
    description: 'AI provider type',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'List of available models',
  })
  @ApiResponse({
    status: HttpStatus.NOT_FOUND,
    description: 'Provider not found',
    type: ErrorResponseDto,
  })
  async getProviderModels(@Param('provider') provider: AIProviderType) {
    this.logger.log(`Fetching models for provider: ${provider}`);
    return await this.computeBridgeService.getAvailableModels(provider);
  }

  /**
   * Validate a model
   * 
   * GET /compute-bridge/providers/:provider/models/:modelId/validate
   */
  @Get('providers/:provider/models/:modelId/validate')
  @ApiOperation({
    summary: 'Validate a model',
    description: 'Check if a specific model is available for a provider',
  })
  @ApiParam({
    name: 'provider',
    enum: AIProviderType,
    description: 'AI provider type',
  })
  @ApiParam({
    name: 'modelId',
    description: 'Model identifier',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Model validation result',
    schema: {
      type: 'object',
      properties: {
        valid: { type: 'boolean' },
        provider: { type: 'string' },
        modelId: { type: 'string' },
      },
    },
  })
  async validateModel(
    @Param('provider') provider: AIProviderType,
    @Param('modelId') modelId: string,
  ) {
    this.logger.log(`Validating model: ${provider}/${modelId}`);
    const valid = await this.computeBridgeService.validateModel(
      provider,
      modelId,
    );
    return {
      valid,
      provider,
      modelId,
    };
  }

  /**
   * Health check endpoint
   * 
   * GET /compute-bridge/health
   */
  @Get('health')
  @ApiOperation({
    summary: 'Health check',
    description: 'Check if the ComputeBridge service is operational',
  })
  @ApiResponse({
    status: HttpStatus.OK,
    description: 'Service is healthy',
    schema: {
      type: 'object',
      properties: {
        status: { type: 'string', example: 'ok' },
        timestamp: { type: 'string', example: '2024-01-01T00:00:00.000Z' },
        providers: { type: 'number', example: 2 },
      },
    },
  })
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      providers: this.computeBridgeService.listProviders().length,
    };
  }
}