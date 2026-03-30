import {
  Injectable,
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import * as bcrypt from "bcrypt";
import { JwtService } from "@nestjs/jwt";
import { User } from "../user/entities/user.entity";
import { RegisterDto, LoginDto } from "./dto/auth.dto";
import { ReferralService } from "../referral/referral.service";

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly jwtService: JwtService,
    private readonly referralService: ReferralService,
  ) {}

  async register(
    registerDto: RegisterDto,
    clientIp?: string,
  ): Promise<{ token: string; user: Partial<User> }> {
    const { email, password, username } = registerDto;

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
      emailVerified: false, // Could implement email verification later
    });

    await this.userRepository.save(user);

    // ✅ Track Referral if code provided
    if (registerDto.referralCode) {
      await this.referralService.trackReferral(
        user.id,
        registerDto.referralCode,
        clientIp || "unknown",
        user.email!,
      );
    }

    // ✅ Generate Referral Code for the brand new user
    await this.referralService.createReferralCode(user.id);

    // Generate JWT token
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
    };
    const token = this.jwtService.sign(payload);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }

  async login(
    loginDto: LoginDto,
  ): Promise<{ token: string; user: Partial<User> }> {
    const { email, password } = loginDto;

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
    const payload = {
      sub: user.id,
      email: user.email,
      username: user.username,
    };
    const token = this.jwtService.sign(payload);

    return {
      token,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }

  async validateUser(userId: string): Promise<User | null> {
    return this.userRepository.findOne({ where: { id: userId } });
  }

  async getAuthStatus(
    user: User,
  ): Promise<{ isAuthenticated: boolean; user: Partial<User> }> {
    return {
      isAuthenticated: true,
      user: {
        id: user.id,
        email: user.email,
        username: user.username,
        role: user.role,
      },
    };
  }
}
