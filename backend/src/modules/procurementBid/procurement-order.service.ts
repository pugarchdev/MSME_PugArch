import prisma from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import type { AuthRequest, AuthenticatedUser } from '../../middleware/authenticate.js';
import { uploadFile } from '../../services/storage/storage.service.js';
import { env } from '../../config/env.js';
import { deliveryService, type DeliveryActor } from '../delivery/delivery.service.js';
import { initiatePayment } from '../payments/payment.service.js';
import { auditLog } from '../audit/audit.service.js';
import { getProcurementModeSettings } from '../procurementMode/procurement-mode.service.js';

const db = prisma as any;

const now = () => new Date();
const numberSeries = (prefix: string) => `${prefix}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
const money = (value: unknown) => Number(Number(value || 0).toFixed(2));

const actorFromReq = (req: AuthRequest): DeliveryActor => ({
  id: Number(req.user?.id),
  role: String(req.user?.role || ''),
  ipAddress: req.ip,
  userAgent: req.headers['user-agent'] || undefined
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

const poInclude = {
  buyer: { select: { id: true, name: true, email: true, organizationId: true, organization: { select: { id: true, organizationName: true, verificationStatus: true } } } },
  seller: { select: { id: true, name: true, email: true, organizationId: true, organization: { select: { id: true, organizationName: true, verificationStatus: true } } } },
  items: true,
  deliveryTrackings: { orderBy: { createdAt: 'desc' }, include: { events: { orderBy: { occurredAt: 'desc' }, take: 12 }, documents: { include: { fileAsset: true } }, acceptance: true, settlement: true } },
  grns: { orderBy: { createdAt: 'desc' }, include: { items: true, documents: { include: { fileAsset: true } } } },
  invoices: { orderBy: { createdAt: 'desc' }, include: { invoiceFile: true, items: true, payments: { orderBy: { createdAt: 'desc' } } } },
  payments: { orderBy: { createdAt: 'desc' }, include: { escrowAccount: true, ledgerEntries: true, paymentSettlements: true } }
};

export const canAccessProcurementOrder = (actor: AuthenticatedUser, po: any) =>
  isAdmin(actor) || po.buyerId === actor.id || po.sellerId === actor.id;

export const loadProcurementOrder = async (actor: AuthenticatedUser, orderId: number) => {
  const po = await db.purchaseOrder.findUnique({ where: { id: orderId }, include: poInclude });
  if (!po || po.sourceType !== 'procurement_bid_award' || !canAccessProcurementOrder(actor, po)) {
    throw new ApiError(404, 'Procurement order not found', 'PROCUREMENT_ORDER_NOT_FOUND');
  }
  return po;
};

export const listProcurementOrders = async (actor: AuthenticatedUser, query: any = {}) => {
  const where: any = { sourceType: 'procurement_bid_award' };
  if (!isAdmin(actor)) {
    if (actor.role === 'buyer') where.buyerId = actor.id;
    else if (actor.role === 'seller') where.sellerId = actor.id;
    else throw new ApiError(403, 'Access denied', 'FORBIDDEN_ROLE');
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
  const existing = await db.purchaseOrder.findFirst({
    where: { sourceType: 'procurement_bid_award', sourceId: award.id },
    include: poInclude
  });
  if (existing) return { purchaseOrder: existing, reused: true };

  const participation = await db.procurementBidParticipation.findUnique({
    where: { id: award.participationId },
    include: { seller: { include: { organization: true } }, documents: true }
  });
  if (!participation) throw new ApiError(404, 'Awarded participation not found', 'PARTICIPATION_NOT_FOUND');

  const buyer = await db.user.findUnique({ where: { id: bid.buyerId }, include: { organization: true } });
  const awardedAmount = money(award.awardedAmount || participation.totalAmount || participation.quotedAmount || 0);
  const gstRate = money(participation.gstPercentage || 0);
  const baseAmount = money(participation.quotedAmount || awardedAmount);
  const gstAmount = money(awardedAmount - baseAmount);

  const result = await db.$transaction(async (tx: any) => {
    const po = await tx.purchaseOrder.create({
      data: {
        poNumber: numberSeries(bid.bidType === 'Service' ? 'WO-PB' : 'PO-PB'),
        buyerId: bid.buyerId,
        sellerId: participation.sellerId,
        title: bid.title,
        amount: awardedAmount,
        totalValue: awardedAmount,
        status: 'issued',
        poStatus: 'ISSUED',
        sourceType: 'procurement_bid_award',
        sourceId: award.id,
        expectedDelivery: bid.bidValidityDate || bid.financialOpeningDate || null,
        deliveryAddress: bid.deliveryLocation,
        paymentTerms: (bid.termsAndConditions || []).find((term: string) => term.toLowerCase().includes('payment')) || null,
        deliveryType: bid.bidType,
        metadata: {
          source: 'procurement_bid_award',
          bidId: bid.id,
          bidNumber: bid.bidNumber,
          awardId: award.id,
          participationId: participation.id,
          buyerOrganizationName: bid.buyerOrganizationName || buyer?.organization?.organizationName,
          sellerOrganizationName: participation.seller?.organization?.organizationName || participation.seller?.name,
          itemName: bid.category || bid.title,
          description: participation.offeredItemDescription || bid.description,
          quantity: bid.quantity,
          unit: bid.unit,
          awardedAmount,
          baseAmount,
          gstRate,
          gstAmount,
          totalAmount: awardedAmount,
          deliveryLocation: bid.deliveryLocation,
          termsAndConditions: bid.termsAndConditions || [],
          eligibilityCriteria: bid.eligibilityCriteria || [],
          requiredDocuments: bid.requiredDocuments || [],
          awardRemarks: award.remarks
        },
        items: {
          create: [{
            itemName: bid.category || bid.title,
            description: participation.offeredItemDescription || bid.description,
            quantity: bid.quantity || 1,
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
        changedById: req.user!.id,
        actorRole: req.user!.role,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        remarks: 'Delivery shell created from procurement award.'
      }
    });
    return po;
  });

  await procurementOrderAudit(req, 'PO_GENERATED', 'PurchaseOrder', result.id, { purchaseOrderId: result.id, awardId: award.id, bidId: bid.id });
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
  await procurementOrderAudit(req, 'SELLER_AWARD_ACCEPTED', 'ProcurementBidAward', award.id, { purchaseOrderId: po.id });
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
  await procurementOrderAudit(req, 'SELLER_AWARD_REJECTED', 'ProcurementBidAward', award.id, { purchaseOrderId: po.id, reason });
  return { award: updatedAward, purchaseOrderId: po.id, delivery: updatedDelivery };
};

export const updateOrderDelivery = async (req: AuthRequest, orderId: number, body: any) => {
  const po = await loadProcurementOrder(req.user!, orderId);
  const delivery = po.deliveryTrackings?.[0] || await deliveryService.ensureDeliveryForPO(actorFromReq(req), po.id, {});
  if (body.status === 'READY_FOR_PICKUP') return deliveryService.markReadyForPickup(actorFromReq(req), delivery.id, body);
  if (body.status === 'DISPATCHED') return deliveryService.markDispatched(actorFromReq(req), delivery.id, body);
  if (body.status === 'PACKED') return deliveryService.setPacked(actorFromReq(req), delivery.id, body);
  if (body.trackingNumber || body.carrierName || body.logisticsPartnerName) {
    return deliveryService.updateDispatchDetails(actorFromReq(req), delivery.id, body);
  }
  return deliveryService.logisticsStatusUpdate(actorFromReq(req), delivery.id, {
    status: body.status || 'IN_TRANSIT',
    location: body.location || body.currentLocation,
    remarks: body.remarks,
    occurredAt: body.occurredAt
  });
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
    return row;
  });
  await procurementOrderAudit(req, 'GRN_APPROVED', 'GoodsReceiptNote', grn.id, { orderId });
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
    return created;
  });
  await procurementOrderAudit(req, 'INVOICE_SUBMITTED', 'Invoice', invoice.id, { orderId });
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
  await procurementOrderAudit(req, 'SETTLEMENT_CONFIRMED', 'PaymentSettlement', settlement.id, { orderId, paymentId: payment.id });
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
