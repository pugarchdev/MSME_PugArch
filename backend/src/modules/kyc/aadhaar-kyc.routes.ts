import { Router, type NextFunction, type Request, type Response } from 'express';
import { authenticate, type AuthRequest } from '../../middleware/auth.js';
import { apiResponse } from '../../utils/apiResponse.js';
import { aadhaarKycService } from './aadhaar-kyc.service.js';
import { isProduction } from '../../config/env.js';

const router = Router();

type RateRecord = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateRecord>();

const rateLimit = (limit: number, windowMs: number) => (req: Request, res: Response, next: NextFunction) => {
  const key = `${req.ip || 'unknown'}:${req.path}`;
  const now = Date.now();
  const current = rateBuckets.get(key);
  if (!current || current.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + windowMs });
    return next();
  }
  if (current.count >= limit) {
    return apiResponse.error(res, 429, 'Too many Aadhaar verification requests. Please wait before trying again.', 'RATE_LIMITED');
  }
  current.count += 1;
  return next();
};

const asyncRoute = (handler: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  (req: AuthRequest, res: Response, next: NextFunction) => {
    handler(req, res).catch(next);
  };

const requestMeta = (req: Request) => {
  const userAgent = req.headers['user-agent'];
  return {
    ipAddress: req.ip,
    userAgent: Array.isArray(userAgent) ? userAgent.join(', ') : userAgent,
  };
};

router.get('/kyc/aadhaar/start', authenticate, rateLimit(5, 10 * 60_000), asyncRoute(async (req, res) => {
  if (!req.user) return apiResponse.error(res, 401, 'Authentication token is required', 'AUTH_TOKEN_MISSING');
  try {
    const { redirectPath, frontendOrigin } = req.query;
    const safeRedirectPath =
      typeof redirectPath === 'string' &&
      redirectPath.startsWith('/') &&
      !redirectPath.startsWith('//') &&
      !redirectPath.includes('\\')
        ? redirectPath
        : undefined;

    const url = await aadhaarKycService.start(req.user, requestMeta(req), safeRedirectPath, typeof frontendOrigin === 'string' ? frontendOrigin : undefined);
    return res.redirect(url);
  } catch (error: any) {
    return apiResponse.error(res, error?.statusCode || 500, error?.message || 'Unable to start Aadhaar verification', error?.code || 'AADHAAR_KYC_START_FAILED');
  }
}));

router.post('/kyc/aadhaar/start-url', authenticate, rateLimit(5, 10 * 60_000), asyncRoute(async (req, res) => {
  if (!req.user) return apiResponse.error(res, 401, 'Authentication token is required', 'AUTH_TOKEN_MISSING');
  try {
    const { redirectPath, frontendOrigin } = req.body;
    const safeRedirectPath =
      typeof redirectPath === 'string' &&
      redirectPath.startsWith('/') &&
      !redirectPath.startsWith('//') &&
      !redirectPath.includes('\\')
        ? redirectPath
        : undefined;

    const url = await aadhaarKycService.start(req.user, requestMeta(req), safeRedirectPath, frontendOrigin);
    return apiResponse.success(res, { authorizationUrl: url });
  } catch (error: any) {
    return apiResponse.error(res, error?.statusCode || 500, error?.message || 'Unable to start Aadhaar verification', error?.code || 'AADHAAR_KYC_START_FAILED');
  }
}));

router.get(['/kyc/aadhaar/callback', '/kyc/aadhar/callback'], rateLimit(30, 10 * 60_000), asyncRoute(async (req, res) => {
  try {
    const url = await aadhaarKycService.callback(req.query as Record<string, unknown>, requestMeta(req));
    return res.redirect(url);
  } catch {
    return res.redirect(aadhaarKycService.redirectUrl('failed'));
  }
}));

router.post('/kyc/aadhaar/pre-register/start', rateLimit(5, 10 * 60_000), asyncRoute(async (req, res) => {
  try {
    const { consent, mobile, aadhaarNumber, vid, redirectPath, frontendOrigin } = req.body;

if (!consent) {
  return apiResponse.error(res, 400, 'Consent is required', 'CONSENT_REQUIRED');
}

const safeRedirectPath =
  typeof redirectPath === 'string' &&
  redirectPath.startsWith('/') &&
  !redirectPath.startsWith('//') &&
  !redirectPath.includes('\\')
    ? redirectPath
    : undefined;

const result = await aadhaarKycService.preRegisterStart(
  {
    consent,
    mobile,
    aadhaarNumber,
    vid,
    redirectPath: safeRedirectPath,
    frontendOrigin,
  },
  requestMeta(req)
);
    return apiResponse.success(res, result);
  } catch (error: any) {
    console.error('[Aadhaar Pre-register Start Error]:', {
      message: error?.message,
      code: error?.code,
      name: error?.name,
      stack: error?.stack
    });
    const statusCode = error?.statusCode || 500;
    const isInternal = statusCode >= 500;
    const message = isProduction && isInternal
      ? 'Unable to start Aadhaar verification'
      : (error?.message || 'Unable to start Aadhaar verification');
    return apiResponse.error(res, statusCode, message, error?.code || 'AADHAAR_KYC_START_FAILED');
  }
}));

router.get(['/kyc/aadhaar/pre-register/callback', '/kyc/aadhar/pre-register/callback'], rateLimit(30, 10 * 60_000), asyncRoute(async (req, res) => {
  try {
    const url = await aadhaarKycService.preRegisterCallback(req.query as Record<string, unknown>, requestMeta(req));
    return res.redirect(url);
  } catch {
    return res.redirect(aadhaarKycService.redirectUrl('failed'));
  }
}));

router.get('/kyc/aadhaar/pre-register/status', rateLimit(30, 10 * 60_000), asyncRoute(async (req, res) => {
  try {
    const kycSessionToken = typeof req.query.token === 'string' ? req.query.token : '';
    if (!kycSessionToken) return apiResponse.error(res, 400, 'KYC session token is required', 'TOKEN_REQUIRED');
    const result = await aadhaarKycService.preRegisterStatus(kycSessionToken);
    
    if (!result.isValid) {
      if (result.used) {
        return apiResponse.error(res, 400, 'KYC session has already been used', 'SESSION_ALREADY_USED');
      }
      return apiResponse.error(res, 400, 'KYC session has expired', 'SESSION_EXPIRED');
    }
    
    return apiResponse.success(res, result);
  } catch (error: any) {
    console.error('[Aadhaar Pre-register Status Error]:', {
      message: error?.message,
      code: error?.code,
      name: error?.name,
      stack: error?.stack
    });
    const statusCode = error?.statusCode || 500;
    const isInternal = statusCode >= 500;
    const message = isProduction && isInternal
      ? 'Unable to fetch status'
      : (error?.message || 'Unable to fetch status');
    return apiResponse.error(res, statusCode, message, error?.code || 'AADHAAR_KYC_STATUS_FAILED');
  }
}));

router.get('/kyc/aadhaar/status', asyncRoute(async (req, res) => {
  const token = typeof req.query.token === 'string' ? req.query.token : '';
  if (token) {
    try {
      const result = await aadhaarKycService.preRegisterStatus(token);
      
      return apiResponse.success(res, {
        verified: result.status === 'VERIFIED' && result.isValid,
        verificationId: token,
        maskedAadhaar: result.aadhaarLast4 ? `XXXX XXXX ${result.aadhaarLast4}` : 'XXXX XXXX 5417',
        firstName: result.verifiedName ? result.verifiedName.split(' ')[0] : '',
        lastName: result.verifiedName ? result.verifiedName.split(' ').slice(1).join(' ') : '',
        status: result.status,
        isValid: result.isValid,
        used: result.used
      });
    } catch (err: any) {
      return apiResponse.error(
        res,
        err.statusCode || 500,
        err.message || 'Unable to check verification status',
        err.code || 'AADHAAR_KYC_STATUS_FAILED'
      );
    }
  }

  let authenticated = false;
  try {
    await new Promise<void>((resolve, reject) => {
      authenticate(req, res, (err) => {
        if (err) reject(err);
        else {
          authenticated = true;
          resolve();
        }
      });
    });
  } catch (err) {
    // Auth middleware handles response errors
  }

  if (!authenticated) return;

  if (!req.user) return apiResponse.error(res, 401, 'Authentication token is required', 'AUTH_TOKEN_MISSING');
  const status = await aadhaarKycService.status(req.user);
  return apiResponse.success(res, status);
}));

router.post('/kyc/aadhaar/reset', authenticate, rateLimit(5, 10 * 60_000), asyncRoute(async (req, res) => {
  if (!req.user) return apiResponse.error(res, 401, 'Authentication token is required', 'AUTH_TOKEN_MISSING');
  const status = await aadhaarKycService.reset(req.user, requestMeta(req));
  return apiResponse.success(res, status);
}));

export default router;
