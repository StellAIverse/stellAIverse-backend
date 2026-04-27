import { Injectable, Logger } from "@nestjs/common";
import { AIProviderType } from "../provider.interface";
import {
  ConsensusAlgorithm,
  ConsensusConfig,
  ConsensusResult,
  NormalizedProviderResponse,
  ProviderVote,
} from "./orchestration.interface";
import { ResponseNormalizerService } from "./response-normalizer.service";

/**
 * Consensus Service
 *
 * Implements various consensus algorithms for aggregating responses
 * from multiple AI providers and determining the most reliable answer.
 */
@Injectable()
export class ConsensusService {
  private readonly logger = new Logger(ConsensusService.name);

  constructor(private readonly normalizer: ResponseNormalizerService) {}

  /**
   * Reach consensus among multiple provider responses
   */
  async reachConsensus(
    responses: NormalizedProviderResponse[],
    config: ConsensusConfig,
  ): Promise<ConsensusResult> {
    // Filter out invalid responses
    const validResponses = responses.filter((r) => r.isValid);

    if (validResponses.length === 0) {
      return this.createNoConsensusResult(responses, "No valid responses");
    }

    if (validResponses.length === 1) {
      return this.createSingleResponseConsensus(validResponses[0]);
    }

    switch (config.algorithm) {
      case ConsensusAlgorithm.MAJORITY_VOTE:
        return this.majorityVote(validResponses, config);
      case ConsensusAlgorithm.WEIGHTED_VOTE:
        return this.weightedVote(validResponses, config);
      case ConsensusAlgorithm.SEMANTIC_CLUSTERING:
        return this.semanticClustering(validResponses, config);
      case ConsensusAlgorithm.EXACT_MATCH:
        return this.exactMatch(validResponses, config);
      default:
        return this.majorityVote(validResponses, config);
    }
  }

  /**
   * Simple majority voting
   */
  private majorityVote(
    responses: NormalizedProviderResponse[],
    config: ConsensusConfig,
  ): ConsensusResult {
    // Group responses by content similarity
    const groups = this.groupBySimilarity(responses, 0.9);

    // Find the largest group
    const largestGroup = groups.reduce((max, group) =>
      group.length > max.length ? group : max,
    );

    const agreementCount = largestGroup.length;
    const totalParticipants = responses.length;
    const agreementPercentage = agreementCount / totalParticipants;

    // Create votes
    const votes: ProviderVote[] = responses.map((response) => ({
      provider: response.provider,
      value: response.content,
      confidence: this.calculateConfidence(response),
      weight: 1,
    }));

    const consensusReached =
      agreementPercentage >= config.minAgreementPercentage;

    return {
      winner: largestGroup[0].content,
      algorithm: ConsensusAlgorithm.MAJORITY_VOTE,
      votes,
      agreementPercentage,
      agreementCount,
      totalParticipants,
      consensusReached,
      confidence:
        agreementPercentage * this.calculateAverageConfidence(largestGroup),
    };
  }

  /**
   * Weighted voting based on provider reliability
   */
  private weightedVote(
    responses: NormalizedProviderResponse[],
    config: ConsensusConfig,
  ): ConsensusResult {
    const weights = config.providerWeights || new Map();

    // Group responses with weighted counts
    const groups = this.groupBySimilarity(responses, 0.9);

    // Calculate weighted scores for each group
    const groupScores = groups.map((group) => {
      const weightedCount = group.reduce((sum, response) => {
        const weight = weights.get(response.provider) || 1;
        return sum + weight;
      }, 0);

      const avgConfidence = this.calculateAverageConfidence(group);

      return {
        group,
        score: weightedCount * avgConfidence,
        weightedCount,
      };
    });

    // Find the group with highest weighted score
    const winner = groupScores.reduce((max, current) =>
      current.score > max.score ? current : max,
    );

    const totalWeight = responses.reduce(
      (sum, r) => sum + (weights.get(r.provider) || 1),
      0,
    );

    const agreementPercentage = winner.weightedCount / totalWeight;

    // Create weighted votes
    const votes: ProviderVote[] = responses.map((response) => {
      const weight = weights.get(response.provider) || 1;
      return {
        provider: response.provider,
        value: response.content,
        confidence: this.calculateConfidence(response),
        weight,
      };
    });

    const consensusReached =
      agreementPercentage >= config.minAgreementPercentage;

    return {
      winner: winner.group[0].content,
      algorithm: ConsensusAlgorithm.WEIGHTED_VOTE,
      votes,
      agreementPercentage,
      agreementCount: winner.group.length,
      totalParticipants: responses.length,
      consensusReached,
      confidence:
        agreementPercentage * this.calculateAverageConfidence(winner.group),
    };
  }

  /**
   * Semantic clustering for grouping similar responses
   */
  private semanticClustering(
    responses: NormalizedProviderResponse[],
    config: ConsensusConfig,
  ): ConsensusResult {
    const threshold = config.similarityThreshold || 0.7;
    const clusters: NormalizedProviderResponse[][] = [];

    // Build clusters using semantic similarity
    for (const response of responses) {
      let added = false;

      for (const cluster of clusters) {
        // Check similarity with cluster representative
        const similarity = this.normalizer.calculateSemanticSimilarity(
          response,
          cluster[0],
        );

        if (similarity >= threshold) {
          cluster.push(response);
          added = true;
          break;
        }
      }

      if (!added) {
        clusters.push([response]);
      }
    }

    // Sort clusters by size (descending) and then by average confidence
    clusters.sort((a, b) => {
      const sizeDiff = b.length - a.length;
      if (sizeDiff !== 0) return sizeDiff;
      return (
        this.calculateAverageConfidence(b) - this.calculateAverageConfidence(a)
      );
    });

    const largestCluster = clusters[0];
    const agreementCount = largestCluster.length;
    const totalParticipants = responses.length;
    const agreementPercentage = agreementCount / totalParticipants;

    // Create votes with semantic similarity scores
    const votes: ProviderVote[] = responses.map((response) => ({
      provider: response.provider,
      value: response.content,
      confidence: this.calculateConfidence(response),
      weight: this.normalizer.calculateSemanticSimilarity(
        response,
        largestCluster[0],
      ),
    }));

    const consensusReached =
      agreementPercentage >= config.minAgreementPercentage;

    return {
      winner: this.aggregateClusterResponse(largestCluster),
      algorithm: ConsensusAlgorithm.SEMANTIC_CLUSTERING,
      votes,
      agreementPercentage,
      agreementCount,
      totalParticipants,
      consensusReached,
      confidence:
        agreementPercentage * this.calculateAverageConfidence(largestCluster),
    };
  }

  /**
   * Exact match consensus
   */
  private exactMatch(
    responses: NormalizedProviderResponse[],
    config: ConsensusConfig,
  ): ConsensusResult {
    // Group by exact content match
    const contentGroups = new Map<string, NormalizedProviderResponse[]>();

    for (const response of responses) {
      const normalized = response.content.trim().toLowerCase();
      const existing = contentGroups.get(normalized) || [];
      existing.push(response);
      contentGroups.set(normalized, existing);
    }

    // Find the group with most matches
    let largestGroup: NormalizedProviderResponse[] = [];
    for (const group of contentGroups.values()) {
      if (group.length > largestGroup.length) {
        largestGroup = group;
      }
    }

    const agreementCount = largestGroup.length;
    const totalParticipants = responses.length;
    const agreementPercentage = agreementCount / totalParticipants;

    const votes: ProviderVote[] = responses.map((response) => ({
      provider: response.provider,
      value: response.content,
      confidence: this.calculateConfidence(response),
      weight: 1,
    }));

    const consensusReached =
      agreementPercentage >= config.minAgreementPercentage;

    return {
      winner: largestGroup[0]?.content || "",
      algorithm: ConsensusAlgorithm.EXACT_MATCH,
      votes,
      agreementPercentage,
      agreementCount,
      totalParticipants,
      consensusReached,
      confidence: agreementPercentage,
    };
  }

  /**
   * Group responses by similarity
   */
  private groupBySimilarity(
    responses: NormalizedProviderResponse[],
    threshold: number,
  ): NormalizedProviderResponse[][] {
    const groups: NormalizedProviderResponse[][] = [];

    for (const response of responses) {
      let added = false;

      for (const group of groups) {
        const similarity = this.normalizer.calculateSimilarity(
          response,
          group[0],
        );
        if (similarity >= threshold) {
          group.push(response);
          added = true;
          break;
        }
      }

      if (!added) {
        groups.push([response]);
      }
    }

    return groups;
  }

  /**
   * Calculate confidence score for a response
   */
  private calculateConfidence(response: NormalizedProviderResponse): number {
    // Base confidence from response validity
    if (!response.isValid) return 0;

    // Factor in latency (faster = more confident)
    const latencyScore = Math.max(0, 1 - response.latencyMs / 10000);

    // Factor in token usage efficiency
    const tokenEfficiency =
      response.usage.completionTokens > 0
        ? Math.min(response.usage.completionTokens / 1000, 1)
        : 0.5;

    // Combine factors
    return 0.5 + latencyScore * 0.3 + tokenEfficiency * 0.2;
  }

  /**
   * Calculate average confidence for a group of responses
   */
  private calculateAverageConfidence(
    responses: NormalizedProviderResponse[],
  ): number {
    if (responses.length === 0) return 0;
    const total = responses.reduce(
      (sum, r) => sum + this.calculateConfidence(r),
      0,
    );
    return total / responses.length;
  }

  /**
   * Aggregate responses from a cluster into a single response
   */
  private aggregateClusterResponse(
    cluster: NormalizedProviderResponse[],
  ): string {
    if (cluster.length === 0) return "";
    if (cluster.length === 1) return cluster[0].content;

    // For now, return the most common response
    // In a more sophisticated implementation, this could use text summarization
    const contentCounts = new Map<string, number>();
    for (const response of cluster) {
      const normalized = response.content.trim().toLowerCase();
      contentCounts.set(normalized, (contentCounts.get(normalized) || 0) + 1);
    }

    let mostCommon = cluster[0].content;
    let maxCount = 0;

    for (const [content, count] of contentCounts) {
      if (count > maxCount) {
        maxCount = count;
        // Find the original casing
        mostCommon =
          cluster.find((r) => r.content.trim().toLowerCase() === content)
            ?.content || content;
      }
    }

    return mostCommon;
  }

  /**
   * Create a consensus result when no consensus can be reached
   */
  private createNoConsensusResult(
    responses: NormalizedProviderResponse[],
    reason: string,
  ): ConsensusResult {
    return {
      winner: "",
      algorithm: ConsensusAlgorithm.MAJORITY_VOTE,
      votes: responses.map((r) => ({
        provider: r.provider,
        value: r.content,
        confidence: 0,
        weight: 1,
      })),
      agreementPercentage: 0,
      agreementCount: 0,
      totalParticipants: responses.length,
      consensusReached: false,
      confidence: 0,
    };
  }

  /**
   * Create a consensus result for a single response
   */
  private createSingleResponseConsensus(
    response: NormalizedProviderResponse,
  ): ConsensusResult {
    return {
      winner: response.content,
      algorithm: ConsensusAlgorithm.MAJORITY_VOTE,
      votes: [
        {
          provider: response.provider,
          value: response.content,
          confidence: 1,
          weight: 1,
        },
      ],
      agreementPercentage: 1,
      agreementCount: 1,
      totalParticipants: 1,
      consensusReached: true,
      confidence: 1,
    };
  }
}
