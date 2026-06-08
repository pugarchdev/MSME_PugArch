import { ApiError } from './ApiError.js';

type BidPricingInput = {
  unitPrice?: unknown;
  quantity?: unknown;
  taxRate?: unknown;
  discountAmount?: unknown;
};

const money = (value: number) => Number(value.toFixed(2));

export const calculateBidPricing = (input: BidPricingInput) => {
  const unitPrice = Number(input.unitPrice || 0);
  const quantity = Number(input.quantity || 0);
  const taxRate = Number(input.taxRate || 0);
  const discountAmount = money(Number(input.discountAmount || 0));

  if (![unitPrice, quantity, taxRate, discountAmount].every(Number.isFinite)) {
    throw new ApiError(400, 'Quotation pricing values are invalid', 'BID_PRICING_INVALID');
  }
  if (taxRate < 0 || taxRate > 100) {
    throw new ApiError(400, 'Tax rate must be between 0 and 100', 'BID_TAX_RATE_INVALID');
  }
  if (discountAmount < 0) {
    throw new ApiError(400, 'Discount amount cannot be negative', 'BID_DISCOUNT_INVALID');
  }

  const subtotal = money(unitPrice * quantity);
  if (discountAmount > subtotal) {
    throw new ApiError(400, 'Discount amount cannot exceed subtotal', 'BID_DISCOUNT_INVALID');
  }
  const taxableAmount = money(subtotal - discountAmount);
  const taxAmount = money(taxableAmount * taxRate / 100);

  return {
    taxRate,
    discountAmount,
    subtotal,
    taxAmount,
    totalAmount: money(taxableAmount + taxAmount)
  };
};

export const quotedBidTotal = (bid: BidPricingInput & { totalAmount?: unknown }) =>
  bid.totalAmount === undefined || bid.totalAmount === null
    ? calculateBidPricing(bid).totalAmount
    : money(Number(bid.totalAmount));
