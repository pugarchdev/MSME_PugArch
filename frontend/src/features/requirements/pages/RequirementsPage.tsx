/**
 * RequirementsPage - buyer's procurement demand register.
 *
 * Lists all requirements with their status, lets the buyer create new ones
 * with line items, edit drafts, and submit for approval. Each row's
 * Requirement ID is clickable and opens the detail drawer with full item
 * breakdown and any tenders that have already been spun off from it.
 */

import { useMemo, useState } from 'react';
import {
    ClipboardCheck,
    FileText,
    Loader2,
    Plus,
    RefreshCw,
    Send,
    Trash2,
    X
} from 'lucide-react';
import { Card, CardContent, Badge } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input, Select } from '../../../components/ui/input';
import { Pagination } from '../../shared/Pagination';
import { PageToolbar } from '../../shared/PageToolbar';
import { ListSkeleton, MetricCardSkeleton } from '../../../components/ui/skeleton';
import { EmptyState, InlineError } from '../../shared/FeatureStates';
import { formatCurrency, formatDate, formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { cn } from '../../../lib/utils';
import {
    useCreateRequirement,
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

export default function RequirementsPage() {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [q, setQ] = useState('');
    const [status, setStatus] = useState('');
    const [openId, setOpenId] = useState<number | null>(null);
    const [creating, setCreating] = useState(false);

    const list = useRequirements({ q: q || undefined, status: status || undefined, page, pageSize });

    const records = list.data?.records || [];
    const total = list.data?.total || 0;

    const counters = useMemo(() => {
        const drafts = records.filter(r => r.status === 'DRAFT').length;
        const submitted = records.filter(r => r.status === 'SUBMITTED' || r.status === 'UNDER_REVIEW').length;
        const approved = records.filter(r => r.status === 'APPROVED' || r.status === 'CONVERTED_TO_TENDER').length;
        return { drafts, submitted, approved };
    }, [records]);

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
                    <Button onClick={() => setCreating(true)} className="bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                        <Plus className="mr-2 h-4 w-4" /> New Requirement
                    </Button>
                </div>
            </div>

            {list.isLoading && !list.data ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[1, 2, 3, 4].map(i => <MetricCardSkeleton key={i} />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Metric label="Total" value={total} hint="In current view" tone="neutral" icon={ClipboardCheck} />
                    <Metric label="Drafts" value={counters.drafts} hint="Not yet submitted" tone="warning" icon={FileText} />
                    <Metric label="In Pipeline" value={counters.submitted} hint="Submitted / under review" tone="warning" icon={Send} />
                    <Metric label="Approved" value={counters.approved} hint="Ready to procure" tone="positive" icon={ClipboardCheck} />
                </div>
            )}

            <PageToolbar
                eyebrow="Filters"
                search={q}
                onSearchChange={setQ}
                searchPlaceholder="Search by title, description, ID"
                filters={[
                    {
                        kind: 'select',
                        value: status,
                        onChange: setStatus,
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
                    }
                ]}
                onReset={() => {
                    setQ('');
                    setStatus('');
                }}
            />

            {list.error && (
                <InlineError
                    message={list.error instanceof Error ? list.error.message : 'Failed to load requirements'}
                    onRetry={() => list.refetch()}
                />
            )}

            {list.isLoading && !list.data ? (
                <ListSkeleton rows={4} />
            ) : records.length === 0 ? (
                <EmptyState title="No requirements yet" description="Create your first requirement to start a procurement." />
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[920px] text-sm">
                                <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left w-12">#</th>
                                        <th className="px-4 py-2.5 text-left w-40">Requirement ID</th>
                                        <th className="px-4 py-2.5 text-left">Title</th>
                                        <th className="px-4 py-2.5 text-left w-32">Method</th>
                                        <th className="px-4 py-2.5 text-left w-32">Status</th>
                                        <th className="px-4 py-2.5 text-right w-32">Estimated Value</th>
                                        <th className="px-4 py-2.5 text-left w-44">Required By</th>
                                        <th className="px-4 py-2.5 text-left w-44">Updated</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {records.map((req, idx) => (
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
                                                    {PROCUREMENT_METHOD_LABELS[req.procurementMethod] || req.procurementMethod}
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

/* ---------- Detail drawer ---------- */

function RequirementDetail({ id, onClose }: { id: number; onClose: () => void }) {
    const detail = useRequirement(id);
    const submitMut = useSubmitRequirement();
    const requirement = detail.data;

    const submit = () => {
        if (!requirement) return;
        runWithToast(() => submitMut.mutateAsync(requirement.id), {
            loading: 'Submitting...',
            success: 'Requirement submitted for review',
            error: 'Submit failed'
        }).then(() => detail.refetch());
    };

    return (
        <Modal title={requirement ? `Requirement · ${requirement.requirementNumber}` : 'Requirement'} onClose={onClose} wide>
            {detail.isLoading && !requirement ? (
                <ListSkeleton rows={3} />
            ) : !requirement ? (
                <EmptyState title="Requirement not found" />
            ) : (
                <div className="space-y-4">
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

                    {requirement.description && (
                        <Field label="Description">
                            <p className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs font-semibold text-slate-700 text-wrap-anywhere">
                                {requirement.description}
                            </p>
                        </Field>
                    )}

                    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                        <Field label="Procurement Method">
                            <p className="text-sm font-bold text-slate-900">
                                {PROCUREMENT_METHOD_LABELS[requirement.procurementMethod] || requirement.procurementMethod}
                            </p>
                        </Field>
                        <Field label="Estimated Value">
                            <p className="text-sm font-bold text-slate-900">{formatCurrency(requirement.estimatedValue)}</p>
                        </Field>
                        <Field label="Required By">
                            <p className="text-sm font-bold text-slate-900">{formatDate(requirement.requiredBy)}</p>
                        </Field>
                    </div>

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
                                                    {item.description && (
                                                        <p className="mt-0.5 text-[10px] font-semibold text-slate-500 text-wrap-anywhere">
                                                            {item.description}
                                                        </p>
                                                    )}
                                                </td>
                                                <td className="px-3 py-2 font-bold text-slate-900">{item.quantity}</td>
                                                <td className="px-3 py-2 font-bold text-slate-700">{item.unitOfMeasure}</td>
                                                <td className="px-3 py-2 text-right font-bold text-slate-900">
                                                    {formatCurrency(item.estimatedUnitPrice)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <p className="text-xs font-semibold text-slate-500">No line items recorded.</p>
                        )}
                    </Field>

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
    icon: Icon
}: {
    label: string;
    value: number;
    hint: string;
    tone: 'positive' | 'negative' | 'warning' | 'neutral';
    icon: any;
}) {
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
