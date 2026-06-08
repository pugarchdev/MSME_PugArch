/**
 * Approvals Routes
 *
 *   GET  /api/approvals/pending             — items pending my approval
 *   GET  /api/approvals/history             — all approvals for my org (decided)
 *   GET  /api/approvals/trail/:type/:id     — full chain for an entity
 *   POST /api/approvals/:id/approve         — approve current stage
 *   POST /api/approvals/:id/reject          — reject (with remarks)
 *   POST /api/approvals/:id/clarify         — send back for clarification
 *   POST /api/approvals/start               — initiate a chain (used by Procurement Officer
 *                                             when converting an approved cart, etc.)
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import type { OrgRole } from '@prisma/client';
import prisma from '../config/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireOrgRole } from '../middleware/requireOrgRole.js';
import { requireApprovedOrg } from '../middleware/requireApprovedOrg.js';
import { ApiError } from '../utils/ApiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import {
    createApprovalChain,
    decideApproval,
    getApprovalTrail,
    getPendingApprovalsForUser,
    isFullyApproved,
    type ApprovalEntityType
} from '../services/approval-chain.service.js';
import type { AuthRequest } from '../middleware/authenticate.js';

const router = Router();

const asyncRoute = (
    handler: (req: AuthRequest, res: Response) => Promise<unknown>
) =>
    async (req: AuthRequest, res: Response) => {
        try {
            await handler(req, res);
        } catch (err: any) {
            const status = err?.statusCode || 500;
            const message = status < 500 ? err.message : 'Unable to complete request';
            return apiResponse.error(res, status, message, err?.code || 'REQUEST_FAILED');
        }
    };

const ok = (res: Response, data: unknown, status = 200) =>
    res.status(status).json({ success: true, data });

const userId = (req: AuthRequest) => req.user!.id;
const orgId = (req: AuthRequest) => req.user!.organizationId!;

const ensureOrg = (req: AuthRequest) => {
    if (!req.user?.organizationId) {
        throw new ApiError(400, 'You must belong to an organisation to view approvals.', 'ORG_REQUIRED');
    }
};

// Get OrgRole from membership
const getOrgRole = async (userId: number, organizationId: number): Promise<OrgRole> => {
    const m = await prisma.orgMembership.findUnique({
        where: { userId_organizationId: { userId, organizationId } },
        select: { orgRole: true, isActive: true }
    });
    if (!m || !m.isActive) {
        throw new ApiError(403, 'You are not an active member of this organisation', 'ORG_MEMBERSHIP_INACTIVE');
    }
    return m.orgRole;
};

const ENTITY_TYPES: ApprovalEntityType[] = ['tender', 'purchase_order', 'cart', 'direct_purchase'];

// ─── Schemas ─────────────────────────────────────────────────────────────────

const decisionSchema = z.object({
    remarks: z.string().trim().max(2000).optional()
});

const rejectSchema = z.object({
    remarks: z.string().trim().min(10).max(2000)
});

const clarifySchema = z.object({
    clarificationNote: z.string().trim().min(10).max(2000)
});

const startChainSchema = z.object({
    entityType: z.enum(ENTITY_TYPES as [string, ...string[]]),
    entityId: z.coerce.number().int().positive(),
    totalValue: z.coerce.number().nonnegative()
});

// ─── GET /api/approvals/pending ──────────────────────────────────────────────

router.get(
    '/approvals/pending',
    authenticate,
    authorize('buyer', 'seller'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const orgRole = await getOrgRole(userId(req), orgId(req));
        const approvals = await getPendingApprovalsForUser({
            userId: userId(req),
            organizationId: orgId(req),
            orgRole
        });

        // Enrich with entity summaries
        const enriched = await Promise.all(approvals.map(async (a) => {
            const entityType = a.entityType as ApprovalEntityType;
            const summary = await getEntitySummary(entityType, a.entityId);
            return { ...a, entitySummary: summary };
        }));

        ok(res, enriched);
    })
);

// ─── GET /api/approvals/history ──────────────────────────────────────────────

router.get(
    '/approvals/history',
    authenticate,
    authorize('buyer', 'seller'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const approvals = await prisma.procurementApproval.findMany({
            where: {
                organizationId: orgId(req),
                decision: { in: ['APPROVED', 'REJECTED'] }
            },
            include: {
                approver: { select: { id: true, name: true, email: true } }
            },
            orderBy: { decidedAt: 'desc' },
            take: 100
        });

        const enriched = await Promise.all(approvals.map(async (a) => {
            const entityType = a.entityType as ApprovalEntityType;
            const summary = await getEntitySummary(entityType, a.entityId);
            return { ...a, entitySummary: summary };
        }));

        ok(res, enriched);
    })
);

// ─── GET /api/approvals/trail/:type/:id ──────────────────────────────────────

router.get(
    '/approvals/trail/:type/:id',
    authenticate,
    authorize('buyer', 'seller'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const type = req.params.type as ApprovalEntityType;
        const id = Number(req.params.id);

        if (!ENTITY_TYPES.includes(type)) {
            throw new ApiError(400, 'Invalid entity type', 'INVALID_TYPE');
        }
        if (!id) throw new ApiError(400, 'Invalid entity ID', 'INVALID_ID');

        const trail = await getApprovalTrail(type, id);
        // Verify it belongs to the user's org
        if (trail.length > 0 && trail[0].organizationId !== orgId(req)) {
            throw new ApiError(403, 'Approval not in your organisation', 'FORBIDDEN');
        }

        const summary = await getEntitySummary(type, id);
        ok(res, { trail, entitySummary: summary, fullyApproved: await isFullyApproved(type, id) });
    })
);

// ─── POST /api/approvals/:id/approve ─────────────────────────────────────────

router.post(
    '/approvals/:id/approve',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'PROCUREMENT_OFFICER', 'FINANCE_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const body = decisionSchema.parse(req.body);
        const orgRole = await getOrgRole(userId(req), orgId(req));

        const updated = await decideApproval({
            approvalId: id,
            decision: 'APPROVED',
            approverId: userId(req),
            approverOrgRole: orgRole,
            organizationId: orgId(req),
            remarks: body.remarks,
            ipAddress: req.ip
        });

        ok(res, updated);
    })
);

// ─── POST /api/approvals/:id/reject ──────────────────────────────────────────

router.post(
    '/approvals/:id/reject',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'PROCUREMENT_OFFICER', 'FINANCE_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const body = rejectSchema.parse(req.body);
        const orgRole = await getOrgRole(userId(req), orgId(req));

        const updated = await decideApproval({
            approvalId: id,
            decision: 'REJECTED',
            approverId: userId(req),
            approverOrgRole: orgRole,
            organizationId: orgId(req),
            remarks: body.remarks,
            ipAddress: req.ip
        });

        ok(res, updated);
    })
);

// ─── POST /api/approvals/:id/clarify ─────────────────────────────────────────

router.post(
    '/approvals/:id/clarify',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'PROCUREMENT_OFFICER', 'FINANCE_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const body = clarifySchema.parse(req.body);
        const orgRole = await getOrgRole(userId(req), orgId(req));

        const updated = await decideApproval({
            approvalId: id,
            decision: 'SENT_FOR_CLARIFICATION',
            approverId: userId(req),
            approverOrgRole: orgRole,
            organizationId: orgId(req),
            clarificationNote: body.clarificationNote,
            ipAddress: req.ip
        });

        ok(res, updated);
    })
);

// ─── POST /api/approvals/start ───────────────────────────────────────────────
// Used by other modules (e.g. when a Procurement Officer converts a cart to PO)

router.post(
    '/approvals/start',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'PROCUREMENT_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const body = startChainSchema.parse(req.body);

        // Validate the entity belongs to this org
        const entityType = body.entityType as ApprovalEntityType;
        await assertEntityOwnedByOrg(entityType, body.entityId, orgId(req));

        const chain = await createApprovalChain({
            entityType,
            entityId: body.entityId,
            organizationId: orgId(req),
            totalValue: body.totalValue,
            initiatorUserId: userId(req)
        });

        ok(res, chain, 201);
    })
);

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getEntitySummary(type: ApprovalEntityType, id: number) {
    if (type === 'tender') {
        const t = await prisma.tender.findUnique({
            where: { id },
            select: { id: true, tenderId: true, title: true, budget: true, status: true, createdAt: true }
        });
        if (!t) return null;
        return {
            id: t.id, label: t.tenderId, title: t.title, value: Number(t.budget),
            status: t.status, createdAt: t.createdAt
        };
    }
    if (type === 'purchase_order') {
        const po = await prisma.purchaseOrder.findUnique({
            where: { id },
            select: { id: true, poNumber: true, title: true, amount: true, status: true, createdAt: true }
        });
        if (!po) return null;
        return {
            id: po.id, label: po.poNumber, title: po.title, value: Number(po.amount || 0),
            status: po.status, createdAt: po.createdAt
        };
    }
    if (type === 'cart') {
        const c = await prisma.cart.findUnique({
            where: { id },
            select: { id: true, status: true, createdAt: true, items: { select: { quantity: true, unitPrice: true } } }
        });
        if (!c) return null;
        const total = c.items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitPrice), 0);
        return {
            id: c.id, label: `CART-${c.id}`, title: `Cart with ${c.items.length} items`,
            value: total, status: c.status, createdAt: c.createdAt
        };
    }
    if (type === 'direct_purchase') {
        const dp = await prisma.directPurchase.findUnique({
            where: { id },
            select: { id: true, purchaseNumber: true, totalAmount: true, status: true, createdAt: true }
        });
        if (!dp) return null;
        return {
            id: dp.id, label: dp.purchaseNumber, title: `Direct Purchase ${dp.purchaseNumber}`,
            value: Number(dp.totalAmount || 0), status: dp.status, createdAt: dp.createdAt
        };
    }
    return null;
}

async function assertEntityOwnedByOrg(type: ApprovalEntityType, id: number, organizationId: number) {
    if (type === 'tender') {
        const t = await prisma.tender.findUnique({ where: { id }, select: { organizationId: true } });
        if (!t || t.organizationId !== organizationId) throw new ApiError(404, 'Tender not found', 'NOT_FOUND');
        return;
    }
    if (type === 'purchase_order') {
        const po = await prisma.purchaseOrder.findUnique({ where: { id }, select: { buyerId: true } });
        if (!po) throw new ApiError(404, 'PO not found', 'NOT_FOUND');
        const user = await prisma.user.findUnique({ where: { id: po.buyerId }, select: { organizationId: true } });
        if (user?.organizationId !== organizationId) throw new ApiError(404, 'PO not in your org', 'NOT_FOUND');
        return;
    }
    if (type === 'cart') {
        const c = await prisma.cart.findUnique({ where: { id }, select: { organizationId: true } });
        if (!c || c.organizationId !== organizationId) throw new ApiError(404, 'Cart not found', 'NOT_FOUND');
        return;
    }
    if (type === 'direct_purchase') {
        const dp = await prisma.directPurchase.findUnique({ where: { id }, select: { buyerId: true } });
        if (!dp) throw new ApiError(404, 'Direct purchase not found', 'NOT_FOUND');
        const user = await prisma.user.findUnique({ where: { id: dp.buyerId }, select: { organizationId: true } });
        if (user?.organizationId !== organizationId) throw new ApiError(404, 'Direct purchase not in your org', 'NOT_FOUND');
        return;
    }
}

export default router;
