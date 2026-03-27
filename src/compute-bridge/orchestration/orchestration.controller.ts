import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { MultiProviderOrchestrationService } from './multi-provider-orchestration.service';
import { AuditService } from './audit.service';
import { ConsensusService } from './consensus.service';
import {
  OrchestrationStrategy,
  OrchestratedRequestConfig,
  OrchestratedResponse,
  ProviderExecutionMode,
  ConsensusAlgorithm,
} from './orchestration.interface';
import { AIProviderType } from '../provider.interface';
import { CompletionRequestDto } from '../base.dto';

/**
 * Orchestration DTOs
 */
class OrchestratedCompletionRequestDto extends CompletionRequestDto {
  strategy: OrchestrationStrategy;
  targetProviders?: AIProviderType[];
  timeoutMs?: number;
  consensusConfig?: {
    algorithm: ConsensusAlgorithm;
    minAgreementPercentage: number;
    similarityThreshold?: number;
  };
  bestOfNConfig?: {
    n: number;
    criteria: 'fastest' | 'cheapest' | 'highest_quality' | 'most_tokens';
  };
}

class ProviderModeUpdateDto {
  provider: AIProviderType;
  mode: ProviderExecutionMode;
}

@ApiTags('orchestration')
@Controller('orchestration')
export class OrchestrationController {
  constructor(
    private readonly orchestrationService: MultiProviderOrchestrationService,
    private readonly auditService: AuditService,
    private readonly consensusService: ConsensusService,
  ) {}

  /**
   * Execute a completion with multi-provider orchestration
   */
  @Post('complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute completion with multi-provider orchestration' })
  @ApiResponse({ status: 200, description: 'Completion successful' })
  @ApiResponse({ status: 500, description: 'All providers failed' })
  async orchestratedComplete(
    @Body() request: OrchestratedCompletionRequestDto,
  ): Promise<OrchestratedResponse> {
    const config: OrchestratedRequestConfig = {
      strategy: request.strategy,
      targetProviders: request.targetProviders,
      timeoutMs: request.timeoutMs,
      consensusConfig: request.consensusConfig,
      bestOfNConfig: request.bestOfNConfig,
    };

    // Remove orchestration-specific fields from the request
    const completionRequest: CompletionRequestDto = {
      provider: request.provider,
      model: request.model,
      messages: request.messages,
      temperature: request.temperature,
      maxTokens: request.maxTokens,
      topP: request.topP,
      stream: false,
      stop: request.stop,
      timeout: request.timeout,
    };

    return this.orchestrationService.orchestrate(completionRequest, config);
  }

  /**
   * Execute with consensus strategy
   */
  @Post('consensus')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute with consensus across multiple providers' })
  async consensusComplete(
    @Body() request: CompletionRequestDto,
    @Query('providers') providers?: AIProviderType[],
    @Query('algorithm') algorithm: ConsensusAlgorithm = ConsensusAlgorithm.MAJORITY_VOTE,
    @Query('minAgreement') minAgreement: number = 0.5,
  ): Promise<OrchestratedResponse> {
    const config: OrchestratedRequestConfig = {
      strategy: OrchestrationStrategy.CONSENSUS,
      targetProviders: providers,
      consensusConfig: {
        algorithm,
        minAgreementPercentage: minAgreement,
      },
    };

    return this.orchestrationService.orchestrate(request, config);
  }

  /**
   * Execute in parallel to all providers
   */
  @Post('parallel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute in parallel to all enabled providers' })
  async parallelComplete(
    @Body() request: CompletionRequestDto,
    @Query('providers') providers?: AIProviderType[],
  ): Promise<OrchestratedResponse> {
    const config: OrchestratedRequestConfig = {
      strategy: OrchestrationStrategy.PARALLEL,
      targetProviders: providers,
    };

    return this.orchestrationService.orchestrate(request, config);
  }

  /**
   * Execute with best-of-N selection
   */
  @Post('best-of-n')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Execute with best-of-N provider selection' })
  async bestOfNComplete(
    @Body() request: CompletionRequestDto,
    @Query('n') n: number = 3,
    @Query('criteria') criteria: 'fastest' | 'cheapest' | 'highest_quality' | 'most_tokens' = 'fastest',
  ): Promise<OrchestratedResponse> {
    const config: OrchestratedRequestConfig = {
      strategy: OrchestrationStrategy.BEST_OF_N,
      bestOfNConfig: {
        n,
        criteria,
      },
    };

    return this.orchestrationService.orchestrate(request, config);
  }

  /**
   * Get orchestration health status
   */
  @Get('health')
  @ApiOperation({ summary: 'Get orchestration health status' })
  async getHealthStatus() {
    return this.orchestrationService.getHealthStatus();
  }

  /**
   * Get provider execution mode
   */
  @Get('providers/:provider/mode')
  @ApiOperation({ summary: 'Get provider execution mode' })
  getProviderMode(@Query('provider') provider: AIProviderType) {
    return {
      provider,
      mode: this.orchestrationService.getProviderMode(provider),
    };
  }

  /**
   * Set provider execution mode
   */
  @Post('providers/mode')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Set provider execution mode at runtime' })
  setProviderMode(@Body() update: ProviderModeUpdateDto) {
    this.orchestrationService.setProviderMode(update.provider, update.mode);
    return {
      message: `Provider ${update.provider} mode set to ${update.mode}`,
      provider: update.provider,
      mode: update.mode,
    };
  }

  /**
   * Enable a provider
   */
  @Post('providers/:provider/enable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Enable a provider' })
  enableProvider(@Query('provider') provider: AIProviderType) {
    this.orchestrationService.setProviderMode(provider, ProviderExecutionMode.ENABLED);
    return {
      message: `Provider ${provider} enabled`,
      provider,
      mode: ProviderExecutionMode.ENABLED,
    };
  }

  /**
   * Disable a provider
   */
  @Post('providers/:provider/disable')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Disable a provider' })
  disableProvider(@Query('provider') provider: AIProviderType) {
    this.orchestrationService.setProviderMode(provider, ProviderExecutionMode.DISABLED);
    return {
      message: `Provider ${provider} disabled`,
      provider,
      mode: ProviderExecutionMode.DISABLED,
    };
  }

  /**
   * Get audit log
   */
  @Get('audit-log')
  @ApiOperation({ summary: 'Get provider audit log' })
  async getAuditLog(
    @Query('requestId') requestId?: string,
    @Query('provider') provider?: AIProviderType,
    @Query('limit') limit?: number,
    @Query('offset') offset?: number,
  ) {
    const entries = this.auditService.getAuditLog({
      requestId,
      provider,
      limit,
      offset,
    });

    return {
      entries,
      count: entries.length,
    };
  }

  /**
   * Export audit log
   */
  @Get('audit-log/export')
  @ApiOperation({ summary: 'Export audit log' })
  async exportAuditLog(
    @Query('format') format: 'json' | 'csv' = 'json',
  ) {
    const data = this.auditService.exportAuditLog({ format });
    return {
      data,
      format,
    };
  }

  /**
   * Get audit statistics
   */
  @Get('audit-log/statistics')
  @ApiOperation({ summary: 'Get audit statistics' })
  async getAuditStatistics() {
    return this.auditService.getStatistics();
  }

  /**
   * Verify audit entry integrity
   */
  @Get('audit-log/:auditId/verify')
  @ApiOperation({ summary: 'Verify audit entry integrity' })
  verifyAuditEntry(@Query('auditId') auditId: string) {
    const isValid = this.auditService.verifyIntegrity(auditId);
    return {
      auditId,
      isValid,
    };
  }
}
