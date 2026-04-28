import { CanActivate, Controller, Get, INestApplication, Post, UseGuards } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test, TestingModule } from "@nestjs/testing";
import { ConfigModule } from "@nestjs/config";
import * as request from "supertest";
import { sign } from "jsonwebtoken";
import { KycGuard } from "../src/common/guard/kyc.guard";
import { SkipKyc } from "../src/common/decorators/skip-kyc.decorator";
import { ComplianceService } from "../src/compliance/compliance.service";
import { AppModule } from "../src/app.module";
import { Reflector } from "@nestjs/core";

class JwtAuthGuard implements CanActivate {
  canActivate(): boolean {
    return true;
  }
}

@Controller("kyc-guard")
class KycGuardTestController {
  @Get("secure")
  @UseGuards(JwtAuthGuard)
  getSecureRoute() {
    return { ok: true };
  }

  @Post("bootstrap")
  @UseGuards(JwtAuthGuard)
  @SkipKyc()
  bootstrapKyc() {
    return { accepted: true };
  }
}

describe("KycGuard (e2e)", () => {
  let app: INestApplication;
  let complianceService: { getKycStatus: jest.Mock };
  const originalJwtSecret = process.env.JWT_SECRET;

  const makeToken = (subject: string): string => {
    return sign({ sub: subject, role: "user" }, process.env.JWT_SECRET as string, {
      algorithm: "HS256",
      expiresIn: "1h",
    });
  };

  beforeAll(async () => {
    process.env.JWT_SECRET = "test-kyc-secret";

    complianceService = {
      getKycStatus: jest.fn((userId: string) => {
        if (userId === "verified-user") {
          return { userId, status: "verified" };
        }

        return { userId, status: "pending" };
      }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [KycGuardTestController],
      providers: [
        {
          provide: ComplianceService,
          useValue: complianceService,
        },
        KycGuard,
        {
          provide: APP_GUARD,
          useClass: KycGuard,
        },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();

    if (originalJwtSecret === undefined) {
      delete process.env.JWT_SECRET;
    } else {
      process.env.JWT_SECRET = originalJwtSecret;
    }
  });

  it("returns 403 for non-KYC verified users on protected route", async () => {
    const token = makeToken("pending-user");

    await request(app.getHttpServer())
      .get("/kyc-guard/secure")
      .set("Authorization", `Bearer ${token}`)
      .expect(403);
  });

  it("returns 200 for KYC verified users on protected route", async () => {
    const token = makeToken("verified-user");

    await request(app.getHttpServer())
      .get("/kyc-guard/secure")
      .set("Authorization", `Bearer ${token}`)
      .expect(200);
  });

  it("rejects bypass attempt without bearer token", async () => {
    await request(app.getHttpServer())
      .get("/kyc-guard/secure")
      .set("x-user-id", "verified-user")
      .expect(401);
  });

  it("allows KYC bootstrap route via @SkipKyc", async () => {
    const token = makeToken("pending-user");

    await request(app.getHttpServer())
      .post("/kyc-guard/bootstrap")
      .set("Authorization", `Bearer ${token}`)
      .expect(201);
  });

  it('should block non-KYC users from secure routes', async () => {
    const token = makeToken('unverified-user');

    const response = await request(app.getHttpServer())
      .get('/kyc-guard/secure')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(403);
  });

  it('should allow KYC-verified users to access secure routes', async () => {
    complianceService.getKycStatus.mockReturnValueOnce(true);
    const token = makeToken('verified-user');

    const response = await request(app.getHttpServer())
      .get('/kyc-guard/secure')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ ok: true });
  });

  // E2E tests for the KycGuard to verify blocking non-KYC users, allowing KYC-verified users, and respecting @SkipKyc decorator.
  it('should block access to sensitive endpoints for non-KYC users', async () => {
    mockUser.kycVerified = false;

    const response = await request(app.getHttpServer())
      .get('/sensitive-endpoint')
      .expect(403);

    expect(response.body.message).toBe('Forbidden resource');
  });

  it('should allow access to sensitive endpoints for KYC-verified users', async () => {
    mockUser.kycVerified = true;

    const response = await request(app.getHttpServer())
      .get('/sensitive-endpoint')
      .expect(200);

    expect(response.body).toEqual(expect.any(Object));
  });

  it('should allow access to @SkipKyc() endpoints without KYC', async () => {
    mockUser.kycVerified = false;

    const response = await request(app.getHttpServer())
      .get('/skip-kyc-endpoint')
      .expect(200);

    expect(response.body).toEqual(expect.any(Object));
  });
});
