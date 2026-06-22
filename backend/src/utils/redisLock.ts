import { isRedisReady, redis } from '../config/redis.js';
import { ApiError } from './ApiError.js';
import { randomToken } from './crypto.js';
import { logger } from '../config/logger.js';

export const withDistributedLock = async <T>(
  key: string,
  handler: () => Promise<T>,
  options: { ttlMs?: number; waitMs?: number } = {}
) => {
  const ttlMs = options.ttlMs || 15_000;
  const lockKey = key;
  const lockValue = randomToken(16);

  if (!redis || !isRedisReady()) {
    throw new ApiError(
      503,
      'Distributed lock backend is unavailable. Please retry shortly.',
      'LOCK_BACKEND_UNAVAILABLE'
    );
  }

  const acquired = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
  if (acquired !== 'OK') throw new ApiError(409, 'Operation is already being processed', 'LOCK_BUSY');
  try {
    return await handler();
  } finally {
    const current = await redis.get(lockKey).catch(() => null);
    if (current === lockValue) {
      await redis.del(lockKey).catch((error) => {
        logger.warn({ err: error, lockKey }, 'Failed to release distributed lock');
      });
    }
  }
};
