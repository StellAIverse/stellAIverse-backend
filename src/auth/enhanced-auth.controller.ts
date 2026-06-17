import {
  Controller,
  Post,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
} from "@nestjs/swagger";
import { JwtAuthGuard } from "./jwt.guard";
import { EnhancedAuthService } from "./enhanced-auth.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";
import {
  TwoFactorSetupDto,
  TwoFactorVerifyDto,
  RefreshTokenDto,
} from "./dto/kyc.dto";

@ApiTags("Enhanced Authentication & KYC")
@Controller("api/auth")
export class EnhancedAuthController {
  constructor(private readonly enhancedAuthService: EnhancedAuthService) {}

  @Post("register")
  @ApiOperation({
    summary: "Register a new user account",
    description:
      "Create a new user account with email and password authentication",
  })
  @ApiResponse({
    status: 201,
    description: "User registered successfully",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
        user: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            username: { type: "string" },
            role: { type: "string" },
            kycStatus: { type: "string" },
          },
        },
        requiresTwoFactor: { type: "boolean" },
      },
    },
  })
  @ApiResponse({ status: 400, description: "Bad request" })
  @ApiResponse({ status: 409, description: "User already exists" })
  async register(@Body() registerDto: RegisterDto, @Request() req) {
    return this.enhancedAuthService.register(
      registerDto,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Post("login")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Login with email and password",
    description: "Authenticate user with email and password, returns tokens",
  })
  @ApiResponse({
    status: 200,
    description: "Login successful",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
        user: {
          type: "object",
          properties: {
            id: { type: "string" },
            email: { type: "string" },
            username: { type: "string" },
            role: { type: "string" },
            kycStatus: { type: "string" },
          },
        },
        requiresTwoFactor: { type: "boolean" },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Invalid credentials" })
  async login(@Body() loginDto: LoginDto, @Request() req) {
    return this.enhancedAuthService.login(
      loginDto,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Post("refresh")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Refresh access token",
    description: "Exchange refresh token for new access token",
  })
  @ApiResponse({
    status: 200,
    description: "Token refreshed successfully",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
      },
    },
  })
  @ApiResponse({ status: 401, description: "Invalid refresh token" })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto, @Request() req) {
    return this.enhancedAuthService.refreshToken(
      refreshTokenDto,
      req.ip,
      req.headers["user-agent"],
    );
  }

  @Post("2fa/setup")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Setup two-factor authentication",
    description: "Initialize TOTP-based two-factor authentication setup",
  })
  @ApiResponse({
    status: 200,
    description: "2FA setup initialized",
    schema: {
      type: "object",
      properties: {
        secret: { type: "string" },
        qrCodeUrl: { type: "string" },
        backupCodes: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
  })
  async setupTwoFactor(@Request() req, @Body() setupDto: TwoFactorSetupDto) {
    return this.enhancedAuthService.setupTwoFactor(req.user.sub, setupDto);
  }

  @Post("2fa/verify-setup")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Verify 2FA setup",
    description: "Complete 2FA setup by verifying the TOTP code",
  })
  @ApiResponse({
    status: 200,
    description: "2FA setup verified successfully",
  })
  async verifyTwoFactorSetup(@Request() req, @Body() body: { code: string }) {
    return this.enhancedAuthService.verifyTwoFactorSetup(
      req.user.sub,
      body.code,
    );
  }

  @Post("2fa/verify")
  @ApiOperation({
    summary: "Verify 2FA for login",
    description: "Complete login by verifying 2FA code",
  })
  @ApiResponse({
    status: 200,
    description: "2FA verified, login complete",
    schema: {
      type: "object",
      properties: {
        accessToken: { type: "string" },
        refreshToken: { type: "string" },
      },
    },
  })
  async verifyTwoFactorLogin(
    @Body() verifyDto: TwoFactorVerifyDto & { userId: string },
  ) {
    return this.enhancedAuthService.verifyTwoFactorLogin(
      verifyDto.userId,
      verifyDto,
    );
  }

  @Post("2fa/disable")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Disable two-factor authentication",
    description: "Disable 2FA for the current user account",
  })
  @ApiResponse({
    status: 200,
    description: "2FA disabled successfully",
  })
  async disableTwoFactor(@Request() req, @Body() body: { password: string }) {
    return this.enhancedAuthService.disableTwoFactor(
      req.user.sub,
      body.password,
    );
  }
}
