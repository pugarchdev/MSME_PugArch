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
const masterAdminRoutes = fs.readFileSync(path.join(root, 'backend/src/routes/master-admin.routes.ts'), 'utf8');
const masterAdminPage = fs.readFileSync(path.join(root, 'frontend/src/features/masterAdmin/pages/MasterAdminPage.tsx'), 'utf8');
const masterAdminApi = fs.readFileSync(path.join(root, 'frontend/src/features/masterAdmin/masterAdminApi.ts'), 'utf8');
const phase4Routes = fs.readFileSync(path.join(root, 'backend/src/routes/phase4.routes.ts'), 'utf8');
const cartRoutes = fs.readFileSync(path.join(root, 'backend/src/routes/cart.routes.ts'), 'utf8');
const marketplaceRoutes = fs.readFileSync(path.join(root, 'backend/src/routes/marketplace.routes.ts'), 'utf8');
const tenderEvaluationRoutes = fs.readFileSync(path.join(root, 'backend/src/routes/tender-evaluation.routes.ts'), 'utf8');
const closureBlockers = fs.readFileSync(path.join(root, 'backend/src/utils/closureBlockers.ts'), 'utf8');

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

test('master admin control-center data endpoints are master-only', () => {
  assert.match(masterAdminRoutes, /const masterOnly = \[authenticate, authorize\('master_admin'\)\]/, 'masterOnly must enforce master_admin role');
  const endpoints = [
    '/master-admin/dashboard',
    '/master-admin/companies',
    '/master-admin/organizations',
    '/master-admin/users',
    '/master-admin/procurement',
    '/master-admin/tenders',
    '/master-admin/rfqs',
    '/master-admin/orders',
    '/master-admin/invoices',
    '/master-admin/payments',
    '/master-admin/escrow-accounts',
    '/master-admin/payment-settlements',
    '/master-admin/documents',
    '/master-admin/marketplace/products',
    '/master-admin/marketplace/services',
    '/master-admin/reports/export',
    '/master-admin/search',
    '/master-admin/system-health',
    '/master-admin/portal-settings',
    '/master-admin/audit-logs',
    '/master-admin/security-overview'
  ];

  for (const endpoint of endpoints) {
    const escaped = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      masterAdminRoutes,
      new RegExp(`router\\.get\\('${escaped}', \\.\\.\\.masterOnly`),
      `${endpoint} must be registered as a master-only GET route`
    );
  }
});

test('master admin action controls are master-only, reason-gated, and archive-first', () => {
  assert.match(masterAdminRoutes, /const masterOnly = \[authenticate, authorize\('master_admin'\)\]/, 'masterOnly must enforce master_admin role');

  const protectedActionRoutes = [
    ['post', '/master-admin/companies'],
    ['put', '/master-admin/companies/:id'],
    ['delete', '/master-admin/companies/:id'],
    ['put', '/master-admin/companies/:id/content'],
    ['put', '/master-admin/companies/:id/features'],
    ['post', '/master-admin/organizations'],
    ['put', '/master-admin/organizations/:id'],
    ['delete', '/master-admin/organizations/:id'],
    ['put', '/master-admin/organizations/:id/theme'],
    ['put', '/master-admin/organizations/:id/features'],
    ['post', '/master-admin/users'],
    ['put', '/master-admin/users/:id'],
    ['delete', '/master-admin/users/:id'],
    ['post', '/master-admin/users/:id/reset-password'],
    ['post', '/master-admin/users/:id/invite'],
    ['post', '/master-admin/users/:id/change-role'],
    ['post', '/master-admin/users/:id/change-organization'],
    ['post', '/master-admin/marketplace/products/:id/status'],
    ['post', '/master-admin/marketplace/services/:id/status'],
    ['post', '/master-admin/orders/:id/status'],
    ['post', '/master-admin/invoices/:id/status'],
    ['post', '/master-admin/payments/:id/status'],
    ['post', '/master-admin/escrow-accounts/:id/status'],
    ['put', '/master-admin/email-settings'],
    ['put', '/master-admin/portal-settings']
  ];

  for (const [method, endpoint] of protectedActionRoutes) {
    const escaped = endpoint.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    assert.match(
      masterAdminRoutes,
      new RegExp(`router\\.${method}\\('${escaped}', \\.\\.\\.masterOnly`),
      `${endpoint} must be registered as a master-only ${method.toUpperCase()} route`
    );
  }

  const requiredReasonActions = [
    'create company',
    'update company',
    'archive company',
    'update branding content',
    'update feature controls',
    'enable feature',
    'disable feature',
    'create organization',
    'update organization',
    'archive organization',
    'update organization theme',
    'reset organization theme',
    'update organization feature controls',
    'enable organization feature',
    'disable organization feature',
    'create user',
    'update user',
    'archive user',
    'reset user password',
    'invite user',
    'change user role',
    'change user organization',
    'update email settings',
    'update portal settings'
  ];

  for (const action of requiredReasonActions) {
    assert.match(
      masterAdminRoutes,
      new RegExp(`ensureReason\\(res, req\\.body, '${action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'\\)`),
      `${action} must require an explicit reason`
    );
  }

  assert.doesNotMatch(masterAdminRoutes, /(?:company|organization|user)\.delete\(/, 'company, organization, and user actions must not hard-delete records');
  assert.match(masterAdminRoutes, /action: 'company\.archive'[\s\S]*requestedVia: 'DELETE'/, 'legacy company DELETE route must archive with audit metadata');
  assert.match(masterAdminRoutes, /action: 'organization\.archive'[\s\S]*requestedVia: 'DELETE'/, 'legacy organization DELETE route must archive with audit metadata');
  assert.match(masterAdminRoutes, /archiveUserDeleteBlocked\(req, id, reason, \{ requestedVia: 'DELETE' \}\)/, 'legacy user DELETE route must archive with audit metadata');

  const auditActions = [
    'company.create',
    'company.update',
    'company.archive',
    'feature.toggle',
    'feature.enable',
    'feature.disable',
    'content.update',
    'organization.create',
    'organization.update',
    'organization.archive',
    'organization.theme.update',
    'organization.theme.reset',
    'organization.features.update',
    'organization.feature.enable',
    'organization.feature.disable',
    'user.create',
    'user.update',
    'user.password.reset',
    'user.invite.marked',
    'user.role.change',
    'user.organization.change',
    'email.settings.update',
    'portal.settings.update'
  ];

  for (const action of auditActions) {
    assert.match(
      masterAdminRoutes,
      new RegExp(`createAuditLog\\(req, \\{ action: '${action.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}'[\\s\\S]*metadata: \\{[\\s\\S]*reason`),
      `${action} must write an audit log with the captured reason`
    );
  }

  assert.match(masterAdminRoutes, /createAuditLog\(req, \{ action: `company\.\$\{action\}`[\s\S]*metadata: \{ reason \}/, 'company status changes must be audited with a reason');
  assert.match(masterAdminRoutes, /createAuditLog\(req, \{ action: `organization\.\$\{action\}`[\s\S]*metadata: \{ reason \}/, 'organization status changes must be audited with a reason');
  assert.match(masterAdminRoutes, /createAuditLog\(req, \{ action: `user\.\$\{action\}`[\s\S]*metadata: \{ reason, accountStatus \}/, 'user status changes must be audited with a reason');
  assert.match(masterAdminRoutes, /router\.get\('\/master-admin\/reports\/export'[\s\S]*Reason is required to export Master Admin data\./, 'data export must require an explicit audit reason');
  assert.match(masterAdminRoutes, /createAuditLog\(req, \{ action: 'data\.export'[\s\S]*metadata: \{ module, reason, rows:/, 'data export must write an audit log with reason and row count');
  assert.match(masterAdminRoutes, /ensureReason\(res, req\.body, reasonAction\)/, 'marketplace status handler must require the provided reason label');
  assert.match(masterAdminRoutes, /marketplaceStatusAction\('product', 'marketplace-product', 'update marketplace-product status'\)/, 'product marketplace status route must pass an explicit reason label');
  assert.match(masterAdminRoutes, /marketplaceStatusAction\('service', 'marketplace-service', 'update marketplace-service status'\)/, 'service marketplace status route must pass an explicit reason label');
  assert.match(masterAdminRoutes, /action: `\$\{entityType\}\.status\.update`[\s\S]*metadata: \{ reason, name: previous\.name, oldValue: \{ status: previous\.status \}, newValue: \{ status \} \}/, 'marketplace status updates must audit before and after status plus reason');
  assert.match(masterAdminRoutes, /ensureReason\(res, req\.body, 'update order status'\)/, 'order status override must require a reason');
  assert.match(masterAdminRoutes, /action: 'purchase-order\.status\.override'[\s\S]*metadata: \{ reason, oldValue: \{ status: previous\.status, poStatus: previous\.poStatus \}, newValue:/, 'order status override must audit old and new values');
  assert.match(masterAdminRoutes, /ensureReason\(res, req\.body, 'update invoice status'\)/, 'invoice status override must require a reason');
  assert.match(masterAdminRoutes, /action: 'invoice\.status\.override'[\s\S]*metadata: \{ reason, oldValue: \{ status: previous\.status, invoiceStatus: previous\.invoiceStatus \}, newValue:/, 'invoice status override must audit old and new values');
  assert.match(masterAdminRoutes, /ensureReason\(res, req\.body, 'update payment status'\)/, 'payment status override must require a reason');
  assert.match(masterAdminRoutes, /action: 'payment\.status\.override'[\s\S]*metadata: \{ reason, oldValue: \{ status: previous\.status, paymentStatus: previous\.paymentStatus \}, newValue:/, 'payment status override must audit old and new values');
  assert.match(masterAdminRoutes, /ensureReason\(res, req\.body, 'update escrow status'\)/, 'escrow status override must require a reason');
  assert.match(masterAdminRoutes, /action: 'escrow\.status\.override'[\s\S]*metadata: \{ reason, oldValue: \{ status: previous\.status, escrowStatus: previous\.escrowStatus \}, newValue:/, 'escrow status override must audit old and new values');
});

test('master admin frontend presents archive and restore instead of delete controls', () => {
  assert.match(masterAdminPage, /Archive/, 'archive action must be visible in the Master Admin UI');
  assert.match(masterAdminPage, /Restore/, 'restore action must be visible in the Master Admin UI');
  assert.doesNotMatch(masterAdminPage, /Trash2|onDelete|Type DELETE|action: 'delete'/, 'Master Admin UI must not expose permanent-delete affordances');
  assert.doesNotMatch(masterAdminApi, /method: 'DELETE'|deleteOrganization|deleteUser/, 'Master Admin frontend API wrapper must not expose DELETE helpers for action controls');
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
  assert.match(safeErrorResponse, /'Internal server error'/, '500 errors must use a generic message');
  assert.doesNotMatch(safeErrorResponse, /isProduction \?/, '500 error masking must not depend on production mode');
});

test('tenant scope enforcement on admin organization lifecycle routes', () => {
  const endpoints = ['/close', '/archive', '/restore', '/allow-gst-reuse', '/revoke-gst-reuse'];
  for (const endpoint of endpoints) {
    const routePattern = new RegExp(`router\\.patch\\('/admin/organizations/:id${endpoint}'[\\s\\S]*?TENANT_SCOPE_VIOLATION`);
    assert.match(phase4Routes, routePattern, `admin organization ${endpoint} must enforce tenant scope isolation`);
  }
});

test('dependency blocker validation blocks organization closure and archiving', () => {
  assert.match(phase4Routes, /getOrganizationClosureBlockers/, 'phase4 routes must use getOrganizationClosureBlockers helper');
  assert.match(masterAdminRoutes, /getOrganizationClosureBlockers/, 'master admin routes must use getOrganizationClosureBlockers helper');
  
  assert.match(closureBlockers, /db\.tender\.count/, 'closure blockers must check active tenders');
  assert.match(closureBlockers, /db\.bid\.count/, 'closure blockers must check active bids');
  assert.match(closureBlockers, /db\.purchaseOrder\.count/, 'closure blockers must check active purchase orders');
  assert.match(closureBlockers, /db\.goodsReceiptNote\.count/, 'closure blockers must check active GRNs');
  assert.match(closureBlockers, /db\.invoice\.count/, 'closure blockers must check active invoices');
});

test('GST reuse lifecycle blocks re-registration unless allowed', () => {
  assert.match(phase4Routes, /gstReuseAllowed: true/, 'GST verification must verify gstReuseAllowed status before allowing reuse');
  assert.match(phase4Routes, /gstReuseAllowed === true|gstReuseAllowed/, 'GST verification must check gstReuseAllowed status');
});

test('feature flags restrict access to disabled features', () => {
  assert.match(cartRoutes, /checkFeatureEnabled\('checkout'\)/, 'cart routes must enforce checkout feature flag');
  assert.match(marketplaceRoutes, /checkFeatureIfAuthenticated\('product-marketplace'\)/, 'marketplace routes must enforce product feature flag');
  assert.match(marketplaceRoutes, /checkFeatureIfAuthenticated\('service-marketplace'\)/, 'marketplace routes must enforce service feature flag');
  assert.match(tenderEvaluationRoutes, /checkFeatureEnabled\('tender-management'\)/, 'tender evaluation routes must enforce tender-management feature flag');
});
