/**
 * Central Buyer Register Adapter Registry
 * 
 * Provides dynamic lookup for isolated RFP, RFQ, and Open Tender register adapters.
 */

import { rfpBuyerRegisterAdapter } from './rfpBuyerRegisterAdapter';
import { rfqBuyerRegisterAdapter } from './rfqBuyerRegisterAdapter';
import { openTenderBuyerRegisterAdapter } from './openTenderBuyerRegisterAdapter';

export { rfpBuyerRegisterAdapter } from './rfpBuyerRegisterAdapter';
export { rfqBuyerRegisterAdapter } from './rfqBuyerRegisterAdapter';
export { openTenderBuyerRegisterAdapter } from './openTenderBuyerRegisterAdapter';

export function getBuyerRegisterAdapter(typeKey: string) {
  const normalized = String(typeKey || '').trim().toUpperCase();
  switch (normalized) {
    case 'RFP':
    case 'REQUEST_FOR_PROPOSAL':
      return rfpBuyerRegisterAdapter;
    case 'RFQ':
    case 'REQUEST_FOR_QUOTATION':
      return rfqBuyerRegisterAdapter;
    case 'OPEN_TENDER':
    case 'TENDER':
    case 'E_BID':
    default:
      return openTenderBuyerRegisterAdapter;
  }
}
