import { DataSource } from "typeorm";
import { ComputeResult } from "../compute/entities/compute-result.entity";
import * as dotenv from "dotenv";

dotenv.config();

async function seed() {
  const dataSource = new DataSource({
    type: "postgres",
    url:
      process.env.DATABASE_URL ||
      "postgresql://stellaiverse:password@localhost:5432/stellaiverse",
    entities: [ComputeResult],
  });

  await dataSource.initialize();

  const repo = dataSource.getRepository(ComputeResult);

  const sample = repo.create({
    originalResult: JSON.stringify({ value: 42 }),
    normalizedResult: JSON.stringify({ value: 42 }),
    hash: "0x" + "deadbeef".repeat(8).slice(0, 64),
    metadata: { seeded: true },
  });

  await repo.save(sample);
  console.log("✅ Seeded ComputeResult sample");

  await dataSource.destroy();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
