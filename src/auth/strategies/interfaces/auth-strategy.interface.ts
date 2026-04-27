/**
 * Interface for authentication strategies
 * Each strategy must implement this interface to be registered
 */
export interface AuthStrategy {
  /** Unique identifier for the strategy */
  readonly name: string;

  /** Whether the strategy is enabled */
  readonly isEnabled: boolean;

  /**
   * Authenticate using this strategy
   * @param credentials - Strategy-specific credentials
   * @returns Authentication result with token and user info
   */
  authenticate(credentials: unknown): Promise<AuthResult>;

  /**
   * Validate a token issued by this strategy
   * @param token - The token to validate
   * @returns Validated user payload or null
   */
  validateToken(token: string): Promise<AuthPayload | null>;
}

/**
 * Result of successful authentication
 */
export interface AuthResult {
  /** JWT access token */
  token: string;

  /** User information */
  user: AuthUser;

  /** Optional refresh token */
  refreshToken?: string;
}

/**
 * User information returned after authentication
 */
export interface AuthUser {
  /** User ID */
  id?: string;

  /** Wallet address (for wallet auth) */
  address?: string;

  /** User email */
  email?: string;

  /** Username */
  username?: string;

  /** User role */
  role: string;

  /** Authentication type */
  type: AuthType;
}

/**
 * Payload contained in JWT token
 */
export interface AuthPayload {
  /** User ID */
  sub?: string;

  /** Wallet address */
  address?: string;

  /** User email */
  email?: string;

  /** Username */
  username?: string;

  /** User role */
  role: string;

  /** User roles array */
  roles?: string[];

  /** Issued at timestamp */
  iat: number;

  /** Expiration timestamp */
  exp?: number;

  /** Authentication type */
  type: AuthType;
}

/**
 * Authentication types
 */
export type AuthType = "wallet" | "traditional" | "oauth" | "api-key";

/**
 * Configuration for authentication strategies
 */
export interface AuthStrategyConfig {
  /** Strategy name */
  name: string;

  /** Whether the strategy is enabled */
  enabled: boolean;

  /** Strategy-specific configuration */
  options?: Record<string, unknown>;
}

/**
 * Wallet authentication credentials
 */
export interface WalletCredentials {
  /** Challenge message */
  message: string;

  /** Signed signature */
  signature: string;
}

/**
 * Traditional authentication credentials
 */
export interface TraditionalCredentials {
  /** User email */
  email: string;

  /** User password */
  password: string;
}

/**
 * OAuth authentication credentials
 */
export interface OAuthCredentials {
  /** OAuth provider */
  provider: string;

  /** OAuth authorization code */
  code: string;

  /** Optional state parameter */
  state?: string;
}

/**
 * API Key authentication credentials
 */
export interface ApiKeyCredentials {
  /** API key */
  apiKey: string;

  /** API secret */
  apiSecret: string;
}
