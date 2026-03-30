import {
  Injectable,
  Logger,
  UnauthorizedException,
  BadRequestException,
  ConflictException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import {
  AuthStrategy,
  AuthResult,
  AuthPayload,
  TraditionalCredentials,
} from "../interfaces/auth-strategy.interface";
import { User } from "../../../user/entities/user.entity";

/**
 * Traditional email/password authentication strategy
 */
@Injectable()
export class TraditionalStrategy implements AuthStrategy {
  readonly name = "traditional";
  private readonly logger = new Logger(TraditionalStrategy.name);

  constructor(
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Check if traditional strategy is enabled
   */
  get isEnabled(): boolean {
    return this.configService.get<boolean>("AUTH_TRADITIONAL_ENABLED", true);
  }

  /**
   * Authenticate using email and password
   * @param credentials - Traditional credentials containing email and password
   * @returns Authentication result with JWT token
   */
  async authenticate(credentials: unknown): Promise<AuthResult> {
    const { email, password } = credentials as TraditionalCredentials;

    if (!email || !password) {
      throw new BadRequestException("Email and password are required");
    }

    // Find user by email
    const user = await this.userRepository.findOne({ where: { email } });
    if (!user) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Check if user has a password (traditional auth user)
    if (!user.password) {
      throw new BadRequestException(
        "This account uses wallet authentication. Please use wallet login.",
      );
    }

    // Verify password
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      throw new UnauthorizedException("Invalid credentials");
    }

    // Generate JWT token
    const payload: AuthPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role || "user",
      iat: Math.floor(Date.now() / 1000),
      type: "traditional",
    };

    const token = this.jwtService.sign(payload);

    this.logger.log(`User authenticated via traditional auth: ${email}`);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role || "user",
        type: "traditional",
      },
    };
  }

  /**
   * Register a new user with email and password
   * @param email - User email
   * @param password - User password
   * @param username - User username
   * @returns Authentication result with JWT token
   */
  async register(
    email: string,
    password: string,
    username: string,
  ): Promise<AuthResult> {
    // Check if user already exists
    const existingUser = await this.userRepository.findOne({
      where: [{ email }, { username }],
    });

    if (existingUser) {
      if (existingUser.email === email) {
        throw new ConflictException("Email already registered");
      }
      if (existingUser.username === username) {
        throw new ConflictException("Username already taken");
      }
    }

    // Hash password
    const saltRounds = 12;
    const hashedPassword = await bcrypt.hash(password, saltRounds);

    // Create user
    const user = this.userRepository.create({
      email,
      password: hashedPassword,
      username,
      walletAddress: `email_${email}`, // Generate a pseudo wallet address for email users
      emailVerified: false,
    });

    await this.userRepository.save(user);

    // Generate JWT token
    const payload: AuthPayload = {
      sub: user.id,
      email: user.email,
      username: user.username,
      role: user.role || "user",
      iat: Math.floor(Date.now() / 1000),
      type: "traditional",
    };

    const token = this.jwtService.sign(payload);

    this.logger.log(`User registered via traditional auth: ${email}`);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role || "user",
        type: "traditional",
      },
    };
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
