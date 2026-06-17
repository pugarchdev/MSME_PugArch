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

const download = async (path: string, params?: Params) => {
  const response = await api.fetch(query(path, params), {
    headers: authHeaders(),
    skipCache: true
  });
  if (!response.ok) {
    const body = await readJsonResponse(response);
    throw new Error(body?.message || 'Download failed');
  }
  return response.blob();
};

const get = <T>(path: string, params?: Params) => request<T>(query(path, params));
const post = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'POST', body: JSON.stringify(body) });
const put = <T>(path: string, body: unknown = {}) => request<T>(path, { method: 'PUT', body: JSON.stringify(body) });

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
  closeOrganization: (id: number, reason: string, confirm: boolean) => request<any>(`/api/master-admin/organizations/${id}/close`, { method: 'PATCH', body: JSON.stringify({ reason, confirm }) }),
  archiveOrganizationPatch: (id: number, reason: string, confirm: boolean) => request<any>(`/api/master-admin/organizations/${id}/archive`, { method: 'PATCH', body: JSON.stringify({ reason, confirm }) }),
  restoreOrganization: (id: number, reason: string) => request<any>(`/api/master-admin/organizations/${id}/restore`, { method: 'PATCH', body: JSON.stringify({ reason }) }),
  allowGstReuse: (id: number, reason: string, confirm: boolean) => request<any>(`/api/master-admin/organizations/${id}/allow-gst-reuse`, { method: 'PATCH', body: JSON.stringify({ reason, confirm }) }),
  revokeGstReuse: (id: number, reason: string, confirm: boolean) => request<any>(`/api/master-admin/organizations/${id}/revoke-gst-reuse`, { method: 'PATCH', body: JSON.stringify({ reason, confirm }) }),

  getUsers: (params?: Params) => get('/api/master-admin/users', params),
  createUser: (data: unknown) => post('/api/master-admin/users', data),
  getUser: (id: number) => get(`/api/master-admin/users/${id}`),
  updateUser: (id: number, data: unknown) => put(`/api/master-admin/users/${id}`, data),
  activateUser: (id: number, reason: string) => post(`/api/master-admin/users/${id}/activate`, { reason }),
  inactivateUser: (id: number, reason: string) => post(`/api/master-admin/users/${id}/inactivate`, { reason }),
  suspendUser: (id: number, reason: string) => post(`/api/master-admin/users/${id}/suspend`, { reason }),
  reactivateUser: (id: number, reason: string) => post(`/api/master-admin/users/${id}/reactivate`, { reason }),
  archiveUser: (id: number, reason: string) => post(`/api/master-admin/users/${id}/archive`, { reason }),
  resetUserPassword: (id: number, reason: string) => post(`/api/master-admin/users/${id}/reset-password`, { reason }),
  sendUserInvite: (id: number, reason: string) => post(`/api/master-admin/users/${id}/invite`, { reason }),
  changeUserRole: (id: number, role: string, reason: string) => post(`/api/master-admin/users/${id}/change-role`, { role, reason }),
  changeUserOrganization: (id: number, organizationId: number, reason: string) => post(`/api/master-admin/users/${id}/change-organization`, { organizationId, reason }),

  getOrganizationTheme: (id: number) => get(`/api/master-admin/organizations/${id}/theme`),
  updateOrganizationTheme: (id: number, data: unknown) => put(`/api/master-admin/organizations/${id}/theme`, data),
  resetOrganizationTheme: (id: number, reason: string) => post(`/api/master-admin/organizations/${id}/theme/reset`, { reason }),

  getOrganizationFeatures: (id: number) => get(`/api/master-admin/organizations/${id}/features`),
  updateOrganizationFeatures: (id: number, data: unknown) => put(`/api/master-admin/organizations/${id}/features`, data),
  enableFeature: (id: number, featureKey: string, reason: string) => post(`/api/master-admin/organizations/${id}/features/${featureKey}/enable`, { reason }),
  disableFeature: (id: number, featureKey: string, reason: string) => post(`/api/master-admin/organizations/${id}/features/${featureKey}/disable`, { reason }),

  getEmailSettings: () => get('/api/master-admin/email-settings'),
  updateEmailSettings: (data: unknown) => put('/api/master-admin/email-settings', data),
  sendTestEmail: (data: unknown) => post('/api/master-admin/email-settings/test', data),

  getPortalSettings: () => get('/api/master-admin/portal-settings'),
  updatePortalSettings: (data: unknown) => put('/api/master-admin/portal-settings', data),
  getMasterAuditLogs: (params?: Params) => get('/api/master-admin/audit-logs', params),
  getMasterSecurityOverview: () => get('/api/master-admin/security-overview'),
  getMasterSystemHealth: () => get('/api/master-admin/system-health'),
  searchMasterAdmin: (params?: Params) => get('/api/master-admin/search', params),
  downloadReportExport: (params?: Params) => download('/api/master-admin/reports/export', params),
  updateOrderStatus: (id: number, status: string, reason: string) => post(`/api/master-admin/orders/${id}/status`, { status, reason }),
  updateInvoiceStatus: (id: number, status: string, reason: string) => post(`/api/master-admin/invoices/${id}/status`, { status, reason }),
  updatePaymentStatus: (id: number, status: string, reason: string) => post(`/api/master-admin/payments/${id}/status`, { status, reason }),
  getEscrowAccounts: (params?: Params) => get('/api/master-admin/escrow-accounts', params),
  updateEscrowStatus: (id: number, status: string, reason: string) => post(`/api/master-admin/escrow-accounts/${id}/status`, { status, reason }),
  getPaymentSettlements: (params?: Params) => get('/api/master-admin/payment-settlements', params),
  getDocuments: (params?: Params) => get('/api/master-admin/documents', params),
  getMarketplaceProducts: (params?: Params) => get('/api/master-admin/marketplace/products', params),
  getMarketplaceServices: (params?: Params) => get('/api/master-admin/marketplace/services', params),
  updateMarketplaceProductStatus: (id: number, status: string, reason: string) => post(`/api/master-admin/marketplace/products/${id}/status`, { status, reason }),
  updateMarketplaceServiceStatus: (id: number, status: string, reason: string) => post(`/api/master-admin/marketplace/services/${id}/status`, { status, reason }),
  getMasterProcurementOverview: () => get('/api/master-admin/procurement-overview'),
  getMasterPaymentOverview: () => get('/api/master-admin/payment-overview'),
  getReports: () => get('/api/master-admin/reports')
};

