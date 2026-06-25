'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  CheckCircle2,
  Clock,
  Eye,
  FileText,
  Filter,
  Gavel,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Search,
  ShoppingCart,
  TrendingUp,
  X,
  XCircle,
  ClipboardCheck,
  ClipboardList,
  AlertTriangle,
  CalendarDays,
  IndianRupee,
  Tag,
  Hash,
  Info,
  Layers,
  Building2,
  ExternalLink,
  Paperclip,
  Download,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { getApi } from '../../shared/apiClient';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';

/* ═══════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════ */

interface NormalizedProcurement {
  id: number;
  type: string;
  typeLabel: string;
  title: string;
  referenceNumber: string;
  status: string;
  statusLabel: string;
  statusGroup: string;
  method: string;
  methodLabel: string;
  estimatedValue: number;
  category: string;
  createdAt: string;
  updatedAt: string;
  actionUrl: string;
  description?: string;
  deliveryLocation?: string;
  startDate?: string;
  endDate?: string;
  quantity?: string;
  unit?: string;
  organizationName?: string;
  documents?: Array<{ fileAssetId: number; fileName: string; documentType?: string }>;
  items?: Array<{ itemName: string; quantity: string; unitOfMeasure: string; description?: string }>;
  paymentTerms?: string;
  eligibilityCriteria?: string[];
  termsAndConditions?: string[];
}

interface KpiData {
  totalProcurements: number;
  drafts: number;
  pendingApproval: number;
  active: number;
  completed: number;
  cancelled: number;
  totalValue: number;
}

/* ═══════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════ */

const TYPE_FILTERS = [
  { key: '', label: 'All Types' },
  { key: 'bid_draft', label: 'Bid Draft' },
  { key: 'bid_tender', label: 'Bid / Tender' },
  { key: 'procurement_request', label: 'Cart Checkout' },
  { key: 'direct_purchase', label: 'Direct Purchase' },
  { key: 'requirement', label: 'Requirement' },
];

const STATUS_FILTERS = [
  { key: '', label: 'All Status' },
  { key: 'draft', label: 'Draft' },
  { key: 'pending_approval', label: 'Pending Approval' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const TYPE_BADGE_STYLES: Record<string, string> = {
  bid_draft: 'border-amber-200 bg-amber-50 text-amber-800',
  bid_tender: 'border-blue-200 bg-blue-50 text-blue-800',
  procurement_request: 'border-violet-200 bg-violet-50 text-violet-800',
  direct_purchase: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  requirement: 'border-rose-200 bg-rose-50 text-rose-800',
};

const STATUS_BADGE_STYLES: Record<string, string> = {
  draft: 'border-slate-200 bg-slate-50 text-slate-700',
  pending_approval: 'border-amber-200 bg-amber-50 text-amber-800',
  active: 'border-sky-200 bg-sky-50 text-sky-800',
  completed: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  cancelled: 'border-red-200 bg-red-50 text-red-700',
};

type SortKey = 'title' | 'type' | 'status' | 'estimatedValue' | 'updatedAt' | 'referenceNumber';
type SortDir = 'asc' | 'desc';

const formatCurrency = (v: number) =>
  v ? `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: true,
    });
  } catch {
    return value;
  }
};

/* ═══════════════════════════════════════════════
   KPI CARD
   ═══════════════════════════════════════════════ */

function KpiCard({
  icon: Icon,
  label,
  value,
  gradient,
  isActive,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  gradient: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'group relative flex flex-col items-start gap-1 overflow-hidden rounded-xl border p-4 text-left transition-all duration-300',
        'hover:shadow-lg hover:-translate-y-0.5',
        isActive
          ? 'border-[#12335f] ring-2 ring-[#12335f]/20 shadow-md'
          : 'border-slate-200/80 shadow-sm hover:border-[#12335f]/30'
      )}
    >
      <div className={cn('absolute inset-0 opacity-[0.04] transition-opacity group-hover:opacity-[0.07]', gradient)} />
      <div className="relative z-10 flex w-full items-center justify-between">
        <div className={cn(
          'flex h-9 w-9 items-center justify-center rounded-lg transition-colors',
          isActive ? 'bg-[#12335f] text-white' : 'bg-[#12335f]/10 text-[#12335f] group-hover:bg-[#12335f]/15'
        )}>
          <Icon className="h-4 w-4" />
        </div>
        {isActive && (
          <span className="inline-flex h-2 w-2 rounded-full bg-[#12335f] animate-pulse" />
        )}
      </div>
      <div className="relative z-10 mt-2">
        <p className="text-2xl font-black tracking-tight text-slate-950 tabular-nums">{value}</p>
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════
   SORT HEADER CELL
   ═══════════════════════════════════════════════ */

function ThSort({
  children,
  sortKey,
  currentSort,
  sortDir,
  onSort,
  className,
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  currentSort: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  return (
    <th
      className={cn(
        'cursor-pointer select-none px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-700',
        className
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown
          className={cn('h-3 w-3 transition-colors', isActive ? 'text-[#12335f]' : 'text-slate-300')}
        />
        {isActive && (
          <span className="text-[8px] text-[#12335f]">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */

export default function MyProcurementsPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [procurements, setProcurements] = useState<NormalizedProcurement[]>([]);
  const [kpis, setKpis] = useState<KpiData>({
    totalProcurements: 0,
    drafts: 0,
    pendingApproval: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
    totalValue: 0,
  });

  // Filters
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeKpi, setActiveKpi] = useState<string | null>(null);

  // Sort & View
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useResponsiveViewMode('my-procurements:view-mode');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedProcurement, setSelectedProcurement] = useState<NormalizedProcurement | null>(null);

  const openDetail = (p: NormalizedProcurement, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedProcurement(p);
    setDetailOpen(true);
  };
  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedProcurement(null);
  };

  /* ── Data Loading ── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (typeFilter) params.set('type', typeFilter);
      if (statusFilter) params.set('status', statusFilter);
      if (searchQuery) params.set('search', searchQuery);
      params.set('sortBy', sortKey);
      params.set('sortDir', sortDir);

      const result = await getApi<any>(
        `/api/buyer/my-procurements?${params.toString()}`,
        true
      );
      setKpis(result?.kpis || kpis);
      setProcurements(result?.procurements || []);
    } catch (err) {
      toast.error('Failed to load procurements');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter, searchQuery, sortKey, sortDir]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── KPI Click Handler ── */
  const handleKpiClick = (group: string | null) => {
    if (activeKpi === group) {
      setActiveKpi(null);
      setStatusFilter('');
    } else {
      setActiveKpi(group);
      setStatusFilter(group || '');
    }
  };

  /* ── Sort Handler ── */
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  /* ── Rendered Data ── */
  const displayData = useMemo(() => {
    let data = [...procurements];
    // Client-side sort (API already sorts, but for instant re-sorting)
    data.sort((a: any, b: any) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    return data;
  }, [procurements, sortKey, sortDir]);

  const hasActiveFilters = typeFilter || statusFilter || searchQuery;

  /* ═══════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════ */

  return (
    <div className="mx-auto max-w-7xl space-y-5 pb-8">
      {/* ── Page Header ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#12335f]">
              Procurement · All Activities
            </p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">
              My Procurements
            </h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Unified view of all procurement activities — bids, tenders, cart checkout, direct
              purchases, and requirements. Click KPI cards to filter by status.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            <Button
              type="button"
              variant="outline"
              onClick={loadData}
              disabled={loading}
              className="h-10 rounded-lg text-xs font-black uppercase"
            >
              <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
            <Button
              type="button"
              onClick={() => router.push('/buyer/procurement')}
              className="h-10 rounded-lg bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]"
            >
              <ShoppingCart className="mr-2 h-4 w-4" /> New Procurement
            </Button>
          </div>
        </div>
      </section>

      {/* ── KPI Cards ── */}
      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
        <KpiCard
          icon={BarChart3}
          label="Total"
          value={kpis.totalProcurements}
          gradient="bg-gradient-to-br from-[#12335f] to-blue-600"
          isActive={activeKpi === null && !statusFilter}
          onClick={() => handleKpiClick(null)}
        />
        <KpiCard
          icon={FileText}
          label="Drafts"
          value={kpis.drafts}
          gradient="bg-gradient-to-br from-slate-500 to-slate-700"
          isActive={activeKpi === 'draft'}
          onClick={() => handleKpiClick('draft')}
        />
        <KpiCard
          icon={Clock}
          label="Pending"
          value={kpis.pendingApproval}
          gradient="bg-gradient-to-br from-amber-500 to-orange-600"
          isActive={activeKpi === 'pending_approval'}
          onClick={() => handleKpiClick('pending_approval')}
        />
        <KpiCard
          icon={TrendingUp}
          label="Active"
          value={kpis.active}
          gradient="bg-gradient-to-br from-sky-500 to-blue-600"
          isActive={activeKpi === 'active'}
          onClick={() => handleKpiClick('active')}
        />
        <KpiCard
          icon={CheckCircle2}
          label="Completed"
          value={kpis.completed}
          gradient="bg-gradient-to-br from-emerald-500 to-green-600"
          isActive={activeKpi === 'completed'}
          onClick={() => handleKpiClick('completed')}
        />
        <KpiCard
          icon={XCircle}
          label="Cancelled"
          value={kpis.cancelled}
          gradient="bg-gradient-to-br from-red-500 to-rose-600"
          isActive={activeKpi === 'cancelled'}
          onClick={() => handleKpiClick('cancelled')}
        />
        <KpiCard
          icon={Package}
          label="Est. Value"
          value={formatCurrency(kpis.totalValue)}
          gradient="bg-gradient-to-br from-[#12335f] to-indigo-600"
          isActive={false}
          onClick={() => {}}
        />
      </section>

      {/* ── Filters Bar ── */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search */}
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search by title, reference, category..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-4 text-sm font-medium text-slate-900 outline-none transition-colors focus:border-[#12335f] focus:bg-white focus:ring-1 focus:ring-[#12335f]/20"
            />
          </div>

          {/* Type Filter */}
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 shrink-0 text-slate-400" />
            <select
              value={typeFilter}
              onChange={e => setTypeFilter(e.target.value)}
              className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none transition-colors focus:border-[#12335f] focus:ring-1 focus:ring-[#12335f]/20"
            >
              {TYPE_FILTERS.map(f => (
                <option key={f.key} value={f.key}>
                  {f.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setActiveKpi(e.target.value || null);
            }}
            className="h-10 rounded-lg border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-700 outline-none transition-colors focus:border-[#12335f] focus:ring-1 focus:ring-[#12335f]/20"
          >
            {STATUS_FILTERS.map(f => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>

          {/* Clear Filters */}
          {hasActiveFilters && (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setTypeFilter('');
                setStatusFilter('');
                setSearchQuery('');
                setActiveKpi(null);
              }}
              className="h-10 rounded-lg border-red-200 text-xs font-black uppercase text-red-600 hover:bg-red-50"
            >
              <XCircle className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          )}
        </div>

        {/* Active Filter Chips */}
        {hasActiveFilters && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-100 pt-3">
            <span className="text-[10px] font-black uppercase tracking-wide text-slate-400">Active:</span>
            {typeFilter && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#12335f]/20 bg-[#12335f]/5 px-2.5 py-0.5 text-[10px] font-bold text-[#12335f]">
                Type: {TYPE_FILTERS.find(f => f.key === typeFilter)?.label}
                <button onClick={() => setTypeFilter('')} className="ml-0.5 hover:text-red-600">×</button>
              </span>
            )}
            {statusFilter && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#12335f]/20 bg-[#12335f]/5 px-2.5 py-0.5 text-[10px] font-bold text-[#12335f]">
                Status: {STATUS_FILTERS.find(f => f.key === statusFilter)?.label}
                <button onClick={() => { setStatusFilter(''); setActiveKpi(null); }} className="ml-0.5 hover:text-red-600">×</button>
              </span>
            )}
            {searchQuery && (
              <span className="inline-flex items-center gap-1 rounded-full border border-[#12335f]/20 bg-[#12335f]/5 px-2.5 py-0.5 text-[10px] font-bold text-[#12335f]">
                Search: "{searchQuery}"
                <button onClick={() => setSearchQuery('')} className="ml-0.5 hover:text-red-600">×</button>
              </span>
            )}
          </div>
        )}
      </section>

      {/* ── Content ── */}
      {loading ? (
        <section className="flex h-[400px] items-center justify-center rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[#12335f]" />
            <p className="text-sm font-semibold text-slate-500">Loading procurements…</p>
          </div>
        </section>
      ) : displayData.length > 0 ? (
        <>
          {/* ═══ LIST VIEW ═══ */}
          {viewMode === 'list' && (
            <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80">
                      <th className="w-[50px] px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
                        #
                      </th>
                      <ThSort sortKey="title" currentSort={sortKey} sortDir={sortDir} onSort={handleSort}>
                        Title
                      </ThSort>
                      <ThSort sortKey="type" currentSort={sortKey} sortDir={sortDir} onSort={handleSort}>
                        Type
                      </ThSort>
                      <ThSort sortKey="referenceNumber" currentSort={sortKey} sortDir={sortDir} onSort={handleSort}>
                        Ref. No.
                      </ThSort>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Linked ID
                      </th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Method
                      </th>
                      <ThSort sortKey="status" currentSort={sortKey} sortDir={sortDir} onSort={handleSort}>
                        Status
                      </ThSort>
                      <ThSort sortKey="estimatedValue" currentSort={sortKey} sortDir={sortDir} onSort={handleSort}>
                        Est. Value
                      </ThSort>
                      <th className="px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Category
                      </th>
                      <ThSort sortKey="updatedAt" currentSort={sortKey} sortDir={sortDir} onSort={handleSort}>
                        Updated
                      </ThSort>
                      <th className="px-4 py-3 text-right text-[10px] font-black uppercase tracking-wide text-slate-500">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayData.map((p, idx) => (
                      <tr
                        key={`${p.type}-${p.id}`}
                        className="cursor-pointer transition-colors hover:bg-slate-50/80"
                        onClick={() => openDetail(p)}
                      >
                        <td className="px-4 py-3 text-center text-xs font-bold text-slate-400">
                          {idx + 1}
                        </td>
                        <td className="max-w-[280px] px-4 py-3 font-bold text-slate-900">
                          <span className="line-clamp-2 break-words whitespace-normal">{p.title}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide',
                              TYPE_BADGE_STYLES[p.type] || 'border-slate-200 bg-slate-50 text-slate-700'
                            )}
                          >
                            {p.typeLabel}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-semibold text-slate-500 tabular-nums">
                          {p.referenceNumber}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs font-bold text-[#12335f] tabular-nums">
                          {p.id}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex whitespace-nowrap rounded-md border border-[#12335f]/15 bg-[#12335f]/5 px-2 py-0.5 text-[9px] font-black uppercase tracking-wide text-[#12335f]">
                            {p.methodLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={cn(
                              'inline-flex whitespace-nowrap rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide',
                              STATUS_BADGE_STYLES[p.statusGroup] || 'border-slate-200 bg-slate-50 text-slate-700'
                            )}
                          >
                            {p.statusLabel}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-bold text-slate-900 tabular-nums">
                          {formatCurrency(p.estimatedValue)}
                        </td>
                        <td className="max-w-[180px] px-4 py-3 text-xs text-slate-600">
                          <span className="line-clamp-2 break-words whitespace-normal">{p.category || '—'}</span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-xs text-slate-500">
                          {formatDateTime(p.updatedAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              type="button"
                              size="sm"
                              onClick={e => openDetail(p, e)}
                              className="h-7 rounded bg-[#12335f] px-3 text-[10px] font-black uppercase text-white hover:bg-[#0b2445]"
                            >
                              <Eye className="mr-1 h-3 w-3" /> View
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="border-t border-slate-200 bg-slate-50/80 px-4 py-2.5">
                <p className="text-xs font-semibold text-slate-500">
                  {displayData.length} procurement{displayData.length !== 1 ? 's' : ''} shown
                  {hasActiveFilters ? ` (filtered from ${kpis.totalProcurements} total)` : ''}
                </p>
              </div>
            </section>
          )}

          {/* ═══ GRID VIEW ═══ */}
          {viewMode === 'grid' && (
            <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayData.map(p => (
                <button
                  key={`${p.type}-${p.id}`}
                  onClick={() => openDetail(p)}
                  className="group flex flex-col rounded-xl border border-slate-200 bg-white p-4 text-left shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-[#12335f]/30 hover:shadow-md"
                >
                  {/* Top row: type badge + ref number */}
                  <div className="flex items-center justify-between gap-2">
                    <span
                      className={cn(
                        'inline-flex rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide',
                        TYPE_BADGE_STYLES[p.type] || 'border-slate-200 bg-slate-50 text-slate-700'
                      )}
                    >
                      {p.typeLabel}
                    </span>
                    <div className="text-right">
                      <span className="text-[10px] font-semibold text-slate-400 tabular-nums block">
                        Ref: {p.referenceNumber}
                      </span>
                      <span className="text-[9px] font-bold text-[#12335f] block">
                        Linked ID: {p.id}
                      </span>
                    </div>
                  </div>

                  {/* Title */}
                  <h3 className="mt-2.5 line-clamp-2 text-sm font-bold leading-snug text-slate-900 group-hover:text-[#12335f]">
                    {p.title}
                  </h3>

                  {/* Method + Category */}
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    <span className="inline-flex rounded-md border border-[#12335f]/15 bg-[#12335f]/5 px-2 py-0.5 text-[8px] font-black uppercase tracking-wide text-[#12335f]">
                      {p.methodLabel}
                    </span>
                    {p.category && (
                      <span className="text-[10px] font-medium text-slate-500">{p.category}</span>
                    )}
                  </div>

                  {/* Bottom row: status, value, date */}
                  <div className="mt-auto flex items-center justify-between gap-2 pt-3 border-t border-slate-100 mt-3">
                    <span
                      className={cn(
                        'inline-flex rounded-md border px-2 py-0.5 text-[8px] font-black uppercase tracking-wide',
                        STATUS_BADGE_STYLES[p.statusGroup] || 'border-slate-200 bg-slate-50 text-slate-700'
                      )}
                    >
                      {p.statusLabel}
                    </span>
                    <div className="text-right">
                      <p className="text-xs font-bold text-slate-900 tabular-nums">
                        {formatCurrency(p.estimatedValue)}
                      </p>
                      <p className="text-[10px] text-slate-400">{formatDateTime(p.updatedAt)}</p>
                    </div>
                  </div>
                </button>
              ))}
            </section>
          )}
        </>
      ) : (
        /* ── Empty State ── */
        <section className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-xl bg-slate-50 text-[#12335f]">
            <ClipboardList className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-lg font-black text-slate-950">
            {hasActiveFilters ? 'No procurements match your filters' : 'No procurements yet'}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-500">
            {hasActiveFilters
              ? 'Try adjusting your filters or clearing them to see all procurements.'
              : 'Start a procurement process from the Buying Dashboard. Your bids, tenders, direct purchases, and requirements will appear here.'}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            {hasActiveFilters && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTypeFilter('');
                  setStatusFilter('');
                  setSearchQuery('');
                  setActiveKpi(null);
                }}
                className="h-10 rounded-lg text-xs font-black uppercase"
              >
                Clear Filters
              </Button>
            )}
            <Button
              type="button"
              onClick={() => router.push('/buyer/procurement')}
              className="h-10 rounded-lg bg-[#12335f] px-5 text-xs font-black uppercase text-white hover:bg-[#0b2445]"
            >
              Go to Buying Dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>
      )}

      {/* ═══ PROCUREMENT DETAIL DIALOG ═══ */}
      {detailOpen && selectedProcurement && (
        <ProcurementDetailDialog
          procurement={selectedProcurement}
          onClose={closeDetail}
          onGoTo={() => {
            closeDetail();
            router.push(selectedProcurement.actionUrl);
          }}
        />
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════
   PROCUREMENT DETAIL DIALOG
   ═══════════════════════════════════════════════ */

function ProcurementDetailDialog({
  procurement: p,
  onClose,
  onGoTo,
}: {
  procurement: NormalizedProcurement;
  onClose: () => void;
  onGoTo: () => void;
}) {
  // Close on Escape key
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const DetailItem = ({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string | number | null }) => {
    if (!value && value !== 0) return null;
    return (
      <div className="flex items-start gap-2.5 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#12335f]">
          <Icon className="h-3.5 w-3.5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{label}</p>
          <p className="mt-0.5 text-xs font-bold text-slate-800 break-words whitespace-pre-wrap leading-relaxed">{value}</p>
        </div>
      </div>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 overflow-y-auto"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-3xl my-8 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl animate-in fade-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 bg-white px-6 py-5 shrink-0">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span
                className={cn(
                  'inline-flex rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide',
                  TYPE_BADGE_STYLES[p.type] || 'border-slate-200 bg-slate-50 text-slate-700'
                )}
              >
                {p.typeLabel}
              </span>
              <span
                className={cn(
                  'inline-flex rounded-md border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide',
                  STATUS_BADGE_STYLES[p.statusGroup] || 'border-slate-200 bg-slate-50 text-slate-700'
                )}
              >
                {p.statusLabel}
              </span>
            </div>
            <h2 className="text-xl font-black text-slate-950 leading-snug break-words">{p.title}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors border border-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="overflow-y-auto p-6 space-y-6 flex-1">
          
          {/* Section 1: Overview Grid */}
          <div>
            <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
              <Info className="h-3.5 w-3.5 text-slate-400" />
              General Details
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              <DetailItem icon={Hash} label="Reference Number" value={p.referenceNumber} />
              <DetailItem icon={Layers} label="Procurement Method" value={p.methodLabel} />
              <DetailItem icon={Tag} label="Category" value={p.category} />
              <DetailItem icon={IndianRupee} label="Estimated Value" value={p.estimatedValue ? formatCurrency(p.estimatedValue) : undefined} />
              <DetailItem icon={Building2} label="Organization" value={p.organizationName} />
              <DetailItem icon={MapPin} label="Delivery Location" value={p.deliveryLocation} />
              <DetailItem icon={Package} label="Total Quantity" value={p.quantity && p.unit ? `${p.quantity} ${p.unit}` : p.quantity} />
              <DetailItem icon={CalendarDays} label="Start Date" value={p.startDate ? formatDateTime(p.startDate) : undefined} />
              <DetailItem icon={CalendarDays} label="End / Closing Date" value={p.endDate ? formatDateTime(p.endDate) : undefined} />
              <DetailItem icon={CalendarDays} label="Created On" value={formatDateTime(p.createdAt)} />
              <DetailItem icon={CalendarDays} label="Last Updated" value={formatDateTime(p.updatedAt)} />
            </div>
            {p.description && (
              <div className="mt-3 p-3 rounded-xl border border-slate-100 bg-slate-50/50">
                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">Detailed Scope / Description</p>
                <p className="mt-1 text-xs font-semibold text-slate-700 leading-relaxed break-words whitespace-pre-wrap">{p.description}</p>
              </div>
            )}
          </div>

          {/* Section 2: Items Requested Table */}
          {p.items && p.items.length > 0 && (
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <Package className="h-3.5 w-3.5 text-slate-400" />
                Items & Specifications
              </h3>
              <div className="overflow-hidden border border-slate-200 rounded-xl bg-white shadow-sm">
                <table className="w-full text-left border-collapse">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500">Item Name</th>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 w-24 text-right">Quantity</th>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 w-24">Unit</th>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {p.items.map((item, idx) => (
                      <tr key={idx} className="hover:bg-slate-50/30 transition-colors">
                        <td className="px-4 py-3 text-xs font-bold text-slate-900">{item.itemName}</td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-900 text-right">{item.quantity}</td>
                        <td className="px-4 py-3 text-xs font-bold text-slate-500">{item.unitOfMeasure || 'Nos'}</td>
                        <td className="px-4 py-3 text-xs font-medium text-slate-500 break-words max-w-xs">{item.description || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section 3: Terms & Special Conditions */}
          {((p.paymentTerms) || (p.eligibilityCriteria && p.eligibilityCriteria.length > 0) || (p.termsAndConditions && p.termsAndConditions.length > 0)) && (
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-3 flex items-center gap-1.5">
                <ClipboardCheck className="h-3.5 w-3.5 text-slate-400" />
                Terms & Conditions
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Eligibility Criteria */}
                {p.eligibilityCriteria && p.eligibilityCriteria.length > 0 && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm">
                    <p className="text-[10px] font-black uppercase tracking-wider text-[#12335f] mb-2">Eligibility Criteria</p>
                    <ul className="list-disc pl-4 space-y-1.5">
                      {p.eligibilityCriteria.map((c, idx) => (
                        <li key={idx} className="text-xs font-medium text-slate-600 leading-normal">{c}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Terms and Conditions / Special terms */}
                {((p.paymentTerms) || (p.termsAndConditions && p.termsAndConditions.length > 0)) && (
                  <div className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm space-y-3">
                    {p.paymentTerms && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-[#12335f]">Payment Terms</p>
                        <p className="mt-1 text-xs font-bold text-slate-700 leading-normal">{p.paymentTerms}</p>
                      </div>
                    )}
                    {p.termsAndConditions && p.termsAndConditions.length > 0 && (
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-wider text-[#12335f] mb-1.5">Special Terms</p>
                        <ul className="list-disc pl-4 space-y-1.5">
                          {p.termsAndConditions.map((t, idx) => (
                            <li key={idx} className="text-xs font-medium text-slate-600 leading-normal">{t}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Section 4: Attachments */}
          {p.documents && p.documents.length > 0 && (
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
                <Paperclip className="h-3.5 w-3.5 text-slate-400" />
                Attachments & Documents
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {p.documents.map((doc, idx) => (
                  <a
                    key={idx}
                    href={`/api/files/${doc.fileAssetId}/view`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50/50 hover:bg-slate-100 hover:border-slate-300 transition-all text-xs font-bold text-[#12335f] group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#12335f] group-hover:bg-[#12335f] group-hover:text-white transition-all">
                        <FileText className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0">
                        <p className="truncate text-slate-700 font-bold">{doc.fileName}</p>
                        <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">{doc.documentType || 'General Document'}</p>
                      </div>
                    </div>
                    <Download className="h-4 w-4 shrink-0 text-slate-400 group-hover:text-[#12335f] transition-colors ml-2" />
                  </a>
                ))}
              </div>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50 px-6 py-4 shrink-0">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            className="h-9 rounded-lg text-xs font-black uppercase"
          >
            Close
          </Button>
          <Button
            type="button"
            onClick={onGoTo}
            className="h-9 rounded-lg bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]"
          >
            <ExternalLink className="mr-1.5 h-3.5 w-3.5" /> Go to Procurement
          </Button>
        </div>
      </div>
    </div>
  );
}
