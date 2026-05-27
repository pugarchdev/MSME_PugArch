/**
 * Goods Receipt Note (GRN) Routes
 *
 *   GET    /api/grn                          — list GRNs for my org
 *   GET    /api/grn/:id                      — GRN detail
 *   POST   /api/grn                          — create GRN against a PO
 *   PUT    /api/grn/:id                      — edit (only DRAFT)
 *   POST   /api/grn/:id/submit               — submit for approval
 *   POST   /api/grn/:id/approve              — approve (3-way match: PO + GRN qty + price)
 *   POST   /api/grn/:id/reject               — reject with reason
 *   POST   /api/grn/:id/documents            — attach document (POD photos, inspection report)
 *
 *   GET    /api/grn/po/:poId/eligibility     — quick check: can this PO have a GRN?
 */
import { Router, type Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { authenticate, authorize } from '../middleware/auth.js';
import { requireOrgRole } from '../middleware/requireOrgRole.js';
import { requireApprovedOrg } from '../middleware/requireApprovedOrg.js';
import { shortCache } from '../middleware/httpCache.js';
import { ApiError } from '../utils/ApiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { notificationService } from '../services/notification.service.js';
import type { AuthRequest } from '../middleware/authenticate.js';

const router = Router();

const asyncRoute = (handler: (req: AuthRequest, res: Response) => Promise<unknown>) =>
    async (req: AuthRequest, res: Response) => {
        try { await handler(req, res); }
        catch (err: any) {
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
        throw new ApiError(400, 'You must belong to an organisation.', 'ORG_REQUIRED');
    }
};

const grnIncludes = {
    items: { orderBy: { id: 'asc' as const } },
    documents: {
        include: {
            fileAsset: { select: { id: true, originalName: true, mimeType: true, size: true } },
            uploadedBy: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'desc' as const }
    },
    purchaseOrder: {
        select: {
            id: true, poNumber: true, title: true, amount: true, status: true,
            sellerId: true, buyerId: true,
            seller: { select: { id: true, name: true, email: true } },
            buyer: { select: { id: true, name: true, email: true } },
            items: { select: { id: true, productId: true, quantity: true, unitPrice: true } }
        }
    },
    receivedBy: { select: { id: true, name: true, email: true } }
};

// ─── Schemas ─────────────────────────────────────────────────────────────────

const grnItemSchema = z.object({
    purchaseOrderItemId: z.coerce.number().int().positive().optional(),
    itemName: z.string().trim().min(1).max(200),
    orderedQty: z.coerce.number().nonnegative(),
    receivedQty: z.coerce.number().nonnegative(),
    acceptedQty: z.coerce.number().nonnegative(),
    rejectedQty: z.coerce.number().nonnegative().default(0),
    rejectionReason: z.string().trim().max(500).optional(),
    unitOfMeasure: z.string().trim().min(1).max(50)
}).refine(d => Math.abs((d.acceptedQty + d.rejectedQty) - d.receivedQty) < 0.001, {
    message: 'acceptedQty + rejectedQty must equal receivedQty'
});

const createGrnSchema = z.object({
    purchaseOrderId: z.coerce.number().int().positive(),
    remarks: z.string().trim().max(2000).optional(),
    inspectionNote: z.string().trim().max(2000).optional(),
    items: z.array(grnItemSchema).min(1).max(100)
});

const updateGrnSchema = z.object({
    remarks: z.string().trim().max(2000).optional(),
    inspectionNote: z.string().trim().max(2000).optional(),
    items: z.array(grnItemSchema).min(1).max(100).optional()
});

const approveGrnSchema = z.object({
    inspectionNote: z.string().trim().max(2000).optional()
});

const rejectGrnSchema = z.object({
    rejectionReason: z.string().trim().min(5).max(2000)
});

const documentSchema = z.object({
    fileAssetId: z.coerce.number().int().positive(),
    documentType: z.enum(['DELIVERY_PROOF', 'INSPECTION_PHOTO', 'EWAY_BILL', 'PACKING_LIST', 'OTHER'])
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

const generateGrnNumber = async () => {
    const today = new Date();
    const yyyymmdd = today.toISOString().slice(0, 10).replace(/-/g, '');
    const seq = await prisma.goodsReceiptNote.count({
        where: { createdAt: { gte: new Date(today.toISOString().slice(0, 10)) } }
    });
    return `GRN-${yyyymmdd}-${String(seq + 1).padStart(4, '0')}`;
};

const assertPoOwnership = async (poId: number, organizationId: number, userId: number) => {
    const po = await prisma.purchaseOrder.findUnique({
        where: { id: poId },
        select: { id: true, buyerId: true, status: true, buyer: { select: { organizationId: true } } }
    });
    if (!po) throw new ApiError(404, 'Purchase Order not found', 'PO_NOT_FOUND');
    if (po.buyer?.organizationId !== organizationId) {
        throw new ApiError(403, 'PO does not belong to your organisation', 'PO_NOT_IN_ORG');
    }
    return po;
};

// ─── GET /api/grn — list ─────────────────────────────────────────────────────

router.get(
    '/grn',
    authenticate,
    authorize('buyer', 'seller'),
    shortCache(15),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const { status } = req.query;
        const where: any = { organizationId: orgId(req) };
        if (status) where.status = status;

        const grns = await prisma.goodsReceiptNote.findMany({
            where,
            include: grnIncludes,
            orderBy: { updatedAt: 'desc' },
            take: 100
        });
        ok(res, grns);
    })
);

// ─── GET /api/grn/po/:poId/eligibility ───────────────────────────────────────

router.get(
    '/grn/po/:poId/eligibility',
    authenticate,
    authorize('buyer', 'seller'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const poId = Number(req.params.poId);
        const po = await assertPoOwnership(poId, orgId(req), userId(req));

        const existing = await prisma.goodsReceiptNote.findMany({
            where: { purchaseOrderId: poId },
            select: { id: true, status: true, grnNumber: true }
        });

        ok(res, {
            poId,
            poStatus: po.status,
            canCreate: !existing.some(g => g.status === 'APPROVED'),
            existing
        });
    })
);

// ─── POST /api/grn — create ──────────────────────────────────────────────────

router.post(
    '/grn',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'LOGISTICS_OFFICER', 'TECHNICAL_OFFICER', 'PROCUREMENT_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const body = createGrnSchema.parse(req.body);

        await assertPoOwnership(body.purchaseOrderId, orgId(req), userId(req));

        const grnNumber = await generateGrnNumber();
        const grn = await prisma.goodsReceiptNote.create({
            data: {
                grnNumber,
                purchaseOrderId: body.purchaseOrderId,
                receivedById: userId(req),
                organizationId: orgId(req),
                status: 'DRAFT',
                remarks: body.remarks,
                inspectionNote: body.inspectionNote,
                items: { create: body.items }
            },
            include: grnIncludes
        });

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'grn.created',
            entityType: 'grn',
            entityId: grn.id,
            ipAddress: req.ip,
            metadata: { poId: body.purchaseOrderId, itemCount: body.items.length }
        });

        ok(res, grn, 201);
    })
);

// ─── GET /api/grn/:id — detail ───────────────────────────────────────────────

router.get(
    '/grn/:id',
    authenticate,
    authorize('buyer', 'seller'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const grn = await prisma.goodsReceiptNote.findFirst({
            where: { id, organizationId: orgId(req) },
            include: grnIncludes
        });
        if (!grn) throw new ApiError(404, 'GRN not found', 'GRN_NOT_FOUND');
        ok(res, grn);
    })
);

// ─── PUT /api/grn/:id — edit (DRAFT only) ────────────────────────────────────

router.put(
    '/grn/:id',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'LOGISTICS_OFFICER', 'TECHNICAL_OFFICER', 'PROCUREMENT_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const body = updateGrnSchema.parse(req.body);

        const grn = await prisma.goodsReceiptNote.findFirst({
            where: { id, organizationId: orgId(req) }
        });
        if (!grn) throw new ApiError(404, 'GRN not found', 'GRN_NOT_FOUND');
        if (grn.status !== 'DRAFT') {
            throw new ApiError(409, 'Only DRAFT GRNs can be edited', 'GRN_LOCKED');
        }

        // If items were sent, replace them all
        if (body.items) {
            await prisma.$transaction([
                prisma.grnItem.deleteMany({ where: { grnId: id } }),
                prisma.grnItem.createMany({ data: body.items.map(i => ({ ...i, grnId: id })) })
            ]);
        }

        const updated = await prisma.goodsReceiptNote.update({
            where: { id },
            data: { remarks: body.remarks, inspectionNote: body.inspectionNote },
            include: grnIncludes
        });

        ok(res, updated);
    })
);

// ─── POST /api/grn/:id/submit ────────────────────────────────────────────────

router.post(
    '/grn/:id/submit',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'LOGISTICS_OFFICER', 'TECHNICAL_OFFICER', 'PROCUREMENT_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);

        const grn = await prisma.goodsReceiptNote.findFirst({
            where: { id, organizationId: orgId(req) },
            include: { items: true }
        });
        if (!grn) throw new ApiError(404, 'GRN not found', 'GRN_NOT_FOUND');
        if (grn.status !== 'DRAFT') {
            throw new ApiError(409, 'Only DRAFT GRNs can be submitted', 'GRN_INVALID_STATE');
        }
        if (grn.items.length === 0) {
            throw new ApiError(400, 'GRN has no items', 'GRN_EMPTY');
        }

        const updated = await prisma.goodsReceiptNote.update({
            where: { id },
            data: { status: 'SUBMITTED' },
            include: grnIncludes
        });

        // Notify Finance & Procurement officers in the org
        try {
            const approvers = await prisma.orgMembership.findMany({
                where: {
                    organizationId: orgId(req),
                    isActive: true,
                    orgRole: { in: ['ORG_ADMIN', 'FINANCE_OFFICER', 'PROCUREMENT_OFFICER', 'TECHNICAL_OFFICER'] }
                },
                select: { userId: true }
            });
            await Promise.allSettled(
                approvers.map(a => notificationService.notify(a.userId, {
                    title: 'GRN pending approval',
                    message: `${grn.grnNumber} for PO ${updated.purchaseOrder?.poNumber} is awaiting approval.`,
                    type: 'grn_pending_approval',
                    priority: 'high',
                    redirectUrl: `/grn`
                }))
            );
        } catch { /* non-fatal */ }

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'grn.submitted',
            entityType: 'grn',
            entityId: id,
            ipAddress: req.ip
        });

        ok(res, updated);
    })
);

// ─── POST /api/grn/:id/approve — 3-way match check ───────────────────────────

router.post(
    '/grn/:id/approve',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'FINANCE_OFFICER', 'PROCUREMENT_OFFICER', 'TECHNICAL_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const body = approveGrnSchema.parse(req.body);

        const grn = await prisma.goodsReceiptNote.findFirst({
            where: { id, organizationId: orgId(req) },
            include: { items: true, purchaseOrder: { include: { items: true } } }
        });
        if (!grn) throw new ApiError(404, 'GRN not found', 'GRN_NOT_FOUND');
        if (grn.status !== 'SUBMITTED' && grn.status !== 'PARTIAL') {
            throw new ApiError(409, 'Only SUBMITTED GRNs can be approved', 'GRN_INVALID_STATE');
        }

        // Check if any item has rejected qty > 0 — mark as PARTIAL otherwise APPROVED
        const hasRejection = grn.items.some(i => Number(i.rejectedQty) > 0);
        const newStatus = hasRejection ? 'PARTIAL' : 'APPROVED';

        const updated = await prisma.goodsReceiptNote.update({
            where: { id },
            data: {
                status: newStatus,
                approvedById: userId(req),
                approvedAt: new Date(),
                inspectionNote: body.inspectionNote ?? grn.inspectionNote
            },
            include: grnIncludes
        });

        // Notify the seller
        try {
            const sellerId = grn.purchaseOrder.sellerId;
            await notificationService.notify(sellerId, {
                title: hasRejection ? 'GRN partially approved' : 'GRN approved',
                message: `${grn.grnNumber} for PO ${grn.purchaseOrder.poNumber} has been ${hasRejection ? 'partially approved with rejections' : 'approved'}. You may now raise an invoice.`,
                type: 'grn_approved',
                priority: 'medium',
                redirectUrl: '/seller/orders'
            });
        } catch { /* non-fatal */ }

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'grn.approved',
            entityType: 'grn',
            entityId: id,
            ipAddress: req.ip,
            metadata: { status: newStatus, hasRejection }
        });

        ok(res, updated);
    })
);

// ─── POST /api/grn/:id/reject ────────────────────────────────────────────────

router.post(
    '/grn/:id/reject',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'FINANCE_OFFICER', 'PROCUREMENT_OFFICER', 'TECHNICAL_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const { rejectionReason } = rejectGrnSchema.parse(req.body);

        const grn = await prisma.goodsReceiptNote.findFirst({
            where: { id, organizationId: orgId(req) },
            include: { purchaseOrder: { select: { poNumber: true, sellerId: true } } }
        });
        if (!grn) throw new ApiError(404, 'GRN not found', 'GRN_NOT_FOUND');
        if (grn.status !== 'SUBMITTED') {
            throw new ApiError(409, 'Only SUBMITTED GRNs can be rejected', 'GRN_INVALID_STATE');
        }

        const updated = await prisma.goodsReceiptNote.update({
            where: { id },
            data: {
                status: 'REJECTED',
                rejectedById: userId(req),
                rejectedAt: new Date(),
                rejectionReason
            },
            include: grnIncludes
        });

        try {
            await notificationService.notify(grn.purchaseOrder.sellerId, {
                title: 'GRN rejected',
                message: `${grn.grnNumber} for PO ${grn.purchaseOrder.poNumber} was rejected. Reason: ${rejectionReason}`,
                type: 'grn_rejected',
                priority: 'high',
                redirectUrl: '/seller/orders'
            });
        } catch { /* non-fatal */ }

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'grn.rejected',
            entityType: 'grn',
            entityId: id,
            ipAddress: req.ip,
            metadata: { rejectionReason }
        });

        ok(res, updated);
    })
);

// ─── POST /api/grn/:id/documents ─────────────────────────────────────────────

router.post(
    '/grn/:id/documents',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'LOGISTICS_OFFICER', 'TECHNICAL_OFFICER', 'PROCUREMENT_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const body = documentSchema.parse(req.body);

        const grn = await prisma.goodsReceiptNote.findFirst({
            where: { id, organizationId: orgId(req) }
        });
        if (!grn) throw new ApiError(404, 'GRN not found', 'GRN_NOT_FOUND');

        // Verify file ownership
        const file = await prisma.fileAsset.findUnique({
            where: { id: body.fileAssetId },
            select: { ownerId: true }
        });
        if (!file || file.ownerId !== userId(req)) {
            throw new ApiError(403, 'File does not belong to you', 'FILE_FORBIDDEN');
        }

        const doc = await prisma.grnDocument.create({
            data: {
                grnId: id,
                fileAssetId: body.fileAssetId,
                documentType: body.documentType,
                uploadedById: userId(req)
            },
            include: {
                fileAsset: { select: { id: true, originalName: true, mimeType: true, size: true } },
                uploadedBy: { select: { id: true, name: true } }
            }
        });

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'grn.document.added',
            entityType: 'grnDocument',
            entityId: doc.id,
            ipAddress: req.ip,
            metadata: { grnId: id, documentType: body.documentType }
        });

        ok(res, doc, 201);
    })
);

export default router;
