import { useMemo, useState } from 'react';
import { AlertTriangle, Eye, Filter, RefreshCw, Search, ShieldCheck, Users, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, ErrorState, LoadingState } from '../../shared/FeatureStates';
import { formatDate } from '../../shared/format';
import { useFeatureQuery } from '../../shared/hooks';

type AdminKind = 'users' | 'audit' | 'fraud' | 'rules';
type RecordMap = Record<string, any>;

const config = {
  users: {
    title: 'Users',
    eyebrow: 'Admin Registry',
    description: 'Account status, role, onboarding state, sessions, and compliance signals.',
    endpoint: '/api/admin/users',
    icon: Users
  },
  audit: {
    title: 'Audit Logs',
    eyebrow: 'Administrative Trail',
    description: 'Write actions, actors, affected entities, and immutable event payloads.',
    endpoint: '/api/admin/audit-logs',
    icon: Eye
  },
  fraud: {
    title: 'Fraud Alerts',
    eyebrow: 'Risk Monitoring',
    description: 'Risk alerts, severity, review state, linked user, and entity references.',
    endpoint: '/api/admin/fraud-alerts',
    icon: AlertTriangle
  },
  rules: {
    title: 'Compliance Rules',
    eyebrow: 'Policy Controls',
    description: 'Active compliance rules, severity, violation samples, and control coverage.',
    endpoint: '/api/admin/compliance-rules',
    icon: ShieldCheck
  }
} satisfies Record<AdminKind, { title: string; eyebrow: string; description: string; endpoint: string; icon: any }>;

const readRecords = (data: any): RecordMap[] => Array.isArray(data) ? data : data?.records || data?.data?.records || [];
const totalOf = (data: any, fallback: number) => Number(data?.total ?? data?.data?.total ?? fallback);
const label = (value: unknown) => String(value ?? '-').replace(/_/g, ' ');

const rowTitle = (kind: AdminKind, record: RecordMap) => {
  if (kind === 'users') return record.name || record.email || `User #${record.id}`;
  if (kind === 'audit') return record.action || `Audit #${record.id}`;
  if (kind === 'fraud') return record.alertType || `Alert #${record.id}`;
  return record.title || record.code || `Rule #${record.id}`;
};

const rowSubtitle = (kind: AdminKind, record: RecordMap) => {
  if (kind === 'users') return [record.email, record.mobile, record.organization?.name].filter(Boolean).join(' | ');
  if (kind === 'audit') return [record.User?.email, record.entityType && `${record.entityType} #${record.entityId || '-'}`].filter(Boolean).join(' | ');
  if (kind === 'fraud') return [record.user?.email, record.entityType && `${record.entityType} #${record.entityId || '-'}`].filter(Boolean).join(' | ');
  return record.description || record.code || '-';
};

const statusOf = (kind: AdminKind, record: RecordMap) => {
  if (kind === 'users') return record.accountStatus || record.onboardingStatus || record.role;
  if (kind === 'audit') return record.entityType || 'recorded';
  if (kind === 'rules') return record.isActive === false ? 'inactive' : 'active';
  return record.status || 'open';
};

const severityClass = (value: unknown) => {
  const normalized = String(value || '').toLowerCase();
  if (['critical', 'high'].includes(normalized)) return 'border-rose-200 bg-rose-50 text-rose-700';
  if (['medium', 'pending', 'under_compliance_review'].includes(normalized)) return 'border-amber-200 bg-amber-50 text-amber-700';
  if (['active', 'approved_for_procurement', 'low', 'closed', 'resolved'].includes(normalized)) return 'border-emerald-200 bg-emerald-50 text-emerald-700';
  return 'border-blue-200 bg-blue-50 text-blue-700';
};

export default function AdminRecordsPage({ kind }: { kind: AdminKind }) {
  const cfg = config[kind];
  const [query, setQuery] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [severity, setSeverity] = useState('');
  const [selected, setSelected] = useState<RecordMap | null>(null);
  const params = new URLSearchParams();
  if (query.trim()) params.set('q', query.trim());
  if (role) params.set('role', role);
  if (status) params.set('status', status);
  if (kind === 'users' && status) params.set('accountStatus', status);
  if (severity) params.set('severity', severity);
  const endpoint = `${cfg.endpoint}${params.toString() ? `?${params.toString()}` : ''}`;
  const { data, loading, error, reload } = useFeatureQuery<any>(endpoint, { records: [] });
  const records = readRecords(data);
  const total = totalOf(data, records.length);
  const Icon = cfg.icon;

  const metrics = useMemo(() => {
    const open = records.filter(record => ['open', 'pending', 'PENDING', 'under_compliance_review'].includes(String(statusOf(kind, record)))).length;
    const critical = records.filter(record => ['HIGH', 'CRITICAL', 'high', 'critical'].includes(String(record.severity))).length;
    return [
      { label: 'Loaded', value: records.length },
      { label: 'Matched', value: total },
      { label: kind === 'fraud' || kind === 'rules' ? 'High Risk' : 'Pending', value: kind === 'fraud' || kind === 'rules' ? critical : open }
    ];
  }, [kind, records, total]);

  if (loading) return <LoadingState label={`Loading ${cfg.title.toLowerCase()}...`} />;
  if (error) return <ErrorState message={error} onRetry={reload} />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{cfg.eyebrow}</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">{cfg.title}</h1>
          <p className="mt-1 max-w-3xl text-xs font-semibold text-slate-500">{cfg.description}</p>
        </div>
        <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-3">
        {metrics.map(item => (
          <Card key={item.label}><CardContent className="flex items-center justify-between p-4"><div><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{item.label}</p><p className="mt-1 text-2xl font-black text-slate-950">{item.value}</p></div><Icon className="h-5 w-5 text-[#12335f]" /></CardContent></Card>
        ))}
      </div>

      <Card><CardContent className="grid gap-3 p-4 lg:grid-cols-[1fr_160px_160px_160px]">
        <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><input value={query} onChange={event => setQuery(event.target.value)} placeholder={`Search ${cfg.title.toLowerCase()}...`} className="h-10 w-full rounded-lg border border-slate-200 pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" /></div>
        <select value={role} onChange={event => setRole(event.target.value)} disabled={kind !== 'users'} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold disabled:bg-slate-50 disabled:text-slate-300"><option value="">All roles</option><option value="admin">Admin</option><option value="buyer">Buyer</option><option value="seller">Seller</option></select>
        <select value={status} onChange={event => setStatus(event.target.value)} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold"><option value="">All statuses</option><option value="PENDING">Pending</option><option value="ACTIVE">Active</option><option value="OPEN">Open</option><option value="CLOSED">Closed</option><option value="approved_for_procurement">Approved onboarding</option></select>
        <select value={severity} onChange={event => setSeverity(event.target.value)} disabled={!['fraud', 'rules'].includes(kind)} className="h-10 rounded-lg border border-slate-200 px-3 text-xs font-bold disabled:bg-slate-50 disabled:text-slate-300"><option value="">All severity</option><option value="LOW">Low</option><option value="MEDIUM">Medium</option><option value="HIGH">High</option><option value="CRITICAL">Critical</option></select>
      </CardContent></Card>

      {records.length === 0 ? (
        <EmptyState title={kind === 'fraud' ? 'No active fraud alerts' : `No ${cfg.title.toLowerCase()} found`} />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full min-w-[940px] text-left text-sm">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500"><tr><th className="p-3">Record</th><th className="p-3">Status</th><th className="p-3">Severity/Role</th><th className="p-3">Signals</th><th className="p-3">Date</th><th className="p-3">Action</th></tr></thead>
            <tbody className="divide-y divide-slate-100">
              {records.map(record => (
                <tr key={`${kind}-${record.id || rowTitle(kind, record)}`} className="hover:bg-slate-50">
                  <td className="p-3"><p className="font-black text-slate-900">{rowTitle(kind, record)}</p><p className="max-w-md truncate text-[10px] font-semibold text-slate-500">{rowSubtitle(kind, record) || `#${record.id || '-'}`}</p></td>
                  <td className="p-3"><span className={`rounded-lg border px-3 py-1 text-[10px] font-black uppercase ${severityClass(statusOf(kind, record))}`}>{label(statusOf(kind, record))}</span></td>
                  <td className="p-3 text-xs font-black uppercase text-slate-700">{label(record.severity || record.role || record.alertType || '-')}</td>
                  <td className="p-3 text-xs font-bold text-slate-500">{signalText(kind, record)}</td>
                  <td className="p-3 text-xs font-bold text-slate-500">{formatDate(record.createdAt || record.updatedAt)}</td>
                  <td className="p-3"><Button variant="outline" onClick={() => setSelected(record)} className="h-9 rounded-lg text-xs font-black"><Eye className="mr-2 h-4 w-4" />View</Button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <DetailPanel kind={kind} record={selected} onClose={() => setSelected(null)} />}
    </div>
  );
}

function signalText(kind: AdminKind, record: RecordMap) {
  if (kind === 'users') return `${record.sessions?.length || 0} sessions | ${record.complianceViolations?.length || 0} flags`;
  if (kind === 'audit') return record.entityType ? `${record.entityType} #${record.entityId || '-'}` : 'System event';
  if (kind === 'fraud') return record.reviewedAt ? `Reviewed ${formatDate(record.reviewedAt)}` : 'Awaiting review';
  return `${record.violations?.length || 0} recent violations`;
}

function DetailPanel({ kind, record, onClose }: { kind: AdminKind; record: RecordMap; onClose: () => void }) {
  const safeRecord = { ...record };
  delete safeRecord.password;
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-950/30">
      <aside className="h-full w-full max-w-2xl overflow-y-auto bg-white shadow-xl">
        <div className="sticky top-0 z-10 flex items-start justify-between border-b border-slate-200 bg-white p-5">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{config[kind].title} Detail</p>
            <h2 className="mt-1 text-xl font-black text-slate-950">{rowTitle(kind, record)}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{rowSubtitle(kind, record)}</p>
          </div>
          <button onClick={onClose} className="rounded-lg border border-slate-200 p-2 text-slate-500 hover:bg-slate-50" aria-label="Close detail"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 p-5">
          <div className="grid gap-3 md:grid-cols-3">
            <DetailMetric label="Status" value={label(statusOf(kind, record))} />
            <DetailMetric label="Severity/Role" value={label(record.severity || record.role || '-')} />
            <DetailMetric label="Created" value={formatDate(record.createdAt)} />
          </div>
          <Card><CardContent className="space-y-3 p-4">
            <div className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-500"><Filter className="h-4 w-4" /> Full Record</div>
            <pre className="max-h-[520px] overflow-auto rounded-lg bg-slate-950 p-4 text-xs font-semibold leading-relaxed text-slate-100">{JSON.stringify(safeRecord, null, 2)}</pre>
          </CardContent></Card>
        </div>
      </aside>
    </div>
  );
}

function DetailMetric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-lg border border-slate-200 bg-slate-50 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-900">{value}</p></div>;
}
