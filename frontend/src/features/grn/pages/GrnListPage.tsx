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
    if (!canViewGrns) {
        return <InlineError message="You do not have permission to view goods receipt notes." />;
    }
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
        <div className="space-y-5">
            <div className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 shadow-sm sm:p-5">
            <div className="brand-tricolor-strip rounded-full" />
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Fulfillment</p>
                    <h1 className="text-2xl font-black text-slate-950">Goods Receipt Notes</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Record received goods, run inspection, approve to trigger seller invoice.
                    </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                    <ViewModeToggle value={viewMode} onChange={setViewMode} />
                    <Button variant="outline" onClick={() => refetch()} className="h-10 rounded-lg text-xs font-black uppercase">
                        <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    {canCreate && (
                        <Button onClick={() => setShowCreate(true)} className="bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                            <Plus className="mr-2 h-4 w-4" /> New GRN
                        </Button>
                    )}
                </div>
            </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Metric label="Total" value={counts.ALL} icon={ClipboardList} active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
                <Metric label="Draft" value={counts.DRAFT} icon={Clock} active={filter === 'DRAFT'} onClick={() => setFilter('DRAFT')} />
                <Metric label="Submitted" value={counts.SUBMITTED} icon={FileCheck2} active={filter === 'SUBMITTED'} onClick={() => setFilter('SUBMITTED')} />
                <Metric label="Approved" value={counts.APPROVED + counts.PARTIAL} icon={CheckCircle2} active={filter === 'APPROVED'} onClick={() => setFilter('APPROVED')} />
                <Metric label="Rejected" value={counts.REJECTED} icon={XCircle} active={filter === 'REJECTED'} onClick={() => setFilter('REJECTED')} />
            </div>

            {error && <InlineError message={(error as Error).message} onRetry={() => refetch()} />}

            {grns.length > 0 && (
                <Card className="rounded-2xl border-slate-200/80 bg-white/92 shadow-sm">
                    <CardContent className="p-4">
                        <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-center">
                            <div className="relative">
                                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                                <input
                                    value={search}
                                    onChange={event => { setSearch(event.target.value); setPage(1); }}
                                    placeholder="Search GRN, PO, seller, receiver, status..."
                                    className="h-10 w-full rounded-lg border border-slate-200 bg-slate-50 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                                />
                            </div>
                            <Button
                                variant="outline"
                                className="h-10 rounded-lg text-xs font-black uppercase"
                                onClick={() => { setSearch(''); setFilter('ALL'); setPage(1); }}
                            >
                                Reset
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            {isLoading ? (
                <LoadingState label="Loading GRNs..." />
            ) : grns.length === 0 ? (
                <Card className="rounded-2xl border-slate-200/80 bg-white/92 shadow-sm"><CardContent className="py-12">
                    <EmptyState title="No GRNs found" description="Create one against an active Purchase Order to record the receipt of goods." />
                </CardContent></Card>
            ) : pageItems.length === 0 ? (
                <Card className="rounded-2xl border-slate-200/80 bg-white/92 shadow-sm"><CardContent className="py-12">
                    <EmptyState title="No GRNs match these filters" description="Clear the search or status card filter to see all goods receipt notes." />
                </CardContent></Card>
            ) : viewMode === 'grid' ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {pageItems.map((g: any) => (
                        <button
                            type="button"
                            key={g.id}
                            onClick={() => router.push(`/grn/${g.id}`)}
                            className="rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#12335f]/30 hover:shadow-lg"
                        >
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-[#c86413]">{g.grnNumber}</p>
                                    <h2 className="mt-1 text-sm font-black text-slate-950">{g.purchaseOrder?.poNumber || 'Purchase Order'}</h2>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">{g.purchaseOrder?.title}</p>
                                </div>
                                <StatusPill status={g.status} />
                            </div>
                            <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-600">
                                <p><span className="font-black text-slate-900">Seller:</span> {g.purchaseOrder?.seller?.name || '-'}</p>
                                <p><span className="font-black text-slate-900">Items:</span> {g.items.length} line{g.items.length === 1 ? '' : 's'}</p>
                                <p><span className="font-black text-slate-900">Received:</span> {formatDateTime(g.receivedAt)}</p>
                                <p><span className="font-black text-slate-900">Updated:</span> {formatRelative(g.updatedAt)}</p>
                            </div>
                        </button>
                    ))}
                </div>
            ) : (
                <Card className="overflow-hidden rounded-2xl border-slate-200/80 bg-white/92 shadow-sm">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[920px] text-sm">
                                <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left w-12">#</th>
                                        <th className="px-4 py-2.5 text-left w-44"><SortableHeader label="GRN ID" field="grnNumber" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left"><SortableHeader label="Purchase Order" field="poNumber" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left w-32"><SortableHeader label="Items" field="items" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left w-32"><SortableHeader label="Status" field="status" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left w-44"><SortableHeader label="Received" field="receivedAt" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left w-44"><SortableHeader label="Updated" field="updatedAt" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {pageItems.map((g, idx) => (
                                        <tr key={g.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => router.push(`/grn/${g.id}`)}>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-400">{String((page - 1) * pageSize + idx + 1).padStart(2, '0')}</td>
                                            <td className="px-4 py-3" onClick={e => e.stopPropagation()}>
                                                <EntityIdLink label={g.grnNumber} id={g.id} size="sm" onClick={() => router.push(`/grn/${g.id}`)} />
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-xs font-black text-slate-900 text-wrap-anywhere">{g.purchaseOrder?.poNumber}</p>
                                                <p className="text-[10px] font-semibold text-slate-500 text-wrap-anywhere">{g.purchaseOrder?.title}</p>
                                                <p className="text-[10px] text-slate-400">Seller: {g.purchaseOrder?.seller?.name}</p>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                                                {g.items.length} line{g.items.length === 1 ? '' : 's'}
                                            </td>
                                            <td className="px-4 py-3">
                                                <StatusPill status={g.status} />
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                                                <p>{formatDateTime(g.receivedAt)}</p>
                                                <p className="text-[10px] text-slate-400">by {g.receivedBy.name}</p>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                                                <p>{formatDateTime(g.updatedAt)}</p>
                                                <p className="text-[10px] text-slate-400">{formatRelative(g.updatedAt)}</p>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </CardContent>
                </Card>
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

function Metric({ label, value, icon: Icon, active, onClick }: { label: string; value: number; icon: any; active?: boolean; onClick?: () => void }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`text-left rounded-xl border p-4 transition ${active ? 'border-[#12335f] bg-[#12335f]/5 ring-1 ring-[#12335f]/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}
        >
            <div className="flex items-center justify-between">
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                <Icon className={`h-4 w-4 ${active ? 'text-[#12335f]' : 'text-slate-400'}`} />
            </div>
            <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
        </button>
    );
}
