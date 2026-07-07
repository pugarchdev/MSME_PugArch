import { Router, type Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { authenticate } from '../middleware/auth.js';
import { ApiError } from '../utils/ApiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import type { AuthRequest } from '../middleware/authenticate.js';
import { createApprovalChain } from '../services/approval-chain.service.js';
import { numberSeries } from '../services/workflow/workflow-common.js';
import { featureFlags } from '../config/feature-flags.js';
import { normalizeCanonicalMethod } from '../utils/procurement-methods.js';

const router = Router();

// Gated behind authenticate middleware
router.use('/direct-purchases', authenticate);

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

const ensureOrg = (req: AuthRequest) => {
    if (!req.user?.organizationId) {
        throw new ApiError(400, 'You must belong to an organisation to make direct purchases.', 'ORG_REQUIRED');
    }
};

// ─── Zod Schemas ─────────────────────────────────────────────────────────────

const checkoutSchema = z.object({
    deliveryAddressId: z.number().int().positive().optional().nullable(),
    deliveryAddressText: z.string().trim().max(1000).optional().nullable(),
    department: z.string().trim().min(1, 'Department is required').max(100),
    budgetHead: z.string().trim().min(1, 'Budget head is required').max(100),
    costCenter: z.string().trim().min(1, 'Cost center is required').max(100),
    justification: z.string().trim().min(1, 'Justification is required').max(1000),
    remarks: z.string().trim().max(1000).optional().nullable(),
    deliveryInstructions: z.string().trim().max(1000).optional().nullable(),
    requiredDeliveryDate: z.string().trim().optional().nullable()
});

// ─── Routes ──────────────────────────────────────────────────────────────────

// 1. GET /api/direct-purchases
router.get(
    '/direct-purchases',
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const orgId = req.user!.organizationId!;

        const directPurchases = await prisma.directPurchase.findMany({
            where: {
                buyer: {
                    organizationId: orgId
                }
            },
            include: {
                buyer: {
                    select: { id: true, name: true, email: true }
                },
                seller: {
                    select: { id: true, name: true, email: true }
                },
                deliveryAddress: true,
                requirement: {
                    include: {
                        items: true
                    }
                }
            },
            orderBy: { createdAt: 'desc' }
        });

        return ok(res, directPurchases);
    })
);

// 2. GET /api/direct-purchases/:id
router.get(
    '/direct-purchases/:id',
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const orgId = req.user!.organizationId!;
        const dpId = parseInt(req.params.id, 10);

        if (isNaN(dpId)) {
            throw new ApiError(400, 'Invalid direct purchase ID');
        }

        const directPurchase = await prisma.directPurchase.findFirst({
            where: {
                id: dpId,
                buyer: {
                    organizationId: orgId
                }
            },
            include: {
                buyer: {
                    select: { id: true, name: true, email: true }
                },
                seller: {
                    select: { id: true, name: true, email: true }
                },
                deliveryAddress: true,
                requirement: {
                    include: {
                        items: true
                    }
                }
            }
        });

        if (!directPurchase) {
            throw new ApiError(404, 'Direct purchase request not found');
        }

        return ok(res, directPurchase);
    })
);

// 3. POST /api/direct-purchases/checkout
// @deprecated Use POST /api/v1/procurement-checkout/init instead. Gated by legacy_direct_purchase_checkout flag.
router.post(
    '/direct-purchases/checkout',
    asyncRoute(async (req, res) => {
        if (!featureFlags.legacy_direct_purchase_checkout) {
            throw new ApiError(
                410,
                'Legacy direct-purchase checkout is deprecated. Use Marketplace → Cart → Procurement Checkout (/buyer/procurement/checkout).',
                'LEGACY_CHECKOUT_DISABLED'
            );
        }
        ensureOrg(req);
        const orgId = req.user!.organizationId!;
        const buyerId = req.user!.id;

        const body = checkoutSchema.parse(req.body);

        // Fetch active cart and items
        const cart = await prisma.cart.findFirst({
            where: { organizationId: orgId, status: 'ACTIVE' },
            include: {
                items: true
            }
        });

        if (!cart || cart.items.length === 0) {
            throw new ApiError(400, 'Your active cart is empty.', 'CART_EMPTY');
        }

        // Fetch user organization membership to determine role-based approvals
        const membership = await prisma.orgMembership.findUnique({
            where: { userId_organizationId: { userId: buyerId, organizationId: orgId } }
        });

        const orgRole = membership?.orgRole;
        const isAutoApprove = req.user!.role === 'admin' || orgRole === 'ORG_ADMIN' || orgRole === 'PROCUREMENT_OFFICER';

        // Group items by sellerId
        const itemsBySeller: Record<number, typeof cart.items> = {};
        for (const item of cart.items) {
            if (!itemsBySeller[item.sellerId]) {
                itemsBySeller[item.sellerId] = [];
            }
            itemsBySeller[item.sellerId].push(item);
        }

        const createdDirectPurchases: any[] = [];

        // Run validation and creation in a transaction
        await prisma.$transaction(async (tx) => {
            for (const [sellerIdStr, items] of Object.entries(itemsBySeller)) {
                const sellerId = parseInt(sellerIdStr, 10);
                let totalAmount = 0;
                const requirementItemsData: any[] = [];

                // Validate each listing's price and tax rate against backend catalog
                for (const item of items) {
                    let unitPrice = 0;
                    let taxRate = 0;
                    let description = '';
                    let specifications: any = null;
                    let itemName = item.itemName;
                    let unitOfMeasure = item.unitOfMeasure;

                    if (item.productId) {
                        const product = await tx.product.findUnique({
                            where: { id: item.productId },
                            include: { specifications: true }
                        });
                        if (!product || product.status !== 'ACTIVE') {
                            throw new ApiError(400, `Product ${item.itemName} is not active or available in the catalog.`, 'PRODUCT_UNAVAILABLE');
                        }
                        unitPrice = Number(product.discountPrice || product.price || 0);
                        taxRate = Number(product.taxRate || 0);
                        description = product.description || '';
                        specifications = product.specifications.map(s => ({ name: s.name, value: s.value, unit: s.unit }));
                        itemName = product.name;
                        unitOfMeasure = product.unitOfMeasure || 'units';
                    } else if (item.serviceId) {
                        const service = await tx.service.findUnique({
                            where: { id: item.serviceId }
                        });
                        if (!service || service.status !== 'ACTIVE') {
                            throw new ApiError(400, `Service ${item.itemName} is not active or available in the catalog.`, 'SERVICE_UNAVAILABLE');
                        }
                        unitPrice = Number(service.discountPrice || service.basePrice || 0);
                        taxRate = Number(service.taxRate || 0);
                        description = service.description || '';
                        itemName = service.name;
                        unitOfMeasure = 'service';
                    } else {
                        throw new ApiError(400, 'Cart item must point to a product or service.', 'ITEM_INVALID');
                    }

                    const qty = Number(item.quantity);
                    const itemTotalExclTax = qty * unitPrice;
                    const itemTaxAmount = itemTotalExclTax * (taxRate / 100);
                    totalAmount += (itemTotalExclTax + itemTaxAmount);

                    requirementItemsData.push({
                        productId: item.productId,
                        itemName,
                        description,
                        quantity: item.quantity,
                        unitOfMeasure,
                        estimatedUnitPrice: unitPrice,
                        specifications: specifications ? specifications : undefined
                    });
                }

                // 1. Create requirement
                const requirement = await tx.requirement.create({
                    data: {
                        requirementNumber: numberSeries('REQ'),
                        buyerId,
                        organizationId: orgId,
                        title: `Direct Purchase Requirement for Seller #${sellerId}`,
                        description: `Requirement automatically created for direct purchase checkout.`,
                        procurementMethod: 'DIRECT_PURCHASE',
                        canonicalMethod: normalizeCanonicalMethod('DIRECT_PURCHASE'),
                        status: isAutoApprove ? 'APPROVED' : 'SUBMITTED',
                        estimatedValue: totalAmount,
                        items: {
                            create: requirementItemsData.map(item => ({
                                productId: item.productId,
                                itemName: item.itemName,
                                description: item.description,
                                quantity: item.quantity,
                                unitOfMeasure: item.unitOfMeasure,
                                estimatedUnitPrice: item.estimatedUnitPrice,
                                specifications: item.specifications
                            }))
                        }
                    }
                });

                // Get delivery address text if deliveryAddressId is provided
                let deliveryAddressText = body.deliveryAddressText;
                if (body.deliveryAddressId) {
                    const address = await tx.deliveryAddress.findFirst({
                        where: { id: body.deliveryAddressId, organizationId: orgId, isActive: true }
                    });
                    if (address) {
                        deliveryAddressText = `${address.addressLabel}: ${address.addressLine1}, ${address.addressLine2 ? address.addressLine2 + ', ' : ''}${address.city}, ${address.district}, ${address.state} - ${address.pincode}. Contact: ${address.contactPersonName} (${address.mobileNumber})`;
                    }
                }

                // 2. Create direct purchase
                const directPurchase = await tx.directPurchase.create({
                    data: {
                        requirementId: requirement.id,
                        buyerId,
                        sellerId,
                        purchaseNumber: numberSeries('DP'),
                        status: isAutoApprove ? 'APPROVED' : 'PENDING_APPROVAL',
                        totalAmount,
                        deliveryAddressId: body.deliveryAddressId || null,
                        deliveryAddressText: deliveryAddressText || null,
                        department: body.department,
                        budgetHead: body.budgetHead,
                        costCenter: body.costCenter,
                        justification: body.justification,
                        remarks: body.remarks || null,
                        deliveryInstructions: body.deliveryInstructions || null,
                        requiredDeliveryDate: body.requiredDeliveryDate ? new Date(body.requiredDeliveryDate) : null,
                        approvalStatus: isAutoApprove ? 'SKIPPED' : 'PENDING_APPROVAL',
                        workflowStatus: isAutoApprove ? 'READY_TO_SEND_TO_SELLER' : 'PENDING_APPROVAL',
                        approvedAt: isAutoApprove ? new Date() : null
                    }
                });

                // 3. Launch approval chain if not auto-approved
                if (!isAutoApprove) {
                    await createApprovalChain({
                        entityType: 'direct_purchase',
                        entityId: directPurchase.id,
                        organizationId: orgId,
                        totalValue: totalAmount,
                        initiatorUserId: buyerId
                    });
                }

                createdDirectPurchases.push(directPurchase);
            }

            // 4. Update cart status to CONVERTED_TO_ORDER
            await tx.cart.update({
                where: { id: cart.id },
                data: {
                    status: 'CONVERTED_TO_ORDER',
                    convertedAt: new Date()
                }
            });
        }, { timeout: 30000 });

        return ok(res, createdDirectPurchases, 201);
    })
);

// 4. POST /api/direct-purchases/:id/send-to-seller
router.post(
    '/direct-purchases/:id/send-to-seller',
    asyncRoute(async (req, res) => {
        ensureOrg(req);
        const orgId = req.user!.organizationId!;
        const dpId = parseInt(req.params.id, 10);

        if (isNaN(dpId)) {
            throw new ApiError(400, 'Invalid direct purchase ID');
        }

        const directPurchase = await prisma.directPurchase.findFirst({
            where: {
                id: dpId,
                buyer: {
                    organizationId: orgId
                }
            }
        });

        if (!directPurchase) {
            throw new ApiError(404, 'Direct purchase request not found');
        }

        if (directPurchase.status !== 'APPROVED' || directPurchase.workflowStatus !== 'READY_TO_SEND_TO_SELLER') {
            throw new ApiError(400, 'Direct purchase must be approved before sending to the seller.', 'NOT_APPROVED');
        }

        const updated = await prisma.directPurchase.update({
            where: { id: dpId },
            data: {
                status: 'REQUESTED',
                workflowStatus: 'SENT_TO_SELLER'
            }
        });

        // Send notification to seller
        try {
            await prisma.notification.create({
                data: {
                    userId: directPurchase.sellerId,
                    title: 'New Direct Purchase Request',
                    message: `You have received a new Direct Purchase request (${directPurchase.purchaseNumber}).`,
                    type: 'direct_purchase_requested',
                    priority: 'high',
                    redirectUrl: '/seller/orders'
                }
            });
        } catch (err) {
            console.error('Failed to notify seller about direct purchase:', err);
        }

        return ok(res, updated);
    })
);

export default router;
export { router as directPurchaseRoutes };
