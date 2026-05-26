/**
 * React Query hooks for GRN operations.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    addGrnDocument,
    approveGrn,
    createGrn,
    fetchGrnById,
    fetchGrnEligibility,
    fetchGrns,
    rejectGrn,
    submitGrn,
    updateGrn,
    type GrnStatus
} from './api';

const KEY = ['grn'] as const;

const invalidate = (qc: ReturnType<typeof useQueryClient>) => {
    qc.invalidateQueries({ queryKey: KEY });
};

export const useGrns = (status?: GrnStatus) =>
    useQuery({
        queryKey: [...KEY, 'list', status || 'all'] as const,
        queryFn: () => fetchGrns(status),
        staleTime: 15_000
    });

export const useGrn = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'detail', id || 0] as const,
        queryFn: () => fetchGrnById(id as number),
        enabled: !!id && id > 0,
        staleTime: 10_000
    });

export const useGrnEligibility = (poId: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'eligibility', poId || 0] as const,
        queryFn: () => fetchGrnEligibility(poId as number),
        enabled: !!poId && poId > 0
    });

export const useCreateGrn = () => {
    const qc = useQueryClient();
    return useMutation({ mutationFn: createGrn, onSuccess: () => invalidate(qc) });
};

export const useUpdateGrn = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Parameters<typeof updateGrn>[1] }) => updateGrn(id, data),
        onSuccess: () => invalidate(qc)
    });
};

export const useSubmitGrn = () => {
    const qc = useQueryClient();
    return useMutation({ mutationFn: submitGrn, onSuccess: () => invalidate(qc) });
};

export const useApproveGrn = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, inspectionNote }: { id: number; inspectionNote?: string }) => approveGrn(id, inspectionNote),
        onSuccess: () => invalidate(qc)
    });
};

export const useRejectGrn = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, reason }: { id: number; reason: string }) => rejectGrn(id, reason),
        onSuccess: () => invalidate(qc)
    });
};

export const useAddGrnDocument = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, fileAssetId, documentType }: { id: number; fileAssetId: number; documentType: string }) =>
            addGrnDocument(id, fileAssetId, documentType),
        onSuccess: () => invalidate(qc)
    });
};
