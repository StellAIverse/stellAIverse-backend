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
exports.ComputeController = void 0;
const common_1 = require("@nestjs/common");
const compute_service_1 = require("./compute.service");
const create_compute_result_dto_1 = require("./dto/create-compute-result.dto");
const compute_result_response_dto_1 = require("./dto/compute-result-response.dto");
let ComputeController = class ComputeController {
    constructor(computeService) {
        this.computeService = computeService;
    }
    createComputeResult(createComputeResultDto) {
        const result = this.computeService.createComputeResult(createComputeResultDto);
        // Convert to response DTO
        const responseDto = new compute_result_response_dto_1.ComputeResultResponseDto();
        responseDto.id = result.id;
        responseDto.originalResult = result.originalResult;
        responseDto.normalizedResult = result.normalizedResult;
        responseDto.hash = result.hash;
        responseDto.metadata = result.metadata;
        responseDto.createdAt = result.createdAt;
        responseDto.updatedAt = result.updatedAt;
        return responseDto;
    }
    getComputeResult(id) {
        const result = this.computeService.getComputeResultById(id);
        if (result) {
            const responseDto = new compute_result_response_dto_1.ComputeResultResponseDto();
            responseDto.id = result.id;
            responseDto.originalResult = result.originalResult;
            responseDto.normalizedResult = result.normalizedResult;
            responseDto.hash = result.hash;
            responseDto.metadata = result.metadata;
            responseDto.createdAt = result.createdAt;
            responseDto.updatedAt = result.updatedAt;
            return responseDto;
        }
        return undefined;
    }
    verifyComputeResult(id, body) {
        const isValid = this.computeService.verifyResult(id, body.result);
        return { isValid };
    }
    getAllComputeResults() {
        const results = this.computeService.getAllComputeResults();
        return results.map((result) => {
            const responseDto = new compute_result_response_dto_1.ComputeResultResponseDto();
            responseDto.id = result.id;
            responseDto.originalResult = result.originalResult;
            responseDto.normalizedResult = result.normalizedResult;
            responseDto.hash = result.hash;
            responseDto.metadata = result.metadata;
            responseDto.createdAt = result.createdAt;
            responseDto.updatedAt = result.updatedAt;
            return responseDto;
        });
    }
};
exports.ComputeController = ComputeController;
__decorate([
    (0, common_1.Post)("result"),
    (0, common_1.HttpCode)(common_1.HttpStatus.CREATED),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_compute_result_dto_1.CreateComputeResultDto]),
    __metadata("design:returntype", compute_result_response_dto_1.ComputeResultResponseDto)
], ComputeController.prototype, "createComputeResult", null);
__decorate([
    (0, common_1.Get)("result/:id"),
    __param(0, (0, common_1.Param)("id")),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", compute_result_response_dto_1.ComputeResultResponseDto)
], ComputeController.prototype, "getComputeResult", null);
__decorate([
    (0, common_1.Post)("result/:id/verify"),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    __param(0, (0, common_1.Param)("id")),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Object)
], ComputeController.prototype, "verifyComputeResult", null);
__decorate([
    (0, common_1.Get)("results"),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Array)
], ComputeController.prototype, "getAllComputeResults", null);
exports.ComputeController = ComputeController = __decorate([
    (0, common_1.Controller)("compute"),
    __metadata("design:paramtypes", [compute_service_1.ComputeService])
], ComputeController);
