/**
 * Rating module - typed API client.
 */

import { getApi, postApi, putApi } from '../shared/apiClient';
import type {
    BuyerRatingDto,
    MyRatingForPO,
    NewBuyerRatingPayload,
    NewSupplierRatingPayload,
    RatingSummary,
    RatingsListResult,
    SupplierRatingDto
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

export const fetchSupplierRatings = (
    sellerId: number,
    params: { page?: number; pageSize?: number } = {}
) =>
    getApi<RatingsListResult<SupplierRatingDto>>(
        `/api/ratings/supplier/${sellerId}${buildQuery(params)}`
    );

export const fetchBuyerRatings = (
    buyerId: number,
    params: { page?: number; pageSize?: number } = {}
) =>
    getApi<RatingsListResult<BuyerRatingDto>>(
        `/api/ratings/buyer/${buyerId}${buildQuery(params)}`
    );

export const fetchSupplierSummary = (sellerId: number) =>
    getApi<RatingSummary>(`/api/ratings/supplier/${sellerId}/summary`);

export const fetchBuyerSummary = (buyerId: number) =>
    getApi<RatingSummary>(`/api/ratings/buyer/${buyerId}/summary`);

export const fetchSupplierBulkSummaries = (sellerIds: number[]) =>
    postApi<Record<number, RatingSummary>>(`/api/ratings/supplier/bulk-summary`, { sellerIds });

export const fetchMyRatingForPO = (purchaseOrderId: number) =>
    getApi<MyRatingForPO>(`/api/ratings/me/for-po/${purchaseOrderId}`);

export const submitSupplierRating = (payload: NewSupplierRatingPayload) =>
    postApi<SupplierRatingDto>(`/api/ratings/supplier`, payload);

export const submitBuyerRating = (payload: NewBuyerRatingPayload) =>
    postApi<BuyerRatingDto>(`/api/ratings/buyer`, payload);

export const updateSupplierRating = (id: number, payload: Partial<NewSupplierRatingPayload>) =>
    putApi<SupplierRatingDto>(`/api/ratings/supplier/${id}`, payload);

export const updateBuyerRating = (id: number, payload: Partial<NewBuyerRatingPayload>) =>
    putApi<BuyerRatingDto>(`/api/ratings/buyer/${id}`, payload);
