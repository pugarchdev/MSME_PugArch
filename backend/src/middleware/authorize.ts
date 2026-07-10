import type { NextFunction, Request, Response } from 'express';
import type { Permission } from '../constants/permissions.js';
import { apiResponse } from '../utils/apiResponse.js';
import prisma from '../lib/prisma.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { getAccountTypeForUser, getCurrentUserPermissions, isMasterAdmin, userHasPermission, type RbacScope } from '../services/rbac.service.js';

const LEGACY_ROLE_TO_ACCOUNT_TYPE: Record<string, string> = {
  master_admin: 'MASTER_ADMIN',
  admin: 'SUPERADMIN',
  superadmin: 'SUPERADMIN',
  collector: 'SUPERADMIN',
  seller: 'SELLER',
  buyer: 'BUYER',
  shg: 'SHG'
};

const normalizeAccountType = (value: string) => LEGACY_ROLE_TO_ACCOUNT_TYPE[value] || value;

export const requireAccountType = (...accountTypes: string[]) => {
  const allowed = accountTypes.map(normalizeAccountType);
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const account = getAccountTypeForUser(req.user);
    if (!isMasterAdmin(req.user) && !allowed.includes(account.accountType || '')) {
      return apiResponse.error(res, 403, 'Access denied', 'ACCESS_DENIED');
    }

    return next();
  };
};

/**
 * Compatibility alias for broad account-category gates only. Business actions
 * must use requirePermission() so authorization is resolved from RBAC tables.
 */
export const authorize = requireAccountType;
export const requireRole = authorize;
export const checkRole = authorize;

type PermissionOptions = {
  scopeType?: 'PLATFORM' | 'DISTRICT' | 'ORGANIZATION';
  getScopeId?: (req: Request) => string | number | null | undefined;
};

const resolvePermissionScope = (req: Request, options?: PermissionOptions): RbacScope | undefined => {
  if (!options?.scopeType) return (req as any).rbacScope || req.user?.activeScope;
  return {
    scopeType: options.scopeType,
    scopeId: options.getScopeId ? options.getScopeId(req) ?? null : null
  };
};

export const requirePermission = (permission: Permission | string, options?: PermissionOptions) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');
    }

    try {
      const scope = resolvePermissionScope(req, options);
      const permissions = await getCurrentUserPermissions(req.user.id, scope);
      (req as any).rbac = { scope, permissions };
      const allowed = isMasterAdmin(req.user) || permissions.includes('*') || permissions.includes(String(permission));
      if (!allowed) {
        return apiResponse.error(res, 403, `Missing permission: ${permission}`, 'PERMISSION_DENIED', { requiredPermission: permission });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

export const checkPermission = requirePermission;

export const requireScopedPermission = (permission: Permission | string, scopeResolver?: (req: Request) => RbacScope | undefined) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');
    try {
      const scope = scopeResolver?.(req) || (req as any).rbacScope || req.user.activeScope;
      if (!(await userHasPermission(req.user as any, String(permission), scope))) {
        return apiResponse.error(res, 403, `Missing permission: ${permission}`, 'PERMISSION_DENIED', { requiredPermission: permission });
      }
      return next();
    } catch (error) {
      return next(error);
    }
  };
};

export const authorizeAdmin = requireAccountType('SUPERADMIN', 'MASTER_ADMIN');

export const checkFeatureEnabled = (featureCode: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');
    if (isMasterAdmin(req.user) || req.user.role === 'admin') return next();

    const companyId = req.user.companyId;
    if (!companyId) return apiResponse.error(res, 403, 'Company context is required', 'COMPANY_CONTEXT_REQUIRED');

    if (featureCode === 'admin-bid-approval') {
      const disabledRecord = await (prisma as any).companyFeature.findFirst({
        where: { companyId, enabled: false, feature: { code: featureCode } },
        select: { companyId: true }
      });
      if (disabledRecord) return apiResponse.error(res, 403, 'Feature is disabled for this company', 'FEATURE_DISABLED');
      return next();
    }

    const enabled = await (prisma as any).companyFeature.findFirst({
      where: { companyId, enabled: true, feature: { code: featureCode } },
      select: { companyId: true }
    });
    if (!enabled) return apiResponse.error(res, 403, 'Feature is disabled for this company', 'FEATURE_DISABLED');
    return next();
  };
};

export const getCurrentCompany = async (req: Request) => {
  if (!req.user?.companyId) return null;
  return (prisma as any).company.findUnique({ where: { id: req.user.companyId } });
};

export const canAccessOrganization = async (req: Request, organizationId: number) => {
  if (!req.user) return false;
  if (isMasterAdmin(req.user)) return true;
  const organization = await prisma.organization.findUnique({
    where: { id: organizationId },
    select: { id: true, companyId: true }
  });
  if (!organization) return false;
  if (req.user.organizationId && req.user.organizationId === organizationId) return true;
  return Boolean(req.user.companyId && organization.companyId === req.user.companyId && req.user.role === 'admin');
};

export const createAuditLog = (req: Request, payload: {
  action: string;
  entityType?: string;
  entityId?: number | string;
  metadata?: Record<string, unknown>;
}) =>
  auditLog({
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    action: payload.action,
    entityType: payload.entityType,
    entityId: payload.entityId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: { companyId: req.user?.companyId, ...(payload.metadata || {}) }
  });
