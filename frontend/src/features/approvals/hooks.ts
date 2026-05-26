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
    type ApprovalEntityType
} from './api';

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
        staleTime: 15_000
    });

export const useApprovalHistory = () =>
    useQuery({
        queryKey: HISTORY_KEY,
        queryFn: fetchApprovalHistory,
        staleTime: 30_000
    });

export const useApprovalTrail = (type: ApprovalEntityType | undefined, id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'trail', type, id] as const,
        queryFn: () => fetchApprovalTrail(type as ApprovalEntityType, id as number),
        enabled: !!type && !!id && id > 0,
        staleTime: 15_000
    });

export const useApproveApproval = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, remarks }: { id: number; remarks?: string }) => approveApproval(id, remarks),
        onSuccess: () => invalidate(qc)
    });
};

export const useRejectApproval = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, remarks }: { id: number; remarks: string }) => rejectApproval(id, remarks),
        onSuccess: () => invalidate(qc)
    });
};

export const useClarifyApproval = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, note }: { id: number; note: string }) => clarifyApproval(id, note),
        onSuccess: () => invalidate(qc)
    });
};

export const useStartCartApprovalChain = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (cartId: number) => startCartApprovalChain(cartId),
        onSuccess: () => invalidate(qc)
    });
};
