import { api, readJsonResponse, unwrapApiData } from '../../lib/api';

type Params = Record<string, string | number | boolean | undefined | null>;

const query = (path: string, params: Params = {}) => {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== '') search.set(key, String(value));
  }
  const qs = search.toString();
  return qs ? `${path}?${qs}` : path;
};

const authHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return token ? { Authorization: `Bearer ${token}` } : undefined;
};

const request = async <T>(path: string, init: RequestInit = {}) => {
  const response = await api.fetch(path, {
    ...init,
    headers: { ...(authHeaders() || {}), ...(init.headers as Record<string, string> || {}) },
    skipCache: init.method !== undefined && init.method !== 'GET'
  });
  const body = await readJsonResponse(response);
  if (!response.ok) throw new Error(body?.message || 'Request failed');
  return unwrapApiData<T>(body);
};

const requestEnvelope = async <T>(path: string, init: RequestInit = {}) => {
  const response = await api.fetch(path, {
    ...init,
    headers: { ...(authHeaders() || {}), ...(init.headers as Record<string, string> || {}) },
    skipCache: init.method !== undefined && init.method !== 'GET'
  });
  const body = await readJsonResponse(response);
  if (!response.ok) throw new Error(body?.message || 'Request failed');
  return { data: unwrapApiData<T>(body), message: body?.message as string | undefined };
};

const get = <T>(path: string, params?: Params) => request<T>(query(path, params));
const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) });
const del = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'DELETE', body: JSON.stringify(body) });
const delEnvelope = <T>(path: string, body: unknown = {}) => requestEnvelope<T>(path, { method: 'DELETE', body: JSON.stringify(body) });

export const masterAdminApi = {
  getMasterOverview: () => get('/api/master-admin/overview'),
  getDashboard: () => get('/api/master-admin/dashboard'),

  getCompanies: (params?: Params) => get('/api/master-admin/companies', params),
  createCompany: (data: unknown) => post('/api/master-admin/companies', data),
  updateCompany: (id: number, data: unknown) => put(`/api/master-admin/companies/${id}`, data),

  getOrganizations: (params?: Params) => get('/api/master-admin/organizations', params),
  createOrganization: (data: unknown) => post('/api/master-admin/organizations', data),
  getOrganization: (id: number) => get(`/api/master-admin/organizations/${id}`),
  updateOrganization: (id: number, data: unknown) => put(`/api/master-admin/organizations/${id}`, data),
  activateOrganization: (id: number, reason: string) => post(`/api/master-admin/organizations/${id}/activate`, { reason }),
  inactivateOrganization: (id: number, reason: string) => post(`/api/master-admin/organizations/${id}/inactivate`, { reason }),
  suspendOrganization: (id: number, reason: string) => post(`/api/master-admin/organizations/${id}/suspend`, { reason }),
  reactivateOrganization: (id: number, reason: string) => post(`/api/master-admin/organizations/${id}/reactivate`, { reason }),
  archiveOrganization: (id: number, reason: string) => post(`/api/master-admin/organizations/${id}/archive`, { reason }),
  deleteOrganization: (id: number, reason: string) => del(`/api/master-admin/organizations/${id}`, { reason, confirmation: 'DELETE' }),

  getUsers: (params?: Params) => get('/api/master-admin/users', params),
  createUser: (data: unknown) => post('/api/master-admin/users', data),
  getUser: (id: number) => get(`/api/master-admin/users/${id}`),
  updateUser: (id: number, data: unknown) => put(`/api/master-admin/users/${id}`, data),
  activateUser: (id: number, reason: string) => post(`/api/master-admin/users/${id}/activate`, { reason }),
  inactivateUser: (id: number, reason: string) => post(`/api/master-admin/users/${id}/inactivate`, { reason }),
  suspendUser: (id: number, reason: string) => post(`/api/master-admin/users/${id}/suspend`, { reason }),
  reactivateUser: (id: number, reason: string) => post(`/api/master-admin/users/${id}/reactivate`, { reason }),
  archiveUser: (id: number, reason: string) => post(`/api/master-admin/users/${id}/archive`, { reason }),
  deleteUser: (id: number, reason: string) => del(`/api/master-admin/users/${id}`, { reason, confirmation: 'DELETE' }),
  deleteUserWithMessage: (id: number, reason: string) => delEnvelope(`/api/master-admin/users/${id}`, { reason, confirmation: 'DELETE' }),
  resetUserPassword: (id: number, reason = 'Master admin reset') => post(`/api/master-admin/users/${id}/reset-password`, { reason }),
  sendUserInvite: (id: number, reason = 'Master admin invite') => post(`/api/master-admin/users/${id}/invite`, { reason }),
  changeUserRole: (id: number, role: string, reason?: string) => post(`/api/master-admin/users/${id}/change-role`, { role, reason }),
  changeUserOrganization: (id: number, organizationId: number, reason?: string) => post(`/api/master-admin/users/${id}/change-organization`, { organizationId, reason }),

  getOrganizationTheme: (id: number) => get(`/api/master-admin/organizations/${id}/theme`),
  updateOrganizationTheme: (id: number, data: unknown) => put(`/api/master-admin/organizations/${id}/theme`, data),
  resetOrganizationTheme: (id: number, reason?: string) => post(`/api/master-admin/organizations/${id}/theme/reset`, { reason }),

  getOrganizationFeatures: (id: number) => get(`/api/master-admin/organizations/${id}/features`),
  updateOrganizationFeatures: (id: number, data: unknown) => put(`/api/master-admin/organizations/${id}/features`, data),
  enableFeature: (id: number, featureKey: string, reason?: string) => post(`/api/master-admin/organizations/${id}/features/${featureKey}/enable`, { reason }),
  disableFeature: (id: number, featureKey: string, reason?: string) => post(`/api/master-admin/organizations/${id}/features/${featureKey}/disable`, { reason }),

  getEmailSettings: () => get('/api/master-admin/email-settings'),
  updateEmailSettings: (data: unknown) => put('/api/master-admin/email-settings', data),
  sendTestEmail: (data: unknown) => post('/api/master-admin/email-settings/test', data),

  getPortalSettings: () => get('/api/master-admin/portal-settings'),
  updatePortalSettings: (data: unknown) => put('/api/master-admin/portal-settings', data),
  getMasterAuditLogs: (params?: Params) => get('/api/master-admin/audit-logs', params),
  getMasterSecurityOverview: () => get('/api/master-admin/security-overview'),
  getMasterProcurementOverview: () => get('/api/master-admin/procurement-overview'),
  getMasterPaymentOverview: () => get('/api/master-admin/payment-overview'),
  getReports: () => get('/api/master-admin/reports')
};

