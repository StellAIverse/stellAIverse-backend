import {
  Injectable,
  CanActivate,
  ExecutionContext,
  ConflictException,
  BadRequestException,
} from "@nestjs/common";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { SubmissionNonce } from "../../oracle/entities/submission-nonce.entity";

/**
 * Guard to prevent replay attacks by validating nonces
 * Closes issue #257
 */
@Injectable()
export class NonceGuard implements CanActivate {
  constructor(
    @InjectRepository(SubmissionNonce)
    private nonceRepository: Repository<SubmissionNonce>,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const { nonce, userId } = request.body;

    if (!nonce || !userId) {
      throw new BadRequestException("Nonce and userId are required");
    }

    const key = `${userId}`;
    const nonceEntity = await this.nonceRepository.findOne({
      where: { address: key },
    });

    if (nonceEntity) {
      const lastNonce = BigInt(nonceEntity.nonce);
      const currentNonce = BigInt(nonce);

      if (currentNonce <= lastNonce) {
        throw new ConflictException(
          "Nonce already used (replay attack detected)",
        );
      }

      nonceEntity.nonce = nonce.toString();
      await this.nonceRepository.save(nonceEntity);
    } else {
      const newNonce = this.nonceRepository.create({
        address: key,
        nonce: nonce.toString(),
      });
      await this.nonceRepository.save(newNonce);
    }

    return true;
  }
}
