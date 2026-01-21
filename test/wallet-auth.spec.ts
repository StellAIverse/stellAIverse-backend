import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { WalletAuthService } from '../src/auth/wallet-auth.service';
import { ChallengeService } from '../src/auth/challenge.service';
import { Wallet } from 'ethers';

describe('Wallet Authentication', () => {
  let walletAuthService: WalletAuthService;
  let challengeService: ChallengeService;
  let jwtService: JwtService;
  let testWallet: any;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ChallengeService,
        WalletAuthService,
        {
          provide: JwtService,
          useValue: {
            sign: (payload) => {
              return 'test-token-' + JSON.stringify(payload);
            },
            verify: (token) => {
              if (token.startsWith('test-token-')) {
                return JSON.parse(token.replace('test-token-', ''));
              }
              throw new Error('Invalid token');
            },
          },
        },
      ],
    }).compile();

    walletAuthService = module.get<WalletAuthService>(WalletAuthService);
    challengeService = module.get<ChallengeService>(ChallengeService);
    jwtService = module.get<JwtService>(JwtService);

    // Create a test wallet
    testWallet = Wallet.createRandom();
  });

  describe('Challenge Issuance', () => {
    it('should issue a valid challenge for an address', () => {
      const address = testWallet.address;
      const message = challengeService.issueChallengeForAddress(address);

      expect(message).toContain('Sign this message to authenticate:');
      expect(message).toBeTruthy();
    });

    it('should extract challenge ID from message', () => {
      const address = testWallet.address;
      const message = challengeService.issueChallengeForAddress(address);
      const challengeId = challengeService.extractChallengeId(message);

      expect(challengeId).toBeTruthy();
      expect(challengeId).toHaveLength(64); // 32 bytes hex
    });

    it('should store challenge with expiration', () => {
      const address = testWallet.address;
      const message = challengeService.issueChallengeForAddress(address);
      const challengeId = challengeService.extractChallengeId(message);

      const challenge = challengeService.getChallenge(challengeId);

      expect(challenge).toBeTruthy();
      expect(challenge.address).toBe(address.toLowerCase());
      expect(challenge.expiresAt).toBeGreaterThan(Date.now());
    });
  });

  describe('Signature Verification', () => {
    it('should verify a valid signature and return JWT token', async () => {
      const address = testWallet.address;
      const message = challengeService.issueChallengeForAddress(address);

      // Sign the message with the wallet
      const signature = await testWallet.signMessage(message);

      const result = await walletAuthService.verifySignatureAndIssueToken(
        message,
        signature,
      );

      expect(result.token).toBeTruthy();
      expect(result.address).toBe(address.toLowerCase());
    });

    it('should reject an invalid signature', async () => {
      const address = testWallet.address;
      const message = challengeService.issueChallengeForAddress(address);

      // Create an invalid signature
      const invalidSignature =
        '0x0000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000';

      await expect(
        walletAuthService.verifySignatureAndIssueToken(message, invalidSignature),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject signature from different address', async () => {
      const address = testWallet.address;
      const message = challengeService.issueChallengeForAddress(address);

      // Create a different wallet and sign with it
      const differentWallet = Wallet.createRandom();
      const signature = await differentWallet.signMessage(message);

      await expect(
        walletAuthService.verifySignatureAndIssueToken(message, signature),
      ).rejects.toThrow(UnauthorizedException);
    });

    it('should reject expired challenge', async () => {
      const address = testWallet.address;
      const message = challengeService.issueChallengeForAddress(address);
      const challengeId = challengeService.extractChallengeId(message);

      // Consume the challenge
      challengeService.consumeChallenge(challengeId);

      const signature = await testWallet.signMessage(message);

      await expect(
        walletAuthService.verifySignatureAndIssueToken(message, signature),
      ).rejects.toThrow(
        new UnauthorizedException(
          'Challenge not found or expired. Please request a new challenge.',
        ),
      );
    });

    it('should consume challenge after successful verification', async () => {
      const address = testWallet.address;
      const message = challengeService.issueChallengeForAddress(address);
      const challengeId = challengeService.extractChallengeId(message);

      const signature = await testWallet.signMessage(message);

      await walletAuthService.verifySignatureAndIssueToken(message, signature);

      // Challenge should be consumed
      const challenge = challengeService.getChallenge(challengeId);
      expect(challenge).toBeNull();
    });
  });

  describe('JWT Token Validation', () => {
    it('should validate a correct token', () => {
      const payload = { address: testWallet.address.toLowerCase(), iat: 0 };
      const token = jwtService.sign(payload);

      const result = walletAuthService.validateToken(token);

      expect(result.address).toBe(payload.address);
    });

    it('should reject an invalid token', () => {
      const invalidToken = 'invalid-token';

      expect(() => {
        walletAuthService.validateToken(invalidToken);
      }).toThrow(UnauthorizedException);
    });
  });

  describe('End-to-End Authentication Flow', () => {
    it('should complete full authentication flow', async () => {
      const address = testWallet.address;

      // 1. Request challenge
      const message = challengeService.issueChallengeForAddress(address);
      expect(message).toContain('Sign this message to authenticate:');

      // 2. Sign message
      const signature = await testWallet.signMessage(message);
      expect(signature).toBeTruthy();

      // 3. Verify signature and get token
      const authResult = await walletAuthService.verifySignatureAndIssueToken(
        message,
        signature,
      );
      expect(authResult.token).toBeTruthy();
      expect(authResult.address).toBe(address.toLowerCase());

      // 4. Validate token
      const payload = walletAuthService.validateToken(authResult.token);
      expect(payload.address).toBe(address.toLowerCase());
    });
  });
});
