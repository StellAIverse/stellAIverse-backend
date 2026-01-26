import { CanActivate, ExecutionContext, Injectable, Logger } from "@nestjs/common";
import { WsException } from "@nestjs/websockets";
import { Socket } from "socket.io";
import * as jwt from "jsonwebtoken";

interface AuthenticatedSocket extends Socket {
  userId?: string;
  walletAddress?: string;
}

@Injectable()
export class WebSocketAuthGuard implements CanActivate {
  private readonly logger = new Logger(WebSocketAuthGuard.name);

  async canActivate(context: ExecutionContext): Promise<boolean> {
    try {
      const client: AuthenticatedSocket = context.switchToWs().getClient();
      const token = this.extractToken(client);

      if (!token) {
        throw new WsException("Unauthorized: No token provided");
      }

      // Verify JWT token
      const payload = await this.verifyToken(token);
      // Attach user info to socket
      client.userId = payload.userId;
      client.walletAddress = payload.walletAddress;

      return true;
    } catch (error) {
      this.logger.error("WebSocket authentication failed:", error);
      throw new WsException("Unauthorized: Invalid token");
    }
  }

  private extractToken(client: Socket): string | null {
    // Try to get token from auth object
    if (client.handshake.auth?.token) {
      return client.handshake.auth.token;
    }

    // Try to get from headers
    const authHeader = client.handshake.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      return authHeader.substring(7);
    }

    return null;
  }

  private async verifyToken(token: string): Promise<any> {
    try {
      const secret = process.env.JWT_SECRET || "your-secret-key";
      return jwt.verify(token, secret);
    } catch (error) {
      throw new WsException("Invalid token");
    }
  }
}