/**
 * Central Handler Registry for Procurement Types
 * 
 * Provides dynamic lookup for isolated RFP, RFQ, and Open Tender handlers.
 */

import { rfpHandler } from './rfp.handler.js';
import { rfqHandler } from './rfq.handler.js';
import { openTenderHandler } from './openTender.handler.js';

export { rfpHandler } from './rfp.handler.js';
export { rfqHandler } from './rfq.handler.js';
export { openTenderHandler } from './openTender.handler.js';

export type ProcurementTypeKey = 'RFP' | 'RFQ' | 'OPEN_TENDER' | 'TENDER';

export function getProcurementHandler(typeKey: string) {
  const normalized = String(typeKey || '').trim().toUpperCase();
  switch (normalized) {
    case 'RFP':
    case 'REQUEST_FOR_PROPOSAL':
      return rfpHandler;
    case 'RFQ':
    case 'REQUEST_FOR_QUOTATION':
      return rfqHandler;
    case 'OPEN_TENDER':
    case 'TENDER':
    case 'E_BID':
    default:
      return openTenderHandler;
  }
}
