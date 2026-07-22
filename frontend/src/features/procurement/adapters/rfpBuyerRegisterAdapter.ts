/**
 * RFP Buyer Register Adapter
 * 
 * Manages table formatting, status badge mappings, action handlers, and filters
 * specifically for RFP items in the Buyer Sourcing Register.
 * Changes here will NEVER affect RFQ or Open Tender registers.
 */

export interface BuyerRfpItem {
  id: number | string;
  title: string;
  type: 'RFP';
  status: string;
  createdAt: string;
  estimatedValue?: number;
  proposalCount?: number;
  deadlineDate?: string;
}

export const rfpBuyerRegisterAdapter = {
  type: 'RFP' as const,
  label: 'Request for Proposal',

  getStatusBadgeClass(status: string): string {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'published':
      case 'open':
        return 'border-purple-200 bg-purple-50 text-purple-700';
      case 'evaluating':
      case 'tech_eval':
        return 'border-amber-200 bg-amber-50 text-amber-700';
      case 'awarded':
      case 'completed':
        return 'border-emerald-200 bg-emerald-50 text-emerald-700';
      case 'draft':
      default:
        return 'border-slate-200 bg-slate-100 text-slate-600';
    }
  },

  formatStatusLabel(status: string): string {
    const s = String(status || '').toLowerCase();
    switch (s) {
      case 'published': return 'Proposals Open';
      case 'evaluating': return 'Proposal Evaluation';
      case 'awarded': return 'RFP Awarded';
      case 'draft': return 'Draft RFP';
      default: return status.toUpperCase();
    }
  },

  getActions(item: BuyerRfpItem) {
    const s = String(item.status || '').toLowerCase();
    return {
      canEdit: s === 'draft',
      canViewProposals: ['published', 'evaluating', 'awarded'].includes(s),
      canEvaluate: s === 'evaluating' || s === 'published',
      primaryActionLabel: s === 'draft' ? 'Edit RFP' : 'View Proposals'
    };
  }
};
