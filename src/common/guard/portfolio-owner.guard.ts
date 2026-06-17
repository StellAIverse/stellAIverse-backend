import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  NotFoundException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { Portfolio } from "../../portfolio/entities/portfolio.entity";

@Injectable()
export class PortfolioOwnerGuard implements CanActivate {
  constructor(
    @InjectRepository(Portfolio)
    private readonly portfolioRepository: Repository<Portfolio>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const userId: string = request.user?.id;
    const portfolioId: string =
      request.params?.id ?? request.params?.portfolioId;

    if (!userId || !portfolioId) {
      throw new ForbiddenException("Access denied");
    }

    const portfolio = await this.portfolioRepository.findOne({
      where: { id: portfolioId },
      select: ["id", "userId"],
    });

    if (!portfolio) {
      throw new NotFoundException("Portfolio not found");
    }

    if (portfolio.userId !== userId) {
      throw new ForbiddenException(
        "You do not have permission to access this portfolio",
      );
    }

    return true;
  }
}
