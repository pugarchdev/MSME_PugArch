import { ApiError } from '../../utils/ApiError.js';

export type TenderWorkflowStatus =
  | 'draft'
  | 'published'
  | 'bid_submission'
  | 'closed'
  | 'tech_evaluation'
  | 'financial_evaluation'
  | 'awarded'
  | 'po_generated'
  | 'cancelled';

export type BidWorkflowStatus =
  | 'draft'
  | 'pending'
  | 'submitted'
  | 'modified'
  | 'withdrawn'
  | 'technical_qualified'
  | 'technical_rejected'
  | 'financial_evaluated'
  | 'accepted'
  | 'rejected';

export type POWorkflowStatus =
  | 'generated'
  | 'order_placed'
  | 'issued'
  | 'accepted'
  | 'in_fulfillment'
  | 'delivered'
  | 'inspection_accepted'
  | 'invoice_submitted'
  | 'payment_initiated'
  | 'escrow_held'
  | 'completed'
  | 'cancelled';

export type InvoiceWorkflowStatus =
  | 'draft'
  | 'submitted'
  | 'approved'
  | 'rejected'
  | 'payment_initiated'
  | 'paid'
  | 'cancelled';

export type PaymentWorkflowStatus =
  | 'initiated'
  | 'gateway_order_created'
  | 'success'
  | 'failed'
  | 'escrow_released'
  | 'refunded'
  | 'cancelled';

export type EscrowWorkflowStatus =
  | 'created'
  | 'held'
  | 'funded'
  | 'partially_released'
  | 'released'
  | 'frozen'
  | 'refunded'
  | 'closed';

type TransitionMap<T extends string> = Record<T, readonly T[]>;

const tenderTransitions: TransitionMap<TenderWorkflowStatus> = {
  draft: ['published', 'cancelled'],
  published: ['bid_submission', 'closed', 'cancelled'],
  bid_submission: ['closed', 'tech_evaluation', 'cancelled'],
  closed: ['tech_evaluation', 'financial_evaluation', 'awarded'],
  tech_evaluation: ['financial_evaluation', 'closed'],
  financial_evaluation: ['awarded', 'closed'],
  awarded: ['po_generated', 'closed'],
  po_generated: ['closed'],
  cancelled: []
};

const bidTransitions: TransitionMap<BidWorkflowStatus> = {
  draft: ['submitted', 'withdrawn'],
  pending: ['submitted', 'modified', 'withdrawn', 'accepted', 'rejected'],
  submitted: ['modified', 'withdrawn', 'technical_qualified', 'technical_rejected', 'accepted', 'rejected'],
  modified: ['withdrawn', 'technical_qualified', 'technical_rejected', 'accepted', 'rejected'],
  withdrawn: [],
  technical_qualified: ['financial_evaluated', 'accepted', 'rejected'],
  technical_rejected: ['rejected'],
  financial_evaluated: ['accepted', 'rejected'],
  accepted: [],
  rejected: []
};

const poTransitions: TransitionMap<POWorkflowStatus> = {
  generated: ['issued', 'accepted', 'cancelled'],
  order_placed: ['accepted', 'cancelled'],
  issued: ['accepted', 'cancelled'],
  accepted: ['in_fulfillment', 'delivered', 'cancelled'],
  in_fulfillment: ['delivered', 'cancelled'],
  delivered: ['inspection_accepted', 'invoice_submitted'],
  inspection_accepted: ['invoice_submitted'],
  invoice_submitted: ['payment_initiated'],
  payment_initiated: ['escrow_held'],
  escrow_held: ['completed', 'cancelled'],
  completed: [],
  cancelled: []
};

const invoiceTransitions: TransitionMap<InvoiceWorkflowStatus> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['approved', 'rejected', 'cancelled'],
  approved: ['payment_initiated', 'paid'],
  rejected: ['submitted', 'cancelled'],
  payment_initiated: ['paid', 'cancelled'],
  paid: [],
  cancelled: []
};

const paymentTransitions: TransitionMap<PaymentWorkflowStatus> = {
  initiated: ['gateway_order_created', 'success', 'failed', 'cancelled'],
  gateway_order_created: ['success', 'failed', 'cancelled'],
  success: ['escrow_released', 'refunded'],
  failed: ['initiated', 'cancelled'],
  escrow_released: [],
  refunded: [],
  cancelled: []
};

const escrowTransitions: TransitionMap<EscrowWorkflowStatus> = {
  created: ['funded', 'held', 'frozen', 'refunded'],
  funded: ['held', 'partially_released', 'released', 'frozen', 'refunded'],
  held: ['partially_released', 'released', 'frozen', 'refunded'],
  partially_released: ['released', 'frozen'],
  released: ['closed'],
  frozen: ['held', 'refunded', 'closed'],
  refunded: ['closed'],
  closed: []
};

const normalize = <T extends string>(status: unknown, fallback: T) =>
  String(status || fallback).trim().toLowerCase() as T;

const assertTransition = <T extends string>(
  entity: string,
  transitions: TransitionMap<T>,
  current: unknown,
  next: T,
  fallback: T
) => {
  const from = normalize<T>(current, fallback);
  if (from === next) return { from, to: next, changed: false };
  const allowed = transitions[from] || [];
  if (!allowed.includes(next)) {
    throw new ApiError(409, `${entity} cannot transition from ${from} to ${next}`, 'STATUS_TRANSITION_INVALID');
  }
  return { from, to: next, changed: true };
};

export const statusTransitions = {
  tender: (current: unknown, next: TenderWorkflowStatus) =>
    assertTransition('Tender', tenderTransitions, current, next, 'draft'),
  bid: (current: unknown, next: BidWorkflowStatus) =>
    assertTransition('Bid', bidTransitions, current, next, 'draft'),
  purchaseOrder: (current: unknown, next: POWorkflowStatus) =>
    assertTransition('Purchase order', poTransitions, current, next, 'generated'),
  invoice: (current: unknown, next: InvoiceWorkflowStatus) =>
    assertTransition('Invoice', invoiceTransitions, current, next, 'draft'),
  payment: (current: unknown, next: PaymentWorkflowStatus) =>
    assertTransition('Payment', paymentTransitions, current, next, 'initiated'),
  escrow: (current: unknown, next: EscrowWorkflowStatus) =>
    assertTransition('Escrow', escrowTransitions, current, next, 'created')
};

export const tenderStatusEnumFor = (status: TenderWorkflowStatus) => {
  const map: Record<TenderWorkflowStatus, string | null> = {
    draft: 'DRAFT',
    published: 'PUBLISHED',
    bid_submission: 'BID_SUBMISSION',
    closed: 'CLOSED',
    tech_evaluation: 'TECHNICAL_EVALUATION',
    financial_evaluation: 'FINANCIAL_EVALUATION',
    awarded: 'AWARDED',
    po_generated: 'PO_GENERATED',
    cancelled: 'CANCELLED'
  };
  return map[status];
};

export const bidStatusEnumFor = (status: BidWorkflowStatus) => {
  const map: Partial<Record<BidWorkflowStatus, string>> = {
    draft: 'DRAFT',
    pending: 'SUBMITTED',
    submitted: 'SUBMITTED',
    modified: 'SUBMITTED',
    withdrawn: 'WITHDRAWN',
    technical_qualified: 'TECHNICALLY_QUALIFIED',
    technical_rejected: 'TECHNICALLY_REJECTED',
    financial_evaluated: 'UNDER_FINANCIAL_EVALUATION',
    accepted: 'ACCEPTED',
    rejected: 'REJECTED'
  };
  return map[status];
};

export const poStatusEnumFor = (status: POWorkflowStatus) => {
  const map: Partial<Record<POWorkflowStatus, string>> = {
    generated: 'GENERATED',
    order_placed: 'ORDER_PLACED',
    issued: 'ISSUED',
    accepted: 'ACCEPTED',
    in_fulfillment: 'IN_FULFILLMENT',
    delivered: 'DELIVERED',
    completed: 'CLOSED',
    cancelled: 'CANCELLED'
  };
  return map[status];
};

export const invoiceStatusEnumFor = (status: InvoiceWorkflowStatus) => {
  const map: Partial<Record<InvoiceWorkflowStatus, string>> = {
    draft: 'DRAFT',
    submitted: 'SUBMITTED',
    approved: 'APPROVED',
    rejected: 'REJECTED',
    payment_initiated: 'UNDER_REVIEW',
    paid: 'PAID',
    cancelled: 'CANCELLED'
  };
  return map[status];
};

export const paymentStatusEnumFor = (status: PaymentWorkflowStatus) => {
  const map: Partial<Record<PaymentWorkflowStatus, string>> = {
    initiated: 'INITIATED',
    gateway_order_created: 'PROCESSING',
    success: 'SUCCESS',
    failed: 'FAILED',
    refunded: 'REFUNDED',
    cancelled: 'CANCELLED'
  };
  return map[status];
};

export const escrowStatusEnumFor = (status: EscrowWorkflowStatus) => {
  const map: Partial<Record<EscrowWorkflowStatus, string>> = {
    created: 'CREATED',
    funded: 'FUNDED',
    held: 'HELD',
    partially_released: 'PARTIALLY_RELEASED',
    released: 'RELEASED',
    frozen: 'FROZEN',
    refunded: 'REFUNDED',
    closed: 'CLOSED'
  };
  return map[status];
};
