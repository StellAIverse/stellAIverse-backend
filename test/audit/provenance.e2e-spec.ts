import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { AuditModule } from '../../src/audit/audit.module';
import { ProvenanceService } from '../../src/audit/provenance.service';
import {
  ProvenanceRecord,
  ProvenanceStatus,
  ProvenanceAction,
} from '../../src/audit/entities/provenance-record.entity';
import { User, UserRole } from '../../src/user/entities/user.entity';

describe('ProvenanceController (e2e)', () => {
  let app: INestApplication;
  let provenanceService: ProvenanceService;
  let jwtService: JwtService;
  let userToken: string;
  let adminToken: string;
  let testUserId: string;
  let testAdminId: string;

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
          entities: [ProvenanceRecord, User],
          synchronize: true,
        }),
        AuditModule,
      ],
      providers: [JwtService],
    }).compile();

    app = moduleFixture.createNestApplication();
    provenanceService = moduleFixture.get<ProvenanceService>(ProvenanceService);
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Create test tokens
    testUserId = '550e8400-e29b-41d4-a716-446655440001';
    testAdminId = '550e8400-e29b-41d4-a716-446655440002';

    userToken = jwtService.sign({
      sub: testUserId,
      email: 'user@test.com',
      role: UserRole.USER,
    });

    adminToken = jwtService.sign({
      sub: testAdminId,
      email: 'admin@test.com',
      role: UserRole.ADMIN,
    });

    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /provenance (via service)', () => {
    it('should create a provenance record with valid data', async () => {
      const record = await provenanceService.createProvenanceRecord({
        agentId: 'agent-123',
        userId: testUserId,
        action: ProvenanceAction.REQUEST_RECEIVED,
        input: { query: 'test query' },
        status: ProvenanceStatus.SUCCESS,
      });

      expect(record).toBeDefined();
      expect(record.id).toBeDefined();
      expect(record.agentId).toBe('agent-123');
      expect(record.userId).toBe(testUserId);
      expect(record.action).toBe(ProvenanceAction.REQUEST_RECEIVED);
      expect(record.status).toBe(ProvenanceStatus.SUCCESS);
      expect(record.signature).toBeDefined();
      expect(record.recordHash).toBeDefined();
    });

    it('should create a provenance record with error status', async () => {
      const record = await provenanceService.createProvenanceRecord({
        agentId: 'agent-456',
        userId: testUserId,
        action: ProvenanceAction.PROVIDER_CALL,
        input: { query: 'test query' },
        status: ProvenanceStatus.FAILED,
        error: 'Rate limit exceeded',
        provider: 'openai',
      });

      expect(record).toBeDefined();
      expect(record.status).toBe(ProvenanceStatus.FAILED);
      expect(record.error).toBe('Rate limit exceeded');
      expect(record.provider).toBe('openai');
    });
  });

  describe('GET /provenance', () => {
    beforeAll(async () => {
      // Create test records
      await provenanceService.createProvenanceRecord({
        agentId: 'agent-test',
        userId: testUserId,
        action: ProvenanceAction.REQUEST_RECEIVED,
        input: { query: 'test 1' },
        status: ProvenanceStatus.SUCCESS,
      });

      await provenanceService.createProvenanceRecord({
        agentId: 'agent-test',
        userId: testUserId,
        action: ProvenanceAction.PROVIDER_CALL,
        input: { query: 'test 2' },
        status: ProvenanceStatus.SUCCESS,
        provider: 'openai',
      });
    });

    it('should return provenance records with authentication', () => {
      return request(app.getHttpServer())
        .get('/provenance')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toBeDefined();
          expect(Array.isArray(res.body.data)).toBe(true);
          expect(res.body.total).toBeDefined();
          expect(res.body.page).toBeDefined();
          expect(res.body.limit).toBeDefined();
        });
    });

    it('should return 401 without authentication', () => {
      return request(app.getHttpServer())
        .get('/provenance')
        .expect(401);
    });

    it('should filter by agentId', async () => {
      const response = await request(app.getHttpServer())
        .get('/provenance?agentId=agent-test')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.data.length).toBeGreaterThan(0);
      expect(response.body.data.every((r: any) => r.agentId === 'agent-test')).toBe(true);
    });

    it('should filter by status', async () => {
      const response = await request(app.getHttpServer())
        .get('/provenance?status=success')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.data.every((r: any) => r.status === 'success')).toBe(true);
    });

    it('should paginate results', async () => {
      const response = await request(app.getHttpServer())
        .get('/provenance?page=1&limit=1')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.data.length).toBeLessThanOrEqual(1);
      expect(response.body.limit).toBe(1);
    });
  });

  describe('GET /provenance/:id', () => {
    let testRecordId: string;

    beforeAll(async () => {
      const record = await provenanceService.createProvenanceRecord({
        agentId: 'agent-specific',
        userId: testUserId,
        action: ProvenanceAction.SUBMISSION,
        input: { query: 'specific test' },
        output: { result: 'success' },
        status: ProvenanceStatus.SUCCESS,
        onChainTxHash: '0x1234567890abcdef',
      });
      testRecordId = record.id;
    });

    it('should return a specific provenance record', async () => {
      const response = await request(app.getHttpServer())
        .get(`/provenance/${testRecordId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.id).toBe(testRecordId);
      expect(response.body.agentId).toBe('agent-specific');
      expect(response.body.onChainTxHash).toBe('0x1234567890abcdef');
    });

    it('should return 404 for non-existent record', () => {
      return request(app.getHttpServer())
        .get('/provenance/550e8400-e29b-41d4-a716-446655440999')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(404);
    });
  });

  describe('GET /provenance/:id/export', () => {
    let testRecordId: string;

    beforeAll(async () => {
      const record = await provenanceService.createProvenanceRecord({
        agentId: 'agent-export',
        userId: testUserId,
        action: ProvenanceAction.RESULT_NORMALIZATION,
        input: { raw: 'data' },
        output: { normalized: 'data' },
        status: ProvenanceStatus.SUCCESS,
      });
      testRecordId = record.id;
    });

    it('should export record as JSON', async () => {
      const response = await request(app.getHttpServer())
        .get(`/provenance/${testRecordId}/export?format=json`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('application/json');
      const data = JSON.parse(response.text);
      expect(data.id).toBe(testRecordId);
    });

    it('should export record as CSV', async () => {
      const response = await request(app.getHttpServer())
        .get(`/provenance/${testRecordId}/export?format=csv`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.headers['content-type']).toContain('text/csv');
      expect(response.text).toContain('id,agentId,userId');
    });
  });

  describe('POST /provenance/:id/verify', () => {
    let testRecordId: string;

    beforeAll(async () => {
      const record = await provenanceService.createProvenanceRecord({
        agentId: 'agent-verify',
        userId: testUserId,
        action: ProvenanceAction.REQUEST_RECEIVED,
        input: { test: 'data' },
        status: ProvenanceStatus.SUCCESS,
      });
      testRecordId = record.id;
    });

    it('should verify a valid signature', async () => {
      const response = await request(app.getHttpServer())
        .post(`/provenance/${testRecordId}/verify`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.isValid).toBeDefined();
      expect(response.body.recordId).toBe(testRecordId);
      expect(response.body.recordHash).toBeDefined();
    });
  });

  describe('GET /provenance/agents/:agentId', () => {
    beforeAll(async () => {
      await provenanceService.createProvenanceRecord({
        agentId: 'agent-specific-2',
        userId: testUserId,
        action: ProvenanceAction.REQUEST_RECEIVED,
        input: { query: 'agent test' },
        status: ProvenanceStatus.SUCCESS,
      });
    });

    it('should return provenance for a specific agent', async () => {
      const response = await request(app.getHttpServer())
        .get('/provenance/agents/agent-specific-2')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
      expect(Array.isArray(response.body.data)).toBe(true);
      expect(response.body.data.every((r: any) => r.agentId === 'agent-specific-2')).toBe(true);
    });
  });

  describe('GET /provenance/agents/:agentId/timeline', () => {
    beforeAll(async () => {
      // Create multiple records for timeline
      for (let i = 0; i < 3; i++) {
        await provenanceService.createProvenanceRecord({
          agentId: 'agent-timeline',
          userId: testUserId,
          action: ProvenanceAction.REQUEST_RECEIVED,
          input: { iteration: i },
          status: ProvenanceStatus.SUCCESS,
        });
      }
    });

    it('should return chronological timeline for agent', async () => {
      const response = await request(app.getHttpServer())
        .get('/provenance/agents/agent-timeline/timeline')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.agentId).toBe('agent-timeline');
      expect(response.body.timeline).toBeDefined();
      expect(Array.isArray(response.body.timeline)).toBe(true);
      expect(response.body.total).toBeGreaterThanOrEqual(3);
    });
  });

  describe('Authorization', () => {
    let otherUserId: string;
    let otherUserToken: string;

    beforeAll(() => {
      otherUserId = '550e8400-e29b-41d4-a716-446655440003';
      otherUserToken = jwtService.sign({
        sub: otherUserId,
        email: 'other@test.com',
        role: UserRole.USER,
      });
    });

    beforeAll(async () => {
      // Create record for other user
      await provenanceService.createProvenanceRecord({
        agentId: 'agent-other',
        userId: otherUserId,
        action: ProvenanceAction.REQUEST_RECEIVED,
        input: { query: 'other user' },
        status: ProvenanceStatus.SUCCESS,
      });
    });

    it('should allow admin to access any user provenance', async () => {
      const response = await request(app.getHttpServer())
        .get(`/provenance/users/${otherUserId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
    });

    it('should allow user to access their own provenance', async () => {
      const response = await request(app.getHttpServer())
        .get(`/provenance/users/${testUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200);

      expect(response.body.data).toBeDefined();
    });

    it('should forbid user from accessing other user provenance', () => {
      return request(app.getHttpServer())
        .get(`/provenance/users/${otherUserId}`)
        .set('Authorization', `Bearer ${userToken}`)
        .expect(403);
    });
  });

  describe('ProvenanceService', () => {
    it('should update a provenance record', async () => {
      const record = await provenanceService.createProvenanceRecord({
        agentId: 'agent-update',
        userId: testUserId,
        action: ProvenanceAction.PROVIDER_CALL,
        input: { query: 'update test' },
        status: ProvenanceStatus.PENDING,
      });

      const updated = await provenanceService.updateProvenanceRecord(record.id, {
        status: ProvenanceStatus.SUCCESS,
        output: { result: 'completed' },
        processingDurationMs: 1500,
      });

      expect(updated.status).toBe(ProvenanceStatus.SUCCESS);
      expect(updated.output).toEqual({ result: 'completed' });
      expect(updated.processingDurationMs).toBe(1500);
    });

    it('should export multiple records to CSV', async () => {
      // Create test records
      await provenanceService.createProvenanceRecord({
        agentId: 'agent-csv',
        userId: testUserId,
        action: ProvenanceAction.REQUEST_RECEIVED,
        input: { query: 'csv 1' },
        status: ProvenanceStatus.SUCCESS,
      });

      await provenanceService.createProvenanceRecord({
        agentId: 'agent-csv',
        userId: testUserId,
        action: ProvenanceAction.REQUEST_RECEIVED,
        input: { query: 'csv 2' },
        status: ProvenanceStatus.SUCCESS,
      });

      const csv = await provenanceService.exportProvenanceToCsv({
        agentId: 'agent-csv',
      });

      expect(csv).toContain('id,agentId,userId');
      expect(csv).toContain('agent-csv');
    });
  });
});
