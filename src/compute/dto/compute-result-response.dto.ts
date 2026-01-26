export class ComputeResultResponseDto {
  id: string;
  originalResult: string;
  normalizedResult: string;
  hash: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}