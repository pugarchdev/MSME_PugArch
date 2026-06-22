export type DirectPurchaseStatus = 'DRAFT' | 'REQUESTED' | 'PENDING_APPROVAL' | 'APPROVED' | 'REJECTED' | 'ORDERED' | 'CANCELLED';

export type DirectPurchasePartyDto = {
    id: number;
    name?: string;
    email?: string;
    mobile?: string;
    buyerProfile?: {
        organizationName?: string | null;
        organizationType?: string | null;
        city?: string | null;
        district?: string | null;
        state?: string | null;
    } | null;
    sellerProfile?: {
        businessName?: string | null;
        organizationType?: string | null;
        offices?: Array<{ city?: string | null; state?: string | null }>;
    } | null;
};

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
    buyer?: DirectPurchasePartyDto;
    seller?: DirectPurchasePartyDto;
    // Checkout fields filled during procurement creation
    consigneeName?: string | null;
    mobileNumber?: string | null;
    email?: string | null;
    deliveryAddressText?: string | null;
    department?: string | null;
    budgetHead?: string | null;
    costCenter?: string | null;
    justification?: string | null;
    remarks?: string | null;
    deliveryInstructions?: string | null;
    requiredDeliveryDate?: string | null;
    approvalStatus?: string | null;
    workflowStatus?: string | null;
    requirement?: {
        id: number;
        requirementNumber?: string;
        title?: string;
        description?: string | null;
        items?: Array<{
            id: number;
            itemName: string;
            description?: string | null;
            quantity: number | string;
            unitOfMeasure: string;
            estimatedUnitPrice?: number | string | null;
        }>;
    };
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
