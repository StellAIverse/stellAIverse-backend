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
import { WebSocketAuthGuard } from "../guards/websocket-auth.guard";
import { SubscriptionService } from "../services/subscription.service";
import { HeartbeatService } from "../services/heartbeat.service";
import { AgentStatusService } from "../services/agent-status.service";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  walletAddress?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  },
  namespace: "/agent-events",
})
export class AgentEventsGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(AgentEventsGateway.name);

  constructor(
    private readonly subscriptionService: SubscriptionService,
    private readonly heartbeatService: HeartbeatService,
    private readonly agentStatusService: AgentStatusService,
  ) {}

  async handleConnection(client: AuthenticatedSocket) {
    this.logger.log(`Client attempting connection: ${client.id}`);

    // Auth will be handled by guard, but we log connection attempt
    try {
      const token =
        client.handshake.auth.token || client.handshake.headers.authorization;
      if (!token) {
        this.logger.warn(`Client ${client.id} connected without token`);
        client.disconnect();
        return;
      }

      this.logger.log(`Client connected: ${client.id}`);

      // Send welcome message
      client.emit("connection:success", {
        clientId: client.id,
        timestamp: new Date().toISOString(),
        message: "Connected to Agent Events Gateway",
      });
    } catch (error) {
      this.logger.error(`Connection error for client ${client.id}:`, error);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    this.logger.log(`Client disconnected: ${client.id}`);

    // Clean up subscriptions
    await this.subscriptionService.removeAllSubscriptions(client.id);

    // Stop heartbeat monitoring
    this.heartbeatService.stopMonitoring(client.id);
  }

  @UseGuards(WebSocketAuthGuard)
  @SubscribeMessage("agent:subscribe")
  async handleAgentSubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { agentId: string },
  ) {
    try {
      await this.subscriptionService.subscribe(
        client.id,
        data.agentId,
        "agent",
      );

      // Join room for agent-specific events
      client.join(`agent:${data.agentId}`);

      // Send current agent status
      const status = await this.agentStatusService.getAgentStatus(data.agentId);

      return {
        success: true,
        message: `Subscribed to agent ${data.agentId}`,
        currentStatus: status,
      };
    } catch (error) {
      this.logger.error(`Error subscribing to agent ${data.agentId}:`, error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @UseGuards(WebSocketAuthGuard)
  @SubscribeMessage("agent:unsubscribe")
  async handleAgentUnsubscribe(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { agentId: string },
  ) {
    try {
      await this.subscriptionService.unsubscribe(client.id, data.agentId);
      client.leave(`agent:${data.agentId}`);

      return {
        success: true,
        message: `Unsubscribed from agent ${data.agentId}`,
      };
    } catch (error) {
      this.logger.error(
        `Error unsubscribing from agent ${data.agentId}:`,
        error,
      );
      return {
        success: false,
        message: error.message,
      };
    }
  }

  @UseGuards(WebSocketAuthGuard)
  @SubscribeMessage("heartbeat:start")
  async handleHeartbeatStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() data: { interval?: number },
  ) {
    const interval = data.interval || 30000; // Default 30 seconds

    this.heartbeatService.startMonitoring(client.id, interval, (status) => {
      client.emit("heartbeat", status);
    });

    return {
      success: true,
      interval,
      message: "Heartbeat monitoring started",
    };
  }

  @UseGuards(WebSocketAuthGuard)
  @SubscribeMessage("heartbeat:stop")
  handleHeartbeatStop(@ConnectedSocket() client: AuthenticatedSocket) {
    this.heartbeatService.stopMonitoring(client.id);

    return {
      success: true,
      message: "Heartbeat monitoring stopped",
    };
  }

  @UseGuards(WebSocketAuthGuard)
  @SubscribeMessage("agent:list")
  async handleGetAgentsList(@ConnectedSocket() client: AuthenticatedSocket) {
    try {
      const agents = await this.agentStatusService.getAllAgents();

      return {
        success: true,
        agents,
        count: agents.length,
      };
    } catch (error) {
      this.logger.error("Error fetching agents list:", error);
      return {
        success: false,
        message: error.message,
      };
    }
  }

  // Public methods for emitting events to clients
  emitAgentStatusUpdate(agentId: string, status: any) {
    this.server.to(`agent:${agentId}`).emit("agent:status", {
      agentId,
      status,
      timestamp: new Date().toISOString(),
    });
  }

  emitAgentHeartbeat(agentId: string, data: any) {
    this.server.to(`agent:${agentId}`).emit("agent:heartbeat", {
      agentId,
      data,
      timestamp: new Date().toISOString(),
    });
  }

  emitAgentError(agentId: string, error: any) {
    this.server.to(`agent:${agentId}`).emit("agent:error", {
      agentId,
      error,
      timestamp: new Date().toISOString(),
    });
  }

  broadcastSystemMessage(
    message: string,
    level: "info" | "warning" | "error" = "info",
  ) {
    this.server.emit("system:message", {
      message,
      level,
      timestamp: new Date().toISOString(),
    });
  }
}
