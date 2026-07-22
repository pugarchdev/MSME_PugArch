/**
 * Open Tender Buyer Register Adapter
 * 
 * Manages table formatting, status badge mappings, action handlers, and filters
 * specifically for Open Tender items in the Buyer Sourcing Register.
 * Changes here will NEVER affect RFP or RFQ registers.
 */

export interface BuyerOpenTenderItem {
  id: number | string;
  tenderId?: string;
  title: string;
  type: 'OPEN_TENDER';
  status: string;
  createdAt: string;
  budget?: number;
  bidsCount?: number;
  closesAt?: string;
}

export const openTenderBuyerRegisterAdapter = {
  type: 'OPEN_TENDER' as const,
  label: 'Open Tender',

  getStatusBadgeClass(status: string): string {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'published':
      case 'bid_submission':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
      case 'closed':
      case 'evaluation':
        return 'border-amber-200 bg-amber-50 text-amber-700';
      case 'awarded':
        return 'border-indigo-200 bg-indigo-50 text-indigo-700';
      case 'draft':
      default:
        return 'border-slate-200 bg-slate-100 text-slate-600';
    }
  },

  formatStatusLabel(status: string): string {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'published':
      case 'bid_submission': return 'Live Bidding';
      case 'closed': return 'Bidding Closed';
      case 'evaluation': return 'Under Evaluation';
      case 'awarded': return 'Tender Awarded';
      case 'draft': return 'Tender Draft';
      default: return status.toUpperCase();
    }
  },

  getActions(item: BuyerOpenTenderItem) {
    const s = String(item.status || '').toLowerCase();
    return {
      canEdit: s === 'draft',
      canEvaluate: ['closed', 'evaluation', 'published'].includes(s),
      canPublish: s === 'draft',
      primaryActionLabel: s === 'draft' ? 'Publish Tender' : 'Evaluate Bids'
    };
  }
};
