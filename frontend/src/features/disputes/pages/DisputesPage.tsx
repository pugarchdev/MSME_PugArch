/**
 * DisputesPage — full thread + evidence + admin resolution UI.
 *
 * Routes: /buyer/disputes, /seller/disputes, /admin/disputes
 *
 * View modes:
 *   - List: scrollable list of disputes for the role
 *   - Detail: thread + evidence + status updater (admin)
 */
import { useState } from 'react';
import {
    AlertTriangle, ArrowLeft, CheckCircle2, FileText, Loader2, Plus, RefreshCw,
    Send, Shield, X, XCircle
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { toast } from 'sonner';
import {
    useCreateDispute, useDispute, useDisputes, useSendDisputeMessage, useUpdateDisputeStatus
} from '../hooks';
import type { DisputeDto, DisputeStatus } from '../api';

const STATUS_TONE: Record<DisputeStatus, string> = {
    open: 'border-amber-200 bg-amber-50 text-amber-800',
    under_review: 'border-blue-200 bg-blue-50 text-blue-800',
    frozen: 'border-red-200 bg-red-50 text-red-800',
    resolved: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    rejected: 'border-slate-200 bg-slate-100 text-slate-700',
    closed: 'border-slate-200 bg-slate-100 text-slate-700'
};

export default function DisputesPage() {
    const { user } = useAuth();
    const isAdmin = user?.role === 'admin';
    const [selectedId, setSelectedId] = useState<number | null>(null);
    const [showCreate, setShowCreate] = useState(false);

    if (selectedId !== null) {
        return <DisputeDetail id={selectedId} onBack={() => setSelectedId(null)} isAdmin={isAdmin} />;
    }

    return (
        <DisputeList
            isAdmin={isAdmin}
            onSelect={setSelectedId}
            onCreate={() => setShowCreate(true)}
            showCreate={showCreate}
            onCloseCreate={() => setShowCreate(false)}
        />
    );
}

function DisputeList({ isAdmin, onSelect, onCreate, showCreate, onCloseCreate }: {
    isAdmin: boolean;
    onSelect: (id: number) => void;
    onCreate: () => void;
    showCreate: boolean;
    onCloseCreate: () => void;
}) {
    const { data, isLoading, error, refetch, isFetching } = useDisputes();
    const items = (data || []) as DisputeDto[];

    const counts = {
        open: items.filter(d => d.status === 'open').length,
        underReview: items.filter(d => d.status === 'under_review').length,
        resolved: items.filter(d => d.status === 'resolved').length,
        total: items.length
    };

    return (
        <div className="space-y-4">
            <div className="brand-tricolor-strip rounded-full" />
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Resolution</p>
                    <h1 className="text-2xl font-black text-slate-950">Disputes</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Raise, track, and resolve disputes for orders, payments, and escrow.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => refetch()} className="h-10 rounded-lg text-xs font-black uppercase">
                        <RefreshCw className={`mr-2 h-4 w-4 ${isFetching ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                    {!isAdmin && (
                        <Button onClick={onCreate} className="bg-[#12335f] text-white">
                            <Plus className="mr-2 h-4 w-4" /> Raise Dispute
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Total" value={counts.total} icon={AlertTriangle} />
                <Metric label="Open" value={counts.open} icon={AlertTriangle} tone="amber" />
                <Metric label="Under Review" value={counts.underReview} icon={Shield} tone="blue" />
                <Metric label="Resolved" value={counts.resolved} icon={CheckCircle2} tone="emerald" />
            </div>

            {error ? <InlineError message={(error as Error).message} onRetry={() => refetch()} /> :
                isLoading ? <LoadingState label="Loading disputes..." /> :
                    items.length === 0 ? (
                        <Card><CardContent className="py-12">
                            <EmptyState title="No disputes" description={isAdmin ? 'No active disputes across the platform.' : 'You have no disputes. Raise one if you have an issue with a transaction.'} />
                        </CardContent></Card>
                    ) : (
                        <Card className="border-slate-200/80 shadow-sm">
                            <CardContent className="p-0">
                                <div className="divide-y divide-slate-100">
                                    {items.map(d => (
                                        <button
                                            key={d.id}
                                            type="button"
                                            onClick={() => onSelect(d.id)}
                                            className="w-full text-left px-4 py-3 hover:bg-slate-50/60 transition"
                                        >
                                            <div className="flex items-start justify-between gap-3">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <EntityIdLink label={`DSP-${d.id}`} id={d.id} size="sm" onClick={() => onSelect(d.id)} />
                                                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${STATUS_TONE[d.status]}`}>
                                                            {d.status.replace(/_/g, ' ')}
                                                        </span>
                                                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600">
                                                            {d.category}
                                                        </span>
                                                    </div>
                                                    <p className="mt-1 text-sm font-black text-slate-900 text-wrap-anywhere line-clamp-2">{d.reason}</p>
                                                    <p className="mt-1 text-[11px] text-slate-500">
                                                        Buyer: <span className="font-bold">{d.buyer?.name}</span> ·
                                                        Seller: <span className="font-bold">{d.seller?.name}</span>
                                                        {d.purchaseOrderId && <> · PO #{d.purchaseOrderId}</>}
                                                    </p>
                                                </div>
                                                <div className="text-right shrink-0">
                                                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{formatRelative(d.updatedAt)}</p>
                                                </div>
                                            </div>
                                        </button>
                                    ))}
                                </div>
                            </CardContent>
                        </Card>
                    )
            }

            {showCreate && <CreateDisputeModal onClose={onCloseCreate} onCreated={(id) => { onCloseCreate(); onSelect(id); }} />}
        </div>
    );
}

function Metric({ label, value, icon: Icon, tone = 'slate' }: { label: string; value: number; icon: any; tone?: 'slate' | 'amber' | 'blue' | 'emerald' }) {
    const tones = {
        slate: 'bg-slate-100 text-slate-700',
        amber: 'bg-amber-100 text-amber-700',
        blue: 'bg-blue-100 text-blue-700',
        emerald: 'bg-emerald-100 text-emerald-700'
    };
    return (
        <Card>
            <CardContent className="flex items-center justify-between p-4">
                <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${tones[tone]}`}>
                    <Icon className="h-5 w-5" />
                </div>
            </CardContent>
        </Card>
    );
}

// ─── Detail with Thread + Status Update ──────────────────────────────────────

function DisputeDetail({ id, onBack, isAdmin }: { id: number; onBack: () => void; isAdmin: boolean }) {
    const { user } = useAuth();
    const { data: dispute, isLoading, error, refetch } = useDispute(id);
    const sendMut = useSendDisputeMessage();
    const statusMut = useUpdateDisputeStatus();
    const [content, setContent] = useState('');
    const [internal, setInternal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);

    if (isLoading) return <LoadingState label="Loading dispute..." />;
    if (error) return <InlineError message={(error as Error).message} onRetry={() => refetch()} />;
    if (!dispute) return <InlineError message="Dispute not found" />;

    const handleSend = async () => {
        if (content.trim().length < 1) return;
        await runWithToast(() => sendMut.mutateAsync({
            id: dispute.id,
            data: { content: content.trim(), internal: isAdmin && internal }
        }), { loading: 'Sending...', success: 'Message sent', error: 'Send failed' });
        setContent('');
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div className="min-w-0">
                    <button onClick={onBack} className="inline-flex items-center text-[10px] font-black uppercase tracking-widest text-[#12335f] hover:underline">
                        <ArrowLeft className="mr-1 h-3 w-3" /> Back to Disputes
                    </button>
                    <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <h1 className="text-2xl font-black text-slate-950">DSP-{dispute.id}</h1>
                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs font-black uppercase ${STATUS_TONE[dispute.status]}`}>
                            {dispute.status.replace(/_/g, ' ')}
                        </span>
                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase text-slate-700">
                            {dispute.category}
                        </span>
                    </div>
                    <p className="mt-1 text-xs font-semibold text-slate-500 text-wrap-anywhere">
                        Raised {formatDateTime(dispute.createdAt)} · Last update {formatRelative(dispute.updatedAt)}
                    </p>
                </div>
                {isAdmin && !['resolved', 'closed', 'rejected'].includes(dispute.status) && (
                    <Button onClick={() => setShowStatusModal(true)} className="bg-[#12335f] text-white">
                        <Shield className="mr-2 h-4 w-4" /> Update Status
                    </Button>
                )}
            </div>

            {/* Original reason */}
            <Card className="border-amber-200 bg-amber-50/40 shadow-sm">
                <CardContent className="p-4">
                    <p className="text-[10px] font-black uppercase tracking-widest text-amber-700">Original Reason</p>
                    <p className="mt-1 text-sm font-semibold text-slate-900 text-wrap-anywhere">{dispute.reason}</p>
                </CardContent>
            </Card>

            {/* Parties */}
            <div className="grid gap-3 md:grid-cols-2">
                <Card><CardContent className="p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Buyer</p>
                    <p className="mt-1 text-sm font-black text-slate-900 text-wrap-anywhere">{dispute.buyer?.name || `#${dispute.buyerId}`}</p>
                </CardContent></Card>
                <Card><CardContent className="p-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Seller</p>
                    <p className="mt-1 text-sm font-black text-slate-900 text-wrap-anywhere">{dispute.seller?.name || `#${dispute.sellerId}`}</p>
                </CardContent></Card>
            </div>

            {/* Thread */}
            <Card className="border-slate-200/80 shadow-sm">
                <CardContent className="p-0">
                    <div className="border-b border-slate-100 bg-slate-50/60 px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                            Conversation ({dispute.messages?.length || 0})
                        </p>
                    </div>
                    <div className="max-h-96 overflow-y-auto divide-y divide-slate-100">
                        {!dispute.messages || dispute.messages.length === 0 ? (
                            <p className="p-8 text-center text-xs font-semibold text-slate-500">No messages yet. Add the first one below.</p>
                        ) : dispute.messages.map(m => {
                            const isMe = m.senderId === Number(user?.id);
                            return (
                                <div key={m.id} className={`px-4 py-3 ${m.internal ? 'bg-amber-50/30' : ''}`}>
                                    <div className="flex items-start gap-2 justify-between">
                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className={`text-xs font-black ${isMe ? 'text-[#12335f]' : 'text-slate-700'}`}>
                                                    {m.sender?.name || `User #${m.senderId}`}
                                                </span>
                                                {m.sender?.role && (
                                                    <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-600">
                                                        {m.sender.role}
                                                    </span>
                                                )}
                                                {m.internal && (
                                                    <span className="inline-flex rounded border border-amber-300 bg-amber-100 px-1.5 py-0.5 text-[9px] font-black uppercase text-amber-800">
                                                        Internal
                                                    </span>
                                                )}
                                            </div>
                                            <p className="mt-1 text-xs font-semibold text-slate-800 text-wrap-anywhere whitespace-pre-wrap">{m.content}</p>
                                        </div>
                                        <p className="text-[10px] text-slate-400 shrink-0">{formatRelative(m.createdAt)}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {!['resolved', 'closed', 'rejected'].includes(dispute.status) && (
                        <div className="border-t border-slate-100 p-4 space-y-2">
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                placeholder={isAdmin ? 'Add admin reply or internal note...' : 'Reply...'}
                                rows={3}
                                maxLength={3000}
                                className="w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                            />
                            <div className="flex items-center justify-between">
                                {isAdmin && (
                                    <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                                        <input type="checkbox" checked={internal} onChange={e => setInternal(e.target.checked)} />
                                        Internal note (not visible to buyer/seller)
                                    </label>
                                )}
                                <Button onClick={handleSend} disabled={sendMut.isPending || content.trim().length < 1} className="ml-auto bg-[#12335f] text-white">
                                    {sendMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                    Send
                                </Button>
                            </div>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Resolution remarks */}
            {dispute.remarks && ['resolved', 'rejected', 'closed'].includes(dispute.status) && (
                <Card className="border-emerald-200 bg-emerald-50/40 shadow-sm">
                    <CardContent className="p-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-700">Admin Resolution</p>
                        <p className="mt-1 text-sm font-semibold text-slate-900 text-wrap-anywhere">{dispute.remarks}</p>
                        {dispute.resolvedAt && <p className="mt-1 text-[10px] text-slate-500">{formatDateTime(dispute.resolvedAt)}</p>}
                    </CardContent>
                </Card>
            )}

            {showStatusModal && (
                <StatusUpdateModal
                    dispute={dispute}
                    onClose={() => setShowStatusModal(false)}
                    onSubmit={async (status, remarks) => {
                        await runWithToast(() => statusMut.mutateAsync({ id: dispute.id, data: { status, remarks } }), {
                            loading: 'Updating...', success: 'Status updated', error: 'Update failed'
                        });
                        setShowStatusModal(false);
                    }}
                    pending={statusMut.isPending}
                />
            )}
        </div>
    );
}

function StatusUpdateModal({ dispute, onClose, onSubmit, pending }: {
    dispute: DisputeDto;
    onClose: () => void;
    onSubmit: (s: DisputeStatus, r?: string) => Promise<void>;
    pending: boolean;
}) {
    const [status, setStatus] = useState<DisputeStatus>(dispute.status === 'open' ? 'under_review' : 'resolved');
    const [remarks, setRemarks] = useState('');
    const requiresRemarks = ['resolved', 'rejected', 'closed'].includes(status);

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-5 py-4 text-white">
                    <h3 className="text-sm font-black uppercase tracking-widest">Update Dispute Status</h3>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10"><X className="h-4 w-4" /></button>
                </div>
                <div className="p-5 space-y-3">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">New Status</label>
                        <select value={status} onChange={e => setStatus(e.target.value as DisputeStatus)} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-bold">
                            <option value="under_review">Under Review</option>
                            <option value="frozen">Frozen</option>
                            <option value="resolved">Resolved</option>
                            <option value="rejected">Rejected</option>
                            <option value="closed">Closed</option>
                        </select>
                    </div>
                    {requiresRemarks && (
                        <div className="space-y-1">
                            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Remarks (required)</label>
                            <textarea
                                value={remarks}
                                onChange={e => setRemarks(e.target.value)}
                                rows={4}
                                placeholder="Explain the resolution decision..."
                                maxLength={1000}
                                className="w-full rounded border border-slate-200 px-3 py-2 text-xs font-semibold"
                            />
                            <p className="text-[10px] text-slate-400">Minimum 10 characters.</p>
                        </div>
                    )}
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button
                            onClick={() => {
                                if (requiresRemarks && remarks.trim().length < 10) {
                                    toast.error('Remarks of at least 10 chars required');
                                    return;
                                }
                                onSubmit(status, remarks.trim() || undefined);
                            }}
                            disabled={pending}
                            className="bg-[#12335f] text-white"
                        >
                            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                            Update Status
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

// ─── Create Dispute Modal ────────────────────────────────────────────────────

function CreateDisputeModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: number) => void }) {
    const [poId, setPoId] = useState<number | ''>('');
    const [counterpartyId, setCounterpartyId] = useState<number | ''>('');
    const [category, setCategory] = useState('');
    const [reason, setReason] = useState('');
    const mut = useCreateDispute();

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-red-700 to-red-800 px-5 py-4 text-white">
                    <h3 className="text-sm font-black uppercase tracking-widest">Raise Dispute</h3>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10"><X className="h-4 w-4" /></button>
                </div>
                <div className="p-5 space-y-3">
                    <div className="grid grid-cols-2 gap-2">
                        <Field label="Purchase Order ID">
                            <input type="number" value={poId} onChange={e => setPoId(e.target.value === '' ? '' : Number(e.target.value))} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-mono font-semibold" />
                        </Field>
                        <Field label="Counterparty User ID">
                            <input type="number" value={counterpartyId} onChange={e => setCounterpartyId(e.target.value === '' ? '' : Number(e.target.value))} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-mono font-semibold" />
                        </Field>
                    </div>
                    <Field label="Category">
                        <select value={category} onChange={e => setCategory(e.target.value)} className="h-9 w-full rounded border border-slate-200 px-3 text-xs font-bold">
                            <option value="">Select category...</option>
                            <option value="quality">Quality issue</option>
                            <option value="delivery">Delivery delay</option>
                            <option value="non_delivery">Non-delivery</option>
                            <option value="payment">Payment issue</option>
                            <option value="invoice">Invoice mismatch</option>
                            <option value="damaged">Damaged goods</option>
                            <option value="other">Other</option>
                        </select>
                    </Field>
                    <Field label="Detailed Reason">
                        <textarea value={reason} onChange={e => setReason(e.target.value)} rows={4} maxLength={4000} placeholder="Describe the issue in detail..." className="w-full rounded border border-slate-200 px-3 py-2 text-xs font-semibold" />
                        <p className="text-[10px] text-slate-400">Minimum 10 characters. Be specific — admin will review.</p>
                    </Field>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button
                            onClick={async () => {
                                if (!category) { toast.error('Choose a category'); return; }
                                if (reason.trim().length < 10) { toast.error('Reason must be ≥10 chars'); return; }
                                if (!poId && !counterpartyId) { toast.error('Provide a PO or counterparty'); return; }
                                const result = await runWithToast(() => mut.mutateAsync({
                                    purchaseOrderId: poId === '' ? undefined : poId,
                                    counterpartyId: counterpartyId === '' ? undefined : counterpartyId,
                                    category,
                                    reason: reason.trim()
                                }), { loading: 'Creating...', success: 'Dispute raised', error: 'Failed' });
                                if (result?.id) onCreated(result.id);
                            }}
                            disabled={mut.isPending}
                            className="bg-red-600 text-white"
                        >
                            {mut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <AlertTriangle className="mr-2 h-4 w-4" />}
                            Raise Dispute
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</label>
            {children}
        </div>
    );
}
