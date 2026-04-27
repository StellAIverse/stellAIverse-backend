import { Test, TestingModule } from "@nestjs/testing";
import { INestApplication, ValidationPipe } from "@nestjs/common";
import * as request from "supertest";
import { AppModule } from "../../src/app.module";
import { RewardTrigger, RewardStatus } from "../../src/referral/reward.entity";

describe("Referral System (e2e)", () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it("should register a user, get their referral code, and reward both when a new user registers with it", async () => {
    // 1. Register User A
    const registerARes = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email: "referrer@example.com",
        password: "password123",
        username: "referrer_user",
      })
      .expect(201);

    const referralCodeA = registerARes.body.user.referralCode;
    expect(referralCodeA).toBeDefined();

    // 2. Register User B using User A's referral code
    const registerBRes = await request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email: "referee@example.com",
        password: "password123",
        username: "referee_user",
        referralCode: referralCodeA,
      })
      .expect(201);

    const tokenB = registerBRes.body.token;
    const userB = registerBRes.body.user;

    // 3. Check rewards for User B (the referee)
    // Wait a bit for the async trigger to process
    await new Promise((resolve) => setTimeout(resolve, 500));

    const rewardsBRes = await request(app.getHttpServer())
      .get("/referral-rewards")
      .set("Authorization", `Bearer ${tokenB}`)
      .expect(200);

    const rewardsB = rewardsBRes.body;
    expect(rewardsB.length).toBeGreaterThan(0);
    
    const refereeReward = rewardsB.find(r => r.metadata.party === "referee");
    expect(refereeReward).toBeDefined();
    expect(Number(refereeReward.amount)).toBe(5);
    expect(refereeReward.status).toBe(RewardStatus.AWARDED);

    // 4. Check rewards for User A (the referrer)
    const loginARes = await request(app.getHttpServer())
      .post("/auth/login")
      .send({
        email: "referrer@example.com",
        password: "password123",
      })
      .expect(201);
    
    const tokenA = loginARes.body.token;

    const rewardsARes = await request(app.getHttpServer())
      .get("/referral-rewards")
      .set("Authorization", `Bearer ${tokenA}`)
      .expect(200);

    const rewardsA = rewardsARes.body;
    const referrerReward = rewardsA.find(r => r.metadata.party === "referrer");
    expect(referrerReward).toBeDefined();
    expect(Number(referrerReward.amount)).toBe(10);
    expect(referrerReward.status).toBe(RewardStatus.AWARDED);
  });

  it("should reject registration with invalid referral code", async () => {
    return request(app.getHttpServer())
      .post("/auth/register")
      .send({
        email: "invalid@example.com",
        password: "password123",
        username: "invalid_user",
        referralCode: "NONEXISTENT",
      })
      .expect(400);
  });
});
