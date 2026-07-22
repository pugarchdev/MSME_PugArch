/**
 * RFP Seller Opportunity & Proposal Submission Adapter
 * 
 * Manages opportunity normalization, card badge rendering, CTA actions, and proposal validation
 * specifically for RFP opportunities on the Seller side.
 * Changes to RFP seller handling will NEVER affect RFQ or Open Tender seller flows.
 */

export interface SellerRfpOpportunity {
  id: string;
  type: 'RFP';
  title: string;
  buyer?: string;
  category?: string;
  closingDate?: string;
  estimatedValue?: number;
  technicalProposalRequired?: boolean;
  financialProposalRequired?: boolean;
  status: string;
}

export const rfpSellerOpportunityAdapter = {
  type: 'RFP' as const,
  label: 'Request for Proposal',

  formatCardBadgeClass(): string {
    return 'bg-purple-50 text-purple-700 border-purple-200';
  },

  getCtaLabel(opportunity: SellerRfpOpportunity): string {
    const s = String(opportunity.status || '').toLowerCase();
    if (s === 'submitted') return 'View Submitted Proposal';
    if (s === 'draft') return 'Continue RFP Draft';
    return 'Submit Proposal';
  },

  getCtaHref(opportunity: SellerRfpOpportunity): string {
    return `/bids/${opportunity.id}/participate?type=RFP`;
  },

  validateProposalSubmission(proposal: { technicalDocUrl?: string; financialDocUrl?: string; quotedAmount?: number }) {
    const errors: string[] = [];
    if (!proposal.technicalDocUrl) {
      errors.push('RFP submission requires uploading a Technical Proposal document');
    }
    if (proposal.quotedAmount !== undefined && proposal.quotedAmount <= 0) {
      errors.push('Quoted financial proposal amount must be positive');
    }
    return { valid: errors.length === 0, errors };
  }
};
