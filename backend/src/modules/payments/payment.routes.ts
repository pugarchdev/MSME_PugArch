import { Router } from 'express';
import { authenticate, authorize } from '../../middleware/auth.js';
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
import prisma from '../../config/prisma.js';
import { safeRouteMessage } from '../../utils/routeHelpers.js';
import { randomToken } from '../../utils/crypto.js';

const router = Router();

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

router.get('/', authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const userId = Number(req.user?.id);
    const role = String(req.user?.role);
    const where = role === 'admin'
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

router.post('/initiate', authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
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

router.get('/:id/status', authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) throw new ApiError(400, 'Invalid payment id', 'PAYMENT_ID_INVALID');
    const payment = await prisma.paymentTransaction.findUnique({
      where: { id: paymentId },
      include: { escrowAccount: { include: { milestones: true, transactions: true } }, ledgerEntries: true }
    });
    if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    if (req.user?.role !== 'admin' && payment.payerId !== req.user?.id && payment.payeeId !== req.user?.id) {
      throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    }
    res.json({ success: true, payment: maskSensitive(payment) });
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.get('/:id', authorize('buyer', 'seller', 'admin'), async (req: AuthRequest, res) => {
  try {
    const paymentId = Number(req.params.id);
    if (!Number.isInteger(paymentId) || paymentId <= 0) throw new ApiError(400, 'Invalid payment id', 'PAYMENT_ID_INVALID');
    const payment = await prisma.paymentTransaction.findUnique({
      where: { id: paymentId },
      include: { escrowAccount: { include: { milestones: true, transactions: true } }, ledgerEntries: { orderBy: { createdAt: 'asc' } } }
    });
    if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    if (req.user?.role !== 'admin' && payment.payerId !== req.user?.id && payment.payeeId !== req.user?.id) {
      throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    }
    res.json({ success: true, payment: maskSensitive(payment) });
  } catch (err: any) {
    return handleError(res, err);
  }
});

router.post('/:id/reconcile', authorize('admin'), async (req: AuthRequest, res) => {
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

router.post('/:id/simulate-success', authorize('buyer', 'admin'), async (req: AuthRequest, res) => {
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
    if (req.user?.role !== 'admin' && payment.payerId !== req.user?.id) {
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

router.post('/:id/success', authorize('buyer', 'admin'), async (_req: AuthRequest, res) => {
  res.status(202).json({
    success: false,
    message: 'Payment success must be confirmed by a verified backend webhook. Client-side success was not trusted.',
    code: 'PAYMENT_WEBHOOK_REQUIRED'
  });
});

export default router;
