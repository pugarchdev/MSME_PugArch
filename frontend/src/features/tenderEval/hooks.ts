/**
 * React Query hooks for tender evaluation.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
    createCriterion,
    fetchComparativeStatement,
    fetchCriteria,
    fetchFinancialBids,
    fetchRanking,
    fetchTechnicalEvaluation,
    generateComparativeStatement,
    openFinancialBids,
    submitFinancialEvaluation,
    submitTechnicalScores
} from './api';

const KEY = ['tender-eval'] as const;

const invalidate = (qc: ReturnType<typeof useQueryClient>, tenderId?: number) => {
    qc.invalidateQueries({ queryKey: tenderId ? [...KEY, tenderId] : KEY });
};

export const useCriteria = (tenderId: number | undefined) =>
    useQuery({
        queryKey: [...KEY, tenderId || 0, 'criteria'] as const,
        queryFn: () => fetchCriteria(tenderId as number),
        enabled: !!tenderId
    });

export const useTechnicalEvaluation = (tenderId: number | undefined) =>
    useQuery({
        queryKey: [...KEY, tenderId || 0, 'technical'] as const,
        queryFn: () => fetchTechnicalEvaluation(tenderId as number),
        enabled: !!tenderId,
        staleTime: 10_000
    });

export const useFinancialBids = (tenderId: number | undefined, enabled = true) =>
    useQuery({
        queryKey: [...KEY, tenderId || 0, 'financial'] as const,
        queryFn: () => fetchFinancialBids(tenderId as number),
        enabled: !!tenderId && enabled,
        staleTime: 10_000
    });

export const useRanking = (tenderId: number | undefined, enabled = true) =>
    useQuery({
        queryKey: [...KEY, tenderId || 0, 'ranking'] as const,
        queryFn: () => fetchRanking(tenderId as number),
        enabled: !!tenderId && enabled,
        staleTime: 10_000
    });

export const useComparativeStatement = (tenderId: number | undefined) =>
    useQuery({
        queryKey: [...KEY, tenderId || 0, 'comparative'] as const,
        queryFn: () => fetchComparativeStatement(tenderId as number),
        enabled: !!tenderId
    });

export const useCreateCriterion = (tenderId: number) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: (data: Parameters<typeof createCriterion>[1]) => createCriterion(tenderId, data),
        onSuccess: () => invalidate(qc, tenderId)
    });
};

export const useSubmitTechnicalScores = (tenderId: number) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ bidId, scores }: { bidId: number; scores: Array<{ criteriaId: number; score: number; remarks?: string }> }) =>
            submitTechnicalScores(tenderId, bidId, scores),
        onSuccess: () => invalidate(qc, tenderId)
    });
};

export const useOpenFinancialBids = (tenderId: number) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => openFinancialBids(tenderId),
        onSuccess: () => invalidate(qc, tenderId)
    });
};

export const useSubmitFinancialEvaluation = (tenderId: number) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ bidId, data }: { bidId: number; data: { evaluatedAmount?: number; remarks?: string } }) =>
            submitFinancialEvaluation(tenderId, bidId, data),
        onSuccess: () => invalidate(qc, tenderId)
    });
};

export const useGenerateComparative = (tenderId: number) => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: () => generateComparativeStatement(tenderId),
        onSuccess: () => invalidate(qc, tenderId)
    });
};
