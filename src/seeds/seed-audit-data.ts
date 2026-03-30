import { DataSource } from "typeorm";
import {
  AgentEvent,
  AgentEventType,
} from "../audit/entities/agent-event.entity";
import {
  OracleSubmission,
  OracleSubmissionStatus,
} from "../audit/entities/oracle-submission.entity";
import {
  ComputeResult,
  ComputeResultStatus,
} from "../audit/entities/compute-result.entity";
import { User } from "../user/entities/user.entity";

/**
 * Seed script to populate audit entities with sample data
 * Usage:
 *   npx ts-node src/seeds/seed-audit-data.ts
 */
async function seedAuditData(dataSource: DataSource) {
  console.log("🌱 Seeding audit data...");

  const agentEventRepository = dataSource.getRepository(AgentEvent);
  const oracleSubmissionRepository = dataSource.getRepository(OracleSubmission);
  const computeResultRepository = dataSource.getRepository(ComputeResult);
  const userRepository = dataSource.getRepository(User);

  // Get existing users to associate with audit records
  const users = await userRepository.find({ take: 5 });
  if (users.length === 0) {
    console.warn("⚠️  No users found. Please seed users first.");
    return;
  }

  // Sample agent events
  const sampleAgentEvents = [
    {
      agentId: "agent-123",
      eventType: AgentEventType.CREATED,
      eventData: {
        name: "Sample Agent",
        description: "A sample agent for testing",
      },
      metadata: { source: "api", version: "1.0" },
      userId: users[0].id,
      clientIp: "192.168.1.100",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    {
      agentId: "agent-123",
      eventType: AgentEventType.EXECUTED,
      eventData: {
        inputs: { param1: "value1" },
        outputs: { result: "success" },
      },
      metadata: { executionId: "exec-456", duration: 1234 },
      userId: users[0].id,
      clientIp: "192.168.1.100",
      userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    {
      agentId: "agent-456",
      eventType: AgentEventType.FAILED,
      eventData: { error: "Timeout error", stack: "Error: Timeout" },
      metadata: { executionId: "exec-789", attempts: 3 },
      userId: users[1].id,
      clientIp: "192.168.1.101",
      userAgent: "Mozilla/5.0 (Macintosh; Intel Mac OS X) AppleWebKit/537.36",
    },
  ];

  // Insert sample agent events
  for (const event of sampleAgentEvents) {
    const agentEvent = new AgentEvent();
    Object.assign(agentEvent, event);
    await agentEventRepository.save(agentEvent);
  }
  console.log(`✅ Inserted ${sampleAgentEvents.length} agent events`);

  // Sample oracle submissions
  const sampleOracleSubmissions = [
    {
      oracleId: "oracle-123",
      data: { price: "1234.56", timestamp: Date.now() },
      dataHash:
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      signature:
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      status: OracleSubmissionStatus.CONFIRMED,
      userId: users[0].id,
      submittedAt: new Date(Date.now() - 3600000), // 1 hour ago
      confirmedAt: new Date(Date.now() - 3500000), // 50 minutes ago
      transactionHash:
        "0xdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
      blockNumber: "12345678",
      retryAttempts: 0,
      metadata: { chainId: 1, contract: "0xContractAddress" },
    },
    {
      oracleId: "oracle-456",
      data: { temperature: 23.5, humidity: 65 },
      dataHash:
        "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      signature:
        "0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      status: OracleSubmissionStatus.SUBMITTED,
      userId: users[1].id,
      submittedAt: new Date(Date.now() - 1800000), // 30 minutes ago
      transactionHash:
        "0x456def1234567890abcdef1234567890abcdef1234567890abcdef1234567890",
      retryAttempts: 1,
      metadata: { chainId: 5, contract: "0xContractAddressRinkeby" },
    },
    {
      oracleId: "oracle-789",
      data: { stock_price: { symbol: "AAPL", price: 175.23 } },
      dataHash:
        "0xfedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321",
      signature:
        "0x0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321fedcba",
      status: OracleSubmissionStatus.FAILED,
      userId: users[2].id,
      errorMessage: "Invalid data format",
      retryAttempts: 3,
      metadata: { chainId: 137, contract: "0xPolygonContract" },
    },
  ];

  // Insert sample oracle submissions
  for (const submission of sampleOracleSubmissions) {
    const oracleSubmission = new OracleSubmission();
    Object.assign(oracleSubmission, submission);
    await oracleSubmissionRepository.save(oracleSubmission);
  }
  console.log(
    `✅ Inserted ${sampleOracleSubmissions.length} oracle submissions`,
  );

  // Sample compute results
  const sampleComputeResults = [
    {
      jobId: "job-123",
      resultData: { calculation: "fibonacci(10)", result: 55, memo: [] },
      resultHash:
        "0x1111111111111111111111111111111111111111111111111111111111111111",
      status: ComputeResultStatus.COMPLETED,
      userId: users[0].id,
      startedAt: new Date(Date.now() - 5000), // 5 seconds ago
      completedAt: new Date(Date.now() - 2000), // 2 seconds ago
      processingDurationMs: 3000,
      provider: "openai",
      costWei: "1000000000000000",
      metadata: { model: "gpt-4", tokens: 150 },
    },
    {
      jobId: "job-456",
      resultData: { analysis: "sentiment", score: 0.85, confidence: 0.92 },
      resultHash:
        "0x2222222222222222222222222222222222222222222222222222222222222222",
      status: ComputeResultStatus.PROCESSING,
      userId: users[1].id,
      startedAt: new Date(Date.now() - 10000), // 10 seconds ago
      provider: "local",
      metadata: { algorithm: "naive_bayes" },
    },
    {
      jobId: "job-789",
      resultData: {},
      resultHash:
        "0x3333333333333333333333333333333333333333333333333333333333333333",
      status: ComputeResultStatus.FAILED,
      userId: users[2].id,
      errorMessage: "Computation timeout after 30 seconds",
      provider: "custom",
      metadata: { timeout: 30000, retries: 2 },
    },
  ];

  // Insert sample compute results
  for (const result of sampleComputeResults) {
    const computeResult = new ComputeResult();
    Object.assign(computeResult, result);
    await computeResultRepository.save(computeResult);
  }
  console.log(`✅ Inserted ${sampleComputeResults.length} compute results`);

  console.log("🎉 Audit data seeding complete!");
}

export { seedAuditData };
