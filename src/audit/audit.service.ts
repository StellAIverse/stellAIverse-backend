import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AgentEvent, AgentEventType } from './entities/agent-event.entity';
import { OracleSubmission, OracleSubmissionStatus } from './entities/oracle-submission.entity';
import { ComputeResult, ComputeResultStatus } from './entities/compute-result.entity';
import { User } from '../user/entities/user.entity';

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(
    @InjectRepository(AgentEvent)
    private agentEventRepository: Repository<AgentEvent>,
    @InjectRepository(OracleSubmission)
    private oracleSubmissionRepository: Repository<OracleSubmission>,
    @InjectRepository(ComputeResult)
    private computeResultRepository: Repository<ComputeResult>,
  ) {}

  // Agent Event Methods
  async logAgentEvent(
    agentId: string,
    eventType: AgentEventType,
    eventData: Record<string, any>,
    userId: string | null,
    clientInfo?: { ip?: string; userAgent?: string },
    metadata?: Record<string, any>,
  ): Promise<AgentEvent> {
    try {
      const agentEvent = new AgentEvent();
      agentEvent.agentId = agentId;
      agentEvent.eventType = eventType;
      agentEvent.eventData = eventData;
      agentEvent.metadata = metadata || null;
      agentEvent.userId = userId;
      agentEvent.clientIp = clientInfo?.ip || null;
      agentEvent.userAgent = clientInfo?.userAgent || null;

      const savedEvent = await this.agentEventRepository.save(agentEvent);
      this.logger.log(`Agent event logged: ${eventType} for agent ${agentId}`);
      return savedEvent;
    } catch (error) {
      this.logger.error(`Failed to log agent event: ${error.message}`, error.stack);
      throw error;
    }
  }

  async getAgentEventsByAgentId(agentId: string): Promise<AgentEvent[]> {
    try {
      return await this.agentEventRepository.find({
        where: { agentId },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(`Failed to fetch agent events for agent ${agentId}: ${error.message}`);
      throw error;
    }
  }

  async getAgentEventsByUserId(userId: string): Promise<AgentEvent[]> {
    try {
      return await this.agentEventRepository.find({
        where: { userId },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(`Failed to fetch agent events for user ${userId}: ${error.message}`);
      throw error;
    }
  }

  // Oracle Submission Methods
  async logOracleSubmission(
    oracleId: string,
    data: Record<string, any>,
    signature: string,
    userId: string,
    metadata?: Record<string, any>,
  ): Promise<OracleSubmission> {
    try {
      const oracleSubmission = new OracleSubmission();
      oracleSubmission.oracleId = oracleId;
      oracleSubmission.data = data;
      oracleSubmission.signature = signature;
      oracleSubmission.status = OracleSubmissionStatus.PENDING;
      oracleSubmission.userId = userId;
      oracleSubmission.metadata = metadata || null;
      oracleSubmission.dataHash = this.generateDataHash(data);

      const savedSubmission = await this.oracleSubmissionRepository.save(oracleSubmission);
      this.logger.log(`Oracle submission logged: ${oracleId} by user ${userId}`);
      return savedSubmission;
    } catch (error) {
      this.logger.error(`Failed to log oracle submission: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateOracleSubmissionStatus(
    submissionId: string,
    status: OracleSubmissionStatus,
    updateData?: Partial<OracleSubmission>,
  ): Promise<OracleSubmission> {
    try {
      const updateFields: Partial<OracleSubmission> = {
        status,
        ...updateData,
      };

      if (status === OracleSubmissionStatus.SUBMITTED && !updateFields.submittedAt) {
        updateFields.submittedAt = new Date();
      } else if (status === OracleSubmissionStatus.CONFIRMED && !updateFields.confirmedAt) {
        updateFields.confirmedAt = new Date();
      }

      await this.oracleSubmissionRepository.update(submissionId, updateFields);
      this.logger.log(`Oracle submission ${submissionId} status updated to ${status}`);

      return await this.oracleSubmissionRepository.findOne({
        where: { id: submissionId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update oracle submission status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getOracleSubmissionsByOracleId(oracleId: string): Promise<OracleSubmission[]> {
    try {
      return await this.oracleSubmissionRepository.find({
        where: { oracleId },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(
        `Failed to fetch oracle submissions for oracle ${oracleId}: ${error.message}`,
      );
      throw error;
    }
  }

  // Compute Result Methods
  async logComputeResult(
    jobId: string,
    resultData: Record<string, any>,
    userId: string,
    status: ComputeResultStatus = ComputeResultStatus.PENDING,
    metadata?: Record<string, any>,
  ): Promise<ComputeResult> {
    try {
      const computeResult = new ComputeResult();
      computeResult.jobId = jobId;
      computeResult.resultData = resultData;
      computeResult.status = status;
      computeResult.userId = userId;
      computeResult.metadata = metadata || null;
      computeResult.resultHash = this.generateResultHash(resultData);

      const savedResult = await this.computeResultRepository.save(computeResult);
      this.logger.log(`Compute result logged: ${jobId} by user ${userId}`);
      return savedResult;
    } catch (error) {
      this.logger.error(`Failed to log compute result: ${error.message}`, error.stack);
      throw error;
    }
  }

  async updateComputeResultStatus(
    resultId: string,
    status: ComputeResultStatus,
    updateData?: Partial<ComputeResult>,
  ): Promise<ComputeResult> {
    try {
      const updateFields: Partial<ComputeResult> = {
        status,
        ...updateData,
      };

      if (status === ComputeResultStatus.PROCESSING && !updateFields.startedAt) {
        updateFields.startedAt = new Date();
      } else if (
        [ComputeResultStatus.COMPLETED, ComputeResultStatus.FAILED].includes(status) &&
        !updateFields.completedAt
      ) {
        updateFields.completedAt = new Date();
      }

      await this.computeResultRepository.update(resultId, updateFields);
      this.logger.log(`Compute result ${resultId} status updated to ${status}`);

      return await this.computeResultRepository.findOne({
        where: { id: resultId },
      });
    } catch (error) {
      this.logger.error(
        `Failed to update compute result status: ${error.message}`,
        error.stack,
      );
      throw error;
    }
  }

  async getComputeResultsByJobId(jobId: string): Promise<ComputeResult[]> {
    try {
      return await this.computeResultRepository.find({
        where: { jobId },
        order: { createdAt: 'DESC' },
      });
    } catch (error) {
      this.logger.error(`Failed to fetch compute results for job ${jobId}: ${error.message}`);
      throw error;
    }
  }

  // Utility Methods
  private generateDataHash(data: Record<string, any>): string {
    // In a real implementation, you would use a proper hashing algorithm like SHA256
    // For this example, we'll return a placeholder
    return `0x${Buffer.from(JSON.stringify(data)).toString('hex').substring(0, 64)}`;
  }

  private generateResultHash(resultData: Record<string, any>): string {
    // In a real implementation, you would use a proper hashing algorithm like SHA256
    // For this example, we'll return a placeholder
    return `0x${Buffer.from(JSON.stringify(resultData)).toString('hex').substring(0, 64)}`;
  }
}