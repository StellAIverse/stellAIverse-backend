import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import { EventEmitter2 } from "@nestjs/event-emitter";
import { ethers } from "ethers";
import { JobProvenance } from "../entities/job-provenance.entity";
import { JobProvenanceDto, JobLineageDto } from "../dto/job-provenance.dto";
import { ComputeJobData } from "../queue.service";

@Injectable()
export class JobProvenanceService {
  private readonly logger = new Logger(JobProvenanceService.name);

  // In-memory storage - in production, use database
  private provenanceStore = new Map<string, JobProvenance>();
  private jobToProvenanceMap = new Map<string, string>();

  constructor(private readonly eventEmitter?: EventEmitter2) {}

  /**
   * Create provenance record for a job
   */
  async createProvenance(
    jobId: string,
    jobData: ComputeJobData,
    providerId: string,
    providerModel?: string,
  ): Promise<JobProvenance> {
    const jobDefinitionHash = this.generateJobDefinitionHash(jobData);
    const inputHash = this.generateInputHash(jobData.payload);

    const provenance = new JobProvenance(
      this.generateProvenanceId(),
      jobId,
      jobDefinitionHash,
      providerId,
      inputHash,
      jobData.payload,
      jobData.metadata?.parentJobIds || [],
      providerModel,
      {
        jobType: jobData.type,
        userId: jobData.userId,
        priority: jobData.priority,
        groupKey: jobData.groupKey,
        ...jobData.metadata,
      },
    );

    this.provenanceStore.set(provenance.id, provenance);
    this.jobToProvenanceMap.set(jobId, provenance.id);

    // Update parent-child relationships
    await this.updateParentChildRelationships(provenance);

    this.logger.log(
      `Created provenance record ${provenance.id} for job ${jobId}`,
    );

    this.eventEmitter?.emit("job.provenance.created", {
      provenanceId: provenance.id,
      jobId,
      parentJobIds: provenance.parentJobIds,
    });

    return provenance;
  }

  /**
   * Mark job as completed and update provenance
   */
  async markJobCompleted(jobId: string, result: any): Promise<void> {
    const provenanceId = this.jobToProvenanceMap.get(jobId);
    if (!provenanceId) {
      this.logger.warn(`No provenance record found for job ${jobId}`);
      return;
    }

    const provenance = this.provenanceStore.get(provenanceId);
    if (!provenance) {
      this.logger.warn(`Provenance record ${provenanceId} not found`);
      return;
    }

    provenance.markCompleted();
    provenance.metadata.result = result;
    provenance.metadata.executionDuration = provenance.getExecutionDuration();

    this.logger.log(`Marked job ${jobId} as completed in provenance`);

    this.eventEmitter?.emit("job.provenance.completed", {
      provenanceId: provenance.id,
      jobId,
      executionDuration: provenance.getExecutionDuration(),
    });
  }

  /**
   * Get provenance record by job ID
   */
  async getProvenanceByJobId(jobId: string): Promise<JobProvenance | null> {
    const provenanceId = this.jobToProvenanceMap.get(jobId);
    if (!provenanceId) {
      return null;
    }
    return this.provenanceStore.get(provenanceId) || null;
  }

  /**
   * Get job lineage (ancestors and descendants)
   */
  async getJobLineage(jobId: string): Promise<JobLineageDto> {
    const provenance = await this.getProvenanceByJobId(jobId);
    if (!provenance) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    const ancestors = await this.getAncestors(jobId, new Set());
    const descendants = await this.getDescendants(jobId, new Set());

    return {
      jobId,
      ancestors: ancestors.map((p) => this.toProvenanceDto(p)),
      descendants: descendants.map((p) => this.toProvenanceDto(p)),
      depth: Math.max(
        this.calculateDepth(ancestors),
        this.calculateDepth(descendants),
      ),
    };
  }

  /**
   * Get all jobs that depend on a specific job (for cache invalidation)
   */
  async getDependentJobs(jobId: string): Promise<string[]> {
    const descendants = await this.getDescendants(jobId, new Set());
    return descendants.map((p) => p.jobId);
  }

  /**
   * Export provenance graph as JSON
   */
  async exportProvenanceGraph(jobId: string): Promise<any> {
    const lineage = await this.getJobLineage(jobId);

    const nodes = [
      ...lineage.ancestors,
      await this.getProvenanceByJobId(jobId).then((p) =>
        this.toProvenanceDto(p!),
      ),
      ...lineage.descendants,
    ];

    const edges = [];
    for (const node of nodes) {
      if (node.parentJobIds) {
        for (const parentId of node.parentJobIds) {
          edges.push({
            from: parentId,
            to: node.jobId,
            type: "dependency",
          });
        }
      }
    }

    return {
      metadata: {
        exportedAt: new Date().toISOString(),
        rootJobId: jobId,
        totalNodes: nodes.length,
        totalEdges: edges.length,
      },
      nodes,
      edges,
    };
  }

  /**
   * Check if a job can be reproduced (all dependencies available)
   */
  async canReproduce(jobId: string): Promise<boolean> {
    const provenance = await this.getProvenanceByJobId(jobId);
    if (!provenance) {
      return false;
    }

    // Check if all parent jobs have provenance records
    for (const parentJobId of provenance.parentJobIds) {
      const parentProvenance = await this.getProvenanceByJobId(parentJobId);
      if (!parentProvenance) {
        return false;
      }
    }

    return true;
  }

  /**
   * Generate job definition hash for reproducibility
   */
  private generateJobDefinitionHash(jobData: ComputeJobData): string {
    const definition = {
      type: jobData.type,
      // Exclude dynamic fields like timestamps, user-specific data
      payload: this.normalizePayload(jobData.payload),
    };

    const definitionString = JSON.stringify(
      definition,
      Object.keys(definition).sort(),
    );
    return ethers.keccak256(ethers.toUtf8Bytes(definitionString));
  }

  /**
   * Generate input hash
   */
  private generateInputHash(inputs: any): string {
    const normalizedInputs = this.normalizePayload(inputs);
    const inputString = JSON.stringify(
      normalizedInputs,
      Object.keys(normalizedInputs).sort(),
    );
    return ethers.keccak256(ethers.toUtf8Bytes(inputString));
  }

  /**
   * Normalize payload for consistent hashing
   */
  private normalizePayload(payload: any): any {
    if (payload === null || typeof payload !== "object") {
      return payload;
    }

    if (Array.isArray(payload)) {
      return payload.map((item) => this.normalizePayload(item));
    }

    const normalized: any = {};
    const keys = Object.keys(payload).sort();

    for (const key of keys) {
      // Skip timestamp and other non-deterministic fields
      if (!["timestamp", "createdAt", "updatedAt", "id"].includes(key)) {
        normalized[key] = this.normalizePayload(payload[key]);
      }
    }

    return normalized;
  }

  /**
   * Update parent-child relationships
   */
  private async updateParentChildRelationships(
    provenance: JobProvenance,
  ): Promise<void> {
    for (const parentJobId of provenance.parentJobIds) {
      const parentProvenance = await this.getProvenanceByJobId(parentJobId);
      if (parentProvenance) {
        parentProvenance.addChildJob(provenance.jobId);
      }
    }
  }

  /**
   * Get all ancestors recursively
   */
  private async getAncestors(
    jobId: string,
    visited: Set<string>,
  ): Promise<JobProvenance[]> {
    if (visited.has(jobId)) {
      return []; // Prevent infinite loops
    }
    visited.add(jobId);

    const provenance = await this.getProvenanceByJobId(jobId);
    if (!provenance) {
      return [];
    }

    const ancestors: JobProvenance[] = [];

    for (const parentJobId of provenance.parentJobIds) {
      const parentProvenance = await this.getProvenanceByJobId(parentJobId);
      if (parentProvenance) {
        ancestors.push(parentProvenance);
        const parentAncestors = await this.getAncestors(parentJobId, visited);
        ancestors.push(...parentAncestors);
      }
    }

    return ancestors;
  }

  /**
   * Get all descendants recursively
   */
  private async getDescendants(
    jobId: string,
    visited: Set<string>,
  ): Promise<JobProvenance[]> {
    if (visited.has(jobId)) {
      return []; // Prevent infinite loops
    }
    visited.add(jobId);

    const provenance = await this.getProvenanceByJobId(jobId);
    if (!provenance) {
      return [];
    }

    const descendants: JobProvenance[] = [];

    for (const childJobId of provenance.childJobIds) {
      const childProvenance = await this.getProvenanceByJobId(childJobId);
      if (childProvenance) {
        descendants.push(childProvenance);
        const childDescendants = await this.getDescendants(childJobId, visited);
        descendants.push(...childDescendants);
      }
    }

    return descendants;
  }

  /**
   * Calculate depth of provenance tree
   */
  private calculateDepth(provenances: JobProvenance[]): number {
    return provenances.length > 0 ? provenances.length : 0;
  }

  /**
   * Convert provenance entity to DTO
   */
  private toProvenanceDto(provenance: JobProvenance): JobProvenanceDto {
    return {
      jobId: provenance.jobId,
      jobDefinitionHash: provenance.jobDefinitionHash,
      providerId: provenance.providerId,
      providerModel: provenance.providerModel,
      inputHash: provenance.inputHash,
      inputs: provenance.inputs,
      parentJobIds: provenance.parentJobIds,
      createdAt: provenance.createdAt.toISOString(),
      completedAt: provenance.completedAt.toISOString(),
      metadata: provenance.metadata,
    };
  }

  /**
   * Generate unique provenance ID
   */
  private generateProvenanceId(): string {
    return `prov-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }
}
