/**
 * FraudAlertsPage - admin queue for fraud signals raised by the portal's
 * detection rules. Lists alerts with filters by status / severity / type,
 * shows a detail drawer with the full evidence, lets the admin assign
 * themselves, change severity, and resolve / dismiss / confirm.
 */

import { useMemo, useState } from 'react';
import {
    CheckCircle2,
    Eye,
    Flag,
    RefreshCw,
    ShieldAlert,
    ShieldX,
    X
} from 'lucide-react';
import { Card, CardContent, Badge } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input, Select } from '../../../components/ui/input';
import { Pagination } from '../../shared/Pagination';
import { PageToolbar } from '../../shared/PageToolbar';
import { ListSkeleton, MetricCardSkeleton } from '../../../components/ui/skeleton';
import { EmptyState, InlineError } from '../../shared/FeatureStates';
import { formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { cn } from '../../../lib/utils';
import { useFraudAlert, useFraudAlerts, useUpdateFraudAlert } from '../hooks';
import type { FraudAlertDto, FraudAlertStatus, FraudAlertType, Severity } from '../types';

const STATUS_TONE: Record<FraudAlertStatus, string> = {
    OPEN: 'border-red-200 bg-red-50 text-red-700',
    UNDER_REVIEW: 'border-amber-200 bg-amber-50 text-amber-700',
    CONFIRMED: 'border-orange-200 bg-orange-50 text-orange-700',
    DISMISSED: 'border-slate-200 bg-slate-50 text-slate-600',
    RESOLVED: 'border-emerald-200 bg-emerald-50 text-emerald-700'
};

const SEVERITY_TONE: Record<Severity, string> = {
    LOW: 'border-slate-200 bg-slate-50 text-slate-700',
    MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700',
    HIGH: 'border-orange-200 bg-orange-50 text-orange-700',
    CRITICAL: 'border-red-200 bg-red-50 text-red-700'
};

const ALERT_TYPE_LABELS: Record<FraudAlertType, string> = {
    DUPLICATE_PAN: 'Duplicate PAN',
    DUPLICATE_GST: 'Duplicate GST',
    DUPLICATE_BANK: 'Duplicate Bank Account',
    DUPLICATE_AADHAAR_HASH: 'Duplicate Aadhaar',
    SAME_IP_MULTIPLE_ACCOUNTS: 'Same IP - Multiple Accounts',
    SUSPICIOUS_BID_PATTERN: 'Suspicious Bid Pattern',
    PAYMENT_ANOMALY: 'Payment Anomaly',
    DOCUMENT_MISMATCH: 'Document Mismatch',
    MANUAL_FLAG: 'Manual Flag'
};

export default function FraudAlertsPage() {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [q, setQ] = useState('');
    const [status, setStatus] = useState('');
    const [severity, setSeverity] = useState('');
    const [type, setType] = useState('');
    const [openId, setOpenId] = useState<number | null>(null);

    const list = useFraudAlerts({
        q: q || undefined,
        status: status || undefined,
        severity: severity || undefined,
        type: type || undefined,
        page,
        pageSize
    });

    const records = list.data?.records || [];
    const total = list.data?.total || 0;

    const counters = useMemo(() => {
        const open = records.filter(a => a.status === 'OPEN').length;
        const review = records.filter(a => a.status === 'UNDER_REVIEW').length;
        const critical = records.filter(a => a.severity === 'CRITICAL').length;
        return { open, review, critical };
    }, [records]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Admin · Risk</p>
                    <h1 className="text-2xl font-black tracking-tight text-slate-950">Fraud Alerts</h1>
                    <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
                        Triage signals raised by the portal&apos;s fraud detection rules. Assign yourself, review evidence, and confirm or dismiss with a justification.
                    </p>
                </div>
                <Button
                    variant="outline"
                    onClick={() => list.refetch()}
                    className="h-10 rounded-lg text-xs font-black uppercase"
                >
                    <RefreshCw className={cn('mr-2 h-4 w-4', list.isFetching && 'animate-spin')} /> Refresh
                </Button>
            </div>

            {list.isLoading && !list.data ? (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    {[1, 2, 3, 4].map(i => <MetricCardSkeleton key={i} />)}
                </div>
            ) : (
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                    <Metric label="Total" value={total} hint="In current view" tone="neutral" icon={Flag} />
                    <Metric label="Open" value={counters.open} hint="Need triage" tone="negative" icon={ShieldAlert} />
                    <Metric label="Under Review" value={counters.review} hint="With an admin" tone="warning" icon={Eye} />
                    <Metric label="Critical" value={counters.critical} hint="Top severity" tone="negative" icon={ShieldX} />
                </div>
            )}

            <PageToolbar
                eyebrow="Filters"
                search={q}
                onSearchChange={setQ}
                searchPlaceholder="Search user, organization, entity"
                filters={[
                    {
                        kind: 'select',
                        value: status,
                        onChange: setStatus,
                        placeholder: 'All statuses',
                        options: [
                            { value: 'OPEN', label: 'Open' },
                            { value: 'UNDER_REVIEW', label: 'Under Review' },
                            { value: 'CONFIRMED', label: 'Confirmed' },
                            { value: 'DISMISSED', label: 'Dismissed' },
                            { value: 'RESOLVED', label: 'Resolved' }
                        ]
                    },
                    {
                        kind: 'select',
                        value: severity,
                        onChange: setSeverity,
                        placeholder: 'All severities',
                        options: [
                            { value: 'CRITICAL', label: 'Critical' },
                            { value: 'HIGH', label: 'High' },
                            { value: 'MEDIUM', label: 'Medium' },
                            { value: 'LOW', label: 'Low' }
                        ]
                    },
                    {
                        kind: 'select',
                        value: type,
                        onChange: setType,
                        placeholder: 'All types',
                        options: Object.entries(ALERT_TYPE_LABELS).map(([value, label]) => ({ value, label }))
                    }
                ]}
                onReset={() => {
                    setQ('');
                    setStatus('');
                    setSeverity('');
                    setType('');
                }}
            />

            {list.error && (
                <InlineError
                    message={list.error instanceof Error ? list.error.message : 'Failed to load fraud alerts'}
                    onRetry={() => list.refetch()}
                />
            )}

            {list.isLoading && !list.data ? (
                <ListSkeleton rows={4} />
            ) : records.length === 0 ? (
                <EmptyState title="No fraud alerts" description="No alerts match the current filters. The detection rules are running quietly." />
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1000px] text-sm">
                                <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left w-12">#</th>
                                        <th className="px-4 py-2.5 text-left">Alert Type</th>
                                        <th className="px-4 py-2.5 text-left">Subject</th>
                                        <th className="px-4 py-2.5 text-left w-28">Severity</th>
                                        <th className="px-4 py-2.5 text-left w-32">Status</th>
                                        <th className="px-4 py-2.5 text-left w-44">Reviewer</th>
                                        <th className="px-4 py-2.5 text-left w-44">Raised</th>
                                        <th className="px-4 py-2.5 text-right w-24">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {records.map((alert, idx) => (
                                        <tr key={alert.id} className="hover:bg-slate-50/60 cursor-pointer" onClick={() => setOpenId(alert.id)}>
                                            <td className="px-4 py-3 text-xs font-mono text-slate-400">
                                                {String((page - 1) * pageSize + idx + 1).padStart(2, '0')}
                                            </td>
                                            <td className="px-4 py-3 text-wrap-anywhere">
                                                <p className="text-xs font-black text-[#12335f]">{ALERT_TYPE_LABELS[alert.alertType] || alert.alertType}</p>
                                                <code className="mt-0.5 inline-block text-[10px] text-slate-400">{alert.alertType}</code>
                                            </td>
                                            <td className="px-4 py-3 text-wrap-anywhere">
                                                <p className="text-xs font-bold text-slate-900">
                                                    {alert.user?.name || alert.organization?.organizationName || (alert.entityType ? `${alert.entityType}#${alert.entityId}` : 'System-wide')}
                                                </p>
                                                {alert.user?.email && <p className="text-[10px] text-slate-500">{alert.user.email}</p>}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge className={cn('rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', SEVERITY_TONE[alert.severity])}>
                                                    {alert.severity}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge className={cn('rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', STATUS_TONE[alert.status])}>
                                                    {alert.status.replace(/_/g, ' ')}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-700 text-wrap-anywhere">
                                                {alert.reviewedBy?.name || '—'}
                                                {alert.reviewedAt && (
                                                    <p className="text-[10px] text-slate-400">{formatRelative(alert.reviewedAt)}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-700">
                                                <p>{formatDateTime(alert.createdAt)}</p>
                                                <p className="text-[10px] text-slate-400">{formatRelative(alert.createdAt)}</p>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <button
                                                    type="button"
                                                    onClick={e => {
                                                        e.stopPropagation();
                                                        setOpenId(alert.id);
                                                    }}
                                                    className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700 hover:border-[#12335f] hover:text-[#12335f]"
                                                >
                                                    Review
                                                </button>
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
                            label="alerts"
                        />
                    </CardContent>
                </Card>
            )}

            {openId !== null && <FraudAlertDetail id={openId} onClose={() => setOpenId(null)} />}
        </div>
    );
}

/* ---------- Detail drawer ---------- */

function FraudAlertDetail({ id, onClose }: { id: number; onClose: () => void }) {
    const detail = useFraudAlert(id);
    const updateMut = useUpdateFraudAlert();
    const [remarks, setRemarks] = useState('');
    const [severity, setSeverity] = useState<Severity | null>(null);

    const alert = detail.data;

    const submit = (status: FraudAlertStatus | 'ASSIGN', extra?: { severity?: Severity }) => {
        if (!alert) return;
        const data: any = {};
        if (status !== 'ASSIGN') data.status = status;
        if (status === 'ASSIGN' || status === 'UNDER_REVIEW') data.assignToSelf = true;
        if (remarks.trim()) data.remarks = remarks.trim();
        if (extra?.severity) data.severity = extra.severity;
        runWithToast(() => updateMut.mutateAsync({ id: alert.id, data }), {
            loading: 'Updating alert...',
            success: status === 'ASSIGN' ? 'Assigned to you' : `Marked ${status.replace(/_/g, ' ').toLowerCase()}`,
            error: 'Update failed'
        }).then(() => {
            setRemarks('');
            detail.refetch();
        });
    };

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div className="w-full max-w-2xl overflow-hidden rounded-xl bg-white shadow-xl animate-in zoom-in-95 duration-200">
                <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-5 py-4 text-white">
                    <div className="min-w-0">
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-amber-300">Fraud Alert · #{id}</p>
                        <h2 className="mt-1 text-base font-black uppercase tracking-tight text-wrap-anywhere">
                            {alert ? ALERT_TYPE_LABELS[alert.alertType] || alert.alertType : 'Loading...'}
                        </h2>
                    </div>
                    <button onClick={onClose} aria-label="Close" className="rounded-md p-1 text-white/80 hover:bg-white/10">
                        <X className="h-4 w-4" />
                    </button>
                </header>

                <div className="max-h-[75vh] overflow-y-auto p-5 space-y-4">
                    {detail.isLoading && !alert ? (
                        <ListSkeleton rows={3} />
                    ) : !alert ? (
                        <EmptyState title="Alert not found" />
                    ) : (
                        <>
                            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
                                <DetailField label="Status">
                                    <Badge className={cn('rounded-md px-2 py-1 text-[10px] font-black uppercase', STATUS_TONE[alert.status])}>
                                        {alert.status.replace(/_/g, ' ')}
                                    </Badge>
                                </DetailField>
                                <DetailField label="Severity">
                                    <Select
                                        value={severity || alert.severity}
                                        onChange={e => {
                                            const next = e.target.value as Severity;
                                            setSeverity(next);
                                            submit('UNDER_REVIEW', { severity: next });
                                        }}
                                    >
                                        <option value="LOW">Low</option>
                                        <option value="MEDIUM">Medium</option>
                                        <option value="HIGH">High</option>
                                        <option value="CRITICAL">Critical</option>
                                    </Select>
                                </DetailField>
                                <DetailField label="Raised">
                                    <p className="text-xs font-bold text-slate-900">{formatDateTime(alert.createdAt)}</p>
                                    <p className="text-[10px] font-semibold text-slate-400">{formatRelative(alert.createdAt)}</p>
                                </DetailField>
                            </div>

                            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
                                <DetailField label="Subject">
                                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs font-semibold text-slate-700 text-wrap-anywhere">
                                        {alert.user ? (
                                            <>
                                                <p className="font-black text-slate-900">{alert.user.name}</p>
                                                <p>{alert.user.email}</p>
                                                <p className="text-[10px] uppercase font-bold text-slate-400 mt-0.5">{alert.user.role}</p>
                                            </>
                                        ) : alert.organization ? (
                                            <p className="font-black text-slate-900">{alert.organization.organizationName}</p>
                                        ) : alert.entityType ? (
                                            <p>
                                                Entity: {alert.entityType}#{alert.entityId}
                                            </p>
                                        ) : (
                                            <p>System-wide alert</p>
                                        )}
                                    </div>
                                </DetailField>
                                <DetailField label="Reviewer">
                                    <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs font-semibold text-slate-700 text-wrap-anywhere">
                                        {alert.reviewedBy ? (
                                            <>
                                                <p className="font-black text-slate-900">{alert.reviewedBy.name}</p>
                                                <p>{alert.reviewedBy.email}</p>
                                                {alert.reviewedAt && (
                                                    <p className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(alert.reviewedAt)}</p>
                                                )}
                                            </>
                                        ) : (
                                            <p className="text-slate-500">Unassigned</p>
                                        )}
                                    </div>
                                </DetailField>
                            </div>

                            <DetailField label="Evidence">
                                <pre className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-[11px] font-mono text-slate-700 overflow-x-auto max-h-72 text-wrap-anywhere">
                                    {JSON.stringify(alert.details, null, 2)}
                                </pre>
                            </DetailField>

                            <DetailField label="Reviewer Remarks">
                                <textarea
                                    value={remarks}
                                    onChange={e => setRemarks(e.target.value)}
                                    rows={3}
                                    placeholder="Add notes from your investigation. Required when confirming or dismissing."
                                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                                />
                            </DetailField>

                            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 pt-4">
                                {alert.status === 'OPEN' && (
                                    <Button variant="outline" onClick={() => submit('ASSIGN')} disabled={updateMut.isPending}>
                                        Assign to me
                                    </Button>
                                )}
                                {alert.status !== 'DISMISSED' && alert.status !== 'RESOLVED' && (
                                    <>
                                        <Button
                                            variant="outline"
                                            onClick={() => submit('DISMISSED')}
                                            disabled={updateMut.isPending || !remarks.trim()}
                                            className="border-slate-300 text-slate-700"
                                        >
                                            Dismiss
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => submit('CONFIRMED')}
                                            disabled={updateMut.isPending || !remarks.trim()}
                                            className="border-orange-300 bg-orange-50 text-orange-700"
                                        >
                                            Confirm
                                        </Button>
                                    </>
                                )}
                                {alert.status !== 'RESOLVED' && (
                                    <Button
                                        onClick={() => submit('RESOLVED')}
                                        disabled={updateMut.isPending}
                                        className="bg-emerald-600 text-white hover:bg-emerald-700"
                                    >
                                        <CheckCircle2 className="mr-1.5 h-4 w-4" /> Resolve
                                    </Button>
                                )}
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

function DetailField({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="space-y-1">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            {children}
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
