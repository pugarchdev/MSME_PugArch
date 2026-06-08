/**
 * React Query hooks for approval workflow.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    approveApproval,
    clarifyApproval,
    fetchApprovalHistory,
    fetchApprovalTrail,
    fetchPendingApprovals,
    rejectApproval,
    startCartApprovalChain,
    type ApprovalEntityType,
    type ApprovalDto,
    type ApprovalTrail
} from './api';
import { peekApi } from '../shared/apiClient';

const KEY = ['approvals'] as const;
const PENDING_KEY = ['approvals', 'pending'] as const;
const HISTORY_KEY = ['approvals', 'history'] as const;

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
    qc.invalidateQueries({ queryKey: KEY });
};

export const usePendingApprovals = () =>
    useQuery({
        queryKey: PENDING_KEY,
        queryFn: fetchPendingApprovals,
        placeholderData: (previous) => previous ?? peekApi<ApprovalDto[]>('/api/approvals/pending') ?? undefined
    });

export const useApprovalHistory = () =>
    useQuery({
        queryKey: HISTORY_KEY,
        queryFn: fetchApprovalHistory,
        placeholderData: (previous) => previous ?? peekApi<ApprovalDto[]>('/api/approvals/history') ?? undefined
    });

export const useApprovalTrail = (type: ApprovalEntityType | undefined, id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'trail', type, id] as const,
        queryFn: () => fetchApprovalTrail(type as ApprovalEntityType, id as number),
        enabled: !!type && !!id && id > 0,
        placeholderData: (previous) => previous ?? (type && id ? peekApi<ApprovalTrail>(`/api/approvals/trail/${type}/${id}`) : null) ?? undefined
    });

export const useApproveApproval = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, remarks }: { id: number; remarks?: string }) => approveApproval(id, remarks),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useRejectApproval = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, remarks }: { id: number; remarks: string }) => rejectApproval(id, remarks),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useClarifyApproval = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, note }: { id: number; note: string }) => clarifyApproval(id, note),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useStartCartApprovalChain = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (cartId: number) => startCartApprovalChain(cartId),
        onSuccess: () => { void invalidate(qc); }
    });
};
