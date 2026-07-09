import prisma from '../../config/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { auditLog } from '../audit/audit.service.js';
import { numberSeries } from '../../services/workflow/workflow-common.js';
import type { CartEvaluationResult, ProcurementMethodCode, ProcurementModeSettingsDto } from './procurement-mode.types.js';

const DEFAULT_SETTINGS: ProcurementModeSettingsDto = {
  directPurchaseMaxValue: 25000,
  l1PurchaseMaxValue: 500000,
  bidMinValue: 500001,
  raRecommendedMinValue: 500001,
  pacApprovalRequired: true,
  internalApprovalRequired: true,
  demandSplitLookbackDays: 90,
  demandSplitSimilarityThreshold: 0.8,
  allowNonL1WithApproval: true,
  governmentProcurementOnlineGatewayEnabled: false,
  allowLegacyGrnInvoiceGate: true,
  financeSkipThreshold: 50000,
};

export const toSettingsDto = (row: {
  directPurchaseMaxValue: unknown;
  l1PurchaseMaxValue: unknown;
  bidMinValue: unknown;
  raRecommendedMinValue: unknown;
  pacApprovalRequired: boolean;
  internalApprovalRequired: boolean;
  demandSplitLookbackDays: number;
  demandSplitSimilarityThreshold: unknown;
  allowNonL1WithApproval: boolean;
  governmentProcurementOnlineGatewayEnabled: boolean;
  allowLegacyGrnInvoiceGate: boolean;
  financeSkipThreshold: unknown;
}): ProcurementModeSettingsDto => ({
  directPurchaseMaxValue: Number(row.directPurchaseMaxValue),
  l1PurchaseMaxValue: Number(row.l1PurchaseMaxValue),
  bidMinValue: Number(row.bidMinValue),
  raRecommendedMinValue: Number(row.raRecommendedMinValue),
  pacApprovalRequired: row.pacApprovalRequired,
  internalApprovalRequired: row.internalApprovalRequired,
  demandSplitLookbackDays: row.demandSplitLookbackDays,
  demandSplitSimilarityThreshold: Number(row.demandSplitSimilarityThreshold),
  allowNonL1WithApproval: row.allowNonL1WithApproval,
  governmentProcurementOnlineGatewayEnabled: row.governmentProcurementOnlineGatewayEnabled,
  allowLegacyGrnInvoiceGate: row.allowLegacyGrnInvoiceGate,
  financeSkipThreshold: Number(row.financeSkipThreshold),
});

export const getProcurementModeSettings = async (organizationId?: number | null): Promise<ProcurementModeSettingsDto> => {
  const orgRow = organizationId
    ? await prisma.procurementModeSetting.findFirst({ where: { organizationId } })
    : null;
  if (orgRow) return toSettingsDto(orgRow);

  const globalRow = await prisma.procurementModeSetting.findFirst({ where: { organizationId: null } });
  if (globalRow) return toSettingsDto(globalRow);

  return DEFAULT_SETTINGS;
};

export const upsertProcurementModeSettings = async (
  organizationId: number | null,
  data: Partial<ProcurementModeSettingsDto>
) => {
  const existing = await prisma.procurementModeSetting.findFirst({
    where: { organizationId: organizationId ?? null },
  });

  if (existing) {
    return prisma.procurementModeSetting.update({
      where: { id: existing.id },
      data: {
        ...data,
        updatedAt: new Date(),
      },
    });
  }

  return prisma.procurementModeSetting.create({
    data: {
      organizationId,
      ...DEFAULT_SETTINGS,
      ...data,
    },
  });
};

const computeCartValue = async (cartId: number, organizationId: number) => {
  const cart = await prisma.cart.findFirst({
    where: { id: cartId, organizationId, status: 'ACTIVE' },
    include: { items: true },
  });
  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, 'Active cart not found or empty.', 'CART_EMPTY');
  }

  let cartValue = 0;
  const sellerIds = new Set<number>();

  for (const item of cart.items) {
    sellerIds.add(item.sellerId);
    let unitPrice = Number(item.unitPrice);
    let taxRate = 0;

    if (item.productId) {
      const product = await prisma.product.findUnique({ where: { id: item.productId } });
      if (product) {
        unitPrice = Number(product.discountPrice || product.price || unitPrice);
        taxRate = Number(product.taxRate || 0);
      }
    } else if (item.serviceId) {
      const service = await prisma.service.findUnique({ where: { id: item.serviceId } });
      if (service) {
        unitPrice = Number(service.discountPrice || service.basePrice || unitPrice);
        taxRate = Number(service.taxRate || 0);
      }
    }

    const qty = Number(item.quantity);
    const excl = qty * unitPrice;
    cartValue += excl + excl * (taxRate / 100);
  }

  return { cart, cartValue, sellerCount: sellerIds.size, itemCount: cart.items.length };
};

const detectDemandSplitting = async (
  organizationId: number,
  cartValue: number,
  settings: ProcurementModeSettingsDto
) => {
  const since = new Date();
  since.setDate(since.getDate() - settings.demandSplitLookbackDays);

  const recent = await prisma.procurementRequest.findMany({
    where: {
      organizationId,
      createdAt: { gte: since },
      status: { notIn: ['CANCELLED', 'REJECTED'] },
    },
    select: { cartSnapshot: true, budgetSanction: true },
  });

  const threshold = settings.bidMinValue * settings.demandSplitSimilarityThreshold;
  const combinedRecent = recent.reduce((sum, r) => {
    const snap = r.cartSnapshot as { totalValue?: number } | null;
    return sum + Number(snap?.totalValue || 0);
  }, 0);

  return combinedRecent + cartValue >= settings.bidMinValue && cartValue < settings.bidMinValue;
};

export const evaluateCartProcurementMode = async (params: {
  cartId: number;
  organizationId: number;
  buyerId: number;
  selectedMethod?: string;
  proprietary?: boolean;
  buyerJustification?: string;
}): Promise<CartEvaluationResult> => {
  const settings = await getProcurementModeSettings(params.organizationId);
  const { cartValue, sellerCount, itemCount } = await computeCartValue(params.cartId, params.organizationId);

  const warnings: string[] = [];
  const requiredDocuments: string[] = [];
  const requiredApprovals: string[] = [];

  const demandSplittingRisk = await detectDemandSplitting(params.organizationId, cartValue, settings);
  if (demandSplittingRisk) {
    warnings.push('Possible demand splitting detected. Similar purchases in the lookback period may exceed bid threshold.');
  }

  const pacRequired = Boolean(params.proprietary);
  if (pacRequired) {
    warnings.push('Proprietary/OEM-specific purchase requires PAC justification and approval.');
    requiredDocuments.push('PAC Certificate', 'Competent Authority Approval');
    requiredApprovals.push('PAC_APPROVAL');
  }

  let recommendedMethod: ProcurementMethodCode = 'DIRECT_PURCHASE';
  const allowedMethods: ProcurementMethodCode[] = [];
  const blockedMethods: ProcurementMethodCode[] = [];

  if (cartValue <= settings.directPurchaseMaxValue && sellerCount === 1 && itemCount <= 5 && !pacRequired) {
    allowedMethods.push('DIRECT_PURCHASE');
    recommendedMethod = 'DIRECT_PURCHASE';
  } else {
    blockedMethods.push('DIRECT_PURCHASE');
    warnings.push('Direct Purchase not allowed for this cart value, seller count, or item complexity.');
  }

  if (cartValue <= settings.l1PurchaseMaxValue && !pacRequired) {
    allowedMethods.push('L1_PURCHASE');
    if (recommendedMethod === 'DIRECT_PURCHASE' && (sellerCount > 1 || cartValue > settings.directPurchaseMaxValue)) {
      recommendedMethod = 'L1_PURCHASE';
    }
    requiredDocuments.push('L1 Comparison PDF');
  } else if (cartValue > settings.directPurchaseMaxValue) {
    blockedMethods.push('L1_PURCHASE');
  }

  const l1Required = cartValue > settings.directPurchaseMaxValue && cartValue <= settings.l1PurchaseMaxValue;
  if (l1Required) {
    warnings.push('L1 comparison required for this value band.');
  }

  if (cartValue >= settings.bidMinValue || itemCount > 10) {
    allowedMethods.push('BID_FROM_CART');
    recommendedMethod = 'BID_FROM_CART';
    warnings.push('Formal bid recommended for high value or complex specifications.');
  }

  if (cartValue >= settings.raRecommendedMinValue) {
    allowedMethods.push('RA_FROM_CART');
    if (cartValue >= settings.raRecommendedMinValue * 1.2) {
      recommendedMethod = 'RA_FROM_CART';
    }
  }

  if (pacRequired) {
    allowedMethods.push('PAC_PROCUREMENT');
    recommendedMethod = 'PAC_PROCUREMENT';
  }

  // Always allow Single Source and Repeat Order as selectable methods
  allowedMethods.push('SINGLE_SOURCE');
  allowedMethods.push('REPEAT_ORDER');

  if (settings.internalApprovalRequired) {
    requiredApprovals.push('INTERNAL_APPROVAL');
  }

  const bidRequired = cartValue >= settings.bidMinValue;
  const priceReasonabilityRisk = cartValue >= settings.l1PurchaseMaxValue * 0.5;

  if (params.selectedMethod && !allowedMethods.includes(params.selectedMethod as ProcurementMethodCode)) {
    warnings.push(`Selected method ${params.selectedMethod} is not allowed for this cart.`);
  }

  await auditLog({
    actorUserId: params.buyerId,
    action: 'procurement.method.evaluated',
    entityType: 'cart',
    entityId: params.cartId,
    metadata: { cartValue, recommendedMethod, allowedMethods, warnings },
  });

  return {
    recommendedMethod,
    allowedMethods,
    blockedMethods,
    cartValue,
    sellerCount,
    itemCount,
    l1Required,
    bidRequired,
    pacRequired,
    demandSplittingRisk,
    priceReasonabilityRisk,
    warnings,
    requiredDocuments,
    requiredApprovals,
  };
};

export const confirmProcurementMethod = async (params: {
  cartId: number;
  organizationId: number;
  buyerId: number;
  selectedMethod: string;
  justification?: string;
  l1ComparisonId?: number;
  pacJustification?: Record<string, unknown>;
  demandSplittingConfirmation?: boolean;
}) => {
  const evaluation = await evaluateCartProcurementMode({
    cartId: params.cartId,
    organizationId: params.organizationId,
    buyerId: params.buyerId,
    selectedMethod: params.selectedMethod,
    proprietary: params.selectedMethod === 'PAC_PROCUREMENT',
  });

  if (!evaluation.allowedMethods.includes(params.selectedMethod as ProcurementMethodCode)) {
    throw new ApiError(
      409,
      `Procurement method ${params.selectedMethod} is not allowed. ${evaluation.warnings.join(' ')}`,
      'METHOD_NOT_ALLOWED'
    );
  }

  if (evaluation.demandSplittingRisk && !params.demandSplittingConfirmation) {
    throw new ApiError(409, 'Demand splitting confirmation is required.', 'DEMAND_SPLIT_CONFIRMATION_REQUIRED');
  }

  const { cart, cartValue } = await computeCartValue(params.cartId, params.organizationId);

  const request = await prisma.procurementRequest.create({
    data: {
      requestNumber: numberSeries('PRQ'),
      cartId: params.cartId,
      buyerId: params.buyerId,
      organizationId: params.organizationId,
      selectedMethod: params.selectedMethod,
      recommendedMethod: evaluation.recommendedMethod,
      status: 'PROCUREMENT_METHOD_SELECTED',
      cartSnapshot: {
        cartId: cart.id,
        items: cart.items,
        totalValue: cartValue,
      },
      pacJustification: params.pacJustification || undefined,
      l1ComparisonId: params.l1ComparisonId || undefined,
      warnings: evaluation.warnings,
      declarations: params.justification ? { methodJustification: params.justification } : undefined,
    },
  });

  await auditLog({
    actorUserId: params.buyerId,
    action: 'procurement.method.selected',
    entityType: 'procurement_request',
    entityId: request.id,
    metadata: { selectedMethod: params.selectedMethod, cartId: params.cartId },
  });

  return { procurementRequestId: request.id, checkoutDraftId: request.id, evaluation };
};

export const getFinanceSkipThreshold = async (organizationId?: number | null) => {
  const settings = await getProcurementModeSettings(organizationId);
  return settings.financeSkipThreshold;
};
