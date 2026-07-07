/**
 * RequirementsPage - buyer's procurement demand register.
 *
 * Lists all requirements with their status, lets the buyer create new ones
 * with line items, edit drafts, and submit for approval. Each row's
 * Requirement ID is clickable and opens the detail drawer with full item
 * breakdown and any tenders that have already been spun off from it.
 */

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, CalendarClock, ClipboardCheck, Copy, Download, Eye, FileText, Plus, RefreshCw, Send, Trash2, Upload, X, ShoppingCart, Gavel, ClipboardList, TrendingDown, Repeat } from 'lucide-react';
import { useCategories } from '../../catalogue/hooks';
import { toast } from 'sonner';
import { Loader2 } from '@/components/ui/loader';
import { Card, CardContent, Badge } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input, Select } from '../../../components/ui/input';
import { Pagination } from '../../shared/Pagination';
import { PageToolbar } from '../../shared/PageToolbar';
import { SortableHeader, type SortDirection } from '../../shared/SortableHeader';
import { useResponsiveViewMode } from '../../shared/hooks';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { RequirementsGridSkeleton, RequirementsTableSkeleton, FormSectionSkeleton } from '../../../components/ui/skeleton';
import { EmptyState, InlineError } from '../../shared/FeatureStates';
import { formatCurrency, formatDate, formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { cn } from '../../../lib/utils';
import { labelForCanonical } from '../../procurementWizard/procurementMethodHelpers';
import {
    useCreateRequirement,
    useDeleteRequirement,
    usePrefetchRequirement,
    useRequirement,
    useRequirements,
    useSubmitRequirement,
    useUpdateRequirement
} from '../hooks';
import type {
    NewRequirementItemPayload,
    ProcurementMethod,
    RequirementDto,
    RequirementStatus
} from '../types';

const STATUS_TONE: Record<string, string> = {
    DRAFT: 'border-slate-200 bg-slate-50 text-slate-700',
    SUBMITTED: 'border-sky-200 bg-sky-50 text-sky-700',
    UNDER_REVIEW: 'border-amber-200 bg-amber-50 text-amber-700',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    REJECTED: 'border-red-200 bg-red-50 text-red-700',
    CONVERTED_TO_TENDER: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    CLOSED: 'border-slate-200 bg-slate-100 text-slate-500'
};

const PROCUREMENT_METHOD_LABELS: Record<ProcurementMethod, string> = {
    DIRECT_PURCHASE: 'Direct Purchase',
    RFQ: 'RFQ',
    TENDER: 'Tender',
    REVERSE_AUCTION: 'Reverse Auction',
    RATE_CONTRACT: 'Rate Contract'
};
type RequirementSortKey = 'requirementNumber' | 'title' | 'procurementMethod' | 'status' | 'estimatedValue' | 'requiredBy' | 'updatedAt';
const REQUIREMENT_HANDOFF_KEY = 'msme:requirement-create-prefill:v1';
const PROCUREMENT_SUMMARIES_KEY = 'msme:procurement-intake-summaries:v1';

type ProcurementIntakeSummary = {
    id: string;
    createdAt: string;
    methodLabel: string;
    title: string;
    category?: string;
    department?: string;
    estimatedValue?: number;
    submissionDate?: string;
    deliveryDate?: string;
    documents?: Array<{ name: string; requirement: string; fileName: string; version: number }>;
    items?: Array<{ name: string; quantity: number; unit: string; specification?: string; total?: number }>;
};

type RequirementHandoff = {
    draft?: Record<string, string | boolean>;
    items?: Array<Partial<RequirementItemDraft>>;
    docs?: Array<Partial<RequirementDocDraft>>;
};

const loadProcurementSummaries = (): ProcurementIntakeSummary[] => {
    if (typeof window === 'undefined') return [];
    try {
        const parsed = JSON.parse(localStorage.getItem(PROCUREMENT_SUMMARIES_KEY) || '[]');
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
};

const readRequirementHandoff = (): RequirementHandoff | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(REQUIREMENT_HANDOFF_KEY);
        if (!raw) return null;
        localStorage.removeItem(REQUIREMENT_HANDOFF_KEY);
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' ? parsed : null;
    } catch {
        localStorage.removeItem(REQUIREMENT_HANDOFF_KEY);
        return null;
    }
};

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

export default function RequirementsPage() {
    const router = useRouter();
    const isCreateRoute = typeof window !== 'undefined' && window.location.pathname.endsWith('/new');
    if (isCreateRoute) {
        return (
            <div className="mx-auto max-w-xl py-20 px-6 text-center space-y-6 bg-white border border-slate-200 rounded-xl shadow-xs mt-10">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 border border-amber-200 mx-auto animate-pulse">
                    <AlertCircle className="h-6 w-6" />
                </div>
                <h2 className="text-sm font-black uppercase text-slate-900 tracking-wider">Legacy Creation Flow Replaced</h2>
                <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                    This old requirement creation flow has been replaced by the unified guided Create Procurement wizard.
                </p>
                <Button
                    onClick={() => router.push('/buyer/procurement/create')}
                    className="bg-[#12335f] text-white hover:bg-[#0e2a4f] text-[10px] uppercase font-black tracking-wide h-10 px-6 rounded-lg shadow-sm"
                >
                    Open Create Procurement
                </Button>
            </div>
        );
    }

    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [q, setQ] = useState('');
    const [status, setStatus] = useState('');
    const [method, setMethod] = useState('');
    const [categoryId, setCategoryId] = useState('');
    const [openId, setOpenId] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);
    const [procurementSummaries, setProcurementSummaries] = useState<ProcurementIntakeSummary[]>([]);
    const [viewMode, setViewMode] = useResponsiveViewMode('phase7:requirements:view-mode');
    const [sortKey, setSortKey] = useState<RequirementSortKey>('updatedAt');
    const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
    
    // Prefetch hook for instant modal opens
    const prefetchRequirement = usePrefetchRequirement();

    const list = useRequirements({
        q: q || undefined,
        status: status || undefined,
        procurementMethod: method || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        page,
        pageSize
    });
    const countList = useRequirements({ pageSize: 500 });
    const { data: categories = [] } = useCategories();
    const submitMut = useSubmitRequirement();
    const deleteMut = useDeleteRequirement();

    useEffect(() => {
        setProcurementSummaries(loadProcurementSummaries());
    }, []);

    const records = list.data?.records || [];
    const total = list.data?.total || 0;

    const methodCounts = useMemo(() => {
        const allRecs = countList.data?.records || [];
        const direct = allRecs.filter(r => r.procurementMethod === 'DIRECT_PURCHASE' && r.canonicalMethod !== 'REPEAT_ORDER').length;
        const rfq = allRecs.filter(r => r.procurementMethod === 'RFQ').length;
        const tender = allRecs.filter(r => r.procurementMethod === 'TENDER').length;
        const auction = allRecs.filter(r => r.procurementMethod === 'REVERSE_AUCTION').length;
        const rateContract = allRecs.filter(r => r.procurementMethod === 'RATE_CONTRACT').length;
        const repeatOrder = allRecs.filter(r => r.canonicalMethod === 'REPEAT_ORDER').length;
        return {
            total: allRecs.length,
            direct,
            rfq,
            tender,
            auction,
            rateContract,
            repeatOrder
        };
    }, [countList.data]);

    const sortedRecords = useMemo(() => {
        return [...records].sort((a, b) => {
            const valueFor = (req: RequirementDto) => {
                if (sortKey === 'requirementNumber') return req.requirementNumber || '';
                if (sortKey === 'title') return req.title || '';
                if (sortKey === 'procurementMethod') return req.procurementMethod || '';
                if (sortKey === 'status') return req.status || '';
                if (sortKey === 'estimatedValue') return Number(req.estimatedValue || 0);
                if (sortKey === 'requiredBy') return new Date(req.requiredBy || 0).getTime();
                return new Date(req.updatedAt || 0).getTime();
            };
            const av = valueFor(a);
            const bv = valueFor(b);
            const result = typeof av === 'number' && typeof bv === 'number'
                ? av - bv
                : String(av).localeCompare(String(bv));
            return sortDirection === 'asc' ? result : -result;
        });
    }, [records, sortDirection, sortKey]);

    const toggleSort = (field: RequirementSortKey) => {
        setSortDirection(prev => sortKey === field && prev === 'asc' ? 'desc' : 'asc');
        setSortKey(field);
    };

    const setSearchAndReset = (value: string) => {
        setQ(value);
        setPage(1);
    };

    const setStatusAndReset = (value: string) => {
        setStatus(value);
        setPage(1);
    };

    const setMethodAndReset = (value: string) => {
        setMethod(value);
        setPage(1);
    };

    const setCategoryIdAndReset = (value: string) => {
        setCategoryId(value);
        setPage(1);
    };

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement · Demand Planning</p>
                    <h1 className="text-2xl font-black tracking-tight text-slate-950">Requirements</h1>
                    <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
                        The starting point of every procurement. Capture what you need with line items, then route it to tender, RFQ, or direct purchase.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => list.refetch()}
                        className="h-10 rounded-lg text-xs font-black uppercase"
                    >
                        <RefreshCw className={cn('mr-2 h-4 w-4', list.isFetching && 'animate-spin')} /> Refresh
                    </Button>
                    {/* LEGACY PROCUREMENT UI - hidden because unified Create Procurement flow is now active. */}
                    {/* Do not delete. Restore only if required. */}
                    {/*
                    <Button onClick={() => setCreating(true)} className="bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                        <Plus className="mr-2 h-4 w-4" /> New Requirement
                    </Button>
                    */}
                    <Button onClick={() => router.push('/buyer/procurement/create')} className="bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                        <Plus className="mr-2 h-4 w-4" /> Create Procurement
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-6">
                <Metric
                    label="Direct Purchases"
                    value={methodCounts.direct}
                    hint="Single-vendor buys"
                    tone="neutral"
                    icon={ShoppingCart}
                    loading={countList.isLoading}
                    onClick={() => setMethodAndReset(method === 'DIRECT_PURCHASE' ? '' : 'DIRECT_PURCHASE')}
                    isActive={method === 'DIRECT_PURCHASE'}
                />
                <Metric
                    label="RFQs"
                    value={methodCounts.rfq}
                    hint="Request for Quotes"
                    tone="warning"
                    icon={FileText}
                    loading={countList.isLoading}
                    onClick={() => setMethodAndReset(method === 'RFQ' ? '' : 'RFQ')}
                    isActive={method === 'RFQ'}
                />
                <Metric
                    label="Tenders"
                    value={methodCounts.tender}
                    hint="Competitive bids"
                    tone="positive"
                    icon={Gavel}
                    loading={countList.isLoading}
                    onClick={() => setMethodAndReset(method === 'TENDER' ? '' : 'TENDER')}
                    isActive={method === 'TENDER'}
                />
                <Metric
                    label="Reverse Auctions"
                    value={methodCounts.auction}
                    hint="Dynamic pricing"
                    tone="neutral"
                    icon={TrendingDown}
                    loading={countList.isLoading}
                    onClick={() => setMethodAndReset(method === 'REVERSE_AUCTION' ? '' : 'REVERSE_AUCTION')}
                    isActive={method === 'REVERSE_AUCTION'}
                />
                <Metric
                    label="Rate Contracts"
                    value={methodCounts.rateContract}
                    hint="Term agreements"
                    tone="warning"
                    icon={ClipboardList}
                    loading={countList.isLoading}
                    onClick={() => setMethodAndReset(method === 'RATE_CONTRACT' ? '' : 'RATE_CONTRACT')}
                    isActive={method === 'RATE_CONTRACT'}
                />
                <Metric
                    label="Repeat Orders"
                    value={methodCounts.repeatOrder}
                    hint="Repeated PO purchases"
                    tone="neutral"
                    icon={Repeat}
                    loading={countList.isLoading}
                    onClick={() => setMethodAndReset(method === 'REPEAT_ORDER' ? '' : 'REPEAT_ORDER')}
                    isActive={method === 'REPEAT_ORDER'}
                />
            </div>

            {procurementSummaries.length > 0 && (
                <Card className="border-blue-100 bg-blue-50/40">
                    <CardContent className="p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Latest Create Procurement Intake</p>
                                <h2 className="mt-1 text-base font-black text-slate-950">{procurementSummaries[0].title}</h2>
                                <p className="mt-1 text-xs font-semibold text-slate-600">
                                    {procurementSummaries[0].methodLabel} · {procurementSummaries[0].category || 'Uncategorised'} · {formatCurrency(procurementSummaries[0].estimatedValue)}
                                </p>
                            </div>
                            <div className="grid gap-2 text-xs font-bold text-slate-700 sm:grid-cols-3 lg:min-w-[520px]">
                                <span className="rounded-md border border-blue-100 bg-white px-3 py-2">Items: {procurementSummaries[0].items?.length || 0}</span>
                                <span className="rounded-md border border-blue-100 bg-white px-3 py-2">Documents: {procurementSummaries[0].documents?.length || 0}</span>
                                <span className="rounded-md border border-blue-100 bg-white px-3 py-2">Closing: {formatDate(procurementSummaries[0].submissionDate)}</span>
                            </div>
                        </div>
                    </CardContent>
                </Card>
            )}

            <PageToolbar
                eyebrow="Filters"
                search={q}
                onSearchChange={setSearchAndReset}
                searchPlaceholder="Search by title, description, ID"
                filters={[
                    {
                        kind: 'select',
                        value: status,
                        onChange: setStatusAndReset,
                        placeholder: 'All statuses',
                        options: [
                            { value: 'DRAFT', label: 'Draft' },
                            { value: 'SUBMITTED', label: 'Submitted' },
                            { value: 'UNDER_REVIEW', label: 'Under Review' },
                            { value: 'APPROVED', label: 'Approved' },
                            { value: 'REJECTED', label: 'Rejected' },
                            { value: 'CONVERTED_TO_TENDER', label: 'Converted to Tender' },
                            { value: 'CLOSED', label: 'Closed' }
                        ]
                    },
                    {
                        kind: 'select',
                        value: method,
                        onChange: setMethodAndReset,
                        placeholder: 'All methods',
                        options: [
                            { value: 'DIRECT_PURCHASE', label: 'Direct Purchase' },
                            { value: 'RFQ', label: 'RFQ' },
                            { value: 'TENDER', label: 'Tender' },
                            { value: 'REVERSE_AUCTION', label: 'Reverse Auction' },
                            { value: 'RATE_CONTRACT', label: 'Rate Contract' }
                        ]
                    },
                    {
                        kind: 'select',
                        value: categoryId,
                        onChange: setCategoryIdAndReset,
                        placeholder: 'All categories',
                        options: categories.map(cat => ({ value: String(cat.id), label: cat.name }))
                    }
                ]}
                onReset={() => {
                    setQ('');
                    setStatus('');
                    setMethod('');
                    setCategoryId('');
                    setPage(1);
                }}
                actions={<ViewModeToggle value={viewMode} onChange={setViewMode} />}
            />

            {list.error && (
                <InlineError
                    message={list.error instanceof Error ? list.error.message : 'Failed to load requirements'}
                    onRetry={() => list.refetch()}
                />
            )}

            {list.isLoading && !list.data ? (
                viewMode === 'grid' ? (
                    <RequirementsGridSkeleton count={pageSize} />
                ) : (
                    <RequirementsTableSkeleton rows={pageSize} />
                )
            ) : records.length === 0 ? (
                <EmptyState title="No requirements yet" description="Create your first requirement to start a procurement." />
            ) : viewMode === 'grid' ? (
                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {sortedRecords.map((req, idx) => (
                        <article key={req.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-[#12335f]/30 hover:shadow-lg">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <button
                                        type="button"
                                        className="text-[10px] font-black uppercase tracking-widest text-[#c86413] hover:underline"
                                        onClick={() => setOpenId(req.id)}
                                    >
                                        {req.requirementNumber}
                                    </button>
                                    <h2 className="mt-1 text-sm font-black text-slate-950 text-wrap-anywhere">{req.title}</h2>
                                    <p className="mt-1 text-[10px] font-semibold text-slate-500">
                                        Sr. {String((page - 1) * pageSize + idx + 1).padStart(2, '0')} / {req.items?.length || 0} line item{(req.items?.length || 0) === 1 ? '' : 's'}
                                    </p>
                                </div>
                                <Badge className={cn('rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', STATUS_TONE[req.status] || STATUS_TONE.DRAFT)}>
                                    {req.status.replace(/_/g, ' ')}
                                </Badge>
                            </div>
                            <div className="mt-4 grid gap-2 text-xs font-semibold text-slate-600">
                                <p><span className="font-black text-slate-900">Method:</span> {req.canonicalMethod ? labelForCanonical(req.canonicalMethod) : (PROCUREMENT_METHOD_LABELS[req.procurementMethod] || req.procurementMethod)}</p>
                                <p><span className="font-black text-slate-900">Estimated:</span> {formatCurrency(req.estimatedValue)}</p>
                                <p><span className="font-black text-slate-900">Required by:</span> {formatDate(req.requiredBy)}</p>
                                <p><span className="font-black text-slate-900">Updated:</span> {formatRelative(req.updatedAt)}</p>
                            </div>
                            <div className="mt-4 flex flex-wrap justify-end gap-2 border-t border-slate-100 pt-3">
                                <button type="button" onClick={() => setOpenId(req.id)} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-[10px] font-black text-[#12335f] hover:bg-slate-50">
                                    <Eye className="h-3.5 w-3.5" /> View
                                </button>
                                {req.status === 'DRAFT' && (
                                    <button
                                        type="button"
                                        onClick={() => {
                                            runWithToast(() => submitMut.mutateAsync(req.id), {
                                                loading: 'Submitting...',
                                                success: 'Requirement submitted for review',
                                                error: 'Submit failed'
                                            });
                                        }}
                                        disabled={submitMut.isPending}
                                        className="inline-flex h-8 items-center gap-1 rounded-md bg-emerald-600 px-3 text-[10px] font-black text-white disabled:opacity-50"
                                    >
                                        <Send className="h-3.5 w-3.5" /> Submit
                                    </button>
                                )}
                            </div>
                        </article>
                    ))}
                    <div className="md:col-span-2 xl:col-span-3">
                        <Pagination
                            page={page}
                            pageSize={pageSize}
                            total={total}
                            onPageChange={setPage}
                            onPageSizeChange={setPageSize}
                            label="requirements"
                        />
                    </div>
                </div>
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[920px] text-sm">
                                <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left w-12">#</th>
                                        <th className="px-4 py-2.5 text-left w-40"><SortableHeader label="Requirement ID" field="requirementNumber" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left"><SortableHeader label="Title" field="title" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left w-32"><SortableHeader label="Method" field="procurementMethod" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left w-32"><SortableHeader label="Status" field="status" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-right w-32"><SortableHeader label="Estimated Value" field="estimatedValue" activeField={sortKey} direction={sortDirection} onSort={toggleSort} className="justify-end" /></th>
                                        <th className="px-4 py-2.5 text-left w-44"><SortableHeader label="Required By" field="requiredBy" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-left w-44"><SortableHeader label="Updated" field="updatedAt" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                                        <th className="px-4 py-2.5 text-right w-44">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {sortedRecords.map((req, idx) => (
                                        <tr
                                            key={req.id}
                                            className="hover:bg-slate-50/60 cursor-pointer"
                                            onClick={() => setOpenId(req.id)}
                                        >
                                            <td className="px-4 py-3 text-xs font-mono text-slate-400">
                                                {String((page - 1) * pageSize + idx + 1).padStart(2, '0')}
                                            </td>
                                            <td className="px-4 py-3">
                                                <button
                                                    type="button"
                                                    className="text-[11px] font-black uppercase tracking-wide text-[#12335f] hover:underline text-wrap-anywhere"
                                                    onMouseEnter={() => prefetchRequirement(req.id)}
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setOpenId(req.id);
                                                    }}
                                                >
                                                    {req.requirementNumber}
                                                </button>
                                                <p className="mt-0.5 text-[9px] font-mono text-slate-400">#{req.id}</p>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-black text-slate-900 text-wrap-anywhere">{req.title}</p>
                                                {req.items?.length ? (
                                                    <p className="mt-0.5 text-[10px] font-bold text-slate-500">
                                                        {req.items.length} line item{req.items.length === 1 ? '' : 's'}
                                                    </p>
                                                ) : null}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge className="rounded-md border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase text-slate-600">
                                                    {req.canonicalMethod ? labelForCanonical(req.canonicalMethod) : (PROCUREMENT_METHOD_LABELS[req.procurementMethod] || req.procurementMethod)}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge
                                                    className={cn(
                                                        'rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide',
                                                        STATUS_TONE[req.status] || STATUS_TONE.DRAFT
                                                    )}
                                                >
                                                    {req.status.replace(/_/g, ' ')}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-right text-xs font-bold text-slate-900">
                                                {formatCurrency(req.estimatedValue)}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                                                {formatDate(req.requiredBy)}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                                                <p>{formatDateTime(req.updatedAt)}</p>
                                                <p className="text-[10px] text-slate-400">{formatRelative(req.updatedAt)}</p>
                                            </td>
                                            <td className="px-4 py-3 text-right" onClick={e => e.stopPropagation()}>
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setOpenId(req.id)}
                                                        title="View details"
                                                        className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-[#12335f] hover:bg-slate-50"
                                                    >
                                                        <Eye className="h-3.5 w-3.5" />
                                                    </button>
                                                    {req.status === 'DRAFT' && (
                                                        <>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    runWithToast(() => submitMut.mutateAsync(req.id), {
                                                                        loading: 'Submitting...',
                                                                        success: 'Requirement submitted for review',
                                                                        error: 'Submit failed'
                                                                    });
                                                                }}
                                                                disabled={submitMut.isPending}
                                                                title="Submit for review"
                                                                className="flex h-8 w-8 items-center justify-center rounded-md border border-emerald-200 bg-white text-emerald-700 hover:bg-emerald-50 disabled:opacity-50"
                                                            >
                                                                {submitMut.isPending && submitMut.variables === req.id
                                                                    ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                                                    : <Send className="h-3.5 w-3.5" />}
                                                            </button>
                                                            <button
                                                                type="button"
                                                                onClick={() => {
                                                                    if (!window.confirm(`Delete requirement "${req.title}"? This cannot be undone.`)) return;
                                                                    runWithToast(() => deleteMut.mutateAsync(req.id), {
                                                                        loading: 'Deleting...',
                                                                        success: 'Requirement deleted',
                                                                        error: 'Delete failed'
                                                                    });
                                                                }}
                                                                disabled={deleteMut.isPending}
                                                                title="Delete draft"
                                                                className="flex h-8 w-8 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50 disabled:opacity-50"
                                                            >
                                                                <Trash2 className="h-3.5 w-3.5" />
                                                            </button>
                                                        </>
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
                            label="requirements"
                        />
                    </CardContent>
                </Card>
            )}

            {openId !== null && <RequirementDetail id={openId} onClose={() => setOpenId(null)} />}
            {creating && <RequirementCreator onClose={() => setCreating(false)} />}
        </div>
    );
}

/* ---------- Enterprise create requirement workbench ---------- */

type RequirementItemDraft = {
    id: string;
    name: string;
    category: string;
    subCategory: string;
    description: string;
    quantity: number;
    unit: string;
    hsn: string;
    sac: string;
    budget: number;
    currency: string;
    origin: string;
    equivalentBrandAllowed: boolean;
};

type SpecificationDraft = { id: string; name: string; value: string; unit: string; min: string; max: string; mandatory: boolean };
type RequirementDocDraft = { id: string; category: string; requirement: 'Mandatory' | 'Optional' | 'Not Required'; files: Array<{ name: string; size: number; uploadedAt: string; version: number }> };

const reqId = () => Math.random().toString(36).slice(2, 10);
const requirementDraftKey = 'msme:create-requirement:enterprise-draft:v1';
const todayIso = new Date().toISOString().slice(0, 10);

const requirementSteps = [
    'Requirement Info', 'Buyer Info', 'Access', 'Items', 'Specifications', 'Delivery', 'Contract', 'Commercial',
    'Inspection', 'Warranty', 'Penalty', 'EMD', 'Security', 'Seller Rules', 'Eligibility', 'Budget', 'Vendor',
    'Justification', 'Tax', 'Contacts', 'Evaluation', 'Bid Timeline', 'Milestones', 'Terms', 'Attachments'
];

const defaultRequirementItem = (): RequirementItemDraft => ({
    id: reqId(),
    name: '',
    category: 'Goods',
    subCategory: '',
    description: '',
    quantity: 1,
    unit: 'Nos',
    hsn: '',
    sac: '',
    budget: 0,
    currency: 'INR',
    origin: 'India',
    equivalentBrandAllowed: true
});

const defaultRequirementDraft = () => ({
    requirementNumber: `REQ/${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`,
    requirementTitle: '',
    requirementType: 'Tender',
    procurementCategory: 'Goods',
    description: '',
    department: '',
    priority: 'Medium',
    requirementDate: todayIso,
    closingDate: '',
    organizationName: 'Government Office Complex',
    organizationType: 'Central Government',
    buyerName: 'Buyer User',
    buyerDesignation: 'Procurement Officer',
    buyerEmail: '',
    buyerContact: '',
    gstin: '',
    visibility: 'Public / All Sellers',
    participate: 'Verified Sellers',
    publicAll: true,
    privateInvited: false,
    msmeOnly: false,
    startupOnly: false,
    womenOnly: false,
    shgOnly: false,
    localPreference: true,
    subcontracting: false,
    deliveryLocationType: 'Single Location',
    deliveryAddress: '',
    state: '',
    district: '',
    city: '',
    pincode: '',
    deliveryPeriod: '',
    deliveryType: 'One Time Delivery',
    installationRequired: false,
    trainingRequired: false,
    multipleLocations: false,
    geoLocation: '',
    contractType: 'One-time',
    contractDuration: '',
    contractStartDate: '',
    contractEndDate: '',
    rateContract: false,
    amcRequired: false,
    renewalOption: false,
    renewalAllowed: false,
    contractNotes: '',
    paymentTerms: '100% After Delivery',
    advanceAllowed: false,
    advancePercent: '',
    securityDepositRequired: false,
    emdRequired: false,
    inspectionRequired: false,
    inspectionAgency: '',
    qualityCheckRequired: true,
    thirdPartyInspection: false,
    inspectionLocation: '',
    acceptanceCriteria: '',
    warrantyRequired: true,
    warrantyPeriod: '',
    onsiteSupport: false,
    guaranteePeriod: '',
    replacementPeriod: '',
    comprehensiveSupport: false,
    delayPenaltyApplicable: false,
    delayPenaltyPercent: '',
    maximumPenalty: '',
    performancePenalty: false,
    slaPenalty: false,
    emdAmount: '',
    emdExemptionMsme: true,
    emdValidityDays: '',
    emdPaymentMode: 'Online',
    emdRefundTerms: '',
    performanceSecurityRequired: false,
    securityDepositPercent: '',
    securityValidityMonths: '',
    securityDepositMode: 'Bank Guarantee',
    manufacturer: true,
    authorizedDealer: true,
    distributor: true,
    trader: false,
    serviceProvider: true,
    oemOnly: false,
    oemAuthRequired: false,
    brandAuthRequired: false,
    individualSellersAllowed: true,
    consortiumAllowed: false,
    groupCompanyAllowed: false,
    sellerConditions: '',
    minimumTurnover: '',
    experienceYears: '',
    startupAllowed: true,
    msmeReserved: false,
    isoRequired: false,
    gstMandatory: true,
    panMandatory: true,
    budgetAvailable: '',
    budgetHead: '',
    projectCode: '',
    fundingSource: '',
    budgetRemarks: '',
    preferredVendor: '',
    existingVendor: false,
    oemPreference: false,
    vendorRecommendation: '',
    inviteSpecificVendors: false,
    vendorList: '',
    needReason: '',
    businessPurpose: '',
    emergencyProcurement: false,
    expectedOutcome: '',
    gstApplicable: true,
    gstType: 'CGST + SGST',
    taxInclusion: 'Exclusive',
    tdsApplicable: false,
    tdsPercent: '',
    technicalContactName: '',
    technicalContactEmail: '',
    technicalContactNumber: '',
    commercialContactName: '',
    commercialContactEmail: '',
    commercialContactNumber: '',
    escalationContactName: '',
    escalationContactEmail: '',
    escalationContactNumber: '',
    evaluationMethod: 'Technical + Financial Evaluation',
    technicalWeightage: '50',
    financialWeightage: '50',
    experienceMarks: '',
    complianceMarks: '',
    certificationsMarks: '',
    deliveryMarks: '',
    priceMarks: '',
    bidType: 'Two Bid',
    bidSubmissionType: 'Two Cover',
    bidStartDate: '',
    bidEndDate: '',
    technicalOpeningDate: '',
    financialOpeningDate: '',
    preBidMeeting: false,
    preBidMeetingDate: '',
    clarificationEndDate: '',
    allowBidRevision: true,
    multiCurrencyAllowed: false,
    publishDate: todayIso,
    corrigendumDate: '',
    contractAwardDate: '',
    milestoneContractStartDate: '',
    milestoneContractEndDate: '',
    terms: 'Penalty Clause\nWarranty Terms\nReplacement Terms\nSLA Requirements\nContract Duration\nInspection Terms\nQuality Requirements',
});

function RequirementCreationWorkbench() {
    const [prefill] = useState<RequirementHandoff | null>(() => readRequirementHandoff());
    const [procurementSummaries] = useState<ProcurementIntakeSummary[]>(() => loadProcurementSummaries());
    const [step, setStep] = useState(0);
    const [draft, setDraft] = useState<Record<string, string | boolean>>(() => {
        try {
            const raw = localStorage.getItem(requirementDraftKey);
            if (prefill?.draft) return { ...defaultRequirementDraft(), ...prefill.draft };
            return raw ? { ...defaultRequirementDraft(), ...JSON.parse(raw) } : defaultRequirementDraft();
        } catch {
            return defaultRequirementDraft();
        }
    });
    const [items, setItems] = useState<RequirementItemDraft[]>(() => (
        prefill?.items?.length
            ? prefill.items.map(item => ({ ...defaultRequirementItem(), ...item, id: reqId() }))
            : [defaultRequirementItem()]
    ));
    const [specs, setSpecs] = useState<SpecificationDraft[]>([
        { id: reqId(), name: 'Warranty', value: '12 Months', unit: 'Months', min: '', max: '', mandatory: true },
        { id: reqId(), name: 'Certification', value: '', unit: '', min: '', max: '', mandatory: false },
    ]);
    const [docs, setDocs] = useState<RequirementDocDraft[]>(() => prefill?.docs?.length ? prefill.docs.map(doc => ({
        id: reqId(),
        category: String(doc.category || 'Procurement Document'),
        requirement: doc.requirement || 'Optional',
        files: Array.isArray(doc.files) ? doc.files.map(file => ({
            name: file.name,
            size: file.size || 0,
            uploadedAt: file.uploadedAt || new Date().toISOString(),
            version: file.version || 1,
        })) : [],
    })) : [
        'BOQ File', 'Technical Specification', 'Drawings', 'Scope of Work', 'Terms & Conditions', 'Reference Images',
        'Inspection Documents', 'Eligibility Documents', 'EMD Exemption Document', 'Performance Security Document',
        'Vendor Authorization Document', 'Budget Approval Document'
    ].map((category, index) => ({ id: reqId(), category, requirement: index < 4 ? 'Mandatory' : 'Optional', files: [] })));
    const [preview, setPreview] = useState(false);
    const createMut = useCreateRequirement();

    const estimatedValue = useMemo(() => items.reduce((sum, item) => sum + Number(item.quantity || 0) * Number(item.budget || 0), 0), [items]);
    const validation = useMemo(() => validateRequirementWorkbench(draft, items, docs), [draft, items, docs]);
    const evaluationTotal = Number(draft.technicalWeightage || 0) + Number(draft.financialWeightage || 0);

    const patch = (key: string, value: string | boolean) => setDraft(prev => ({ ...prev, [key]: value }));
    const saveDraft = () => {
        localStorage.setItem(requirementDraftKey, JSON.stringify(draft));
        toast.success('Requirement draft saved');
    };

    const submit = async () => {
        if (validation.errors.length) {
            toast.error(`Resolve ${validation.errors.length} requirement issue${validation.errors.length > 1 ? 's' : ''} before submission.`);
            return;
        }
        await runWithToast(
            () => createMut.mutateAsync({
                title: String(draft.requirementTitle),
                description: String(draft.description || draft.needReason || ''),
                procurementMethod: methodFromRequirement(String(draft.requirementType)),
                estimatedValue,
                requiredBy: String(draft.closingDate || draft.bidEndDate || ''),
                items: items.map(item => ({
                    itemName: item.name,
                    description: item.description,
                    quantity: Number(item.quantity || 0),
                    unitOfMeasure: item.unit,
                    estimatedUnitPrice: Number(item.budget || 0),
                    specifications: { hsn: item.hsn, sac: item.sac, brandAllowed: item.equivalentBrandAllowed, specs }
                }))
            }),
            { loading: 'Creating requirement...', success: 'Requirement submitted to the register', error: err => err instanceof Error ? err.message : 'Create failed' }
        );
    };

    const section = [
        <RequirementInfoSection draft={draft} patch={patch} />,
        <BuyerInfoSection draft={draft} patch={patch} />,
        <AccessControlSection draft={draft} patch={patch} />,
        <RequirementItemsSection items={items} setItems={setItems} />,
        <SpecificationsSection specs={specs} setSpecs={setSpecs} />,
        <DeliveryRequirementSection draft={draft} patch={patch} />,
        <ContractSection draft={draft} patch={patch} />,
        <RequirementCommercialSection draft={draft} patch={patch} estimatedValue={estimatedValue} />,
        <InspectionSection draft={draft} patch={patch} />,
        <WarrantyRequirementSection draft={draft} patch={patch} />,
        <PenaltySection draft={draft} patch={patch} />,
        <EmdRequirementSection draft={draft} patch={patch} />,
        <PerformanceSecuritySection draft={draft} patch={patch} />,
        <SellerRulesSection draft={draft} patch={patch} />,
        <EligibilityRequirementSection draft={draft} patch={patch} />,
        <BudgetRequirementSection draft={draft} patch={patch} />,
        <VendorPreferenceSection draft={draft} patch={patch} />,
        <JustificationSection draft={draft} patch={patch} />,
        <TaxSection draft={draft} patch={patch} />,
        <ContactPersonSection draft={draft} patch={patch} />,
        <EvaluationRequirementSection draft={draft} patch={patch} total={evaluationTotal} />,
        <BidSubmissionSection draft={draft} patch={patch} />,
        <TimelineMilestoneSection draft={draft} patch={patch} />,
        <TermsSection draft={draft} patch={patch} />,
        <RequirementDocumentsSection docs={docs} setDocs={setDocs} />,
    ][step];

    return (
        <div className="space-y-4 pb-16">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-end lg:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement · Master Requirement</p>
                    <h1 className="text-2xl font-black tracking-tight text-slate-950">Create Requirement</h1>
                    <p className="mt-1 max-w-3xl text-xs font-semibold text-slate-500">
                        Capture the master demand once, then route it to RFQ, tender, reverse auction, direct purchase, or service procurement.
                    </p>
                </div>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={saveDraft}><FileText className="mr-2 h-4 w-4" /> Save as Draft</Button>
                    <Button variant="outline" onClick={() => setPreview(true)}><Eye className="mr-2 h-4 w-4" /> Preview Requirement</Button>
                    <Button onClick={submit} disabled={createMut.isPending} className="bg-[#12335f] text-white"><Send className="mr-2 h-4 w-4" /> Submit for Approval</Button>
                </div>
            </div>

            {procurementSummaries.length > 0 && (
                <Card className="border-blue-100 bg-blue-50/40">
                    <CardContent className="p-4">
                        <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Latest Create Procurement Intake</p>
                                <h2 className="mt-1 text-base font-black text-slate-950">{procurementSummaries[0].title}</h2>
                                <p className="mt-1 text-xs font-semibold text-slate-600">
                                    {procurementSummaries[0].methodLabel} · {procurementSummaries[0].category || 'Uncategorised'} · {formatCurrency(procurementSummaries[0].estimatedValue)}
                                </p>
                            </div>
                            <div className="grid gap-2 text-xs font-bold text-slate-700 sm:grid-cols-3 lg:min-w-[520px]">
                                <span className="rounded-md border border-blue-100 bg-white px-3 py-2">Items: {procurementSummaries[0].items?.length || 0}</span>
                                <span className="rounded-md border border-blue-100 bg-white px-3 py-2">Documents: {procurementSummaries[0].documents?.length || 0}</span>
                                <span className="rounded-md border border-blue-100 bg-white px-3 py-2">Closing: {formatDate(procurementSummaries[0].submissionDate)}</span>
                            </div>
                        </div>
                        {procurementSummaries[0].documents?.length ? (
                            <div className="mt-3 flex flex-wrap gap-2">
                                {procurementSummaries[0].documents.slice(0, 6).map(document => (
                                    <span key={`${document.name}-${document.fileName}`} className="rounded-md border border-blue-100 bg-white px-2.5 py-1 text-[10px] font-black text-[#12335f]">
                                        {document.name}: {document.fileName}
                                    </span>
                                ))}
                            </div>
                        ) : null}
                    </CardContent>
                </Card>
            )}

            {validation.errors.length > 0 && (
                <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-bold text-red-700">
                    <AlertCircle className="mr-2 inline h-4 w-4" /> {validation.errors[0]}
                </div>
            )}

            <div className="flex gap-2 overflow-x-auto pb-1">
                {requirementSteps.map((label, index) => (
                    <button key={label} type="button" onClick={() => setStep(index)} className={cn('shrink-0 rounded-full border px-3 py-1.5 text-[10px] font-black', step === index ? 'border-[#12335f] bg-[#12335f] text-white' : 'border-slate-200 bg-white text-slate-600')}>
                        {index + 1}. {label}
                    </button>
                ))}
            </div>

            <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
                <div>{section}</div>
                <aside className="space-y-4">
                    <WorkbenchPanel title="Review Summary" icon={ClipboardCheck}>
                        <SummaryLine label="Requirement No." value={String(draft.requirementNumber)} />
                        <SummaryLine label="Type" value={String(draft.requirementType)} />
                        <SummaryLine label="Items" value={String(items.length)} />
                        <SummaryLine label="Estimated Value" value={formatCurrency(estimatedValue)} />
                        <SummaryLine label="Evaluation Total" value={`${evaluationTotal}%`} danger={evaluationTotal !== 100} />
                        <SummaryLine label="Mandatory Docs Missing" value={String(docs.filter(doc => doc.requirement === 'Mandatory' && doc.files.length === 0).length)} danger={docs.some(doc => doc.requirement === 'Mandatory' && doc.files.length === 0)} />
                    </WorkbenchPanel>
                    <WorkbenchPanel title="Approval Status" icon={Send}>
                        {['Department Head', 'Finance Officer', 'Procurement Officer', 'Competent Authority'].map(role => (
                            <div key={role} className="flex items-center justify-between border-b border-slate-100 py-2 text-xs font-bold last:border-0">
                                <span>{role}</span><span className="text-amber-600">Pending</span>
                            </div>
                        ))}
                    </WorkbenchPanel>
                </aside>
            </div>

            {preview && <RequirementPreview draft={draft} items={items} docs={docs} estimatedValue={estimatedValue} onClose={() => setPreview(false)} />}
        </div>
    );
}

function RequirementInfoSection({ draft, patch }: WorkbenchSectionProps) {
    return (
        <WorkbenchPanel title="1. Requirement Information" icon={FileText}>
            <WorkbenchGrid>
                <WorkbenchField label="Requirement Number" required><WorkbenchInput value={String(draft.requirementNumber)} disabled onChange={() => undefined} /></WorkbenchField>
                <WorkbenchField label="Requirement Title" required><WorkbenchInput value={String(draft.requirementTitle)} onChange={v => patch('requirementTitle', v)} /></WorkbenchField>
                <WorkbenchField label="Requirement Type" required><WorkbenchSelect value={String(draft.requirementType)} onChange={v => patch('requirementType', v)} options={['RFQ', 'Tender', 'Limited Tender', 'Open Tender', 'Reverse Auction', 'Direct Purchase', 'Service Requirement']} /></WorkbenchField>
                <WorkbenchField label="Procurement Category" required><WorkbenchSelect value={String(draft.procurementCategory)} onChange={v => patch('procurementCategory', v)} options={['Goods', 'Services', 'Works', 'Consultancy']} /></WorkbenchField>
                <WorkbenchField label="Department / Division" required><WorkbenchInput value={String(draft.department)} onChange={v => patch('department', v)} /></WorkbenchField>
                <WorkbenchField label="Priority Level"><WorkbenchSelect value={String(draft.priority)} onChange={v => patch('priority', v)} options={['Low', 'Medium', 'High', 'Urgent', 'Critical']} /></WorkbenchField>
                <WorkbenchField label="Requirement Date"><WorkbenchInput type="date" value={String(draft.requirementDate)} onChange={v => patch('requirementDate', v)} /></WorkbenchField>
                <WorkbenchField label="Closing Date" required><WorkbenchInput type="date" value={String(draft.closingDate)} onChange={v => patch('closingDate', v)} /></WorkbenchField>
                <WorkbenchField label="Requirement Description" required className="md:col-span-2 xl:col-span-3"><WorkbenchTextarea value={String(draft.description)} onChange={v => patch('description', v)} /></WorkbenchField>
            </WorkbenchGrid>
        </WorkbenchPanel>
    );
}

function BuyerInfoSection({ draft, patch }: WorkbenchSectionProps) {
    return (
        <WorkbenchPanel title="2. Buyer Information" icon={ClipboardCheck}>
            <WorkbenchGrid>
                <WorkbenchField label="Organization Name" required><WorkbenchInput value={String(draft.organizationName)} onChange={v => patch('organizationName', v)} /></WorkbenchField>
                <WorkbenchField label="Organization Type"><WorkbenchSelect value={String(draft.organizationType)} onChange={v => patch('organizationType', v)} options={['Central Government', 'State Government', 'PSU', 'Municipality', 'MSME', 'Private Company', 'Cooperative', 'SHG', 'Educational Institute']} /></WorkbenchField>
                <WorkbenchField label="Buyer Name" required><WorkbenchInput value={String(draft.buyerName)} onChange={v => patch('buyerName', v)} /></WorkbenchField>
                <WorkbenchField label="Buyer Designation"><WorkbenchInput value={String(draft.buyerDesignation)} onChange={v => patch('buyerDesignation', v)} /></WorkbenchField>
                <WorkbenchField label="Buyer Email" required><WorkbenchInput value={String(draft.buyerEmail)} onChange={v => patch('buyerEmail', v)} /></WorkbenchField>
                <WorkbenchField label="Buyer Contact Number" required><WorkbenchInput value={String(draft.buyerContact)} onChange={v => patch('buyerContact', v)} /></WorkbenchField>
                <WorkbenchField label="GSTIN"><WorkbenchInput value={String(draft.gstin)} onChange={v => patch('gstin', v)} /></WorkbenchField>
            </WorkbenchGrid>
        </WorkbenchPanel>
    );
}

function AccessControlSection({ draft, patch }: WorkbenchSectionProps) {
    return <GenericTogglePanel title="3. Visibility & Access Control" icon={Eye} draft={draft} patch={patch} fields={[
        ['publicAll', 'Public / All Sellers'], ['privateInvited', 'Private / Invited Sellers'], ['msmeOnly', 'MSME Only'], ['startupOnly', 'Startup Only'], ['womenOnly', 'Women-Owned Business Only'], ['shgOnly', 'SHG Only'], ['localPreference', 'Local Supplier Preference'], ['subcontracting', 'Allow Sub-contracting']
    ]} extra={<WorkbenchGrid><WorkbenchField label="Requirement Visibility"><WorkbenchSelect value={String(draft.visibility)} onChange={v => patch('visibility', v)} options={['Public / All Sellers', 'Private / Invited Sellers', 'Verified Sellers Only']} /></WorkbenchField><WorkbenchField label="Who Can Participate"><WorkbenchInput value={String(draft.participate)} onChange={v => patch('participate', v)} /></WorkbenchField></WorkbenchGrid>} />;
}

function RequirementItemsSection({ items, setItems }: { items: RequirementItemDraft[]; setItems: (items: RequirementItemDraft[]) => void }) {
    const update = (id: string, patch: Partial<RequirementItemDraft>) => setItems(items.map(item => item.id === id ? { ...item, ...patch } : item));
    return (
        <WorkbenchPanel title="4. Item / Service Details" icon={ClipboardCheck}>
            <div className="mb-3 flex flex-wrap gap-2">
                <Button variant="outline" onClick={() => setItems([...items, defaultRequirementItem()])} className="h-8 text-xs"><Plus className="mr-1 h-3.5 w-3.5" /> Add Item</Button>
                <Button variant="outline" onClick={() => toast.info('Use these visible columns as the Excel template.')} className="h-8 text-xs"><Download className="mr-1 h-3.5 w-3.5" /> Import / Template</Button>
            </div>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-[1150px] w-full text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <tr>{['Product / Service', 'Category', 'Sub Category', 'Description', 'Qty', 'Unit', 'HSN', 'SAC', 'Budget', 'Origin', 'Brand Allowed', 'Action'].map(h => <th key={h} className="px-2 py-2 text-left">{h}</th>)}</tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                        {items.map(item => (
                            <tr key={item.id}>
                                <td className="px-2 py-2"><WorkbenchInput value={item.name} onChange={v => update(item.id, { name: v })} /></td>
                                <td className="px-2 py-2"><WorkbenchInput value={item.category} onChange={v => update(item.id, { category: v })} /></td>
                                <td className="px-2 py-2"><WorkbenchInput value={item.subCategory} onChange={v => update(item.id, { subCategory: v })} /></td>
                                <td className="px-2 py-2"><WorkbenchInput value={item.description} onChange={v => update(item.id, { description: v })} /></td>
                                <td className="px-2 py-2"><WorkbenchInput type="number" value={String(item.quantity)} onChange={v => update(item.id, { quantity: Number(v) || 0 })} /></td>
                                <td className="px-2 py-2"><WorkbenchInput value={item.unit} onChange={v => update(item.id, { unit: v })} /></td>
                                <td className="px-2 py-2"><WorkbenchInput value={item.hsn} onChange={v => update(item.id, { hsn: v })} /></td>
                                <td className="px-2 py-2"><WorkbenchInput value={item.sac} onChange={v => update(item.id, { sac: v })} /></td>
                                <td className="px-2 py-2"><WorkbenchInput type="number" value={String(item.budget)} onChange={v => update(item.id, { budget: Number(v) || 0 })} /></td>
                                <td className="px-2 py-2"><WorkbenchInput value={item.origin} onChange={v => update(item.id, { origin: v })} /></td>
                                <td className="px-2 py-2"><WorkbenchToggle label="Yes" checked={item.equivalentBrandAllowed} onChange={v => update(item.id, { equivalentBrandAllowed: v })} /></td>
                                <td className="px-2 py-2"><div className="flex gap-1"><Button variant="outline" onClick={() => setItems([...items, { ...item, id: reqId() }])} className="h-8 w-8 p-0"><Copy className="h-3.5 w-3.5" /></Button><Button variant="outline" onClick={() => setItems(items.filter(row => row.id !== item.id))} disabled={items.length === 1} className="h-8 w-8 p-0 text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button></div></td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </WorkbenchPanel>
    );
}

function SpecificationsSection({ specs, setSpecs }: { specs: SpecificationDraft[]; setSpecs: (rows: SpecificationDraft[]) => void }) {
    const update = (id: string, patch: Partial<SpecificationDraft>) => setSpecs(specs.map(row => row.id === id ? { ...row, ...patch } : row));
    return (
        <WorkbenchPanel title="5. Technical Specifications" icon={ClipboardCheck}>
            <div className="overflow-x-auto rounded-lg border border-slate-200">
                <table className="min-w-[900px] w-full text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500"><tr>{['Specification', 'Required Value', 'Unit', 'Minimum', 'Maximum', 'Mandatory', 'Action'].map(h => <th key={h} className="px-2 py-2 text-left">{h}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-100">{specs.map(row => <tr key={row.id}><td className="px-2 py-2"><WorkbenchInput value={row.name} onChange={v => update(row.id, { name: v })} /></td><td className="px-2 py-2"><WorkbenchInput value={row.value} onChange={v => update(row.id, { value: v })} /></td><td className="px-2 py-2"><WorkbenchInput value={row.unit} onChange={v => update(row.id, { unit: v })} /></td><td className="px-2 py-2"><WorkbenchInput value={row.min} onChange={v => update(row.id, { min: v })} /></td><td className="px-2 py-2"><WorkbenchInput value={row.max} onChange={v => update(row.id, { max: v })} /></td><td className="px-2 py-2"><WorkbenchToggle label="Yes" checked={row.mandatory} onChange={v => update(row.id, { mandatory: v })} /></td><td className="px-2 py-2"><Button variant="outline" onClick={() => setSpecs(specs.filter(item => item.id !== row.id))} className="h-8 w-8 p-0 text-red-600"><Trash2 className="h-3.5 w-3.5" /></Button></td></tr>)}</tbody>
                </table>
            </div>
            <Button variant="outline" onClick={() => setSpecs([...specs, { id: reqId(), name: '', value: '', unit: '', min: '', max: '', mandatory: true }])} className="mt-3 h-8 text-xs"><Plus className="mr-1 h-3.5 w-3.5" /> Add Specification</Button>
        </WorkbenchPanel>
    );
}

function DeliveryRequirementSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="6. Delivery Requirements" icon={CalendarClock} draft={draft} patch={patch} fields={[['deliveryLocationType', 'Delivery Location Type'], ['deliveryAddress', 'Delivery Address'], ['state', 'State'], ['district', 'District'], ['city', 'City'], ['pincode', 'Pincode'], ['deliveryPeriod', 'Delivery Period'], ['deliveryType', 'Delivery Type'], ['geoLocation', 'Geo Location']] } toggles={[['installationRequired', 'Installation Required'], ['trainingRequired', 'Training Required'], ['multipleLocations', 'Multiple Delivery Locations']]} />; }
function ContractSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="7. Contract Information" icon={FileText} draft={draft} patch={patch} fields={[['contractType', 'Contract Type'], ['contractDuration', 'Contract Duration'], ['contractStartDate', 'Contract Start Date', 'date'], ['contractEndDate', 'Contract End Date', 'date'], ['contractNotes', 'Contract Notes']] } toggles={[['rateContract', 'Rate Contract'], ['amcRequired', 'AMC Required'], ['renewalOption', 'Renewal Option'], ['renewalAllowed', 'Renewal Allowed']]} />; }
function RequirementCommercialSection({ draft, patch, estimatedValue }: WorkbenchSectionProps & { estimatedValue: number }) { return <SimpleFieldsPanel title="8. Commercial Terms" icon={ClipboardCheck} draft={{ ...draft, estimatedValue: String(estimatedValue) }} patch={patch} fields={[['estimatedValue', 'Estimated Value'], ['currency', 'Currency'], ['paymentTerms', 'Payment Terms'], ['advancePercent', 'Advance Payment Percentage'], ['securityDepositRequired', 'Security Deposit Required'], ['emdRequired', 'EMD Required']] } toggles={[['advanceAllowed', 'Advance Payment Allowed']]} />; }
function InspectionSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="9. Inspection & Acceptance" icon={ClipboardCheck} draft={draft} patch={patch} fields={[['inspectionAgency', 'Inspection Agency'], ['inspectionLocation', 'Inspection Location'], ['acceptanceCriteria', 'Acceptance Criteria']] } toggles={[['inspectionRequired', 'Inspection Required'], ['qualityCheckRequired', 'Quality Check Required'], ['thirdPartyInspection', 'Third Party Inspection']]} />; }
function WarrantyRequirementSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="10. Warranty / Guarantee" icon={ClipboardCheck} draft={draft} patch={patch} fields={[['warrantyPeriod', 'Warranty Period'], ['guaranteePeriod', 'Guarantee Period'], ['replacementPeriod', 'Replacement Period']] } toggles={[['warrantyRequired', 'Warranty Required'], ['onsiteSupport', 'Onsite Support'], ['comprehensiveSupport', 'Comprehensive Support']]} />; }
function PenaltySection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="11. Liquidated Damages / Penalty" icon={AlertCircle} draft={draft} patch={patch} fields={[['delayPenaltyPercent', 'Delay Penalty Percentage'], ['maximumPenalty', 'Maximum Penalty']] } toggles={[['delayPenaltyApplicable', 'Delay Penalty Applicable'], ['performancePenalty', 'Performance Penalty'], ['slaPenalty', 'SLA Penalty Applicable']]} />; }
function EmdRequirementSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="12. EMD / Earnest Money Deposit" icon={FileText} draft={draft} patch={patch} fields={[['emdAmount', 'EMD Amount'], ['emdValidityDays', 'EMD Validity Days'], ['emdPaymentMode', 'EMD Payment Mode'], ['emdRefundTerms', 'EMD Refund Terms']] } toggles={[['emdRequired', 'EMD Required'], ['emdExemptionMsme', 'EMD Exemption for MSME']]} />; }
function PerformanceSecuritySection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="13. Performance Security" icon={ClipboardCheck} draft={draft} patch={patch} fields={[['securityDepositPercent', 'Security Deposit Percentage'], ['securityValidityMonths', 'Security Validity Months'], ['securityDepositMode', 'Security Deposit Mode']] } toggles={[['performanceSecurityRequired', 'Performance Security Required']]} />; }
function SellerRulesSection({ draft, patch }: WorkbenchSectionProps) { return <GenericTogglePanel title="14. Seller Participation Rules" icon={UsersIconFallback} draft={draft} patch={patch} fields={[['manufacturer', 'Manufacturer'], ['authorizedDealer', 'Authorized Dealer'], ['distributor', 'Distributor'], ['trader', 'Trader'], ['serviceProvider', 'Service Provider'], ['oemOnly', 'OEM Only'], ['oemAuthRequired', 'OEM Authorization Required'], ['brandAuthRequired', 'Brand Authorization Required'], ['individualSellersAllowed', 'Individual Sellers Allowed'], ['consortiumAllowed', 'Consortium Allowed'], ['groupCompanyAllowed', 'Group Company Allowed']]} extra={<WorkbenchField label="Other Conditions"><WorkbenchTextarea value={String(draft.sellerConditions)} onChange={v => patch('sellerConditions', v)} /></WorkbenchField>} />; }
function EligibilityRequirementSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="15. Eligibility Criteria" icon={ClipboardCheck} draft={draft} patch={patch} fields={[['minimumTurnover', 'Minimum Turnover'], ['experienceYears', 'Experience Required in Years']] } toggles={[['startupAllowed', 'Startup Allowed'], ['msmeReserved', 'MSME Reserved'], ['isoRequired', 'ISO Required'], ['oemAuthRequired', 'OEM Authorization Required'], ['gstMandatory', 'GST Mandatory'], ['panMandatory', 'PAN Mandatory']]} />; }
function BudgetRequirementSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="16. Budget Information" icon={ClipboardCheck} draft={draft} patch={patch} fields={[['budgetAvailable', 'Budget Available'], ['budgetHead', 'Budget Head'], ['projectCode', 'Project Code'], ['fundingSource', 'Funding Source'], ['budgetRemarks', 'Budget Remarks']] } />; }
function VendorPreferenceSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="17. Vendor Preference" icon={ClipboardCheck} draft={draft} patch={patch} fields={[['preferredVendor', 'Preferred Vendor'], ['vendorRecommendation', 'Vendor Recommendation'], ['vendorList', 'Add Vendor']] } toggles={[['existingVendor', 'Existing Vendor'], ['oemPreference', 'OEM Preference'], ['inviteSpecificVendors', 'Invite Specific Vendors']]} />; }
function JustificationSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="18. Procurement Justification" icon={FileText} draft={draft} patch={patch} fields={[['needReason', 'Why is this requirement needed?'], ['businessPurpose', 'Business Purpose'], ['expectedOutcome', 'Expected Outcome']] } toggles={[['emergencyProcurement', 'Emergency Procurement']]} />; }
function TaxSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="19. Tax Information" icon={ClipboardCheck} draft={draft} patch={patch} fields={[['gstType', 'GST Type'], ['taxInclusion', 'Tax Inclusion'], ['tdsPercent', 'TDS Percentage']] } toggles={[['gstApplicable', 'GST Applicable'], ['tdsApplicable', 'TDS Applicable']]} />; }
function ContactPersonSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="20. Contact Person Details" icon={ClipboardCheck} draft={draft} patch={patch} fields={[['technicalContactName', 'Technical Contact Name'], ['technicalContactEmail', 'Technical Contact Email'], ['technicalContactNumber', 'Technical Contact Number'], ['commercialContactName', 'Commercial Contact Name'], ['commercialContactEmail', 'Commercial Contact Email'], ['commercialContactNumber', 'Commercial Contact Number'], ['escalationContactName', 'Escalation Contact Name'], ['escalationContactEmail', 'Escalation Contact Email'], ['escalationContactNumber', 'Escalation Contact Number']] } />; }
function EvaluationRequirementSection({ draft, patch, total }: WorkbenchSectionProps & { total: number }) { return <SimpleFieldsPanel title={`21. Evaluation Criteria · Total ${total}%`} icon={ClipboardCheck} draft={draft} patch={patch} fields={[['evaluationMethod', 'Evaluation Method'], ['technicalWeightage', 'Technical Weightage'], ['financialWeightage', 'Financial Weightage'], ['experienceMarks', 'Experience Marks'], ['complianceMarks', 'Technical Compliance Marks'], ['certificationsMarks', 'Certifications Marks'], ['deliveryMarks', 'Delivery Capability Marks'], ['priceMarks', 'Price Marks']] } />; }
function BidSubmissionSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="22. Bid Submission Settings & Timeline" icon={CalendarClock} draft={draft} patch={patch} fields={[['bidType', 'Bid Type'], ['bidSubmissionType', 'Bid Submission Type'], ['bidStartDate', 'Bid Start Date', 'date'], ['bidEndDate', 'Bid End Date', 'date'], ['technicalOpeningDate', 'Bid Opening Date Technical', 'date'], ['financialOpeningDate', 'Bid Opening Date Financial', 'date'], ['preBidMeetingDate', 'Pre-Bid Meeting Date', 'date'], ['clarificationEndDate', 'Clarification End Date', 'date']] } toggles={[['preBidMeeting', 'Pre-Bid Meeting'], ['allowBidRevision', 'Allow Bid Revision'], ['multiCurrencyAllowed', 'Multi Currency Allowed']]} />; }
function TimelineMilestoneSection({ draft, patch }: WorkbenchSectionProps) { return <SimpleFieldsPanel title="23. Timeline & Milestones" icon={CalendarClock} draft={draft} patch={patch} fields={[['publishDate', 'Publish Date', 'date'], ['corrigendumDate', 'Corrigendum Date', 'date'], ['technicalOpeningDate', 'Technical Opening Date', 'date'], ['financialOpeningDate', 'Financial Opening Date', 'date'], ['contractAwardDate', 'Contract Award Date', 'date'], ['milestoneContractStartDate', 'Contract Start Date', 'date'], ['milestoneContractEndDate', 'Contract End Date', 'date']] } />; }
function TermsSection({ draft, patch }: WorkbenchSectionProps) { return <WorkbenchPanel title="24. Terms & Conditions" icon={FileText}><WorkbenchTextarea value={String(draft.terms)} onChange={v => patch('terms', v)} /></WorkbenchPanel>; }

function RequirementDocumentsSection({ docs, setDocs }: { docs: RequirementDocDraft[]; setDocs: (docs: RequirementDocDraft[]) => void }) {
    const updateDoc = (id: string, patch: Partial<RequirementDocDraft>) => setDocs(docs.map(doc => doc.id === id ? { ...doc, ...patch } : doc));
    return (
        <WorkbenchPanel title="25. Attachments / Document Uploads" icon={Upload}>
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {docs.map(doc => (
                    <div key={doc.id} className="rounded-lg border border-slate-200 bg-white p-3">
                        <div className="flex items-center justify-between gap-2">
                            <p className="text-xs font-black text-slate-900">{doc.category}</p>
                            <select value={doc.requirement} onChange={e => updateDoc(doc.id, { requirement: e.target.value as RequirementDocDraft['requirement'] })} className="rounded border border-slate-200 px-2 py-1 text-[10px] font-black">
                                <option>Mandatory</option><option>Optional</option><option>Not Required</option>
                            </select>
                        </div>
                        <label className="mt-3 flex min-h-20 cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed border-[#12335f]/30 bg-blue-50/40 text-center text-xs font-bold text-[#12335f]">
                            <Upload className="mb-1 h-5 w-5" /> Browse or drop files
                            <input type="file" multiple className="hidden" onChange={e => {
                                const selected = Array.from(e.target.files || []);
                                updateDoc(doc.id, { files: [...doc.files, ...selected.map(file => ({ name: file.name, size: file.size, uploadedAt: new Date().toISOString(), version: doc.files.length + 1 }))] });
                            }} />
                        </label>
                        <div className="mt-2 space-y-1">{doc.files.map(file => <p key={`${file.name}-${file.uploadedAt}`} className="truncate rounded bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{file.name} · v{file.version}</p>)}</div>
                    </div>
                ))}
            </div>
        </WorkbenchPanel>
    );
}

type WorkbenchSectionProps = { draft: Record<string, string | boolean>; patch: (key: string, value: string | boolean) => void };
const UsersIconFallback = ClipboardCheck;

function SimpleFieldsPanel({ title, icon, draft, patch, fields, toggles = [] }: WorkbenchSectionProps & { title: string; icon: any; fields: Array<[string, string, string?]>; toggles?: Array<[string, string]> }) {
    return (
        <WorkbenchPanel title={title} icon={icon}>
            <WorkbenchGrid>
                {fields.map(([key, label, type]) => <WorkbenchField key={key} label={label}><WorkbenchInput type={type || 'text'} value={String(draft[key] || '')} onChange={v => patch(key, v)} /></WorkbenchField>)}
                {toggles.map(([key, label]) => <WorkbenchToggle key={key} label={label} checked={Boolean(draft[key])} onChange={v => patch(key, v)} />)}
            </WorkbenchGrid>
        </WorkbenchPanel>
    );
}

function GenericTogglePanel({ title, icon, draft, patch, fields, extra }: WorkbenchSectionProps & { title: string; icon: any; fields: Array<[string, string]>; extra?: React.ReactNode }) {
    return (
        <WorkbenchPanel title={title} icon={icon}>
            {extra && <div className="mb-4">{extra}</div>}
            <WorkbenchGrid>{fields.map(([key, label]) => <WorkbenchToggle key={key} label={label} checked={Boolean(draft[key])} onChange={v => patch(key, v)} />)}</WorkbenchGrid>
        </WorkbenchPanel>
    );
}

function RequirementPreview({ draft, items, docs, estimatedValue, onClose }: { draft: Record<string, string | boolean>; items: RequirementItemDraft[]; docs: RequirementDocDraft[]; estimatedValue: number; onClose: () => void }) {
    return (
        <Modal title="Requirement Preview" onClose={onClose} wide>
            <div className="space-y-4">
                <SummaryLine label="Requirement" value={`${draft.requirementNumber} · ${draft.requirementTitle || 'Untitled'}`} />
                <SummaryLine label="Route" value={String(draft.requirementType)} />
                <SummaryLine label="Estimated Value" value={formatCurrency(estimatedValue)} />
                <SummaryLine label="Items" value={String(items.length)} />
                <SummaryLine label="Documents Attached" value={String(docs.reduce((sum, doc) => sum + doc.files.length, 0))} />
                <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs font-semibold text-slate-700 whitespace-pre-wrap">{String(draft.terms || '')}</div>
            </div>
        </Modal>
    );
}

function WorkbenchPanel({ title, icon: Icon, children }: { title: string; icon: any; children: React.ReactNode }) {
    return <section className="rounded-xl border border-slate-200 bg-white shadow-sm"><div className="flex items-center gap-2 border-b border-slate-100 px-4 py-3"><span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#12335f] text-white"><Icon className="h-4 w-4" /></span><h2 className="text-sm font-black text-[#12335f]">{title}</h2></div><div className="p-4">{children}</div></section>;
}
function WorkbenchGrid({ children }: { children: React.ReactNode }) { return <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{children}</div>; }
function WorkbenchField({ label, children, required, className }: { label: string; children: React.ReactNode; required?: boolean; className?: string }) { return <label className={cn('block space-y-1.5', className)}><span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label} {required && <span className="text-red-600">*</span>}</span>{children}</label>; }
function WorkbenchInput({ value, onChange, type = 'text', disabled }: { value: string; onChange: (value: string) => void; type?: string; disabled?: boolean }) { return <input value={value} disabled={disabled} type={type} onChange={e => onChange(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#12335f]/20 disabled:bg-slate-100" />; }
function WorkbenchSelect({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: string[] }) { return <select value={value} onChange={e => onChange(e.target.value)} className="h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#12335f]/20">{options.map(option => <option key={option}>{option}</option>)}</select>; }
function WorkbenchTextarea({ value, onChange }: { value: string; onChange: (value: string) => void }) { return <textarea value={value} onChange={e => onChange(e.target.value)} rows={5} className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:ring-2 focus:ring-[#12335f]/20" />; }
function WorkbenchToggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) { return <label className="flex min-h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#12335f]" />{label}</label>; }
function SummaryLine({ label, value, danger }: { label: string; value: string; danger?: boolean }) { return <div className="flex items-center justify-between gap-3 border-b border-slate-100 py-2 text-xs last:border-0"><span className="font-bold text-slate-500">{label}</span><span className={cn('text-right font-black', danger ? 'text-red-600' : 'text-slate-900')}>{value}</span></div>; }

function validateRequirementWorkbench(draft: Record<string, string | boolean>, items: RequirementItemDraft[], docs: RequirementDocDraft[]) {
    const errors: string[] = [];
    if (!String(draft.requirementTitle || '').trim()) errors.push('Requirement title is mandatory.');
    if (!String(draft.description || '').trim()) errors.push('Requirement description is mandatory.');
    if (!String(draft.closingDate || '').trim()) errors.push('Closing date is mandatory.');
    if (new Date(String(draft.closingDate || 0)).getTime() < new Date(String(draft.publishDate || draft.requirementDate || 0)).getTime()) errors.push('Closing date cannot be before publish / requirement date.');
    if (items.some(item => !item.name.trim() || Number(item.quantity) <= 0)) errors.push('Every item must have a name and valid quantity.');
    if (docs.some(doc => doc.requirement === 'Mandatory' && doc.files.length === 0)) errors.push('Mandatory requirement documents are missing.');
    const evalTotal = Number(draft.technicalWeightage || 0) + Number(draft.financialWeightage || 0);
    if (evalTotal !== 100 && String(draft.requirementType) !== 'Direct Purchase') errors.push('Evaluation technical and financial weightage must total 100%.');
    return { errors };
}

function methodFromRequirement(type: string): ProcurementMethod {
    if (type === 'Direct Purchase') return 'DIRECT_PURCHASE';
    if (type === 'RFQ') return 'RFQ';
    if (type === 'Reverse Auction') return 'REVERSE_AUCTION';
    if (type === 'Rate Contract') return 'RATE_CONTRACT';
    return 'TENDER';
}

/* ---------- Detail drawer ---------- */

function RequirementDetail({ id, onClose }: { id: number; onClose: () => void }) {
    const detail = useRequirement(id);
    const submitMut = useSubmitRequirement();
    const requirement = detail.data;
    const payload = requirement?.payload as Record<string, any> | null | undefined;
    const basics = payload?.basics;
    const vendors = payload?.vendors;
    const schedule = payload?.schedule;
    const rules = payload?.rules;
    const tender = payload?.tender;
    const approval = payload?.approval;
    const payloadItems = payload?.items as Array<Record<string, any>> | undefined;
    const payloadConsignees = payload?.consigneeDetails as Array<Record<string, any>> | undefined;
    const payloadDocuments = payload?.documents as Array<Record<string, any>> | undefined;
    const dp = requirement?.directPurchases?.[0];

    const submit = () => {
        if (!requirement) return;
        runWithToast(() => submitMut.mutateAsync(requirement.id), {
            loading: 'Submitting...',
            success: 'Requirement submitted for review',
            error: 'Submit failed'
        }).then(() => detail.refetch());
    };

    const SectionTitle = ({ children }: { children: React.ReactNode }) => (
        <h3 className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-[#12335f] border-b border-slate-100 pb-1.5 mb-3">
            {children}
        </h3>
    );

    const InfoCell = ({ label, value }: { label: string; value?: string | number | null | boolean }) => {
        if (value === undefined || value === null || value === '') return null;
        const display = typeof value === 'boolean' ? (value ? 'Yes' : 'No') : String(value);
        return (
            <div className="rounded-lg border border-slate-100 bg-white p-2.5 shadow-sm">
                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">{label}</p>
                <p className="mt-0.5 text-xs font-black text-slate-800 text-wrap-anywhere">{display}</p>
            </div>
        );
    };

    return (
        <Modal title={requirement ? `Requirement · ${requirement.requirementNumber}` : 'Requirement'} onClose={onClose} wide>
            {detail.isLoading && !requirement ? (
                <div className="flex justify-center py-8">
                    <Loader2 className="h-8 w-8 animate-spin text-[#12335f]" />
                </div>
            ) : !requirement ? (
                <EmptyState title="Requirement not found" />
            ) : (
                <div className="space-y-5">
                    {/* Header: ID + Status */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                        <Field label="Internal ID">
                            <code className="block rounded bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700">#{requirement.id}</code>
                        </Field>
                        <Field label="Status">
                            <Badge
                                className={cn(
                                    'rounded-md px-2 py-1 text-[10px] font-black uppercase',
                                    STATUS_TONE[requirement.status] || STATUS_TONE.DRAFT
                                )}
                            >
                                {requirement.status.replace(/_/g, ' ')}
                            </Badge>
                        </Field>
                    </div>

                    <Field label="Title">
                        <p className="text-base font-black text-slate-950 text-wrap-anywhere">{requirement.title}</p>
                    </Field>

                    {/* ============ PAYLOAD-BASED SECTIONS ============ */}
                    {payload ? (
                        <>
                            {/* Section 1: Basic Details */}
                            {basics && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3 shadow-sm">
                                    <SectionTitle>📋 Basic Details</SectionTitle>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <InfoCell label="Category" value={basics.category} />
                                        <InfoCell label="Sub-Category" value={basics.subCategory} />
                                        <InfoCell label="Department" value={basics.department} />
                                        <InfoCell label="Priority" value={basics.priority} />
                                        <InfoCell label="Requirement Type" value={basics.requirementType} />
                                        <InfoCell label="Estimated Value" value={formatCurrency(basics.estimatedValue)} />
                                        <InfoCell label="Funding Source" value={basics.fundingSource} />
                                        <InfoCell label="Cost Center" value={basics.costCenter} />
                                    </div>
                                    {basics.justification && (
                                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Justification</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{basics.justification}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Section 1.5: Exception Procurement Details */}
                            {payload.fullProcurementMethod === 'SINGLE_SOURCE' && payload.singleSourceDetails && (
                                <div className="rounded-xl border border-rose-250 bg-rose-50/20 p-4 space-y-3 shadow-sm">
                                    <SectionTitle>🔒 Single Source Sourcing Details</SectionTitle>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <InfoCell label="Reason Type" value={payload.singleSourceDetails.reasonType} />
                                        <InfoCell label="Price Reasonability Basis" value={payload.singleSourceDetails.priceReasonabilityBasis} />
                                        <InfoCell label="Approval Authority" value={payload.singleSourceDetails.approvalAuthority} />
                                        <InfoCell label="Market Availability Checked" value={payload.singleSourceDetails.marketAvailabilityChecked ? "Yes" : "No"} />
                                        <InfoCell label="Alternative Checked" value={payload.singleSourceDetails.alternativeSuppliersChecked ? "Yes" : "No"} />
                                    </div>
                                    {payload.singleSourceDetails.justification && (
                                        <div className="rounded-lg border border-rose-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-rose-500">Single Source Justification</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{payload.singleSourceDetails.justification}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {payload.fullProcurementMethod === 'PAC' && payload.pacDetails && (
                                <div className="rounded-xl border border-rose-250 bg-rose-50/20 p-4 space-y-3 shadow-sm">
                                    <SectionTitle>🛡️ Proprietary Article Certificate (PAC) Details</SectionTitle>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <InfoCell label="OEM Name" value={payload.pacDetails.oemName} />
                                        <InfoCell label="OEM Code" value={payload.pacDetails.oemCode || "N/A"} />
                                        <InfoCell label="Manufacturer Details" value={payload.pacDetails.manufacturerDetails} />
                                        <InfoCell label="Authorized Dealer" value={payload.pacDetails.authorizedDealer} />
                                        <InfoCell label="PAC Certificate Number" value={payload.pacDetails.pacCertificateNumber} />
                                        <InfoCell label="PAC Validity Date" value={payload.pacDetails.pacValidityDate} />
                                        <InfoCell label="Competent Authority (CFA)" value={payload.pacDetails.competentAuthority} />
                                        <InfoCell label="No Alternative Declared" value={payload.pacDetails.noAlternativeAvailable ? "Yes" : "No"} />
                                    </div>
                                    {payload.pacDetails.proprietaryJustification && (
                                        <div className="rounded-lg border border-rose-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-rose-500">Proprietary Justification</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{payload.pacDetails.proprietaryJustification}</p>
                                        </div>
                                    )}
                                    {payload.pacDetails.priceReasonabilityNote && (
                                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Price Reasonability Note</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{payload.pacDetails.priceReasonabilityNote}</p>
                                        </div>
                                    )}
                                    {payload.pacDetails.approvalRemarks && (
                                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Approval Remarks</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{payload.pacDetails.approvalRemarks}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {payload.fullProcurementMethod === 'EMERGENCY_PURCHASE' && payload.emergencyDetails && (
                                <div className="rounded-xl border border-orange-250 bg-orange-50/20 p-4 space-y-3 shadow-sm">
                                    <SectionTitle>⚠️ Emergency Sourcing Details</SectionTitle>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <InfoCell label="Emergency Type" value={payload.emergencyDetails.emergencyType} />
                                        <InfoCell label="Emergency Date & Time" value={payload.emergencyDetails.dateTime} />
                                        <InfoCell label="Retrospective Approval Required" value={payload.emergencyDetails.retrospectiveApprovalRequired ? "Yes" : "No"} />
                                    </div>
                                    {payload.emergencyDetails.description && (
                                        <div className="rounded-lg border border-orange-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-orange-500">Emergency Description</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{payload.emergencyDetails.description}</p>
                                        </div>
                                    )}
                                    {payload.emergencyDetails.impactIfNotPurchased && (
                                        <div className="rounded-lg border border-rose-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-rose-500">Impact If Not Purchased Immediately</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{payload.emergencyDetails.impactIfNotPurchased}</p>
                                        </div>
                                    )}
                                    {payload.emergencyDetails.auditJustification && (
                                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Audit Justification</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{payload.emergencyDetails.auditJustification}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Section 2: Supplier Selection */}
                            {vendors && (vendors.selection || vendors.msmePreference || vendors.minimumTurnover || vendors.experienceYears) && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3 shadow-sm">
                                    <SectionTitle>🏢 Supplier Selection</SectionTitle>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <InfoCell label="Selection Type" value={vendors.selection} />
                                        <InfoCell label="Invite Count" value={vendors.inviteCount > 0 ? vendors.inviteCount : undefined} />
                                        <InfoCell label="MSME Preference" value={vendors.msmePreference} />
                                        <InfoCell label="Make in India Preference" value={vendors.makeInIndiaPreference} />
                                        <InfoCell label="Local Vendor Preference" value={vendors.localVendorPreference} />
                                        <InfoCell label="Minimum Turnover" value={vendors.minimumTurnover} />
                                        <InfoCell label="Experience Years" value={vendors.experienceYears} />
                                        {vendors.selectedSellerName && <InfoCell label="Selected Seller" value={`${vendors.selectedSellerName}${vendors.selectedSellerCode ? ` (${vendors.selectedSellerCode})` : ''}`} />}
                                    </div>
                                    {vendors.complianceNotes && (
                                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Compliance Notes</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap">{vendors.complianceNotes}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Section 3: Schedule / Timeline */}
                            {schedule && (schedule.publishDate || schedule.submissionDate || schedule.deliveryDate) && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3 shadow-sm">
                                    <SectionTitle>📅 Schedule / Timeline</SectionTitle>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <InfoCell label="Publish Date" value={schedule.publishDate ? formatDate(schedule.publishDate) : undefined} />
                                        <InfoCell label="Submission Date" value={schedule.submissionDate ? formatDate(schedule.submissionDate) : undefined} />
                                        <InfoCell label="Opening Date" value={schedule.openingDate ? formatDate(schedule.openingDate) : undefined} />
                                        <InfoCell label="Delivery Date" value={schedule.deliveryDate ? formatDate(schedule.deliveryDate) : undefined} />
                                        <InfoCell label="Validity (Days)" value={schedule.validityDays > 0 ? schedule.validityDays : undefined} />
                                        <InfoCell label="Pre-Bid Meeting" value={schedule.preBidMeeting} />
                                        {schedule.preBidMeeting && schedule.preBidDate && (
                                            <InfoCell label="Pre-Bid Date" value={formatDate(schedule.preBidDate)} />
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Section 4: Rules & Evaluation */}
                            {rules && (rules.bidType || rules.evaluation || rules.emdRequired || rules.performanceSecurity || rules.reverseAuctionIntent) && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3 shadow-sm">
                                    <SectionTitle>⚖️ Rules & Evaluation</SectionTitle>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <InfoCell label="Bid Type" value={rules.bidType} />
                                        <InfoCell label="Evaluation Method" value={rules.evaluation} />
                                        <InfoCell label="EMD Required" value={rules.emdRequired} />
                                        {rules.emdRequired && <InfoCell label="EMD Amount" value={formatCurrency(rules.emdAmount)} />}
                                        <InfoCell label="Performance Security" value={rules.performanceSecurity} />
                                        <InfoCell label="Reverse Auction Intent" value={rules.reverseAuctionIntent} />
                                        {rules.reverseAuctionIntent && (
                                            <>
                                                <InfoCell label="Start Price" value={formatCurrency(rules.startPrice)} />
                                                <InfoCell label="Reserve Price" value={formatCurrency(rules.reservePrice)} />
                                                <InfoCell label="Min Decrement" value={formatCurrency(rules.minimumDecrement)} />
                                                <InfoCell label="Auto Extension" value={rules.autoExtension} />
                                                <InfoCell label="Hide Vendor Identity" value={rules.hideVendorIdentity} />
                                            </>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Section 5: Tender Details (if applicable) */}
                            {tender && (tender.tenderNumber || tender.deliveryLocation || tender.scopeOfWork || tender.paymentTerms || tender.contactName) && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3 shadow-sm">
                                    <SectionTitle>📝 Tender Details</SectionTitle>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <InfoCell label="Tender Number" value={tender.tenderNumber} />
                                        <InfoCell label="Tender Type" value={tender.tenderType} />
                                        <InfoCell label="Tender Mode" value={tender.tenderMode} />
                                        <InfoCell label="Visibility" value={tender.visibility} />
                                        <InfoCell label="Delivery Location" value={tender.deliveryLocation} />
                                        <InfoCell label="Delivery Type" value={tender.deliveryType} />
                                        <InfoCell label="Delivery Timeline" value={tender.deliveryTimeline} />
                                        <InfoCell label="Installation Required" value={tender.installationRequired} />
                                        <InfoCell label="Training Required" value={tender.trainingRequired} />
                                        <InfoCell label="Currency" value={tender.currency} />
                                        <InfoCell label="Price Type" value={tender.priceType} />
                                        <InfoCell label="Tax Type" value={tender.taxType} />
                                        <InfoCell label="GST Included" value={tender.gstIncluded} />
                                        <InfoCell label="GST Rate" value={tender.gstRate} />
                                        <InfoCell label="Payment Terms" value={tender.paymentTerms} />
                                    </div>
                                    {tender.shortDescription && (
                                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Short Description</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap">{tender.shortDescription}</p>
                                        </div>
                                    )}
                                    {tender.scopeOfWork && (
                                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Scope of Work</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap">{tender.scopeOfWork}</p>
                                        </div>
                                    )}
                                    {tender.specialInstructions && (
                                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Special Instructions</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap">{tender.specialInstructions}</p>
                                        </div>
                                    )}

                                    {/* Tender Evaluation Scoring */}
                                    {(tender.technicalWeightage || tender.priceWeightage || tender.evaluationMethod) && (
                                        <div className="border-t border-slate-100 pt-3">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-2">Evaluation Scoring</p>
                                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                <InfoCell label="Evaluation Method" value={tender.evaluationMethod} />
                                                <InfoCell label="Technical Weightage" value={tender.technicalWeightage} />
                                                <InfoCell label="Price Weightage" value={tender.priceWeightage} />
                                                <InfoCell label="Experience Score" value={tender.experienceScore} />
                                                <InfoCell label="Certification Score" value={tender.certificationScore} />
                                                <InfoCell label="Compliance Score" value={tender.complianceScore} />
                                            </div>
                                        </div>
                                    )}

                                    {/* Tender Dates */}
                                    {(tender.bidStartDate || tender.bidClosingDate || tender.awardDate) && (
                                        <div className="border-t border-slate-100 pt-3">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-2">Tender Timeline</p>
                                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                <InfoCell label="Bid Start Date" value={tender.bidStartDate ? formatDate(tender.bidStartDate) : undefined} />
                                                <InfoCell label="Bid Closing Date" value={tender.bidClosingDate ? formatDate(tender.bidClosingDate) : undefined} />
                                                <InfoCell label="Bid Closing Time" value={tender.bidClosingTime} />
                                                <InfoCell label="Technical Evaluation Date" value={tender.technicalEvaluationDate ? formatDate(tender.technicalEvaluationDate) : undefined} />
                                                <InfoCell label="Financial Evaluation Date" value={tender.financialEvaluationDate ? formatDate(tender.financialEvaluationDate) : undefined} />
                                                <InfoCell label="Award Date" value={tender.awardDate ? formatDate(tender.awardDate) : undefined} />
                                            </div>
                                        </div>
                                    )}

                                    {/* Tender Preferences */}
                                    {(tender.startupPreference || tender.shgPreference || tender.womenOwnedPreference || tender.gstMandatory || tender.panMandatory || tender.requiredCertifications) && (
                                        <div className="border-t border-slate-100 pt-3">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-2">Eligibility & Preferences</p>
                                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                <InfoCell label="Startup Preference" value={tender.startupPreference} />
                                                <InfoCell label="SHG Preference" value={tender.shgPreference} />
                                                <InfoCell label="Women-Owned Preference" value={tender.womenOwnedPreference} />
                                                <InfoCell label="GST Mandatory" value={tender.gstMandatory} />
                                                <InfoCell label="PAN Mandatory" value={tender.panMandatory} />
                                                <InfoCell label="Required Certifications" value={tender.requiredCertifications} />
                                            </div>
                                        </div>
                                    )}

                                    {/* Contact Info */}
                                    {(tender.contactName || tender.contactEmail) && (
                                        <div className="border-t border-slate-100 pt-3">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400 mb-2">Contact Information</p>
                                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                                <InfoCell label="Contact Name" value={tender.contactName} />
                                                <InfoCell label="Contact Email" value={tender.contactEmail} />
                                                <InfoCell label="Contact Mobile" value={tender.contactMobile} />
                                                <InfoCell label="Contact Phone" value={tender.contactPhone} />
                                                <InfoCell label="Department Contact" value={tender.departmentContact} />
                                                <InfoCell label="Escalation Contact" value={tender.escalationContact} />
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Section 6: Approval */}
                            {approval && (approval.workflow || approval.approver || approval.notes) && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3 shadow-sm">
                                    <SectionTitle>✅ Approval Configuration</SectionTitle>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <InfoCell label="Workflow" value={approval.workflow} />
                                        <InfoCell label="Approver" value={approval.approver} />
                                    </div>
                                    {approval.notes && (
                                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Approval Notes</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap">{approval.notes}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Section 7: Items from payload */}
                            {payloadItems && payloadItems.length > 0 && (() => {
                                const isBOQ = payload?.basics?.whatAreYouBuying === 'BOQ';
                                if (isBOQ) {
                                    return (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3 shadow-sm">
                                            <SectionTitle>📦 Line Items ({payloadItems.length})</SectionTitle>
                                            <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left">Item</th>
                                                            <th className="px-3 py-2 text-left w-20">Qty</th>
                                                            <th className="px-3 py-2 text-left w-20">Unit</th>
                                                            <th className="px-3 py-2 text-right w-28">Unit Price</th>
                                                            <th className="px-3 py-2 text-right w-20">GST%</th>
                                                            <th className="px-3 py-2 text-right w-28">Total</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {payloadItems.map((item, idx) => {
                                                            const qty = Number(item.quantity || 0);
                                                            const price = Number(item.unitPrice || item.estimatedUnitPrice || 0);
                                                            const gst = Number(item.gst || 0);
                                                            const lineTotal = qty * price * (1 + gst / 100);
                                                            return (
                                                                <tr key={idx} className="hover:bg-slate-50/60 animate-fadeIn">
                                                                    <td className="px-3 py-2 font-bold text-slate-900 text-wrap-anywhere">
                                                                        {item.name || item.itemName || 'Unnamed'}
                                                                        {(item.specification || item.technicalSpecification || item.description) && (
                                                                            <p className="mt-0.5 text-[10px] font-semibold text-slate-500 text-wrap-anywhere">
                                                                                {item.specification || item.technicalSpecification || item.description}
                                                                            </p>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2 font-bold text-slate-900">{qty}</td>
                                                                    <td className="px-3 py-2 font-bold text-slate-700">{item.unit || item.unitOfMeasure}</td>
                                                                    <td className="px-3 py-2 text-right font-bold text-slate-900">{formatCurrency(price)}</td>
                                                                    <td className="px-3 py-2 text-right font-bold text-slate-700">{gst > 0 ? `${gst}%` : '-'}</td>
                                                                    <td className="px-3 py-2 text-right font-black text-slate-900">{formatCurrency(lineTotal)}</td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                    <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                                        <tr>
                                                            <td colSpan={5} className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Grand Total</td>
                                                            <td className="px-3 py-2 text-right text-sm font-black text-[#12335f]">{formatCurrency(requirement.estimatedValue)}</td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                } else {
                                    return (
                                        <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3 shadow-sm">
                                            <SectionTitle>📦 Line Items ({payloadItems.length})</SectionTitle>
                                            <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                                                <table className="w-full text-xs">
                                                    <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                        <tr>
                                                            <th className="px-3 py-2 text-left">Item Name</th>
                                                            <th className="px-3 py-2 text-left">Description</th>
                                                            <th className="px-3 py-2 text-left w-16">Qty</th>
                                                            <th className="px-3 py-2 text-left w-16">Unit</th>
                                                            <th className="px-3 py-2 text-left w-24">HSN/SAC</th>
                                                            <th className="px-3 py-2 text-left w-28">Pref. Brand</th>
                                                            <th className="px-3 py-2 text-left w-20">Flexible?</th>
                                                            <th className="px-3 py-2 text-left w-36">Technical Specs</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100">
                                                        {payloadItems.map((item, idx) => {
                                                            const hsn = item.hsn_sac_code || item.specifications?.hsn_sac_code || '—';
                                                            const brandPref = item.brand_preference || item.specifications?.brand_preference || '—';
                                                            const brandFlex = item.brand_flexible || item.specifications?.brand_flexible || 'Yes';
                                                            const specFile = item.specificationFileName || item.specifications?.specificationFileName || '';
                                                            const fileId = item.fileAssetId || item.specifications?.fileAssetId || null;
                                                            return (
                                                                <tr key={idx} className="hover:bg-slate-50/60 align-middle">
                                                                    <td className="px-3 py-2 font-bold text-slate-900 text-wrap-anywhere">
                                                                        {item.name || item.itemName || 'Unnamed'}
                                                                    </td>
                                                                    <td className="px-3 py-2 text-slate-500 text-wrap-anywhere font-medium">
                                                                        {item.specification || item.description || '—'}
                                                                    </td>
                                                                    <td className="px-3 py-2 font-bold text-slate-900">{item.quantity}</td>
                                                                    <td className="px-3 py-2 font-bold text-slate-700">{item.unit || item.unitOfMeasure}</td>
                                                                    <td className="px-3 py-2 font-medium text-slate-500">{hsn}</td>
                                                                    <td className="px-3 py-2 font-medium text-slate-750">{brandPref}</td>
                                                                    <td className="px-3 py-2 font-bold">
                                                                        {brandFlex === 'No' ? (
                                                                            <span className="text-amber-605 bg-amber-50/10 border border-amber-200/30 px-1.5 py-0.5 rounded text-[9px] uppercase font-black">No</span>
                                                                        ) : (
                                                                            <span className="text-emerald-700 bg-emerald-50/10 border border-emerald-250/20 px-1.5 py-0.5 rounded text-[9px] uppercase font-black">Yes</span>
                                                                        )}
                                                                    </td>
                                                                    <td className="px-3 py-2">
                                                                        {specFile && fileId ? (
                                                                            <a
                                                                                href={`/api/files/${fileId}/view`}
                                                                                target="_blank"
                                                                                rel="noopener noreferrer"
                                                                                className="inline-flex items-center text-[#12335f] hover:underline gap-1 text-[11px] font-bold"
                                                                            >
                                                                                <FileText className="h-3.5 w-3.5 shrink-0" />
                                                                                <span className="truncate max-w-[120px]" title={specFile}>
                                                                                    {specFile}
                                                                                </span>
                                                                            </a>
                                                                        ) : (
                                                                            <span className="text-slate-400">—</span>
                                                                        )}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                    <tfoot className="bg-slate-50 border-t border-slate-200">
                                                        <tr>
                                                            <td colSpan={7} className="px-3 py-2.5 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Estimated Sourcing Budget</td>
                                                            <td className="px-3 py-2.5 text-right text-xs font-black text-[#12335f]">{formatCurrency(requirement.estimatedValue)}</td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        </div>
                                    );
                                }
                            })()}

                            {/* Section 8: Consignee Allocation */}
                            {payloadConsignees && payloadConsignees.length > 0 && payloadConsignees.some(c => c.name || c.location) && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3 shadow-sm">
                                    <SectionTitle>🚚 Consignee Allocation</SectionTitle>
                                    <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                                        <table className="w-full text-xs">
                                            <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Consignee</th>
                                                    <th className="px-3 py-2 text-left">Location</th>
                                                    <th className="px-3 py-2 text-left">Contact</th>
                                                    <th className="px-3 py-2 text-right">Quantity</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {payloadConsignees.map((c, idx) => (
                                                    <tr key={idx} className="hover:bg-slate-50/60">
                                                        <td className="px-3 py-2 font-bold text-slate-900 text-wrap-anywhere">{c.name || '-'}</td>
                                                        <td className="px-3 py-2 font-bold text-slate-700 text-wrap-anywhere">{c.location || '-'}</td>
                                                        <td className="px-3 py-2 font-bold text-slate-700 text-wrap-anywhere">{c.contact || '-'}</td>
                                                        <td className="px-3 py-2 text-right font-black text-slate-900">{c.quantity || '-'}</td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Section 9: Documents */}
                            {payloadDocuments && payloadDocuments.length > 0 && payloadDocuments.some(d => d.name || d.fileName) && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3 shadow-sm">
                                    <SectionTitle>📄 Attached Documents</SectionTitle>
                                    <div className="space-y-2">
                                        {payloadDocuments.map((doc, idx) => (
                                            <div key={idx} className="flex items-start gap-3 rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                                <FileText className="h-4 w-4 shrink-0 mt-0.5 text-[#12335f]" />
                                                <div className="min-w-0 flex-1">
                                                    <p className="text-xs font-black text-slate-900 text-wrap-anywhere">{doc.name || 'Untitled Document'}</p>
                                                    {doc.fileName && <p className="mt-0.5 text-[10px] font-semibold text-slate-500 text-wrap-anywhere">File: {doc.fileName}</p>}
                                                    <div className="flex flex-wrap gap-2 mt-1 text-[9px] font-bold text-slate-400">
                                                        {doc.requirement && <span>Requirement: {doc.requirement}</span>}
                                                        {doc.version && <span>v{doc.version}</span>}
                                                        {doc.size && <span>{(Number(doc.size) / 1024).toFixed(1)} KB</span>}
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </>
                    ) : (
                        /* ============ FALLBACK: No payload — use parsed description + DB items ============ */
                        <>
                            {requirement.description && (
                                <Field label="Description">
                                    <p className="rounded-lg border border-slate-100 bg-slate-50/75 p-3 text-xs font-semibold text-slate-700 text-wrap-anywhere whitespace-pre-wrap">
                                        {requirement.description}
                                    </p>
                                </Field>
                            )}
                        </>
                    )}

                    {/* Direct Purchase Checkout Details (always shown if DP present) */}
                    {dp && (
                        <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-4 shadow-sm">
                            <div className="flex items-center justify-between border-b border-slate-150 pb-2">
                                <h3 className="text-xs font-black text-[#12335f] uppercase tracking-wider">Direct Purchase Checkout Details</h3>
                                <span className="text-[10px] font-black text-[#c86413] bg-[#c86413]/5 border border-[#c86413]/10 px-2 py-0.5 rounded">PO Ref: {dp.purchaseNumber}</span>
                            </div>
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {dp.department && <InfoCell label="Department" value={dp.department} />}
                                {dp.budgetHead && <InfoCell label="Budget Head" value={dp.budgetHead} />}
                                {dp.costCenter && <InfoCell label="Cost Center" value={dp.costCenter} />}
                                {dp.requiredDeliveryDate && <InfoCell label="Required Delivery Date" value={formatDate(dp.requiredDeliveryDate)} />}
                                {dp.seller && (
                                    <div className="rounded-lg border border-slate-100 bg-white p-2.5 shadow-sm">
                                        <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Seller</p>
                                        <p className="mt-0.5 text-xs font-black text-slate-800">
                                            {dp.seller.name}
                                            {dp.seller.email && <span className="block text-[9px] text-slate-400 font-bold lowercase">{dp.seller.email}</span>}
                                            {dp.seller.mobile && <span className="block text-[9px] text-slate-400 font-bold">{dp.seller.mobile}</span>}
                                        </p>
                                    </div>
                                )}
                            </div>
                            {dp.justification && (
                                <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Justification</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap">{dp.justification}</p>
                                </div>
                            )}
                            {dp.deliveryAddressText && (
                                <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Delivery Address</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-750 whitespace-pre-wrap leading-relaxed">{dp.deliveryAddressText}</p>
                                </div>
                            )}
                            {dp.deliveryInstructions && (
                                <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Delivery Instructions</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{dp.deliveryInstructions}</p>
                                </div>
                            )}
                            {dp.remarks && (
                                <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                    <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Remarks</p>
                                    <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap">{dp.remarks}</p>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Procurement Method + Value + Date (always shown) */}
                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <Field label="Procurement Method">
                            <p className="text-sm font-bold text-slate-900">
                                {requirement.canonicalMethod ? labelForCanonical(requirement.canonicalMethod) : (PROCUREMENT_METHOD_LABELS[requirement.procurementMethod] || requirement.procurementMethod)}
                            </p>
                        </Field>
                        <Field label="Estimated Value">
                            <p className="text-sm font-bold text-slate-900">{formatCurrency(requirement.estimatedValue)}</p>
                        </Field>
                        <Field label="Required By">
                            <p className="text-sm font-bold text-slate-900">{formatDate(requirement.requiredBy)}</p>
                        </Field>
                    </div>

                    {/* Fallback DB line items (when no payload) */}
                    {!payload && (
                        <Field label="Line Items">
                            {requirement.items?.length ? (
                                <div className="overflow-hidden rounded-lg border border-slate-200">
                                    <table className="w-full text-xs">
                                        <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                            <tr>
                                                <th className="px-3 py-2 text-left">Item</th>
                                                <th className="px-3 py-2 text-left w-20">Qty</th>
                                                <th className="px-3 py-2 text-left w-20">UoM</th>
                                                <th className="px-3 py-2 text-right w-32">Unit Price</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-100">
                                            {requirement.items.map(item => (
                                                <tr key={item.id}>
                                                    <td className="px-3 py-2 font-bold text-slate-900 text-wrap-anywhere">
                                                        {item.itemName}
                                                        {item.description && <p className="mt-0.5 text-[10px] font-semibold text-slate-500 text-wrap-anywhere">{item.description}</p>}
                                                    </td>
                                                    <td className="px-3 py-2 font-bold text-slate-900">{item.quantity}</td>
                                                    <td className="px-3 py-2 font-bold text-slate-700">{item.unitOfMeasure}</td>
                                                    <td className="px-3 py-2 text-right font-bold text-slate-900">{formatCurrency(item.estimatedUnitPrice)}</td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            ) : (
                                <p className="text-xs font-semibold text-slate-500">No line items recorded.</p>
                            )}
                        </Field>
                    )}

                    {requirement.tenders && requirement.tenders.length > 0 && (
                        <Field label="Spawned Tenders">
                            <div className="space-y-2">
                                {requirement.tenders.map(t => (
                                    <div key={t.id} className="rounded-lg border border-indigo-200 bg-indigo-50 p-3 text-xs">
                                        <p className="font-black text-indigo-700 text-wrap-anywhere">
                                            {t.tenderId} · {t.title}
                                        </p>
                                        <p className="mt-0.5 text-[10px] font-bold uppercase text-indigo-600">{t.status}</p>
                                    </div>
                                ))}
                            </div>
                        </Field>
                    )}

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-2 text-[10px] font-bold uppercase text-slate-400">
                        <p>Created: {formatDateTime(requirement.createdAt)}</p>
                        <p>Updated: {formatDateTime(requirement.updatedAt)}</p>
                    </div>

                    {requirement.status === 'DRAFT' && (
                        <div className="flex justify-end border-t border-slate-100 pt-4">
                            <Button onClick={submit} disabled={submitMut.isPending} className="bg-[#12335f] text-white">
                                {submitMut.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
                                Submit for review
                            </Button>
                        </div>
                    )}
                </div>
            )}
        </Modal>
    );
}

/* ---------- Create modal ---------- */

function RequirementCreator({ onClose }: { onClose: () => void }) {
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [method, setMethod] = useState<ProcurementMethod>('TENDER');
    const [estimatedValue, setEstimatedValue] = useState('');
    const [requiredBy, setRequiredBy] = useState('');
    const [items, setItems] = useState<NewRequirementItemPayload[]>([
        { itemName: '', quantity: 1, unitOfMeasure: 'pcs' }
    ]);
    const createMut = useCreateRequirement();

    const updateItem = (idx: number, patch: Partial<NewRequirementItemPayload>) =>
        setItems(prev => prev.map((it, i) => (i === idx ? { ...it, ...patch } : it)));
    const addItem = () => setItems(prev => [...prev, { itemName: '', quantity: 1, unitOfMeasure: 'pcs' }]);
    const removeItem = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx));

    const submit = async () => {
        const cleanItems = items
            .filter(it => it.itemName.trim() && Number(it.quantity) > 0 && it.unitOfMeasure.trim())
            .map(it => ({
                ...it,
                quantity: Number(it.quantity),
                estimatedUnitPrice: it.estimatedUnitPrice ? Number(it.estimatedUnitPrice) : undefined
            }));
        await runWithToast(
            () =>
                createMut.mutateAsync({
                    title,
                    description: description || undefined,
                    procurementMethod: method,
                    estimatedValue: estimatedValue ? Number(estimatedValue) : undefined,
                    requiredBy: requiredBy || undefined,
                    items: cleanItems.length > 0 ? cleanItems : undefined
                }),
            { loading: 'Creating requirement...', success: 'Requirement created', error: err => (err instanceof Error ? err.message : 'Create failed') }
        );
        onClose();
    };

    const valid = title.trim().length >= 3;

    return (
        <Modal title="New Requirement" onClose={onClose} wide>
            <div className="space-y-3">
                <Field label="Title">
                    <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={200} placeholder="e.g. Office furniture for new building" />
                </Field>
                <Field label="Description">
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                        placeholder="Specifications, scope, context..."
                    />
                </Field>
                <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                    <Field label="Procurement Method">
                        <Select value={method} onChange={e => setMethod(e.target.value as ProcurementMethod)}>
                            <option value="DIRECT_PURCHASE">Direct Purchase</option>
                            <option value="RFQ">RFQ</option>
                            <option value="TENDER">Tender</option>
                            <option value="REVERSE_AUCTION">Reverse Auction</option>
                            <option value="RATE_CONTRACT">Rate Contract</option>
                        </Select>
                    </Field>
                    <Field label="Estimated Value (₹)">
                        <Input value={estimatedValue} onChange={e => setEstimatedValue(e.target.value)} type="number" min="0" placeholder="0" />
                    </Field>
                    <Field label="Required By">
                        <Input value={requiredBy} onChange={e => setRequiredBy(e.target.value)} type="date" />
                    </Field>
                </div>

                <div className="space-y-2">
                    <div className="flex items-center justify-between">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Line Items</p>
                        <Button type="button" variant="outline" onClick={addItem} className="h-8 text-[10px] font-black uppercase">
                            <Plus className="mr-1 h-3 w-3" /> Add Item
                        </Button>
                    </div>
                    <div className="space-y-2">
                        {items.map((item, idx) => (
                            <div key={idx} className="rounded-lg border border-slate-200 bg-slate-50 p-3 space-y-2">
                                <div className="grid grid-cols-1 gap-2 md:grid-cols-[2fr_1fr_1fr_1fr_auto]">
                                    <Input
                                        value={item.itemName}
                                        onChange={e => updateItem(idx, { itemName: e.target.value })}
                                        placeholder="Item name"
                                    />
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.001"
                                        value={item.quantity}
                                        onChange={e => updateItem(idx, { quantity: Number(e.target.value) })}
                                        placeholder="Qty"
                                    />
                                    <Input
                                        value={item.unitOfMeasure}
                                        onChange={e => updateItem(idx, { unitOfMeasure: e.target.value })}
                                        placeholder="UoM"
                                    />
                                    <Input
                                        type="number"
                                        min="0"
                                        step="0.01"
                                        value={item.estimatedUnitPrice ?? ''}
                                        onChange={e => updateItem(idx, { estimatedUnitPrice: e.target.value ? Number(e.target.value) : undefined })}
                                        placeholder="Unit ₹"
                                    />
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => removeItem(idx)}
                                        disabled={items.length === 1}
                                        className="h-10 w-10 p-0 text-red-600"
                                        aria-label="Remove item"
                                    >
                                        <Trash2 className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <Input
                                    value={item.description ?? ''}
                                    onChange={e => updateItem(idx, { description: e.target.value })}
                                    placeholder="Description (optional)"
                                />
                            </div>
                        ))}
                    </div>
                </div>
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
            <div
                className={cn(
                    'w-full overflow-hidden rounded-xl bg-white shadow-xl animate-in zoom-in-95 duration-200',
                    wide ? 'max-w-3xl' : 'max-w-lg'
                )}
            >
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

function Metric({
    label,
    value,
    hint,
    tone,
    icon: Icon,
    loading,
    onClick,
    isActive
}: {
    label: string;
    value: number;
    hint: string;
    tone: 'positive' | 'negative' | 'warning' | 'neutral';
    icon: any;
    loading?: boolean;
    onClick?: () => void;
    isActive?: boolean;
}) {
    const toneStyle = {
        positive: 'bg-emerald-600',
        negative: 'bg-red-600',
        warning: 'bg-amber-600',
        neutral: 'bg-[#12335f]'
    } as const;
    return (
        <Card 
            className={cn(
                "transition duration-200 border-slate-200 select-none", 
                onClick && "cursor-pointer hover:shadow-md hover:border-[#12335f]/40 hover:-translate-y-0.5 transform active:scale-95",
                isActive && "ring-2 ring-[#12335f] border-transparent bg-[#12335f]/5"
            )}
            onClick={onClick}
        >
            <CardContent className="flex items-center justify-between p-4">
                <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                        {isActive && <Badge className="bg-[#12335f] text-white px-1 py-0 text-[8px] rounded uppercase font-black tracking-wider">Filtered</Badge>}
                    </div>
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
