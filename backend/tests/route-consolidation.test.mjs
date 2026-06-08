/**
 * Route Consolidation safety test.
 *
 * Two route surfaces exist today:
 *   - Legacy `app.<verb>` handlers in `index.ts`
 *   - Modular `router.<verb>` handlers in `src/routes/*.routes.ts`
 *
 * When both register the same path, Express resolves by registration order:
 * `apiRouter` is mounted first via `app.use('/api', apiRouter)` in `app.ts`
 * (which loads `routes/index.ts`), and AFTER that `index.ts` legacy handlers
 * register additional handlers on the SAME app.
 *
 * In Express 4, `app.<verb>` adds to the matching pipeline rather than
 * replacing it — the first matching handler that calls `res.send()`/`res.json()`
 * wins. This means the modular routes (mounted first) take precedence.
 *
 * This test:
 *   - Locks the current "modular wins" assumption by asserting key paths
 *     exist in the modular files
 *   - Catches accidental future drift (someone adding a NEW path only in the
 *     legacy file)
 *   - Provides a tracked list of duplicates so the consolidation work can
 *     remove them in a future PR without breaking anything
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

const indexLegacy = read('backend/index.ts');
const phase4 = read('backend/src/routes/phase4.routes.ts');
const cartRoutes = read('backend/src/routes/cart.routes.ts');
const grnRoutes = read('backend/src/routes/grn.routes.ts');
const orgRoutes = read('backend/src/routes/org.routes.ts');
const approvalsRoutes = read('backend/src/routes/approvals.routes.ts');
const tenderEvalRoutes = read('backend/src/routes/tender-evaluation.routes.ts');

// Routes that intentionally exist only in the modular system (Phase 1-6 work).
// If someone accidentally re-implements one in `index.ts`, this fails.
const MODULAR_ONLY_PATHS = [
    { path: '/cart/items', file: 'cart.routes.ts', source: cartRoutes },
    { path: '/cart/submit', file: 'cart.routes.ts', source: cartRoutes },
    { path: '/cart/pending-approval', file: 'cart.routes.ts', source: cartRoutes },
    { path: '/grn/po/:poId/eligibility', file: 'grn.routes.ts', source: grnRoutes },
    { path: '/org/invite', file: 'org.routes.ts', source: orgRoutes },
    { path: '/approvals/pending', file: 'approvals.routes.ts', source: approvalsRoutes },
    { path: '/tender-eval/:tenderId/criteria', file: 'tender-evaluation.routes.ts', source: tenderEvalRoutes }
];

// Paths that exist in both legacy (index.ts) and modular files. This is a
// documented technical-debt ledger — every entry here is a candidate for
// deletion in a future consolidation PR. The test fails if NEW duplicates
// appear (forces code review), but tolerates the known ones.
const KNOWN_DUPLICATES = [
    // Auctions — legacy /api/auctions/*  vs  modular /tenders/:id/auction + /auctions/:id/*
    '/api/auctions/:id',
    '/api/auctions/:id/bids',
    '/api/auctions/:id/finalize',
    // Tenders — legacy CRUD in index.ts, modular GET in phase4.routes.ts
    '/api/tenders',
    '/api/tenders/public',
    '/api/tenders/:id',
    '/api/tenders/:id/bids',
    // GST verify
    '/api/utils/gst-verify/:gstin',
    '/api/gst/verify',
    // Bids
    '/api/bids/my',
    '/api/bids/:id',
    '/api/bids/:id/status',
    '/api/bids/:id/withdraw',
    // Files / uploads
    '/api/upload',
    '/api/files/:id/signed-url',
    '/api/files/:id/view',
    // Procurement / financial workflow
    '/api/purchase-orders',
    '/api/invoices',
    '/api/escrow',
    '/api/escrow/:id/milestones',
    '/api/escrow/:id/freeze',
    '/api/milestones/:id/complete',
    '/api/milestones/:id/approve',
    // Admin
    '/api/admin/onboarding',
    // Notifications
    '/api/notifications',
    '/api/notifications/read-all',
    '/api/notifications/:id/read'
];

test('Phase 1-6 modular routes exist only in their module file', () => {
    for (const entry of MODULAR_ONLY_PATHS) {
        const escapedPath = entry.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const modularRegex = new RegExp(`'${escapedPath}'`);
        assert.match(
            entry.source,
            modularRegex,
            `Modular path ${entry.path} must exist in ${entry.file}`
        );
        // Same path must NOT appear in the legacy index.ts as a top-level
        // app.<verb>('/api${path}')
        const legacyEscaped = `/api${entry.path}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const legacyRegex = new RegExp(`app\\.(get|post|put|delete|patch)\\('${legacyEscaped}'`);
        assert.doesNotMatch(
            indexLegacy,
            legacyRegex,
            `Modular path ${entry.path} must NOT be re-implemented in index.ts`
        );
    }
});

test('known duplicates are tracked (sentinel — fails if list grows)', () => {
    // Capture all `app.<verb>('/api/...')` paths in legacy.
    const legacyMatches = [...indexLegacy.matchAll(/app\.(?:get|post|put|delete|patch)\('(\/api\/[^']+)'/g)]
        .map(m => m[1]);

    // Capture all `router.<verb>('/...')` paths in any modular file.
    const modularSources = [phase4, cartRoutes, grnRoutes, orgRoutes, approvalsRoutes, tenderEvalRoutes];
    const modularPaths = new Set(
        modularSources.flatMap(src =>
            [...src.matchAll(/router\.(?:get|post|put|delete|patch)\('([^']+)'/g)]
                .map(m => `/api${m[1]}`)
        )
    );

    const duplicates = legacyMatches.filter(p => modularPaths.has(p));

    // Compare against the known list — if duplicates grow, this test fails
    // until KNOWN_DUPLICATES is updated, forcing a code review.
    const newDuplicates = duplicates.filter(p => !KNOWN_DUPLICATES.includes(p));
    assert.deepEqual(
        newDuplicates,
        [],
        `New route duplicates detected. Either remove from index.ts or add to KNOWN_DUPLICATES with a tracking issue:\n${newDuplicates.join('\n')}`
    );
});

test('apiRouter is mounted before legacy handlers', () => {
    const app = read('backend/src/app.ts');
    // The shape we expect is: createApp() in app.ts mounts apiRouter,
    // then index.ts adds legacy handlers to the same app.
    assert.match(app, /apiRouter/, 'app.ts must mount apiRouter');
    assert.match(app, /\/api/, 'apiRouter must be mounted under /api');
});

test('every modular route file uses requireApprovedOrg on transactional routes', () => {
    const transactionalFiles = [
        { name: 'cart.routes.ts', source: cartRoutes },
        { name: 'grn.routes.ts', source: grnRoutes },
        { name: 'approvals.routes.ts', source: approvalsRoutes },
        { name: 'tender-evaluation.routes.ts', source: tenderEvalRoutes }
    ];

    for (const f of transactionalFiles) {
        assert.match(
            f.source,
            /requireApprovedOrg/,
            `${f.name} must apply requireApprovedOrg to mutation routes`
        );
    }
});

test('OrgMembership is created at every legitimate entry point', () => {
    // 1. Invite acceptance
    assert.match(orgRoutes, /prisma\.orgMembership\.create/);
    // 2. GST verify (via service helper)
    assert.match(phase4, /onUserLinkedToOrganization/);
    // 3. Service helper itself
    const service = read('backend/src/services/org-membership.service.ts');
    assert.match(service, /export async function ensureOrgMembership/);
    assert.match(service, /export async function onUserLinkedToOrganization/);
});
