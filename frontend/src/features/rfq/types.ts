export type QuoteRequestStatus = 'pending' | 'responded' | 'accepted' | 'rejected' | 'closed' | 'cancelled' | string;
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
    seller?: {
        id: number;
        name?: string;
        email?: string;
        mobile?: string;
        sellerProfile?: {
            businessName?: string | null;
            organizationType?: string | null;
        } | null;
    };
}

export interface QuoteRequestPartyDto {
    id: number;
    name?: string;
    email?: string;
    mobile?: string;
    buyerProfile?: {
        organizationName?: string | null;
        organizationType?: string | null;
        city?: string | null;
        state?: string | null;
    } | null;
    sellerProfile?: {
        businessName?: string | null;
        organizationType?: string | null;
        city?: string | null;
        state?: string | null;
        offices?: Array<{ city?: string | null; state?: string | null }>;
    } | null;
}

export interface QuoteRequestDto {
    id: number;
    buyerId: number;
    sellerId: number;
    subject: string;
    message: string;
    documentUrl?: string | null;
    estimatedValue?: number | string | null;
    deadlineDate?: string | null;
    status: QuoteRequestStatus;
    statusEnum?: string | null;
    createdAt?: string;
    updatedAt?: string;
    buyer?: QuoteRequestPartyDto;
    seller?: QuoteRequestPartyDto;
    quoteResponses?: QuoteResponseDto[];
}

export interface NewQuoteRequestPayload {
    sellerId: number;
    subject: string;
    message: string;
    documentUrl?: string;
    estimatedValue?: number;
    deadlineDate?: string;
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
