/**
 * Disputes API client.
 */
import { getApi, postApi, putApi } from '../shared/apiClient';

export type DisputeStatus = 'open' | 'under_review' | 'clarification_requested' | 'responded' | 'resolved' | 'rejected' | 'closed' | 'escalated' | 'frozen';

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
    disputeNo?: string;
    title?: string | null;
    description?: string | null;
    linkedEntityType?: string | null;
    linkedEntityId?: number | null;
    buyerId: number;
    sellerId: number;
    raisedByOrgId?: number | null;
    againstOrgId?: number | null;
    buyerOrgId?: number | null;
    sellerOrgId?: number | null;
    category: string;
    priority?: 'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT';
    amountInDispute?: string | number | null;
    reason: string;
    status: DisputeStatus;
    adminRemarks?: string | null;
    resolutionSummary?: string | null;
    remarks?: string | null;
    resolvedAt?: string | null;
    createdAt: string;
    updatedAt: string;
    buyer?: { id: number; name: string; role: string };
    seller?: { id: number; name: string; role: string };
    messages?: DisputeMessage[];
    evidence?: DisputeEvidence[];
    attachments?: DisputeEvidence[];
}

const normalizeDisputes = (body: any): DisputeDto[] => {
    if (Array.isArray(body)) return body;
    if (Array.isArray(body?.disputes)) return body.disputes;
    if (Array.isArray(body?.items)) return body.items;
    return [];
};

export const fetchDisputes = async () => normalizeDisputes(await getApi<any>('/api/disputes'));
export const fetchDispute = (id: number) => getApi<DisputeDto>(`/api/disputes/${id}`);

export const createDispute = (data: {
    linkedEntityType?: string; linkedEntityId?: number;
    purchaseOrderId?: number; invoiceId?: number; paymentTransactionId?: number;
    deliveryId?: number; grnId?: number; escrowAccountId?: number; requirementResponseId?: number; auctionId?: number;
    counterpartyId?: number; againstOrgId?: number;
    category: string; title: string; description: string; reason?: string;
    amountInDispute?: number; priority?: string; evidenceFileIds?: number[];
}) => postApi<DisputeDto>('/api/disputes', data);

export const sendDisputeMessage = (id: number, data: {
    content: string; internal?: boolean; evidenceFileIds?: number[];
}) => postApi<DisputeMessage>(`/api/disputes/${id}/messages`, data);

export const updateDisputeStatus = (id: number, data: { status: DisputeStatus | string; remarks?: string; adminRemarks?: string }) =>
    postApi<DisputeDto>(`/api/admin/disputes/${id}/status`, data);
