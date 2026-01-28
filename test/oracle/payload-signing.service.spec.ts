import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { Wallet } from 'ethers';
import { PayloadSigningService } from '../../src/oracle/services/payload-signing.service';

describe('PayloadSigningService', () => {
  let service: PayloadSigningService;
  let testWallet: Wallet;
  let configService: ConfigService;

  beforeEach(async () => {
    // Create a test wallet
    testWallet = Wallet.createRandom();

    // Mock ConfigService
    const mockConfigService = {
      get: jest.fn((key: string, defaultValue?: any) => {
        const config: Record<string, any> = {
          CHAIN_ID: '1',
          ORACLE_CONTRACT_ADDRESS: '0x1234567890123456789012345678901234567890',
        };
        return config[key] || defaultValue;
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        PayloadSigningService,
        {
          provide: ConfigService,
          useValue: mockConfigService,
        },
      ],
    }).compile();

    service = module.get<PayloadSigningService>(PayloadSigningService);
    configService = module.get<ConfigService>(ConfigService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('hashPayload', () => {
    it('should hash a payload consistently', () => {
      const payload = { foo: 'bar', baz: 123 };
      const hash1 = service.hashPayload(payload);
      const hash2 = service.hashPayload(payload);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^0x[a-fA-F0-9]{64}$/);
    });

    it('should produce different hashes for different payloads', () => {
      const payload1 = { foo: 'bar' };
      const payload2 = { foo: 'baz' };

      const hash1 = service.hashPayload(payload1);
      const hash2 = service.hashPayload(payload2);

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('createStructuredData', () => {
    it('should create EIP-712 structured data', () => {
      const payloadType = 'oracle_update';
      const payloadHash = '0x' + '1'.repeat(64);
      const nonce = '0';
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const data = { value: 100 };

      const structuredData = service.createStructuredData(
        payloadType,
        payloadHash,
        nonce,
        expiresAt,
        data,
      );

      expect(structuredData.domain).toBeDefined();
      expect(structuredData.domain.name).toBe('StellAIverse Oracle');
      expect(structuredData.domain.version).toBe('1');
      expect(structuredData.domain.chainId).toBe(1);
      expect(structuredData.types).toBeDefined();
      expect(structuredData.value).toBeDefined();
      expect(structuredData.value.payloadType).toBe(payloadType);
      expect(structuredData.value.nonce).toBe(nonce.toString());
    });
  });

  describe('signPayload', () => {
    it('should sign a payload and return signature', async () => {
      const payloadType = 'oracle_update';
      const payload = { value: 100 };
      const payloadHash = service.hashPayload(payload);
      const nonce = '0';
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      const result = await service.signPayload(
        testWallet.privateKey,
        payloadType,
        payloadHash,
        nonce,
        expiresAt,
        payload,
      );

      expect(result.signature).toBeDefined();
      expect(result.signature).toMatch(/^0x[a-fA-F0-9]{130}$/);
      expect(result.signerAddress).toBe(testWallet.address);
    });

    it('should produce different signatures for different payloads', async () => {
      const payloadType = 'oracle_update';
      const payload1 = { value: 100 };
      const payload2 = { value: 200 };
      const nonce = '0';
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      const result1 = await service.signPayload(
        testWallet.privateKey,
        payloadType,
        service.hashPayload(payload1),
        nonce,
        expiresAt,
        payload1,
      );

      const result2 = await service.signPayload(
        testWallet.privateKey,
        payloadType,
        service.hashPayload(payload2),
        nonce,
        expiresAt,
        payload2,
      );

      expect(result1.signature).not.toBe(result2.signature);
    });
  });

  describe('verifySignature', () => {
    it('should verify a valid signature', async () => {
      const payloadType = 'oracle_update';
      const payload = { value: 100 };
      const payloadHash = service.hashPayload(payload);
      const nonce = '0';
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      const { signature, signerAddress } = await service.signPayload(
        testWallet.privateKey,
        payloadType,
        payloadHash,
        nonce,
        expiresAt,
        payload,
      );

      const isValid = service.verifySignature(
        signature,
        payloadType,
        payloadHash,
        nonce,
        expiresAt,
        payload,
        signerAddress,
      );

      expect(isValid).toBe(true);
    });

    it('should reject an invalid signature', () => {
      const payloadType = 'oracle_update';
      const payload = { value: 100 };
      const payloadHash = service.hashPayload(payload);
      const nonce = '0';
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;
      const fakeSignature = '0x' + '1'.repeat(130);

      const isValid = service.verifySignature(
        fakeSignature,
        payloadType,
        payloadHash,
        nonce,
        expiresAt,
        payload,
        testWallet.address,
      );

      expect(isValid).toBe(false);
    });

    it('should reject signature from different signer', async () => {
      const payloadType = 'oracle_update';
      const payload = { value: 100 };
      const payloadHash = service.hashPayload(payload);
      const nonce = '0';
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      const { signature } = await service.signPayload(
        testWallet.privateKey,
        payloadType,
        payloadHash,
        nonce,
        expiresAt,
        payload,
      );

      const differentWallet = Wallet.createRandom();

      const isValid = service.verifySignature(
        signature,
        payloadType,
        payloadHash,
        nonce,
        expiresAt,
        payload,
        differentWallet.address,
      );

      expect(isValid).toBe(false);
    });

    it('should reject signature for modified payload', async () => {
      const payloadType = 'oracle_update';
      const payload = { value: 100 };
      const payloadHash = service.hashPayload(payload);
      const nonce = '0';
      const expiresAt = Math.floor(Date.now() / 1000) + 3600;

      const { signature, signerAddress } = await service.signPayload(
        testWallet.privateKey,
        payloadType,
        payloadHash,
        nonce,
        expiresAt,
        payload,
      );

      // Modify the payload
      const modifiedPayload = { value: 200 };
      const modifiedHash = service.hashPayload(modifiedPayload);

      const isValid = service.verifySignature(
        signature,
        payloadType,
        modifiedHash,
        nonce,
        expiresAt,
        modifiedPayload,
        signerAddress,
      );

      expect(isValid).toBe(false);
    });
  });

  describe('getDomain', () => {
    it('should return the EIP-712 domain', () => {
      const domain = service.getDomain();

      expect(domain.name).toBe('StellAIverse Oracle');
      expect(domain.version).toBe('1');
      expect(domain.chainId).toBe(1);
      expect(domain.verifyingContract).toBe(
        '0x1234567890123456789012345678901234567890',
      );
    });
  });

  describe('getTypes', () => {
    it('should return the EIP-712 types', () => {
      const types = service.getTypes();

      expect(types.OraclePayload).toBeDefined();
      expect(types.OraclePayload).toHaveLength(5);
      expect(types.OraclePayload[0].name).toBe('payloadType');
      expect(types.OraclePayload[1].name).toBe('payloadHash');
      expect(types.OraclePayload[2].name).toBe('nonce');
      expect(types.OraclePayload[3].name).toBe('expiresAt');
      expect(types.OraclePayload[4].name).toBe('data');
    });
  });
});
