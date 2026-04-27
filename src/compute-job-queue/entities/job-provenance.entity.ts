export class JobProvenance {
  id: string;
  jobId: string;
  jobDefinitionHash: string;
  providerId: string;
  providerModel?: string;
  inputHash: string;
  inputs: any;
  parentJobIds: string[];
  childJobIds: string[];
  createdAt: Date;
  completedAt: Date;
  metadata: Record<string, any>;

  constructor(
    id: string,
    jobId: string,
    jobDefinitionHash: string,
    providerId: string,
    inputHash: string,
    inputs: any,
    parentJobIds: string[] = [],
    providerModel?: string,
    metadata: Record<string, any> = {},
  ) {
    this.id = id;
    this.jobId = jobId;
    this.jobDefinitionHash = jobDefinitionHash;
    this.providerId = providerId;
    this.providerModel = providerModel;
    this.inputHash = inputHash;
    this.inputs = inputs;
    this.parentJobIds = parentJobIds;
    this.childJobIds = [];
    this.createdAt = new Date();
    this.completedAt = new Date();
    this.metadata = metadata;
  }

  /**
   * Add a child job ID to track dependencies
   */
  addChildJob(childJobId: string): void {
    if (!this.childJobIds.includes(childJobId)) {
      this.childJobIds.push(childJobId);
    }
  }

  /**
   * Mark the job as completed
   */
  markCompleted(): void {
    this.completedAt = new Date();
  }

  /**
   * Get execution duration in milliseconds
   */
  getExecutionDuration(): number {
    return this.completedAt.getTime() - this.createdAt.getTime();
  }
}
