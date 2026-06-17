export enum Role {
  USER = "user",
  OPERATOR = "operator",
  ADMIN = "admin",
  GOVERNANCE_OPERATOR = "governance_operator",
  KYC_OPERATOR = "kyc_operator",
}

/**
 * Linear privilege hierarchy for standard roles.
 * GOVERNANCE_OPERATOR and KYC_OPERATOR are intentionally excluded from this
 * hierarchy. They are specialized roles that do not inherit from each other.
 * ADMIN supersedes both specialized roles.
 */
export const ROLE_HIERARCHY: Role[] = [Role.USER, Role.OPERATOR, Role.ADMIN];

export const CONFLICTING_ROLE_PAIRS: [Role, Role][] = [
  [Role.GOVERNANCE_OPERATOR, Role.KYC_OPERATOR],
];

export function hasConflictingRoles(roles: Role[]): boolean {
  return CONFLICTING_ROLE_PAIRS.some(
    ([a, b]) => roles.includes(a) && roles.includes(b),
  );
}

export function hasRole(candidate: Role, required: Role): boolean {
  if (candidate === required) return true;
  if (candidate === Role.ADMIN) return true;

  const candidateIdx = ROLE_HIERARCHY.indexOf(candidate);
  const requiredIdx = ROLE_HIERARCHY.indexOf(required);

  if (candidateIdx === -1 || requiredIdx === -1) return false;

  return candidateIdx >= requiredIdx;
}
