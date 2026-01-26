import { Injectable } from "@nestjs/common";
import { ThrottlerGuard } from "@nestjs/throttler";

type AnyRequest = {
  ip?: string;
  headers?: Record<string, unknown>;
  user?: { id?: string | number };
};

@Injectable()
export class ThrottlerUserIpGuard extends ThrottlerGuard {
  protected async getTracker(req: AnyRequest): Promise<string> {
    // Prefer authenticated user identity (per-user quotas)
    const userId = req.user?.id;
    if (userId !== undefined && userId !== null) {
      return `user:${String(userId)}`;
    }

    // Fallback to IP (anonymous users, unauthenticated routes)
    const ip = this.getClientIp(req);
    return `ip:${ip}`;
  }

  private getClientIp(req: AnyRequest): string {
    // If you're behind a proxy/load balancer, X-Forwarded-For may contain the real client IP
    const xff = req.headers?.["x-forwarded-for"];
    if (typeof xff === "string" && xff.length > 0) {
      // "client, proxy1, proxy2" -> take the first
      return xff.split(",")[0].trim();
    }

    return req.ip ?? "unknown";
  }
}
