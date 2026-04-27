import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import { User } from "../user/entities/user.entity";
import { EmailVerification } from "../auth/entities/email-verification.entity";
import { SignedPayload } from "../oracle/entities/signed-payload.entity";
import { SubmissionNonce } from "../oracle/entities/submission-nonce.entity";
import { AgentEvent } from "../agent/entities/agent-event.entity";
import { ComputeResult } from "../compute/entities/compute-result.entity";

dotenv.config();

async function run() {
  const dataSource = new DataSource({
    type: "postgres",
    url:
      process.env.DATABASE_URL ||
      "postgresql://stellaiverse:password@localhost:5432/stellaiverse",
    entities: [
      User,
      EmailVerification,
      SignedPayload,
      SubmissionNonce,
      AgentEvent,
      ComputeResult,
    ],
    synchronize: true,
  });

  try {
    await dataSource.initialize();
    console.log("✅ Tables created/updated via synchronize=true");
  } catch (err) {
    console.error("❌ Failed to create tables:", err);
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

run();
