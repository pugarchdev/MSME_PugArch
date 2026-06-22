/**
 * ApprovalQueuePage — unified inbox for all pending approvals across
 * tenders, POs, carts, and direct purchases.
 *
 * Route: /approvals
 * Access: ORG_ADMIN, PROCUREMENT_OFFICER, FINANCE_OFFICER
 */
import { useMemo, useState } from 'react';
import { Building, CalendarClock, CheckCircle2, ChevronDown, Clock, FileText, History, Inbox, MapPin, MessageCircle, Package, Phone, Mail, RefreshCw, Shield, ShieldCheck, Truck, UserCheck, X, XCircle } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { Loader2 } from '@/components/ui/loader';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { useOrgRole } from '../../../hooks/useOrgRole';
import { EntityIdLink } from '../../shared/EntityIdLink';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate, formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { ApprovalTrail } from '../components/ApprovalTrail';
import {
    useApprovalHistory,
    useApproveApproval,
    useClarifyApproval,
    usePendingApprovals,
    useRejectApproval
} from '../hooks';
import type { ApprovalDecision, ApprovalDto, ApprovalEntityType, ApprovalStage } from '../api';

const STAGE_LABEL: Record<ApprovalStage, string> = {
    DEPARTMENT_HEAD: 'Department Head',
    FINANCE_DEPT: 'Finance Department',
    PROCUREMENT_HEAD: 'Procurement Head'
};

const ENTITY_LABEL: Record<ApprovalEntityType, string> = {
    tender: 'Tender',
    purchase_order: 'Purchase Order',
    cart: 'Cart',
    direct_purchase: 'Direct Purchase'
};

const DECISION_TONE: Record<ApprovalDecision, string> = {
    PENDING: 'border-amber-200 bg-amber-50 text-amber-700',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    REJECTED: 'border-red-200 bg-red-50 text-red-700',
    SENT_FOR_CLARIFICATION: 'border-blue-200 bg-blue-50 text-blue-700'
};

export default function ApprovalQueuePage() {
    const { orgRole, orgStatus, isApproved, loading: orgLoading, isOrgAdmin, isProcurementOfficer, isFinanceOfficer } = useOrgRole();
    const allowed = isOrgAdmin || isProcurementOfficer || isFinanceOfficer;
    const canLoadApprovals = Boolean(orgRole && isApproved && allowed);
    const pending = usePendingApprovals(canLoadApprovals);
    const history = useApprovalHistory(canLoadApprovals);
    const approveMut = useApproveApproval();
    const rejectMut = useRejectApproval();
    const clarifyMut = useClarifyApproval();

    const [tab, setTab] = useState<'pending' | 'history'>('pending');
    const [stageFilter, setStageFilter] = useState<'ALL' | ApprovalStage>('ALL');
    const [actionTarget, setActionTarget] = useState<{ type: 'reject' | 'clarify'; approval: ApprovalDto } | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [processedIds, setProcessedIds] = useState<Set<number>>(() => new Set());
    const [detailTarget, setDetailTarget] = useState<ApprovalDto | null>(null);
    const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());

    const pendingItems = (pending.data || []).filter(p => !processedIds.has(p.id));
    const filteredPendingItems = stageFilter === 'ALL'
        ? pendingItems
        : pendingItems.filter(p => p.stage === stageFilter);
    const historyItems = history.data || [];

    const counts = useMemo(() => {
        return {
            pending: pendingItems.length,
            history: historyItems.length,
            byStage: {
                DEPARTMENT_HEAD: pendingItems.filter(p => p.stage === 'DEPARTMENT_HEAD').length,
                FINANCE_DEPT: pendingItems.filter(p => p.stage === 'FINANCE_DEPT').length,
                PROCUREMENT_HEAD: pendingItems.filter(p => p.stage === 'PROCUREMENT_HEAD').length
            }
        };
    }, [historyItems.length, pendingItems]);

    if (orgLoading) {
        return <LoadingState label="Checking organisation approval access..." />;
    }

    if (!orgRole) {
        return (
            <div className="space-y-4">
                <ApprovalHeader onRefresh={() => { pending.refetch(); history.refetch(); }} refreshing={false} />
                <AccessState
                    icon={Shield}
                    title="Organisation role required"
                    description="Approval queues are organisation workflows. Join or create an approved organisation before using procurement approvals."
                />
            </div>
        );
    }

    if (!isApproved) {
        return (
            <div className="space-y-4">
                <ApprovalHeader onRefresh={() => { pending.refetch(); history.refetch(); }} refreshing={false} orgRole={orgRole} />
                <AccessState
                    icon={ShieldCheck}
                    title="Organisation approval pending"
                    description={`Your organisation status is ${orgStatus?.organization?.verificationStatus || 'not approved yet'}. Approval queues unlock after organisation approval.`}
                />
            </div>
        );
    }

    if (!allowed) {
        return (
            <div className="space-y-4">
                <ApprovalHeader onRefresh={() => { pending.refetch(); history.refetch(); }} refreshing={false} orgRole={orgRole} />
                <AccessState
                    icon={UserCheck}
                    title="No approver role assigned"
                    description={`Your current organisation role is ${orgRole.replace(/_/g, ' ')}. Pending approvals only appear for ORG ADMIN, PROCUREMENT OFFICER, or FINANCE OFFICER roles.`}
                />
            </div>
        );
    }

    const handleApprove = async (a: ApprovalDto) => {
        setProcessedIds(prev => {
            const next = new Set(prev);
            next.add(a.id);
            return next;
        });
        try {
            await runWithToast(() => approveMut.mutateAsync({ id: a.id }), {
                loading: 'Approving...',
                success: 'Approved',
                error: 'Approval failed'
            });
        } catch (err) {
            setProcessedIds(prev => {
                const next = new Set(prev);
                next.delete(a.id);
                return next;
            });
        }
    };

    const handleBulkApprove = async () => {
        if (selectedIds.size === 0) return;
        const ids = Array.from(selectedIds);
        setProcessedIds(prev => new Set([...prev, ...ids]));
        try {
            await runWithToast(() => Promise.all(ids.map(id => approveMut.mutateAsync({ id }))), {
                loading: `Approving ${ids.length} items...`,
                success: `Approved ${ids.length} items`,
                error: 'Some approvals failed'
            });
            setSelectedIds(new Set());
        } catch (err) {
            pending.refetch();
        }
    };

    return (
        <div className="space-y-4">
            <div className="brand-tricolor-strip rounded-full" />
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement · Approvals</p>
                    <h1 className="text-2xl font-black text-slate-950">Approval Queue</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Review and decide on procurement items pending your approval.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button variant="outline" onClick={() => { pending.refetch(); history.refetch(); }} className="h-10 rounded-lg text-xs font-black uppercase">
                        <RefreshCw className={`mr-2 h-4 w-4 ${pending.isFetching || history.isFetching ? 'animate-spin' : ''}`} /> Refresh
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
                <MetricCard 
                    label="Total Pending" 
                    value={counts.pending} 
                    icon={Inbox} 
                    onClick={() => { setTab('pending'); setStageFilter('ALL'); }}
                    active={tab === 'pending' && stageFilter === 'ALL'}
                />
                <MetricCard 
                    label="Department Head" 
                    value={counts.byStage.DEPARTMENT_HEAD} 
                    icon={Clock} 
                    onClick={() => { setTab('pending'); setStageFilter('DEPARTMENT_HEAD'); }}
                    active={tab === 'pending' && stageFilter === 'DEPARTMENT_HEAD'}
                />
                <MetricCard 
                    label="Finance Dept" 
                    value={counts.byStage.FINANCE_DEPT} 
                    icon={Clock} 
                    onClick={() => { setTab('pending'); setStageFilter('FINANCE_DEPT'); }}
                    active={tab === 'pending' && stageFilter === 'FINANCE_DEPT'}
                />
                <MetricCard 
                    label="Procurement Head" 
                    value={counts.byStage.PROCUREMENT_HEAD} 
                    icon={Clock} 
                    onClick={() => { setTab('pending'); setStageFilter('PROCUREMENT_HEAD'); }}
                    active={tab === 'pending' && stageFilter === 'PROCUREMENT_HEAD'}
                />
                <MetricCard 
                    label="History" 
                    value={counts.history} 
                    icon={History} 
                    onClick={() => { setTab('history'); }}
                    active={tab === 'history'}
                />
            </div>

            <div className="flex items-center gap-1 border-b border-slate-200">
                <TabButton active={tab === 'pending'} onClick={() => { setTab('pending'); setStageFilter('ALL'); }} count={pendingItems.length}>
                    <Inbox className="mr-1.5 h-3.5 w-3.5" /> Pending
                </TabButton>
                <TabButton active={tab === 'history'} onClick={() => setTab('history')} count={historyItems.length}>
                    <History className="mr-1.5 h-3.5 w-3.5" /> History
                </TabButton>
            </div>

            {tab === 'pending' ? (
                <>
                    {pendingItems.length > 0 && (
                        <div className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 shadow-sm">
                            <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                    type="checkbox" 
                                    className="h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f]"
                                    checked={pendingItems.length > 0 && selectedIds.size === pendingItems.length}
                                    onChange={(e) => {
                                        if (e.target.checked) {
                                            setSelectedIds(new Set(pendingItems.map(p => p.id)));
                                        } else {
                                            setSelectedIds(new Set());
                                        }
                                    }}
                                />
                                <span className="text-xs font-bold text-slate-700">Select All ({selectedIds.size} selected)</span>
                            </label>
                            {selectedIds.size > 0 && (
                                <div className="flex gap-2">
                                    <Button 
                                        variant="outline" 
                                        size="sm"
                                        onClick={() => setActionTarget({ type: 'bulk_reject', ids: Array.from(selectedIds) } as any)}
                                        disabled={approveMut.isPending || rejectMut.isPending}
                                        className="h-8 border-red-200 text-red-700 hover:bg-red-50 text-[10px] font-black uppercase"
                                    >
                                        <XCircle className="mr-1 h-3 w-3" /> Reject Selected
                                    </Button>
                                    <Button 
                                        size="sm"
                                        onClick={handleBulkApprove}
                                        disabled={approveMut.isPending}
                                        className="h-8 bg-emerald-600 text-white hover:bg-emerald-700 text-[10px] font-black uppercase"
                                    >
                                        {approveMut.isPending ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <CheckCircle2 className="mr-1 h-3 w-3" />}
                                        Approve Selected
                                    </Button>
                                </div>
                            )}
                        </div>
                    )}
                    <PendingList
                        items={filteredPendingItems}
                        isLoading={pending.isLoading}
                        error={pending.error}
                        expandedId={expandedId}
                        onExpand={setExpandedId}
                        onApprove={handleApprove}
                        onReject={a => setActionTarget({ type: 'reject', approval: a })}
                        onClarify={a => setActionTarget({ type: 'clarify', approval: a })}
                        approving={approveMut.isPending}
                        selectedIds={selectedIds}
                        onToggleSelect={(id) => {
                            setSelectedIds(prev => {
                                const next = new Set(prev);
                                if (next.has(id)) next.delete(id);
                                else next.add(id);
                                return next;
                            });
                        }}
                        isFiltered={stageFilter !== 'ALL'}
                        onClearFilter={() => setStageFilter('ALL')}
                        onShowDetail={setDetailTarget}
                    />
                </>
            ) : (
                <HistoryList items={historyItems} isLoading={history.isLoading} error={history.error} onShowDetail={setDetailTarget} />
            )}

            {actionTarget && (
                <ActionModal
                    type={actionTarget.type}
                    approval={actionTarget.approval}
                    onClose={() => setActionTarget(null)}
                    onReject={async (note) => {
                        if ((actionTarget as any).type === 'bulk_reject') {
                            const ids = (actionTarget as any).ids as number[];
                            setProcessedIds(prev => new Set([...prev, ...ids]));
                            try {
                                await runWithToast(() => Promise.all(ids.map(id => rejectMut.mutateAsync({ id, remarks: note }))), {
                                    loading: `Rejecting ${ids.length} items...`,
                                    success: `Rejected ${ids.length} items`,
                                    error: 'Some rejections failed'
                                });
                                setActionTarget(null);
                                setSelectedIds(new Set());
                            } catch (err) {
                                pending.refetch();
                            }
                            return;
                        }

                        const approvalId = (actionTarget as any).approval.id;
                        setProcessedIds(prev => {
                            const next = new Set(prev);
                            next.add(approvalId);
                            return next;
                        });
                        try {
                            await runWithToast(() => rejectMut.mutateAsync({ id: approvalId, remarks: note }), {
                                loading: 'Rejecting...',
                                success: 'Rejected',
                                error: 'Rejection failed'
                            });
                            setActionTarget(null);
                        } catch (err) {
                            setProcessedIds(prev => {
                                const next = new Set(prev);
                                next.delete(approvalId);
                                return next;
                            });
                        }
                    }}
                    onClarify={async (note) => {
                        const approvalId = actionTarget.approval.id;
                        setProcessedIds(prev => {
                            const next = new Set(prev);
                            next.add(approvalId);
                            return next;
                        });
                        try {
                            await runWithToast(() => clarifyMut.mutateAsync({ id: approvalId, note }), {
                                loading: 'Sending...',
                                success: 'Clarification requested',
                                error: 'Failed to send'
                            });
                            setActionTarget(null);
                        } catch (err) {
                            setProcessedIds(prev => {
                                const next = new Set(prev);
                                next.delete(approvalId);
                                return next;
                            });
                        }
                    }}
                    pending={rejectMut.isPending || clarifyMut.isPending}
                />
            )}

            {detailTarget && detailTarget.entitySummary && (
                <ProcurementDetailModal
                    approval={detailTarget}
                    summary={detailTarget.entitySummary}
                    onClose={() => setDetailTarget(null)}
                />
            )}
        </div>
    );
}

function ApprovalHeader({ onRefresh, refreshing, orgRole }: { onRefresh: () => void; refreshing: boolean; orgRole?: string | null }) {
    return (
        <>
            <div className="brand-tricolor-strip rounded-full" />
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement - Approvals</p>
                    <h1 className="text-2xl font-black text-slate-950">Approval Queue</h1>
                    <p className="mt-1 text-xs font-semibold text-slate-500">
                        Review current-stage approvals for your organisation role{orgRole ? `: ${orgRole.replace(/_/g, ' ')}` : ''}.
                    </p>
                </div>
                <Button variant="outline" onClick={onRefresh} className="h-10 rounded-lg text-xs font-black uppercase">
                    <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} /> Refresh
                </Button>
            </div>
        </>
    );
}

function AccessState({ icon: Icon, title, description }: { icon: any; title: string; description: string }) {
    return (
        <Card>
            <CardContent className="flex min-h-64 items-center justify-center p-8">
                <div className="max-w-xl text-center">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-lg bg-slate-100 text-[#12335f]">
                        <Icon className="h-6 w-6" />
                    </div>
                    <p className="mt-4 text-sm font-black uppercase tracking-widest text-slate-700">{title}</p>
                    <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{description}</p>
                </div>
            </CardContent>
        </Card>
    );
}

function MetricCard({ label, value, icon: Icon, onClick, active }: { label: string; value: string | number; icon: any; onClick?: () => void; active?: boolean }) {
    const Component = onClick ? 'button' : 'div';
    return (
        <Component 
            type={onClick ? 'button' : undefined}
            onClick={onClick}
            className={cn(
                "text-left w-full rounded-xl border bg-white shadow-sm transition-all duration-200 select-none",
                onClick ? "cursor-pointer hover:shadow-md hover:translate-y-[-1px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#12335f]" : "",
                active 
                    ? "border-[#12335f] bg-[#12335f]/5 ring-2 ring-[#12335f]/15" 
                    : "border-slate-200/80 hover:border-slate-300"
            )}
        >
            <div className="flex items-center justify-between p-4">
                <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
                </div>
                <div className={cn(
                    "flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                    active ? "bg-[#12335f] text-white" : "bg-slate-100 text-[#12335f]"
                )}>
                    <Icon className="h-5 w-5" />
                </div>
            </div>
        </Component>
    );
}

function TabButton({ active, onClick, count, children }: { active: boolean; onClick: () => void; count: number; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`inline-flex items-center px-4 py-2 text-xs font-black uppercase tracking-widest border-b-2 transition ${active ? 'border-[#12335f] text-[#12335f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
            {children}
            <span className={`ml-2 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] ${active ? 'bg-[#12335f] text-white' : 'bg-slate-200 text-slate-700'}`}>{count}</span>
        </button>
    );
}

function PendingList({ items, isLoading, error, expandedId, onExpand, onApprove, onReject, onClarify, approving, selectedIds, onToggleSelect, isFiltered, onClearFilter, onShowDetail }: {
    items: ApprovalDto[];
    isLoading: boolean;
    error: any;
    expandedId: number | null;
    onExpand: (id: number | null) => void;
    onApprove: (a: ApprovalDto) => void;
    onReject: (a: ApprovalDto) => void;
    onClarify: (a: ApprovalDto) => void;
    approving: boolean;
    selectedIds?: Set<number>;
    onToggleSelect?: (id: number) => void;
    isFiltered?: boolean;
    onClearFilter?: () => void;
    onShowDetail?: (a: ApprovalDto) => void;
}) {
    if (isLoading) return <LoadingState label="Loading pending approvals..." />;
    if (error) return <InlineError message={(error as Error).message} />;
    if (items.length === 0) {
        return (
            <Card><CardContent className="py-12">
                <EmptyState 
                    title={isFiltered ? "No matching approvals" : "Inbox empty"} 
                    description={isFiltered ? "No pending items match the selected stage filter." : "No current-stage items need your organisation role right now. Later-stage approvals appear only after earlier stages are approved."} 
                    action={isFiltered && onClearFilter ? { label: "Clear filter", onClick: onClearFilter } : undefined}
                />
            </CardContent></Card>
        );
    }

    return (
        <div className="space-y-3">
            {items.map(approval => {
                const summary = approval.entitySummary;
                const isExpanded = expandedId === approval.id;

                return (
                    <Card key={approval.id} className={`border-slate-200/80 shadow-sm transition-all ${selectedIds?.has(approval.id) ? 'ring-2 ring-[#12335f]/50' : ''}`}>
                        <CardContent className="p-0">
                            <div className="px-4 py-3 flex items-start justify-between gap-3">
                                {onToggleSelect && (
                                    <div className="pt-1">
                                        <input 
                                            type="checkbox"
                                            className="h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f] cursor-pointer"
                                            checked={selectedIds?.has(approval.id) || false}
                                            onChange={() => onToggleSelect(approval.id)}
                                        />
                                    </div>
                                )}
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {summary && (
                                            <EntityIdLink label={summary.label} id={summary.id} size="sm" onClick={() => onShowDetail?.(approval)} />
                                        )}
                                        <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-black uppercase text-slate-700">
                                            {ENTITY_LABEL[approval.entityType]}
                                        </span>
                                        <span className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black uppercase text-blue-700">
                                            Stage {approval.sequence}: {STAGE_LABEL[approval.stage]}
                                        </span>
                                    </div>
                                    {summary && (
                                        <>
                                            <p className="mt-2 text-sm font-black text-slate-900 text-wrap-anywhere">{summary.title}</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-600">
                                                Value: <span className="font-black text-slate-900">{formatCurrency(summary.value)}</span> · Created {formatRelative(summary.createdAt)}
                                            </p>
                                        </>
                                    )}
                                </div>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => onExpand(isExpanded ? null : approval.id)}
                                    className="shrink-0 h-8 rounded-lg text-[10px] font-black uppercase"
                                >
                                    <ChevronDown className={`mr-1 h-3 w-3 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                    {isExpanded ? 'Hide' : 'Trail'}
                                </Button>
                            </div>

                            {isExpanded && (
                                <div className="border-t border-slate-100 bg-slate-50/40 p-4">
                                    <ApprovalTrail entityType={approval.entityType} entityId={approval.entityId} />
                                </div>
                            )}

                            <div className="border-t border-slate-100 bg-slate-50/40 px-4 py-3 flex flex-wrap justify-end gap-2">
                                <Button
                                    variant="outline"
                                    onClick={() => onClarify(approval)}
                                    disabled={approving}
                                    className="border-blue-200 text-blue-700 hover:bg-blue-50"
                                >
                                    <MessageCircle className="mr-2 h-4 w-4" /> Clarify
                                </Button>
                                <Button
                                    variant="outline"
                                    onClick={() => onReject(approval)}
                                    disabled={approving}
                                    className="border-red-200 text-red-700 hover:bg-red-50"
                                >
                                    <XCircle className="mr-2 h-4 w-4" /> Reject
                                </Button>
                                <Button
                                    onClick={() => onApprove(approval)}
                                    disabled={approving}
                                    className="bg-emerald-600 text-white hover:bg-emerald-700"
                                >
                                    {approving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
                                    Approve
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                );
            })}
        </div>
    );
}

function HistoryList({ items, isLoading, error, onShowDetail }: { items: ApprovalDto[]; isLoading: boolean; error: any; onShowDetail?: (a: ApprovalDto) => void }) {
    if (isLoading) return <LoadingState label="Loading approval history..." />;
    if (error) return <InlineError message={(error as Error).message} />;
    if (items.length === 0) {
        return (
            <Card><CardContent className="py-12">
                <EmptyState title="No history" description="No past approvals to show." />
            </CardContent></Card>
        );
    }

    return (
        <Card className="border-slate-200/80 shadow-sm">
            <CardContent className="p-0">
                <div className="overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                        <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                            <tr>
                                <th className="px-4 py-2.5 text-left">Entity</th>
                                <th className="px-4 py-2.5 text-left w-44">Stage</th>
                                <th className="px-4 py-2.5 text-left w-32">Decision</th>
                                <th className="px-4 py-2.5 text-left w-44">Approver</th>
                                <th className="px-4 py-2.5 text-left w-44">Decided</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                            {items.map(a => (
                                <tr key={a.id} className="hover:bg-slate-50/60">
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            {a.entitySummary && (
                                                <EntityIdLink label={a.entitySummary.label} id={a.entitySummary.id} size="sm" onClick={() => onShowDetail?.(a)} />
                                            )}
                                            <span className="text-[10px] font-black uppercase text-slate-500">
                                                {ENTITY_LABEL[a.entityType]}
                                            </span>
                                        </div>
                                        {a.entitySummary && (
                                            <p className="mt-1 text-xs font-semibold text-slate-700 text-wrap-anywhere">{a.entitySummary.title}</p>
                                        )}
                                    </td>
                                    <td className="px-4 py-3 text-xs font-black uppercase text-slate-700">{STAGE_LABEL[a.stage]}</td>
                                    <td className="px-4 py-3">
                                        <span className={`inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${DECISION_TONE[a.decision]}`}>
                                            {a.decision.replace(/_/g, ' ')}
                                        </span>
                                        {a.remarks && <p className="mt-1 text-[10px] text-slate-500 italic text-wrap-anywhere">"{a.remarks}"</p>}
                                    </td>
                                    <td className="px-4 py-3 text-xs">
                                        <p className="font-bold text-slate-900 text-wrap-anywhere">{a.approver?.name || '—'}</p>
                                        <p className="text-[10px] text-slate-500 text-wrap-anywhere">{a.approver?.email}</p>
                                    </td>
                                    <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                                        <p>{formatDateTime(a.decidedAt)}</p>
                                        <p className="text-[10px] text-slate-400">{formatRelative(a.decidedAt)}</p>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </CardContent>
        </Card>
    );
}

function ActionModal({ type, approval, onClose, onReject, onClarify, pending }: {
    type: 'reject' | 'clarify';
    approval: ApprovalDto;
    onClose: () => void;
    onReject: (note: string) => Promise<void>;
    onClarify: (note: string) => Promise<void>;
    pending: boolean;
}) {
    const [note, setNote] = useState('');
    const isReject = type === 'reject';
    const minLen = 10;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4">
            <div className="w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
                <div className={`flex items-center justify-between border-b border-slate-200 px-5 py-4 text-white ${isReject ? 'bg-gradient-to-r from-red-700 to-red-800' : 'bg-gradient-to-r from-blue-700 to-blue-800'}`}>
                    <div>
                        <h3 className="text-sm font-black uppercase tracking-widest">{isReject ? 'Reject Approval(s)' : 'Request Clarification'}</h3>
                        {approval ? (
                            <p className="mt-0.5 text-[10px] text-white/70">{ENTITY_LABEL[approval.entityType]} · Stage {approval.sequence}: {STAGE_LABEL[approval.stage]}</p>
                        ) : (
                            <p className="mt-0.5 text-[10px] text-white/70">Bulk Action on Multiple Items</p>
                        )}
                    </div>
                    <button onClick={onClose} className="rounded-md p-1 text-white/80 hover:bg-white/10">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="p-5 space-y-4">
                    <div className="space-y-1">
                        <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                            {isReject ? 'Reason for Rejection' : 'Clarification Note'}
                        </label>
                        <textarea
                            value={note}
                            onChange={e => setNote(e.target.value)}
                            placeholder={isReject ? 'Explain why this is being rejected...' : 'What clarification do you need?'}
                            rows={4}
                            maxLength={2000}
                            required
                            className={`w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold outline-none focus:ring-2 ${isReject ? 'focus:ring-red-500/20' : 'focus:ring-blue-500/20'}`}
                        />
                        <p className="text-[10px] text-slate-400">Minimum {minLen} characters.</p>
                    </div>
                    <div className="flex justify-end gap-2">
                        <Button variant="outline" onClick={onClose}>Cancel</Button>
                        <Button
                            onClick={() => isReject ? onReject(note.trim()) : onClarify(note.trim())}
                            disabled={pending || note.trim().length < minLen}
                            className={isReject ? 'bg-red-600 text-white hover:bg-red-700' : 'bg-blue-600 text-white hover:bg-blue-700'}
                        >
                            {pending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : (isReject ? <XCircle className="mr-2 h-4 w-4" /> : <MessageCircle className="mr-2 h-4 w-4" />)}
                            {isReject ? 'Confirm Rejection' : 'Send Clarification'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ---------- Procurement Detail Modal ---------- */

const STATUS_TONE: Record<string, string> = {
    DRAFT: 'border-slate-200 bg-slate-50 text-slate-700',
    SUBMITTED: 'border-sky-200 bg-sky-50 text-sky-700',
    REQUESTED: 'border-sky-200 bg-sky-50 text-sky-700',
    UNDER_REVIEW: 'border-amber-200 bg-amber-50 text-amber-700',
    PENDING_APPROVAL: 'border-amber-200 bg-amber-50 text-amber-700',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    REJECTED: 'border-red-200 bg-red-50 text-red-700',
    ORDERED: 'border-indigo-200 bg-indigo-50 text-indigo-700',
    CLOSED: 'border-slate-200 bg-slate-100 text-slate-500',
    CANCELLED: 'border-slate-200 bg-slate-100 text-slate-500',
    CONVERTED_TO_TENDER: 'border-indigo-200 bg-indigo-50 text-indigo-700'
};

function DetailField({ label, icon: Icon, children }: { label: string; icon?: any; children: React.ReactNode }) {
    return (
        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
            <p className="flex items-center gap-1.5 text-[9px] font-black uppercase tracking-wider text-slate-400">
                {Icon && <Icon className="h-3 w-3" />}
                {label}
            </p>
            <div className="mt-1">{children}</div>
        </div>
    );
}

function ProcurementDetailModal({ approval, summary, onClose }: {
    approval: ApprovalDto;
    summary: NonNullable<ApprovalDto['entitySummary']>;
    onClose: () => void;
}) {
    const s = summary;
    const isDP = approval.entityType === 'direct_purchase';
    const payload = s.payload as Record<string, any> | null | undefined;
    const basics = payload?.basics;
    const vendors = payload?.vendors;
    const schedule = payload?.schedule;
    const rules = payload?.rules;
    const tender = payload?.tender;
    const approvalConf = payload?.approval;
    const payloadItems = payload?.items as Array<Record<string, any>> | undefined;
    const payloadConsignees = payload?.consigneeDetails as Array<Record<string, any>> | undefined;
    const payloadDocuments = payload?.documents as Array<Record<string, any>> | undefined;

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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 backdrop-blur-sm p-4" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
            <div className="w-full max-w-4xl max-h-[90vh] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl flex flex-col">
                {/* Header */}
                <div className="flex items-center justify-between border-b border-slate-200 bg-gradient-to-r from-[#12335f] to-[#1a4a8a] px-5 py-4 text-white shrink-0">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h3 className="text-sm font-black uppercase tracking-widest truncate">
                                {ENTITY_LABEL[approval.entityType]} Details
                            </h3>
                            <span className={cn(
                                'rounded-md border px-2 py-0.5 text-[9px] font-black uppercase',
                                STATUS_TONE[s.status] || STATUS_TONE.DRAFT
                            )}>
                                {s.status.replace(/_/g, ' ')}
                            </span>
                        </div>
                        <p className="mt-0.5 text-[10px] text-white/70">{s.label} · Stage {approval.sequence}: {STAGE_LABEL[approval.stage]}</p>
                    </div>
                    <button onClick={onClose} className="shrink-0 rounded-md p-1 text-white/80 hover:bg-white/10 transition-colors">
                        <X className="h-4 w-4" />
                    </button>
                </div>

                {/* Content */}
                <div className="overflow-y-auto flex-1 p-5 space-y-5">
                    {/* Title & Value */}
                    <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
                        <div className="flex items-center justify-between gap-4">
                            <div className="min-w-0">
                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Title / Subject</p>
                                <p className="mt-0.5 text-sm font-black text-slate-950 text-wrap-anywhere">{s.title}</p>
                            </div>
                            <div className="text-right shrink-0">
                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Total Value</p>
                                <p className="mt-0.5 text-lg font-black text-[#12335f]">{formatCurrency(s.value)}</p>
                            </div>
                        </div>
                        <div className="flex items-center gap-3 text-[10px] font-bold text-slate-400">
                            <span>Created: {formatDateTime(s.createdAt)}</span>
                            <span>·</span>
                            <span>{formatRelative(s.createdAt)}</span>
                        </div>
                    </div>

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

                            {/* Section 6: Approval Configuration */}
                            {approvalConf && (approvalConf.workflow || approvalConf.approver || approvalConf.notes) && (
                                <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3 shadow-sm">
                                    <SectionTitle>✅ Approval Configuration</SectionTitle>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        <InfoCell label="Workflow" value={approvalConf.workflow} />
                                        <InfoCell label="Approver" value={approvalConf.approver} />
                                    </div>
                                    {approvalConf.notes && (
                                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                            <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">Approval Notes</p>
                                            <p className="mt-1 text-xs font-semibold text-slate-700 whitespace-pre-wrap">{approvalConf.notes}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Section 7: Items from payload */}
                            {payloadItems && payloadItems.length > 0 && (
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
                                                    const price = Number(item.unitPrice || 0);
                                                    const gst = Number(item.gst || 0);
                                                    const lineTotal = qty * price * (1 + gst / 100);
                                                    return (
                                                        <tr key={idx} className="hover:bg-slate-50/60">
                                                            <td className="px-3 py-2 font-bold text-slate-900 text-wrap-anywhere">
                                                                {item.name || 'Unnamed'}
                                                                {(item.specification || item.technicalSpecification) && (
                                                                    <p className="mt-0.5 text-[10px] font-semibold text-slate-500 text-wrap-anywhere">
                                                                        {item.specification || item.technicalSpecification}
                                                                    </p>
                                                                )}
                                                                {item.brandPolicy && (
                                                                    <p className="mt-0.5 text-[9px] font-bold text-indigo-500">Brand: {item.brandPolicy}</p>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 font-bold text-slate-900">{item.quantity}</td>
                                                            <td className="px-3 py-2 font-bold text-slate-700">{item.unit}</td>
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
                                                    <td className="px-3 py-2 text-right text-sm font-black text-[#12335f]">{formatCurrency(s.value)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}

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
                        /* ============ FALLBACK: NO PAYLOAD ============ */
                        <>
                            {/* Procurement Details Grid */}
                            {isDP && (s.department || s.budgetHead || s.costCenter || s.requiredDeliveryDate) && (
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[#12335f] flex items-center gap-1.5">
                                        <Building className="h-3.5 w-3.5" /> Procurement Details
                                    </h4>
                                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                        {s.department && (
                                            <DetailField label="Department" icon={Building}>
                                                <p className="text-xs font-black text-slate-800">{s.department}</p>
                                            </DetailField>
                                        )}
                                        {s.budgetHead && (
                                            <DetailField label="Budget Head" icon={FileText}>
                                                <p className="text-xs font-black text-slate-800">{s.budgetHead}</p>
                                            </DetailField>
                                        )}
                                        {s.costCenter && (
                                            <DetailField label="Cost Center" icon={Package}>
                                                <p className="text-xs font-black text-slate-800">{s.costCenter}</p>
                                            </DetailField>
                                        )}
                                        {s.requiredDeliveryDate && (
                                            <DetailField label="Required Delivery Date" icon={CalendarClock}>
                                                <p className="text-xs font-black text-slate-800">{formatDate(s.requiredDeliveryDate)}</p>
                                            </DetailField>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Seller Information */}
                            {isDP && s.seller && (
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[#12335f] flex items-center gap-1.5">
                                        <UserCheck className="h-3.5 w-3.5" /> Seller Information
                                    </h4>
                                    <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                        <p className="text-xs font-black text-slate-900">{s.seller.name}</p>
                                        {s.seller.email && (
                                            <p className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                                                <Mail className="h-3 w-3" /> {s.seller.email}
                                            </p>
                                        )}
                                        {s.seller.mobile && (
                                            <p className="mt-0.5 flex items-center gap-1 text-[10px] font-semibold text-slate-500">
                                                <Phone className="h-3 w-3" /> {s.seller.mobile}
                                            </p>
                                        )}
                                    </div>
                                </div>
                            )}

                            {/* Justification */}
                            {isDP && s.justification && (
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Justification</h4>
                                    <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                        <p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{s.justification}</p>
                                    </div>
                                </div>
                            )}

                            {/* Delivery Address */}
                            {isDP && s.deliveryAddressText && (
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[#12335f] flex items-center gap-1.5">
                                        <MapPin className="h-3.5 w-3.5" /> Delivery Address
                                    </h4>
                                    <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                        <p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{s.deliveryAddressText}</p>
                                    </div>
                                </div>
                            )}

                            {/* Delivery Instructions */}
                            {isDP && s.deliveryInstructions && (
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[#12335f] flex items-center gap-1.5">
                                        <Truck className="h-3.5 w-3.5" /> Delivery Instructions
                                    </h4>
                                    <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                        <p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{s.deliveryInstructions}</p>
                                    </div>
                                </div>
                            )}

                            {/* Remarks */}
                            {isDP && s.remarks && (
                                <div className="space-y-2">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Remarks</h4>
                                    <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                                        <p className="text-xs font-semibold text-slate-700 whitespace-pre-wrap leading-relaxed">{s.remarks}</p>
                                    </div>
                                </div>
                            )}

                            {/* Line Items */}
                            {s.requirement?.items && s.requirement.items.length > 0 && (
                                <div className="space-y-3">
                                    <h4 className="text-[10px] font-black uppercase tracking-widest text-[#12335f] flex items-center gap-1.5">
                                        <Package className="h-3.5 w-3.5" /> Line Items ({s.requirement.items.length})
                                    </h4>
                                    <div className="overflow-hidden rounded-lg border border-slate-200 shadow-sm">
                                        <table className="w-full text-xs">
                                            <thead className="bg-slate-50 text-[9px] font-black uppercase tracking-widest text-slate-500">
                                                <tr>
                                                    <th className="px-3 py-2 text-left">Item</th>
                                                    <th className="px-3 py-2 text-left w-20">Qty</th>
                                                    <th className="px-3 py-2 text-left w-20">UoM</th>
                                                    <th className="px-3 py-2 text-right w-28">Unit Price</th>
                                                    <th className="px-3 py-2 text-right w-28">Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {s.requirement.items.map(item => {
                                                    const qty = Number(item.quantity || 0);
                                                    const unitPrice = Number(item.estimatedUnitPrice || 0);
                                                    const lineTotal = qty * unitPrice;
                                                    return (
                                                        <tr key={item.id} className="hover:bg-slate-50/60">
                                                            <td className="px-3 py-2 font-bold text-slate-900 text-wrap-anywhere">
                                                                {item.itemName}
                                                                {item.description && (
                                                                    <p className="mt-0.5 text-[10px] font-semibold text-slate-500 text-wrap-anywhere">{item.description}</p>
                                                                )}
                                                            </td>
                                                            <td className="px-3 py-2 font-bold text-slate-900">{item.quantity}</td>
                                                            <td className="px-3 py-2 font-bold text-slate-700">{item.unitOfMeasure}</td>
                                                            <td className="px-3 py-2 text-right font-bold text-slate-900">{formatCurrency(unitPrice)}</td>
                                                            <td className="px-3 py-2 text-right font-black text-slate-900">{formatCurrency(lineTotal)}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                            <tfoot className="bg-slate-50 border-t-2 border-slate-200">
                                                <tr>
                                                    <td colSpan={4} className="px-3 py-2 text-right text-[10px] font-black uppercase tracking-wider text-slate-500">Grand Total</td>
                                                    <td className="px-3 py-2 text-right text-sm font-black text-[#12335f]">{formatCurrency(s.value)}</td>
                                                </tr>
                                            </tfoot>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {/* Generic fallback for other non-DP entities */}
                            {!isDP && !s.requirement?.items && (
                                <div className="rounded-lg border border-blue-100 bg-blue-50/30 p-3.5 text-xs">
                                    <p className="font-bold text-slate-700">
                                        This is a <span className="font-black text-[#12335f]">{ENTITY_LABEL[approval.entityType]}</span> entity.
                                        Value: <span className="font-black">{formatCurrency(s.value)}</span>
                                    </p>
                                    <p className="mt-1 text-[10px] text-slate-500">
                                        View the full entity details in the {ENTITY_LABEL[approval.entityType].toLowerCase()} management page.
                                    </p>
                                </div>
                            )}
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="shrink-0 border-t border-slate-200 bg-slate-50/60 px-5 py-3 flex justify-end">
                    <Button variant="outline" onClick={onClose} className="h-9 rounded-lg text-xs font-black uppercase">
                        <X className="mr-1.5 h-3 w-3" /> Close
                    </Button>
                </div>
            </div>
        </div>
    );
}
