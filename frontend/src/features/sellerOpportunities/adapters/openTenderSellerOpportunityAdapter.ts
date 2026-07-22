/**
 * Open Tender Seller Opportunity & Bid Submission Adapter
 * 
 * Manages opportunity normalization, card badge rendering, CTA actions, and bid validation
 * specifically for Open Tender opportunities on the Seller side.
 * Changes to Open Tender seller handling will NEVER affect RFP or RFQ seller flows.
 */

export interface SellerOpenTenderOpportunity {
  id: string;
  tenderId?: string;
  type: 'OPEN_TENDER';
  title: string;
  buyer?: string;
  category?: string;
  closingDate?: string;
  emdAmount?: number;
  status: string;
}

export const openTenderSellerOpportunityAdapter = {
  type: 'OPEN_TENDER' as const,
  label: 'Open Tender',

  formatCardBadgeClass(): string {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  },

  getCtaLabel(opportunity: SellerOpenTenderOpportunity): string {
    const s = String(opportunity.status || '').toLowerCase();
    if (s === 'submitted') return 'View Submitted Bid';
    return 'Participate in Tender';
  },

  getCtaHref(opportunity: SellerOpenTenderOpportunity): string {
    return `/bids/${opportunity.id}/participate?type=OPEN_TENDER`;
  },

  validateBidSubmission(bid: { emdPaid?: boolean; technicalDocsUploaded?: boolean; quotedAmount?: number; declarationAccepted?: boolean }) {
    const errors: string[] = [];
    if (!bid.declarationAccepted) {
      errors.push('Open Tender submission requires accepting the tender declaration');
    }
    if (bid.quotedAmount !== undefined && bid.quotedAmount <= 0) {
      errors.push('Open Tender bid amount must be positive');
    }
    return { valid: errors.length === 0, errors };
  }
};
