import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { JwtService } from "@nestjs/jwt";
import { User } from "../../user/entities/user.entity";
import { RefreshToken, TwoFactorAuth } from "../../auth/entities/auth.entity";
import { EnhancedAuthService } from "../../auth/enhanced-auth.service";
import { EmailService } from "../../auth/email.service";
import { RegisterDto, LoginDto } from "../../auth/dto/auth.dto";
import { KycStatus } from "../../user/entities/user.entity";

describe("EnhancedAuthService", () => {
  let service: EnhancedAuthService;
  let userRepository: Repository<User>;
  let refreshTokenRepository: Repository<RefreshToken>;
  let twoFactorRepository: Repository<TwoFactorAuth>;
  let jwtService: JwtService;
  let emailService: EmailService;

  const mockUser = {
    id: "user-id",
    email: "test@example.com",
    username: "testuser",
    password: "hashedpassword",
    walletAddress: "email_test@example.com",
    role: "user",
    kycStatus: KycStatus.UNVERIFIED,
    isActive: true,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EnhancedAuthService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(TwoFactorAuth),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: {
            sendEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<EnhancedAuthService>(EnhancedAuthService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    refreshTokenRepository = module.get<Repository<RefreshToken>>(
      getRepositoryToken(RefreshToken),
    );
    twoFactorRepository = module.get<Repository<TwoFactorAuth>>(
      getRepositoryToken(TwoFactorAuth),
    );
    jwtService = module.get<JwtService>(JwtService);
    emailService = module.get<EmailService>(EmailService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("register", () => {
    it("should register a new user successfully", async () => {
      const registerDto: RegisterDto = {
        email: "test@example.com",
        password: "password123",
        username: "testuser",
      };

      jest.spyOn(userRepository, "findOne").mockResolvedValue(null);
      jest.spyOn(userRepository, "create").mockReturnValue(mockUser as any);
      jest.spyOn(userRepository, "save").mockResolvedValue(mockUser as any);
      jest.spyOn(jwtService, "sign").mockReturnValue("access-token");
      jest.spyOn(refreshTokenRepository, "create").mockReturnValue({} as any);
      jest.spyOn(refreshTokenRepository, "save").mockResolvedValue({} as any);

      const result = await service.register(registerDto, "127.0.0.1", "test-agent");

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result.user.email).toBe(registerDto.email);
    });

    it("should throw error if email already exists", async () => {
      const registerDto: RegisterDto = {
        email: "test@example.com",
        password: "password123",
      };

      jest.spyOn(userRepository, "findOne").mockResolvedValue(mockUser as any);

      await expect(
        service.register(registerDto, "127.0.0.1", "test-agent"),
      ).rejects.toThrow("Email already registered");
    });
  });

  describe("login", () => {
    it("should login user successfully", async () => {
      const loginDto: LoginDto = {
        email: "test@example.com",
        password: "password123",
      };

      jest.spyOn(userRepository, "findOne").mockResolvedValue(mockUser as any);
      jest.spyOn(jwtService, "sign").mockReturnValue("access-token");
      jest.spyOn(refreshTokenRepository, "create").mockReturnValue({} as any);
      jest.spyOn(refreshTokenRepository, "save").mockResolvedValue({} as any);

      // Mock bcrypt.compare
      jest.mock("bcrypt", () => ({
        compare: jest.fn().mockResolvedValue(true),
      }));

      const result = await service.login(loginDto, "127.0.0.1", "test-agent");

      expect(result).toHaveProperty("accessToken");
      expect(result).toHaveProperty("refreshToken");
      expect(result.user.email).toBe(loginDto.email);
    });

    it("should throw error for invalid credentials", async () => {
      const loginDto: LoginDto = {
        email: "test@example.com",
        password: "wrongpassword",
      };

      jest.spyOn(userRepository, "findOne").mockResolvedValue(mockUser as any);

      // Mock bcrypt.compare
      jest.mock("bcrypt", () => ({
        compare: jest.fn().mockResolvedValue(false),
      }));

      await expect(
        service.login(loginDto, "127.0.0.1", "test-agent"),
      ).rejects.toThrow("Invalid credentials");
    });
  });

  describe("setupTwoFactor", () => {
    it("should setup 2FA successfully", async () => {
      jest.spyOn(userRepository, "findOne").mockResolvedValue(mockUser as any);
      jest.spyOn(twoFactorRepository, "findOne").mockResolvedValue(null);
      jest.spyOn(twoFactorRepository, "create").mockReturnValue({} as any);
      jest.spyOn(twoFactorRepository, "save").mockResolvedValue({} as any);

      // Mock speakeasy
      jest.mock("speakeasy", () => ({
        generateSecret: jest.fn().mockReturnValue({
          base32: "SECRET",
          otpauth_url: "otpauth://totp/test",
        }),
      }));

      // Mock qrcode
      jest.mock("qrcode", () => ({
        toDataURL: jest.fn().mockResolvedValue("qr-code-url"),
      }));

      const result = await service.setupTwoFactor("user-id", { type: "totp" });

      expect(result).toHaveProperty("secret");
      expect(result).toHaveProperty("qrCodeUrl");
      expect(result).toHaveProperty("backupCodes");
    });
  });
});</content>
<parameter name="filePath">/workspaces/stellAIverse-backend/test/enhanced-auth.service.spec.ts