import prisma from '../../lib/prisma.js';
import { ApiError } from '../../utils/ApiError.js';
import { auditLog } from '../audit/audit.service.js';
import { numberSeries } from '../../services/workflow/workflow-common.js';
import { getProcurementModeSettings } from '../procurementMode/procurement-mode.service.js';

type ComparedSellerRow = {
  sellerId: number;
  sellerName: string;
  productOrService: string;
  unitPrice: number;
  totalPrice: number;
  deliveryPeriod?: string;
  warranty?: string;
  sellerRating?: number;
  locationServiceability?: string;
  complianceStatus: 'Compliant' | 'Non-compliant' | 'Clarification Required';
  isL1?: boolean;
};

const buildComparisonFromCart = async (cartId: number, organizationId: number) => {
  const cart = await prisma.cart.findFirst({
    where: { id: cartId, organizationId, status: 'ACTIVE' },
    include: {
      items: {
        include: {
          seller: { include: { sellerProfile: true } },
          product: true,
          service: true,
        },
      },
    },
  });
  if (!cart || cart.items.length === 0) {
    throw new ApiError(400, 'Active cart not found or empty.', 'CART_EMPTY');
  }

  const rows: ComparedSellerRow[] = [];
  for (const item of cart.items) {
    const unitPrice = Number(item.unitPrice);
    const qty = Number(item.quantity);
    rows.push({
      sellerId: item.sellerId,
      sellerName: item.seller?.sellerProfile?.businessName || item.seller?.name || `Seller #${item.sellerId}`,
      productOrService: item.itemName,
      unitPrice,
      totalPrice: unitPrice * qty,
      deliveryPeriod: '30 Days',
      warranty: 'As per catalogue',
      sellerRating: undefined,
      locationServiceability: 'Available',
      complianceStatus: 'Compliant',
    });
  }

  const compliant = rows.filter(r => r.complianceStatus === 'Compliant');
  if (compliant.length > 0) {
    const minPrice = Math.min(...compliant.map(r => r.unitPrice));
    compliant.filter(r => r.unitPrice === minPrice).forEach(r => { r.isL1 = true; });
  }

  return { cart, rows, l1SellerId: compliant.find(r => r.isL1)?.sellerId ?? null };
};

export const createL1ComparisonFromCart = async (params: {
  cartId: number;
  organizationId: number;
  buyerId: number;
}) => {
  const { cart, rows, l1SellerId } = await buildComparisonFromCart(params.cartId, params.organizationId);
  const settings = await getProcurementModeSettings(params.organizationId);

  const uniqueSellers = new Set(rows.map(r => r.sellerId));
  if (uniqueSellers.size < 3 && rows.length < 3) {
    // Warning only — marketplace may not always have 3 sellers
  }

  const comparison = await prisma.l1Comparison.create({
    data: {
      comparisonNumber: numberSeries('L1C'),
      cartId: params.cartId,
      buyerId: params.buyerId,
      organizationId: params.organizationId,
      comparedSellers: rows,
      l1SellerId,
      snapshot: { cartId: cart.id, rows, generatedAt: new Date().toISOString() },
      status: 'DRAFT',
    },
  });

  await auditLog({
    actorUserId: params.buyerId,
    action: 'l1.comparison.created',
    entityType: 'l1_comparison',
    entityId: comparison.id,
    metadata: { cartId: params.cartId, l1SellerId },
  });

  return { comparison, l1SellerId, allowNonL1WithApproval: settings.allowNonL1WithApproval };
};

export const getL1Comparison = async (id: number, organizationId: number) => {
  const comparison = await prisma.l1Comparison.findFirst({
    where: { id, organizationId },
  });
  if (!comparison) throw new ApiError(404, 'L1 comparison not found.', 'NOT_FOUND');
  return comparison;
};

export const selectL1Seller = async (params: {
  id: number;
  organizationId: number;
  buyerId: number;
  selectedSellerId: number;
  nonL1Justification?: string;
}) => {
  const comparison = await getL1Comparison(params.id, params.organizationId);
  const settings = await getProcurementModeSettings(params.organizationId);
  const rows = (comparison.comparedSellers as ComparedSellerRow[]) || [];
  const l1SellerId = comparison.l1SellerId;

  if (params.selectedSellerId !== l1SellerId) {
    if (!settings.allowNonL1WithApproval) {
      await auditLog({
        actorUserId: params.buyerId,
        action: 'l1.non_l1.blocked',
        entityType: 'l1_comparison',
        entityId: comparison.id,
      });
      throw new ApiError(409, 'Non-L1 seller selection requires approval and is blocked by policy.', 'NON_L1_BLOCKED');
    }
    if (!params.nonL1Justification?.trim()) {
      throw new ApiError(400, 'Justification required when selecting non-L1 seller.', 'JUSTIFICATION_REQUIRED');
    }
  }

  const updated = await prisma.l1Comparison.update({
    where: { id: comparison.id },
    data: {
      selectedSellerId: params.selectedSellerId,
      nonL1Justification: params.nonL1Justification || null,
      status: 'SELECTED',
    },
  });

  await auditLog({
    actorUserId: params.buyerId,
    action: 'l1.seller.selected',
    entityType: 'l1_comparison',
    entityId: comparison.id,
    metadata: { selectedSellerId: params.selectedSellerId, isL1: params.selectedSellerId === l1SellerId },
  });

  return updated;
};

export const buildL1ComparisonPdfPayload = async (id: number, organizationId: number) => {
  const comparison = await getL1Comparison(id, organizationId);
  return {
    comparisonNumber: comparison.comparisonNumber,
    comparedSellers: comparison.comparedSellers,
    l1SellerId: comparison.l1SellerId,
    selectedSellerId: comparison.selectedSellerId,
    generatedAt: comparison.createdAt,
  };
};
