export enum Role {
  USER = 'USER',
  OPERATOR = 'OPERATOR',
  ADMIN = 'ADMIN',
}

/** Role hierarchy — higher index = more privilege */
export const ROLE_HIERARCHY: Role[] = [Role.USER, Role.OPERATOR, Role.ADMIN];

/** Returns true if `candidate` has at least the privilege of `required` */
export function hasRole(candidate: Role, required: Role): boolean {
  return ROLE_HIERARCHY.indexOf(candidate) >= ROLE_HIERARCHY.indexOf(required);
}
