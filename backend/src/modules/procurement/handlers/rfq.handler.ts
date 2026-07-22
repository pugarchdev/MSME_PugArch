/**
 * RFQ (Request for Quotation) Isolated Business Logic Handler
 * 
 * Manages validation, line-item price requests, commercial quote responses,
 * and purchase order generation specifically for Request for Quotations.
 * Changes here will NEVER affect RFP or Open Tender.
 */

export interface RfqRequirementInput {
  title: string;
  description?: string;
  categoryId?: number;
  estimatedValue?: number;
  requiredBy?: Date;
  quoteDeadline?: Date;
  targetPrice?: number;
  deliveryLocation?: string;
  items?: Array<{ name: string; quantity: number; unit: string; targetUnitPrice?: number }>;
  payload?: Record<string, unknown>;
}

export interface RfqQuotationInput {
  sellerId: number;
  unitPrice: number;
  totalPrice?: number;
  gstRate?: number;
  deliveryDays?: number;
  validUntil?: Date;
  commercialNotes?: string;
  itemQuotes?: Array<{ itemId: string | number; unitPrice: number; quantity: number }>;
}

export const rfqHandler = {
  type: 'RFQ' as const,

  validateRequirement(input: RfqRequirementInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.title || input.title.trim().length === 0) {
      errors.push('RFQ title is required');
    }
    if (input.items && input.items.length > 0) {
      input.items.forEach((item, index) => {
        if (!item.name || item.name.trim().length === 0) {
          errors.push(`RFQ item #${index + 1} requires a valid item name`);
        }
        if (item.quantity <= 0) {
          errors.push(`RFQ item #${index + 1} quantity must be greater than zero`);
        }
      });
    }
    return { valid: errors.length === 0, errors };
  },

  normalizePayload(input: RfqRequirementInput): Record<string, unknown> {
    return {
      procurementType: 'RFQ',
      quoteDeadline: input.quoteDeadline || null,
      targetPrice: input.targetPrice || null,
      deliveryLocation: input.deliveryLocation || null,
      customPayload: input.payload || {}
    };
  },

  validateQuotation(input: RfqQuotationInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.unitPrice || input.unitPrice <= 0) {
      errors.push('RFQ quotation unit price must be positive');
    }
    if (input.deliveryDays !== undefined && input.deliveryDays < 0) {
      errors.push('Delivery lead time cannot be negative');
    }
    return { valid: errors.length === 0, errors };
  },

  generatePoNumber(rfqId: number | string): string {
    return `PO-RFQ-${rfqId}-${Date.now()}`;
  }
};
