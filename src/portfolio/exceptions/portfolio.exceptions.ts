import { BadRequestException, NotFoundException } from "@nestjs/common";

export class PortfolioNotFoundException extends NotFoundException {
  constructor(portfolioId: string) {
    super(`Portfolio not found: ${portfolioId}`);
  }
}

export class InsufficientBalanceException extends BadRequestException {
  constructor(asset: string) {
    super(`Insufficient balance for asset ${asset}`);
  }
}

export class OptimizationFailedException extends BadRequestException {
  constructor(message = "Portfolio optimization failed") {
    super(message);
  }
}
