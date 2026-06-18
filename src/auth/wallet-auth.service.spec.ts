import { Test, TestingModule } from "@nestjs/testing";
import { WalletAuthService } from "./wallet-auth.service";
import { ChallengeService } from "./challenge.service";
import { JwtService } from "@nestjs/jwt";
import { getRepositoryToken } from "@nestjs/typeorm";
import { User, UserRole } from "../user/entities/user.entity";
import { Wallet } from "./entities/wallet.entity";
import { Repository } from "typeorm";
import {
  UnauthorizedException,
  BadRequestException,
  ConflictException,
  NotFoundException,
} from "@nestjs/common";

// Mock ethers
jest.mock("ethers", () => ({
  verifyMessage: jest.fn(),
}));

describe("WalletAuthService", () => {
  let service: WalletAuthService;
  let challengeService: ChallengeService;
  let jwtService: JwtService;
  let userRepository: Repository<User>;
  let walletRepository: Repository<Wallet>;
  let verifyMessage: jest.Mock;

  const mockUser = {
    id: "123",
    username: null,
    walletAddress: "0x1234567890abcdef1234567890abcdef12345678",
    email: "test@example.com",
    password: null,
    emailVerified: true,
    role: UserRole.USER,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as any;

  const mockChallengeService = {
    issueChallengeForAddress: jest.fn(),
    extractChallengeId: jest.fn(),
    consumeChallenge: jest.fn(),
  };

  const mockJwtService = {
    sign: jest.fn(),
    verify: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
  };

  const mockWalletRepository = {
    findOne: jest.fn(),
    find: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
    update: jest.fn(),
    delete: jest.fn(),
  };

  beforeEach(async () => {
    // Get the mocked verifyMessage
    verifyMessage = require("ethers").verifyMessage;

    // Reset all mocks
    mockUserRepository.findOne.mockReset();
    mockUserRepository.save.mockReset();
    mockUserRepository.create.mockReset();
    mockUserRepository.update.mockReset();

    mockWalletRepository.findOne.mockReset();
    mockWalletRepository.save.mockReset();
    mockWalletRepository.create.mockReset();
    mockWalletRepository.find.mockReset();
    mockWalletRepository.update.mockReset();
    mockWalletRepository.delete.mockReset();

    // Default implementations
    mockUserRepository.save.mockImplementation(async (u) => u);
    mockUserRepository.create.mockImplementation((u) => u);
    mockUserRepository.update.mockResolvedValue({});

    mockWalletRepository.save.mockImplementation(async (w) => w);
    mockWalletRepository.create.mockImplementation((w) => w);
    mockWalletRepository.find.mockResolvedValue([]);
    mockWalletRepository.update.mockResolvedValue({});

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        WalletAuthService,
        {
          provide: ChallengeService,
          useValue: mockChallengeService,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: getRepositoryToken(Wallet),
          useValue: mockWalletRepository,
        },
      ],
    }).compile();

    service = module.get<WalletAuthService>(WalletAuthService);
    challengeService = module.get<ChallengeService>(ChallengeService);
    jwtService = module.get<JwtService>(JwtService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    walletRepository = module.get<Repository<Wallet>>(
      getRepositoryToken(Wallet),
    );

    jest.resetAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("verifySignatureAndIssueToken", () => {
    const message = "Sign this challenge";
    const signature = "0x" + "1".repeat(130);
    const challengeId = "challenge-123";

    it("should verify signature and issue token successfully", async () => {
      mockChallengeService.extractChallengeId.mockReturnValue(challengeId);
      mockChallengeService.consumeChallenge.mockReturnValue({
        address: "0x1234567890abcdef1234567890abcdef12345678",
        timestamp: Date.now(),
      });
      verifyMessage.mockReturnValue(
        "0x1234567890abcdef1234567890abcdef12345678",
      );
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue("jwt-token");

      const result = await service.verifySignatureAndIssueToken(
        message,
        signature,
      );

      expect(result.token).toBe("jwt-token");
      expect(result.address).toBe("0x1234567890abcdef1234567890abcdef12345678");
    });
  });

  describe("linkWallet", () => {
    const currentUserId = "123";
    const newAddress = "0xabcdefabcdefabcdefabcdefabcdefabcdefabcd";
    const message = "Sign this message to prove ownership";
    const signature = "0x" + "1".repeat(130);
    const challengeId = "challenge-123";

    it("should successfully link a new wallet", async () => {
      mockChallengeService.extractChallengeId.mockReturnValue(challengeId);
      mockChallengeService.consumeChallenge.mockReturnValue({
        address: newAddress.toLowerCase(),
        timestamp: Date.now(),
      });
      verifyMessage.mockReturnValue(newAddress); // Mock signature verification
      mockWalletRepository.findOne.mockResolvedValue(null);
      mockWalletRepository.find.mockResolvedValue([]);
      mockWalletRepository.create.mockReturnValue({
        id: "wallet-1",
        address: newAddress.toLowerCase(),
        userId: currentUserId,
        type: "primary",
      });
      mockWalletRepository.save.mockResolvedValue({});

      const result = await service.linkWallet(
        currentUserId,
        newAddress,
        message,
        signature,
      );

      expect(result.message).toBe("Wallet successfully linked");
      expect(result.walletAddress).toBe(newAddress.toLowerCase());
      expect(mockWalletRepository.save).toHaveBeenCalled();
    });

    it("should throw ConflictException if new wallet is already in use", async () => {
      mockChallengeService.extractChallengeId.mockReturnValue(challengeId);
      mockChallengeService.consumeChallenge.mockReturnValue({
        address: newAddress.toLowerCase(),
        timestamp: Date.now(),
      });
      verifyMessage.mockReturnValue(newAddress); // Mock signature verification
      mockWalletRepository.findOne.mockResolvedValue({
        id: "wallet-abc",
        userId: "another-user",
      });

      await expect(
        service.linkWallet(currentUserId, newAddress, message, signature),
      ).rejects.toThrow(ConflictException);
    });

    it("should throw UnauthorizedException for invalid challenge", async () => {
      mockChallengeService.extractChallengeId.mockReturnValue(null);

      await expect(
        service.linkWallet(currentUserId, newAddress, message, signature),
      ).rejects.toThrow(UnauthorizedException);
    });

    it("should link a wallet without requiring a user lookup", async () => {
      mockChallengeService.extractChallengeId.mockReturnValue(challengeId);
      mockChallengeService.consumeChallenge.mockReturnValue({
        address: newAddress.toLowerCase(),
        timestamp: Date.now(),
      });
      verifyMessage.mockReturnValue(newAddress); // Mock signature verification
      mockWalletRepository.findOne.mockResolvedValue(null);
      mockWalletRepository.find.mockResolvedValue([]);
      mockWalletRepository.create.mockReturnValue({
        id: "wallet-1",
        address: newAddress.toLowerCase(),
        type: "primary",
      });
      mockWalletRepository.save.mockResolvedValue({});

      await expect(
        service.linkWallet(currentUserId, newAddress, message, signature),
      ).resolves.toMatchObject({ walletAddress: newAddress.toLowerCase() });
    });
  });

  describe("unlinkWallet", () => {
    const walletId = "wallet-123";
    const userId = "123";
    const walletAddress = "0x1234567890abcdef1234567890abcdef12345678";

    it("should successfully unlink wallet with multiple active wallets", async () => {
      mockWalletRepository.findOne.mockResolvedValue({
        id: walletId,
        userId,
        address: "0x123",
        isPrimary: false,
        status: "active",
      });

      mockWalletRepository.find.mockResolvedValue([
        { id: walletId, status: "active" },
        { id: "wallet-456", status: "active" },
      ]);

      const result = await service.unlinkWallet(userId, walletId);

      expect(result.message).toContain("successfully unlinked");
      expect(mockWalletRepository.save).toHaveBeenCalled();
    });

    it("should successfully unlink wallet with verified email", async () => {
      mockWalletRepository.findOne.mockResolvedValueOnce({
        id: "wallet-1",
        userId: "123",
        address: walletAddress,
        isPrimary: false,
      });
      mockWalletRepository.find.mockResolvedValue([
        { id: "wallet-1" },
        { id: "wallet-2" },
      ]);
      mockWalletRepository.save.mockResolvedValue({});

      const result = await service.unlinkWallet("123", "wallet-1");

      expect(result.message).toContain("Wallet successfully unlinked");
      expect(mockWalletRepository.findOne).toHaveBeenCalledWith({
        where: { id: "wallet-1", userId: "123" },
      });
    });

    it("should successfully unlink the last wallet if email is verified", async () => {
      mockWalletRepository.findOne.mockResolvedValue({
        id: walletId,
        userId,
        address: "0x123",
        isPrimary: true,
        status: "active",
      });

      mockWalletRepository.find.mockResolvedValue([
        { id: walletId, status: "active" },
      ]);

      mockUserRepository.findOne.mockResolvedValue({
        id: userId,
        emailVerified: true,
      });

      const result = await service.unlinkWallet(userId, walletId);

      expect(result.message).toContain("successfully unlinked");
      expect(mockWalletRepository.save).toHaveBeenCalled();
    });

    it("should throw BadRequestException if unlinking last wallet and email is not verified", async () => {
      mockWalletRepository.findOne.mockResolvedValue({
        id: walletId,
        userId,
        address: "0x123",
        isPrimary: true,
        status: "active",
      });

      mockWalletRepository.find.mockResolvedValue([
        { id: walletId, status: "active" },
      ]);

      mockUserRepository.findOne.mockResolvedValue({
        id: userId,
        emailVerified: false,
      });

      await expect(service.unlinkWallet(userId, walletId)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException if email not verified", async () => {
      const unverifiedUser = { ...mockUser, emailVerified: false };
      mockWalletRepository.findOne.mockResolvedValueOnce({
        id: "wallet-1",
        userId: "123",
        address: walletAddress,
        isPrimary: false,
      });
      mockWalletRepository.find.mockResolvedValue([{ id: "wallet-1" }]);
      mockUserRepository.findOne.mockResolvedValue(unverifiedUser);

      await expect(service.unlinkWallet("123", "wallet-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw NotFoundException if wallet is not found", async () => {
      mockWalletRepository.findOne.mockResolvedValue(null);

      await expect(service.unlinkWallet(userId, walletId)).rejects.toThrow(
        NotFoundException,
      );
    });

    it("should throw NotFoundException if wallet is not found (alternative)", async () => {
      mockWalletRepository.findOne.mockResolvedValue(null);

      await expect(
        service.unlinkWallet("123", "missing-wallet"),
      ).rejects.toThrow(NotFoundException);
    });

    it("should throw BadRequestException if user not found", async () => {
      mockWalletRepository.findOne.mockResolvedValueOnce({
        id: "wallet-1",
        userId: "123",
        address: walletAddress,
        isPrimary: false,
      });
      mockWalletRepository.find.mockResolvedValue([{ id: "wallet-1" }]);
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.unlinkWallet("123", "wallet-1")).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw BadRequestException if email is null", async () => {
      const noEmailUser = { ...mockUser, email: null, emailVerified: false };
      mockWalletRepository.findOne.mockResolvedValueOnce({
        id: "wallet-1",
        userId: "123",
        address: walletAddress,
        isPrimary: false,
      });
      mockWalletRepository.find.mockResolvedValue([{ id: "wallet-1" }]);
      mockUserRepository.findOne.mockResolvedValue(noEmailUser);

      await expect(service.unlinkWallet("123", "wallet-1")).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("recoverWallet", () => {
    const email = "test@example.com";
    const recoveryToken = "a".repeat(64);
    const challengeMessage = "Sign this challenge";

    it("should successfully initiate wallet recovery", async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockChallengeService.issueChallengeForAddress.mockReturnValue(
        challengeMessage,
      );

      const result = await service.recoverWallet(email, recoveryToken);

      expect(result.message).toContain("Recovery initiated");
      expect(result.walletAddress).toBe(mockUser.walletAddress);
      expect(result.challenge).toBe(challengeMessage);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { email: email.toLowerCase(), emailVerified: true },
      });
    });

    it("should throw BadRequestException if user not found", async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.recoverWallet(email, recoveryToken)).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe("validateToken", () => {
    it("should successfully validate a valid token", () => {
      const token = "valid.jwt.token";
      const payload = {
        address: mockUser.walletAddress,
        email: mockUser.email,
        role: mockUser.role,
        iat: Math.floor(Date.now() / 1000),
      };
      mockJwtService.verify.mockReturnValue(payload);

      const result = service.validateToken(token);

      expect(result).toEqual(payload);
      expect(mockJwtService.verify).toHaveBeenCalledWith(token);
    });

    it("should throw UnauthorizedException for invalid token", () => {
      const token = "invalid.token";
      mockJwtService.verify.mockImplementation(() => {
        throw new Error("Invalid token");
      });

      expect(() => service.validateToken(token)).toThrow(UnauthorizedException);
    });
  });
});
