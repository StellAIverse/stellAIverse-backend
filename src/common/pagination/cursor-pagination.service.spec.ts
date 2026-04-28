import { Test, TestingModule } from '@nestjs/testing';
import { CursorPaginationService } from './cursor-pagination.service';
import { Repository } from 'typeorm';
import { getRepositoryToken } from '@nestjs/typeorm';

describe('CursorPaginationService', () => {
  let service: CursorPaginationService;
  let mockRepository: jest.Mocked<Repository<any>>;

  beforeEach(async () => {
    mockRepository = {
      createQueryBuilder: jest.fn(),
      getMany: jest.fn(),
    } as any;

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CursorPaginationService,
        {
          provide: getRepositoryToken('TestEntity'),
          useValue: mockRepository,
        },
      ],
    }).compile();

    service = module.get<CursorPaginationService>(CursorPaginationService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('paginateWithCursor', () => {
    it('should handle forward pagination correctly', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: '1', createdAt: new Date('2023-01-01') },
          { id: '2', createdAt: new Date('2023-01-02') },
          { id: '3', createdAt: new Date('2023-01-03') },
        ]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.paginateWithCursor(mockRepository, {
        limit: 2,
        direction: 'forward',
        orderBy: 'createdAt',
        orderDirection: 'DESC',
      });

      expect(result.data).toHaveLength(2);
      expect(result.hasMore).toBe(true);
      expect(result.hasPrevious).toBe(false);
      expect(mockQueryBuilder.orderBy).toHaveBeenCalledWith('TestEntity.createdAt', 'DESC');
      expect(mockQueryBuilder.limit).toHaveBeenCalledWith(3); // limit + 1 for hasMore check
    });

    it('should handle backward pagination correctly', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([
          { id: '1', createdAt: new Date('2023-01-01') },
          { id: '2', createdAt: new Date('2023-01-02') },
        ]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const cursor = service.createCursorFromValue({
        id: '3',
        createdAt: new Date('2023-01-03').toISOString(),
      });

      const result = await service.paginateWithCursor(mockRepository, {
        cursor,
        limit: 2,
        direction: 'backward',
        orderBy: 'createdAt',
        orderDirection: 'DESC',
      });

      expect(result.data).toHaveLength(2);
      expect(mockQueryBuilder.andWhere).toHaveBeenCalledWith(
        'TestEntity.createdAt < :cursor',
        { cursor: new Date('2023-01-03').toISOString() }
      );
    });

    it('should handle cursor encoding/decoding', () => {
      const testData = {
        id: 'test-id',
        createdAt: '2023-01-01T00:00:00.000Z',
        updatedAt: '2023-01-01T00:00:00.000Z',
      };

      const cursor = service.createCursorFromValue(testData);
      expect(typeof cursor).toBe('string');

      const isValid = service.validateCursor(cursor);
      expect(isValid).toBe(true);

      const invalidCursor = 'invalid-cursor';
      expect(service.validateCursor(invalidCursor)).toBe(false);
    });

    it('should apply additional conditions when provided', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const additionalConditions = jest.fn().mockReturnValue(mockQueryBuilder);

      await service.paginateWithCursor(
        mockRepository,
        {
          limit: 10,
          direction: 'forward',
          orderBy: 'createdAt',
          orderDirection: 'DESC',
        },
        additionalConditions
      );

      expect(additionalConditions).toHaveBeenCalled();
    });
  });

  describe('cursor operations', () => {
    it('should validate cursor format', () => {
      const validCursor = service.createCursorFromValue({ test: 'data' });
      expect(service.validateCursor(validCursor)).toBe(true);

      expect(service.validateCursor('')).toBe(false);
      expect(service.validateCursor('invalid')).toBe(false);
    });

    it('should handle empty cursor gracefully', async () => {
      const mockQueryBuilder = {
        select: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        addOrderBy: jest.fn().mockReturnThis(),
        limit: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      mockRepository.createQueryBuilder.mockReturnValue(mockQueryBuilder);

      const result = await service.paginateWithCursor(mockRepository, {
        limit: 10,
        direction: 'forward',
        orderBy: 'createdAt',
        orderDirection: 'DESC',
      });

      expect(result.data).toEqual([]);
      expect(result.hasMore).toBe(false);
      expect(result.hasPrevious).toBe(false);
      expect(mockQueryBuilder.andWhere).not.toHaveBeenCalled();
    });
  });
});
