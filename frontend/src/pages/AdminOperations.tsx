import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertTriangle,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileSearch,
  Filter,
  Search,
  ShieldCheck,
  Users
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { cn } from '../lib/utils';

type AdminSection = 'procurement' | 'compliance' | 'reports';
type SortKey = 'name' | 'role' | 'status' | 'date' | 'entity';

interface AdminOperationsProps {
  section: AdminSection;
}

const sectionConfig = {
  procurement: {
    label: 'Procurement Command',
    eyebrow: 'Procurement Oversight',
    description: 'Monitor stakeholder readiness, supplier capacity, and approval queues for marketplace access.',
    icon: ClipboardCheck
  },
  compliance: {
    label: 'Compliance Desk',
    eyebrow: 'Document and KYC Control',
    description: 'Track pending verification, resubmissions, and rejected records that need administrator action.',
    icon: ShieldCheck
  },
  reports: {
    label: 'MIS Reports',
    eyebrow: 'Administrative Reporting',
    description: 'Export stakeholder records and review network health indicators for procurement governance.',
    icon: BarChart3
  }
};

const statusLabel = (status = 'pending') => status.replace(/_/g, ' ').replace(/\b\w/g, char => char.toUpperCase());

const statusTone = (status = 'pending') => {
  if (status === 'approved_for_procurement') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'rejected') return 'bg-red-50 text-red-700 border-red-200';
  if (status === 'resubmission_required') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-blue-50 text-[#12335f] border-blue-100';
};

export default function AdminOperations({ section }: AdminOperationsProps) {
  const token = localStorage.getItem('token') || '';
  const authOptions = { headers: { Authorization: `Bearer ${token}` } };
  const [data, setData] = useState<{ sellers: any[]; buyers: any[] }>({ sellers: [], buyers: [] });
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const config = sectionConfig[section];
  const SectionIcon = config.icon;

  useEffect(() => {
    const fetchAdminData = async () => {
      setLoading(true);
      try {
        const [onboardingRes, statsRes] = await Promise.all([
          api.fetch('/api/admin/onboarding', { ...authOptions, skipCache: true }),
          api.fetch('/api/admin/stats', { ...authOptions, skipCache: true })
        ]);
        if (onboardingRes.ok) setData(await onboardingRes.json());
        if (statsRes.ok) setStats(await statsRes.json());
      } catch (err) {
        toast.error('Unable to load admin dashboard records');
      } finally {
        setLoading(false);
      }
    };
    fetchAdminData();
  }, [token, section]);

  const records = useMemo(() => {
    const rows = [
      ...data.sellers.map(item => ({ ...item, role: 'seller' })),
      ...data.buyers.map(item => ({ ...item, role: 'buyer' }))
    ];
    return rows;
  }, [data]);

  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(records.map(item => item.onboardingStatus || item.status || 'pending')));
    return ['all', ...statuses];
  }, [records]);

  const filteredRecords = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    const valueForSort = (item: any) => {
      const profile = item.profile || {};
      if (sortKey === 'role') return item.role;
      if (sortKey === 'status') return item.onboardingStatus || item.status || 'pending';
      if (sortKey === 'date') return new Date(item.createdAt || 0).getTime();
      if (sortKey === 'entity') return profile.businessName || profile.organizationName || profile.officeZoneName || '';
      return item.name || '';
    };

    return records
      .filter(item => {
        const profile = item.profile || {};
        const status = item.onboardingStatus || item.status || 'pending';
        const haystack = [
          item.name,
          item.email,
          item.role,
          status,
          profile.businessName,
          profile.organizationName,
          profile.officeZoneName,
          profile.gst,
          profile.pan,
          profile.state,
          profile.city
        ].filter(Boolean).join(' ').toLowerCase();
        const matchesSearch = !term || haystack.includes(term);
        const matchesRole = roleFilter === 'all' || item.role === roleFilter;
        const matchesStatus = statusFilter === 'all' || status === statusFilter;
        return matchesSearch && matchesRole && matchesStatus;
      })
      .sort((a, b) => {
        const aValue = valueForSort(a);
        const bValue = valueForSort(b);
        const result = typeof aValue === 'number' && typeof bValue === 'number'
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue));
        return sortDirection === 'asc' ? result : -result;
      });
  }, [records, searchTerm, roleFilter, statusFilter, sortKey, sortDirection]);

  const queueCount = records.filter(item => ['pending', 'under_compliance_review'].includes(item.onboardingStatus || item.status || 'pending')).length;
  const resubmissionCount = records.filter(item => item.onboardingStatus === 'resubmission_required').length;
  const rejectedCount = records.filter(item => item.onboardingStatus === 'rejected').length;
  const approvedCount = records.filter(item => item.onboardingStatus === 'approved_for_procurement').length;

  const tiles = section === 'reports'
    ? [
        { label: 'Total Network', value: stats?.totalNetwork ?? records.length, helper: 'Buyer and seller records', icon: Users },
        { label: 'Approved Entities', value: approvedCount, helper: 'Cleared for procurement', icon: CheckCircle2 },
        { label: 'Pending Review', value: queueCount, helper: 'Requires admin decision', icon: FileSearch },
        { label: 'Exceptions', value: rejectedCount + resubmissionCount, helper: 'Rejected or resubmitted', icon: AlertTriangle }
      ]
    : section === 'compliance'
      ? [
          { label: 'Review Queue', value: queueCount, helper: 'Pending KYC/doc checks', icon: FileSearch },
          { label: 'Resubmission', value: resubmissionCount, helper: 'Returned to stakeholder', icon: AlertTriangle },
          { label: 'Rejected', value: rejectedCount, helper: 'Blocked records', icon: AlertTriangle },
          { label: 'Approved', value: approvedCount, helper: 'Compliant entities', icon: CheckCircle2 }
        ]
      : [
          { label: 'Active Sellers', value: stats?.activeSellers ?? 0, helper: 'Supplier pool available', icon: Users },
          { label: 'Active Buyers', value: stats?.activeBuyers ?? 0, helper: 'Buyer departments live', icon: ClipboardCheck },
          { label: 'Pending Approval', value: stats?.pendingApproval ?? queueCount, helper: 'New access requests', icon: FileSearch },
          { label: 'Network Total', value: stats?.totalNetwork ?? records.length, helper: 'All stakeholders', icon: BarChart3 }
        ];

  const toggleSort = (key: SortKey) => {
    setSortDirection(prev => sortKey === key && prev === 'asc' ? 'desc' : 'asc');
    setSortKey(key);
  };

  const SortHead = ({ label, field }: { label: string; field: SortKey }) => (
    <button
      type="button"
      onClick={() => toggleSort(field)}
      className="inline-flex items-center gap-1 text-left text-[10px] font-black uppercase tracking-wider text-[#12335f] hover:text-[#0b2445]"
    >
      {label}
      <span className="text-[9px] text-slate-400">{sortKey === field ? sortDirection.toUpperCase() : 'SORT'}</span>
    </button>
  );

  const exportCsv = () => {
    const headers = ['Sr No', 'Name', 'Role', 'Entity', 'Email', 'Status', 'Submitted At'];
    const rows = filteredRecords.map((item, index) => {
      const profile = item.profile || {};
      return [
        index + 1,
        item.name || '',
        item.role || '',
        profile.businessName || profile.organizationName || profile.officeZoneName || '',
        item.email || '',
        statusLabel(item.onboardingStatus || item.status),
        item.createdAt ? new Date(item.createdAt).toLocaleDateString() : ''
      ];
    });
    const csv = [headers, ...rows]
      .map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `admin-${section}-report-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success('Admin report exported');
  };

  return (
    <div className="space-y-5 animate-in fade-in duration-500">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-slate-400">{config.eyebrow}</p>
          <h1 className="mt-1 text-2xl font-extrabold uppercase tracking-tight text-[#12335f]">{config.label}</h1>
          <p className="mt-1 max-w-3xl text-sm font-medium text-slate-500">{config.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link to="/admin/onboarding">
            <Button className="h-10 rounded-md bg-[#12335f] px-4 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#0b2445]">
              <ShieldCheck className="mr-2 h-4 w-4" />
              Review Submissions
            </Button>
          </Link>
          <Button variant="outline" onClick={exportCsv} className="h-10 rounded-md border-slate-200 text-xs font-bold uppercase tracking-wide">
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {tiles.map(tile => (
          <button
            key={tile.label}
            type="button"
            onClick={() => {
              if (tile.label.includes('Pending') || tile.label.includes('Queue')) setStatusFilter('under_compliance_review');
              if (tile.label.includes('Approved') || tile.label.includes('Active')) setStatusFilter('approved_for_procurement');
              if (tile.label.includes('Rejected')) setStatusFilter('rejected');
              if (tile.label.includes('Resubmission')) setStatusFilter('resubmission_required');
            }}
            className="rounded-lg border border-slate-200 bg-white p-4 text-left shadow-sm transition-all hover:border-[#12335f]/40 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-[#12335f]"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{tile.label}</p>
                <p className="mt-2 text-3xl font-black text-slate-950">{tile.value ?? 0}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{tile.helper}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-blue-50 text-[#12335f]">
                <tile.icon className="h-5 w-5" />
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-center gap-2">
                <SectionIcon className="h-5 w-5 text-[#12335f]" />
                <div>
                  <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Stakeholder Register</h2>
                  <p className="text-xs font-medium text-slate-500">{filteredRecords.length} records matching current filters</p>
                </div>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <div className="relative">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    placeholder="Search name, GST, PAN, state..."
                    className="h-10 w-full rounded-md border-slate-200 pl-9 text-xs sm:w-72"
                  />
                </div>
                <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold uppercase text-slate-600">
                  <option value="all">All Roles</option>
                  <option value="seller">Sellers</option>
                  <option value="buyer">Buyers</option>
                </select>
                <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold uppercase text-slate-600">
                  {statusOptions.map(status => (
                    <option key={status} value={status}>{status === 'all' ? 'All Status' : statusLabel(status)}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-left">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Sr. No.</th>
                  <th className="px-4 py-3"><SortHead label="Name" field="name" /></th>
                  <th className="px-4 py-3"><SortHead label="Role" field="role" /></th>
                  <th className="px-4 py-3"><SortHead label="Entity" field="entity" /></th>
                  <th className="px-4 py-3"><SortHead label="Status" field="status" /></th>
                  <th className="px-4 py-3"><SortHead label="Submitted" field="date" /></th>
                  <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wider text-[#12335f]">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm font-bold text-slate-400">Loading admin records...</td></tr>
                ) : filteredRecords.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm font-bold text-slate-400">No records found for selected filters.</td></tr>
                ) : filteredRecords.map((item, index) => {
                  const profile = item.profile || {};
                  const status = item.onboardingStatus || item.status || 'pending';
                  return (
                    <tr key={`${item.role}-${item.id || item._id}`} className="hover:bg-slate-50/80">
                      <td className="px-4 py-4 text-xs font-bold text-slate-500">{String(index + 1).padStart(2, '0')}</td>
                      <td className="px-4 py-4">
                        <p className="text-sm font-black text-slate-900">{item.name || 'N/A'}</p>
                        <p className="break-all text-[11px] font-semibold text-slate-500">{item.email || 'No email'}</p>
                      </td>
                      <td className="px-4 py-4 text-xs font-black uppercase tracking-wide text-[#12335f]">{item.role}</td>
                      <td className="px-4 py-4">
                        <p className="max-w-[220px] whitespace-normal break-words text-sm font-bold text-slate-900">
                          {profile.businessName || profile.organizationName || profile.officeZoneName || 'N/A'}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{profile.state || profile.city || 'Location pending'}</p>
                      </td>
                      <td className="px-4 py-4">
                        <span className={cn('inline-flex rounded-full border px-3 py-1 text-[10px] font-black uppercase tracking-wide', statusTone(status))}>
                          {statusLabel(status)}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs font-bold text-slate-600">{item.createdAt ? new Date(item.createdAt).toLocaleDateString() : 'N/A'}</td>
                      <td className="px-4 py-4">
                        <Link to="/admin/onboarding" className="text-xs font-black uppercase tracking-wide text-blue-700 hover:text-[#12335f]">
                          Open Review
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-[#12335f]" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Admin Worklist</h3>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { label: 'Review new stakeholder applications', count: queueCount, status: 'under_compliance_review' },
                { label: 'Validate resubmitted records', count: resubmissionCount, status: 'resubmission_required' },
                { label: 'Audit rejected applications', count: rejectedCount, status: 'rejected' },
                { label: 'Monitor approved procurement users', count: approvedCount, status: 'approved_for_procurement' }
              ].map(item => (
                <button
                  key={item.label}
                  type="button"
                  onClick={() => setStatusFilter(item.status)}
                  className="flex w-full items-center justify-between rounded-md border border-slate-100 bg-slate-50 px-3 py-3 text-left hover:border-[#12335f]/30 hover:bg-white"
                >
                  <span className="text-xs font-bold text-slate-700">{item.label}</span>
                  <span className="rounded-full bg-white px-2.5 py-1 text-[10px] font-black text-[#12335f] shadow-sm">{item.count}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-slate-200 bg-[#12335f] p-4 text-white shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-blue-100">Recommended action</p>
            <h3 className="mt-2 text-lg font-black uppercase">Clear the review queue first</h3>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-blue-100">
              Prioritize records under compliance review, then process resubmissions with section-level feedback.
            </p>
            <Link to="/admin/onboarding" className="mt-4 inline-flex text-xs font-black uppercase tracking-wide text-white underline">
              Go to verification console
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
