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
import {
  AuthStrategy,
  AuthResult,
  AuthPayload,
  OAuthCredentials,
} from "../interfaces/auth-strategy.interface";
import { User } from "../../../user/entities/user.entity";

/**
 * OAuth provider configuration
 */
interface OAuthProviderConfig {
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
}

/**
 * OAuth user info from provider
 */
interface OAuthUserInfo {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

/**
 * OAuth authentication strategy
 * Supports multiple OAuth providers (Google, GitHub, etc.)
 */
@Injectable()
export class OAuthStrategy implements AuthStrategy {
  readonly name = "oauth";
  private readonly logger = new Logger(OAuthStrategy.name);
  private readonly providers = new Map<string, OAuthProviderConfig>();

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {
    this.initializeProviders();
  }

  /**
   * Initialize OAuth providers from configuration
   */
  private initializeProviders(): void {
    // Google OAuth
    if (this.configService.get<string>("OAUTH_GOOGLE_CLIENT_ID")) {
      this.providers.set("google", {
        clientId: this.configService.get<string>("OAUTH_GOOGLE_CLIENT_ID")!,
        clientSecret: this.configService.get<string>(
          "OAUTH_GOOGLE_CLIENT_SECRET",
        )!,
        authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth",
        tokenUrl: "https://oauth2.googleapis.com/token",
        userInfoUrl: "https://www.googleapis.com/oauth2/v2/userinfo",
        scopes: ["openid", "email", "profile"],
      });
    }

    // GitHub OAuth
    if (this.configService.get<string>("OAUTH_GITHUB_CLIENT_ID")) {
      this.providers.set("github", {
        clientId: this.configService.get<string>("OAUTH_GITHUB_CLIENT_ID")!,
        clientSecret: this.configService.get<string>(
          "OAUTH_GITHUB_CLIENT_SECRET",
        )!,
        authorizationUrl: "https://github.com/login/oauth/authorize",
        tokenUrl: "https://github.com/login/oauth/access_token",
        userInfoUrl: "https://api.github.com/user",
        scopes: ["user:email", "read:user"],
      });
    }

    this.logger.log(`Initialized ${this.providers.size} OAuth providers`);
  }

  /**
   * Check if OAuth strategy is enabled
   */
  get isEnabled(): boolean {
    return (
      this.configService.get<boolean>("AUTH_OAUTH_ENABLED", false) &&
      this.providers.size > 0
    );
  }

  /**
   * Get available OAuth providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Authenticate using OAuth
   * @param credentials - OAuth credentials containing provider and code
   * @returns Authentication result with JWT token
   */
  async authenticate(credentials: unknown): Promise<AuthResult> {
    const { provider, code } = credentials as OAuthCredentials;

    if (!provider || !code) {
      throw new BadRequestException(
        "Provider and authorization code are required",
      );
    }

    const providerConfig = this.providers.get(provider);
    if (!providerConfig) {
      throw new BadRequestException(`Unsupported OAuth provider: ${provider}`);
    }

    // Exchange code for access token
    const accessToken = await this.exchangeCodeForToken(providerConfig, code);

    // Get user info from provider
    const userInfo = await this.getUserInfo(providerConfig, accessToken);

    // Find or create user
    const user = await this.findOrCreateUser(userInfo, provider);

    // Generate JWT token
    const payload: AuthPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role || "user",
      iat: Math.floor(Date.now() / 1000),
      type: "oauth",
    };

    const token = this.jwtService.sign(payload);

    this.logger.log(
      `User authenticated via OAuth (${provider}): ${user.email}`,
    );

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role || "user",
        type: "oauth",
      },
    };
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(
    config: OAuthProviderConfig,
    code: string,
  ): Promise<string> {
    try {
      const response = await fetch(config.tokenUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          Accept: "application/json",
        },
        body: new URLSearchParams({
          client_id: config.clientId,
          client_secret: config.clientSecret,
          code,
          grant_type: "authorization_code",
          redirect_uri: this.configService.get<string>(
            "OAUTH_REDIRECT_URI",
            "http://localhost:3000/auth/oauth/callback",
          ),
        }),
      });

      if (!response.ok) {
        throw new UnauthorizedException(
          "Failed to exchange OAuth code for token",
        );
      }

      const data = await response.json();
      return data.access_token;
    } catch (error) {
      this.logger.error("OAuth token exchange failed", error);
      throw new UnauthorizedException("OAuth authentication failed");
    }
  }

  /**
   * Get user info from OAuth provider
   */
  private async getUserInfo(
    config: OAuthProviderConfig,
    accessToken: string,
  ): Promise<OAuthUserInfo> {
    try {
      const response = await fetch(config.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      if (!response.ok) {
        throw new UnauthorizedException(
          "Failed to fetch user info from OAuth provider",
        );
      }

      const data = await response.json();
      return {
        id: data.id || data.sub,
        email: data.email,
        name: data.name || data.login,
        picture: data.picture || data.avatar_url,
      };
    } catch (error) {
      this.logger.error("OAuth user info fetch failed", error);
      throw new UnauthorizedException("OAuth authentication failed");
    }
  }

  /**
   * Find existing user or create new one
   */
  private async findOrCreateUser(
    userInfo: OAuthUserInfo,
    provider: string,
  ): Promise<User> {
    // Try to find user by email
    let user = await this.userRepository.findOne({
      where: { email: userInfo.email },
    });

    if (!user) {
      // Create new user
      user = this.userRepository.create({
        email: userInfo.email,
        username: userInfo.name || `oauth_${userInfo.id}`,
        walletAddress: `oauth_${provider}_${userInfo.id}`,
        emailVerified: true,
      });
      await this.userRepository.save(user);
      this.logger.log(`Created new user from OAuth: ${userInfo.email}`);
    }

    return user;
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
