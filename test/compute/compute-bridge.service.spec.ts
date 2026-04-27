import { Test, TestingModule } from '@nestjs/testing';
import { ComputeBridgeService } from '../../src/compute/compute-bridge.service';
import { OpenAIAdapter } from '../../src/compute/providers/openai.adapter';
import { MockAdapter } from '../../src/compute/providers/mock.adapter';
import { ProviderType } from '../../src/compute/interfaces/provider.interface';
import { NotFoundException } from '@nestjs/common';

describe('ComputeBridgeService', () => {
  let service: ComputeBridgeService;
  let openaiAdapter: OpenAIAdapter;
  let mockAdapter: MockAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ComputeBridgeService,
        {
          provide: OpenAIAdapter,
          useValue: {
            initialize: jest.fn().mockResolvedValue(undefined),
            execute: jest.fn().mockResolvedValue({ response: 'openai' }),
            getStatus: jest.fn().mockResolvedValue({ status: 'ready', healthy: true }),
            getProviderType: jest.fn().mockReturnValue(ProviderType.OPENAI),
          },
        },
        {
          provide: MockAdapter,
          useValue: {
            initialize: jest.fn().mockResolvedValue(undefined),
            execute: jest.fn().mockResolvedValue({ response: 'mock' }),
            getStatus: jest.fn().mockResolvedValue({ status: 'ready', healthy: true }),
            getProviderType: jest.fn().mockReturnValue(ProviderType.MOCK),
          },
        },
      ],
    }).compile();

    service = module.get<ComputeBridgeService>(ComputeBridgeService);
    openaiAdapter = module.get<OpenAIAdapter>(OpenAIAdapter);
    mockAdapter = module.get<MockAdapter>(MockAdapter);

    // Manually trigger onModuleInit
    await service.onModuleInit();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should list available providers', () => {
    const providers = service.getAvailableProviders();
    expect(providers).toContain(ProviderType.OPENAI);
    expect(providers).toContain(ProviderType.MOCK);
  });

  it('should route request to OpenAI adapter', async () => {
    const request = { model: 'gpt-4', messages: [] };
    const result = await service.execute(ProviderType.OPENAI, request);

    expect(result).toEqual({ response: 'openai' });
    expect(openaiAdapter.execute).toHaveBeenCalledWith(request);
  });

  it('should route request to Mock adapter', async () => {
    const request = { model: 'mock-model' };
    const result = await service.execute(ProviderType.MOCK, request);

    expect(result).toEqual({ response: 'mock' });
    expect(mockAdapter.execute).toHaveBeenCalledWith(request);
  });

  it('should throw NotFoundException for unknown provider', async () => {
    await expect(service.execute('unknown' as any, {})).rejects.toThrow(NotFoundException);
  });

  it('should return statuses of all providers', async () => {
    const statuses = await service.getProvidersStatus();
    expect(statuses[ProviderType.OPENAI]).toEqual({ status: 'ready', healthy: true });
    expect(statuses[ProviderType.MOCK]).toEqual({ status: 'ready', healthy: true });
  });
});
