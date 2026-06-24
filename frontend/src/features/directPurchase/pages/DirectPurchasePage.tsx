import { useEffect, useMemo, useState } from 'react';
import { Download, Eye, Plus, RefreshCw, Send, ShoppingCart, Trash2, Truck, Upload, X, AlertCircle, Clock, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { Loader2 } from '@/components/ui/loader';
import { marketplaceApi, type MarketplaceSeller } from '../../marketplace/api';
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
import { useCreateRequirement } from '../../requirements/hooks';
import { featureFlags } from '../../../lib/featureFlags';
import Link from 'next/link';

const LEGACY_CREATE_ENABLED = featureFlags.legacy_direct_purchase_create;

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

export default function DirectPurchasePage({ listOnly = false }: { listOnly?: boolean }) {
    const { user } = useAuth();
    const isBuyer = user?.role === 'buyer';

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [q, setQ] = useState('');
    const [status, setStatus] = useState('');
    const [openId, setOpenId] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);
    const [prefillData, setPrefillData] = useState<any>(null);

    useEffect(() => {
        if (!LEGACY_CREATE_ENABLED) return;
        const key = 'msme:direct-purchase-create-prefill:v1';
        const saved = localStorage.getItem(key);
        if (saved) {
            try {
                const parsed = JSON.parse(saved);
                if (parsed) {
                    setPrefillData(parsed);
                    setCreating(true);
                }
            } catch (err) {
                console.error('Failed to parse direct purchase prefill', err);
            } finally {
                localStorage.removeItem(key);
            }
        }
    }, []);

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
                        Track direct purchase orders created from Marketplace cart checkout. New requests must be created from Marketplace → Cart → Procurement Checkout.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => list.refetch()} className="h-10 rounded-lg text-xs font-black uppercase">
                        <RefreshCw className={cn('mr-2 h-4 w-4', list.isFetching && 'animate-spin')} /> Refresh
                    </Button>
                    {isBuyer && !listOnly && LEGACY_CREATE_ENABLED && (
                        <Button onClick={() => setCreating(true)} className="bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                            <Plus className="mr-2 h-4 w-4" /> New Direct Purchase
                        </Button>
                    )}
                    {isBuyer && (
                        <Link href="/buyer/marketplace" className="inline-flex h-10 items-center rounded-lg bg-[#12335f] px-4 text-sm font-semibold text-white hover:bg-[#0e2a4f]">
                            <ShoppingCart className="mr-2 h-4 w-4" /> Buy from Marketplace
                        </Link>
                    )}
                </div>
            </div>

            {isBuyer && (
                <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-semibold text-blue-900">
                    New Direct Purchase requests must be created from Marketplace Cart. Open{' '}
                    <Link href="/cart" className="underline">My Cart</Link> →{' '}
                    <Link href="/buyer/procurement/checkout" className="underline">Procurement Checkout</Link>.
                </div>
            )}

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
                                                    {isBuyer && (dp.status === 'APPROVED' || dp.status === 'ORDERED') && (
                                                         <button
                                                             type="button"
                                                             onClick={() => {
                                                                 if (dp.status === 'ORDERED') return;
                                                                 runWithToast(() => generatePoMut.mutateAsync(dp.id), {
                                                                     loading: 'Generating PO...',
                                                                     success: 'Purchase Order generated',
                                                                     error: 'PO generation failed'
                                                                 });
                                                             }}
                                                             disabled={dp.status === 'ORDERED' || generatePoMut.isPending}
                                                             title={dp.status === 'ORDERED' ? "Purchase Order Generated" : "Generate Purchase Order"}
                                                             className={cn(
                                                                 "flex h-8 w-8 items-center justify-center rounded-md border transition-colors",
                                                                 dp.status === 'ORDERED'
                                                                     ? "border-emerald-100 bg-emerald-50/50 text-emerald-600 cursor-default"
                                                                     : "border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                                                             )}
                                                         >
                                                             {generatePoMut.isPending && generatePoMut.variables === dp.id ? (
                                                                 <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                             ) : dp.status === 'ORDERED' ? (
                                                                 <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                                                             ) : (
                                                                 <Truck className="h-3.5 w-3.5" />
                                                             )}
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
            {creating && isBuyer && LEGACY_CREATE_ENABLED && <DirectPurchaseCreator onClose={() => { setCreating(false); setPrefillData(null); }} prefill={prefillData} />}
        </div>
    );
}

const parseProcurementIntakeSummary = (description?: string | null) => {
    const text = String(description || '');
    const marker = 'Procurement Intake Summary';
    const index = text.indexOf(marker);
    if (index < 0) return null;
    const lines = text.slice(index + marker.length).split(/\r?\n/).map(line => line.trim()).filter(Boolean);
    const details = lines
        .filter(line => line.includes(':') && !line.startsWith('-'))
        .map(line => {
            const separator = line.indexOf(':');
            return { label: line.slice(0, separator).trim(), value: line.slice(separator + 1).trim() };
        });
    const documentsIndex = lines.findIndex(line => line === 'Attached Documents');
    const documents = documentsIndex >= 0 ? lines.slice(documentsIndex + 1).filter(line => line.startsWith('- ')) : [];
    return { details, documents };
};

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

    const intakeSummary = parseProcurementIntakeSummary(dp?.requirement?.description);
    const descriptionText = dp?.requirement?.description 
        ? dp.requirement.description.split('Procurement Intake Summary')[0].trim() 
        : '';

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
                        <div className="space-y-4 rounded-xl border border-indigo-100 bg-indigo-50/20 p-4">
                            <h3 className="text-xs font-black uppercase tracking-wider text-indigo-900">Procurement Requirement Details</h3>
                            
                            <div className="grid gap-3 md:grid-cols-2">
                                <Field label="Requirement Title & ID">
                                    <p className="text-xs font-bold text-slate-900 text-wrap-anywhere">
                                        <span className="font-mono text-[10px] font-black text-[#12335f] bg-[#12335f]/10 px-1.5 py-0.5 rounded mr-1">
                                            {dp.requirement.requirementNumber}
                                        </span>
                                        {dp.requirement.title}
                                    </p>
                                </Field>
                                
                                {intakeSummary?.details && intakeSummary.details.map(item => (
                                    <Field key={item.label} label={item.label}>
                                        <p className="text-xs font-bold text-slate-800">{item.value}</p>
                                    </Field>
                                ))}
                            </div>

                            {descriptionText && (
                                <Field label="Scope of Work / Justification">
                                    <p className="text-xs text-slate-700 whitespace-pre-wrap font-semibold leading-relaxed bg-white border border-slate-100 rounded-lg p-3">
                                        {descriptionText}
                                    </p>
                                </Field>
                            )}

                            <Field label="Line Items">
                                {dp.requirement.items?.length ? (
                                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                        <table className="w-full text-xs">
                                            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Product / Service</th>
                                                    <th className="px-3 py-2 text-left">Specifications</th>
                                                    <th className="px-3 py-2 text-right w-16">Qty</th>
                                                    <th className="px-3 py-2 text-left w-16">Unit</th>
                                                    <th className="px-3 py-2 text-right w-24">Unit Price</th>
                                                    <th className="px-3 py-2 text-right w-28">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {dp.requirement.items.map(item => {
                                                    const price = Number(item.estimatedUnitPrice || 0);
                                                    const qty = Number(item.quantity || 0);
                                                    const lineTotal = price * qty;
                                                    return (
                                                        <tr key={item.id} className="hover:bg-slate-50/50">
                                                            <td className="px-3 py-2 font-bold text-slate-900 text-wrap-anywhere">
                                                                {item.itemName}
                                                            </td>
                                                            <td className="px-3 py-2 font-semibold text-slate-500 text-wrap-anywhere">
                                                                {item.description || '-'}
                                                            </td>
                                                            <td className="px-3 py-2 text-right font-bold text-slate-900">
                                                                {qty}
                                                            </td>
                                                            <td className="px-3 py-2 font-semibold text-slate-600">
                                                                {item.unitOfMeasure}
                                                            </td>
                                                            <td className="px-3 py-2 text-right font-bold text-slate-900">
                                                                {formatCurrency(price)}
                                                            </td>
                                                            <td className="px-3 py-2 text-right font-black text-slate-950">
                                                                {formatCurrency(lineTotal)}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-xs font-semibold text-slate-500 bg-white p-3 rounded-lg border border-slate-100">
                                        No line items recorded.
                                    </p>
                                )}
                            </Field>

                            {intakeSummary?.documents && intakeSummary.documents.length > 0 && (
                                <Field label="Attached Documents">
                                    <div className="flex flex-wrap gap-2">
                                        {intakeSummary.documents.map(document => (
                                            <span key={document} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-black text-[#12335f]">
                                                {document.replace(/^- /, '')}
                                            </span>
                                        ))}
                                    </div>
                                </Field>
                            )}
                        </div>
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

interface VendorSearchableDropdownProps {
    value: string | number;
    onChange: (seller: MarketplaceSeller | null) => void;
    placeholder?: string;
    className?: string;
}

export function VendorSearchableDropdown({ value, onChange, placeholder = 'Search vendor name or organization...', className }: VendorSearchableDropdownProps) {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [sellers, setSellers] = useState<MarketplaceSeller[]>([]);
    const [loading, setLoading] = useState(false);
    const [selectedSeller, setSelectedSeller] = useState<MarketplaceSeller | null>(null);

    // Fetch initial seller if value exists
    useEffect(() => {
        if (value) {
            setLoading(true);
            marketplaceApi.getSellers({ pageSize: 50 })
                .then(res => {
                    const found = res?.sellers?.find((s: any) => s.sellerUserId === Number(value) || s.id === Number(value));
                    if (found) {
                        setSelectedSeller(found);
                        setSearch(found.organizationName);
                    }
                })
                .catch(err => console.error(err))
                .finally(() => setLoading(false));
        } else {
            setSelectedSeller(null);
            setSearch('');
        }
    }, [value]);

    // Debounce search query
    useEffect(() => {
        if (!open) return;
        const delayDebounce = setTimeout(() => {
            setLoading(true);
            const params: Record<string, string | number> = { pageSize: 20 };
            if (search) params.q = search;
            marketplaceApi.getSellers(params)
                .then(res => {
                    setSellers(res?.sellers || []);
                })
                .catch(err => console.error(err))
                .finally(() => setLoading(false));
        }, 300);

        return () => clearTimeout(delayDebounce);
    }, [search, open]);

    return (
        <div className={cn("relative w-full", className)}>
            <div className="relative">
                <input
                    type="text"
                    className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-10 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15"
                    placeholder={placeholder}
                    value={search}
                    onChange={(e) => {
                        setSearch(e.target.value);
                        setOpen(true);
                    }}
                    onFocus={() => setOpen(true)}
                />
                <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400">
                    {loading && <Loader2 className="h-4 w-4 animate-spin text-[#12335f]" />}
                    {search && (
                        <button
                            type="button"
                            onClick={() => {
                                setSearch('');
                                setSelectedSeller(null);
                                onChange(null);
                                setSellers([]);
                            }}
                            className="hover:text-slate-600"
                        >
                            <X className="h-4 w-4" />
                        </button>
                    )}
                </div>
            </div>

            {open && (
                <>
                    <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
                    <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg z-20">
                        {loading && sellers.length === 0 ? (
                            <div className="p-3 text-center text-xs font-semibold text-slate-500">Loading sellers...</div>
                        ) : sellers.length === 0 ? (
                            <div className="p-3 text-center text-xs font-semibold text-slate-500">No sellers found</div>
                        ) : (
                            sellers.map((seller) => {
                                const isValid = seller.sellerUserId !== null && seller.sellerUserId !== undefined;
                                const isSelected = selectedSeller?.id === seller.id;
                                return (
                                    <button
                                        key={seller.id}
                                        type="button"
                                        disabled={!isValid}
                                        onClick={() => {
                                            setSelectedSeller(seller);
                                            setSearch(seller.organizationName);
                                            onChange(seller);
                                            setOpen(false);
                                        }}
                                        className={cn(
                                            "flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-xs transition",
                                            !isValid ? "opacity-50 cursor-not-allowed bg-slate-50/50" : "hover:bg-slate-50",
                                            isSelected && "bg-blue-50 text-[#12335f]"
                                        )}
                                    >
                                        <div className="flex w-full items-center justify-between gap-2">
                                            <span className="font-bold text-slate-900">{seller.organizationName}</span>
                                            {seller.verificationStatus === 'VERIFIED' && (
                                                <Badge className="bg-emerald-50 text-emerald-700 hover:bg-emerald-50 rounded px-1.5 py-0 text-[9px] uppercase font-bold border border-emerald-200">Verified</Badge>
                                            )}
                                        </div>
                                        <div className="mt-1 flex w-full items-center justify-between text-[10px] text-slate-500 font-semibold">
                                            <span>
                                                {seller.organizationType} · {[seller.city, seller.state].filter(Boolean).join(', ')}
                                            </span>
                                            {!isValid && (
                                                <span className="text-red-500 font-bold">No active user account</span>
                                            )}
                                        </div>
                                    </button>
                                );
                            })
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

function DirectPurchaseCreator({ onClose, prefill }: { onClose: () => void; prefill?: any }) {
    const [sellerId, setSellerId] = useState(prefill?.sellerId ? String(prefill.sellerId) : '');
    const [requirementId, setRequirementId] = useState(prefill?.requirementId ? String(prefill.requirementId) : '');
    const [totalAmount, setTotalAmount] = useState(prefill?.totalAmount ? String(prefill.totalAmount) : '');
    const [purchaseTitle, setPurchaseTitle] = useState(prefill?.purchaseTitle || 'Office Stationery Purchase');
    const [department, setDepartment] = useState(prefill?.department || 'Administration');
    const [costCenter, setCostCenter] = useState(prefill?.costCenter || 'ADM-001');
    const [vendorName, setVendorName] = useState(prefill?.vendorName || '');
    const [vendorCode, setVendorCode] = useState(prefill?.vendorCode || '');
    const [budgetAllocated, setBudgetAllocated] = useState(
        prefill?.totalAmount 
            ? String(Math.ceil(Number(prefill.totalAmount) * 2)) 
            : '5000000'
    );
    const [budgetConsumed, setBudgetConsumed] = useState(
        prefill?.totalAmount 
            ? String(Math.ceil(Number(prefill.totalAmount) * 0.5)) 
            : '100000'
    );
    const [attachments, setAttachments] = useState<Array<{ name: string; size: number }>>([]);
    const [items, setItems] = useState(prefill?.items || [
        { id: '1', name: 'A4 Size Paper', spec: '75 GSM, 500 sheets ream', qty: 20, unit: 'Ream', price: 220, tax: 18 },
        { id: '2', name: 'Ball Pen (Blue)', spec: '0.7 mm blue ink', qty: 10, unit: 'Box', price: 150, tax: 18 },
        { id: '3', name: 'File Folder', spec: 'Plastic A4 size', qty: 50, unit: 'Pcs', price: 25, tax: 18 }
    ]);
    const createMut = useCreateDirectPurchase();
    const createReqMut = useCreateRequirement();
    const subTotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0), 0);
    const taxTotal = items.reduce((sum, item) => sum + Number(item.qty || 0) * Number(item.price || 0) * (Number(item.tax || 0) / 100), 0);
    const grandTotal = totalAmount ? Number(totalAmount) : subTotal + taxTotal;
    const budgetAvailable = Number(budgetAllocated || 0) - Number(budgetConsumed || 0);
    const budgetRemaining = budgetAvailable - grandTotal;

    const handleVendorChange = (seller: MarketplaceSeller | null) => {
        if (seller) {
            setSellerId(String(seller.sellerUserId || ''));
            setVendorName(seller.organizationName);
            setVendorCode(`VEN${10000 + seller.id}`);
        } else {
            setSellerId('');
            setVendorName('');
            setVendorCode('');
        }
    };

    const submit = async () => {
        if (budgetRemaining < 0) {
            toast.error('Budget is insufficient for this direct purchase.');
            return;
        }

        try {
            let reqId = requirementId ? Number(requirementId) : undefined;
            if (!reqId) {
                const reqResult = await createReqMut.mutateAsync({
                    title: purchaseTitle || 'Direct Purchase Requirement',
                    description: [
                        'Direct Purchase created from request form.',
                        '',
                        'Procurement Intake Summary',
                        'Route: Direct Purchase',
                        `Department: ${department || '-'}`,
                        `Cost Center: ${costCenter || '-'}`,
                        `Budget Allocated: ${formatCurrency(budgetAllocated)}`,
                        `Budget Consumed: ${formatCurrency(budgetConsumed)}`,
                    ].join('\n'),
                    procurementMethod: 'DIRECT_PURCHASE',
                    estimatedValue: grandTotal,
                    items: items.map((it: any) => ({
                        itemName: it.name,
                        description: it.spec || undefined,
                        quantity: Number(it.qty || 1),
                        unitOfMeasure: it.unit || 'Nos',
                        estimatedUnitPrice: Number(it.price || 0)
                    }))
                });
                reqId = reqResult.id;
            }

            await runWithToast(
                () =>
                    createMut.mutateAsync({
                        sellerId: Number(sellerId),
                        requirementId: reqId,
                        totalAmount: grandTotal
                    }),
                {
                    loading: 'Creating direct purchase...',
                    success: 'Direct purchase created successfully',
                    error: err => (err instanceof Error ? err.message : 'Create failed')
                }
            );
            onClose();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to create procurement requirement');
        }
    };

    const valid = sellerId && Number(sellerId) > 0;

    return (
        <Modal title="Direct Purchase Request Form" onClose={onClose} wide>
            <div className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-black text-[#12335f]">1. Purchase Details / Basic Information</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Field label="Purchase Title *">
                            <Input value={purchaseTitle} onChange={e => setPurchaseTitle(e.target.value)} />
                        </Field>
                        <Field label="Select Vendor *">
                            <VendorSearchableDropdown value={sellerId} onChange={handleVendorChange} />
                        </Field>
                        <Field label="Seller User ID (Auto)">
                            <Input value={sellerId} readOnly className="bg-slate-50 cursor-not-allowed font-mono" />
                        </Field>
                        <Field label="Department">
                            <Input value={department} onChange={e => setDepartment(e.target.value)} />
                        </Field>
                        <Field label="Cost Center">
                            <Input value={costCenter} onChange={e => setCostCenter(e.target.value)} />
                        </Field>
                        <Field label="Purchase Type">
                            <Input value="Goods" readOnly />
                        </Field>
                        <Field label="Procurement Method">
                            <Input value="Direct Purchase" readOnly />
                        </Field>
                        <Field label="Vendor Name (Auto)">
                            <Input value={vendorName} readOnly className="bg-slate-50 cursor-not-allowed" />
                        </Field>
                        <Field label="Vendor Code (Auto)">
                            <Input value={vendorCode} readOnly className="bg-slate-50 cursor-not-allowed" />
                        </Field>
                    </div>
                    <p className="mt-3 rounded-lg bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800">
                        Profile, organization, budget, vendor compliance, risk, workflow, and audit details are shown as auto-fetched values and should remain read-only for normal users.
                    </p>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <div className="flex items-center justify-between gap-2">
                        <h3 className="text-sm font-black text-[#12335f]">2. Items / Products / Services</h3>
                        <Button type="button" variant="outline" onClick={() => setItems(prev => [...prev, { id: String(Date.now()), name: '', spec: '', qty: 1, unit: 'Nos', price: 0, tax: 18 }])} className="h-8 text-xs">
                            <Plus className="mr-1 h-3 w-3" /> Add Item
                        </Button>
                    </div>
                    <div className="mt-3 overflow-x-auto rounded-lg border border-slate-200">
                        <table className="min-w-[760px] w-full text-xs">
                            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                <tr>{['Product / Service', 'Specification', 'Qty', 'Unit', 'Unit Price', 'Tax %', 'Total', 'Action'].map(head => <th key={head} className="px-2 py-2 text-left">{head}</th>)}</tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {items.map(item => {
                                    const total = Number(item.qty || 0) * Number(item.price || 0) * (1 + Number(item.tax || 0) / 100);
                                    return (
                                        <tr key={item.id}>
                                            <td className="px-2 py-2"><Input value={item.name} onChange={e => setItems(prev => prev.map(row => row.id === item.id ? { ...row, name: e.target.value } : row))} /></td>
                                            <td className="px-2 py-2"><Input value={item.spec} onChange={e => setItems(prev => prev.map(row => row.id === item.id ? { ...row, spec: e.target.value } : row))} /></td>
                                            <td className="px-2 py-2"><Input type="number" value={item.qty} onChange={e => setItems(prev => prev.map(row => row.id === item.id ? { ...row, qty: Number(e.target.value) || 0 } : row))} /></td>
                                            <td className="px-2 py-2"><Input value={item.unit} onChange={e => setItems(prev => prev.map(row => row.id === item.id ? { ...row, unit: e.target.value } : row))} /></td>
                                            <td className="px-2 py-2"><Input type="number" value={item.price} onChange={e => setItems(prev => prev.map(row => row.id === item.id ? { ...row, price: Number(e.target.value) || 0 } : row))} /></td>
                                            <td className="px-2 py-2"><Input type="number" value={item.tax} onChange={e => setItems(prev => prev.map(row => row.id === item.id ? { ...row, tax: Number(e.target.value) || 0 } : row))} /></td>
                                            <td className="px-2 py-2 font-black">{formatCurrency(total)}</td>
                                            <td className="px-2 py-2"><Button variant="outline" onClick={() => setItems(prev => prev.filter(row => row.id !== item.id))} disabled={items.length === 1} className="h-8 w-8 p-0 text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button></td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                    <div className="mt-3 grid gap-2 md:grid-cols-3 text-xs font-bold">
                        <p className="rounded bg-slate-50 px-3 py-2">Sub Total: {formatCurrency(subTotal)}</p>
                        <p className="rounded bg-slate-50 px-3 py-2">Total Tax: {formatCurrency(taxTotal)}</p>
                        <p className="rounded bg-blue-50 px-3 py-2 text-[#12335f]">Grand Total: {formatCurrency(grandTotal)}</p>
                    </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-4">
                    <h3 className="text-sm font-black text-[#12335f]">3. Delivery, Budget, Compliance & Attachments</h3>
                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Field label="Budget Allocated">
                            <Input value={budgetAllocated} onChange={e => setBudgetAllocated(e.target.value)} type="number" />
                        </Field>
                        <Field label="Budget Consumed">
                            <Input value={budgetConsumed} onChange={e => setBudgetConsumed(e.target.value)} type="number" />
                        </Field>
                        <Field label="Budget Available">
                            <Input value={String(budgetAvailable)} readOnly />
                        </Field>
                        <Field label="Budget Remaining After Purchase">
                            <Input value={String(Math.round(budgetRemaining * 100) / 100)} readOnly />
                        </Field>
                        <Field label="Compliance Status">
                            <Input value="GST, PAN, Udyam, and Bank verified" readOnly />
                        </Field>
                        <Field label="Risk Assessment">
                            <Input value="Low risk · not blacklisted · not blocked" readOnly />
                        </Field>
                    </div>
                    <label className="mt-3 flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#12335f]/30 bg-blue-50/40 text-center text-xs font-bold text-[#12335f]">
                        <Upload className="mb-1 h-5 w-5" /> Upload justification, vendor quotation, budget note, compliance documents
                        <input type="file" multiple className="hidden" onChange={e => setAttachments(prev => [...prev, ...Array.from(e.target.files || []).map(file => ({ name: file.name, size: file.size }))])} />
                    </label>
                    <div className="mt-2 flex flex-wrap gap-2">{attachments.map(file => <span key={file.name} className="rounded bg-slate-100 px-2 py-1 text-[10px] font-bold text-slate-600">{file.name}</span>)}</div>
                </div>

                <div className="grid gap-3 md:grid-cols-3">
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <h3 className="text-sm font-black text-[#12335f]">Approval Workflow</h3>
                        {['Department Head', 'Finance Officer', 'Procurement Officer', 'Competent Authority'].map(role => <p key={role} className="flex justify-between border-b border-slate-100 py-2 text-xs font-bold last:border-0"><span>{role}</span><span className="text-amber-600">Pending</span></p>)}
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <h3 className="text-sm font-black text-[#12335f]">Purchase Summary</h3>
                        <p className="flex justify-between border-b border-slate-100 py-2 text-xs font-bold"><span>Item Count</span><span>{items.length}</span></p>
                        <p className="flex justify-between border-b border-slate-100 py-2 text-xs font-bold"><span>Total Quantity</span><span>{items.reduce((sum, item) => sum + Number(item.qty || 0), 0)}</span></p>
                        <p className="flex justify-between py-2 text-xs font-black text-[#12335f]"><span>Grand Total</span><span>{formatCurrency(grandTotal)}</span></p>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                        <h3 className="text-sm font-black text-[#12335f]">Post Purchase Tracking</h3>
                        {['Purchase Request', 'PO Generated', 'GRN Created', 'Invoice Submitted', 'Payment Released'].map((stage, index) => <p key={stage} className="flex justify-between border-b border-slate-100 py-2 text-xs font-bold last:border-0"><span>{stage}</span><span className={index === 0 ? 'text-emerald-600' : 'text-slate-400'}>{index === 0 ? 'Ready' : 'Pending'}</span></p>)}
                    </div>
                </div>
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
