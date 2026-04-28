export enum Role {
  USER = 'USER',
  OPERATOR = 'OPERATOR',
  ADMIN = 'ADMIN',
  GOVERNANCE_OPERATOR = 'GOVERNANCE_OPERATOR',
  KYC_OPERATOR = 'KYC_OPERATOR',
}

/**
 * Linear privilege hierarchy for standard roles.
 * GOVERNANCE_OPERATOR and KYC_OPERATOR are intentionally excluded from this
 * hierarchy — they are mutually exclusive specialised roles that do not
 * inherit from each other.  Only ADMIN supersedes both.
 */
export const ROLE_HIERARCHY: Role[] = [Role.USER, Role.OPERATOR, Role.ADMIN];

/**
 * Pairs of roles that are mutually exclusive and cannot be assigned together.
 * GOVERNANCE_OPERATOR and KYC_OPERATOR must never be held by the same user.
 */
export const CONFLICTING_ROLE_PAIRS: [Role, Role][] = [
  [Role.GOVERNANCE_OPERATOR, Role.KYC_OPERATOR],
];

/**
 * Returns true if the given set of roles contains a conflicting pair.
 */
export function hasConflictingRoles(roles: Role[]): boolean {
  return CONFLICTING_ROLE_PAIRS.some(
    ([a, b]) => roles.includes(a) && roles.includes(b),
  );
}

/**
 * Returns true if `candidate` satisfies the `required` role.
 *
 * Rules:
 *  1. Same role always satisfies itself.
 *  2. ADMIN supersedes every role.
 *  3. Specialised roles (GOVERNANCE_OPERATOR / KYC_OPERATOR) outside the
 *     linear hierarchy require an exact match — they do NOT inherit from
 *     or grant access to each other.
 *  4. Standard roles use the linear hierarchy comparison.
 */
export function hasRole(candidate: Role, required: Role): boolean {
  if (candidate === required) return true;
  if (candidate === Role.ADMIN) return true;

  const candidateIdx = ROLE_HIERARCHY.indexOf(candidate);
  const requiredIdx = ROLE_HIERARCHY.indexOf(required);

  // If either role is outside the linear hierarchy (a specialised role),
  // fall back to exact equality only — already handled above.
  if (candidateIdx === -1 || requiredIdx === -1) return false;

  return candidateIdx >= requiredIdx;
}
