"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RecoveryService = void 0;
const common_1 = require("@nestjs/common");
const email_linking_service_1 = require("./email-linking.service");
const email_service_1 = require("./email.service");
const challenge_service_1 = require("./challenge.service");
let RecoveryService = class RecoveryService {
    constructor(emailLinkingService, emailService, challengeService) {
        this.emailLinkingService = emailLinkingService;
        this.emailService = emailService;
        this.challengeService = challengeService;
    }
    /**
     * Request account recovery
     * Sends recovery email with wallet address information
     */
    async requestRecovery(email) {
        const normalizedEmail = email.toLowerCase();
        // Find user by email
        const user = await this.emailLinkingService.getUserByEmail(normalizedEmail);
        if (!user) {
            throw new common_1.NotFoundException('No verified account found with this email address');
        }
        // Send recovery email
        const emailResult = await this.emailService.sendRecoveryEmail(normalizedEmail, user.walletAddress);
        return {
            message: 'Recovery information sent to your email',
            previewUrl: emailResult.previewUrl,
        };
    }
    /**
     * Verify recovery and get challenge for wallet authentication
     * This allows users to authenticate using their email-linked wallet
     */
    async verifyRecoveryAndGetChallenge(email) {
        const normalizedEmail = email.toLowerCase();
        // Find user by email
        const user = await this.emailLinkingService.getUserByEmail(normalizedEmail);
        if (!user) {
            throw new common_1.NotFoundException('No verified account found with this email address');
        }
        // Issue challenge for the wallet
        const challengeMessage = this.challengeService.issueChallengeForAddress(user.walletAddress);
        return {
            message: challengeMessage,
            walletAddress: user.walletAddress,
        };
    }
};
exports.RecoveryService = RecoveryService;
exports.RecoveryService = RecoveryService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [email_linking_service_1.EmailLinkingService,
        email_service_1.EmailService,
        challenge_service_1.ChallengeService])
], RecoveryService);
