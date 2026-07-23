import { useFeatureQuery } from '../shared/hooks';
import type { PurchaseOrderDto } from '../shared/types';
export const usePurchaseOrders = () => {
  const result = useFeatureQuery<any>('/api/purchase-orders', []);
  const items = Array.isArray(result.data)
    ? result.data
    : result.data?.purchaseOrders || result.data?.items || result.data?.records || [];
  return { ...result, data: items as PurchaseOrderDto[] };
};
