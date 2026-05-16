import { isRedisReady, redis } from '../config/redis.js';
import { ApiError } from './ApiError.js';
import { randomToken } from './crypto.js';

const memoryLocks = new Map<string, number>();

export const withDistributedLock = async <T>(
  key: string,
  handler: () => Promise<T>,
  options: { ttlMs?: number; waitMs?: number } = {}
) => {
  const ttlMs = options.ttlMs || 15_000;
  const lockKey = key;
  const lockValue = randomToken(16);

  if (redis && isRedisReady()) {
    const acquired = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
    if (acquired !== 'OK') throw new ApiError(409, 'Operation is already being processed', 'LOCK_BUSY');
    try {
      return await handler();
    } finally {
      const current = await redis.get(lockKey).catch(() => null);
      if (current === lockValue) await redis.del(lockKey).catch(() => undefined);
    }
  }

  const now = Date.now();
  const existing = memoryLocks.get(lockKey);
  if (existing && existing > now) throw new ApiError(409, 'Operation is already being processed', 'LOCK_BUSY');
  memoryLocks.set(lockKey, now + ttlMs);
  try {
    return await handler();
  } finally {
    memoryLocks.delete(lockKey);
  }
};
