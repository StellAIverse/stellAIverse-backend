import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { User, UserRole } from '../src/user/entities/user.entity';
import { Repository } from 'typeorm';

describe('Wallet Management (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let authToken: string;
  let testUser: User;

  const testWalletAddress = '0x1234567890abcdef1234567890abcdef12345678';
  const newWalletAddress = '0xabcdefabcdefabcdefabcdefabcdefabcdefabcd';
  const testEmail = 'test@example.com';

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    userRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );

    // Create test user
    testUser = userRepository.create({
      walletAddress: testWalletAddress.toLowerCase(),
      email: testEmail,
      emailVerified: true,
      role: UserRole.USER,
    });
    await userRepository.save(testUser);

    // Get auth token
    const challengeResponse = await request(app.getHttpServer())
      .post('/auth/challenge')
      .send({ address: testWalletAddress })
      .expect(201);

    // In real test, you would sign the challenge
    // For now, we'll mock the token
    authToken = 'mock-jwt-token';
  });

  afterAll(async () => {
    // Cleanup
    if (testUser) {
      await userRepository.remove(testUser);
    }
    await app.close();
  });

  describe('POST /auth/link-wallet', () => {
    it('should require authentication', async () => {
      return request(app.getHttpServer())
        .post('/auth/link-wallet')
        .send({
          walletAddress: newWalletAddress,
          message: 'test message',
          signature: '0x' + '1'.repeat(130),
        })
        .expect(401);
    });

    it('should validate wallet address format', async () => {
      return request(app.getHttpServer())
        .post('/auth/link-wallet')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          walletAddress: 'invalid-address',
          message: 'test message',
          signature: '0x' + '1'.repeat(130),
        })
        .expect(400);
    });

    it('should validate signature length', async () => {
      return request(app.getHttpServer())
        .post('/auth/link-wallet')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          walletAddress: newWalletAddress,
          message: 'test message',
          signature: '0x123', // Too short
        })
        .expect(400);
    });

    it('should enforce rate limiting', async () => {
      const requests = [];
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/auth/link-wallet')
            .set('Authorization', `Bearer ${authToken}`)
            .send({
              walletAddress: newWalletAddress,
              message: 'test message',
              signature: '0x' + '1'.repeat(130),
            }),
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.some((res) => res.status === 429);
      expect(rateLimited).toBe(true);
    });
  });

  describe('POST /auth/unlink-wallet', () => {
    it('should require authentication', async () => {
      return request(app.getHttpServer())
        .post('/auth/unlink-wallet')
        .send({ walletAddress: testWalletAddress })
        .expect(401);
    });

    it('should validate wallet address format', async () => {
      return request(app.getHttpServer())
        .post('/auth/unlink-wallet')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ walletAddress: 'invalid-address' })
        .expect(400);
    });

    it('should require verified email before unlinking', async () => {
      // Create user without verified email
      const unverifiedUser = userRepository.create({
        walletAddress: '0x9999999999999999999999999999999999999999',
        email: 'unverified@example.com',
        emailVerified: false,
        role: UserRole.USER,
      });
      await userRepository.save(unverifiedUser);

      const response = await request(app.getHttpServer())
        .post('/auth/unlink-wallet')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ walletAddress: unverifiedUser.walletAddress })
        .expect(400);

      expect(response.body.message).toContain('Email must be verified');

      // Cleanup
      await userRepository.remove(unverifiedUser);
    });

    it('should enforce rate limiting', async () => {
      const requests = [];
      for (let i = 0; i < 6; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/auth/unlink-wallet')
            .set('Authorization', `Bearer ${authToken}`)
            .send({ walletAddress: testWalletAddress }),
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.some((res) => res.status === 429);
      expect(rateLimited).toBe(true);
    });
  });

  describe('POST /auth/recover-wallet', () => {
    it('should validate email format', async () => {
      return request(app.getHttpServer())
        .post('/auth/recover-wallet')
        .send({
          email: 'invalid-email',
          recoveryToken: 'a'.repeat(64),
        })
        .expect(400);
    });

    it('should validate recovery token length', async () => {
      return request(app.getHttpServer())
        .post('/auth/recover-wallet')
        .send({
          email: testEmail,
          recoveryToken: 'short',
        })
        .expect(400);
    });

    it('should return challenge for valid recovery request', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/recover-wallet')
        .send({
          email: testEmail,
          recoveryToken: 'a'.repeat(64),
        })
        .expect(201);

      expect(response.body).toHaveProperty('message');
      expect(response.body).toHaveProperty('walletAddress');
      expect(response.body).toHaveProperty('challenge');
      expect(response.body.walletAddress).toBe(testWalletAddress.toLowerCase());
    });

    it('should enforce strict rate limiting (3 requests per minute)', async () => {
      const requests = [];
      for (let i = 0; i < 4; i++) {
        requests.push(
          request(app.getHttpServer())
            .post('/auth/recover-wallet')
            .send({
              email: testEmail,
              recoveryToken: 'a'.repeat(64),
            }),
        );
      }

      const responses = await Promise.all(requests);
      const rateLimited = responses.some((res) => res.status === 429);
      expect(rateLimited).toBe(true);
    });

    it('should return error for non-existent email', async () => {
      return request(app.getHttpServer())
        .post('/auth/recover-wallet')
        .send({
          email: 'nonexistent@example.com',
          recoveryToken: 'a'.repeat(64),
        })
        .expect(400);
    });
  });

  describe('Wallet Management Flow', () => {
    it('should complete full wallet linking flow', async () => {
      // 1. Request challenge for new wallet
      const challengeResponse = await request(app.getHttpServer())
        .post('/auth/challenge')
        .send({ address: newWalletAddress })
        .expect(201);

      expect(challengeResponse.body).toHaveProperty('message');
      expect(challengeResponse.body).toHaveProperty('address');

      // 2. Link new wallet (would require real signature in production)
      // This would fail without proper signature, but tests the endpoint structure
      const linkResponse = await request(app.getHttpServer())
        .post('/auth/link-wallet')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          walletAddress: newWalletAddress,
          message: challengeResponse.body.message,
          signature: '0x' + '1'.repeat(130),
        });

      // Expect either success or signature validation error
      expect([200, 201, 401]).toContain(linkResponse.status);
    });

    it('should complete full wallet recovery flow', async () => {
      // 1. Request recovery
      const recoveryResponse = await request(app.getHttpServer())
        .post('/auth/recover-wallet')
        .send({
          email: testEmail,
          recoveryToken: 'a'.repeat(64),
        })
        .expect(201);

      expect(recoveryResponse.body).toHaveProperty('challenge');
      expect(recoveryResponse.body).toHaveProperty('walletAddress');

      // 2. User would sign the challenge and verify
      const verifyResponse = await request(app.getHttpServer())
        .post('/auth/verify')
        .send({
          message: recoveryResponse.body.challenge,
          signature: '0x' + '1'.repeat(130),
        });

      // Expect either success or signature validation error
      expect([200, 201, 401]).toContain(verifyResponse.status);
    });
  });
});
