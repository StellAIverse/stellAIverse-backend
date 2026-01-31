import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, SelectQueryBuilder } from 'typeorm';
import { Agent, AgentStatus } from './entities/agent.entity';
import { SearchAgentsDto, SortBy } from './dto/search-agents.dto';
import { SearchAgentsResponseDto } from './dto/agent-response.dto';

@Injectable()
export class AgentsService {
  private readonly logger = new Logger(AgentsService.name);

  constructor(
    @InjectRepository(Agent)
    private readonly agentRepository: Repository<Agent>,
  ) {}

  /**
   * Search and filter agents with ranking and pagination
   */
  async searchAgents(searchDto: SearchAgentsDto): Promise<SearchAgentsResponseDto> {
    const startTime = Date.now();
    
    const queryBuilder = this.buildSearchQuery(searchDto);
    
    // Apply sorting
    this.applySorting(queryBuilder, searchDto);
    
    // Get total count for pagination
    const total = await queryBuilder.getCount();
    
    // Apply pagination
    const { page = 1, limit = 20 } = searchDto;
    const skip = (page - 1) * limit;
    
    queryBuilder.skip(skip).take(limit);
    
    // Execute query
    const agents = await queryBuilder.getMany();
    
    const duration = Date.now() - startTime;
    this.logger.log(`Search completed in ${duration}ms. Found ${total} agents.`);
    
    return new SearchAgentsResponseDto(agents, total, page, limit);
  }

  /**
   * Build the base search query with filters
   */
  private buildSearchQuery(searchDto: SearchAgentsDto): SelectQueryBuilder<Agent> {
    const queryBuilder = this.agentRepository.createQueryBuilder('agent');
    
    // Text search on name and description
    if (searchDto.query) {
      queryBuilder.andWhere(
        '(LOWER(agent.name) LIKE LOWER(:query) OR LOWER(agent.description) LIKE LOWER(:query))',
        { query: `%${searchDto.query}%` },
      );
    }
    
    // Filter by status (default to ACTIVE if not specified)
    const status = searchDto.status || AgentStatus.ACTIVE;
    queryBuilder.andWhere('agent.status = :status', { status });
    
    // Filter by capabilities (agent must have ALL specified capabilities)
    if (searchDto.capabilities && searchDto.capabilities.length > 0) {
      queryBuilder.andWhere('agent.capabilities @> :capabilities', {
        capabilities: searchDto.capabilities,
      });
    }
    
    // Filter by minimum rating
    if (searchDto.minRating !== undefined) {
      queryBuilder.andWhere('agent.averageRating >= :minRating', {
        minRating: searchDto.minRating,
      });
    }
    
    // Filter by tags (metadata.tags contains any of the specified tags)
    if (searchDto.tags && searchDto.tags.length > 0) {
      queryBuilder.andWhere(
        'agent.metadata->\'tags\' ?| :tags',
        { tags: searchDto.tags },
      );
    }
    
    return queryBuilder;
  }

  /**
   * Apply sorting based on the specified criteria
   */
  private applySorting(
    queryBuilder: SelectQueryBuilder<Agent>,
    searchDto: SearchAgentsDto,
  ): void {
    const { sortBy = SortBy.POPULARITY, sortOrder = 'DESC' } = searchDto;
    
    switch (sortBy) {
      case SortBy.POPULARITY:
        // Popularity score is calculated using a weighted formula
        queryBuilder.orderBy('agent.popularityScore', sortOrder);
        break;
        
      case SortBy.RATING:
        // Sort by average rating, then by total ratings
        queryBuilder
          .orderBy('agent.averageRating', sortOrder)
          .addOrderBy('agent.totalRatings', sortOrder);
        break;
        
      case SortBy.RECENT:
        // Sort by creation date
        queryBuilder.orderBy('agent.createdAt', sortOrder);
        break;
        
      case SortBy.USAGE:
        // Sort by usage count
        queryBuilder.orderBy('agent.usageCount', sortOrder);
        break;
        
      case SortBy.NAME:
        // Alphabetical sorting
        queryBuilder.orderBy('agent.name', sortOrder);
        break;
        
      default:
        queryBuilder.orderBy('agent.popularityScore', 'DESC');
    }
    
    // Add secondary sort by ID for stable ordering
    queryBuilder.addOrderBy('agent.id', 'ASC');
  }

  /**
   * Update popularity score for an agent
   * This should be called periodically or after significant events
   */
  async updatePopularityScore(agentId: string): Promise<void> {
    const agent = await this.agentRepository.findOne({ where: { id: agentId } });
    
    if (!agent) {
      return;
    }
    
    // Popularity scoring heuristic:
    // - 40% weight on average rating
    // - 30% weight on usage count (normalized)
    // - 20% weight on recency (how recently used)
    // - 10% weight on total ratings (engagement)
    
    const ratingScore = (Number(agent.averageRating) / 5) * 40;
    
    // Normalize usage count (using log scale to prevent dominance)
    const usageScore = Math.min((Math.log10(agent.usageCount + 1) / 5) * 30, 30);
    
    // Recency score (days since last use, max 30 days)
    let recencyScore = 0;
    if (agent.lastUsedAt) {
      const daysSinceUse = (Date.now() - agent.lastUsedAt.getTime()) / (1000 * 60 * 60 * 24);
      recencyScore = Math.max(0, (30 - daysSinceUse) / 30) * 20;
    }
    
    // Engagement score (normalized total ratings)
    const engagementScore = Math.min((Math.log10(agent.totalRatings + 1) / 3) * 10, 10);
    
    const popularityScore = ratingScore + usageScore + recencyScore + engagementScore;
    
    await this.agentRepository.update(agentId, {
      popularityScore: Number(popularityScore.toFixed(2)),
    });
    
    this.logger.debug(`Updated popularity score for agent ${agentId}: ${popularityScore.toFixed(2)}`);
  }

  /**
   * Batch update popularity scores for all agents
   */
  async updateAllPopularityScores(): Promise<void> {
    this.logger.log('Starting batch update of popularity scores...');
    
    const agents = await this.agentRepository.find();
    
    for (const agent of agents) {
      await this.updatePopularityScore(agent.id);
    }
    
    this.logger.log(`Updated popularity scores for ${agents.length} agents`);
  }

  /**
   * Get a single agent by ID
   */
  async findOne(id: string): Promise<Agent | null> {
    return this.agentRepository.findOne({ where: { id } });
  }

  /**
   * Track agent usage (increments usage count and updates last used timestamp)
   */
  async trackUsage(agentId: string): Promise<void> {
    await this.agentRepository.increment({ id: agentId }, 'usageCount', 1);
    await this.agentRepository.update(agentId, { lastUsedAt: new Date() });
    
    // Update popularity score after usage
    await this.updatePopularityScore(agentId);
  }
}