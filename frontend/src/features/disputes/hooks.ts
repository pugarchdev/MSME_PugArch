/**
 * React Query hooks for disputes.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createDispute, fetchDispute, fetchDisputes,
    sendDisputeMessage, updateDisputeStatus
} from './api';

const KEY = ['disputes'] as const;

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
    qc.invalidateQueries({ queryKey: KEY });
};

export const useDisputes = () =>
    useQuery({
        queryKey: [...KEY, 'list'] as const,
        queryFn: fetchDisputes
    });

export const useDispute = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'detail', id || 0] as const,
        queryFn: () => fetchDispute(id as number),
        enabled: !!id && id > 0,
        staleTime: 10_000,
        refetchInterval: 30_000
    });

export const useCreateDispute = () => {
    const qc = useQueryClient();
    return useMutation({ mutationFn: createDispute, onSuccess: () => { void invalidate(qc); } });
};

export const useSendDisputeMessage = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Parameters<typeof sendDisputeMessage>[1] }) => sendDisputeMessage(id, data),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useUpdateDisputeStatus = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateDisputeStatus>[1] }) => updateDisputeStatus(id, data),
        onSuccess: () => { void invalidate(qc); }
    });
};
