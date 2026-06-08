import { AlertTriangle, Inbox, type LucideIcon } from 'lucide-react';
import { Button } from '../../components/ui/button';

export function LoadingState({ label = 'Loading records...' }: { label?: string }) {
  return (
    <div className="space-y-4 animate-in fade-in duration-200">
      {/* Page heading skeleton */}
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-2">
          <div className="h-3 w-24 animate-pulse rounded bg-slate-200" />
          <div className="h-7 w-48 animate-pulse rounded-md bg-slate-200" />
          <div className="h-3.5 w-72 animate-pulse rounded bg-slate-100" />
        </div>
        <div className="h-10 w-28 animate-pulse rounded-lg bg-slate-100" />
      </div>
      {/* Metric cards skeleton */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        {[1, 2, 3, 4].map(i => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="h-2.5 w-16 animate-pulse rounded bg-slate-100" />
            <div className="mt-2 h-6 w-12 animate-pulse rounded bg-slate-200" />
          </div>
        ))}
      </div>
      {/* Table/content skeleton */}
      <div className="rounded-lg border border-slate-200 bg-white overflow-hidden">
        <div className="bg-slate-50 px-4 py-3 flex gap-6">
          {[1, 2, 3, 4, 5].map(i => (
            <div key={i} className="h-3 w-16 animate-pulse rounded bg-slate-200" />
          ))}
        </div>
        {[1, 2, 3, 4, 5].map(i => (
          <div key={i} className="border-t border-slate-100 px-4 py-3.5 flex items-center gap-6">
            <div className="h-3.5 w-20 animate-pulse rounded bg-slate-100" />
            <div className="h-3.5 w-32 animate-pulse rounded bg-slate-100" />
            <div className="h-3.5 w-24 animate-pulse rounded bg-slate-100" />
            <div className="h-3.5 w-16 animate-pulse rounded bg-slate-100" />
            <div className="h-3.5 w-20 animate-pulse rounded bg-slate-100" />
          </div>
        ))}
      </div>
      <span className="sr-only">{label}</span>
    </div>
  );
}

interface EmptyStateProps {
  title?: string;
  description?: string;
  icon?: LucideIcon;
  /** Optional CTA button. */
  action?: { label: string; onClick: () => void };
}

export function EmptyState({
  title = 'No records found',
  description = 'Try changing filters or create a new record.',
  icon: Icon = Inbox,
  action
}: EmptyStateProps) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-slate-100">
        <Icon className="h-6 w-6 text-slate-400" />
      </div>
      <h3 className="mt-3 text-sm font-black text-slate-900 text-wrap-anywhere">{title}</h3>
      <p className="mt-1 max-w-md text-xs font-semibold text-slate-500 text-wrap-anywhere">{description}</p>
      {action && (
        <Button onClick={action.onClick} className="mt-4 bg-[#12335f] text-white hover:bg-[#0e2a4f]">
          {action.label}
        </Button>
      )}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex min-h-48 flex-col items-center justify-center rounded-lg border border-red-200 bg-red-50 p-8 text-center">
      <AlertTriangle className="h-8 w-8 text-red-500" />
      <h3 className="mt-3 text-sm font-black text-red-900">Unable to load data</h3>
      <p className="mt-1 max-w-md text-xs font-semibold text-red-700">{message}</p>
      {onRetry && <Button onClick={onRetry} className="mt-4 h-9 rounded-md bg-red-700 px-4 text-xs font-black text-white">Retry</Button>}
    </div>
  );
}

export function InlineError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-3">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-500" />
        <div>
          <p className="mt-1 text-xs font-semibold text-red-700">{message}</p>
        </div>
      </div>
      {onRetry && <Button onClick={onRetry} className="h-9 shrink-0 rounded-md bg-red-700 px-4 text-xs font-black text-white">Retry</Button>}
    </div>
  );
}
