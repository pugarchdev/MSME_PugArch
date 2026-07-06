import { AlertTriangle, ShieldAlert, ShieldCheck, Info } from 'lucide-react';
import type { ProcurementComplianceWarning } from './types';

const SEVERITY_STYLES: Record<string, { bg: string; border: string; icon: typeof AlertTriangle; label: string }> = {
  critical: { bg: 'bg-red-50', border: 'border-red-300', icon: ShieldAlert, label: 'Critical' },
  high: { bg: 'bg-orange-50', border: 'border-orange-300', icon: AlertTriangle, label: 'High' },
  medium: { bg: 'bg-amber-50', border: 'border-amber-300', icon: AlertTriangle, label: 'Medium' },
  low: { bg: 'bg-blue-50', border: 'border-blue-300', icon: Info, label: 'Low' },
};

interface Props {
  warnings: ProcurementComplianceWarning[];
  title?: string;
}

export default function ProcurementCompliancePanel({ warnings, title = 'Compliance Checks' }: Props) {
  if (!warnings.length) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3">
        <ShieldCheck className="h-4 w-4 text-emerald-600" />
        <span className="text-xs font-bold text-emerald-800">All compliance checks passed</span>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</p>
      {warnings.map((w, i) => {
        const style = SEVERITY_STYLES[w.severity] || SEVERITY_STYLES.medium;
        const Icon = style.icon;
        return (
          <div key={`${w.ruleCode}-${i}`} className={`rounded-lg border ${style.border} ${style.bg} p-3`}>
            <div className="flex items-start gap-2">
              <Icon className="mt-0.5 h-4 w-4 flex-shrink-0 opacity-80" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[9px] font-black uppercase tracking-wider opacity-60">{style.label}</span>
                  <span className="rounded bg-white/60 px-1.5 py-0.5 text-[9px] font-bold opacity-70">{w.ruleCode}</span>
                </div>
                <p className="mt-0.5 text-xs font-semibold leading-snug">{w.message}</p>
                <p className="mt-1 text-[11px] leading-snug opacity-70">{w.recommendation}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
