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
    try {
      const acquired = await redis.set(lockKey, lockValue, 'PX', ttlMs, 'NX');
      if (acquired !== 'OK') throw new ApiError(409, 'Operation is already being processed', 'LOCK_BUSY');
      try {
        return await handler();
      } finally {
        const current = await redis.get(lockKey).catch(() => null);
        if (current === lockValue) await redis.del(lockKey).catch(() => undefined);
      }
    } catch (err) {
      // ApiError covers LOCK_BUSY which is a real "do not retry" condition.
      if (err instanceof ApiError) throw err;

      // Network / timeout against Redis itself. In production, multiple
      // instances behind a load balancer rely on Redis as the source of truth
      // for distributed locks; falling back to in-memory locks per-instance
      // would let two instances both win the lock and produce double-writes.
      // So we ONLY fall through in development. In production, surface the
      // error so callers retry with backoff.
      if (process.env.NODE_ENV === 'production' && process.env.LOCK_FALLBACK_ALLOW !== 'true') {
        throw new ApiError(
          503,
          'Distributed lock backend is unavailable. Please retry shortly.',
          'LOCK_BACKEND_UNAVAILABLE'
        );
      }
      // dev / explicit opt-in: fall through to in-memory locking below.
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
