import type { NextFunction, Request, Response } from 'express';
import { getAccessTokenFromRequest, getCsrfTokenFromRequest } from '../services/auth-cookie.service.js';
import { apiResponse } from '../utils/apiResponse.js';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);
const CSRF_EXEMPT_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/2fa/verify',
  '/api/auth/register',
  '/api/auth/refresh',
  '/api/auth/logout',
  '/api/auth/send-email-otp',
  '/api/auth/verify-email-otp',
  '/api/auth/send-mobile-otp',
  '/api/auth/verify-mobile-otp',
  '/api/auth/forgot-password',
  '/api/auth/forgot-password/send-otp',
  '/api/auth/forgot-password/verify-otp',
  '/api/auth/reset-password',
  '/api/seller/register',
  '/api/buyer/register',
  '/api/shg/register',
  '/api/org/invite/signup'
]);

export const csrfProtection = (req: Request, res: Response, next: NextFunction) => {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.path.startsWith('/api')) return next();
  const requestPath = (req.originalUrl || req.path).split('?')[0].replace(/\/+$/, '');
  if ([...CSRF_EXEMPT_PATHS].some(path => requestPath === path || requestPath.endsWith(path))) return next();
  if (!getAccessTokenFromRequest(req)) return next();

  const cookieToken = getCsrfTokenFromRequest(req);
  const headerToken = String(req.headers['x-csrf-token'] || '');
  if (!cookieToken || !headerToken || cookieToken !== headerToken) {
    return apiResponse.error(res, 403, 'Invalid CSRF token', 'CSRF_TOKEN_INVALID');
  }

  return next();
};
