import { DataSource } from "typeorm";
import { AgentEvent } from "../agent/entities/agent-event.entity";
import * as dotenv from "dotenv";

dotenv.config();

async function seed() {
  const dataSource = new DataSource({
    type: "postgres",
    url:
      process.env.DATABASE_URL ||
      "postgresql://stellaiverse:password@localhost:5432/stellaiverse",
    entities: [AgentEvent],
  });

  await dataSource.initialize();

  const repo = dataSource.getRepository(AgentEvent);

  const sample = repo.create({
    agentId: "0x0000000000000000000000000000000000000000",
    eventType: "test_event",
    payload: { message: "seeded event" },
    txHash: null,
    metadata: { seeded: true },
  });

  await repo.save(sample);
  console.log("✅ Seeded AgentEvent sample");

  await dataSource.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
