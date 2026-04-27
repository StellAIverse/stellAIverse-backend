/**
 * Example usage of Job Provenance & Lineage Tracking
 *
 * This example demonstrates how to:
 * 1. Create jobs with dependencies
 * 2. Track provenance information
 * 3. Query job lineage
 * 4. Rerun jobs with identical inputs
 * 5. Export provenance graphs
 */

import { QueueService } from "../compute-job-queue/queue.service";
import { JobProvenanceService } from "../compute-job-queue/services/job-provenance.service";

export class ProvenanceUsageExample {
  constructor(
    private readonly queueService: QueueService,
    private readonly provenanceService: JobProvenanceService,
  ) {}

  async demonstrateProvenanceTracking() {
    console.log("=== Job Provenance & Lineage Tracking Demo ===\n");

    // Step 1: Create a parent job (data ingestion)
    console.log("1. Creating parent job (data ingestion)...");
    const parentJob = await this.queueService.addComputeJob({
      type: "data-processing",
      payload: {
        source: "api",
        records: [
          { id: 1, name: "Alice", score: 85 },
          { id: 2, name: "Bob", score: 92 },
          { id: 3, name: "Charlie", score: 78 },
        ],
      },
      userId: "data-engineer-123",
      providerId: "data-processor-v1",
      providerModel: "batch-processor-2024",
      metadata: {
        source: "customer-api",
        batchId: "batch-001",
      },
    });

    const parentJobId = String(parentJob.id);
    console.log(`   Parent job created: ${parentJobId}\n`);

    // Step 2: Create dependent jobs (analysis and reporting)
    console.log("2. Creating dependent jobs...");

    const analysisJob = await this.queueService.addComputeJob({
      type: "ai-computation",
      payload: {
        analysisType: "statistical-summary",
        inputSource: parentJobId,
      },
      userId: "data-scientist-456",
      providerId: "ai-analyzer-v2",
      providerModel: "gpt-4-analytics",
      parentJobIds: [parentJobId],
      metadata: {
        analysisLevel: "detailed",
        outputFormat: "json",
      },
    });

    const reportJob = await this.queueService.addComputeJob({
      type: "report-generation",
      payload: {
        template: "executive-summary",
        inputSource: parentJobId,
        format: "pdf",
      },
      userId: "report-generator-789",
      providerId: "report-engine-v1",
      parentJobIds: [parentJobId],
      metadata: {
        priority: "high",
        distribution: ["manager@company.com"],
      },
    });

    const analysisJobId = String(analysisJob.id);
    const reportJobId = String(reportJob.id);

    console.log(`   Analysis job created: ${analysisJobId}`);
    console.log(`   Report job created: ${reportJobId}\n`);

    // Step 3: Create a final job that depends on both analysis and report
    console.log("3. Creating final aggregation job...");

    const aggregationJob = await this.queueService.addComputeJob({
      type: "batch-operation",
      payload: {
        operation: "combine-outputs",
        sources: [analysisJobId, reportJobId],
      },
      userId: "workflow-orchestrator",
      providerId: "aggregator-v1",
      parentJobIds: [analysisJobId, reportJobId],
      metadata: {
        workflowId: "data-pipeline-001",
        finalStep: true,
      },
    });

    const aggregationJobId = String(aggregationJob.id);
    console.log(`   Aggregation job created: ${aggregationJobId}\n`);

    // Wait for jobs to process
    console.log("4. Waiting for jobs to complete...");
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Step 4: Query job lineage
    console.log("5. Querying job lineage...");

    const lineage = await this.provenanceService.getJobLineage(analysisJobId);
    console.log(`   Analysis job lineage:`);
    console.log(`   - Ancestors: ${lineage.ancestors.length}`);
    console.log(`   - Descendants: ${lineage.descendants.length}`);
    console.log(`   - Total depth: ${lineage.depth}\n`);

    // Step 5: Check reproducibility
    console.log("6. Checking job reproducibility...");

    const canReproduce =
      await this.provenanceService.canReproduce(analysisJobId);
    console.log(`   Analysis job can be reproduced: ${canReproduce}\n`);

    // Step 6: Get dependent jobs (for cache invalidation)
    console.log("7. Finding dependent jobs...");

    const dependentJobs =
      await this.provenanceService.getDependentJobs(parentJobId);
    console.log(`   Parent job has ${dependentJobs.length} dependent jobs:`);
    dependentJobs.forEach((jobId) => console.log(`   - ${jobId}`));
    console.log();

    // Step 7: Export provenance graph
    console.log("8. Exporting provenance graph...");

    const graph =
      await this.provenanceService.exportProvenanceGraph(aggregationJobId);
    console.log(
      `   Graph exported with ${graph.nodes.length} nodes and ${graph.edges.length} edges`,
    );
    console.log(`   Root job: ${graph.metadata.rootJobId}\n`);

    // Step 8: Demonstrate job rerun
    console.log("9. Demonstrating job rerun...");

    const originalProvenance =
      await this.provenanceService.getProvenanceByJobId(parentJobId);
    if (originalProvenance) {
      console.log(
        `   Original job definition hash: ${originalProvenance.jobDefinitionHash}`,
      );
      console.log(`   Original input hash: ${originalProvenance.inputHash}`);
      console.log(`   Original provider: ${originalProvenance.providerId}`);

      // Rerun with modified inputs
      const rerunJob = await this.queueService.addComputeJob({
        ...originalProvenance.inputs,
        type: originalProvenance.metadata.jobType,
        payload: {
          ...originalProvenance.inputs,
          records: [
            ...originalProvenance.inputs.records,
            { id: 4, name: "Diana", score: 88 },
          ],
        },
        providerId: originalProvenance.providerId,
        providerModel: originalProvenance.providerModel,
        metadata: {
          ...originalProvenance.metadata,
          rerunOf: parentJobId,
          rerunAt: new Date().toISOString(),
        },
      });

      console.log(`   Rerun job created: ${rerunJob.id}\n`);
    }

    console.log("=== Demo completed successfully! ===");
  }

  async demonstrateCacheInvalidation() {
    console.log("\n=== Cache Invalidation Demo ===\n");

    // Create a job chain: A -> B -> C
    const jobA = await this.queueService.addComputeJob({
      type: "data-processing",
      payload: { data: "source data" },
      providerId: "provider-a",
    });

    const jobB = await this.queueService.addComputeJob({
      type: "ai-computation",
      payload: { transform: "normalize" },
      providerId: "provider-b",
      parentJobIds: [String(jobA.id)],
    });

    const jobC = await this.queueService.addComputeJob({
      type: "report-generation",
      payload: { format: "summary" },
      providerId: "provider-c",
      parentJobIds: [String(jobB.id)],
    });

    console.log(`Created job chain: ${jobA.id} -> ${jobB.id} -> ${jobC.id}`);

    // Wait for processing
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Simulate cache invalidation when job A changes
    console.log("\nSimulating cache invalidation...");
    const dependentsOfA = await this.provenanceService.getDependentJobs(
      String(jobA.id),
    );

    console.log(`Job A (${jobA.id}) has ${dependentsOfA.length} dependents:`);
    dependentsOfA.forEach((jobId) => {
      console.log(`  - Invalidating cache for job: ${jobId}`);
    });

    console.log("\n=== Cache invalidation demo completed! ===");
  }
}
