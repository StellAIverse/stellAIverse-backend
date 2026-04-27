import { Test, TestingModule } from '@nestjs/testing';
import { OpenAIAdapter } from '../../../src/compute/providers/openai.adapter';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('OpenAIAdapter', () => {
  let adapter: OpenAIAdapter;
  let configService: ConfigService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        OpenAIAdapter,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn((key) => {
              if (key === 'OPENAI_API_KEY') return 'test-key';
              if (key === 'OPENAI_BASE_URL') return 'https://api.openai.com/v1';
              return null;
            }),
          },
        },
      ],
    }).compile();

    adapter = module.get<OpenAIAdapter>(OpenAIAdapter);
    configService = module.get<ConfigService>(ConfigService);

    mockedAxios.create.mockReturnValue(mockedAxios as any);
  });

  it('should be defined', () => {
    expect(adapter).toBeDefined();
  });

  it('should initialize with config', async () => {
    await adapter.initialize();
    expect(mockedAxios.create).toHaveBeenCalledWith(expect.objectContaining({
      baseURL: 'https://api.openai.com/v1',
      headers: expect.objectContaining({
        Authorization: 'Bearer test-key',
      }),
    }));
  });

  it('should execute request successfully', async () => {
    const request = { model: 'gpt-4', messages: [{ role: 'user', content: 'hi' }] };
    const responseData = { id: 'resp-1', choices: [{ message: { content: 'hello' } }] };
    
    mockedAxios.post.mockResolvedValueOnce({ data: responseData });

    const result = await adapter.execute(request);
    expect(result).toEqual(responseData);
    expect(mockedAxios.post).toHaveBeenCalledWith('/chat/completions', request);
  });

  it('should throw error on execution failure', async () => {
    mockedAxios.post.mockRejectedValueOnce(new Error('API Error'));

    await expect(adapter.execute({})).rejects.toThrow('API Error');
  });

  it('should return health status', async () => {
    await adapter.initialize();
    mockedAxios.get.mockResolvedValueOnce({ status: 200 });

    const status = await adapter.getStatus();
    expect(status).toEqual({ status: 'ready', healthy: true });
  });

  it('should return error status on failure', async () => {
    await adapter.initialize();
    mockedAxios.get.mockRejectedValueOnce(new Error('Network Error'));

    const status = await adapter.getStatus();
    expect(status).toEqual({ status: 'error', healthy: false });
  });
});
