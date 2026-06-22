import crypto from 'crypto';
import { env } from '../../config/env.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import type { PaymentProvider, VerifiedWebhook } from './payment.provider.js';

const parsePayload = (rawBody: Buffer) => {
  try {
    return JSON.parse(rawBody.toString('utf8'));
  } catch {
    return {};
  }
};

const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

const verifyTimestamp = (headers: Record<string, string | string[] | undefined>): boolean => {
  const timestampHeader = String(headers['x-webhook-timestamp'] || headers['x-cf-timestamp'] || '');
  if (!timestampHeader) return false;
  const timestamp = Number(timestampHeader);
  if (Number.isNaN(timestamp)) return false;
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  return diff <= WEBHOOK_TIMESTAMP_TOLERANCE_MS;
};

export const cashfreeProvider: PaymentProvider = {
  gateway: 'cashfree',

  async createOrder(input) {
    return {
      gateway: 'cashfree',
      gatewayOrderId: `cf_order_${randomToken(12)}`,
      paymentToken: env.CASHFREE_APP_ID,
      referenceId: input.referenceId,
      amount: input.amount,
      currency: input.currency,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      instructions: 'Use the Cashfree order token client side. Sensitive payment credentials must never touch this server.'
    };
  },

  verifyWebhook(rawBody, headers): VerifiedWebhook {
    const payload = parsePayload(rawBody);
    const signature = String(headers['x-webhook-signature'] || headers['x-cf-signature'] || '');
    const secret = env.CASHFREE_WEBHOOK_SECRET || '';
    const expected = secret ? crypto.createHmac('sha256', secret).update(rawBody).digest('base64') : '';
    const signatureValid = Boolean(secret && signature && signature === expected);
    const timestampValid = verifyTimestamp(headers);
    const verified = signatureValid && timestampValid;
    const data = payload?.data || payload;
    const order = data?.order || data;
    const payment = data?.payment || {};
    const statusText = String(payment.payment_status || order.order_status || '').toLowerCase();

    return {
      verified,
      eventId: String(payload.event_id || data.event_id || sha256(rawBody.toString('utf8')).slice(0, 32)),
      eventType: String(payload.type || payload.event || 'unknown'),
      status: ['success', 'paid', 'captured'].includes(statusText) ? 'success' : statusText === 'failed' ? 'failed' : 'ignored',
      referenceId: String(order.order_note || order.referenceId || ''),
      gatewayOrderId: String(order.order_id || ''),
      gatewayPaymentId: String(payment.cf_payment_id || payment.payment_id || ''),
      failureReason: verified ? undefined : (!signatureValid ? 'Invalid Cashfree webhook signature' : 'Webhook timestamp outside acceptable window'),
      metadata: { providerStatus: statusText }
    };
  }
};
