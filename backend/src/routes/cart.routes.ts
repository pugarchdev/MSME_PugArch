/**
 * Cart Routes — organisation-level shopping cart with multi-stage approval.
 *
 *   GET    /api/cart                         — Get my org's active cart
 *   POST   /api/cart/items                   — Add item to active cart
 *   PUT    /api/cart/items/:id               — Update quantity
 *   DELETE /api/cart/items/:id               — Remove item
 *   POST   /api/cart/submit                  — Submit active cart for finance approval
 *   GET    /api/cart/pending-approval        — List carts pending finance approval (FINANCE_OFFICER)
 *   POST   /api/cart/:id/approve             — Finance approves
 *   POST   /api/cart/:id/reject              — Finance rejects with note
 *   GET    /api/cart/pending-tech-review     — List items needing tech review (TECHNICAL_OFFICER)
 *   POST   /api/cart/items/:id/tech-approve  — Technical Officer approves a line item
 *   POST   /api/cart/items/:id/tech-reject   — Technical Officer rejects a line item
 *   GET    /api/cart/history                 — Past carts (any status) for org
 *   GET    /api/cart/:id                     — Cart detail
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

// ─── Helpers ─────────────────────────────────────────────────────────────────

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
        throw new ApiError(400, 'You must belong to an organisation to use the cart.', 'ORG_REQUIRED');
    }
};

// ─── Schemas ─────────────────────────────────────────────────────────────────

const addItemSchema = z.object({
    productId: z.coerce.number().int().positive().optional(),
    serviceId: z.coerce.number().int().positive().optional(),
    quantity: z.coerce.number().positive().max(1_000_000)
}).refine(d => d.productId || d.serviceId, {
    message: 'Either productId or serviceId is required'
});

const updateItemSchema = z.object({
    quantity: z.coerce.number().positive().max(1_000_000)
});

const submitCartSchema = z.object({
    notes: z.string().trim().max(2000).optional()
});

const rejectCartSchema = z.object({
    rejectionNote: z.string().trim().min(5).max(2000)
});

const techDecisionSchema = z.object({
    note: z.string().trim().max(1000).optional()
});

const mergeGuestCartSchema = z.object({
    cartToken: z.string().trim().min(12).max(120)
});

// ─── Get / create active cart ─────────────────────────────────────────────────

const getOrCreateActiveCart = async (organizationId: number, createdById: number) => {
    let cart = await prisma.cart.findFirst({
        where: { organizationId, status: 'ACTIVE' },
        include: cartIncludes
    });

    if (!cart) {
        cart = await prisma.cart.create({
            data: { organizationId, createdById, status: 'ACTIVE' },
            include: cartIncludes
        });
    }
    return cart;
};

const cartIncludes = {
    items: {
        include: {
            product: { select: { id: true, name: true, hsnCode: true, unitOfMeasure: true, price: true } },
            service: { select: { id: true, name: true, basePrice: true } },
            seller: { select: { id: true, name: true, email: true } },
            technicalApprovedBy: { select: { id: true, name: true } }
        },
        orderBy: { createdAt: 'asc' as const }
    },
    createdBy: { select: { id: true, name: true, email: true } },
    approvedBy: { select: { id: true, name: true, email: true } },
    rejectedBy: { select: { id: true, name: true, email: true } }
};

// ─── GET /api/cart — my org's active cart ────────────────────────────────────

router.get('/cart', authenticate, authorize('buyer', 'seller'), shortCache(10), asyncRoute(async (req, res) => {
    ensureOrg(req);
    const cart = await getOrCreateActiveCart(orgId(req), userId(req));
    ok(res, cart);
}));

router.post('/cart/merge-guest', authenticate, authorize('buyer'), requireApprovedOrg, asyncRoute(async (req, res) => {
    ensureOrg(req);
    const { cartToken } = mergeGuestCartSchema.parse(req.body);
    const guestCart = await (prisma as any).guestCart.findUnique({
        where: { cartToken },
        include: { items: { include: { product: true, service: true } } }
    });
    if (!guestCart || guestCart.items.length === 0) {
        return ok(res, await getOrCreateActiveCart(orgId(req), userId(req)));
    }

    const cart = await getOrCreateActiveCart(orgId(req), userId(req));
    for (const guestItem of guestCart.items) {
        const product = guestItem.product;
        const service = guestItem.service;
        const sellerIdValue = product?.sellerId || service?.sellerId;
        if (!sellerIdValue) continue;
        const existing = await prisma.cartItem.findFirst({
            where: { cartId: cart.id, productId: product?.id || null, serviceId: service?.id || null }
        });
        if (existing) {
            await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: Number(existing.quantity) + Number(guestItem.quantity) } });
        } else {
            await prisma.cartItem.create({
                data: {
                    cartId: cart.id,
                    productId: product?.id || null,
                    serviceId: service?.id || null,
                    sellerId: sellerIdValue,
                    itemName: product?.name || service?.name || 'Marketplace Item',
                    quantity: Number(guestItem.quantity),
                    unitOfMeasure: product?.unitOfMeasure || 'unit',
                    unitPrice: product?.price || service?.basePrice || 0,
                    currency: product?.currency || service?.currency || 'INR'
                }
            });
        }
    }
    await (prisma as any).guestCart.delete({ where: { id: guestCart.id } }).catch(() => undefined);
    const refreshed = await prisma.cart.findUnique({ where: { id: cart.id }, include: cartIncludes });
    ok(res, refreshed);
}));

// ─── POST /api/cart/items — add item ─────────────────────────────────────────

router.post(
    '/cart/items',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'PROCUREMENT_OFFICER', 'FINANCE_OFFICER', 'TECHNICAL_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const body = addItemSchema.parse(req.body);

        let itemName = '';
        let unitOfMeasure = '';
        let unitPrice = 0;
        let sellerId = 0;

        if (body.productId) {
            const product = await prisma.product.findUnique({
                where: { id: body.productId },
                select: { id: true, name: true, unitOfMeasure: true, price: true, sellerId: true, status: true }
            });
            if (!product || product.status !== 'ACTIVE') {
                throw new ApiError(404, 'Product not available', 'PRODUCT_NOT_AVAILABLE');
            }
            itemName = product.name;
            unitOfMeasure = product.unitOfMeasure || 'Nos';
            unitPrice = Number(product.price || 0);
            sellerId = product.sellerId;
        } else if (body.serviceId) {
            const service = await prisma.service.findUnique({
                where: { id: body.serviceId },
                select: { id: true, name: true, basePrice: true, sellerId: true, status: true }
            });
            if (!service || service.status !== 'ACTIVE') {
                throw new ApiError(404, 'Service not available', 'SERVICE_NOT_AVAILABLE');
            }
            itemName = service.name;
            unitOfMeasure = 'Service';
            unitPrice = Number(service.basePrice || 0);
            sellerId = service.sellerId;
        }

        const cart = await getOrCreateActiveCart(orgId(req), userId(req));
        if (cart.status !== 'ACTIVE') {
            throw new ApiError(409, 'Active cart is locked. Submit or reset to add items.', 'CART_LOCKED');
        }

        // Check if same product/service already in cart — bump quantity
        const existing = await prisma.cartItem.findFirst({
            where: {
                cartId: cart.id,
                ...(body.productId ? { productId: body.productId } : { serviceId: body.serviceId })
            }
        });

        let item;
        if (existing) {
            item = await prisma.cartItem.update({
                where: { id: existing.id },
                data: { quantity: Number(existing.quantity) + body.quantity, technicalApproved: null, technicalNote: null }
            });
        } else {
            item = await prisma.cartItem.create({
                data: {
                    cartId: cart.id,
                    productId: body.productId,
                    serviceId: body.serviceId,
                    sellerId,
                    itemName,
                    quantity: body.quantity,
                    unitOfMeasure,
                    unitPrice
                }
            });
        }

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'cart.item.added',
            entityType: 'cartItem',
            entityId: item.id,
            ipAddress: req.ip,
            metadata: { cartId: cart.id, productId: body.productId, serviceId: body.serviceId, quantity: body.quantity }
        });

        const refreshed = await prisma.cart.findUnique({ where: { id: cart.id }, include: cartIncludes });
        ok(res, refreshed, 201);
    })
);

// ─── PUT /api/cart/items/:id — update quantity ───────────────────────────────

router.put(
    '/cart/items/:id',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'PROCUREMENT_OFFICER', 'FINANCE_OFFICER', 'TECHNICAL_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const body = updateItemSchema.parse(req.body);

        const item = await prisma.cartItem.findUnique({
            where: { id },
            include: { cart: true }
        });
        if (!item || item.cart.organizationId !== orgId(req)) {
            throw new ApiError(404, 'Cart item not found', 'CART_ITEM_NOT_FOUND');
        }
        if (item.cart.status !== 'ACTIVE') {
            throw new ApiError(409, 'Cart is locked', 'CART_LOCKED');
        }

        const updated = await prisma.cartItem.update({
            where: { id },
            data: { quantity: body.quantity, technicalApproved: null, technicalNote: null }
        });

        ok(res, updated);
    })
);

// ─── DELETE /api/cart/items/:id — remove item ────────────────────────────────

router.delete(
    '/cart/items/:id',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'PROCUREMENT_OFFICER', 'FINANCE_OFFICER', 'TECHNICAL_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);

        const item = await prisma.cartItem.findUnique({
            where: { id },
            include: { cart: true }
        });
        if (!item || item.cart.organizationId !== orgId(req)) {
            throw new ApiError(404, 'Cart item not found', 'CART_ITEM_NOT_FOUND');
        }
        if (item.cart.status !== 'ACTIVE') {
            throw new ApiError(409, 'Cart is locked', 'CART_LOCKED');
        }

        await prisma.cartItem.delete({ where: { id } });
        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'cart.item.removed',
            entityType: 'cartItem',
            entityId: id,
            ipAddress: req.ip,
            metadata: { cartId: item.cartId }
        });

        ok(res, { success: true });
    })
);

// ─── POST /api/cart/submit — submit for finance approval ─────────────────────

router.post(
    '/cart/submit',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'PROCUREMENT_OFFICER', 'FINANCE_OFFICER', 'TECHNICAL_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const body = submitCartSchema.parse(req.body);

        const cart = await prisma.cart.findFirst({
            where: { organizationId: orgId(req), status: 'ACTIVE' },
            include: { items: true }
        });
        if (!cart) throw new ApiError(404, 'No active cart to submit', 'CART_NOT_FOUND');
        if (cart.items.length === 0) throw new ApiError(400, 'Cart is empty', 'CART_EMPTY');

        const updated = await prisma.cart.update({
            where: { id: cart.id },
            data: { status: 'SUBMITTED_FOR_APPROVAL', notes: body.notes }
        });

        // Notify finance officers in this org
        try {
            const financeOfficers = await prisma.orgMembership.findMany({
                where: {
                    organizationId: orgId(req),
                    isActive: true,
                    orgRole: { in: ['FINANCE_OFFICER', 'ORG_ADMIN'] }
                },
                select: { userId: true }
            });
            const totalValue = cart.items.reduce(
                (sum, it) => sum + Number(it.quantity) * Number(it.unitPrice),
                0
            );
            await Promise.allSettled(
                financeOfficers.map(fo => notificationService.notify(fo.userId, {
                    title: 'Cart pending approval',
                    message: `A cart with ${cart.items.length} items (total ₹${totalValue.toLocaleString('en-IN')}) is awaiting your approval.`,
                    type: 'cart_pending_approval',
                    priority: 'high',
                    redirectUrl: '/cart/approvals'
                }))
            );
        } catch { /* non-fatal */ }

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'cart.submitted',
            entityType: 'cart',
            entityId: cart.id,
            ipAddress: req.ip,
            metadata: { itemCount: cart.items.length }
        });

        ok(res, updated);
    })
);

// ─── GET /api/cart/pending-approval — finance queue ──────────────────────────

router.get(
    '/cart/pending-approval',
    authenticate,
    authorize('buyer', 'seller'),
    requireOrgRole('ORG_ADMIN', 'FINANCE_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const carts = await prisma.cart.findMany({
            where: { organizationId: orgId(req), status: 'SUBMITTED_FOR_APPROVAL' },
            include: cartIncludes,
            orderBy: { updatedAt: 'desc' }
        });
        ok(res, carts);
    })
);

// ─── POST /api/cart/:id/approve — finance approves ───────────────────────────

router.post(
    '/cart/:id/approve',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'FINANCE_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);

        const cart = await prisma.cart.findFirst({
            where: { id, organizationId: orgId(req) },
            include: { items: true }
        });
        if (!cart) throw new ApiError(404, 'Cart not found', 'CART_NOT_FOUND');
        if (cart.status !== 'SUBMITTED_FOR_APPROVAL') {
            throw new ApiError(409, `Cart cannot be approved in current state (${cart.status})`, 'CART_INVALID_STATE');
        }

        // Check if all items have technical approval (when tech officers exist in the org)
        const techOfficers = await prisma.orgMembership.count({
            where: { organizationId: orgId(req), isActive: true, orgRole: 'TECHNICAL_OFFICER' }
        });
        if (techOfficers > 0) {
            const pending = cart.items.filter(it => it.technicalApproved !== true);
            if (pending.length > 0) {
                throw new ApiError(
                    409,
                    `${pending.length} item(s) still need technical approval before this cart can be approved.`,
                    'PENDING_TECH_APPROVAL'
                );
            }
        }

        const updated = await prisma.cart.update({
            where: { id },
            data: { status: 'APPROVED', approvedById: userId(req), approvedAt: new Date() }
        });

        // Notify the cart creator
        try {
            await notificationService.notify(cart.createdById, {
                title: 'Cart approved',
                message: 'Your cart has been approved by Finance and is ready to be converted to a Purchase Order.',
                type: 'cart_approved',
                priority: 'medium',
                redirectUrl: `/cart?id=${id}`
            });
        } catch { /* non-fatal */ }

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'cart.approved',
            entityType: 'cart',
            entityId: id,
            ipAddress: req.ip
        });

        ok(res, updated);
    })
);

// ─── POST /api/cart/:id/reject — finance rejects ─────────────────────────────

router.post(
    '/cart/:id/reject',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'FINANCE_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const { rejectionNote } = rejectCartSchema.parse(req.body);

        const cart = await prisma.cart.findFirst({
            where: { id, organizationId: orgId(req) }
        });
        if (!cart) throw new ApiError(404, 'Cart not found', 'CART_NOT_FOUND');
        if (cart.status !== 'SUBMITTED_FOR_APPROVAL') {
            throw new ApiError(409, `Cart cannot be rejected in current state (${cart.status})`, 'CART_INVALID_STATE');
        }

        const updated = await prisma.cart.update({
            where: { id },
            data: {
                status: 'REJECTED',
                rejectedById: userId(req),
                rejectedAt: new Date(),
                rejectionNote
            }
        });

        try {
            await notificationService.notify(cart.createdById, {
                title: 'Cart rejected',
                message: `Your cart was rejected by Finance. Reason: ${rejectionNote}`,
                type: 'cart_rejected',
                priority: 'high',
                redirectUrl: '/cart'
            });
        } catch { /* non-fatal */ }

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'cart.rejected',
            entityType: 'cart',
            entityId: id,
            ipAddress: req.ip,
            metadata: { rejectionNote }
        });

        ok(res, updated);
    })
);

// ─── GET /api/cart/pending-tech-review — tech officer queue ──────────────────

router.get(
    '/cart/pending-tech-review',
    authenticate,
    authorize('buyer', 'seller'),
    requireOrgRole('ORG_ADMIN', 'TECHNICAL_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const items = await prisma.cartItem.findMany({
            where: {
                cart: { organizationId: orgId(req), status: 'SUBMITTED_FOR_APPROVAL' },
                technicalApproved: null
            },
            include: {
                cart: {
                    select: {
                        id: true, notes: true, createdAt: true,
                        createdBy: { select: { id: true, name: true, email: true } }
                    }
                },
                product: { select: { id: true, name: true, hsnCode: true, unitOfMeasure: true, description: true } },
                service: { select: { id: true, name: true, description: true } },
                seller: { select: { id: true, name: true, email: true } }
            },
            orderBy: { createdAt: 'asc' }
        });
        ok(res, items);
    })
);

// ─── POST /api/cart/items/:id/tech-approve ───────────────────────────────────

router.post(
    '/cart/items/:id/tech-approve',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'TECHNICAL_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const body = techDecisionSchema.parse(req.body);

        const item = await prisma.cartItem.findUnique({
            where: { id },
            include: { cart: true }
        });
        if (!item || item.cart.organizationId !== orgId(req)) {
            throw new ApiError(404, 'Cart item not found', 'CART_ITEM_NOT_FOUND');
        }
        if (item.cart.status !== 'SUBMITTED_FOR_APPROVAL') {
            throw new ApiError(409, 'Item not pending technical review', 'NOT_PENDING_REVIEW');
        }

        const updated = await prisma.cartItem.update({
            where: { id },
            data: {
                technicalApproved: true,
                technicalApprovedById: userId(req),
                technicalNote: body.note,
                technicalDecidedAt: new Date()
            }
        });

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'cart.item.tech_approved',
            entityType: 'cartItem',
            entityId: id,
            ipAddress: req.ip
        });

        ok(res, updated);
    })
);

// ─── POST /api/cart/items/:id/tech-reject ────────────────────────────────────

router.post(
    '/cart/items/:id/tech-reject',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'TECHNICAL_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const body = z.object({ note: z.string().trim().min(5).max(1000) }).parse(req.body);

        const item = await prisma.cartItem.findUnique({
            where: { id },
            include: { cart: true }
        });
        if (!item || item.cart.organizationId !== orgId(req)) {
            throw new ApiError(404, 'Cart item not found', 'CART_ITEM_NOT_FOUND');
        }
        if (item.cart.status !== 'SUBMITTED_FOR_APPROVAL') {
            throw new ApiError(409, 'Item not pending technical review', 'NOT_PENDING_REVIEW');
        }

        const updated = await prisma.cartItem.update({
            where: { id },
            data: {
                technicalApproved: false,
                technicalApprovedById: userId(req),
                technicalNote: body.note,
                technicalDecidedAt: new Date()
            }
        });

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'cart.item.tech_rejected',
            entityType: 'cartItem',
            entityId: id,
            ipAddress: req.ip,
            metadata: { note: body.note }
        });

        ok(res, updated);
    })
);

// ─── GET /api/cart/history — past carts (any status) ─────────────────────────

router.get(
    '/cart/history',
    authenticate,
    authorize('buyer', 'seller'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const carts = await prisma.cart.findMany({
            where: { organizationId: orgId(req), status: { not: 'ACTIVE' } },
            include: cartIncludes,
            orderBy: { updatedAt: 'desc' },
            take: 50
        });
        ok(res, carts);
    })
);

// ─── GET /api/cart/:id — cart detail ─────────────────────────────────────────

router.get(
    '/cart/:id',
    authenticate,
    authorize('buyer', 'seller'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);
        const cart = await prisma.cart.findFirst({
            where: { id, organizationId: orgId(req) },
            include: cartIncludes
        });
        if (!cart) throw new ApiError(404, 'Cart not found', 'CART_NOT_FOUND');
        ok(res, cart);
    })
);

// ─── POST /api/cart/:id/start-approval-chain ─────────────────────────────────
// After a cart is APPROVED by Finance, Procurement Officer can start the
// multi-level approval chain to convert it to a Purchase Order.

router.post(
    '/cart/:id/start-approval-chain',
    authenticate,
    authorize('buyer', 'seller'),
    requireApprovedOrg,
    requireOrgRole('ORG_ADMIN', 'PROCUREMENT_OFFICER'),
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const id = Number(req.params.id);

        const cart = await prisma.cart.findFirst({
            where: { id, organizationId: orgId(req) },
            include: { items: true }
        });
        if (!cart) throw new ApiError(404, 'Cart not found', 'CART_NOT_FOUND');
        if (cart.status !== 'APPROVED') {
            throw new ApiError(
                409,
                'Cart must be approved by Finance before starting the procurement approval chain.',
                'CART_NOT_APPROVED'
            );
        }

        const total = cart.items.reduce(
            (s, it) => s + Number(it.quantity) * Number(it.unitPrice),
            0
        );

        const { createApprovalChain } = await import('../services/approval-chain.service.js');
        const chain = await createApprovalChain({
            entityType: 'cart',
            entityId: cart.id,
            organizationId: orgId(req),
            totalValue: total,
            initiatorUserId: userId(req)
        });

        await auditLog({
            actorUserId: userId(req),
            actorRole: req.user!.role,
            action: 'cart.approval_chain_started',
            entityType: 'cart',
            entityId: cart.id,
            ipAddress: req.ip,
            metadata: { totalValue: total }
        });

        ok(res, chain, 201);
    })
);

export default router;
