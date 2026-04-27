import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import { AgentEvent } from "../agent/entities/agent-event.entity";
import { ComputeResult } from "../compute/entities/compute-result.entity";

dotenv.config();

async function run() {
  const dataSource = new DataSource({
    type: "postgres",
    url:
      process.env.DATABASE_URL ||
      "postgresql://stellaiverse:password@localhost:5432/stellaiverse",
    entities: [AgentEvent, ComputeResult],
  });

  try {
    await dataSource.initialize();

    const agentEventRepo = dataSource.getRepository(AgentEvent);
    const computeResultRepo = dataSource.getRepository(ComputeResult);

    const agentEvents = await agentEventRepo.find();
    const computeResults = await computeResultRepo.find();

    console.log("✅ AgentEvent count:", agentEvents.length);
    if (agentEvents.length > 0) {
      console.log("  Sample:", JSON.stringify(agentEvents[0], null, 2));
    }

    console.log("✅ ComputeResult count:", computeResults.length);
    if (computeResults.length > 0) {
      console.log("  Sample:", JSON.stringify(computeResults[0], null, 2));
    }

    if (agentEvents.length === 0 || computeResults.length === 0) {
      console.warn("⚠️  Some tables are empty—run seed scripts to populate");
    }
  } catch (err) {
    console.error("❌ Verification failed:", err);
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

run();
