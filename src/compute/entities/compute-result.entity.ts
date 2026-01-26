export class ComputeResult {
  id: string;
  originalResult: string;
  normalizedResult: string;
  hash: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;

  constructor(
    id: string,
    originalResult: string,
    normalizedResult: string,
    hash: string,
    metadata?: Record<string, any>,
  ) {
    this.id = id;
    this.originalResult = originalResult;
    this.normalizedResult = normalizedResult;
    this.hash = hash;
    this.metadata = metadata;
    this.createdAt = new Date();
    this.updatedAt = new Date();
  }
}