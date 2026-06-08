import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createDirectPurchase,
    deleteDirectPurchase,
    fetchDirectPurchaseById,
    fetchDirectPurchases,
    generatePoFromDirectPurchase,
    updateDirectPurchase,
    acceptDirectPurchase,
    rejectDirectPurchase
} from './api';
import type { NewDirectPurchasePayload } from './types';

const KEY = ['direct-purchases'] as const;

export const useDirectPurchases = (params: { q?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    useQuery({
        queryKey: [...KEY, 'list', params] as const,
        queryFn: () => fetchDirectPurchases(params)
    });

export const useDirectPurchase = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'detail', id || 0] as const,
        queryFn: () => fetchDirectPurchaseById(id as number),
        enabled: !!id && id > 0
    });

const invalidate = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: KEY });

export const useCreateDirectPurchase = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: NewDirectPurchasePayload) => createDirectPurchase(payload),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useUpdateDirectPurchase = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<NewDirectPurchasePayload> & { status?: string } }) =>
            updateDirectPurchase(id, data),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useDeleteDirectPurchase = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => deleteDirectPurchase(id),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useGeneratePoFromDirectPurchase = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => generatePoFromDirectPurchase(id),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useAcceptDirectPurchase = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => acceptDirectPurchase(id),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useRejectDirectPurchase = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => rejectDirectPurchase(id),
        onSuccess: () => { void invalidate(qc); }
    });
};
