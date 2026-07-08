import type { Request, Response } from 'express';
import { isProduction } from '../config/env.js';
import prisma from '../config/prisma.js';
import { randomToken, sha256 } from '../utils/crypto.js';
import { issueAuthResponse, verifyRefreshToken } from './token.service.js';

const ACCESS_COOKIE = 'token';
const REFRESH_COOKIE = 'refreshToken';
const CSRF_COOKIE = 'csrfToken';
const ACCESS_MAX_AGE_MS = 2 * 60 * 60 * 1000;
const REFRESH_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

type AuthUserForTokens = {
  id: number;
  role: string;
  sessionVersion: number;
  accountType?: unknown;
  accountTypeId?: number | null;
  organizationId?: number | null;
  companyId?: number | null;
};

const cookieBase = {
  sameSite: 'strict' as const,
  secure: isProduction,
  path: '/'
};

export const readCookie = (req: Request, name: string) => {
  const direct = (req as any).cookies?.[name];
  if (direct) return String(direct);
  const raw = req.headers.cookie || '';
  const match = raw
    .split(';')
    .map(part => part.trim())
    .find(part => part.startsWith(`${name}=`));
  if (!match) return '';
  try {
    return decodeURIComponent(match.slice(name.length + 1));
  } catch {
    return match.slice(name.length + 1);
  }
};

export const setAuthCookies = (res: Response, tokens: { accessToken: string; refreshToken: string }) => {
  const csrfToken = randomToken(24);
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...cookieBase,
    httpOnly: true,
    maxAge: ACCESS_MAX_AGE_MS
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...cookieBase,
    httpOnly: true,
    maxAge: REFRESH_MAX_AGE_MS
  });
  res.cookie(CSRF_COOKIE, csrfToken, {
    ...cookieBase,
    httpOnly: false,
    maxAge: ACCESS_MAX_AGE_MS
  });
};

export const clearAuthCookies = (res: Response) => {
  res.clearCookie(ACCESS_COOKIE, cookieBase);
  res.clearCookie(REFRESH_COOKIE, cookieBase);
  res.clearCookie(CSRF_COOKIE, cookieBase);
};

export const getAccessTokenFromRequest = (req: Request) => readCookie(req, ACCESS_COOKIE);
export const getRefreshTokenFromRequest = (req: Request) => readCookie(req, REFRESH_COOKIE);
export const getCsrfTokenFromRequest = (req: Request) => readCookie(req, CSRF_COOKIE);

export const createRefreshSession = async (req: Request, userId: number, refreshToken: string) => {
  await prisma.userSession.create({
    data: {
      userId,
      refreshTokenHash: sha256(refreshToken),
      ipAddress: req.ip,
      userAgent: String(req.headers['user-agent'] || ''),
      expiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS)
    }
  });
};

export const revokeRefreshSession = async (refreshToken: string) => {
  await prisma.userSession.updateMany({
    where: { refreshTokenHash: sha256(refreshToken), revokedAt: null },
    data: { revokedAt: new Date() }
  });
};

export const issueCookieAuth = async (req: Request, res: Response, user: AuthUserForTokens) => {
  const tokens = issueAuthResponse(user);
  await createRefreshSession(req, user.id, tokens.refreshToken);
  setAuthCookies(res, tokens);
  return {
    token: tokens.accessToken,
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn
  };
};

export const rotateRefreshToken = async (req: Request, res: Response, refreshToken: string) => {
  const decoded = verifyRefreshToken(refreshToken);
  if (decoded.type !== 'refresh' || !decoded.id || Number.isNaN(Number(decoded.sessionVersion))) {
    throw new Error('INVALID_REFRESH_TOKEN');
  }

  const tokenHash = sha256(refreshToken);
  const session = await prisma.userSession.findFirst({ where: { refreshTokenHash: tokenHash } });
  const user = await prisma.user.findUnique({ where: { id: Number(decoded.id) } });
  if (!user || user.sessionVersion !== Number(decoded.sessionVersion)) {
    throw new Error('SESSION_INVALID');
  }

  if (!session) {
    throw new Error('REFRESH_SESSION_NOT_FOUND');
  }

  if (session.revokedAt || session.expiresAt <= new Date()) {
    await prisma.user.update({
      where: { id: user.id },
      data: { sessionVersion: { increment: 1 } }
    });
    await prisma.userSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    throw new Error('REFRESH_TOKEN_REUSE_DETECTED');
  }

  const tokens = issueAuthResponse(user);
  await prisma.$transaction([
    prisma.userSession.update({ where: { id: session.id }, data: { revokedAt: new Date() } }),
    prisma.userSession.create({
      data: {
        userId: user.id,
        refreshTokenHash: sha256(tokens.refreshToken),
        ipAddress: req.ip,
        userAgent: String(req.headers['user-agent'] || ''),
        expiresAt: new Date(Date.now() + REFRESH_MAX_AGE_MS)
      }
    })
  ]);
  setAuthCookies(res, tokens);
  return {
    token: tokens.accessToken,
    accessToken: tokens.accessToken,
    expiresIn: tokens.expiresIn
  };
};
