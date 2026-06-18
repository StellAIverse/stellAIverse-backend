import { PipeTransform, Injectable, ArgumentMetadata } from "@nestjs/common";

/**
 * Recursively strips HTML tags and encodes dangerous characters from string
 * values to prevent XSS. Applied globally via main.ts or per-DTO via
 * @UsePipes(SanitizePipe).
 */
@Injectable()
export class SanitizePipe implements PipeTransform {
  transform(value: unknown, _metadata: ArgumentMetadata): unknown {
    return this.sanitize(value);
  }

  private sanitize(value: unknown): unknown {
    if (typeof value === "string") {
      return this.sanitizeString(value);
    }
    if (Array.isArray(value)) {
      return value.map((item) => this.sanitize(item));
    }
    if (value !== null && typeof value === "object") {
      const sanitized: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(
        value as Record<string, unknown>,
      )) {
        sanitized[key] = this.sanitize(val);
      }
      return sanitized;
    }
    return value;
  }

  private sanitizeString(str: string): string {
    return (
      str
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#x27;")
        .replace(/\//g, "&#x2F;")
        // Strip script tags and event handlers even after encoding attempt
        .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
        .replace(/on\w+\s*=\s*["'][^"']*["']/gi, "")
    );
  }
}
