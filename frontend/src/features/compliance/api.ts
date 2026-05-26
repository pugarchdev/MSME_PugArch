/**
 * Compliance Rules API client.
 */
import { getApi, postApi, putApi } from '../shared/apiClient';
import type {
    ComplianceRuleDto,
    ComplianceRulesResponse,
    ComplianceViolationDto,
    Severity
} from './types';

const buildQuery = (params: Record<string, string | number | boolean | undefined>) => {
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null || value === '') continue;
        search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `?${qs}` : '';
};

export const fetchComplianceRules = (
    params: { q?: string; severity?: string; isActive?: boolean; page?: number; pageSize?: number } = {}
) =>
    getApi<ComplianceRulesResponse>(
        `/api/admin/compliance-rules${buildQuery({
            q: params.q,
            severity: params.severity,
            isActive: params.isActive,
            page: params.page,
            pageSize: params.pageSize
        })}`
    );

export const updateComplianceRule = (
    id: number,
    payload: { title?: string; description?: string; severity?: Severity; isActive?: boolean }
) => putApi<ComplianceRuleDto>(`/api/admin/compliance-rules/${id}`, payload);

export const createComplianceRule = (payload: {
    code: string;
    title: string;
    description?: string;
    severity?: Severity;
    isActive?: boolean;
}) => postApi<ComplianceRuleDto>(`/api/admin/compliance-rules`, payload);

export const fetchRuleViolations = (id: number, page = 1, pageSize = 10) =>
    getApi<{ records: ComplianceViolationDto[]; total: number; skip?: number; take?: number }>(
        `/api/admin/compliance-rules/${id}/violations${buildQuery({ page, pageSize })}`
    );

export const resolveViolation = (id: number, remarks?: string) =>
    postApi<ComplianceViolationDto>(`/api/admin/compliance-violations/${id}/resolve`, { remarks });
