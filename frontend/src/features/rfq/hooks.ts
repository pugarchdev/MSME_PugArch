import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createQuoteRequest,
    deleteQuoteRequest,
    fetchQuoteRequestById,
    fetchQuoteRequests,
    submitQuoteResponse,
    decideQuoteResponse,
    updateQuoteRequest,
    fetchVendors,
    fetchVendorCatalogue
} from './api';
import type { NewQuoteRequestPayload, NewQuoteResponsePayload } from './types';

const KEY = ['quote-requests'] as const;

export const useQuoteRequests = (params: { q?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    useQuery({
        queryKey: [...KEY, 'list', params] as const,
        queryFn: () => fetchQuoteRequests(params)
    });

export const useQuoteRequest = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'detail', id || 0] as const,
        queryFn: () => fetchQuoteRequestById(id as number),
        enabled: !!id && id > 0
    });

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
    void qc.invalidateQueries({ queryKey: KEY });
    void qc.invalidateQueries({ queryKey: ['dashboard', 'summary'] });
};

export const useCreateQuoteRequest = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: NewQuoteRequestPayload) => createQuoteRequest(payload),
        onSuccess: () => { invalidate(qc); }
    });
};

export const useUpdateQuoteRequest = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<NewQuoteRequestPayload> & { status?: string } }) =>
            updateQuoteRequest(id, data),
        onSuccess: () => { invalidate(qc); }
    });
};

export const useSubmitQuoteResponse = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: NewQuoteResponsePayload }) => submitQuoteResponse(id, data),
        onSuccess: () => { invalidate(qc); }
    });
};
export const useDecideQuoteResponse = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, decision, title }: { id: number; decision: 'accept' | 'reject'; title?: string }) =>
            decideQuoteResponse(id, decision, title ? { title } : {}),
        onSuccess: () => { invalidate(qc); }
    });
};

export const useDeleteQuoteRequest = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => deleteQuoteRequest(id),
        onSuccess: () => { invalidate(qc); }
    });
};

export const useVendors = () =>
    useQuery({
        queryKey: ['vendors'] as const,
        queryFn: () => fetchVendors()
    });

export const useVendorCatalogue = (vendorId: number | undefined) =>
    useQuery({
        queryKey: ['vendors', 'catalogue', vendorId || 0] as const,
        queryFn: () => fetchVendorCatalogue(vendorId as number),
        enabled: !!vendorId && vendorId > 0
    });
