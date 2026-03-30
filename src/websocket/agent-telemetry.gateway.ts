import {
  WebSocketGateway,
  WebSocketServer,
  SubscribeMessage,
  OnGatewayConnection,
  OnGatewayDisconnect,
  ConnectedSocket,
  MessageBody,
} from "@nestjs/websockets";
import { Server, Socket } from "socket.io";
import { UseGuards, Logger } from "@nestjs/common";
import { WebSocketAuthGuard } from "./guards/websocket-auth.guard";
import {
  AgentTelemetryService,
  TelemetryEvent,
  TelemetryFilter,
} from "./agent-telemetry.service";
import { UserRole } from "../user/entities/user.entity";
import { UserService } from "../user/user.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  walletAddress?: string;
  role?: UserRole;
  filters: Map<string, TelemetryFilter>;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  },
  namespace: "/agent-telemetry",
})
export class AgentTelemetryGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentTelemetryGateway.name);

  constructor(
    private readonly telemetryService: AgentTelemetryService,
    private readonly userService: UserService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Client connected to telemetry: ${client.id}`);
    client.filters = new Map();

    // Welcome message
    client.emit("telemetry:welcome", {
      message: "Connected to Real-Time Agent Telemetry Gateway",
      timestamp: new Date().toISOString(),
    });
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected from telemetry: ${client.id}`);
  }

  @UseGuards(WebSocketAuthGuard)
  @SubscribeMessage("telemetry:subscribe")
  async handleSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() filter: TelemetryFilter,
  ) {
    try {
      // Fetch user role for RBAC
      if (!client.role && client.userId) {
        const user = await this.userService.findOne(client.userId);
        if (user) {
          client.role = user.role;
        }
      }

      // Enforce RBAC: only authorized users can subscribe to telemetry
      const isAuthorized =
        client.role === UserRole.ADMIN || client.role === UserRole.OPERATOR;

      if (!isAuthorized) {
        this.logger.warn(
          `Unauthorized telemetry subscription attempt from user ${client.userId} with role ${client.role}`,
        );
        return {
          success: false,
          message:
            "Unauthorized: Insufficient permissions for telemetry access",
        };
      }

      const subscriptionId = filter.agentId || "all";
      client.filters.set(subscriptionId, filter);

      if (filter.agentId) {
        client.join(`telemetry:agent:${filter.agentId}`);
      } else {
        client.join("telemetry:all");
      }

      this.logger.log(
        `Client ${client.id} subscribed to telemetry: ${subscriptionId}`,
      );

      return {
        success: true,
        message: `Subscribed to telemetry for ${subscriptionId}`,
      };
    } catch (error) {
      this.logger.error(`Subscription error for client ${client.id}:`, error);
      return {
        success: false,
        message: "Failed to subscribe to telemetry",
      };
    }
  }

  @UseGuards(WebSocketAuthGuard)
  @SubscribeMessage("telemetry:unsubscribe")
  async handleUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { agentId?: string },
  ) {
    const subscriptionId = data.agentId || "all";
    client.filters.delete(subscriptionId);

    if (data.agentId) {
      client.leave(`telemetry:agent:${data.agentId}`);
    } else {
      client.leave("telemetry:all");
    }

    this.logger.log(
      `Client ${client.id} unsubscribed from telemetry: ${subscriptionId}`,
    );

    return {
      success: true,
      message: `Unsubscribed from telemetry for ${subscriptionId}`,
    };
  }

  /**
   * Broadcasts a telemetry event to subscribed clients.
   */
  broadcastTelemetry(event: TelemetryEvent) {
    const processedEvent = this.telemetryService.processTelemetry(event);

    // Broadcast to global subscribers
    this.server.to("telemetry:all").sockets?.forEach((socket: Socket) => {
      const authSocket = socket as unknown as AuthenticatedSocket;
      const globalFilter = authSocket.filters?.get("all");
      if (
        globalFilter &&
        this.telemetryService.matchesFilter(processedEvent, globalFilter)
      ) {
        authSocket.emit("telemetry:event", processedEvent);
      }
    });

    // Broadcast to agent-specific subscribers
    this.server
      .to(`telemetry:agent:${event.agentId}`)
      .sockets?.forEach((socket: Socket) => {
        const authSocket = socket as unknown as AuthenticatedSocket;
        const agentFilter = authSocket.filters?.get(event.agentId);
        if (
          agentFilter &&
          this.telemetryService.matchesFilter(processedEvent, agentFilter)
        ) {
          authSocket.emit("telemetry:event", processedEvent);
        }
      });
  }
}
