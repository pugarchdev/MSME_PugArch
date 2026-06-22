import type { Request } from 'express';
import prisma from '../config/prisma.js';
import { isRedisReady, redis } from '../config/redis.js';
import { redisKeys } from '../constants/redis-keys.js';
import { ApiError } from '../utils/ApiError.js';
import { sha256 } from '../utils/crypto.js';
import { maskSensitive } from '../utils/maskSensitive.js';

const stableStringify = (value: unknown): string => {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
};

const requestHashFor = (req: Request, route: string) =>
  sha256(stableStringify({
    method: req.method,
    route,
    params: req.params,
    query: req.query,
    body: maskSensitive(req.body || {})
  }));

const toJsonSafe = <T>(value: T): T => JSON.parse(JSON.stringify(maskSensitive(value)));

export const idempotencyKeyFromRequest = (req: Request, fallbackSeed: string) => {
  const header = req.headers['idempotency-key'];
  const raw = Array.isArray(header) ? header[0] : header;
  const key = String(raw || '').trim();
  if (key) return key.slice(0, 128);
  return `auto:${sha256(fallbackSeed).slice(0, 48)}`;
};

export const withIdempotency = async <T extends Record<string, unknown>>(input: {
  req: Request;
  userId: number;
  route: string;
  key: string;
  ttlSeconds?: number;
  handler: () => Promise<T>;
}) => {
  const requestHash = requestHashFor(input.req, input.route);
  const ttlSeconds = input.ttlSeconds || 24 * 60 * 60;
  const expiresAt = new Date(Date.now() + ttlSeconds * 1000);
  const isPaymentRoute = input.route.toLowerCase().includes('payment');
  const redisIdemKey = isPaymentRoute ? redisKeys.idemPayment(input.key) : null;
  const MAX_RETRIES = 3;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    if (redisIdemKey && redis && isRedisReady()) {
      const acquired = await redis.set(redisIdemKey, requestHash, 'EX', ttlSeconds, 'NX');
      if (acquired !== 'OK') {
        const existing = await prisma.idempotencyKey.findUnique({
          where: {
            idempotencyKeyCompound: {
              key: input.key,
              userId: input.userId,
              route: input.route
            }
          }
        });
        if (existing?.requestHash && existing.requestHash !== requestHash) {
          throw new ApiError(409, 'Idempotency key reused with a different request', 'IDEMPOTENCY_CONFLICT');
        }
        if (existing?.status === 'completed' && existing.responseBody) return existing.responseBody as T;
        throw new ApiError(409, 'Request is already being processed', 'IDEMPOTENCY_PROCESSING');
      }
    }

    try {
      await prisma.idempotencyKey.create({
        data: {
          key: input.key,
          userId: input.userId,
          route: input.route,
          requestHash,
          status: 'processing',
          expiresAt
        }
      });
      break;
    } catch {
      const existing = await prisma.idempotencyKey.findUnique({
        where: {
          idempotencyKeyCompound: {
            key: input.key,
            userId: input.userId,
            route: input.route
          }
        }
      });

      if (!existing || existing.expiresAt <= new Date()) {
        await prisma.idempotencyKey.deleteMany({
          where: { key: input.key, userId: input.userId, route: input.route }
        });
        if (redisIdemKey && redis && isRedisReady()) {
          await redis.del(redisIdemKey).catch(() => undefined);
        }
        if (attempt === MAX_RETRIES - 1) {
          throw new ApiError(500, 'Failed to acquire idempotency lock after retries', 'IDEMPOTENCY_LOCK_FAILED');
        }
        await new Promise(r => setTimeout(r, 50 * (attempt + 1)));
        continue;
      }

      if (existing.requestHash !== requestHash) {
        throw new ApiError(409, 'Idempotency key reused with a different request', 'IDEMPOTENCY_CONFLICT');
      }
      if (existing.status === 'completed' && existing.responseBody) {
        return existing.responseBody as T;
      }
      throw new ApiError(409, 'Request is already being processed', 'IDEMPOTENCY_PROCESSING');
    }
  }

  try {
    const response = await input.handler();
    const responseBody = toJsonSafe(response);
    await prisma.idempotencyKey.update({
      where: {
        idempotencyKeyCompound: {
          key: input.key,
          userId: input.userId,
          route: input.route
        }
      },
      data: {
        responseHash: sha256(stableStringify(responseBody)),
        responseBody: responseBody as any,
        status: 'completed',
        expiresAt
      }
    });
    return response;
  } catch (error) {
    if (redisIdemKey && redis && isRedisReady()) {
      await redis.del(redisIdemKey).catch(() => undefined);
    }
    await prisma.idempotencyKey.update({
      where: {
        idempotencyKeyCompound: {
          key: input.key,
          userId: input.userId,
          route: input.route
        }
      },
      data: { status: 'failed' }
    }).catch(() => undefined);
    throw error;
  }
};
