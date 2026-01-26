import { Module } from "@nestjs/common";
import { AgentEventsGateway } from "./gateways/agent-events.gateway";
import { WebSocketAuthGuard } from "./guards/websocket-auth.guard";
import { AgentStatusService } from "./services/agent-status.service";
import { HeartbeatService } from "./services/heartbeat.service";
import { SubscriptionService } from "./services/subscription.service";

@Module({
  providers: [
    AgentEventsGateway,
    WebSocketAuthGuard,
    AgentStatusService,
    HeartbeatService,
    SubscriptionService,
  ],
  exports: [AgentEventsGateway, AgentStatusService],
})
export class WebSocketModule {}
