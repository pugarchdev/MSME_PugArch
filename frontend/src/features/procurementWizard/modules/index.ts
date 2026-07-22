/**
 * Procurement Wizard Configuration Registry
 * 
 * Dynamically resolves type-specific wizard configurations for RFP, RFQ, and Open Tender.
 */

import { rfpWizardConfig } from './rfpWizardConfig';
import { rfqWizardConfig } from './rfqWizardConfig';
import { openTenderWizardConfig } from './openTenderWizardConfig';

export { rfpWizardConfig } from './rfpWizardConfig';
export { rfqWizardConfig } from './rfqWizardConfig';
export { openTenderWizardConfig } from './openTenderWizardConfig';

export type ProcurementWizardType = 'RFP' | 'RFQ' | 'OPEN_TENDER' | 'TENDER';

export function getWizardConfig(procurementType: string) {
  const normalized = String(procurementType || '').trim().toUpperCase();
  switch (normalized) {
    case 'RFP':
    case 'REQUEST_FOR_PROPOSAL':
      return rfpWizardConfig;
    case 'RFQ':
    case 'REQUEST_FOR_QUOTATION':
      return rfqWizardConfig;
    case 'OPEN_TENDER':
    case 'TENDER':
    case 'E_BID':
    default:
      return openTenderWizardConfig;
  }
}
