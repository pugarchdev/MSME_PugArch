/**
 * GRN API client.
 */
import { getApi, postApi, putApi } from '../shared/apiClient';

export type GrnStatus = 'DRAFT' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'PARTIAL';

export interface GrnItemDto {
    id?: number;
    grnId?: number;
    purchaseOrderItemId?: number | null;
    itemName: string;
    orderedQty: string | number;
    receivedQty: string | number;
    acceptedQty: string | number;
    rejectedQty: string | number;
    rejectionReason?: string | null;
    unitOfMeasure: string;
}

export interface GrnDocumentDto {
    id: number;
    grnId: number;
    documentType: string;
    fileAsset: { id: number; originalName: string; mimeType: string; size: number };
    uploadedBy: { id: number; name: string };
    createdAt: string;
}

export interface GrnDto {
    id: number;
    grnNumber: string;
    purchaseOrderId: number;
    receivedById: number;
    organizationId: number;
    status: GrnStatus;
    receivedAt: string;
    remarks?: string | null;
    inspectionNote?: string | null;
    approvedById?: number | null;
    approvedAt?: string | null;
    rejectedById?: number | null;
    rejectedAt?: string | null;
    rejectionReason?: string | null;
    createdAt: string;
    updatedAt: string;
    items: GrnItemDto[];
    documents: GrnDocumentDto[];
    receivedBy: { id: number; name: string; email: string };
    purchaseOrder?: {
        id: number;
        poNumber: string;
        title: string;
        amount: string | number;
        status: string;
        seller: { id: number; name: string; email: string };
        buyer: { id: number; name: string; email: string };
        items: Array<{ id: number; productId?: number | null; quantity: string | number; unitPrice: string | number }>;
    };
}

export interface GrnEligibility {
    poId: number;
    poStatus: string;
    canCreate: boolean;
    existing: Array<{ id: number; status: GrnStatus; grnNumber: string }>;
}

export const fetchGrns = (status?: GrnStatus) => {
    const q = status ? `?status=${status}` : '';
    return getApi<GrnDto[]>(`/api/grn${q}`);
};

export const fetchGrnById = (id: number) => getApi<GrnDto>(`/api/grn/${id}`);

export const fetchGrnEligibility = (poId: number) =>
    getApi<GrnEligibility>(`/api/grn/po/${poId}/eligibility`);

export const createGrn = (data: { purchaseOrderId: number; remarks?: string; inspectionNote?: string; items: Omit<GrnItemDto, 'id' | 'grnId'>[] }) =>
    postApi<GrnDto>('/api/grn', data);

export const updateGrn = (id: number, data: Partial<{ remarks: string; inspectionNote: string; items: Omit<GrnItemDto, 'id' | 'grnId'>[] }>) =>
    putApi<GrnDto>(`/api/grn/${id}`, data);

export const submitGrn = (id: number) => postApi<GrnDto>(`/api/grn/${id}/submit`, {});
export const approveGrn = (id: number, inspectionNote?: string) =>
    postApi<GrnDto>(`/api/grn/${id}/approve`, { inspectionNote });
export const rejectGrn = (id: number, rejectionReason: string) =>
    postApi<GrnDto>(`/api/grn/${id}/reject`, { rejectionReason });

export const addGrnDocument = (id: number, fileAssetId: number, documentType: string) =>
    postApi<GrnDocumentDto>(`/api/grn/${id}/documents`, { fileAssetId, documentType });
