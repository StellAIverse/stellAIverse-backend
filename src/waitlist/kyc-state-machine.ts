import { ForbiddenException } from "@nestjs/common";

export enum KycState {
  Pending = "Pending",
  InProgress = "InProgress",
  Verified = "Verified",
  Rejected = "Rejected",
}

/// States from which no further transition is permitted.
export const TERMINAL_STATES = new Set<KycState>([
  KycState.Verified,
  KycState.Rejected,
]);

/**
 * Attempt to transition a KYC record from `current` to `next`.
 * Throws ForbiddenException if `current` is a terminal state.
 */
export function transition(current: KycState, next: KycState): KycState {
  if (TERMINAL_STATES.has(current)) {
    throw new ForbiddenException(
      `KYC state "${current}" is terminal and cannot be changed.`
    );
  }
  return next;
}
