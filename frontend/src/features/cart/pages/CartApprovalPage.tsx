/**
 * CartApprovalPage — Finance Officer reviews and approves/rejects submitted carts.
 *
 * Route: /cart/approvals
 * Access: ORG_ADMIN, FINANCE_OFFICER
 */
import { useState } from 'react';
import {
    AlertCircle,
    CheckCircle2,
    ChevronDown,
    Clock,
    Inbox,
    Loader2,
    RefreshCw,
    Shield,
    User as UserIcon,
    X,
    XCircle
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { useOrgRole } from '../../../hooks/useOrgRole';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { useApproveCart, usePendingApprovals, useRejectCart } from '../hooks';
import type { CartDto, CartItemDto } from '../api';

export default function CartApprovalPage() {
    const { isOrgAdmin, isFinanceOfficer, orgRole } = useOrgRole();
    const { data, isLoading, error, refetch, isFetching } = usePendingApprovals();
    const approveMut = useApproveCart();
    const rejectMut = useRejectCart();
    const [expanded, setExpanded] = useState<number | null>(null);
    const [rejectingId, setRejectingId] = useState<number | null>(null);

    const carts = data || [];
    const allowed = isOrgAdmin || isFinanceOfficer;

    if (orgRole && !allowed) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="text-center">
                    <Shield className="mx-auto h-12 w-12 text-slate-300" />
                    <p className="mt-3 text-sm font-black uppercase text-slate-600 tracking-widest">Access Restricted</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">Only Finance Officers can approve carts.</p>
                </div>
            </div>
        );
    }

    const handleApprove = async (cart: CartDto) => {
        await runWithToast(() => approveMut.mutateAsync(cart.id), {
            loading: 'Approving...',
            success: 'Cart approved',
            error: 'Approval failed'
        });
    };

    if (isLoading) return <LoadingState label="Loading pending approvals..." />;
    if (error) return <InlineError message={(error as Error).message} onRetry={() => refetch()} />;

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Finance · Approvals</p>
                    <h1 className="text-2xl font-black text-slate-950">Cart Approvals</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Review carts submitted by your team and approve or reject them.
                    </p>
                </div>
                <Button variant="outline" onClick={() => refetch()} className="h-10 rounded-lg text-xs font-black uppercase">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>

            {carts.length === 0 ? (
                <Card className="border-slate-200/80">
                    <CardContent className="py-12">
                        <EmptyState
                            title="No carts pending approval"
                            description="All caught up. New submissions will appear here."
                        />
                    </CardContent>
                </Card>
            ) : (
                <div className="space-y-3">
                    {carts.map(cart => {
                        const total = cart.items.reduce((s, it) => s + Number(it.quantity) * Number(it.unitPrice), 0);
                        const techPending = cart.items.filter(i => i.technicalApproved === null).length;
                        const techApproved = cart.items.filter(i => i.technicalApproved === true).length;
                        const techRejected = cart.items.filter(i => i.technicalApproved === false).length;
                        const isExpanded = expanded === cart.id;

                        return (
                            <Card key={cart.id} className="border-slate-200/80 shadow-sm">
                                <CardContent className="p-0">
                                    <div className="px-4 py-3 flex items-start justify-between gap-3">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <EntityIdLink label={`CART-${cart.id}`} id={cart.id} size="sm" onClick={() => setExpanded(isExpanded ? null : cart.id)} />
                                                <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
                                                    <Clock className="mr-1 h-3 w-3" /> Pending Approval
                                                </span>
                                                {techPending > 0 && (
                                                    <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600">
                                                        {techPending} pending tech review
                                                    </span>
                                                )}
                                                {techRejected > 0 && (
                                                    <span className="inline-flex rounded-md border border-red-200 bg-red-50 px-2 py-0.5 text-[10px] font-black uppercase text-red-700">
                                                        {techRejected} tech rejected
                                                    </span>
                                                )}
                                                {techPending === 0 && techRejected === 0 && techApproved > 0 && (
                                                    <span className="inline-flex rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">
                                                        <CheckCircle2 className="mr-1 h-3 w-3" /> All tech approved
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-2 text-sm font-black text-slate-900">{cart.items.length} items · {formatCurrency(total)}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-600">
                                                Submitted by <span className="font-black">{cart.createdBy?.name}</span> ({cart.createdBy?.email}) · {formatRelative(cart.updatedAt)}
                                            </p>
                                            {cart.notes && (
                                                <div className="mt-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 text-wrap-anywhere">
                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Notes: </span>
                                                    {cart.notes}
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex flex-col items-end gap-2 shrink-0">
                                            <Button
                                                variant="outline"
                                                size="sm"
                                                onClick={() => setExpanded(isExpanded ? null : cart.id)}
                                                className="h-8 rounded-lg text-[10px] font-black uppercase"
                                            >
                                                <ChevronDown className={`mr-1 h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                {isExpanded ? 'Hide' : 'Items'}
                                            </Button>
                                        </div>
                                    </div>

                                    {isExpanded && (
                                        <div className="border-t border-slate-100 bg-slate-50/40">
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-sm">
                                                    <thead className="border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                                        <tr>
                                                            <th className="px-4 py-2 text-left">Item</th>
                                                            <th className="px-4 py-2 text-left w-44">Seller</th>
                                                            <th className="px-4 py-2 text-right w-24">Qty</th>
                                                            <th className="px-4 py-2 text-right w-32">Unit Price</th>
                                                            <th className="px-4 py-2 text-right w-32">Total</th>
                                                            <th className="px-4 py-2 text-left w-32">Tech</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {cart.items.map(item => (
                                                            <tr key={item.id}>
                                                                <td className="px-4 py-2">
                                                                    <p className="text-xs font-black text-slate-900 text-wrap-anywhere">{item.itemName}</p>
                                                                    <p className="text-[10px] text-slate-500">{item.unitOfMeasure}</p>
                                                                </td>
                                                                <td className="px-4 py-2 text-xs text-slate-700 text-wrap-anywhere">{item.seller?.name}</td>
                                                                <td className="px-4 py-2 text-right font-mono text-xs">{Number(item.quantity)}</td>
                                                                <td className="px-4 py-2 text-right text-xs font-bold">{formatCurrency(item.unitPrice)}</td>
                                                                <td className="px-4 py-2 text-right text-xs font-black">{formatCurrency(Number(item.quantity) * Number(item.unitPrice))}</td>
                                                                <td className="px-4 py-2">
                                                                    {item.technicalApproved === null ? (
                                                                        <span className="text-[10px] font-black uppercase text-slate-500">Pending</span>
                                                                    ) : item.technicalApproved ? (
                                                                        <span className="text-[10px] font-black uppercase text-emerald-700">Approved</span>
                                                                    ) : (
                                                                        <span className="text-[10px] font-black uppercase text-red-700" title={item.technicalNote || ''}>Rejected</span>
                                                                    )}
                                                                </td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3 flex justify-end gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={() => setRejectingId(cart.id)}
                                            disabled={approveMut.isPending || rejectMut.isPending}
                                            className="border-red-200 text-red-700 hover:bg-red-50"
                                        >
                                            <XCircle className="mr-2 h-4 w-4" /> Reject
                                        </Button>
                                        <Button
                                            onClick={() => handleApprove(cart)}
                                            disabled={approveMut.isPending || techPending > 0 || techRejected > 0}
                                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                                            title={techPending > 0 ? 'Items still need technical review' : techRejected > 0 ? 'Some items were technically rejected' : ''}
                                        >
                                            {approveMut.isPending && approveMut.variables === cart.id ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                            )}
                                            Approve Cart
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {rejectingId && (
                <RejectModal
                    cartId={rejectingId}
                    onClose={() => setRejectingId(null)}
                    onSubmit={async (note) => {
                        await runWithToast(() => rejectMut.mutateAsync({ id: rejectingId, note }), {
                            loading: 'Rejecting...',
                            success: 'Cart rejected',
                            error: 'Rejection failed'
                        });
                        setRejectingId(null);
                    }}
                    pending={rejectMut.isPending}
                />
            )}
        </div>
    );
}

function RejectModal({ cartId, onClose, onSubmit, pending }: { cartId: number; onClose: () => void; onSubmit: (note: string) => Promise<void>; pending: boolean }) {
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
