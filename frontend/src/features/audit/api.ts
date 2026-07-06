import { getApi } from '../shared/apiClient';
import type { ProcurementAuditEntry } from './types';

export { getApi, postApi, putApi, deleteApi } from '../shared/apiClient';

export const fetchProcurementAuditTrail = (bidId: number | string) =>
  getApi<ProcurementAuditEntry[]>(`/api/admin/bids/${bidId}/audit`);

export const fetchAdminProcurementMethods = () =>
  getApi<Array<{ id: string; label: string; broadMethod: string; isException: boolean }>>(
    '/api/admin/procurement/methods'
  );

export const fetchAdminProcurementRequests = (params?: Record<string, string | number>) => {
  const query = params ? '?' + new URLSearchParams(
    Object.entries(params).reduce((acc, [k, v]) => ({ ...acc, [k]: String(v) }), {} as Record<string, string>)
  ).toString() : '';
  return getApi<{
    items: Array<Record<string, unknown>>;
    total: number;
    page: number;
    pageSize: number;
  }>(`/api/admin/procurement/requests${query}`);
};

export const fetchReviewContext = (requestId: number) =>
  getApi<{ request: Record<string, unknown>; reviewContext: Record<string, unknown> }>(
    `/api/admin/procurement/requests/${requestId}/review-context`
  );

export const fetchMethodWiseReports = (params?: Record<string, string>) => {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return getApi<{
    counts: Array<{ method: string; label: string; broadMethod: string; count: number; isException: boolean }>;
    spend: Array<{ method: string; label: string; totalSpend: number; isException: boolean }>;
    tenderComparison: Array<{ method: string; label: string; count: number; totalSpend: number }>;
  }>(`/api/admin/reports/procurement/method-wise${query}`);
};

export const fetchExceptionReport = (params?: Record<string, string>) => {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return getApi<Array<Record<string, unknown>>>(`/api/admin/reports/procurement/exceptions${query}`);
};

export const fetchReverseAuctionSavings = (params?: Record<string, string>) => {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return getApi<Array<{
    id: number; bidNumber: string; title: string; estimatedValue: number;
    awardedAmount: number | null; savings: number | null; savingsPercent: number | null;
  }>>(`/api/admin/reports/procurement/reverse-auction-savings${query}`);
};

export const fetchRepeatOrderReport = (params?: Record<string, string>) => {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return getApi<Array<Record<string, unknown>>>(`/api/admin/reports/procurement/repeat-orders${query}`);
};

export const fetchRateContractUtilization = (params?: Record<string, string>) => {
  const query = params ? '?' + new URLSearchParams(params).toString() : '';
  return getApi<{ total: number; active: number; expired: number; ordersAgainstContracts: number }>(
    `/api/admin/reports/procurement/rate-contracts${query}`
  );
};
