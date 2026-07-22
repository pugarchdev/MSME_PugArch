/**
 * RFQ Seller Opportunity & Quotation Submission Adapter
 * 
 * Manages opportunity normalization, card badge rendering, CTA actions, and quotation validation
 * specifically for RFQ requests on the Seller side.
 * Changes to RFQ seller handling will NEVER affect RFP or Open Tender seller flows.
 */

export interface SellerRfqOpportunity {
  id: string;
  type: 'RFQ';
  title: string;
  buyer?: string;
  category?: string;
  closingDate?: string;
  targetPrice?: number;
  status: string;
}

export const rfqSellerOpportunityAdapter = {
  type: 'RFQ' as const,
  label: 'Request for Quotation',

  formatCardBadgeClass(): string {
    return 'bg-blue-50 text-blue-700 border-blue-200';
  },

  getCtaLabel(opportunity: SellerRfqOpportunity): string {
    const s = String(opportunity.status || '').toLowerCase();
    if (s === 'submitted') return 'View Submitted Quotation';
    return 'Submit Quotation';
  },

  getCtaHref(opportunity: SellerRfqOpportunity): string {
    return `/seller/rfq/submit-quotation?id=${opportunity.id}`;
  },

  validateQuotationSubmission(quotation: { unitPrice?: number; deliveryDays?: number }) {
    const errors: string[] = [];
    if (!quotation.unitPrice || quotation.unitPrice <= 0) {
      errors.push('RFQ quotation requires a positive unit price quote');
    }
    if (quotation.deliveryDays !== undefined && quotation.deliveryDays <= 0) {
      errors.push('RFQ quotation delivery lead time must be at least 1 day');
    }
    return { valid: errors.length === 0, errors };
  }
};
