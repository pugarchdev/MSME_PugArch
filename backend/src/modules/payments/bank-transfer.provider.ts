import { env } from '../../config/env.js';
import { randomToken, sha256 } from '../../utils/crypto.js';
import type { PaymentProvider } from './payment.provider.js';

export const bankTransferProvider: PaymentProvider = {
  gateway: 'bank_transfer',

  async createOrder(input) {
    return {
      gateway: 'bank_transfer',
      gatewayOrderId: `bt_${randomToken(12)}`,
      referenceId: input.referenceId,
      amount: input.amount,
      currency: input.currency,
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      instructions: `Transfer ${input.currency} ${input.amount} to the configured virtual account using reference ${input.referenceId}. Backend confirmation/webhook is required before payment is marked successful.${env.BANK_TRANSFER_VIRTUAL_ACCOUNT ? ` Virtual account: ${env.BANK_TRANSFER_VIRTUAL_ACCOUNT}` : ''}`
    };
  },

  verifyWebhook(rawBody, headers) {
    const payload = JSON.parse(rawBody.toString('utf8') || '{}');
    const configuredSecret = env.BANDHAN_WEBHOOK_SECRET || '';
    const providedSecret = String(headers['x-bank-transfer-secret'] || '');
    const verified = Boolean(configuredSecret && providedSecret && providedSecret === configuredSecret);

    return {
      verified,
      eventId: String(payload.eventId || sha256(rawBody.toString('utf8')).slice(0, 32)),
      eventType: String(payload.eventType || 'bank_transfer.updated'),
      status: payload.status === 'success' ? 'success' : payload.status === 'failed' ? 'failed' : 'ignored',
      referenceId: String(payload.referenceId || ''),
      gatewayOrderId: String(payload.gatewayOrderId || ''),
      gatewayPaymentId: String(payload.gatewayPaymentId || payload.utr || ''),
      failureReason: verified ? undefined : 'Invalid bank transfer webhook secret',
      metadata: { utrProvided: Boolean(payload.utr) }
    };
  }
};
