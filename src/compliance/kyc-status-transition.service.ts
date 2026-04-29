import { BadRequestException, Injectable } from "@nestjs/common";
import { KycStatus } from "./dto/compliance.dto";

const TRANSITION_ERROR_CODE = "KYC_INVALID_STATUS_TRANSITION";

@Injectable()
export class KycStatusTransitionService {
  private readonly allowedTransitions: Record<KycStatus, KycStatus[]> = {
    [KycStatus.PENDING]: [KycStatus.IN_REVIEW],
    [KycStatus.IN_REVIEW]: [KycStatus.VERIFIED],
    [KycStatus.VERIFIED]: [],
    [KycStatus.REJECTED]: [],
  };

  assertValidTransition(
    currentStatus: KycStatus | undefined,
    nextStatus: KycStatus,
  ): void {
    // New profiles must start from pending to avoid privileged state jumps.
    if (!currentStatus) {
      if (nextStatus !== KycStatus.PENDING) {
        throw new BadRequestException({
          code: TRANSITION_ERROR_CODE,
          message: `Initial KYC status must be '${KycStatus.PENDING}'`,
        });
      }
      return;
    }

    if (currentStatus === nextStatus) {
      return;
    }

    const allowedNext = this.allowedTransitions[currentStatus] ?? [];
    if (!allowedNext.includes(nextStatus)) {
      throw new BadRequestException({
        code: TRANSITION_ERROR_CODE,
        message: `Invalid KYC status transition from '${currentStatus}' to '${nextStatus}'`,
      });
    }
  }
}
