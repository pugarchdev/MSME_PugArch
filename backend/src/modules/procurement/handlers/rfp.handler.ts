/**
 * RFP (Request for Proposal) Isolated Business Logic Handler
 * 
 * Manages validation, status transitions, proposal scoring, and workflow logic
 * specifically for Request for Proposals. Changes here will NEVER affect RFQ or Open Tender.
 */

export interface RfpRequirementInput {
  title: string;
  description?: string;
  categoryId?: number;
  estimatedValue?: number;
  requiredBy?: Date;
  proposalDeadline?: Date;
  evaluationCriteria?: Array<{ name: string; weightage: number; description?: string }>;
  deliverables?: Array<{ name: string; description?: string }>;
  items?: Array<Record<string, unknown>>;
  payload?: Record<string, unknown>;
}

export interface RfpProposalInput {
  technicalProposalUrl?: string;
  financialProposalUrl?: string;
  technicalSummary?: string;
  quotedAmount?: number;
  complianceDeclarations?: Record<string, boolean>;
  milestones?: Array<{ name: string; cost: number }>;
}

export const rfpHandler = {
  type: 'RFP' as const,

  validateRequirement(input: RfpRequirementInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.title || input.title.trim().length === 0) {
      errors.push('RFP title is required');
    }
    if (input.evaluationCriteria && input.evaluationCriteria.length > 0) {
      const totalWeight = input.evaluationCriteria.reduce((sum, c) => sum + (Number(c.weightage) || 0), 0);
      if (Math.abs(totalWeight - 100) > 0.01) {
        errors.push('RFP evaluation criteria weightages must sum to 100%');
      }
    }
    return { valid: errors.length === 0, errors };
  },

  normalizePayload(input: RfpRequirementInput): Record<string, unknown> {
    return {
      procurementType: 'RFP',
      proposalDeadline: input.proposalDeadline || null,
      evaluationCriteria: input.evaluationCriteria || [],
      deliverables: input.deliverables || [],
      customPayload: input.payload || {}
    };
  },

  validateProposal(input: RfpProposalInput): { valid: boolean; errors: string[] } {
    const errors: string[] = [];
    if (!input.technicalProposalUrl && !input.technicalSummary) {
      errors.push('RFP submission requires a technical proposal document or summary');
    }
    if (input.quotedAmount !== undefined && input.quotedAmount < 0) {
      errors.push('Financial quote amount cannot be negative');
    }
    return { valid: errors.length === 0, errors };
  },

  calculateProposalScore(technicalScore: number, financialScore: number, techWeight = 0.7, finWeight = 0.3): number {
    const normTech = Math.min(100, Math.max(0, technicalScore));
    const normFin = Math.min(100, Math.max(0, financialScore));
    return Math.round((normTech * techWeight + normFin * finWeight) * 100) / 100;
  }
};
