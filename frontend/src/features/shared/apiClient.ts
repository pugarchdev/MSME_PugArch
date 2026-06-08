import { api } from '../../lib/api';
import type { PaginatedResult } from './types';

export type ApiEnvelope<T> = { success?: boolean; data?: T } | T;

export const authHeaders = (): Record<string, string> => {
  if (typeof window === 'undefined') return {};
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
};

export const unwrap = async <T>(response: Response): Promise<T> => {
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.message || body?.error || 'Request failed';
    throw new Error(message);
  }
  return (body?.data ?? body) as T;
};

export const normalizeList = <T>(value: unknown): T[] => {
  if (Array.isArray(value)) return value as T[];
  const body = value as any;
  if (Array.isArray(body?.records)) return body.records;
  if (Array.isArray(body?.items)) return body.items;
  if (Array.isArray(body?.data?.records)) return body.data.records;
  if (Array.isArray(body?.data?.items)) return body.data.items;
  if (Array.isArray(body?.payments)) return body.payments;
  if (Array.isArray(body?.escrowAccounts)) return body.escrowAccounts;
  if (Array.isArray(body?.organizations)) return body.organizations;
  if (Array.isArray(body?.purchaseOrders)) return body.purchaseOrders;
  if (Array.isArray(body?.invoices)) return body.invoices;
  if (Array.isArray(body?.products)) return body.products;
  if (Array.isArray(body?.services)) return body.services;
  if (Array.isArray(body?.tenders)) return body.tenders;
  if (Array.isArray(body?.bids)) return body.bids;
  if (Array.isArray(body?.quotes)) return body.quotes;
  if (Array.isArray(body?.quotations)) return body.quotations;
  if (Array.isArray(body?.data?.payments)) return body.data.payments;
  if (Array.isArray(body?.data?.escrowAccounts)) return body.data.escrowAccounts;
  if (Array.isArray(body?.data?.organizations)) return body.data.organizations;
  if (Array.isArray(body?.data?.purchaseOrders)) return body.data.purchaseOrders;
  if (Array.isArray(body?.data?.invoices)) return body.data.invoices;
  if (Array.isArray(body?.data?.products)) return body.data.products;
  if (Array.isArray(body?.data?.services)) return body.data.services;
  if (Array.isArray(body?.data?.tenders)) return body.data.tenders;
  if (Array.isArray(body?.data?.bids)) return body.data.bids;
  if (Array.isArray(body?.data?.quotes)) return body.data.quotes;
  if (Array.isArray(body?.data?.quotations)) return body.data.quotations;
  return [];
};

export const normalizePaginated = <T>(value: unknown): PaginatedResult<T> => {
  const body = value as any;
  let records = normalizeList<T>(value);
  const source = body?.data ?? body;
  if (records.length === 0 && source && typeof source === 'object' && !Array.isArray(source) && !('total' in source)) {
    records = Object.entries(source).map(([key, itemValue]) => ({
      id: key,
      title: key.replace(/([A-Z])/g, ' $1'),
      value: itemValue
    })) as T[];
  }
  return {
    records,
    total: Number(body?.total ?? body?.data?.total ?? records.length),
    skip: body?.skip ?? body?.filters?.skip ?? body?.data?.skip ?? body?.data?.filters?.skip,
    take: body?.take ?? body?.filters?.take ?? body?.data?.take ?? body?.data?.filters?.take,
    filters: body?.filters ?? body?.data?.filters
  };
};

export const getApi = async <T>(endpoint: string, skipCache = false) =>
  unwrap<T>(await api.get(endpoint, { headers: authHeaders(), skipCache } as RequestInit & { skipCache?: boolean }));

export const peekApi = <T>(endpoint: string): T | null => {
  if (typeof window === 'undefined') return null;
  const body = api.peek(endpoint, { headers: authHeaders() });
  if (!body) return null;
  const unwrapped = (body as any)?.data ?? body;
  return unwrapped as T;
};

export const postApi = async <T>(endpoint: string, payload: unknown) =>
  unwrap<T>(await api.post(endpoint, payload, { headers: authHeaders() }));

export const putApi = async <T>(endpoint: string, payload: unknown) =>
  unwrap<T>(await api.put(endpoint, payload, { headers: authHeaders() }));

export const deleteApi = async <T>(endpoint: string) =>
  unwrap<T>(await api.delete(endpoint, { headers: authHeaders() }));
