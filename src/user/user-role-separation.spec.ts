import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { UserService } from './user.service';
import { User, UserRole } from './entities/user.entity';

const makeUser = (role: UserRole = UserRole.USER): User =>
  ({
    id: 'user-1',
    role,
    username: null,
    walletAddress: '0xabc',
    email: null,
    password: null,
    emailVerified: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    provenanceRecords: [],
    wallets: [],
    referralCode: null,
    referredById: null,
    referredBy: null,
    referrals: [],
  } as unknown as User);

const mockRepo = () => ({
  findOne: jest.fn(),
  save: jest.fn(async (u: User) => u),
  find: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  insert: jest.fn(),
});

describe('UserService — role separation (Governance vs KYC)', () => {
  let service: UserService;
  let repo: ReturnType<typeof mockRepo>;

  beforeEach(async () => {
    repo = mockRepo();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        { provide: getRepositoryToken(User), useValue: repo },
      ],
    }).compile();
    service = module.get<UserService>(UserService);
  });

  describe('assertNoRoleConflict', () => {
    it('throws when assigning KYC_OPERATOR to a GOVERNANCE_OPERATOR user', () => {
      expect(() =>
        service.assertNoRoleConflict(
          UserRole.GOVERNANCE_OPERATOR,
          UserRole.KYC_OPERATOR,
        ),
      ).toThrow(BadRequestException);
    });

    it('throws when assigning GOVERNANCE_OPERATOR to a KYC_OPERATOR user', () => {
      expect(() =>
        service.assertNoRoleConflict(
          UserRole.KYC_OPERATOR,
          UserRole.GOVERNANCE_OPERATOR,
        ),
      ).toThrow(BadRequestException);
    });

    it('does not throw when assigning same role', () => {
      expect(() =>
        service.assertNoRoleConflict(
          UserRole.GOVERNANCE_OPERATOR,
          UserRole.GOVERNANCE_OPERATOR,
        ),
      ).not.toThrow();
    });

    it('does not throw when assigning unrelated roles', () => {
      expect(() =>
        service.assertNoRoleConflict(UserRole.USER, UserRole.ADMIN),
      ).not.toThrow();
    });
  });

  describe('assignRole', () => {
    it('throws BadRequestException when assigning KYC_OPERATOR to GOVERNANCE_OPERATOR user', async () => {
      repo.findOne.mockResolvedValue(makeUser(UserRole.GOVERNANCE_OPERATOR));
      await expect(
        service.assignRole('user-1', UserRole.KYC_OPERATOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws BadRequestException when assigning GOVERNANCE_OPERATOR to KYC_OPERATOR user', async () => {
      repo.findOne.mockResolvedValue(makeUser(UserRole.KYC_OPERATOR));
      await expect(
        service.assignRole('user-1', UserRole.GOVERNANCE_OPERATOR),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws NotFoundException when user does not exist', async () => {
      repo.findOne.mockResolvedValue(null);
      await expect(
        service.assignRole('nonexistent', UserRole.GOVERNANCE_OPERATOR),
      ).rejects.toThrow(NotFoundException);
    });

    it('successfully assigns GOVERNANCE_OPERATOR to a plain USER', async () => {
      const user = makeUser(UserRole.USER);
      repo.findOne.mockResolvedValue(user);
      const result = await service.assignRole('user-1', UserRole.GOVERNANCE_OPERATOR);
      expect(result.role).toBe(UserRole.GOVERNANCE_OPERATOR);
    });

    it('successfully assigns KYC_OPERATOR to a plain USER', async () => {
      const user = makeUser(UserRole.USER);
      repo.findOne.mockResolvedValue(user);
      const result = await service.assignRole('user-1', UserRole.KYC_OPERATOR);
      expect(result.role).toBe(UserRole.KYC_OPERATOR);
    });
  });
});
