import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createQuoteRequest,
    fetchQuoteRequestById,
    fetchQuoteRequests,
    submitQuoteResponse,
    updateQuoteRequest
} from './api';
import type { NewQuoteRequestPayload, NewQuoteResponsePayload } from './types';

const KEY = ['quote-requests'] as const;

export const useQuoteRequests = (params: { q?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    useQuery({
        queryKey: [...KEY, 'list', params] as const,
        queryFn: () => fetchQuoteRequests(params),
        staleTime: 30_000
    });

export const useQuoteRequest = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'detail', id || 0] as const,
        queryFn: () => fetchQuoteRequestById(id as number),
        enabled: !!id && id > 0,
        staleTime: 15_000
    });

const invalidate = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: KEY });

export const useCreateQuoteRequest = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: NewQuoteRequestPayload) => createQuoteRequest(payload),
        onSuccess: () => invalidate(qc)
    });
};

export const useUpdateQuoteRequest = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<NewQuoteRequestPayload> & { status?: string } }) =>
            updateQuoteRequest(id, data),
        onSuccess: () => invalidate(qc)
    });
};

export const useSubmitQuoteResponse = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: NewQuoteResponsePayload }) => submitQuoteResponse(id, data),
        onSuccess: () => invalidate(qc)
    });
};
