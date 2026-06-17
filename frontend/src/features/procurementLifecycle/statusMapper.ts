export type ProcurementLifecycleStage =
  | 'PROCUREMENT_CREATED'
  | 'SUPPLIER_SELECTED'
  | 'PO_GENERATED'
  | 'SELLER_ACCEPTED'
  | 'DELIVERY_STARTED'
  | 'DELIVERY_COMPLETED'
  | 'GRN_CONFIRMED'
  | 'INVOICE_UPLOADED'
  | 'INVOICE_APPROVED'
  | 'PAYMENT_INITIATED'
  | 'ESCROW_HELD'
  | 'SETTLEMENT_RELEASED'
  | 'COMPLETED';

export interface ProcurementLifecycleEvent {
  stage: ProcurementLifecycleStage;
  status?: string;
  label?: string;
  description?: string;
  createdAt?: string;
}

export const LIFECYCLE_LABELS: Record<ProcurementLifecycleStage, string> = {
  PROCUREMENT_CREATED: 'Procurement Created',
  SUPPLIER_SELECTED: 'Supplier Selected',
  PO_GENERATED: 'Purchase Order Generated',
  SELLER_ACCEPTED: 'Seller Accepted',
  DELIVERY_STARTED: 'Delivery Started',
  DELIVERY_COMPLETED: 'Delivery Completed',
  GRN_CONFIRMED: 'Delivery Confirmation / GRN',
  INVOICE_UPLOADED: 'Invoice Uploaded',
  INVOICE_APPROVED: 'Invoice Approved',
  PAYMENT_INITIATED: 'Payment Initiated',
  ESCROW_HELD: 'Payment Held in Escrow',
  SETTLEMENT_RELEASED: 'Settlement Released',
  COMPLETED: 'Completed',
};

export const LIFECYCLE_STAGES = Object.keys(LIFECYCLE_LABELS) as ProcurementLifecycleStage[];

const statusDone = (value: unknown, expected: string[]) => {
  const normalized = String(value || '').toLowerCase();
  return expected.some(item => normalized === item.toLowerCase());
};

export const mapProcurementOrderToLifecycle = (order: any): ProcurementLifecycleEvent[] => {
  const delivery = order?.deliveryTrackings?.[0];
  const grn = order?.grns?.[0];
  const invoice = order?.invoices?.[0];
  const payment = order?.payments?.[0] || invoice?.payments?.[0];
  const settlement = delivery?.settlement || payment?.paymentSettlements?.[0];
  const events: ProcurementLifecycleEvent[] = [
    {
      stage: 'PROCUREMENT_CREATED',
      status: 'completed',
      description: order?.title || order?.poNumber || 'Procurement record exists',
      createdAt: order?.createdAt,
    },
  ];

  if (order?.awardId || order?.procurementBidAwardId || order?.sellerId) {
    events.push({ stage: 'SUPPLIER_SELECTED', status: 'completed', description: order?.seller?.name || 'Supplier selected' });
  }
  if (order?.id || order?.poNumber) {
    events.push({ stage: 'PO_GENERATED', status: 'completed', description: order?.poNumber || 'Purchase order generated', createdAt: order?.createdAt });
  }
  if (statusDone(order?.status, ['accepted', 'in_fulfillment', 'delivered', 'inspection_accepted', 'invoice_submitted', 'payment_initiated', 'completed', 'SELLER_ACCEPTED'])) {
    events.push({ stage: 'SELLER_ACCEPTED', status: 'completed', description: 'Seller accepted the award or order' });
  }
  if (statusDone(delivery?.status, ['DISPATCHED', 'IN_TRANSIT', 'DELIVERED', 'COMPLETED'])) {
    events.push({ stage: 'DELIVERY_STARTED', status: delivery?.status, description: 'Delivery has started', createdAt: delivery?.updatedAt || delivery?.createdAt });
  }
  if (statusDone(delivery?.status, ['DELIVERED', 'COMPLETED'])) {
    events.push({ stage: 'DELIVERY_COMPLETED', status: delivery?.status, description: 'Delivery marked complete', createdAt: delivery?.deliveredAt || delivery?.updatedAt });
  }
  if (statusDone(grn?.status, ['APPROVED', 'CONFIRMED', 'ACCEPTED'])) {
    events.push({ stage: 'GRN_CONFIRMED', status: grn?.status, description: 'Buyer confirmed delivery', createdAt: grn?.updatedAt || grn?.createdAt });
  }
  if (invoice) {
    events.push({ stage: 'INVOICE_UPLOADED', status: invoice.status, description: invoice.invoiceNumber || 'Invoice uploaded', createdAt: invoice.createdAt });
  }
  if (statusDone(invoice?.status, ['approved', 'APPROVED'])) {
    events.push({ stage: 'INVOICE_APPROVED', status: invoice.status, description: 'Invoice approved for payment', createdAt: invoice.updatedAt });
  }
  if (payment) {
    events.push({ stage: 'PAYMENT_INITIATED', status: payment.status, description: payment.paymentReference || 'Payment initiated', createdAt: payment.createdAt });
  }
  if (statusDone(payment?.status, ['success', 'held', 'escrow_held', 'escrow_released'])) {
    events.push({ stage: 'ESCROW_HELD', status: payment.status, description: 'Payment is held before settlement', createdAt: payment.updatedAt || payment.createdAt });
  }
  if (statusDone(settlement?.status, ['RELEASED', 'CONFIRMED', 'completed'])) {
    events.push({ stage: 'SETTLEMENT_RELEASED', status: settlement.status, description: 'Settlement released', createdAt: settlement.updatedAt || settlement.createdAt });
  }
  if (statusDone(order?.status, ['completed', 'closed']) || statusDone(settlement?.status, ['RELEASED', 'CONFIRMED', 'completed'])) {
    events.push({ stage: 'COMPLETED', status: 'completed', description: 'Procurement lifecycle completed' });
  }

  return events;
};

export const inferCurrentLifecycleStage = (events: ProcurementLifecycleEvent[]): ProcurementLifecycleStage =>
  events[events.length - 1]?.stage || 'PROCUREMENT_CREATED';

