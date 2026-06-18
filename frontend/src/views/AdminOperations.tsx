import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  BarChart3,
  Briefcase,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Download,
  FileSearch,
  Filter,
  MapPin,
  Search,
  ShieldCheck,
  Users
} from 'lucide-react';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Pagination } from '../features/shared/Pagination';
import { formatDate, formatDateTime } from '../features/shared/format';
import { cn } from '../lib/utils';
import { useResponsiveViewMode } from '../features/shared/hooks';
import { ViewModeToggle } from '../features/shared/ViewModeToggle';

type AdminSection = 'procurement' | 'compliance' | 'reports';
type SortKey = 'name' | 'role' | 'status' | 'date' | 'entity';

interface AdminOperationsProps {
  section: AdminSection;
}

const sectionConfig = {
  procurement: {
    label: 'Procurement & Compliance Desk',
    eyebrow: 'Stakeholder Governance',
    description: 'Monitor procurement readiness, risks, reviews, and buyer-seller capacity in one place.',
    icon: ClipboardCheck
  },
  compliance: {
    label: 'Procurement & Compliance Desk',
    eyebrow: 'Stakeholder Governance',
    description: 'Monitor procurement readiness, risks, reviews, and buyer-seller capacity in one place.',
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

// Entity column: prefer the registered legal/business name. If the user
// has not yet completed onboarding, fall back to a clear placeholder rather
// than a generic "N/A" + "Location pending" double dash, which made the
// column read like an error.
const getEntityName = (item: any): string => {
  const profile = item?.profile || {};
  const direct = profile.businessName
    || profile.organizationName
    || profile.officeZoneName
    || (typeof item?.organization === 'object' ? item.organization?.legalName || item.organization?.name : '');
  return (typeof direct === 'string' ? direct.trim() : '') || '';
};

const getEntityLocation = (item: any): string => {
  const profile = item?.profile || {};
  const parts = [profile.city, profile.state].filter(part => typeof part === 'string' && part.trim().length > 0);
  return parts.join(', ');
};

const getEntitySubtitle = (item: any): string => {
  const profile = item?.profile || {};
  const role = String(item?.role || '').toLowerCase();
  if (role === 'seller') {
    return [profile.organizationType, profile.msmeCategory].filter(Boolean).join(' · ');
  }
  return [profile.organizationType, profile.industry, profile.businessType].filter(Boolean).join(' · ');
};

const getRecordStatus = (item: any) => item.onboardingStatus || item.status || 'pending';

const getReviewSections = (item: any) => item.role === 'buyer'
  ? ['org', 'rep', 'address', 'procurement', 'docs']
  : ['pan', 'details', 'additional', 'offices', 'bank', 'ownership'];

const getApprovalProgress = (item: any) => {
  const sectionStatus = item.sectionStatus || {};
  const sections = getReviewSections(item);
  const approvedSections = sections.filter(section => sectionStatus[section] === 'approved').length;
  return sections.length ? Math.round((approvedSections / sections.length) * 100) : 0;
};

export default function AdminOperations({ section }: AdminOperationsProps) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') || '' : '';
  const authOptions = { headers: { Authorization: `Bearer ${token}` } };

  const [data, setData] = useState<{ sellers: any[]; buyers: any[] }>({ sellers: [], buyers: [] });
  const [stats, setStats] = useState<any>(null);
  const [summary, setSummary] = useState<any>(null);
  const [totalRecords, setTotalRecords] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearchTerm, setDebouncedSearchTerm] = useState('');
  const [roleFilter, setRoleFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSizeState] = useState(20);
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');
  const [showMobileFilters, setShowMobileFilters] = useState(false);
  const [viewMode, setViewMode] = useResponsiveViewMode();
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

  // 1. Fetch onboarding paged list
  const { data: onboardingData, isLoading: isOnboardingLoading } = useQuery({
    queryKey: ['adminOnboardingPagedList', section, page, pageSize, debouncedSearchTerm, roleFilter, statusFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set('skip', String((page - 1) * pageSize));
      params.set('take', String(pageSize));
      if (debouncedSearchTerm.trim()) params.set('q', debouncedSearchTerm.trim());
      if (roleFilter !== 'all') params.set('role', roleFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      const res = await api.fetch(`/api/admin/onboarding?${params.toString()}`, authOptions);
      if (!res.ok) throw new Error('Failed to load onboarding records');
      const json = await res.json();
      return json?.data ?? json;
    },
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  // 2. Fetch stats (shared stats query key ['adminStats'] if reports section)
  const statsQueryKey = section === 'reports' ? ['adminStats'] : ['adminStatsProcurement'];
  const { data: statsData, isLoading: isStatsLoading } = useQuery({
    queryKey: statsQueryKey,
    queryFn: async () => {
      const statsPath = section === 'reports' ? '/api/admin/reports/summary?kpiOnly=true' : '/api/admin/reports/procurement';
      const res = await api.fetch(statsPath, authOptions);
      if (!res.ok) throw new Error('Failed to load operations stats');
      const json = await res.json();
      return json?.data ?? json;
    },
    enabled: !!token,
    staleTime: 5 * 60_000,
  });

  const loading = isOnboardingLoading || isStatsLoading;

  useEffect(() => {
    if (onboardingData) {
      const users = onboardingData;
      setTotalRecords(Number(users?.total ?? 0));
      setSummary(users?.summary || null);
      setData(Array.isArray(users)
        ? { sellers: users.filter((item: any) => item.role === 'seller'), buyers: users.filter((item: any) => item.role === 'buyer') }
        : { sellers: users?.sellers || [], buyers: users?.buyers || [] });
    }
  }, [onboardingData]);

  useEffect(() => {
    if (statsData) {
      setStats(statsData);
    }
  }, [statsData]);

  const records = useMemo(() => {
    const rows = [
      ...data.sellers.map(item => ({ ...item, role: 'seller' })),
      ...data.buyers.map(item => ({ ...item, role: 'buyer' }))
    ];
    return rows;
  }, [data]);

  const getApprovalHref = (item: any) =>
    `/admin/onboarding?tab=${item.role === 'buyer' ? 'buyers' : 'sellers'}`;

  const statusOptions = useMemo(() => {
    const statuses = Array.from(new Set(records.map(item => getRecordStatus(item))));
    return ['all', ...statuses];
  }, [records]);

  const filteredRecords = useMemo(() => {
    const valueForSort = (item: any) => {
      if (sortKey === 'role') return item.role;
      if (sortKey === 'status') return getRecordStatus(item);
      if (sortKey === 'date') return new Date(item.createdAt || 0).getTime();
      if (sortKey === 'entity') return getEntityName(item);
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
      return [
        index + 1,
        item.name || '',
        item.role || '',
        getEntityName(item),
        item.email || '',
        statusLabel(item.onboardingStatus || item.status),
        formatDateTime(item.createdAt)
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
                <p className={cn("mt-2 text-3xl font-black", isStatsLoading ? "text-slate-300" : "text-slate-950")}>
                  {isStatsLoading ? "0" : tile.value ?? 0}
                </p>
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
                  <ViewModeToggle value={viewMode} onChange={setViewMode} />
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

          {/* Table list view for Desktop */}
          <div className={cn(
            "overflow-x-auto",
            viewMode === "list" ? "hidden md:block" : "hidden"
          )}>
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
                  [1, 2, 3, 4, 5].map((i) => (
                    <tr key={i} className="animate-pulse border-b border-slate-50">
                      <td className="px-3 py-4"><div className="h-4 w-8 bg-slate-100 rounded" /></td>
                      <td className="px-3 py-4">
                        <div className="h-4 w-24 bg-slate-100 rounded mb-2" />
                        <div className="h-3.5 w-32 bg-slate-100 rounded" />
                      </td>
                      <td className="px-3 py-4"><div className="h-4 w-12 bg-slate-100 rounded" /></td>
                      <td className="px-3 py-4">
                        <div className="h-4 w-36 bg-slate-100 rounded mb-2" />
                        <div className="h-3 w-16 bg-slate-100 rounded" />
                      </td>
                      <td className="px-3 py-4"><div className="h-6 w-20 bg-slate-100 rounded-full" /></td>
                      <td className="px-3 py-4"><div className="h-4 w-20 bg-slate-100 rounded" /></td>
                      <td className="px-3 py-4"><div className="h-4 w-16 bg-slate-100 rounded" /></td>
                    </tr>
                  ))
                ) : filteredRecords.length === 0 ? (
                  <tr><td colSpan={7} className="px-4 py-10 text-center text-sm font-bold text-slate-400">No records found for selected filters.</td></tr>
                ) : filteredRecords.map((item, index) => {
                  const status = item.onboardingStatus || item.status || 'pending';
                  const entityName = getEntityName(item);
                  const entityLocation = getEntityLocation(item);
                  const entitySubtitle = getEntitySubtitle(item);
                  return (
                    <tr key={`${item.role}-${item.id || item._id}`} className="hover:bg-slate-50/80">
                      <td className="px-3 py-4 text-xs font-bold text-slate-500">{String((page - 1) * pageSize + index + 1).padStart(2, '0')}</td>
                      <td className="px-3 py-4">
                        <p className="truncate text-sm font-black text-slate-900" title={item.name || '—'}>{item.name || '—'}</p>
                        <p className="break-all text-[11px] font-semibold text-slate-500">{item.email || 'No email'}</p>
                      </td>
                      <td className="px-3 py-4 text-xs font-black uppercase tracking-wide text-[#12335f]">{item.role}</td>
                      <td className="px-3 py-4">
                        {entityName ? (
                          <p className="line-clamp-2 break-words text-sm font-bold leading-snug text-slate-900" title={entityName}>
                            {entityName}
                          </p>
                        ) : (
                          <p className="text-sm font-semibold italic text-slate-400">
                            Onboarding in progress
                          </p>
                        )}
                        {entityLocation ? (
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{entityLocation}</p>
                        ) : entitySubtitle ? (
                          <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{entitySubtitle}</p>
                        ) : null}
                      </td>
                      <td className="px-3 py-4 text-left">
                        <span className={cn('inline-flex max-w-[170px] rounded-full border px-2.5 py-1 text-left text-[10px] font-black uppercase leading-tight tracking-wide', statusTone(status))}>
                          {statusLabel(status)}
                        </span>
                      </td>
                      <td className="px-3 py-4 text-xs font-bold text-slate-600">
                        {formatDateTime(item.createdAt)}
                      </td>
                      <td className="px-3 py-4">
                        <Link href={getApprovalHref(item)} className="text-xs font-black uppercase tracking-wide text-[#12335f] hover:text-[#12335f]">
                          Open Review
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Desktop Grid view */}
          {viewMode === "grid" && (
            <div className="hidden md:grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-slate-50/50 rounded-b-2xl border-t border-slate-100">
              {loading ? (
                [1, 2, 3].map((i) => (
                  <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-white p-5 shadow-sm space-y-4">
                    <div className="flex justify-between items-center pb-3 border-b border-slate-50">
                      <div className="h-4 w-12 bg-slate-100 rounded" />
                      <div className="h-6 w-20 bg-slate-100 rounded-full" />
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="h-11 w-11 bg-slate-100 rounded-xl" />
                      <div className="space-y-2 flex-1">
                        <div className="h-4 w-24 bg-slate-100 rounded" />
                        <div className="h-3 w-32 bg-slate-100 rounded" />
                      </div>
                    </div>
                    <div className="h-12 bg-slate-50 rounded-xl" />
                    <div className="grid grid-cols-2 gap-3 pt-3 border-t border-slate-50">
                      <div className="h-8 bg-slate-100 rounded" />
                      <div className="h-8 bg-slate-100 rounded" />
                    </div>
                  </div>
                ))
              ) : filteredRecords.length === 0 ? (
                <div className="col-span-full py-20 text-center text-sm font-bold text-slate-400">No records found for selected filters.</div>
              ) : filteredRecords.map((item, index) => {
                const status = getRecordStatus(item);
                const entityName = getEntityName(item);
                const entityLocation = getEntityLocation(item);
                const entitySubtitle = getEntitySubtitle(item);
                const progress = getApprovalProgress(item);

                const getAvatarGradient = (statusStr: string) => {
                  switch (statusStr) {
                    case "approved_for_procurement":
                      return "bg-gradient-to-br from-emerald-600 to-green-500 shadow-emerald-500/10";
                    case "rejected":
                      return "bg-gradient-to-br from-red-600 to-rose-500 shadow-red-500/10";
                    case "resubmission_required":
                      return "bg-gradient-to-br from-amber-500 to-orange-400 shadow-amber-500/10";
                    default:
                      return "bg-gradient-to-br from-[#12335f] to-[#25528c] shadow-[#12335f]/10";
                  }
                };

                return (
                  <div
                    key={`grid-${item.role}-${item.id || item._id}`}
                    className="group rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md hover:-translate-y-0.5 hover:border-[#12335f]/25 transition-all duration-300 flex flex-col justify-between min-w-0"
                  >
                    <div>
                      {/* Top Row - Meta & Badge */}
                      <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-3 mb-3">
                        <div className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                          {item.role}
                          {" · #"}
                          {String((page - 1) * pageSize + index + 1).padStart(2, "0")}
                        </div>
                        <div className="shrink-0">
                          <span className={cn('inline-flex rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest shadow-sm', statusTone(status))}>
                            {statusLabel(status)}
                          </span>
                        </div>
                      </div>

                      {/* Identity - Avatar & Names */}
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn(
                          "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl shadow-md text-sm font-extrabold text-white transition-all duration-300 group-hover:scale-105",
                          getAvatarGradient(status)
                        )}>
                          {String(item.name || "?").charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-slate-800 text-sm tracking-tight group-hover:text-[#12335f] transition-colors line-clamp-2">
                            {item.name}
                          </div>
                          <div className="break-all text-[11px] font-semibold text-slate-500">
                            {item.email || 'No email'}
                          </div>
                        </div>
                      </div>

                      {/* Entity Info box */}
                      <div className="mt-3 p-3 bg-slate-50 rounded-xl min-w-0">
                        <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 mb-1">Entity Details</p>
                        {entityName ? (
                          <p className="line-clamp-2 break-words text-xs font-bold leading-snug text-slate-800" title={entityName}>
                            {entityName}
                          </p>
                        ) : (
                          <p className="text-xs font-semibold italic text-slate-400">
                            Onboarding in progress
                          </p>
                        )}
                        {entitySubtitle && (
                          <p className="mt-1 text-[10px] font-bold text-slate-500 line-clamp-1">{entitySubtitle}</p>
                        )}
                      </div>

                      {/* Metadata Grid */}
                      <div className="mt-3.5 grid grid-cols-2 gap-x-3 gap-y-2 border-t border-slate-100 pt-3">
                        <div className="flex items-start gap-2 min-w-0">
                          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400 group-hover:text-[#12335f]/70 transition-colors" />
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Location</p>
                            <p className="text-[11px] font-semibold text-slate-700 truncate" title={entityLocation || undefined}>
                              {entityLocation || "—"}
                            </p>
                          </div>
                        </div>

                        <div className="flex items-start gap-2 min-w-0">
                          <Clock className="h-3.5 w-3.5 mt-0.5 shrink-0 text-slate-400 group-hover:text-[#12335f]/70 transition-colors" />
                          <div className="min-w-0">
                            <p className="text-[9px] font-bold uppercase tracking-wider text-slate-400">Submitted</p>
                            <p className="text-[11px] font-semibold text-slate-700 font-mono">
                              {formatDate(item.createdAt)}
                            </p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-4">
                      <div className="flex justify-between items-center mb-1 text-[10px] font-bold text-slate-500">
                        <span>Verification</span>
                        <span>{progress}%</span>
                      </div>
                      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-[#12335f] transition-all duration-500"
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      {/* Footer - Section Dots & CTA */}
                      <div className="mt-3.5 flex items-center justify-between gap-2">
                        <div className="flex space-x-1">
                          {getReviewSections(item).map((section) => {
                            const sectionStatus = item.sectionStatus?.[section];
                            const statusColors = {
                              approved: "bg-emerald-500 shadow-sm shadow-emerald-500/20",
                              rejected: "bg-red-500 shadow-sm shadow-red-500/20",
                              pending: "bg-slate-200",
                            };
                            const colorClass = statusColors[sectionStatus as keyof typeof statusColors] || "bg-slate-200";
                            return (
                              <div
                                key={section}
                                className={cn("h-1.5 w-3 rounded-full transition-all duration-300", colorClass)}
                                title={`${section}: ${sectionStatus || "pending"}`}
                              />
                            );
                          })}
                        </div>
                        <Link href={getApprovalHref(item)} className="text-[10px] font-black text-indigo-600 group-hover:text-indigo-800 transition-colors flex items-center gap-1">
                          <span>REVIEW</span>
                          <span className="transform group-hover:translate-x-0.5 transition-transform duration-200">→</span>
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Responsive Card Grid for Mobile */}
          <div className="md:hidden grid grid-cols-1 gap-4 p-4 bg-slate-50/50 rounded-b-2xl border-t border-slate-100">
            {loading ? (
              [1, 2, 3].map((i) => (
                <div key={i} className="animate-pulse rounded-2xl border border-slate-100 bg-white p-4 shadow-sm space-y-3">
                  <div className="flex justify-between items-center pb-2.5 border-b border-slate-50">
                    <div className="h-3 w-10 bg-slate-100 rounded" />
                    <div className="h-5 w-16 bg-slate-100 rounded-full" />
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 bg-slate-100 rounded-xl" />
                    <div className="space-y-1.5 flex-1">
                      <div className="h-3.5 w-20 bg-slate-100 rounded" />
                      <div className="h-2.5 w-28 bg-slate-100 rounded" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-50">
                    <div className="h-6 bg-slate-100 rounded" />
                    <div className="h-6 bg-slate-100 rounded" />
                  </div>
                </div>
              ))
            ) : filteredRecords.length === 0 ? (
              <div className="py-10 text-center text-sm font-bold text-slate-400">No records found.</div>
            ) : filteredRecords.map((item, index) => {
              const status = getRecordStatus(item);
              const entityName = getEntityName(item);
              const entityLocation = getEntityLocation(item);
              const entitySubtitle = getEntitySubtitle(item);
              const progress = getApprovalProgress(item);

              const getAvatarGradient = (statusStr: string) => {
                switch (statusStr) {
                  case "approved_for_procurement":
                    return "bg-gradient-to-br from-emerald-600 to-green-500 shadow-emerald-500/10";
                  case "rejected":
                    return "bg-gradient-to-br from-red-600 to-rose-500 shadow-red-500/10";
                  case "resubmission_required":
                    return "bg-gradient-to-br from-amber-500 to-orange-400 shadow-amber-500/10";
                  default:
                    return "bg-gradient-to-br from-[#12335f] to-[#25528c] shadow-[#12335f]/10";
                }
              };

              return (
                <div
                  key={`mobile-${item.role}-${item.id || item._id}`}
                  className="group rounded-2xl border border-slate-200 bg-white p-4 shadow-sm active:bg-slate-50 transition-all flex flex-col justify-between min-w-0"
                >
                  <Link href={getApprovalHref(item)} className="block text-left min-w-0 flex-1">
                    {/* Top Row - Meta & Badge */}
                    <div className="flex items-center justify-between gap-2 border-b border-slate-100 pb-2.5 mb-2.5">
                      <div className="text-[9px] font-extrabold uppercase tracking-widest text-slate-400">
                        {item.role}
                        {" · #"}
                        {String((page - 1) * pageSize + index + 1).padStart(2, "0")}
                      </div>
                      <div className="shrink-0 scale-90 origin-right">
                        <span className={cn('inline-flex rounded-full border px-2 py-0.5 text-[8px] font-black uppercase tracking-widest shadow-sm', statusTone(status))}>
                          {statusLabel(status)}
                        </span>
                      </div>
                    </div>

                    {/* Identity - Avatar & Names */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={cn(
                        "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl shadow-md text-xs font-extrabold text-white",
                        getAvatarGradient(status)
                      )}>
                        {String(item.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-slate-800 text-xs tracking-tight line-clamp-2">
                          {item.name}
                        </div>
                        <div className="break-all text-[10px] font-semibold text-slate-500">
                          {item.email || 'No email'}
                        </div>
                      </div>
                    </div>

                    {/* Entity Info Box */}
                    <div className="mt-2.5 p-2.5 bg-slate-50 rounded-xl min-w-0">
                      <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mb-0.5">Entity Details</p>
                      {entityName ? (
                        <p className="line-clamp-2 break-words text-[11px] font-bold leading-snug text-slate-800">
                          {entityName}
                        </p>
                      ) : (
                        <p className="text-[11px] font-semibold italic text-slate-400">
                          Onboarding in progress
                        </p>
                      )}
                      {entitySubtitle && (
                        <p className="mt-0.5 text-[9px] font-bold text-slate-500 line-clamp-1">{entitySubtitle}</p>
                      )}
                    </div>

                    {/* Metadata Grid */}
                    <div className="mt-3 grid grid-cols-2 gap-x-2.5 gap-y-1.5 border-t border-slate-100 pt-2.5">
                      <div className="flex items-start gap-1.5 min-w-0">
                        <MapPin className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Location</p>
                          <p className="text-[10px] font-semibold text-slate-700 truncate">
                            {entityLocation || "—"}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-start gap-1.5 min-w-0">
                        <Clock className="h-3 w-3 mt-0.5 shrink-0 text-slate-400" />
                        <div className="min-w-0">
                          <p className="text-[8px] font-bold uppercase tracking-wider text-slate-400">Submitted</p>
                          <p className="text-[10px] font-semibold text-slate-700 font-mono">
                            {formatDate(item.createdAt)}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Progress bar */}
                    <div className="mt-3">
                      <div className="h-1 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full bg-[#12335f]"
                          style={{ width: `${progress}%` }}
                        />
                      </div>

                      {/* Footer - Section Dots & CTA */}
                      <div className="mt-3 flex items-center justify-between gap-2">
                        <div className="flex space-x-0.5">
                          {getReviewSections(item).map((section) => {
                            const sectionStatus = item.sectionStatus?.[section];
                            const statusColors = {
                              approved: "bg-emerald-500",
                              rejected: "bg-red-500",
                              pending: "bg-slate-200",
                            };
                            const colorClass = statusColors[sectionStatus as keyof typeof statusColors] || "bg-slate-200";
                            return (
                              <div
                                key={section}
                                className={cn("h-1 w-2 rounded-full", colorClass)}
                              />
                            );
                          })}
                        </div>
                        <div className="text-[9px] font-black text-indigo-600 uppercase flex items-center gap-0.5">
                          <span>REVIEW</span>
                          <span>→</span>
                        </div>
                      </div>
                    </div>
                  </Link>
                </div>
              );
            })}
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
