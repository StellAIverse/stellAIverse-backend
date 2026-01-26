import { Injectable, Logger } from "@nestjs/common";

interface Subscription {
  clientId: string;
  resourceId: string;
  resourceType: "agent" | "system";
  createdAt: Date;
}

@Injectable()
export class SubscriptionService {
  private readonly logger = new Logger(SubscriptionService.name);
  private subscriptions: Map<string, Subscription[]> = new Map();

  async subscribe(
    clientId: string,
    resourceId: string,
    resourceType: "agent" | "system",
  ) {
    const key = this.getKey(clientId);
    const existing = this.subscriptions.get(key) || [];
    // Check if already subscribed
    const isSubscribed = existing.some(
      (sub) =>
        sub.resourceId === resourceId && sub.resourceType === resourceType,
    );

    if (!isSubscribed) {
      existing.push({
        clientId,
        resourceId,
        resourceType,
        createdAt: new Date(),
      });
      this.subscriptions.set(key, existing);
      this.logger.log(
        `Client ${clientId} subscribed to ${resourceType}:${resourceId}`,
      );
    }
  }

  async unsubscribe(clientId: string, resourceId: string) {
    const key = this.getKey(clientId);
    const existing = this.subscriptions.get(key) || [];

    const filtered = existing.filter((sub) => sub.resourceId !== resourceId);
    this.subscriptions.set(key, filtered);

    this.logger.log(`Client ${clientId} unsubscribed from ${resourceId}`);
  }

  async removeAllSubscriptions(clientId: string) {
    const key = this.getKey(clientId);
    this.subscriptions.delete(key);
    this.logger.log(`Removed all subscriptions for client ${clientId}`);
  }

  getSubscriptions(clientId: string): Subscription[] {
    const key = this.getKey(clientId);
    return this.subscriptions.get(key) || [];
  }

  private getKey(clientId: string): string {
    return `client:${clientId}`;
  }
}
