"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComputeService = void 0;
const common_1 = require("@nestjs/common");
const uuid_1 = require("uuid");
const ethers_1 = require("ethers");
const compute_result_entity_1 = require("./entities/compute-result.entity");
let ComputeService = class ComputeService {
    constructor() {
        // In-memory storage for now - will be replaced with database storage later
        this.computeResults = new Map();
    }
    /**
     * Normalizes the compute result to ensure deterministic representation
     */
    normalizeResult(result) {
        try {
            // Attempt to parse as JSON and re-stringify for canonical representation
            const parsed = JSON.parse(result);
            // Sort object keys recursively to ensure deterministic order
            const sorted = this.sortObjectKeys(parsed);
            // Stringify with sorted keys to create canonical JSON
            return JSON.stringify(sorted);
        }
        catch (error) {
            // If not valid JSON, return the original string
            // In a production environment, you might want more sophisticated normalization
            return result;
        }
    }
    /**
     * Recursively sort object keys to ensure deterministic ordering
     */
    sortObjectKeys(obj) {
        if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
            return obj;
        }
        const sortedObj = {};
        const keys = Object.keys(obj).sort();
        for (const key of keys) {
            sortedObj[key] = this.sortObjectKeys(obj[key]);
        }
        return sortedObj;
    }
    /**
     * Generates a hash of the normalized result
     */
    generateHash(normalizedResult) {
        return ethers_1.ethers.keccak256(ethers_1.ethers.toUtf8Bytes(normalizedResult));
    }
    /**
     * Creates and stores a compute result with normalization and hashing
     */
    createComputeResult(dto) {
        const originalResult = dto.originalResult;
        const normalizedResult = this.normalizeResult(originalResult);
        const hash = this.generateHash(normalizedResult);
        const metadata = dto.metadata ? JSON.parse(dto.metadata) : undefined;
        const computeResult = new compute_result_entity_1.ComputeResult((0, uuid_1.v4)(), originalResult, normalizedResult, hash, metadata);
        // Store in memory for now
        this.computeResults.set(computeResult.id, computeResult);
        return computeResult;
    }
    /**
     * Retrieves a compute result by ID
     */
    getComputeResultById(id) {
        return this.computeResults.get(id);
    }
    /**
     * Verifies that a given result produces the same hash as stored
     */
    verifyResult(id, result) {
        const storedResult = this.getComputeResultById(id);
        if (!storedResult) {
            return false;
        }
        const normalizedInput = this.normalizeResult(result);
        const inputHash = this.generateHash(normalizedInput);
        return storedResult.hash === inputHash;
    }
    /**
     * Gets all compute results
     */
    getAllComputeResults() {
        return Array.from(this.computeResults.values());
    }
};
exports.ComputeService = ComputeService;
exports.ComputeService = ComputeService = __decorate([
    (0, common_1.Injectable)()
], ComputeService);
