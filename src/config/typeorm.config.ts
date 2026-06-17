import { DataSource } from "typeorm";
import { User } from "../user/entities/user.entity";
import { EmailVerification } from "../auth/entities/email-verification.entity";
import { Wallet } from "../auth/entities/wallet.entity";
import { SignedPayload } from "../oracle/entities/signed-payload.entity";
import { SubmissionNonce } from "../oracle/entities/submission-nonce.entity";
import { AgentEvent } from "../audit/entities/agent-event.entity";
import { OracleSubmission } from "../audit/entities/oracle-submission.entity";
import { ComputeResult } from "../audit/entities/compute-result.entity";
import { ProvenanceRecord } from "../audit/entities/provenance-record.entity";
import { DeFiPosition } from "../defi/entities/defi-position.entity";
import { DeFiYieldRecord } from "../defi/entities/defi-yield-record.entity";
import { DeFiTransaction } from "../defi/entities/defi-transaction.entity";
import { DeFiYieldStrategy } from "../defi/entities/defi-yield-strategy.entity";
import { DeFiRiskAssessment } from "../defi/entities/defi-risk-assessment.entity";
import { Alert } from "../alerts/entities/alert.entity";
import { AlertTriggerLog } from "../alerts/entities/alert-trigger-log.entity";

export default new DataSource({
  type: "postgres",
  url:
    process.env.DATABASE_URL ||
    "postgresql://stellaiverse:password@localhost:5432/stellaiverse",
  entities: [
    User,
    EmailVerification,
    Wallet,
    SignedPayload,
    SubmissionNonce,
    AgentEvent,
    OracleSubmission,
    ComputeResult,
    ProvenanceRecord,
    DeFiPosition,
    DeFiYieldRecord,
    DeFiTransaction,
    DeFiYieldStrategy,
    DeFiRiskAssessment,
    Alert,
    AlertTriggerLog,
  ],
  migrations: [`${__dirname}/../migrations/*{.ts,.js}`],
  synchronize: false, // Never use synchronize in production
  logging: process.env.NODE_ENV === "development",
});
