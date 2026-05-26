/**
 * Buyer Happy Path - source-level integration test.
 *
 * Walks through the entire buyer journey introduced in Phases 1-6 by parsing
 * the relevant source files and asserting that every critical wiring point
 * is in place. This catches regressions in code review even when the test
 * harness can't talk to a real database.
 *
 * Covered:
 *   1. Registration → User row created
 *   2. GST verify → Organization upsert + OrgMembership created
 *   3. Onboarding submit → status under_compliance_review
 *   4. Admin approval → onboardingStatus + Organization.verificationStatus
 *      both flip to VERIFIED
 *   5. Read-only mode middleware blocks mutations until VERIFIED
 *   6. Org Admin invites team → invitation token issued
 *   7. Invitee accepts → OrgMembership row created
 *   8. Cart system → add → submit → finance approve → tech approve
 *   9. Approval chain → multi-stage decisions advance the chain
 *  10. GRN flow → 3-way match + status transitions
 *  11. Tender evaluation → criteria → tech score → financial → ranking
 *  12. Disputes / messages have the right authorize wrappers
 *  13. Backfill script exists and is idempotent
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

// ---- Files we'll inspect ----
const schema = read('backend/prisma/schema.prisma');
const phase4 = read('backend/src/routes/phase4.routes.ts');
const orgRoutes = read('backend/src/routes/org.routes.ts');
const cartRoutes = read('backend/src/routes/cart.routes.ts');
const approvalsRoutes = read('backend/src/routes/approvals.routes.ts');
const grnRoutes = read('backend/src/routes/grn.routes.ts');
const tenderEvalRoutes = read('backend/src/routes/tender-evaluation.routes.ts');
const requireOrgRole = read('backend/src/middleware/requireOrgRole.ts');
const requireApprovedOrg = read('backend/src/middleware/requireApprovedOrg.ts');
const orgMembershipService = read('backend/src/services/org-membership.service.ts');
const approvalChainService = read('backend/src/services/approval-chain.service.ts');
const backfillScript = read('backend/scripts/backfill-org-membership.ts');
const authController = read('backend/src/modules/auth/auth.controller.ts');
const indexRouter = read('backend/src/routes/index.ts');

// ============================================================
// STAGE 1 — Registration creates the User row
// ============================================================

test('Stage 1: registration creates a User row with role', () => {
    assert.match(authController, /prisma\.user\.create/);
    assert.match(authController, /role:\s*role\s+as Role/);
    assert.match(authController, /registrationStatus:\s*RegistrationStatus\.completed/);
    // No organizationId at registration — that's set during GST verify
});

// ============================================================
// STAGE 2 — GST verify creates Organization + OrgMembership
// ============================================================

test('Stage 2a: GST verify upserts Organization for buyer and seller', () => {
    assert.match(phase4, /async function upsertOrganizationFromGst/);
    assert.match(phase4, /db\.organization\.create/);
    assert.match(phase4, /verificationStatus:\s*'VERIFIED'/);
});

test('Stage 2b: GST verify links User.organizationId for both roles', () => {
    // seller branch
    assert.match(phase4, /Auto-create\/link Organization for seller[\s\S]*?db\.user\.update[\s\S]*?organizationId:\s*org\.id/);
    // buyer branch
    assert.match(phase4, /Auto-create\/link Organization for buyer[\s\S]*?db\.user\.update[\s\S]*?organizationId:\s*org\.id/);
});

test('Stage 2c: GST verify creates OrgMembership via service helper', () => {
    assert.match(
        phase4,
        /import \{ onUserLinkedToOrganization \}/,
        'phase4 routes must import the membership hook'
    );
    // Both branches must call the hook
    const sellerHook = /seller[\s\S]*?onUserLinkedToOrganization\(user\.id,\s*org\.id\)/;
    const buyerHook = /buyer[\s\S]*?onUserLinkedToOrganization\(user\.id,\s*org\.id\)/;
    assert.match(phase4, sellerHook, 'seller GST verify must create OrgMembership');
    assert.match(phase4, buyerHook, 'buyer GST verify must create OrgMembership');
});

test('Stage 2d: org-membership service is idempotent', () => {
    // existing membership should not duplicate
    assert.match(orgMembershipService, /findUnique\([\s\S]*?userId_organizationId/);
    assert.match(orgMembershipService, /if \(existing\)/);
    // First user becomes ORG_ADMIN
    assert.match(orgMembershipService, /memberCount === 0[\s\S]*?role = OrgRole\.ORG_ADMIN/);
    // Default fallback for subsequent users
    assert.match(orgMembershipService, /OrgRole\.VIEWER/);
});

// ============================================================
// STAGE 3 — Onboarding submission
// ============================================================

test('Stage 3: onboarding submit moves status to under_compliance_review', () => {
    assert.match(phase4, /'\/onboarding\/submit'/);
    assert.match(phase4, /onboardingStatus = 'under_compliance_review'/);
});

// ============================================================
// STAGE 4 — Admin approval mirrors Organization.verificationStatus
// ============================================================

test('Stage 4a: admin approval updates User.onboardingStatus', () => {
    assert.match(phase4, /'\/admin\/onboarding\/:id\/status'/);
    assert.match(phase4, /authorizeAdmin/);
});

test('Stage 4b: admin approval mirrors verificationStatus onto Organization', () => {
    // approval branch
    assert.match(
        phase4,
        /onboardingStatus === 'approved_for_procurement'[\s\S]*?db\.organization\.update[\s\S]*?verificationStatus:\s*'VERIFIED'/,
        'approval must set Organization.verificationStatus = VERIFIED'
    );
});

test('Stage 4c: admin rejection only suspends org if no other approved members', () => {
    // rejection branch must check otherApproved count
    assert.match(
        phase4,
        /onboardingStatus === 'rejected'[\s\S]*?otherApproved/,
        'rejection must check for other approved users'
    );
    assert.match(phase4, /verificationStatus:\s*'REJECTED'/);
});

// ============================================================
// STAGE 5 — Read-only mode (requireApprovedOrg)
// ============================================================

test('Stage 5a: requireApprovedOrg middleware blocks mutations until VERIFIED', () => {
    assert.match(requireApprovedOrg, /verificationStatus !== 'VERIFIED'/);
    assert.match(requireApprovedOrg, /ORG_PENDING_APPROVAL/);
    assert.match(requireApprovedOrg, /READ_METHODS\.has\(req\.method\)/);
});

test('Stage 5b: read-only mode allows GET / HEAD / OPTIONS', () => {
    assert.match(requireApprovedOrg, /'GET',\s*'HEAD',\s*'OPTIONS'/);
});

test('Stage 5c: cart, GRN, approvals, tender-eval routes apply requireApprovedOrg', () => {
    assert.match(cartRoutes, /requireApprovedOrg/);
    assert.match(grnRoutes, /requireApprovedOrg/);
    assert.match(approvalsRoutes, /requireApprovedOrg/);
    assert.match(tenderEvalRoutes, /requireApprovedOrg/);
});

// ============================================================
// STAGE 6 — Team management (invite, accept, role change, remove)
// ============================================================

test('Stage 6a: org admin can invite team members', () => {
    assert.match(orgRoutes, /'\/org\/invite'/);
    assert.match(orgRoutes, /requireOrgRole\('ORG_ADMIN'\)/);
    assert.match(orgRoutes, /generateToken/);
    // 7-day expiry: const expiresAt = new Date(Date.now() + 7 * 24 * ...)
    assert.match(orgRoutes, /Date\.now\(\)\s*\+\s*7\s*\*\s*24/);
});

test('Stage 6b: invitee accepts via secure token', () => {
    assert.match(orgRoutes, /'\/org\/accept-invite'/);
    assert.match(orgRoutes, /invite\.acceptedAt/);
    assert.match(orgRoutes, /invite\.expiresAt < new Date\(\)/);
    assert.match(orgRoutes, /INVITE_EMAIL_MISMATCH/);
});

test('Stage 6c: accepting an invite creates OrgMembership', () => {
    assert.match(orgRoutes, /prisma\.orgMembership\.create/);
});

test('Stage 6d: org admin can change member role and remove members', () => {
    assert.match(orgRoutes, /'\/org\/members\/:memberId\/role'/);
    assert.match(orgRoutes, /SELF_ROLE_CHANGE/);
    assert.match(orgRoutes, /SELF_REMOVE/);
});

// ============================================================
// STAGE 7 — Cart workflow
// ============================================================

test('Stage 7a: cart routes require ApprovedOrg + OrgRole', () => {
    assert.match(cartRoutes, /'\/cart\/items'/);
    assert.match(cartRoutes, /requireApprovedOrg/);
    assert.match(cartRoutes, /requireOrgRole/);
});

test('Stage 7b: cart submission notifies finance officers', () => {
    assert.match(cartRoutes, /'\/cart\/submit'/);
    assert.match(
        cartRoutes,
        /orgRole:\s*\{\s*in:\s*\['FINANCE_OFFICER',\s*'ORG_ADMIN'\]/
    );
});

test('Stage 7c: cart approval blocks if items lack tech approval', () => {
    assert.match(cartRoutes, /PENDING_TECH_APPROVAL/);
    assert.match(cartRoutes, /technicalApproved !== true/);
});

test('Stage 7d: rejection requires a note >= 5 chars', () => {
    assert.match(cartRoutes, /rejectionNote:\s*z\.string\(\)\.trim\(\)\.min\(5\)/);
});

test('Stage 7e: tech officer scope is per line item', () => {
    assert.match(cartRoutes, /'\/cart\/items\/:id\/tech-approve'/);
    assert.match(cartRoutes, /'\/cart\/items\/:id\/tech-reject'/);
    assert.match(cartRoutes, /requireOrgRole\('ORG_ADMIN',\s*'TECHNICAL_OFFICER'\)/);
});

test('Stage 7f: starting an approval chain on cart requires APPROVED state', () => {
    assert.match(cartRoutes, /'\/cart\/:id\/start-approval-chain'/);
    assert.match(cartRoutes, /CART_NOT_APPROVED/);
});

// ============================================================
// STAGE 8 — Multi-level approval workflow
// ============================================================

test('Stage 8a: approval chain has 3 stages', () => {
    assert.match(approvalChainService, /DEPARTMENT_HEAD/);
    assert.match(approvalChainService, /FINANCE_DEPT/);
    assert.match(approvalChainService, /PROCUREMENT_HEAD/);
});

test('Stage 8b: approval chain enforces sequence (no skipping ahead)', () => {
    assert.match(
        approvalChainService,
        /Earlier stages must be approved before this one/
    );
});

test('Stage 8c: low-value carts skip Finance stage', () => {
    assert.match(approvalChainService, /totalValue < 50_000/);
    assert.match(
        approvalChainService,
        /'DEPARTMENT_HEAD',\s*'PROCUREMENT_HEAD'/,
        '< 50K should produce a 2-stage chain'
    );
});

test('Stage 8d: rejection halts the chain', () => {
    assert.match(approvalChainService, /notifyRejection/);
});

test('Stage 8e: clarification re-opens the current stage', () => {
    assert.match(approvalChainService, /SENT_FOR_CLARIFICATION/);
    assert.match(approvalChainService, /notifyClarification/);
});

test('Stage 8f: pending queue is filtered by the user OrgRole', () => {
    assert.match(approvalChainService, /export const getPendingApprovalsForUser/);
    assert.match(approvalChainService, /params\.orgRole === 'PROCUREMENT_OFFICER'/);
    assert.match(approvalChainService, /params\.orgRole === 'FINANCE_OFFICER'/);
});

// ============================================================
// STAGE 9 — GRN workflow (3-way match)
// ============================================================

test('Stage 9a: GRN line items enforce accepted + rejected = received', () => {
    // Math.abs((d.acceptedQty + d.rejectedQty) - d.receivedQty) < 0.001
    assert.match(grnRoutes, /d\.acceptedQty \+ d\.rejectedQty\) - d\.receivedQty/);
});

test('Stage 9b: GRN status transitions are gated', () => {
    assert.match(grnRoutes, /Only DRAFT GRNs can be submitted/);
    assert.match(grnRoutes, /Only SUBMITTED GRNs can be approved/);
    assert.match(grnRoutes, /Only SUBMITTED GRNs can be rejected/);
});

test('Stage 9c: GRN rejection notifies the seller', () => {
    assert.match(
        grnRoutes,
        /grn\.purchaseOrder\.sellerId[\s\S]*?notify[\s\S]*?GRN rejected/i
    );
});

test('Stage 9d: PARTIAL status is auto-detected when any item rejected', () => {
    assert.match(grnRoutes, /hasRejection \?\s*'PARTIAL'\s*:\s*'APPROVED'/);
});

// ============================================================
// STAGE 10 — Tender evaluation (two-bid system)
// ============================================================

test('Stage 10a: technical evaluation enforces score <= criterion max', () => {
    assert.match(tenderEvalRoutes, /SCORE_OUT_OF_RANGE/);
    assert.match(tenderEvalRoutes, /score\.score > Number\(c\.maxScore\)/);
});

test('Stage 10b: only qualified bids (≥60%) appear in financial tab', () => {
    assert.match(tenderEvalRoutes, /total \/ maxScore\) >= 0\.6/);
});

test('Stage 10c: opening financial bids is restricted to PROCUREMENT or ORG_ADMIN', () => {
    // The route registers '/tender-eval/:tenderId/open-financial' followed by
    // authenticate, authorize, requireApprovedOrg, requireOrgRole(ORG_ADMIN, PROCUREMENT_OFFICER).
    assert.match(
        tenderEvalRoutes,
        /'\/tender-eval\/:tenderId\/open-financial'[\s\S]*?requireOrgRole\('ORG_ADMIN',\s*'PROCUREMENT_OFFICER'\)/
    );
});

test('Stage 10d: ranking sorts by evaluatedAmount and persists L1/L2/L3', () => {
    assert.match(tenderEvalRoutes, /sort\(\(a, b\) => a\.evaluatedAmount - b\.evaluatedAmount\)/);
    assert.match(tenderEvalRoutes, /financialEvaluation\.updateMany/);
    assert.match(tenderEvalRoutes, /rank: r\.rank/);
});

test('Stage 10e: comparative statement is versioned', () => {
    assert.match(tenderEvalRoutes, /\(last\?\.version \|\| 0\) \+ 1/);
    assert.match(tenderEvalRoutes, /comparativeStatement\.create/);
});

// ============================================================
// STAGE 11 — Disputes / Messages have proper auth
// ============================================================

test('Stage 11a: dispute status updates are admin-only', () => {
    const indexTs = read('backend/index.ts');
    assert.match(indexTs, /'\/api\/disputes\/:id\/status'[\s\S]*?authorizeAdmin/);
});

test('Stage 11b: only admins can post internal dispute notes', () => {
    const indexTs = read('backend/index.ts');
    assert.match(indexTs, /payload\.internal && req\.user\?\.role !== 'admin'/);
});

test('Stage 11c: conversation creation enforces buyer-seller pairing', () => {
    const indexTs = read('backend/index.ts');
    assert.match(indexTs, /buyer-seller pairing|buyerId.*sellerId.*===|buyerId === sellerId/);
});

// ============================================================
// STAGE 12 — Backfill script
// ============================================================

test('Stage 12a: backfill script exists and is idempotent', () => {
    assert.match(backfillScript, /async function backfill/);
    assert.match(backfillScript, /existing[\s\S]*?membershipsExisting \+= 1/);
});

test('Stage 12b: backfill mirrors approval status onto Organization', () => {
    assert.match(backfillScript, /onboardingStatus:\s*'approved_for_procurement'/);
    assert.match(backfillScript, /verificationStatus:\s*'VERIFIED'/);
});

test('Stage 12c: backfill is registered in package.json', () => {
    const pkg = read('backend/package.json');
    assert.match(pkg, /"backfill:org-membership"/);
});

// ============================================================
// STAGE 13 — All new modules are mounted
// ============================================================

test('Stage 13: all Phase 1-6 routes are mounted', () => {
    assert.match(indexRouter, /import orgRoutes from '\.\/org\.routes\.js';/);
    assert.match(indexRouter, /import cartRoutes from '\.\/cart\.routes\.js';/);
    assert.match(indexRouter, /import approvalsRoutes from '\.\/approvals\.routes\.js';/);
    assert.match(indexRouter, /import grnRoutes from '\.\/grn\.routes\.js';/);
    assert.match(indexRouter, /import tenderEvalRoutes from '\.\/tender-evaluation\.routes\.js';/);
    assert.match(indexRouter, /router\.use\('\/', orgRoutes\);/);
    assert.match(indexRouter, /router\.use\('\/', cartRoutes\);/);
    assert.match(indexRouter, /router\.use\('\/', approvalsRoutes\);/);
    assert.match(indexRouter, /router\.use\('\/', grnRoutes\);/);
    assert.match(indexRouter, /router\.use\('\/', tenderEvalRoutes\);/);
});

// ============================================================
// STAGE 14 — Schema models exist with correct relations
// ============================================================

test('Stage 14a: OrgMembership model exists with the right shape', () => {
    assert.match(schema, /model OrgMembership \{/);
    assert.match(schema, /@@unique\(\[userId, organizationId\]\)/);
});

test('Stage 14b: ProcurementApproval has unique constraint per stage', () => {
    assert.match(schema, /model ProcurementApproval \{/);
    assert.match(schema, /@@unique\(\[entityType, entityId, stage\]\)/);
});

test('Stage 14c: Cart and CartItem models with technical approval per item', () => {
    assert.match(schema, /model Cart \{/);
    assert.match(schema, /model CartItem \{/);
    assert.match(schema, /technicalApproved\s+Boolean\?/);
});

test('Stage 14d: GoodsReceiptNote has unique number + status enum', () => {
    assert.match(schema, /model GoodsReceiptNote \{/);
    assert.match(schema, /grnNumber\s+String\s+@unique/);
    assert.match(schema, /enum GrnStatus \{/);
});
