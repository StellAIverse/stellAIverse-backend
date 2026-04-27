import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
const request = require('supertest');
import { getRepositoryToken } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { Wallet } from 'ethers';
import { io, Socket } from 'socket.io-client';

import { OracleModule } from '../src/oracle/oracle.module';
import { AuthModule } from '../src/auth/auth.module';
import { UserModule } from '../src/user/user.module';
import { ComputeModule } from '../src/compute/compute.module';
import { WebSocketModule } from '../src/websocket/websocket.module';
import { IndexerModule } from '../src/indexer/indexer.module';

import { SignedPayload, PayloadStatus, PayloadType } from '../src/oracle/entities/signed-payload.entity';
import { SubmissionNonce } from '../src/oracle/entities/submission-nonce.entity';
import { User } from '../src/user/entities/user.entity';
import { EmailVerification } from '../src/auth/entities/email-verification.entity';
import { IndexedEvent } from '../src/indexer/entities/indexed-event.entity';
import { Repository } from 'typeorm';
import { SubmitterService } from '../src/oracle/services/submitter.service';
import { AgentEventsGateway } from '../src/websocket/gateways/agent-events.gateway';

/**
 * TestSubmitterService simulates on-chain submission and confirmation without needing a real Ethereum node.
 * It updates the SignedPayload status, creates an IndexedEvent, and notifies the WebSocket gateway.
 */
class TestSubmitterService {
  constructor(
    private payloadRepo: Repository<SignedPayload>,
    private indexedRepo: Repository<IndexedEvent>,
    private gateway: AgentEventsGateway,
  ) {}

  async submitPayload(payloadId: string) {
    const payload = await this.payloadRepo.findOne({ where: { id: payloadId } });
    if (!payload) throw new Error('payload not found');

    // Simulate immediate submission
    payload.transactionHash = '0xtesttransactionhash';
    payload.status = PayloadStatus.SUBMITTED;
    payload.submittedAt = new Date();
    payload.submissionAttempts = (payload.submissionAttempts || 0) + 1;
    await this.payloadRepo.save(payload);

    // Simulate confirmation
    payload.status = PayloadStatus.CONFIRMED;
    payload.confirmedAt = new Date();
    payload.blockNumber = '12345';
    await this.payloadRepo.save(payload);

    // Insert indexed event (indexer normally picks this up from chain logs)
    await this.indexedRepo.insert({
      txHash: payload.transactionHash,
      logIndex: 0,
      address: process.env.ORACLE_CONTRACT_ADDRESS || '0x0000000000000000000000000000000000000000',
      topic0: null,
      blockNumber: payload.blockNumber,
      blockHash: '0xblockhash',
      data: payload.payloadHash,
      topics: [],
    } as any);

    // Notify websocket subscribers (use a test agent id)
    this.gateway.emitAgentStatusUpdate('test-agent', { status: 'confirmed', payloadId: payloadId });

    return { transactionHash: payload.transactionHash, payload };
  }
}

describe('Full off-chain → on-chain → index flow (E2E)', () => {
  let app: INestApplication;
  let jwtToken: string;
  let testWallet: any;
  let userAddress: string;
  let moduleFixture: TestingModule;
  let indexedRepo: Repository<IndexedEvent>;
  let payloadRepo: Repository<SignedPayload>;
  let socket: Socket;

  beforeAll(async () => {
    // Create test wallet
    testWallet = Wallet.createRandom();
    userAddress = testWallet.address;

    // Minimal in-memory repository implementations
    const createInMemoryRepo = <T extends { id?: string }>() => {
      const m = new Map<string, T>();
      return {
        async save(item: T) {
          if (!item.id) {
            // simple uuid-ish id
            item.id = `id_${Math.random().toString(36).slice(2, 9)}`;
          }
          m.set(item.id, { ...item });
          return { ...item };
        },
        async findOne(opts: any) {
          if (opts && opts.where && opts.where.id) {
            return m.get(opts.where.id) || null;
          }
          // support other lookup patterns if necessary
          return null;
        },
        async find() {
          return Array.from(m.values());
        },
        async insert(obj: any) {
          if (!obj.id) obj.id = `id_${Math.random().toString(36).slice(2, 9)}`;
          m.set(obj.id, { ...obj });
          return obj;
        },
        // helper for test assertions
        __raw: m,
      };
    };

    const signedPayloadRepoMock = createInMemoryRepo<SignedPayload>();
    const indexedRepoMock = createInMemoryRepo<IndexedEvent>();

    const moduleRef = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true, envFilePath: '.env.test' }),
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '24h' } }),
        OracleModule,
        AuthModule,
        ComputeModule,
        WebSocketModule,
        IndexerModule,
      ],
      providers: [
        { provide: getRepositoryToken(SignedPayload), useValue: signedPayloadRepoMock },
        { provide: getRepositoryToken(IndexedEvent), useValue: indexedRepoMock },
      ],
    })
      // Provide TestSubmitterService which uses the in-memory repositories
      .overrideProvider(SubmitterService)
      .useFactory({
        factory: (payloadRepo: any, idxRepo: any, gateway: AgentEventsGateway) => {
          return new TestSubmitterService(payloadRepo, idxRepo, gateway);
        },
        inject: [getRepositoryToken(SignedPayload), getRepositoryToken(IndexedEvent), AgentEventsGateway],
      })
      .compile();

    moduleFixture = moduleRef;

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    // start server on random port so socket.io client can connect
    await app.listen(0);
    const server: any = app.getHttpServer();
    const port = server.address().port;

    // Create JWT token for testing authenticated endpoints
    const jwtService = app.get('JwtService');
    jwtToken = jwtService.sign({ address: userAddress.toLowerCase() });

    indexedRepo = moduleFixture.get(getRepositoryToken(IndexedEvent));
    payloadRepo = moduleFixture.get(getRepositoryToken(SignedPayload));

    // Connect websocket client
    socket = io(`http://localhost:${port}/agent-events`, {
      auth: { token: jwtToken },
      transports: ['websocket'],
      timeout: 5000,
    });

    // Wait for connection
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', (err: any) => reject(err));
      setTimeout(() => reject(new Error('Socket connection timeout')), 3000);
    });
  });

  afterAll(async () => {
    if (socket && socket.connected) socket.disconnect();
    await app.close();
  });

  it('should complete compute → sign → submit → index flow and receive websocket update', async () => {
    // 1) Create compute result
    const createComputeDto = {
      originalResult: JSON.stringify({ value: 42 }),
      metadata: JSON.stringify({ agentId: 'test-agent' }),
    };

    const computeRes = await request(app.getHttpServer())
      .post('/compute')
      .send(createComputeDto)
      .expect(201);

    expect(computeRes.body.id).toBeDefined();

    // 2) Create a payload referencing the compute result
    const createPayloadDto = {
      payloadType: PayloadType.ORACLE_UPDATE,
      payload: { computeResultId: computeRes.body.id, value: 42 },
      metadata: { source: 'e2e-test' },
    };

    const createPayloadRes = await request(app.getHttpServer())
      .post('/oracle/payloads')
      .set('Authorization', `Bearer ${jwtToken}`)
      .send(createPayloadDto)
      .expect(201);

    const payloadId = createPayloadRes.body.id;
    expect(payloadId).toBeDefined();

    // 3) Sign the payload
    const signRes = await request(app.getHttpServer())
      .post(`/oracle/payloads/${payloadId}/sign`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .send({ payloadId, privateKey: testWallet.privateKey })
      .expect(200);

    expect(signRes.body.signature).toBeDefined();
    expect(signRes.body.status).toBe('pending');

    // 4) Subscribe websocket client to agent updates
    const subscribeRes = await new Promise<any>((resolve) => {
      socket.emit('agent:subscribe', { agentId: 'test-agent' }, (r: any) => resolve(r));
    });

    expect(subscribeRes.success).toBe(true);
    expect(subscribeRes.message).toMatch(/Subscribed to agent/);

    // 5) Submit payload (this will use TestSubmitterService)
    await request(app.getHttpServer())
      .post(`/oracle/payloads/${payloadId}/submit`)
      .set('Authorization', `Bearer ${jwtToken}`)
      .expect(201);

    // 6) Await websocket agent:status message
    const wsMsg: any = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('Timeout waiting for websocket message')), 3000);
      socket.on('agent:status', (msg: any) => {
        clearTimeout(timeout);
        resolve(msg);
      });
    });

    expect(wsMsg).toBeDefined();
    expect(wsMsg.agentId).toBe('test-agent');
    expect(wsMsg.status.status).toBe('confirmed');
    expect(wsMsg.status.payloadId).toBe(payloadId);

    // 7) Verify payload is confirmed in DB
    const stored = await payloadRepo.findOne({ where: { id: payloadId } });
    expect(stored).toBeDefined();
    expect(stored.status).toBe(PayloadStatus.CONFIRMED);
    expect(stored.transactionHash).toBe('0xtesttransactionhash');

    // 8) Verify IndexedEvent exists
    const events = await indexedRepo.find();
    expect(events.length).toBeGreaterThan(0);
    expect(events[0].txHash).toBe('0xtesttransactionhash');
  }, 20000);
});
