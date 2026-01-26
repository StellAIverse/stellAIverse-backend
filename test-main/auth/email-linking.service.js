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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.EmailLinkingService = void 0;
const common_1 = require("@nestjs/common");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const crypto_1 = require("crypto");
const user_entity_1 = require("../user/entities/user.entity");
const email_verification_entity_1 = require("./entities/email-verification.entity");
const email_service_1 = require("./email.service");
let EmailLinkingService = class EmailLinkingService {
    constructor(userRepository, emailVerificationRepository, emailService) {
        this.userRepository = userRepository;
        this.emailVerificationRepository = emailVerificationRepository;
        this.emailService = emailService;
    }
    /**
     * Initiate email linking process
     * Generates verification token and sends email
     */
    async initiateEmailLinking(walletAddress, email) {
        // Validate email format
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(email)) {
            throw new common_1.BadRequestException("Invalid email format");
        }
        // Normalize addresses
        const normalizedWallet = walletAddress.toLowerCase();
        const normalizedEmail = email.toLowerCase();
        // Check if email is already linked to another wallet
        const existingEmailUser = await this.userRepository.findOne({
            where: { email: normalizedEmail },
        });
        if (existingEmailUser &&
            existingEmailUser.walletAddress !== normalizedWallet) {
            throw new common_1.ConflictException("Email is already linked to another wallet");
        }
        // Find or create user
        let user = await this.userRepository.findOne({
            where: { walletAddress: normalizedWallet },
        });
        if (!user) {
            user = this.userRepository.create({
                walletAddress: normalizedWallet,
                email: null,
                emailVerified: false,
            });
            await this.userRepository.save(user);
        }
        // Check if email is already verified for this wallet
        if (user.email === normalizedEmail && user.emailVerified) {
            throw new common_1.ConflictException("Email is already verified for this wallet");
        }
        // Generate verification token (32 bytes = 64 hex characters)
        const token = (0, crypto_1.randomBytes)(32).toString("hex");
        // Delete any existing verification tokens for this wallet
        await this.emailVerificationRepository.delete({
            walletAddress: normalizedWallet,
        });
        // Create new verification record
        const verification = this.emailVerificationRepository.create({
            email: normalizedEmail,
            token,
            walletAddress: normalizedWallet,
            expiresAt: new Date(Date.now() + 15 * 60 * 1000), // 15 minutes
        });
        await this.emailVerificationRepository.save(verification);
        // Send verification email
        const emailResult = await this.emailService.sendVerificationEmail(normalizedEmail, token);
        return {
            message: "Verification email sent. Please check your inbox.",
            previewUrl: emailResult.previewUrl,
        };
    }
    /**
     * Verify email token and link email to wallet
     */
    async verifyEmailAndLink(token) {
        // Find verification record
        const verification = await this.emailVerificationRepository.findOne({
            where: { token },
        });
        if (!verification) {
            throw new common_1.NotFoundException("Invalid or expired verification token");
        }
        // Check if token is expired
        if (new Date() > verification.expiresAt) {
            await this.emailVerificationRepository.delete({ token });
            throw new common_1.UnauthorizedException("Verification token has expired");
        }
        // Find user
        const user = await this.userRepository.findOne({
            where: { walletAddress: verification.walletAddress },
        });
        if (!user) {
            throw new common_1.NotFoundException("User not found");
        }
        // Update user with verified email
        user.email = verification.email;
        user.emailVerified = true;
        await this.userRepository.save(user);
        // Delete verification record
        await this.emailVerificationRepository.delete({ token });
        return {
            message: "Email successfully verified and linked to wallet",
            walletAddress: user.walletAddress,
            email: user.email,
        };
    }
    /**
     * Get account information for a wallet
     */
    async getAccountInfo(walletAddress) {
        const normalizedWallet = walletAddress.toLowerCase();
        const user = await this.userRepository.findOne({
            where: { walletAddress: normalizedWallet },
        });
        if (!user) {
            // Return default info for wallets without linked email
            return {
                walletAddress: normalizedWallet,
                email: null,
                emailVerified: false,
            };
        }
        return {
            walletAddress: user.walletAddress,
            email: user.email,
            emailVerified: user.emailVerified,
        };
    }
    /**
     * Unlink email from wallet
     */
    async unlinkEmail(walletAddress) {
        const normalizedWallet = walletAddress.toLowerCase();
        const user = await this.userRepository.findOne({
            where: { walletAddress: normalizedWallet },
        });
        if (!user || !user.email) {
            throw new common_1.NotFoundException("No email linked to this wallet");
        }
        // Remove email
        user.email = null;
        user.emailVerified = false;
        await this.userRepository.save(user);
        // Delete any pending verifications
        await this.emailVerificationRepository.delete({
            walletAddress: normalizedWallet,
        });
        return {
            message: "Email successfully unlinked from wallet",
        };
    }
    /**
     * Get user by email (for recovery)
     */
    async getUserByEmail(email) {
        const normalizedEmail = email.toLowerCase();
        return this.userRepository.findOne({
            where: { email: normalizedEmail, emailVerified: true },
        });
    }
};
exports.EmailLinkingService = EmailLinkingService;
exports.EmailLinkingService = EmailLinkingService = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __param(1, (0, typeorm_1.InjectRepository)(email_verification_entity_1.EmailVerification)),
    __metadata("design:paramtypes", [typeorm_2.Repository,
        typeorm_2.Repository,
        email_service_1.EmailService])
], EmailLinkingService);
