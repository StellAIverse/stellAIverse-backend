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
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { QueueService } from './queue.service';
import {
  CreateJobDto,
  CreateDelayedJobDto,
  CreateRecurringJobDto,
  JobResponseDto,
  QueueStatsDto,
} from './dto/queue.dto';

@ApiTags('queue')
@Controller('queue')
export class QueueController {
  constructor(private readonly queueService: QueueService) {}

  @Post('jobs')
  @ApiOperation({ summary: 'Add a new job to the queue' })
  @ApiResponse({
    status: 201,
    description: 'Job created successfully',
    type: JobResponseDto,
  })
  async addJob(@Body() createJobDto: CreateJobDto): Promise<JobResponseDto> {
    const job = await this.queueService.addComputeJob({
      type: createJobDto.type,
      payload: createJobDto.payload,
      userId: createJobDto.userId,
      metadata: createJobDto.metadata,
    });

    return this.formatJobResponse(job);
  }

  @Post('jobs/delayed')
  @ApiOperation({ summary: 'Add a delayed job to the queue' })
  @ApiResponse({ status: 201, description: 'Delayed job created successfully' })
  async addDelayedJob(
    @Body() createDelayedJobDto: CreateDelayedJobDto,
  ): Promise<JobResponseDto> {
    const job = await this.queueService.addDelayedJob(
      {
        type: createDelayedJobDto.type,
        payload: createDelayedJobDto.payload,
        userId: createDelayedJobDto.userId,
        metadata: createDelayedJobDto.metadata,
      },
      createDelayedJobDto.delayMs,
    );

    return this.formatJobResponse(job);
  }

  @Post('jobs/recurring')
  @ApiOperation({ summary: 'Add a recurring job to the queue' })
  @ApiResponse({ status: 201, description: 'Recurring job created successfully' })
  async addRecurringJob(
    @Body() createRecurringJobDto: CreateRecurringJobDto,
  ): Promise<JobResponseDto> {
    const job = await this.queueService.addRecurringJob(
      {
        type: createRecurringJobDto.type,
        payload: createRecurringJobDto.payload,
        userId: createRecurringJobDto.userId,
        metadata: createRecurringJobDto.metadata,
      },
      createRecurringJobDto.cronExpression,
    );

    return this.formatJobResponse(job);
  }

  @Get('jobs/:id')
  @ApiOperation({ summary: 'Get job by ID' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job found' })
  @ApiResponse({ status: 404, description: 'Job not found' })
  async getJob(@Param('id') id: string): Promise<JobResponseDto> {
    const job = await this.queueService.getJob(id);
    if (!job) {
      throw new Error(`Job ${id} not found`);
    }

    return this.formatJobResponse(job);
  }

  @Get('jobs/:id/status')
  @ApiOperation({ summary: 'Get job status' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job status retrieved' })
  async getJobStatus(@Param('id') id: string): Promise<{ status: string }> {
    const status = await this.queueService.getJobStatus(id);
    if (!status) {
      throw new Error(`Job ${id} not found`);
    }

    return { status };
  }

  @Delete('jobs/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Remove job from queue' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 204, description: 'Job removed successfully' })
  async removeJob(@Param('id') id: string): Promise<void> {
    await this.queueService.removeJob(id);
  }

  @Post('jobs/:id/retry')
  @ApiOperation({ summary: 'Retry a failed job' })
  @ApiParam({ name: 'id', description: 'Job ID' })
  @ApiResponse({ status: 200, description: 'Job retried successfully' })
  async retryJob(@Param('id') id: string): Promise<{ message: string }> {
    await this.queueService.retryJob(id);
    return { message: `Job ${id} queued for retry` };
  }

  @Get('stats')
  @ApiOperation({ summary: 'Get queue statistics' })
  @ApiResponse({
    status: 200,
    description: 'Queue statistics retrieved',
    type: QueueStatsDto,
  })
  async getStats(): Promise<QueueStatsDto> {
    return this.queueService.getQueueStats();
  }

  @Get('failed')
  @ApiOperation({ summary: 'Get failed jobs' })
  @ApiQuery({ name: 'start', required: false, type: Number })
  @ApiQuery({ name: 'end', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Failed jobs retrieved' })
  async getFailedJobs(
    @Query('start') start = 0,
    @Query('end') end = 10,
  ): Promise<JobResponseDto[]> {
    const jobs = await this.queueService.getFailedJobs(
      Number(start),
      Number(end),
    );
    return jobs.map((job) => this.formatJobResponse(job));
  }

  @Get('dead-letter')
  @ApiOperation({ summary: 'Get dead letter queue jobs' }}
  @ApiQuery({ name: 'start', required: false, type: Number })
  @ApiQuery({ name: 'end', required: false, type: Number })
  @ApiResponse({ status: 200, description: 'Dead letter jobs retrieved' })
  async getDeadLetterJobs(
    @Query('start') start = 0,
    @Query('end') end = 10,
  ): Promise<JobResponseDto[]> {
    const jobs = await this.queueService.getDeadLetterJobs(
      Number(start),
      Number(end),
    );
    return jobs.map((job) => this.formatJobResponse(job));
  }

  @Post('pause')
  @ApiOperation({ summary: 'Pause the queue' })
  @ApiResponse({ status: 200, description: 'Queue paused successfully' })
  async pauseQueue(): Promise<{ message: string }> {
    await this.queueService.pauseQueue();
    return { message: 'Queue paused' };
  }

  @Post('resume')
  @ApiOperation({ summary: 'Resume the queue' })
  @ApiResponse({ status: 200, description: 'Queue resumed successfully' })
  async resumeQueue(): Promise<{ message: string }> {
    await this.queueService.resumeQueue();
    return { message: 'Queue resumed' };
  }

  @Delete('clean')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Clean old completed jobs' })
  @ApiQuery({ name: 'grace', required: false, description: 'Grace period in ms' })
  @ApiResponse({ status: 204, description: 'Old jobs cleaned' })
  async cleanOldJobs(@Query('grace') grace?: number): Promise<void> {
    await this.queueService.cleanOldJobs(grace ? Number(grace) : undefined);
  }

  private formatJobResponse(job: any): JobResponseDto {
    return {
      id: job.id,
      type: job.data.type,
      status: job.getState ? 'pending' : 'unknown',
      attemptsMade: job.attemptsMade || 0,
      createdAt: job.timestamp ? new Date(job.timestamp).toISOString() : new Date().toISOString(),
    };
  }
}