/**
 * RFQ (Request for Quotation) Wizard Configuration & Form Handler
 * 
 * Defines isolated step sequences, form validation, required fields, and payload transformation
 * specifically for Request for Quotations on the Buyer side.
 * Changes to RFQ wizard configuration will NEVER affect RFP or Open Tender.
 */

export interface RfqWizardState {
  title: string;
  description: string;
  categoryId: string;
  estimatedValue: string;
  quoteDeadline: string;
  targetPrice: string;
  deliveryLocation: string;
  paymentTerms: string;
  items: Array<{ name: string; quantity: number; unit: string; targetUnitPrice?: number }>;
  invitedVendors: Array<{ id: number; name: string; email?: string }>;
}

export const rfqWizardConfig = {
  methodId: 'RFQ' as const,
  title: 'Request for Quotation (RFQ)',
  description: 'Request price quotes and delivery lead times for standard products or well-defined goods.',

  steps: [
    { id: 'basics', title: 'RFQ Basic Details', description: 'Enter RFQ title, category, and target delivery location' },
    { id: 'items', title: 'Items & Quantities', description: 'Add item specifications, quantities, and target unit prices' },
    { id: 'vendors', title: 'Target Suppliers', description: 'Select preferred suppliers or open to all qualified vendors' },
    { id: 'terms', title: 'Commercial Terms', description: 'Set quotation deadline and commercial payment terms' },
    { id: 'publish', title: 'Review & Send RFQ', description: 'Verify details and send quote requests' }
  ],

  initialState(): RfqWizardState {
    return {
      title: '',
      description: '',
      categoryId: '',
      estimatedValue: '',
      quoteDeadline: '',
      targetPrice: '',
      deliveryLocation: '',
      paymentTerms: 'NET_30',
      items: [],
      invitedVendors: []
    };
  },

  validateStep(stepId: string, state: RfqWizardState): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (stepId === 'basics') {
      if (!state.title || state.title.trim().length < 3) {
        errors.push('RFQ title must be at least 3 characters');
      }
    } else if (stepId === 'items') {
      if (state.items.length === 0) {
        errors.push('RFQ requires at least one line item');
      }
      state.items.forEach((item, index) => {
        if (!item.name || item.name.trim().length === 0) {
          errors.push(`Item #${index + 1} requires a valid name`);
        }
        if (!item.quantity || item.quantity <= 0) {
          errors.push(`Item #${index + 1} quantity must be greater than zero`);
        }
      });
    } else if (stepId === 'terms') {
      if (!state.quoteDeadline) {
        errors.push('Quotation response deadline is required');
      }
    }
    return { valid: errors.length === 0, errors };
  },

  buildPayload(state: RfqWizardState) {
    return {
      procurementType: 'RFQ',
      title: state.title,
      description: state.description,
      categoryId: state.categoryId ? Number(state.categoryId) : undefined,
      estimatedValue: state.estimatedValue ? Number(state.estimatedValue) : undefined,
      requiredBy: state.quoteDeadline ? new Date(state.quoteDeadline) : undefined,
      payload: {
        rfqMeta: {
          targetPrice: state.targetPrice ? Number(state.targetPrice) : undefined,
          deliveryLocation: state.deliveryLocation,
          paymentTerms: state.paymentTerms,
          invitedVendors: state.invitedVendors
        }
      },
      items: state.items
    };
  }
};
