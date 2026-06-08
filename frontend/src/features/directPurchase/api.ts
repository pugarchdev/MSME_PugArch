import { deleteApi, getApi, postApi, putApi } from '../shared/apiClient';
import type {
    DirectPurchaseDto,
    DirectPurchasesListResponse,
    NewDirectPurchasePayload
} from './types';

const buildQuery = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `?${qs}` : '';
};

export const fetchDirectPurchases = (params: { q?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    getApi<DirectPurchasesListResponse>(`/api/direct-purchases${buildQuery(params)}`);

export const fetchDirectPurchaseById = (id: number) =>
    getApi<DirectPurchaseDto>(`/api/direct-purchases/${id}`);

export const createDirectPurchase = (payload: NewDirectPurchasePayload) =>
    postApi<DirectPurchaseDto>(`/api/direct-purchases`, payload);

export const updateDirectPurchase = (id: number, payload: Partial<NewDirectPurchasePayload> & { status?: string }) =>
    putApi<DirectPurchaseDto>(`/api/direct-purchases/${id}`, payload);

export const deleteDirectPurchase = (id: number) =>
    deleteApi<{ success: boolean }>(`/api/direct-purchases/${id}`);

export const generatePoFromDirectPurchase = (id: number) =>
    postApi<{ purchaseOrder: { id: number; poNumber?: string } }>(`/api/direct-purchases/${id}/generate-po`, {});

export const acceptDirectPurchase = (id: number) =>
    postApi<DirectPurchaseDto>(`/api/direct-purchases/${id}/accept`, {});

export const rejectDirectPurchase = (id: number) =>
    postApi<DirectPurchaseDto>(`/api/direct-purchases/${id}/reject`, {});
