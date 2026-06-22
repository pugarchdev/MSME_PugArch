import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createRequirement,
    deleteRequirement,
    fetchRequirementById,
    fetchRequirements,
    submitRequirement,
    updateRequirement
} from './api';
import type { NewRequirementPayload } from './types';

const KEY = ['requirements'] as const;

export const useRequirements = (params: { q?: string; status?: string; procurementMethod?: string; categoryId?: number; page?: number; pageSize?: number } = {}) =>
    useQuery({
        queryKey: [...KEY, 'list', params] as const,
        queryFn: () => fetchRequirements(params)
    });

export const useRequirement = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'detail', id || 0] as const,
        queryFn: () => fetchRequirementById(id as number),
        enabled: !!id && id > 0
    });

export const usePrefetchRequirement = () => {
    const qc = useQueryClient();
    return (id: number) => {
        qc.prefetchQuery({
            queryKey: [...KEY, 'detail', id] as const,
            queryFn: () => fetchRequirementById(id),
            staleTime: 30 * 1000, // Consider fresh for 30 seconds
        });
    };
};

const invalidate = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: KEY });

export const useCreateRequirement = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: NewRequirementPayload) => createRequirement(payload),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useUpdateRequirement = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<NewRequirementPayload> }) => updateRequirement(id, data),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useSubmitRequirement = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => submitRequirement(id),
        onMutate: async (id) => {
            // Cancel outgoing refetches
            await qc.cancelQueries({ queryKey: KEY });
            
            // Snapshot previous value
            const previousList = qc.getQueryData([...KEY, 'list']);
            const previousDetail = qc.getQueryData([...KEY, 'detail', id]);
            
            // Optimistically update list
            qc.setQueriesData({ queryKey: [...KEY, 'list'] }, (old: any) => {
                if (!old?.records) return old;
                return {
                    ...old,
                    records: old.records.map((req: any) =>
                        req.id === id ? { ...req, status: 'SUBMITTED' } : req
                    )
                };
            });
            
            // Optimistically update detail
            qc.setQueryData([...KEY, 'detail', id], (old: any) =>
                old ? { ...old, status: 'SUBMITTED' } : old
            );
            
            return { previousList, previousDetail };
        },
        onError: (err, id, context) => {
            // Rollback on error
            if (context?.previousList) {
                qc.setQueriesData({ queryKey: [...KEY, 'list'] }, context.previousList);
            }
            if (context?.previousDetail) {
                qc.setQueryData([...KEY, 'detail', id], context.previousDetail);
            }
        },
        onSettled: () => { void invalidate(qc); }
    });
};
export const useDeleteRequirement = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => deleteRequirement(id),
        onMutate: async (id) => {
            // Cancel outgoing refetches
            await qc.cancelQueries({ queryKey: KEY });
            
            // Snapshot previous value
            const previousList = qc.getQueryData([...KEY, 'list']);
            
            // Optimistically remove from list
            qc.setQueriesData({ queryKey: [...KEY, 'list'] }, (old: any) => {
                if (!old?.records) return old;
                return {
                    ...old,
                    records: old.records.filter((req: any) => req.id !== id),
                    total: (old.total || 0) - 1
                };
            });
            
            return { previousList };
        },
        onError: (err, id, context) => {
            // Rollback on error
            if (context?.previousList) {
                qc.setQueriesData({ queryKey: [...KEY, 'list'] }, context.previousList);
            }
        },
        onSettled: () => { void invalidate(qc); }
    });
};
