/**
 * DirectPurchasePage - buyers go straight to a known seller without a tender
 * or RFQ. Shows the request lifecycle from DRAFT → APPROVED → ORDERED, lets
 * the buyer create one with a seller user ID + amount, and offers a
 * one-click "Generate PO" action when the request is approved.
 */

import { useMemo, useState } from 'react';
import { Loader2, Plus, RefreshCw, ShoppingCart, Trash2, Truck, X } from 'lucide-react';
import { Card, CardContent, Badge } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Pagination } from '../../shared/Pagination';
import { PageToolbar } from '../../shared/PageToolbar';
import { ListSkeleton, MetricCardSkeleton } from '../../../components/ui/skeleton';
import { EmptyState, InlineError } from '../../shared/FeatureStates';
import { useAuth } from '../../../hooks/useAuth';
import { formatCurrency, formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { cn } from '../../../lib/utils';
import {
    useCreateDirectPurchase,
    useDeleteDirectPurchase,
    useDirectPurchase,
    useDirectPurchases,
    useGeneratePoFromDirectPurchase,
    useUpdateDirectPurchase
} from '../hooks';
import type { DirectPurchaseStatus } from '../types';

const STATUS_TONE: Record<string, string> = {
    DRAFT: 'border-slate-200 bg-slate-50 text-slate-700',
    PENDING_APPROVAL: 'border-amber-200 bg-amber-50 text-amber-700',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    REJECTED: 'border-red-200 bg-red-50 text-red-700',
    ORDERED: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    CANCELLED: 'border-slate-200 bg-slate-100 text-slate-500'
};

export default function DirectPurchasePage() {
    const { user } = useAuth();
    const isBuyer = user?.role === 'buyer';

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [q, setQ] = useState('');
    const [status, setStatus] = useState('');
    const [openId, setOpenId] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);

    const list = useDirectPurchases({ q: q || undefined, status: status || undefined, page, pageSize });
    const records = list.data?.records || [];
    const total = list.data?.total || 0;

    const counters = useMemo(() => {
        const drafts = records.filter(r => r.status === 'DRAFT').length;
        const approved = records.filter(r => r.status === 'APPROVED').length;
        const ordered = records.filter(r => r.status === 'ORDERED').length;
        return { drafts, approved, ordered };
    }, [records]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement · Direct Purchase</p>
                    <h1 className="text-2xl font-black tracking-tight text-slate-950">Direct Purchases</h1>
                    <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
                        Single-vendor procurements without a tender or RFQ. Use this for low-value or sole-source buys; convert an approved request into a Purchase Order in one click.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => list.refetch()} className="h-10 rounded-lg text-xs font-black uppercase">
                        <RefreshCw className={cn('mr-2 h-4 w-4', list.isFetching && 'animate-spin')} /> Refresh
                    </Button>
                    {isBuyer && (
                        <Button onClick={() => setCreating(true)} className="bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                            <Plus className="mr-2 h-4 w-4" /> New Direct Purchase
                        </Button>
                    )}
                </div>
            </div>

            {list.isLoading && !list.data ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[1, 2, 3, 4].map(i => <MetricCardSkeleton key={i} />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Metric label="Total" value={total} hint="In current view" tone="neutral" icon={ShoppingCart} />
                    <Metric label="Drafts" value={counters.drafts} hint="Not yet submitted" tone="warning" icon={ShoppingCart} />
                    <Metric label="Approved" value={counters.approved} hint="Ready to order" tone="positive" icon={ShoppingCart} />
                    <Metric label="Ordered" value={counters.ordered} hint="PO generated" tone="neutral" icon={Truck} />
                </div>
            )}

            <PageToolbar
                eyebrow="Filters"
                search={q}
                onSearchChange={setQ}
                searchPlaceholder="Search by purchase number, seller"
                filters={[
                    {
                        kind: 'select',
                        value: status,
                        onChange: setStatus,
                        placeholder: 'All statuses',
                        options: [
                            { value: 'DRAFT', label: 'Draft' },
                            { value: 'PENDING_APPROVAL', label: 'Pending Approval' },
                            { value: 'APPROVED', label: 'Approved' },
                            { value: 'REJECTED', label: 'Rejected' },
                            { value: 'ORDERED', label: 'Ordered' },
                            { value: 'CANCELLED', label: 'Cancelled' }
                        ]
                    }
                ]}
                onReset={() => {
                    setQ('');
                    setStatus('');
                }}
            />

            {list.error && (
                <InlineError
                    message={list.error instanceof Error ? list.error.message : 'Failed to load direct purchases'}
                    onRetry={() => list.refetch()}
                />
            )}

            {list.isLoading && !list.data ? (
                <ListSkeleton rows={4} />
            ) : records.length === 0 ? (
                <EmptyState
                    title="No direct purchases yet"
                    description={isBuyer ? 'Create your first request from a known vendor.' : 'No requests visible.'}
                />
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[920px] text-sm">
                                <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left w-12">#</th>
                                        <th className="px-4 py-2.5 text-left w-44">Purchase ID</th>
                                        <th className="px-4 py-2.5 text-left">Buyer</th>
                                        <th className="px-4 py-2.5 text-left">Seller</th>
                                        <th className="px-4 py-2.5 text-right w-32">Amount</th>
                                        <th className="px-4 py-2.5 text-left w-32">Status</th>
                                        <th className="px-4 py-2.5 text-left w-44">Requested</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {records.map((dp, idx) => (
                                        <tr key={dp.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => setOpenId(dp.id)}>
                                            <td className="px-4 py-3 text-xs font-mono text-slate-400">
                                                {String((page - 1) * pageSize + idx + 1).padStart(2, '0')}
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    type="button"
                                                    className="font-mono text-[11px] font-black text-[#12335f] hover:underline text-wrap-anywhere"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setOpenId(dp.id);
                                                    }}
                                                >
                                                    {dp.purchaseNumber}
                                                </button>
                                                <p className="mt-0.5 text-[9px] font-mono text-slate-400">#{dp.id}</p>
                                            </td>
                                            <td className="px-4 py-3 text-xs text-wrap-anywhere">
                                                <p className="font-bold text-slate-900">{dp.buyer?.name || `Buyer #${dp.buyerId}`}</p>
                                                {dp.buyer?.email && <p className="text-[10px] text-slate-500">{dp.buyer.email}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-wrap-anywhere">
                                                <p className="font-bold text-slate-900">{dp.seller?.name || `Seller #${dp.sellerId}`}</p>
                                                {dp.seller?.email && <p className="text-[10px] text-slate-500">{dp.seller.email}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs font-bold text-slate-900">{formatCurrency(dp.totalAmount)}</td>
                                            <td className="px-4 py-3">
                                                <Badge className={cn('rounded-md px-2 py-0.5 text-[10px] font-black uppercase', STATUS_TONE[dp.status as string] || STATUS_TONE.DRAFT)}>
                                                    {String(dp.status).replace(/_/g, ' ')}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                                                <p>{formatDateTime(dp.requestedAt || dp.createdAt)}</p>
                                                <p className="text-[10px] text-slate-400">{formatRelative(dp.requestedAt || dp.createdAt)}</p>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <Pagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onPageChange={setPage}
                            onPageSizeChange={setPageSize}
                            label="direct purchases"
                        />
                    </CardContent>
                </Card>
            )}

            {openId !== null && <DirectPurchaseDetail id={openId} onClose={() => setOpenId(null)} />}
            {creating && isBuyer && <DirectPurchaseCreator onClose={() => setCreating(false)} />}
        </div>
    );
}

/* ---------- Detail ---------- */

function DirectPurchaseDetail({ id, onClose }: { id: number; onClose: () => void }) {
    const detail = useDirectPurchase(id);
    const updateMut = useUpdateDirectPurchase();
    const deleteMut = useDeleteDirectPurchase();
    const generatePoMut = useGeneratePoFromDirectPurchase();
    const dp = detail.data;
    const { user } = useAuth();
    const isBuyer = user?.role === 'buyer';

    const change = (status: DirectPurchaseStatus, label: string) =>
        runWithToast(() => updateMut.mutateAsync({ id, data: { status } }), {
            loading: `${label}...`,
            success: `Marked ${label.toLowerCase()}`,
            error: 'Update failed'
        }).then(() => detail.refetch());

    const generate = () =>
        runWithToast(() => generatePoMut.mutateAsync(id), {
            loading: 'Generating purchase order...',
            success: result => {
                const r = result as { purchaseOrder?: { id?: number; poNumber?: string } } | undefined;
                const ref = r?.purchaseOrder?.poNumber || (r?.purchaseOrder?.id ? `#${r.purchaseOrder.id}` : '');
                return `PO ${ref} generated`;
            },
            error: err => (err instanceof Error ? err.message : 'PO generation failed')
        }).then(() => detail.refetch());

    const remove = () => {
        if (!confirm('Delete this direct purchase request? This cannot be undone.')) return;
        runWithToast(() => deleteMut.mutateAsync(id), {
            loading: 'Deleting...',
            success: 'Direct purchase deleted',
            error: 'Delete failed'
        }).then(() => onClose());
    };

    return (
        <Modal title={dp ? `Direct Purchase · ${dp.purchaseNumber}` : 'Direct Purchase'} onClose={onClose} wide>
            {detail.isLoading && !dp ? (
                <ListSkeleton rows={3} />
            ) : !dp ? (
                <EmptyState title="Request not found" />
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <Field label="Internal ID">
                            <code className="block rounded bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">#{dp.id}</code>
                        </Field>
                        <Field label="Status">
                            <Badge className={cn('rounded-md px-2 py-1 text-[10px] font-black uppercase', STATUS_TONE[dp.status as string] || STATUS_TONE.DRAFT)}>
                                {String(dp.status).replace(/_/g, ' ')}
                            </Badge>
                        </Field>
                        <Field label="Total Amount">
                            <p className="text-sm font-bold text-slate-900">{formatCurrency(dp.totalAmount)}</p>
                        </Field>
                    </div>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label="Buyer">
                            <Party name={dp.buyer?.name || `Buyer #${dp.buyerId}`} email={dp.buyer?.email} />
                        </Field>
                        <Field label="Seller">
                            <Party name={dp.seller?.name || `Seller #${dp.sellerId}`} email={dp.seller?.email} />
                        </Field>
                    </div>

                    {dp.requirement && (
                        <Field label="Linked Requirement">
                            <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs">
                                <p className="font-black text-indigo-700 text-wrap-anywhere">
                                    {dp.requirement.requirementNumber} · {dp.requirement.title}
                                </p>
                            </div>
                        </Field>
                    )}

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-[10px] font-bold uppercase text-slate-400">
                        <p>Requested: {formatDateTime(dp.requestedAt)}</p>
                        <p>Approved: {formatDateTime(dp.approvedAt)}</p>
                        <p>Created: {formatDateTime(dp.createdAt)}</p>
                        <p>Updated: {formatDateTime(dp.updatedAt)}</p>
                    </div>

                    {isBuyer && (
                        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                            {dp.status === 'DRAFT' && (
                                <>
                                    <Button variant="outline" onClick={remove} disabled={deleteMut.isPending} className="border-red-200 text-red-700">
                                        <Trash2 className="mr-2 h-4 w-4" /> Delete
                                    </Button>
                                    <Button onClick={() => change('PENDING_APPROVAL', 'Submit for approval')} disabled={updateMut.isPending} className="bg-[#12335f] text-white">
                                        Submit for approval
                                    </Button>
                                </>
                            )}
                            {dp.status === 'PENDING_APPROVAL' && (
                                <>
                                    <Button variant="outline" onClick={() => change('REJECTED', 'Reject')} disabled={updateMut.isPending} className="border-red-200 text-red-700">
                                        Reject
                                    </Button>
                                    <Button onClick={() => change('APPROVED', 'Approve')} disabled={updateMut.isPending} className="bg-emerald-600 text-white">
                                        Approve
                                    </Button>
                                </>
                            )}
                            {dp.status === 'APPROVED' && (
                                <Button onClick={generate} disabled={generatePoMut.isPending} className="bg-[#12335f] text-white">
                                    {generatePoMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                                    Generate Purchase Order
                                </Button>
                            )}
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}

function DirectPurchaseCreator({ onClose }: { onClose: () => void }) {
    const [sellerId, setSellerId] = useState('');
    const [requirementId, setRequirementId] = useState('');
    const [totalAmount, setTotalAmount] = useState('');
    const createMut = useCreateDirectPurchase();

    const submit = async () => {
        await runWithToast(
            () =>
                createMut.mutateAsync({
                    sellerId: Number(sellerId),
                    requirementId: requirementId ? Number(requirementId) : undefined,
                    totalAmount: totalAmount ? Number(totalAmount) : undefined
                }),
            {
                loading: 'Creating...',
                success: 'Direct purchase created',
                error: err => (err instanceof Error ? err.message : 'Create failed')
            }
        );
        onClose();
    };

    const valid = sellerId && Number(sellerId) > 0;

    return (
        <Modal title="New Direct Purchase" onClose={onClose}>
            <div className="space-y-3">
                <Field label="Seller User ID">
                    <Input value={sellerId} onChange={e => setSellerId(e.target.value.replace(/[^0-9]/g, ''))} type="number" min="1" placeholder="Numeric seller ID" />
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">Find on the Vendors page detail panel.</p>
                </Field>
                <Field label="Linked Requirement ID (optional)">
                    <Input value={requirementId} onChange={e => setRequirementId(e.target.value.replace(/[^0-9]/g, ''))} type="number" min="1" placeholder="If this fulfils an existing requirement" />
                </Field>
                <Field label="Total Amount (₹)">
                    <Input value={totalAmount} onChange={e => setTotalAmount(e.target.value)} type="number" min="0" placeholder="0" />
                </Field>
            </div>
            <ModalFooter onCancel={onClose} onConfirm={submit} confirmLabel="Create" pending={createMut.isPending} disabled={!valid} />
        </Modal>
    );
}

/* ---------- Reusable bits ---------- */

function Modal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div className={cn('w-full overflow-hidden rounded-xl bg-white shadow-xl animate-in zoom-in-95 duration-200', wide ? 'max-w-3xl' : 'max-w-lg')}>
                <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-5 py-3.5 text-white">
                    <h2 className="text-sm font-black uppercase tracking-widest text-wrap-anywhere">{title}</h2>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10" aria-label="Close">
                        <X className="h-4 w-4" />
                    </button>
                </header>
                <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            {children}
        </div>
    );
}

function Party({ name, email }: { name: string; email?: string }) {
    return (
        <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
            <p className="font-black text-slate-900 text-wrap-anywhere">{name}</p>
            {email && <p className="text-[10px] text-slate-500 text-wrap-anywhere">{email}</p>}
        </div>
    );
}

function ModalFooter({
    onCancel,
    onConfirm,
    confirmLabel,
    pending,
    disabled
}: {
    onCancel: () => void;
    onConfirm: () => void;
    confirmLabel: string;
    pending?: boolean;
    disabled?: boolean;
}) {
    return (
        <div className="mt-5 flex items-center justify-end gap-2 border-t border-slate-100 pt-4">
            <Button variant="outline" onClick={onCancel} disabled={pending}>
                Cancel
            </Button>
            <Button onClick={onConfirm} disabled={pending || disabled} className="bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                {pending ? 'Working...' : confirmLabel}
            </Button>
        </div>
    );
}

function Metric({ label, value, hint, tone, icon: Icon }: { label: string; value: number; hint: string; tone: 'positive' | 'negative' | 'warning' | 'neutral'; icon: any }) {
    const toneStyle = {
        positive: 'bg-emerald-600',
        negative: 'bg-red-600',
        warning: 'bg-amber-600',
        neutral: 'bg-[#12335f]'
    } as const;
    return (
        <Card>
            <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-1 text-2xl font-black text-slate-950">{value}</p>
                    <p className="mt-1 text-[10px] font-bold uppercase tracking-wide text-slate-500 text-wrap-anywhere">{hint}</p>
                </div>
                <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-white', toneStyle[tone])}>
                    <Icon className="h-5 w-5" />
                </div>
            </CardContent>
        </Card>
    );
}

// Internal helpers shared by detail / creator modals.
