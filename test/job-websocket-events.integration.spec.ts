import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
const io = require('socket.io-client');
import { JwtModule } from '@nestjs/jwt';
import { WebSocketModule } from '../src/websocket/websocket.module';
import { AgentEventsGateway } from '../src/websocket/gateways/agent-events.gateway';
import { QueueModule } from '../src/compute-job-queue/compute-job-queue.module';

type Socket = ReturnType<typeof io>;

// This test assumes a valid JWT token and a running NestJS app

describe('Job WebSocket Event Flow (Integration)', () => {
  let app: INestApplication;
  let gateway: AgentEventsGateway;
  let queueService: any;
  let socket: Socket;
  let jwtToken: string;
  let port: number;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '24h' } }),
        WebSocketModule,
        QueueModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Get the actual server port
    await app.listen(0);
    const server: any = app.getHttpServer();
    port = server.address().port;

    gateway = moduleFixture.get<AgentEventsGateway>(AgentEventsGateway);
    queueService = moduleFixture.get<any>('QueueService');
    const jwtService = moduleFixture.get<any>('JwtService');
    jwtToken = jwtService.sign({ userId: 'test-user', address: '0xtestaddress' });

    socket = io(`http://localhost:${port}/agent-events`, {
      auth: { token: jwtToken },
      transports: ['websocket'],
      timeout: 5000,
    });

    // Wait for socket connection
    await new Promise<void>((resolve, reject) => {
      socket.on('connect', () => resolve());
      socket.on('connect_error', (err: any) => reject(err));
      setTimeout(() => reject(new Error('Socket connection timeout')), 5000);
    });
  });

  afterAll(async () => {
    if (socket && socket.connected) socket.disconnect();
    await app.close();
  });

  it('should subscribe and receive job events', async () => {
    // Add a job
    const jobData = {
      type: 'data-processing',
      payload: { records: [{ id: 1 }] },
      userId: 'test-user',
    };
    const job = await queueService.addComputeJob(jobData);

    // Subscribe to job room
    const subscribeRes: { success: boolean; message?: string } = await new Promise((resolve) => {
      socket.emit('job:subscribe', { jobId: job.id }, (r: any) => resolve(r));
    });
    expect(subscribeRes.success).toBe(true);

    // Listen for job events
    let progressReceived = false;
    let logReceived = false;
    let completeReceived = false;
    let errorReceived = false;

    socket.on('job.progress', (data: { jobId: string }) => {
      progressReceived = true;
      expect(data.jobId).toBe(job.id);
    });
    socket.on('job.log', (data: { jobId: string }) => {
      logReceived = true;
      expect(data.jobId).toBe(job.id);
    });
    socket.on('job.complete', (data: { jobId: string }) => {
      completeReceived = true;
      expect(data.jobId).toBe(job.id);
    });
    socket.on('job.error', (data: { jobId: string }) => {
      errorReceived = true;
      expect(data.jobId).toBe(job.id);
    });

    // Wait for job to finish
    await job.finished();

    // Wait a bit for events to propagate
    await new Promise((resolve) => setTimeout(resolve, 1000));

    expect(progressReceived).toBe(true);
    expect(logReceived).toBe(true);
    expect(completeReceived).toBe(true);
    // errorReceived may be false if job succeeded
  }, 15000);
});