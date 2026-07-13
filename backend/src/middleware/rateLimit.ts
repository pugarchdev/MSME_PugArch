import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { isRedisReady, redis } from '../config/redis.js';
import { redisKeyPrefixes, redisKeys } from '../constants/redis-keys.js';
import { apiResponse } from '../utils/apiResponse.js';
import { sha256 } from '../utils/crypto.js';
import { normalizeSpaces } from '../utils/sanitize.js';

type RateLimitOptions = {
  name: string;
  windowMs: number;
  max: number;
  keyGenerator?: (req: Request) => string;
};

type MemoryBucket = {
  count: number;
  resetAt: number;
};

const memoryBuckets = new Map<string, MemoryBucket>();

const clientIp = (req: Request) => normalizeSpaces(req.ip || req.socket.remoteAddress || 'unknown');

const defaultKeyGenerator = (req: Request) => {
  const route = `${req.method}:${req.baseUrl || req.path}`;
  return req.user?.id
    ? redisKeys.rateApi(req.user.id, route)
    : redisKeys.rateApiIp(clientIp(req), route);
};

const emailAwareKey = (scope: string) => (req: Request) => {
  const email = normalizeSpaces(req.body?.email).toLowerCase();
  const mobile = normalizeSpaces(req.body?.mobile || req.body?.identifier).replace(/\D/g, '');
  if (scope === 'login' && email) return redisKeys.rateLoginUser(email);
  if (scope === 'login') return redisKeys.rateLogin(clientIp(req));
  const identity = email
    ? `email:${sha256(email)}`
    : mobile
      ? `mobile:${sha256(mobile)}:ip:${clientIp(req)}`
      : `ip:${clientIp(req)}`;
  return `${scope}:${identity}`;
};

const routeLimiter = (options: RateLimitOptions) => {
  const keyFor = (req: Request) => {
    const generated = options.keyGenerator?.(req) || defaultKeyGenerator(req);
    return generated.startsWith(redisKeyPrefixes.rate) ? generated : redisKeys.rateNamed(options.name, generated);
  };

  return async (req: Request, res: Response, next: NextFunction) => {
    if (env.NODE_ENV === 'development' || env.NODE_ENV === 'test') {
      return next();
    }
    const key = keyFor(req);

    try {
      if (redis && isRedisReady()) {
        const count = Number(await redis.incr(key));
        if (count === 1) await redis.pexpire(key, options.windowMs);
        const ttl = Number(await redis.pttl(key));

        res.setHeader('RateLimit-Limit', String(options.max));
        res.setHeader('RateLimit-Remaining', String(Math.max(0, options.max - count)));
        res.setHeader('RateLimit-Reset', String(Math.ceil(Math.max(ttl, 0) / 1000)));

        if (count > options.max) {
          logger.warn({ requestId: req.id, rateLimit: options.name, key }, 'Rate limit exceeded');
          return apiResponse.error(res, 429, 'Too many requests. Please try again later.', 'RATE_LIMITED');
        }

        return next();
      }
    } catch (error) {
      logger.error({ err: error, requestId: req.id, rateLimit: options.name }, 'Redis rate limit failed');
    }

    if (process.env.NODE_ENV === 'production') {
      logger.debug({ requestId: req.id, rateLimit: options.name }, 'Redis rate limit unavailable in production; falling back to in-memory rate limiting');
    }

    const now = Date.now();
    const bucket = memoryBuckets.get(key);
    if (!bucket || bucket.resetAt <= now) {
      memoryBuckets.set(key, { count: 1, resetAt: now + options.windowMs });
      return next();
    }

    bucket.count += 1;
    if (bucket.count > options.max) {
      return apiResponse.error(res, 429, 'Too many requests. Please try again later.', 'RATE_LIMITED');
    }

    return next();
  };
};

export const rateLimit = (options?: Partial<RateLimitOptions>) =>
  routeLimiter({
    name: options?.name || 'general',
    windowMs: options?.windowMs || env.RATE_LIMIT_WINDOW_MS,
    max: options?.max || env.RATE_LIMIT_MAX,
    keyGenerator: options?.keyGenerator
  });

export const authLoginRateLimit = routeLimiter({
  name: 'auth-login',
  windowMs: 15 * 60 * 1000,
  max: 10,
  keyGenerator: emailAwareKey('login')
});

export const otpSendRateLimit = routeLimiter({
  name: 'otp-send-guard',
  windowMs: 15 * 60 * 1000,
  max: 20,
  keyGenerator: emailAwareKey('otp-guard')
});

export const forgotPasswordRateLimit = routeLimiter({
  name: 'forgot-password',
  windowMs: 15 * 60 * 1000,
  max: 5,
  keyGenerator: emailAwareKey('forgot-password')
});

export const verificationRateLimit = routeLimiter({
  name: 'verification',
  windowMs: 60 * 60 * 1000,
  max: 30
});

export const uploadRateLimit = routeLimiter({
  name: 'upload',
  windowMs: 15 * 60 * 1000,
  max: 20
});

export const paymentRateLimit = routeLimiter({
  name: 'payment',
  windowMs: 15 * 60 * 1000,
  max: 10
});

export const catalogueSearchRateLimit = routeLimiter({
  name: 'catalogue-search',
  windowMs: 60 * 1000,
  max: 60
});

export const generalApiRateLimit = routeLimiter({
  name: 'api-general',
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX
});
