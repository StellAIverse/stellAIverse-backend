import {
  Controller,
  Post,
  Get,
  Delete,
  Param,
  Body,
  Query,
  HttpCode,
  HttpStatus,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { QueueService } from "./queue.service";
import {
  CreateJobDto,
  CreateDelayedJobDto,
  CreateRecurringJobDto,
  JobResponseDto,
  QueueStatsDto,
} from "./compute.job.dto";
import { CreateBatchJobDto, BatchJobResult } from "./dto/batch-job.dto";
import {
  JobStatusResponseDto,
  JobControlResponseDto,
} from "./dto/job-control.dto";
import { JwtAuthGuard } from "../auth/jwt.guard";
import { RolesGuard } from "../common/guard/roles.guard";
import { Roles, Role } from "../common/decorators/roles.decorator";

@ApiTags("queue")
@Controller("queue")
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post("jobs")
  @ApiOperation({ summary: "Add a new job to the queue" })
  @ApiResponse({
    status: 201,
    description: "Job created successfully",
    type: JobResponseDto,
  })
  async addJob(@Body() createJobDto: CreateJobDto): Promise<JobResponseDto> {
    const job = await this.queueService.addComputeJob({
      type: createJobDto.type,
      payload: createJobDto.payload,
      userId: createJobDto.userId,
      priority: createJobDto.priority,
      groupKey: createJobDto.groupKey,
      metadata: createJobDto.metadata,
    });

    return this.formatJobResponse(job);
  }

  @Post("jobs/delayed")
  @ApiOperation({ summary: "Add a delayed job to the queue" })
  @ApiResponse({ status: 201, description: "Delayed job created successfully" })
  async addDelayedJob(
    @Body() createDelayedJobDto: CreateDelayedJobDto,
  ): Promise<JobResponseDto> {
    const job = await this.queueService.addDelayedJob(
      {
        type: createDelayedJobDto.type,
        payload: createDelayedJobDto.payload,
        userId: createDelayedJobDto.userId,
        priority: createDelayedJobDto.priority,
        groupKey: createDelayedJobDto.groupKey,
        metadata: createDelayedJobDto.metadata,
      },
      createDelayedJobDto.delayMs,
    );

    return this.formatJobResponse(job);
  }

  @Post("jobs/recurring")
  @ApiOperation({ summary: "Add a recurring job to the queue" })
  @ApiResponse({
    status: 201,
    description: "Recurring job created successfully",
  })
  async addRecurringJob(
    @Body() createRecurringJobDto: CreateRecurringJobDto,
  ): Promise<JobResponseDto> {
    const job = await this.queueService.addRecurringJob(
      {
        type: createRecurringJobDto.type,
        payload: createRecurringJobDto.payload,
        userId: createRecurringJobDto.userId,
        priority: createRecurringJobDto.priority,
        groupKey: createRecurringJobDto.groupKey,
        metadata: createRecurringJobDto.metadata,
      },
      createRecurringJobDto.cronExpression,
    );

    return this.formatJobResponse(job);
  }

  @Get("jobs/:id")
  @ApiOperation({ summary: "Get job by ID" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({ status: 200, description: "Job found" })
  @ApiResponse({ status: 404, description: "Job not found" })
  async getJob(@Param("id") id: string): Promise<JobResponseDto> {
    const job = await this.queueService.getJob(id);
    if (!job) {
      throw new Error(`Job ${id} not found`);
    }

    return this.formatJobResponse(job);
  }

  @Get("jobs/:id/status")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Get detailed job status" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({
    status: 200,
    description: "Job status retrieved",
    type: JobStatusResponseDto,
  })
  @ApiResponse({ status: 404, description: "Job not found" })
  async getJobStatus(@Param("id") id: string): Promise<JobStatusResponseDto> {
    const status = await this.queueService.getDetailedJobStatus(id);
    if (!status) {
      throw new NotFoundException(`Job ${id} not found`);
    }

    return status;
  }

  @Post("jobs/:id/pause")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Pause a queued job" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({
    status: 200,
    description: "Job paused successfully",
    type: JobControlResponseDto,
  })
  @ApiResponse({ status: 404, description: "Job not found" })
  @ApiResponse({
    status: 400,
    description: "Job cannot be paused in current state",
  })
  async pauseJob(@Param("id") id: string): Promise<JobControlResponseDto> {
    try {
      const { previousState, newState } = await this.queueService.pauseJob(id);

      return {
        success: true,
        message: `Job ${id} paused successfully`,
        jobId: id,
        previousState: previousState as any,
        newState: newState as any,
      };
    } catch (error) {
      if (error.message.includes("not found")) {
        throw new NotFoundException(error.message);
      }
      throw new BadRequestException(error.message);
    }
  }

  @Post("jobs/:id/resume")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Resume a paused job" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({
    status: 200,
    description: "Job resumed successfully",
    type: JobControlResponseDto,
  })
  @ApiResponse({ status: 404, description: "Job not found" })
  @ApiResponse({ status: 400, description: "Job is not paused" })
  async resumeJob(@Param("id") id: string): Promise<JobControlResponseDto> {
    try {
      const { previousState, newState } = await this.queueService.resumeJob(id);

      return {
        success: true,
        message: `Job ${id} resumed successfully`,
        jobId: id,
        previousState: previousState as any,
        newState: newState as any,
      };
    } catch (error) {
      if (error.message.includes("not found")) {
        throw new NotFoundException(error.message);
      }
      throw new BadRequestException(error.message);
    }
  }

  @Post("jobs/:id/cancel")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.OPERATOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: "Cancel a job" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({
    status: 200,
    description: "Job cancelled successfully",
    type: JobControlResponseDto,
  })
  @ApiResponse({ status: 404, description: "Job not found" })
  @ApiResponse({ status: 400, description: "Job cannot be cancelled" })
  async cancelJob(@Param("id") id: string): Promise<JobControlResponseDto> {
    try {
      const { previousState } = await this.queueService.cancelJob(id);

      return {
        success: true,
        message: `Job ${id} cancelled successfully`,
        jobId: id,
        previousState: previousState as any,
        newState: undefined,
      };
    } catch (error) {
      if (error.message.includes("not found")) {
        throw new NotFoundException(error.message);
      }
      throw new BadRequestException(error.message);
    }
  }

  @Delete("jobs/:id")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Remove job from queue" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({ status: 204, description: "Job removed successfully" })
  async removeJob(@Param("id") id: string): Promise<void> {
    await this.queueService.removeJob(id);
  }

  @Post("jobs/:id/retry")
  @ApiOperation({ summary: "Retry a failed job" })
  @ApiParam({ name: "id", description: "Job ID" })
  @ApiResponse({ status: 200, description: "Job retried successfully" })
  async retryJob(@Param("id") id: string): Promise<{ message: string }> {
    await this.queueService.retryJob(id);
    return { message: `Job ${id} queued for retry` };
  }

  @Get("stats")
  @ApiOperation({ summary: "Get queue statistics" })
  @ApiResponse({
    status: 200,
    description: "Queue statistics retrieved",
    type: QueueStatsDto,
  })
  async getStats(): Promise<QueueStatsDto> {
    return this.queueService.getQueueStats();
  }

  @Get("failed")
  @ApiOperation({ summary: "Get failed jobs" })
  @ApiQuery({ name: "start", required: false, type: Number })
  @ApiQuery({ name: "end", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Failed jobs retrieved" })
  async getFailedJobs(
    @Query("start") start = 0,
    @Query("end") end = 10,
  ): Promise<JobResponseDto[]> {
    const jobs = await this.queueService.getFailedJobs(
      Number(start),
      Number(end),
    );
    return jobs.map((job) => this.formatJobResponse(job));
  }

  @Get("dead-letter")
  @ApiOperation({ summary: "Get dead letter queue jobs" })
  @ApiQuery({ name: "start", required: false, type: Number })
  @ApiQuery({ name: "end", required: false, type: Number })
  @ApiResponse({ status: 200, description: "Dead letter jobs retrieved" })
  async getDeadLetterJobs(
    @Query("start") start = 0,
    @Query("end") end = 10,
  ): Promise<JobResponseDto[]> {
    const jobs = await this.queueService.getDeadLetterJobs(
      Number(start),
      Number(end),
    );
    return jobs.map((job) => this.formatJobResponse(job));
  }

  @Post("pause")
  @ApiOperation({ summary: "Pause the queue" })
  @ApiResponse({ status: 200, description: "Queue paused successfully" })
  async pauseQueue(): Promise<{ message: string }> {
    await this.queueService.pauseQueue();
    return { message: "Queue paused" };
  }

  @Post("resume")
  @ApiOperation({ summary: "Resume the queue" })
  @ApiResponse({ status: 200, description: "Queue resumed successfully" })
  async resumeQueue(): Promise<{ message: string }> {
    await this.queueService.resumeQueue();
    return { message: "Queue resumed" };
  }

  @Delete("clean")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: "Clean old completed jobs" })
  @ApiQuery({
    name: "grace",
    required: false,
    description: "Grace period in ms",
  })
  @ApiResponse({ status: 204, description: "Old jobs cleaned" })
  async cleanOldJobs(@Query("grace") grace?: number): Promise<void> {
    await this.queueService.cleanOldJobs(grace ? Number(grace) : undefined);
  }

  @Post("batch")
  @ApiOperation({ summary: "Add a batch of jobs with orchestration" })
  @ApiResponse({
    status: 201,
    description: "Batch job created successfully",
    type: BatchJobResult,
  })
  async addBatchJob(
    @Body() createBatchJobDto: CreateBatchJobDto,
  ): Promise<BatchJobResult> {
    const batchJobData = {
      batchId: `batch-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      config: createBatchJobDto.config,
      jobs: createBatchJobDto.jobs.map((job) => ({
        type: job.type,
        payload: job.payload,
        userId: job.userId,
        priority: job.priority,
        groupKey: job.groupKey,
        metadata: {
          ...job.metadata,
          batchId: createBatchJobDto.config.groupKey,
        },
      })),
      userId: createBatchJobDto.userId,
      metadata: createBatchJobDto.metadata,
    };

    const progress = await this.queueService.addBatchJob(batchJobData);

    return {
      batchId: progress.batchId,
      jobResults: progress.results.map((r) => ({
        jobId: r.jobId,
        status: r.status,
        result: r.result,
        error: r.error,
      })),
      status: progress.status,
      totalJobs: progress.totalJobs,
      completedJobs: progress.completedJobs,
      failedJobs: progress.failedJobs,
      startedAt: progress.startedAt.toISOString(),
      completedAt: progress.completedAt?.toISOString(),
    };
  }

  @Get("batch/:id")
  @ApiOperation({ summary: "Get batch job progress" })
  @ApiParam({ name: "id", description: "Batch Job ID" })
  @ApiResponse({
    status: 200,
    description: "Batch job progress retrieved",
    type: BatchJobResult,
  })
  @ApiResponse({ status: 404, description: "Batch job not found" })
  async getBatchJob(@Param("id") id: string): Promise<BatchJobResult> {
    const progress = this.queueService.getBatchJobProgress(id);
    if (!progress) {
      throw new Error(`Batch job ${id} not found`);
    }

    return {
      batchId: progress.batchId,
      jobResults: progress.results.map((r) => ({
        jobId: r.jobId,
        status: r.status,
        result: r.result,
        error: r.error,
      })),
      status: progress.status,
      totalJobs: progress.totalJobs,
      completedJobs: progress.completedJobs,
      failedJobs: progress.failedJobs,
      startedAt: progress.startedAt.toISOString(),
      completedAt: progress.completedAt?.toISOString(),
    };
  }

  @Post("batch/:id/cancel")
  @ApiOperation({ summary: "Cancel a batch job" })
  @ApiParam({ name: "id", description: "Batch Job ID" })
  @ApiResponse({ status: 200, description: "Batch job cancelled successfully" })
  async cancelBatchJob(@Param("id") id: string): Promise<{ message: string }> {
    await this.queueService.cancelBatchJob(id);
    return { message: `Batch job ${id} cancelled` };
  }

  private formatJobResponse(job: any): JobResponseDto {
    return {
      id: job.id,
      type: job.data.type,
      status: job.getState ? "pending" : "unknown",
      attemptsMade: job.attemptsMade || 0,
      createdAt: job.timestamp
        ? new Date(job.timestamp).toISOString()
        : new Date().toISOString(),
    };
  }
}
