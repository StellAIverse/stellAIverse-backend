import { Module } from "@nestjs/common";
import { AgentService } from "./agent.service";
import { AuditModule } from "../audit/audit.module";

@Module({
  imports: [AuditModule],
  providers: [AgentService],
  exports: [AgentService],
})
export class AgentModule {}
