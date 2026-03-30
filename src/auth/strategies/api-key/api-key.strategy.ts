import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as crypto from "crypto";
import {
  AuthStrategy,
  AuthResult,
  AuthPayload,
  ApiKeyCredentials,
} from "../interfaces/auth-strategy.interface";
import { User } from "../../../user/entities/user.entity";

/**
 * API Key metadata
 */
interface ApiKeyMetadata {
  userId: string;
  name: string;
  permissions: string[];
  createdAt: Date;
  expiresAt?: Date;
  lastUsedAt?: Date;
}

/**
 * API Key authentication strategy
 * For service-to-service and programmatic access
 */
@Injectable()
export class ApiKeyStrategy implements AuthStrategy {
  readonly name = "api-key";
  private readonly logger = new Logger(ApiKeyStrategy.name);
  private readonly apiKeys = new Map<string, ApiKeyMetadata>();

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    this.loadSystemApiKeys();
  }

  /**
   * Load system-level API keys from configuration
   */
  private loadSystemApiKeys(): void {
    const systemApiKeys = this.configService.get<string>("SYSTEM_API_KEYS");
    if (systemApiKeys) {
      try {
        const keys: Array<{
          key: string;
          userId: string;
          name: string;
          permissions: string[];
        }> = JSON.parse(systemApiKeys);
        keys.forEach(({ key, userId, name, permissions }) => {
          this.apiKeys.set(key, {
            userId,
            name,
            permissions,
            createdAt: new Date(),
          });
        });
        this.logger.log(`Loaded ${keys.length} system API keys`);
      } catch (error) {
        this.logger.error("Failed to parse SYSTEM_API_KEYS", error);
      }
    }
  }

  /**
   * Check if API key strategy is enabled
   */
  get isEnabled(): boolean {
    return this.configService.get<boolean>("AUTH_API_KEY_ENABLED", true);
  }

  /**
   * Authenticate using API key
   * @param credentials - API key credentials
   * @returns Authentication result with JWT token
   */
  async authenticate(credentials: unknown): Promise<AuthResult> {
    const { apiKey, apiSecret } = credentials as ApiKeyCredentials;

    if (!apiKey) {
      throw new BadRequestException("API key is required");
    }

    // Validate API key
    const keyMetadata = await this.validateApiKey(apiKey, apiSecret);
    if (!keyMetadata) {
      throw new UnauthorizedException("Invalid API key");
    }

    // Get user
    const user = await this.userRepository.findOne({
      where: { id: keyMetadata.userId },
    });

    if (!user) {
      throw new UnauthorizedException("User not found for API key");
    }

    // Update last used timestamp
    keyMetadata.lastUsedAt = new Date();

    // Generate JWT token with limited lifetime
    const payload: AuthPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role || "service",
      iat: Math.floor(Date.now() / 1000),
      type: "api-key",
    };

    const token = this.jwtService.sign(payload, {
      expiresIn: "1h", // Short-lived tokens for API keys
    });

    this.logger.log(
      `API key authenticated: ${keyMetadata.name} for user ${user.id}`,
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role || "service",
        type: "api-key",
      },
    };
  }

  /**
   * Validate API key and optional secret
   */
  private async validateApiKey(
    apiKey: string,
    apiSecret?: string,
  ): Promise<ApiKeyMetadata | null> {
    // Check in-memory keys
    const metadata = this.apiKeys.get(apiKey);
    if (metadata) {
      // Check expiration
      if (metadata.expiresAt && metadata.expiresAt < new Date()) {
        return null;
      }
      return metadata;
    }

    // TODO: Add database lookup for user-generated API keys
    // This would involve hashing the key and looking it up in a database

    return null;
  }

  /**
   * Generate a new API key for a user
   * @param userId - User ID
   * @param name - Key name/description
   * @param permissions - Array of permissions
   * @param expiresInDays - Optional expiration in days
   * @returns The generated API key
   */
  generateApiKey(
    userId: string,
    name: string,
    permissions: string[] = ["read"],
    expiresInDays?: number,
  ): { key: string; secret: string } {
    const key = `sk_${crypto.randomBytes(24).toString("hex")}`;
    const secret = crypto.randomBytes(32).toString("hex");

    this.apiKeys.set(key, {
      userId,
      name,
      permissions,
      createdAt: new Date(),
      expiresAt: expiresInDays
        ? new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000)
        : undefined,
    });

    this.logger.log(`Generated API key: ${name} for user ${userId}`);

    return { key, secret };
  }

  /**
   * Revoke an API key
   * @param apiKey - The API key to revoke
   * @returns True if revoked successfully
   */
  revokeApiKey(apiKey: string): boolean {
    const deleted = this.apiKeys.delete(apiKey);
    if (deleted) {
      this.logger.log("API key revoked");
    }
    return deleted;
  }

  /**
   * Get all API keys for a user
   * @param userId - User ID
   * @returns Array of API key metadata (without actual keys)
   */
  getUserApiKeys(
    userId: string,
  ): Array<Omit<ApiKeyMetadata, "userId"> & { id: string }> {
    const keys: Array<Omit<ApiKeyMetadata, "userId"> & { id: string }> = [];
    let index = 0;

    for (const [key, metadata] of this.apiKeys.entries()) {
      if (metadata.userId === userId) {
        keys.push({
          id: `key_${index++}`,
          name: metadata.name,
          permissions: metadata.permissions,
          createdAt: metadata.createdAt,
          expiresAt: metadata.expiresAt,
          lastUsedAt: metadata.lastUsedAt,
        });
      }
    }

    return keys;
  }

  /**
   * Validate a JWT token
   * @param token - The JWT token to validate
   * @returns The decoded payload or null if invalid
   */
  async validateToken(token: string): Promise<AuthPayload | null> {
    try {
      return this.jwtService.verify(token) as AuthPayload;
    } catch (error) {
      this.logger.warn("Token validation failed", error);
      return null;
    }
  }
}
