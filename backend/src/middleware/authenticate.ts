import type { NextFunction, Request, Response } from 'express';
import prisma from '../lib/prisma.js';
import { verifyAccessToken } from '../services/token.service.js';
import { apiResponse } from '../utils/apiResponse.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { getOrSetCache } from '../services/cache.service.js';
import { redisKeys } from '../constants/redis-keys.js';
import { getActivePermissionCodes, getAccountTypeForUser } from '../services/rbac.service.js';
import { getAccessTokenFromRequest } from '../services/auth-cookie.service.js';

export type AuthenticatedUser = {
  id: number;
  role: string;
  accountType?: string;
  accountTypeId?: number;
  sessionVersion: number;
  permissions?: string[];
  organizationId?: number | null;
  companyId?: number | null;
  districtId?: number | null;
  activeScope?: { scopeType: string; scopeId: string | null };
  enabledFeatures?: string[];
};

export type AuthRequest = Request & {
  user?: AuthenticatedUser;
};

const isNoisyNotificationStream = (req: Request) =>
  req.method === 'GET' && req.originalUrl.split('?')[0] === '/api/notifications/stream';

export const authenticate = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization || '';
  const [scheme, headerToken] = authHeader.split(' ');
  const canUseHeaderToken = scheme === 'Bearer' && headerToken && !['null', 'undefined', 'cookie-session'].includes(headerToken);
  const token = canUseHeaderToken
    ? headerToken
    : (req.query.token && typeof req.query.token === 'string')
      ? req.query.token
      : getAccessTokenFromRequest(req);

  if (!token) {
    if (!isNoisyNotificationStream(req)) {
      void auditLog({
        action: 'security.unauthorized_access',
        entityType: 'api',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { path: req.originalUrl, method: req.method, reason: 'missing_token' }
      });
    }
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
          const userDb = await (prisma as any).user.findUnique({
            where: { id: userId },
            select: { id: true, role: true, accountType: true, accountTypeId: true, sessionVersion: true, lockedUntil: true, accountStatus: true, organizationId: true, companyId: true }
          });

          if (!userDb || userDb.role !== decoded.role || userDb.sessionVersion !== sessionVersion) {
            throw new Error('SESSION_INVALID');
          }

          const account = getAccountTypeForUser(userDb as any);
          const activeScope = userDb.organizationId
            ? { scopeType: 'ORGANIZATION', scopeId: String(userDb.organizationId) }
            : userDb.companyId
              ? { scopeType: 'DISTRICT', scopeId: String(userDb.companyId) }
              : { scopeType: 'PLATFORM', scopeId: null };
          const authUser = {
            id: userDb.id,
            role: userDb.role,
            accountType: account.accountType,
            accountTypeId: account.accountTypeId,
            sessionVersion: userDb.sessionVersion,
            permissions: [] as string[],
            organizationId: userDb.organizationId,
            companyId: userDb.companyId,
            districtId: userDb.companyId,
            activeScope,
            enabledFeatures: [] as string[],
            lockedUntil: userDb.lockedUntil ? userDb.lockedUntil.toISOString() : null,
            accountStatus: userDb.accountStatus
          };

          try {
            authUser.permissions = await getActivePermissionCodes(userDb.id, activeScope as any);

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
        if (!isNoisyNotificationStream(req)) {
          void auditLog({
            actorUserId: userId || undefined,
            actorRole: String(decoded.role || ''),
            action: 'security.unauthorized_access',
            entityType: 'api',
            ipAddress: req.ip,
            userAgent: req.headers['user-agent'],
            metadata: { path: req.originalUrl, method: req.method, reason: 'invalid_session' }
          });
        }
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
      accountType: cachedUser.accountType,
      accountTypeId: cachedUser.accountTypeId,
      sessionVersion: cachedUser.sessionVersion,
      permissions: cachedUser.permissions,
      organizationId: cachedUser.organizationId,
      companyId: cachedUser.companyId,
      districtId: cachedUser.districtId,
      activeScope: cachedUser.activeScope,
      enabledFeatures: cachedUser.enabledFeatures
    };

    return next();
  } catch {
    if (!isNoisyNotificationStream(req)) {
      void auditLog({
        action: 'security.unauthorized_access',
        entityType: 'api',
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        metadata: { path: req.originalUrl, method: req.method, reason: 'invalid_token' }
      });
    }
    return apiResponse.error(res, 401, 'Invalid authentication token', 'AUTH_TOKEN_INVALID');
  }
};
