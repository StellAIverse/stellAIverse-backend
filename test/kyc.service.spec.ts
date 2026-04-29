import { Test, TestingModule } from "@nestjs/testing";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { KycService } from "../src/compliance/kyc.service";
import { KycProfile, KycDocument, KycStatusHistory, KycStatus } from "../src/compliance/entities/kyc.entity";
import { User } from "../src/user/entities/user.entity";
import { KycSubmitDto } from "../src/auth/dto/kyc.dto";
import { NotificationService } from "../src/notification/notification.service";

describe("KycService", () => {
  let service: KycService;
  let kycProfileRepository: Repository<KycProfile>;
  let kycDocumentRepository: Repository<KycDocument>;
  let kycStatusHistoryRepository: Repository<KycStatusHistory>;
  let userRepository: Repository<User>;
  let notificationService: NotificationService;

  const mockUser = {
    id: "user-id",
    email: "test@example.com",
    username: "testuser",
  };

  const mockKycProfile = {
    id: "kyc-profile-id",
    userId: "user-id",
    status: KycStatus.UNVERIFIED,
    user: mockUser,
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycService,
        {
          provide: getRepositoryToken(KycProfile),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(KycDocument),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(KycStatusHistory),
          useValue: {
            create: jest.fn(),
            save: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            update: jest.fn(),
          },
        },
        {
          provide: NotificationService,
          useValue: {
            sendEmail: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<KycService>(KycService);
    kycProfileRepository = module.get<Repository<KycProfile>>(
      getRepositoryToken(KycProfile),
    );
    kycDocumentRepository = module.get<Repository<KycDocument>>(
      getRepositoryToken(KycDocument),
    );
    kycStatusHistoryRepository = module.get<Repository<KycStatusHistory>>(
      getRepositoryToken(KycStatusHistory),
    );
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    notificationService = module.get<NotificationService>(NotificationService);
  });

  it("should be defined", () => {
    expect(service).toBeDefined();
  });

  describe("submitKyc", () => {
    it("should submit KYC successfully", async () => {
      const kycSubmitDto: KycSubmitDto = {
        fullName: "John Doe",
        dateOfBirth: "1990-01-01",
        country: "US",
        address: "123 Main St",
        city: "New York",
        postalCode: "10001",
        phoneNumber: "+1234567890",
        occupation: "Engineer",
        sourceOfFunds: "Salary",
        annualIncome: 75000,
        taxId: "123-45-6789",
        nationality: "American",
      };

      jest.spyOn(userRepository, "findOne").mockResolvedValue(mockUser as any);
      jest.spyOn(kycProfileRepository, "findOne").mockResolvedValue(null);
      jest.spyOn(kycProfileRepository, "create").mockReturnValue(mockKycProfile as any);
      jest.spyOn(kycProfileRepository, "save").mockResolvedValue(mockKycProfile as any);
      jest.spyOn(userRepository, "update").mockResolvedValue({} as any);
      jest.spyOn(kycStatusHistoryRepository, "create").mockReturnValue({} as any);
      jest.spyOn(kycStatusHistoryRepository, "save").mockResolvedValue({} as any);
      jest.spyOn(notificationService, "sendEmail").mockResolvedValue(undefined);

      const result = await service.submitKyc("user-id", kycSubmitDto);

      expect(result).toBeDefined();
      expect(result.status).toBe(KycStatus.PENDING);
      expect(notificationService.sendEmail).toHaveBeenCalled();
    });

    it("should throw error if KYC already submitted", async () => {
      const kycSubmitDto: KycSubmitDto = {
        fullName: "John Doe",
        dateOfBirth: "1990-01-01",
        country: "US",
        address: "123 Main St",
        city: "New York",
        postalCode: "10001",
      };

      const existingKycProfile = { ...mockKycProfile, status: KycStatus.PENDING };
      jest.spyOn(userRepository, "findOne").mockResolvedValue(mockUser as any);
      jest.spyOn(kycProfileRepository, "findOne").mockResolvedValue(existingKycProfile as any);

      await expect(
        service.submitKyc("user-id", kycSubmitDto),
      ).rejects.toThrow("KYC already submitted or in progress");
    });
  });

  describe("getKycStatus", () => {
    it("should return KYC status", async () => {
      jest.spyOn(kycProfileRepository, "findOne").mockResolvedValue({
        ...mockKycProfile,
        status: KycStatus.PENDING,
        fullName: "John Doe",
        documents: [],
      } as any);

      const result = await service.getKycStatus("user-id");

      expect(result).toBeDefined();
      expect(result.status).toBe(KycStatus.PENDING);
      expect(result.fullName).toBe("John Doe");
    });

    it("should return unverified status if no KYC profile exists", async () => {
      jest.spyOn(kycProfileRepository, "findOne").mockResolvedValue(null);

      const result = await service.getKycStatus("user-id");

      expect(result.status).toBe(KycStatus.UNVERIFIED);
    });
  });

  describe("reviewKyc", () => {
    it("should approve KYC successfully", async () => {
      const reviewDto = { status: "verified", notes: "Approved" };

      jest.spyOn(kycProfileRepository, "findOne").mockResolvedValue({
        ...mockKycProfile,
        status: KycStatus.IN_REVIEW,
        user: mockUser,
      } as any);
      jest.spyOn(kycProfileRepository, "update").mockResolvedValue({} as any);
      jest.spyOn(userRepository, "update").mockResolvedValue({} as any);
      jest.spyOn(kycStatusHistoryRepository, "create").mockReturnValue({} as any);
      jest.spyOn(kycStatusHistoryRepository, "save").mockResolvedValue({} as any);
      jest.spyOn(notificationService, "sendEmail").mockResolvedValue(undefined);

      const result = await service.reviewKyc("kyc-profile-id", "reviewer-id", reviewDto);

      expect(result).toBeDefined();
      expect(notificationService.sendEmail).toHaveBeenCalledWith(
        mockUser.email,
        "KYC Approved",
        expect.stringContaining("Congratulations"),
      );
    });

    it("should reject KYC successfully", async () => {
      const reviewDto = { status: "rejected", notes: "Invalid documents" };

      jest.spyOn(kycProfileRepository, "findOne").mockResolvedValue({
        ...mockKycProfile,
        status: KycStatus.IN_REVIEW,
        user: mockUser,
      } as any);
      jest.spyOn(kycProfileRepository, "update").mockResolvedValue({} as any);
      jest.spyOn(userRepository, "update").mockResolvedValue({} as any);
      jest.spyOn(kycStatusHistoryRepository, "create").mockReturnValue({} as any);
      jest.spyOn(kycStatusHistoryRepository, "save").mockResolvedValue({} as any);
      jest.spyOn(notificationService, "sendEmail").mockResolvedValue(undefined);

      const result = await service.reviewKyc("kyc-profile-id", "reviewer-id", reviewDto);

      expect(result).toBeDefined();
      expect(notificationService.sendEmail).toHaveBeenCalledWith(
        mockUser.email,
        "KYC Rejected",
        expect.stringContaining("Unfortunately"),
      );
    });
  });
});</content>
<parameter name="filePath">/workspaces/stellAIverse-backend/test/kyc.service.spec.ts