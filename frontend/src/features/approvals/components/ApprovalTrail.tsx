/**
 * ApprovalTrail — visualises the multi-stage approval chain for an entity.
 * Used inside detail drawers / pages.
 */
import { CheckCircle2, Clock, MessageCircle, XCircle } from 'lucide-react';
import { useApprovalTrail } from '../hooks';
import type { ApprovalDecision, ApprovalEntityType, ApprovalStage } from '../api';
import { formatDateTime, formatRelative } from '../../shared/format';

const STAGE_LABEL: Record<ApprovalStage, string> = {
    DEPARTMENT_HEAD: 'Department Head',
    FINANCE_DEPT: 'Finance Department',
    PROCUREMENT_HEAD: 'Procurement Head'
};

const DECISION_TONE: Record<ApprovalDecision, string> = {
    PENDING: 'border-slate-200 bg-slate-50 text-slate-500',
    APPROVED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
    REJECTED: 'border-red-200 bg-red-50 text-red-700',
    SENT_FOR_CLARIFICATION: 'border-amber-200 bg-amber-50 text-amber-700'
};

const DECISION_ICON: Record<ApprovalDecision, any> = {
    PENDING: Clock,
    APPROVED: CheckCircle2,
    REJECTED: XCircle,
    SENT_FOR_CLARIFICATION: MessageCircle
};

export function ApprovalTrail({ entityType, entityId }: { entityType: ApprovalEntityType; entityId: number }) {
    const { data, isLoading, error } = useApprovalTrail(entityType, entityId);

    if (isLoading) return <p className="text-xs font-semibold text-slate-500">Loading approval chain...</p>;
    if (error) return <p className="text-xs font-semibold text-red-600">Failed to load approval chain</p>;
    if (!data || data.trail.length === 0) {
        return <p className="text-xs font-semibold text-slate-500">No approval chain has been started yet.</p>;
    }

    return (
        <div className="space-y-2">
            <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Approval Chain</p>
                {data.fullyApproved && (
                    <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase text-emerald-700">
                        <CheckCircle2 className="h-3 w-3" /> Fully Approved
                    </span>
                )}
            </div>

            <ol className="space-y-2">
                {data.trail.map((step, idx) => {
                    const Icon = DECISION_ICON[step.decision];
                    const isCurrent = step.decision === 'PENDING' && data.trail.slice(0, idx).every(s => s.decision === 'APPROVED');
                    return (
                        <li
                            key={step.id}
                            className={`flex items-start gap-3 rounded-lg border px-3 py-2 ${isCurrent ? 'border-blue-300 bg-blue-50/40 ring-1 ring-blue-200' : 'border-slate-200 bg-white'
                                }`}
                        >
                            <div className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[10px] font-black ${DECISION_TONE[step.decision]}`}>
                                {step.sequence}
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                    <p className="text-xs font-black text-slate-900">
                                        Stage {step.sequence}: {STAGE_LABEL[step.stage]}
                                    </p>
                                    <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${DECISION_TONE[step.decision]}`}>
                                        <Icon className="h-3 w-3" />
                                        {step.decision.replace(/_/g, ' ')}
                                    </span>
                                </div>
                                {step.approver && (
                                    <p className="mt-0.5 text-[11px] font-semibold text-slate-600 text-wrap-anywhere">
                                        {step.approver.name} · {formatRelative(step.decidedAt)}
                                    </p>
                                )}
                                {step.remarks && (
                                    <p className="mt-1 text-[11px] text-slate-700 italic text-wrap-anywhere">"{step.remarks}"</p>
                                )}
                                {step.clarificationNote && (
                                    <p className="mt-1 text-[11px] text-amber-800 italic text-wrap-anywhere">Clarification: "{step.clarificationNote}"</p>
                                )}
                            </div>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}
