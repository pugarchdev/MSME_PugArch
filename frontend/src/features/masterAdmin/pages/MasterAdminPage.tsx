import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import {
  BarChart3,
  Building2,
  FileClock,
  Globe2,
  LayoutDashboard,
  Palette,
  Save,
  Search,
  ShieldCheck,
  ToggleLeft,
  ToggleRight,
  Users
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { Loader2 } from '../../../components/ui/loader';
import { api } from '../../../lib/api';
import { cn } from '../../../lib/utils';

type Company = {
  id: number;
  name: string;
  shortName?: string | null;
  portalDisplayName: string;
  logoUrl?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  address?: string | null;
  district?: string | null;
  state?: string | null;
  homepageContent?: string | null;
  aboutContent?: string | null;
  footerContent?: string | null;
  grievanceContent?: string | null;
  procurementPolicy?: string | null;
  isActive: boolean;
};

type Feature = {
  id: number;
  code: string;
  name: string;
  module: string;
  enabled?: boolean;
};

type RoleRecord = {
  id: number;
  code: string;
  name: string;
  scope: string;
  company?: { id: number; name: string } | null;
  permissions?: Array<{ permission: { id: number; code: string; module: string } }>;
};

type Permission = {
  id: number;
  code: string;
  module: string;
  description?: string | null;
};

const tabs = [
  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'companies', label: 'Companies', icon: Building2 },
  { id: 'features', label: 'Features', icon: ToggleRight },
  { id: 'roles', label: 'Roles', icon: ShieldCheck },
  { id: 'users', label: 'Users', icon: Users },
  { id: 'content', label: 'Branding', icon: Palette },
  { id: 'audit', label: 'Audit', icon: FileClock }
] as const;

const emptyCompany = {
  name: '',
  shortName: '',
  portalDisplayName: '',
  district: '',
  state: '',
  contactEmail: '',
  contactPhone: '',
  address: ''
};

export default function MasterAdminPage() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]['id']>('dashboard');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dashboard, setDashboard] = useState<any>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [selectedCompanyId, setSelectedCompanyId] = useState<number | null>(null);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [roles, setRoles] = useState<RoleRecord[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [organizations, setOrganizations] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [companyForm, setCompanyForm] = useState(emptyCompany);
  const [query, setQuery] = useState('');

  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  const authHeaders = useMemo(() => ({ Authorization: `Bearer ${token}` }), [token]);
  const selectedCompany = companies.find(company => company.id === selectedCompanyId) || companies[0];

  const fetchJson = async (path: string) => {
    const res = await api.fetch(path, { headers: authHeaders, skipCache: true });
    if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || 'Request failed');
    return res.json();
  };

  const loadAll = async () => {
    setLoading(true);
    try {
      const [dash, companyData, roleData, permissionData, userData, orgData, auditData] = await Promise.all([
        fetchJson('/api/master-admin/dashboard'),
        fetchJson('/api/master-admin/companies?pageSize=100'),
        fetchJson('/api/master-admin/roles'),
        fetchJson('/api/master-admin/permissions'),
        fetchJson('/api/master-admin/users?pageSize=10'),
        fetchJson('/api/master-admin/organizations?pageSize=10'),
        fetchJson('/api/master-admin/audit-logs?pageSize=10')
      ]);
      setDashboard(dash);
      setCompanies(companyData.items || []);
      setSelectedCompanyId((companyData.items || [])[0]?.id || null);
      setRoles(roleData.items || []);
      setPermissions(permissionData.items || []);
      setUsers(userData.items || []);
      setOrganizations(orgData.items || []);
      setAuditLogs(auditData.items || []);
    } catch (error: any) {
      toast.error(error.message || 'Unable to load master admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
  }, []);

  useEffect(() => {
    if (!selectedCompanyId) return;
    fetchJson(`/api/master-admin/companies/${selectedCompanyId}/features`)
      .then(data => setFeatures(data.items || []))
      .catch(error => toast.error(error.message || 'Unable to load feature toggles'));
  }, [selectedCompanyId]);

  const createCompany = async () => {
    setSaving(true);
    try {
      const res = await api.fetch('/api/master-admin/companies', {
        method: 'POST',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(companyForm)
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || 'Unable to create company');
      toast.success('Company created');
      setCompanyForm(emptyCompany);
      await loadAll();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const saveFeatures = async () => {
    if (!selectedCompanyId) return;
    setSaving(true);
    try {
      const res = await api.fetch(`/api/master-admin/companies/${selectedCompanyId}/features`, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify({ features: features.map(feature => ({ featureId: feature.id, enabled: Boolean(feature.enabled) })) })
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || 'Unable to save features');
      toast.success('Feature settings saved');
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const saveContent = async () => {
    if (!selectedCompany) return;
    setSaving(true);
    try {
      const res = await api.fetch(`/api/master-admin/companies/${selectedCompany.id}/content`, {
        method: 'PUT',
        headers: { ...authHeaders, 'Content-Type': 'application/json' },
        body: JSON.stringify(selectedCompany)
      });
      if (!res.ok) throw new Error((await res.json().catch(() => null))?.message || 'Unable to save content');
      toast.success('Branding and content saved');
      await loadAll();
    } catch (error: any) {
      toast.error(error.message);
    } finally {
      setSaving(false);
    }
  };

  const filteredCompanies = companies.filter(company =>
    [company.name, company.portalDisplayName, company.district, company.state].join(' ').toLowerCase().includes(query.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex min-h-[420px] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-brand-navy" />
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50 px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <div className="flex flex-col gap-4 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.18em] text-[#8a6a2f]">Master Admin</p>
            <h1 className="mt-1 text-2xl font-bold text-slate-950">Portal Control Center</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            {tabs.map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  'inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs font-bold transition',
                  activeTab === tab.id
                    ? 'border-[#12335f] bg-[#12335f] text-white'
                    : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                )}
              >
                <tab.icon className="h-4 w-4" />
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'dashboard' && (
          <div className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
              {[
                ['Companies', dashboard?.summary?.totalCompanies, Building2],
                ['Buyers', dashboard?.summary?.totalBuyers, Users],
                ['Sellers', dashboard?.summary?.totalSellers, Globe2],
                ['Users', dashboard?.summary?.totalUsers, Users],
                ['Active Features', dashboard?.summary?.activeFeatures, ToggleRight],
                ['Pending', dashboard?.summary?.pendingApprovals, BarChart3]
              ].map(([label, value, Icon]: any) => (
                <Card key={label} className="rounded-md border-slate-200">
                  <CardContent className="flex items-center justify-between p-4">
                    <div>
                      <p className="text-xs font-bold text-slate-500">{label}</p>
                      <p className="mt-1 text-2xl font-black text-slate-950">{value ?? 0}</p>
                    </div>
                    <Icon className="h-5 w-5 text-[#8a6a2f]" />
                  </CardContent>
                </Card>
              ))}
            </div>
            <DataTable title="Recent Audit Logs" rows={dashboard?.recentAuditLogs || []} columns={['action', 'entityType', 'createdAt']} />
          </div>
        )}

        {activeTab === 'companies' && (
          <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
            <section className="space-y-3">
              <SearchBox value={query} onChange={setQuery} />
              <DataTable title="Companies / Districts" rows={filteredCompanies} columns={['name', 'portalDisplayName', 'district', 'state', 'isActive']} />
            </section>
            <section className="rounded-md border border-slate-200 bg-white p-4">
              <h2 className="text-sm font-black text-slate-900">Create Company</h2>
              <div className="mt-3 space-y-2">
                {Object.keys(emptyCompany).map(key => (
                  <input
                    key={key}
                    value={(companyForm as any)[key]}
                    onChange={event => setCompanyForm(prev => ({ ...prev, [key]: event.target.value }))}
                    placeholder={key.replace(/([A-Z])/g, ' $1')}
                    className="h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#12335f]"
                  />
                ))}
              </div>
              <Button onClick={createCompany} disabled={saving} className="mt-3 w-full gap-2 rounded-md">
                <Save className="h-4 w-4" />
                Save Company
              </Button>
            </section>
          </div>
        )}

        {activeTab === 'features' && (
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <CompanySelect companies={companies} value={selectedCompanyId} onChange={setSelectedCompanyId} />
            <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {features.map(feature => (
                <button
                  key={feature.id}
                  type="button"
                  onClick={() => setFeatures(prev => prev.map(item => item.id === feature.id ? { ...item, enabled: !item.enabled } : item))}
                  className="flex min-h-14 items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-slate-300"
                >
                  <span>
                    <span className="block text-sm font-bold text-slate-900">{feature.name}</span>
                    <span className="block text-xs text-slate-500">{feature.module}</span>
                  </span>
                  {feature.enabled ? <ToggleRight className="h-6 w-6 text-emerald-600" /> : <ToggleLeft className="h-6 w-6 text-slate-400" />}
                </button>
              ))}
            </div>
            <Button onClick={saveFeatures} disabled={saving} className="mt-4 gap-2 rounded-md">
              <Save className="h-4 w-4" />
              Save Toggles
            </Button>
          </section>
        )}

        {activeTab === 'roles' && (
          <div className="grid gap-4 xl:grid-cols-2">
            <DataTable title="Roles" rows={roles} columns={['code', 'name', 'scope']} />
            <DataTable title="Permissions" rows={permissions} columns={['code', 'module', 'description']} />
          </div>
        )}

        {activeTab === 'users' && (
          <div className="grid gap-4 xl:grid-cols-2">
            <DataTable title="Users" rows={users} columns={['name', 'email', 'role', 'accountStatus']} />
            <DataTable title="Organizations" rows={organizations} columns={['organizationName', 'organizationType', 'verificationStatus', 'isBlacklisted']} />
          </div>
        )}

        {activeTab === 'content' && selectedCompany && (
          <section className="rounded-md border border-slate-200 bg-white p-4">
            <CompanySelect companies={companies} value={selectedCompany.id} onChange={setSelectedCompanyId} />
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {['portalDisplayName', 'logoUrl', 'contactEmail', 'contactPhone', 'homepageContent', 'aboutContent', 'footerContent', 'grievanceContent', 'procurementPolicy'].map(key => (
                <textarea
                  key={key}
                  value={(selectedCompany as any)[key] || ''}
                  onChange={event => setCompanies(prev => prev.map(company => company.id === selectedCompany.id ? { ...company, [key]: event.target.value } : company))}
                  placeholder={key.replace(/([A-Z])/g, ' $1')}
                  className="min-h-20 rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#12335f]"
                />
              ))}
            </div>
            <Button onClick={saveContent} disabled={saving} className="mt-4 gap-2 rounded-md">
              <Save className="h-4 w-4" />
              Save Content
            </Button>
          </section>
        )}

        {activeTab === 'audit' && (
          <DataTable title="Audit Logs" rows={auditLogs} columns={['action', 'entityType', 'entityId', 'createdAt']} />
        )}
      </div>
    </div>
  );
}

function SearchBox({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
      <input
        value={value}
        onChange={event => onChange(event.target.value)}
        className="h-10 w-full rounded-md border border-slate-200 bg-white pl-9 pr-3 text-sm outline-none focus:border-[#12335f]"
        placeholder="Search"
      />
    </div>
  );
}

function CompanySelect({ companies, value, onChange }: { companies: Company[]; value: number | null; onChange: (id: number) => void }) {
  return (
    <select
      value={value || ''}
      onChange={event => onChange(Number(event.target.value))}
      className="h-10 min-w-64 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 outline-none focus:border-[#12335f]"
    >
      {companies.map(company => (
        <option key={company.id} value={company.id}>{company.portalDisplayName} - {company.name}</option>
      ))}
    </select>
  );
}

function DataTable({ title, rows, columns }: { title: string; rows: any[]; columns: string[] }) {
  return (
    <section className="overflow-hidden rounded-md border border-slate-200 bg-white">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <h2 className="text-sm font-black text-slate-900">{title}</h2>
        <span className="text-xs font-bold text-slate-500">{rows.length} records</span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="bg-slate-50 text-xs uppercase text-slate-500">
            <tr>
              <th className="w-16 px-4 py-3">S.No.</th>
              {columns.map(column => <th key={column} className="px-4 py-3">{column}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={row.id || index} className="hover:bg-slate-50">
                <td className="px-4 py-3 font-bold text-slate-500">{index + 1}</td>
                {columns.map(column => (
                  <td key={column} className="max-w-72 truncate px-4 py-3 text-slate-700">
                    {formatCell(row[column])}
                  </td>
                ))}
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={columns.length + 1} className="px-4 py-8 text-center text-sm font-semibold text-slate-500">No records found</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

const formatCell = (value: unknown) => {
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'string' && value.includes('T')) return value.slice(0, 10);
  if (value == null || value === '') return '-';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
};
