import { api, readJsonResponse, unwrapApiData } from '../../lib/api';

const headers = (): Record<string, string> => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : {};
};

const json = async <T>(response: Response): Promise<T> => unwrapApiData<T>(await readJsonResponse(response));

export const bannerApi = {
  adminList: (status = '') =>
    api.get(`/api/admin/banners${status ? `?status=${encodeURIComponent(status)}` : ''}`, { headers: headers(), skipCache: true }).then(res => json<{ banners: any[] }>(res)),
  create: (data: Record<string, unknown>) =>
    api.post('/api/admin/banners', data, { headers: headers() }).then(res => json<any>(res)),
  updateStatus: (id: number, action: 'approve' | 'reject' | 'show' | 'hide' | 'delete', body: Record<string, unknown> = {}) => {
    if (action === 'delete') return api.delete(`/api/admin/banners/${id}`, { headers: headers() }).then(res => json<any>(res));
    return api.post(`/api/admin/banners/${id}/${action}`, body, { headers: headers() }).then(res => json<any>(res));
  },
  eligibility: () =>
    api.get('/api/my-org/banner-eligibility', { headers: headers(), skipCache: true }).then(res => json<any>(res)),
  uploadOrgBanner: (data: Record<string, unknown>) =>
    api.post('/api/my-org/banner-upload', data, { headers: headers() }).then(res => json<any>(res)),
  rankings: (month?: number, year?: number) => {
    const qs = new URLSearchParams();
    if (month) qs.set('month', String(month));
    if (year) qs.set('year', String(year));
    return api.get(`/api/admin/rankings/monthly?${qs}`, { headers: headers(), skipCache: true }).then(res => json<any>(res));
  },
  computeRankings: (month?: number, year?: number) =>
    api.post('/api/admin/rankings/compute-monthly', { month, year }, { headers: headers() }).then(res => json<any>(res)),
  grant: (data: Record<string, unknown>) =>
    api.post('/api/admin/banner-eligibility/grant', data, { headers: headers() }).then(res => json<any>(res)),
  revoke: (data: Record<string, unknown>) =>
    api.post('/api/admin/banner-eligibility/revoke', data, { headers: headers() }).then(res => json<any>(res))
};
