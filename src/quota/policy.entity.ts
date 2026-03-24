export enum PolicyScope {
  USER = 'USER',
  AGENT = 'AGENT',
  ENDPOINT = 'ENDPOINT',
  GLOBAL = 'GLOBAL',
}

export class PolicyEntity {
  id: string; // UUID
  scope: PolicyScope;
  targetId?: string; // e.g. userId, agentId, endpoint path
  limit: number;
  windowMs: number;
  burst: number;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}
