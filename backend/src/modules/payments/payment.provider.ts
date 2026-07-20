import type { IncomingHttpHeaders } from 'http';

export type PaymentGateway = 'bandhan' | 'bank_transfer';

export type CreatePaymentOrderInput = {
  paymentId: number;
  referenceId: string;
  amount: string;
  currency: string;
  buyerId: number;
  sellerId: number;
  invoiceId?: number | null;
  purchaseOrderId?: number | null;
};

export type PaymentOrderResult = {
  gateway: PaymentGateway;
  gatewayOrderId: string;
  paymentToken?: string;
  instructions?: string;
  referenceId?: string;
  amount?: string;
  currency?: string;
  expiresAt?: string;
};

export type VerifiedWebhook = {
  verified: boolean;
  eventId: string;
  eventType: string;
  status?: 'success' | 'failed' | 'ignored';
  referenceId?: string;
  gatewayOrderId?: string;
  gatewayPaymentId?: string;
  failureReason?: string;
  metadata?: Record<string, unknown>;
};

export type PaymentProvider = {
  gateway: PaymentGateway;
  createOrder(input: CreatePaymentOrderInput): Promise<PaymentOrderResult>;
  verifyWebhook(rawBody: Buffer, headers: IncomingHttpHeaders): VerifiedWebhook;
};
