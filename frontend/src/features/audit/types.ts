export type AuditFeatureRecord = Record<string, unknown>;

export interface ProcurementAuditEntry {
  id: number;
  action: string;
  userId: number | null;
  role: string | null;
  entityType: string;
  entityId: string;
  canonicalMethod?: string;
  broadMethod?: string;
  oldValue?: Record<string, unknown> | null;
  newValue?: Record<string, unknown> | null;
  ipAddress?: string | null;
  createdAt: string;
  user?: { id: number; name?: string; email?: string } | null;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  'procurement.method.selected': 'Method Selected',
  'procurement.method.overridden': 'Method Overridden',
  'procurement.recommendation.accepted': 'Recommendation Accepted',
  'procurement.recommendation.rejected': 'Recommendation Rejected',
  'procurement.submitted_for_approval': 'Submitted for Approval',
  'procurement.admin.approved': 'Admin Approved',
  'procurement.admin.rejected': 'Admin Rejected',
  'procurement.bid.published': 'Bid Published',
  'procurement.supplier.invited': 'Supplier Invited',
  'procurement.seller.submission': 'Seller Submission',
  'procurement.award.recommended': 'Award Recommended',
  'procurement.l1.determined': 'L1 Determined',
  'procurement.po.generated': 'PO Generated',
  'procurement.method.evaluated': 'Method Evaluated',
  'procurement.method.confirmed': 'Method Confirmed',
  'procurement.settings.updated': 'Settings Updated',
  'BID_CREATED': 'Bid Created',
  'BID_SUBMITTED': 'Bid Submitted',
  'BID_APPROVED': 'Bid Approved',
  'BID_REJECTED': 'Bid Rejected',
  'PARTICIPATION_SUBMITTED': 'Participation Submitted',
  'TECHNICAL_EVALUATION_STARTED': 'Technical Evaluation Started',
  'FINANCIAL_EVALUATION_OPENED': 'Financial Evaluation Opened',
  'AWARD_RECOMMENDED': 'Award Recommended',
  'FINAL_AWARD_APPROVED': 'Final Award Approved',
  'PO_GENERATED': 'PO Generated',
  'GRN_CREATED': 'GRN Created',
  'GRN_APPROVED': 'GRN Approved',
  'INVOICE_SUBMITTED': 'Invoice Submitted',
  'PAYMENT_INITIATED': 'Payment Initiated',
  'SETTLEMENT_CONFIRMED': 'Settlement Confirmed',
};

export const AUDIT_ACTION_COLORS: Record<string, string> = {
  'procurement.method.selected': 'bg-blue-100 text-blue-800',
  'procurement.method.overridden': 'bg-amber-100 text-amber-800',
  'procurement.admin.approved': 'bg-emerald-100 text-emerald-800',
  'procurement.admin.rejected': 'bg-red-100 text-red-800',
  'procurement.bid.published': 'bg-indigo-100 text-indigo-800',
  'procurement.seller.submission': 'bg-purple-100 text-purple-800',
  'procurement.po.generated': 'bg-green-100 text-green-800',
};
