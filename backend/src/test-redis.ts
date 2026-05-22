import { connectRedis, isRedisReady, redis } from './config/redis.js';

async function testRedis() {
  console.log('Redis status before connect:', redis?.status);
  console.log('Connecting to Redis...');
  await connectRedis();
  console.log('Redis status after connect:', redis?.status);
  console.log('isRedisReady():', isRedisReady());
}

testRedis().then(() => process.exit(0));
