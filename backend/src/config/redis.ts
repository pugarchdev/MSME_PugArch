import { Redis } from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

const redisOptions = {
  keyPrefix: env.REDIS_PREFIX,
  db: env.REDIS_DB,
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableReadyCheck: true,
  connectTimeout: 3000,
  retryStrategy(times: number) {
    if (times > 3) return null;
    return Math.min(times * 250, 1000);
  },
  tls: env.REDIS_TLS ? {} : undefined
};

const getRedisInstance = () => {
  if (env.REDIS_HOST) {
    return new Redis({
      host: env.REDIS_HOST,
      port: env.REDIS_PORT,
      password: env.REDIS_PASSWORD,
      ...redisOptions
    });
  }
  if (env.REDIS_URL) {
    return new Redis(env.REDIS_URL, redisOptions);
  }
  return null;
};

export const redis = getRedisInstance();

let connectionStarted = false;
let errorLogCount = 0;

export const connectRedis = async () => {
  if (!redis || connectionStarted || redis.status === 'ready') return redis;
  connectionStarted = true;

  redis.on('error', error => {
    errorLogCount += 1;
    if (errorLogCount <= 3) {
      logger.warn({ err: error, tls: env.REDIS_TLS }, 'Redis connection failed; using in-memory fallback where available');
    }
  });

  await redis.connect().catch(error => {
    logger.warn({ err: error, tls: env.REDIS_TLS }, 'Redis unavailable; continuing with fallback mode');
  });
  if (isRedisReady()) {
    logger.info({ prefix: env.REDIS_PREFIX, tls: env.REDIS_TLS }, 'Redis connected');
  }
  return redis;
};

export const isRedisReady = () => redis?.status === 'ready';
