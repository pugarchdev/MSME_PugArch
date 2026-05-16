import { api } from '../../lib/api';

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

export const getApi = async <T>(endpoint: string, skipCache = false) =>
  unwrap<T>(await api.get(endpoint, { headers: authHeaders(), skipCache } as RequestInit & { skipCache?: boolean }));

export const postApi = async <T>(endpoint: string, payload: unknown) =>
  unwrap<T>(await api.post(endpoint, payload, { headers: authHeaders() }));

export const putApi = async <T>(endpoint: string, payload: unknown) =>
  unwrap<T>(await api.put(endpoint, payload, { headers: authHeaders() }));

export const deleteApi = async <T>(endpoint: string) =>
  unwrap<T>(await api.delete(endpoint, { headers: authHeaders() }));
