// src/oracle/submission-verifier.service.ts

import { Injectable, Logger } from "@nestjs/common";
import { AuditLogService } from "../audit/audit-log.service";

interface OnChainSubmission {
  id: string;
  hash: string;
  timestamp: number;
}

interface OffChainSubmission {
  id: string;
  hash: string;
  createdAt: Date;
}

@Injectable()
export class SubmissionVerifierService {
  private readonly logger = new Logger(SubmissionVerifierService.name);

  private pollingInterval = 15000; // 15s
  private isRunning = false;

  constructor(private readonly auditLogService: AuditLogService) {}

  // -------------------------------------
  // START POLLING
  // -------------------------------------
  start() {
    if (this.isRunning) return;

    this.isRunning = true;
    this.logger.log("Starting submission verifier...");

    setInterval(() => this.verifyCycle(), this.pollingInterval);
  }

  // -------------------------------------
  // VERIFY LOOP
  // -------------------------------------
  private async verifyCycle() {
    try {
      const onChain = await this.fetchOnChainSubmissions();
      const offChain = await this.fetchOffChainSubmissions();

      const result = this.compare(onChain, offChain);

      await this.auditLogService.recordVerification(result);

      if (result.mismatches.length > 0) {
        await this.triggerAlerts(result);
      }
    } catch (err) {
      this.logger.error("Verification failed", err);
    }
  }

  // -------------------------------------
  // FETCH ON-CHAIN (MOCK / ADAPTER)
  // -------------------------------------
  private async fetchOnChainSubmissions(): Promise<OnChainSubmission[]> {
    // TODO: Replace with actual blockchain adapter (ethers/web3)
    return [{ id: "1", hash: "abc", timestamp: Date.now() }];
  }

  // -------------------------------------
  // FETCH OFF-CHAIN
  // -------------------------------------
  private async fetchOffChainSubmissions(): Promise<OffChainSubmission[]> {
    // TODO: Replace with DB query
    return [{ id: "1", hash: "abc", createdAt: new Date() }];
  }

  // -------------------------------------
  // CORE COMPARISON LOGIC
  // -------------------------------------
  private compare(
    onChain: OnChainSubmission[],
    offChain: OffChainSubmission[],
  ) {
    const mismatches = [];
    const missing = [];
    const duplicates = [];

    const offChainMap = new Map(offChain.map((o) => [o.id, o]));

    for (const on of onChain) {
      const off = offChainMap.get(on.id);

      if (!off) {
        missing.push(on);
        continue;
      }

      if (off.hash !== on.hash) {
        mismatches.push({
          id: on.id,
          onChainHash: on.hash,
          offChainHash: off.hash,
        });
      }
    }

    return {
      timestamp: new Date(),
      totalChecked: onChain.length,
      mismatches,
      missing,
      duplicates,
    };
  }

  // -------------------------------------
  // ALERTING
  // -------------------------------------
  private async triggerAlerts(result: any) {
    // 👉 Replace with real integrations
    console.warn("ALERT: Submission mismatch detected", result);

    // Example webhook
    // await axios.post(WEBHOOK_URL, result);
  }

  // -------------------------------------
  // PUBLIC STATUS
  // -------------------------------------
  getStatus() {
    return {
      running: this.isRunning,
      interval: this.pollingInterval,
    };
  }
}
