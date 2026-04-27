import { Injectable } from "@nestjs/common";

@Injectable()
export class AuditLogService {
  private logs: any[] = [];

  async recordVerification(result: any) {
    const entry = {
      type: "VERIFICATION",
      ...result,
    };

    this.logs.push(entry);

    // ❗ Immutable simulation (append-only)
    Object.freeze(entry);

    return entry;
  }

  getLogs(limit = 50) {
    return this.logs.slice(-limit);
  }
}
