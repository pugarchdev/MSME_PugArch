/**
 * Approvals API client.
 */
import { getApi, postApi } from '../shared/apiClient';

export type ApprovalStage = 'DEPARTMENT_HEAD' | 'FINANCE_DEPT' | 'PROCUREMENT_HEAD';
export type ApprovalDecision = 'PENDING' | 'APPROVED' | 'REJECTED' | 'SENT_FOR_CLARIFICATION';
export type ApprovalEntityType = 'tender' | 'purchase_order' | 'cart' | 'direct_purchase';

export interface EntitySummary {
    id: number;
    label: string;
    title: string;
    value: number;
    status: string;
    createdAt: string;
}

export interface ApprovalDto {
    id: number;
    entityType: ApprovalEntityType;
    entityId: number;
    organizationId: number;
    stage: ApprovalStage;
    sequence: number;
    decision: ApprovalDecision;
    approverId: number | null;
    remarks: string | null;
    clarificationNote: string | null;
    decidedAt: string | null;
    createdAt: string;
    updatedAt: string;
    approver?: { id: number; name: string; email: string } | null;
    entitySummary?: EntitySummary | null;
}

export interface ApprovalTrail {
    trail: ApprovalDto[];
    entitySummary: EntitySummary | null;
    fullyApproved: boolean;
}

export const fetchPendingApprovals = () => getApi<ApprovalDto[]>('/api/approvals/pending');
export const fetchApprovalHistory = () => getApi<ApprovalDto[]>('/api/approvals/history');
export const fetchApprovalTrail = (type: ApprovalEntityType, id: number) =>
    getApi<ApprovalTrail>(`/api/approvals/trail/${type}/${id}`);

export const approveApproval = (id: number, remarks?: string) =>
    postApi<ApprovalDto>(`/api/approvals/${id}/approve`, { remarks });

export const rejectApproval = (id: number, remarks: string) =>
    postApi<ApprovalDto>(`/api/approvals/${id}/reject`, { remarks });

export const clarifyApproval = (id: number, clarificationNote: string) =>
    postApi<ApprovalDto>(`/api/approvals/${id}/clarify`, { clarificationNote });

export const startApprovalChain = (params: { entityType: ApprovalEntityType; entityId: number; totalValue: number }) =>
    postApi<ApprovalDto[]>('/api/approvals/start', params);

export const startCartApprovalChain = (cartId: number) =>
    postApi<ApprovalDto[]>(`/api/cart/${cartId}/start-approval-chain`, {});
