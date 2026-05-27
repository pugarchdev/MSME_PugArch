import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
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
import { Pagination } from '../features/shared/Pagination';
import { cn } from '../lib/utils';

type AdminSection = 'procurement' | 'compliance' | 'reports';
type SortKey = 'name' | 'role' | 'status' | 'date' | 'entity';

interface AdminOperationsProps {
  section: AdminSection;
}

const sectionConfig = {
  procurement: {
    label: 'Procurement & Compliance Desk',
    eyebrow: 'Stakeholder Governance',
    description: 'Monitor procurement readiness, compliance risk, review queues, and approved buyer-seller capacity from one desk.',
    icon: ClipboardCheck
  },
  compliance: {
    label: 'Procurement & Compliance Desk',
    eyebrow: 'Stakeholder Governance',
    description: 'Monitor procurement readiness, compliance risk, review queues, and approved buyer-seller capacity from one desk.',
    icon: ClipboardCheck
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
  return 'bg-slate-50 text-[#12335f] border-slate-100';
};

const pendingStatuses = ['pending', 'pending_validation', 'manual_review_required', 'under_compliance_review'];

const getRecordStatus = (item: any) => item.onboardingStatus || item.status || 'pending';

const getReviewSections = (item: any) => item.role === 'buyer'
  ? ['org', 'rep', 'address', 'procurement', 'docs']
  : ['pan', 'details', 'additional', 'offices', 'bank', 'einvoicing', 'ownership'];

const getApprovalProgress = (item: any) => {
  const sectionStatus = item.sectionStatus || {};
  const sections = getReviewSections(item);
  const approvedSections = sections.filter(section => sectionStatus[section] === 'approved').length;
  return sections.length ? Math.round((approvedSections / sections.length) * 100) : 0;
};

export default function AdminOperations({ section }: AdminOperationsProps) {
  const token = localStorage.getItem('token') || '';
  const authOptions = { headers: { Authorization: `Bearer ${token}` } };
  const [data, setData] = useState<{ sellers: any[]; buyers: any[] }>({ sellers: [], buyers: [] });
  const [stats, setStats] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const config = sectionConfig[section];
  const SectionIcon = config.icon;

  useEffect(() => {
    const handler = window.setTimeout(() => {
      setDebouncedSearchTerm(searchTerm);
      setPage(1);
    }, 300);
    return () => window.clearTimeout(handler);
  }, [searchTerm]);

  const setPageSize = (nextPageSize: number) => {
    setPageSizeState(nextPageSize);
    setPage(1);
  };

  useEffect(() => {
    setPage(1);
  }, [roleFilter, statusFilter]);

  useEffect(() => {
    const fetchAdminData = async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        params.set('skip', String((page - 1) * pageSize));
        params.set('take', String(pageSize));
        if (debouncedSearchTerm.trim()) params.set('q', debouncedSearchTerm.trim());
        if (roleFilter !== 'all') params.set('role', roleFilter);
        if (statusFilter !== 'all') params.set('status', statusFilter);
        const [onboardingRes, statsRes] = await Promise.all([
          api.fetch(`/api/admin/onboarding?${params.toString()}`, { ...authOptions, skipCache: true }),
          api.fetch(section === 'reports' ? '/api/admin/reports/summary' : '/api/admin/reports/procurement', { ...authOptions, skipCache: true })
        ]);
        if (onboardingRes.ok) {
          const body = await onboardingRes.json();
          const users = body?.data ?? body;
          setTotalRecords(Number(users?.total ?? 0));
          setSummary(users?.summary || null);
          setData(Array.isArray(users)
            ? { sellers: users.filter((item: any) => item.role === 'seller'), buyers: users.filter((item: any) => item.role === 'buyer') }
            : { sellers: users?.sellers || [], buyers: users?.buyers || [] });
        }
        if (statsRes.ok) {
          const body = await statsRes.json();
          setStats(body?.data ?? body);
        }
      } catch (err) {
        toast.error('Unable to load admin dashboard records');
      } finally {
        setLoading(false);
      }
    };
    fetchAdminData();
  }, [token, section, debouncedSearchTerm, roleFilter, statusFilter, page, pageSize]);

  const records = useMemo(() => {
    const rows = [
      ...data.sellers.map(item => ({ ...item, role: 'seller' })),
      ...data.buyers.map(item => ({ ...item, role: 'buyer' }))
    ];
    return rows;
  }, [data]);

  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(records.map(item => getRecordStatus(item))));
    return ['all', ...statuses];
  }, [records]);

  const filteredRecords = useMemo(() => {
    const valueForSort = (item: any) => {
      const profile = item.profile || {};
      if (sortKey === 'role') return item.role;
      if (sortKey === 'status') return getRecordStatus(item);
      if (sortKey === 'date') return new Date(item.createdAt || 0).getTime();
      if (sortKey === 'entity') return profile.businessName || profile.organizationName || profile.officeZoneName || '';
      return item.name || '';
    };

    return [...records]
      .sort((a, b) => {
        const aValue = valueForSort(a);
        const bValue = valueForSort(b);
        const result = typeof aValue === 'number' && typeof bValue === 'number'
          ? aValue - bValue
          : String(aValue).localeCompare(String(bValue));
        return sortDirection === 'asc' ? result : -result;
      });
  }, [records, sortKey, sortDirection]);

  const displayedRecordCount = totalRecords || filteredRecords.length;
  const hasActiveFilters = Boolean(searchTerm.trim()) || roleFilter !== 'all' || statusFilter !== 'all';
  const derivedSummary = useMemo(() => {
    const statuses: Record<string, number> = {};
    const approvedRoles: Record<string, number> = {};
    let flagged = 0;

    for (const item of records) {
      const status = getRecordStatus(item);
      statuses[status] = (statuses[status] || 0) + 1;

      if (status === 'approved_for_procurement') {
        approvedRoles[item.role] = (approvedRoles[item.role] || 0) + 1;
      }

      if (Array.isArray(item.complianceViolations) && item.complianceViolations.length > 0) {
        flagged += 1;
      }
    }

    return { statuses, approvedRoles, flagged };
  }, [records]);

  const statusCounts = Object.keys(summary?.statuses || {}).length ? summary.statuses : derivedSummary.statuses;
  const approvedRoleCounts = Object.keys(summary?.approvedRoles || {}).length ? summary.approvedRoles : derivedSummary.approvedRoles;
  const queueCount = pendingStatuses.reduce((sum, status) => sum + Number(statusCounts[status] || 0), 0);
  const resubmissionCount = Number(statusCounts.resubmission_required || 0);
  const rejectedCount = Number(statusCounts.rejected || 0);
  const approvedCount = Number(statusCounts.approved_for_procurement || 0);
  const activeSellerCount = Number(approvedRoleCounts.seller || 0);
  const activeBuyerCount = Number(approvedRoleCounts.buyer || 0);
  const flaggedCount = Number(summary?.flagged ?? derivedSummary.flagged);
  const complianceExceptionCount = resubmissionCount + rejectedCount + flaggedCount;
  const averageProgress = records.length
    ? Math.round(records.reduce((sum, item) => sum + getApprovalProgress(item), 0) / records.length)
    : 0;

  const tiles = section === 'reports'
    ? [
      { label: 'Total Network', value: stats?.totalNetwork ?? records.length, helper: 'Buyer and seller records', icon: Users },
      { label: 'Approved Entities', value: approvedCount, helper: 'Cleared for procurement', icon: CheckCircle2 },
      { label: 'Pending Review', value: queueCount, helper: 'Requires admin decision', icon: FileSearch },
      { label: 'Exceptions', value: rejectedCount + resubmissionCount, helper: 'Rejected or resubmitted', icon: AlertTriangle }
    ]
    : [
      // { label: 'Total Stakeholders', value: summary?.total ?? stats?.totalNetwork ?? totalRecords, helper: 'Buyer and seller records', icon: Users },
      { label: 'Approved for Procurement', value: approvedCount, helper: 'Ready to transact', icon: CheckCircle2 },
      { label: 'Pending Review Queue', value: queueCount, helper: 'Needs admin verification', icon: FileSearch },
      // { label: 'Compliance Exceptions', value: complianceExceptionCount, helper: 'Flags, rejected, or returned', icon: AlertTriangle },
      { label: 'Active Sellers', value: activeSellerCount, helper: 'Approved supplier pool', icon: Users },
      { label: 'Active Buyers', value: activeBuyerCount, helper: 'Approved buyer departments', icon: ClipboardCheck },
      { label: 'Resubmission Required', value: resubmissionCount, helper: 'Returned for correction', icon: AlertTriangle },
      { label: 'Avg Verification Progress', value: `${averageProgress}%`, helper: 'Section approval completion', icon: BarChart3 }
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
      <span className="text-slate-400">
        {sortKey === field ? (
          sortDirection === 'asc' ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
        ) : (
          <ArrowUpDown className="h-3 w-3 opacity-50" />
        )}
      </span>
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
        item.createdAt ? new Date(item.createdAt).toLocaleString() : ''
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
          <Link href="/admin/onboarding">
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

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-6">
        {tiles.map(tile => (
          <button
            key={tile.label}
            type="button"
            onClick={() => {
              if (tile.label.includes('Total')) {
                setRoleFilter('all');
                setStatusFilter('all');
              }
              if (tile.label.includes('Pending') || tile.label.includes('Queue')) {
                setRoleFilter('all');
                setStatusFilter('review_queue');
              }
              if (tile.label.includes('Approved')) {
                setRoleFilter('all');
                setStatusFilter('approved_for_procurement');
              }
              if (tile.label.includes('Active Sellers')) {
                setRoleFilter('seller');
                setStatusFilter('approved_for_procurement');
              }
              if (tile.label.includes('Active Buyers')) {
                setRoleFilter('buyer');
                setStatusFilter('approved_for_procurement');
              }
              if (tile.label.includes('Rejected')) {
                setRoleFilter('all');
                setStatusFilter('rejected');
              }
              if (tile.label.includes('Resubmission')) {
                setRoleFilter('all');
                setStatusFilter('resubmission_required');
              }
              if (tile.label.includes('Exceptions')) {
                setRoleFilter('all');
                setStatusFilter('all');
              }
            }}
            className="rounded-lg border border-slate-200 bg-white p-3 sm:p-4 text-left shadow-sm transition-all hover:border-[#12335f]/40 hover:-translate-y-0.5 hover:shadow-md cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#12335f] focus:ring-offset-2"
            aria-label={`Filter by ${tile.label}`}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{tile.label}</p>
                <p className="mt-2 text-3xl font-black text-slate-950">{tile.value ?? 0}</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">{tile.helper}</p>
              </div>
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-slate-50 text-[#12335f]">
                <tile.icon className="h-5 w-5" />
              </div>
            </div>
          </button>
        ))}
      </div>

      <div className="grid min-w-0 gap-4 2xl:grid-cols-[minmax(0,1fr)_360px]">
        <section className="min-w-0 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="space-y-4 border-b border-slate-200 p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="flex min-w-0 items-center gap-2">
                <SectionIcon className="h-5 w-5 text-[#12335f]" />
                <div className="min-w-0">
                  <h2 className="text-sm font-black uppercase tracking-wide text-slate-900">Stakeholder Register</h2>
                </div>
              </div>
              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchTerm('');
                    setRoleFilter('all');
                    setStatusFilter('all');
                  }}
                  className="h-7 rounded-md border border-slate-200 px-3 text-xs font-black uppercase tracking-wide text-slate-600 transition hover:border-[#12335f]/30 hover:text-[#12335f]"
                >
                  Clear Filters
                </button>
              )}
            </div>

            <div className="space-y-3">
              <div className="flex items-stretch gap-2">
                {/* Search box: takes ~80% on desktop */}
                <div className="relative min-w-0 flex-1">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={searchTerm}
                    onChange={event => setSearchTerm(event.target.value)}
                    placeholder="Search name, GST, PAN, state..."
                    className="h-11 w-full rounded-md border-slate-200 pl-9 text-xs"
                  />
                </div>

                {/* Desktop filters inline */}
                <div className="hidden md:flex items-stretch gap-2">
                  <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="h-11 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold uppercase text-slate-600">
                    <option value="all">All Roles</option>
                    <option value="seller">Sellers</option>
                    <option value="buyer">Buyers</option>
                  </select>
                  <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-11 min-w-0 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold uppercase text-slate-600">
                    {statusFilter === 'review_queue' && <option value="review_queue">Review Queue</option>}
                    {statusOptions.map(status => (
                      <option key={status} value={status}>{status === 'all' ? 'All Status' : statusLabel(status)}</option>
                    ))}
                  </select>
                </div>

                {/* Mobile filters toggle */}
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowMobileFilters(!showMobileFilters)}
                  className="md:hidden h-11 gap-2 rounded-lg text-xs font-black uppercase tracking-wider border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0"
                  aria-expanded={showMobileFilters}
                >
                  <Filter className="h-4 w-4 text-slate-500" />
                  <span>Filters</span>
                </Button>
              </div>

              {/* Mobile filters drawer */}
              {showMobileFilters && (
                <div className="md:hidden grid grid-cols-1 gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm animate-in fade-in slide-in-from-top-2 duration-200">
                  <select value={roleFilter} onChange={event => setRoleFilter(event.target.value)} className="h-11 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold uppercase text-slate-600">
                    <option value="all">All Roles</option>
                    <option value="seller">Sellers</option>
                    <option value="buyer">Buyers</option>
                  </select>
                  <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="h-11 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold uppercase text-slate-600">
                    {statusFilter === 'review_queue' && <option value="review_queue">Review Queue</option>}
                    {statusOptions.map(status => (
                      <option key={status} value={status}>{status === 'all' ? 'All Status' : statusLabel(status)}</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] table-fixed text-left">
              <thead className="bg-slate-50">
                <tr className="border-b border-slate-200">
                  <th className="w-16 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-slate-400">Sr. No.</th>
                  <th className="w-[22%] px-3 py-3"><SortHead label="Name" field="name" /></th>
                  <th className="w-20 px-3 py-3"><SortHead label="Role" field="role" /></th>
                  <th className="w-[22%] px-3 py-3"><SortHead label="Entity" field="entity" /></th>
                  <th className="w-40 px-3 py-3"><SortHead label="Status" field="status" /></th>
                  <th className="w-28 px-3 py-3"><SortHead label="Submitted" field="date" /></th>
                  <th className="w-28 px-3 py-3 text-[10px] font-black uppercase tracking-wider text-[#12335f]">Action</th>
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
                      <td className="px-3 py-4 text-xs font-bold text-slate-500">{String((page - 1) * pageSize + index + 1).padStart(2, '0')}</td>
                      <td className="px-3 py-4">
                        <p className="truncate text-sm font-black text-slate-900" title={item.name || 'N/A'}>{item.name || 'N/A'}</p>
                        <p className="break-all text-[11px] font-semibold text-slate-500">{item.email || 'No email'}</p>
                      </td>
                      <td className="px-3 py-4 text-xs font-black uppercase tracking-wide text-[#12335f]">{item.role}</td>
                      <td className="px-3 py-4">
                        <p className="line-clamp-2 break-words text-sm font-bold leading-snug text-slate-900" title={profile.businessName || profile.organizationName || profile.officeZoneName || 'N/A'}>
                          {profile.businessName || profile.organizationName || profile.officeZoneName || 'N/A'}
                        </p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{profile.state || profile.city || 'Location pending'}</p>
                      </td>
                      <td className="px-3 py-4">
                        <span className={cn('inline-flex max-w-[150px] rounded-full border px-2.5 py-1 text-center text-[10px] font-black uppercase leading-tight tracking-wide', statusTone(status))}>
                          {statusLabel(status)}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-xs font-bold text-slate-600">{item.createdAt ? new Date(item.createdAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }) : 'N/A'}</td>
                      <td className="px-3 py-4">
                        <Link href="/admin/onboarding" className="text-xs font-black uppercase tracking-wide text-[#12335f] hover:text-[#12335f]">
                          Open Review
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!loading && totalRecords > 0 && (
            <Pagination page={page} pageSize={pageSize} total={totalRecords} onPageChange={setPage} onPageSizeChange={setPageSize} />
          )}
        </section>

        {/* <aside className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-[#12335f]" />
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-900">Admin Worklist</h3>
            </div>
            <div className="mt-4 space-y-3">
              {[
                { label: 'Review new stakeholder applications', count: queueCount, status: 'review_queue' },
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
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-100">Recommended action</p>
            <h3 className="mt-2 text-lg font-black uppercase">Clear the review queue first</h3>
            <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-100">
              Prioritize records under compliance review, then process resubmissions with section-level feedback.
            </p>
            <Link href="/admin/onboarding" className="mt-4 inline-flex text-xs font-black uppercase tracking-wide text-white underline">
              Go to verification console
            </Link>
          </div>
        </aside> */}
      </div>
    </div>
  );
}
