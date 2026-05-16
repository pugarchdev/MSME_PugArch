import { useFeatureQuery } from '../shared/hooks';
import type { PurchaseOrderDto } from '../shared/types';
export const usePurchaseOrders = () => useFeatureQuery<PurchaseOrderDto[]>('/api/purchase-orders', []);
