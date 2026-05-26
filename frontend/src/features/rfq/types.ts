export type QuoteRequestStatus = 'pending' | 'responded' | 'closed' | 'cancelled' | string;
export type QuoteResponseStatus = 'DRAFT' | 'SUBMITTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN';

export interface QuoteResponseDto {
    id: number;
    quoteRequestId: number;
    sellerId: number;
    responseNumber?: string | null;
    status: QuoteResponseStatus | string;
    totalAmount?: number | string | null;
    currency: string;
    deliveryDays?: number | null;
    validityDate?: string | null;
    notes?: string | null;
    documentUrl?: string | null;
    createdAt?: string;
    updatedAt?: string;
    seller?: { id: number; name?: string };
}

export interface QuoteRequestDto {
    id: number;
    buyerId: number;
    sellerId: number;
    subject: string;
    message: string;
    documentUrl?: string | null;
    estimatedValue?: number | string | null;
    status: QuoteRequestStatus;
    statusEnum?: string | null;
    createdAt?: string;
    updatedAt?: string;
    buyer?: { id: number; name?: string; email?: string };
    seller?: { id: number; name?: string; email?: string };
    quoteResponses?: QuoteResponseDto[];
}

export interface NewQuoteRequestPayload {
    sellerId: number;
    subject: string;
    message: string;
    documentUrl?: string;
    estimatedValue?: number;
}

export interface NewQuoteResponsePayload {
    totalAmount?: number;
    deliveryDays?: number;
    validityDate?: string;
    notes?: string;
    documentUrl?: string;
}

export interface QuoteRequestsListResponse {
    records: QuoteRequestDto[];
    total: number;
}
