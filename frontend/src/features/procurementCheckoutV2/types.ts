export type ProcurementMethodCode =
  | 'DIRECT_PURCHASE'
  | 'L1_PURCHASE'
  | 'BID_FROM_CART'
  | 'RA_FROM_CART'
  | 'PAC_PROCUREMENT'
  | 'SINGLE_SOURCE'
  | 'REPEAT_ORDER';

export interface CartEvaluation {
  recommendedMethod: ProcurementMethodCode;
  allowedMethods: ProcurementMethodCode[];
  blockedMethods: ProcurementMethodCode[];
  cartValue: number;
  sellerCount: number;
  itemCount: number;
  l1Required: boolean;
  bidRequired: boolean;
  pacRequired: boolean;
  demandSplittingRisk: boolean;
  priceReasonabilityRisk: boolean;
  warnings: string[];
  requiredDocuments: string[];
  requiredApprovals: string[];
}

export interface CheckoutFormData {
  selectedMethod: ProcurementMethodCode | '';
  l1ComparisonId?: number;
  pacJustification?: Record<string, unknown>;
  demandSplittingConfirmation: boolean;
  buyerDetails: Record<string, unknown>;
  consigneeDetails: Record<string, unknown>;
  deliveryDetails: Record<string, unknown>;
  budgetSanction: Record<string, unknown>;
  paymentAuthority: Record<string, unknown>;
  priceReasonability: Record<string, unknown>;
  termsDocuments: Record<string, unknown>;
  declarations: {
    specsConfirmed?: boolean;
    priceReasonabilityConfirmed?: boolean;
    budgetConfirmed?: boolean;
    authorityConfirmed?: boolean;
    noDemandSplitConfirmed?: boolean;
    termsAccepted?: boolean;
  };
}

export interface ProcurementRequestDto {
  id: number;
  requestNumber: string;
  cartId?: number | null;
  selectedMethod?: string | null;
  recommendedMethod?: string | null;
  status: string;
  warnings?: string[];
}
