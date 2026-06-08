import { memo, useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Archive,
  BarChart3,
  Bell,
  Building2,
  CheckCircle2,
  CreditCard,
  Eye,
  FileClock,
  Filter,
  Grid2X2,
  KeyRound,
  LayoutDashboard,
  List,
  Mail,
  Plus,
  Power,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Trash2,
  ToggleLeft,
  ToggleRight,
  UserPlus,
  Users
} from 'lucide-react';
import { toast } from 'sonner';
import { useDebounce } from '../../../hooks/useDebounce';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { Loader2 } from '../../../components/ui/loader';
import { api } from '../../../lib/api';
import { cn } from '../../../lib/utils';
import PremiumLoader from '../../../components/PremiumLoader';
import { Pagination } from '../../shared/Pagination';
import { SortableHeader, type SortDirection } from '../../shared/SortableHeader';
import { useResponsiveViewMode, type ViewMode } from '../../shared/hooks';
import { masterAdminApi } from '../masterAdminApi';

type ApiPage<T> = { items: T[]; total: number; page: number; pageSize: number; summary?: Record<string, number> };
type TabId = 'overview' | 'organizations' | 'users' | 'procurement' | 'payments' | 'features' | 'email' | 'audit' | 'security';

type Company = {
  id: number;
  name: string;
  portalDisplayName?: string | null;
  shortName?: string | null;
  district?: string | null;
  state?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  isActive?: boolean;
  createdAt?: string;
  updatedAt?: string;
};

type Organization = {
  id: number;
  organizationName?: string | null;
  organizationType?: string | null;
  gstin?: string | null;
  pan?: string | null;
  udyamNumber?: string | null;
  cin?: string | null;
  contactPerson?: string | null;
  email?: string | null;
  mobile?: string | null;
  district?: string | null;
  state?: string | null;
  pincode?: string | null;
  verificationStatus?: string | null;
  isBlacklisted?: boolean;
  createdAt?: string;
  updatedAt?: string;
  users?: Array<{ id: number }>;
};

type UserRecord = {
  id: number;
  userId?: string | null;
  name?: string | null;
  email?: string | null;
  mobile?: string | null;
  role?: string | null;
  onboardingStatus?: string | null;
  accountStatus?: string | null;
  createdAt?: string;
  organization?: { id: number; organizationName?: string | null; organizationType?: string | null } | null;
  company?: { id: number; name?: string | null } | null;
};

type Feature = {
  id: number;
  code: string;
  name: string;
  module: string;
  description?: string | null;
  enabled?: boolean;
};

type BidRecord = {
  id: number;
  bidNumber?: string;
  title?: string;
  buyerOrganizationName?: string;
  category?: string;
  status?: string;
  approvalStatus?: string;
  lifecycleStage?: string;
  estimatedValue?: string | number | null;
  endDate?: string;
  createdAt?: string;
  _count?: { participations?: number; documents?: number; awards?: number };
};

type PaymentRecord = {
  id: number;
  referenceId?: string;
  gateway?: string | null;
  method?: string | null;
  status?: string | null;
  paymentStatus?: string | null;
  amount?: string | number | null;
  currency?: string;
  createdAt?: string;
  payer?: { name?: string | null; email?: string | null };
  payee?: { name?: string | null; email?: string | null };
};

type AuditRecord = {
  id: number;
  action?: string | null;
  entityType?: string | null;
  entityId?: string | number | null;
  createdAt?: string;
  User?: { name?: string | null; email?: string | null; role?: string | null } | null;
};

type ActionDialogState = {
  entity: 'company' | 'organization' | 'user' | 'feature' | 'email';
  action: string;
  id?: number;
  label: string;
  danger?: boolean;
  featureKey?: string;
} | null;

type EditorState = {
  type: 'company' | 'organization' | 'user' | 'email';
  mode: 'create' | 'edit';
  record?: any;
} | null;

const tabs: Array<{ id: TabId; label: string; icon: any }> = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'organizations', label: 'Organizations', icon: Building2 },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'procurement', label: 'Procurement', icon: BarChart3 },
  { id: 'payments', label: 'Payments', icon: CreditCard },
  { id: 'features', label: 'Features', icon: ToggleRight },
  { id: 'email', label: 'Email Setup', icon: Mail },
  { id: 'audit', label: 'Audit Logs', icon: FileClock },
  { id: 'security', label: 'Security', icon: ShieldCheck }
];

const quickActions = [
  ['Add Company', 'organizations', Building2],
  ['Add Organization', 'organizations', Plus],
  ['Add User', 'users', Users],
  ['Review Pending Bids', 'procurement', BarChart3],
  ['Configure Email', 'email', Mail],
  ['View Audit Logs', 'audit', FileClock],
  ['View Payments', 'payments', CreditCard]
] as const;

const pageSizeOptions = [10, 20, 50];

export default function MasterAdminPage() {
  const { token } = useAuth();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [overview, setOverview] = useState<any>(null);
  const [overviewLoading, setOverviewLoading] = useState(true);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [companies, setCompanies] = useState<ApiPage<Company>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [organizations, setOrganizations] = useState<ApiPage<Organization>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [users, setUsers] = useState<ApiPage<UserRecord>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [procurement, setProcurement] = useState<ApiPage<BidRecord>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [payments, setPayments] = useState<ApiPage<PaymentRecord>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loadedFeatureCompanyId, setLoadedFeatureCompanyId] = useState<number | null>(null);
  const [emailSettings, setEmailSettings] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<ApiPage<AuditRecord>>({ items: [], total: 0, page: 1, pageSize: 20 });
  const [security, setSecurity] = useState<any>(null);
  const [loading, setLoading] = useState<Record<string, boolean>>({
    companies: true,
    organizations: true,
    users: true,
    procurement: true,
    payments: true,
    email: true,
    audit: true,
    security: true
  });
  const [error, setError] = useState<Record<string, string | null>>({});
  const [filters, setFilters] = useState<Record<TabId, Record<string, string>>>({
    overview: {},
    organizations: { search: '', status: '', organizationType: '' },
    users: { search: '', role: '', status: '' },
    procurement: { search: '', status: '' },
    payments: { search: '', status: '' },
    features: { search: '', module: '' },
    email: {},
    audit: { search: '', action: '', entityType: '' },
    security: {}
  });
  const [sorts, setSorts] = useState<Record<string, { field: string; direction: SortDirection }>>({
    companies: { field: 'updatedAt', direction: 'desc' },
    organizations: { field: 'updatedAt', direction: 'desc' },
    users: { field: 'createdAt', direction: 'desc' },
    procurement: { field: 'createdAt', direction: 'desc' },
    payments: { field: 'createdAt', direction: 'desc' },
    audit: { field: 'createdAt', direction: 'desc' }
  });
  const [pages, setPages] = useState<Record<string, { page: number; pageSize: number }>>({
    companies: { page: 1, pageSize: 20 },
    organizations: { page: 1, pageSize: 20 },
    users: { page: 1, pageSize: 20 },
    procurement: { page: 1, pageSize: 20 },
    payments: { page: 1, pageSize: 20 },
    audit: { page: 1, pageSize: 20 }
  });
  const [viewMode, setViewMode] = useResponsiveViewMode('master-admin:control-center:view-mode');
  const [actionDialog, setActionDialog] = useState<ActionDialogState>(null);
  const [editor, setEditor] = useState<EditorState>(null);
  const [mutating, setMutating] = useState(false);
  const debouncedFilters = useDebounce(filters, 350);

  const fetchJson = async <T,>(path: string): Promise<T> => {
    const authToken = token || (typeof window !== 'undefined' ? localStorage.getItem('token') : null);
    const headers = authToken ? { Authorization: `Bearer ${authToken}` } : undefined;
    const res = await api.fetch(path, { headers, skipCache: true });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body?.message || 'Request failed');
    return (body?.data ?? body) as T;
  };

  const setBusy = (key: string, busy: boolean) => setLoading(prev => ({ ...prev, [key]: busy }));
  const setSectionError = (key: string, message: string | null) => setError(prev => ({ ...prev, [key]: message }));

  const loadOverview = async () => {
    setOverviewLoading(true);
    try {
      const data = await fetchJson<any>('/api/master-admin/dashboard');
      setOverview(data);
      setSectionError('overview', null);
    } catch (err: any) {
      setSectionError('overview', err.message);
    } finally {
      setOverviewLoading(false);
    }
  };

  const loadCompanies = async () => {
    setBusy('companies', true);
    try {
      const data = await fetchJson<ApiPage<Company>>(endpoint('/api/master-admin/companies', {
        ...pages.companies,
        search: debouncedFilters.organizations.search,
        status: debouncedFilters.organizations.status,
        sortBy: sorts.companies.field,
        sortOrder: sorts.companies.direction
      }));
      setCompanies(data);
      setSelectedCompanyId(current => current ?? data.items[0]?.id ?? null);
      setSectionError('companies', null);
    } catch (err: any) {
      setSectionError('companies', err.message);
    } finally {
      setBusy('companies', false);
    }
  };

  const loadOrganizations = async () => {
    setBusy('organizations', true);
    try {
      const data = await fetchJson<ApiPage<Organization>>(endpoint('/api/master-admin/organizations', {
        ...pages.organizations,
        search: debouncedFilters.organizations.search,
        status: debouncedFilters.organizations.status,
        organizationType: debouncedFilters.organizations.organizationType,
        sortBy: sorts.organizations.field,
        sortOrder: sorts.organizations.direction
      }));
      setOrganizations(data);
      setSectionError('organizations', null);
    } catch (err: any) {
      setSectionError('organizations', err.message);
    } finally {
      setBusy('organizations', false);
    }
  };

  const loadUsers = async () => {
    setBusy('users', true);
    try {
      const data = await fetchJson<ApiPage<UserRecord>>(endpoint('/api/master-admin/users', {
        ...pages.users,
        search: debouncedFilters.users.search,
        role: debouncedFilters.users.role,
        status: debouncedFilters.users.status,
        sortBy: sorts.users.field,
        sortOrder: sorts.users.direction
      }));
      setUsers(data);
      setSectionError('users', null);
    } catch (err: any) {
      setSectionError('users', err.message);
    } finally {
      setBusy('users', false);
    }
  };

  const loadProcurement = async () => {
    setBusy('procurement', true);
    try {
      const data = await fetchJson<ApiPage<BidRecord>>(endpoint('/api/master-admin/procurement', {
        ...pages.procurement,
        search: debouncedFilters.procurement.search,
        status: debouncedFilters.procurement.status,
        sortBy: sorts.procurement.field,
        sortOrder: sorts.procurement.direction
      }));
      setProcurement(data);
      setSectionError('procurement', null);
    } catch (err: any) {
      setSectionError('procurement', err.message);
    } finally {
      setBusy('procurement', false);
    }
  };

  const loadPayments = async () => {
    setBusy('payments', true);
    try {
      const data = await fetchJson<ApiPage<PaymentRecord>>(endpoint('/api/master-admin/payments', {
        ...pages.payments,
        search: debouncedFilters.payments.search,
        status: debouncedFilters.payments.status,
        sortBy: sorts.payments.field,
        sortOrder: sorts.payments.direction
      }));
      setPayments(data);
      setSectionError('payments', null);
    } catch (err: any) {
      setSectionError('payments', err.message);
    } finally {
      setBusy('payments', false);
    }
  };

  const loadFeatures = async () => {
    if (!selectedCompanyId) {
      setBusy('features', false);
      setLoadedFeatureCompanyId(null);
      return;
    }
    setBusy('features', true);
    try {
      const data = await fetchJson<{ items: Feature[] }>(`/api/master-admin/companies/${selectedCompanyId}/features`);
      setFeatures(data.items || []);
      setLoadedFeatureCompanyId(selectedCompanyId);
      setSectionError('features', null);
    } catch (err: any) {
      setSectionError('features', err.message);
      setLoadedFeatureCompanyId(selectedCompanyId);
    } finally {
      setBusy('features', false);
    }
  };

  const loadEmail = async () => {
    setBusy('email', true);
    try {
      setEmailSettings(await fetchJson<any>('/api/master-admin/email-settings'));
      setSectionError('email', null);
    } catch (err: any) {
      setSectionError('email', err.message);
    } finally {
      setBusy('email', false);
    }
  };

  const loadAudit = async () => {
    setBusy('audit', true);
    try {
      const data = await fetchJson<ApiPage<AuditRecord>>(endpoint('/api/master-admin/audit-logs', {
        ...pages.audit,
        search: debouncedFilters.audit.search,
        action: debouncedFilters.audit.action,
        entityType: debouncedFilters.audit.entityType,
        sortBy: sorts.audit.field,
        sortOrder: sorts.audit.direction
      }));
      setAuditLogs(data);
      setSectionError('audit', null);
    } catch (err: any) {
      setSectionError('audit', err.message);
    } finally {
      setBusy('audit', false);
    }
  };

  const loadSecurity = async () => {
    setBusy('security', true);
    try {
      setSecurity(await fetchJson<any>('/api/master-admin/security-overview'));
      setSectionError('security', null);
    } catch (err: any) {
      setSectionError('security', err.message);
    } finally {
      setBusy('security', false);
    }
  };

  useEffect(() => { void loadOverview(); }, []);
  useEffect(() => { void loadCompanies(); }, [pages.companies, debouncedFilters.organizations.search, debouncedFilters.organizations.status, sorts.companies]);
  useEffect(() => { void loadOrganizations(); }, [pages.organizations, debouncedFilters.organizations, sorts.organizations]);
  useEffect(() => { void loadUsers(); }, [pages.users, debouncedFilters.users, sorts.users]);
  useEffect(() => { void loadProcurement(); }, [pages.procurement, debouncedFilters.procurement, sorts.procurement]);
  useEffect(() => { void loadPayments(); }, [pages.payments, debouncedFilters.payments, sorts.payments]);
  useEffect(() => { void loadFeatures(); }, [selectedCompanyId]);
  useEffect(() => { void loadEmail(); void loadSecurity(); }, []);
  useEffect(() => { void loadAudit(); }, [pages.audit, debouncedFilters.audit, sorts.audit]);

  const summaryCards = useMemo(() => {
    const summary = overview?.summary || {};
    return [
      ['Organizations', summary.totalOrganizations, `${summary.activeOrganizations || 0} verified`, Building2, 'blue'],
      ['Pending Orgs', summary.pendingOrganizations, `${summary.suspendedOrganizations || 0} suspended`, AlertTriangle, 'amber'],
      ['Users', summary.totalUsers, `${summary.totalBuyers || 0} buyers / ${summary.totalSellers || 0} sellers`, Users, 'green'],
      ['Active Bids', summary.activeBids, `${summary.pendingApprovals || 0} pending approvals`, BarChart3, 'blue'],
      ['Payments', summary.totalPayments, `${summary.pendingSettlements || 0} pending settlements`, CreditCard, 'green'],
      ['Fraud Alerts', summary.openFraudAlerts, 'open security signals', ShieldCheck, 'red']
    ];
  }, [overview]);

  const visibleFeatures = useMemo(() => {
    const text = filters.features.search.toLowerCase();
    const module = filters.features.module.toLowerCase();
    return features.filter(feature =>
      (!text || `${feature.name} ${feature.code} ${feature.description || ''}`.toLowerCase().includes(text)) &&
      (!module || feature.module.toLowerCase().includes(module))
    );
  }, [features, filters.features]);

  const initialPageLoading = overviewLoading || [
    loading.companies,
    loading.organizations,
    loading.users,
    loading.procurement,
    loading.payments,
    loading.email,
    loading.audit,
    loading.security,
    Boolean(selectedCompanyId && (loading.features || loadedFeatureCompanyId !== selectedCompanyId))
  ].some(Boolean);

  const updateFilter = (tab: TabId, key: string, value: string) => {
    setFilters(prev => ({ ...prev, [tab]: { ...prev[tab], [key]: value } }));
    const pageKey = tab === 'organizations' ? 'organizations' : tab;
    if (pages[pageKey]) setPages(prev => ({ ...prev, [pageKey]: { ...prev[pageKey], page: 1 } }));
  };

  const resetFilters = (tab: TabId) => {
    setFilters(prev => ({ ...prev, [tab]: Object.fromEntries(Object.keys(prev[tab]).map(key => [key, ''])) }));
    const pageKey = tab === 'organizations' ? 'organizations' : tab;
    if (pages[pageKey]) setPages(prev => ({ ...prev, [pageKey]: { ...prev[pageKey], page: 1 } }));
  };

  const onSort = (key: string, field: string) => {
    setSorts(prev => ({
      ...prev,
      [key]: {
        field,
        direction: prev[key]?.field === field && prev[key]?.direction === 'asc' ? 'desc' : 'asc'
      }
    }));
  };

  const setPageState = (key: string, page: number) => setPages(prev => ({ ...prev, [key]: { ...prev[key], page } }));
  const setPageSizeState = (key: string, pageSize: number) => setPages(prev => ({ ...prev, [key]: { page: 1, pageSize } }));
  const refreshActive = () => {
    const loaders: Record<TabId, () => Promise<void>> = {
      overview: loadOverview,
      organizations: async () => { await loadCompanies(); await loadOrganizations(); },
      users: loadUsers,
      procurement: loadProcurement,
      payments: loadPayments,
      features: loadFeatures,
      email: loadEmail,
      audit: loadAudit,
      security: loadSecurity
    };
    void loaders[activeTab]();
  };

  const showUnsafeAction = (label: string) => {
    toast.warning(`${label} requires confirmation, reason capture, and audited backend support. Use suspend/archive before permanent deletion.`);
  };

  const openAction = (dialog: NonNullable<ActionDialogState>) => setActionDialog(dialog);

  const runAction = async (reason: string, confirmation?: string) => {
    if (!actionDialog) return;
    setMutating(true);
    let successMessage: string | undefined;
    try {
      const { entity, action, id, featureKey } = actionDialog;
      if (entity === 'organization' && id) {
        const actions: Record<string, () => Promise<any>> = {
          activate: () => masterAdminApi.activateOrganization(id, reason),
          inactivate: () => masterAdminApi.inactivateOrganization(id, reason),
          suspend: () => masterAdminApi.suspendOrganization(id, reason),
          reactivate: () => masterAdminApi.reactivateOrganization(id, reason),
          archive: () => masterAdminApi.archiveOrganization(id, reason),
          delete: () => confirmation === 'DELETE' ? masterAdminApi.deleteOrganization(id, reason) : Promise.reject(new Error('Type DELETE to confirm.'))
        };
        await actions[action]?.();
        await loadOrganizations();
      }
      if (entity === 'company' && id) {
        const path = `/api/master-admin/companies/${id}/${action}`;
        const method = action === 'delete' ? 'DELETE' : 'POST';
        const res = await api.fetch(action === 'delete' ? `/api/master-admin/companies/${id}` : path, {
          method,
          body: JSON.stringify({ reason, confirmation }),
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          skipCache: true
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || 'Request failed');
        await loadCompanies();
      }
      if (entity === 'user' && id) {
        const actions: Record<string, () => Promise<any>> = {
          activate: () => masterAdminApi.activateUser(id, reason),
          inactivate: () => masterAdminApi.inactivateUser(id, reason),
          suspend: () => masterAdminApi.suspendUser(id, reason),
          reactivate: () => masterAdminApi.reactivateUser(id, reason),
          archive: () => masterAdminApi.archiveUser(id, reason),
          delete: () => confirmation === 'DELETE' ? masterAdminApi.deleteUserWithMessage(id, reason) : Promise.reject(new Error('Type DELETE to confirm.')),
          invite: () => masterAdminApi.sendUserInvite(id, reason),
          resetPassword: () => masterAdminApi.resetUserPassword(id, reason)
        };
        const result: any = await actions[action]?.();
        if (action === 'resetPassword' && result?.temporaryPassword) {
          toast.success(`Temporary password generated: ${result.temporaryPassword}`);
        }
        if (action === 'delete' && result?.message) {
          successMessage = result.message;
        }
        await loadUsers();
      }
      if (entity === 'feature' && selectedCompanyId && featureKey) {
        const res = await api.fetch(`/api/master-admin/companies/${selectedCompanyId}/features/${featureKey}/${action}`, {
          method: 'POST',
          body: JSON.stringify({ reason }),
          headers: token ? { Authorization: `Bearer ${token}` } : undefined,
          skipCache: true
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body?.message || 'Request failed');
        await loadFeatures();
      }
      if (entity === 'email' && action === 'test') {
        await masterAdminApi.sendTestEmail({ to: reason, reason: 'Master admin SMTP test' });
      }
      toast.success(successMessage || `${labelize(action)} completed`);
      setActionDialog(null);
      await loadOverview();
    } catch (err: any) {
      toast.error(err.message || 'Action failed');
    } finally {
      setMutating(false);
    }
  };

  const saveEditor = async (values: Record<string, any>) => {
    if (!editor) return;
    setMutating(true);
    try {
      if (editor.type === 'organization') {
        if (editor.mode === 'create') await masterAdminApi.createOrganization(values);
        else await masterAdminApi.updateOrganization(Number(editor.record.id), values);
        await loadOrganizations();
        await loadCompanies();
      }
      if (editor.type === 'company') {
        if (editor.mode === 'create') await masterAdminApi.createCompany(values);
        else await masterAdminApi.updateCompany(Number(editor.record.id), values);
        await loadCompanies();
        await loadFeatures();
      }
      if (editor.type === 'user') {
        if (editor.mode === 'create') await masterAdminApi.createUser(values);
        else await masterAdminApi.updateUser(Number(editor.record.id), values);
        await loadUsers();
      }
      if (editor.type === 'email') {
        await masterAdminApi.updateEmailSettings(values);
        await loadEmail();
      }
      toast.success(`${labelize(editor.type)} saved`);
      setEditor(null);
      await loadOverview();
    } catch (err: any) {
      toast.error(err.message || 'Save failed');
    } finally {
      setMutating(false);
    }
  };

  if (initialPageLoading) return <PremiumLoader />;

  return (
    <div className="min-h-full bg-slate-50">
      <div className="mx-auto max-w-[1560px] space-y-5 px-3 py-4 sm:px-5 lg:px-6">
        <header className="rounded-md border border-slate-200 bg-white px-4 py-4 shadow-sm">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#c27803]">JsgSmile Governance</p>
              <h1 className="mt-1 text-2xl font-black text-[#12335f] sm:text-3xl">Master Admin Control Center</h1>
              <p className="mt-2 max-w-4xl text-sm font-medium leading-6 text-slate-600">
                Complete portal governance, organization control, user management, feature settings, procurement monitoring, payment oversight, and security review.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {quickActions.map(([label, tab, Icon]) => (
                <Button
                  key={label}
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setActiveTab(tab);
                    if (label === 'Add Company') setEditor({ type: 'company', mode: 'create' });
                    if (label === 'Add Organization') setEditor({ type: 'organization', mode: 'create' });
                    if (label === 'Add User') setEditor({ type: 'user', mode: 'create' });
                    if (label === 'Configure Email') setEditor({ type: 'email', mode: 'edit', record: emailSettings?.smtp || {} });
                  }}
                  className="h-9 rounded-md text-xs font-black"
                >
                  <Icon className="mr-2 h-4 w-4" />
                  {label}
                </Button>
              ))}
              <Button type="button" onClick={refreshActive} className="h-9 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]">
                <RefreshCw className="mr-2 h-4 w-4" />
                Refresh
              </Button>
            </div>
          </div>
        </header>

        <div className="flex gap-2 overflow-x-auto rounded-md border border-slate-200 bg-white p-2 shadow-sm">
          {tabs.map(tab => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                'inline-flex h-10 shrink-0 items-center gap-2 rounded-md px-3 text-xs font-black transition',
                activeTab === tab.id ? 'bg-[#12335f] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100 hover:text-[#12335f]'
              )}
            >
              <tab.icon className="h-4 w-4" />
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'overview' && (
          <section className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {summaryCards.map(([label, value, subtext, Icon, tone]: any) => (
                <KpiCard key={label} label={label} value={value ?? 0} subtext={subtext} icon={Icon} tone={tone} />
              ))}
            </div>
            <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
              <Panel title="Recent Audit Trail" icon={FileClock} error={error.overview}>
                <SimpleList rows={overview?.recentAuditLogs || []} primary="action" secondary="entityType" meta="createdAt" />
              </Panel>
              <Panel title="Production Guardrails" icon={ShieldCheck}>
                <div className="grid gap-2">
                  {[
                    'Master-only backend routes enforced',
                    'Secrets are masked and sourced from environment',
                    'Production CORS requires explicit origins',
                    'Delete actions prefer suspend/archive with reason',
                    'Payments, settlements, audit logs are not hard-deleted'
                  ].map(item => <StatusLine key={item} label={item} ok />)}
                </div>
              </Panel>
            </div>
          </section>
        )}

        {activeTab === 'organizations' && (
          <section className="space-y-4">
            <Toolbar
              tab="organizations"
              filters={filters.organizations}
              updateFilter={updateFilter}
              resetFilters={resetFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              selects={[
                ['status', 'All statuses', ['VERIFIED', 'PENDING', 'UNDER_REVIEW', 'REJECTED', 'SUSPENDED']],
                ['organizationType', 'All organization types', ['Buyer', 'Seller', 'MSME', 'Large Industry', 'Government', 'Private', 'PSU', 'Service Provider']]
              ]}
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" className="h-9 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]" onClick={() => setEditor({ type: 'company', mode: 'create' })}>
                <Plus className="mr-2 h-4 w-4" />
                Add Company
              </Button>
              <Button type="button" variant="outline" className="h-9 rounded-md text-xs font-black" onClick={() => setEditor({ type: 'organization', mode: 'create' })}>
                <Plus className="mr-2 h-4 w-4" />
                Add Organization
              </Button>
            </div>
            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
              <PaginatedTable
                title="Companies"
                icon={Building2}
                rows={companies.items}
                total={companies.total}
                page={pages.companies.page}
                pageSize={pages.companies.pageSize}
                loading={loading.companies}
                error={error.companies}
                columns={[
                  ['name', 'Company'],
                  ['portalDisplayName', 'Portal'],
                  ['district', 'District'],
                  ['state', 'State'],
                  ['isActive', 'Active']
                ]}
                sort={sorts.companies}
                onSort={field => onSort('companies', field)}
                onPageChange={page => setPageState('companies', page)}
                onPageSizeChange={size => setPageSizeState('companies', size)}
                viewMode={viewMode}
                actions={row => (
                  <EntityActions
                    label={row.name || 'company'}
                    active={Boolean(row.isActive)}
                    onEdit={() => setEditor({ type: 'company', mode: 'edit', record: row })}
                    onActivate={() => openAction({ entity: 'company', action: row.isActive ? 'inactivate' : 'activate', id: row.id, label: row.name || 'company' })}
                    onSuspend={() => openAction({ entity: 'company', action: 'suspend', id: row.id, label: row.name || 'company' })}
                    onArchive={() => openAction({ entity: 'company', action: 'archive', id: row.id, label: row.name || 'company', danger: true })}
                    onDelete={() => openAction({ entity: 'company', action: 'delete', id: row.id, label: row.name || 'company', danger: true })}
                  />
                )}
              />
              <PaginatedTable
                title="Organizations"
                icon={Building2}
                rows={organizations.items}
                total={organizations.total}
                page={pages.organizations.page}
                pageSize={pages.organizations.pageSize}
                loading={loading.organizations}
                error={error.organizations}
                columns={[
                  ['organizationName', 'Organization'],
                  ['organizationType', 'Type'],
                  ['verificationStatus', 'Verification'],
                  ['state', 'State'],
                  ['updatedAt', 'Updated']
                ]}
                sort={sorts.organizations}
                onSort={field => onSort('organizations', field)}
                onPageChange={page => setPageState('organizations', page)}
                onPageSizeChange={size => setPageSizeState('organizations', size)}
                viewMode={viewMode}
                actions={row => (
                  <EntityActions
                    label={row.organizationName || 'organization'}
                    active={row.verificationStatus === 'VERIFIED' && !row.isBlacklisted}
                    onEdit={() => setEditor({ type: 'organization', mode: 'edit', record: row })}
                    onActivate={() => openAction({ entity: 'organization', action: row.verificationStatus === 'VERIFIED' && !row.isBlacklisted ? 'inactivate' : 'reactivate', id: row.id, label: row.organizationName || 'organization' })}
                    onSuspend={() => openAction({ entity: 'organization', action: 'suspend', id: row.id, label: row.organizationName || 'organization' })}
                    onArchive={() => openAction({ entity: 'organization', action: 'archive', id: row.id, label: row.organizationName || 'organization', danger: true })}
                    onDelete={() => openAction({ entity: 'organization', action: 'delete', id: row.id, label: row.organizationName || 'organization', danger: true })}
                  />
                )}
              />
            </div>
          </section>
        )}

        {activeTab === 'users' && (
          <section className="space-y-4">
            <Toolbar
              tab="users"
              filters={filters.users}
              updateFilter={updateFilter}
              resetFilters={resetFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              selects={[
                ['role', 'All roles', ['master_admin', 'admin', 'buyer', 'seller']],
                ['status', 'All account statuses', ['ACTIVE', 'SUSPENDED', 'DEACTIVATED', 'PENDING']]
              ]}
            />
            <PaginatedTable
              title="Portal Users"
              icon={Users}
              rows={users.items}
              total={users.total}
              page={pages.users.page}
              pageSize={pages.users.pageSize}
              loading={loading.users}
              error={error.users}
              columns={[
                ['name', 'Name'],
                ['email', 'Email'],
                ['role', 'Role'],
                ['accountStatus', 'Account'],
                ['onboardingStatus', 'Verification'],
                ['createdAt', 'Created']
              ]}
              sort={sorts.users}
              onSort={field => onSort('users', field)}
              onPageChange={page => setPageState('users', page)}
              onPageSizeChange={size => setPageSizeState('users', size)}
              viewMode={viewMode}
              actions={row => (
                <UserActions
                  label={row.email || 'user'}
                  active={row.accountStatus === 'ACTIVE'}
                  onEdit={() => setEditor({ type: 'user', mode: 'edit', record: row })}
                  onActivate={() => openAction({ entity: 'user', action: row.accountStatus === 'ACTIVE' ? 'inactivate' : 'reactivate', id: row.id, label: row.email || 'user' })}
                  onSuspend={() => openAction({ entity: 'user', action: 'suspend', id: row.id, label: row.email || 'user' })}
                  onArchive={() => openAction({ entity: 'user', action: 'archive', id: row.id, label: row.email || 'user', danger: true })}
                  onDelete={() => openAction({ entity: 'user', action: 'delete', id: row.id, label: row.email || 'user', danger: true })}
                  onInvite={() => openAction({ entity: 'user', action: 'invite', id: row.id, label: row.email || 'user' })}
                  onResetPassword={() => openAction({ entity: 'user', action: 'resetPassword', id: row.id, label: row.email || 'user', danger: true })}
                />
              )}
            />
          </section>
        )}

        {activeTab === 'procurement' && (
          <section className="space-y-4">
            <MetricStrip summary={procurement.summary} labels={[
              ['totalBids', 'All bids'],
              ['pendingApprovals', 'Pending approvals'],
              ['activeBids', 'Active bids'],
              ['technicalEvaluation', 'Technical eval'],
              ['financialEvaluation', 'Financial eval'],
              ['awardRecommended', 'Award recommended'],
              ['participations', 'Participations']
            ]} />
            <Toolbar
              tab="procurement"
              filters={filters.procurement}
              updateFilter={updateFilter}
              resetFilters={resetFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              selects={[['status', 'All statuses', ['OPEN', 'PENDING_ADMIN_APPROVAL', 'TECHNICAL_EVALUATION', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'AWARD_RECOMMENDED', 'AWARDED', 'CANCELLED', 'EXPIRED']]]}
            />
            <PaginatedTable
              title="Procurement Bids"
              icon={BarChart3}
              rows={procurement.items}
              total={procurement.total}
              page={pages.procurement.page}
              pageSize={pages.procurement.pageSize}
              loading={loading.procurement}
              error={error.procurement}
              columns={[
                ['bidNumber', 'Bid No.'],
                ['title', 'Title'],
                ['buyerOrganizationName', 'Buyer'],
                ['status', 'Status'],
                ['approvalStatus', 'Approval'],
                ['endDate', 'End Date']
              ]}
              sort={sorts.procurement}
              onSort={field => onSort('procurement', field)}
              onPageChange={page => setPageState('procurement', page)}
              onPageSizeChange={size => setPageSizeState('procurement', size)}
              viewMode={viewMode}
              actions={row => (
                <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black" onClick={() => toast.info(`Open /bids/${row.id} to inspect this bid.`)}>
                  <Eye className="mr-1 h-3 w-3" />
                  View
                </Button>
              )}
            />
            <SafetyNotice />
          </section>
        )}

        {activeTab === 'payments' && (
          <section className="space-y-4">
            <MetricStrip summary={payments.summary} labels={[
              ['totalPayments', 'Payments'],
              ['failedPayments', 'Failed'],
              ['pendingSettlements', 'Pending settlements'],
              ['completedSettlements', 'Completed settlements'],
              ['pendingWebhooks', 'Pending webhooks']
            ]} />
            <Toolbar
              tab="payments"
              filters={filters.payments}
              updateFilter={updateFilter}
              resetFilters={resetFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              selects={[['status', 'All statuses', ['initiated', 'success', 'failed', 'refunded', 'cancelled']]]}
            />
            <PaginatedTable
              title="Payment Transactions"
              icon={CreditCard}
              rows={payments.items}
              total={payments.total}
              page={pages.payments.page}
              pageSize={pages.payments.pageSize}
              loading={loading.payments}
              error={error.payments}
              columns={[
                ['referenceId', 'Reference'],
                ['gateway', 'Gateway'],
                ['status', 'Status'],
                ['amount', 'Amount'],
                ['currency', 'Currency'],
                ['createdAt', 'Created']
              ]}
              sort={sorts.payments}
              onSort={field => onSort('payments', field)}
              onPageChange={page => setPageState('payments', page)}
              onPageSizeChange={size => setPageSizeState('payments', size)}
              viewMode={viewMode}
              actions={row => <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black" onClick={() => toast.info(`Payment ${row.referenceId || row.id} is read-only here.`)}>View</Button>}
            />
            <SafetyNotice text="Payments, settlements, invoices, ledgers, and audit logs are immutable operational records. Do not hard-delete financial history." />
          </section>
        )}

        {activeTab === 'features' && (
          <section className="space-y-4">
            <div className="flex flex-col gap-3 rounded-md border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <CompanySelect companies={companies.items} value={selectedCompanyId} onChange={setSelectedCompanyId} />
              <div className="grid gap-2 sm:grid-cols-2">
                <SearchInput value={filters.features.search} onChange={value => updateFilter('features', 'search', value)} placeholder="Search features..." />
                <SearchInput value={filters.features.module} onChange={value => updateFilter('features', 'module', value)} placeholder="Filter module..." icon={Filter} />
              </div>
            </div>
            <Panel title="Feature Control" icon={ToggleRight} loading={loading.features} error={error.features}>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {visibleFeatures.map(feature => (
                  <button
                    key={feature.id}
                    type="button"
                    onClick={() => openAction({
                      entity: 'feature',
                      action: feature.enabled ? 'disable' : 'enable',
                      featureKey: feature.code,
                      label: feature.name,
                      danger: feature.enabled
                    })}
                    className="min-h-24 rounded-md border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-[#12335f]/30 hover:bg-white"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="text-sm font-black text-slate-900">{feature.name}</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">{feature.module}</p>
                      </div>
                      {feature.enabled ? <ToggleRight className="h-6 w-6 text-emerald-600" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                    </div>
                    <p className="mt-3 line-clamp-2 text-xs text-slate-500">{feature.description || 'Feature availability can be governed per company.'}</p>
                  </button>
                ))}
              </div>
            </Panel>
          </section>
        )}

        {activeTab === 'email' && (
          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <Panel title="SMTP Configuration" icon={Mail} loading={loading.email} error={error.email}>
              <div className="grid gap-3">
                <Detail label="SMTP Host" value={emailSettings?.smtp?.host} />
                <Detail label="SMTP Port" value={emailSettings?.smtp?.port} />
                <Detail label="SMTP Username" value={emailSettings?.smtp?.user || 'Not configured'} />
                <Detail label="From Email" value={emailSettings?.smtp?.fromEmail || 'Not configured'} />
                <Detail label="From Name" value={emailSettings?.smtp?.fromName} />
                <StatusLine label="SMTP password configured" ok={Boolean(emailSettings?.smtp?.passwordConfigured)} />
                <div className="flex flex-wrap gap-2">
                  <Button type="button" className="h-9 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]" onClick={() => setEditor({ type: 'email', mode: 'edit', record: emailSettings?.smtp || {} })}>
                    <Mail className="mr-2 h-4 w-4" />
                    Save Email Setup
                  </Button>
                  <Button type="button" variant="outline" className="h-9 rounded-md text-xs font-black" onClick={() => openAction({ entity: 'email', action: 'test', label: 'SMTP test' })}>
                  <Mail className="mr-2 h-4 w-4" />
                  Send Test Email
                  </Button>
                </div>
              </div>
            </Panel>
            <Panel title="Notification Templates" icon={Bell}>
              <div className="grid gap-2">
                {(emailSettings?.notifications?.templates || []).map((template: string) => (
                  <StatusLine key={template} label={template} ok={Boolean(emailSettings?.notifications?.emailEnabled)} />
                ))}
              </div>
            </Panel>
          </section>
        )}

        {activeTab === 'audit' && (
          <section className="space-y-4">
            <Toolbar
              tab="audit"
              filters={filters.audit}
              updateFilter={updateFilter}
              resetFilters={resetFilters}
              viewMode={viewMode}
              setViewMode={setViewMode}
              selects={[
                ['action', 'Any action', ['company', 'role', 'payment', 'file', 'bid', 'login']],
                ['entityType', 'Any entity', ['user', 'organization', 'company', 'payment', 'procurement', 'file']]
              ]}
            />
            <PaginatedTable
              title="Audit Logs"
              icon={FileClock}
              rows={auditLogs.items}
              total={auditLogs.total}
              page={pages.audit.page}
              pageSize={pages.audit.pageSize}
              loading={loading.audit}
              error={error.audit}
              columns={[
                ['action', 'Action'],
                ['entityType', 'Entity'],
                ['entityId', 'Entity ID'],
                ['createdAt', 'Created']
              ]}
              sort={sorts.audit}
              onSort={field => onSort('audit', field)}
              onPageChange={page => setPageState('audit', page)}
              onPageSizeChange={size => setPageSizeState('audit', size)}
              viewMode={viewMode}
            />
          </section>
        )}

        {activeTab === 'security' && (
          <section className="grid gap-4 xl:grid-cols-[1fr_1fr]">
            <MetricStrip summary={security?.summary} labels={[
              ['failedLogins', 'Failed logins'],
              ['suspiciousActions', 'Suspicious actions'],
              ['openFraudAlerts', 'Open fraud alerts'],
              ['roleChanges', 'Role changes'],
              ['fileAccessEvents', 'File access events'],
              ['paymentActions', 'Payment actions']
            ]} />
            <Panel title="Security Controls" icon={ShieldCheck} loading={loading.security} error={error.security}>
              <div className="grid gap-2">
                {Object.entries(security?.controls || {}).map(([key, value]) => (
                  <StatusLine key={key} label={String(value)} ok />
                ))}
              </div>
            </Panel>
            <Panel title="Dangerous Action Policy" icon={AlertTriangle}>
              <SafetyNotice text="Permanent deletion must require exact confirmation text, a reason, backend permission checks, and audit logging. Archive or suspend is the default." />
            </Panel>
          </section>
        )}
        {actionDialog && (
          <ActionDialog
            dialog={actionDialog}
            busy={mutating}
            onCancel={() => setActionDialog(null)}
            onConfirm={runAction}
          />
        )}
        {editor && (
          <EntityEditor
            editor={editor}
            companies={companies.items}
            organizations={organizations.items}
            busy={mutating}
            onCancel={() => setEditor(null)}
            onSave={saveEditor}
          />
        )}
      </div>
    </div>
  );
}

function Toolbar({
  tab,
  filters,
  updateFilter,
  resetFilters,
  viewMode,
  setViewMode,
  selects
}: {
  tab: TabId;
  filters: Record<string, string>;
  updateFilter: (tab: TabId, key: string, value: string) => void;
  resetFilters: (tab: TabId) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  selects?: Array<[string, string, string[]]>;
}) {
  const activeFilters = Object.entries(filters).filter(([, value]) => value);
  return (
    <div className="sticky top-0 z-10 rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="grid flex-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
          <SearchInput value={filters.search || ''} onChange={value => updateFilter(tab, 'search', value)} placeholder="Search..." />
          {selects?.map(([key, label, options]) => (
            <select key={key} value={filters[key] || ''} onChange={event => updateFilter(tab, key, event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-600 outline-none focus:border-[#12335f]">
              <option value="">{label}</option>
              {options.map(option => <option key={option} value={option}>{labelize(option)}</option>)}
            </select>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={() => resetFilters(tab)} className="h-10 rounded-md text-xs font-black">
            <RotateCcw className="mr-2 h-4 w-4" />
            Reset
          </Button>
          <ViewToggle viewMode={viewMode} onChange={setViewMode} />
        </div>
      </div>
      {activeFilters.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {activeFilters.map(([key, value]) => (
            <span key={key} className="rounded-full bg-[#12335f]/10 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-[#12335f]">
              {labelize(key)}: {labelize(value)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function SearchInput({ value, onChange, placeholder, icon: Icon = Search }: { value: string; onChange: (value: string) => void; placeholder: string; icon?: any }) {
  return (
    <div className="relative">
      <Icon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input value={value} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold outline-none focus:border-[#12335f]" />
    </div>
  );
}

function ViewToggle({ viewMode, onChange }: { viewMode: ViewMode; onChange: (mode: ViewMode) => void }) {
  return (
    <div className="inline-flex h-10 overflow-hidden rounded-md border border-slate-200 bg-white">
      <button type="button" onClick={() => onChange('list')} className={cn('px-3', viewMode === 'list' ? 'bg-[#12335f] text-white' : 'text-slate-500')}>
        <List className="h-4 w-4" />
      </button>
      <button type="button" onClick={() => onChange('grid')} className={cn('px-3', viewMode === 'grid' ? 'bg-[#12335f] text-white' : 'text-slate-500')}>
        <Grid2X2 className="h-4 w-4" />
      </button>
    </div>
  );
}

function PaginatedTable<T extends Record<string, any>>({
  title,
  icon: Icon,
  rows,
  columns,
  total,
  page,
  pageSize,
  loading,
  error,
  sort,
  onSort,
  onPageChange,
  onPageSizeChange,
  viewMode,
  actions
}: {
  title: string;
  icon: any;
  rows: T[];
  columns: Array<[string, string]>;
  total: number;
  page: number;
  pageSize: number;
  loading?: boolean;
  error?: string | null;
  sort: { field: string; direction: SortDirection };
  onSort: (field: string) => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  viewMode: ViewMode;
  actions?: (row: T) => React.ReactNode;
}) {
  if (viewMode === 'grid') {
    return (
      <Panel title={title} icon={Icon} loading={loading} error={error}>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map(row => (
            <article key={row.id || JSON.stringify(row)} className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <div className="space-y-2">
                {columns.slice(0, 5).map(([field, label]) => (
                  <Detail key={field} label={label} value={formatCell(valueAt(row, field))} />
                ))}
              </div>
              {actions && <div className="mt-3 flex flex-wrap gap-2">{actions(row)}</div>}
            </article>
          ))}
          {rows.length === 0 && <EmptyState />}
        </div>
        <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} pageSizeOptions={pageSizeOptions} />
      </Panel>
    );
  }

  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#12335f]" />
          <h2 className="text-sm font-black text-slate-900">{title}</h2>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-[#12335f]" />}
      </div>
      {error ? <ErrorState message={error} /> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-left text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="w-16 px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-500">S.No.</th>
                {columns.map(([field, label]) => (
                  <th key={field} className="px-4 py-3">
                    <SortableHeader label={label} field={field} activeField={sort.field} direction={sort.direction} onSort={onSort} />
                  </th>
                ))}
                {actions && <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((row, index) => (
                <tr key={row.id || index} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-xs font-black text-slate-400">{(page - 1) * pageSize + index + 1}</td>
                  {columns.map(([field]) => (
                    <td key={field} className="max-w-72 truncate px-4 py-3 text-slate-700">{formatCell(valueAt(row, field))}</td>
                  ))}
                  {actions && <td className="px-4 py-3"><div className="flex justify-end gap-2">{actions(row)}</div></td>}
                </tr>
              ))}
              {!loading && rows.length === 0 && <tr><td colSpan={columns.length + (actions ? 2 : 1)}><EmptyState /></td></tr>}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange} pageSizeOptions={pageSizeOptions} />
    </section>
  );
}

function Panel({ title, icon: Icon, children, loading, error }: { title: string; icon: any; children: React.ReactNode; loading?: boolean; error?: string | null }) {
  return (
    <section className="rounded-md border border-slate-200 bg-white p-4 shadow-sm">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-[#12335f]" />
          <h2 className="text-sm font-black text-slate-900">{title}</h2>
        </div>
        {loading && <Loader2 className="h-4 w-4 animate-spin text-[#12335f]" />}
      </div>
      {error ? <ErrorState message={error} /> : children}
    </section>
  );
}

const KpiCard = memo(function KpiCard({ label, value, subtext, icon: Icon, tone }: { label: string; value: number; subtext: string; icon: any; tone: string }) {
  const tones: Record<string, string> = {
    blue: 'bg-sky-50 text-[#12335f]',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    red: 'bg-red-50 text-red-700'
  };
  return (
    <Card className="rounded-md border-slate-200 bg-white shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
          </div>
          <div className={cn('rounded-md p-2', tones[tone] || tones.blue)}><Icon className="h-5 w-5" /></div>
        </div>
        <p className="mt-3 text-xs font-semibold text-slate-500">{subtext}</p>
      </CardContent>
    </Card>
  );
});

const MetricStrip = memo(function MetricStrip({ summary, labels }: { summary?: Record<string, number>; labels: Array<[string, string]> }) {
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {labels.map(([key, label]) => (
        <div key={key} className="rounded-md border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
          <p className="mt-1 text-xl font-black text-[#12335f]">{summary?.[key] ?? 0}</p>
        </div>
      ))}
    </div>
  );
});

const EntityActions = memo(function EntityActions({
  label,
  active,
  onEdit,
  onActivate,
  onSuspend,
  onArchive,
  onDelete
}: {
  label: string;
  active: boolean;
  onEdit: () => void;
  onActivate: () => void;
  onSuspend: () => void;
  onArchive: () => void;
  onDelete: () => void;
}) {
  return (
    <>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black" onClick={onEdit}>
        <Eye className="mr-1 h-3 w-3" />
        Edit
      </Button>
      <Button type="button" variant="outline" className={cn('h-8 rounded-md px-2 text-[10px] font-black', active ? 'text-amber-700' : 'text-emerald-700')} onClick={onActivate}>
        <Power className="mr-1 h-3 w-3" />
        {active ? 'Inactive' : 'Active'}
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-amber-700" onClick={onSuspend}>
        <Archive className="mr-1 h-3 w-3" />
        Suspend
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-slate-700" onClick={onArchive}>
        <Archive className="mr-1 h-3 w-3" />
        Archive
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-red-700" onClick={onDelete} title={`Delete ${label}`}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </>
  );
});

const UserActions = memo(function UserActions(props: Parameters<typeof EntityActions>[0] & { onInvite: () => void; onResetPassword: () => void }) {
  return (
    <>
      <EntityActions {...props} />
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-[#12335f]" onClick={props.onInvite}>
        <UserPlus className="mr-1 h-3 w-3" />
        Invite
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-[#12335f]" onClick={props.onResetPassword}>
        <KeyRound className="mr-1 h-3 w-3" />
        Reset
      </Button>
    </>
  );
});

function ActionDialog({
  dialog,
  busy,
  onCancel,
  onConfirm
}: {
  dialog: NonNullable<ActionDialogState>;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (reason: string, confirmation?: string) => void;
}) {
  const [reason, setReason] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const isDelete = dialog.action === 'delete';
  const isEmailTest = dialog.entity === 'email' && dialog.action === 'test';
  const canSubmit = isEmailTest ? /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(reason) : reason.trim().length >= 4 && (!isDelete || confirmation === 'DELETE');
  return (
    <ModalShell title={`${labelize(dialog.action)} ${dialog.label}`} onCancel={onCancel}>
      <SafetyNotice text={isDelete ? 'This action may affect historical records. Archive or suspend is recommended. Permanent deletion should be used only when legally approved.' : 'This sensitive action will be recorded in the audit log.'} />
      <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
        {isEmailTest ? 'Test recipient email' : 'Reason'}
        <textarea
          value={reason}
          onChange={event => setReason(event.target.value)}
          rows={isEmailTest ? 1 : 4}
          className="min-h-10 rounded-md border border-slate-200 p-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-[#12335f]"
          placeholder={isEmailTest ? 'admin@example.com' : 'Required audit reason'}
        />
      </label>
      {isDelete && (
        <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
          Type DELETE
          <input value={confirmation} onChange={event => setConfirmation(event.target.value)} className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal outline-none focus:border-[#12335f]" />
        </label>
      )}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-10 rounded-md text-xs font-black" onClick={onCancel}>Cancel</Button>
        <Button type="button" disabled={!canSubmit || busy} className="h-10 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]" onClick={() => onConfirm(reason.trim(), confirmation)}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Confirm
        </Button>
      </div>
    </ModalShell>
  );
}

function EntityEditor({
  editor,
  companies,
  organizations,
  busy,
  onCancel,
  onSave
}: {
  editor: NonNullable<EditorState>;
  companies: Company[];
  organizations: Organization[];
  busy: boolean;
  onCancel: () => void;
  onSave: (values: Record<string, any>) => void;
}) {
  const record = editor.record || {};
  const [values, setValues] = useState<Record<string, any>>({
    companyName: record.name || '',
    shortName: record.shortName || '',
    portalDisplayName: record.portalDisplayName || '',
    logoUrl: record.logoUrl || '',
    contactEmail: record.contactEmail || '',
    contactPhone: record.contactPhone || '',
    address: record.address || '',
    homepageContent: record.homepageContent || '',
    aboutContent: record.aboutContent || '',
    footerContent: record.footerContent || '',
    grievanceContent: record.grievanceContent || '',
    procurementPolicy: record.procurementPolicy || '',
    isActive: record.isActive ?? true,
    organizationName: record.organizationName || '',
    organizationType: record.organizationType || 'MSME',
    gstin: record.gstin || '',
    panNumber: record.panNumber || record.pan || '',
    contactPersonName: record.contactPersonName || record.contactPerson || '',
    email: record.email || '',
    mobile: record.mobile || '',
    addressLine1: record.addressLine1 || record.address || '',
    state: record.state || '',
    district: record.district || '',
    pincode: record.pincode || '',
    verificationStatus: record.verificationStatus || 'PENDING',
    companyId: record.companyId || companies[0]?.id || '',
    name: record.name || '',
    role: record.role || 'buyer',
    accountStatus: record.accountStatus || 'ACTIVE',
    organizationId: record.organizationId || record.organization?.id || '',
    host: record.host || '',
    port: record.port || 587,
    secure: Boolean(record.secure),
    username: record.username || record.user || '',
    password: '',
    fromEmail: record.fromEmail || '',
    fromName: record.fromName || 'JsgSmile Portal',
    replyToEmail: record.replyToEmail || '',
    emailEnabled: record.emailEnabled ?? true,
    reason: ''
  });
  const set = (key: string, value: any) => setValues(prev => ({ ...prev, [key]: value }));
  const title = `${editor.mode === 'create' ? 'Add' : 'Edit'} ${labelize(editor.type)}`;
  return (
    <ModalShell title={title} onCancel={onCancel} wide>
      <div className="grid gap-3 md:grid-cols-2">
        {editor.type === 'company' && (
          <>
            <FormField label="Company name" value={values.companyName} onChange={value => set('companyName', value)} required />
            <FormField label="Short name" value={values.shortName} onChange={value => set('shortName', value)} />
            <FormField label="Portal display name" value={values.portalDisplayName} onChange={value => set('portalDisplayName', value)} required />
            <FormField label="Logo URL" value={values.logoUrl} onChange={value => set('logoUrl', value)} />
            <FormField label="Contact email" value={values.contactEmail} onChange={value => set('contactEmail', value)} />
            <FormField label="Contact phone" value={values.contactPhone} onChange={value => set('contactPhone', value)} />
            <FormField label="Address" value={values.address} onChange={value => set('address', value)} />
            <FormField label="District" value={values.district} onChange={value => set('district', value)} />
            <FormField label="State" value={values.state} onChange={value => set('state', value)} />
            <ToggleField label="Active company" value={Boolean(values.isActive)} onChange={value => set('isActive', value)} />
            <div className="md:col-span-2">
              <FormField label="Homepage content" value={values.homepageContent} onChange={value => set('homepageContent', value)} />
            </div>
            <div className="md:col-span-2">
              <FormField label="About content" value={values.aboutContent} onChange={value => set('aboutContent', value)} />
            </div>
            <div className="md:col-span-2">
              <FormField label="Footer content" value={values.footerContent} onChange={value => set('footerContent', value)} />
            </div>
            <div className="md:col-span-2">
              <FormField label="Grievance content" value={values.grievanceContent} onChange={value => set('grievanceContent', value)} />
            </div>
            <div className="md:col-span-2">
              <FormField label="Procurement policy" value={values.procurementPolicy} onChange={value => set('procurementPolicy', value)} />
            </div>
          </>
        )}
        {editor.type === 'organization' && (
          <>
            <FormField label="Organization name" value={values.organizationName} onChange={value => set('organizationName', value)} required />
            <SelectField label="Type" value={values.organizationType} onChange={value => set('organizationType', value)} options={['MSME', 'PRIVATE_LIMITED', 'PUBLIC_LIMITED', 'LLP', 'PARTNERSHIP', 'PROPRIETORSHIP', 'GOVERNMENT', 'PSU', 'STARTUP']} />
            <FormField label="GSTN" value={values.gstin} onChange={value => set('gstin', value)} />
            <FormField label="PAN" value={values.panNumber} onChange={value => set('panNumber', value)} />
            <FormField label="Email" value={values.email} onChange={value => set('email', value)} />
            <FormField label="Mobile" value={values.mobile} onChange={value => set('mobile', value)} />
            <FormField label="Address" value={values.addressLine1} onChange={value => set('addressLine1', value)} />
            <FormField label="State" value={values.state} onChange={value => set('state', value)} />
            <FormField label="District" value={values.district} onChange={value => set('district', value)} />
            <FormField label="Pincode" value={values.pincode} onChange={value => set('pincode', value)} />
            <SelectField label="Verification" value={values.verificationStatus} onChange={value => set('verificationStatus', value)} options={['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'SUSPENDED']} />
            <CompanySelectField companies={companies} value={values.companyId} onChange={value => set('companyId', value)} />
          </>
        )}
        {editor.type === 'user' && (
          <>
            <FormField label="Name" value={values.name} onChange={value => set('name', value)} required />
            <FormField label="Email" value={values.email} onChange={value => set('email', value)} required />
            <FormField label="Mobile" value={values.mobile} onChange={value => set('mobile', value)} />
            <SelectField label="Role" value={values.role} onChange={value => set('role', value)} options={['buyer', 'seller', 'admin', 'master_admin']} />
            <SelectField label="Status" value={values.accountStatus} onChange={value => set('accountStatus', value)} options={['PENDING', 'ACTIVE', 'BLOCKED', 'SUSPENDED', 'DELETED']} />
            <OrganizationSelectField organizations={organizations} value={values.organizationId} onChange={value => set('organizationId', value)} />
            {editor.mode === 'create' && <FormField label="Temporary password" value={values.password} onChange={value => set('password', value)} placeholder="Auto-generated if blank" />}
          </>
        )}
        {editor.type === 'email' && (
          <>
            <FormField label="SMTP host" value={values.host} onChange={value => set('host', value)} />
            <FormField label="SMTP port" value={values.port} onChange={value => set('port', value)} />
            <FormField label="Username" value={values.username} onChange={value => set('username', value)} />
            <FormField label="New password" value={values.password} onChange={value => set('password', value)} placeholder="Leave blank to keep existing" />
            <FormField label="From email" value={values.fromEmail} onChange={value => set('fromEmail', value)} />
            <FormField label="From name" value={values.fromName} onChange={value => set('fromName', value)} />
            <FormField label="Reply-to email" value={values.replyToEmail} onChange={value => set('replyToEmail', value)} />
            <ToggleField label="Email enabled" value={Boolean(values.emailEnabled)} onChange={value => set('emailEnabled', value)} />
          </>
        )}
      </div>
      <FormField label="Audit reason" value={values.reason} onChange={value => set('reason', value)} required />
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="h-10 rounded-md text-xs font-black" onClick={onCancel}>Cancel</Button>
        <Button type="button" disabled={busy || !String(values.reason || '').trim()} className="h-10 rounded-md bg-[#12335f] text-xs font-black text-white hover:bg-[#0d274b]" onClick={() => onSave(values)}>
          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
          Save
        </Button>
      </div>
    </ModalShell>
  );
}

function ModalShell({ title, children, onCancel, wide }: { title: string; children: React.ReactNode; onCancel: () => void; wide?: boolean }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-slate-950/45 p-0 sm:items-center sm:justify-center sm:p-4">
      <section className={cn('max-h-[92vh] w-full overflow-y-auto rounded-t-md bg-white p-4 shadow-xl sm:rounded-md', wide ? 'sm:max-w-3xl' : 'sm:max-w-lg')}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-base font-black text-slate-950">{title}</h2>
          <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-xs font-black" onClick={onCancel}>Close</Button>
        </div>
        <div className="space-y-4">{children}</div>
      </section>
    </div>
  );
}

function FormField({ label, value, onChange, placeholder, required }: { label: string; value: any; onChange: (value: string) => void; placeholder?: string; required?: boolean }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
      {label}{required ? ' *' : ''}
      <input value={value ?? ''} onChange={event => onChange(event.target.value)} placeholder={placeholder} className="h-10 rounded-md border border-slate-200 px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-[#12335f]" />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: any; onChange: (value: string) => void; options: string[] }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
      {label}
      <select value={value ?? ''} onChange={event => onChange(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-[#12335f]">
        {options.map(option => <option key={option} value={option}>{labelize(option)}</option>)}
      </select>
    </label>
  );
}

function CompanySelectField({ companies, value, onChange }: { companies: Company[]; value: any; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
      Company
      <select value={value ?? ''} onChange={event => onChange(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-[#12335f]">
        <option value="">No company</option>
        {companies.map(company => <option key={company.id} value={company.id}>{company.portalDisplayName || company.name}</option>)}
      </select>
    </label>
  );
}

function OrganizationSelectField({ organizations, value, onChange }: { organizations: Organization[]; value: any; onChange: (value: string) => void }) {
  return (
    <label className="grid gap-1 text-xs font-black uppercase tracking-wider text-slate-500">
      Organization
      <select value={value ?? ''} onChange={event => onChange(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold normal-case tracking-normal text-slate-800 outline-none focus:border-[#12335f]">
        <option value="">No organization</option>
        {organizations.map(org => <option key={org.id} value={org.id}>{org.organizationName}</option>)}
      </select>
    </label>
  );
}

function ToggleField({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex h-10 items-center justify-between rounded-md border border-slate-200 px-3 text-xs font-black uppercase tracking-wider text-slate-500">
      {label}
      <input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} className="h-4 w-4" />
    </label>
  );
}

function SafeActions({ onAction, label }: { onAction: (label: string) => void; label: string }) {
  return (
    <>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black" onClick={() => toast.info(`Open detail view for ${label}.`)}>
        <Eye className="mr-1 h-3 w-3" />
        View
      </Button>
      <Button type="button" variant="outline" className="h-8 rounded-md px-2 text-[10px] font-black text-amber-700" onClick={() => onAction(`Suspend/archive ${label}`)}>
        <Archive className="mr-1 h-3 w-3" />
        Archive
      </Button>
    </>
  );
}

function SafetyNotice({ text = 'This action may affect historical records. Use archive/suspend unless permanent deletion is legally approved.' }: { text?: string }) {
  return (
    <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-bold leading-5 text-amber-900">
      <AlertTriangle className="mr-2 inline h-4 w-4" />
      {text}
    </div>
  );
}

function CompanySelect({ companies, value, onChange }: { companies: Company[]; value: number | null; onChange: (id: number) => void }) {
  return (
    <select value={value || ''} onChange={event => onChange(Number(event.target.value))} className="h-10 min-w-64 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none focus:border-[#12335f]">
      {companies.map(company => <option key={company.id} value={company.id}>{company.portalDisplayName || company.name}</option>)}
    </select>
  );
}

const Detail = memo(function Detail({ label, value }: { label: string; value: unknown }) {
  return (
    <div>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-sm font-bold text-slate-800">{formatCell(value)}</p>
    </div>
  );
});

const StatusLine = memo(function StatusLine({ label, ok }: { label: string; ok: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
      <span className="text-xs font-bold text-slate-700">{label}</span>
      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-black uppercase tracking-wider', ok ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
        <CheckCircle2 className="h-3 w-3" />
        {ok ? 'Ready' : 'Review'}
      </span>
    </div>
  );
});

function SimpleList({ rows, primary, secondary, meta }: { rows: any[]; primary: string; secondary: string; meta: string }) {
  if (!rows.length) return <EmptyState />;
  return (
    <div className="divide-y divide-slate-100">
      {rows.map((row, index) => (
        <div key={row.id || index} className="flex items-center justify-between gap-3 py-3">
          <div>
            <p className="text-sm font-black text-slate-900">{formatCell(row[primary])}</p>
            <p className="text-xs font-semibold text-slate-500">{formatCell(row[secondary])}</p>
          </div>
          <p className="shrink-0 text-xs font-bold text-slate-400">{formatCell(row[meta])}</p>
        </div>
      ))}
    </div>
  );
}

function EmptyState() {
  return <div className="px-4 py-8 text-center text-sm font-bold text-slate-500">No records found for the current filters.</div>;
}

function ErrorState({ message }: { message: string }) {
  return <div className="rounded-md border border-red-100 bg-red-50 px-4 py-3 text-sm font-bold text-red-700">{message}</div>;
}

const endpoint = (path: string, params: Record<string, string | number | undefined>) => {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== '') query.set(key, String(value));
  }
  const value = query.toString();
  return value ? `${path}?${value}` : path;
};

const valueAt = (row: any, path: string) => path.split('.').reduce((value, key) => value?.[key], row);

const formatCell = (value: unknown) => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) return value.slice(0, 10);
  if (typeof value === 'number') return Number.isFinite(value) ? value.toLocaleString('en-IN') : '-';
  if (value == null || value === '') return '-';
  if (typeof value === 'object') {
    const anyValue = value as any;
    return anyValue.organizationName || anyValue.name || anyValue.email || JSON.stringify(value);
  }
  return String(value).replace(/_/g, ' ');
};

const labelize = (value: string) => value.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/\b\w/g, char => char.toUpperCase());
