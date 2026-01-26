"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChallengeService = void 0;
const common_1 = require("@nestjs/common");
const crypto_1 = require("crypto");
let ChallengeService = class ChallengeService {
    constructor() {
        this.challenges = new Map();
        this.challengeExpiration = 5 * 60 * 1000; // 5 minutes
    }
    issueChallengeForAddress(address) {
        const challengeId = (0, crypto_1.randomBytes)(32).toString('hex');
        const now = Date.now();
        const message = `Sign this message to authenticate: ${challengeId}`;
        const challenge = {
            id: challengeId,
            message,
            createdAt: now,
            expiresAt: now + this.challengeExpiration,
            address: address.toLowerCase(),
        };
        this.challenges.set(challengeId, challenge);
        return message;
    }
    getChallenge(challengeId) {
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
    consumeChallenge(challengeId) {
        const challenge = this.getChallenge(challengeId);
        if (challenge) {
            this.challenges.delete(challengeId);
        }
        return challenge;
    }
    extractChallengeId(message) {
        const match = message.match(/Sign this message to authenticate: (.+)$/);
        return match ? match[1] : null;
    }
};
exports.ChallengeService = ChallengeService;
exports.ChallengeService = ChallengeService = __decorate([
    (0, common_1.Injectable)()
], ChallengeService);
