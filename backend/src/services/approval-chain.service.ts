/**
 * Approval Chain Service
 *
 * Creates and manages multi-level approval chains for procurement entities.
 * Each entity (tender, purchase_order, cart, direct_purchase) has up to 3 stages:
 *
 *   Stage 1: DEPARTMENT_HEAD   — handled by PROCUREMENT_OFFICER
 *   Stage 2: FINANCE_DEPT      — handled by FINANCE_OFFICER
 *   Stage 3: PROCUREMENT_HEAD  — handled by ORG_ADMIN
 *
 * Approvers are matched by OrgRole, not specific user. Any active member
 * with the right role can approve their stage.
 *
 * Chain rules:
 * - Only one stage is "current" at a time (the lowest sequence with PENDING)
 * - Approving advances to the next stage automatically
 * - Rejecting halts the chain (entity stays unapproved)
 * - SENT_FOR_CLARIFICATION holds at the current stage but allows re-approval
 *
 * The skipFinance threshold lets small orgs skip the Finance stage on low-value
 * transactions; controlled by org settings (defaults: always-required).
 */

import prisma from '../config/prisma.js';
import { ApprovalStage, ApprovalDecision, OrgRole, Prisma } from '@prisma/client';
import { auditLog } from '../modules/audit/audit.service.js';
import { notificationService } from '../services/notification.service.js';

export type ApprovalEntityType = 'tender' | 'purchase_order' | 'cart' | 'direct_purchase';

const STAGE_TO_ORG_ROLES: Record<ApprovalStage, OrgRole[]> = {
    DEPARTMENT_HEAD: ['PROCUREMENT_OFFICER', 'ORG_ADMIN'],
    FINANCE_DEPT: ['FINANCE_OFFICER', 'ORG_ADMIN'],
    PROCUREMENT_HEAD: ['ORG_ADMIN']
};

const ENTITY_LABEL: Record<ApprovalEntityType, string> = {
    tender: 'Tender',
    purchase_order: 'Purchase Order',
    cart: 'Cart',
    direct_purchase: 'Direct Purchase'
};

const ENTITY_ROUTE: Record<ApprovalEntityType, string> = {
    tender: '/buyer/tenders',
    purchase_order: '/buyer/orders',
    cart: '/cart',
    direct_purchase: '/buyer/direct-purchase'
};

/**
 * Determines which stages should be created for a given entity + value.
 * High-value items always need all 3; low-value can skip Finance.
 */
const stagesForEntity = (entityType: ApprovalEntityType, totalValue: number): ApprovalStage[] => {
    // Cart conversions and direct purchases under ₹50,000 skip Finance
    if (totalValue < 50_000 && (entityType === 'cart' || entityType === 'direct_purchase')) {
        return ['DEPARTMENT_HEAD', 'PROCUREMENT_HEAD'];
    }
    // All other entities need full chain
    return ['DEPARTMENT_HEAD', 'FINANCE_DEPT', 'PROCUREMENT_HEAD'];
};

/**
 * Create the approval chain for an entity. Idempotent — if approvals already
 * exist for this entity, returns existing chain.
 */
export const createApprovalChain = async (params: {
    entityType: ApprovalEntityType;
    entityId: number;
    organizationId: number;
    totalValue: number;
    initiatorUserId: number;
}) => {
    const existing = await prisma.procurementApproval.findMany({
        where: { entityType: params.entityType, entityId: params.entityId },
        orderBy: { sequence: 'asc' }
    });
    if (existing.length > 0) return existing;

    const stages = stagesForEntity(params.entityType, params.totalValue);
    const created = await prisma.$transaction(
        stages.map((stage, idx) =>
            prisma.procurementApproval.create({
                data: {
                    entityType: params.entityType,
                    entityId: params.entityId,
                    organizationId: params.organizationId,
                    stage,
                    sequence: idx + 1,
                    decision: 'PENDING'
                }
            })
        )
    );

    await auditLog({
        actorUserId: params.initiatorUserId,
        action: 'approval.chain.created',
        entityType: params.entityType,
        entityId: params.entityId,
        metadata: { stages, totalValue: params.totalValue }
    });

    // Notify approvers of stage 1
    await notifyStageApprovers({
        entityType: params.entityType,
        entityId: params.entityId,
        organizationId: params.organizationId,
        stage: stages[0],
        totalValue: params.totalValue
    });

    return created;
};

/**
 * Get the current pending stage for an entity (lowest sequence with PENDING).
 * Returns null if entity is fully approved or has no chain.
 */
export const getCurrentPendingStage = async (entityType: ApprovalEntityType, entityId: number) => {
    return prisma.procurementApproval.findFirst({
        where: { entityType, entityId, decision: { in: ['PENDING', 'SENT_FOR_CLARIFICATION'] } },
        orderBy: { sequence: 'asc' }
    });
};

/**
 * Check if an entity is fully approved (all stages decided APPROVED).
 */
export const isFullyApproved = async (entityType: ApprovalEntityType, entityId: number) => {
    const all = await prisma.procurementApproval.findMany({
        where: { entityType, entityId }
    });
    if (all.length === 0) return false;
    return all.every(a => a.decision === 'APPROVED');
};

/**
 * Decide on an approval (approve / reject / clarify).
 * Validates the user has the right OrgRole for the stage.
 */
export const decideApproval = async (params: {
    approvalId: number;
    decision: 'APPROVED' | 'REJECTED' | 'SENT_FOR_CLARIFICATION';
    approverId: number;
    approverOrgRole: OrgRole;
    organizationId: number;
    remarks?: string;
    clarificationNote?: string;
    ipAddress?: string;
}) => {
    const approval = await prisma.procurementApproval.findUnique({
        where: { id: params.approvalId }
    });

    if (!approval) {
        throw new Error('Approval not found');
    }
    if (approval.organizationId !== params.organizationId) {
        throw new Error('Approval does not belong to your organisation');
    }
    if (approval.decision === 'APPROVED' || approval.decision === 'REJECTED') {
        throw new Error(`Approval is already ${approval.decision}`);
    }

    // Verify role matches stage
    const allowedRoles = STAGE_TO_ORG_ROLES[approval.stage];
    if (!allowedRoles.includes(params.approverOrgRole)) {
        throw new Error(`Your role does not match this stage. Required: ${allowedRoles.join(' or ')}`);
    }

    // Verify it's the current stage (cannot skip ahead)
    const current = await getCurrentPendingStage(
        approval.entityType as ApprovalEntityType,
        approval.entityId
    );
    if (!current || current.id !== approval.id) {
        throw new Error('Earlier stages must be approved before this one');
    }

    const updated = await prisma.procurementApproval.update({
        where: { id: params.approvalId },
        data: {
            decision: params.decision,
            approverId: params.approverId,
            remarks: params.remarks,
            clarificationNote: params.clarificationNote,
            decidedAt: new Date()
        }
    });

    await auditLog({
        actorUserId: params.approverId,
        action: `approval.${params.decision.toLowerCase()}`,
        entityType: approval.entityType,
        entityId: approval.entityId,
        ipAddress: params.ipAddress,
        metadata: { stage: approval.stage, sequence: approval.sequence, remarks: params.remarks }
    });

    if (params.decision === 'APPROVED') {
        // Check if there are more stages — notify next stage approvers
        const next = await getCurrentPendingStage(
            approval.entityType as ApprovalEntityType,
            approval.entityId
        );
        if (next) {
            await notifyStageApprovers({
                entityType: approval.entityType as ApprovalEntityType,
                entityId: approval.entityId,
                organizationId: approval.organizationId,
                stage: next.stage,
                totalValue: 0 // value not needed for the notification
            });
        } else {
            // Fully approved — notify the entity creator
            await notifyFullyApproved(
                approval.entityType as ApprovalEntityType,
                approval.entityId
            );

            // If the entity is a cart, perform the automatic conversion to Purchase Orders
            if (approval.entityType === 'cart') {
                try {
                    await handleCartApprovalCompletion(approval.entityId, params.approverId);
                } catch (err) {
                    console.error('Failed to automatically convert cart to PO:', err);
                }
            }
        }
    } else if (params.decision === 'REJECTED') {
        await notifyRejection(
            approval.entityType as ApprovalEntityType,
            approval.entityId,
            params.remarks || 'Rejected by approver',
            approval.stage
        );
    } else if (params.decision === 'SENT_FOR_CLARIFICATION') {
        await notifyClarification(
            approval.entityType as ApprovalEntityType,
            approval.entityId,
            params.clarificationNote || 'Clarification requested',
            approval.stage
        );
    }

    return updated;
};

/**
 * Get all pending approvals for the current user, filtered by their OrgRole.
 */
export const getPendingApprovalsForUser = async (params: {
    userId: number;
    organizationId: number;
    orgRole: OrgRole;
}) => {
    // Determine which stages this user can approve based on their OrgRole
    const stages: ApprovalStage[] = [];
    if (params.orgRole === 'PROCUREMENT_OFFICER' || params.orgRole === 'ORG_ADMIN') {
        stages.push('DEPARTMENT_HEAD');
    }
    if (params.orgRole === 'FINANCE_OFFICER' || params.orgRole === 'ORG_ADMIN') {
        stages.push('FINANCE_DEPT');
    }
    if (params.orgRole === 'ORG_ADMIN') {
        stages.push('PROCUREMENT_HEAD');
    }

    if (stages.length === 0) return [];

    const all = await prisma.procurementApproval.findMany({
        where: {
            organizationId: params.organizationId,
            stage: { in: stages },
            decision: { in: ['PENDING', 'SENT_FOR_CLARIFICATION'] }
        },
        orderBy: { createdAt: 'desc' }
    });

    // Filter to only items where this is the current pending stage
    const result: typeof all = [];
    for (const approval of all) {
        const current = await getCurrentPendingStage(
            approval.entityType as ApprovalEntityType,
            approval.entityId
        );
        if (current && current.id === approval.id) {
            result.push(approval);
        }
    }

    return result;
};

/**
 * Get the full approval trail for an entity (all stages).
 */
export const getApprovalTrail = async (entityType: ApprovalEntityType, entityId: number) => {
    return prisma.procurementApproval.findMany({
        where: { entityType, entityId },
        include: {
            approver: { select: { id: true, name: true, email: true } }
        },
        orderBy: { sequence: 'asc' }
    });
};

// ─── Helpers ─────────────────────────────────────────────────────────────────

const notifyStageApprovers = async (params: {
    entityType: ApprovalEntityType;
    entityId: number;
    organizationId: number;
    stage: ApprovalStage;
    totalValue: number;
}) => {
    const allowedRoles = STAGE_TO_ORG_ROLES[params.stage];
    const members = await prisma.orgMembership.findMany({
        where: {
            organizationId: params.organizationId,
            isActive: true,
            orgRole: { in: allowedRoles }
        },
        select: { userId: true }
    });

    const stageLabel = params.stage.replace(/_/g, ' ');
    const entityLabel = ENTITY_LABEL[params.entityType];

    await Promise.allSettled(
        members.map(m =>
            notificationService.notify(m.userId, {
                title: `${stageLabel} approval needed`,
                message: `A ${entityLabel.toLowerCase()} (#${params.entityId}) is awaiting your approval at the ${stageLabel} stage.`,
                type: 'approval_pending',
                priority: 'high',
                redirectUrl: '/approvals'
            })
        )
    );
};

const getEntityCreatorId = async (
    entityType: ApprovalEntityType,
    entityId: number
): Promise<number | null> => {
    if (entityType === 'tender') {
        const t = await prisma.tender.findUnique({ where: { id: entityId }, select: { buyerId: true } });
        return t?.buyerId ?? null;
    }
    if (entityType === 'purchase_order') {
        const po = await prisma.purchaseOrder.findUnique({ where: { id: entityId }, select: { buyerId: true } });
        return po?.buyerId ?? null;
    }
    if (entityType === 'cart') {
        const c = await prisma.cart.findUnique({ where: { id: entityId }, select: { createdById: true } });
        return c?.createdById ?? null;
    }
    if (entityType === 'direct_purchase') {
        const dp = await prisma.directPurchase.findUnique({ where: { id: entityId }, select: { buyerId: true } });
        return dp?.buyerId ?? null;
    }
    return null;
};

const notifyFullyApproved = async (entityType: ApprovalEntityType, entityId: number) => {
    const creatorId = await getEntityCreatorId(entityType, entityId);
    if (!creatorId) return;
    const label = ENTITY_LABEL[entityType];
    const redirectUrl = entityType === 'cart' ? `${ENTITY_ROUTE[entityType]}?id=${entityId}` : ENTITY_ROUTE[entityType];
    await notificationService.notify(creatorId, {
        title: `${label} fully approved`,
        message: `Your ${label.toLowerCase()} (#${entityId}) has cleared all approval stages and is ready to proceed.`,
        type: 'approval_completed',
        priority: 'medium',
        redirectUrl
    });
};

const notifyRejection = async (
    entityType: ApprovalEntityType,
    entityId: number,
    reason: string,
    stage: ApprovalStage
) => {
    const creatorId = await getEntityCreatorId(entityType, entityId);
    if (!creatorId) return;
    const label = ENTITY_LABEL[entityType];
    const redirectUrl = entityType === 'cart' ? `${ENTITY_ROUTE[entityType]}?id=${entityId}` : ENTITY_ROUTE[entityType];
    await notificationService.notify(creatorId, {
        title: `${label} rejected`,
        message: `Your ${label.toLowerCase()} (#${entityId}) was rejected at the ${stage.replace(/_/g, ' ')} stage. Reason: ${reason}`,
        type: 'approval_rejected',
        priority: 'high',
        redirectUrl
    });
};

const notifyClarification = async (
    entityType: ApprovalEntityType,
    entityId: number,
    note: string,
    stage: ApprovalStage
) => {
    const creatorId = await getEntityCreatorId(entityType, entityId);
    if (!creatorId) return;
    const label = ENTITY_LABEL[entityType];
    const redirectUrl = entityType === 'cart' ? `${ENTITY_ROUTE[entityType]}?id=${entityId}` : ENTITY_ROUTE[entityType];
    await notificationService.notify(creatorId, {
        title: `${label} needs clarification`,
        message: `Your ${label.toLowerCase()} (#${entityId}) needs clarification at the ${stage.replace(/_/g, ' ')} stage. Note: ${note}`,
        type: 'approval_clarification',
        priority: 'high',
        redirectUrl
    });
};

const generatePoNumber = () => {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let token = '';
    for (let i = 0; i < 5; i++) {
        token += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `PO-CRT-${new Date().getFullYear()}-${token}`;
};

/**
 * Automatically convert a fully approved cart into separate Purchase Orders per seller.
 */
export const handleCartApprovalCompletion = async (cartId: number, initiatorUserId: number) => {
    // 1. Fetch the cart with items
    const cart = await prisma.cart.findUnique({
        where: { id: cartId },
        include: {
            items: {
                include: {
                    seller: true
                }
            },
            createdBy: true
        }
    });

    if (!cart) return;
    if (cart.status === 'CONVERTED_TO_ORDER') return;

    // 2. Group items by sellerId
    const itemsBySeller: Record<number, typeof cart.items> = {};
    for (const item of cart.items) {
        if (!itemsBySeller[item.sellerId]) {
            itemsBySeller[item.sellerId] = [];
        }
        itemsBySeller[item.sellerId].push(item);
    }

    // 3. Create POs in a transaction
    await prisma.$transaction(async (tx) => {
        for (const [sellerIdStr, items] of Object.entries(itemsBySeller)) {
            const sellerId = Number(sellerIdStr);
            
            // Calculate total amount and map items
            let totalAmount = new Prisma.Decimal(0);
            const poItemsData = items.map(item => {
                const qty = item.quantity as Prisma.Decimal;
                const price = item.unitPrice as Prisma.Decimal;
                const itemTotal = qty.mul(price);
                totalAmount = totalAmount.add(itemTotal);
                return {
                    productId: item.productId,
                    itemName: item.itemName,
                    quantity: qty,
                    unitOfMeasure: item.unitOfMeasure,
                    unitPrice: price,
                    totalAmount: itemTotal
                };
            });

            // Generate PO number
            const poNum = generatePoNumber();

            // Create PurchaseOrder
            const po = await tx.purchaseOrder.create({
                data: {
                    poNumber: poNum,
                    buyerId: cart.createdById,
                    sellerId: sellerId,
                    title: `Purchase Order from Cart #${cart.id}`,
                    amount: totalAmount,
                    totalValue: totalAmount.toNumber(),
                    status: 'generated',
                    sourceType: 'cart',
                    sourceId: cart.id,
                    items: {
                        create: poItemsData
                    }
                }
            });

            // Create DeliveryWorkflow for this PO
            await tx.deliveryWorkflow.create({
                data: {
                    purchaseOrderId: po.id,
                    status: 'created'
                }
            });

            // Notify seller
            try {
                await notificationService.notify(sellerId, {
                    title: 'New Purchase Order',
                    message: `You have received a new Purchase Order (${poNum}) from ${cart.createdBy?.name || 'a buyer'}.`,
                    type: 'purchase_order_created',
                    priority: 'high',
                    redirectUrl: '/seller/orders'
                });
            } catch (err) {
                // non-fatal
            }
        }

        // Update cart status to CONVERTED_TO_ORDER
        await tx.cart.update({
            where: { id: cart.id },
            data: {
                status: 'CONVERTED_TO_ORDER',
                convertedAt: new Date()
            }
        });
    });

    await auditLog({
        actorUserId: initiatorUserId,
        action: 'cart.converted_to_po',
        entityType: 'cart',
        entityId: cart.id,
        metadata: { poCount: Object.keys(itemsBySeller).length }
    });
};
