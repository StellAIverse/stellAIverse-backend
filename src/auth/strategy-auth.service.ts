import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { StrategyRegistry } from "./strategies/strategy.registry";
import {
  AuthStrategy,
  AuthResult,
  AuthPayload,
  WalletCredentials,
  TraditionalCredentials,
  OAuthCredentials,
  ApiKeyCredentials,
} from "./strategies/interfaces/auth-strategy.interface";

/**
 * Service for managing strategy-based authentication
 * Provides a unified interface for all authentication strategies
 */
@Injectable()
export class StrategyAuthService {
  private readonly logger = new Logger(StrategyAuthService.name);

  constructor(private readonly strategyRegistry: StrategyRegistry) {}

  /**
   * Authenticate using a specific strategy
   * @param strategyName - The name of the strategy to use
   * @param credentials - Strategy-specific credentials
   * @returns Authentication result
   */
  async authenticate(
    strategyName: string,
    credentials: unknown,
  ): Promise<AuthResult> {
    const strategy = this.strategyRegistry.get(strategyName);

    if (!strategy) {
      throw new BadRequestException(
        `Authentication strategy '${strategyName}' is not available`,
      );
    }

    if (!strategy.isEnabled) {
      throw new BadRequestException(
        `Authentication strategy '${strategyName}' is disabled`,
      );
    }

    this.logger.log(`Authenticating using strategy: ${strategyName}`);
    return strategy.authenticate(credentials);
  }

  /**
   * Authenticate using wallet signature
   * @param credentials - Wallet credentials
   * @returns Authentication result
   */
  async authenticateWallet(
    credentials: WalletCredentials,
  ): Promise<AuthResult> {
    return this.authenticate("wallet", credentials);
  }

  /**
   * Authenticate using email/password
   * @param credentials - Traditional credentials
   * @returns Authentication result
   */
  async authenticateTraditional(
    credentials: TraditionalCredentials,
  ): Promise<AuthResult> {
    return this.authenticate("traditional", credentials);
  }

  /**
   * Authenticate using OAuth
   * @param credentials - OAuth credentials
   * @returns Authentication result
   */
  async authenticateOAuth(credentials: OAuthCredentials): Promise<AuthResult> {
    return this.authenticate("oauth", credentials);
  }

  /**
   * Authenticate using API key
   * @param credentials - API key credentials
   * @returns Authentication result
   */
  async authenticateApiKey(
    credentials: ApiKeyCredentials,
  ): Promise<AuthResult> {
    return this.authenticate("api-key", credentials);
  }

  /**
   * Validate a JWT token
   * @param token - The JWT token to validate
   * @returns The decoded payload or null if invalid
   */
  async validateToken(token: string): Promise<AuthPayload | null> {
    const strategies = this.strategyRegistry.getAll();

    for (const strategy of strategies) {
      try {
        const payload = await strategy.validateToken(token);
        if (payload) {
          return payload;
        }
      } catch (error) {
        // Continue to next strategy
        continue;
      }
    }

    return null;
  }

  /**
   * Get all available authentication strategies
   * @returns Array of available strategy names
   */
  getAvailableStrategies(): string[] {
    return this.strategyRegistry.getEnabledStrategies();
  }

  /**
   * Check if a strategy is available
   * @param strategyName - The strategy name
   * @returns True if the strategy is available
   */
  isStrategyAvailable(strategyName: string): boolean {
    return this.strategyRegistry.has(strategyName);
  }

  /**
   * Get a specific strategy
   * @param strategyName - The strategy name
   * @returns The strategy instance
   */
  getStrategy(strategyName: string): AuthStrategy | undefined {
    return this.strategyRegistry.get(strategyName);
  }
}
