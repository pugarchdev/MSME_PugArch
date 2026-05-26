/**
 * RfqPage - shared list/detail view for buyers and sellers. Buyers see the
 * quote requests they sent (with seller-side responses comparison). Sellers
 * see the requests they received and can submit a quote response inline.
 */

import { useMemo, useState } from 'react';
import { FileText, Plus, RefreshCw, Send, X } from 'lucide-react';
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
    useCreateQuoteRequest,
    useQuoteRequest,
    useQuoteRequests,
    useSubmitQuoteResponse
} from '../hooks';
import type { QuoteRequestDto, QuoteRequestStatus } from '../types';

const STATUS_TONE: Record<string, string> = {
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    responded: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    closed: 'border-slate-200 bg-slate-100 text-slate-500',
    cancelled: 'border-red-200 bg-red-50 text-red-700'
};

export default function RfqPage() {
    const { user } = useAuth();
    const isBuyer = user?.role === 'buyer';
    const isSeller = user?.role === 'seller';

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [q, setQ] = useState('');
    const [status, setStatus] = useState('');
    const [openId, setOpenId] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);

    const list = useQuoteRequests({ q: q || undefined, status: status || undefined, page, pageSize });

    const records = list.data?.records || [];
    const total = list.data?.total || 0;

    const counters = useMemo(() => {
        const pending = records.filter(r => r.status === 'pending').length;
        const responded = records.filter(r => r.status === 'responded').length;
        const responses = records.reduce((sum, r) => sum + (r.quoteResponses?.length || 0), 0);
        return { pending, responded, responses };
    }, [records]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement · Quotations</p>
                    <h1 className="text-2xl font-black tracking-tight text-slate-950">Request for Quotation (RFQ)</h1>
                    <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
                        {isBuyer
                            ? 'Send quote requests to vetted vendors and compare their responses side by side before placing an order.'
                            : isSeller
                                ? 'Quote requests received from buyers. Submit a competitive response and track its status.'
                                : 'Quote requests across the procurement workflow.'}
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => list.refetch()} className="h-10 rounded-lg text-xs font-black uppercase">
                        <RefreshCw className={cn('mr-2 h-4 w-4', list.isFetching && 'animate-spin')} /> Refresh
                    </Button>
                    {isBuyer && (
                        <Button onClick={() => setCreating(true)} className="bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                            <Plus className="mr-2 h-4 w-4" /> New RFQ
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
                    <Metric label="Total" value={total} hint="In current view" tone="neutral" icon={FileText} />
                    <Metric label="Pending" value={counters.pending} hint="Awaiting response" tone="warning" icon={FileText} />
                    <Metric label="Responded" value={counters.responded} hint="Quote received" tone="positive" icon={Send} />
                    <Metric label="Responses" value={counters.responses} hint="Total submissions" tone="neutral" icon={FileText} />
                </div>
            )}

            <PageToolbar
                eyebrow="Filters"
                search={q}
                onSearchChange={setQ}
                searchPlaceholder="Search by subject, message, ID"
                filters={[
                    {
                        kind: 'select',
                        value: status,
                        onChange: setStatus,
                        placeholder: 'All statuses',
                        options: [
                            { value: 'pending', label: 'Pending' },
                            { value: 'responded', label: 'Responded' },
                            { value: 'closed', label: 'Closed' },
                            { value: 'cancelled', label: 'Cancelled' }
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
                    message={list.error instanceof Error ? list.error.message : 'Failed to load quote requests'}
                    onRetry={() => list.refetch()}
                />
            )}

            {list.isLoading && !list.data ? (
                <ListSkeleton rows={4} />
            ) : records.length === 0 ? (
                <EmptyState title="No quote requests" description={isBuyer ? 'Create your first RFQ to start collecting quotes.' : 'No requests yet.'} />
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[920px] text-sm">
                                <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left w-12">#</th>
                                        <th className="px-4 py-2.5 text-left w-24">RFQ ID</th>
                                        <th className="px-4 py-2.5 text-left">Subject</th>
                                        <th className="px-4 py-2.5 text-left">{isBuyer ? 'Vendor' : 'Buyer'}</th>
                                        <th className="px-4 py-2.5 text-right w-32">Estimated Value</th>
                                        <th className="px-4 py-2.5 text-left w-28">Responses</th>
                                        <th className="px-4 py-2.5 text-left w-28">Status</th>
                                        <th className="px-4 py-2.5 text-left w-44">Sent</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {records.map((rfq, idx) => (
                                        <tr key={rfq.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => setOpenId(rfq.id)}>
                                            <td className="px-4 py-3 text-xs font-mono text-slate-400">
                                                {String((page - 1) * pageSize + idx + 1).padStart(2, '0')}
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    type="button"
                                                    className="font-mono text-[11px] font-black text-[#12335f] hover:underline"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setOpenId(rfq.id);
                                                    }}
                                                >
                                                    RFQ-{String(rfq.id).padStart(5, '0')}
                                                </button>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-black text-slate-900 text-wrap-anywhere">{rfq.subject}</p>
                                                <p className="mt-0.5 text-[10px] font-semibold text-slate-500 text-wrap-anywhere line-clamp-1">{rfq.message}</p>
                                            </td>
                                            <td className="px-4 py-3 text-xs">
                                                <p className="font-bold text-slate-900 text-wrap-anywhere">
                                                    {isBuyer ? rfq.seller?.name || `Seller #${rfq.sellerId}` : rfq.buyer?.name || `Buyer #${rfq.buyerId}`}
                                                </p>
                                                {(isBuyer ? rfq.seller?.email : rfq.buyer?.email) && (
                                                    <p className="text-[10px] text-slate-500 text-wrap-anywhere">
                                                        {isBuyer ? rfq.seller?.email : rfq.buyer?.email}
                                                    </p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs font-bold text-slate-900">
                                                {formatCurrency(rfq.estimatedValue)}
                                            </td>
                                            <td className="px-4 py-3">
                                                <span className="inline-flex h-6 items-center gap-1 rounded-md border border-slate-200 bg-slate-50 px-2 text-[10px] font-black uppercase text-slate-700">
                                                    {rfq.quoteResponses?.length ?? 0}
                                                </span>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge className={cn('rounded-md px-2 py-0.5 text-[10px] font-black uppercase', STATUS_TONE[rfq.status as string] || STATUS_TONE.pending)}>
                                                    {String(rfq.status).replace(/_/g, ' ')}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                                                <p>{formatDateTime(rfq.createdAt)}</p>
                                                <p className="text-[10px] text-slate-400">{formatRelative(rfq.createdAt)}</p>
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
                            label="quote requests"
                        />
                    </CardContent>
                </Card>
            )}

            {openId !== null && <RfqDetail id={openId} isSeller={!!isSeller} onClose={() => setOpenId(null)} />}
            {creating && isBuyer && <RfqCreator onClose={() => setCreating(false)} />}
        </div>
    );
}

/* ---------- Detail with response form (sellers) and comparison (buyers) ---------- */

function RfqDetail({ id, isSeller, onClose }: { id: number; isSeller: boolean; onClose: () => void }) {
    const detail = useQuoteRequest(id);
    const submitResp = useSubmitQuoteResponse();
    const rfq = detail.data;

    const [totalAmount, setTotalAmount] = useState('');
    const [deliveryDays, setDeliveryDays] = useState('');
    const [validityDate, setValidityDate] = useState('');
    const [notes, setNotes] = useState('');

    const submitResponse = async () => {
        if (!rfq) return;
        await runWithToast(
            () =>
                submitResp.mutateAsync({
                    id: rfq.id,
                    data: {
                        totalAmount: totalAmount ? Number(totalAmount) : undefined,
                        deliveryDays: deliveryDays ? Number(deliveryDays) : undefined,
                        validityDate: validityDate || undefined,
                        notes: notes || undefined
                    }
                }),
            { loading: 'Submitting quote...', success: 'Quote submitted', error: 'Submit failed' }
        );
        setTotalAmount('');
        setDeliveryDays('');
        setValidityDate('');
        setNotes('');
        detail.refetch();
    };

    const myResponse = useMemo(() => rfq?.quoteResponses?.find(r => r.status !== 'WITHDRAWN'), [rfq]);

    return (
        <Modal title={rfq ? `RFQ-${String(rfq.id).padStart(5, '0')}` : 'RFQ'} onClose={onClose} wide>
            {detail.isLoading && !rfq ? (
                <ListSkeleton rows={3} />
            ) : !rfq ? (
                <EmptyState title="RFQ not found" />
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <Field label="Status">
                            <Badge className={cn('rounded-md px-2 py-1 text-[10px] font-black uppercase', STATUS_TONE[rfq.status as string] || STATUS_TONE.pending)}>
                                {String(rfq.status).replace(/_/g, ' ')}
                            </Badge>
                        </Field>
                        <Field label="Estimated Value">
                            <p className="text-sm font-bold text-slate-900">{formatCurrency(rfq.estimatedValue)}</p>
                        </Field>
                        <Field label="Sent">
                            <p className="text-xs font-bold text-slate-900">{formatDateTime(rfq.createdAt)}</p>
                            <p className="text-[10px] font-semibold text-slate-400">{formatRelative(rfq.createdAt)}</p>
                        </Field>
                    </div>

                    <Field label="Subject">
                        <p className="text-base font-black text-slate-950 text-wrap-anywhere">{rfq.subject}</p>
                    </Field>

                    <Field label="Message">
                        <p className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs font-semibold text-slate-700 text-wrap-anywhere whitespace-pre-wrap">
                            {rfq.message}
                        </p>
                    </Field>

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label="Buyer">
                            <Party name={rfq.buyer?.name || `Buyer #${rfq.buyerId}`} email={rfq.buyer?.email} />
                        </Field>
                        <Field label="Seller">
                            <Party name={rfq.seller?.name || `Seller #${rfq.sellerId}`} email={rfq.seller?.email} />
                        </Field>
                    </div>

                    <Field label={`Responses (${rfq.quoteResponses?.length ?? 0})`}>
                        {rfq.quoteResponses?.length ? (
                            <div className="overflow-hidden rounded-lg border border-slate-200">
                                <table className="w-full text-xs">
                                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                        <tr>
                                            <th className="px-3 py-2 text-left">Response</th>
                                            <th className="px-3 py-2 text-right w-32">Total</th>
                                            <th className="px-3 py-2 text-left w-24">Delivery</th>
                                            <th className="px-3 py-2 text-left w-32">Valid Till</th>
                                            <th className="px-3 py-2 text-left w-28">Status</th>
                                            <th className="px-3 py-2 text-left w-44">Submitted</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {rfq.quoteResponses.map(r => (
                                            <tr key={r.id}>
                                                <td className="px-3 py-2 font-bold text-slate-900 text-wrap-anywhere">
                                                    {r.responseNumber || `Response #${r.id}`}
                                                    {r.notes && <p className="mt-0.5 text-[10px] font-semibold text-slate-500 text-wrap-anywhere">{r.notes}</p>}
                                                </td>
                                                <td className="px-3 py-2 text-right font-bold text-slate-900">{formatCurrency(r.totalAmount)}</td>
                                                <td className="px-3 py-2 font-bold text-slate-700">{r.deliveryDays ? `${r.deliveryDays}d` : '—'}</td>
                                                <td className="px-3 py-2 font-bold text-slate-700">
                                                    {r.validityDate ? formatDateTime(r.validityDate) : '—'}
                                                </td>
                                                <td className="px-3 py-2">
                                                    <Badge className="rounded-md border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase text-slate-700">
                                                        {r.status}
                                                    </Badge>
                                                </td>
                                                <td className="px-3 py-2 text-xs font-semibold text-slate-700">{formatDateTime(r.createdAt)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-xs font-semibold text-slate-500">No responses yet.</p>
                        )}
                    </Field>

                    {isSeller && !myResponse && rfq.status === 'pending' && (
                        <Field label="Submit Your Quote">
                            <div className="rounded-lg border border-[#12335f]/20 bg-[#12335f]/5 p-4 space-y-3">
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                    <Input value={totalAmount} onChange={e => setTotalAmount(e.target.value)} placeholder="Total amount (₹)" type="number" min="0" />
                                    <Input value={deliveryDays} onChange={e => setDeliveryDays(e.target.value)} placeholder="Delivery days" type="number" min="1" />
                                    <Input value={validityDate} onChange={e => setValidityDate(e.target.value)} placeholder="Valid till" type="date" />
                                </div>
                                <textarea
                                    value={notes}
                                    onChange={e => setNotes(e.target.value)}
                                    rows={2}
                                    placeholder="Notes / terms"
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                                />
                                <div className="flex justify-end">
                                    <Button
                                        onClick={submitResponse}
                                        disabled={submitResp.isPending || !totalAmount}
                                        className="bg-[#12335f] text-white hover:bg-[#0e2a4f]"
                                    >
                                        <Send className="mr-2 h-4 w-4" /> Submit Quote
                                    </Button>
                                </div>
                            </div>
                        </Field>
                    )}
                </div>
            )}
        </Modal>
    );
}

function RfqCreator({ onClose }: { onClose: () => void }) {
    const [sellerId, setSellerId] = useState('');
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [estimatedValue, setEstimatedValue] = useState('');
    const createMut = useCreateQuoteRequest();

    const submit = async () => {
        await runWithToast(
            () =>
                createMut.mutateAsync({
                    sellerId: Number(sellerId),
                    subject,
                    message,
                    estimatedValue: estimatedValue ? Number(estimatedValue) : undefined
                }),
            {
                loading: 'Sending RFQ...',
                success: 'Quote request sent',
                error: err => (err instanceof Error ? err.message : 'Send failed')
            }
        );
        onClose();
    };

    const valid = sellerId && subject.length >= 3 && message.length >= 1;

    return (
        <Modal title="New Quote Request" onClose={onClose}>
            <div className="space-y-3">
                <Field label="Seller User ID">
                    <Input
                        value={sellerId}
                        onChange={e => setSellerId(e.target.value.replace(/[^0-9]/g, ''))}
                        placeholder="Numeric seller user ID"
                        type="number"
                        min="1"
                    />
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">Find the ID on the Vendors page detail panel.</p>
                </Field>
                <Field label="Subject">
                    <Input value={subject} onChange={e => setSubject(e.target.value)} maxLength={160} placeholder="What you need a quote for" />
                </Field>
                <Field label="Message">
                    <textarea
                        value={message}
                        onChange={e => setMessage(e.target.value)}
                        rows={5}
                        maxLength={4000}
                        placeholder="Describe quantities, specifications, timeline, and any constraints."
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                    />
                </Field>
                <Field label="Estimated Value (optional)">
                    <Input value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} type="number" min="0" placeholder="₹" />
                </Field>
            </div>
            <ModalFooter onCancel={onClose} onConfirm={submit} confirmLabel="Send RFQ" pending={createMut.isPending} disabled={!valid} />
        </Modal>
    );
}

/* ---------- Reusable bits (shared with Requirements) ---------- */

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
