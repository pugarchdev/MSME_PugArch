import { positiveNumber, requiredText } from '../shared/validation';

export const validateCatalogueItem = (payload: { name?: string; price?: unknown; basePrice?: unknown }) => ({
  name: requiredText(payload.name),
  price: payload.price === undefined || positiveNumber(payload.price),
  basePrice: payload.basePrice === undefined || positiveNumber(payload.basePrice)
});
