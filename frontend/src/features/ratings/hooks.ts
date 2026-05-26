/**
 * React Query hooks for the ratings module.
 *
 * Why React Query here specifically: rating summaries appear on dozens of
 * cards (vendor list, marketplace, seller profile, ratings page) at once.
 * Without caching we'd make N HTTP calls per render. With React Query they
 * de-duplicate, cache for the session, and revalidate in the background after
 * a mutation invalidates them.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    fetchBuyerRatings,
    fetchBuyerSummary,
    fetchMyRatingForPO,
    fetchSupplierBulkSummaries,
    fetchSupplierRatings,
    fetchSupplierSummary,
    submitBuyerRating,
    submitSupplierRating,
    updateBuyerRating,
    updateSupplierRating
} from './api';
import { queryKeys } from '../shared/queryKeys';
import type {
    NewBuyerRatingPayload,
    NewSupplierRatingPayload
} from './types';

const SUMMARY_STALE_MS = 60_000; // 1 minute - aggregates change slowly

export const useSupplierRatings = (
    sellerId: number,
    params: { page?: number; pageSize?: number } = {}
) =>
    useQuery({
        queryKey: queryKeys.ratings.supplier(sellerId, params),
        queryFn: () => fetchSupplierRatings(sellerId, params),
        enabled: Number.isFinite(sellerId) && sellerId > 0,
        staleTime: SUMMARY_STALE_MS
    });

export const useBuyerRatings = (
    buyerId: number,
    params: { page?: number; pageSize?: number } = {}
) =>
    useQuery({
        queryKey: queryKeys.ratings.buyer(buyerId, params),
        queryFn: () => fetchBuyerRatings(buyerId, params),
        enabled: Number.isFinite(buyerId) && buyerId > 0,
        staleTime: SUMMARY_STALE_MS
    });

export const useSupplierSummary = (sellerId: number | undefined) =>
    useQuery({
        queryKey: queryKeys.ratings.supplierSummary(sellerId || 0),
        queryFn: () => fetchSupplierSummary(sellerId as number),
        enabled: Number.isFinite(sellerId) && (sellerId as number) > 0,
        staleTime: SUMMARY_STALE_MS
    });

export const useBuyerSummary = (buyerId: number | undefined) =>
    useQuery({
        queryKey: queryKeys.ratings.buyerSummary(buyerId || 0),
        queryFn: () => fetchBuyerSummary(buyerId as number),
        enabled: Number.isFinite(buyerId) && (buyerId as number) > 0,
        staleTime: SUMMARY_STALE_MS
    });

export const useSupplierBulkSummaries = (sellerIds: number[]) =>
    useQuery({
        queryKey: queryKeys.ratings.bulkSupplierSummary(sellerIds),
        queryFn: () => fetchSupplierBulkSummaries(sellerIds),
        enabled: sellerIds.length > 0,
        staleTime: SUMMARY_STALE_MS
    });

export const useMyRatingForPO = (purchaseOrderId: number | undefined) =>
    useQuery({
        queryKey: queryKeys.ratings.forPO(purchaseOrderId || 0),
        queryFn: () => fetchMyRatingForPO(purchaseOrderId as number),
        enabled: Number.isFinite(purchaseOrderId) && (purchaseOrderId as number) > 0,
        staleTime: SUMMARY_STALE_MS
    });

const invalidateRatingsFor = (qc: ReturnType<typeof useQueryClient>, sellerId?: number, buyerId?: number, purchaseOrderId?: number) => {
    qc.invalidateQueries({ queryKey: queryKeys.ratings.all });
    if (sellerId) qc.invalidateQueries({ queryKey: queryKeys.ratings.supplierSummary(sellerId) });
    if (buyerId) qc.invalidateQueries({ queryKey: queryKeys.ratings.buyerSummary(buyerId) });
    if (purchaseOrderId) qc.invalidateQueries({ queryKey: queryKeys.ratings.forPO(purchaseOrderId) });
};

export const useSubmitSupplierRating = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: NewSupplierRatingPayload) => submitSupplierRating(payload),
        onSuccess: (_data, variables) => {
            invalidateRatingsFor(qc, variables.sellerId, undefined, variables.purchaseOrderId);
        }
    });
};

export const useSubmitBuyerRating = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: NewBuyerRatingPayload) => submitBuyerRating(payload),
        onSuccess: (_data, variables) => {
            invalidateRatingsFor(qc, undefined, variables.buyerId, variables.purchaseOrderId);
        }
    });
};

export const useUpdateSupplierRating = (sellerId: number) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<NewSupplierRatingPayload> }) =>
            updateSupplierRating(id, data),
        onSuccess: () => invalidateRatingsFor(qc, sellerId)
    });
};

export const useUpdateBuyerRating = (buyerId: number) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<NewBuyerRatingPayload> }) =>
            updateBuyerRating(id, data),
        onSuccess: () => invalidateRatingsFor(qc, undefined, buyerId)
    });
};
