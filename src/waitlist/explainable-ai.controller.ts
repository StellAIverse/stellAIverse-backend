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
import { ExplainableAIService, AppealRequest, AppealResponse } from './explainable-ai.service';
import { ExplanationType } from './entities/explanation.entity';

@ApiTags('explainable-ai')
@Controller('waitlist/explainable-ai')
export class ExplainableAIController {
  constructor(private readonly explainableService: ExplainableAIService) {}

  @Post('explanations')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Generate explanation for user priority score' })
  @ApiResponse({ status: 200, description: 'Explanation generated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  async generateExplanation(
    @Body() body: {
      userId: string;
      waitlistId: string;
      explanationType?: ExplanationType;
    }
  ) {
    const result = await this.explainableService.generateExplanation(
      body.userId,
      body.waitlistId,
      body.explanationType
    );
    
    return {
      success: true,
      data: result,
    };
  }

  @Get('explanations/:userId/:waitlistId')
  @ApiOperation({ summary: 'Get user explanation history' })
  @ApiParam({ name: 'userId', description: 'User ID' })
  @ApiParam({ name: 'waitlistId', description: 'Waitlist ID' })
  @ApiQuery({ name: 'limit', required: false, description: 'Number of explanations to return' })
  @ApiResponse({ status: 200, description: 'Explanation history retrieved successfully' })
  async getExplanationHistory(
    @Param('userId') userId: string,
    @Param('waitlistId') waitlistId: string,
    @Query('limit') limit?: string
  ) {
    const history = await this.explainableService.getUserExplanationHistory(
      userId,
      waitlistId,
      limit ? parseInt(limit) : 10
    );
    
    return {
      success: true,
      data: history,
    };
  }

  @Post('appeals')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'File an appeal for priority decision' })
  @ApiResponse({ status: 200, description: 'Appeal filed successfully' })
  @ApiResponse({ status: 400, description: 'Invalid appeal request' })
  async fileAppeal(@Body() appealRequest: AppealRequest): Promise<{ success: boolean; data: AppealResponse }> {
    const response = await this.explainableService.fileAppeal(appealRequest);
    
    return {
      success: true,
      data: response,
    };
  }

  @Get('bias-detection/:waitlistId')
  @ApiOperation({ summary: 'Get bias detection metrics for waitlist' })
  @ApiParam({ name: 'waitlistId', description: 'Waitlist ID' })
  @ApiResponse({ status: 200, description: 'Bias detection metrics retrieved successfully' })
  async getBiasDetectionMetrics(@Param('waitlistId') waitlistId: string) {
    const metrics = await this.explainableService.getBiasDetectionMetrics(waitlistId);
    
    return {
      success: true,
      data: metrics,
    };
  }
}
