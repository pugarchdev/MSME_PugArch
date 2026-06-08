import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createRequirement,
    deleteRequirement,
    fetchRequirementById,
    fetchRequirements,
    submitRequirement,
    updateRequirement
} from './api';
import type { NewRequirementPayload } from './types';

const KEY = ['requirements'] as const;

export const useRequirements = (params: { q?: string; status?: string; page?: number; pageSize?: number } = {}) =>
    useQuery({
        queryKey: [...KEY, 'list', params] as const,
        queryFn: () => fetchRequirements(params)
    });

export const useRequirement = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY, 'detail', id || 0] as const,
        queryFn: () => fetchRequirementById(id as number),
        enabled: !!id && id > 0
    });

const invalidate = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: KEY });

export const useCreateRequirement = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: NewRequirementPayload) => createRequirement(payload),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useUpdateRequirement = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: Partial<NewRequirementPayload> }) => updateRequirement(id, data),
        onSuccess: () => { void invalidate(qc); }
    });
};

export const useSubmitRequirement = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => submitRequirement(id),
        onSuccess: () => { void invalidate(qc); }
    });
};
export const useDeleteRequirement = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (id: number) => deleteRequirement(id),
        onSuccess: () => { void invalidate(qc); }
    });
};
