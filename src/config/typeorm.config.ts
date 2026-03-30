import { DataSource } from "typeorm";
import { User } from "../user/entities/user.entity";
import { EmailVerification } from "../auth/entities/email-verification.entity";
import { IndexedEvent } from "../indexer/entities/indexed-event.entity";
import { SignedPayload } from "../oracle/entities/signed-payload.entity";
import { SubmissionNonce } from "../oracle/entities/submission-nonce.entity";
import { AgentEvent } from "../audit/entities/agent-event.entity";
import { OracleSubmission } from "../audit/entities/oracle-submission.entity";
import { ComputeResult } from "../audit/entities/compute-result.entity";

export default new DataSource({
  type: "postgres",
  url:
    process.env.DATABASE_URL ||
    "postgresql://stellaiverse:password@localhost:5432/stellaiverse",
  entities: [
    User,
    EmailVerification,
    IndexedEvent,
    SignedPayload,
    SubmissionNonce,
    AgentEvent,
    OracleSubmission,
    ComputeResult,
  ],
  migrations: [`${__dirname}/../migrations/*{.ts,.js}`],
  synchronize: false, // Never use synchronize in production
  logging: process.env.NODE_ENV === "development",
});
