import { CheckCircle2, Circle, Clock, Info } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { LIFECYCLE_LABELS, LIFECYCLE_STAGES, type ProcurementLifecycleEvent, type ProcurementLifecycleStage } from '../statusMapper';

const formatDate = (value?: string) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function ProcurementLifecycleTracker({
  currentStage,
  events = [],
  nextAction,
  role,
  sourceType,
  compact,
  showTechnicalStatus,
}: {
  currentStage?: ProcurementLifecycleStage;
  events?: ProcurementLifecycleEvent[];
  nextAction?: string;
  role?: string;
  sourceType?: string;
  compact?: boolean;
  showTechnicalStatus?: boolean;
}) {
  const completed = new Map(events.map(event => [event.stage, event]));
  const currentIndex = currentStage ? LIFECYCLE_STAGES.indexOf(currentStage) : Math.max(0, events.length - 1);

  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-2 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Lifecycle Tracker</p>
          <h2 className="text-sm font-black text-slate-950">Procurement to settlement</h2>
        </div>
        <div className="flex flex-wrap gap-2 text-[10px] font-black uppercase tracking-wide text-slate-500">
          {role && <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">{role}</span>}
          {sourceType && <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-1">{sourceType}</span>}
        </div>
      </div>

      <div className={cn('grid gap-2 p-4', compact ? 'sm:grid-cols-2 lg:grid-cols-3' : 'sm:grid-cols-2 xl:grid-cols-3')}>
        {LIFECYCLE_STAGES.map((stage, index) => {
          const event = completed.get(stage);
          const done = Boolean(event);
          const active = stage === currentStage || (!currentStage && index === currentIndex);
          const Icon = done ? CheckCircle2 : active ? Clock : Circle;
          return (
            <div
              key={stage}
              className={cn(
                'rounded-md border p-3',
                done ? 'border-emerald-200 bg-emerald-50' : active ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'
              )}
            >
              <div className="flex items-start gap-2">
                <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', done ? 'text-emerald-700' : active ? 'text-amber-700' : 'text-slate-300')} />
                <div className="min-w-0">
                  <p className="text-xs font-black text-slate-900">{index + 1}. {LIFECYCLE_LABELS[stage]}</p>
                  {event?.description && !compact && (
                    <p className="mt-1 text-[10px] font-semibold leading-relaxed text-slate-600 text-wrap-anywhere">{event.description}</p>
                  )}
                  {(event?.createdAt || (showTechnicalStatus && event?.status)) && (
                    <p className="mt-1 text-[9px] font-black uppercase tracking-wide text-slate-400">
                      {[formatDate(event?.createdAt), showTechnicalStatus ? event?.status : ''].filter(Boolean).join(' / ')}
                    </p>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {nextAction && (
        <div className="mx-4 mb-4 flex items-start gap-2 rounded-md border border-blue-100 bg-blue-50 p-3 text-xs font-semibold text-blue-800">
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{nextAction}</span>
        </div>
      )}
    </section>
  );
}
