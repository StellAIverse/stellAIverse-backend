import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { verifyMessage } from 'ethers';
import { ChallengeService } from './challenge.service';
import { User } from '../user/entities/user.entity';

export interface AuthPayload {
  address: string;
  email?: string;
  iat: number;
}

@Injectable()
export class WalletAuthService {
  constructor(
    private challengeService: ChallengeService,
    private jwtService: JwtService,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  /**
   * Verify a signed message and return JWT token if valid
   */
  async verifySignatureAndIssueToken(
    message: string,
    signature: string,
  ): Promise<{ token: string; address: string }> {
    // Extract challenge ID from message
    const challengeId = this.challengeService.extractChallengeId(message);
    if (!challengeId) {
      throw new UnauthorizedException('Invalid challenge message format');
    }

    // Get and consume the challenge
    const challenge = this.challengeService.consumeChallenge(challengeId);
    if (!challenge) {
      throw new UnauthorizedException(
        'Challenge not found or expired. Please request a new challenge.',
      );
    }

    // Verify the signature
    let recoveredAddress: string;
    try {
      recoveredAddress = verifyMessage(message, signature);
    } catch (error) {
      throw new UnauthorizedException('Invalid signature');
    }

    // Verify the recovered address matches the challenge address
    if (recoveredAddress.toLowerCase() !== challenge.address) {
      throw new UnauthorizedException(
        'Signature does not match challenge address',
      );
    }

    // Fetch user to get email if linked
    const user = await this.userRepository.findOne({
      where: { walletAddress: recoveredAddress.toLowerCase() },
    });

    // Issue JWT token with email if available
    const payload: AuthPayload = {
      address: recoveredAddress.toLowerCase(),
      email: user?.emailVerified ? user.email : undefined,
      iat: Math.floor(Date.now() / 1000),
    };

    const token = this.jwtService.sign(payload);

    return {
      token,
      address: recoveredAddress.toLowerCase(),
    };
  }

  /**
   * Validate JWT token and return payload
   */
  validateToken(token: string): AuthPayload {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
