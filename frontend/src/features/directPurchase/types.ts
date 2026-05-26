export type DirectPurchaseStatus = 'DRAFT' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ORDERED' | 'CANCELLED';

export interface DirectPurchaseDto {
    id: number;
    requirementId?: number | null;
    buyerId: number;
    sellerId: number;
    purchaseNumber: string;
    status: DirectPurchaseStatus | string;
    totalAmount?: number | string | null;
    currency: string;
    requestedAt?: string;
    approvedAt?: string | null;
    createdAt?: string;
    updatedAt?: string;
    buyer?: { id: number; name?: string; email?: string };
    seller?: { id: number; name?: string; email?: string };
    requirement?: { id: number; requirementNumber?: string; title?: string };
}

export interface NewDirectPurchasePayload {
    sellerId: number;
    requirementId?: number;
    totalAmount?: number;
}

export interface DirectPurchasesListResponse {
    records: DirectPurchaseDto[];
    total: number;
}
