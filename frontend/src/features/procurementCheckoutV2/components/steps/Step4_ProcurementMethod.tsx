'use client';

import { useEffect } from 'react';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '../../../../components/ui/button';
import { SearchableSelect } from '../../../../components/ui/SearchableSelect';
import { PROCUREMENT_METHOD_LABELS } from '../../constants';
import type { CartEvaluation, ProcurementMethodCode } from '../../types';
import { createL1ComparisonFromCart } from '../../api';
import { toast } from 'sonner';

const RequiredMark = () => <span className="ml-0.5 text-red-600">*</span>;

export default function Step4_ProcurementMethod({
  cartId,
  selectedMethod,
  evaluation,
  demandSplittingConfirmation,
  onSelect,
  onDemandSplitConfirm,
  onEvaluationRefresh,
  onL1Created,
  errors,
}: {
  cartId?: number;
  selectedMethod: string;
  evaluation: CartEvaluation | null;
  demandSplittingConfirmation: boolean;
  onSelect: (method: ProcurementMethodCode) => void;
  onDemandSplitConfirm: (v: boolean) => void;
  onEvaluationRefresh: () => void;
  onL1Created: (id: number) => void;
  errors: Record<string, string>;
}) {
  useEffect(() => {
    onEvaluationRefresh();
  }, [cartId]);

  const handleL1Comparison = async () => {
    if (!cartId) return;
    try {
      const res = await createL1ComparisonFromCart(cartId);
      onL1Created(res.comparison.id);
      toast.success('L1 comparison created');
    } catch (err: any) {
      toast.error(err?.message || 'L1 comparison failed');
    }
  };

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-black text-slate-950">Step 4 — Procurement Method Selection</h2>
      {!evaluation ? (
        <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Evaluating cart…</div>
      ) : (
        <>
          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-sm">
            <p className="font-bold text-blue-900">Recommended: {PROCUREMENT_METHOD_LABELS[evaluation.recommendedMethod] || evaluation.recommendedMethod}</p>
            <p className="text-blue-800">Cart value: ₹{evaluation.cartValue.toLocaleString('en-IN')} · Sellers: {evaluation.sellerCount}</p>
          </div>

          {evaluation.warnings.map(w => (
            <div key={w} className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
              {w}
            </div>
          ))}

          <div className="space-y-1">
            <label className="text-xs font-bold">Procurement Method<RequiredMark /></label>
            <SearchableSelect
              options={evaluation.allowedMethods.map(m => ({ value: m, label: PROCUREMENT_METHOD_LABELS[m] || m }))}
              value={selectedMethod || evaluation.recommendedMethod}
              onChange={v => onSelect(String(v) as ProcurementMethodCode)}
            />
            {errors.selectedMethod && <p className="text-[10px] text-red-600">{errors.selectedMethod}</p>}
          </div>

          {(selectedMethod === 'L1_PURCHASE' || evaluation.l1Required) && (
            <Button type="button" variant="outline" onClick={handleL1Comparison}>Run L1 Comparison from Cart</Button>
          )}

          {evaluation.demandSplittingRisk && (
            <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
              <input type="checkbox" checked={demandSplittingConfirmation} onChange={e => onDemandSplitConfirm(e.target.checked)} />
              I confirm this purchase is not split to avoid Bid/RA or higher approval.
            </label>
          )}
        </>
      )}
    </div>
  );
}
