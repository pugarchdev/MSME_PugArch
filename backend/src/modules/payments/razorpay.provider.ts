import crypto from 'crypto';
import { env } from '../../config/env.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import type { PaymentProvider, VerifiedWebhook } from './payment.provider.js';

const safeJson = (rawBody: Buffer) => {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return {};
  }
};

const hmac = (rawBody: Buffer, secret: string) =>
  crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

const verifyTimestamp = (headers: Record<string, string | string[] | undefined>): boolean => {
  const timestampHeader = String(headers['x-razorpay-timestamp'] || headers['x-razorpay-request-timestamp'] || '');
  if (!timestampHeader) return false;
  const timestamp = Number(timestampHeader);
  if (Number.isNaN(timestamp)) return false;
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  return diff <= WEBHOOK_TIMESTAMP_TOLERANCE_MS;
};

export const razorpayProvider: PaymentProvider = {
  gateway: 'razorpay',

  async createOrder(input) {
    return {
      gateway: 'razorpay',
      gatewayOrderId: `rzp_order_${randomToken(12)}`,
      paymentToken: env.RAZORPAY_KEY_ID,
      referenceId: input.referenceId,
      amount: input.amount,
      currency: input.currency,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      instructions: 'Use the gateway order id with Razorpay Checkout. Do not send or store card data on this server.'
    };
  },

  verifyWebhook(rawBody, headers): VerifiedWebhook {
    const payload = safeJson(rawBody);
    const eventId = String(headers['x-razorpay-event-id'] || payload.event_id || sha256(rawBody.toString('utf8')).slice(0, 32));
    const eventType = String(payload.event || 'unknown');
    const signature = String(headers['x-razorpay-signature'] || '');
    const secret = env.RAZORPAY_WEBHOOK_SECRET || '';
    const signatureValid = Boolean(secret && signature && signature === hmac(rawBody, secret));
    const timestampValid = verifyTimestamp(headers);
    const verified = signatureValid && timestampValid;
    const payment = payload?.payload?.payment?.entity || {};
    const order = payload?.payload?.order?.entity || {};
    const statusText = String(payment.status || order.status || '').toLowerCase();

    return {
      verified,
      eventId,
      eventType,
      status: ['captured', 'authorized', 'paid'].includes(statusText) ? 'success' : statusText === 'failed' ? 'failed' : 'ignored',
      referenceId: String(payment.notes?.referenceId || order.notes?.referenceId || ''),
      gatewayOrderId: String(payment.order_id || order.id || ''),
      gatewayPaymentId: String(payment.id || ''),
      failureReason: verified ? undefined : (!signatureValid ? 'Invalid Razorpay webhook signature' : 'Webhook timestamp outside acceptable window'),
      metadata: { providerStatus: statusText }
    };
  }
};
