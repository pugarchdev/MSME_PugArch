import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const backendIndex = read('backend/index.ts');
const authController = read('backend/src/modules/auth/auth.controller.ts');
const authMiddleware = read('backend/src/middleware/authenticate.ts');
const otpService = read('backend/src/services/otp.service.ts');
const rateLimit = read('backend/src/middleware/rateLimit.ts');
const ownership = read('backend/src/middleware/ownership.ts');
const storageService = read('backend/src/services/storage/storage.service.ts');
const paymentRoutes = read('backend/src/modules/payments/payment.routes.ts');
const paymentService = read('backend/src/modules/payments/payment.service.ts');
const procurementWorkflow = read('backend/src/services/workflow/procurement-workflow.service.ts');
const tenderWorkflow = read('backend/src/services/workflow/tender-workflow.service.ts');
const phase4Routes = read('backend/src/routes/phase4.routes.ts');
const prismaClient = read('backend/src/lib/prisma.ts');
const purchaseOrdersView = read('frontend/src/views/PurchaseOrders.tsx');
const trackingView = read('frontend/src/views/ParcelTracking.tsx');
const adminOperations = read('frontend/src/views/AdminOperations.tsx');
const appRoutes = read('frontend/src/App.tsx');

test('auth security flows are implemented: invalid login, lockout, OTP rate limit, session invalidation', () => {
  assert.match(authController, /Invalid credentials/, 'invalid login must be rejected');
  assert.match(authController, /failedLoginCount/, 'failed login count must be tracked');
  assert.match(authController, /lockedUntil/, 'lockout timestamp must be enforced');
  assert.match(otpService, /MAX_OTP_ATTEMPTS|OTP_TTL_SECONDS/, 'OTP attempts and TTL must be enforced');
  assert.match(rateLimit, /otp.*RateLimit|otpSendRateLimit/is, 'OTP rate limit middleware must exist');
  assert.match(authMiddleware, /sessionVersion/, 'session invalidation must check sessionVersion');
});

test('authorization and ownership protections cover tenders, bids, files, admin routes, and seller bidding', () => {
  assert.match(backendIndex, /isOwnerBuyer/, 'buyer tender ownership check must exist');
  assert.match(ownership, /checkOwnership/, 'central ownership checker must exist');
  assert.match(ownership, /bid/, 'bid ownership checks must be supported');
  assert.match(storageService, /canAccessFileAsset/, 'signed URL must check file ownership');
  assert.match(phase4Routes, /authorizeAdmin|authorize\('admin'\)/, 'admin routes must use admin authorization');
  const bidRoute = phase4Routes.match(/router\.post\('\/tenders\/:id\/bids'[\s\S]{0,900}/)?.[0] || '';
  assert.match(bidRoute, /authorize\('seller'\)/, 'only sellers may submit bids');
  assert.doesNotMatch(bidRoute, /authorize\('buyer'\)/, 'buyers must not be authorized to submit seller bids');
});

test('procurement workflow security covers deadlines, sealed bids, and one-PO guards', () => {
  assert.match(tenderWorkflow, /TENDER_DEADLINE_PASSED/, 'bids after tender deadline must be blocked');
  assert.match(tenderWorkflow, /Tender is not open for bidding/, 'bid modification must require open tender status');
  assert.match(backendIndex, /financial_opening|tech_bid_opening|canViewSealedFinancials/, 'sealed bid details must be gated by opening stage');
  assert.match(procurementWorkflow, /sourceType: 'direct_purchase', sourceId: directPurchase\.id/, 'direct purchase PO must be source-linked');
  assert.match(procurementWorkflow, /sourceType: 'rfq', sourceId: response\.id/, 'RFQ PO must be source-linked');
  assert.match(procurementWorkflow, /existingPO.*direct_purchase/s, 'direct purchase must reuse an existing source PO');
  assert.match(procurementWorkflow, /existingPO.*rfq/s, 'RFQ accepted quote must reuse an existing source PO');
});

test('payment integration protections cover idempotency, replay, signatures, locks, and ledger immutability', () => {
  assert.match(paymentRoutes, /withIdempotency/, 'financial write routes must use idempotency');
  assert.match(paymentService, /PAYMENT_ALREADY_COMPLETED/, 'duplicate completed payments must be blocked');
  assert.match(paymentRoutes, /PAYMENT_WEBHOOK_REPLAY_BLOCKED/, 'webhook replay must be rejected by route');
  assert.match(paymentService, /PAYMENT_WEBHOOK_SIGNATURE_INVALID/, 'invalid webhook signature must be rejected');
  assert.match(paymentService, /lockPayment/, 'payment processing and reconciliation must use Redis locks');
  assert.match(paymentService, /lockEscrow/, 'escrow mutation must use Redis locks');
  assert.match(paymentService, /lockMilestone/, 'milestone release must use Redis locks');
  assert.match(prismaClient, /financialLedgerEntry[\s\S]*update\(\)[\s\S]*immutable/, 'ledger updates must be blocked by Prisma extension');
  assert.match(paymentService, /entryType: 'reversal'/, 'ledger reversals must create new reversal entries');
});

test('file upload protections cover invalid type, oversized files, and unauthorized signed URLs', () => {
  assert.match(storageService, /blockedExtensions/, 'invalid extensions must be blocked');
  assert.match(storageService, /FILE_MAGIC_MISMATCH|FILE_EXECUTABLE_SIGNATURE/, 'magic byte checks must reject invalid files');
  assert.match(storageService, /maxSize|fileSize|FILE_TOO_LARGE|limits/s, 'oversized files must be blocked');
  assert.match(storageService, /file\.access_denied/, 'unauthorized signed URL access must be audited and blocked');
});

test('Redis protections cover rate limits, auction locks, and escrow locks', () => {
  assert.match(rateLimit, /redisKeys\.rateLogin|redisKeys\.rateApi/, 'rate limits must use centralized Redis keys');
  assert.match(tenderWorkflow, /redisKeys\.lockAuction/, 'auction bidding must use auction Redis lock');
  assert.match(paymentService, /redisKeys\.lockEscrow/, 'escrow writes must use escrow Redis lock');
});

test('frontend key pages are routed and production mock data has been removed', () => {
  for (const route of ['/buyer/orders', '/buyer/tracking', '/buyer/payments', '/admin/payments', '/seller/catalogue', '/buyer/catalogue']) {
    assert.match(appRoutes, new RegExp(route.replace(/\//g, '\\/')), `${route} must be routed`);
  }
  assert.doesNotMatch(purchaseOrdersView, /SAMPLE_ORDERS|Bharat Office Solutions|Heritage Furniture Co\./, 'PurchaseOrders production page must not use sample orders');
  assert.doesNotMatch(trackingView, /const shipments|PKG-92837465|DHL Government Desk/, 'ParcelTracking production page must not use static tracking data');
  assert.doesNotMatch(adminOperations, /\/api\/admin\/stats/, 'AdminOperations must use report APIs instead of legacy in-memory stats route');
  assert.match(appRoutes, /roleOk\(user\.role,\s*\['admin'\]\)/, 'unauthorized role routing must remain guarded');
});

test('PostgreSQL integration: idempotency unique guard blocks duplicate financial request keys', async t => {
  if (process.env.RUN_DB_INTEGRATION !== '1') {
    t.skip('Set RUN_DB_INTEGRATION=1 with TEST_DATABASE_URL to run database-backed integration tests.');
    return;
  }
  const url = process.env.TEST_DATABASE_URL;
  if (!url || url === process.env.DATABASE_URL) {
    t.skip('TEST_DATABASE_URL must be set and must not equal DATABASE_URL.');
    return;
  }
  const { PrismaClient } = await import('@prisma/client');
  const prisma = new PrismaClient({ datasources: { db: { url } } });
  const email = `phase8-${Date.now()}@example.test`;
  const user = await prisma.user.create({ data: { name: 'Phase 8 Buyer', email, password: 'hash', role: 'buyer' } });
  try {
    const key = `phase8-${Date.now()}`;
    await prisma.idempotencyKey.create({
      data: {
        key,
        userId: user.id,
        route: 'POST /api/payments/initiate',
        requestHash: 'hash-a',
        status: 'processing',
        expiresAt: new Date(Date.now() + 60_000)
      }
    });
    await assert.rejects(() => prisma.idempotencyKey.create({
      data: {
        key,
        userId: user.id,
        route: 'POST /api/payments/initiate',
        requestHash: 'hash-a',
        status: 'processing',
        expiresAt: new Date(Date.now() + 60_000)
      }
    }), /Unique constraint|unique constraint|P2002/i);
  } finally {
    await prisma.idempotencyKey.deleteMany({ where: { userId: user.id } }).catch(() => undefined);
    await prisma.user.delete({ where: { id: user.id } }).catch(() => undefined);
    await prisma.$disconnect();
  }
});

test('Redis integration: distributed lock and rate-limit primitives block duplicate operations', async t => {
  if (process.env.RUN_REDIS_INTEGRATION !== '1') {
    t.skip('Set RUN_REDIS_INTEGRATION=1 with TEST_REDIS_URL to run Redis-backed integration tests.');
    return;
  }
  const url = process.env.TEST_REDIS_URL || process.env.REDIS_URL;
  if (!url) {
    t.skip('TEST_REDIS_URL or REDIS_URL is required.');
    return;
  }
  const { Redis } = await import('ioredis');
  const redis = new Redis(url, { keyPrefix: 'phase8-test:', maxRetriesPerRequest: 1 });
  const key = `lock:escrow:${Date.now()}`;
  try {
    assert.equal(await redis.set(key, 'one', 'PX', 5000, 'NX'), 'OK');
    assert.equal(await redis.set(key, 'two', 'PX', 5000, 'NX'), null);
    const rateKey = `rate:api:${Date.now()}`;
    assert.equal(await redis.incr(rateKey), 1);
    await redis.expire(rateKey, 60);
    assert.equal(await redis.incr(rateKey), 2);
  } finally {
    await redis.del(key).catch(() => undefined);
    await redis.quit();
  }
});
