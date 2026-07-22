/**
 * Open Tender Isolated Business Logic Handler
 * 
 * Manages validation, public tender bidding, EMD qualification, multi-stage evaluation
 * (technical + financial), and formal tender awards specifically for Open Tenders.
 * Changes here will NEVER affect RFP or RFQ.
 */

export interface OpenTenderRequirementInput {
  title: string;
  description?: string;
  categoryId?: number;
  estimatedValue?: number;
  emdAmount?: number;
  tenderFee?: number;
  closesAt?: Date;
  preQualificationCriteria?: Array<{ criteria: string; mandatory: boolean }>;
  boqItems?: Array<{ name: string; quantity: number; unit: string; estimatedRate?: number }>;
  payload?: Record<string, unknown>;
}

export interface OpenTenderBidInput {
  sellerId: number;
  emdPaymentRef?: string;
  technicalDocs?: string[];
  financialBidAmount?: number;
  boqLineQuotes?: Array<{ itemNo: number; rate: number }>;
  declarationAccepted: boolean;
}

export const openTenderHandler = {
  type: 'OPEN_TENDER' as const,

  validateRequirement(input: OpenTenderRequirementInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.title || input.title.trim().length === 0) {
      errors.push('Open Tender title is required');
    }
    if (input.closesAt && new Date(input.closesAt) <= new Date()) {
      errors.push('Open Tender closing date must be in the future');
    }
    if (input.emdAmount !== undefined && input.emdAmount < 0) {
      errors.push('EMD amount cannot be negative');
    }
    return { valid: errors.length === 0, errors };
  },

  normalizePayload(input: OpenTenderRequirementInput): Record<string, unknown> {
    return {
      procurementType: 'OPEN_TENDER',
      emdAmount: input.emdAmount || 0,
      tenderFee: input.tenderFee || 0,
      preQualificationCriteria: input.preQualificationCriteria || [],
      boqItems: input.boqItems || [],
      customPayload: input.payload || {}
    };
  },

  validateBid(input: OpenTenderBidInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.declarationAccepted) {
      errors.push('Tender bid submission requires accepting the terms declaration');
    }
    if (!input.financialBidAmount || input.financialBidAmount <= 0) {
      errors.push('Valid financial bid amount is required for open tender submission');
    }
    return { valid: errors.length === 0, errors };
  },

  isTenderOpenForBidding(closesAt?: Date | null, status?: string): boolean {
    if (!closesAt || new Date(closesAt) <= new Date()) return false;
    const currentStatus = String(status || '').toLowerCase();
    return currentStatus === 'published' || currentStatus === 'bid_submission';
  }
};
