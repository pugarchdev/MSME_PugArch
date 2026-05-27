/**
 * GrnListPage — list of all GRNs in the user's organisation.
 *
 * Route: /grn
 */
import { useState } from 'react';
import {
    CheckCircle2, ClipboardList, Clock, FileCheck2, Loader2, Plus, RefreshCw, XCircle
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { useOrgRole } from '../../../hooks/useOrgRole';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDateTime, formatRelative } from '../../shared/format';
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

export default function GrnListPage() {
    const router = useRouter();
    const { hasMinRole } = useOrgRole();
    const [filter, setFilter] = useState<GrnStatus | 'ALL'>('ALL');
    const [showCreate, setShowCreate] = useState(false);
    const { data, isLoading, error, refetch, isFetching } = useGrns(filter === 'ALL' ? undefined : filter);

    const grns = data || [];
    const canCreate = hasMinRole('LOGISTICS_OFFICER');

    const counts = {
        ALL: grns.length,
        DRAFT: grns.filter(g => g.status === 'DRAFT').length,
        SUBMITTED: grns.filter(g => g.status === 'SUBMITTED').length,
        APPROVED: grns.filter(g => g.status === 'APPROVED').length,
        PARTIAL: grns.filter(g => g.status === 'PARTIAL').length,
        REJECTED: grns.filter(g => g.status === 'REJECTED').length
    };

    return (
        <div className="space-y-4">
            <div className="brand-tricolor-strip rounded-full" />
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Fulfillment</p>
                    <h1 className="text-2xl font-black text-slate-950">Goods Receipt Notes</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Record received goods, run inspection, approve to trigger seller invoice.
                    </p>
                </div>
                <div className="flex items-center gap-2">
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

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <Metric label="Total" value={counts.ALL} icon={ClipboardList} active={filter === 'ALL'} onClick={() => setFilter('ALL')} />
                <Metric label="Draft" value={counts.DRAFT} icon={Clock} active={filter === 'DRAFT'} onClick={() => setFilter('DRAFT')} />
                <Metric label="Submitted" value={counts.SUBMITTED} icon={FileCheck2} active={filter === 'SUBMITTED'} onClick={() => setFilter('SUBMITTED')} />
                <Metric label="Approved" value={counts.APPROVED + counts.PARTIAL} icon={CheckCircle2} active={filter === 'APPROVED'} onClick={() => setFilter('APPROVED')} />
                <Metric label="Rejected" value={counts.REJECTED} icon={XCircle} active={filter === 'REJECTED'} onClick={() => setFilter('REJECTED')} />
            </div>

            {error && <InlineError message={(error as Error).message} onRetry={() => refetch()} />}

            {isLoading ? (
                <LoadingState label="Loading GRNs..." />
            ) : grns.length === 0 ? (
                <Card><CardContent className="py-12">
                    <EmptyState title="No GRNs found" description="Create one against an active Purchase Order to record the receipt of goods." />
                </CardContent></Card>
            ) : (
                <Card className="border-slate-200/80 shadow-sm">
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[920px] text-sm">
                                <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left w-12">#</th>
                                        <th className="px-4 py-2.5 text-left w-44">GRN ID</th>
                                        <th className="px-4 py-2.5 text-left">Purchase Order</th>
                                        <th className="px-4 py-2.5 text-left w-32">Items</th>
                                        <th className="px-4 py-2.5 text-left w-32">Status</th>
                                        <th className="px-4 py-2.5 text-left w-44">Received</th>
                                        <th className="px-4 py-2.5 text-left w-44">Updated</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {grns.map((g, idx) => (
                                        <tr key={g.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => router.push(`/grn/${g.id}`)}>
                                            <td className="px-4 py-3 font-mono text-xs text-slate-400">{String(idx + 1).padStart(2, '0')}</td>
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
                                                <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[g.status]}`}>
                                                    {g.status}
                                                </span>
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

            {showCreate && (
                <GrnCreateModal onClose={() => setShowCreate(false)} onCreated={(g) => { setShowCreate(false); router.push(`/grn/${g.id}`); }} />
            )}
        </div>
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
