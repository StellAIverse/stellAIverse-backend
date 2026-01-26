import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { BadRequestException, ConflictException, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { EmailLinkingService } from '../src/auth/email-linking.service';
import { EmailService } from '../src/auth/email.service';
import { User } from '../src/user/entities/user.entity';
import { EmailVerification } from '../src/auth/entities/email-verification.entity';

describe('EmailLinkingService', () => {
  let service: EmailLinkingService;
  let userRepository: Repository<User>;
  let emailVerificationRepository: Repository<EmailVerification>;
  let emailService: EmailService;

  const mockUser: User = {
    id: '123',
    walletAddress: '0x1234567890123456789012345678901234567890',
    email: null,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockEmailService = {
    sendVerificationEmail: jest.fn().mockResolvedValue({
      messageId: 'test-message-id',
      previewUrl: 'https://ethereal.email/message/test',
    }),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmailLinkingService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(EmailVerification),
          useValue: {
            findOne: jest.fn(),
            create: jest.fn(),
            save: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: EmailService,
          useValue: mockEmailService,
        },
      ],
    }).compile();

    service = module.get<EmailLinkingService>(EmailLinkingService);
    userRepository = module.get<Repository<User>>(getRepositoryToken(User));
    emailVerificationRepository = module.get<Repository<EmailVerification>>(
      getRepositoryToken(EmailVerification),
    );
    emailService = module.get<EmailService>(EmailService);
  });

  describe('initiateEmailLinking', () => {
    it('should initiate email linking for new user', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);
      jest.spyOn(userRepository, 'create').mockReturnValue(mockUser);
      jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser);
      jest.spyOn(emailVerificationRepository, 'delete').mockResolvedValue(undefined);
      jest.spyOn(emailVerificationRepository, 'create').mockReturnValue({} as EmailVerification);
      jest.spyOn(emailVerificationRepository, 'save').mockResolvedValue({} as EmailVerification);

      const result = await service.initiateEmailLinking(
        '0x1234567890123456789012345678901234567890',
        'test@example.com',
      );

      expect(result.message).toContain('Verification email sent');
      expect(emailService.sendVerificationEmail).toHaveBeenCalled();
    });

    it('should reject invalid email format', async () => {
      await expect(
        service.initiateEmailLinking(
          '0x1234567890123456789012345678901234567890',
          'invalid-email',
        ),
      ).rejects.toThrow(BadRequestException);
    });

    it('should reject email already linked to another wallet', async () => {
      const existingUser = { ...mockUser, walletAddress: '0xdifferent' };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(existingUser);

      await expect(
        service.initiateEmailLinking(
          '0x1234567890123456789012345678901234567890',
          'test@example.com',
        ),
      ).rejects.toThrow(ConflictException);
    });

    it('should reject if email already verified for this wallet', async () => {
      const verifiedUser = {
        ...mockUser,
        email: 'test@example.com',
        emailVerified: true,
      };
      jest.spyOn(userRepository, 'findOne')
        .mockResolvedValueOnce(null) // First call for email check
        .mockResolvedValueOnce(verifiedUser); // Second call for wallet check

      await expect(
        service.initiateEmailLinking(
          '0x1234567890123456789012345678901234567890',
          'test@example.com',
        ),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('verifyEmailAndLink', () => {
    it('should verify email and link to wallet', async () => {
      const verification: EmailVerification = {
        id: '1',
        email: 'test@example.com',
        token: 'a'.repeat(64),
        walletAddress: '0x1234567890123456789012345678901234567890',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        createdAt: new Date(),
      };

      jest.spyOn(emailVerificationRepository, 'findOne').mockResolvedValue(verification);
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);
      jest.spyOn(userRepository, 'save').mockResolvedValue({
        ...mockUser,
        email: 'test@example.com',
        emailVerified: true,
      });
      jest.spyOn(emailVerificationRepository, 'delete').mockResolvedValue(undefined);

      const result = await service.verifyEmailAndLink('a'.repeat(64));

      expect(result.message).toContain('successfully verified');
      expect(result.email).toBe('test@example.com');
    });

    it('should reject invalid token', async () => {
      jest.spyOn(emailVerificationRepository, 'findOne').mockResolvedValue(null);

      await expect(service.verifyEmailAndLink('invalid-token')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should reject expired token', async () => {
      const expiredVerification: EmailVerification = {
        id: '1',
        email: 'test@example.com',
        token: 'a'.repeat(64),
        walletAddress: '0x1234567890123456789012345678901234567890',
        expiresAt: new Date(Date.now() - 1000), // Expired
        createdAt: new Date(),
      };

      jest.spyOn(emailVerificationRepository, 'findOne').mockResolvedValue(expiredVerification);
      jest.spyOn(emailVerificationRepository, 'delete').mockResolvedValue(undefined);

      await expect(service.verifyEmailAndLink('a'.repeat(64))).rejects.toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('getAccountInfo', () => {
    it('should return account info for wallet with linked email', async () => {
      const userWithEmail = {
        ...mockUser,
        email: 'test@example.com',
        emailVerified: true,
      };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWithEmail);

      const result = await service.getAccountInfo('0x1234567890123456789012345678901234567890');

      expect(result.email).toBe('test@example.com');
      expect(result.emailVerified).toBe(true);
    });

    it('should return null email for wallet without linked email', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(null);

      const result = await service.getAccountInfo('0x1234567890123456789012345678901234567890');

      expect(result.email).toBeNull();
      expect(result.emailVerified).toBe(false);
    });
  });

  describe('unlinkEmail', () => {
    it('should unlink email from wallet', async () => {
      const userWithEmail = {
        ...mockUser,
        email: 'test@example.com',
        emailVerified: true,
      };
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(userWithEmail);
      jest.spyOn(userRepository, 'save').mockResolvedValue(mockUser);
      jest.spyOn(emailVerificationRepository, 'delete').mockResolvedValue(undefined);

      const result = await service.unlinkEmail('0x1234567890123456789012345678901234567890');

      expect(result.message).toContain('successfully unlinked');
    });

    it('should throw error if no email linked', async () => {
      jest.spyOn(userRepository, 'findOne').mockResolvedValue(mockUser);

      await expect(
        service.unlinkEmail('0x1234567890123456789012345678901234567890'),
      ).rejects.toThrow(NotFoundException);
    });
  });
});
