import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { fetchFraudAlertById, fetchFraudAlerts, updateFraudAlert } from './api';
import type { FraudAlertStatus, Severity } from './types';

const KEY_BASE = ['fraud-alerts'] as const;

export const useFraudAlerts = (
    params: { q?: string; status?: string; severity?: string; type?: string; page?: number; pageSize?: number } = {}
) =>
    useQuery({
        queryKey: [...KEY_BASE, 'list', params] as const,
        queryFn: () => fetchFraudAlerts(params),
        staleTime: 30_000
    });

export const useFraudAlert = (id: number | undefined) =>
    useQuery({
        queryKey: [...KEY_BASE, 'detail', id || 0] as const,
        queryFn: () => fetchFraudAlertById(id as number),
        enabled: !!id && id > 0,
        staleTime: 15_000
    });

export const useUpdateFraudAlert = () => {
    const qc = useQueryClient();
    return useMutation({
        mutationFn: ({ id, data }: { id: number; data: { status?: FraudAlertStatus; severity?: Severity; remarks?: string; assignToSelf?: boolean } }) =>
            updateFraudAlert(id, data),
        onSuccess: () => qc.invalidateQueries({ queryKey: KEY_BASE })
    });
};
