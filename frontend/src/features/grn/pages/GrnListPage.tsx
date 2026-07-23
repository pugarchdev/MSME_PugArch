/**
 * GrnListPage — list of all GRNs in the user's organisation.
 *
 * Route: /grn
 */
import { useMemo, useState } from 'react';
import { CheckCircle2, ClipboardList, Clock, FileCheck2, Plus, RefreshCw, Search, XCircle } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { useRouter } from 'next/navigation';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { usePermissions } from '../../../hooks/useOrgRole';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatDateTime, formatRelative } from '../../shared/format';
import { Pagination } from '../../shared/Pagination';
import { usePagination, useResponsiveViewMode } from '../../shared/hooks';
import { SortableHeader, type SortDirection } from '../../shared/SortableHeader';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useGrns } from '../hooks';
import type { GrnStatus } from '../api';
import { GrnCreateModal } from '../components/GrnCreateModal';

const STATUS_TONE: Record<GrnStatus, string> = {
    DRAFT: 'border-slate-200 bg-slate-50 text-slate-600',
    SUBMITTED: 'border-amber-200 bg-amber-50 text-amber-700',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    REJECTED: 'border-red-200 bg-red-50 text-red-700',
    PARTIAL: 'border-blue-200 bg-blue-50 text-blue-700'
};
type GrnSortKey = 'grnNumber' | 'poNumber' | 'seller' | 'items' | 'status' | 'receivedAt' | 'updatedAt';

export default function GrnListPage() {
    const router = useRouter();
    const { hasPermission } = usePermissions();
    const [filter, setFilter] = useState<GrnStatus | 'ALL'>('ALL');
    const [showCreate, setShowCreate] = useState(false);
    const [search, setSearch] = useState('');
    const [sortKey, setSortKey] = useState<GrnSortKey>('updatedAt');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    const [viewMode, setViewMode] = useResponsiveViewMode('phase7:grn-list:view-mode');
    const canViewGrns = hasPermission('grn.view');
    const canCreate = hasPermission('grn.create');
    const { data, isLoading, error, refetch, isFetching } = useGrns(filter === 'ALL' ? undefined : filter, { enabled: canViewGrns });

    const grns = data || [];

    const visibleGrns = useMemo(() => {
        const text = search.trim().toLowerCase();
        return [...grns].filter(g => {
            const haystack = [
                g.grnNumber,
                g.status,
                g.purchaseOrder?.poNumber,
                g.purchaseOrder?.title,
                g.purchaseOrder?.seller?.name,
                g.receivedBy?.name
            ].join(' ').toLowerCase();
            return !text || haystack.includes(text);
        }).sort((a, b) => {
            const valueFor = (g: any) => {
                if (sortKey === 'grnNumber') return g.grnNumber || '';
                if (sortKey === 'poNumber') return g.purchaseOrder?.poNumber || '';
                if (sortKey === 'seller') return g.purchaseOrder?.seller?.name || '';
                if (sortKey === 'items') return g.items?.length || 0;
                if (sortKey === 'status') return g.status || '';
                if (sortKey === 'receivedAt') return new Date(g.receivedAt || 0).getTime();
                return new Date(g.updatedAt || 0).getTime();
            };
            const av = valueFor(a);
            const bv = valueFor(b);
            const result = typeof av === 'number' && typeof bv === 'number'
                ? av - bv
                : String(av).localeCompare(String(bv));
            return sortDirection === 'asc' ? result : -result;
        });
    }, [grns, search, sortDirection, sortKey]);

    const { page, pageSize, pageItems, total, setPage, setPageSize } = usePagination(visibleGrns, 10);

    if (!canViewGrns) {
        return <InlineError message="You do not have permission to view goods receipt notes." />;
    }

    const toggleSort = (field: GrnSortKey) => {
        setSortDirection(prev => sortKey === field && prev === 'asc' ? 'desc' : 'asc');
        setSortKey(field);
        setPage(1);
    };

    const counts = {
        ALL: grns.length,
        DRAFT: grns.filter(g => g.status === 'DRAFT').length,
        SUBMITTED: grns.filter(g => g.status === 'SUBMITTED').length,
        APPROVED: grns.filter(g => g.status === 'APPROVED').length,
        PARTIAL: grns.filter(g => g.status === 'PARTIAL').length,
        REJECTED: grns.filter(g => g.status === 'REJECTED').length
    };

    return (
        <div className="space-y-6">
            {/* Transparent Header */}
            <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between py-2">
                <div className="min-w-0">
                    <span className="text-[10px] font-black uppercase tracking-widest text-[#12335f] bg-[#12335f]/10 px-2.5 py-1 rounded-full">Fulfillment</span>
                    <h1 className="text-3xl font-black tracking-tight text-slate-900 mt-2">Goods Receipt Notes</h1>
                    <p className="text-xs font-semibold text-slate-500 mt-1">
                        Record received goods, run inspection, approve to trigger seller invoice.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <ViewModeToggle value={viewMode} onChange={setViewMode} />
                    <Button variant="outline" onClick={() => refetch()} className="h-10 rounded-lg text-xs font-black uppercase bg-white hover:bg-slate-50 border-slate-200 shadow-sm">
                        <RefreshCw className={cn("mr-2 h-4 w-4 text-[#12335f]", isFetching && "animate-spin")} /> Refresh
                    </Button>
                    {canCreate && (
                        <Button onClick={() => setShowCreate(true)} className="h-10 bg-[#12335f] text-white hover:bg-[#0e2a4f] text-xs font-black uppercase rounded-lg shadow-sm">
                            <Plus className="mr-2 h-4 w-4" /> New GRN
                        </Button>
                    )}
                </div>
            </div>

            {/* KPI Cards Grid */}
            <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
                <KpiCard label="Total" value={counts.ALL} icon={ClipboardList} active={filter === 'ALL'} onClick={() => setFilter('ALL')} color="indigo" />
                <KpiCard label="Draft" value={counts.DRAFT} icon={Clock} active={filter === 'DRAFT'} onClick={() => setFilter('DRAFT')} color="slate" />
                <KpiCard label="Submitted" value={counts.SUBMITTED} icon={FileCheck2} active={filter === 'SUBMITTED'} onClick={() => setFilter('SUBMITTED')} color="amber" />
                <KpiCard label="Approved" value={counts.APPROVED + counts.PARTIAL} icon={CheckCircle2} active={filter === 'APPROVED'} onClick={() => setFilter('APPROVED')} color="green" />
                <KpiCard label="Rejected" value={counts.REJECTED} icon={XCircle} active={filter === 'REJECTED'} onClick={() => setFilter('REJECTED')} color="red" />
            </div>

            {error && <InlineError message={(error as Error).message} onRetry={() => refetch()} />}

            {/* Inline Filters Bar */}
            {grns.length > 0 && (
                <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between border-y border-slate-200 bg-slate-50/50 py-3 px-1">
                    <div className="relative min-w-0 flex-1 max-w-md">
                        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input
                            value={search}
                            onChange={event => { setSearch(event.target.value); setPage(1); }}
                            placeholder="Search GRN, PO, seller, receiver, status..."
                            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                        />
                    </div>
                    <Button
                        variant="outline"
                        className="h-10 rounded-lg text-xs font-black uppercase bg-white hover:bg-slate-50 border-slate-200 shadow-sm"
                        onClick={() => { setSearch(''); setFilter('ALL'); setPage(1); }}
                    >
                        Reset
                    </Button>
                </div>
            )}

            {isLoading ? (
                <LoadingState label="Loading GRNs..." />
            ) : grns.length === 0 ? (
                <EmptyState title="No GRNs found" description="Create one against an active Purchase Order to record the receipt of goods." />
            ) : pageItems.length === 0 ? (
                <EmptyState title="No GRNs match these filters" description="Clear the search or status card filter to see all goods receipt notes." />
            ) : viewMode === 'grid' ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {pageItems.map((g: any, index) => {
                        const rowIndex = (page - 1) * pageSize + index + 1;
                        return (
                            <button
                                type="button"
                                key={g.id}
                                onClick={() => router.push(`/grn/${g.id}`)}
                                className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#12335f]/40 hover:shadow-md flex flex-col justify-between"
                            >
                                <div className="w-full space-y-3">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2">
                                                <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 font-mono text-[9px] font-black text-slate-500">
                                                    {String(rowIndex).padStart(2, '0')}
                                                </span>
                                                <span className="text-[10px] font-black uppercase tracking-widest text-[#c86413]">{g.grnNumber}</span>
                                            </div>
                                            <h2 className="mt-2 text-sm font-black text-slate-900 group-hover:text-[#12335f] transition-colors">{g.purchaseOrder?.poNumber || 'Purchase Order'}</h2>
                                            <p className="mt-1 text-xs font-semibold text-slate-500 line-clamp-1">{g.purchaseOrder?.title}</p>
                                        </div>
                                        <StatusPill status={g.status} />
                                    </div>
                                    <div className="grid grid-cols-2 gap-2.5 text-[10px] font-semibold text-slate-500 border-t border-slate-100 pt-3">
                                        <InfoTile label="Seller" value={g.purchaseOrder?.seller?.name || '-'} />
                                        <InfoTile label="Items Count" value={`${g.items.length} line${g.items.length === 1 ? '' : 's'}`} />
                                        <InfoTile label="Received" value={formatDateTime(g.receivedAt)} />
                                        <InfoTile label="Updated" value={formatRelative(g.updatedAt)} />
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            ) : (
                <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[920px] border-collapse text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/75 hover:bg-transparent">
                                    <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 w-16">Sr. No</th>
                                    <th className="p-3 w-44"><SortableHeader label="GRN ID" field="grnNumber" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                    <th className="p-3"><SortableHeader label="Purchase Order" field="poNumber" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                    <th className="p-3 w-32"><SortableHeader label="Items" field="items" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                    <th className="p-3 w-32"><SortableHeader label="Status" field="status" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                    <th className="p-3 w-44"><SortableHeader label="Received" field="receivedAt" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                    <th className="p-3 w-44"><SortableHeader label="Updated" field="updatedAt" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                                {pageItems.map((g, idx) => {
                                    const rowIndex = (page - 1) * pageSize + idx + 1;
                                    return (
                                        <tr key={g.id} className="hover:bg-slate-50/50 transition cursor-pointer" onClick={() => router.push(`/grn/${g.id}`)}>
                                            <td className="p-3 font-mono text-xs text-slate-500">
                                                {String(rowIndex).padStart(2, '0')}
                                            </td>
                                            <td className="p-3" onClick={e => e.stopPropagation()}>
                                                <EntityIdLink label={g.grnNumber} id={g.id} size="sm" onClick={() => router.push(`/grn/${g.id}`)} />
                                            </td>
                                            <td className="p-3">
                                                <p className="text-xs font-black text-slate-900 text-wrap-anywhere">{g.purchaseOrder?.poNumber}</p>
                                                <p className="text-[10px] font-semibold text-slate-500 text-wrap-anywhere">{g.purchaseOrder?.title}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">Seller: {g.purchaseOrder?.seller?.name}</p>
                                            </td>
                                            <td className="p-3 text-xs font-semibold text-slate-700">
                                                {g.items.length} line{g.items.length === 1 ? '' : 's'}
                                            </td>
                                            <td className="p-3">
                                                <StatusPill status={g.status} />
                                            </td>
                                            <td className="p-3 text-xs font-semibold text-slate-700">
                                                <p>{formatDateTime(g.receivedAt)}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">by {g.receivedBy.name}</p>
                                            </td>
                                            <td className="p-3 text-xs font-semibold text-slate-700">
                                                <p>{formatDateTime(g.updatedAt)}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">{formatRelative(g.updatedAt)}</p>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {!isLoading && grns.length > 0 && (
                <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="GRNs" />
            )}

            {showCreate && (
                <GrnCreateModal onClose={() => setShowCreate(false)} onCreated={(g) => { setShowCreate(false); router.push(`/grn/${g.id}`); }} />
            )}
        </div>
    );
}

function StatusPill({ status }: { status: GrnStatus }) {
    return (
        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[status]}`}>
            {status}
        </span>
    );
}

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: any;
  onClick?: () => void;
  active?: boolean;
  color?: 'blue' | 'green' | 'red' | 'purple' | 'amber' | 'indigo' | 'slate';
}

function KpiCard({ label, value, icon: Icon, onClick, active, color = 'slate' }: KpiCardProps) {
  const colorMap = {
    blue: 'border-blue-100 bg-blue-50/50 hover:bg-blue-50 text-blue-700 hover:border-blue-300 ring-blue-600/10',
    green: 'border-green-100 bg-green-50/50 hover:bg-green-50 text-green-700 hover:border-green-300 ring-green-600/10',
    red: 'border-red-100 bg-red-50/50 hover:bg-red-50 text-red-700 hover:border-red-300 ring-red-600/10',
    purple: 'border-purple-100 bg-purple-50/50 hover:bg-purple-50 text-purple-700 hover:border-purple-300 ring-purple-600/10',
    amber: 'border-amber-100 bg-amber-50/50 hover:bg-amber-50 text-amber-700 hover:border-amber-300 ring-amber-600/10',
    indigo: 'border-indigo-100 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700 hover:border-indigo-300 ring-indigo-600/10',
    slate: 'border-slate-100 bg-slate-50/50 hover:bg-slate-50 text-slate-700 hover:border-slate-300 ring-slate-600/10',
  };

  const activeColorMap = {
    blue: 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20',
    green: 'border-green-500 bg-green-50 text-green-800 ring-2 ring-green-500/20',
    red: 'border-red-500 bg-red-50 text-red-800 ring-2 ring-red-500/20',
    purple: 'border-purple-500 bg-purple-50 text-purple-800 ring-2 ring-purple-500/20',
    amber: 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20',
    indigo: 'border-indigo-500 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-500/20',
    slate: 'border-slate-500 bg-slate-50 text-slate-800 ring-2 ring-slate-500/20',
  };

  const iconBgMap = {
    blue: 'bg-blue-500 text-white',
    green: 'bg-green-500 text-white',
    red: 'bg-red-500 text-white',
    purple: 'bg-purple-500 text-white',
    amber: 'bg-amber-500 text-white',
    indigo: 'bg-indigo-500 text-white',
    slate: 'bg-slate-500 text-white',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl border p-4 shadow-sm transition-all duration-300 flex items-center justify-between',
        active ? activeColorMap[color] : colorMap[color]
      )}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</p>
        <p className="mt-1 text-xl font-black tracking-tight leading-none">{value}</p>
      </div>
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-110', iconBgMap[color])}>
        <Icon className="h-4.5 w-4.5" />
      </div>
    </button>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-xs font-bold text-slate-800">{value || '-'}</p>
    </div>
  );
}
