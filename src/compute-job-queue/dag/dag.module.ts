import { Module, forwardRef } from "@nestjs/common";
import { DagValidator } from "./dag.validator";
import { DagService } from "./dag.service";
import { DagController } from "./dag.controller";
import { QueueModule } from "../compute-job-queue.module";

/**
 * Provides DAG-based job orchestration on top of the existing
 * compute job queue infrastructure.
 *
 * Imports QueueModule (via forwardRef to avoid circular dependency)
 * so that DagService can inject QueueService for job enqueuing.
 */
@Module({
  imports: [forwardRef(() => QueueModule)],
  controllers: [DagController],
  providers: [DagValidator, DagService],
  exports: [DagService, DagValidator],
})
export class DagModule {}
