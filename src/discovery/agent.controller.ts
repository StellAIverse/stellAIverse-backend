import {
  Controller,
  Get,
  Query,
  Param,
  Post,
  NotFoundException,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
} from '@nestjs/swagger';
import { AgentsService } from './agents.service';
import { SearchAgentsDto } from './dto/search-agents.dto';
import { SearchAgentsResponseDto, AgentResponseDto } from './dto/agent-response.dto';

@ApiTags('agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agentsService: AgentsService) {}

  @Get('search')
  @ApiOperation({
    summary: 'Search and discover agents',
    description: 'Search agents with filtering, ranking, and pagination. Supports filtering by capabilities, status, rating, and tags.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved agents',
    type: SearchAgentsResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid search parameters',
  })
  async searchAgents(
    @Query() searchDto: SearchAgentsDto,
  ): Promise<SearchAgentsResponseDto> {
    return this.agentsService.searchAgents(searchDto);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get agent by ID',
    description: 'Retrieve detailed information about a specific agent',
  })
  @ApiParam({
    name: 'id',
    description: 'Agent ID',
    example: 'uuid-here',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully retrieved agent',
    type: AgentResponseDto,
  })
  @ApiResponse({
    status: 404,
    description: 'Agent not found',
  })
  async getAgent(@Param('id') id: string): Promise<AgentResponseDto> {
    const agent = await this.agentsService.findOne(id);
    
    if (!agent) {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }
    
    return new AgentResponseDto(agent);
  }

  @Post(':id/track-usage')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Track agent usage',
    description: 'Increments usage count and updates last used timestamp. This affects ranking.',
  })
  @ApiParam({
    name: 'id',
    description: 'Agent ID',
    example: 'uuid-here',
  })
  @ApiResponse({
    status: 204,
    description: 'Usage tracked successfully',
  })
  @ApiResponse({
    status: 404,
    description: 'Agent not found',
  })
  async trackUsage(@Param('id') id: string): Promise<void> {
    const agent = await this.agentsService.findOne(id);
    
    if (!agent) {
      throw new NotFoundException(`Agent with ID ${id} not found`);
    }
    
    await this.agentsService.trackUsage(id);
  }

  @Post('update-popularity-scores')
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: 'Update popularity scores (Admin)',
    description: 'Batch update popularity scores for all agents. This is a background operation.',
  })
  @ApiResponse({
    status: 202,
    description: 'Popularity score update initiated',
  })
  async updatePopularityScores(): Promise<{ message: string }> {
    // This should ideally be run as a background job
    this.agentsService.updateAllPopularityScores().catch(err => {
      console.error('Error updating popularity scores:', err);
    });
    
    return { message: 'Popularity score update initiated' };
  }
}