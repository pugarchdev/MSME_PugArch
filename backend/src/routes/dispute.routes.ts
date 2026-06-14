import { Router, type Response } from 'express';
import { z } from 'zod';
import prisma from '../config/prisma.js';
import { authenticate, authorize, authorizeAdmin } from '../middleware/auth.js';
import type { AuthRequest } from '../middleware/authenticate.js';
import { requireOrgPermission } from '../middleware/requireOrgPermission.js';
import { ApiError } from '../utils/ApiError.js';
import { apiResponse } from '../utils/apiResponse.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { notificationService } from '../services/notification.service.js';

const router = Router();
const db = prisma as any;

const CATEGORIES = [
  'PAYMENT_DELAY', 'PAYMENT_MISMATCH', 'QUALITY_ISSUE', 'QUANTITY_MISMATCH', 'DELIVERY_DELAY',
  'DAMAGED_GOODS', 'WRONG_ITEM', 'INVOICE_MISMATCH', 'GRN_REJECTION', 'ESCROW_RELEASE_ISSUE',
  'ORDER_CANCELLATION', 'OTHER'
] as const;
const PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'URGENT'] as const;
const STATUSES = ['OPEN', 'UNDER_REVIEW', 'CLARIFICATION_REQUESTED', 'RESPONDED', 'RESOLVED', 'REJECTED', 'CLOSED', 'ESCALATED'] as const;
const ENTITY_TYPES = ['PURCHASE_ORDER', 'INVOICE', 'PAYMENT_TRANSACTION', 'DELIVERY', 'GRN', 'ESCROW_ACCOUNT', 'REQUIREMENT_RESPONSE', 'TENDER', 'BID', 'REVERSE_AUCTION_AWARD', 'OTHER'] as const;

const createSchema = z.object({
  linkedEntityType: z.enum(ENTITY_TYPES).default('OTHER'),
  linkedEntityId: z.coerce.number().int().positive().optional(),
  purchaseOrderId: z.coerce.number().int().positive().optional(),
  invoiceId: z.coerce.number().int().positive().optional(),
  paymentTransactionId: z.coerce.number().int().positive().optional(),
  deliveryId: z.coerce.number().int().positive().optional(),
  grnId: z.coerce.number().int().positive().optional(),
  escrowAccountId: z.coerce.number().int().positive().optional(),
  requirementResponseId: z.coerce.number().int().positive().optional(),
  auctionId: z.coerce.number().int().positive().optional(),
  counterpartyId: z.coerce.number().int().positive().optional(),
  againstOrgId: z.coerce.number().int().positive().optional(),
  title: z.string().trim().min(4).max(180),
  description: z.string().trim().min(10).max(5000),
  category: z.enum(CATEGORIES).or(z.string().trim().min(2).max(80)),
  amountInDispute: z.coerce.number().nonnegative().optional(),
  priority: z.enum(PRIORITIES).default('MEDIUM'),
  evidenceFileIds: z.array(z.coerce.number().int().positive()).default([])
});

const messageSchema = z.object({
  message: z.string().trim().min(1).max(5000).optional(),
  content: z.string().trim().min(1).max(5000).optional(),
  internal: z.boolean().default(false),
  visibility: z.enum(['PUBLIC_TO_PARTIES', 'ADMIN_INTERNAL']).optional(),
  evidenceFileIds: z.array(z.coerce.number().int().positive()).default([])
}).refine(value => Boolean(value.message || value.content), { message: 'Message is required' });

const adminStatusSchema = z.object({
  status: z.enum(STATUSES),
  remarks: z.string().trim().max(5000).optional(),
  adminRemarks: z.string().trim().max(5000).optional()
});
const assignSchema = z.object({ assignedAdminId: z.coerce.number().int().positive().nullable().optional() });
const clarificationSchema = z.object({ message: z.string().trim().min(3).max(5000) });
const resolveSchema = z.object({ resolutionSummary: z.string().trim().min(3).max(5000), adminRemarks: z.string().trim().max(5000).optional() });

const asyncRoute = (handler: (req: AuthRequest, res: Response) => Promise<unknown>) =>
  async (req: AuthRequest, res: Response) => {
    try {
      await handler(req, res);
    } catch (err: any) {
      const status = err?.statusCode || 500;
      if (status >= 500) console.error('[dispute.routes]', err);
      return apiResponse.error(res, status, status < 500 ? err.message : 'Unable to complete dispute request', err?.code || 'DISPUTE_REQUEST_FAILED');
    }
  };

const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const userId = (req: AuthRequest) => req.user!.id;
const orgId = (req: AuthRequest) => req.user?.organizationId || null;
const isAdmin = (req: AuthRequest) => ['admin', 'master_admin'].includes(String(req.user?.role));
const normalizeStatus = (value?: string | null) => String(value || 'OPEN').toUpperCase();
const legacyStatus = (value?: string | null) => normalizeStatus(value).toLowerCase();

const disputeInclude = (admin: boolean) => ({
  buyer: { select: { id: true, name: true, email: true, role: true, organizationId: true } },
  seller: { select: { id: true, name: true, email: true, role: true, organizationId: true } },
  raisedBy: { select: { id: true, name: true, email: true, role: true, organizationId: true } },
  assignedAdmin: { select: { id: true, name: true, email: true } },
  raisedByOrg: { select: { id: true, organizationName: true } },
  againstOrg: { select: { id: true, organizationName: true } },
  buyerOrg: { select: { id: true, organizationName: true } },
  sellerOrg: { select: { id: true, organizationName: true } },
  evidence: true,
  attachments: true,
  messages: {
    where: admin ? undefined : { internal: false, visibility: { not: 'ADMIN_INTERNAL' } },
    include: {
      sender: { select: { id: true, name: true, email: true, role: true } },
      senderOrg: { select: { id: true, organizationName: true } }
    },
    orderBy: { createdAt: 'asc' }
  }
});

const toDto = (row: any) => ({
  ...row,
  disputeNo: row.disputeNo || `DSP-${row.id}`,
  status: legacyStatus(row.statusEnum || row.status),
  statusEnum: normalizeStatus(row.statusEnum || row.status),
  remarks: row.resolutionRemarks || row.resolutionSummary || row.adminRemarks,
  reason: row.reason || row.description || row.title,
  messages: (row.messages || []).map((message: any) => ({
    ...message,
    content: message.content || message.message,
    message: message.message || message.content
  }))
});

const orgUserWhere = (organizationId: number | null | undefined) =>
  organizationId ? { organizationId } : { id: -1 };

const resolvePartyUsers = async (buyerOrgId: number | null, sellerOrgId: number | null, fallbackBuyerId: number, fallbackSellerId: number) => {
  const [buyer, seller] = await Promise.all([
    buyerOrgId ? prisma.user.findFirst({ where: { organizationId: buyerOrgId, role: 'buyer' as any }, select: { id: true } }) : null,
    sellerOrgId ? prisma.user.findFirst({ where: { organizationId: sellerOrgId, role: 'seller' as any }, select: { id: true } }) : null
  ]);
  return { buyerId: buyer?.id || fallbackBuyerId, sellerId: seller?.id || fallbackSellerId };
};

const resolveLinkedEntity = async (body: z.infer<typeof createSchema>, req: AuthRequest) => {
  const linkedEntityType = body.linkedEntityType;
  const linkedEntityId =
    body.linkedEntityId || body.purchaseOrderId || body.invoiceId || body.paymentTransactionId ||
    body.deliveryId || body.grnId || body.escrowAccountId || body.requirementResponseId || body.auctionId;
  let buyerOrgId: number | null = null;
  let sellerOrgId: number | null = null;
  let buyerId = req.user!.role === 'buyer' ? userId(req) : (body.counterpartyId || userId(req));
  let sellerId = req.user!.role === 'seller' ? userId(req) : (body.counterpartyId || userId(req));
  const ids: Record<string, number | null> = {
    purchaseOrderId: body.purchaseOrderId || null,
    invoiceId: body.invoiceId || null,
    paymentTransactionId: body.paymentTransactionId || null,
    deliveryId: body.deliveryId || null,
    grnId: body.grnId || null,
    escrowAccountId: body.escrowAccountId || null,
    requirementResponseId: body.requirementResponseId || null,
    auctionId: body.auctionId || null
  };

  const poId = body.purchaseOrderId || (linkedEntityType === 'PURCHASE_ORDER' ? linkedEntityId : undefined);
  if (poId) {
    const po = await prisma.purchaseOrder.findUnique({ where: { id: poId }, include: { buyer: { select: { id: true, organizationId: true } }, seller: { select: { id: true, organizationId: true } } } });
    if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    buyerId = po.buyerId; sellerId = po.sellerId; buyerOrgId = po.buyer.organizationId; sellerOrgId = po.seller.organizationId; ids.purchaseOrderId = po.id;
  }

  const invoiceId = body.invoiceId || (linkedEntityType === 'INVOICE' ? linkedEntityId : undefined);
  if (invoiceId) {
    const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { buyer: { select: { id: true, organizationId: true } }, seller: { select: { id: true, organizationId: true } } } });
    if (!invoice) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    buyerId = invoice.buyerId; sellerId = invoice.sellerId; buyerOrgId = invoice.buyer.organizationId; sellerOrgId = invoice.seller.organizationId; ids.invoiceId = invoice.id; ids.purchaseOrderId ||= invoice.purchaseOrderId;
  }

  const paymentId = body.paymentTransactionId || (linkedEntityType === 'PAYMENT_TRANSACTION' ? linkedEntityId : undefined);
  if (paymentId) {
    const payment = await prisma.paymentTransaction.findUnique({ where: { id: paymentId }, include: { payer: { select: { id: true, organizationId: true } }, payee: { select: { id: true, organizationId: true } } } });
    if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    buyerId = payment.payerId; sellerId = payment.payeeId; buyerOrgId = payment.payer.organizationId; sellerOrgId = payment.payee.organizationId; ids.paymentTransactionId = payment.id; ids.purchaseOrderId ||= payment.purchaseOrderId;
  }

  const escrowId = body.escrowAccountId || (linkedEntityType === 'ESCROW_ACCOUNT' ? linkedEntityId : undefined);
  if (escrowId) {
    const escrow = await prisma.escrowAccount.findUnique({ where: { id: escrowId }, include: { buyer: { select: { id: true, organizationId: true } }, seller: { select: { id: true, organizationId: true } } } });
    if (!escrow) throw new ApiError(404, 'Escrow account not found', 'ESCROW_NOT_FOUND');
    buyerId = escrow.buyerId; sellerId = escrow.sellerId; buyerOrgId = escrow.buyer.organizationId; sellerOrgId = escrow.seller.organizationId; ids.escrowAccountId = escrow.id; ids.purchaseOrderId ||= escrow.purchaseOrderId;
  }

  const deliveryId = body.deliveryId || (linkedEntityType === 'DELIVERY' ? linkedEntityId : undefined);
  if (deliveryId) {
    const delivery = await prisma.deliveryTracking.findUnique({ where: { id: deliveryId }, include: { purchaseOrder: { include: { buyer: { select: { id: true, organizationId: true } }, seller: { select: { id: true, organizationId: true } } } } } });
    if (!delivery) throw new ApiError(404, 'Delivery not found', 'DELIVERY_NOT_FOUND');
    buyerId = delivery.purchaseOrder.buyerId; sellerId = delivery.purchaseOrder.sellerId; buyerOrgId = delivery.purchaseOrder.buyer.organizationId; sellerOrgId = delivery.purchaseOrder.seller.organizationId; ids.deliveryId = delivery.id; ids.purchaseOrderId ||= delivery.purchaseOrderId;
  }

  const grnId = body.grnId || (linkedEntityType === 'GRN' ? linkedEntityId : undefined);
  if (grnId) {
    const grn = await prisma.goodsReceiptNote.findUnique({ where: { id: grnId }, include: { purchaseOrder: { include: { buyer: { select: { id: true, organizationId: true } }, seller: { select: { id: true, organizationId: true } } } } } });
    if (!grn) throw new ApiError(404, 'GRN not found', 'GRN_NOT_FOUND');
    buyerId = grn.purchaseOrder.buyerId; sellerId = grn.purchaseOrder.sellerId; buyerOrgId = grn.purchaseOrder.buyer.organizationId; sellerOrgId = grn.purchaseOrder.seller.organizationId; ids.grnId = grn.id; ids.purchaseOrderId ||= grn.purchaseOrderId;
  }

  const responseId = body.requirementResponseId || (linkedEntityType === 'REQUIREMENT_RESPONSE' ? linkedEntityId : undefined);
  if (responseId) {
    const response = await prisma.requirementResponse.findUnique({ where: { id: responseId }, include: { sellerUser: { select: { id: true, organizationId: true } }, requirement: { include: { buyerOrganization: { select: { id: true } }, createdBy: { select: { id: true, organizationId: true } } } } } });
    if (!response) throw new ApiError(404, 'Requirement response not found', 'RESPONSE_NOT_FOUND');
    buyerOrgId = response.requirement.buyerOrganizationId || response.requirement.createdBy?.organizationId || null;
    sellerOrgId = response.sellerOrganizationId || response.sellerUser.organizationId || null;
    const parties = await resolvePartyUsers(buyerOrgId, sellerOrgId, response.requirement.createdById || buyerId, response.sellerUserId);
    buyerId = parties.buyerId; sellerId = parties.sellerId; ids.requirementResponseId = response.id;
  }

  const auctionId = body.auctionId || (linkedEntityType === 'REVERSE_AUCTION_AWARD' ? linkedEntityId : undefined);
  if (auctionId) {
    const auction = await prisma.auction.findUnique({ where: { id: auctionId }, include: { currentWinner: { select: { id: true, organizationId: true } }, winnerSeller: { select: { id: true, organizationId: true } } } });
    if (!auction) throw new ApiError(404, 'Reverse auction not found', 'AUCTION_NOT_FOUND');
    buyerOrgId = auction.buyerOrgId || null;
    const seller = auction.winnerSeller || auction.currentWinner;
    sellerOrgId = seller?.organizationId || body.againstOrgId || null;
    const parties = await resolvePartyUsers(buyerOrgId, sellerOrgId, auction.createdByUserId || buyerId, seller?.id || sellerId);
    buyerId = parties.buyerId; sellerId = parties.sellerId; ids.auctionId = auction.id;
  }

  const requesterOrgId = orgId(req);
  if (!isAdmin(req) && requesterOrgId && buyerOrgId !== requesterOrgId && sellerOrgId !== requesterOrgId && body.againstOrgId !== requesterOrgId) {
    throw new ApiError(403, 'You can only raise disputes for your own organization records.', 'DISPUTE_ORG_FORBIDDEN');
  }

  const raisedByOrgId = requesterOrgId;
  const againstOrgId = body.againstOrgId || (raisedByOrgId === buyerOrgId ? sellerOrgId : buyerOrgId) || null;
  return { buyerId, sellerId, buyerOrgId, sellerOrgId, raisedByOrgId, againstOrgId, linkedEntityType, linkedEntityId: linkedEntityId || null, ids };
};

const ensureDisputeAccess = (req: AuthRequest, dispute: any) => {
  if (isAdmin(req)) return;
  const organizationId = orgId(req);
  if (!organizationId || ![dispute.raisedByOrgId, dispute.againstOrgId, dispute.buyerOrgId, dispute.sellerOrgId].includes(organizationId)) {
    throw new ApiError(403, 'You cannot access another organization dispute.', 'DISPUTE_FORBIDDEN');
  }
};

router.get('/disputes', authenticate, asyncRoute(async (req, res) => {
  const where = isAdmin(req)
    ? {}
    : { OR: [{ raisedByOrgId: orgId(req) }, { againstOrgId: orgId(req) }, { buyerOrgId: orgId(req) }, { sellerOrgId: orgId(req) }, { raisedById: userId(req) }] };
  const disputes = await db.dispute.findMany({ where, include: disputeInclude(isAdmin(req)), orderBy: { updatedAt: 'desc' }, take: 100 });
  ok(res, disputes.map(toDto));
}));

router.get('/disputes/my', authenticate, requireOrgPermission('DISPUTE_VIEW'), asyncRoute(async (req, res) => {
  const disputes = await db.dispute.findMany({
    where: { OR: [{ raisedByOrgId: orgId(req) }, { againstOrgId: orgId(req) }, { buyerOrgId: orgId(req) }, { sellerOrgId: orgId(req) }, { raisedById: userId(req) }] },
    include: disputeInclude(false),
    orderBy: { updatedAt: 'desc' },
    take: 100
  });
  ok(res, disputes.map(toDto));
}));

router.post('/disputes', authenticate, authorize('buyer', 'seller', 'admin', 'master_admin'), requireOrgPermission('DISPUTE_RAISE'), asyncRoute(async (req, res) => {
  const body = createSchema.parse(req.body);
  const resolved = await resolveLinkedEntity(body, req);
  const dispute = await prisma.$transaction(async tx => {
    const created = await (tx as any).dispute.create({
      data: {
        disputeNo: `DSP-${Date.now().toString(36).toUpperCase()}-${userId(req)}`,
        raisedByUserId: userId(req),
        raisedById: userId(req),
        buyerId: resolved.buyerId,
        sellerId: resolved.sellerId,
        raisedByOrgId: resolved.raisedByOrgId,
        againstOrgId: resolved.againstOrgId,
        buyerOrgId: resolved.buyerOrgId,
        sellerOrgId: resolved.sellerOrgId,
        linkedEntityType: resolved.linkedEntityType,
        linkedEntityId: resolved.linkedEntityId,
        ...resolved.ids,
        title: body.title,
        description: body.description,
        reason: body.description,
        category: body.category,
        amountInDispute: body.amountInDispute,
        priority: body.priority,
        status: 'OPEN',
        statusEnum: 'OPEN'
      }
    });
    if (body.evidenceFileIds.length) {
      await (tx as any).disputeAttachment.createMany({ data: body.evidenceFileIds.map(fileAssetId => ({ disputeId: created.id, fileAssetId, uploadedByUserId: userId(req) })) });
      await (tx as any).disputeEvidence.createMany({ data: body.evidenceFileIds.map(fileAssetId => ({ disputeId: created.id, fileAssetId, uploadedById: userId(req) })) });
    }
    return (tx as any).dispute.findUnique({ where: { id: created.id }, include: disputeInclude(true) });
  });
  await auditLog({ actorUserId: userId(req), actorRole: req.user!.role, action: 'dispute.created', entityType: 'dispute', entityId: dispute.id, ipAddress: req.ip, metadata: { disputeNo: dispute.disputeNo, linkedEntityType: dispute.linkedEntityType, linkedEntityId: dispute.linkedEntityId } });
  await notificationService.notifyAdmins({ title: 'New dispute raised', message: `${dispute.disputeNo || `DSP-${dispute.id}`} requires review.`, type: 'dispute_created', priority: body.priority === 'URGENT' ? 'urgent' : 'high', redirectUrl: '/admin/disputes' });
  const oppositeUserId = userId(req) === dispute.buyerId ? dispute.sellerId : dispute.buyerId;
  if (oppositeUserId && oppositeUserId !== userId(req)) {
    await notificationService.notify(oppositeUserId, { title: 'Dispute raised', message: `${dispute.disputeNo || `DSP-${dispute.id}`} was raised for a shared transaction.`, type: 'dispute_created', priority: 'high', redirectUrl: req.user?.role === 'seller' ? '/seller/disputes' : '/buyer/disputes' });
  }
  ok(res, toDto(dispute), 201);
}));

router.get('/disputes/:id', authenticate, asyncRoute(async (req, res) => {
  const dispute = await db.dispute.findUnique({ where: { id: Number(req.params.id) }, include: disputeInclude(isAdmin(req)) });
  if (!dispute) throw new ApiError(404, 'Dispute not found', 'DISPUTE_NOT_FOUND');
  ensureDisputeAccess(req, dispute);
  ok(res, toDto(dispute));
}));

router.post('/disputes/:id/messages', authenticate, requireOrgPermission('DISPUTE_RESPOND'), asyncRoute(async (req, res) => {
  const body = messageSchema.parse(req.body);
  const dispute = await db.dispute.findUnique({ where: { id: Number(req.params.id) } });
  if (!dispute) throw new ApiError(404, 'Dispute not found', 'DISPUTE_NOT_FOUND');
  ensureDisputeAccess(req, dispute);
  const internal = isAdmin(req) && (body.internal || body.visibility === 'ADMIN_INTERNAL');
  const messageText = body.message || body.content || '';
  const message = await prisma.$transaction(async tx => {
    const created = await (tx as any).disputeMessage.create({
      data: {
        disputeId: dispute.id,
        senderId: userId(req),
        senderOrgId: orgId(req),
        message: messageText,
        content: messageText,
        internal,
        visibility: internal ? 'ADMIN_INTERNAL' : 'PUBLIC_TO_PARTIES'
      },
      include: { sender: { select: { id: true, name: true, role: true } } }
    });
    if (body.evidenceFileIds.length) {
      await (tx as any).disputeAttachment.createMany({ data: body.evidenceFileIds.map(fileAssetId => ({ disputeId: dispute.id, fileAssetId, uploadedByUserId: userId(req) })) });
    }
    await (tx as any).dispute.update({ where: { id: dispute.id }, data: { status: internal ? dispute.status : 'RESPONDED', statusEnum: internal ? dispute.statusEnum : 'RESPONDED' } });
    return created;
  });
  await auditLog({ actorUserId: userId(req), actorRole: req.user!.role, action: internal ? 'dispute.internal_note_added' : 'dispute.message_added', entityType: 'dispute', entityId: dispute.id, ipAddress: req.ip });
  ok(res, { ...message, content: message.content || message.message }, 201);
}));

router.post('/disputes/:id/attachments', authenticate, requireOrgPermission('DISPUTE_RESPOND'), asyncRoute(async (req, res) => {
  const { fileAssetIds } = z.object({ fileAssetIds: z.array(z.coerce.number().int().positive()).min(1) }).parse(req.body);
  const dispute = await db.dispute.findUnique({ where: { id: Number(req.params.id) } });
  if (!dispute) throw new ApiError(404, 'Dispute not found', 'DISPUTE_NOT_FOUND');
  ensureDisputeAccess(req, dispute);
  await db.disputeAttachment.createMany({ data: fileAssetIds.map((fileAssetId: number) => ({ disputeId: dispute.id, fileAssetId, uploadedByUserId: userId(req) })) });
  await auditLog({ actorUserId: userId(req), actorRole: req.user!.role, action: 'dispute.attachments_added', entityType: 'dispute', entityId: dispute.id, ipAddress: req.ip, metadata: { count: fileAssetIds.length } });
  ok(res, { success: true });
}));

router.post('/disputes/:id/respond-clarification', authenticate, requireOrgPermission('DISPUTE_RESPOND'), asyncRoute(async (req, res) => {
  const body = clarificationSchema.parse(req.body);
  req.body = { message: body.message };
  const dispute = await db.dispute.findUnique({ where: { id: Number(req.params.id) } });
  if (!dispute) throw new ApiError(404, 'Dispute not found', 'DISPUTE_NOT_FOUND');
  ensureDisputeAccess(req, dispute);
  await db.disputeMessage.create({ data: { disputeId: dispute.id, senderId: userId(req), senderOrgId: orgId(req), message: body.message, content: body.message, visibility: 'PUBLIC_TO_PARTIES' } });
  const updated = await db.dispute.update({ where: { id: dispute.id }, data: { status: 'RESPONDED', statusEnum: 'RESPONDED' }, include: disputeInclude(false) });
  await auditLog({ actorUserId: userId(req), actorRole: req.user!.role, action: 'dispute.clarification_responded', entityType: 'dispute', entityId: dispute.id, ipAddress: req.ip });
  ok(res, toDto(updated));
}));

router.post('/disputes/:id/close', authenticate, requireOrgPermission('DISPUTE_RESOLVE_ORG_SIDE'), asyncRoute(async (req, res) => {
  const dispute = await db.dispute.findUnique({ where: { id: Number(req.params.id) } });
  if (!dispute) throw new ApiError(404, 'Dispute not found', 'DISPUTE_NOT_FOUND');
  ensureDisputeAccess(req, dispute);
  const updated = await db.dispute.update({ where: { id: dispute.id }, data: { status: 'CLOSED', statusEnum: 'CLOSED', closedAt: new Date() }, include: disputeInclude(false) });
  await auditLog({ actorUserId: userId(req), actorRole: req.user!.role, action: 'dispute.closed_by_party', entityType: 'dispute', entityId: dispute.id, ipAddress: req.ip });
  ok(res, toDto(updated));
}));

router.get('/admin/disputes', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const status = req.query.status ? String(req.query.status).toUpperCase() : undefined;
  const category = req.query.category ? String(req.query.category) : undefined;
  const priority = req.query.priority ? String(req.query.priority).toUpperCase() : undefined;
  const where: any = {};
  if (status && status !== 'ALL') where.status = status;
  if (category && category !== 'ALL') where.category = category;
  if (priority && priority !== 'ALL') where.priority = priority;
  const disputes = await db.dispute.findMany({ where, include: disputeInclude(true), orderBy: { updatedAt: 'desc' }, take: 200 });
  const summary = {
    open: disputes.filter((d: any) => normalizeStatus(d.status) === 'OPEN').length,
    underReview: disputes.filter((d: any) => normalizeStatus(d.status) === 'UNDER_REVIEW').length,
    urgent: disputes.filter((d: any) => d.priority === 'URGENT').length,
    resolved: disputes.filter((d: any) => ['RESOLVED', 'CLOSED'].includes(normalizeStatus(d.status))).length
  };
  ok(res, { disputes: disputes.map(toDto), summary });
}));

router.get('/admin/disputes/:id', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const dispute = await db.dispute.findUnique({ where: { id: Number(req.params.id) }, include: disputeInclude(true) });
  if (!dispute) throw new ApiError(404, 'Dispute not found', 'DISPUTE_NOT_FOUND');
  ok(res, toDto(dispute));
}));

router.post('/admin/disputes/:id/assign', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const body = assignSchema.parse(req.body);
  const assignedAdminId = body.assignedAdminId || userId(req);
  const updated = await db.dispute.update({ where: { id: Number(req.params.id) }, data: { assignedAdminId, status: 'UNDER_REVIEW', statusEnum: 'UNDER_REVIEW' }, include: disputeInclude(true) });
  await auditLog({ actorUserId: userId(req), actorRole: req.user!.role, action: 'dispute.assigned', entityType: 'dispute', entityId: updated.id, ipAddress: req.ip, metadata: { assignedAdminId } });
  ok(res, toDto(updated));
}));

router.post('/admin/disputes/:id/status', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const body = adminStatusSchema.parse(req.body);
  const updated = await db.dispute.update({
    where: { id: Number(req.params.id) },
    data: { status: body.status, statusEnum: body.status, adminRemarks: body.adminRemarks || body.remarks || null },
    include: disputeInclude(true)
  });
  await auditLog({ actorUserId: userId(req), actorRole: req.user!.role, action: 'dispute.status_updated', entityType: 'dispute', entityId: updated.id, ipAddress: req.ip, metadata: { status: body.status } });
  if (updated.raisedById) await notificationService.notify(updated.raisedById, { title: 'Dispute status updated', message: `${updated.disputeNo || `DSP-${updated.id}`} is now ${body.status.replace(/_/g, ' ')}.`, type: 'dispute_status_updated', priority: 'medium', redirectUrl: '/buyer/disputes' });
  ok(res, toDto(updated));
}));

router.put('/disputes/:id/status', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const body = adminStatusSchema.parse({ ...req.body, status: String(req.body?.status || '').toUpperCase() });
  const updated = await db.dispute.update({
    where: { id: Number(req.params.id) },
    data: { status: body.status, statusEnum: body.status, resolutionRemarks: body.remarks || null, resolvedAt: ['RESOLVED', 'REJECTED', 'CLOSED'].includes(body.status) ? new Date() : null, resolvedById: userId(req) },
    include: disputeInclude(true)
  });
  await auditLog({ actorUserId: userId(req), actorRole: req.user!.role, action: 'dispute.status_updated_legacy', entityType: 'dispute', entityId: updated.id, ipAddress: req.ip, metadata: { status: body.status } });
  ok(res, toDto(updated));
}));

router.post('/admin/disputes/:id/request-clarification', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const body = clarificationSchema.parse(req.body);
  const dispute = await db.dispute.update({ where: { id: Number(req.params.id) }, data: { status: 'CLARIFICATION_REQUESTED', statusEnum: 'CLARIFICATION_REQUESTED' }, include: disputeInclude(true) });
  await db.disputeMessage.create({ data: { disputeId: dispute.id, senderId: userId(req), message: body.message, content: body.message, visibility: 'PUBLIC_TO_PARTIES' } });
  await auditLog({ actorUserId: userId(req), actorRole: req.user!.role, action: 'dispute.clarification_requested', entityType: 'dispute', entityId: dispute.id, ipAddress: req.ip });
  if (dispute.raisedById) await notificationService.notify(dispute.raisedById, { title: 'Clarification requested', message: body.message, type: 'dispute_clarification_requested', priority: 'high', redirectUrl: '/buyer/disputes' });
  ok(res, toDto(await db.dispute.findUnique({ where: { id: dispute.id }, include: disputeInclude(true) })));
}));

router.post('/admin/disputes/:id/resolve', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const body = resolveSchema.parse(req.body);
  const updated = await db.dispute.update({ where: { id: Number(req.params.id) }, data: { status: 'RESOLVED', statusEnum: 'RESOLVED', resolutionSummary: body.resolutionSummary, resolutionRemarks: body.resolutionSummary, adminRemarks: body.adminRemarks || null, resolvedById: userId(req), resolvedAt: new Date() }, include: disputeInclude(true) });
  await auditLog({ actorUserId: userId(req), actorRole: req.user!.role, action: 'dispute.resolved', entityType: 'dispute', entityId: updated.id, ipAddress: req.ip });
  if (updated.raisedById) await notificationService.notify(updated.raisedById, { title: 'Dispute resolved', message: body.resolutionSummary, type: 'dispute_resolved', priority: 'medium', redirectUrl: '/buyer/disputes' });
  ok(res, toDto(updated));
}));

router.post('/admin/disputes/:id/reject', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const body = resolveSchema.parse({ resolutionSummary: req.body?.reason || req.body?.resolutionSummary, adminRemarks: req.body?.adminRemarks });
  const updated = await db.dispute.update({ where: { id: Number(req.params.id) }, data: { status: 'REJECTED', statusEnum: 'REJECTED', resolutionSummary: body.resolutionSummary, resolutionRemarks: body.resolutionSummary, resolvedById: userId(req), resolvedAt: new Date() }, include: disputeInclude(true) });
  await auditLog({ actorUserId: userId(req), actorRole: req.user!.role, action: 'dispute.rejected', entityType: 'dispute', entityId: updated.id, ipAddress: req.ip });
  ok(res, toDto(updated));
}));

router.post('/admin/disputes/:id/escalate', authenticate, authorizeAdmin, asyncRoute(async (req, res) => {
  const updated = await db.dispute.update({ where: { id: Number(req.params.id) }, data: { status: 'ESCALATED', statusEnum: 'ESCALATED', adminRemarks: String(req.body?.reason || req.body?.adminRemarks || '') }, include: disputeInclude(true) });
  await auditLog({ actorUserId: userId(req), actorRole: req.user!.role, action: 'dispute.escalated', entityType: 'dispute', entityId: updated.id, ipAddress: req.ip });
  ok(res, toDto(updated));
}));

export default router;
