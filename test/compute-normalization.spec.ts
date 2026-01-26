import { Test, TestingModule } from '@nestjs/testing';
import { ComputeService } from '../src/compute/compute.service';
import { CreateComputeResultDto } from '../src/compute/dto/create-compute-result.dto';

describe('ComputeService', () => {
  let service: ComputeService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ComputeService],
    }).compile();

    service = module.get<ComputeService>(ComputeService);
  });

  it('should normalize JSON results deterministically', () => {
    // Test that objects with different key orders produce the same normalized result
    const result1 = '{"a": 1, "b": 2}';
    const result2 = '{"b": 2, "a": 1}';
    
    const normalized1 = (service as any).normalizeResult(result1);
    const normalized2 = (service as any).normalizeResult(result2);
    
    expect(normalized1).toEqual(normalized2);
  });

  it('should generate consistent hashes for same inputs', () => {
    const result1 = '{"a": 1, "b": 2}';
    const result2 = '{"b": 2, "a": 1}'; // Same content, different order
    
    const hash1 = (service as any).generateHash((service as any).normalizeResult(result1));
    const hash2 = (service as any).generateHash((service as any).normalizeResult(result2));
    
    expect(hash1).toEqual(hash2);
  });

  it('should generate different hashes for different inputs', () => {
    const result1 = '{"a": 1, "b": 2}';
    const result2 = '{"a": 1, "b": 3}'; // Different content
    
    const hash1 = (service as any).generateHash((service as any).normalizeResult(result1));
    const hash2 = (service as any).generateHash((service as any).normalizeResult(result2));
    
    expect(hash1).not.toEqual(hash2);
  });

  it('should create and store compute results', () => {
    const dto: CreateComputeResultDto = {
      originalResult: '{"test": "data", "value": 42}',
      metadata: '{"source": "test"}'
    };

    const result = service.createComputeResult(dto);

    expect(result.id).toBeDefined();
    expect(result.originalResult).toEqual('{"test": "data", "value": 42}');
    expect(result.normalizedResult).toEqual('{"test":"data","value":42}'); // Deterministic order
    expect(result.hash).toBeDefined();
    expect(result.metadata).toEqual({ source: 'test' });
    expect(result.createdAt).toBeDefined();
    expect(result.updatedAt).toBeDefined();
  });

  it('should verify results correctly', () => {
    const dto: CreateComputeResultDto = {
      originalResult: '{"verification": "test"}',
    };

    const result = service.createComputeResult(dto);
    const isVerifiedTrue = service.verifyResult(result.id, '{"verification": "test"}');
    const isVerifiedFalse = service.verifyResult(result.id, '{"verification": "different"}');

    expect(isVerifiedTrue).toBe(true);
    expect(isVerifiedFalse).toBe(false);
  });
});