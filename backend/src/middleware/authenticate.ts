import type { NextFunction, Request, Response } from 'express';
import prisma from '../config/prisma.js';
import { verifyAccessToken } from '../services/token.service.js';
import { apiResponse } from '../utils/apiResponse.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { getOrSetCache } from '../services/cache.service.js';
import { redisKeys } from '../constants/redis-keys.js';

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

    const cacheKey = redisKeys.cacheAuthUser(userId, sessionVersion);
    let cachedUser;
    try {
      cachedUser = await getOrSetCache<AuthenticatedUser & { lockedUntil: string | null; accountStatus: string }>(
        cacheKey,
        async () => {
          const userDb = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true, role: true, sessionVersion: true, lockedUntil: true, accountStatus: true, organizationId: true, companyId: true }
          });

          if (!userDb || userDb.role !== decoded.role || userDb.sessionVersion !== sessionVersion) {
            throw new Error('SESSION_INVALID');
          }

          const authUser = {
            id: userDb.id,
            role: userDb.role,
            sessionVersion: userDb.sessionVersion,
            permissions: [] as string[],
            organizationId: userDb.organizationId,
            companyId: userDb.companyId,
            enabledFeatures: [] as string[],
            lockedUntil: userDb.lockedUntil ? userDb.lockedUntil.toISOString() : null,
            accountStatus: userDb.accountStatus
          };

          try {
            const roleCode = userDb.role.toUpperCase();
            const rbacRole = await (prisma as any).rbacRole.findUnique({
              where: { code: roleCode },
              include: {
                permissions: {
                  include: { permission: true }
                }
              }
            });
            if (rbacRole) {
              authUser.permissions = rbacRole.permissions.map((rp: any) => rp.permission.code);
            }

            const activeAssignments = await (prisma as any).userRole.findMany({
              where: {
                userId: userDb.id,
                isActive: true,
                OR: [{ companyId: null }, { companyId: userDb.companyId }]
              },
              include: { role: { include: { permissions: { include: { permission: true } } } } }
            });
            const dynamicPermissions = activeAssignments.flatMap((assignment: any) =>
              assignment.role.permissions.map((rp: any) => rp.permission.code)
            );
            authUser.permissions = Array.from(new Set([...(authUser.permissions || []), ...dynamicPermissions]));

            const enabledCodes: string[] = [];
            if (userDb.companyId) {
              const companyFeatures = await (prisma as any).companyFeature.findMany({
                where: { companyId: userDb.companyId },
                include: { feature: true }
              });
              const activeCodes = companyFeatures
                .filter((row: any) => row.enabled === true)
                .map((row: any) => row.feature.code);
              enabledCodes.push(...activeCodes);
              const explicitlyDisabled = companyFeatures.some(
                (row: any) => row.feature.code === 'admin-bid-approval' && row.enabled === false
              );
              if (!explicitlyDisabled) {
                enabledCodes.push('admin-bid-approval');
              }
            } else {
              const allFeatures = await prisma.feature.findMany({ select: { code: true } });
              enabledCodes.push(...allFeatures.map(f => f.code));
            }
            authUser.enabledFeatures = Array.from(new Set(enabledCodes));
          } catch {
            // Fallback
          }

          return authUser;
        },
        60 // 60 seconds TTL
      );
    } catch (err: any) {
      if (err.message === 'SESSION_INVALID') {
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
      throw err;
    }

    if (cachedUser.lockedUntil && new Date(cachedUser.lockedUntil) > new Date()) {
      return apiResponse.error(res, 423, 'Account is temporarily locked', 'ACCOUNT_LOCKED');
    }

    if (cachedUser.accountStatus !== 'ACTIVE') {
      return apiResponse.error(res, 403, 'Your account is inactive or blocked. Please contact the platform administrator.', 'ACCOUNT_DISABLED');
    }

    req.user = {
      id: cachedUser.id,
      role: cachedUser.role,
      sessionVersion: cachedUser.sessionVersion,
      permissions: cachedUser.permissions,
      organizationId: cachedUser.organizationId,
      companyId: cachedUser.companyId,
      enabledFeatures: cachedUser.enabledFeatures
    };

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
