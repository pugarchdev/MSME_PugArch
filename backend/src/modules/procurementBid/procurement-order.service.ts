import prisma from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import type { AuthRequest, AuthenticatedUser } from '../../middleware/authenticate.js';
import { uploadFile } from '../../services/storage/storage.service.js';
import { env } from '../../config/env.js';
import { notificationService } from '../../services/notification.service.js';
import { deliveryService, type DeliveryActor } from '../delivery/delivery.service.js';
import { initiatePayment } from '../payments/payment.service.js';
import { auditLog } from '../audit/audit.service.js';
import { getProcurementModeSettings } from '../procurementMode/procurement-mode.service.js';
import { logger } from '../../config/logger.js';

const db = prisma as any;

const now = () => new Date();
const numberSeries = (prefix: string) => `${prefix}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const money = (value: unknown) => Number(Number(value || 0).toFixed(2));

const actorFromReq = (req: AuthRequest): DeliveryActor => ({
  id: Number(req.user?.id),
  role: String(req.user?.role || ''),
  ipAddress: req.ip,
  userAgent: req.headers?.['user-agent'] || undefined
});

const isAdmin = (actor?: AuthenticatedUser | null) => actor?.role === 'admin' || actor?.role === 'master_admin';

const procurementOrderAudit = async (
  req: Pick<AuthRequest, 'user' | 'ip' | 'headers'>,
  action: string,
  entityType: string,
  entityId: string | number,
  metadata?: unknown
) => auditLog({
  actorUserId: req.user?.id,
  actorRole: req.user?.role,
  action,
  entityType,
  entityId,
  ipAddress: req.ip,
  userAgent: req.headers?.['user-agent'],
  metadata: metadata as any
});

const updateBidStatus = async (tx: any, bidId: number, newStatus: string, action: string, req: AuthRequest) => {
  const bid = await tx.procurementBid.findUnique({ where: { id: bidId } });
  if (!bid) return;
  
  await tx.procurementBid.update({
    where: { id: bidId },
    data: { status: newStatus }
  });
  
  await tx.procurementAuditLog.create({
    data: {
      userId: req.user?.id,
      role: req.user?.role,
      entityType: 'ProcurementBid',
      entityId: String(bidId),
      action,
      oldValue: { status: bid.status } as any,
      newValue: { status: newStatus } as any,
      ipAddress: req.ip,
      userAgent: req.headers?.['user-agent']
    }
  });
};

const poInclude = {
  buyer: { select: { id: true, name: true, email: true, organizationId: true, organization: { select: { id: true, organizationName: true, verificationStatus: true } } } },
  seller: { select: { id: true, name: true, email: true, organizationId: true, organization: { select: { id: true, organizationName: true, verificationStatus: true } } } },
  items: true,
  deliveryTrackings: { orderBy: { createdAt: 'desc' }, include: { events: { orderBy: { occurredAt: 'desc' }, take: 12 }, documents: { include: { fileAsset: true } }, acceptance: true, settlement: true } },
  grns: { orderBy: { createdAt: 'desc' }, include: { items: true, documents: { include: { fileAsset: true } } } },
  invoices: { orderBy: { createdAt: 'desc' }, include: { invoiceFile: true, items: true, payments: { orderBy: { createdAt: 'desc' } } } },
  payments: { orderBy: { createdAt: 'desc' }, include: { escrowAccount: true, ledgerEntries: true, paymentSettlements: true } }
};

export const getSellerUserIdsForActor = async (actor: AuthenticatedUser) => {
  const ids = [Number(actor.id)];
  const user = await db.user.findUnique({ where: { id: Number(actor.id) }, select: { organizationId: true, companyId: true } });
  if (user?.organizationId || (user as any)?.companyId) {
    const orgUsers = await db.user.findMany({
      where: {
        OR: [
          ...(user.organizationId ? [{ organizationId: user.organizationId }] : []),
          ...((user as any)?.companyId ? [{ companyId: (user as any).companyId }] : [])
        ]
      },
      select: { id: true }
    });
    orgUsers.forEach((u: any) => ids.push(u.id));
  }
  return Array.from(new Set(ids));
};

export const canAccessProcurementOrder = async (actor: AuthenticatedUser, po: any) => {
  if (isAdmin(actor)) return true;
  if (actor.role === 'buyer') return Number(po.buyerId) === Number(actor.id);
  if (actor.role === 'seller') {
    const sellerIds = await getSellerUserIdsForActor(actor);
    return sellerIds.includes(Number(po.sellerId));
  }
  return false;
};

export const loadProcurementOrder = async (actor: AuthenticatedUser, orderId: number) => {
  const po = await db.purchaseOrder.findUnique({ where: { id: orderId }, include: poInclude });
  const isAllowed = po && (await canAccessProcurementOrder(actor, po));
  if (!po || !isAllowed) {
    throw new ApiError(404, 'Procurement order not found', 'PROCUREMENT_ORDER_NOT_FOUND');
  }
  return po;
};

export const listProcurementOrders = async (actor: AuthenticatedUser, query: any = {}) => {
  const where: any = { sourceType: 'procurement_bid_award' };
  if (!isAdmin(actor)) {
    if (actor.role === 'buyer') {
      where.buyerId = Number(actor.id);
    } else if (actor.role === 'seller') {
      const sellerIds = await getSellerUserIdsForActor(actor);
      where.sellerId = { in: sellerIds };
    } else {
      throw new ApiError(403, 'Access denied', 'FORBIDDEN_ROLE');
    }
  }
  if (query.status) where.status = String(query.status);
  const take = Math.min(100, Math.max(1, Number(query.pageSize || query.take || 50)));
  const skip = query.page ? (Math.max(1, Number(query.page)) - 1) * take : Math.max(0, Number(query.skip || 0));
  const [items, total] = await Promise.all([
    db.purchaseOrder.findMany({ where, include: poInclude, orderBy: { updatedAt: 'desc' }, skip, take }),
    db.purchaseOrder.count({ where })
  ]);
  return { items, total, skip, take };
};

export const createOrReuseProcurementPOForAward = async (req: AuthRequest, award: any, bid: any) => {
  logger.info({ awardId: award?.id, bidId: bid?.id }, '[CREATE_PO] Starting PO creation for award');

  const existing = await db.purchaseOrder.findFirst({
    where: { sourceType: 'procurement_bid_award', sourceId: award.id },
    include: poInclude
  });
  if (existing) {
    logger.info({ poId: existing.id, poNumber: existing.poNumber }, '[CREATE_PO] Existing PO found, reusing');
    return { purchaseOrder: existing, reused: true };
  }

  const participation = await db.procurementBidParticipation.findUnique({
    where: { id: award.participationId },
    include: { seller: { include: { organization: true } }, documents: true }
  });
  if (!participation) {
    logger.error({ awardId: award.id, participationId: award.participationId }, '[CREATE_PO] Awarded participation not found');
    throw new ApiError(404, 'Awarded participation not found', 'PARTICIPATION_NOT_FOUND');
  }

  let finalBuyerId = bid.buyerId || req.user?.id || award.awardedById;
  let buyer = finalBuyerId ? await db.user.findUnique({ where: { id: Number(finalBuyerId) }, include: { organization: true } }) : null;
  if (!buyer && req.user?.id) {
    finalBuyerId = req.user.id;
    buyer = await db.user.findUnique({ where: { id: Number(finalBuyerId) }, include: { organization: true } });
  }

  logger.info({ finalBuyerId, sellerId: participation.sellerId }, '[CREATE_PO] Resolved buyer and seller for PO');

  const awardedAmount = money(award.awardedAmount || participation.totalAmount || participation.quotedAmount || 0);
  const gstRate = money(participation.gstPercentage || 0);
  const baseAmount = money(participation.quotedAmount || awardedAmount);
  const gstAmount = money(awardedAmount - baseAmount);

  const result = await db.$transaction(async (tx: any) => {
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber: numberSeries(bid.bidType === 'Service' ? 'WO-PB' : 'PO-PB'),
        buyerId: Number(finalBuyerId),
        sellerId: Number(participation.sellerId),
        title: bid.title || 'Procurement Order',
        amount: awardedAmount,
        totalValue: awardedAmount,
        status: 'issued',
        poStatus: 'ISSUED',
        sourceType: 'procurement_bid_award',
        sourceId: award.id,
        expectedDelivery: bid.bidValidityDate || bid.financialOpeningDate || null,
        deliveryAddress: bid.deliveryLocation || 'India',
        paymentTerms: Array.isArray(bid.termsAndConditions)
          ? (bid.termsAndConditions.find((term: string) => typeof term === 'string' && term.toLowerCase().includes('payment')) || null)
          : (typeof bid.termsAndConditions === 'string' ? bid.termsAndConditions : null),
        deliveryType: bid.bidType || 'Product',
        metadata: {
          source: 'procurement_bid_award',
          bidId: bid.id,
          bidNumber: bid.bidNumber || `BID-${bid.id}`,
          awardId: award.id,
          participationId: participation.id,
          buyerOrganizationName: bid.buyerOrganizationName || buyer?.organization?.organizationName || 'Buyer Organization',
          sellerOrganizationName: participation.seller?.organization?.organizationName || participation.seller?.name || 'Seller Organization',
          itemName: bid.category || bid.title || 'Procurement Item',
          description: participation.offeredItemDescription || bid.description || '',
          quantity: bid.quantity || 1,
          unit: bid.unit || 'Nos',
          awardedAmount,
          baseAmount,
          gstRate,
          gstAmount,
          totalAmount: awardedAmount,
          deliveryLocation: bid.deliveryLocation || 'India',
          termsAndConditions: Array.isArray(bid.termsAndConditions) ? bid.termsAndConditions : (bid.termsAndConditions ? [String(bid.termsAndConditions)] : []),
          eligibilityCriteria: Array.isArray(bid.eligibilityCriteria) ? bid.eligibilityCriteria : (bid.eligibilityCriteria ? [String(bid.eligibilityCriteria)] : []),
          requiredDocuments: Array.isArray(bid.requiredDocuments) ? bid.requiredDocuments : (bid.requiredDocuments ? [String(bid.requiredDocuments)] : []),
          awardRemarks: award.remarks || 'Accepted by buyer'
        },
        items: {
          create: [{
            itemName: bid.category || bid.title || 'Procurement Item',
            description: participation.offeredItemDescription || bid.description || '',
            quantity: typeof bid.quantity === 'number' ? bid.quantity : (parseInt(String(bid.quantity || '1'), 10) || 1),
            unitOfMeasure: bid.unit || 'Nos',
            unitPrice: baseAmount,
            taxRate: gstRate,
            totalAmount: awardedAmount
          }]
        }
      },
      include: poInclude
    });
    const delivery = await tx.deliveryTracking.create({
      data: {
        purchaseOrderId: po.id,
        status: 'CREATED',
        expectedDelivery: po.expectedDelivery,
        currentLocation: po.deliveryAddress,
        remarks: 'Procurement award converted to purchase/work order.'
      }
    });
    await tx.deliveryStatusLog.create({
      data: {
        deliveryTrackingId: delivery.id,
        previousStatus: null,
        newStatus: 'CREATED',
        changedById: req.user?.id || Number(finalBuyerId),
        actorRole: req.user?.role || 'buyer',
        ipAddress: req.ip || null,
        userAgent: req.headers?.['user-agent'] || null,
        remarks: 'Delivery shell created from procurement award.'
      }
    });
    await tx.procurementBid.update({
      where: { id: bid.id },
      data: { status: 'PO_GENERATED' }
    });
    await tx.procurementAuditLog.create({
      data: {
        userId: req.user?.id,
        role: req.user?.role,
        entityType: 'ProcurementBid',
        entityId: String(bid.id),
        action: 'PO_GENERATED',
        oldValue: { status: bid.status } as any,
        newValue: { status: 'PO_GENERATED' } as any,
        ipAddress: req.ip,
        userAgent: req.headers?.['user-agent']
      }
    });
    return po;
  });

  await procurementOrderAudit(req, 'PO_GENERATED', 'PurchaseOrder', result.id, { purchaseOrderId: result.id, awardId: award.id, bidId: bid.id });

  // Send notification to the seller
  await notificationService.notifyUser(participation.sellerId, {
    title: 'Purchase Order Issued',
    message: `A purchase order ${result.poNumber} has been generated for your awarded bid on "${bid.title}".`,
    type: 'purchase_order',
    redirectUrl: `/orders/procurement/${result.id}`
  });

  return { purchaseOrder: result, reused: false };
};

export const listSellerAwards = async (actor: AuthenticatedUser) => {
  if (actor.role !== 'seller') throw new ApiError(403, 'Seller access required', 'FORBIDDEN_ROLE');
  const awards = await db.procurementBidAward.findMany({
    where: { sellerId: actor.id },
    include: {
      bid: true,
      participation: true
    },
    orderBy: { createdAt: 'desc' }
  });
  const poByAward = await db.purchaseOrder.findMany({
    where: { sourceType: 'procurement_bid_award', sourceId: { in: awards.map((award: any) => award.id) } },
    include: poInclude
  });
  const poMap = new Map(poByAward.map((po: any) => [po.sourceId, po]));
  return awards.map((award: any) => ({ ...award, purchaseOrder: poMap.get(award.id) || null }));
};

const loadAwardOrderForSeller = async (actor: AuthenticatedUser, awardId: number) => {
  if (actor.role !== 'seller') throw new ApiError(403, 'Seller access required', 'FORBIDDEN_ROLE');
  const award = await db.procurementBidAward.findUnique({ where: { id: awardId }, include: { bid: true, participation: true } });
  if (!award || award.sellerId !== actor.id) throw new ApiError(404, 'Award not found', 'AWARD_NOT_FOUND');
  const po = await db.purchaseOrder.findFirst({ where: { sourceType: 'procurement_bid_award', sourceId: award.id }, include: poInclude });
  if (!po) throw new ApiError(404, 'Purchase order not generated for award yet', 'PO_NOT_FOUND');
  const delivery = po.deliveryTrackings?.[0] || await deliveryService.ensureDeliveryForPO({ id: actor.id, role: actor.role }, po.id, {});
  return { award, po, delivery };
};

export const acceptSellerAward = async (req: AuthRequest, awardId: number, body: any = {}) => {
  const { award, po, delivery } = await loadAwardOrderForSeller(req.user!, awardId);
  const updatedDelivery = await deliveryService.sellerAccept(actorFromReq(req), delivery.id, {
    remarks: body.remarks,
    expectedDelivery: body.expectedDelivery
  });
  const updatedAward = await db.procurementBidAward.update({
    where: { id: award.id },
    data: { awardStatus: 'ADMIN_APPROVED', awardedAt: award.awardedAt || now(), remarks: body.remarks || award.remarks }
  });
  await updateBidStatus(db, award.bidId, 'IN_PROGRESS', 'SELLER_AWARD_ACCEPTED', req);
  await procurementOrderAudit(req, 'SELLER_AWARD_ACCEPTED', 'ProcurementBidAward', award.id, { purchaseOrderId: po.id });
  
  await notificationService.notifyUser(award.bid.buyerId, {
    title: 'Purchase Order Accepted',
    message: `Seller has accepted the purchase order for "${award.bid.title}".`,
    type: 'purchase_order',
    redirectUrl: `/orders/procurement/${po.id}`
  });

  return { award: updatedAward, purchaseOrderId: po.id, delivery: updatedDelivery };
};

export const rejectSellerAward = async (req: AuthRequest, awardId: number, reason: string) => {
  const { award, po, delivery } = await loadAwardOrderForSeller(req.user!, awardId);
  const updatedDelivery = await deliveryService.sellerReject(actorFromReq(req), delivery.id, { reason });
  const updatedAward = await db.procurementBidAward.update({
    where: { id: award.id },
    data: { awardStatus: 'REJECTED', remarks: reason }
  });
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: 'cancelled', poStatus: 'CANCELLED' } });
  await updateBidStatus(db, award.bidId, 'CANCELLED', 'SELLER_AWARD_REJECTED', req);
  await procurementOrderAudit(req, 'SELLER_AWARD_REJECTED', 'ProcurementBidAward', award.id, { purchaseOrderId: po.id, reason });
  
  await notificationService.notifyUser(award.bid.buyerId, {
    title: 'Purchase Order Rejected',
    message: `Seller has rejected the purchase order for "${award.bid.title}". Reason: ${reason}`,
    type: 'purchase_order',
    redirectUrl: `/orders/procurement/${po.id}`
  });

  return { award: updatedAward, purchaseOrderId: po.id, delivery: updatedDelivery };
};

export const updateOrderDelivery = async (req: AuthRequest, orderId: number, body: any) => {
  const po = await loadProcurementOrder(req.user!, orderId);
  const delivery = po.deliveryTrackings?.[0] || await deliveryService.ensureDeliveryForPO(actorFromReq(req), po.id, {});
  
  let result;
  if (body.status === 'READY_FOR_PICKUP') result = await deliveryService.markReadyForPickup(actorFromReq(req), delivery.id, body);
  else if (body.status === 'DISPATCHED') result = await deliveryService.markDispatched(actorFromReq(req), delivery.id, body);
  else if (body.status === 'PACKED') result = await deliveryService.setPacked(actorFromReq(req), delivery.id, body);
  else if (body.trackingNumber || body.carrierName || body.logisticsPartnerName) {
    result = await deliveryService.updateDispatchDetails(actorFromReq(req), delivery.id, body);
  } else {
    result = await deliveryService.logisticsStatusUpdate(actorFromReq(req), delivery.id, {
      status: body.status || 'IN_TRANSIT',
      location: body.location || body.currentLocation,
      remarks: body.remarks,
      occurredAt: body.occurredAt
    });
  }

  if (body.status === 'DELIVERED') {
    const metadata = po.metadata as any;
    if (metadata?.bidId) {
      await updateBidStatus(db, Number(metadata.bidId), 'DELIVERED', 'DELIVERY_COMPLETED', req);
      await notificationService.notifyUser(po.buyerId, {
        title: 'Goods Delivered',
        message: `Seller has marked purchase order ${po.poNumber} as DELIVERED.`,
        type: 'delivery',
        redirectUrl: `/orders/procurement/${po.id}`
      });
    }
  }

  return result;
};

export const addDeliveryDocument = async (req: AuthRequest & { file?: Express.Multer.File }, orderId: number, body: any) => {
  const po = await loadProcurementOrder(req.user!, orderId);
  const delivery = po.deliveryTrackings?.[0] || await deliveryService.ensureDeliveryForPO(actorFromReq(req), po.id, {});
  let fileAssetId = body.fileAssetId ? Number(body.fileAssetId) : null;
  if (!fileAssetId) {
    if (!req.file) throw new ApiError(400, 'File or fileAssetId is required', 'FILE_REQUIRED');
    const asset = await uploadFile(req.file, {
      ownerId: req.user!.id,
      ownerRole: req.user!.role,
      entityType: 'procurement_delivery_document',
      entityId: delivery.id,
      purpose: String(body.documentType || 'DELIVERY_CHALLAN'),
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    }, env.STORAGE_PROVIDER);
    fileAssetId = asset.id;
  }
  return deliveryService.addDocument(actorFromReq(req), delivery.id, {
    fileAssetId,
    documentType: body.documentType || 'DELIVERY_CHALLAN',
    description: body.description
  });
};

const nextGrnNumber = async () => {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const count = await db.goodsReceiptNote.count({ where: { createdAt: { gte: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00`) } } });
  return `GRN-${day}-${String(count + 1).padStart(4, '0')}`;
};

export const createOrderGrn = async (req: AuthRequest, orderId: number, body: any = {}) => {
  const po = await loadProcurementOrder(req.user!, orderId);
  if (!isAdmin(req.user) && po.buyerId !== req.user!.id) throw new ApiError(403, 'Buyer access required', 'FORBIDDEN_ROLE');
  const items = body.items?.length ? body.items : po.items.map((item: any) => ({
    purchaseOrderItemId: item.id,
    itemName: item.itemName,
    orderedQty: Number(item.quantity),
    receivedQty: Number(body.receivedQuantity || item.quantity),
    acceptedQty: Number(body.acceptedQuantity || body.receivedQuantity || item.quantity),
    rejectedQty: Number(body.rejectedQuantity || 0),
    unitOfMeasure: item.unitOfMeasure
  }));
  const grn = await db.goodsReceiptNote.create({
    data: {
      grnNumber: await nextGrnNumber(),
      purchaseOrderId: po.id,
      receivedById: req.user!.id,
      organizationId: req.user!.organizationId || po.buyer.organizationId,
      status: 'SUBMITTED',
      remarks: body.remarks,
      inspectionNote: body.inspectionNote,
      items: { create: items }
    },
    include: { items: true, documents: true }
  });
  await procurementOrderAudit(req, 'GRN_CREATED', 'GoodsReceiptNote', grn.id, { orderId });
  return grn;
};

export const approveOrderGrn = async (req: AuthRequest, orderId: number, grnId: number, body: any = {}) => {
  const po = await loadProcurementOrder(req.user!, orderId);
  if (!isAdmin(req.user) && po.buyerId !== req.user!.id) throw new ApiError(403, 'Buyer access required', 'FORBIDDEN_ROLE');
  const grn = await db.goodsReceiptNote.findUnique({ where: { id: grnId } });
  if (!grn || grn.purchaseOrderId !== po.id) throw new ApiError(404, 'GRN not found', 'GRN_NOT_FOUND');
  const updated = await db.$transaction(async (tx: any) => {
    const row = await tx.goodsReceiptNote.update({ where: { id: grn.id }, data: { status: 'APPROVED', approvedById: req.user!.id, approvedAt: now(), inspectionNote: body.inspectionNote || grn.inspectionNote } });
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'inspection_accepted', version: { increment: 1 } } });
    
    const metadata = po.metadata as any;
    if (metadata?.bidId) {
      await updateBidStatus(tx, Number(metadata.bidId), 'GRN_COMPLETED', 'GRN_COMPLETED', req);
    }
    
    return row;
  });
  await procurementOrderAudit(req, 'GRN_APPROVED', 'GoodsReceiptNote', grn.id, { orderId });
  
  await notificationService.notifyUser(po.sellerId, {
    title: 'GRN Approved',
    message: `Buyer has approved the Goods Receipt Note for purchase order ${po.poNumber}.`,
    type: 'grn',
    redirectUrl: `/orders/procurement/${po.id}`
  });

  return updated;
};

export const rejectOrderGrn = async (req: AuthRequest, orderId: number, grnId: number, reason: string) => {
  const po = await loadProcurementOrder(req.user!, orderId);
  if (!isAdmin(req.user) && po.buyerId !== req.user!.id) throw new ApiError(403, 'Buyer access required', 'FORBIDDEN_ROLE');
  const updated = await db.goodsReceiptNote.update({ where: { id: grnId }, data: { status: 'REJECTED', rejectedById: req.user!.id, rejectedAt: now(), rejectionReason: reason } });
  await procurementOrderAudit(req, 'GRN_REJECTED', 'GoodsReceiptNote', grnId, { orderId, reason });
  return updated;
};

export const createOrderInvoice = async (req: AuthRequest, orderId: number, body: any = {}) => {
  const po = await loadProcurementOrder(req.user!, orderId);
  if (!isAdmin(req.user) && po.sellerId !== req.user!.id) throw new ApiError(403, 'Seller access required', 'FORBIDDEN_ROLE');

  const approvedGrn = await db.goodsReceiptNote.findFirst({ where: { purchaseOrderId: po.id, status: { in: ['APPROVED', 'PARTIAL'] } } });
  const approvedCrac = await db.consigneeReceiptAcceptanceCertificate.findFirst({
    where: { purchaseOrderId: po.id, status: 'GENERATED', inspectionResult: { not: 'REJECTED' } },
  });

  const buyer = await db.user.findUnique({ where: { id: po.buyerId }, select: { organizationId: true } });
  const settings = await getProcurementModeSettings(buyer?.organizationId);
  const isNewCheckoutFlow = po.sourceType === 'procurement_checkout';

  if (isNewCheckoutFlow && !approvedCrac) {
    throw new ApiError(409, 'Invoice can be created only after CRAC is generated for procurement checkout orders.', 'CRAC_REQUIRED');
  }

  if (!approvedCrac && !approvedGrn) {
    throw new ApiError(409, 'Invoice can be created only after GRN/service acceptance approval.', 'GRN_NOT_APPROVED');
  }

  if (!approvedCrac && approvedGrn && !settings.allowLegacyGrnInvoiceGate && isNewCheckoutFlow) {
    throw new ApiError(409, 'CRAC is required; legacy GRN-only invoice gate is disabled.', 'CRAC_REQUIRED');
  }
  const base = money(body.baseAmount || body.amount || po.amount);
  const gstRate = money(body.gstPercentage || 0);
  const gstAmount = money(body.gstAmount || base * gstRate / 100);
  const total = money(body.totalAmount || base + gstAmount + money(body.otherCharges || 0) - money(body.discount || 0));
  const invoice = await db.$transaction(async (tx: any) => {
    const created = await tx.invoice.create({
      data: {
        invoiceNumber: body.invoiceNumber || numberSeries('INV-PB'),
        purchaseOrderId: po.id,
        sellerId: po.sellerId,
        buyerId: po.buyerId,
        amount: total,
        status: 'submitted',
        invoiceStatus: 'SUBMITTED',
        taxableAmount: base,
        igstAmount: gstAmount,
        totalTaxAmount: gstAmount,
        invoiceFileId: body.fileAssetId ? Number(body.fileAssetId) : null,
        metadata: { source: 'procurement_order', bidId: po.metadata?.bidId, grnId: approvedGrn?.id, cracId: approvedCrac?.id, otherCharges: body.otherCharges, discount: body.discount },
        items: {
          create: po.items.map((item: any) => ({
            purchaseOrderItemId: item.id,
            itemName: item.itemName,
            description: item.description,
            quantity: item.quantity,
            unitOfMeasure: item.unitOfMeasure,
            unitPrice: item.unitPrice,
            taxableAmount: item.totalAmount,
            taxAmount: gstAmount,
            totalAmount: total
          }))
        }
      },
      include: { items: true, invoiceFile: true }
    });
    await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: 'invoice_submitted', version: { increment: 1 } } });
    
    const metadata = po.metadata as any;
    if (metadata?.bidId) {
      await updateBidStatus(tx, Number(metadata.bidId), 'INVOICE_SUBMITTED', 'INVOICE_SUBMITTED', req);
    }
    
    return created;
  });
  await procurementOrderAudit(req, 'INVOICE_SUBMITTED', 'Invoice', invoice.id, { orderId });

  await notificationService.notifyUser(po.buyerId, {
    title: 'Invoice Submitted',
    message: `Seller has submitted invoice ${invoice.invoiceNumber} for purchase order ${po.poNumber}.`,
    type: 'invoice',
    redirectUrl: `/orders/procurement/${po.id}`
  });

  return invoice;
};

export const uploadOrderInvoice = async (req: AuthRequest & { file?: Express.Multer.File }, orderId: number, body: any = {}) => {
  const po = await loadProcurementOrder(req.user!, orderId);
  if (!isAdmin(req.user) && po.sellerId !== req.user!.id) throw new ApiError(403, 'Seller access required', 'FORBIDDEN_ROLE');
  if (!req.file) throw new ApiError(400, 'Invoice file is required', 'FILE_REQUIRED');
  const asset = await uploadFile(req.file, {
    ownerId: req.user!.id,
    ownerRole: req.user!.role,
    entityType: 'procurement_invoice',
    entityId: po.id,
    purpose: 'TAX_INVOICE',
    ipAddress: req.ip,
    userAgent: req.headers['user-agent']
  }, env.STORAGE_PROVIDER);
  return createOrderInvoice(req, orderId, { ...body, fileAssetId: asset.id });
};

export const approveOrderInvoice = async (req: AuthRequest, orderId: number, invoiceId: number) => {
  const po = await loadProcurementOrder(req.user!, orderId);
  if (!isAdmin(req.user) && po.buyerId !== req.user!.id) throw new ApiError(403, 'Buyer access required', 'FORBIDDEN_ROLE');
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } });
  if (!invoice || invoice.purchaseOrderId !== po.id) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
  const updated = await db.invoice.update({ where: { id: invoice.id }, data: { status: 'approved', invoiceStatus: 'APPROVED', approvedAt: now(), version: { increment: 1 } } });
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: 'payment_initiated', version: { increment: 1 } } });
  await procurementOrderAudit(req, 'INVOICE_APPROVED', 'Invoice', invoice.id, { orderId });
  
  await notificationService.notifyUser(po.sellerId, {
    title: 'Invoice Approved',
    message: `Buyer has approved invoice ${invoice.invoiceNumber} for purchase order ${po.poNumber}.`,
    type: 'invoice',
    redirectUrl: `/orders/procurement/${po.id}`
  });

  return updated;
};

export const rejectOrderInvoice = async (req: AuthRequest, orderId: number, invoiceId: number, reason: string) => {
  const po = await loadProcurementOrder(req.user!, orderId);
  if (!isAdmin(req.user) && po.buyerId !== req.user!.id) throw new ApiError(403, 'Buyer access required', 'FORBIDDEN_ROLE');
  const updated = await db.invoice.update({ where: { id: invoiceId }, data: { status: 'rejected', invoiceStatus: 'REJECTED', metadata: { rejectionReason: reason } } });
  await procurementOrderAudit(req, 'INVOICE_REJECTED', 'Invoice', invoiceId, { orderId, reason });
  return updated;
};

export const initiateOrderPayment = async (req: AuthRequest, orderId: number, body: any = {}) => {
  const po = await loadProcurementOrder(req.user!, orderId);
  if (!isAdmin(req.user) && po.buyerId !== req.user!.id) throw new ApiError(403, 'Buyer access required', 'FORBIDDEN_ROLE');
  const invoice = await db.invoice.findFirst({ where: { purchaseOrderId: po.id, status: { in: ['approved', 'payment_initiated'] } }, orderBy: { createdAt: 'desc' } });
  if (!invoice) throw new ApiError(409, 'Payment can be initiated only after invoice approval.', 'INVOICE_NOT_APPROVED');
  const result = await initiatePayment(actorFromReq(req), {
    invoiceId: invoice.id,
    gateway: body.gateway,
    method: body.method || 'bank_transfer',
    idempotencyKey: body.idempotencyKey
  });
  await procurementOrderAudit(req, 'PAYMENT_INITIATED', 'PaymentTransaction', result.payment.id, { orderId, invoiceId: invoice.id });
  return result;
};

export const getOrderPaymentStatus = async (actor: AuthenticatedUser, orderId: number) => {
  const po = await loadProcurementOrder(actor, orderId);
  return {
    order: po,
    payments: po.payments,
    settlement: po.deliveryTrackings?.[0]?.settlement || po.payments?.[0]?.paymentSettlements?.[0] || null
  };
};

export const markSettlementConfirmed = async (req: AuthRequest, orderId: number, body: any = {}) => {
  if (!isAdmin(req.user)) throw new ApiError(403, 'Admin access required', 'FORBIDDEN_ROLE');
  const po = await loadProcurementOrder(req.user!, orderId);
  const payment = po.payments?.[0] || await db.paymentTransaction.findFirst({ where: { purchaseOrderId: po.id }, orderBy: { createdAt: 'desc' } });
  if (!payment) throw new ApiError(404, 'Payment not found for order', 'PAYMENT_NOT_FOUND');
  if (!['success', 'escrow_released'].includes(payment.status)) {
    throw new ApiError(409, 'Settlement can be confirmed only after the payment succeeds or escrow is released.', 'PAYMENT_NOT_SETTLED');
  }
  const delivery = po.deliveryTrackings?.[0] || await deliveryService.ensureDeliveryForPO(actorFromReq(req), po.id, {});
  const settlement = await db.paymentSettlement.upsert({
    where: { deliveryTrackingId: delivery.id },
    update: {
      paymentTransactionId: payment.id,
      invoiceId: payment.invoiceId,
      status: 'RELEASED',
      netReleasedAmount: body.netReleasedAmount || payment.amount,
      transactionReference: body.settlementReference || body.transactionReference || numberSeries('SETTLE'),
      releasedAt: now(),
      releasedById: req.user!.id,
      remarks: body.remarks,
      metadata: { source: 'procurement_order_settlement', nodalAccountReference: body.nodalAccountReference }
    },
    create: {
      deliveryTrackingId: delivery.id,
      paymentTransactionId: payment.id,
      invoiceId: payment.invoiceId,
      status: 'RELEASED',
      netReleasedAmount: body.netReleasedAmount || payment.amount,
      transactionReference: body.settlementReference || body.transactionReference || numberSeries('SETTLE'),
      releasedAt: now(),
      releasedById: req.user!.id,
      remarks: body.remarks,
      metadata: { source: 'procurement_order_settlement', nodalAccountReference: body.nodalAccountReference }
    }
  });
  await db.purchaseOrder.update({ where: { id: po.id }, data: { status: 'completed', poStatus: 'CLOSED', version: { increment: 1 } } });
  
  const metadata = po.metadata as any;
  if (metadata?.bidId) {
    await updateBidStatus(db, Number(metadata.bidId), 'PAYMENT_COMPLETED', 'PAYMENT_COMPLETED', req);
  }
  
  await procurementOrderAudit(req, 'SETTLEMENT_CONFIRMED', 'PaymentSettlement', settlement.id, { orderId, paymentId: payment.id });

  await notificationService.notifyUser(po.sellerId, {
    title: 'Payment Released',
    message: `Payment has been released and confirmed for purchase order ${po.poNumber}.`,
    type: 'payment',
    redirectUrl: `/orders/procurement/${po.id}`
  });

  return settlement;
};

export const listAdminSettlements = async (actor: AuthenticatedUser, query: any = {}) => {
  if (!isAdmin(actor)) throw new ApiError(403, 'Admin access required', 'FORBIDDEN_ROLE');
  const take = Math.min(100, Math.max(1, Number(query.pageSize || query.take || 50)));
  const skip = query.page ? (Math.max(1, Number(query.page)) - 1) * take : Math.max(0, Number(query.skip || 0));
  const where = { deliveryTracking: { purchaseOrder: { sourceType: 'procurement_bid_award' } } };
  const [items, total] = await Promise.all([
    db.paymentSettlement.findMany({ where, include: { paymentTransaction: true, invoice: true, deliveryTracking: { include: { purchaseOrder: true } } }, orderBy: { createdAt: 'desc' }, skip, take }),
    db.paymentSettlement.count({ where })
  ]);
  return { items, total, skip, take };
};
