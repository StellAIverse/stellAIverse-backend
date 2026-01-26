import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException } from '@nestjs/common';
import { RecoveryService } from '../src/auth/recovery.service';
import { EmailLinkingService } from '../src/auth/email-linking.service';
import { EmailService } from '../src/auth/email.service';
import { ChallengeService } from '../src/auth/challenge.service';
import { User } from '../src/user/entities/user.entity';

describe('RecoveryService', () => {
  let service: RecoveryService;
  let emailLinkingService: EmailLinkingService;
  let emailService: EmailService;
  let challengeService: ChallengeService;

  const mockUser: User = {
    id: '123',
    walletAddress: '0x1234567890123456789012345678901234567890',
    email: 'test@example.com',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEmailLinkingService = {
    getUserByEmail: jest.fn(),
  };

  const mockEmailService = {
    sendRecoveryEmail: jest.fn().mockResolvedValue({
      messageId: 'test-message-id',
      previewUrl: 'https://ethereal.email/message/test',
    }),
  };

  const mockChallengeService = {
    issueChallengeForAddress: jest.fn().mockReturnValue(
      'Sign this message to authenticate: abc123',
    ),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RecoveryService,
        {
          provide: EmailLinkingService,
          useValue: mockEmailLinkingService,
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
        {
          provide: ChallengeService,
          useValue: mockChallengeService,
        },
      ],
    }).compile();

    service = module.get<RecoveryService>(RecoveryService);
    emailLinkingService = module.get<EmailLinkingService>(EmailLinkingService);
    emailService = module.get<EmailService>(EmailService);
    challengeService = module.get<ChallengeService>(ChallengeService);
  });

  describe('requestRecovery', () => {
    it('should send recovery email for verified account', async () => {
      jest.spyOn(emailLinkingService, 'getUserByEmail').mockResolvedValue(mockUser);

      const result = await service.requestRecovery('test@example.com');

      expect(result.message).toContain('Recovery information sent');
      expect(emailService.sendRecoveryEmail).toHaveBeenCalledWith(
        'test@example.com',
        mockUser.walletAddress,
      );
    });

    it('should throw error for non-existent email', async () => {
      jest.spyOn(emailLinkingService, 'getUserByEmail').mockResolvedValue(null);

      await expect(service.requestRecovery('nonexistent@example.com')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should normalize email to lowercase', async () => {
      jest.spyOn(emailLinkingService, 'getUserByEmail').mockResolvedValue(mockUser);

      await service.requestRecovery('TEST@EXAMPLE.COM');

      expect(emailLinkingService.getUserByEmail).toHaveBeenCalledWith('test@example.com');
    });
  });

  describe('verifyRecoveryAndGetChallenge', () => {
    it('should return challenge for verified email', async () => {
      jest.spyOn(emailLinkingService, 'getUserByEmail').mockResolvedValue(mockUser);

      const result = await service.verifyRecoveryAndGetChallenge('test@example.com');

      expect(result.message).toContain('Sign this message');
      expect(result.walletAddress).toBe(mockUser.walletAddress);
      expect(challengeService.issueChallengeForAddress).toHaveBeenCalledWith(
        mockUser.walletAddress,
      );
    });

    it('should throw error for non-existent email', async () => {
      jest.spyOn(emailLinkingService, 'getUserByEmail').mockResolvedValue(null);

      await expect(
        service.verifyRecoveryAndGetChallenge('nonexistent@example.com'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
