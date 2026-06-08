/**
 * TechnicalReviewPage — Technical Officer reviews individual cart line items.
 *
 * Route: /cart/technical-review
 * Access: ORG_ADMIN, TECHNICAL_OFFICER
 */
import { useState } from 'react';
import { CheckCircle2, Clock, Cog, PackageSearch, RefreshCw, Shield, Wrench, X, XCircle } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { useOrgRole } from '../../../hooks/useOrgRole';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { usePendingTechReview, useTechApproveItem, useTechRejectItem } from '../hooks';
import type { CartItemDto } from '../api';

export default function TechnicalReviewPage() {
    const { isOrgAdmin, isTechnicalOfficer, orgRole } = useOrgRole();
    const { data, isLoading, error, refetch, isFetching } = usePendingTechReview();
    const approveMut = useTechApproveItem();
    const rejectMut = useTechRejectItem();
    const [rejecting, setRejecting] = useState<CartItemDto | null>(null);
    const [approveNote, setApproveNote] = useState<Record<number, string>>({});
    const [processedIds, setProcessedIds] = useState<Set<number>>(() => new Set());

    const items = (data || []).filter(item => !processedIds.has(item.id));
    const allowed = isOrgAdmin || isTechnicalOfficer;

    if (orgRole && !allowed) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="text-center">
                    <Shield className="mx-auto h-12 w-12 text-slate-300" />
                    <p className="mt-3 text-sm font-black uppercase text-slate-600 tracking-widest">Access Restricted</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">Only Technical Officers can review items.</p>
                </div>
            </div>
        );
    }

    const handleApprove = async (item: CartItemDto) => {
        const note = approveNote[item.id];
        setProcessedIds(prev => {
            const next = new Set(prev);
            next.add(item.id);
            return next;
        });
        try {
            await runWithToast(() => approveMut.mutateAsync({ id: item.id, note }), {
                loading: 'Approving...',
                success: 'Item technically approved',
                error: 'Approval failed'
            });
            setApproveNote(prev => { const n = { ...prev }; delete n[item.id]; return n; });
        } catch (err) {
            setProcessedIds(prev => {
                const next = new Set(prev);
                next.delete(item.id);
                return next;
            });
        }
    };

    if (isLoading) return <LoadingState label="Loading items pending review..." />;
    if (error) return <InlineError message={(error as Error).message} onRetry={() => refetch()} />;

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Technical · Review</p>
                    <h1 className="text-2xl font-black text-slate-950">Technical Review Queue</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Review the technical specifications of items in submitted carts before Finance approves.
                    </p>
                </div>
                <Button variant="outline" onClick={() => refetch()} className="h-10 rounded-lg text-xs font-black uppercase">
                    <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>

            {items.length === 0 ? (
                <Card className="border-slate-200/80">
                    <CardContent className="py-12">
                        <EmptyState
                            title="No items pending review"
                            description="All caught up. Items will appear here when carts are submitted by your team."
                        />
                    </CardContent>
                </Card>
            ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                    {items.map(item => {
                        const isProduct = !!item.productId;
                        const cart = (item as any).cart as { id: number; notes?: string; createdAt: string; createdBy: { name: string; email: string } };
                        const productInfo = (item as any).product as { name: string; description?: string; hsnCode?: string; unitOfMeasure?: string } | null;
                        const serviceInfo = (item as any).service as { name: string; description?: string } | null;

                        return (
                            <Card key={item.id} className="border-slate-200/80 shadow-sm">
                                <CardContent className="p-0">
                                    <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3 flex items-center justify-between">
                                        <div className="flex items-center gap-2">
                                            <EntityIdLink
                                                label={`${isProduct ? 'PRD' : 'SVC'}-${item.productId || item.serviceId}`}
                                                id={item.productId || item.serviceId || 0}
                                                size="sm"
                                                onClick={() => { }}
                                            />
                                            {isProduct ? <PackageSearch className="h-4 w-4 text-slate-400" /> : <Wrench className="h-4 w-4 text-slate-400" />}
                                        </div>
                                        <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
                                            <Clock className="mr-1 h-3 w-3" /> Pending Review
                                        </span>
                                    </div>

                                    <div className="p-4 space-y-3">
                                        <div>
                                            <p className="text-base font-black text-slate-950 text-wrap-anywhere">{item.itemName}</p>
                                            {(productInfo?.description || serviceInfo?.description) && (
                                                <p className="mt-1 text-xs text-slate-600 text-wrap-anywhere">
                                                    {productInfo?.description || serviceInfo?.description}
                                                </p>
                                            )}
                                        </div>

                                        <div className="grid grid-cols-2 gap-2">
                                            <Field label="Qty" value={`${Number(item.quantity)} ${item.unitOfMeasure}`} />
                                            <Field label="Unit Price" value={formatCurrency(item.unitPrice)} />
                                            <Field label="Total" value={formatCurrency(Number(item.quantity) * Number(item.unitPrice))} />
                                            {productInfo?.hsnCode && <Field label="HSN" value={productInfo.hsnCode} />}
                                        </div>

                                        <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Seller</p>
                                            <p className="mt-0.5 font-bold text-slate-900 text-wrap-anywhere">{item.seller?.name}</p>
                                            <p className="text-[10px] text-slate-500 text-wrap-anywhere">{item.seller?.email}</p>
                                        </div>

                                        <div className="rounded-lg border border-blue-100 bg-blue-50/40 px-3 py-2 text-xs">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Cart Context</p>
                                            <p className="mt-0.5 text-xs font-semibold text-slate-700">
                                                CART-{cart?.id} by <span className="font-black">{cart?.createdBy?.name}</span> · {formatRelative(cart?.createdAt)}
                                            </p>
                                            {cart?.notes && (
                                                <p className="mt-1 text-[11px] text-slate-600 text-wrap-anywhere italic">"{cart.notes}"</p>
                                            )}
                                        </div>

                                        <div className="space-y-1">
                                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                                                Approval Note (optional)
                                            </label>
                                            <input
                                                type="text"
                                                value={approveNote[item.id] || ''}
                                                onChange={e => setApproveNote(prev => ({ ...prev, [item.id]: e.target.value }))}
                                                placeholder="Specs match requirement..."
                                                maxLength={1000}
                                                className="h-9 w-full rounded-lg border border-slate-200 px-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                                            />
                                        </div>
                                    </div>

                                    <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3 flex justify-end gap-2">
                                        <Button
                                            variant="outline"
                                            onClick={() => setRejecting(item)}
                                            disabled={approveMut.isPending || rejectMut.isPending}
                                            className="border-red-200 text-red-700 hover:bg-red-50"
                                        >
                                            <XCircle className="mr-2 h-4 w-4" /> Reject
                                        </Button>
                                        <Button
                                            onClick={() => handleApprove(item)}
                                            disabled={approveMut.isPending}
                                            className="bg-emerald-600 text-white hover:bg-emerald-700"
                                        >
                                            {approveMut.isPending && (approveMut.variables as any)?.id === item.id ? (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            ) : (
                                                <CheckCircle2 className="mr-2 h-4 w-4" />
                                            )}
                                            Approve
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        );
                    })}
                </div>
            )}

            {rejecting && (
                <RejectModal
                    item={rejecting}
                    onClose={() => setRejecting(null)}
                    onSubmit={async (note) => {
                        const itemId = rejecting.id;
                        setProcessedIds(prev => {
                            const next = new Set(prev);
                            next.add(itemId);
                            return next;
                        });
                        try {
                            await runWithToast(() => rejectMut.mutateAsync({ id: itemId, note }), {
                                loading: 'Rejecting...',
                                success: 'Item rejected',
                                error: 'Rejection failed'
                            });
                            setRejecting(null);
                        } catch (err) {
                            setProcessedIds(prev => {
                                const next = new Set(prev);
                                next.delete(itemId);
                                return next;
                            });
                        }
                    }}
                    pending={rejectMut.isPending}
                />
            )}
        </div>
    );
}

function Field({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-md border border-slate-100 bg-slate-50/60 px-2.5 py-1.5">
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-0.5 text-xs font-black text-slate-900 text-wrap-anywhere">{value}</p>
        </div>
    );
}

function RejectModal({ item, onClose, onSubmit, pending }: { item: CartItemDto; onClose: () => void; onSubmit: (note: string) => Promise<void>; pending: boolean }) {
    const [note, setNote] = useState('');
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-red-700 to-red-800 px-5 py-4 text-white">
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest">Reject Item</h3>
                        <p className="mt-0.5 text-[10px] text-white/70">{item.itemName}</p>
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Technical Reason for Rejection</label>
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder="Specs don't match, alternative recommended, certification expired..."
                            rows={4}
                            maxLength={1000}
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
