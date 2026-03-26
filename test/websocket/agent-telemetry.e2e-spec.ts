import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
const io = require('socket.io-client');
import { JwtModule, JwtService } from '@nestjs/jwt';
import { WebSocketModule } from '../../src/websocket/websocket.module';
import { AgentTelemetryGateway } from '../../src/websocket/agent-telemetry.gateway';
import { UserRole } from '../../src/user/entities/user.entity';
import { UserService } from '../../src/user/user.service';

type Socket = ReturnType<typeof io>;

describe('Agent Telemetry WebSocket (E2E)', () => {
  let app: INestApplication;
  let gateway: AgentTelemetryGateway;
  let userService: UserService;
  let jwtService: JwtService;
  let port: number;

  const mockUser = {
    id: 'test-user-id',
    role: UserRole.OPERATOR,
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        JwtModule.register({ secret: 'test-secret', signOptions: { expiresIn: '24h' } }),
        WebSocketModule,
      ],
    })
    .overrideProvider(UserService)
    .useValue({
      findOne: jest.fn().mockResolvedValue(mockUser),
    })
    .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    await app.listen(0);
    const server: any = app.getHttpServer();
    port = server.address().port;

    gateway = moduleFixture.get<AgentTelemetryGateway>(AgentTelemetryGateway);
    userService = moduleFixture.get<UserService>(UserService);
    jwtService = moduleFixture.get<JwtService>(JwtService);
  });

  afterAll(async () => {
    await app.close();
  });

  const createSocket = (userId: string): Socket => {
    const token = jwtService.sign({ userId, walletAddress: '0xtest' });
    return io(`http://localhost:${port}/agent-telemetry`, {
      auth: { token },
      transports: ['websocket'],
    });
  };

  it('should connect and receive welcome message', (done) => {
    const socket = createSocket('test-user-id');
    socket.on('telemetry:welcome', (data: any) => {
      expect(data.message).toContain('Connected');
      socket.disconnect();
      done();
    });
  });

  it('should subscribe and receive telemetry events', (done) => {
    const socket = createSocket('test-user-id');
    
    socket.on('connect', () => {
      socket.emit('telemetry:subscribe', { agentId: 'agent-1' }, (res: any) => {
        expect(res.success).toBe(true);
        
        // Simulating an event from the backend
        gateway.broadcastTelemetry({
          agentId: 'agent-1',
          type: 'heartbeat',
          severity: 'info',
          data: { status: 'ok' },
          timestamp: new Date().toISOString(),
        });
      });
    });

    socket.on('telemetry:event', (event: any) => {
      expect(event.agentId).toBe('agent-1');
      expect(event.type).toBe('heartbeat');
      socket.disconnect();
      done();
    });
  });

  it('should filter telemetry events by type', (done) => {
    const socket = createSocket('test-user-id');
    
    socket.on('connect', () => {
      socket.emit('telemetry:subscribe', { agentId: 'agent-1', types: ['error'] }, (res: any) => {
        expect(res.success).toBe(true);
        
        // This should NOT be received
        gateway.broadcastTelemetry({
          agentId: 'agent-1',
          type: 'heartbeat',
          severity: 'info',
          data: { status: 'ok' },
          timestamp: new Date().toISOString(),
        });

        // This SHOULD be received
        setTimeout(() => {
          gateway.broadcastTelemetry({
            agentId: 'agent-1',
            type: 'error',
            severity: 'error',
            data: { error: 'Test error' },
            timestamp: new Date().toISOString(),
          });
        }, 100);
      });
    });

    socket.on('telemetry:event', (event: any) => {
      expect(event.type).toBe('error');
      socket.disconnect();
      done();
    });
  });

  it('should block unauthorized users (RBAC)', (done) => {
    // Override user service to return a normal USER
    (userService.findOne as jest.Mock).mockResolvedValueOnce({
      id: 'normal-user',
      role: UserRole.USER,
    });

    const socket = createSocket('normal-user');
    
    socket.on('connect', () => {
      socket.emit('telemetry:subscribe', { agentId: 'agent-1' }, (res: any) => {
        expect(res.success).toBe(false);
        expect(res.message).toContain('Unauthorized');
        socket.disconnect();
        done();
      });
    });
  });
});
