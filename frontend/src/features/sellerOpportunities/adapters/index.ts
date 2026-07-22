/**
 * Central Seller Opportunity Adapter Registry
 * 
 * Provides dynamic lookup for isolated RFP, RFQ, and Open Tender seller adapters.
 */

import { rfpSellerOpportunityAdapter } from './rfpSellerOpportunityAdapter';
import { rfqSellerOpportunityAdapter } from './rfqSellerOpportunityAdapter';
import { openTenderSellerOpportunityAdapter } from './openTenderSellerOpportunityAdapter';

export { rfpSellerOpportunityAdapter } from './rfpSellerOpportunityAdapter';
export { rfqSellerOpportunityAdapter } from './rfqSellerOpportunityAdapter';
export { openTenderSellerOpportunityAdapter } from './openTenderSellerOpportunityAdapter';

export function getSellerOpportunityAdapter(typeKey: string) {
  const normalized = String(typeKey || '').trim().toUpperCase();
  switch (normalized) {
    case 'RFP':
    case 'REQUEST_FOR_PROPOSAL':
      return rfpSellerOpportunityAdapter;
    case 'RFQ':
    case 'REQUEST_FOR_QUOTATION':
      return rfqSellerOpportunityAdapter;
    case 'OPEN_TENDER':
    case 'TENDER':
    case 'E_BID':
    default:
      return openTenderSellerOpportunityAdapter;
  }
}
