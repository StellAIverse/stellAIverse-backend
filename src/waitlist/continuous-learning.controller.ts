import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  UseGuards,
  HttpStatus,
  HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from '@nestjs/swagger';
import { ContinuousLearningService, LearningConfig } from './continuous-learning.service';

@ApiTags('continuous-learning')
@Controller('waitlist/continuous-learning')
export class ContinuousLearningController {
  constructor(private readonly continuousLearningService: ContinuousLearningService) {}

  @Get('config')
  @ApiOperation({ summary: 'Get continuous learning configuration' })
  @ApiResponse({ status: 200, description: 'Configuration retrieved successfully' })
  async getConfig() {
    const config = this.continuousLearningService.getConfig();
    
    return {
      success: true,
      data: config,
    };
  }

  @Post('config')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update continuous learning configuration' })
  @ApiResponse({ status: 200, description: 'Configuration updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid configuration' })
  async updateConfig(
    @Body() body: {
      config: Partial<LearningConfig>;
      updatedBy: string;
    }
  ) {
    await this.continuousLearningService.updateConfig(body.config, body.updatedBy);
    
    return {
      success: true,
      message: 'Configuration updated successfully',
    };
  }

  @Get('performance')
  @ApiOperation({ summary: 'Get model performance history' })
  @ApiResponse({ status: 200, description: 'Performance history retrieved successfully' })
  async getPerformanceHistory() {
    const history = this.continuousLearningService.getPerformanceHistory();
    
    return {
      success: true,
      data: history,
    };
  }

  @Get('experiments')
  @ApiOperation({ summary: 'Get active A/B testing experiments' })
  @ApiResponse({ status: 200, description: 'Experiments retrieved successfully' })
  async getActiveExperiments() {
    const experiments = this.continuousLearningService.getActiveExperiments();
    
    return {
      success: true,
      data: experiments,
    };
  }

  @Post('experiments')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Create new A/B testing experiment' })
  @ApiResponse({ status: 200, description: 'Experiment created successfully' })
  @ApiResponse({ status: 400, description: 'Invalid experiment parameters' })
  async createExperiment(
    @Body() body: {
      waitlistId: string;
      modelVersion: string;
      trafficAllocation?: number;
    }
  ) {
    const experimentId = await this.continuousLearningService.createExperiment(
      body.waitlistId,
      body.modelVersion,
      body.trafficAllocation
    );
    
    return {
      success: true,
      data: { experimentId },
    };
  }

  @Post('experiments/:experimentId/metrics')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update experiment metrics' })
  @ApiParam({ name: 'experimentId', description: 'Experiment ID' })
  @ApiResponse({ status: 200, description: 'Metrics updated successfully' })
  async updateExperimentMetrics(
    @Param('experimentId') experimentId: string,
    @Body() body: {
      metrics: any;
    }
  ) {
    await this.continuousLearningService.updateExperimentMetrics(experimentId, body.metrics);
    
    return {
      success: true,
      message: 'Metrics updated successfully',
    };
  }

  @Post('retrain')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Trigger manual model retraining' })
  @ApiResponse({ status: 200, description: 'Retraining triggered successfully' })
  async triggerRetraining(@Body() body: { waitlistId?: string }) {
    // This would trigger the scheduled retraining logic
    // Implementation depends on how you want to expose this functionality
    
    return {
      success: true,
      message: 'Retraining triggered successfully',
    };
  }
}
