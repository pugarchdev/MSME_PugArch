import prisma from '../config/prisma.js';
import { legacyRoleToAccountType } from '../constants/dynamic-rbac.js';

export type RbacScope = {
  scopeType?: 'PLATFORM' | 'DISTRICT' | 'ORGANIZATION' | 'GLOBAL' | 'COMPANY';
  scopeId?: string | number | null;
};

export const normalizeScope = (scope?: RbacScope) => {
  const scopeType = scope?.scopeType || undefined;
  const scopeId = scope?.scopeId === undefined || scope?.scopeId === null || scope?.scopeId === ''
    ? null
    : String(scope.scopeId);
  return { scopeType, scopeId };
};

const accountTypeCode = (accountType: unknown) => {
  if (!accountType) return null;
  if (typeof accountType === 'string') return accountType;
  if (typeof accountType === 'object' && 'code' in accountType) return String((accountType as any).code);
  return null;
};

export const getAccountTypeForUser = (user: { role?: string; accountType?: unknown; accountTypeId?: number | null }) => {
  if (user.role && ['seller', 'shg', 'buyer', 'admin', 'master_admin', 'financier'].includes(user.role)) {
    return legacyRoleToAccountType(user.role);
  }
  const code = accountTypeCode(user.accountType);
  if (code && typeof user.accountTypeId === 'number') {
    return { accountType: code, accountTypeId: user.accountTypeId };
  }
  return legacyRoleToAccountType(user.role);
};

export const isMasterAdmin = (user?: { role?: string; accountType?: unknown; accountTypeId?: number | null }) => {
  if (!user) return false;
  const account = getAccountTypeForUser(user);
  return user.role === 'master_admin' || account.accountType === 'MASTER_ADMIN' || account.accountTypeId === 0;
};

export const getCurrentUserPermissions = async (userId: number, scope?: RbacScope) => {
  const normalized = normalizeScope(scope);
  const now = new Date();
  const scopeFilters: any[] = [{ scopeType: 'PLATFORM', scopeId: null }, { scopeType: 'GLOBAL', scopeId: null }];

  if (normalized.scopeType) {
    scopeFilters.push({
      scopeType: normalized.scopeType,
      ...(normalized.scopeId === null ? { scopeId: null } : { scopeId: normalized.scopeId })
    });
  }

  const assignments = await (prisma as any).userRole.findMany({
    where: {
      userId,
      isActive: true,
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
        ...(normalized.scopeType ? [{ OR: scopeFilters }] : [])
      ]
    },
    include: {
      role: {
        include: {
          permissions: {
            where: { allowed: true },
            include: { permission: true }
          }
        }
      }
    }
  });

  const assigned = assignments.flatMap((assignment: any) => {
    if (!assignment.role || assignment.role.status !== 'ACTIVE') return [];
    return assignment.role.permissions.map((rp: any) => rp.permission?.code).filter(Boolean);
  });

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { role: true }
  });

  const defaults: string[] = [];
  if (user) {
    if (normalized.scopeType === 'ORGANIZATION' && normalized.scopeId) {
      const membership = await prisma.orgMembership.findUnique({
        where: { userId_organizationId: { userId, organizationId: Number(normalized.scopeId) } },
        select: { orgRole: true, isActive: true }
      }).catch(() => null);
      if (membership?.isActive && membership.orgRole === 'ORG_ADMIN') {
        defaults.push(
          'team.member.view',
          'team.member.invite',
          'team.member.disable',
          'team.role.view',
          'team.role.manage',
          'team.role.assign',
          'organization.view',
          'organization.update'
        );
      }
    }

    if (user.role === 'seller' || user.role === 'shg') {
      defaults.push(
        'dashboard.view',
        'catalogue.product.view',
        'catalogue.product.create',
        'catalogue.product.update',
        'catalogue.product.delete',
        'catalogue.service.view',
        'catalogue.service.create',
        'catalogue.service.update',
        'catalogue.service.delete',
        'marketplace.view',
        'bid.submit',
        'delivery.view',
        'delivery.create',
        'delivery.update',
        'delivery.dispatch',
        'grn.view',
        'invoice.view',
        'invoice.approve',
        'payment.view',
        'escrow.view',
        'dispute.view'
      );
    } else if (user.role === 'buyer') {
      defaults.push(
        'dashboard.view',
        'marketplace.view',
        'requirement.view',
        'requirement.create',
        'requirement.publish',
        'tender.view',
        'tender.create',
        'tender.update',
        'tender.publish',
        'bid.technical.evaluate',
        'bid.financial.evaluate',
        'award.recommend',
        'purchase_order.view',
        'purchase_order.create',
        'purchase_order.approve',
        'cart.view',
        'cart.add',
        'cart.submit_for_approval',
        'checkout.initiate',
        'checkout.approve',
        'delivery.view',
        'delivery.confirm',
        'grn.view',
        'grn.create',
        'grn.approve',
        'inspection.view',
        'inspection.create',
        'inspection.approve',
        'invoice.view',
        'invoice.approve',
        'payment.view',
        'payment.initiate',
        'escrow.release',
        'dispute.view',
        'dispute.manage'
      );
    } else if (user.role === 'admin' || user.role === 'master_admin') {
      defaults.push('*');
    }
  }

  return Array.from(new Set<string>([...assigned, ...defaults]));
};

export const getActivePermissionCodes = getCurrentUserPermissions;

export const userHasPermission = async (
  user: { id: number; role?: string; accountType?: unknown; accountTypeId?: number | null },
  permissionCode: string,
  scope?: RbacScope
) => {
  if (isMasterAdmin(user)) return true;

  const dbPermissions = await getCurrentUserPermissions(user.id, scope);
  if (dbPermissions.includes('*') || dbPermissions.includes(permissionCode)) return true;
  return false;
};

export const ensureAssignablePermissions = async (
  actor: { id: number; role?: string; accountType?: unknown; accountTypeId?: number | null },
  permissionCodes: string[],
  scope?: RbacScope
) => {
  if (isMasterAdmin(actor)) return;
  const actorPermissions = await getCurrentUserPermissions(actor.id, scope);
  const missing = permissionCodes.filter(code => !actorPermissions.includes(code));
  if (missing.length > 0) {
    const error = new Error(`You cannot assign permissions you do not have: ${missing.join(', ')}`);
    (error as any).statusCode = 403;
    (error as any).code = 'PERMISSION_ESCALATION_DENIED';
    throw error;
  }
};

const rbacError = (message: string, statusCode = 403, code = 'RBAC_SCOPE_DENIED') => {
  const error = new Error(message);
  (error as any).statusCode = statusCode;
  (error as any).code = code;
  return error;
};

export const assertCanManageRole = async (
  actor: { id: number; role?: string; accountType?: unknown; accountTypeId?: number | null; organizationId?: number | null; companyId?: number | null },
  targetScopeType: string,
  targetScopeId?: string | number | null
) => {
  if (isMasterAdmin(actor)) return;
  const scope = normalizeScope({ scopeType: targetScopeType as any, scopeId: targetScopeId });
  const account = getAccountTypeForUser(actor);

  if (scope.scopeType === 'PLATFORM') {
    throw rbacError('Only Master Admin can manage platform roles.', 403, 'PLATFORM_SCOPE_DENIED');
  }

  if (scope.scopeType === 'DISTRICT') {
    if (account.accountType !== 'SUPERADMIN' && account.accountTypeId !== 1) {
      throw rbacError('Only Collector/Superadmin users can manage district roles.', 403, 'DISTRICT_SCOPE_DENIED');
    }
    if (scope.scopeId && actor.companyId && String(scope.scopeId) !== String(actor.companyId)) {
      throw rbacError('Cannot manage another district scope.', 403, 'CROSS_SCOPE_DENIED');
    }
    if (!(await userHasPermission(actor, 'team.role.manage', scope))) {
      throw rbacError('Missing permission: team.role.manage', 403, 'PERMISSION_DENIED');
    }
    return;
  }

  if (scope.scopeType === 'ORGANIZATION') {
    if (!actor.organizationId || !scope.scopeId || String(actor.organizationId) !== String(scope.scopeId)) {
      throw rbacError('Cannot manage roles outside your organization.', 403, 'CROSS_SCOPE_DENIED');
    }
    if (!(await userHasPermission(actor, 'team.role.manage', scope))) {
      throw rbacError('Missing permission: team.role.manage', 403, 'PERMISSION_DENIED');
    }
    return;
  }

  throw rbacError('Unsupported RBAC scope.', 400, 'INVALID_RBAC_SCOPE');
};

export const assertCanAssignRole = async (
  actor: { id: number; role?: string; accountType?: unknown; accountTypeId?: number | null; organizationId?: number | null; companyId?: number | null },
  targetUserId: number,
  targetRoleId: number,
  scopeType: string,
  scopeId?: string | number | null
) => {
  if (actor.id === targetUserId && !isMasterAdmin(actor)) {
    throw rbacError('You cannot change your own role assignments.', 403, 'SELF_ESCALATION_DENIED');
  }

  await assertCanManageRole(actor, scopeType, scopeId);

  const role = await (prisma as any).rbacRole.findUnique({
    where: { id: targetRoleId },
    include: { permissions: { where: { allowed: true }, include: { permission: true } } }
  });
  if (!role || role.status !== 'ACTIVE') {
    throw rbacError('Role not found or inactive.', 404, 'ROLE_NOT_FOUND');
  }
  if (role.scopeType !== scopeType || String(role.scopeId || '') !== String(scopeId || '')) {
    throw rbacError('Cannot assign a role across scopes.', 403, 'CROSS_SCOPE_DENIED');
  }

  await ensureAssignablePermissions(
    actor,
    role.permissions.map((rp: any) => rp.permission.code),
    { scopeType: scopeType as any, scopeId }
  );

  return role;
};
