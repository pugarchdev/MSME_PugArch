/**
 * RfqPage - shared list/detail view for buyers and sellers. Buyers see the
 * quote requests they sent (with seller-side responses comparison). Sellers
 * see the requests they received and can submit a quote response inline.
 */

import { useMemo, useState } from 'react';
import { FileText, Plus, RefreshCw, Send, Trash2, Eye, X, Search, MapPin, Building2, CheckCircle2, ChevronRight, ChevronLeft, Upload, Paperclip, AlertCircle, Filter, FileSpreadsheet } from 'lucide-react';
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
import { GstTaxPicker, calculateGstBreakdown } from '../../shared/gstTax';
import { api } from '../../../lib/api';
import { toast } from 'sonner';
import {
    useCreateQuoteRequest,
    useDeleteQuoteRequest,
    useDecideQuoteResponse,
    useQuoteRequest,
    useQuoteRequests,
    useSubmitQuoteResponse,
    useVendors,
    useVendorCatalogue
} from '../hooks';
import type { QuoteRequestDto, QuoteRequestStatus } from '../types';

const STATUS_TONE: Record<string, string> = {
    pending: 'border-amber-200 bg-amber-50 text-amber-700',
    responded: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    accepted: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    rejected: 'border-red-200 bg-red-50 text-red-700',
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
    const deleteMut = useDeleteQuoteRequest();

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

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Metric label="Total" value={total} hint="In current view" tone="neutral" icon={FileText} loading={list.isLoading && !list.data} />
                <Metric label="Pending" value={counters.pending} hint="Awaiting response" tone="warning" icon={FileText} loading={list.isLoading && !list.data} />
                <Metric label="Responded" value={counters.responded} hint="Quote received" tone="positive" icon={Send} loading={list.isLoading && !list.data} />
                <Metric label="Responses" value={counters.responses} hint="Total submissions" tone="neutral" icon={FileText} loading={list.isLoading && !list.data} />
            </div>

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
                            { value: 'accepted', label: 'Accepted' },
                            { value: 'rejected', label: 'Rejected' },
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
                                        <th className="px-4 py-2.5 text-right w-32">Actions</th>
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
                                            <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenId(rfq.id)}
                                                        title="View RFQ"
                                                        className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-[#12335f] hover:bg-slate-50"
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                    </button>
                                                    {isBuyer && (rfq.quoteResponses?.length || 0) === 0 && rfq.status === 'pending' && (
                                                        <button
                                                            type="button"
                                                            onClick={() => {
                                                                if (!window.confirm(`Cancel RFQ "${rfq.subject}"? This cannot be undone.`)) return;
                                                                runWithToast(() => deleteMut.mutateAsync(rfq.id), {
                                                                    loading: 'Cancelling...',
                                                                    success: 'RFQ cancelled',
                                                                    error: 'Cancel failed'
                                                                });
                                                            }}
                                                            disabled={deleteMut.isPending}
                                                            title="Cancel RFQ"
                                                            className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                        >
                                                            <Trash2 className="h-3.5 w-3.5" />
                                                        </button>
                                                    )}
                                                    {isSeller && rfq.status === 'pending' && (rfq.quoteResponses?.length || 0) === 0 && (
                                                        <button
                                                            type="button"
                                                            onClick={() => setOpenId(rfq.id)}
                                                            title="Submit response"
                                                            className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50"
                                                        >
                                                            <Send className="h-3.5 w-3.5" />
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
                            label="quote requests"
                        />
                    </CardContent>
                </Card>
            )}

            {openId !== null && <RfqDetail id={openId} isBuyer={!!isBuyer} isSeller={!!isSeller} onClose={() => setOpenId(null)} />}
            {creating && isBuyer && <RfqCreator onClose={() => setCreating(false)} />}
        </div>
    );
}

/* ---------- Detail with response form (sellers) and comparison (buyers) ---------- */

function RfqDetail({ id, isBuyer, isSeller, onClose }: { id: number; isBuyer: boolean; isSeller: boolean; onClose: () => void }) {
    const detail = useQuoteRequest(id);
    const submitResp = useSubmitQuoteResponse();
    const decideResp = useDecideQuoteResponse();
    const rfq = detail.data;

    const [unitPrice, setUnitPrice] = useState('');
    const [quantity, setQuantity] = useState('1');
    const [splitTaxRate, setSplitTaxRate] = useState('');
    const [igstTaxRate, setIgstTaxRate] = useState('');
    const [otherTaxRate, setOtherTaxRate] = useState('');
    const [discountPercent, setDiscountPercent] = useState('');
    const [deliveryDays, setDeliveryDays] = useState('');
    const [validityDate, setValidityDate] = useState('');
    const [notes, setNotes] = useState('');
    const [respDocUrl, setRespDocUrl] = useState('');
    const [respDocName, setRespDocName] = useState('');
    const [uploadingRespDoc, setUploadingRespDoc] = useState(false);
    const [expandedResponse, setExpandedResponse] = useState<Record<number, boolean>>({});
    const subtotal = Number(unitPrice || 0) * Number(quantity || 0);
    const taxBreakdown = calculateGstBreakdown(subtotal, splitTaxRate, igstTaxRate, otherTaxRate);
    const discountPercentValue = Math.min(100, Math.max(0, Number(discountPercent || 0)));
    const discountValue = Number((subtotal * discountPercentValue / 100).toFixed(2));
    const totalAmount = Math.max(0, subtotal + taxBreakdown.totalTaxAmount - discountValue);

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
                        documentUrl: respDocUrl || undefined,
                        notes: [
                            `Price breakup: subtotal Rs. ${subtotal.toLocaleString('en-IN')}; tax ${taxBreakdown.label} = Rs. ${taxBreakdown.totalTaxAmount.toLocaleString('en-IN')}; discount ${discountPercentValue}% = Rs. ${discountValue.toLocaleString('en-IN')}; total Rs. ${totalAmount.toLocaleString('en-IN')}.`,
                            notes || ''
                        ].filter(Boolean).join('\n')
                    }
                }),
            { loading: 'Submitting quote...', success: 'Quote submitted', error: 'Submit failed' }
        );
        setUnitPrice('');
        setQuantity('1');
        setSplitTaxRate('');
        setIgstTaxRate('');
        setOtherTaxRate('');
        setDiscountPercent('');
        setDeliveryDays('');
        setValidityDate('');
        setNotes('');
        setRespDocUrl('');
        setRespDocName('');
        detail.refetch();
    };

    const myResponse = useMemo(() => rfq?.quoteResponses?.find(r => r.status !== 'WITHDRAWN'), [rfq]);
    const hasDecidableResponse = (responseStatus?: string) => ['SUBMITTED', 'DRAFT'].includes(String(responseStatus || '').toUpperCase());

    const decideResponse = async (responseId: number, decision: 'accept' | 'reject') => {
        if (!rfq) return;
        const action = decision === 'accept' ? 'accept this RFQ response and generate a purchase order' : 'reject this RFQ response';
        if (!window.confirm(`Are you sure you want to ${action}?`)) return;
        await runWithToast(
            () => decideResp.mutateAsync({ id: responseId, decision, title: rfq.subject }),
            {
                loading: decision === 'accept' ? 'Accepting response and generating PO...' : 'Rejecting response...',
                success: decision === 'accept' ? 'RFQ response accepted and PO generated' : 'RFQ response rejected',
                error: decision === 'accept' ? 'Accept failed' : 'Reject failed'
            }
        );
        detail.refetch();
    };

    return (
        <Modal title={rfq ? `RFQ-${String(rfq.id).padStart(5, '0')}` : 'RFQ'} onClose={onClose} wide>
            {detail.isLoading && !rfq ? (
                <ListSkeleton rows={3} />
            ) : !rfq ? (
                <EmptyState title="RFQ not found" />
            ) : (
                <div className="space-y-4">
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
                        <Field label="Status">
                            <Badge className={cn('rounded-md px-2 py-1 text-[10px] font-black uppercase', STATUS_TONE[rfq.status as string] || STATUS_TONE.pending)}>
                                {String(rfq.status).replace(/_/g, ' ')}
                            </Badge>
                        </Field>
                        <Field label="Estimated Value">
                            <p className="text-sm font-bold text-slate-900">{formatCurrency(rfq.estimatedValue)}</p>
                        </Field>
                        <Field label="Deadline Date">
                            {rfq.deadlineDate ? (
                                <>
                                    <p className="text-xs font-bold text-red-600">{formatDateTime(rfq.deadlineDate)}</p>
                                    <p className="text-[10px] font-semibold text-slate-400">{formatRelative(rfq.deadlineDate)}</p>
                                </>
                            ) : (
                                <p className="text-xs font-semibold text-slate-500">—</p>
                            )}
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

                    {rfq.documentUrl && (
                        <Field label="Specification Document">
                            <div className="flex items-center gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 max-w-md">
                                <FileText className="h-6 w-6 text-[#12335f] shrink-0" />
                                <div className="flex-1 min-w-0">
                                    <p className="text-xs font-bold text-slate-900 truncate">Specifications Document</p>
                                    <p className="text-[10px] text-slate-500">Click to view/download</p>
                                </div>
                                <a
                                    href={rfq.documentUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center rounded-lg bg-[#12335f] px-3 py-1.5 text-[10px] font-black uppercase text-white hover:bg-[#0e2a4f]"
                                >
                                    View Document
                                </a>
                            </div>
                        </Field>
                    )}

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label="Buyer">
                            <Party
                                name={rfq.buyer?.buyerProfile?.organizationName || rfq.buyer?.name || `Buyer #${rfq.buyerId}`}
                                accountName={rfq.buyer?.name}
                                email={rfq.buyer?.email}
                                mobile={rfq.buyer?.mobile}
                                organizationType={rfq.buyer?.buyerProfile?.organizationType || undefined}
                                location={[rfq.buyer?.buyerProfile?.city, rfq.buyer?.buyerProfile?.state].filter(Boolean).join(', ')}
                            />
                        </Field>
                        <Field label="Seller">
                            <Party
                                name={rfq.seller?.sellerProfile?.businessName || rfq.seller?.name || `Seller #${rfq.sellerId}`}
                                accountName={rfq.seller?.name}
                                email={rfq.seller?.email}
                                mobile={rfq.seller?.mobile}
                                organizationType={rfq.seller?.sellerProfile?.organizationType || undefined}
                                location={[
                                    rfq.seller?.sellerProfile?.city || rfq.seller?.sellerProfile?.offices?.[0]?.city,
                                    rfq.seller?.sellerProfile?.state || rfq.seller?.sellerProfile?.offices?.[0]?.state
                                ].filter(Boolean).join(', ')}
                            />
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
                                            {isBuyer && <th className="px-3 py-2 text-right w-40">Buyer Action</th>}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {rfq.quoteResponses.map(r => (
                                            <tr key={r.id}>
                                                <td className="px-3 py-2 font-bold text-slate-900 min-w-[320px] break-words">
                                                    <div className="font-mono text-xs text-[#12335f]">{r.responseNumber || `Response #${r.id}`}</div>
                                                    {r.seller && (
                                                        <div className="mt-0.5 text-[10px] text-slate-500 font-bold flex items-center gap-1">
                                                            <Building2 className="h-3 w-3 text-slate-400 shrink-0" />
                                                            <span>{r.seller.sellerProfile?.businessName || r.seller.name || `Seller #${r.sellerId}`}</span>
                                                        </div>
                                                    )}
                                                    {((r.notes) || r.documentUrl) && (
                                                        <div className="mt-1">
                                                            <button
                                                                type="button"
                                                                onClick={() => setExpandedResponse(prev => ({ ...prev, [r.id]: !prev[r.id] }))}
                                                                className="text-[10px] font-black uppercase text-[#12335f] hover:underline flex items-center gap-1"
                                                            >
                                                                {expandedResponse[r.id] ? 'Hide Details ✕' : 'View Details 👁'}
                                                            </button>
                                                            {expandedResponse[r.id] && (
                                                                <div className="mt-2 space-y-2 text-left">
                                                                    {(() => {
                                                                        const notesLines = (r.notes || '').split('\n');
                                                                        const breakupLine = notesLines.find(l => l.startsWith('Price breakup:'));
                                                                        const customNotes = notesLines.filter(l => !l.startsWith('Price breakup:')).join('\n').trim();
                                                                        return (
                                                                            <>
                                                                                {breakupLine && (
                                                                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] font-semibold text-slate-700 leading-normal shadow-sm max-w-md">
                                                                                        <span className="font-black text-[#12335f] uppercase tracking-wider block mb-1">Financial Breakup</span>
                                                                                        <div className="space-y-1 font-mono text-[10px] text-slate-600">
                                                                                            {breakupLine.replace('Price breakup: ', '').replace(/\.$/, '').split(';').map((part, pidx) => (
                                                                                                <div key={pidx} className="flex justify-between border-b border-slate-200/55 pb-0.5 last:border-0 last:pb-0 gap-4">
                                                                                                    {(() => {
                                                                                                        const cleanPart = part.trim();
                                                                                                        let label = cleanPart;
                                                                                                        let val = "";
                                                                                                        
                                                                                                        if (cleanPart.includes(" - ")) {
                                                                                                            const idx = cleanPart.indexOf(" - ");
                                                                                                            label = cleanPart.substring(0, idx).trim();
                                                                                                            val = cleanPart.substring(idx + 3).trim();
                                                                                                        } else if (cleanPart.toLowerCase().includes(" rs. ")) {
                                                                                                            const idx = cleanPart.toLowerCase().indexOf(" rs. ");
                                                                                                            label = cleanPart.substring(0, idx).trim();
                                                                                                            val = cleanPart.substring(idx).trim();
                                                                                                        }
                                                                                                        
                                                                                                        if (val) {
                                                                                                            return (
                                                                                                                <>
                                                                                                                    <span className="text-slate-500 capitalize">{label}</span>
                                                                                                                    <span className="font-bold text-slate-800 shrink-0">{val}</span>
                                                                                                                </>
                                                                                                            );
                                                                                                        }
                                                                                                        return <span className="text-slate-700 w-full">{cleanPart}</span>;
                                                                                                    })()}
                                                                                                </div>
                                                                                            ))}
                                                                                        </div>
                                                                                    </div>
                                                                                )}
                                                                                {customNotes && (
                                                                                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5 text-[11px] font-semibold text-slate-700 leading-normal shadow-sm">
                                                                                        <span className="font-black text-[#12335f] uppercase tracking-wider block mb-1">Seller Notes</span>
                                                                                        <p className="whitespace-pre-wrap text-slate-600">{customNotes}</p>
                                                                                    </div>
                                                                                )}
                                                                            </>
                                                                        );
                                                                    })()}

                                                                    {r.documentUrl && (
                                                                        <div className="rounded-lg border border-emerald-200 bg-emerald-50/40 p-2.5 text-[11px] font-semibold text-emerald-800 flex items-center justify-between gap-3 shadow-sm">
                                                                            <div className="flex items-center gap-1.5 min-w-0">
                                                                                <Paperclip className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
                                                                                <p className="truncate text-emerald-900 font-bold">Proposal Document</p>
                                                                            </div>
                                                                            <a
                                                                                href={r.documentUrl}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="inline-flex h-7 items-center rounded bg-emerald-600 px-2.5 text-[10px] font-black uppercase text-white hover:bg-emerald-700 shrink-0 shadow-sm"
                                                                            >
                                                                                View
                                                                            </a>
                                                                        </div>
                                                                    )}
                                                                </div>
                                                            )}
                                                        </div>
                                                    )}
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
                                                {isBuyer && (
                                                    <td className="px-3 py-2 text-right">
                                                        {hasDecidableResponse(r.status) && rfq.status === 'responded' ? (
                                                            <div className="flex items-center justify-end gap-1">
                                                                <button
                                                                    type="button"
                                                                    onClick={() => decideResponse(r.id, 'reject')}
                                                                    disabled={decideResp.isPending}
                                                                    className="inline-flex h-8 items-center rounded-md border border-red-200 bg-white px-2 text-[10px] font-black uppercase text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                                >
                                                                    <X className="mr-1 h-3.5 w-3.5" /> Reject
                                                                </button>
                                                                <button
                                                                    type="button"
                                                                    onClick={() => decideResponse(r.id, 'accept')}
                                                                    disabled={decideResp.isPending}
                                                                    className="inline-flex h-8 items-center rounded-md border border-emerald-200 bg-emerald-600 px-2 text-[10px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50"
                                                                >
                                                                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Accept & PO
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <span className="inline-flex h-7 items-center rounded border border-slate-200 bg-slate-50 px-2 text-[10px] font-black uppercase text-slate-500">
                                                                {String(r.status).toUpperCase() === 'ACCEPTED' ? 'PO generated' : String(r.status).toUpperCase() === 'REJECTED' ? 'Rejected' : 'No action'}
                                                            </span>
                                                        )}
                                                    </td>
                                                )}
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
                                    <Input value={unitPrice} onChange={e => setUnitPrice(e.target.value)} placeholder="Unit price (Rs.)" type="number" min="0" step="0.01" />
                                    <Input value={quantity} onChange={e => setQuantity(e.target.value)} placeholder="Quantity" type="number" min="1" step="1" />
                                    <Input value={discountPercent} onChange={e => setDiscountPercent(e.target.value)} placeholder="Discount (%)" type="number" min="0" max="100" step="0.01" />
                                </div>
                                <GstTaxPicker
                                    splitRate={splitTaxRate}
                                    igstRate={igstTaxRate}
                                    additionalRate={otherTaxRate}
                                    taxableAmount={subtotal}
                                    onChange={next => {
                                        setSplitTaxRate(next.splitRate);
                                        setIgstTaxRate(next.igstRate);
                                        setOtherTaxRate(next.additionalRate);
                                    }}
                                />
                                <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 bg-white p-3 text-xs font-bold text-slate-700 md:grid-cols-4">
                                    <p>Subtotal <span className="block font-black text-slate-950">{formatCurrency(subtotal)}</span></p>
                                    <p>Tax <span className="block font-black text-slate-950">{formatCurrency(taxBreakdown.totalTaxAmount)}</span></p>
                                    <p>Discount{discountPercentValue > 0 ? ` (${discountPercentValue}%)` : ''} <span className="block font-black text-slate-950">- {formatCurrency(discountValue)}</span></p>
                                    <p>Total <span className="block font-black text-[#12335f]">{formatCurrency(totalAmount)}</span></p>
                                </div>
                                <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                    <Input value={deliveryDays} onChange={e => setDeliveryDays(e.target.value)} placeholder="Delivery days" type="number" min="1" />
                                    <Input value={validityDate} onChange={e => setValidityDate(e.target.value)} placeholder="Valid till" type="date" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Proposal Document (Optional)</p>
                                    <div className={cn(
                                        "flex items-center justify-between gap-3 rounded-lg border border-dashed p-3 text-xs",
                                        respDocUrl ? "border-emerald-200 bg-emerald-50/40" : "border-slate-200 bg-slate-50"
                                    )}>
                                        <div className="flex min-w-0 items-center gap-2">
                                            <Paperclip className={cn("h-4 w-4 shrink-0", respDocUrl ? "text-emerald-700" : "text-slate-400")} />
                                            <p className={cn("truncate font-semibold", respDocUrl ? "text-emerald-700" : "text-slate-500")}>
                                                {respDocName || (uploadingRespDoc ? "Uploading document..." : "Attach proposal PDF or supporting file")}
                                            </p>
                                        </div>
                                        {respDocUrl ? (
                                            <button
                                                type="button"
                                                onClick={() => { setRespDocUrl(''); setRespDocName(''); }}
                                                className="shrink-0 rounded px-2 py-1 text-[10px] font-black uppercase text-red-600 hover:bg-red-50"
                                            >
                                                Remove
                                            </button>
                                        ) : (
                                            <>
                                                <input
                                                    id="rfq-seller-response-doc"
                                                    type="file"
                                                    accept=".pdf,.doc,.docx,.csv,.jpg,.jpeg,.png"
                                                    onChange={async (e) => {
                                                        const file = e.target.files?.[0];
                                                        if (!file) return;
                                                        setUploadingRespDoc(true);
                                                        const formData = new FormData();
                                                        formData.append('file', file);
                                                        try {
                                                            const res = await api.fetch('/api/upload', {
                                                                method: 'POST',
                                                                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                                                                body: formData
                                                            });
                                                            if (res.ok) {
                                                                const data = await res.json();
                                                                setRespDocUrl(data.url);
                                                                setRespDocName(file.name);
                                                                toast.success('Document uploaded successfully');
                                                            } else {
                                                                toast.error('Upload failed');
                                                            }
                                                        } catch (err) {
                                                            toast.error('Upload error');
                                                        } finally {
                                                            setUploadingRespDoc(false);
                                                        }
                                                    }}
                                                    disabled={uploadingRespDoc}
                                                    className="hidden"
                                                />
                                                <label
                                                    htmlFor="rfq-seller-response-doc"
                                                    className="inline-flex h-8 shrink-0 cursor-pointer items-center rounded-md bg-[#12335f] px-3 text-[10px] font-black uppercase text-white hover:bg-[#0e2a4f]"
                                                >
                                                    <Upload className="mr-1.5 h-3.5 w-3.5" />
                                                    {uploadingRespDoc ? 'Uploading...' : 'Upload'}
                                                </label>
                                            </>
                                        )}
                                    </div>
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
                                        disabled={submitResp.isPending || !unitPrice || !quantity}
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

export function RfqCreator({ onClose, initialVendor }: { onClose: () => void; initialVendor?: any }) {
    const [selectedVendor, setSelectedVendor] = useState<any | null>(initialVendor || null);
    const [step, setStep] = useState(initialVendor ? 2 : 1);
    const [selectedItem, setSelectedItem] = useState<any | null>(null);
    const [selectedItemType, setSelectedItemType] = useState<'product' | 'service' | null>(null);
    const [selectedItemDetail, setSelectedItemDetail] = useState<any | null>(null);

    // Filter states
    const [searchTerm, setSearchTerm] = useState('');
    const [selectedState, setSelectedState] = useState('All states');
    const [selectedCategory, setSelectedCategory] = useState('All categories');
    const [selectedMsme, setSelectedMsme] = useState('All MSME categories');

    // RFQ details form state
    const [subject, setSubject] = useState('');
    const [message, setMessage] = useState('');
    const [estimatedValue, setEstimatedValue] = useState('');
    const [deadlineDate, setDeadlineDate] = useState('');
    const [documentUrl, setDocumentUrl] = useState('');
    const [documentName, setDocumentName] = useState('');
    const [uploading, setUploading] = useState(false);

    const createMut = useCreateQuoteRequest();
    const vendorsQuery = useVendors();
    const catalogueQuery = useVendorCatalogue(selectedVendor?.id);

    const allVendors = vendorsQuery.data || [];
    const filteredVendors = useMemo(() => {
        return allVendors.filter((v: any) => {
            const term = searchTerm.toLowerCase();
            const businessName = v.sellerProfile?.businessName || '';
            const matchesSearch = !searchTerm ||
                v.name?.toLowerCase().includes(term) ||
                businessName.toLowerCase().includes(term) ||
                String(v.id).includes(term);

            const matchesState = selectedState === 'All states' ||
                v.sellerProfile?.state === selectedState;

            const matchesCategory = selectedCategory === 'All categories' ||
                (v.sellerProfile?.productCategories && v.sellerProfile.productCategories.includes(selectedCategory));

            const matchesMsme = selectedMsme === 'All MSME categories' ||
                v.sellerProfile?.msmeCategory === selectedMsme;

            return matchesSearch && matchesState && matchesCategory && matchesMsme;
        });
    }, [allVendors, searchTerm, selectedState, selectedCategory, selectedMsme]);

    const catalogue = catalogueQuery.data || { products: [], services: [] };
    const products = catalogue.products || [];
    const services = catalogue.services || [];

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        const formData = new FormData();
        formData.append('file', file);
        try {
            const res = await api.fetch('/api/upload', {
                method: 'POST',
                headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
                body: formData
            });
            if (res.ok) {
                const data = await res.json();
                setDocumentUrl(data.url);
                setDocumentName(file.name);
                toast.success('Specifications document attached');
            } else {
                toast.error('Upload failed');
            }
        } catch (err) {
            toast.error('Upload error');
        } finally {
            setUploading(false);
        }
    };

    const selectProductOrService = (item: any, type: 'product' | 'service') => {
        setSelectedItem(item);
        setSelectedItemType(type);
        setSubject(`Quote Request for ${item.name}`);
        setMessage(`We are interested in purchasing your ${type} "${item.name}".\n\nCategory: ${item.category?.name || item.category || 'N/A'}\nDescription: ${item.description || ''}\n\nPlease provide your best pricing, terms, and delivery timeline for this.`);
        if (item.price) {
            setEstimatedValue(String(item.price));
        }
        setStep(3);
    };

    const submit = async () => {
        if (!selectedVendor) return;
        await runWithToast(
            () =>
                createMut.mutateAsync({
                    sellerId: selectedVendor.id,
                    subject,
                    message,
                    estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
                    deadlineDate: deadlineDate || undefined,
                    documentUrl: documentUrl || undefined
                }),
            {
                loading: 'Sending RFQ...',
                success: 'Quote request sent',
                error: err => (err instanceof Error ? err.message : 'Send failed')
            }
        );
        onClose();
    };

    const valid = selectedVendor && subject.trim().length >= 3 && message.trim().length >= 1;

    const PRODUCT_CATEGORIES = [
        'All categories',
        'IT Hardware',
        'Software & Cloud',
        'Office Supplies',
        'Furniture',
        'Industrial Equipment',
        'Medical Supplies',
        'Construction',
        'Logistics',
        'Consulting',
        'Catering'
    ];

    const MSME_CATEGORIES = [
        'All MSME categories',
        'Micro',
        'Small',
        'Medium',
        'Large'
    ];

    const STATES_LIST = [
        'All states', 'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
        'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka',
        'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram',
        'Nagaland', 'Odisha', 'Punjab', 'Rajasthan', 'Sikkim', 'Tamil Nadu',
        'Telangana', 'Tripura', 'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
        'Delhi', 'Jammu & Kashmir', 'Ladakh'
    ];

    return (
        <Modal title={step === 1 ? 'New RFQ — Step 1: Select Vendor' : step === 2 ? `New RFQ — Step 2: Select Product/Service (${selectedVendor?.sellerProfile?.businessName || selectedVendor?.name})` : 'New RFQ — Step 3: Specify Requirements'} onClose={onClose} wide>
            {/* Step indicator */}
            <div className="mb-6 flex items-center justify-between border-b border-slate-100 pb-4">
                {[
                    { s: 1, label: 'Choose Vendor' },
                    { s: 2, label: 'Select Product' },
                    { s: 3, label: 'Details & Send' }
                ].map((item) => (
                    <div key={item.s} className="flex items-center gap-2">
                        <span className={cn(
                            'flex h-6 w-6 items-center justify-center rounded-full text-xs font-black',
                            step === item.s
                                ? 'bg-[#12335f] text-white animate-pulse'
                                : step > item.s
                                    ? 'bg-emerald-600 text-white'
                                    : 'bg-slate-100 text-slate-400'
                        )}>
                            {item.s}
                        </span>
                        <span className={cn(
                            'text-xs font-bold',
                            step === item.s ? 'text-slate-900' : 'text-slate-400'
                        )}>
                            {item.label}
                        </span>
                        {item.s < 3 && <ChevronRight className="h-4 w-4 text-slate-300" />}
                    </div>
                ))}
            </div>

            {step === 1 && (
                <div className="space-y-4">
                    {/* Filters */}
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 bg-slate-50 p-4 rounded-xl border border-slate-100">
                        <div className="relative col-span-1 sm:col-span-4">
                            <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
                            <Input
                                value={searchTerm}
                                onChange={e => setSearchTerm(e.target.value)}
                                placeholder="Search vendors by name, ID or description..."
                                className="pl-9 bg-white"
                            />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">State</p>
                            <select
                                value={selectedState}
                                onChange={e => setSelectedState(e.target.value)}
                                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                            >
                                {STATES_LIST.map(st => (
                                    <option key={st} value={st}>{st}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Category</p>
                            <select
                                value={selectedCategory}
                                onChange={e => setSelectedCategory(e.target.value)}
                                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                            >
                                {PRODUCT_CATEGORIES.map(cat => (
                                    <option key={cat} value={cat}>{cat}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">MSME Category</p>
                            <select
                                value={selectedMsme}
                                onChange={e => setSelectedMsme(e.target.value)}
                                className="w-full h-10 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                            >
                                {MSME_CATEGORIES.map(mc => (
                                    <option key={mc} value={mc}>{mc}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex items-end justify-end">
                            <Button
                                variant="outline"
                                onClick={() => {
                                    setSearchTerm('');
                                    setSelectedState('All states');
                                    setSelectedCategory('All categories');
                                    setSelectedMsme('All MSME categories');
                                }}
                                className="w-full h-10 text-xs font-bold uppercase"
                            >
                                Reset Filters
                            </Button>
                        </div>
                    </div>

                    {/* Vendors List */}
                    <div className="max-h-[40vh] overflow-y-auto pr-1 space-y-2">
                        {vendorsQuery.isLoading ? (
                            <ListSkeleton rows={3} />
                        ) : filteredVendors.length === 0 ? (
                            <EmptyState title="No matching vendors found" description="Try broadening your search term or filters." />
                        ) : (
                            filteredVendors.map((vendor: any) => (
                                <div
                                    key={vendor.id}
                                    onClick={() => {
                                        setSelectedVendor(vendor);
                                        setStep(2);
                                    }}
                                    className="group flex flex-col justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 transition-all duration-150 hover:border-[#12335f] hover:bg-slate-50/50 cursor-pointer sm:flex-row sm:items-center"
                                >
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h4 className="text-sm font-black text-slate-900 group-hover:text-[#12335f]">
                                                {vendor.sellerProfile?.businessName || vendor.name}
                                            </h4>
                                            {vendor.onboardingStatus === 'approved_for_procurement' && (
                                                <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 font-bold text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 shrink-0">
                                                    <CheckCircle2 className="h-3 w-3 shrink-0" /> Verified
                                                </Badge>
                                            )}
                                        </div>
                                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 font-semibold">
                                            <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {vendor.sellerProfile?.city || 'N/A'}, {vendor.sellerProfile?.state || 'N/A'}</span>
                                            <span>•</span>
                                            <span className="flex items-center gap-1"><Building2 className="h-3.5 w-3.5" /> MSME Category: {vendor.sellerProfile?.msmeCategory || 'N/A'}</span>
                                        </div>
                                        {vendor.sellerProfile?.productCategories && (
                                            <div className="mt-2 flex flex-wrap gap-1">
                                                {vendor.sellerProfile.productCategories.map((cat: string) => (
                                                    <span key={cat} className="bg-slate-100 px-2 py-0.5 rounded text-[10px] text-slate-600 font-bold">
                                                        {cat}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                    <Button
                                        className="bg-[#12335f] text-white hover:bg-[#0e2a4f] text-xs font-black uppercase shrink-0"
                                    >
                                        Select Vendor
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {step === 2 && selectedVendor && (
                <div className="space-y-4">
                    <div className="bg-[#12335f]/5 border border-[#12335f]/15 rounded-xl p-3.5 flex items-center justify-between">
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Selected Vendor</p>
                            <h4 className="text-sm font-black text-slate-900">{selectedVendor.sellerProfile?.businessName || selectedVendor.name}</h4>
                            <p className="text-xs text-slate-500 font-semibold">{selectedVendor.sellerProfile?.city}, {selectedVendor.sellerProfile?.state}</p>
                        </div>
                        <Button variant="outline" size="sm" onClick={() => setStep(1)} className="text-xs font-bold uppercase">
                            Change Vendor
                        </Button>
                    </div>

                    <div className="space-y-3">
                        <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                            <h3 className="text-xs font-black uppercase tracking-widest text-slate-500">Catalogue Items</h3>
                            <Button
                                onClick={() => {
                                    setSelectedItem(null);
                                    setSelectedItemType(null);
                                    setStep(3);
                                }}
                                className="bg-slate-100 text-slate-700 hover:bg-slate-200 text-xs font-black uppercase"
                            >
                                Skip & Write Custom RFQ
                            </Button>
                        </div>

                        {catalogueQuery.isLoading ? (
                            <ListSkeleton rows={3} />
                        ) : products.length === 0 && services.length === 0 ? (
                            <div className="text-center py-8 bg-slate-50 rounded-xl border border-slate-200/50">
                                <FileSpreadsheet className="h-10 w-10 text-slate-400 mx-auto mb-2" />
                                <h4 className="text-sm font-black text-slate-900">Catalogue is Empty</h4>
                                <p className="text-xs text-slate-500 font-semibold mt-1 max-w-sm mx-auto">This vendor has not uploaded any products or services to their storefront yet.</p>
                                <Button
                                    onClick={() => setStep(3)}
                                    className="bg-[#12335f] text-white hover:bg-[#0e2a4f] text-xs font-black uppercase mt-4"
                                >
                                    Proceed to Custom RFQ
                                </Button>
                            </div>
                        ) : (
                            <div className="max-h-[40vh] overflow-y-auto pr-1 space-y-4">
                                {products.length > 0 && (
                                    <div>
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-100 pb-1">Products ({products.length})</h4>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            {products.map((item: any) => (
                                                <div
                                                    key={item.id}
                                                    className="group border border-slate-200 rounded-xl p-3.5 bg-white hover:border-[#12335f] hover:bg-slate-50/20 cursor-pointer flex flex-col justify-between gap-3 transition-all duration-150"
                                                    onClick={() => setSelectedItemDetail(item)}
                                                >
                                                    <div>
                                                        <div className="flex justify-between items-start gap-2">
                                                            <h5 className="text-xs font-black text-slate-900 truncate group-hover:text-[#12335f]">{item.name}</h5>
                                                            <span className="text-xs font-black text-[#12335f] bg-[#12335f]/5 px-2 py-0.5 rounded shrink-0">
                                                                {formatCurrency(item.price)}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 font-semibold mt-1">Category: {item.category?.name || item.category || 'N/A'}</p>
                                                        <p className="text-[11px] text-slate-600 font-semibold mt-2 line-clamp-2 text-wrap-anywhere">{item.description}</p>
                                                    </div>
                                                    <div className="flex gap-2 mt-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedItemDetail(item);
                                                            }}
                                                            className="flex-1 text-[10px] font-bold uppercase h-8"
                                                        >
                                                            View Details
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                selectProductOrService(item, 'product');
                                                            }}
                                                            className="flex-1 bg-[#12335f] text-white hover:bg-[#0e2a4f] text-[10px] font-black uppercase h-8"
                                                        >
                                                            Select Item
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {services.length > 0 && (
                                    <div className="mt-4">
                                        <h4 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-2 border-b border-slate-100 pb-1">Services ({services.length})</h4>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                            {services.map((item: any) => (
                                                <div
                                                    key={item.id}
                                                    className="group border border-slate-200 rounded-xl p-3.5 bg-white hover:border-[#12335f] hover:bg-slate-50/20 cursor-pointer flex flex-col justify-between gap-3 transition-all duration-150"
                                                    onClick={() => setSelectedItemDetail(item)}
                                                >
                                                    <div>
                                                        <div className="flex justify-between items-start gap-2">
                                                            <h5 className="text-xs font-black text-slate-900 truncate group-hover:text-[#12335f]">{item.name}</h5>
                                                            <span className="text-xs font-black text-[#12335f] bg-[#12335f]/5 px-2 py-0.5 rounded shrink-0">
                                                                {formatCurrency(item.price)}
                                                            </span>
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 font-semibold mt-1">Category: {item.category?.name || item.category || 'N/A'}</p>
                                                        <p className="text-[11px] text-slate-600 font-semibold mt-2 line-clamp-2 text-wrap-anywhere">{item.description}</p>
                                                    </div>
                                                    <div className="flex gap-2 mt-2">
                                                        <Button
                                                            size="sm"
                                                            variant="outline"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                setSelectedItemDetail(item);
                                                            }}
                                                            className="flex-1 text-[10px] font-bold uppercase h-8"
                                                        >
                                                            View Details
                                                        </Button>
                                                        <Button
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                selectProductOrService(item, 'service');
                                                            }}
                                                            className="flex-1 bg-[#12335f] text-white hover:bg-[#0e2a4f] text-[10px] font-black uppercase h-8"
                                                        >
                                                            Select Item
                                                        </Button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="space-y-4">
                    {/* Item pre-fill notice */}
                    {selectedItem && (
                        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3.5 flex items-center justify-between">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-800">Pre-filled from Catalogue</p>
                                <h4 className="text-sm font-black text-slate-900">{selectedItem.name} ({selectedItemType})</h4>
                                <p className="text-xs text-slate-500 font-semibold">Price reference: {formatCurrency(selectedItem.price)}</p>
                            </div>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setSelectedItem(null);
                                    setSelectedItemType(null);
                                    setSubject('');
                                    setMessage('');
                                    setEstimatedValue('');
                                }}
                                className="text-xs font-bold uppercase border-emerald-300 text-emerald-800 hover:bg-emerald-100"
                            >
                                Clear Selection
                            </Button>
                        </div>
                    )}

                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <div className="col-span-1 sm:col-span-2">
                            <Field label="Subject">
                                <Input
                                    value={subject}
                                    onChange={e => setSubject(e.target.value)}
                                    maxLength={160}
                                    placeholder="What you need a quote for"
                                />
                            </Field>
                        </div>
                        <div className="col-span-1 sm:col-span-2">
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
                        </div>
                        <div>
                            <Field label="Estimated Value (₹, Optional)">
                                <Input
                                    value={estimatedValue}
                                    onChange={e => setEstimatedValue(e.target.value)}
                                    type="number"
                                    min="0"
                                    placeholder="₹ estimated total value"
                                />
                            </Field>
                        </div>
                        <div>
                            <Field label="RFQ Deadline Date">
                                <Input
                                    value={deadlineDate}
                                    onChange={e => setDeadlineDate(e.target.value)}
                                    type="date"
                                    min={new Date().toISOString().split('T')[0]}
                                />
                            </Field>
                        </div>
                        <div className="col-span-1 sm:col-span-2">
                            <Field label="Specification Document (Optional)">
                                <div className="mt-1 flex items-center gap-3">
                                    <label className={cn(
                                        "flex items-center gap-2 rounded-lg border border-dashed px-4 py-2 text-xs font-black uppercase cursor-pointer transition-all duration-150 shrink-0",
                                        uploading
                                            ? "border-slate-300 bg-slate-100 text-slate-400 cursor-not-allowed"
                                            : "border-[#12335f] text-[#12335f] hover:bg-[#12335f]/5"
                                    )}>
                                        <Upload className="h-4 w-4" />
                                        {uploading ? 'Uploading...' : 'Upload Document'}
                                        <input
                                            type="file"
                                            onChange={handleFileUpload}
                                            disabled={uploading}
                                            className="hidden"
                                            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                                        />
                                    </label>
                                    {documentName ? (
                                        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 min-w-0">
                                            <Paperclip className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                                            <p className="text-xs text-slate-700 font-bold truncate">{documentName}</p>
                                            <button
                                                onClick={() => {
                                                    setDocumentUrl('');
                                                    setDocumentName('');
                                                }}
                                                className="text-red-500 hover:text-red-700 p-0.5 rounded font-black shrink-0 text-xs"
                                                type="button"
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ) : (
                                        <p className="text-[10px] text-slate-400 font-semibold">PDF, Word, Excel, or Image (max 10MB)</p>
                                    )}
                                </div>
                            </Field>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom Modal Footer */}
            <div className="mt-6 flex items-center justify-between border-t border-slate-100 pt-4">
                <div>
                    {step > 1 ? (
                        <Button
                            variant="outline"
                            onClick={() => setStep(step - 1)}
                            className="text-xs font-bold uppercase"
                        >
                            <ChevronLeft className="mr-1.5 h-4 w-4" /> Back
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={onClose}
                            className="text-xs font-bold uppercase border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700"
                        >
                            Cancel
                        </Button>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {step === 1 && (
                        <Button
                            disabled={!selectedVendor}
                            onClick={() => setStep(2)}
                            className="bg-[#12335f] text-white hover:bg-[#0e2a4f] text-xs font-black uppercase px-6"
                        >
                            Continue <ChevronRight className="ml-1.5 h-4 w-4" />
                        </Button>
                    )}
                    {step === 2 && (
                        <Button
                            onClick={() => setStep(3)}
                            className="bg-[#12335f] text-white hover:bg-[#0e2a4f] text-xs font-black uppercase px-6"
                        >
                            Skip to Details <ChevronRight className="ml-1.5 h-4 w-4" />
                        </Button>
                    )}
                    {step === 3 && (
                        <Button
                            onClick={submit}
                            disabled={createMut.isPending || !valid}
                            className="bg-[#12335f] text-white hover:bg-[#0e2a4f] text-xs font-black uppercase px-6"
                        >
                            {createMut.isPending ? 'Sending...' : 'Send RFQ'}
                        </Button>
                    )}
                </div>
            </div>

            {/* Catalogue Item Detail Modal */}
            {selectedItemDetail && (
                <div
                    className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
                    role="dialog"
                    aria-modal="true"
                    onClick={() => setSelectedItemDetail(null)}
                >
                    <div
                        className="w-full max-w-md overflow-hidden rounded-xl bg-white shadow-xl animate-in zoom-in-95 duration-200 p-5"
                        onClick={e => e.stopPropagation()}
                    >
                        <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3">
                            <div>
                                <span className="bg-[#12335f]/5 text-[#12335f] text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded">
                                    Item Specifications
                                </span>
                                <h3 className="text-base font-black text-slate-900 mt-1">{selectedItemDetail.name}</h3>
                            </div>
                            <button
                                onClick={() => setSelectedItemDetail(null)}
                                className="rounded-md p-1 text-slate-400 hover:bg-slate-100"
                            >
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                        <div className="py-4 space-y-3">
                            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-150">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Price Per Unit</p>
                                    <p className="text-base font-black text-slate-950 mt-0.5">{formatCurrency(selectedItemDetail.price)}</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Category</p>
                                    <p className="text-xs font-bold text-slate-900 mt-1">{selectedItemDetail.category?.name || selectedItemDetail.category || 'N/A'}</p>
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Description</p>
                                <p className="text-xs font-semibold text-slate-700 bg-slate-50/50 p-3 rounded-lg border border-slate-100/80 max-h-[150px] overflow-y-auto whitespace-pre-wrap text-wrap-anywhere">
                                    {selectedItemDetail.description || 'No description provided.'}
                                </p>
                            </div>
                        </div>
                        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
                            <Button variant="outline" size="sm" onClick={() => setSelectedItemDetail(null)} className="text-xs font-bold uppercase">
                                Close
                            </Button>
                            <Button
                                size="sm"
                                onClick={() => {
                                    const isProduct = products.some((p: any) => p.id === selectedItemDetail.id);
                                    selectProductOrService(selectedItemDetail, isProduct ? 'product' : 'service');
                                    setSelectedItemDetail(null);
                                }}
                                className="bg-[#12335f] text-white hover:bg-[#0e2a4f] text-xs font-black uppercase"
                            >
                                Select This Item
                            </Button>
                        </div>
                    </div>
                </div>
            )}
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
    organizationType?: string;
    location?: string;
}) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-3 text-xs shadow-sm space-y-2">
            <div>
                <p className="font-black text-slate-900 text-sm leading-tight text-wrap-anywhere">{name}</p>
                {accountName && accountName !== name && (
                    <p className="text-[10px] font-semibold text-slate-400 mt-0.5">Account: {accountName}</p>
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
