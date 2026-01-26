"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AuthModule = void 0;
const common_1 = require("@nestjs/common");
const jwt_1 = require("@nestjs/jwt");
const passport_1 = require("@nestjs/passport");
const typeorm_1 = require("@nestjs/typeorm");
const auth_controller_1 = require("./auth.controller");
const challenge_service_1 = require("./challenge.service");
const jwt_strategy_1 = require("./jwt.strategy");
const jwt_guard_1 = require("./jwt.guard");
const wallet_auth_service_1 = require("./wallet-auth.service");
const email_service_1 = require("./email.service");
const email_linking_service_1 = require("./email-linking.service");
const recovery_service_1 = require("./recovery.service");
const user_entity_1 = require("../user/entities/user.entity");
const email_verification_entity_1 = require("./entities/email-verification.entity");
let AuthModule = class AuthModule {
};
exports.AuthModule = AuthModule;
exports.AuthModule = AuthModule = __decorate([
    (0, common_1.Module)({
        imports: [
            passport_1.PassportModule,
            jwt_1.JwtModule.register({
                secret: process.env.JWT_SECRET || 'your-secret-key',
                signOptions: { expiresIn: '24h' },
            }),
            typeorm_1.TypeOrmModule.forFeature([user_entity_1.User, email_verification_entity_1.EmailVerification]),
        ],
        controllers: [auth_controller_1.AuthController],
        providers: [
            challenge_service_1.ChallengeService,
            wallet_auth_service_1.WalletAuthService,
            email_service_1.EmailService,
            email_linking_service_1.EmailLinkingService,
            recovery_service_1.RecoveryService,
            jwt_strategy_1.JwtStrategy,
            jwt_guard_1.JwtAuthGuard,
        ],
        exports: [
            challenge_service_1.ChallengeService,
            wallet_auth_service_1.WalletAuthService,
            email_linking_service_1.EmailLinkingService,
            jwt_guard_1.JwtAuthGuard,
        ],
    })
], AuthModule);
