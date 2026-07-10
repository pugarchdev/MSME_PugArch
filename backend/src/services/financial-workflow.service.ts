import prisma from '../lib/prisma.js';
import { auditLog } from '../modules/audit/audit.service.js';
import { ApiError } from '../utils/ApiError.js';
import { randomToken } from '../utils/crypto.js';
import { maskSensitive } from '../utils/maskSensitive.js';
import { quotedBidTotal } from '../utils/bidPricing.js';

type Actor = {
  id: number;
  role: string;
  ipAddress?: string;
  userAgent?: string;
};

const money = (value: number) => Number(value.toFixed(2));

const poNumber = () => `PO-${new Date().getFullYear()}-${randomToken(5).toUpperCase()}`;
const invoiceNumber = () => `INV-${new Date().getFullYear()}-${randomToken(5).toUpperCase()}`;
const paymentReference = () => `PAY-${new Date().getFullYear()}-${randomToken(6).toUpperCase()}`;

const auditWrite = async (actor: Actor, action: string, entityType: string, entityId: number, details: Record<string, unknown>) =>
  auditLog({
    actorUserId: actor.id,
    actorRole: actor.role,
    action,
    entityType,
    entityId,
    ipAddress: actor.ipAddress,
    userAgent: actor.userAgent,
    metadata: maskSensitive(details)
  });

const TENDER_ACCEPT_BID_STATUSES = new Set(['financial_evaluation', 'awarded']);

export const acceptBidAndGeneratePurchaseOrder = async (bidId: number, actor: Actor) => {
  const result = await prisma.$transaction(async (tx) => {
    const bid = await tx.bid.findUnique({ where: { id: bidId }, include: { tender: true } });
    if (!bid) throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
    if (actor.role !== 'admin' && bid.tender.buyerId !== actor.id) {
      throw new ApiError(404, 'Bid not found', 'BID_NOT_FOUND');
    }
    if (!TENDER_ACCEPT_BID_STATUSES.has(bid.tender.status)) {
      throw new ApiError(409, 'Tender must be in financial evaluation or awarded stage to accept bid', 'TENDER_INVALID_STATUS');
    }

    const existingPo = await tx.purchaseOrder.findUnique({ where: { bidId } });
    if (existingPo) return { bid, purchaseOrder: existingPo, reused: true };

    const amount = quotedBidTotal(bid);
    const updatedBid = await tx.bid.update({
      where: { id: bidId },
      data: { status: 'accepted' }
    });

    await tx.bid.updateMany({
      where: { tenderId: bid.tenderId, id: { not: bidId } },
      data: { status: 'rejected' }
    });

    await tx.tender.update({
      where: { id: bid.tenderId },
      data: { status: 'po_generated' }
    });

    const purchaseOrder = await tx.purchaseOrder.create({
      data: {
        poNumber: poNumber(),
        tenderId: bid.tenderId,
        bidId,
        buyerId: bid.tender.buyerId,
        sellerId: bid.sellerId,
        title: bid.tender.title || `Purchase order for ${bid.tender.tenderId}`,
        amount,
        totalValue: amount,
        status: 'generated',
        expectedDelivery: bid.deliveryDays
          ? new Date(Date.now() + Number(bid.deliveryDays) * 24 * 60 * 60 * 1000)
          : null,
        deliveryAddress: '',
        amendmentHistory: [],
        metadata: {
          source: 'bid_acceptance',
          tenderId: bid.tender.tenderId,
          unitPrice: bid.unitPrice,
          quantity: bid.quantity,
          subtotal: bid.subtotal,
          taxRate: bid.taxRate,
          taxAmount: bid.taxAmount,
          discountAmount: bid.discountAmount,
          totalAmount: amount,
          deliveryDays: bid.deliveryDays
        }
      }
    });

    return { bid: updatedBid, purchaseOrder, reused: false };
  });

  await auditWrite(actor, 'financial.bid_accepted_po_generated', 'purchaseOrder', result.purchaseOrder.id, {
    bidId,
    tenderId: result.purchaseOrder.tenderId,
    status: result.purchaseOrder.status,
    reused: result.reused
  });

  return result;
};

const PO_ACCEPT_STATUSES = new Set(['generated']);

export const acceptPurchaseOrderAndCreateDelivery = async (purchaseOrderId: number, actor: Actor) => {
  const result = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
    if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    if (actor.role !== 'admin' && po.sellerId !== actor.id) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    if (!PO_ACCEPT_STATUSES.has(po.status)) {
      throw new ApiError(409, 'Purchase order must be in generated status to accept', 'PO_INVALID_STATUS');
    }

    const updatedPo = await tx.purchaseOrder.update({
      where: { id: po.id, version: po.version },
      data: { status: 'accepted', acceptedAt: new Date(), version: { increment: 1 } }
    });

    const deliveryWorkflow = await tx.deliveryWorkflow.upsert({
      where: { purchaseOrderId: po.id },
      update: { status: 'created', version: { increment: 1 } },
      create: { purchaseOrderId: po.id, status: 'created' }
    });

    return { purchaseOrder: updatedPo, deliveryWorkflow };
  });

  await auditWrite(actor, 'financial.po_accepted_delivery_created', 'purchaseOrder', result.purchaseOrder.id, {
    status: result.purchaseOrder.status,
    deliveryWorkflowId: result.deliveryWorkflow.id
  });

  return result;
};

const PO_INSPECTION_STATUSES = new Set(['accepted']);

export const acceptInspectionAndEnableInvoice = async (purchaseOrderId: number, actor: Actor, remarks?: string) => {
  const result = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
    if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    if (actor.role !== 'admin' && po.buyerId !== actor.id) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    if (!PO_INSPECTION_STATUSES.has(po.status)) {
      throw new ApiError(409, 'Purchase order must be accepted before inspection', 'PO_INVALID_STATUS');
    }

    const inspectionRecord = await tx.inspectionRecord.upsert({
      where: { purchaseOrderId: po.id },
      update: { status: 'accepted', remarks, version: { increment: 1 } },
      create: { purchaseOrderId: po.id, status: 'accepted', remarks }
    });

    const purchaseOrder = await tx.purchaseOrder.update({
      where: { id: po.id, version: po.version },
      data: { status: 'inspection_accepted', version: { increment: 1 } }
    });

    return { purchaseOrder, inspectionRecord };
  });

  await auditWrite(actor, 'financial.inspection_accepted_invoice_enabled', 'purchaseOrder', result.purchaseOrder.id, {
    inspectionRecordId: result.inspectionRecord.id
  });

  return result;
};

export const submitInvoiceForPurchaseOrder = async (purchaseOrderId: number, actor: Actor, payload: { fileAssetId?: number | null; metadata?: Record<string, unknown> }) => {
  const result = await prisma.$transaction(async (tx) => {
    const po = await tx.purchaseOrder.findUnique({ where: { id: purchaseOrderId } });
    if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    if (actor.role !== 'admin' && po.sellerId !== actor.id) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    if (!['inspection_accepted', 'invoice_eligible'].includes(po.status)) {
      throw new ApiError(409, 'Invoice cannot be submitted until inspection is accepted', 'INVOICE_NOT_ELIGIBLE');
    }

    const invoice = await tx.invoice.create({
      data: {
        invoiceNumber: invoiceNumber(),
        purchaseOrderId: po.id,
        buyerId: po.buyerId,
        sellerId: po.sellerId,
        amount: po.amount,
        currency: po.currency,
        fileAssetId: payload.fileAssetId || null,
        metadata: maskSensitive(payload.metadata || {}) as any
      }
    });

    const purchaseOrder = await tx.purchaseOrder.update({
      where: { id: po.id, version: po.version },
      data: { status: 'invoice_submitted', version: { increment: 1 } }
    });

    return { invoice, purchaseOrder };
  });

  await auditWrite(actor, 'financial.invoice_submitted', 'invoice', result.invoice.id, {
    purchaseOrderId,
    invoiceNumber: result.invoice.invoiceNumber
  });

  return result;
};

const INVOICE_APPROVE_STATUSES = new Set(['submitted']);

export const approveInvoiceAndCreatePayment = async (invoiceId: number, actor: Actor) => {
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: invoiceId }, include: { purchaseOrder: true } });
    if (!invoice) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    if (actor.role !== 'admin' && invoice.buyerId !== actor.id) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    if (!INVOICE_APPROVE_STATUSES.has(invoice.status)) {
      throw new ApiError(409, 'Invoice must be submitted before approval', 'INVOICE_INVALID_STATUS');
    }

    const existingPayment = await tx.paymentTransaction.findFirst({ where: { invoiceId: invoice.id } });
    if (existingPayment) return { invoice, payment: existingPayment, reused: true };

    const updatedInvoice = await tx.invoice.update({
      where: { id: invoice.id, version: invoice.version },
      data: { status: 'approved', approvedAt: new Date(), version: { increment: 1 } }
    });

    const payment = await tx.paymentTransaction.create({
      data: {
        referenceId: paymentReference(),
        invoiceId: invoice.id,
        purchaseOrderId: invoice.purchaseOrderId,
        payerId: invoice.buyerId,
        payeeId: invoice.sellerId,
        amount: invoice.amount,
        currency: invoice.currency,
        status: 'initiated',
        metadata: { source: 'invoice_approval' }
      }
    });

    await tx.purchaseOrder.update({
      where: { id: invoice.purchaseOrderId },
      data: { status: 'payment_initiated', version: { increment: 1 } }
    });

    return { invoice: updatedInvoice, payment, reused: false };
  });

  await auditWrite(actor, 'financial.invoice_approved_payment_created', 'paymentTransaction', result.payment.id, {
    invoiceId,
    referenceId: result.payment.referenceId,
    reused: result.reused
  });

  return result;
};

const PAYMENT_SUCCESS_STATUSES = new Set(['initiated', 'gateway_order_created']);

export const markPaymentSuccess = async (paymentId: number, actor: Actor, providerPaymentId?: string) => {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.paymentTransaction.findUnique({ where: { id: paymentId } });
    if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    if (actor.role !== 'admin' && payment.payerId !== actor.id) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    if (['success', 'escrow_released'].includes(payment.status)) {
      const ledgerEntry = await tx.financialLedgerEntry.findFirst({
        where: { transactionId: payment.id, entryType: 'payment_success' },
        orderBy: { createdAt: 'asc' }
      });
      return { payment, ledgerEntry, reused: true };
    }

    const updatedPayment = await tx.paymentTransaction.update({
      where: { id: payment.id, version: payment.version },
      data: {
        status: 'success',
        providerPaymentId: providerPaymentId || payment.providerPaymentId,
        completedAt: new Date(),
        version: { increment: 1 }
      }
    });

    if (payment.invoiceId) {
      await tx.invoice.update({
        where: { id: payment.invoiceId },
        data: { status: 'paid', version: { increment: 1 } }
      });
    }
    if (payment.purchaseOrderId) {
      await tx.purchaseOrder.update({
        where: { id: payment.purchaseOrderId },
        data: { status: 'paid', version: { increment: 1 } }
      });
    }

    const ledgerEntry = await tx.financialLedgerEntry.create({
      data: {
        transactionId: payment.id,
        entityType: 'payment',
        entityId: payment.id,
        debitAccount: `buyer:${payment.payerId}`,
        creditAccount: 'escrow:platform',
        amount: payment.amount,
        currency: payment.currency,
        entryType: 'payment_success',
        metadata: { invoiceId: payment.invoiceId, purchaseOrderId: payment.purchaseOrderId }
      }
    });

    return { payment: updatedPayment, ledgerEntry, reused: false };
  });

  await auditWrite(actor, 'financial.payment_success_ledger_recorded', 'paymentTransaction', result.payment.id, {
    ledgerEntryId: result.ledgerEntry?.id,
    reused: result.reused,
    providerPaymentId: providerPaymentId ? 'provided' : 'not_provided'
  });

  return result;
};

export const releaseEscrow = async (paymentId: number, actor: Actor) => {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.paymentTransaction.findUnique({ where: { id: paymentId } });
    if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    if (actor.role !== 'admin' && payment.payerId !== actor.id) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    if (payment.status === 'escrow_released') {
      const ledgerEntry = await tx.financialLedgerEntry.findFirst({
        where: { transactionId: payment.id, entryType: 'escrow_release' },
        orderBy: { createdAt: 'asc' }
      });
      return { payment, ledgerEntry, reused: true };
    }
    if (payment.status !== 'success') throw new ApiError(409, 'Payment must be successful before escrow release', 'ESCROW_NOT_ELIGIBLE');

    const released = await tx.paymentTransaction.update({
      where: { id: payment.id, version: payment.version },
      data: { status: 'escrow_released', version: { increment: 1 } }
    });

    const ledgerEntry = await tx.financialLedgerEntry.create({
      data: {
        transactionId: payment.id,
        entityType: 'escrow',
        entityId: payment.id,
        debitAccount: 'escrow:platform',
        creditAccount: `seller:${payment.payeeId}`,
        amount: payment.amount,
        currency: payment.currency,
        entryType: 'escrow_release',
        metadata: { invoiceId: payment.invoiceId, purchaseOrderId: payment.purchaseOrderId }
      }
    });

    return { payment: released, ledgerEntry, reused: false };
  });

  await auditWrite(actor, 'financial.escrow_released', 'paymentTransaction', result.payment.id, {
    ledgerEntryId: result.ledgerEntry?.id,
    reused: result.reused
  });

  return result;
};
