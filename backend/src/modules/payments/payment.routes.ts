import { Router } from 'express';
import { z } from 'zod';
import { authenticate, requireAccountType, requirePermission } from '../../middleware/auth.js';
import type { AuthRequest } from '../../middleware/auth.js';
import { maskSensitive } from '../../utils/maskSensitive.js';
import { ApiError } from '../../utils/ApiError.js';
import { idempotencyKeyFromRequest, withIdempotency } from '../../services/idempotency.service.js';
import {
  initiatePayment,
  processPaymentWebhook,
  reconcilePayment,
  markPaymentConfirmedFromGateway
} from './payment.service.js';
import { initiatePaymentSchema } from './payment.validation.js';
import prisma from '../../lib/prisma.js';
import { safeRouteMessage } from '../../utils/routeHelpers.js';
import { randomToken } from '../../utils/crypto.js';
import { auditLog } from '../audit/audit.service.js';

const router = Router();

const orgScope = {
  scopeType: 'ORGANIZATION' as const,
  getScopeId: (req: AuthRequest) => req.user?.organizationId
};

const isPlatformFinanceUser = (req: AuthRequest) =>
  req.user?.accountTypeId === 0 || req.user?.accountTypeId === 1 || req.user?.accountType === 'MASTER_ADMIN' || req.user?.accountType === 'SUPERADMIN';

const getListWindow = (query: Record<string, unknown>) => {
  const take = Math.min(100, Math.max(1, Number(query.take ?? query.pageSize ?? 50)));
  const skip = query.page ? (Math.max(1, Number(query.page)) - 1) * take : Math.max(0, Number(query.skip ?? 0));
  return { skip, take };
};

const actorFrom = (req: AuthRequest) => ({
  id: Number(req.user?.id),
  role: String(req.user?.role),
  ipAddress: req.ip,
  userAgent: req.headers['user-agent']
});

const offlineProofSchema = z.object({
  method: z.enum(['NEFT', 'RTGS', 'IMPS', 'UPI', 'CHEQUE', 'BANK_TRANSFER', 'OTHER']),
  transactionReference: z.string().trim().min(3).max(120),
  paymentDate: z.coerce.date(),
  amount: z.coerce.number().positive(),
  payerBankName: z.string().trim().min(2).max(160),
  payerAccountLast4: z.string().trim().regex(/^\d{4}$/).optional(),
  beneficiaryBankName: z.string().trim().max(160).optional(),
  receiptFileId: z.coerce.number().int().positive().optional(),
  receiptFileUrl: z.string().trim().max(1000).optional().refine(
    val => !val || val === '' || /^\//.test(val) || /^https?:\/\/.+/.test(val),
    { message: 'receiptFileUrl must be a valid absolute URL, relative path, or empty' }
  ),
  remarks: z.string().trim().max(1000).optional()
}).refine(value => value.paymentDate <= new Date(), {
  message: 'Payment date cannot be in the future',
  path: ['paymentDate']
}).refine(value => Boolean(value.receiptFileId || value.receiptFileUrl), {
  message: 'Receipt proof upload is required',
  path: ['receiptFileId']
});

const rejectProofSchema = z.object({ reason: z.string().trim().min(5).max(500) });

const auditPayment = (req: AuthRequest, action: string, entityType: string, entityId?: number, metadata?: Record<string, unknown>) =>
  auditLog({
    actorUserId: req.user?.id,
    actorRole: req.user?.role,
    action,
    entityType,
    entityId,
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    metadata: maskSensitive(metadata || {})
  });

const paymentReference = () => `PAY-${new Date().getFullYear()}-${randomToken(6).toUpperCase()}`;

const handleError = (res: any, err: any) =>
  res.status(err?.statusCode || 500).json({
    success: false,
    message: err?.statusCode && err.statusCode < 500 ? err.message : safeRouteMessage(err, 'Payment operation failed'),
    code: err?.code || 'PAYMENT_OPERATION_FAILED'
  });

const listPaymentsForActor = async (where: Record<string, unknown>, window: { skip: number; take: number }) => {
  try {
    const [payments, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where,
        select: {
          id: true,
          referenceId: true,
          invoiceId: true,
          purchaseOrderId: true,
          payerId: true,
          payeeId: true,
          amount: true,
          currency: true,
          status: true,
          gateway: true,
          method: true,
          metadata: true,
          createdAt: true,
          completedAt: true,
          invoice: { select: { id: true, invoiceNumber: true, status: true, taxableAmount: true, totalTaxAmount: true, tdsAmount: true } },
          purchaseOrder: { select: { id: true, poNumber: true, title: true, status: true } },
          payer: { select: { id: true, name: true, email: true, role: true } },
          payee: { select: { id: true, name: true, email: true, role: true } },
          escrowAccount: { select: { id: true, status: true, amount: true, fundedAt: true, releasedAt: true } },
          ledgerEntries: {
            orderBy: { createdAt: 'asc' },
            take: 20,
            select: { id: true, debitAccount: true, creditAccount: true, entryType: true, amount: true, createdAt: true }
          }
        },
        orderBy: { createdAt: 'desc' },
        skip: window.skip,
        take: window.take
      }),
      prisma.paymentTransaction.count({ where })
    ]);
    return {
      payments,
      total,
      warning: null
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('Unknown field') && !message.includes('does not exist') && !message.includes('relation') && !message.includes('column')) {
      throw error;
    }

    const [payments, total] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: window.skip,
        take: window.take
      }),
      prisma.paymentTransaction.count({ where })
    ]);
    return {
      payments,
      total,
      warning: 'Payment records were loaded without newer ledger/escrow relation details. Run the latest Prisma migrations to enable the full finance view.'
    };
  }
};

const webhookHandler = async (req: any, res: any) => {
  try {
    const gateway = String(req.params.gateway || '');
    if (!['razorpay', 'cashfree', 'bank_transfer'].includes(gateway)) {
      throw new ApiError(400, 'Unsupported payment gateway', 'PAYMENT_GATEWAY_INVALID');
    }
    const rawBody = Buffer.isBuffer((req as any).rawBody)
      ? (req as any).rawBody
      : Buffer.from(JSON.stringify(req.body || {}));
    const result = await processPaymentWebhook(gateway as any, rawBody, req.headers);
    if ((result as any)?.duplicate) {
      return res.status(409).json({ success: false, message: 'Webhook replay blocked', code: 'PAYMENT_WEBHOOK_REPLAY_BLOCKED' });
    }
    res.json({ success: true, ...maskSensitive(result) });
  } catch (err: any) {
    return handleError(res, err);
  }
};

router.post('/webhook/:gateway', webhookHandler);
router.post('/webhooks/:gateway', webhookHandler);

router.use(authenticate);

router.get('/', requirePermission('payment.view'), async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const role = String(req.user?.role);
    const where = isPlatformFinanceUser(req)
      ? {}
      : role === 'buyer'
        ? { payerId: userId }
        : { payeeId: userId };
    const query = req.query as Record<string, unknown>;
    if (query.status) (where as any).status = String(query.status);
    if (query.gateway) (where as any).gateway = String(query.gateway);
    if (query.q) {
      (where as any).OR = [
        { referenceId: { contains: String(query.q), mode: 'insensitive' } },
        { invoice: { invoiceNumber: { contains: String(query.q), mode: 'insensitive' } } },
        { purchaseOrder: { poNumber: { contains: String(query.q), mode: 'insensitive' } } },
        { payer: { email: { contains: String(query.q), mode: 'insensitive' } } },
        { payee: { email: { contains: String(query.q), mode: 'insensitive' } } }
      ];
    }

    const window = getListWindow(query);
    const result = await listPaymentsForActor(where, window);
    res.json({ success: true, payments: maskSensitive(result.payments), records: maskSensitive(result.payments), total: result.total, ...window, filters: query, warning: result.warning });
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.post('/initiate', requirePermission('payment.initiate', orgScope), async (req: AuthRequest, res) => {
  try {
    const parsed = initiatePaymentSchema.parse(req.body);
    const key = parsed.idempotencyKey || idempotencyKeyFromRequest(req, `payment-initiate:${parsed.invoiceId}:${req.user?.id}`);
    const result = await withIdempotency({
      req,
      userId: Number(req.user?.id),
      route: 'POST /api/payments/initiate',
      key,
      handler: async () => {
        const payment = await initiatePayment(actorFrom(req), { ...parsed, idempotencyKey: key });
        return { success: true, ...maskSensitive(payment) };
      }
    });
    res.status(201).json(result);
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.post('/offline-proof/:proofId/verify', requirePermission('payment.verify', orgScope), async (req: AuthRequest, res) => {
  try {
    const proofId = Number(req.params.proofId);
    if (!Number.isInteger(proofId) || proofId <= 0) throw new ApiError(400, 'Invalid proof id', 'PAYMENT_PROOF_ID_INVALID');
    const proof = await (prisma as any).offlinePaymentProof.update({
      where: { id: proofId },
      data: { status: 'VERIFIED', verifiedByUserId: req.user?.id, verifiedAt: new Date(), rejectionReason: null }
    });
    if (proof.paymentTransactionId) {
      await prisma.paymentTransaction.update({
        where: { id: proof.paymentTransactionId },
        data: {
          status: 'OFFLINE_PROOF_VERIFIED',
          paymentStatus: 'OFFLINE_PROOF_VERIFIED' as any,
          completedAt: new Date(),
          paidAt: proof.paymentDate,
          version: { increment: 1 },
          metadata: { offlineProofId: proof.id, method: proof.method }
        }
      }).catch(() => undefined);
    }
    if (proof.purchaseOrderId) {
      await prisma.purchaseOrder.update({
        where: { id: proof.purchaseOrderId },
        data: { status: 'paid_offline_verified', version: { increment: 1 } }
      }).catch(() => undefined);
    }
    await auditPayment(req, 'payment.offline_proof_verified', 'offlinePaymentProof', proof.id, { purchaseOrderId: proof.purchaseOrderId });
    res.json({ success: true, proof: maskSensitive(proof) });
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.post('/offline-proof/:proofId/reject', requirePermission('payment.verify', orgScope), async (req: AuthRequest, res) => {
  try {
    const proofId = Number(req.params.proofId);
    const parsed = rejectProofSchema.parse(req.body);
    if (!Number.isInteger(proofId) || proofId <= 0) throw new ApiError(400, 'Invalid proof id', 'PAYMENT_PROOF_ID_INVALID');
    const proof = await (prisma as any).offlinePaymentProof.update({
      where: { id: proofId },
      data: { status: 'REJECTED', rejectedByUserId: req.user?.id, rejectedAt: new Date(), rejectionReason: parsed.reason }
    });
    if (proof.paymentTransactionId) {
      await prisma.paymentTransaction.update({
        where: { id: proof.paymentTransactionId },
        data: { status: 'OFFLINE_PROOF_REJECTED', paymentStatus: 'OFFLINE_PROOF_REJECTED' as any, version: { increment: 1 } }
      }).catch(() => undefined);
    }
    await auditPayment(req, 'payment.offline_proof_rejected', 'offlinePaymentProof', proof.id, { reason: parsed.reason });
    res.json({ success: true, proof: maskSensitive(proof) });
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.get('/offline-proofs', requirePermission('payment.view', orgScope), async (req: AuthRequest, res) => {
  try {
    const where: any = {};
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.buyerOrgId) where.buyerOrgId = Number(req.query.buyerOrgId);
    if (req.query.sellerOrgId) where.sellerOrgId = Number(req.query.sellerOrgId);
    if (req.query.dateFrom || req.query.dateTo) {
      where.paymentDate = {
        ...(req.query.dateFrom ? { gte: new Date(String(req.query.dateFrom)) } : {}),
        ...(req.query.dateTo ? { lte: new Date(String(req.query.dateTo)) } : {})
      };
    }
    const proofs = await (prisma as any).offlinePaymentProof.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(100, Math.max(1, Number(req.query.take || req.query.pageSize || 50)))
    });
    res.json({ success: true, proofs: maskSensitive(proofs), records: maskSensitive(proofs) });
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.post('/:orderId/pay-through-portal', requirePermission('payment.initiate', orgScope), async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ApiError(400, 'Invalid order id', 'ORDER_ID_INVALID');
    const po = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
    if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    if (!isPlatformFinanceUser(req) && po.buyerId !== req.user?.id) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    const payment = await prisma.paymentTransaction.upsert({
      where: { referenceId: String((po.metadata as any)?.paymentReference || `PO-${po.id}-PORTAL`) },
      update: {
        status: 'PORTAL_PAYMENT_INITIATED',
        paymentStatus: 'PORTAL_PAYMENT_INITIATED' as any,
        method: 'PORTAL',
        methodEnum: 'BANK_TRANSFER' as any,
        version: { increment: 1 }
      },
      create: {
        referenceId: String((po.metadata as any)?.paymentReference || `PO-${po.id}-PORTAL`),
        purchaseOrderId: po.id,
        payerId: po.buyerId,
        payeeId: po.sellerId,
        amount: po.amount,
        currency: po.currency,
        gateway: 'portal',
        gatewayEnum: 'MANUAL' as any,
        method: 'PORTAL',
        methodEnum: 'BANK_TRANSFER' as any,
        status: 'PORTAL_PAYMENT_INITIATED',
        paymentStatus: 'PORTAL_PAYMENT_INITIATED' as any,
        metadata: { source: 'pay_through_portal', purchaseOrderId: po.id }
      }
    });
    await auditPayment(req, 'payment.portal_initiated', 'paymentTransaction', payment.id, { purchaseOrderId: po.id });
    res.status(201).json({ success: true, payment: maskSensitive(payment), nextAction: 'CONTINUE_EXISTING_PORTAL_PAYMENT_FLOW' });
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.post('/:orderId/offline-proof', requirePermission('payment.initiate', orgScope), async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    const parsed = offlineProofSchema.parse(req.body);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ApiError(400, 'Invalid order id', 'ORDER_ID_INVALID');
    const po = await prisma.purchaseOrder.findUnique({
      where: { id: orderId },
      include: {
        buyer: { select: { organizationId: true } },
        seller: { select: { organizationId: true } },
        payments: { orderBy: { createdAt: 'desc' }, take: 1 }
      }
    });
    if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    if (!isPlatformFinanceUser(req) && po.buyerId !== req.user?.id) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    if (Number(parsed.amount.toFixed(2)) !== Number(Number(po.amount).toFixed(2))) {
      throw new ApiError(400, 'Offline proof amount must match the payable amount', 'PAYMENT_AMOUNT_MISMATCH');
    }
    const existingProof = await (prisma as any).offlinePaymentProof.findFirst({
      where: { buyerOrgId: po.buyer?.organizationId || req.user?.organizationId || null, transactionReference: parsed.transactionReference }
    });
    if (existingProof) throw new ApiError(409, 'Transaction reference already exists for this buyer organization', 'PAYMENT_REFERENCE_EXISTS');

    const payment = po.payments?.[0] || await prisma.paymentTransaction.create({
      data: {
        referenceId: paymentReference(),
        purchaseOrderId: po.id,
        payerId: po.buyerId,
        payeeId: po.sellerId,
        amount: po.amount,
        currency: po.currency,
        gateway: 'offline',
        gatewayEnum: 'MANUAL' as any,
        method: parsed.method,
        methodEnum: parsed.method as any,
        status: 'OFFLINE_PROOF_UPLOADED',
        paymentStatus: 'OFFLINE_PROOF_UPLOADED' as any,
        metadata: { source: 'offline_payment_proof' }
      }
    });
    if (po.payments?.[0]) {
      await prisma.paymentTransaction.update({
        where: { id: payment.id },
        data: {
          status: 'OFFLINE_PROOF_UPLOADED',
          paymentStatus: 'OFFLINE_PROOF_UPLOADED' as any,
          method: parsed.method,
          methodEnum: parsed.method as any,
          version: { increment: 1 }
        }
      });
    }
    const proof = await (prisma as any).offlinePaymentProof.create({
      data: {
        paymentTransactionId: payment.id,
        purchaseOrderId: po.id,
        buyerOrgId: po.buyer?.organizationId || req.user?.organizationId || null,
        sellerOrgId: po.seller?.organizationId || null,
        amount: parsed.amount,
        method: parsed.method,
        transactionReference: parsed.transactionReference,
        paymentDate: parsed.paymentDate,
        payerBankName: parsed.payerBankName,
        payerAccountLast4: parsed.payerAccountLast4 || null,
        beneficiaryBankName: parsed.beneficiaryBankName || null,
        receiptFileId: parsed.receiptFileId || null,
        receiptFileUrl: parsed.receiptFileUrl || null,
        remarks: parsed.remarks || null,
        status: 'UNDER_REVIEW',
        uploadedByUserId: req.user?.id
      }
    });
    await auditPayment(req, 'payment.offline_proof_uploaded', 'offlinePaymentProof', proof.id, { purchaseOrderId: po.id, method: parsed.method });
    res.status(201).json({ success: true, proof: maskSensitive(proof), paymentId: payment.id });
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.get('/:orderId/offline-proof', requirePermission('payment.view', orgScope), async (req: AuthRequest, res) => {
  try {
    const orderId = Number(req.params.orderId);
    if (!Number.isInteger(orderId) || orderId <= 0) throw new ApiError(400, 'Invalid order id', 'ORDER_ID_INVALID');
    const po = await prisma.purchaseOrder.findUnique({ where: { id: orderId } });
    if (!po) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    const allowed = isPlatformFinanceUser(req) || po.buyerId === req.user?.id || po.sellerId === req.user?.id;
    if (!allowed) throw new ApiError(404, 'Purchase order not found', 'PO_NOT_FOUND');
    const proofs = await (prisma as any).offlinePaymentProof.findMany({ where: { purchaseOrderId: orderId }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, proofs: maskSensitive(proofs), proof: maskSensitive(proofs[0] || null) });
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.get('/:id/status', requirePermission('payment.view', orgScope), async (req: AuthRequest, res) => {
  try {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) throw new ApiError(400, 'Invalid payment id', 'PAYMENT_ID_INVALID');
    const payment = await prisma.paymentTransaction.findUnique({
      where: { id: paymentId },
      include: { escrowAccount: { include: { milestones: true, transactions: true } }, ledgerEntries: true }
    });
    if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    if (!isPlatformFinanceUser(req) && payment.payerId !== req.user?.id && payment.payeeId !== req.user?.id) {
      throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    }
    res.json({ success: true, payment: maskSensitive(payment) });
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.get('/:id', requirePermission('payment.view', orgScope), async (req: AuthRequest, res) => {
  try {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) throw new ApiError(400, 'Invalid payment id', 'PAYMENT_ID_INVALID');
    const payment = await prisma.paymentTransaction.findUnique({
      where: { id: paymentId },
      include: { escrowAccount: { include: { milestones: true, transactions: true } }, ledgerEntries: { orderBy: { createdAt: 'asc' } } }
    });
    if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    if (!isPlatformFinanceUser(req) && payment.payerId !== req.user?.id && payment.payeeId !== req.user?.id) {
      throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    }
    res.json({ success: true, payment: maskSensitive(payment) });
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.post('/:id/reconcile', requirePermission('payment.verify', orgScope), async (req: AuthRequest, res) => {
  try {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) throw new ApiError(400, 'Invalid payment id', 'PAYMENT_ID_INVALID');
    const status = String(req.body?.status || '').trim();
    if (!['success', 'failed', 'refunded', 'cancelled'].includes(status)) {
      throw new ApiError(400, 'Invalid reconciliation status', 'PAYMENT_RECONCILE_STATUS_INVALID');
    }
    const key = idempotencyKeyFromRequest(req, `payment-reconcile:${paymentId}:${status}:${req.user?.id}`);
    const result = await withIdempotency({
      req,
      userId: Number(req.user?.id),
      route: 'POST /api/payments/:id/reconcile',
      key,
      handler: async () => ({
        success: true,
        ...maskSensitive(await reconcilePayment(actorFrom(req), paymentId, {
          status: status as any,
          remarks: req.body?.remarks,
          reversalLedgerEntryId: req.body?.reversalLedgerEntryId ? Number(req.body.reversalLedgerEntryId) : undefined
        }))
      })
    });
    res.json(result);
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.post('/:id/simulate-success', requirePermission('payment.initiate', orgScope), async (req: AuthRequest, res) => {
  try {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) {
      throw new ApiError(400, 'Invalid payment id', 'PAYMENT_ID_INVALID');
    }
    const payment = await prisma.paymentTransaction.findUnique({
      where: { id: paymentId }
    });
    if (!payment) {
      throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    }
    if (!isPlatformFinanceUser(req) && payment.payerId !== req.user?.id) {
      throw new ApiError(403, 'Forbidden to simulate payment success for others', 'PAYMENT_FORBIDDEN');
    }
    const result = await markPaymentConfirmedFromGateway(paymentId, {
      gatewayPaymentId: `pay_sim_${randomToken(10)}`,
      gatewayOrderId: payment.gatewayOrderId || `rzp_order_sim_${randomToken(10)}`
    });
    res.json({ success: true, message: 'Payment success simulated successfully', ...maskSensitive(result) });
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.post('/:id/success', requireAccountType('BUYER', 'SUPERADMIN'), async (_req: AuthRequest, res) => {
  res.status(202).json({
    success: false,
    message: 'Payment success must be confirmed by a verified backend webhook. Client-side success was not trusted.',
    code: 'PAYMENT_WEBHOOK_REQUIRED'
  });
});

export default router;
