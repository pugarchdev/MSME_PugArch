import { sha256 } from '../utils/crypto.js';

const clean = (value: unknown) => String(value ?? '').trim().toLowerCase();
const routeKey = (value: unknown) => String(value ?? '').trim().replace(/[^a-zA-Z0-9:_/-]/g, '_');
const hashed = (value: unknown) => sha256(clean(value));

export const redisKeyPrefixes = {
  rate: 'rate:',
  cache: 'cache:'
};

export const redisKeys = {
  otp: (purpose: string, identifier: string) => `otp:${purpose}:${hashed(identifier)}`,
  otpAttempts: (purpose: string, identifier: string) => `otp_attempts:${purpose}:${hashed(identifier)}`,
  otpCooldown: (purpose: string, identifier: string) => `otp_cooldown:${purpose}:${hashed(identifier)}`,
  rateLogin: (ip: string) => `rate:login:${hashed(ip)}`,
  rateLoginUser: (email: string) => `rate:login_user:${hashed(email)}`,
  rateApi: (userId: string | number, route: string) => `rate:api:${userId}:${routeKey(route)}`,
  rateApiIp: (ip: string, route: string) => `rate:api_ip:${hashed(ip)}:${routeKey(route)}`,
  rateNamed: (name: string, identity: string) => `rate:${routeKey(name)}:${routeKey(identity)}`,
  lockAuction: (auctionId: string | number) => `lock:auction:${auctionId}`,
  lockPayment: (paymentId: string | number) => `lock:payment:${paymentId}`,
  lockEscrow: (escrowId: string | number) => `lock:escrow:${escrowId}`,
  lockMilestone: (milestoneId: string | number) => `lock:milestone:${milestoneId}`,
  idemPayment: (idempotencyKey: string) => `idem:payment:${hashed(idempotencyKey)}`,
  webhook: (gateway: string, eventId: string) => `webhook:${routeKey(gateway)}:${hashed(eventId)}`,
  cacheCategoriesAll: () => 'cache:categories:all',
  cacheVendorSearch: (hash: string) => `cache:vendor_search:${routeKey(hash)}`,
  cacheProductSearch: (hash: string) => `cache:product_search:${routeKey(hash)}`,
  cacheTenderPublic: (hash: string) => `cache:tender_public:${routeKey(hash)}`,
  cacheDashboardSummary: (userId: string | number) => `cache:dashboard:summary:${userId}`,
  actionBudget: (scope: string, identity: string) => `rate:api:${routeKey(scope)}:${hashed(identity)}`,
  notificationsUser: (userId: string | number) => `notifications:user:${userId}`
};
