import { Injectable } from '@nestjs/common';
import { randomBytes } from 'crypto';

interface Challenge {
  id: string;
  message: string;
  createdAt: number;
  expiresAt: number;
  address: string;
}

@Injectable()
export class ChallengeService {
  private challenges = new Map<string, Challenge>();
  private readonly challengeExpiration = 5 * 60 * 1000; // 5 minutes

  issueChallengeForAddress(address: string): string {
    const challengeId = randomBytes(32).toString('hex');
    const now = Date.now();
    const message = `Sign this message to authenticate: ${challengeId}`;

    const challenge: Challenge = {
      id: challengeId,
      message,
      createdAt: now,
      expiresAt: now + this.challengeExpiration,
      address: address.toLowerCase(),
    };

    this.challenges.set(challengeId, challenge);
    return message;
  }

  getChallenge(challengeId: string): Challenge | null {
    const challenge = this.challenges.get(challengeId);

    if (!challenge) {
      return null;
    }

    if (Date.now() > challenge.expiresAt) {
      this.challenges.delete(challengeId);
      return null;
    }

    return challenge;
  }

  consumeChallenge(challengeId: string): Challenge | null {
    const challenge = this.getChallenge(challengeId);

    if (challenge) {
      this.challenges.delete(challengeId);
    }

    return challenge;
  }

  extractChallengeId(message: string): string | null {
    const match = message.match(/Sign this message to authenticate: (.+)$/);
    return match ? match[1] : null;
  }
}
