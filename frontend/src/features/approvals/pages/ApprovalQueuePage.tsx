/**
 * ApprovalQueuePage — unified inbox for all pending approvals across
 * tenders, POs, carts, and direct purchases.
 *
 * Route: /approvals
 * Access: ORG_ADMIN, PROCUREMENT_OFFICER, FINANCE_OFFICER
 */
import { useMemo, useState } from 'react';
import {
    CheckCircle2,
    ChevronDown,
    Clock,
    History,
    Inbox,
    Loader2,
    MessageCircle,
    RefreshCw,
    Shield,
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
    const { orgRole, isOrgAdmin, isProcurementOfficer, isFinanceOfficer } = useOrgRole();
    const pending = usePendingApprovals();
    const history = useApprovalHistory();
    const approveMut = useApproveApproval();
    const rejectMut = useRejectApproval();
    const clarifyMut = useClarifyApproval();

    const [tab, setTab] = useState<'pending' | 'history'>('pending');
    const [actionTarget, setActionTarget] = useState<{ type: 'reject' | 'clarify'; approval: ApprovalDto } | null>(null);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const allowed = isOrgAdmin || isProcurementOfficer || isFinanceOfficer;

    if (orgRole && !allowed) {
        return (
            <div className="flex h-64 items-center justify-center">
                <div className="text-center">
                    <Shield className="mx-auto h-12 w-12 text-slate-300" />
                    <p className="mt-3 text-sm font-black uppercase text-slate-600 tracking-widest">Access Restricted</p>
                    <p className="mt-1 text-xs font-semibold text-slate-400">Only approvers can view the approval queue.</p>
                </div>
            </div>
        );
    }

    const pendingItems = pending.data || [];
    const historyItems = history.data || [];

    const counts = useMemo(() => {
        return {
            pending: pendingItems.length,
            byStage: {
                DEPARTMENT_HEAD: pendingItems.filter(p => p.stage === 'DEPARTMENT_HEAD').length,
                FINANCE_DEPT: pendingItems.filter(p => p.stage === 'FINANCE_DEPT').length,
                PROCUREMENT_HEAD: pendingItems.filter(p => p.stage === 'PROCUREMENT_HEAD').length
            }
        };
    }, [pendingItems]);

    const handleApprove = async (a: ApprovalDto) => {
        await runWithToast(() => approveMut.mutateAsync({ id: a.id }), {
            loading: 'Approving...',
            success: 'Approved',
            error: 'Approval failed'
        });
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

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard label="Total Pending" value={counts.pending} icon={Inbox} />
                <MetricCard label="Department Head" value={counts.byStage.DEPARTMENT_HEAD} icon={Clock} />
                <MetricCard label="Finance Dept" value={counts.byStage.FINANCE_DEPT} icon={Clock} />
                <MetricCard label="Procurement Head" value={counts.byStage.PROCUREMENT_HEAD} icon={Clock} />
            </div>

            <div className="flex items-center gap-1 border-b border-slate-200">
                <TabButton active={tab === 'pending'} onClick={() => setTab('pending')} count={pendingItems.length}>
                    <Inbox className="mr-1.5 h-3.5 w-3.5" /> Pending
                </TabButton>
                <TabButton active={tab === 'history'} onClick={() => setTab('history')} count={historyItems.length}>
                    <History className="mr-1.5 h-3.5 w-3.5" /> History
                </TabButton>
            </div>

            {tab === 'pending' ? (
                <PendingList
                    items={pendingItems}
                    isLoading={pending.isLoading}
                    error={pending.error}
                    expandedId={expandedId}
                    onExpand={setExpandedId}
                    onApprove={handleApprove}
                    onReject={a => setActionTarget({ type: 'reject', approval: a })}
                    onClarify={a => setActionTarget({ type: 'clarify', approval: a })}
                    approving={approveMut.isPending}
                />
            ) : (
                <HistoryList items={historyItems} isLoading={history.isLoading} error={history.error} />
            )}

            {actionTarget && (
                <ActionModal
                    type={actionTarget.type}
                    approval={actionTarget.approval}
                    onClose={() => setActionTarget(null)}
                    onReject={async (note) => {
                        await runWithToast(() => rejectMut.mutateAsync({ id: actionTarget.approval.id, remarks: note }), {
                            loading: 'Rejecting...',
                            success: 'Rejected',
                            error: 'Rejection failed'
                        });
                        setActionTarget(null);
                    }}
                    onClarify={async (note) => {
                        await runWithToast(() => clarifyMut.mutateAsync({ id: actionTarget.approval.id, note }), {
                            loading: 'Sending...',
                            success: 'Clarification requested',
                            error: 'Failed to send'
                        });
                        setActionTarget(null);
                    }}
                    pending={rejectMut.isPending || clarifyMut.isPending}
                />
            )}
        </div>
    );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
    return (
        <Card>
            <CardContent className="flex items-center justify-between p-4">
                <div>
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                    <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
                </div>
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f] text-white">
                    <Icon className="h-5 w-5" />
                </div>
            </CardContent>
        </Card>
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

function PendingList({ items, isLoading, error, expandedId, onExpand, onApprove, onReject, onClarify, approving }: {
    items: ApprovalDto[];
    isLoading: boolean;
    error: any;
    expandedId: number | null;
    onExpand: (id: number | null) => void;
    onApprove: (a: ApprovalDto) => void;
    onReject: (a: ApprovalDto) => void;
    onClarify: (a: ApprovalDto) => void;
    approving: boolean;
}) {
    if (isLoading) return <LoadingState label="Loading pending approvals..." />;
    if (error) return <InlineError message={(error as Error).message} />;
    if (items.length === 0) {
        return (
            <Card><CardContent className="py-12">
                <EmptyState title="Inbox empty" description="No items currently need your approval." />
            </CardContent></Card>
        );
    }

    return (
        <div className="space-y-3">
            {items.map(approval => {
                const summary = approval.entitySummary;
                const isExpanded = expandedId === approval.id;

                return (
                    <Card key={approval.id} className="border-slate-200/80 shadow-sm">
                        <CardContent className="p-0">
                            <div className="px-4 py-3 flex items-start justify-between gap-3">
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        {summary && (
                                            <EntityIdLink label={summary.label} id={summary.id} size="sm" onClick={() => onExpand(isExpanded ? null : approval.id)} />
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

function HistoryList({ items, isLoading, error }: { items: ApprovalDto[]; isLoading: boolean; error: any }) {
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
                                                <EntityIdLink label={a.entitySummary.label} id={a.entitySummary.id} size="sm" onClick={() => { }} />
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
                        <h3 className="text-sm font-black uppercase tracking-widest">{isReject ? 'Reject Approval' : 'Request Clarification'}</h3>
                        <p className="mt-0.5 text-[10px] text-white/70">{ENTITY_LABEL[approval.entityType]} · Stage {approval.sequence}: {STAGE_LABEL[approval.stage]}</p>
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
