-- Create AgentEvent and ComputeResult tables
CREATE TABLE IF NOT EXISTS agent_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "agentId" VARCHAR(42) NOT NULL,
  "eventType" VARCHAR(128) NOT NULL,
  payload JSONB,
  "txHash" VARCHAR(66),
  metadata JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_events_agentId ON agent_events("agentId");

CREATE TABLE IF NOT EXISTS compute_results (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  "originalResult" TEXT NOT NULL,
  "normalizedResult" TEXT,
  hash VARCHAR(66) NOT NULL UNIQUE,
  metadata JSONB,
  "createdAt" TIMESTAMPTZ DEFAULT now(),
  "updatedAt" TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_compute_results_hash ON compute_results(hash);
