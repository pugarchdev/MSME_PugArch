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
    // Stop retrying after 15 attempts (~75s total) to prevent log flooding
    if (times > 15) {
      logger.warn('Redis max reconnect attempts reached; switching to in-memory fallback permanently');
      return null;
    }
    return Math.min(times * 300, 5000);
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

let errorLogCount = 0;

if (redis) {
  redis.on('connect', () => {
    logger.info('Redis client initiating connection');
  });
  redis.on('ready', () => {
    errorLogCount = 0; // reset error log count on successful connection
    logger.info({ prefix: env.REDIS_PREFIX, tls: env.REDIS_TLS }, 'Redis connection established and ready');
  });
  redis.on('error', error => {
    errorLogCount += 1;
    if (errorLogCount <= 3) {
      logger.warn({ err: error, tls: env.REDIS_TLS }, 'Redis connection failed or disconnected; using in-memory fallback where available');
    }
  });
  redis.on('end', () => {
    logger.warn('Redis connection closed permanently');
  });
}

let connectionStarted = false;

export const connectRedis = async () => {
  if (!redis || connectionStarted || redis.status === 'ready') return redis;
  connectionStarted = true;

  await redis.connect().catch(error => {
    logger.warn({ err: error, tls: env.REDIS_TLS }, 'Redis unavailable; continuing with fallback mode');
  });
  if (isRedisReady()) {
    logger.info({ prefix: env.REDIS_PREFIX, tls: env.REDIS_TLS }, 'Redis connected');
  }
  return redis;
};

export const isRedisReady = () => redis?.status === 'ready';
