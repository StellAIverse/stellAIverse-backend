"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComputeResult = void 0;
class ComputeResult {
    constructor(id, originalResult, normalizedResult, hash, metadata) {
        this.id = id;
        this.originalResult = originalResult;
        this.normalizedResult = normalizedResult;
        this.hash = hash;
        this.metadata = metadata;
        this.createdAt = new Date();
        this.updatedAt = new Date();
    }
}
exports.ComputeResult = ComputeResult;
