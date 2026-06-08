/**
 * CartPage — organisation-level shopping cart.
 *
 * Route: /cart
 * Access: any org member except VIEWER
 *
 * Active cart shows current items. Buttons: Update qty, Remove, Submit for Approval.
 * If cart is in another state (submitted/approved/rejected), shows status with timeline.
 */
import { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, CheckCircle2, Clock, History, Minus, Plus, RefreshCw, Send, ShoppingCart, Store, Trash2, X, XCircle } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { useAuth } from '../../../hooks/useAuth';
import { useOrgRole } from '../../../hooks/useOrgRole';
import { cn } from '../../../lib/utils';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import {
    useActiveCart,
    useApproveCart,
    useCartDetail,
    useCartHistory,
    useRejectCart,
    useRemoveCartItem,
    useSubmitCart,
    useUpdateCartItem
} from '../hooks';
import { useStartCartApprovalChain, useApprovalTrail } from '../../approvals/hooks';
import { ApprovalTrail } from '../../approvals/components/ApprovalTrail';
import { CreateOrganizationModal } from '../../orgTeam/components/CreateOrganizationModal';
import type { CartItemDto, CartStatus } from '../api';

const STATUS_TONE: Record<CartStatus, string> = {
    ACTIVE: 'border-blue-200 bg-blue-50 text-blue-700',
    SUBMITTED_FOR_APPROVAL: 'border-amber-200 bg-amber-50 text-amber-700',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    REJECTED: 'border-red-200 bg-red-50 text-red-700',
    CONVERTED_TO_ORDER: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    ABANDONED: 'border-slate-200 bg-slate-100 text-slate-500'
};

export default function CartPage() {
    const { user } = useAuth();
    const orgRoleCtx = useOrgRole();
    const { canTransact, isViewer, isProcurementOfficer, isOrgAdmin, isFinanceOfficer } = orgRoleCtx;

    const router = useRouter();
    const searchParams = useSearchParams();

    const paramId = searchParams.get('id') || searchParams.get('cartId');
    const selectedCartId = paramId ? Number(paramId) : null;

    const activeCartQuery = useActiveCart();
    const cartDetailQuery = useCartDetail(selectedCartId || undefined);
    const cartQuery = selectedCartId ? cartDetailQuery : activeCartQuery;

    const historyQuery = useCartHistory();
    const removeMut = useRemoveCartItem();
    const updateMut = useUpdateCartItem();
    const submitMut = useSubmitCart();
    const startChainMut = useStartCartApprovalChain();
    const approveCartMut = useApproveCart();
    const rejectCartMut = useRejectCart();
    const [showHistory, setShowHistory] = useState(false);
    const [showSubmitModal, setShowSubmitModal] = useState(false);
    const [showCreateOrg, setShowCreateOrg] = useState(false);
    const [showRejectModal, setShowRejectModal] = useState<number | null>(null);

    const cart = cartQuery.data;
    const history = historyQuery.data || [];
    const trailQuery = useApprovalTrail('cart', cart?.id);
    const hasChain = !!(trailQuery.data?.trail && trailQuery.data.trail.length > 0);

    const totals = useMemo(() => {
        if (!cart) return { lineCount: 0, total: 0, sellerCount: 0 };
        const sellerSet = new Set(cart.items.map(i => i.sellerId));
        const total = cart.items.reduce((sum, it) => sum + Number(it.quantity) * Number(it.unitPrice), 0);
        return { lineCount: cart.items.length, total, sellerCount: sellerSet.size };
    }, [cart]);

    const techApprovalNeeded = cart?.items.some(i => i.technicalApproved === null) ?? false;
    const allTechApproved = cart?.items.every(i => i.technicalApproved === true) ?? false;
    const isSubmittable = canTransact && cart?.status === 'ACTIVE' && cart.items.length > 0;

    const handleRemove = async (item: CartItemDto) => {
        if (!window.confirm(`Remove "${item.itemName}" from the cart?`)) return;
        await runWithToast(() => removeMut.mutateAsync(item.id), {
            loading: 'Removing...',
            success: 'Item removed',
            error: 'Failed to remove'
        });
    };

    const handleUpdate = async (id: number, qty: number) => {
        if (qty < 1) return;
        await runWithToast(() => updateMut.mutateAsync({ id, quantity: qty }), {
            loading: 'Updating...',
            success: 'Quantity updated',
            error: 'Failed to update'
        });
    };

    if (cartQuery.isLoading) return <LoadingState label="Loading cart..." />;
    if (cartQuery.error) {
        const msg = (cartQuery.error as Error).message || '';
        const isOrgRequired = /organisation|ORG_REQUIRED|belong to an org/i.test(msg);
        if (isOrgRequired) {
            return (
                <div className="space-y-4">
                    <div className="brand-tricolor-strip rounded-full" />
                    <Card className="border-slate-200/80 shadow-sm">
                        <CardContent className="p-8">
                            <EmptyState
                                title="No organisation linked"
                                description="The cart is shared across your organisation. Create one to get started — you'll automatically be the Org Admin and can invite teammates."
                                icon={Store}
                                action={{
                                    label: 'Create Organisation',
                                    onClick: () => setShowCreateOrg(true)
                                }}
                            />
                        </CardContent>
                    </Card>
                    <CreateOrganizationModal
                        open={showCreateOrg}
                        onClose={() => setShowCreateOrg(false)}
                        onCreated={() => cartQuery.refetch()}
                    />
                </div>
            );
        }
        return <InlineError message={msg} onRetry={() => cartQuery.refetch()} />;
    }

    return (
        <div className="space-y-4">
            <div className="brand-tricolor-strip rounded-full" />
            {/* Header */}
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement</p>
                    <h1 className="text-2xl font-black text-slate-950">My Organisation Cart</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Add items to cart, get them approved by Finance and Technical Officers, then convert to PO/RFQ.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    {selectedCartId && (
                        <Button variant="outline" onClick={() => router.push('/cart')} className="h-10 rounded-lg text-xs font-black uppercase">
                            <ShoppingCart className="mr-2 h-4 w-4" /> Active Cart
                        </Button>
                    )}
                    <Button variant="outline" onClick={() => setShowHistory(!showHistory)} className="h-10 rounded-lg text-xs font-black uppercase">
                        <History className="mr-2 h-4 w-4" /> History ({history.length})
                    </Button>
                    <Button variant="outline" onClick={() => cartQuery.refetch()} className="h-10 rounded-lg text-xs font-black uppercase">
                        <RefreshCw className={`mr-2 h-4 w-4 ${cartQuery.isFetching ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                </div>
            </div>

            {isViewer && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-semibold text-amber-800">
                    You have viewer access. You can see the cart but cannot make changes.
                </div>
            )}

            {/* Metrics */}
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Status" value={(cart?.status || 'ACTIVE').replace(/_/g, ' ')} icon={ShoppingCart} />
                <Metric label="Line Items" value={totals.lineCount} icon={ShoppingCart} />
                <Metric label="Sellers" value={totals.sellerCount} icon={Store} />
                <Metric label="Total Value" value={formatCurrency(totals.total)} icon={ShoppingCart} />
            </div>

            {/* Status banners */}
            {cart?.status === 'SUBMITTED_FOR_APPROVAL' && (
                <>
                    <Banner
                        icon={Clock}
                        tone="amber"
                        title="Awaiting Finance Approval"
                        description={`Submitted ${formatRelative(cart.updatedAt)}. ${techApprovalNeeded ? 'Some items still need technical review.' : 'All items technically approved.'}`}
                    />
                    {(isOrgAdmin || isFinanceOfficer) && (
                        <div className="rounded-lg border border-amber-200 bg-amber-50/40 p-4">
                            <div className="flex items-center justify-between gap-3 flex-wrap">
                                <div>
                                    <p className="text-xs font-black uppercase tracking-wider text-amber-700">Finance Approval Pending</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-700">
                                        As a Finance Officer / Org Admin, you can decide on this cart. {techApprovalNeeded ? 'Note: Some items still need technical review before you can approve.' : 'All items have been technically approved.'}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <Button
                                        variant="outline"
                                        onClick={() => setShowRejectModal(cart.id)}
                                        disabled={approveCartMut.isPending || rejectCartMut.isPending}
                                        className="border-red-200 text-red-700 hover:bg-red-50"
                                    >
                                        <XCircle className="mr-2 h-4 w-4" /> Reject Cart
                                    </Button>
                                    <Button
                                        onClick={async () => {
                                            await runWithToast(() => approveCartMut.mutateAsync(cart.id), {
                                                loading: 'Approving cart...',
                                                success: 'Cart approved by Finance',
                                                error: 'Failed to approve cart'
                                            });
                                        }}
                                        disabled={approveCartMut.isPending || techApprovalNeeded}
                                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                                    >
                                        {approveCartMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                        Approve Cart
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
            {cart?.status === 'APPROVED' && (
                <>
                    <Banner
                        icon={CheckCircle2}
                        tone="emerald"
                        title="Cart Approved by Finance"
                        description={`Approved by ${cart.approvedBy?.name || 'Finance'} ${formatRelative(cart.approvedAt)}. Procurement Officer can now start the multi-level approval chain to convert this to a Purchase Order.`}
                    />
                    {(isProcurementOfficer || isOrgAdmin) && (
                        <div className="rounded-lg border border-blue-200 bg-blue-50/40 p-4">
                            {!hasChain ? (
                                <div className="flex items-center justify-between gap-3">
                                    <div>
                                        <p className="text-xs font-black uppercase tracking-wider text-blue-700">Procurement Approval Chain</p>
                                        <p className="mt-1 text-xs font-semibold text-slate-700">
                                            Start the multi-level approval (Department Head → Finance → Procurement Head) to convert this cart to a Purchase Order.
                                        </p>
                                    </div>
                                    <Button
                                        onClick={async () => {
                                            await runWithToast(() => startChainMut.mutateAsync(cart.id), {
                                                loading: 'Starting approval chain...',
                                                success: 'Approval chain started',
                                                error: 'Failed to start chain'
                                            });
                                        }}
                                        disabled={startChainMut.isPending}
                                        className="bg-[#12335f] text-white hover:bg-[#0e2a4f]"
                                    >
                                        {startChainMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                        Start Approval Chain
                                    </Button>
                                </div>
                            ) : (
                                <div className="mb-3">
                                    <p className="text-xs font-black uppercase tracking-wider text-blue-700">Procurement Approval Chain Started</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-700">
                                        The multi-stage approval (Department Head → Finance → Procurement Head) is currently active or completed.
                                    </p>
                                </div>
                            )}
                            <div className={cn("mt-3", !hasChain && "hidden")}>
                                <ApprovalTrail entityType="cart" entityId={cart.id} />
                            </div>
                        </div>
                    )}
                </>
            )}
            {cart?.status === 'REJECTED' && (
                <Banner
                    icon={XCircle}
                    tone="red"
                    title="Cart Rejected"
                    description={`Rejected by ${cart.rejectedBy?.name || 'Finance'}: ${cart.rejectionNote}`}
                />
            )}

            {/* Cart Items */}
            <Card className="border-slate-200/80 shadow-sm">
                <CardContent className="p-0">
                    <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cart Items ({totals.lineCount})</p>
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[cart?.status || 'ACTIVE']}`}>
                            {(cart?.status || 'ACTIVE').replace(/_/g, ' ')}
                        </span>
                    </div>
                    {!cart || cart.items.length === 0 ? (
                        <EmptyState
                            title="Cart is empty"
                            description="Browse the marketplace and add products or services to your cart."
                        />
                    ) : (
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[900px] text-sm">
                                <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left w-12">#</th>
                                        <th className="px-4 py-2.5 text-left">Item</th>
                                        <th className="px-4 py-2.5 text-left w-44">Seller</th>
                                        <th className="px-4 py-2.5 text-right w-32">Unit Price</th>
                                        <th className="px-4 py-2.5 text-center w-32">Quantity</th>
                                        <th className="px-4 py-2.5 text-right w-32">Total</th>
                                        <th className="px-4 py-2.5 text-left w-32">Tech Status</th>
                                        <th className="px-4 py-2.5 text-right w-20">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {cart.items.map((item, idx) => {
                                        const lineTotal = Number(item.quantity) * Number(item.unitPrice);
                                        return (
                                            <tr key={item.id} className="hover:bg-slate-50/60">
                                                <td className="px-4 py-3 font-mono text-xs text-slate-400">{String(idx + 1).padStart(2, '0')}</td>
                                                <td className="px-4 py-3">
                                                    <EntityIdLink
                                                        label={`${item.productId ? 'PRD' : 'SVC'}-${item.productId || item.serviceId}`}
                                                        id={item.productId || item.serviceId || 0}
                                                        size="sm"
                                                        onClick={() => { }}
                                                    />
                                                    <p className="mt-1 text-sm font-black text-slate-900 text-wrap-anywhere">{item.itemName}</p>
                                                    <p className="text-[10px] font-semibold text-slate-500">{item.unitOfMeasure}</p>
                                                </td>
                                                <td className="px-4 py-3 text-xs">
                                                    <p className="font-bold text-slate-900 text-wrap-anywhere">{item.seller?.name || `Seller #${item.sellerId}`}</p>
                                                    {item.seller?.email && <p className="text-[10px] text-slate-500 text-wrap-anywhere">{item.seller.email}</p>}
                                                </td>
                                                <td className="px-4 py-3 text-right text-xs font-bold text-slate-900">{formatCurrency(item.unitPrice)}</td>
                                                <td className="px-4 py-3">
                                                    {cart.status === 'ACTIVE' && canTransact ? (
                                                        <div className="flex items-center justify-center gap-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUpdate(item.id, Number(item.quantity) - 1)}
                                                                disabled={Number(item.quantity) <= 1 || updateMut.isPending}
                                                                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                                                            >
                                                                <Minus className="h-3 w-3" />
                                                            </button>
                                                            <span className="min-w-8 text-center font-mono text-sm font-bold">{Number(item.quantity)}</span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleUpdate(item.id, Number(item.quantity) + 1)}
                                                                disabled={updateMut.isPending}
                                                                className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                                                            >
                                                                <Plus className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <p className="text-center font-mono text-sm font-bold">{Number(item.quantity)}</p>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right text-sm font-black text-slate-950">{formatCurrency(lineTotal)}</td>
                                                <td className="px-4 py-3">
                                                    {item.technicalApproved === null ? (
                                                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase text-slate-500">Pending</span>
                                                    ) : item.technicalApproved ? (
                                                        <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">Approved</span>
                                                    ) : (
                                                        <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase text-red-700" title={item.technicalNote || ''}>Rejected</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-3 text-right">
                                                    {cart.status === 'ACTIVE' && canTransact && (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleRemove(item)}
                                                            disabled={removeMut.isPending}
                                                            className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-40"
                                                            title="Remove from cart"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                                <tfoot className="border-t-2 border-slate-200 bg-slate-50/60">
                                    <tr>
                                        <td colSpan={5} className="px-4 py-3 text-right text-xs font-black uppercase tracking-widest text-slate-500">Grand Total</td>
                                        <td className="px-4 py-3 text-right text-base font-black text-slate-950">{formatCurrency(totals.total)}</td>
                                        <td colSpan={2} />
                                    </tr>
                                </tfoot>
                            </table>
                        </div>
                    )}

                    {cart && cart.items.length > 0 && (
                        <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3 flex items-center justify-between">
                            <p className="text-[11px] font-semibold text-slate-500">
                                Created by {cart.createdBy?.name} · {formatDateTime(cart.createdAt)}
                            </p>
                            {isSubmittable && (
                                <Button
                                    onClick={() => setShowSubmitModal(true)}
                                    disabled={submitMut.isPending}
                                    className="bg-[#12335f] text-white hover:bg-[#0e2a4f]"
                                >
                                    <Send className="mr-2 h-4 w-4" /> Submit for Approval
                                </Button>
                            )}
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* History */}
            {showHistory && (
                <Card className="border-slate-200/80 shadow-sm">
                    <CardContent className="p-0">
                        <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Cart History (last 50)</p>
                        </div>
                        {history.length === 0 ? (
                            <EmptyState title="No past carts" />
                        ) : (
                            <div className="divide-y divide-slate-100">
                                {history.map(c => {
                                    const total = c.items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitPrice), 0);
                                    return (
                                        <div key={c.id} className="flex items-center justify-between gap-4 px-4 py-3">
                                            <div className="min-w-0 flex-1">
                                                <div className="flex items-center gap-2">
                                                    <EntityIdLink
                                                        label={`CART-${c.id}`}
                                                        id={c.id}
                                                        size="sm"
                                                        onClick={() => {
                                                            router.push(`/cart?id=${c.id}`);
                                                            window.scrollTo({ top: 0, behavior: 'smooth' });
                                                        }}
                                                    />
                                                    <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[c.status]}`}>
                                                        {c.status.replace(/_/g, ' ')}
                                                    </span>
                                                </div>
                                                <p className="mt-1 text-xs font-semibold text-slate-700">
                                                    {c.items.length} items · {formatCurrency(total)} · by {c.createdBy?.name}
                                                </p>
                                                <p className="text-[10px] text-slate-400">{formatDateTime(c.updatedAt)} ({formatRelative(c.updatedAt)})</p>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* Submit Modal */}
            {showSubmitModal && cart && (
                <SubmitModal
                    onClose={() => setShowSubmitModal(false)}
                    onSubmit={async (notes) => {
                        await runWithToast(() => submitMut.mutateAsync(notes), {
                            loading: 'Submitting...',
                            success: 'Cart submitted for Finance approval',
                            error: 'Failed to submit'
                        });
                        setShowSubmitModal(false);
                    }}
                    pending={submitMut.isPending}
                    itemCount={cart.items.length}
                    total={totals.total}
                />
            )}

            {/* Reject Modal */}
            {showRejectModal && (
                <RejectCartModal
                    cartId={showRejectModal}
                    onClose={() => setShowRejectModal(null)}
                    onSubmit={async (note) => {
                        await runWithToast(() => rejectCartMut.mutateAsync({ id: showRejectModal, note }), {
                            loading: 'Rejecting...',
                            success: 'Cart rejected',
                            error: 'Failed to reject'
                        });
                        setShowRejectModal(null);
                    }}
                    pending={rejectCartMut.isPending}
                />
            )}
        </div>
    );
}

function RejectCartModal({ cartId, onClose, onSubmit, pending }: { cartId: number; onClose: () => void; onSubmit: (note: string) => Promise<void>; pending: boolean }) {
    const [note, setNote] = useState('');
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-red-700 to-red-800 px-5 py-4 text-white">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest">Reject Cart</h3>
                        <p className="mt-0.5 text-[10px] text-white/70">CART-{cartId}</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Reason for Rejection</label>
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Tell the requester why this cart is being rejected..."
                            rows={4}
                            maxLength={2000}
                            required
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-red-500/20"
                        />
                        <p className="text-[10px] text-slate-400">Minimum 5 characters.</p>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button
                            onClick={() => onSubmit(note.trim())}
                            disabled={pending || note.trim().length < 5}
                            className="bg-red-600 text-white hover:bg-red-700"
                        >
                            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                            Confirm Rejection
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
    return (
        <Card>
            <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-1 text-base font-black text-slate-950 text-wrap-anywhere">{value}</p>
                </div>
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#12335f] text-white">
                    <Icon className="h-5 w-5" />
                </div>
            </CardContent>
        </Card>
    );
}

function Banner({ icon: Icon, tone, title, description }: { icon: any; tone: 'amber' | 'emerald' | 'red'; title: string; description: string }) {
    const tones = {
        amber: 'bg-amber-50 border-amber-200 text-amber-800 [--icon:#f59e0b]',
        emerald: 'bg-emerald-50 border-emerald-200 text-emerald-800 [--icon:#10b981]',
        red: 'bg-red-50 border-red-200 text-red-800 [--icon:#ef4444]'
    };
    return (
        <div className={`rounded-lg border p-3 ${tones[tone]}`}>
            <div className="flex items-start gap-2">
                <Icon className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--icon)' }} />
                <div className="flex-1 min-w-0">
                    <p className="text-xs font-black uppercase tracking-wider">{title}</p>
                    <p className="mt-0.5 text-xs font-semibold text-wrap-anywhere">{description}</p>
                </div>
            </div>
        </div>
    );
}

function SubmitModal({ onClose, onSubmit, pending, itemCount, total }: { onClose: () => void; onSubmit: (notes: string) => Promise<void>; pending: boolean; itemCount: number; total: number }) {
    const [notes, setNotes] = useState('');
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-5 py-4 text-white">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest">Submit Cart for Approval</h3>
                        <p className="mt-0.5 text-[10px] text-white/70">Notify your Finance Officer</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold text-slate-700">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Summary</p>
                        <p className="mt-1">{itemCount} items · {formatCurrency(total)}</p>
                    </div>
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Notes for Finance Officer (optional)</label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Reason for purchase, urgency, project reference..."
                            rows={3}
                            maxLength={2000}
                            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                        />
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button type="button" variant="outline" onClick={onClose}>Cancel</Button>
                        <Button onClick={() => onSubmit(notes.trim() || undefined as any)} disabled={pending} className="bg-[#12335f] text-white">
                            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                            Submit for Approval
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
