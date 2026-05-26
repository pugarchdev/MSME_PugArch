/**
 * React Query hooks for the delivery module. Replaces the older
 * `useFeatureQuery` flow so that:
 *   - Switching pages or returning to a list shows cached data instantly
 *   - Mutations invalidate the right slices automatically
 *   - Loading state is `isFetching` (background refresh) vs `isLoading` (no data yet)
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    addDeliveryDocument,
    adminOverrideStatus,
    buyerAcceptance,
    fetchDeliveryReport,
    getDeliveryById,
    getDeliveryByPurchaseOrder,
    initiateReturn,
    listDeliveries,
    listLogisticsPartners,
    logisticsStatusUpdate,
    markDeliveryPacked,
    markDispatched,
    markReadyForPickup,
    paymentDecision,
    raiseDeliveryDispute,
    releaseDeliveryPayment,
    resolveDeliveryDispute,
    sellerAcceptDelivery,
    sellerRejectDelivery,
    updateDispatchDetails,
    verifyInvoice
} from './api';
import { queryKeys } from '../shared/queryKeys';
import type { DeliveryStatus } from './types';

export { useFeatureQuery } from '../shared/hooks';

const STALE_DETAIL = 30_000;
const STALE_LIST = 30_000;

export const useDeliveryList = (
    params: {
        page?: number;
        pageSize?: number;
        status?: DeliveryStatus;
        q?: string;
    } = {}
) =>
    useQuery({
        queryKey: queryKeys.deliveries.list(params),
        queryFn: () =>
            listDeliveries({
                page: params.page,
                pageSize: params.pageSize,
                status: params.status,
                q: params.q
            }),
        placeholderData: previous => previous, // keeps last page visible while next page loads
        staleTime: STALE_LIST
    });

export const useDeliveryDetail = (id: number | null | undefined) =>
    useQuery({
        queryKey: queryKeys.deliveries.detail(id || 0),
        queryFn: () => getDeliveryById(id as number),
        enabled: Number.isFinite(id) && (id as number) > 0,
        staleTime: STALE_DETAIL
    });

export const useDeliveryByPO = (purchaseOrderId: number | null | undefined) =>
    useQuery({
        queryKey: ['deliveries', 'by-po', purchaseOrderId],
        queryFn: () => getDeliveryByPurchaseOrder(purchaseOrderId as number),
        enabled: Number.isFinite(purchaseOrderId) && (purchaseOrderId as number) > 0,
        staleTime: STALE_DETAIL
    });

export const useDeliveryReport = (enabled = true) =>
    useQuery({
        queryKey: queryKeys.deliveries.summary,
        queryFn: () => fetchDeliveryReport(),
        enabled,
        staleTime: 60_000
    });

export const useLogisticsPartners = () =>
    useQuery({
        queryKey: queryKeys.deliveries.logisticsPartners,
        queryFn: () => listLogisticsPartners(),
        staleTime: 5 * 60_000 // partners change rarely
    });

const invalidateDelivery = (qc: ReturnType<typeof useQueryClient>, id?: number) => {
    qc.invalidateQueries({ queryKey: queryKeys.deliveries.all });
    if (id) qc.invalidateQueries({ queryKey: queryKeys.deliveries.detail(id) });
};

/**
 * Generic mutation hook that runs a delivery action and invalidates caches.
 * Components use this so they don't have to wire up React Query plumbing.
 */
export const useDeliveryMutation = <TArgs, TResult>(
    fn: (args: TArgs) => Promise<TResult>,
    options: { invalidateId?: number } = {}
) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: fn,
        onSuccess: () => invalidateDelivery(qc, options.invalidateId)
    });
};

/* Convenience action hooks - one per service method. */

export const useSellerAcceptDelivery = (id: number) =>
    useDeliveryMutation((body: { remarks?: string; expectedDelivery?: string }) =>
        sellerAcceptDelivery(id, body), { invalidateId: id });

export const useSellerRejectDelivery = (id: number) =>
    useDeliveryMutation((body: { reason: string }) => sellerRejectDelivery(id, body), { invalidateId: id });

export const useMarkDeliveryPacked = (id: number) =>
    useDeliveryMutation(
        (body: { packageWeightKg?: number; packageDimensions?: string; packageCount?: number; remarks?: string }) =>
            markDeliveryPacked(id, body),
        { invalidateId: id }
    );

export const useUpdateDispatchDetails = (id: number) =>
    useDeliveryMutation(
        (body: any) => updateDispatchDetails(id, body),
        { invalidateId: id }
    );

export const useMarkReadyForPickup = (id: number) =>
    useDeliveryMutation((remarks?: string) => markReadyForPickup(id, remarks), { invalidateId: id });

export const useMarkDispatched = (id: number) =>
    useDeliveryMutation((body?: { location?: string; remarks?: string }) => markDispatched(id, body || {}), {
        invalidateId: id
    });

export const useLogisticsStatusUpdate = (id: number) =>
    useDeliveryMutation(
        (body: { status: DeliveryStatus; location?: string; remarks?: string; occurredAt?: string }) =>
            logisticsStatusUpdate(id, body),
        { invalidateId: id }
    );

export const useBuyerAcceptance = (id: number) =>
    useDeliveryMutation((body: any) => buyerAcceptance(id, body), { invalidateId: id });

export const useInitiateReturn = (id: number) =>
    useDeliveryMutation((body: any) => initiateReturn(id, body), { invalidateId: id });

export const useRaiseDispute = (id: number) =>
    useDeliveryMutation((body: any) => raiseDeliveryDispute(id, body), { invalidateId: id });

export const useResolveDispute = (id: number) =>
    useDeliveryMutation((body: any) => resolveDeliveryDispute(id, body), { invalidateId: id });

export const useVerifyInvoice = (id: number) =>
    useDeliveryMutation((body: { invoiceId: number; remarks?: string }) => verifyInvoice(id, body), {
        invalidateId: id
    });

export const usePaymentDecision = (id: number) =>
    useDeliveryMutation(
        (body: any) => paymentDecision(id, body),
        { invalidateId: id }
    );

export const useReleaseDeliveryPayment = (id: number) =>
    useDeliveryMutation(
        (body: any) => releaseDeliveryPayment(id, body),
        { invalidateId: id }
    );

export const useAdminOverride = (id: number) =>
    useDeliveryMutation((body: any) => adminOverrideStatus(id, body), { invalidateId: id });

export const useAddDeliveryDocument = (id: number) =>
    useDeliveryMutation(
        (body: any) => addDeliveryDocument(id, body),
        { invalidateId: id }
    );
