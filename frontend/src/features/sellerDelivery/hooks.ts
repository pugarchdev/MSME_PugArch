/**
 * React Query hooks for seller delivery management.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    addDeliveryDocument,
    fetchDelivery,
    fetchDocuments,
    fetchDeliveries,
    fetchLogisticsPartners,
    fetchTimeline,
    logisticsStatusUpdate,
    markDispatched,
    markPacked,
    markReadyForPickup,
    sellerAccept,
    sellerReject,
    updateDispatchDetails
} from './api';

const KEY = ['delivery'] as const;

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
    qc.invalidateQueries({ queryKey: KEY });
};

export const useDeliveries = (params?: { status?: string; q?: string; role?: string }) =>
    useQuery({
        queryKey: [...KEY, 'list', params || {}] as const,
        queryFn: () => fetchDeliveries(params)
    });

export const useDelivery = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'detail', id || 0] as const,
        queryFn: () => fetchDelivery(id as number),
        enabled: !!id && id > 0
    });

export const useDeliveryTimeline = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'timeline', id || 0] as const,
        queryFn: () => fetchTimeline(id as number),
        enabled: !!id && id > 0
    });

export const useDeliveryDocuments = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'documents', id || 0] as const,
        queryFn: () => fetchDocuments(id as number),
        enabled: !!id && id > 0
    });

export const useLogisticsPartners = () =>
    useQuery({
        queryKey: ['logistics-partners'] as const,
        queryFn: fetchLogisticsPartners,
        staleTime: 5 * 60 * 1000
    });

export const useSellerAccept = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Parameters<typeof sellerAccept>[1] }) => sellerAccept(id, data),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useSellerReject = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, reason }: { id: number; reason: string }) => sellerReject(id, reason),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useMarkPacked = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Parameters<typeof markPacked>[1] }) => markPacked(id, data),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useUpdateDispatchDetails = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateDispatchDetails>[1] }) => updateDispatchDetails(id, data),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useMarkReadyForPickup = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => markReadyForPickup(id),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useMarkDispatched = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => markDispatched(id),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useLogisticsStatusUpdate = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Parameters<typeof logisticsStatusUpdate>[1] }) => logisticsStatusUpdate(id, data),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useAddDeliveryDocument = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Parameters<typeof addDeliveryDocument>[1] }) => addDeliveryDocument(id, data),
        onSuccess: () => { void invalidate(qc); }
    });
};
