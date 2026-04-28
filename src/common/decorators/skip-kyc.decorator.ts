import { SetMetadata } from "@nestjs/common";

export const SKIP_KYC_KEY = "skipKyc";

/**
 * Marks a route/controller to bypass KYC checks.
 * Use only for onboarding flows that are required to become KYC verified.
 */
export const SkipKyc = () => SetMetadata(SKIP_KYC_KEY, true);
