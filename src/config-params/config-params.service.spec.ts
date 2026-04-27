import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken, getDataSourceToken } from '@nestjs/typeorm';
import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { ConfigParamsService } from './config-params.service';
import { ConfigParam } from './entities/config-param.entity';

const makeParam = (overrides: Partial<ConfigParam> = {}): ConfigParam => ({
  id: 'id-1',
  key: 'fee_rate',
  value: '0.01',
  description: 'Fee rate',
  isReadonly: false,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...overrides,
});

const makeDataSource = (returnParam: ConfigParam | null, updatedParam?: ConfigParam) => ({
  transaction: jest.fn(async (cb: (manager: any) => Promise<any>) => {
    let callCount = 0;
    const manager = {
      getRepository: jest.fn(() => ({
        createQueryBuilder: jest.fn(() => ({
          where: jest.fn().mockReturnThis(),
          setLock: jest.fn().mockReturnThis(),
          getOne: jest.fn().mockResolvedValue(returnParam),
        })),
        update: jest.fn().mockResolvedValue(undefined),
        findOne: jest.fn().mockResolvedValue(updatedParam ?? { ...returnParam, value: 'NEW' }),
      })),
    };
    return cb(manager);
  }),
});

describe('ConfigParamsService', () => {
  let service: ConfigParamsService;
  let repoMock: any;
  let dataSourceMock: any;

  const setupModule = async (param: ConfigParam | null, updatedParam?: ConfigParam) => {
    repoMock = {
      create: jest.fn((dto) => dto),
      save: jest.fn(async (e) => e),
      find: jest.fn().mockResolvedValue([]),
      findOne: jest.fn().mockResolvedValue(param),
    };
    dataSourceMock = makeDataSource(param, updatedParam);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ConfigParamsService,
        { provide: getRepositoryToken(ConfigParam), useValue: repoMock },
        { provide: getDataSourceToken(), useValue: dataSourceMock },
      ],
    }).compile();

    service = module.get<ConfigParamsService>(ConfigParamsService);
  };

  it('should be defined', async () => {
    await setupModule(makeParam());
    expect(service).toBeDefined();
  });

  describe('safeUpdate', () => {
    it('updates only the value field and returns diff', async () => {
      const original = makeParam({ value: '0.01' });
      const updated = makeParam({ value: '0.02' });
      await setupModule(original, updated);

      const result = await service.safeUpdate('fee_rate', { value: '0.02' });

      expect(result.before.value).toBe('0.01');
      expect(result.after.value).toBe('0.02');
      expect(result.mutatedFields).toContain('value');
    });

    it('throws NotFoundException when key does not exist', async () => {
      await setupModule(null);
      await expect(service.safeUpdate('missing', { value: 'x' })).rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException for readonly params', async () => {
      await setupModule(makeParam({ isReadonly: true }));
      await expect(service.safeUpdate('fee_rate', { value: '0.05' })).rejects.toThrow(ForbiddenException);
    });

    it('throws BadRequestException when no valid fields provided', async () => {
      await setupModule(makeParam());
      await expect(service.safeUpdate('fee_rate', {} as any)).rejects.toThrow(BadRequestException);
    });

    it('does not mutate key or isReadonly', async () => {
      const original = makeParam({ value: '0.01' });
      const updated = makeParam({ value: '0.02', isReadonly: false, key: 'fee_rate' });
      await setupModule(original, updated);

      const result = await service.safeUpdate('fee_rate', { value: '0.02' });
      // Only value should appear in mutatedFields, not key or isReadonly
      expect(result.mutatedFields).not.toContain('key');
      expect(result.mutatedFields).not.toContain('isReadonly');
    });
  });

  describe('findOne', () => {
    it('throws NotFoundException when key not found', async () => {
      await setupModule(null);
      await expect(service.findOne('unknown')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('throws BadRequestException when key already exists', async () => {
      await setupModule(makeParam());
      await expect(service.create({ key: 'fee_rate', value: 'x' })).rejects.toThrow(BadRequestException);
    });
  });
});
