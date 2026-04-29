import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext, ConflictException, BadRequestException } from '@nestjs/common';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NonceGuard } from './nonce.guard';
import { SubmissionNonce } from '../../oracle/entities/submission-nonce.entity';

const mockNonceRepository = {
  findOne: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
};

function makeContext(body: Record<string, unknown>): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ body }),
    }),
  } as unknown as ExecutionContext;
}

describe('NonceGuard', () => {
  let guard: NonceGuard;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        NonceGuard,
        { provide: getRepositoryToken(SubmissionNonce), useValue: mockNonceRepository },
      ],
    }).compile();

    guard = module.get<NonceGuard>(NonceGuard);
    jest.clearAllMocks();
  });

  it('rejects request missing nonce', async () => {
    await expect(guard.canActivate(makeContext({ userId: 'u1' }))).rejects.toThrow(
      BadRequestException,
    );
  });

  it('accepts first-time nonce', async () => {
    mockNonceRepository.findOne.mockResolvedValue(null);
    mockNonceRepository.create.mockReturnValue({ address: 'u1', nonce: '1' });
    mockNonceRepository.save.mockResolvedValue({});

    const result = await guard.canActivate(makeContext({ userId: 'u1', nonce: 1 }));
    expect(result).toBe(true);
  });

  it('accepts higher nonce', async () => {
    mockNonceRepository.findOne.mockResolvedValue({ address: 'u1', nonce: '5' });
    mockNonceRepository.save.mockResolvedValue({});

    const result = await guard.canActivate(makeContext({ userId: 'u1', nonce: 6 }));
    expect(result).toBe(true);
  });

  it('rejects duplicate nonce with HTTP 409', async () => {
    mockNonceRepository.findOne.mockResolvedValue({ address: 'u1', nonce: '5' });

    await expect(guard.canActivate(makeContext({ userId: 'u1', nonce: 5 }))).rejects.toThrow(
      ConflictException,
    );
  });

  it('rejects replay attack (lower nonce)', async () => {
    mockNonceRepository.findOne.mockResolvedValue({ address: 'u1', nonce: '10' });

    await expect(guard.canActivate(makeContext({ userId: 'u1', nonce: 3 }))).rejects.toThrow(
      ConflictException,
    );
  });
});
