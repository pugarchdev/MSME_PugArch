/**
 * Requirements API client.
 */
import { getApi, postApi, putApi } from '../shared/apiClient';
import type {
    NewRequirementPayload,
    RequirementDto,
    RequirementsListResponse
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

export const fetchRequirements = (
    params: { q?: string; status?: string; page?: number; pageSize?: number } = {}
) =>
    getApi<RequirementsListResponse>(`/api/buyer/requirements${buildQuery(params)}`);

export const fetchRequirementById = (id: number) =>
    getApi<RequirementDto>(`/api/requirements/${id}`);

export const createRequirement = (payload: NewRequirementPayload) =>
    postApi<RequirementDto>(`/api/buyer/requirements`, payload);

export const updateRequirement = (id: number, payload: Partial<NewRequirementPayload>) =>
    putApi<RequirementDto>(`/api/buyer/requirements/${id}`, payload);

export const submitRequirement = (id: number) =>
    postApi<RequirementDto>(`/api/buyer/requirements/${id}/submit`, {});
