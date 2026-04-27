import { Injectable, Logger } from "@nestjs/common";
import { OnEvent } from "@nestjs/event-emitter";
import { JobProvenanceService } from "../services/job-provenance.service";

@Injectable()
export class ProvenanceCacheInvalidationListener {
  private readonly logger = new Logger(
    ProvenanceCacheInvalidationListener.name,
  );

  constructor(private readonly provenanceService: JobProvenanceService) {}

  /**
   * Handle job completion events to trigger cache invalidation for dependents
   */
  @OnEvent("compute.job.completed")
  async handleJobCompleted(event: {
    jobId: string;
    jobType: string;
    result: any;
  }) {
    try {
      const dependentJobIds = await this.provenanceService.getDependentJobs(
        String(event.jobId),
      );

      if (dependentJobIds.length > 0) {
        this.logger.log(
          `Job ${event.jobId} completed. Marking ${dependentJobIds.length} dependent jobs for cache invalidation`,
        );

        // Emit cache invalidation events for dependent jobs
        for (const dependentJobId of dependentJobIds) {
          // In a real implementation, you would integrate with your cache system
          this.logger.debug(
            `Invalidating cache for dependent job: ${dependentJobId}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle cache invalidation for job ${event.jobId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Handle job failure events to potentially invalidate dependent caches
   */
  @OnEvent("compute.job.failed")
  async handleJobFailed(event: {
    jobId: string;
    jobType: string;
    error: string;
  }) {
    try {
      const dependentJobIds = await this.provenanceService.getDependentJobs(
        String(event.jobId),
      );

      if (dependentJobIds.length > 0) {
        this.logger.warn(
          `Job ${event.jobId} failed. Marking ${dependentJobIds.length} dependent jobs as potentially stale`,
        );

        // Mark dependent jobs as potentially stale due to upstream failure
        for (const dependentJobId of dependentJobIds) {
          this.logger.debug(
            `Marking dependent job as stale: ${dependentJobId}`,
          );
        }
      }
    } catch (error) {
      this.logger.error(
        `Failed to handle dependent job invalidation for failed job ${event.jobId}: ${error.message}`,
        error.stack,
      );
    }
  }

  /**
   * Handle provenance creation events for audit logging
   */
  @OnEvent("job.provenance.created")
  async handleProvenanceCreated(event: {
    provenanceId: string;
    jobId: string;
    parentJobIds: string[];
  }) {
    this.logger.log(
      `Provenance record ${event.provenanceId} created for job ${event.jobId} with ${event.parentJobIds.length} dependencies`,
    );
  }

  /**
   * Handle provenance completion events for metrics
   */
  @OnEvent("job.provenance.completed")
  async handleProvenanceCompleted(event: {
    provenanceId: string;
    jobId: string;
    executionDuration: number;
  }) {
    this.logger.log(
      `Job ${event.jobId} completed in ${event.executionDuration}ms (provenance: ${event.provenanceId})`,
    );
  }
}
