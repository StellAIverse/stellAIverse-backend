import { Test, TestingModule } from "@nestjs/testing";
import { ConsensusService } from "./consensus.service";
import { ResponseNormalizerService } from "./response-normalizer.service";
import {
  ConsensusAlgorithm,
  ConsensusConfig,
  NormalizedProviderResponse,
} from "./orchestration.interface";
import { AIProviderType } from "../provider.interface";

describe("ConsensusService", () => {
  let service: ConsensusService;
  let normalizer: ResponseNormalizerService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ConsensusService, ResponseNormalizerService],
    }).compile();

    service = module.get<ConsensusService>(ConsensusService);
    normalizer = module.get<ResponseNormalizerService>(
      ResponseNormalizerService,
    );
  });

  describe("majorityVote", () => {
    it("should return consensus when majority agree", async () => {
      const responses: NormalizedProviderResponse[] = [
        createMockResponse(AIProviderType.OPENAI, "The answer is 42"),
        createMockResponse(AIProviderType.ANTHROPIC, "The answer is 42"),
        createMockResponse(AIProviderType.GOOGLE, "The answer is 42"),
        createMockResponse(AIProviderType.HUGGINGFACE, "Different answer"),
      ];

      const config: ConsensusConfig = {
        algorithm: ConsensusAlgorithm.MAJORITY_VOTE,
        minAgreementPercentage: 0.5,
      };

      const result = await service.reachConsensus(responses, config);

      expect(result.consensusReached).toBe(true);
      expect(result.winner).toBe("The answer is 42");
      expect(result.agreementCount).toBe(3);
      expect(result.agreementPercentage).toBe(0.75);
    });

    it("should fail consensus when agreement is below threshold", async () => {
      const responses: NormalizedProviderResponse[] = [
        createMockResponse(AIProviderType.OPENAI, "Answer A"),
        createMockResponse(AIProviderType.ANTHROPIC, "Answer B"),
        createMockResponse(AIProviderType.GOOGLE, "Answer C"),
        createMockResponse(AIProviderType.HUGGINGFACE, "Answer D"),
      ];

      const config: ConsensusConfig = {
        algorithm: ConsensusAlgorithm.MAJORITY_VOTE,
        minAgreementPercentage: 0.6,
      };

      const result = await service.reachConsensus(responses, config);

      expect(result.consensusReached).toBe(false);
      expect(result.agreementPercentage).toBe(0.25);
    });

    it("should handle single response", async () => {
      const responses: NormalizedProviderResponse[] = [
        createMockResponse(AIProviderType.OPENAI, "Only answer"),
      ];

      const config: ConsensusConfig = {
        algorithm: ConsensusAlgorithm.MAJORITY_VOTE,
        minAgreementPercentage: 0.5,
      };

      const result = await service.reachConsensus(responses, config);

      expect(result.consensusReached).toBe(true);
      expect(result.winner).toBe("Only answer");
      expect(result.agreementCount).toBe(1);
    });

    it("should handle no valid responses", async () => {
      const responses: NormalizedProviderResponse[] = [];

      const config: ConsensusConfig = {
        algorithm: ConsensusAlgorithm.MAJORITY_VOTE,
        minAgreementPercentage: 0.5,
      };

      const result = await service.reachConsensus(responses, config);

      expect(result.consensusReached).toBe(false);
      expect(result.winner).toBe("");
    });
  });

  describe("weightedVote", () => {
    it("should weight votes according to provider weights", async () => {
      const responses: NormalizedProviderResponse[] = [
        createMockResponse(AIProviderType.OPENAI, "Answer A"),
        createMockResponse(AIProviderType.ANTHROPIC, "Answer B"),
        createMockResponse(AIProviderType.GOOGLE, "Answer B"),
      ];

      const weights = new Map([
        [AIProviderType.OPENAI, 3], // Strong weight for Answer A
        [AIProviderType.ANTHROPIC, 1],
        [AIProviderType.GOOGLE, 1],
      ]);

      const config: ConsensusConfig = {
        algorithm: ConsensusAlgorithm.WEIGHTED_VOTE,
        minAgreementPercentage: 0.5,
        providerWeights: weights,
      };

      const result = await service.reachConsensus(responses, config);

      // Answer A should win due to higher weight (3 vs 2)
      expect(result.winner).toBe("Answer A");
      expect(
        result.votes.find((v) => v.provider === AIProviderType.OPENAI)?.weight,
      ).toBe(3);
    });
  });

  describe("exactMatch", () => {
    it("should require exact string match", async () => {
      const responses: NormalizedProviderResponse[] = [
        createMockResponse(AIProviderType.OPENAI, "Exact match"),
        createMockResponse(AIProviderType.ANTHROPIC, "Exact match"),
        createMockResponse(AIProviderType.GOOGLE, "exact match"), // Different case
      ];

      const config: ConsensusConfig = {
        algorithm: ConsensusAlgorithm.EXACT_MATCH,
        minAgreementPercentage: 0.5,
      };

      const result = await service.reachConsensus(responses, config);

      // Only 2 exact matches (case sensitive)
      expect(result.agreementCount).toBe(2);
      expect(result.agreementPercentage).toBe(2 / 3);
    });
  });

  describe("semanticClustering", () => {
    it("should group semantically similar responses", async () => {
      const responses: NormalizedProviderResponse[] = [
        createMockResponse(AIProviderType.OPENAI, "The quick brown fox"),
        createMockResponse(
          AIProviderType.ANTHROPIC,
          "The quick brown fox jumps",
        ),
        createMockResponse(
          AIProviderType.GOOGLE,
          "Completely different content here",
        ),
      ];

      const config: ConsensusConfig = {
        algorithm: ConsensusAlgorithm.SEMANTIC_CLUSTERING,
        minAgreementPercentage: 0.5,
        similarityThreshold: 0.6,
      };

      const result = await service.reachConsensus(responses, config);

      // First two should cluster together
      expect(result.agreementCount).toBeGreaterThanOrEqual(2);
    });
  });

  // Helper function to create mock responses
  function createMockResponse(
    provider: AIProviderType,
    content: string,
  ): NormalizedProviderResponse {
    return {
      id: `${provider}-${Date.now()}`,
      provider,
      model: "test-model",
      content,
      rawResponse: {},
      usage: {
        promptTokens: 10,
        completionTokens: 20,
        totalTokens: 30,
      },
      latencyMs: 100,
      timestamp: new Date(),
      isValid: true,
    };
  }
});
