import type { NextFunction, Request, Response } from 'express';
import { can, ROLE_PERMISSIONS, type Permission } from '../constants/permissions.js';
import { apiResponse } from '../utils/apiResponse.js';
import prisma from '../config/prisma.js';
import { auditLog } from '../modules/audit/audit.service.js';

export const authorize = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');
    }

    if (req.user.role !== 'master_admin' && !roles.includes(req.user.role)) {
      return apiResponse.error(res, 403, 'Access denied', 'ACCESS_DENIED');
    }

    return next();
  };
};

export const requireRole = authorize;
export const checkRole = authorize;

export const requirePermission = (permission: Permission) => {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');
    }

    if (!can(req.user, permission)) {
      return apiResponse.error(res, 403, 'Permission denied', 'PERMISSION_DENIED');
    }

    return next();
  };
};

export const checkPermission = requirePermission;

export const authorizeAdmin = authorize('admin', 'master_admin');

export const checkFeatureEnabled = (featureCode: string) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) return apiResponse.error(res, 401, 'Authentication required', 'AUTH_REQUIRED');
    if (req.user.role === 'master_admin') return next();

    const companyId = req.user.companyId;
    if (!companyId) return apiResponse.error(res, 403, 'Company context is required', 'COMPANY_CONTEXT_REQUIRED');

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
  if (req.user.role === 'master_admin') return true;
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
