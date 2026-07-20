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

const hmacSha256 = (rawBody: Buffer, secret: string) =>
  crypto.createHmac('sha256', secret).update(rawBody).digest('hex');

const WEBHOOK_TIMESTAMP_TOLERANCE_MS = 5 * 60 * 1000;

const verifyTimestamp = (headers: Record<string, string | string[] | undefined>): boolean => {
  const timestampHeader = String(headers['x-bandhan-timestamp'] || headers['x-cf-timestamp'] || '');
  if (!timestampHeader) return true; // Optional fallback if gateway doesn't provide it
  const timestamp = Number(timestampHeader);
  if (Number.isNaN(timestamp)) return false;
  const now = Date.now();
  const diff = Math.abs(now - timestamp);
  return diff <= WEBHOOK_TIMESTAMP_TOLERANCE_MS;
};

export const bandhanProvider: PaymentProvider = {
  gateway: 'bandhan' as any, // Cast as any for now until enum types are fully compiled

  async createOrder(input) {
    return {
      gateway: 'bandhan' as any,
      gatewayOrderId: `bandhan_order_${randomToken(12)}`,
      paymentToken: env.BANDHAN_MERCHANT_ID,
      referenceId: input.referenceId,
      amount: input.amount,
      currency: input.currency,
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      instructions: 'Use the Bandhan Bank gateway order id and merchant token client side. Sensitive payment credentials must never touch this server.'
    };
  },

  verifyWebhook(rawBody, headers): VerifiedWebhook {
    const payload = parsePayload(rawBody);
    const signature = String(headers['x-bandhan-signature'] || payload.signature || '');
    const secret = env.BANDHAN_WEBHOOK_SECRET || '';
    
    // Validate Signature: Verify webhook using HMAC-SHA256
    const expected = secret && signature ? hmacSha256(rawBody, secret) : '';
    const signatureValid = Boolean(secret && signature && signature === expected);
    const timestampValid = verifyTimestamp(headers);
    const verified = signatureValid && timestampValid;

    const data = payload?.data || payload;
    const order = data?.order || data;
    const payment = data?.payment || {};
    const statusText = String(payment.payment_status || order.order_status || payment.status || order.status || '').toLowerCase();

    return {
      verified,
      eventId: String(payload.event_id || data.event_id || sha256(rawBody.toString('utf8')).slice(0, 32)),
      eventType: String(payload.type || payload.event || 'unknown'),
      status: ['success', 'paid', 'captured'].includes(statusText) ? 'success' : statusText === 'failed' ? 'failed' : 'ignored',
      referenceId: String(order.order_note || order.referenceId || order.notes?.referenceId || ''),
      gatewayOrderId: String(order.order_id || order.id || ''),
      gatewayPaymentId: String(payment.payment_id || payment.id || ''),
      failureReason: verified ? undefined : (!signatureValid ? 'Invalid Bandhan Bank webhook signature' : 'Webhook timestamp outside acceptable window'),
      metadata: { providerStatus: statusText }
    };
  }
};
