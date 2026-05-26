/**
 * Fraud Alerts API client.
 */
import { getApi, putApi } from '../shared/apiClient';
import type {
    FraudAlertDto,
    FraudAlertStatus,
    FraudAlertsResponse,
    Severity
} from './types';

const buildQuery = (params: Record<string, string | number | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `?${qs}` : '';
};

export const fetchFraudAlerts = (
    params: { q?: string; status?: string; severity?: string; type?: string; page?: number; pageSize?: number } = {}
) =>
    getApi<FraudAlertsResponse>(
        `/api/admin/fraud-alerts${buildQuery({
            q: params.q,
            status: params.status,
            severity: params.severity,
            type: params.type,
            page: params.page,
            pageSize: params.pageSize
        })}`
    );

export const fetchFraudAlertById = (id: number) => getApi<FraudAlertDto>(`/api/admin/fraud-alerts/${id}`);

export const updateFraudAlert = (
    id: number,
    payload: { status?: FraudAlertStatus; severity?: Severity; remarks?: string; assignToSelf?: boolean }
) => putApi<FraudAlertDto>(`/api/admin/fraud-alerts/${id}`, payload);
