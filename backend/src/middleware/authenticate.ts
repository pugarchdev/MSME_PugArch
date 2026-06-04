import type { NextFunction, Request, Response } from 'express';
import prisma from '../config/prisma.js';
import { verifyAccessToken } from '../services/token.service.js';
import { apiResponse } from '../utils/apiResponse.js';
import { auditLog } from '../modules/audit/audit.service.js';

export type AuthenticatedUser = {
  id: number;
  role: string;
  sessionVersion: number;
  permissions?: string[];
  organizationId?: number | null;
  companyId?: number | null;
  enabledFeatures?: string[];
};

export type AuthRequest = Request & {
  user?: AuthenticatedUser;
};

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  let authHeader = req.headers.authorization || '';
  if (!authHeader && req.query.token && typeof req.query.token === 'string') {
    authHeader = `Bearer ${req.query.token}`;
  }
  const [scheme, token] = authHeader.split(' ');

  if (scheme !== 'Bearer' || !token) {
    void auditLog({
      action: 'security.unauthorized_access',
      entityType: 'api',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { path: req.originalUrl, method: req.method, reason: 'missing_token' }
    });
    return apiResponse.error(res, 401, 'Authentication token is required', 'AUTH_TOKEN_MISSING');
  }

  try {
    const decoded = verifyAccessToken(token);
    const userId = Number(decoded.id);
    const sessionVersion = Number(decoded.sessionVersion);
    if (!userId || !decoded.role || Number.isNaN(sessionVersion)) {
      return apiResponse.error(res, 401, 'Invalid authentication token', 'AUTH_TOKEN_INVALID');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, sessionVersion: true, lockedUntil: true, accountStatus: true, organizationId: true, companyId: true }
    });

    if (!user || user.role !== decoded.role || user.sessionVersion !== sessionVersion) {
      void auditLog({
        actorUserId: userId || undefined,
        actorRole: String(decoded.role || ''),
        action: 'security.unauthorized_access',
        entityType: 'api',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { path: req.originalUrl, method: req.method, reason: 'invalid_session' }
      });
      return apiResponse.error(res, 401, 'Session expired. Please sign in again.', 'SESSION_INVALID');
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      return apiResponse.error(res, 423, 'Account is temporarily locked', 'ACCOUNT_LOCKED');
    }

    if (user.accountStatus !== 'ACTIVE') {
      return apiResponse.error(res, 403, 'Your account is inactive or blocked. Please contact the platform administrator.', 'ACCOUNT_DISABLED');
    }

    req.user = { 
      id: user.id, 
      role: user.role, 
      sessionVersion: user.sessionVersion, 
      permissions: [], 
      organizationId: user.organizationId,
      companyId: user.companyId,
      enabledFeatures: []
    };

    // Fetch dynamic RBAC permissions
    try {
      const roleCode = user.role.toUpperCase();
      const rbacRole = await (prisma as any).rbacRole.findUnique({
        where: { code: roleCode },
        include: {
          permissions: {
            include: { permission: true }
          }
        }
      });
      if (rbacRole) {
        req.user.permissions = rbacRole.permissions.map((rp: any) => rp.permission.code);
      }

      const activeAssignments = await (prisma as any).userRole.findMany({
        where: {
          userId: user.id,
          isActive: true,
          OR: [{ companyId: null }, { companyId: user.companyId }]
        },
        include: { role: { include: { permissions: { include: { permission: true } } } } }
      });
      const dynamicPermissions = activeAssignments.flatMap((assignment: any) =>
        assignment.role.permissions.map((rp: any) => rp.permission.code)
      );
      req.user.permissions = Array.from(new Set([...(req.user.permissions || []), ...dynamicPermissions]));

      if (user.companyId) {
        const companyFeatures = await (prisma as any).companyFeature.findMany({
          where: { companyId: user.companyId, enabled: true },
          include: { feature: true }
        });
        req.user.enabledFeatures = companyFeatures.map((row: any) => row.feature.code);
      }
    } catch {
      // Fallback: empty permissions if RBAC lookup fails
    }

    return next();
  } catch {
    void auditLog({
      action: 'security.unauthorized_access',
      entityType: 'api',
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      metadata: { path: req.originalUrl, method: req.method, reason: 'invalid_token' }
    });
    return apiResponse.error(res, 401, 'Invalid authentication token', 'AUTH_TOKEN_INVALID');
  }
};
