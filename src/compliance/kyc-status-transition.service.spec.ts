import { KycStatus } from "./dto/compliance.dto";
import { KycStatusTransitionService } from "./kyc-status-transition.service";

describe("KycStatusTransitionService", () => {
  let service: KycStatusTransitionService;

  beforeEach(() => {
    service = new KycStatusTransitionService();
  });

  it("allows valid ordered transitions", () => {
    expect(() =>
      service.assertValidTransition(undefined, KycStatus.PENDING),
    ).not.toThrow();

    expect(() =>
      service.assertValidTransition(KycStatus.PENDING, KycStatus.IN_REVIEW),
    ).not.toThrow();

    expect(() =>
      service.assertValidTransition(KycStatus.IN_REVIEW, KycStatus.VERIFIED),
    ).not.toThrow();
  });

  it("rejects skipped transitions", () => {
    expect(() =>
      service.assertValidTransition(KycStatus.PENDING, KycStatus.VERIFIED),
    ).toThrowError(/KYC_INVALID_STATUS_TRANSITION/);
  });

  it("rejects reversed transitions", () => {
    expect(() =>
      service.assertValidTransition(KycStatus.VERIFIED, KycStatus.IN_REVIEW),
    ).toThrowError(/KYC_INVALID_STATUS_TRANSITION/);
  });

  it("rejects privileged initial states", () => {
    expect(() =>
      service.assertValidTransition(undefined, KycStatus.VERIFIED),
    ).toThrowError(/KYC_INVALID_STATUS_TRANSITION/);
  });
});
