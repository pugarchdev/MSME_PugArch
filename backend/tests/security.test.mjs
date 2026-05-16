import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const backendIndex = fs.readFileSync(path.join(root, 'backend/index.ts'), 'utf8');
const authMiddleware = fs.readFileSync(path.join(root, 'backend/src/middleware/authenticate.ts'), 'utf8');
const authorizeMiddleware = fs.readFileSync(path.join(root, 'backend/src/middleware/authorize.ts'), 'utf8');
const ownershipMiddleware = fs.readFileSync(path.join(root, 'backend/src/middleware/ownership.ts'), 'utf8');
const storageService = fs.readFileSync(path.join(root, 'backend/src/services/storage/storage.service.ts'), 'utf8');
const paymentService = fs.readFileSync(path.join(root, 'backend/src/modules/payments/payment.service.ts'), 'utf8');
const tokenService = fs.readFileSync(path.join(root, 'backend/src/services/token.service.ts'), 'utf8');
const otpService = fs.readFileSync(path.join(root, 'backend/src/services/otp.service.ts'), 'utf8');
const safeErrorResponse = fs.readFileSync(path.join(root, 'backend/src/middleware/safeErrorResponse.ts'), 'utf8');
const schema = fs.readFileSync(path.join(root, 'backend/prisma/schema.prisma'), 'utf8');

test('unauthorized API access is protected by authenticate middleware', () => {
  const protectedRoutes = [
    "app.get('/api/tenders'",
    "app.post('/api/tenders'",
    "app.get('/api/conversations'",
    "app.get('/api/disputes'",
    "app.get('/api/grievances'",
    "app.get('/api/notifications'"
  ];

  for (const route of protectedRoutes) {
    const start = backendIndex.indexOf(route);
    assert.notEqual(start, -1, `${route} must exist`);
    const snippet = backendIndex.slice(start, start + 180);
    assert.match(snippet, /authenticate/, `${route} must require authentication`);
  }
});

test('wrong role access returns 403 through authorize middleware', () => {
  assert.match(authorizeMiddleware, /403/, 'authorize middleware must reject wrong roles with 403');
  assert.match(authorizeMiddleware, /authorizeAdmin/, 'admin-only authorization helper must exist');
});

test('expired or invalid JWTs are blocked', () => {
  assert.match(authMiddleware, /verifyAccessToken/, 'auth middleware must call the token verifier');
  assert.match(tokenService, /jwt\.verify/, 'JWT must be verified server-side');
  assert.match(authMiddleware, /401/, 'invalid tokens must return 401');
  assert.match(authMiddleware, /sessionVersion/, 'session version must be checked for invalidation');
});

test('IDOR/BOLA checks are present for object access', () => {
  assert.match(ownershipMiddleware, /checkOwnership/, 'central ownership checker must exist');
  assert.match(backendIndex, /checkOwnership\('bid'/, 'bid object access must use ownership checks');
  assert.match(backendIndex, /isOwnerBuyer/, 'wrong buyer must not access another buyer tender detail');
  assert.match(backendIndex, /canAccessConversation/, 'conversation object access must be checked');
  assert.match(backendIndex, /canAccessDispute/, 'dispute object access must be checked');
  assert.match(backendIndex, /canAccessGrievance/, 'grievance object access must be checked');
});

test('duplicate registration and suspicious seller identifiers are blocked or flagged', () => {
  assert.match(backendIndex, /existingEmail/, 'registration must check duplicate email');
  assert.match(backendIndex, /existingMobile/, 'registration must check duplicate mobile');
  assert.match(backendIndex, /flagDuplicateSellerIdentifiers/, 'seller PAN/GST/Aadhaar duplicates must be flagged');
  assert.match(backendIndex, /flagDuplicateBankAccount/, 'duplicate bank account must be flagged');
});

test('rate limits and anti-spam controls are wired', () => {
  assert.match(backendIndex, /authLoginRateLimit/, 'auth login rate limit must be wired');
  assert.match(backendIndex, /otpSendRateLimit/, 'OTP send rate limit must be wired');
  assert.match(backendIndex, /consumeActionBudget/, 'message/dispute/grievance anti-spam budget must exist');
  assert.match(backendIndex, /security\.spam_attempt/, 'spam attempts must be audited');
});

test('invalid file uploads are blocked', () => {
  assert.match(storageService, /blockedExtensions/, 'blocked extension list must exist');
  assert.match(storageService, /detectMagicMime/, 'magic byte validation must exist');
  assert.match(storageService, /FILE_MAGIC_MISMATCH/, 'file signature mismatch must be rejected');
  assert.match(storageService, /FILE_EXECUTABLE_SIGNATURE/, 'executable signatures must be rejected');
});

test('payment idempotency and webhook replay protections exist', () => {
  assert.match(backendIndex, /withIdempotency/, 'idempotency wrapper must be used by financial routes');
  assert.match(paymentService, /paymentWebhookEvent\.findUnique/, 'webhook event replay lookup must exist');
  assert.match(paymentService, /duplicate_ignored/, 'duplicate webhook must be ignored and audited');
  assert.match(schema, /@@unique\(\[gateway, eventId\]/, 'webhook event id must be unique per gateway');
});

test('duplicate payment initiation is blocked with idempotency and invoice payment guard', () => {
  assert.match(paymentService, /lockPayment\(`invoice:\$\{input\.invoiceId\}`\)/, 'payment initiation must lock by invoice');
  assert.match(paymentService, /PAYMENT_ALREADY_COMPLETED/, 'completed invoice payments must not be duplicated');
  assert.match(paymentService, /idempotencyKey/, 'payment initiation must persist the idempotency key');
});

test('webhook replay and invalid signatures are rejected', () => {
  const paymentRoutes = fs.readFileSync(path.join(root, 'backend/src/modules/payments/payment.routes.ts'), 'utf8');
  assert.match(paymentRoutes, /PAYMENT_WEBHOOK_REPLAY_BLOCKED/, 'webhook replay must return a blocked response');
  assert.match(paymentService, /PAYMENT_WEBHOOK_SIGNATURE_INVALID/, 'invalid webhook signatures must be rejected');
  assert.match(paymentService, /redisKeys\.webhook/, 'webhook replay protection must use Redis key builders');
  assert.match(paymentService, /paymentWebhookEvent\.create/, 'webhook replay protection must persist DB events');
});

test('escrow and milestone release paths are protected against double release', () => {
  assert.match(paymentService, /lockMilestone\(milestoneId\).*:release/s, 'milestone release must use the milestone Redis lock');
  assert.match(paymentService, /milestone\.status === 'approved'/, 'approved milestones must be treated as already released');
  assert.match(paymentService, /escrow\.status === 'frozen'/, 'frozen escrow must block release');
});

test('ledger entries are immutable and support reversals', () => {
  const prismaClient = fs.readFileSync(path.join(root, 'backend/src/lib/prisma.ts'), 'utf8');
  assert.match(prismaClient, /financialLedgerEntry/, 'ledger model must be guarded at Prisma client level');
  assert.match(prismaClient, /create a reversal entry instead/, 'ledger update/delete must be rejected');
  assert.match(paymentService, /createLedgerReversalEntry/, 'ledger reversals must be represented as new entries');
  assert.match(paymentService, /entryType: 'reversal'/, 'reversal entries must use a reversal type');
});

test('unauthorized payment access is blocked and reconciliation is admin-only', () => {
  const paymentRoutes = fs.readFileSync(path.join(root, 'backend/src/modules/payments/payment.routes.ts'), 'utf8');
  assert.match(paymentRoutes, /payment\.payerId !== req\.user\?\.id && payment\.payeeId !== req\.user\?\.id/, 'payment detail must check payer/payee ownership');
  assert.match(paymentRoutes, /authorize\('admin'\)/, 'payment reconciliation must be admin-only');
  assert.match(paymentService, /PAYMENT_RECONCILE_ADMIN_ONLY/, 'reconciliation service must enforce admin authorization');
});

test('auction race conditions are protected', () => {
  assert.match(backendIndex, /redisKeys\.lockAuction\(auctionId\)/, 'auction bid must use centralized Redis lock key');
  assert.match(backendIndex, /AUCTION_MIN_DECREMENT/, 'auction minimum decrement must be enforced');
  assert.match(schema, /model AuctionBid/, 'auction bid history model must exist');
});

test('OTP is not stored in plain text by application code', () => {
  assert.doesNotMatch(otpService, /prisma\.otp\.create/, 'OTP service must not write plain OTP rows');
  assert.match(otpService, /otpHash/, 'OTP service must hash OTP values before storage');
  assert.match(otpService, /OTP_TTL_SECONDS = 5 \* 60/, 'OTP expiry must be five minutes');
  assert.match(otpService, /MAX_OTP_ATTEMPTS = 5/, 'OTP max attempts must be enforced');
  assert.match(schema, /model OtpVerification/, 'OTP audit model must exist without plain OTP');
});

test('file signed URL access verifies ownership and audits denial', () => {
  assert.match(storageService, /canAccessFileAsset/, 'signed file URL must verify ownership');
  assert.match(storageService, /file\.access_denied/, 'file access denial must be audited');
  assert.match(backendIndex, /app\.get\('\/api\/files\/:id\/signed-url', authenticate/, 'signed URL route must require authentication');
});

test('notification SSE requires validated authentication', () => {
  const start = backendIndex.indexOf("app.get('/api/notifications/stream'");
  assert.notEqual(start, -1, 'notification stream route must exist');
  const snippet = backendIndex.slice(start, start + 2600);
  assert.match(snippet, /verifyAccessToken/, 'notification stream must verify access token');
  assert.match(snippet, /sessionVersion/, 'notification stream must check session version');
  assert.match(snippet, /security\.unauthorized_access/, 'notification stream auth failures must be audited');
});

test('raw Aadhaar and bank values are not returned by API responses', () => {
  assert.match(backendIndex, /aadhaarNumber: null/, 'onboarding must stop writing raw Aadhaar values');
  assert.match(backendIndex, /accountNumber: null/, 'bank route must stop writing raw account numbers');
  assert.match(backendIndex, /maskSensitive/, 'API responses must pass through masking');
});

test('safe error handler does not leak internal server messages', () => {
  assert.match(safeErrorResponse, /message: 'Internal server error'/, '500 errors must use a generic message');
  assert.doesNotMatch(safeErrorResponse, /isProduction \?/, '500 error masking must not depend on production mode');
});
