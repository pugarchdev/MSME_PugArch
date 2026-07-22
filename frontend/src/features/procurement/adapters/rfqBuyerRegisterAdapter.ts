/**
 * RFQ Buyer Register Adapter
 * 
 * Manages table formatting, status badge mappings, action handlers, and filters
 * specifically for RFQ items in the Buyer Sourcing Register.
 * Changes here will NEVER affect RFP or Open Tender registers.
 */

export interface BuyerRfqItem {
  id: number | string;
  title: string;
  type: 'RFQ';
  status: string;
  createdAt: string;
  targetPrice?: number;
  quotationCount?: number;
  deadlineDate?: string;
}

export const rfqBuyerRegisterAdapter = {
  type: 'RFQ' as const,
  label: 'Request for Quotation',

  getStatusBadgeClass(status: string): string {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'sent':
      case 'pending':
        return 'border-blue-200 bg-blue-50 text-blue-700';
      case 'quotes_received':
        return 'border-indigo-200 bg-indigo-50 text-indigo-700';
      case 'accepted':
      case 'po_generated':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
      case 'closed':
      default:
        return 'border-slate-200 bg-slate-100 text-slate-600';
    }
  },

  formatStatusLabel(status: string): string {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'sent': return 'Quote Requested';
      case 'quotes_received': return 'Quotations Received';
      case 'accepted': return 'Quote Accepted';
      case 'po_generated': return 'PO Issued';
      default: return status.toUpperCase();
    }
  },

  getActions(item: BuyerRfqItem) {
    const s = String(item.status || '').toLowerCase();
    return {
      canEdit: s === 'draft' || s === 'pending',
      canCompareQuotes: (item.quotationCount || 0) > 0,
      canAcceptQuote: s === 'quotes_received',
      primaryActionLabel: (item.quotationCount || 0) > 0 ? 'Compare Quotations' : 'View RFQ Details'
    };
  }
};
