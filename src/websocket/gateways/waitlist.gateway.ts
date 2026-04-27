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

interface AuthenticatedSocket extends Socket {
  userId?: string;
  walletAddress?: string;
}

@WebSocketGateway({
  cors: {
    origin: process.env.CORS_ORIGIN || "*",
    credentials: true,
  },
  namespace: "/waitlist",
})
export class WaitlistGateway
  implements OnGatewayConnection, OnGatewayDisconnect
{
  @WebSocketServer()
  server: Server;

  private readonly logger = new Logger(WaitlistGateway.name);

  async handleConnection(client: Socket) {
    this.logger.log(`Client connected to waitlist: ${client.id}`);
    
    // Initial welcome
    client.emit("waitlist:welcome", {
      message: "Connected to Waitlist Notification System",
      timestamp: new Date().toISOString(),
    });
  }

  async handleDisconnect(client: Socket) {
    this.logger.log(`Client disconnected from waitlist: ${client.id}`);
  }

  @UseGuards(WebSocketAuthGuard)
  @SubscribeMessage("waitlist:subscribe")
  async handleSubscribe(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) {
      return { success: false, message: "User not authenticated" };
    }

    const room = `waitlist:user:${client.userId}`;
    await client.join(room);
    
    this.logger.log(`User ${client.userId} subscribed to waitlist notifications in room ${room}`);
    
    return {
      success: true,
      message: `Subscribed to waitlist notifications`,
      room,
    };
  }

  @UseGuards(WebSocketAuthGuard)
  @SubscribeMessage("waitlist:unsubscribe")
  async handleUnsubscribe(@ConnectedSocket() client: AuthenticatedSocket) {
    if (!client.userId) {
      return { success: false, message: "User not authenticated" };
    }

    const room = `waitlist:user:${client.userId}`;
    await client.leave(room);
    
    this.logger.log(`User ${client.userId} unsubscribed from waitlist notifications`);
    
    return {
      success: true,
      message: `Unsubscribed from waitlist notifications`,
    };
  }

  /**
   * Broadcasts a position update to a specific user
   */
  notifyPositionUpdated(userId: string, data: any) {
    this.server.to(`waitlist:user:${userId}`).emit("waitlist:position_updated", data);
  }

  /**
   * Broadcasts a milestone achievement to a specific user
   */
  notifyMilestoneReached(userId: string, data: any) {
    this.server.to(`waitlist:user:${userId}`).emit("waitlist:milestone_reached", data);
  }

  /**
   * Broadcasts an access grant to a specific user
   */
  notifyAccessGranted(userId: string, data: any) {
    this.server.to(`waitlist:user:${userId}`).emit("waitlist:access_granted", data);
  }

  /**
   * Broadcasts a status change to a specific user
   */
  notifyStatusChanged(userId: string, data: any) {
    this.server.to(`waitlist:user:${userId}`).emit("waitlist:status_changed", data);
  }

  /**
   * Broadcasts a priority boost to a specific user
   */
  notifyPriorityBoosted(userId: string, data: any) {
    this.server.to(`waitlist:user:${userId}`).emit("waitlist:priority_boosted", data);
  }
}
