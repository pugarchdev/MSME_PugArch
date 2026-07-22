/**
 * Open Tender Wizard Configuration & Form Handler
 * 
 * Defines isolated step sequences, form validation, required fields, and payload transformation
 * specifically for Public Open Tenders on the Buyer side.
 * Changes to Open Tender wizard configuration will NEVER affect RFP or RFQ.
 */

export interface OpenTenderWizardState {
  title: string;
  description: string;
  categoryId: string;
  estimatedValue: string;
  emdAmount: string;
  tenderFee: string;
  closesAt: string;
  preQualificationCriteria: Array<{ id: string; criteria: string; mandatory: boolean }>;
  boqItems: Array<{ id: string; name: string; quantity: number; unit: string; estimatedRate: number }>;
  documents: Array<Record<string, unknown>>;
}

export const openTenderWizardConfig = {
  methodId: 'OPEN_TENDER' as const,
  title: 'Open Tender',
  description: 'Public bidding event open to all eligible vendors with technical & financial submission rules.',

  steps: [
    { id: 'basics', title: 'Tender Overview', description: 'Define tender title, category, and estimated budget' },
    { id: 'emd', title: 'EMD & Tender Fees', description: 'Specify Earnest Money Deposit and document fee requirements' },
    { id: 'items', title: 'Bill of Quantities (BOQ)', description: 'Set BOQ items, quantities, and estimated rates' },
    { id: 'criteria', title: 'Pre-Qualification', description: 'Define mandatory vendor qualification criteria' },
    { id: 'schedule', title: 'Bidding Schedule', description: 'Set bid opening date, closing deadline, and evaluation schedule' },
    { id: 'publish', title: 'Publish Tender', description: 'Final verification and public tender launch' }
  ],

  initialState(): OpenTenderWizardState {
    return {
      title: '',
      description: '',
      categoryId: '',
      estimatedValue: '',
      emdAmount: '',
      tenderFee: '',
      closesAt: '',
      preQualificationCriteria: [
        { id: '1', criteria: 'GST Registration Certificate', mandatory: true },
        { id: '2', criteria: 'Minimum 3 years industry experience', mandatory: true }
      ],
      boqItems: [],
      documents: []
    };
  },

  validateStep(stepId: string, state: OpenTenderWizardState): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (stepId === 'basics') {
      if (!state.title || state.title.trim().length < 5) {
        errors.push('Open Tender title must be at least 5 characters');
      }
    } else if (stepId === 'emd') {
      if (state.emdAmount && Number(state.emdAmount) < 0) {
        errors.push('EMD amount cannot be negative');
      }
    } else if (stepId === 'schedule') {
      if (!state.closesAt) {
        errors.push('Tender closing deadline is required');
      } else if (new Date(state.closesAt) <= new Date()) {
        errors.push('Tender closing deadline must be in the future');
      }
    }
    return { valid: errors.length === 0, errors };
  },

  buildPayload(state: OpenTenderWizardState) {
    return {
      procurementType: 'OPEN_TENDER',
      title: state.title,
      description: state.description,
      categoryId: state.categoryId ? Number(state.categoryId) : undefined,
      estimatedValue: state.estimatedValue ? Number(state.estimatedValue) : undefined,
      closesAt: state.closesAt ? new Date(state.closesAt) : undefined,
      payload: {
        tenderMeta: {
          emdAmount: state.emdAmount ? Number(state.emdAmount) : 0,
          tenderFee: state.tenderFee ? Number(state.tenderFee) : 0,
          preQualificationCriteria: state.preQualificationCriteria,
          boqItems: state.boqItems
        }
      },
      documents: state.documents
    };
  }
};
