import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  Request,
  HttpCode,
  HttpStatus,
  Param,
  Delete,
  UploadedFile,
  UseInterceptors,
} from "@nestjs/common";
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiConsumes,
  ApiBody,
} from "@nestjs/swagger";
import { FileInterceptor } from "@nestjs/platform-express";
import { JwtAuthGuard } from "./jwt.guard";
import { RolesGuard } from "../common/guard/roles.guard";
import { Roles, Role } from "../common/decorators/roles.decorator";
import { EnhancedAuthService } from "./enhanced-auth.service";
import { KycService } from "../compliance/kyc.service";
import { RegisterDto, LoginDto } from "./dto/auth.dto";
import {
  KycSubmitDto,
  KycDocumentUploadDto,
  KycReviewDto,
  TwoFactorSetupDto,
  TwoFactorVerifyDto,
  RefreshTokenDto,
} from "./dto/kyc.dto";

@ApiTags("Enhanced Authentication & KYC")
@Controller("api/auth")
export class EnhancedAuthController {
  constructor(
    private readonly enhancedAuthService: EnhancedAuthService,
    private readonly kycService: KycService,
  ) {}

  @Post("register")
  @ApiOperation({
    summary: "Register a new user account",
    description: "Create a new user account with email and password authentication",
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
  async register(
    @Body() registerDto: RegisterDto,
    @Request() req,
  ) {
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
  async login(
    @Body() loginDto: LoginDto,
    @Request() req,
  ) {
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
  async setupTwoFactor(
    @Request() req,
    @Body() setupDto: TwoFactorSetupDto,
  ) {
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
  async verifyTwoFactorSetup(
    @Request() req,
    @Body() body: { code: string },
  ) {
    return this.enhancedAuthService.verifyTwoFactorSetup(req.user.sub, body.code);
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
  async disableTwoFactor(
    @Request() req,
    @Body() body: { password: string },
  ) {
    return this.enhancedAuthService.disableTwoFactor(req.user.sub, body.password);
  }
}

@ApiTags("KYC Management")
@Controller("api/kyc")
export class KycController {
  constructor(private readonly kycService: KycService) {}

  @Post("submit")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Submit KYC application",
    description: "Submit KYC profile information for verification",
  })
  @ApiResponse({
    status: 201,
    description: "KYC submitted successfully",
  })
  @ApiResponse({ status: 400, description: "Invalid KYC data" })
  async submitKyc(
    @Request() req,
    @Body() kycSubmitDto: KycSubmitDto,
  ) {
    return this.kycService.submitKyc(req.user.sub, kycSubmitDto);
  }

  @Post("document")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @UseInterceptors(FileInterceptor("file"))
  @ApiConsumes("multipart/form-data")
  @ApiBody({
    schema: {
      type: "object",
      properties: {
        documentType: {
          type: "string",
          enum: ["passport", "drivers_license", "national_id", "utility_bill", "bank_statement", "selfie"],
        },
        file: {
          type: "string",
          format: "binary",
        },
      },
    },
  })
  @ApiOperation({
    summary: "Upload KYC document",
    description: "Upload and encrypt a KYC document",
  })
  @ApiResponse({
    status: 201,
    description: "Document uploaded successfully",
  })
  async uploadDocument(
    @Request() req,
    @Body() body: { documentType: string },
    @UploadedFile() file: Express.Multer.File,
  ) {
    return this.kycService.uploadDocument(
      req.user.sub,
      body.documentType as any,
      file,
    );
  }

  @Get("status")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get KYC status",
    description: "Get current KYC status and information",
  })
  @ApiResponse({
    status: 200,
    description: "KYC status retrieved successfully",
  })
  async getKycStatus(@Request() req) {
    return this.kycService.getKycStatus(req.user.sub);
  }

  @Get("download/:documentId")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Download KYC document",
    description: "Download a previously uploaded KYC document",
  })
  @ApiResponse({
    status: 200,
    description: "Document downloaded successfully",
  })
  async downloadDocument(
    @Request() req,
    @Param("documentId") documentId: string,
  ) {
    const buffer = await this.kycService.downloadDocument(req.user.sub, documentId);
    return buffer;
  }

  // Admin/KYC Operator endpoints
  @Get("pending")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.KYC_OPERATOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Get pending KYC submissions",
    description: "Get all pending KYC submissions for review (KYC Operators only)",
  })
  @ApiResponse({
    status: 200,
    description: "Pending KYC submissions retrieved",
  })
  async getPendingSubmissions() {
    return this.kycService.getPendingKycSubmissions();
  }

  @Post(":profileId/review")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.KYC_OPERATOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Review KYC submission",
    description: "Approve or reject a KYC submission (KYC Operators only)",
  })
  @ApiResponse({
    status: 200,
    description: "KYC review completed",
  })
  async reviewKyc(
    @Param("profileId") profileId: string,
    @Request() req,
    @Body() reviewDto: KycReviewDto,
  ) {
    return this.kycService.reviewKyc(profileId, req.user.sub, reviewDto);
  }

  @Post(":profileId/move-to-review")
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(Role.KYC_OPERATOR, Role.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Move KYC to review",
    description: "Move a pending KYC submission to in-review status",
  })
  @ApiResponse({
    status: 200,
    description: "KYC moved to review",
  })
  async moveToReview(
    @Param("profileId") profileId: string,
    @Request() req,
  ) {
    return this.kycService.moveToReview(profileId, req.user.sub);
  }

  @Delete("user-data")
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Delete user data (GDPR)",
    description: "Delete all user data including KYC information",
  })
  @ApiResponse({
    status: 200,
    description: "User data deleted successfully",
  })
  async deleteUserData(@Request() req) {
    await this.kycService.deleteUserData(req.user.sub);
    return { message: "User data deleted successfully" };
  }
}</content>
<parameter name="filePath">/workspaces/stellAIverse-backend/src/auth/enhanced-auth.controller.ts