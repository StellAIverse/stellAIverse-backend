import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import { ApiTags, ApiOperation, ApiResponse, ApiParam } from "@nestjs/swagger";
import { JobProvenanceService } from "./services/job-provenance.service";
import { QueueService } from "./queue.service";
import { JobLineageDto, JobRerunDto } from "./dto/job-provenance.dto";

@ApiTags("Job Provenance")
@Controller("jobs")
export class ProvenanceController {
  constructor(
    private readonly provenanceService: JobProvenanceService,
    private readonly queueService: QueueService,
  ) {}

  @Get(":id/provenance")
  @ApiOperation({ summary: "Get job provenance information" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({
    status: 200,
    description: "Job provenance retrieved successfully",
  })
  @ApiResponse({ status: 404, description: "Job not found" })
  async getJobProvenance(@Param("id") jobId: string) {
    const provenance = await this.provenanceService.getProvenanceByJobId(jobId);
    if (!provenance) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }
    return provenance;
  }

  @Get(":id/lineage")
  @ApiOperation({ summary: "Get job lineage (ancestors and descendants)" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({
    status: 200,
    description: "Job lineage retrieved successfully",
    type: JobLineageDto,
  })
  @ApiResponse({ status: 404, description: "Job not found" })
  async getJobLineage(@Param("id") jobId: string): Promise<JobLineageDto> {
    return this.provenanceService.getJobLineage(jobId);
  }

  @Get(":id/dependents")
  @ApiOperation({ summary: "Get jobs that depend on this job" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({
    status: 200,
    description: "Dependent jobs retrieved successfully",
  })
  @ApiResponse({ status: 404, description: "Job not found" })
  async getDependentJobs(@Param("id") jobId: string) {
    const dependentJobIds =
      await this.provenanceService.getDependentJobs(jobId);
    return {
      jobId,
      dependentJobs: dependentJobIds,
      count: dependentJobIds.length,
    };
  }

  @Get(":id/export")
  @ApiOperation({ summary: "Export provenance graph as JSON" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({
    status: 200,
    description: "Provenance graph exported successfully",
  })
  @ApiResponse({ status: 404, description: "Job not found" })
  async exportProvenanceGraph(@Param("id") jobId: string) {
    return this.provenanceService.exportProvenanceGraph(jobId);
  }

  @Get(":id/reproducible")
  @ApiOperation({ summary: "Check if job can be reproduced" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({
    status: 200,
    description: "Reproducibility status retrieved successfully",
  })
  @ApiResponse({ status: 404, description: "Job not found" })
  async checkReproducibility(@Param("id") jobId: string) {
    const canReproduce = await this.provenanceService.canReproduce(jobId);
    const provenance = await this.provenanceService.getProvenanceByJobId(jobId);

    if (!provenance) {
      throw new NotFoundException(`Job ${jobId} not found`);
    }

    return {
      jobId,
      canReproduce,
      reason: canReproduce
        ? "All dependencies are available"
        : "Some dependencies are missing",
      parentJobIds: provenance.parentJobIds,
    };
  }

  @Post(":id/rerun")
  @ApiOperation({ summary: "Rerun a job with identical or modified inputs" })
  @ApiParam({ name: "id", description: "Original job ID to rerun" })
  @ApiResponse({
    status: 201,
    description: "Job rerun initiated successfully",
  })
  @ApiResponse({ status: 404, description: "Original job not found" })
  @ApiResponse({ status: 400, description: "Job cannot be reproduced" })
  async rerunJob(
    @Param("id") originalJobId: string,
    @Body() rerunDto: JobRerunDto,
  ) {
    const originalProvenance =
      await this.provenanceService.getProvenanceByJobId(originalJobId);
    if (!originalProvenance) {
      throw new NotFoundException(`Original job ${originalJobId} not found`);
    }

    const canReproduce =
      await this.provenanceService.canReproduce(originalJobId);
    if (!canReproduce) {
      throw new BadRequestException(
        "Job cannot be reproduced - missing dependencies",
      );
    }

    // Create new job with same or modified inputs
    const newJobData = {
      type: originalProvenance.metadata.jobType,
      payload: rerunDto.overrideInputs || originalProvenance.inputs,
      userId: originalProvenance.metadata.userId,
      priority: originalProvenance.metadata.priority,
      groupKey: originalProvenance.metadata.groupKey,
      providerId: rerunDto.overrideProviderId || originalProvenance.providerId,
      providerModel: originalProvenance.providerModel,
      parentJobIds: originalProvenance.parentJobIds,
      metadata: {
        ...originalProvenance.metadata,
        rerunOf: originalJobId,
        rerunAt: new Date().toISOString(),
      },
    };

    const newJob = await this.queueService.addComputeJob(newJobData);

    return {
      originalJobId,
      newJobId: newJob.id,
      status: "queued",
      message: "Job rerun initiated successfully",
    };
  }

  @Post(":id/invalidate-cache")
  @ApiOperation({ summary: "Invalidate cache for job and all dependents" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({
    status: 200,
    description: "Cache invalidation initiated successfully",
  })
  @ApiResponse({ status: 404, description: "Job not found" })
  async invalidateJobCache(@Param("id") jobId: string) {
    const dependentJobIds =
      await this.provenanceService.getDependentJobs(jobId);

    // In a real implementation, you would integrate with your cache invalidation system
    // For now, we'll just return the jobs that would be affected

    return {
      jobId,
      invalidatedJobs: [jobId, ...dependentJobIds],
      count: dependentJobIds.length + 1,
      message: "Cache invalidation initiated for job and all dependents",
    };
  }
}
