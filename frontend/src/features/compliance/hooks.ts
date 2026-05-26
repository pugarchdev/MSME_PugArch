import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createComplianceRule,
    fetchComplianceRules,
    fetchRuleViolations,
    resolveViolation,
    updateComplianceRule
} from './api';
import type { Severity } from './types';

const KEY_BASE = ['compliance-rules'] as const;

export const useComplianceRules = (
    params: { q?: string; severity?: string; isActive?: boolean; page?: number; pageSize?: number } = {}
) =>
    useQuery({
        queryKey: [...KEY_BASE, 'list', params] as const,
        queryFn: () => fetchComplianceRules(params),
        staleTime: 60_000
    });

export const useRuleViolations = (id: number | undefined, page = 1, pageSize = 10) =>
    useQuery({
        queryKey: [...KEY_BASE, 'violations', id || 0, page, pageSize] as const,
        queryFn: () => fetchRuleViolations(id as number, page, pageSize),
        enabled: !!id && id > 0,
        staleTime: 30_000
    });

const invalidateAll = (qc: ReturnType<typeof useQueryClient>) => qc.invalidateQueries({ queryKey: KEY_BASE });

export const useUpdateComplianceRule = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: { title?: string; description?: string; severity?: Severity; isActive?: boolean } }) =>
            updateComplianceRule(id, data),
        onSuccess: () => invalidateAll(qc)
    });
};

export const useCreateComplianceRule = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (payload: { code: string; title: string; description?: string; severity?: Severity; isActive?: boolean }) =>
            createComplianceRule(payload),
        onSuccess: () => invalidateAll(qc)
    });
};

export const useResolveViolation = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, remarks }: { id: number; remarks?: string }) => resolveViolation(id, remarks),
        onSuccess: () => invalidateAll(qc)
    });
};
