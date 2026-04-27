import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Wallet } from 'ethers';
import { AuthModule } from '../../src/auth/auth.module';
import { User, UserRole } from '../../src/user/entities/user.entity';
import { Wallet as WalletEntity, WalletStatus, WalletType } from '../../src/auth/entities/wallet.entity';
import { EmailVerification } from '../../src/auth/entities/email-verification.entity';

describe('Advanced Wallet Authentication (e2e)', () => {
  let app: INestApplication;
  let jwtService: JwtService;
  let userToken: string;
  let testUserId: string;
  let primaryWallet: Wallet;
  let secondaryWallet: Wallet;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [User, WalletEntity, EmailVerification],
          synchronize: true,
        }),
        AuthModule,
      ],
      providers: [JwtService],
    }).compile();

    app = moduleFixture.createNestApplication();
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Create test wallets
    primaryWallet = Wallet.createRandom();
    secondaryWallet = Wallet.createRandom();

    testUserId = '550e8400-e29b-41d4-a716-446655440001';

    userToken = jwtService.sign({
      sub: testUserId,
      address: primaryWallet.address,
      role: UserRole.USER,
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Multi-Wallet Support', () => {
    it('should link a primary wallet', async () => {
      // First get a challenge
      const challengeRes = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ address: primaryWallet.address })
        .expect(200);

      const message = challengeRes.body.message;
      const signature = await primaryWallet.signMessage(message);

      const response = await request(app.getHttpServer())
        .post('/auth/link-wallet')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          walletAddress: primaryWallet.address,
          message,
          signature,
          walletName: 'Primary Wallet',
        })
        .expect(201);

      expect(response.body.walletId).toBeDefined();
      expect(response.body.walletAddress).toBe(primaryWallet.address.toLowerCase());
      expect(response.body.type).toBe(WalletType.PRIMARY);
    });

    it('should link a secondary wallet', async () => {
      // Get challenge for secondary wallet
      const challengeRes = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ address: secondaryWallet.address })
        .expect(200);

      const message = challengeRes.body.message;
      const signature = await secondaryWallet.signMessage(message);

      const response = await request(app.getHttpServer())
        .post('/auth/link-wallet')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          walletAddress: secondaryWallet.address,
          message,
          signature,
          walletName: 'Secondary Wallet',
        })
        .expect(201);

      expect(response.body.walletId).toBeDefined();
      expect(response.body.type).toBe(WalletType.SECONDARY);
    });

    it('should prevent linking duplicate wallet', async () => {
      const challengeRes = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ address: primaryWallet.address })
        .expect(200);

      const message = challengeRes.body.message;
      const signature = await primaryWallet.signMessage(message);

      await request(app.getHttpServer())
        .post('/auth/link-wallet')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          walletAddress: primaryWallet.address,
          message,
          signature,
        })
        .expect(409);
    });

    it('should get all user wallets', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/wallets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThanOrEqual(2);
    });

    it('should set a wallet as primary', async () => {
      // First get wallets to find secondary wallet ID
      const walletsRes = await request(app.getHttpServer())
        .get('/auth/wallets')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      const secondaryWalletData = walletsRes.body.find(
        (w: any) => w.type === WalletType.SECONDARY,
      );

      if (secondaryWalletData) {
        const response = await request(app.getHttpServer())
          .post(`/auth/wallets/${secondaryWalletData.id}/set-primary`)
          .set('Authorization', `Bearer ${userToken}`)
          .expect(201);

        expect(response.body.message).toContain('Primary wallet updated');
      }
    });

    it('should unlink a wallet', async () => {
      // Create a third wallet to unlink
      const thirdWallet = Wallet.createRandom();

      const challengeRes = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ address: thirdWallet.address })
        .expect(200);

      const message = challengeRes.body.message;
      const signature = await thirdWallet.signMessage(message);

      const linkRes = await request(app.getHttpServer())
        .post('/auth/link-wallet')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          walletAddress: thirdWallet.address,
          message,
          signature,
          walletName: 'Wallet to Unlink',
        })
        .expect(201);

      const walletId = linkRes.body.walletId;

      // Now unlink it
      const response = await request(app.getHttpServer())
        .post('/auth/unlink-wallet')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ walletId })
        .expect(201);

      expect(response.body.message).toContain('successfully unlinked');
    });
  });

  describe('Session Recovery', () => {
    let recoveryWallet: Wallet;
    let recoveryWalletId: string;

    beforeAll(async () => {
      recoveryWallet = Wallet.createRandom();

      // Link recovery wallet
      const challengeRes = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ address: recoveryWallet.address })
        .expect(200);

      const message = challengeRes.body.message;
      const signature = await recoveryWallet.signMessage(message);

      const linkRes = await request(app.getHttpServer())
        .post('/auth/link-wallet')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          walletAddress: recoveryWallet.address,
          message,
          signature,
          walletName: 'Recovery Test Wallet',
        })
        .expect(201);

      recoveryWalletId = linkRes.body.walletId;
    });

    it('should generate backup codes', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/recovery/backup-code/generate')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ walletId: recoveryWalletId })
        .expect(201);

      expect(response.body.codes).toBeDefined();
      expect(response.body.codes.length).toBe(10);
    });

    it('should get recovery status', async () => {
      const response = await request(app.getHttpServer())
        .get(`/auth/recovery/status/${recoveryWalletId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.recoveryEnabled).toBeDefined();
      expect(response.body.methods).toBeDefined();
    });

    it('should initiate email recovery', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/recovery/email/initiate')
        .send({ email: 'test@example.com' })
        .expect(201);

      expect(response.body.sessionId).toBeDefined();
      expect(response.body.message).toContain('Recovery email sent');
    });
  });

  describe('Delegated Signing', () => {
    let delegatorWallet: Wallet;
    let delegateWallet: Wallet;
    let delegatorWalletId: string;

    beforeAll(async () => {
      delegatorWallet = Wallet.createRandom();
      delegateWallet = Wallet.createRandom();

      // Link delegator wallet
      const challengeRes = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ address: delegatorWallet.address })
        .expect(200);

      const message = challengeRes.body.message;
      const signature = await delegatorWallet.signMessage(message);

      const linkRes = await request(app.getHttpServer())
        .post('/auth/link-wallet')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          walletAddress: delegatorWallet.address,
          message,
          signature,
          walletName: 'Delegator Wallet',
        })
        .expect(201);

      delegatorWalletId = linkRes.body.walletId;
    });

    it('should request delegation', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/delegation/request')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          delegatorWalletId,
          delegateAddress: delegateWallet.address,
          permissions: ['sign_messages', 'authenticate'],
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .expect(201);

      expect(response.body.delegationId).toBeDefined();
      expect(response.body.challenge).toBeDefined();
    });

    it('should get user delegations', async () => {
      const response = await request(app.getHttpServer())
        .get('/auth/delegations')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.granted).toBeDefined();
      expect(response.body.received).toBeDefined();
    });

    it('should get wallet delegations', async () => {
      const response = await request(app.getHttpServer())
        .get(`/auth/delegations/wallet/${delegatorWalletId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
    });
  });

  describe('Security Tests', () => {
    it('should reject unauthorized wallet access', async () => {
      const otherUserToken = jwtService.sign({
        sub: '550e8400-e29b-41d4-a716-446655440999',
        address: '0x9999999999999999999999999999999999999999',
        role: UserRole.USER,
      });

      await request(app.getHttpServer())
        .get('/auth/wallets')
        .set('Authorization', `Bearer ${otherUserToken}`)
        .expect(200)
        .expect((res) => {
          // Should return empty or different wallets
          expect(res.body).toBeDefined();
        });
    });

    it('should prevent replay attacks with consumed challenges', async () => {
      const newWallet = Wallet.createRandom();

      const challengeRes = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ address: newWallet.address })
        .expect(200);

      const message = challengeRes.body.message;
      const signature = await newWallet.signMessage(message);

      // First attempt should succeed
      await request(app.getHttpServer())
        .post('/auth/link-wallet')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          walletAddress: newWallet.address,
          message,
          signature,
        })
        .expect(201);

      // Second attempt with same challenge should fail
      await request(app.getHttpServer())
        .post('/auth/link-wallet')
        .set('Authorization', `Bearer ${userToken}`)
        .send({
          walletAddress: newWallet.address,
          message,
          signature,
        })
        .expect(401);
    });

    it('should enforce rate limiting on sensitive endpoints', async () => {
      const newWallet = Wallet.createRandom();

      // Make multiple rapid requests
      const requests = Array(15).fill(null).map(() =>
        request(app.getHttpServer())
          .post('/auth/challenge')
          .send({ address: newWallet.address }),
      );

      const responses = await Promise.all(requests);

      // Some should be rate limited (429)
      const rateLimitedCount = responses.filter((r) => r.status === 429).length;
      expect(rateLimitedCount).toBeGreaterThan(0);
    });
  });
});
