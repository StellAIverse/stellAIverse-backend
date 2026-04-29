import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { getRepositoryToken } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { User } from "../src/user/entities/user.entity";
import { RefreshToken, TwoFactorAuth } from "../src/auth/entities/auth.entity";
import { KycProfile } from "../src/compliance/entities/kyc.entity";
import { AppModule } from "../src/app.module";

describe("Enhanced Authentication & KYC (e2e)", () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let refreshTokenRepository: Repository<RefreshToken>;
  let twoFactorRepository: Repository<TwoFactorAuth>;
  let kycProfileRepository: Repository<KycProfile>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    userRepository = moduleFixture.get<Repository<User>>(getRepositoryToken(User));
    refreshTokenRepository = moduleFixture.get<Repository<RefreshToken>>(
      getRepositoryToken(RefreshToken),
    );
    twoFactorRepository = moduleFixture.get<Repository<TwoFactorAuth>>(
      getRepositoryToken(TwoFactorAuth),
    );
    kycProfileRepository = moduleFixture.get<Repository<KycProfile>>(
      getRepositoryToken(KycProfile),
    );
  });

  afterEach(async () => {
    await app.close();
  });

  describe("POST /api/auth/register", () => {
    it("should register a new user", () => {
      return request(app.getHttpServer())
        .post("/api/auth/register")
        .send({
          email: "test@example.com",
          password: "password123",
          username: "testuser",
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty("accessToken");
          expect(res.body).toHaveProperty("refreshToken");
          expect(res.body.user.email).toBe("test@example.com");
        });
    });

    it("should return 409 for duplicate email", async () => {
      // First registration
      await request(app.getHttpServer())
        .post("/api/auth/register")
        .send({
          email: "duplicate@example.com",
          password: "password123",
          username: "user1",
        });

      // Second registration with same email
      return request(app.getHttpServer())
        .post("/api/auth/register")
        .send({
          email: "duplicate@example.com",
          password: "password456",
          username: "user2",
        })
        .expect(409);
    });
  });

  describe("POST /api/auth/login", () => {
    beforeEach(async () => {
      // Register a user for login tests
      await request(app.getHttpServer())
        .post("/api/auth/register")
        .send({
          email: "login@example.com",
          password: "password123",
          username: "logintest",
        });
    });

    it("should login successfully", () => {
      return request(app.getHttpServer())
        .post("/api/auth/login")
        .send({
          email: "login@example.com",
          password: "password123",
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("accessToken");
          expect(res.body).toHaveProperty("refreshToken");
        });
    });

    it("should return 401 for invalid credentials", () => {
      return request(app.getHttpServer())
        .post("/api/auth/login")
        .send({
          email: "login@example.com",
          password: "wrongpassword",
        })
        .expect(401);
    });
  });

  describe("POST /api/auth/refresh", () => {
    let refreshToken: string;

    beforeEach(async () => {
      // Register and login to get refresh token
      const response = await request(app.getHttpServer())
        .post("/api/auth/register")
        .send({
          email: "refresh@example.com",
          password: "password123",
          username: "refreshtest",
        });

      refreshToken = response.body.refreshToken;
    });

    it("should refresh access token", () => {
      return request(app.getHttpServer())
        .post("/api/auth/refresh")
        .send({ refreshToken })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty("accessToken");
          expect(res.body).toHaveProperty("refreshToken");
        });
    });
  });

  describe("KYC Endpoints", () => {
    let accessToken: string;

    beforeEach(async () => {
      // Register and login to get access token
      const response = await request(app.getHttpServer())
        .post("/api/auth/register")
        .send({
          email: "kyc@example.com",
          password: "password123",
          username: "kyctest",
        });

      accessToken = response.body.accessToken;
    });

    describe("POST /api/kyc/submit", () => {
      it("should submit KYC application", () => {
        return request(app.getHttpServer())
          .post("/api/kyc/submit")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({
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
          })
          .expect(201);
      });
    });

    describe("GET /api/kyc/status", () => {
      it("should return KYC status", () => {
        return request(app.getHttpServer())
          .get("/api/kyc/status")
          .set("Authorization", `Bearer ${accessToken}`)
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty("status");
            expect(res.body).toHaveProperty("userId");
          });
      });
    });
  });

  describe("2FA Endpoints", () => {
    let accessToken: string;

    beforeEach(async () => {
      // Register and login to get access token
      const response = await request(app.getHttpServer())
        .post("/api/auth/register")
        .send({
          email: "2fa@example.com",
          password: "password123",
          username: "2fatest",
        });

      accessToken = response.body.accessToken;
    });

    describe("POST /api/auth/2fa/setup", () => {
      it("should setup 2FA", () => {
        return request(app.getHttpServer())
          .post("/api/auth/2fa/setup")
          .set("Authorization", `Bearer ${accessToken}`)
          .send({ type: "totp" })
          .expect(200)
          .expect((res) => {
            expect(res.body).toHaveProperty("secret");
            expect(res.body).toHaveProperty("qrCodeUrl");
            expect(res.body).toHaveProperty("backupCodes");
          });
      });
    });
  });
});</content>
<parameter name="filePath">/workspaces/stellAIverse-backend/test/enhanced-auth.e2e-spec.ts