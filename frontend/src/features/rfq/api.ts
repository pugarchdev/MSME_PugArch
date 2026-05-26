/**
 * RFQ (Quote Request) API client.
 */
import { getApi, postApi, putApi } from '../shared/apiClient';
import type {
    NewQuoteRequestPayload,
    NewQuoteResponsePayload,
    QuoteRequestDto,
    QuoteRequestsListResponse,
    QuoteResponseDto
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

export const fetchQuoteRequests = (params: { q?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    getApi<QuoteRequestsListResponse>(`/api/quote-requests${buildQuery(params)}`);

export const fetchQuoteRequestById = (id: number) =>
    getApi<QuoteRequestDto>(`/api/quote-requests/${id}`);

export const createQuoteRequest = (payload: NewQuoteRequestPayload) =>
    postApi<QuoteRequestDto>(`/api/quote-requests`, payload);

export const updateQuoteRequest = (id: number, payload: Partial<NewQuoteRequestPayload> & { status?: string }) =>
    putApi<QuoteRequestDto>(`/api/quote-requests/${id}`, payload);

export const submitQuoteResponse = (quoteRequestId: number, payload: NewQuoteResponsePayload) =>
    postApi<QuoteResponseDto>(`/api/quote-requests/${quoteRequestId}/responses`, payload);
