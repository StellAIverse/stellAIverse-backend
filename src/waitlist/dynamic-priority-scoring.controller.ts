import { 
  Controller, 
  Get, 
  Post, 
  Body, 
  Param, 
  Query, 
  UseGuards,
  HttpStatus,
  HttpCode
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiQuery } from '@nestjs/swagger';
import { DynamicPriorityScoringService, ScoringConfiguration } from './dynamic-priority-scoring.service';

@ApiTags('dynamic-priority-scoring')
@Controller('waitlist/dynamic-scoring')
export class DynamicPriorityScoringController {
  constructor(private readonly scoringService: DynamicPriorityScoringService) {}

  @Post('calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate priority score for a user' })
  @ApiResponse({ status: 200, description: 'Score calculated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid request parameters' })
  async calculateScore(
    @Body() body: {
      userId: string;
      waitlistId: string;
      configurationId?: string;
    }
  ) {
    const result = await this.scoringService.calculatePriorityScore(
      body.userId,
      body.waitlistId,
      body.configurationId
    );
    
    return {
      success: true,
      data: result,
    };
  }

  @Post('batch-calculate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Calculate scores for all users in a waitlist' })
  @ApiResponse({ status: 200, description: 'Batch calculation completed successfully' })
  async batchCalculateScores(
    @Body() body: {
      waitlistId: string;
      configurationId?: string;
    }
  ) {
    const results = await this.scoringService.batchCalculateScores(
      body.waitlistId,
      body.configurationId
    );
    
    return {
      success: true,
      data: {
        totalUsers: results.length,
        results,
      },
    };
  }

  @Get('config/:configurationId?')
  @ApiOperation({ summary: 'Get scoring configuration' })
  @ApiParam({ name: 'configurationId', required: false, description: 'Configuration ID (default: default)' })
  @ApiResponse({ status: 200, description: 'Configuration retrieved successfully' })
  async getScoringConfiguration(
    @Param('configurationId') configurationId?: string
  ) {
    const config = this.scoringService.getScoringConfiguration(configurationId);
    
    return {
      success: true,
      data: config,
    };
  }

  @Post('config/:configurationId?')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update scoring configuration' })
  @ApiParam({ name: 'configurationId', required: false, description: 'Configuration ID (default: default)' })
  @ApiResponse({ status: 200, description: 'Configuration updated successfully' })
  @ApiResponse({ status: 400, description: 'Invalid configuration' })
  async updateScoringConfiguration(
    @Param('configurationId') configurationId = 'default',
    @Body() body: {
      config: Partial<ScoringConfiguration>;
      updatedBy: string;
    }
  ) {
    const updatedConfig = await this.scoringService.updateScoringConfiguration(
      configurationId,
      body.config,
      body.updatedBy
    );
    
    return {
      success: true,
      data: updatedConfig,
    };
  }

  @Get('trend/:userId/:waitlistId')
  @ApiOperation({ summary: 'Get score trend for a user' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiParam({ name: 'waitlistId', description: 'Waitlist ID' })
  @ApiResponse({ status: 200, description: 'Score trend retrieved successfully' })
  async getScoreTrend(
    @Param('userId') userId: string,
    @Param('waitlistId') waitlistId: string
  ) {
    const trend = this.scoringService.getScoreTrend(userId);
    
    return {
      success: true,
      data: trend,
    };
  }

  @Get('analytics/:waitlistId')
  @ApiOperation({ summary: 'Get scoring analytics for a waitlist' })
  @ApiParam({ name: 'waitlistId', description: 'Waitlist ID' })
  @ApiResponse({ status: 200, description: 'Analytics retrieved successfully' })
  async getScoringAnalytics(@Param('waitlistId') waitlistId: string) {
    const analytics = await this.scoringService.getScoringAnalytics(waitlistId);
    
    return {
      success: true,
      data: analytics,
    };
  }
}
