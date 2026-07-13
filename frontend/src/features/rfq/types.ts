export type QuoteRequestStatus = 'pending' | 'responded' | 'accepted' | 'rejected' | 'closed' | 'cancelled' | string;
export type QuoteResponseStatus = 'DRAFT' | 'SUBMITTED' | 'SHORTLISTED' | 'ACCEPTED' | 'REJECTED' | 'EXPIRED' | 'WITHDRAWN';

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

    // L1 evaluation fields
    technicalStatus?: string | null;
    financialStatus?: string | null;
    evaluatedPrice?: number | string | null;
    rank?: number | null;
    rankLabel?: string | null;
    warrantyPeriod?: string | null;
    paymentTerms?: string | null;
    gstRate?: number | string | null;
    taxAmount?: number | string | null;
    discountPercent?: number | string | null;
    discountAmount?: number | string | null;
    deliveryLocation?: string | null;
    technicalRemarks?: string | null;
    commercialRemarks?: string | null;
    buyerRemarks?: string | null;
    complianceStatus?: string | null;
    priceForEval?: number;
    isDisqualified?: boolean;
    isShortlisted?: boolean;

    seller?: {
        id: number;
        name?: string;
        email?: string;
        mobile?: string;
        sellerProfile?: {
            businessName?: string | null;
            organizationType?: string | null;
            msmeCategory?: string | null;
            city?: string | null;
            state?: string | null;
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
    allowSellerRevision?: boolean;
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
    currency?: string;
    warrantyPeriod?: string;
    paymentTerms?: string;
    gstRate?: number;
    deliveryLocation?: string;
    complianceStatus?: string;
    unitPrice?: number;
    quantity?: number;
    discountPercent?: number;
}

export interface QuoteRequestsListResponse {
    records: QuoteRequestDto[];
    total: number;
}
