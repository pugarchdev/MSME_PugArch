export type ProcurementMethod =
  | 'BUY_DIRECTLY'
  | 'REQUEST_QUOTATIONS'
  | 'LARGE_PROCUREMENT'
  | 'NEGOTIATE_PRICE'
  | 'POST_REQUIREMENT';

export interface ProcurementIntent {
  method: ProcurementMethod;
  title: string;
  helper: string;
}

export interface ProcurementWizardDraft {
  intent?: ProcurementMethod;
  title: string;
  productOrService: string;
  categoryId?: string;
  categoryName: string;
  quantity: string;
  unit: string;
  budgetMin: string;
  budgetMax: string;
  estimatedValue: string;
  deliveryLocation: string;
  requiredDeliveryDate: string;
  specifications: string;
  supportingDocuments: string;
  visibility: 'PUBLIC' | 'VERIFIED_SELLERS_ONLY' | 'INVITED_SUPPLIERS';
  selectedMethod?: ProcurementMethod;
  recommendationReason?: string;
  updatedAt?: string;
}

export interface ProcurementMethodRecommendation {
  method: ProcurementMethod;
  reason: string;
  confidence: 'high' | 'medium' | 'low';
}

export const METHOD_LABELS: Record<ProcurementMethod, string> = {
  BUY_DIRECTLY: 'Buy directly from marketplace',
  REQUEST_QUOTATIONS: 'Request quotations from suppliers',
  LARGE_PROCUREMENT: 'Create a large procurement',
  NEGOTIATE_PRICE: 'Negotiate through auction',
  POST_REQUIREMENT: 'Post an open requirement',
};

export const METHOD_ROUTE_MAP: Record<ProcurementMethod, string> = {
  BUY_DIRECTLY: '/buyer/marketplace',
  REQUEST_QUOTATIONS: '/buyer/rfq',
  LARGE_PROCUREMENT: '/buyer/publish-bid',
  NEGOTIATE_PRICE: '/reverse-auctions/create',
  POST_REQUIREMENT: '/buyer/requirements/new',
};

export const EMPTY_PROCUREMENT_DRAFT: ProcurementWizardDraft = {
  title: '',
  productOrService: '',
  categoryName: '',
  quantity: '',
  unit: '',
  budgetMin: '',
  budgetMax: '',
  estimatedValue: '',
  deliveryLocation: '',
  requiredDeliveryDate: '',
  specifications: '',
  supportingDocuments: '',
  visibility: 'VERIFIED_SELLERS_ONLY',
};
