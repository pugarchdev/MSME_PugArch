export type ProcurementMethodCode =
  | 'DIRECT_PURCHASE'
  | 'L1_PURCHASE'
  | 'BID_FROM_CART'
  | 'RA_FROM_CART'
  | 'PAC_PROCUREMENT'
  | 'SINGLE_SOURCE'
  | 'REPEAT_ORDER';

export interface ProcurementModeSettingsDto {
  directPurchaseMaxValue: number;
  l1PurchaseMaxValue: number;
  bidMinValue: number;
  raRecommendedMinValue: number;
  pacApprovalRequired: boolean;
  internalApprovalRequired: boolean;
  demandSplitLookbackDays: number;
  demandSplitSimilarityThreshold: number;
  allowNonL1WithApproval: boolean;
  governmentProcurementOnlineGatewayEnabled: boolean;
  allowLegacyGrnInvoiceGate: boolean;
  financeSkipThreshold: number;
}

export interface CartEvaluationResult {
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
