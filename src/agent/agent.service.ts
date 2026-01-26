import { Injectable } from '@nestjs/common';
import { Agent } from './entities/agent.entity';

@Injectable()
export class AgentService {
    private readonly agents: Agent[] = [
        {
            id: '1',
            name: 'AlphaScout',
            description: 'Finds early-stage opportunities on-chain.',
            creator: '0xAlpha',
            capabilities: ['discovery', 'on-chain-analysis'],
            usageCount: 150,
            performanceScore: 92,
        },
        {
            id: '2',
            name: 'BetaGuard',
            description: 'Monitors liquidity pools for unusual activity.',
            creator: '0xBeta',
            capabilities: ['security', 'monitoring'],
            usageCount: 80,
            performanceScore: 88,
        },
        {
            id: '3',
            name: 'GammaTrade',
            description: 'Executes high-frequency trades based on sentiment.',
            creator: '0xGamma',
            capabilities: ['trading', 'sentiment-analysis'],
            usageCount: 300,
            performanceScore: 75,
        },
        {
            id: '4',
            name: 'DeltaOracle',
            description: 'Provides real-time price feeds for obscure tokens.',
            creator: '0xDelta',
            capabilities: ['oracle', 'pricing'],
            usageCount: 45,
            performanceScore: 95,
        },
        {
            id: '5',
            name: 'EpsilonBot',
            description: 'Automates social media engagement for projects.',
            creator: '0xEpsilon',
            capabilities: ['social', 'automation'],
            usageCount: 20,
            performanceScore: 60,
        },
    ];

    findAll(): Agent[] {
        return this.agents;
    }

    findOne(id: string): Agent {
        return this.agents.find((agent) => agent.id === id);
    }
}
