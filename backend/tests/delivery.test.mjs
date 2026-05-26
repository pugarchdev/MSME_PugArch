/**
 * Delivery Tracking Module - source-level contract and security tests.
 *
 * Mirrors the existing `security.test.mjs` style: parses the relevant source
 * files and asserts that critical constraints (authorization, role checks,
 * audit logging, status transitions) are wired correctly. This catches
 * regressions in code review even when the test harness can't talk to a
 * real database.
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const constants = read('backend/src/modules/delivery/delivery.constants.ts');
const validation = read('backend/src/modules/delivery/delivery.validation.ts');
const service = read('backend/src/modules/delivery/delivery.service.ts');
const routes = read('backend/src/modules/delivery/delivery.routes.ts');
const indexRouter = read('backend/src/routes/index.ts');
const schema = read('backend/prisma/schema.prisma');
const lockHelper = read('backend/src/utils/redisLock.ts');

test('delivery routes are mounted under /api/delivery', () => {
    assert.match(indexRouter, /import deliveryRoutes from '\.\.\/modules\/delivery\/delivery\.routes\.js';/);
    assert.match(indexRouter, /router\.use\('\/delivery', deliveryRoutes\);/);
});

test('every delivery route requires authentication', () => {
    // Every router.<verb>(...) call should have the authenticate middleware applied.
    const routeRegex = /router\.(get|post|put|delete|patch)\([^)]+\)/g;
    const matches = routes.match(routeRegex) || [];
    assert.ok(matches.length > 0, 'expected at least one route registration');
    for (const match of matches) {
        assert.match(
            match,
            /authenticate/,
            `route registration is missing authenticate middleware: ${match}`
        );
    }
});

test('happy path covers all 15 procurement stages', () => {
    const required = [
        'CREATED',
        'SELLER_ACCEPTED',
        'PACKED',
        'READY_FOR_PICKUP',
        'PICKUP_SCHEDULED',
        'PICKED_UP',
        'DISPATCHED',
        'IN_TRANSIT',
        'OUT_FOR_DELIVERY',
        'DELIVERED',
        'ACCEPTED',
        'INVOICE_VERIFIED',
        'PAYMENT_APPROVED',
        'PAYMENT_RELEASED',
        'CLOSED'
    ];
    for (const status of required) {
        assert.match(constants, new RegExp(`'${status}'`), `${status} must be in DELIVERY_STATUSES`);
        assert.match(schema, new RegExp(`\\b${status}\\b`), `${status} must be in the Prisma DeliveryStatus enum`);
    }
});

test('exception statuses are present', () => {
    for (const status of [
        'SELLER_REJECTED',
        'REJECTED',
        'RETURN_INITIATED',
        'RETURNED',
        'REPLACEMENT_REQUESTED',
        'DISPUTE_RAISED',
        'DISPUTE_RESOLVED',
        'DELAYED',
        'DELIVERY_FAILED',
        'REATTEMPT_SCHEDULED',
        'CANCELLED'
    ]) {
        assert.match(constants, new RegExp(`'${status}'`), `${status} must exist in constants`);
    }
});

test('terminal statuses block further mutation', () => {
    assert.match(constants, /TERMINAL_STATUSES.*=.*\[.*'CLOSED'.*'CANCELLED'/s);
    assert.match(service, /ensureNotTerminal/, 'mutations must call ensureNotTerminal');
});

test('rejection / dispute / admin override require a reason', () => {
    assert.match(validation, /sellerRejectionBody.*reason.*trimmedString\(1000\)/s);
    assert.match(validation, /disputeRaiseBody.*reason.*trimmedString\(2000\)/s);
    assert.match(validation, /adminOverrideBody.*reason.*trimmedString\(2000\)/s);
});

test('buyer rejection requires rejectionReason via refine guard', () => {
    assert.match(
        validation,
        /buyerAcceptanceBody[\s\S]+\.refine\(\s*body\s*=>\s*body\.accepted/,
        'buyer acceptance must enforce rejectionReason when rejecting'
    );
});

test('every status mutation writes a DeliveryStatusLog row', () => {
    // transitionStatus is the single funnel for state changes; it MUST insert a
    // status log row. If a future commit removes the insert, this test fails.
    assert.match(
        service,
        /transitionStatus[\s\S]+tx\.deliveryStatusLog\.create\(\{[\s\S]+?previousStatus:[\s\S]+?newStatus:[\s\S]+?changedById:/,
        'transitionStatus must insert into DeliveryStatusLog with previousStatus, newStatus, and changedById'
    );
});

test('admin override is admin-only and records reason', () => {
    assert.match(
        service,
        /adminOverride[\s\S]+if\s*\(!isAdmin\(actor\)\)\s*\{[\s\S]+?DELIVERY_ADMIN_ONLY/,
        'adminOverride must reject non-admins'
    );
});

test('dispute resolution is admin-only', () => {
    assert.match(
        service,
        /resolveDispute[\s\S]+if\s*\(!isAdmin\(actor\)\)[\s\S]+?DELIVERY_DISPUTE_ADMIN_ONLY/,
        'resolveDispute must reject non-admins'
    );
});

test('finance flow enforces sequence: invoice verified -> approved -> released', () => {
    assert.match(
        service,
        /verifyInvoice[\s\S]+?delivery\.status\s*!==\s*'ACCEPTED'/,
        'verifyInvoice must require ACCEPTED status'
    );
    assert.match(
        service,
        /paymentDecision[\s\S]+?delivery\.status\s*!==\s*'INVOICE_VERIFIED'/,
        'paymentDecision must require INVOICE_VERIFIED status'
    );
    assert.match(
        service,
        /releasePayment[\s\S]+?delivery\.status\s*!==\s*'PAYMENT_APPROVED'/,
        'releasePayment must require PAYMENT_APPROVED status'
    );
});

test('buyer/consignee acceptance requires a delivered/pending status', () => {
    assert.match(
        service,
        /buyerOrConsigneeAccept[\s\S]+?\['DELIVERED', 'DELIVERY_CONFIRMATION_PENDING', 'DISPUTE_RESOLVED'\]/,
        'acceptance must only run after delivery'
    );
});

test('every transaction declares a 20s timeout (Neon cold start safety)', () => {
    // TX_OPTIONS must set a non-default timeout to avoid Prisma's 5s default
    // killing transactions during DB cold starts.
    assert.match(
        service,
        /const TX_OPTIONS\s*=\s*\{[^}]*timeout:\s*20_000/,
        'TX_OPTIONS must declare a 20_000ms transaction timeout'
    );
    // Every $transaction call site must be paired with a TX_OPTIONS reference.
    // We count both occurrences instead of trying to parse balanced parens with
    // a regex (which fails on multi-statement transactions containing semicolons).
    const txCallSites = (service.match(/db\.\$transaction\(/g) || []).length;
    const txOptionUsages = (service.match(/, TX_OPTIONS\)/g) || []).length;
    assert.ok(txCallSites > 0, 'expected at least one db.$transaction call');
    assert.equal(
        txCallSites,
        txOptionUsages,
        `db.$transaction call count (${txCallSites}) must match TX_OPTIONS usage count (${txOptionUsages})`
    );
});

test('auto-seed is gated by a feature flag in production', () => {
    assert.match(
        service,
        /DELIVERY_AUTO_SEED[\s\S]+?NODE_ENV[\s\S]+?'production'/,
        'auto-seed must be gated behind DELIVERY_AUTO_SEED / NODE_ENV'
    );
    assert.match(
        routes,
        /router\.post\('\/admin\/backfill'/,
        'an explicit admin backfill endpoint must exist as the prod-safe alternative'
    );
});

test('distributed lock fallback is strict in production', () => {
    // The redisLock helper must NOT silently fall back to in-memory locks in
    // production, otherwise multi-instance deployments could double-write.
    assert.match(
        lockHelper,
        /NODE_ENV\s*===\s*'production'[\s\S]+?LOCK_BACKEND_UNAVAILABLE/,
        'lock helper must surface LOCK_BACKEND_UNAVAILABLE in production'
    );
});

test('participant assignment uniqueness is enforced at the DB level', () => {
    assert.match(
        schema,
        /model DeliveryParticipant[\s\S]+?@@unique\(\[deliveryTrackingId, userId, participantRole\]/,
        'DeliveryParticipant must have a composite unique constraint'
    );
});

test('settlement, acceptance, and document tables cascade with delivery deletion', () => {
    // If we ever soft-delete a DeliveryTracking row, child tables should follow
    // so we don't leak orphan records.
    for (const model of ['DeliveryDocument', 'DeliveryStatusLog', 'DeliveryParticipant', 'BuyerAcceptance', 'PaymentSettlement']) {
        const block = schema.match(new RegExp(`model ${model} \\{[\\s\\S]+?@@`, 'm'));
        assert.ok(block, `${model} should be defined in schema`);
        assert.match(
            block[0],
            /onDelete: Cascade/,
            `${model} must declare onDelete: Cascade for its delivery tracking FK`
        );
    }
});

test('payment settlement records the actor for every state change', () => {
    for (const field of ['invoiceVerifiedById', 'approvedById', 'releasedById', 'rejectedById']) {
        assert.match(
            schema,
            new RegExp(`${field}\\s+Int\\?`),
            `PaymentSettlement.${field} must exist for audit trail`
        );
    }
});

test('notification preference is consulted before pushing delivery alerts', () => {
    assert.match(
        service,
        /notificationPreference\.findUnique[\s\S]+?procurementAlerts\s*===\s*false/,
        'safeNotify must respect NotificationPreference.procurementAlerts'
    );
});

test('document access is permission-based via fileAsset ownership', () => {
    assert.match(
        service,
        /addDocument[\s\S]+?fileAsset\.ownerId\s*!==\s*actor\.id[\s\S]+?FILE_ASSET_OWNERSHIP/,
        'addDocument must reject attaching files the actor does not own'
    );
});

test('audit logs use the central audit service', () => {
    assert.match(
        service,
        /auditLog\(\{/,
        'service must use auditLog helper to write entries'
    );
    assert.match(
        service,
        /actorRole:\s*actor\.role/,
        'audit entries must capture the actor role'
    );
});
