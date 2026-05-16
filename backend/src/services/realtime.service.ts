import type { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { isRedisReady, redis } from '../config/redis.js';
import { redisKeys } from '../constants/redis-keys.js';

type RealtimeNotification = {
  id?: number;
  userId: number;
  title: string;
  message: string;
  type: string;
  createdAt?: Date | string;
};

let subscriber: Redis | null = null;

export const publishRealtimeEvent = async (channel: string, payload: unknown) => {
  if (!redis || !isRedisReady()) return false;

  await redis.publish(channel, JSON.stringify(payload)).catch(error => {
    logger.warn({ err: error, channel }, 'Redis realtime publish failed');
  });
  return true;
};

export const publishNotificationEvent = async (userId: number, notification: RealtimeNotification) =>
  publishRealtimeEvent(redisKeys.notificationsUser(userId), notification);

export const subscribeRealtimeChannel = async (channel: string, handler: (payload: unknown) => void) => {
  if (!redis || !isRedisReady()) return false;

  subscriber ||= redis.duplicate({
    keyPrefix: env.REDIS_PREFIX,
    lazyConnect: true,
    maxRetriesPerRequest: 1
  });

  if (subscriber.status !== 'ready') {
    await subscriber.connect().catch(error => {
      logger.warn({ err: error, channel }, 'Redis realtime subscriber unavailable');
    });
  }

  if (subscriber.status !== 'ready') return false;

  subscriber.on('message', (_channel, raw) => {
    if (_channel !== channel) return;
    try {
      handler(JSON.parse(raw));
    } catch {
      handler(raw);
    }
  });

  await subscriber.subscribe(channel);
  return true;
};
