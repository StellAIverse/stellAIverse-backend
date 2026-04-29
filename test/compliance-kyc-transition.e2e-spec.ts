import {
  CanActivate,
  ExecutionContext,
  INestApplication,
} from "@nestjs/common";
import { Test, TestingModule } from "@nestjs/testing";
import * as request from "supertest";
import { ComplianceController } from "../src/compliance/compliance.controller";
import { ComplianceService } from "../src/compliance/compliance.service";
import { KycStatusTransitionService } from "../src/compliance/kyc-status-transition.service";
import { AuditLogService } from "../src/audit/audit-log.service";
import { RiskManagementService } from "../src/risk-management/risk-management.service";
import { JwtAuthGuard } from "../src/auth/jwt.guard";
import { KycStatus } from "../src/compliance/dto/compliance.dto";
import { RolesGuard } from "../src/common/rbac/roles.guard";

class TestJwtAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<{
      headers: Record<string, string | undefined>;
      user?: { id: string; role: string; roles: string[] };
    }>();

    const actorId = req.headers["x-actor-id"] ?? "operator-1";
    const actorRole = req.headers["x-actor-role"] ?? "KYC_OPERATOR";

    req.user = {
      id: actorId,
      role: actorRole,
      roles: [actorRole],
    };

    return true;
  }
}

describe("Compliance KYC Transitions (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ComplianceController],
      providers: [
        ComplianceService,
        KycStatusTransitionService,
        RolesGuard,
        AuditLogService,
        {
          provide: RiskManagementService,
          useValue: {
            calculatePortfolioRisk: jest.fn().mockResolvedValue({
              riskScore: 0,
            }),
          },
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useClass(TestJwtAuthGuard)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("returns HTTP 400 + deterministic code for invalid transition", async () => {
    await request(app.getHttpServer())
      .post("/compliance/kyc")
      .send({
        userId: "target-user",
        fullName: "Target User",
        dateOfBirth: "1990-01-01",
        country: "US",
        idNumber: "111222333",
        status: KycStatus.PENDING,
      })
      .expect(201);

    await request(app.getHttpServer())
      .post("/compliance/kyc")
      .send({
        userId: "target-user",
        fullName: "Target User",
        dateOfBirth: "1990-01-01",
        country: "US",
        idNumber: "111222333",
        status: KycStatus.VERIFIED,
      })
      .expect(400)
      .expect((res) => {
        const code = res.body.code ?? res.body.message?.code;
        expect(code).toBe("KYC_INVALID_STATUS_TRANSITION");
      });
  });

  it("fails self-verification", async () => {
    await request(app.getHttpServer())
      .post("/compliance/kyc")
      .set("x-actor-id", "self-user")
      .set("x-actor-role", "KYC_OPERATOR")
      .send({
        userId: "self-user",
        fullName: "Self User",
        dateOfBirth: "1990-01-01",
        country: "US",
        idNumber: "999888777",
        status: KycStatus.PENDING,
      })
      .expect(403)
      .expect((res) => {
        const code = res.body.code ?? res.body.message?.code;
        expect(code).toBe("KYC_SELF_ASSIGNMENT_FORBIDDEN");
      });
  });

  it("fails non-operator update attempts", async () => {
    await request(app.getHttpServer())
      .post("/compliance/kyc")
      .set("x-actor-id", "plain-user")
      .set("x-actor-role", "USER")
      .send({
        userId: "target-2",
        fullName: "Target User 2",
        dateOfBirth: "1990-01-01",
        country: "US",
        idNumber: "123123123",
        status: KycStatus.PENDING,
      })
      .expect(403)
      .expect((res) => {
        const code = res.body.code ?? res.body.message?.code;
        expect(code).toBe("KYC_OPERATOR_ROLE_REQUIRED");
      });
  });
});
