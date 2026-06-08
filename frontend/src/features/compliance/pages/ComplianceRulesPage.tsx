/**
 * ComplianceRulesPage - admin console for managing compliance rules and
 * reviewing the violations they have triggered. Shows the rule list with
 * severity + active toggle, edit/create forms, and a per-rule violation
 * drawer with one-click resolve.
 */

import { useEffect, useMemo, useState } from 'react';
import {
    AlertTriangle,
    CheckCircle2,
    Clock,
    Mail,
    Pause,
    Play,
    Plus,
    RefreshCw,
    ScrollText,
    ShieldAlert,
    ShieldCheck,
    User,
    X
} from 'lucide-react';
import { Card, CardContent, Badge } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input, Select } from '../../../components/ui/input';
import { Pagination } from '../../shared/Pagination';
import { PageToolbar } from '../../shared/PageToolbar';
import { KpiTile } from '../../shared/KpiTile';
import { ViewModeToggle, type ViewMode } from '../../shared/ViewModeToggle';
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

type SortBy = 'newest' | 'oldest' | 'severity_desc' | 'most_violations';

export default function ComplianceRulesPage() {
    const [page, setPage] = useState(1);
    const [pageSize, setPageSize] = useState(10);
    const [q, setQ] = useState('');
    const [severity, setSeverity] = useState('');
    const [isActive, setIsActive] = useState('');
    const [hasViolations, setHasViolations] = useState('');
    const [sortBy, setSortBy] = useState<SortBy>('newest');
    const [viewMode, setViewMode] = useState<ViewMode>('list');
    const [editing, setEditing] = useState<ComplianceRuleDto | null>(null);
    const [violationsFor, setViolationsFor] = useState<ComplianceRuleDto | null>(null);
    const [creating, setCreating] = useState(false);

    // Fetch the full rule catalogue once and apply every filter client-side.
    // Compliance rules is a bounded set (a few dozen at most) so this lets
    // KPI tiles, severity, status, and search all toggle instantly with
    // zero network round trips. The server is only hit when the user
    // explicitly clicks Refresh or after a mutation invalidates the cache.
    const query = useComplianceRules({ page: 1, pageSize: 200 });

    const records = query.data?.records || [];

    // KPI counters always reflect the full catalogue, never the filtered slice,
    // so the tile values stay stable as the user clicks between filters.
    const counters = useMemo(() => {
        const active = records.filter(r => r.isActive).length;
        const critical = records.filter(r => r.severity === 'CRITICAL').length;
        const violations = records.reduce((sum, r) => sum + (r.violations?.length || 0), 0);
        return { active, critical, violations };
    }, [records]);

    // Apply search + every filter client-side. No fetch is triggered when any
    // of these change, so the table updates the instant the user clicks.
    const filteredRecords = useMemo(() => {
        const term = q.trim().toLowerCase();
        return records.filter(rule => {
            if (term) {
                const haystack = [rule.code, rule.title, rule.description].filter(Boolean).join(' ').toLowerCase();
                if (!haystack.includes(term)) return false;
            }
            if (severity && rule.severity !== severity) return false;
            if (isActive === 'true' && !rule.isActive) return false;
            if (isActive === 'false' && rule.isActive) return false;
            if (hasViolations === 'true' && (rule.violations?.length || 0) === 0) return false;
            if (hasViolations === 'false' && (rule.violations?.length || 0) > 0) return false;
            return true;
        });
    }, [records, q, severity, isActive, hasViolations]);

    // Sort the filtered slice. Memoised separately so unrelated state changes
    // don't recompute the sort.
    const sortedRecords = useMemo(() => {
        const severityRank: Record<Severity, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };
        return [...filteredRecords].sort((a, b) => {
            if (sortBy === 'severity_desc') return severityRank[b.severity] - severityRank[a.severity];
            if (sortBy === 'most_violations') return (b.violations?.length || 0) - (a.violations?.length || 0);
            const aTime = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const bTime = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            return sortBy === 'oldest' ? aTime - bTime : bTime - aTime;
        });
    }, [filteredRecords, sortBy]);

    const total = sortedRecords.length;

    // Apply pagination to the sorted result.
    const visibleRecords = useMemo(() => {
        const start = (page - 1) * pageSize;
        return sortedRecords.slice(start, start + pageSize);
    }, [sortedRecords, page, pageSize]);

    // Whenever a filter changes the result set, jump back to page 1 so the
    // user isn't stranded on an empty page after narrowing things down.
    useEffect(() => {
        setPage(1);
    }, [q, severity, isActive, hasViolations, sortBy, pageSize]);

    const resetFilters = () => {
        setQ('');
        setSeverity('');
        setIsActive('');
        setHasViolations('');
        setSortBy('newest');
        setPage(1);
    };

    // KPI tile click handlers - each one drives a specific filter combination
    // so the table below the tiles immediately reflects the count the user
    // just clicked. "Total" clears filters; "Active" / "Critical" set their
    // respective filter; "Violations" surfaces only rules that flagged
    // something on the current page.
    const tiles = [
        {
            key: 'total',
            label: 'Total Rules',
            value: total,
            hint: 'In compliance catalogue',
            tone: 'neutral' as const,
            icon: ScrollText,
            isActive: q === '' && severity === '' && isActive === '' && hasViolations === '',
            onClick: resetFilters
        },
        {
            key: 'active',
            label: 'Active',
            value: counters.active,
            hint: 'Currently enforced',
            tone: 'positive' as const,
            icon: ShieldCheck,
            isActive: isActive === 'true',
            onClick: () => {
                setIsActive('true');
                setSeverity('');
                setHasViolations('');
                setPage(1);
            }
        },
        {
            key: 'critical',
            label: 'Critical',
            value: counters.critical,
            hint: 'Highest severity',
            tone: 'negative' as const,
            icon: ShieldAlert,
            isActive: severity === 'CRITICAL',
            onClick: () => {
                setSeverity('CRITICAL');
                setIsActive('');
                setHasViolations('');
                setPage(1);
            }
        },
        {
            key: 'violations',
            label: 'Violations',
            value: counters.violations,
            hint: 'Rules that flagged records',
            tone: 'warning' as const,
            icon: AlertTriangle,
            isActive: hasViolations === 'true',
            onClick: () => {
                setHasViolations('true');
                setSeverity('');
                setIsActive('');
                setPage(1);
            }
        }
    ];

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
                <div className="flex flex items-center gap-2">
                    <ViewModeToggle value={viewMode} onChange={setViewMode} />
                    <Button
                        variant="outline"
                        onClick={() => query.refetch()}
                        className="h-10 rounded-lg text-xs font-black uppercase"
                    >
                        <RefreshCw className={cn('mr-2 h-4 w-4', query.isFetching && 'animate-spin')} /> Refresh
                    </Button>
                    <Button onClick={() => setCreating(true)} className="bg-[#12335f] text-white hover:bg-[#0e2a4f]">
                        <Plus className="mr-2 h-4 w-4" /> New
                    </Button>
                </div>
            </div>

            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                {tiles.map(tile => (
                    <KpiTile
                        key={tile.key}
                        label={tile.label}
                        value={tile.value}
                        hint={tile.hint}
                        tone={tile.tone}
                        icon={tile.icon}
                        isActive={tile.isActive}
                        onClick={tile.onClick}
                    />
                ))}
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
                    },
                    {
                        kind: 'select',
                        value: hasViolations,
                        onChange: setHasViolations,
                        placeholder: 'All rules',
                        options: [
                            { value: 'true', label: 'With violations' },
                            { value: 'false', label: 'No violations' }
                        ]
                    },
                    {
                        kind: 'select',
                        value: sortBy,
                        onChange: value => setSortBy(value as SortBy),
                        ariaLabel: 'Sort rules',
                        options: [
                            { value: 'newest', label: 'Recently updated' },
                            { value: 'oldest', label: 'Oldest first' },
                            { value: 'severity_desc', label: 'Severity high → low' },
                            { value: 'most_violations', label: 'Most violations' }
                        ]
                    }
                ]}
                onReset={resetFilters}
            />

            {query.error && (
                <InlineError
                    message={query.error instanceof Error ? query.error.message : 'Failed to load rules'}
                    onRetry={() => query.refetch()}
                />
            )}

            {query.isLoading && !query.data ? (
                <ListSkeleton rows={4} />
            ) : visibleRecords.length === 0 ? (
                <EmptyState title="No compliance rules" description="Adjust filters or create a new rule." />
            ) : viewMode === 'list' ? (
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
                                    {visibleRecords.map((rule, idx) => (
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
                                                        {(rule.violations?.length || 0) > 0 && (
                                                            <span className="ml-1 rounded bg-amber-100 px-1 text-[9px] text-amber-700">{rule.violations?.length}</span>
                                                        )}
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
            ) : (
                <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {visibleRecords.map(rule => (
                            <Card key={rule.id} className="flex flex-col">
                                <CardContent className="flex flex-1 flex-col gap-3 p-4">
                                    <div className="flex items-start justify-between gap-2">
                                        <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-bold text-slate-700 text-wrap-anywhere">{rule.code}</code>
                                        <Badge className={cn('rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide', SEVERITY_TONE[rule.severity])}>
                                            {rule.severity}
                                        </Badge>
                                    </div>
                                    <div className="flex-1 space-y-1.5">
                                        <p className="text-sm font-black text-slate-900 text-wrap-anywhere">{rule.title}</p>
                                        {rule.description && (
                                            <p className="text-[11px] font-semibold text-slate-500 text-wrap-anywhere line-clamp-3">{rule.description}</p>
                                        )}
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                                        <Badge
                                            className={cn(
                                                'rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wide',
                                                rule.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'
                                            )}
                                        >
                                            {rule.isActive ? 'Active' : 'Inactive'}
                                        </Badge>
                                        {(rule.violations?.length || 0) > 0 && (
                                            <Badge className="rounded-md border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
                                                {rule.violations?.length} violations
                                            </Badge>
                                        )}
                                        <span className="ml-auto text-[10px] font-bold uppercase tracking-wide text-slate-400" title={formatDateTime(rule.updatedAt)}>
                                            {formatRelative(rule.updatedAt)}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => setViolationsFor(rule)}
                                            className="h-8 flex-1 text-[10px] font-black uppercase tracking-wide"
                                        >
                                            Violations
                                        </Button>
                                        <Button
                                            type="button"
                                            onClick={() => setEditing(rule)}
                                            className="h-8 flex-1 bg-[#12335f] text-[10px] font-black uppercase tracking-wide text-white hover:bg-[#0e2a4f]"
                                        >
                                            Edit
                                        </Button>
                                    </div>
                                </CardContent>
                            </Card>
                        ))}
                    </div>
                    <Pagination
                        page={page}
                        pageSize={pageSize}
                        total={total}
                        onPageChange={setPage}
                        onPageSizeChange={setPageSize}
                        label="rules"
                    />
                </>
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
    const [resolvingId, setResolvingId] = useState<number | null>(null);
    const [remarks, setRemarks] = useState('');

    return (
        <RuleModal title={`Violations · ${rule.code}`} onClose={onClose} wide>
            {violations.isLoading ? (
                <ListSkeleton rows={3} />
            ) : violations.data?.records.length === 0 ? (
                <EmptyState title="No violations recorded" description="This rule has not flagged any record yet." />
            ) : (
                <div className="space-y-3">
                    {violations.data?.records.map(violation => {
                        const hasForensicMetadata = violation.metadata && Object.keys(violation.metadata as object).some(
                            key => !['resolutionRemarks', 'resolvedById', 'resolvedByName', 'resolvedByEmail'].includes(key)
                        );

                        return (
                            <div
                                key={violation.id}
                                className={cn(
                                    "rounded-xl border p-4 space-y-3 transition-all",
                                    violation.status === 'resolved'
                                        ? 'border-emerald-100 bg-emerald-50/10'
                                        : 'border-slate-200 bg-white hover:shadow-md hover:border-slate-300'
                                )}
                            >
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                    <div className="min-w-0 flex-1 space-y-3">
                                        {/* Status & Badges Header */}
                                        <div className="flex flex-wrap items-center gap-2">
                                            <span className="text-xs font-black uppercase tracking-wider text-[#12335f] text-wrap-anywhere bg-slate-100 px-2 py-0.5 rounded">
                                                {violation.type.replace(/_/g, ' ')}
                                            </span>
                                            <Badge
                                                className={cn(
                                                    'rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider',
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
                                                    'rounded-md px-2 py-0.5 text-[10px] font-black uppercase tracking-wider',
                                                    violation.status === 'resolved'
                                                        ? 'border-emerald-200 bg-emerald-100 text-emerald-800'
                                                        : 'border-slate-200 bg-slate-100 text-slate-700'
                                                )}
                                            >
                                                {violation.status}
                                            </Badge>
                                        </div>

                                        {/* Violation Description */}
                                        <div className="text-slate-855">
                                            <p className="text-xs font-extrabold text-slate-800 leading-relaxed text-wrap-anywhere">
                                                {violation.description}
                                            </p>
                                        </div>

                                        {/* Affected Account Details Panel */}
                                        {violation.user && (
                                            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3 space-y-2">
                                                <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-[#12335f]">
                                                    <User className="h-3 w-3" />
                                                    <span>Target Account Profile</span>
                                                </div>
                                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                                                    <div>
                                                        <span className="font-bold text-slate-400">Name: </span>
                                                        <span className="font-black text-slate-700">{violation.user.name || 'N/A'}</span>
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-slate-400">User ID: </span>
                                                        <span className="font-mono font-bold text-slate-600 bg-slate-200/50 px-1 py-0.2 rounded text-[10px]">#{violation.user.id}</span>
                                                    </div>
                                                    {violation.user.email && (
                                                        <div className="sm:col-span-2 flex items-center gap-1">
                                                            <Mail className="h-3 w-3 text-slate-400" />
                                                            <span className="font-bold text-slate-400">Email: </span>
                                                            <span className="font-black text-slate-700 break-all">{violation.user.email}</span>
                                                        </div>
                                                    )}
                                                    <div>
                                                        <span className="font-bold text-slate-400">Account Type: </span>
                                                        <span className="font-black text-slate-700 uppercase text-[10px] tracking-wider">{violation.user.role}</span>
                                                    </div>
                                                    {violation.entityType && (
                                                        <div>
                                                            <span className="font-bold text-slate-400">Linked Entity: </span>
                                                            <span className="font-black text-[#12335f] text-[10px]">
                                                                {violation.entityType}#{violation.entityId}
                                                            </span>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        )}

                                        {/* Forensic Metadata Captures */}
                                        {hasForensicMetadata && (
                                            <div className="rounded-lg bg-slate-50 border border-slate-100 p-3">
                                                <div className="flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-red-800 mb-2">
                                                    <ShieldAlert className="h-3 w-3 text-red-600" />
                                                    <span>Forensic Evidence Captures</span>
                                                </div>
                                                <div className="grid grid-cols-1 gap-1.5 text-[10px] font-mono sm:grid-cols-2">
                                                    {Object.entries(violation.metadata as object).map(([key, val]) => {
                                                        if (['resolutionRemarks', 'resolvedById', 'resolvedByName', 'resolvedByEmail'].includes(key)) return null;
                                                        return (
                                                            <div key={key} className="flex justify-between border-b border-slate-200/50 pb-1 pr-2">
                                                                <span className="text-slate-500 font-bold">{key}:</span>
                                                                <span className="text-slate-800 font-black truncate max-w-[200px]" title={typeof val === 'object' ? JSON.stringify(val) : String(val)}>
                                                                    {typeof val === 'object' ? JSON.stringify(val) : String(val)}
                                                                </span>
                                                            </div>
                                                        );
                                                    })}
                                                </div>

                                                {/* Conflict resolution guidance */}
                                                {(violation.metadata as any)?.existingUserId && (
                                                    <div className="mt-2.5 rounded border border-red-100 bg-red-50/50 p-2 text-[10px] font-bold text-red-800 leading-normal flex items-start gap-1.5">
                                                        <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0 mt-0.5" />
                                                        <div>
                                                            Security Conflict: This account shares protected credentials with another onboarding account (User ID #{(violation.metadata as any).existingUserId}). Resolving this flag overrides the duplicate validation block.
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Resolved Audit Panel */}
                                        {violation.status === 'resolved' && (
                                            <div className="rounded-lg border border-emerald-200 bg-emerald-50/30 p-3 space-y-2">
                                                <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider text-emerald-800">
                                                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                                                    <span>Resolution Verification Record</span>
                                                </div>
                                                <div className="grid grid-cols-1 gap-2 text-xs font-semibold sm:grid-cols-2 text-slate-600">
                                                    <div>
                                                        <span className="font-bold text-slate-500">Authorized By:</span>{' '}
                                                        <span className="font-black text-[#12335f] block sm:inline">
                                                            {(violation.metadata as any)?.resolvedByName || 'Administrator'}
                                                        </span>
                                                        {((violation.metadata as any)?.resolvedByEmail) && (
                                                            <span className="block text-[10px] font-bold text-slate-400">
                                                                {(violation.metadata as any).resolvedByEmail}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <div>
                                                        <span className="font-bold text-slate-500">Verified Timestamp:</span>{' '}
                                                        <span className="font-black text-slate-700 block" title={violation.resolvedAt ? formatDateTime(violation.resolvedAt) : formatDateTime(violation.updatedAt)}>
                                                            {violation.resolvedAt ? formatDateTime(violation.resolvedAt) : formatDateTime(violation.updatedAt)}
                                                        </span>
                                                    </div>
                                                </div>
                                                {((violation.metadata as any)?.resolutionRemarks) && (
                                                    <div className="mt-2.5 border-t border-emerald-100 pt-2 text-xs font-semibold text-slate-600 bg-white/70 p-2.5 rounded-md border border-emerald-50">
                                                        <div className="text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1">Resolution Audit Justification</div>
                                                        <p className="text-slate-700 italic">"{(violation.metadata as any).resolutionRemarks}"</p>
                                                    </div>
                                                )}
                                            </div>
                                        )}

                                        {/* Date and Timeline Details */}
                                        <div className="flex items-center gap-1 text-[10px] font-bold text-slate-400 pt-1">
                                            <Clock className="h-3.5 w-3.5" />
                                            <span>
                                                Incident Flagged: {formatDateTime(violation.createdAt)} ({formatRelative(violation.createdAt)})
                                            </span>
                                        </div>

                                        {/* Resolution Action Card */}
                                        {resolvingId === violation.id && (
                                            <div className="mt-3 rounded-lg border border-emerald-100 bg-emerald-50/20 p-3 space-y-2">
                                                <p className="text-[9px] font-black uppercase tracking-widest text-[#12335f]">Provide Resolution Justification</p>
                                                <textarea
                                                    value={remarks}
                                                    onChange={e => setRemarks(e.target.value)}
                                                    placeholder="Explain resolution for audit records (e.g. verified original documents, developer sandbox exceptions)..."
                                                    rows={2}
                                                    className="w-full rounded-lg border border-slate-200 bg-white p-2 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#12335f]/20"
                                                    maxLength={1000}
                                                />
                                                <div className="flex justify-end gap-1.5">
                                                    <Button
                                                        type="button"
                                                        variant="outline"
                                                        onClick={() => {
                                                            setResolvingId(null);
                                                            setRemarks('');
                                                        }}
                                                        className="h-7 text-[9px] font-black uppercase"
                                                    >
                                                        Cancel
                                                    </Button>
                                                    <Button
                                                        type="button"
                                                        onClick={() =>
                                                            runWithToast(() => resolveMut.mutateAsync({ id: violation.id, remarks }), {
                                                                loading: 'Resolving flag...',
                                                                success: 'Violation resolved successfully',
                                                                error: 'Resolve failed'
                                                            }).then(() => {
                                                                setResolvingId(null);
                                                                setRemarks('');
                                                                violations.refetch();
                                                            })
                                                        }
                                                        className="h-7 bg-emerald-600 hover:bg-emerald-700 text-white text-[9px] font-black uppercase"
                                                        disabled={!remarks.trim()}
                                                    >
                                                        Confirm Resolve
                                                    </Button>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Action Button */}
                                    {violation.status !== 'resolved' && resolvingId !== violation.id && (
                                        <Button
                                            type="button"
                                            variant="outline"
                                            onClick={() => {
                                                setResolvingId(violation.id);
                                                setRemarks('');
                                            }}
                                            className="h-8 rounded-md border-emerald-200 text-emerald-700 text-[10px] font-black uppercase ml-auto self-start shrink-0"
                                        >
                                            <CheckCircle2 className="mr-1.5 h-3 w-3" /> Resolve
                                        </Button>
                                    )}
                                </div>
                            </div>
                        );
                    })}
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

// MetricCard removed in favor of the shared <KpiTile> component.

