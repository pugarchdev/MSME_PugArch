import { useMemo, useState } from 'react';
import { Eye, Plus, RefreshCw, ShoppingCart, Trash2, Truck, X, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { Card, CardContent, Badge } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Pagination } from '../../shared/Pagination';
import { PageToolbar } from '../../shared/PageToolbar';
import { ListSkeleton } from '../../../components/ui/skeleton';
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
    useUpdateDirectPurchase,
    useAcceptDirectPurchase,
    useRejectDirectPurchase
} from '../hooks';
import type { DirectPurchasePartyDto, DirectPurchaseStatus } from '../types';

const STATUS_TONE: Record<string, string> = {
    DRAFT: 'border-slate-200 bg-slate-50 text-slate-700',
    REQUESTED: 'border-amber-200 bg-amber-50 text-amber-700',
    PENDING_APPROVAL: 'border-amber-200 bg-amber-50 text-amber-700',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    REJECTED: 'border-red-200 bg-red-50 text-red-700',
    ORDERED: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    CANCELLED: 'border-slate-200 bg-slate-100 text-slate-500'
};

const buyerDisplayName = (buyer?: DirectPurchasePartyDto | null, _fallbackId?: number) =>
    buyer?.buyerProfile?.organizationName || buyer?.name || 'Buyer';

const sellerDisplayName = (seller?: DirectPurchasePartyDto | null, _fallbackId?: number) =>
    seller?.sellerProfile?.businessName || seller?.name || 'Seller';

const partyLocation = (party?: DirectPurchasePartyDto | null) => {
    const buyerProfile = party?.buyerProfile;
    const sellerOffice = party?.sellerProfile?.offices?.[0];
    return [buyerProfile?.city || buyerProfile?.district || sellerOffice?.city, buyerProfile?.state || sellerOffice?.state]
        .filter(Boolean)
        .join(', ');
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
    const deleteMut = useDeleteDirectPurchase();
    const generatePoMut = useGeneratePoFromDirectPurchase();
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

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Total" value={total} hint="In current view" tone="neutral" icon={ShoppingCart} loading={list.isLoading && !list.data} />
                <Metric label="Drafts" value={counters.drafts} hint="Not yet submitted" tone="warning" icon={ShoppingCart} loading={list.isLoading && !list.data} />
                <Metric label="Approved" value={counters.approved} hint="Ready to order" tone="positive" icon={ShoppingCart} loading={list.isLoading && !list.data} />
                <Metric label="Ordered" value={counters.ordered} hint="PO generated" tone="neutral" icon={Truck} loading={list.isLoading && !list.data} />
            </div>

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
                            { value: 'REQUESTED', label: 'Requested' },
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
                                        <th className="px-4 py-2.5 text-right w-32">Actions</th>
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
                                            </td>
                                            <td className="px-4 py-3 text-xs text-wrap-anywhere">
                                                <p className="font-bold text-slate-900">{dp.buyer?.name || 'Buyer'}</p>
                                                {dp.buyer?.email && <p className="text-[10px] text-slate-500">{dp.buyer.email}</p>}
                                            </td>
                                            <td className="px-4 py-3 text-xs text-wrap-anywhere">
                                                <p className="font-bold text-slate-900">{dp.seller?.name || 'Seller'}</p>
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
                                            <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenId(dp.id)}
                                                        title="View details"
                                                        className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-[#12335f] hover:bg-slate-50"
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                    </button>
                                                    {isBuyer && dp.status === 'APPROVED' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                runWithToast(() => generatePoMut.mutateAsync(dp.id), {
                                                                    loading: 'Generating PO...',
                                                                    success: 'Purchase Order generated',
                                                                    error: 'PO generation failed'
                                                                });
                                                            }}
                                                            disabled={generatePoMut.isPending}
                                                            title="Generate Purchase Order"
                                                            className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                                                        >
                                                            {generatePoMut.isPending && generatePoMut.variables === dp.id
                                                                ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                : <Truck className="h-3.5 w-3.5" />}
                                                        </button>
                                                    )}
                                                    {isBuyer && ['DRAFT', 'REQUESTED', 'REJECTED'].includes(String(dp.status)) && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (!window.confirm(`Cancel direct purchase ${dp.purchaseNumber}?`)) return;
                                                                runWithToast(() => deleteMut.mutateAsync(dp.id), {
                                                                    loading: 'Cancelling...',
                                                                    success: 'Direct purchase cancelled',
                                                                    error: 'Cancel failed'
                                                                });
                                                            }}
                                                            disabled={deleteMut.isPending}
                                                            title="Cancel direct purchase"
                                                            className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </div>
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
    const acceptMut = useAcceptDirectPurchase();
    const rejectMut = useRejectDirectPurchase();
    const dp = detail.data;
    const { user } = useAuth();
    const isBuyer = user?.role === 'buyer';
    const isSeller = user?.role === 'seller';

    const change = (status: DirectPurchaseStatus, label: string) =>
        runWithToast(() => updateMut.mutateAsync({ id, data: { status } }), {
            loading: `${label}...`,
            success: `Marked ${label.toLowerCase()}`,
            error: 'Update failed'
        }).then(() => detail.refetch());

    const handleAccept = () =>
        runWithToast(() => acceptMut.mutateAsync(id), {
            loading: 'Accepting request...',
            success: 'Direct purchase request accepted!',
            error: 'Accept failed'
        }).then(() => detail.refetch());

    const handleReject = () => {
        if (!confirm('Reject this direct purchase request?')) return;
        runWithToast(() => rejectMut.mutateAsync(id), {
            loading: 'Rejecting request...',
            success: 'Direct purchase request rejected.',
            error: 'Reject failed'
        }).then(() => detail.refetch());
    };

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
                    {/* High-quality workflows info banners */}
                    {dp.status === 'REQUESTED' && isSeller && dp.sellerId === Number(user?.id) && (
                        <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs font-semibold text-amber-800 space-y-2">
                            <h4 className="font-black uppercase tracking-wider text-amber-900 flex items-center gap-1.5">
                                <AlertCircle className="h-4 w-4 shrink-0 text-amber-600 animate-pulse" /> Pending Your Response
                            </h4>
                            <p className="leading-relaxed">
                                <span className="font-black">{buyerDisplayName(dp.buyer, dp.buyerId)}</span> has sent you a direct sole-source purchase request for <span className="font-black">{formatCurrency(dp.totalAmount)}</span>.
                                Please review the details below. You can accept this request to agree to fulfill the order at this price, or reject it.
                            </p>
                            <p className="text-[10px] font-bold text-amber-700 uppercase">
                                Action Needed: Fulfill or Reject using the buttons below. Upon acceptance, the buyer can generate a Purchase Order (PO).
                            </p>
                        </div>
                    )}

                    {dp.status === 'REQUESTED' && isBuyer && dp.buyerId === Number(user?.id) && (
                        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-xs font-semibold text-blue-800 space-y-2">
                            <h4 className="font-black uppercase tracking-wider text-blue-900 flex items-center gap-1.5">
                                <Clock className="h-4 w-4 shrink-0 text-blue-600 animate-pulse" /> Awaiting Seller Action
                            </h4>
                            <p className="leading-relaxed">
                                This direct purchase request of <span className="font-black">{formatCurrency(dp.totalAmount)}</span> was dispatched to <span className="font-black">{sellerDisplayName(dp.seller, dp.sellerId)}</span>. We are awaiting their formal response.
                            </p>
                            <p className="text-[10px] font-bold text-blue-700 uppercase">
                                Next Step: Once the seller accepts, you can generate an official Purchase Order in one click.
                            </p>
                        </div>
                    )}

                    {dp.status === 'APPROVED' && isBuyer && dp.buyerId === Number(user?.id) && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 space-y-2">
                            <h4 className="font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> Seller Accepted Request
                            </h4>
                            <p className="leading-relaxed">
                                <span className="font-black">{sellerDisplayName(dp.seller, dp.sellerId)}</span> has accepted your direct purchase request. You can now finalize this procurement by generating the official Purchase Order below.
                            </p>
                        </div>
                    )}

                    {dp.status === 'APPROVED' && isSeller && dp.sellerId === Number(user?.id) && (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800 space-y-2">
                            <h4 className="font-black uppercase tracking-wider text-emerald-900 flex items-center gap-1.5">
                                <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> Request Accepted
                            </h4>
                            <p className="leading-relaxed">
                                You accepted this sole-source direct purchase request. We are awaiting <span className="font-black">{buyerDisplayName(dp.buyer, dp.buyerId)}</span> to generate the official Purchase Order to begin delivery.
                            </p>
                        </div>
                    )}

                    {dp.status === 'ORDERED' && (
                        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 text-xs font-semibold text-indigo-800 space-y-2">
                            <h4 className="font-black uppercase tracking-wider text-indigo-900 flex items-center gap-1.5">
                                <Truck className="h-4 w-4 shrink-0 text-indigo-600" /> Purchase Order Generated
                            </h4>
                            <p className="leading-relaxed">
                                This direct purchase has been formalized! An official Purchase Order was successfully generated and sent to the seller.
                                Please proceed to the Orders and Delivery sections for tracking, GRN verification, and payment.
                            </p>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        {/* <Field label="Internal ID">
                            <code className="block rounded bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">#{dp.id}</code>
                        </Field> */}
                        <Field label="Purchase ID">
                            <code className="block rounded bg-slate-100 px-3 py-2 text-xs font-bold text-[#12335f]">{dp.purchaseNumber}</code>
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
                            <Party
                                name={buyerDisplayName(dp.buyer, dp.buyerId)}
                                accountName={dp.buyer?.name}
                                email={dp.buyer?.email}
                                mobile={dp.buyer?.mobile}
                                organizationType={dp.buyer?.buyerProfile?.organizationType}
                                location={partyLocation(dp.buyer)}
                            />
                        </Field>
                        <Field label="Seller">
                            <Party
                                name={sellerDisplayName(dp.seller, dp.sellerId)}
                                accountName={dp.seller?.name}
                                email={dp.seller?.email}
                                mobile={dp.seller?.mobile}
                                organizationType={dp.seller?.sellerProfile?.organizationType}
                                location={partyLocation(dp.seller)}
                            />
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

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-[10px] font-bold uppercase text-slate-400 border-t border-slate-100 pt-3">
                        <p>Requested: {formatDateTime(dp.requestedAt || dp.createdAt)}</p>
                        {dp.approvedAt && <p>Approved: {formatDateTime(dp.approvedAt)}</p>}
                        <p>Created: {formatDateTime(dp.createdAt)}</p>
                        <p>Updated: {formatDateTime(dp.updatedAt)}</p>
                    </div>

                    {/* Action Buttons Panel */}
                    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                        {isBuyer && dp.status === 'DRAFT' && (
                            <>
                                <Button variant="outline" onClick={remove} disabled={deleteMut.isPending} className="border-red-200 text-red-700">
                                    <Trash2 className="mr-2 h-4 w-4" /> Delete
                                </Button>
                                <Button onClick={() => change('PENDING_APPROVAL', 'Submit for approval')} disabled={updateMut.isPending} className="bg-[#12335f] text-white">
                                    Submit for approval
                                </Button>
                            </>
                        )}
                        {isBuyer && dp.status === 'PENDING_APPROVAL' && (
                            <>
                                <Button variant="outline" onClick={() => change('REJECTED', 'Reject')} disabled={updateMut.isPending} className="border-red-200 text-red-700">
                                    Reject
                                </Button>
                                <Button onClick={() => change('APPROVED', 'Approve')} disabled={updateMut.isPending} className="bg-emerald-600 text-white">
                                    Approve
                                </Button>
                            </>
                        )}
                        {isBuyer && dp.status === 'APPROVED' && (
                            <Button onClick={generate} disabled={generatePoMut.isPending} className="bg-[#12335f] text-white font-black uppercase text-xs">
                                {generatePoMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Truck className="mr-2 h-4 w-4" />}
                                Generate Purchase Order
                            </Button>
                        )}

                        {/* Seller specific responses */}
                        {isSeller && dp.sellerId === Number(user?.id) && dp.status === 'REQUESTED' && (
                            <>
                                <Button
                                    variant="outline"
                                    onClick={handleReject}
                                    disabled={rejectMut.isPending}
                                    className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800 text-xs font-black uppercase"
                                >
                                    Reject Request
                                </Button>
                                <Button
                                    onClick={handleAccept}
                                    disabled={acceptMut.isPending}
                                    className="bg-emerald-600 text-white hover:bg-emerald-700 text-xs font-black uppercase"
                                >
                                    Accept Request & Fulfill
                                </Button>
                            </>
                        )}
                    </div>
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
                {/* <Field label="Seller User ID">
                    <Input value={sellerId} onChange={e => setSellerId(e.target.value.replace(/[^0-9]/g, ''))} type="number" min="1" placeholder="Numeric seller ID" />
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">Find on the Vendors page detail panel.</p>
                </Field> */}
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

function Party({
    name,
    accountName,
    email,
    mobile,
    organizationType,
    location
}: {
    name: string;
    accountName?: string;
    email?: string;
    mobile?: string;
    organizationType?: string | null;
    location?: string;
}) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs shadow-sm space-y-2">
            <div>
                <p className="font-black text-slate-900 text-sm leading-tight text-wrap-anywhere">{name}</p>
                {accountName && accountName !== name && (
                    <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Contact: {accountName}</p>
                )}
            </div>
            {(email || mobile || organizationType || location) && (
                <div className="grid grid-cols-1 gap-1.5 border-t border-slate-100 pt-2 text-[11px] font-medium text-slate-600">
                    {organizationType && (
                        <p className="flex items-center gap-1.5">
                            <span className="font-bold text-[9px] uppercase tracking-wider text-slate-400 w-16 shrink-0">Type:</span>
                            <span className="font-bold text-slate-700">{organizationType.replace(/_/g, ' ')}</span>
                        </p>
                    )}
                    {email && (
                        <p className="flex items-center gap-1.5">
                            <span className="font-bold text-[9px] uppercase tracking-wider text-slate-400 w-16 shrink-0">Email:</span>
                            <span className="truncate text-slate-700 select-all font-mono">{email}</span>
                        </p>
                    )}
                    {mobile && (
                        <p className="flex items-center gap-1.5">
                            <span className="font-bold text-[9px] uppercase tracking-wider text-slate-400 w-16 shrink-0">Mobile:</span>
                            <span className="text-slate-700 font-mono">{mobile}</span>
                        </p>
                    )}
                    {location && (
                        <p className="flex items-center gap-1.5">
                            <span className="font-bold text-[9px] uppercase tracking-wider text-slate-400 w-16 shrink-0">Location:</span>
                            <span className="text-slate-700 truncate">{location}</span>
                        </p>
                    )}
                </div>
            )}
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

function Metric({ label, value, hint, tone, icon: Icon, loading }: { label: string; value: number; hint: string; tone: 'positive' | 'negative' | 'warning' | 'neutral'; icon: any; loading?: boolean }) {
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
                    <p className={cn("mt-1 text-2xl font-black text-slate-950", loading && "text-slate-300")}>{loading ? "0" : value}</p>
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
