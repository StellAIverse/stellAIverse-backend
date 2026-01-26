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
exports.AuthController = exports.VerifySignatureDto = exports.RequestChallengeDto = void 0;
const common_1 = require("@nestjs/common");
const challenge_service_1 = require("./challenge.service");
const wallet_auth_service_1 = require("./wallet-auth.service");
const email_linking_service_1 = require("./email-linking.service");
const recovery_service_1 = require("./recovery.service");
const jwt_guard_1 = require("./jwt.guard");
const link_email_dto_1 = require("./dto/link-email.dto");
const verify_email_dto_1 = require("./dto/verify-email.dto");
const request_recovery_dto_1 = require("./dto/request-recovery.dto");
class RequestChallengeDto {
}
exports.RequestChallengeDto = RequestChallengeDto;
class VerifySignatureDto {
}
exports.VerifySignatureDto = VerifySignatureDto;
let AuthController = class AuthController {
    constructor(challengeService, walletAuthService, emailLinkingService, recoveryService) {
        this.challengeService = challengeService;
        this.walletAuthService = walletAuthService;
        this.emailLinkingService = emailLinkingService;
        this.recoveryService = recoveryService;
    }
    requestChallenge(dto) {
        const message = this.challengeService.issueChallengeForAddress(dto.address);
        return {
            message,
            address: dto.address,
        };
    }
    async verifySignature(dto) {
        const result = await this.walletAuthService.verifySignatureAndIssueToken(dto.message, dto.signature);
        return {
            token: result.token,
            address: result.address,
        };
    }
    // Email Linking Endpoints
    async linkEmail(req, dto) {
        const walletAddress = req.user.address;
        return this.emailLinkingService.initiateEmailLinking(walletAddress, dto.email);
    }
    async verifyEmail(dto) {
        return this.emailLinkingService.verifyEmailAndLink(dto.token);
    }
    async getAccountInfo(req) {
        const walletAddress = req.user.address;
        return this.emailLinkingService.getAccountInfo(walletAddress);
    }
    async unlinkEmail(req) {
        const walletAddress = req.user.address;
        return this.emailLinkingService.unlinkEmail(walletAddress);
    }
    // Recovery Endpoints
    async requestRecovery(dto) {
        return this.recoveryService.requestRecovery(dto.email);
    }
    async verifyRecovery(dto) {
        return this.recoveryService.verifyRecoveryAndGetChallenge(dto.email);
    }
};
exports.AuthController = AuthController;
__decorate([
    (0, common_1.Post)("challenge"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [RequestChallengeDto]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "requestChallenge", null);
__decorate([
    (0, common_1.Post)("verify"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [VerifySignatureDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifySignature", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    (0, common_1.Post)("link-email"),
    __param(0, (0, common_1.Request)()),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, link_email_dto_1.LinkEmailDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "linkEmail", null);
__decorate([
    (0, common_1.Post)("verify-email"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [verify_email_dto_1.VerifyEmailDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyEmail", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    (0, common_1.Get)("account-info"),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "getAccountInfo", null);
__decorate([
    (0, common_1.UseGuards)(jwt_guard_1.JwtAuthGuard),
    (0, common_1.Delete)("unlink-email"),
    __param(0, (0, common_1.Request)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "unlinkEmail", null);
__decorate([
    (0, common_1.Post)("recovery/request"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [request_recovery_dto_1.RequestRecoveryDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "requestRecovery", null);
__decorate([
    (0, common_1.Post)("recovery/verify"),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [request_recovery_dto_1.RequestRecoveryDto]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyRecovery", null);
exports.AuthController = AuthController = __decorate([
    (0, common_1.Controller)("auth"),
    __metadata("design:paramtypes", [challenge_service_1.ChallengeService,
        wallet_auth_service_1.WalletAuthService,
        email_linking_service_1.EmailLinkingService,
        recovery_service_1.RecoveryService])
], AuthController);
