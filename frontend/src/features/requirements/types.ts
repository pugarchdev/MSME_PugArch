export type ProcurementMethod = 'DIRECT_PURCHASE' | 'RFQ' | 'TENDER' | 'REVERSE_AUCTION' | 'RATE_CONTRACT';
export type CanonicalProcurementMethod =
    | 'DIRECT_PURCHASE'
    | 'CATALOG_PURCHASE'
    | 'RFQ'
    | 'RFP'
    | 'RFI'
    | 'SEALED_TENDER'
    | 'OPEN_TENDER'
    | 'LIMITED_TENDER'
    | 'TWO_PACKET_BID'
    | 'REVERSE_AUCTION'
    | 'BID_WITH_REVERSE_AUCTION'
    | 'RATE_CONTRACT'
    | 'REPEAT_ORDER'
    | 'SINGLE_SOURCE'
    | 'PAC'
    | 'EMERGENCY_PURCHASE'
    | 'BOQ_BASED_BID';
export type RequirementStatus = 'DRAFT' | 'SUBMITTED' | 'UNDER_REVIEW' | 'APPROVED' | 'REJECTED' | 'CONVERTED_TO_TENDER' | 'CLOSED';

export interface RequirementItemDto {
    id: number;
    requirementId: number;
    productId?: number | null;
    itemName: string;
    description?: string | null;
    quantity: number | string;
    unitOfMeasure: string;
    estimatedUnitPrice?: number | string | null;
    specifications?: Record<string, unknown> | null;
    createdAt?: string;
}

export interface RequirementDto {
    id: number;
    requirementNumber: string;
    buyerId: number;
    organizationId?: number | null;
    categoryId?: number | null;
    title: string;
    description?: string | null;
    procurementMethod: ProcurementMethod;
    canonicalMethod?: CanonicalProcurementMethod | string | null;
    status: RequirementStatus | string;
    estimatedValue?: number | string | null;
    currency: string;
    requiredBy?: string | null;
    createdAt?: string;
    updatedAt?: string;
    items?: RequirementItemDto[];
    tenders?: Array<{ id: number; tenderId: string; title: string; status: string }>;
    buyer?: { id: number; name?: string };
    category?: { id: number; name: string };
    methodSlug?: string | null;
    workflowStatus?: string | null;
    /** Full Create Procurement wizard Draft object (all sections data) */
    payload?: Record<string, any> | null;
    directPurchases?: Array<{
        id: number;
        purchaseNumber: string;
        status: string;
        totalAmount?: number | string | null;
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
        seller?: { id: number; name: string; email?: string; mobile?: string };
    }>;
}

export interface NewRequirementItemPayload {
    itemName: string;
    description?: string;
    quantity: number;
    unitOfMeasure: string;
    estimatedUnitPrice?: number;
    productId?: number;
    specifications?: Record<string, unknown>;
}

export interface NewRequirementPayload {
    title: string;
    description?: string;
    categoryId?: number;
    procurementMethod?: ProcurementMethod;
    canonicalMethod?: CanonicalProcurementMethod;
    estimatedValue?: number;
    requiredBy?: string;
    items?: NewRequirementItemPayload[];
}

export interface RequirementsListResponse {
    records: RequirementDto[];
    total: number;
}
