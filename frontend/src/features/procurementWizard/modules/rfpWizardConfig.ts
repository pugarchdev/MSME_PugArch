/**
 * RFP (Request for Proposal) Wizard Configuration & Form Handler
 * 
 * Defines isolated step sequences, form validation, required fields, and payload transformation
 * specifically for Request for Proposals on the Buyer side.
 * Changes to RFP wizard configuration will NEVER affect RFQ or Open Tender.
 */

export interface RfpWizardState {
  title: string;
  description: string;
  categoryId: string;
  estimatedValue: string;
  proposalDeadline: string;
  evaluationCriteria: Array<{ id: string; name: string; weightage: number; description: string }>;
  deliverables: Array<{ id: string; name: string; description: string }>;
  technicalProposalRequired: boolean;
  financialProposalRequired: boolean;
  items: Array<Record<string, unknown>>;
  documents: Array<Record<string, unknown>>;
}

export const rfpWizardConfig = {
  methodId: 'RFP' as const,
  title: 'Request for Proposal (RFP)',
  description: 'Solicit detailed technical and commercial proposals from suppliers for complex services or custom projects.',

  steps: [
    { id: 'basics', title: 'Scope & Details', description: 'Define RFP objective, category, and budget estimate' },
    { id: 'items', title: 'Deliverables & Line Items', description: 'Specify required services, deliverables, and items' },
    { id: 'evaluation', title: 'Proposal Evaluation Criteria', description: 'Define technical vs financial evaluation weightages' },
    { id: 'terms', title: 'Terms & Submission Schedule', description: 'Set proposal deadline and submission rules' },
    { id: 'publish', title: 'Review & Publish RFP', description: 'Final review before publishing to vendors' }
  ],

  initialState(): RfpWizardState {
    return {
      title: '',
      description: '',
      categoryId: '',
      estimatedValue: '',
      proposalDeadline: '',
      evaluationCriteria: [
        { id: '1', name: 'Technical Methodology & Approach', weightage: 50, description: 'Evaluation of proposed technical solution' },
        { id: '2', name: 'Vendor Experience & Capability', weightage: 20, description: 'Relevant past performance and team expertise' },
        { id: '3', name: 'Commercial & Financial Offer', weightage: 30, description: 'Total cost competitiveness and payment terms' }
      ],
      deliverables: [],
      technicalProposalRequired: true,
      financialProposalRequired: true,
      items: [],
      documents: []
    };
  },

  validateStep(stepId: string, state: RfpWizardState): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (stepId === 'basics') {
      if (!state.title || state.title.trim().length < 5) {
        errors.push('RFP title must be at least 5 characters');
      }
      if (!state.description || state.description.trim().length < 10) {
        errors.push('RFP scope description must be at least 10 characters');
      }
    } else if (stepId === 'evaluation') {
      const total = state.evaluationCriteria.reduce((sum, c) => sum + (Number(c.weightage) || 0), 0);
      if (Math.abs(total - 100) > 0.01) {
        errors.push(`Evaluation criteria weightages must sum to 100% (Current total: ${total}%)`);
      }
    } else if (stepId === 'terms') {
      if (!state.proposalDeadline) {
        errors.push('Proposal submission deadline is required');
      }
    }
    return { valid: errors.length === 0, errors };
  },

  buildPayload(state: RfpWizardState) {
    return {
      procurementType: 'RFP',
      title: state.title,
      description: state.description,
      categoryId: state.categoryId ? Number(state.categoryId) : undefined,
      estimatedValue: state.estimatedValue ? Number(state.estimatedValue) : undefined,
      requiredBy: state.proposalDeadline ? new Date(state.proposalDeadline) : undefined,
      payload: {
        rfpMeta: {
          evaluationCriteria: state.evaluationCriteria,
          deliverables: state.deliverables,
          technicalProposalRequired: state.technicalProposalRequired,
          financialProposalRequired: state.financialProposalRequired
        }
      },
      items: state.items,
      documents: state.documents
    };
  }
};
