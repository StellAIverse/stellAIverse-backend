import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import * as request from "supertest";
import { QuotaModule } from "../../src/quota/quota.module";

describe("PolicyController (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [QuotaModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it("/POST quota/policies", async () => {
    const res = await request(app.getHttpServer())
      .post("/quota/policies")
      .send({
        scope: "USER",
        targetId: "123",
        limit: 10,
        windowMs: 60000,
        burst: 5,
      });
    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
  });

  afterAll(async () => {
    await app.close();
  });
});
