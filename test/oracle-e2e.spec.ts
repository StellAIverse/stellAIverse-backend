import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Wallet } from 'ethers';
import { OracleModule } from '../src/oracle/oracle.module';
import { AuthModule } from '../src/auth/auth.module';
import { UserModule } from '../src/user/user.module';
import { SignedPayload } from '../src/oracle/entities/signed-payload.entity';
import { SubmissionNonce } from '../src/oracle/entities/submission-nonce.entity';
import { User } from '../src/user/entities/user.entity';
import { EmailVerification } from '../src/auth/entities/email-verification.entity';
import { PayloadType } from '../src/oracle/entities/signed-payload.entity';

describe('Oracle E2E Tests', () => {
  let app: INestApplication;
  let jwtToken: string;
  let testWallet: Wallet;
  let userAddress: string;

  beforeAll(async () => {
    // Create test wallet
    testWallet = Wallet.createRandom();
    userAddress = testWallet.address;

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          envFilePath: '.env.test',
        }),
        TypeOrmModule.forRoot({
          type: 'postgres',
          host: process.env.DB_HOST || 'localhost',
          port: parseInt(process.env.DB_PORT || '5432'),
          username: process.env.DB_USERNAME || 'stellaiverse',
          password: process.env.DB_PASSWORD || 'password',
          database: process.env.DB_NAME || 'stellaiverse_test',
          entities: [SignedPayload, SubmissionNonce, User, EmailVerification],
          synchronize: true,
          dropSchema: true,
        }),
        JwtModule.register({
          secret: 'test-secret',
          signOptions: { expiresIn: '24h' },
        }),
        OracleModule,
        AuthModule,
        UserModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    // Create JWT token for testing authenticated endpoints
    const jwtService = app.get('JwtService');
    jwtToken = jwtService.sign({ address: userAddress.toLowerCase() });
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/oracle/health (GET)', () => {
    it('should return health status', () => {
      return request(app.getHttpServer())
        .get('/oracle/health')
        .expect(200)
        .expect((res) => {
          expect(res.body.status).toBe('healthy');
          expect(res.body.service).toBe('oracle');
        });
    });
  });

  describe('/oracle/nonce/:address (GET)', () => {
    it('should return nonce for an address', () => {
      return request(app.getHttpServer())
        .get(`/oracle/nonce/${userAddress}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.address).toBe(userAddress);
          expect(res.body.nonce).toBeDefined();
          expect(typeof res.body.nonce).toBe('string');
        });
    });

    it('should return 0 for new address', () => {
      const newAddress = Wallet.createRandom().address;
      return request(app.getHttpServer())
        .get(`/oracle/nonce/${newAddress}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.nonce).toBe('0');
        });
    });
  });

  describe('/oracle/my-nonce (GET)', () => {
    it('should return nonce for authenticated user', () => {
      return request(app.getHttpServer())
        .get('/oracle/my-nonce')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.address).toBe(userAddress.toLowerCase());
          expect(res.body.nonce).toBeDefined();
        });
    });

    it('should reject without authentication', () => {
      return request(app.getHttpServer()).get('/oracle/my-nonce').expect(401);
    });
  });

  describe('/oracle/payloads (POST)', () => {
    it('should create a new payload', () => {
      const createPayloadDto = {
        payloadType: PayloadType.ORACLE_UPDATE,
        payload: { value: 100, timestamp: Date.now() },
        metadata: { source: 'test' },
      };

      return request(app.getHttpServer())
        .post('/oracle/payloads')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send(createPayloadDto)
        .expect(201)
        .expect((res) => {
          expect(res.body.id).toBeDefined();
          expect(res.body.payloadType).toBe(PayloadType.ORACLE_UPDATE);
          expect(res.body.signerAddress).toBe(userAddress.toLowerCase());
          expect(res.body.nonce).toBeDefined();
          expect(res.body.payloadHash).toMatch(/^0x[a-fA-F0-9]{64}$/);
          expect(res.body.status).toBe('pending');
        });
    });

    it('should reject without authentication', () => {
      return request(app.getHttpServer())
        .post('/oracle/payloads')
        .send({
          payloadType: PayloadType.ORACLE_UPDATE,
          payload: { value: 100 },
        })
        .expect(401);
    });

    it('should reject invalid payload type', () => {
      return request(app.getHttpServer())
        .post('/oracle/payloads')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          payloadType: 'invalid_type',
          payload: { value: 100 },
        })
        .expect(400);
    });

    it('should reject missing payload data', () => {
      return request(app.getHttpServer())
        .post('/oracle/payloads')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          payloadType: PayloadType.ORACLE_UPDATE,
        })
        .expect(400);
    });
  });

  describe('/oracle/payloads/:id (GET)', () => {
    let payloadId: string;

    beforeAll(async () => {
      // Create a test payload
      const res = await request(app.getHttpServer())
        .post('/oracle/payloads')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          payloadType: PayloadType.ORACLE_UPDATE,
          payload: { value: 200 },
        });
      payloadId = res.body.id;
    });

    it('should get a payload by ID', () => {
      return request(app.getHttpServer())
        .get(`/oracle/payloads/${payloadId}`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.id).toBe(payloadId);
          expect(res.body.payload.value).toBe(200);
        });
    });

    it('should return 404 for non-existent payload', () => {
      return request(app.getHttpServer())
        .get('/oracle/payloads/00000000-0000-0000-0000-000000000000')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(404);
    });
  });

  describe('/oracle/my-payloads (GET)', () => {
    beforeAll(async () => {
      // Create multiple payloads
      for (let i = 0; i < 3; i++) {
        await request(app.getHttpServer())
          .post('/oracle/payloads')
          .set('Authorization', `Bearer ${jwtToken}`)
          .send({
            payloadType: PayloadType.AGENT_RESULT,
            payload: { resultId: i },
          });
      }
    });

    it('should get all payloads for authenticated user', () => {
      return request(app.getHttpServer())
        .get('/oracle/my-payloads')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          expect(res.body.length).toBeGreaterThan(0);
          res.body.forEach((payload: any) => {
            expect(payload.signerAddress).toBe(userAddress.toLowerCase());
          });
        });
    });

    it('should filter by status', () => {
      return request(app.getHttpServer())
        .get('/oracle/my-payloads?status=pending')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200)
        .expect((res) => {
          expect(Array.isArray(res.body)).toBe(true);
          res.body.forEach((payload: any) => {
            expect(payload.status).toBe('pending');
          });
        });
    });

    it('should respect limit parameter', () => {
      return request(app.getHttpServer())
        .get('/oracle/my-payloads?limit=2')
        .set('Authorization', `Bearer ${jwtToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.length).toBeLessThanOrEqual(2);
        });
    });
  });

  describe('/oracle/stats (GET)', () => {
    it('should return oracle statistics', () => {
      return request(app.getHttpServer())
        .get('/oracle/stats')
        .expect(200)
        .expect((res) => {
          expect(res.body.payloads).toBeDefined();
          expect(res.body.nonces).toBeDefined();
          expect(res.body.submissions).toBeDefined();
          expect(typeof res.body.payloads.pending).toBe('number');
          expect(typeof res.body.nonces.totalAddresses).toBe('number');
        });
    });
  });

  describe('/oracle/payloads/:id/sign (POST)', () => {
    let payloadId: string;

    beforeEach(async () => {
      // Create a new payload for signing
      const res = await request(app.getHttpServer())
        .post('/oracle/payloads')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          payloadType: PayloadType.PRICE_FEED,
          payload: { price: 1000 },
        });
      payloadId = res.body.id;
    });

    it('should sign a payload', () => {
      return request(app.getHttpServer())
        .post(`/oracle/payloads/${payloadId}/sign`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          payloadId,
          privateKey: testWallet.privateKey,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.signature).toBeDefined();
          expect(res.body.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
          expect(res.body.status).toBe('pending');
        });
    });

    it('should reject signing with wrong private key', () => {
      const wrongWallet = Wallet.createRandom();
      return request(app.getHttpServer())
        .post(`/oracle/payloads/${payloadId}/sign`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          payloadId,
          privateKey: wrongWallet.privateKey,
        })
        .expect(400);
    });

    it('should reject invalid private key format', () => {
      return request(app.getHttpServer())
        .post(`/oracle/payloads/${payloadId}/sign`)
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          payloadId,
          privateKey: 'invalid-key',
        })
        .expect(400);
    });
  });

  describe('Nonce increment on payload creation', () => {
    it('should increment nonce with each payload creation', async () => {
      const initialNonceRes = await request(app.getHttpServer())
        .get(`/oracle/nonce/${userAddress}`)
        .expect(200);

      const initialNonce = parseInt(initialNonceRes.body.nonce);

      // Create a payload
      await request(app.getHttpServer())
        .post('/oracle/payloads')
        .set('Authorization', `Bearer ${jwtToken}`)
        .send({
          payloadType: PayloadType.COMPUTE_PROOF,
          payload: { computeId: 'test-123' },
        })
        .expect(201);

      // Check nonce incremented
      const newNonceRes = await request(app.getHttpServer())
        .get(`/oracle/nonce/${userAddress}`)
        .expect(200);

      const newNonce = parseInt(newNonceRes.body.nonce);
      expect(newNonce).toBe(initialNonce + 1);
    });
  });
});
