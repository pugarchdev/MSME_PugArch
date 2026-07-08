import jwt, { type SignOptions } from 'jsonwebtoken';
import { env } from '../config/env.js';

export type AccessTokenPayload = {
  id: number;
  role: string;
  accountType?: string;
  accountTypeId?: number;
  organizationId?: number | null;
  districtId?: number | null;
  activeScope?: { scopeType: string; scopeId: string | null };
  sessionVersion: number;
};

export type RefreshTokenPayload = {
  id: number;
  sessionVersion: number;
  type: 'refresh';
};

export const signAccessToken = (payload: AccessTokenPayload) =>
  jwt.sign(payload, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_EXPIRES_IN
  } as SignOptions);

export const signRefreshToken = (payload: Omit<RefreshTokenPayload, 'type'>) =>
  jwt.sign({ ...payload, type: 'refresh' }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_EXPIRES_IN
  } as SignOptions);

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.JWT_ACCESS_SECRET) as Partial<AccessTokenPayload>;

export const verifyRefreshToken = (token: string) =>
  jwt.verify(token, env.JWT_REFRESH_SECRET) as Partial<RefreshTokenPayload>;

const accountTypeCode = (accountType: unknown) => {
  if (!accountType) return undefined;
  if (typeof accountType === 'string') return accountType;
  if (typeof accountType === 'object' && 'code' in accountType) return String((accountType as any).code);
  return undefined;
};

const buildAccessPayload = (user: { id: number; role: string; sessionVersion: number; accountType?: unknown; accountTypeId?: number | null; organizationId?: number | null; companyId?: number | null }) => ({
  id: user.id,
  role: user.role,
  accountType: accountTypeCode(user.accountType),
  accountTypeId: user.accountTypeId ?? undefined,
  organizationId: user.organizationId ?? null,
  districtId: user.companyId ?? null,
  activeScope: user.organizationId
    ? { scopeType: 'ORGANIZATION', scopeId: String(user.organizationId) }
    : user.companyId
      ? { scopeType: 'DISTRICT', scopeId: String(user.companyId) }
      : { scopeType: 'PLATFORM', scopeId: null },
  sessionVersion: user.sessionVersion
});

export const issueAuthTokens = (user: { id: number; role: string; sessionVersion: number; accountType?: unknown; accountTypeId?: number | null; organizationId?: number | null; companyId?: number | null }) => ({
  token: signAccessToken(buildAccessPayload(user)),
  refreshToken: signRefreshToken({ id: user.id, sessionVersion: user.sessionVersion }),
  expiresIn: env.JWT_ACCESS_EXPIRES_IN
});

export const issueAuthResponse = (user: { id: number; role: string; sessionVersion: number; accountType?: unknown; accountTypeId?: number | null; organizationId?: number | null; companyId?: number | null }) => {
  const accessToken = signAccessToken(buildAccessPayload(user));
  return {
    token: accessToken,
    accessToken,
    refreshToken: signRefreshToken({ id: user.id, sessionVersion: user.sessionVersion }),
    expiresIn: env.JWT_ACCESS_EXPIRES_IN
  };
};
