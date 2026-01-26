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
exports.WalletAuthService = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const typeorm_1 = require("@nestjs/typeorm");
const typeorm_2 = require("typeorm");
const ethers_1 = require("ethers");
const challenge_service_1 = require("./challenge.service");
const user_entity_1 = require("../user/entities/user.entity");
let WalletAuthService = class WalletAuthService {
    constructor(challengeService, jwtService, userRepository) {
        this.challengeService = challengeService;
        this.jwtService = jwtService;
        this.userRepository = userRepository;
    }
    /**
     * Verify a signed message and return JWT token if valid
     */
    async verifySignatureAndIssueToken(message, signature) {
        // Extract challenge ID from message
        const challengeId = this.challengeService.extractChallengeId(message);
        if (!challengeId) {
            throw new common_1.UnauthorizedException('Invalid challenge message format');
        }
        // Get and consume the challenge
        const challenge = this.challengeService.consumeChallenge(challengeId);
        if (!challenge) {
            throw new common_1.UnauthorizedException('Challenge not found or expired. Please request a new challenge.');
        }
        // Verify the signature
        let recoveredAddress;
        try {
            recoveredAddress = (0, ethers_1.verifyMessage)(message, signature);
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Invalid signature');
        }
        // Verify the recovered address matches the challenge address
        if (recoveredAddress.toLowerCase() !== challenge.address) {
            throw new common_1.UnauthorizedException('Signature does not match challenge address');
        }
        // Fetch user to get email if linked
        const user = await this.userRepository.findOne({
            where: { walletAddress: recoveredAddress.toLowerCase() },
        });
        // Issue JWT token with email if available
        const payload = {
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
    validateToken(token) {
        try {
            return this.jwtService.verify(token);
        }
        catch (error) {
            throw new common_1.UnauthorizedException('Invalid token');
        }
    }
};
exports.WalletAuthService = WalletAuthService;
exports.WalletAuthService = WalletAuthService = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, typeorm_1.InjectRepository)(user_entity_1.User)),
    __metadata("design:paramtypes", [challenge_service_1.ChallengeService,
        jwt_1.JwtService,
        typeorm_2.Repository])
], WalletAuthService);
