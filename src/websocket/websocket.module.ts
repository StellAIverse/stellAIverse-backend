import { Module } from "@nestjs/common";
import { UserModule } from "../user/user.module";
import { AgentEventsGateway } from "./gateways/agent-events.gateway";
import { WebSocketAuthGuard } from "./guards/websocket-auth.guard";
import { AgentStatusService } from "./services/agent-status.service";
import { HeartbeatService } from "./services/heartbeat.service";
import { SubscriptionService } from "./services/subscription.service";
import { AgentTelemetryGateway } from "./agent-telemetry.gateway";
import { AgentTelemetryService } from "./agent-telemetry.service";

@Module({
  imports: [UserModule],
  providers: [
    AgentEventsGateway,
    WebSocketAuthGuard,
    AgentStatusService,
    HeartbeatService,
    SubscriptionService,
    AgentTelemetryGateway,
    AgentTelemetryService,
  ],
  exports: [AgentEventsGateway, AgentStatusService, AgentTelemetryService],
})
export class WebSocketModule {}
