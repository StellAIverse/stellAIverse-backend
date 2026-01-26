import { Test, TestingModule } from '@nestjs/testing';
import { RecommendationService } from './recommendation.service';
import { AgentService } from '../agent/agent.service';

describe('RecommendationService', () => {
    let service: RecommendationService;
    let agentService: AgentService;

    beforeEach(async () => {
        const module: TestingModule = await Test.createTestingModule({
            providers: [
                RecommendationService,
                {
                    provide: AgentService,
                    useValue: {
                        findAll: jest.fn().mockReturnValue([
                            { id: '1', name: 'Agent A', performanceScore: 100, usageCount: 0 },
                            { id: '2', name: 'Agent B', performanceScore: 0, usageCount: 100 },
                        ]),
                    },
                },
            ],
        }).compile();

        service = module.get<RecommendationService>(RecommendationService);
        agentService = module.get<AgentService>(AgentService);
    });

    it('should be defined', () => {
        expect(service).toBeDefined();
    });

    it('should calculate scores correctly', () => {
        const recommendations = service.getRecommendations();
        expect(recommendations).toHaveLength(2);

        // Agent A: 100 * 0.7 + 0 * 0.3 = 70
        const agentA = recommendations.find((r) => r.agentId === '1');
        expect(agentA.totalScore).toBe(70);

        // Agent B: 0 * 0.7 + 100 * 0.3 = 30
        const agentB = recommendations.find((r) => r.agentId === '2');
        expect(agentB.totalScore).toBe(30);
    });

    it('should sort recommendations by totalScore descending', () => {
        const recommendations = service.getRecommendations();
        expect(recommendations[0].totalScore).toBeGreaterThan(recommendations[1].totalScore);
    });
});
