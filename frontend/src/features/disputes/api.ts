/**
 * Disputes API client.
 */
import { getApi, postApi, putApi } from '../shared/apiClient';

export type DisputeStatus = 'open' | 'under_review' | 'frozen' | 'resolved' | 'rejected' | 'closed';

export interface DisputeMessage {
    id: number;
    disputeId: number;
    senderId: number;
    content: string;
    internal?: boolean;
    createdAt: string;
    sender?: { id: number; name: string; role: string };
}

export interface DisputeEvidence {
    id: number;
    disputeId: number;
    fileAssetId: number;
    uploadedById?: number;
    createdAt: string;
}

export interface DisputeDto {
    id: number;
    purchaseOrderId?: number | null;
    paymentTransactionId?: number | null;
    escrowAccountId?: number | null;
    counterpartyId?: number | null;
    raisedById: number;
    buyerId: number;
    sellerId: number;
    category: string;
    reason: string;
    status: DisputeStatus;
    remarks?: string | null;
    resolvedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    buyer?: { id: number; name: string; role: string };
    seller?: { id: number; name: string; role: string };
    messages?: DisputeMessage[];
    evidence?: DisputeEvidence[];
}

export const fetchDisputes = () => getApi<DisputeDto[]>('/api/disputes');
export const fetchDispute = (id: number) => getApi<DisputeDto>(`/api/disputes/${id}`);

export const createDispute = (data: {
    purchaseOrderId?: number; paymentTransactionId?: number;
    escrowAccountId?: number; counterpartyId?: number;
    category: string; reason: string; evidenceFileIds?: number[];
}) => postApi<DisputeDto>('/api/disputes', data);

export const sendDisputeMessage = (id: number, data: {
    content: string; internal?: boolean; evidenceFileIds?: number[];
}) => postApi<DisputeMessage>(`/api/disputes/${id}/messages`, data);

export const updateDisputeStatus = (id: number, data: { status: DisputeStatus; remarks?: string }) =>
    putApi<DisputeDto>(`/api/disputes/${id}/status`, data);
