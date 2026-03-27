import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  UnauthorizedException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, LessThan } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { Wallet, WalletStatus, WalletType } from './entities/wallet.entity';
import { User } from '../user/entities/user.entity';

export interface DelegationRequest {
  delegatorWalletId: string;
  delegateAddress: string;
  permissions: DelegationPermission[];
  expiresAt: Date;
  metadata?: Record<string, any>;
}

export enum DelegationPermission {
  SIGN_MESSAGES = 'sign_messages',
  SIGN_TRANSACTIONS = 'sign_transactions',
  AUTHENTICATE = 'authenticate',
  READ_DATA = 'read_data',
}

export interface DelegationRecord {
  id: string;
  delegatorWalletId: string;
  delegateWalletId: string;
  permissions: DelegationPermission[];
  grantedAt: Date;
  expiresAt: Date;
  revokedAt?: Date;
  status: 'active' | 'expired' | 'revoked';
}

@Injectable()
export class DelegationService {
  private readonly logger = new Logger(DelegationService.name);

  constructor(
    @InjectRepository(Wallet)
    private readonly walletRepository: Repository<Wallet>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
  ) {}

  /**
   * Request delegation of signing authority
   */
  async requestDelegation(
    delegatorUserId: string,
    request: DelegationRequest,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<{
    delegationId: string;
    message: string;
    challenge: string;
  }> {
    // Verify delegator wallet exists and belongs to user
    const delegatorWallet = await this.walletRepository.findOne({
      where: {
        id: request.delegatorWalletId,
        userId: delegatorUserId,
        status: WalletStatus.ACTIVE,
      },
    });

    if (!delegatorWallet) {
      throw new NotFoundException('Delegator wallet not found or not active');
    }

    // Check if delegator has permission to delegate
    if (!delegatorWallet.isPrimary && delegatorWallet.type !== WalletType.SECONDARY) {
      throw new ForbiddenException('Only primary or secondary wallets can delegate authority');
    }

    // Normalize delegate address
    const normalizedDelegateAddress = request.delegateAddress.toLowerCase();

    // Check if delegate address is already linked to another user
    const existingWallet = await this.walletRepository.findOne({
      where: { address: normalizedDelegateAddress },
    });

    if (existingWallet && existingWallet.userId !== delegatorUserId) {
      throw new ConflictException('Delegate address is already linked to another account');
    }

    // Validate permissions
    this.validatePermissions(request.permissions);

    // Validate expiration
    if (request.expiresAt <= new Date()) {
      throw new BadRequestException('Expiration date must be in the future');
    }

    const maxExpiration = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000); // 90 days max
    if (request.expiresAt > maxExpiration) {
      throw new BadRequestException('Delegation cannot exceed 90 days');
    }

    // Create delegation ID and challenge
    const delegationId = this.generateDelegationId();
    const challenge = this.generateDelegationChallenge(
      delegatorWallet.address,
      normalizedDelegateAddress,
      request.permissions,
      request.expiresAt,
    );

    // Store pending delegation (will be activated after signature verification)
    // For now, we'll create the delegate wallet in PENDING status
    let delegateWallet: Wallet;

    if (existingWallet) {
      delegateWallet = existingWallet;
    } else {
      delegateWallet = this.walletRepository.create({
        address: normalizedDelegateAddress,
        userId: delegatorUserId,
        type: WalletType.DELEGATED,
        status: WalletStatus.PENDING,
        delegatedById: delegatorWallet.id,
        delegationExpiresAt: request.expiresAt,
        delegationPermissions: request.permissions,
        name: `Delegated by ${delegatorWallet.name || delegatorWallet.address.slice(0, 8)}`,
      });
      await this.walletRepository.save(delegateWallet);
    }

    await this.auditDelegationAction(
      delegatorWallet.id,
      delegateWallet.id,
      'request',
      clientInfo,
    );

    this.logger.log(
      `Delegation requested: ${delegatorWallet.address} -> ${normalizedDelegateAddress}`,
    );

    return {
      delegationId,
      message: 'Delegation requested. Sign the challenge to authorize.',
      challenge,
    };
  }

  /**
   * Complete delegation after delegator signature verification
   */
  async completeDelegation(
    delegatorUserId: string,
    delegateWalletId: string,
    signature: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<{
    success: boolean;
    delegation: DelegationRecord;
  }> {
    const delegateWallet = await this.walletRepository.findOne({
      where: {
        id: delegateWalletId,
        userId: delegatorUserId,
        type: WalletType.DELEGATED,
        status: WalletStatus.PENDING,
      },
      relations: ['user'],
    });

    if (!delegateWallet) {
      throw new NotFoundException('Pending delegation not found');
    }

    const delegatorWallet = await this.walletRepository.findOne({
      where: { id: delegateWallet.delegatedById },
    });

    if (!delegatorWallet) {
      throw new NotFoundException('Delegator wallet not found');
    }

    // Verify signature
    const { verifyMessage } = await import('ethers');
    const challenge = this.generateDelegationChallenge(
      delegatorWallet.address,
      delegateWallet.address,
      delegateWallet.delegationPermissions || [],
      delegateWallet.delegationExpiresAt!,
    );

    let recoveredAddress: string;
    try {
      recoveredAddress = verifyMessage(challenge, signature);
    } catch (error) {
      throw new UnauthorizedException('Invalid signature');
    }

    if (recoveredAddress.toLowerCase() !== delegatorWallet.address.toLowerCase()) {
      throw new UnauthorizedException('Signature does not match delegator wallet');
    }

    // Activate delegation
    delegateWallet.status = WalletStatus.ACTIVE;
    delegateWallet.verifiedAt = new Date();
    delegateWallet.verificationSignature = signature;
    await this.walletRepository.save(delegateWallet);

    await this.auditDelegationAction(
      delegatorWallet.id,
      delegateWallet.id,
      'grant',
      clientInfo,
    );

    this.logger.log(`Delegation completed: ${delegatorWallet.address} -> ${delegateWallet.address}`);

    return {
      success: true,
      delegation: {
        id: delegateWallet.id,
        delegatorWalletId: delegatorWallet.id,
        delegateWalletId: delegateWallet.id,
        permissions: delegateWallet.delegationPermissions || [],
        grantedAt: delegateWallet.verifiedAt,
        expiresAt: delegateWallet.delegationExpiresAt!,
        status: 'active',
      },
    };
  }

  /**
   * Revoke delegation
   */
  async revokeDelegation(
    userId: string,
    delegationId: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<{
    success: boolean;
    message: string;
  }> {
    const delegateWallet = await this.walletRepository.findOne({
      where: {
        id: delegationId,
        userId,
        type: WalletType.DELEGATED,
      },
    });

    if (!delegateWallet) {
      throw new NotFoundException('Delegation not found');
    }

    if (delegateWallet.status !== WalletStatus.ACTIVE) {
      throw new BadRequestException('Delegation is not active');
    }

    // Revoke the delegation
    delegateWallet.status = WalletStatus.REVOKED;
    await this.walletRepository.save(delegateWallet);

    await this.auditDelegationAction(
      delegateWallet.delegatedById!,
      delegateWallet.id,
      'revoke',
      clientInfo,
    );

    this.logger.log(`Delegation revoked: ${delegationId}`);

    return {
      success: true,
      message: 'Delegation revoked successfully',
    };
  }

  /**
   * Get all delegations for a user
   */
  async getUserDelegations(userId: string): Promise<{
    granted: DelegationRecord[];
    received: DelegationRecord[];
  }> {
    // Get delegations granted by user (wallets they delegated)
    const grantedWallets = await this.walletRepository.find({
      where: {
        userId,
        type: WalletType.DELEGATED,
      },
    });

    const granted: DelegationRecord[] = await Promise.all(
      grantedWallets.map(async (w) => {
        const delegator = await this.walletRepository.findOne({
          where: { id: w.delegatedById },
        });
        return {
          id: w.id,
          delegatorWalletId: w.delegatedById!,
          delegateWalletId: w.id,
          permissions: w.delegationPermissions || [],
          grantedAt: w.verifiedAt!,
          expiresAt: w.delegationExpiresAt!,
          revokedAt: w.status === WalletStatus.REVOKED ? new Date() : undefined,
          status: this.getDelegationStatus(w),
        };
      }),
    );

    // Get delegations received by user (not applicable in current model)
    // In a future version, this could support cross-user delegation
    const received: DelegationRecord[] = [];

    return { granted, received };
  }

  /**
   * Get delegations for a specific wallet
   */
  async getWalletDelegations(walletId: string, userId: string): Promise<DelegationRecord[]> {
    const wallet = await this.walletRepository.findOne({
      where: { id: walletId, userId },
    });

    if (!wallet) {
      throw new NotFoundException('Wallet not found');
    }

    const delegatedWallets = await this.walletRepository.find({
      where: {
        delegatedById: walletId,
        type: WalletType.DELEGATED,
      },
    });

    return delegatedWallets.map((w) => ({
      id: w.id,
      delegatorWalletId: walletId,
      delegateWalletId: w.id,
      permissions: w.delegationPermissions || [],
      grantedAt: w.verifiedAt!,
      expiresAt: w.delegationExpiresAt!,
      revokedAt: w.status === WalletStatus.REVOKED ? new Date() : undefined,
      status: this.getDelegationStatus(w),
    }));
  }

  /**
   * Verify if a wallet has delegation permission
   */
  async verifyDelegationPermission(
    delegateAddress: string,
    requiredPermission: DelegationPermission,
  ): Promise<{
    valid: boolean;
    delegatorWalletId?: string;
    permissions?: DelegationPermission[];
    expiresAt?: Date;
  }> {
    const normalizedAddress = delegateAddress.toLowerCase();

    const delegateWallet = await this.walletRepository.findOne({
      where: {
        address: normalizedAddress,
        type: WalletType.DELEGATED,
        status: WalletStatus.ACTIVE,
      },
    });

    if (!delegateWallet) {
      return { valid: false };
    }

    // Check expiration
    if (delegateWallet.delegationExpiresAt && delegateWallet.delegationExpiresAt < new Date()) {
      // Auto-expire
      delegateWallet.status = WalletStatus.UNLINKED;
      await this.walletRepository.save(delegateWallet);
      return { valid: false };
    }

    // Check permission
    const permissions = delegateWallet.delegationPermissions || [];
    if (!permissions.includes(requiredPermission)) {
      return {
        valid: false,
        delegatorWalletId: delegateWallet.delegatedById!,
        permissions,
      };
    }

    return {
      valid: true,
      delegatorWalletId: delegateWallet.delegatedById!,
      permissions,
      expiresAt: delegateWallet.delegationExpiresAt!,
    };
  }

  /**
   * Clean up expired delegations
   */
  async cleanupExpiredDelegations(): Promise<number> {
    const expiredWallets = await this.walletRepository.find({
      where: {
        type: WalletType.DELEGATED,
        status: WalletStatus.ACTIVE,
        delegationExpiresAt: LessThan(new Date()),
      },
    });

    for (const wallet of expiredWallets) {
      wallet.status = WalletStatus.UNLINKED;
      await this.walletRepository.save(wallet);
      this.logger.log(`Expired delegation cleaned up: ${wallet.id}`);
    }

    return expiredWallets.length;
  }

  /**
   * Validate delegation permissions
   */
  private validatePermissions(permissions: DelegationPermission[]): void {
    const validPermissions = Object.values(DelegationPermission);

    for (const permission of permissions) {
      if (!validPermissions.includes(permission)) {
        throw new BadRequestException(`Invalid permission: ${permission}`);
      }
    }

    if (permissions.length === 0) {
      throw new BadRequestException('At least one permission must be granted');
    }
  }

  /**
   * Get delegation status
   */
  private getDelegationStatus(wallet: Wallet): 'active' | 'expired' | 'revoked' {
    if (wallet.status === WalletStatus.REVOKED) {
      return 'revoked';
    }
    if (wallet.delegationExpiresAt && wallet.delegationExpiresAt < new Date()) {
      return 'expired';
    }
    if (wallet.status === WalletStatus.ACTIVE) {
      return 'active';
    }
    return 'expired';
  }

  /**
   * Generate delegation challenge message
   */
  private generateDelegationChallenge(
    delegatorAddress: string,
    delegateAddress: string,
    permissions: DelegationPermission[],
    expiresAt: Date,
  ): string {
    const nonce = randomBytes(16).toString('hex');
    return `Delegate signing authority from ${delegatorAddress} to ${delegateAddress}\n` +
           `Permissions: ${permissions.join(', ')}\n` +
           `Expires: ${expiresAt.toISOString()}\n` +
           `Nonce: ${nonce}`;
  }

  /**
   * Generate delegation ID
   */
  private generateDelegationId(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Audit delegation action
   */
  private async auditDelegationAction(
    delegatorWalletId: string,
    delegateWalletId: string,
    action: string,
    clientInfo?: { ip?: string; userAgent?: string },
  ): Promise<void> {
    this.logger.log(
      `Delegation action: ${action}, delegator=${delegatorWalletId}, ` +
      `delegate=${delegateWalletId}, ip=${clientInfo?.ip}`,
    );
  }
}


