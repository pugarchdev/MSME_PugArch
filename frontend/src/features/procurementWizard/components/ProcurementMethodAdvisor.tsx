import type { ProcurementMethodRecommendation, ProcurementWizardDraft } from '../types';

const numberValue = (value?: string) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const recommendProcurementMethod = (draft: ProcurementWizardDraft): ProcurementMethodRecommendation => {
  const estimatedValue = numberValue(draft.estimatedValue || draft.budgetMax);
  const specs = `${draft.title} ${draft.itemType} ${draft.otherItemType} ${draft.productOrService} ${draft.categoryName} ${draft.otherCategoryName} ${draft.deliveryType} ${draft.paymentTerms} ${draft.specifications}`.toLowerCase();

  if (draft.intent === 'BUY_DIRECTLY') {
    return {
      method: 'BUY_DIRECTLY',
      confidence: 'high',
      reason: 'The buyer already knows what to buy, so the fastest path is to continue through marketplace purchase or cart approval.',
    };
  }

  if (draft.intent === 'POST_REQUIREMENT' || !draft.productOrService.trim()) {
    return {
      method: 'POST_REQUIREMENT',
      confidence: 'medium',
      reason: 'The product or seller is not fully identified, so an open requirement helps verified suppliers respond.',
    };
  }

  if (draft.intent === 'NEGOTIATE_PRICE' || specs.includes('auction') || specs.includes('price competition')) {
    return {
      method: 'NEGOTIATE_PRICE',
      confidence: 'medium',
      reason: 'The requirement appears suitable for price competition after the specification is fixed.',
    };
  }

  if (draft.intent === 'LARGE_PROCUREMENT' || estimatedValue >= 2500000 || specs.includes('formal evaluation') || specs.includes('technical evaluation')) {
    return {
      method: 'LARGE_PROCUREMENT',
      confidence: 'high',
      reason: 'The estimated value or evaluation need suggests a formal large procurement with approvals and controlled bid evaluation.',
    };
  }

  return {
    method: 'REQUEST_QUOTATIONS',
    confidence: 'high',
    reason: 'Multiple verified suppliers can respond and the buyer can compare prices, delivery timelines, and terms before selection.',
  };
};
