// SYNC: Keep in sync with frontend/src/constants/roles.ts
export const ROLES = {
  ADMIN: 'admin',
  BUYER: 'buyer',
  SELLER: 'seller'
} as const;

export type RoleName = (typeof ROLES)[keyof typeof ROLES];

export const ALL_ROLES = Object.values(ROLES);

export const RBAC_SYSTEM_ROLES = {
  SUPER_ADMIN: 'SUPER_ADMIN',
  ADMIN: 'ADMIN',
  VERIFICATION_OFFICER: 'VERIFICATION_OFFICER',
  BUYER: 'BUYER',
  SELLER: 'SELLER',
  FINANCE_OFFICER: 'FINANCE_OFFICER',
  AUDITOR: 'AUDITOR',
  SUPPORT_AGENT: 'SUPPORT_AGENT'
} as const;

export type RbacSystemRole = (typeof RBAC_SYSTEM_ROLES)[keyof typeof RBAC_SYSTEM_ROLES];
