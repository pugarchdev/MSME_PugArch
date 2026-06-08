import { getApi, postApi, putApi } from '../shared/apiClient';

export const procurementOrderApi = {
  listOrders: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
    return getApi<any>(`/api/orders/procurement${qs ? `?${qs}` : ''}`, true);
  },
  getOrder: (orderId: number | string) => getApi<any>(`/api/orders/procurement/${orderId}`, true),
  sellerAwards: () => getApi<any[]>('/api/seller/awards', true),
  acceptAward: (awardId: number, payload: { remarks?: string; expectedDelivery?: string } = {}) =>
    postApi<any>(`/api/seller/awards/${awardId}/accept`, payload),
  rejectAward: (awardId: number, reason: string) =>
    postApi<any>(`/api/seller/awards/${awardId}/reject`, { reason }),
  updateDelivery: (orderId: number, payload: Record<string, unknown>) =>
    postApi<any>(`/api/orders/${orderId}/delivery/update`, payload),
  getDelivery: (orderId: number) => getApi<any>(`/api/orders/${orderId}/delivery`, true),
  createGrn: (orderId: number, payload: Record<string, unknown>) =>
    postApi<any>(`/api/orders/${orderId}/grn`, payload),
  updateGrn: (orderId: number, grnId: number, payload: Record<string, unknown>) =>
    putApi<any>(`/api/orders/${orderId}/grn/${grnId}`, payload),
  approveGrn: (orderId: number, grnId: number, payload: Record<string, unknown> = {}) =>
    postApi<any>(`/api/orders/${orderId}/grn/${grnId}/approve`, payload),
  rejectGrn: (orderId: number, grnId: number, reason: string) =>
    postApi<any>(`/api/orders/${orderId}/grn/${grnId}/reject`, { reason }),
  createInvoice: (orderId: number, payload: Record<string, unknown>) =>
    postApi<any>(`/api/orders/${orderId}/invoice`, payload),
  approveInvoice: (orderId: number, invoiceId: number) =>
    postApi<any>(`/api/orders/${orderId}/invoice/${invoiceId}/approve`, {}),
  rejectInvoice: (orderId: number, invoiceId: number, reason: string) =>
    postApi<any>(`/api/orders/${orderId}/invoice/${invoiceId}/reject`, { reason }),
  initiatePayment: (orderId: number, payload: Record<string, unknown> = {}) =>
    postApi<any>(`/api/orders/${orderId}/payment/initiate`, payload),
  paymentStatus: (orderId: number) => getApi<any>(`/api/orders/${orderId}/payment/status`, true),
  markSettlementConfirmed: (orderId: number, payload: Record<string, unknown>) =>
    postApi<any>(`/api/orders/${orderId}/settlement/mark-confirmed`, payload),
  adminSettlements: (params: Record<string, string | number> = {}) => {
    const qs = new URLSearchParams(Object.entries(params).map(([key, value]) => [key, String(value)])).toString();
    return getApi<any>(`/api/admin/settlements${qs ? `?${qs}` : ''}`, true);
  },
};
