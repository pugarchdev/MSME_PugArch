/**
 * Seller Delivery Management API client.
 */
import { getApi, postApi, putApi } from '../shared/apiClient';

export type DeliveryStatus =
    | 'PENDING_ACCEPTANCE' | 'SELLER_ACCEPTED' | 'SELLER_REJECTED'
    | 'PACKED' | 'READY_FOR_PICKUP' | 'DISPATCHED'
    | 'IN_TRANSIT' | 'OUT_FOR_DELIVERY' | 'DELIVERED' | 'COMPLETED'
    | 'CANCELLED' | 'RETURNED' | 'DISPUTED' | 'REFUNDED' | string;

export interface DeliveryDto {
    id: number;
    purchaseOrderId: number;
    status: DeliveryStatus;
    trackingNumber?: string | null;
    carrierName?: string | null;
    logisticsPartnerName?: string | null;
    logisticsPartnerId?: number | null;
    ewayBillNumber?: string | null;
    courierReceiptNumber?: string | null;
    expectedDelivery?: string | null;
    dispatchedAt?: string | null;
    deliveredAt?: string | null;
    currentLocation?: string | null;
    remarks?: string | null;
    createdAt: string;
    updatedAt: string;
    purchaseOrder?: {
        id: number;
        poNumber: string;
        title: string;
        amount: string | number;
        sellerId: number;
        buyerId: number;
        seller?: { id: number; name: string; email?: string };
        buyer?: { id: number; name: string; email?: string };
    };
    documents?: Array<{
        id: number;
        documentType: string;
        description?: string | null;
        fileAsset?: { id: number; originalName: string; mimeType: string };
        createdAt?: string;
    }>;
}

export interface LogisticsPartner {
    id: number;
    name: string;
    code?: string;
    contactName?: string;
    contactEmail?: string;
    contactPhone?: string;
    trackingUrl?: string;
    isActive?: boolean;
}

export const fetchDeliveries = (params?: { status?: string; q?: string; role?: string }) => {
    const qs = new URLSearchParams();
    if (params?.status) qs.set('status', params.status);
    if (params?.q) qs.set('q', params.q);
    if (params?.role) qs.set('role', params.role);
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return getApi<{ items: DeliveryDto[]; total: number }>(`/api/delivery${suffix}`);
};

export const fetchDelivery = (id: number) => getApi<DeliveryDto>(`/api/delivery/${id}`);
export const fetchTimeline = (id: number) => getApi<any[]>(`/api/delivery/${id}/timeline`);
export const fetchDocuments = (id: number) => getApi<any[]>(`/api/delivery/${id}/documents`);
export const fetchLogisticsPartners = () => getApi<LogisticsPartner[]>(`/api/delivery/logistics-partners`);

// Seller actions
export const sellerAccept = (id: number, data: { remarks?: string; expectedDelivery?: string }) =>
    postApi<DeliveryDto>(`/api/delivery/${id}/seller/accept`, data);

export const sellerReject = (id: number, reason: string) =>
    postApi<DeliveryDto>(`/api/delivery/${id}/seller/reject`, { reason });

export const markPacked = (id: number, data: { packageWeightKg?: number; packageDimensions?: string; packageCount?: number; remarks?: string }) =>
    postApi<DeliveryDto>(`/api/delivery/${id}/seller/packed`, data);

export const updateDispatchDetails = (id: number, data: {
    trackingNumber?: string; carrierName?: string;
    logisticsPartnerId?: number; logisticsPartnerName?: string;
    logisticsContact?: string; ewayBillNumber?: string; courierReceiptNumber?: string;
    expectedDelivery?: string; remarks?: string;
}) => putApi<DeliveryDto>(`/api/delivery/${id}/seller/dispatch-details`, data);

export const markReadyForPickup = (id: number) =>
    postApi<DeliveryDto>(`/api/delivery/${id}/seller/ready-for-pickup`, {});

export const markDispatched = (id: number) =>
    postApi<DeliveryDto>(`/api/delivery/${id}/seller/dispatched`, {});

// Logistics action — seller can update in-transit / out-for-delivery / delivered
export const logisticsStatusUpdate = (id: number, data: {
    status: string; location?: string; remarks?: string; occurredAt?: string;
}) => postApi<DeliveryDto>(`/api/delivery/${id}/logistics/status`, data);

// Document upload
export const addDeliveryDocument = (id: number, data: {
    documentType: string; fileAssetId: number; description?: string;
}) => postApi(`/api/delivery/${id}/documents`, data);
