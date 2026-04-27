// src/oracle/submission-verifier.controller.ts

import { Controller, Get, UseGuards } from "@nestjs/common";
import { SubmissionVerifierService } from "./submission-verifier.service";
import { AuditLogService } from "../audit/audit-log.service";

@Controller("verifier")
export class SubmissionVerifierController {
  constructor(
    private verifier: SubmissionVerifierService,
    private audit: AuditLogService,
  ) {}

  @Get("status")
  getStatus() {
    return this.verifier.getStatus();
  }

  @Get("logs")
  getLogs() {
    return this.audit.getLogs();
  }
}
