import { Test, TestingModule } from "@nestjs/testing";
import { AuthService } from "./auth.service";
import { JwtService } from "@nestjs/jwt";
import { getRepositoryToken } from "@nestjs/typeorm";
import { User, UserRole } from "../user/entities/user.entity";
import { Repository } from "typeorm";
import {
  ConflictException,
  UnauthorizedException,
  BadRequestException,
} from "@nestjs/common";

// Mock bcrypt
jest.mock("bcrypt", () => ({
  hash: jest.fn(),
  compare: jest.fn(),
}));

import * as bcrypt from "bcrypt";

describe("AuthService", () => {
  let service: AuthService;
  let jwtService: JwtService;
  let userRepository: Repository<User>;

  const mockUser: User = {
    id: "123",
    username: "testuser",
    walletAddress: "email_test@example.com",
    email: "test@example.com",
    password: "hashedpassword",
    emailVerified: false,
    role: UserRole.USER,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockJwtService = {
    sign: jest.fn(),
  };

  const mockUserRepository = {
    findOne: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get<JwtService>(JwtService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));

    // Reset mocks
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("register", () => {
    it("should register a new user successfully", async () => {
      const registerDto = {
        email: "test@example.com",
        password: "password123",
        username: "testuser",
      };

      mockUserRepository.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue("hashedpassword");
      mockUserRepository.create.mockReturnValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);
      mockJwtService.sign.mockReturnValue("jwt-token");

      const result = await service.register(registerDto);

      expect(result).toEqual({
        token: "jwt-token",
        user: {
          id: "123",
          email: "test@example.com",
          username: "testuser",
          role: UserRole.USER,
        },
      });
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: [{ email: "test@example.com" }, { username: "testuser" }],
      });
      expect(bcrypt.hash).toHaveBeenCalledWith("password123", 12);
    });

    it("should throw ConflictException if email already exists", async () => {
      const registerDto = {
        email: "test@example.com",
        password: "password123",
        username: "testuser",
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });

    it("should throw ConflictException if username already exists", async () => {
      const registerDto = {
        email: "different@example.com",
        password: "password123",
        username: "testuser",
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await expect(service.register(registerDto)).rejects.toThrow(
        ConflictException,
      );
    });
  });

  describe("login", () => {
    it("should login user successfully", async () => {
      const loginDto = {
        email: "test@example.com",
        password: "password123",
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      mockJwtService.sign.mockReturnValue("jwt-token");

      const result = await service.login(loginDto);

      expect(result).toEqual({
        token: "jwt-token",
        user: {
          id: "123",
          email: "test@example.com",
          username: "testuser",
          role: UserRole.USER,
        },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(
        "password123",
        "hashedpassword",
      );
    });

    it("should throw UnauthorizedException for invalid email", async () => {
      const loginDto = {
        email: "nonexistent@example.com",
        password: "password123",
      };

      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });

    it("should throw BadRequestException for wallet-only user", async () => {
      const loginDto = {
        email: "test@example.com",
        password: "password123",
      };

      const walletUser = { ...mockUser, password: null };
      mockUserRepository.findOne.mockResolvedValue(walletUser);

      await expect(service.login(loginDto)).rejects.toThrow(
        BadRequestException,
      );
    });

    it("should throw UnauthorizedException for invalid password", async () => {
      const loginDto = {
        email: "test@example.com",
        password: "wrongpassword",
      };

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(loginDto)).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe("validateUser", () => {
    it("should return user if found", async () => {
      mockUserRepository.findOne.mockResolvedValue(mockUser);

      const result = await service.validateUser("123");

      expect(result).toEqual(mockUser);
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: "123" },
      });
    });

    it("should return null if user not found", async () => {
      mockUserRepository.findOne.mockResolvedValue(null);

      const result = await service.validateUser("123");

      expect(result).toBeNull();
    });
  });

  describe("getAuthStatus", () => {
    it("should return auth status for authenticated user", async () => {
      const result = await service.getAuthStatus(mockUser);

      expect(result).toEqual({
        isAuthenticated: true,
        user: {
          id: "123",
          email: "test@example.com",
          username: "testuser",
          role: UserRole.USER,
        },
      });
    });
  });
});
