-- Seed AgentEvent sample
INSERT INTO agent_events ("agentId", "eventType", payload, metadata)
VALUES (
  '0x0000000000000000000000000000000000000000',
  'test_event',
  '{"message": "seeded event"}'::jsonb,
  '{"seeded": true}'::jsonb
);

-- Seed ComputeResult sample
INSERT INTO compute_results ("originalResult", "normalizedResult", hash, metadata)
VALUES (
  '{"value": 42}',
  '{"value": 42}',
  '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
  '{"seeded": true}'::jsonb
);
