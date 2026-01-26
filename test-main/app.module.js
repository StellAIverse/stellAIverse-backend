"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const auth_module_1 = require("./auth/auth.module");
const user_module_1 = require("./user/user.module");
const profile_module_1 = require("./profile/profile.module");
const compute_module_1 = require("./compute/compute.module");
const user_entity_1 = require("./user/entities/user.entity");
const email_verification_entity_1 = require("./auth/entities/email-verification.entity");
const observability_module_1 = require("./observability/observability.module");
let AppModule = class AppModule {
};
exports.AppModule = AppModule;
exports.AppModule = AppModule = __decorate([
    (0, common_1.Module)({
        imports: [
            config_1.ConfigModule.forRoot({
                isGlobal: true,
                envFilePath: ".env",
            }),
            typeorm_1.TypeOrmModule.forRoot({
                type: "postgres",
                url: process.env.DATABASE_URL ||
                    "postgresql://stellaiverse:password@localhost:5432/stellaiverse",
                entities: [user_entity_1.User, email_verification_entity_1.EmailVerification],
                synchronize: process.env.NODE_ENV !== "production", // Auto-sync in development
                logging: process.env.NODE_ENV === "development",
            }),
            auth_module_1.AuthModule,
            user_module_1.UserModule,
            profile_module_1.ProfileModule,
            compute_module_1.ComputeModule,
            observability_module_1.ObservabilityModule,
        ],
        controllers: [app_controller_1.AppController],
        providers: [app_service_1.AppService],
    })
], AppModule);
