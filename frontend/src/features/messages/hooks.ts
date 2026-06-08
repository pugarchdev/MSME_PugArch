/**
 * React Query hooks for messages.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createConversation, fetchConversation, fetchConversations, sendMessage } from './api';

const KEY = ['conversations'] as const;

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
    qc.invalidateQueries({ queryKey: KEY });
};

export const useConversations = () =>
    useQuery({
        queryKey: [...KEY, 'list'] as const,
        queryFn: fetchConversations
    });

export const useConversation = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'detail', id || 0] as const,
        queryFn: () => fetchConversation(id as number),
        enabled: !!id && id > 0,
        staleTime: 5_000,
        refetchInterval: 15_000
    });

export const useCreateConversation = () => {
    const qc = useQueryClient();
    return useMutation({ mutationFn: createConversation, onSuccess: () => { void invalidate(qc); } });
};

export const useSendMessage = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Parameters<typeof sendMessage>[1] }) => sendMessage(id, data),
        onSuccess: () => { void invalidate(qc); }
    });
};
