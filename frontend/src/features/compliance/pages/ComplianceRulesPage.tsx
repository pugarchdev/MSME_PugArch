/**
 * ComplianceRulesPage - admin console for managing compliance rules and
 * reviewing the violations they have triggered. Shows the rule list with
 * severity + active toggle, edit/create forms, and a per-rule violation
 * drawer with one-click resolve.
 */

import { useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Pause,
    Play,
    Plus,
    RefreshCw,
    ScrollText,
    ShieldAlert,
    ShieldCheck,
    X
} from 'lucide-react';
import { Card, CardContent, Badge } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input, Select } from '../../../components/ui/input';
import { Pagination } from '../../shared/Pagination';
import { PageToolbar } from '../../shared/PageToolbar';
import { ListSkeleton } from '../../../components/ui/skeleton';
import { EmptyState, InlineError } from '../../shared/FeatureStates';
import { formatDateTime, formatRelative } from '../../shared/format';
import { runWithToast } from '../../../lib/toast';
import { cn } from '../../../lib/utils';
import {
    useComplianceRules,
    useCreateComplianceRule,
    useResolveViolation,
    useRuleViolations,
    useUpdateComplianceRule
} from '../hooks';
import type { ComplianceRuleDto, Severity } from '../types';

const SEVERITY_TONE: Record<Severity, string> = {
    LOW: 'border-slate-200 bg-slate-50 text-slate-700',
    MEDIUM: 'border-amber-200 bg-amber-50 text-amber-700',
    HIGH: 'border-orange-200 bg-orange-50 text-orange-700',
    CRITICAL: 'border-red-200 bg-red-50 text-red-700'
};

export default function ComplianceRulesPage() {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [q, setQ] = useState('');
    const [severity, setSeverity] = useState('');
    const [isActive, setIsActive] = useState('');
    const [editing, setEditing] = useState<ComplianceRuleDto | null>(null);
    const [violationsFor, setViolationsFor] = useState<ComplianceRuleDto | null>(null);
    const [creating, setCreating] = useState(false);

    const query = useComplianceRules({
        q: q || undefined,
        severity: severity || undefined,
        isActive: isActive === '' ? undefined : isActive === 'true',
        page,
        pageSize
    });

    const records = query.data?.records || [];
    const total = query.data?.total || 0;

    const counters = useMemo(() => {
        const active = records.filter(r => r.isActive).length;
        const critical = records.filter(r => r.severity === 'CRITICAL').length;
        const violations = records.reduce((sum, r) => sum + (r.violations?.length || 0), 0);
        return { active, critical, violations };
    }, [records]);

    return (
        <div className="space-y-4">
            <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
                <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Admin · Compliance</p>
                    <h1 className="text-2xl font-black tracking-tight text-slate-950">Compliance Rules</h1>
                    <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
                        Statutory checks that fire across onboarding, procurement, and payments. Edit severity, toggle active state, and review the violations each rule has flagged.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <Button
                        variant="outline"
                        onClick={() => query.refetch()}
                        className="h-10 rounded-lg text-xs font-black uppercase"
                    >
                        <RefreshCw className={cn('mr-2 h-4 w-4', query.isFetching && 'animate-spin')} /> Refresh
                    </Button>
                    <Button onClick={() => setCreating(true)} className="bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                        <Plus className="mr-2 h-4 w-4" /> New Rule
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <MetricCard label="Total Rules" value={total} hint="In compliance catalogue" tone="neutral" icon={ScrollText} />
                <MetricCard label="Active" value={counters.active} hint="Currently enforced" tone="positive" icon={ShieldCheck} />
                <MetricCard label="Critical" value={counters.critical} hint="Highest severity" tone="negative" icon={ShieldAlert} />
                <MetricCard label="Violations" value={counters.violations} hint="Recent (this page)" tone="warning" icon={AlertTriangle} />
            </div>

            <PageToolbar
                eyebrow="Filters"
                search={q}
                onSearchChange={setQ}
                searchPlaceholder="Search by code, title, description"
                filters={[
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
                        value: isActive,
                        onChange: setIsActive,
                        placeholder: 'Active and inactive',
                        options: [
                            { value: 'true', label: 'Active only' },
                            { value: 'false', label: 'Inactive only' }
                        ]
                    }
                ]}
                onReset={() => {
                    setQ('');
                    setSeverity('');
                    setIsActive('');
                }}
            />

            {query.error && (
                <InlineError
                    message={query.error instanceof Error ? query.error.message : 'Failed to load rules'}
                    onRetry={() => query.refetch()}
                />
            )}

            {query.isLoading && !query.data ? (
                <ListSkeleton rows={4} />
            ) : records.length === 0 ? (
                <EmptyState title="No compliance rules" description="Adjust filters or create a new rule." />
            ) : (
                <Card>
                    <CardContent className="p-0">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[860px] text-sm">
                                <thead className="border-b border-slate-100 bg-slate-50/60 text-[10px] font-black uppercase tracking-widest text-slate-500">
                                    <tr>
                                        <th className="px-4 py-2.5 text-left w-12">#</th>
                                        <th className="px-4 py-2.5 text-left">Code</th>
                                        <th className="px-4 py-2.5 text-left">Title</th>
                                        <th className="px-4 py-2.5 text-left w-28">Severity</th>
                                        <th className="px-4 py-2.5 text-left w-24">Status</th>
                                        <th className="px-4 py-2.5 text-left w-44">Last Updated</th>
                                        <th className="px-4 py-2.5 text-right w-44">Actions</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100">
                                    {records.map((rule, idx) => (
                                        <tr key={rule.id} className="hover:bg-slate-50/60">
                                            <td className="px-4 py-3 text-xs font-mono text-slate-400">
                                                {String((page - 1) * pageSize + idx + 1).padStart(2, '0')}
                                            </td>
                                            <td className="px-4 py-3">
                                                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 text-wrap-anywhere">
                                                    {rule.code}
                                                </code>
                                            </td>
                                            <td className="px-4 py-3">
                                                <p className="text-sm font-black text-slate-900 text-wrap-anywhere">{rule.title}</p>
                                                {rule.description && (
                                                    <p className="mt-0.5 text-[11px] font-semibold text-slate-500 text-wrap-anywhere line-clamp-2">{rule.description}</p>
                                                )}
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge className={cn('rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', SEVERITY_TONE[rule.severity])}>
                                                    {rule.severity}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3">
                                                <Badge
                                                    className={cn(
                                                        'rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide',
                                                        rule.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'
                                                    )}
                                                >
                                                    {rule.isActive ? 'Active' : 'Inactive'}
                                                </Badge>
                                            </td>
                                            <td className="px-4 py-3 text-xs font-semibold text-slate-600" title={formatDateTime(rule.updatedAt)}>
                                                <p>{formatDateTime(rule.updatedAt)}</p>
                                                <p className="text-[10px] text-slate-400">{formatRelative(rule.updatedAt)}</p>
                                            </td>
                                            <td className="px-4 py-3 text-right">
                                                <div className="flex items-center justify-end gap-1">
                                                    <button
                                                        type="button"
                                                        onClick={() => setViolationsFor(rule)}
                                                        className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700 hover:border-[#12335f] hover:text-[#12335f]"
                                                    >
                                                        Violations
                                                    </button>
                                                    <button
                                                        type="button"
                                                        onClick={() => setEditing(rule)}
                                                        className="rounded-md border border-slate-200 px-2 py-1 text-[10px] font-black uppercase tracking-wide text-slate-700 hover:border-[#12335f] hover:text-[#12335f]"
                                                    >
                                                        Edit
                                                    </button>
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
                            label="rules"
                        />
                    </CardContent>
                </Card>
            )}

            {editing && <RuleEditor rule={editing} onClose={() => setEditing(null)} />}
            {creating && <RuleCreator onClose={() => setCreating(false)} />}
            {violationsFor && <ViolationDrawer rule={violationsFor} onClose={() => setViolationsFor(null)} />}
        </div>
    );
}

/* ---------- Edit / Create modal ---------- */

function RuleEditor({ rule, onClose }: { rule: ComplianceRuleDto; onClose: () => void }) {
    const [title, setTitle] = useState(rule.title);
    const [description, setDescription] = useState(rule.description || '');
    const [severity, setSeverity] = useState<Severity>(rule.severity);
    const [isActive, setIsActive] = useState(rule.isActive);
    const updateMut = useUpdateComplianceRule();

    const submit = async () => {
        await runWithToast(
            () => updateMut.mutateAsync({ id: rule.id, data: { title, description: description || undefined, severity, isActive } }),
            { loading: 'Saving...', success: 'Rule updated', error: 'Update failed' }
        );
        onClose();
    };

    return (
        <RuleModal title={`Edit · ${rule.code}`} onClose={onClose}>
            <div className="space-y-3">
                <Field label="Code">
                    <code className="block rounded bg-slate-100 px-3 py-2 text-xs font-bold text-slate-600 text-wrap-anywhere">{rule.code}</code>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">Code is immutable - it identifies this rule across audit logs and violations.</p>
                </Field>
                <Field label="Title">
                    <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} />
                </Field>
                <Field label="Description">
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                    />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                    <Field label="Severity">
                        <Select value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
                            <option value="LOW">Low</option>
                            <option value="MEDIUM">Medium</option>
                            <option value="HIGH">High</option>
                            <option value="CRITICAL">Critical</option>
                        </Select>
                    </Field>
                    <Field label="Status">
                        <Button
                            variant="outline"
                            type="button"
                            onClick={() => setIsActive(prev => !prev)}
                            className={cn(
                                'w-full justify-start gap-2',
                                isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-700'
                            )}
                        >
                            {isActive ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                            {isActive ? 'Active' : 'Inactive'}
                        </Button>
                    </Field>
                </div>
            </div>
            <ModalFooter onCancel={onClose} onConfirm={submit} confirmLabel="Save" pending={updateMut.isPending} />
        </RuleModal>
    );
}

function RuleCreator({ onClose }: { onClose: () => void }) {
    const [code, setCode] = useState('');
    const [title, setTitle] = useState('');
    const [description, setDescription] = useState('');
    const [severity, setSeverity] = useState<Severity>('MEDIUM');
    const createMut = useCreateComplianceRule();

    const submit = async () => {
        await runWithToast(
            () => createMut.mutateAsync({ code: code.toUpperCase(), title, description: description || undefined, severity }),
            { loading: 'Creating...', success: 'Rule created', error: err => (err instanceof Error ? err.message : 'Create failed') }
        );
        onClose();
    };

    return (
        <RuleModal title="New Compliance Rule" onClose={onClose}>
            <div className="space-y-3">
                <Field label="Code">
                    <Input
                        value={code}
                        onChange={e => setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''))}
                        placeholder="UPPERCASE_WITH_UNDERSCORES"
                        maxLength={80}
                    />
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">Used as the machine-readable identifier. Cannot be changed later.</p>
                </Field>
                <Field label="Title">
                    <Input value={title} onChange={e => setTitle(e.target.value)} maxLength={160} placeholder="Short rule title" />
                </Field>
                <Field label="Description">
                    <textarea
                        value={description}
                        onChange={e => setDescription(e.target.value)}
                        rows={3}
                        className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/30"
                        placeholder="When does this rule fire? What entity does it guard?"
                    />
                </Field>
                <Field label="Severity">
                    <Select value={severity} onChange={e => setSeverity(e.target.value as Severity)}>
                        <option value="LOW">Low</option>
                        <option value="MEDIUM">Medium</option>
                        <option value="HIGH">High</option>
                        <option value="CRITICAL">Critical</option>
                    </Select>
                </Field>
            </div>
            <ModalFooter
                onCancel={onClose}
                onConfirm={submit}
                confirmLabel="Create"
                pending={createMut.isPending}
                disabled={!code || !title || code.length < 3 || title.length < 2}
            />
        </RuleModal>
    );
}

function ViolationDrawer({ rule, onClose }: { rule: ComplianceRuleDto; onClose: () => void }) {
    const [page, setPage] = useState(1);
    const violations = useRuleViolations(rule.id, page, 10);
    const resolveMut = useResolveViolation();

    return (
        <RuleModal title={`Violations · ${rule.code}`} onClose={onClose} wide>
            {violations.isLoading ? (
                <ListSkeleton rows={3} />
            ) : violations.data?.records.length === 0 ? (
                <EmptyState title="No violations recorded" description="This rule has not flagged any record yet." />
            ) : (
                <div className="space-y-2">
                    {violations.data?.records.map(violation => (
                        <div key={violation.id} className="rounded-lg border border-slate-200 bg-white p-3 space-y-2">
                            <div className="flex flex-wrap items-start justify-between gap-2">
                                <div className="min-w-0 flex-1">
                                    <div className="flex flex-wrap items-center gap-2">
                                        <span className="text-xs font-black uppercase tracking-wide text-[#12335f] text-wrap-anywhere">
                                            {violation.type.replace(/_/g, ' ')}
                                        </span>
                                        <Badge
                                            className={cn(
                                                'rounded-md px-2 py-0.5 text-[10px] font-black uppercase',
                                                violation.severity === 'critical' || violation.severity === 'CRITICAL'
                                                    ? 'border-red-200 bg-red-50 text-red-700'
                                                    : violation.severity === 'high' || violation.severity === 'HIGH'
                                                        ? 'border-orange-200 bg-orange-50 text-orange-700'
                                                        : 'border-amber-200 bg-amber-50 text-amber-700'
                                            )}
                                        >
                                            {violation.severity}
                                        </Badge>
                                        <Badge
                                            className={cn(
                                                'rounded-md px-2 py-0.5 text-[10px] font-black uppercase',
                                                violation.status === 'resolved'
                                                    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                                                    : 'border-slate-200 bg-slate-50 text-slate-600'
                                            )}
                                        >
                                            {violation.status}
                                        </Badge>
                                    </div>
                                    <p className="mt-1 text-xs font-semibold text-slate-700 text-wrap-anywhere">{violation.description}</p>
                                    <div className="mt-1 flex flex-wrap gap-3 text-[10px] font-bold text-slate-400">
                                        {violation.user && (
                                            <span className="text-wrap-anywhere">
                                                User: {violation.user.name || `#${violation.user.id}`} ({violation.user.role})
                                            </span>
                                        )}
                                        {violation.entityType && (
                                            <span>
                                                Entity: {violation.entityType}#{violation.entityId}
                                            </span>
                                        )}
                                        <span title={formatDateTime(violation.createdAt)}>{formatDateTime(violation.createdAt)}</span>
                                    </div>
                                </div>
                                {violation.status !== 'resolved' && (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() =>
                                            runWithToast(() => resolveMut.mutateAsync({ id: violation.id }), {
                                                loading: 'Resolving...',
                                                success: 'Violation resolved',
                                                error: 'Resolve failed'
                                            })
                                        }
                                        className="h-8 rounded-md border-emerald-200 text-emerald-700 text-[10px] font-black uppercase"
                                    >
                                        <CheckCircle2 className="mr-1.5 h-3 w-3" /> Resolve
                                    </Button>
                                )}
                            </div>
                        </div>
                    ))}
                    {(violations.data?.total ?? 0) > 10 && (
                        <Pagination
                            page={page}
                            pageSize={10}
                            total={violations.data?.total || 0}
                            onPageChange={setPage}
                            onPageSizeChange={() => undefined}
                            label="violations"
                        />
                    )}
                </div>
            )}
        </RuleModal>
    );
}

/* ---------- Building blocks ---------- */

function RuleModal({ title, onClose, wide, children }: { title: string; onClose: () => void; wide?: boolean; children: React.ReactNode }) {
    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150"
            role="dialog"
            aria-modal="true"
            onClick={e => e.target === e.currentTarget && onClose()}
        >
            <div className={cn('w-full overflow-hidden rounded-xl bg-white shadow-xl animate-in zoom-in-95 duration-200', wide ? 'max-w-3xl' : 'max-w-lg')}>
                <header className="flex items-start justify-between gap-3 border-b border-slate-100 bg-slate-50 px-5 py-3.5">
                    <h2 className="text-sm font-black uppercase tracking-widest text-[#12335f] text-wrap-anywhere">{title}</h2>
                    <button onClick={onClose} className="rounded-md p-1 text-slate-500 hover:bg-slate-100" aria-label="Close">
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

function MetricCard({
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
