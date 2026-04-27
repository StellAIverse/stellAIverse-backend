import { DataSource } from "typeorm";
import * as dotenv from "dotenv";
import { User } from "../user/entities/user.entity";
import { EmailVerification } from "../auth/entities/email-verification.entity";
import { SignedPayload } from "../oracle/entities/signed-payload.entity";
import { SubmissionNonce } from "../oracle/entities/submission-nonce.entity";
import { AgentEvent } from "../agent/entities/agent-event.entity";
import { ComputeResult } from "../compute/entities/compute-result.entity";

dotenv.config();

async function test() {
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
    synchronize: false,
  });

  try {
    await dataSource.initialize();
    console.log("✅ Database connection successful");
  } catch (err) {
    console.error("❌ Database connection failed:", err.message || err);
    process.exitCode = 1;
  } finally {
    if (dataSource.isInitialized) await dataSource.destroy();
  }
}

test();
