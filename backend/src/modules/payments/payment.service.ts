import prisma from '../../config/prisma.js';
import { env } from '../../config/env.js';
import { auditLog } from '../audit/audit.service.js';
import { ApiError } from '../../utils/ApiError.js';
import { maskSensitive } from '../../utils/maskSensitive.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import { withDistributedLock } from '../../utils/redisLock.js';
import { redisKeys } from '../../constants/redis-keys.js';
import { getCache, setCache } from '../../services/cache.service.js';
import { notificationService } from '../../services/notification.service.js';
import { bankTransferProvider } from './bank-transfer.provider.js';
import { cashfreeProvider } from './cashfree.provider.js';
import { razorpayProvider } from './razorpay.provider.js';
import type { PaymentGateway, PaymentProvider } from './payment.provider.js';
import { paymentStatusEnumFor } from '../../services/workflow/status-transition.service.js';

type Actor = {
  id: number;
  role: string;
  ipAddress?: string;
  userAgent?: string;
};

const providers: Record<PaymentGateway, PaymentProvider> = {
  razorpay: razorpayProvider,
  cashfree: cashfreeProvider,
  bank_transfer: bankTransferProvider
};

const providerFor = (gateway?: string) => {
  const selected = (gateway || env.PAYMENT_PROVIDER) as PaymentGateway;
  return providers[selected] || providers.bank_transfer;
};

const paymentReference = () => `PAY-${new Date().getFullYear()}-${randomToken(6).toUpperCase()}`;
const gatewayEnumFor = (gateway: string) => gateway.toUpperCase();
const methodEnumFor = (method: string) => method === 'netbanking' ? 'NET_BANKING' : method.toUpperCase();

const auditPayment = (actor: Actor | null, action: string, entityType: string, entityId: number | undefined, metadata?: Record<string, unknown>) =>
  auditLog({
    actorUserId: actor?.id,
    actorRole: actor?.role,
    action,
    entityType,
    entityId,
    ipAddress: actor?.ipAddress,
    userAgent: actor?.userAgent,
    metadata: maskSensitive(metadata || {})
  });

const notifySafe = async (userId: number, title: string, message: string, type: string) => {
  await notificationService.notifyWithEmail(userId, {
    title,
    message,
    type,
    priority: type.includes('failed') || type.includes('frozen') ? 'high' : 'medium',
    redirectUrl: '/dashboard'
  });
};

const paymentLookup = (referenceId?: string, gatewayOrderId?: string) => {
  const clauses = [
    referenceId ? { referenceId } : undefined,
    gatewayOrderId ? { gatewayOrderId } : undefined
  ].filter(Boolean) as Array<Record<string, string>>;
  if (clauses.length === 0) throw new ApiError(400, 'Webhook does not include a payment reference', 'PAYMENT_REFERENCE_MISSING');
  return { OR: clauses };
};

export const initiatePayment = async (
  actor: Actor,
  input: { invoiceId: number; gateway?: PaymentGateway; method?: string; idempotencyKey?: string }
) => withDistributedLock(redisKeys.lockPayment(`invoice:${input.invoiceId}`), async () => {
  const provider = providerFor(input.gateway);
  const result = await prisma.$transaction(async (tx) => {
    const invoice = await tx.invoice.findUnique({ where: { id: input.invoiceId }, include: { purchaseOrder: true } });
    if (!invoice) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    if (actor.role !== 'admin' && invoice.buyerId !== actor.id) throw new ApiError(404, 'Invoice not found', 'INVOICE_NOT_FOUND');
    if (!['approved', 'payment_initiated', 'submitted'].includes(invoice.status)) {
      throw new ApiError(409, 'Invoice is not eligible for payment initiation', 'INVOICE_PAYMENT_NOT_ELIGIBLE');
    }

    const existing = await tx.paymentTransaction.findFirst({ where: { invoiceId: invoice.id, status: { notIn: ['failed', 'cancelled', 'refunded'] } } });
    if (existing?.status === 'success' || existing?.status === 'escrow_released') {
      throw new ApiError(409, 'Payment already completed for this invoice', 'PAYMENT_ALREADY_COMPLETED');
    }
    const payment = existing || await tx.paymentTransaction.create({
      data: {
        referenceId: paymentReference(),
        invoiceId: invoice.id,
        purchaseOrderId: invoice.purchaseOrderId,
        payerId: invoice.buyerId,
        payeeId: invoice.sellerId,
        amount: invoice.amount,
        currency: invoice.currency,
        status: 'initiated',
        paymentStatus: paymentStatusEnumFor('initiated') as any,
        metadata: { source: 'payment_initiation' }
      }
    });

    const order = await provider.createOrder({
      paymentId: payment.id,
      referenceId: payment.referenceId,
      amount: String(payment.amount),
      currency: payment.currency,
      buyerId: payment.payerId,
      sellerId: payment.payeeId,
      invoiceId: payment.invoiceId,
      purchaseOrderId: payment.purchaseOrderId
    });

    const updated = await tx.paymentTransaction.update({
      where: { id: payment.id },
      data: {
        gateway: provider.gateway,
        gatewayEnum: gatewayEnumFor(provider.gateway) as any,
        method: input.method || 'bank_transfer',
        methodEnum: methodEnumFor(input.method || 'bank_transfer') as any,
        gatewayOrderId: payment.gatewayOrderId || order.gatewayOrderId,
        gatewaySignatureStatus: 'pending',
        idempotencyKey: input.idempotencyKey,
        status: 'gateway_order_created',
        paymentStatus: paymentStatusEnumFor('gateway_order_created') as any,
        metadata: {
          ...(payment.metadata as Record<string, unknown> || {}),
          providerOrder: {
            gateway: order.gateway,
            gatewayOrderId: order.gatewayOrderId,
            referenceId: order.referenceId || payment.referenceId,
            amount: order.amount || String(payment.amount),
            currency: order.currency || payment.currency,
            expiresAt: order.expiresAt
          },
          providerInstructions: order.instructions,
          tokenIssued: Boolean(order.paymentToken),
          taxSummary: {
            taxableAmount: invoice.taxableAmount,
            cgstAmount: invoice.cgstAmount,
            sgstAmount: invoice.sgstAmount,
            igstAmount: invoice.igstAmount,
            totalTaxAmount: invoice.totalTaxAmount,
            tdsAmount: invoice.tdsAmount
          }
        }
      }
    });

    await tx.invoice.update({
      where: { id: invoice.id },
      data: { status: 'payment_initiated', version: { increment: 1 } }
    });

    return { invoice, payment: updated, order };
  });

  await auditPayment(actor, 'payment.initiated', 'paymentTransaction', result.payment.id, {
    gateway: result.payment.gateway,
    method: result.payment.method,
    invoiceId: result.payment.invoiceId
  });
  await notifySafe(result.payment.payerId, 'Payment initiated', `Payment ${result.payment.referenceId} has been initiated.`, 'payment_initiated');

  return result;
}, { ttlMs: 15_000 });

export const processPaymentWebhook = async (
  gateway: PaymentGateway,
  rawBody: Buffer,
  headers: Record<string, string | string[] | undefined>
) => {
  const provider = providerFor(gateway);
  const rawPayloadHash = sha256(rawBody.toString('utf8'));
  const verified = provider.verifyWebhook(rawBody, headers);
  const eventId = verified.eventId || rawPayloadHash;
  const webhookKey = redisKeys.webhook(gateway, eventId);

  if (await getCache(webhookKey)) {
    const existing = await prisma.paymentWebhookEvent.findUnique({
      where: { paymentWebhookEventCompound: { gateway, eventId } }
    });
    if (existing?.processed) {
      await auditPayment(null, 'payment.webhook.duplicate_ignored', 'paymentWebhookEvent', existing.id, { gateway, eventId });
      return { duplicate: true, processed: true };
    }
  }

  return withDistributedLock(webhookKey, async () => {
    const existing = await prisma.paymentWebhookEvent.findUnique({
      where: { paymentWebhookEventCompound: { gateway, eventId } }
    });
    if (existing?.processed) {
      await auditPayment(null, 'payment.webhook.duplicate_ignored', 'paymentWebhookEvent', existing.id, { gateway, eventId });
      return { duplicate: true, processed: true };
    }

    const event = existing || await prisma.paymentWebhookEvent.create({
      data: {
        gateway,
        eventId,
        eventType: verified.eventType,
        rawPayloadHash,
        verified: verified.verified,
        processed: false,
        failureReason: verified.failureReason,
        metadata: verified.metadata as any
      }
    });

    if (!verified.verified) {
      await prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { verified: false, processed: true, processedAt: new Date(), failureReason: verified.failureReason || 'Signature verification failed' }
      });
      await setCache(webhookKey, { processed: true, verified: false }, 24 * 60 * 60);
      await auditPayment(null, 'payment.webhook.failed_verification', 'paymentWebhookEvent', event.id, { gateway, eventId });
      throw new ApiError(401, 'Invalid payment webhook signature', 'PAYMENT_WEBHOOK_SIGNATURE_INVALID');
    }

    if (verified.status === 'failed') {
      const failedPayment = await prisma.paymentTransaction.findFirst({
        where: paymentLookup(verified.referenceId, verified.gatewayOrderId) as any
      });
      if (failedPayment && !['success', 'escrow_released'].includes(failedPayment.status)) {
        await prisma.paymentTransaction.update({
          where: { id: failedPayment.id },
          data: {
            status: 'failed',
            paymentStatus: paymentStatusEnumFor('failed') as any,
            gatewaySignatureStatus: 'verified',
            gatewayPaymentId: verified.gatewayPaymentId || failedPayment.gatewayPaymentId,
            providerPaymentId: verified.gatewayPaymentId || failedPayment.providerPaymentId,
            version: { increment: 1 }
          }
        });
        await auditPayment(null, 'payment.failed', 'paymentTransaction', failedPayment.id, { gateway, eventId });
        await notifySafe(failedPayment.payerId, 'Payment failed', `Payment ${failedPayment.referenceId} failed at the gateway.`, 'payment_failed');
      }
      await prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { verified: true, processed: true, processedAt: new Date(), metadata: verified.metadata as any }
      });
      await setCache(webhookKey, { processed: true, status: 'failed' }, 24 * 60 * 60);
      return { verified: true, processed: true, failed: true };
    }

    if (verified.status !== 'success') {
      await prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { verified: true, processed: true, processedAt: new Date(), metadata: verified.metadata as any }
      });
      await setCache(webhookKey, { processed: true, status: 'ignored' }, 24 * 60 * 60);
      return { verified: true, processed: true, ignored: true };
    }

    const payment = await prisma.paymentTransaction.findFirst({
      where: paymentLookup(verified.referenceId, verified.gatewayOrderId) as any
    });
    if (!payment) {
      await prisma.paymentWebhookEvent.update({
        where: { id: event.id },
        data: { verified: true, processed: true, processedAt: new Date(), failureReason: 'Payment reference not found' }
      });
      throw new ApiError(404, 'Payment reference not found', 'PAYMENT_REFERENCE_NOT_FOUND');
    }

    const updated = await markPaymentConfirmedFromGateway(payment.id, {
      gatewayPaymentId: verified.gatewayPaymentId,
      gatewayOrderId: verified.gatewayOrderId,
      eventId: event.id
    });

    await prisma.paymentWebhookEvent.update({
      where: { id: event.id },
      data: { verified: true, processed: true, processedAt: new Date(), metadata: verified.metadata as any }
    });
    await setCache(webhookKey, { processed: true, status: 'success' }, 24 * 60 * 60);
    return { verified: true, processed: true, payment: updated.payment, escrowAccount: updated.escrowAccount };
  });
};

export const markPaymentConfirmedFromGateway = async (
  paymentId: number,
  input: { gatewayPaymentId?: string; gatewayOrderId?: string; eventId?: number } = {}
) => withDistributedLock(redisKeys.lockPayment(paymentId), async () => {
  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.paymentTransaction.findUnique({ where: { id: paymentId } });
    if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
    if (['success', 'escrow_released'].includes(payment.status)) {
      const escrowAccount = await tx.escrowAccount.findUnique({ where: { paymentTransactionId: payment.id } });
      return { payment, escrowAccount, reused: true };
    }

    const updatedPayment = await tx.paymentTransaction.update({
      where: { id: payment.id, version: payment.version },
      data: {
        status: 'success',
        paymentStatus: paymentStatusEnumFor('success') as any,
        gatewayOrderId: input.gatewayOrderId || payment.gatewayOrderId,
        gatewayPaymentId: input.gatewayPaymentId || payment.gatewayPaymentId,
        providerPaymentId: input.gatewayPaymentId || payment.providerPaymentId,
        gatewaySignatureStatus: 'verified',
        completedAt: new Date(),
        paidAt: new Date(),
        version: { increment: 1 }
      }
    });

    if (payment.invoiceId) {
      await tx.invoice.update({ where: { id: payment.invoiceId }, data: { status: 'paid', version: { increment: 1 } } });
    }
    if (payment.purchaseOrderId) {
      await tx.purchaseOrder.update({ where: { id: payment.purchaseOrderId }, data: { status: 'escrow_held', version: { increment: 1 } } });
    }

    const existingLedger = await tx.financialLedgerEntry.findFirst({
      where: { transactionId: payment.id, entryType: 'payment_success' }
    });
    const ledgerEntry = existingLedger || await tx.financialLedgerEntry.create({
      data: {
        transactionId: payment.id,
        entityType: 'payment',
        entityId: payment.id,
        debitAccount: `buyer:${payment.payerId}`,
        creditAccount: 'escrow:platform',
        amount: payment.amount,
        currency: payment.currency,
        entryType: 'payment_success',
        metadata: { invoiceId: payment.invoiceId, purchaseOrderId: payment.purchaseOrderId, webhookEventId: input.eventId }
      }
    });

    const escrowAccount = await tx.escrowAccount.upsert({
      where: { paymentTransactionId: payment.id },
      update: { status: 'held', fundedAt: new Date(), version: { increment: 1 } },
      create: {
        paymentTransactionId: payment.id,
        purchaseOrderId: payment.purchaseOrderId,
        buyerId: payment.payerId,
        sellerId: payment.payeeId,
        amount: payment.amount,
        currency: payment.currency,
        status: 'held',
        fundedAt: new Date(),
        metadata: { ledgerEntryId: ledgerEntry.id }
      }
    });

    const existingEscrowTxn = await tx.escrowTransaction.findFirst({
      where: { escrowAccountId: escrowAccount.id, type: 'deposit' }
    });
    if (!existingEscrowTxn) {
      await tx.escrowTransaction.create({
        data: {
          escrowAccountId: escrowAccount.id,
          type: 'deposit',
          amount: payment.amount,
          currency: payment.currency,
          ledgerEntryId: ledgerEntry.id,
          metadata: { paymentTransactionId: payment.id }
        }
      });
    }

    return { payment: updatedPayment, escrowAccount, ledgerEntry, reused: false };
  });

  await auditPayment(null, 'payment.successful', 'paymentTransaction', result.payment.id, {
    escrowAccountId: result.escrowAccount?.id,
    reused: result.reused
  });
  await notifySafe(result.payment.payerId, 'Payment confirmed', `Payment ${result.payment.referenceId} is confirmed and held in escrow.`, 'payment_successful');
  await notifySafe(result.payment.payeeId, 'Escrow funded', `Escrow has been funded for payment ${result.payment.referenceId}.`, 'escrow_funded');

  return result;
}, { ttlMs: 15_000 });

export const createLedgerReversalEntry = async (
  actor: Actor,
  ledgerEntryId: number,
  reason?: string
) => {
  if (actor.role !== 'admin') throw new ApiError(403, 'Only admins can reverse ledger entries', 'LEDGER_REVERSAL_ADMIN_ONLY');
  const original = await prisma.financialLedgerEntry.findUnique({ where: { id: ledgerEntryId } });
  if (!original) throw new ApiError(404, 'Ledger entry not found', 'LEDGER_ENTRY_NOT_FOUND');
  const existing = await prisma.financialLedgerEntry.findFirst({
    where: { entryType: 'reversal', metadata: { path: ['reversalOfEntryId'], equals: ledgerEntryId } as any }
  });
  if (existing) return { reversal: existing, reused: true };
  const reversal = await prisma.financialLedgerEntry.create({
    data: {
      transactionId: original.transactionId,
      entityType: original.entityType,
      entityId: original.entityId,
      debitAccount: original.creditAccount,
      creditAccount: original.debitAccount,
      amount: original.amount,
      currency: original.currency,
      entryType: 'reversal',
      metadata: {
        reversalOfEntryId: original.id,
        originalEntryType: original.entryType,
        reason
      }
    }
  });
  await auditPayment(actor, 'ledger.reversal_created', 'financialLedgerEntry', reversal.id, { originalEntryId: original.id, reason });
  return { reversal, reused: false };
};

export const reconcilePayment = async (
  actor: Actor,
  paymentId: number,
  input: { status: 'success' | 'failed' | 'refunded' | 'cancelled'; remarks?: string; reversalLedgerEntryId?: number }
) => {
  if (actor.role !== 'admin') throw new ApiError(403, 'Only admins can reconcile payments', 'PAYMENT_RECONCILE_ADMIN_ONLY');
  return withDistributedLock(`${redisKeys.lockPayment(paymentId)}:reconcile`, async () => {
    if (input.status === 'success') {
      return markPaymentConfirmedFromGateway(paymentId, {});
    }
    const result = await prisma.$transaction(async (tx) => {
      const payment = await tx.paymentTransaction.findUnique({ where: { id: paymentId } });
      if (!payment) throw new ApiError(404, 'Payment not found', 'PAYMENT_NOT_FOUND');
      if (payment.status === input.status) return { payment, reused: true };
      const updated = await tx.paymentTransaction.update({
        where: { id: payment.id, version: payment.version },
        data: {
          status: input.status,
          paymentStatus: paymentStatusEnumFor(input.status) as any,
          metadata: { ...(payment.metadata as any || {}), reconcileRemarks: input.remarks },
          version: { increment: 1 }
        }
      });
      return { payment: updated, reused: false };
    });
    if (input.reversalLedgerEntryId) {
      await createLedgerReversalEntry(actor, input.reversalLedgerEntryId, input.remarks);
    }
    await auditPayment(actor, 'payment.reconciled', 'paymentTransaction', paymentId, input);
    return result;
  }, { ttlMs: 15_000 });
};

export const listEscrowAccounts = async (actor: Actor, window: { skip?: number; take?: number; q?: string; status?: string } = {}) => {
  const where: any = actor.role === 'admin' ? {} : actor.role === 'buyer' ? { buyerId: actor.id } : { sellerId: actor.id };
  if (window.status) where.status = window.status;
  if (window.q) {
    where.OR = [
      { paymentTransaction: { referenceId: { contains: window.q, mode: 'insensitive' } } },
      { purchaseOrder: { poNumber: { contains: window.q, mode: 'insensitive' } } }
    ];
  }
  const skip = Math.max(0, Number(window.skip ?? 0));
  const take = Math.min(100, Math.max(1, Number(window.take ?? 50)));
  const [escrowAccounts, total] = await Promise.all([
    prisma.escrowAccount.findMany({
      where,
      include: {
        paymentTransaction: true,
        purchaseOrder: { select: { id: true, poNumber: true, status: true } },
        // Include buyer and seller display info so the UI can show real names
        // instead of "Buyer #12 / Seller #9". Limit fields to keep payload lean.
        buyer: { select: { id: true, name: true, email: true } },
        seller: { select: { id: true, name: true, email: true } },
        milestones: { include: { approvals: true, transactions: true }, orderBy: { createdAt: 'asc' } },
        transactions: { orderBy: { createdAt: 'asc' } }
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take
    }),
    prisma.escrowAccount.count({ where })
  ]);
  return { escrowAccounts, total, skip, take };
};

export const createMilestone = async (
  actor: Actor,
  escrowAccountId: number,
  input: { title: string; description?: string; amount: number; dueDate?: string; metadata?: Record<string, unknown> }
) => withDistributedLock(redisKeys.lockEscrow(escrowAccountId), async () => {
  const escrow = await prisma.escrowAccount.findUnique({ where: { id: escrowAccountId } });
  if (!escrow) throw new ApiError(404, 'Escrow account not found', 'ESCROW_NOT_FOUND');
  if (actor.role !== 'admin' && escrow.buyerId !== actor.id) throw new ApiError(404, 'Escrow account not found', 'ESCROW_NOT_FOUND');
  if (escrow.status === 'frozen') throw new ApiError(409, 'Escrow is frozen', 'ESCROW_FROZEN');

  const milestone = await prisma.milestone.create({
    data: {
      escrowAccountId,
      title: input.title,
      description: input.description,
      amount: input.amount,
      currency: escrow.currency,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      metadata: maskSensitive(input.metadata || {}) as any
    }
  });
  await auditPayment(actor, 'escrow.milestone.created', 'milestone', milestone.id, { escrowAccountId });
  return milestone;
}, { ttlMs: 10_000 });

export const completeMilestone = async (actor: Actor, milestoneId: number) => withDistributedLock(redisKeys.lockMilestone(milestoneId), async () => {
  const milestone = await prisma.milestone.findUnique({ where: { id: milestoneId }, include: { escrowAccount: true } });
  if (!milestone) throw new ApiError(404, 'Milestone not found', 'MILESTONE_NOT_FOUND');
  if (actor.role !== 'admin' && milestone.escrowAccount.sellerId !== actor.id) throw new ApiError(404, 'Milestone not found', 'MILESTONE_NOT_FOUND');
  if (milestone.escrowAccount.status === 'frozen') throw new ApiError(409, 'Escrow is frozen', 'ESCROW_FROZEN');

  const updated = await prisma.milestone.update({
    where: { id: milestone.id, version: milestone.version },
    data: { status: 'completed', completedAt: new Date(), version: { increment: 1 } }
  });
  await auditPayment(actor, 'escrow.milestone.completed', 'milestone', milestone.id, { escrowAccountId: milestone.escrowAccountId });
  await notifySafe(milestone.escrowAccount.buyerId, 'Milestone completed', `${milestone.title} is ready for approval.`, 'milestone_completed');
  return updated;
}, { ttlMs: 10_000 });

export const approveMilestone = async (actor: Actor, milestoneId: number, reason?: string) =>
  withDistributedLock(`${redisKeys.lockMilestone(milestoneId)}:release`, async () => {
    const result = await prisma.$transaction(async (tx) => {
      const milestone = await tx.milestone.findUnique({ where: { id: milestoneId }, include: { escrowAccount: true } });
      if (!milestone) throw new ApiError(404, 'Milestone not found', 'MILESTONE_NOT_FOUND');
      if (actor.role !== 'admin' && milestone.escrowAccount.buyerId !== actor.id) throw new ApiError(404, 'Milestone not found', 'MILESTONE_NOT_FOUND');
      if (milestone.escrowAccount.status === 'frozen') throw new ApiError(409, 'Escrow is frozen', 'ESCROW_FROZEN');
      if (milestone.status === 'approved') {
        const approval = await tx.milestoneApproval.findFirst({ where: { milestoneId: milestone.id }, orderBy: { createdAt: 'desc' } });
        return { milestone, approval, reused: true };
      }

      const approved = await tx.milestone.update({
        where: { id: milestone.id, version: milestone.version },
        data: { status: 'approved', approvedAt: new Date(), version: { increment: 1 } }
      });

      const approval = await tx.milestoneApproval.create({
        data: { milestoneId: milestone.id, approverId: actor.id, role: actor.role, status: 'approved', reason }
      });

      const ledgerEntry = await tx.financialLedgerEntry.create({
        data: {
          transactionId: milestone.escrowAccount.paymentTransactionId,
          entityType: 'milestone',
          entityId: milestone.id,
          debitAccount: 'escrow:platform',
          creditAccount: `seller:${milestone.escrowAccount.sellerId}`,
          amount: milestone.amount,
          currency: milestone.currency,
          entryType: 'milestone_release',
          metadata: { escrowAccountId: milestone.escrowAccountId }
        }
      });

      await tx.escrowTransaction.create({
        data: {
          escrowAccountId: milestone.escrowAccountId,
          milestoneId: milestone.id,
          type: 'release',
          amount: milestone.amount,
          currency: milestone.currency,
          ledgerEntryId: ledgerEntry.id,
          metadata: { approvalId: approval.id }
        }
      });

      const pending = await tx.milestone.count({
        where: { escrowAccountId: milestone.escrowAccountId, status: { not: 'approved' } }
      });
      if (pending === 0) {
        await tx.escrowAccount.update({
          where: { id: milestone.escrowAccountId },
          data: { status: 'released', releasedAt: new Date(), version: { increment: 1 } }
        });
        await tx.paymentTransaction.update({
          where: { id: milestone.escrowAccount.paymentTransactionId },
          data: { status: 'escrow_released', version: { increment: 1 } }
        });
      }

      return { milestone: approved, approval, ledgerEntry, reused: false };
    });

    await auditPayment(actor, 'escrow.milestone.approved', 'milestone', milestoneId, { reused: result.reused });
    return result;
  });

export const freezeEscrow = async (actor: Actor, escrowAccountId: number, reason?: string) => withDistributedLock(redisKeys.lockEscrow(escrowAccountId), async () => {
  const escrow = await prisma.escrowAccount.findUnique({ where: { id: escrowAccountId } });
  if (!escrow) throw new ApiError(404, 'Escrow account not found', 'ESCROW_NOT_FOUND');
  if (actor.role !== 'admin' && escrow.buyerId !== actor.id) throw new ApiError(404, 'Escrow account not found', 'ESCROW_NOT_FOUND');
  const updated = await prisma.escrowAccount.update({
    where: { id: escrow.id, version: escrow.version },
    data: { status: 'frozen', frozenAt: new Date(), version: { increment: 1 }, metadata: { ...(escrow.metadata as any || {}), freezeReason: reason } }
  });
  await auditPayment(actor, 'escrow.frozen', 'escrowAccount', escrow.id, { reason });
  await notifySafe(escrow.sellerId, 'Escrow frozen', 'An escrow account has been frozen for review.', 'escrow_frozen');
  return updated;
}, { ttlMs: 10_000 });

export const unfreezeEscrow = async (actor: Actor, escrowAccountId: number, reason?: string) => withDistributedLock(redisKeys.lockEscrow(escrowAccountId), async () => {
  const escrow = await prisma.escrowAccount.findUnique({ where: { id: escrowAccountId } });
  if (!escrow) throw new ApiError(404, 'Escrow account not found', 'ESCROW_NOT_FOUND');
  if (actor.role !== 'admin' && escrow.buyerId !== actor.id) throw new ApiError(403, 'Only admins or the buyer can unfreeze escrow', 'ESCROW_UNFREEZE_UNAUTHORIZED');
  if (escrow.status !== 'frozen') return escrow;
  const updated = await prisma.escrowAccount.update({
    where: { id: escrow.id, version: escrow.version },
    data: { status: 'held', escrowStatus: 'HELD', version: { increment: 1 }, metadata: { ...(escrow.metadata as any || {}), unfreezeReason: reason } }
  });
  await auditPayment(actor, 'escrow.unfrozen', 'escrowAccount', escrow.id, { reason });
  return updated;
}, { ttlMs: 10_000 });

export const refundEscrow = async (actor: Actor, escrowAccountId: number, reason?: string) =>
  withDistributedLock(`${redisKeys.lockEscrow(escrowAccountId)}:refund`, async () => {
    const result = await prisma.$transaction(async (tx) => {
      const escrow = await tx.escrowAccount.findUnique({ where: { id: escrowAccountId } });
      if (!escrow) throw new ApiError(404, 'Escrow account not found', 'ESCROW_NOT_FOUND');
      if (actor.role !== 'admin') throw new ApiError(403, 'Only admins can refund escrow', 'ESCROW_REFUND_ADMIN_ONLY');
      if (escrow.status === 'refunded') return { escrow, reused: true };

      const ledgerEntry = await tx.financialLedgerEntry.create({
        data: {
          transactionId: escrow.paymentTransactionId,
          entityType: 'escrow',
          entityId: escrow.id,
          debitAccount: 'escrow:platform',
          creditAccount: `buyer:${escrow.buyerId}`,
          amount: escrow.amount,
          currency: escrow.currency,
          entryType: 'escrow_refund',
          metadata: { reason }
        }
      });
      const updated = await tx.escrowAccount.update({
        where: { id: escrow.id, version: escrow.version },
        data: { status: 'refunded', version: { increment: 1 }, metadata: { ...(escrow.metadata as any || {}), refundReason: reason } }
      });
      await tx.escrowTransaction.create({
        data: {
          escrowAccountId: escrow.id,
          type: 'refund',
          amount: escrow.amount,
          currency: escrow.currency,
          ledgerEntryId: ledgerEntry.id,
          metadata: { reason }
        }
      });
      return { escrow: updated, ledgerEntry, reused: false };
    });
    await auditPayment(actor, 'escrow.refunded', 'escrowAccount', escrowAccountId, { reason, reused: result.reused });
    return result;
  });
