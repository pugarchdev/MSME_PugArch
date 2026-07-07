import { useQuery } from '@tanstack/react-query';
import { Clock, User, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import { fetchProcurementAuditTrail } from './api';
import { AUDIT_ACTION_LABELS, AUDIT_ACTION_COLORS, type ProcurementAuditEntry } from './types';
import { CANONICAL_METHOD_LABELS } from '../../types/enums';

interface Props {
  bidId: number | string;
  title?: string;
}

export default function ProcurementAuditTrailPanel({ bidId, title = 'Audit Trail' }: Props) {
  const { data: entries, isLoading, error } = useQuery({
    queryKey: ['procurement-audit', bidId],
    queryFn: () => fetchProcurementAuditTrail(bidId),
    enabled: !!bidId,
  });

  if (isLoading) return <div className="py-6 text-center text-xs text-slate-400">Loading audit trail…</div>;
  if (error) return <div className="py-6 text-center text-xs text-red-500">Failed to load audit trail.</div>;
  if (!entries?.length) return <div className="py-6 text-center text-xs text-slate-400">No audit entries found.</div>;

  return (
    <div className="space-y-1">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</p>
      <div className="relative space-y-0">
        <div className="absolute left-3 top-0 h-full w-px bg-slate-200" />
        {entries.map((entry) => (
          <AuditEntryRow key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  );
}

function AuditEntryRow({ entry }: { entry: ProcurementAuditEntry }) {
  const [expanded, setExpanded] = useState(false);
  const label = AUDIT_ACTION_LABELS[entry.action] || entry.action;
  const colorClass = AUDIT_ACTION_COLORS[entry.action] || 'bg-slate-100 text-slate-700';
  const methodLabel = entry.newValue?.canonicalMethod
    ? CANONICAL_METHOD_LABELS[String(entry.newValue.canonicalMethod)] || String(entry.newValue.canonicalMethod)
    : null;
  const hasDetails = entry.oldValue || entry.newValue;
  const date = new Date(entry.createdAt);

  return (
    <div className="relative flex gap-3 py-2 pl-7">
      <div className="absolute left-[7px] top-[14px] z-10 h-2.5 w-2.5 rounded-full border-2 border-white bg-slate-400" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`inline-block rounded-full px-2 py-0.5 text-[10px] font-bold ${colorClass}`}>
            {label}
          </span>
          {methodLabel && (
            <span className="rounded bg-indigo-50 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">
              {methodLabel}
            </span>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-3 text-[10px] text-slate-500">
          <span className="flex items-center gap-1">
            <User className="h-3 w-3" />
            {entry.user?.name || entry.role || `User #${entry.userId}`}
          </span>
          <span className="flex items-center gap-1">
            <Clock className="h-3 w-3" />
            {date.toLocaleDateString('en-IN')} {date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
          </span>
        </div>
        {hasDetails && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="mt-1 flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-800"
          >
            {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
            {expanded ? 'Hide details' : 'Show details'}
          </button>
        )}
        {expanded && hasDetails && (
          <pre className="mt-1 max-h-40 overflow-auto rounded bg-slate-50 p-2 text-[10px] text-slate-600">
            {JSON.stringify(entry.newValue || entry.oldValue, null, 2)}
          </pre>
        )}
      </div>
    </div>
  );
}
