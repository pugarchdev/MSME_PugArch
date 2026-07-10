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
const channelHandlers = new Map<string, Set<(payload: unknown) => void>>();
let messageListenerAttached = false;

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

  if (!messageListenerAttached) {
    subscriber.on('message', (_channel, raw) => {
      const handlers = channelHandlers.get(_channel);
      if (!handlers?.size) return;
      let payload: unknown;
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = raw;
      }
      handlers.forEach(currentHandler => currentHandler(payload));
    });
    messageListenerAttached = true;
  }

  let handlers = channelHandlers.get(channel);
  if (!handlers) {
    handlers = new Set();
    channelHandlers.set(channel, handlers);
    await subscriber.subscribe(channel);
  }
  handlers.add(handler);

  return {
    unsubscribe: () => {
      const currentHandlers = channelHandlers.get(channel);
      currentHandlers?.delete(handler);
      if (!currentHandlers?.size) {
        channelHandlers.delete(channel);
        void subscriber?.unsubscribe(channel).catch(error => {
          logger.warn({ err: error, channel }, 'Redis realtime unsubscribe failed');
        });
      }
    }
  };
};
