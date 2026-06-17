import { CheckCircle2 } from 'lucide-react';
import { Badge } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import type { ProcurementMethod, ProcurementMethodRecommendation } from '../types';
import { METHOD_LABELS } from '../types';

const options = Object.entries(METHOD_LABELS) as Array<[ProcurementMethod, string]>;

export default function RecommendationStep({
  recommendation,
  selectedMethod,
  onSelect,
}: {
  recommendation: ProcurementMethodRecommendation;
  selectedMethod?: ProcurementMethod;
  onSelect: (method: ProcurementMethod) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-600 text-white">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-base font-black text-emerald-950">{METHOD_LABELS[recommendation.method]}</h2>
              <Badge variant="success">{recommendation.confidence} confidence</Badge>
            </div>
            <p className="mt-2 text-sm font-semibold leading-relaxed text-emerald-800">
              Based on your requirement, the recommended method is {METHOD_LABELS[recommendation.method].toLowerCase()} because {recommendation.reason.charAt(0).toLowerCase() + recommendation.reason.slice(1)}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Confirm method</p>
        <div className="mt-3 grid gap-2 md:grid-cols-2">
          {options.map(([method, label]) => (
            <Button
              key={method}
              type="button"
              variant={selectedMethod === method ? 'primary' : 'outline'}
              onClick={() => onSelect(method)}
              className="h-auto justify-start rounded-md px-3 py-3 text-left text-xs"
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
