import React from 'react';
import { Plus, X } from 'lucide-react';

export const GST_STANDARD_RATES = [0, 0.1, 0.25, 1, 1.5, 3, 5, 6, 7.5, 12, 18, 28, 40];

export type GstBreakdown = {
  /** Total of the GST portion only (CGST+SGST split rate + IGST rate). */
  standardRate: number;
  additionalRate: number;
  /** Grand total rate: split + igst + other. */
  totalRate: number;
  cgstRate: number;
  sgstRate: number;
  igstRate: number;
  additionalTaxAmount: number;
  cgstAmount: number;
  sgstAmount: number;
  igstAmount: number;
  totalTaxAmount: number;
  label: string;
};

const money = (value: number) => Number(value.toFixed(2));
export const toTaxNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const formatTaxRate = (value: number) =>
  Number.isInteger(value) ? String(value) : String(value).replace(/0+$/, '').replace(/\.$/, '');

/**
 * Compute the full tax breakdown. GST must be applied either as CGST+SGST
 * (intrastate) OR as IGST (interstate), never both at the same time. The
 * optional additional rate is reserved for separate non-GST taxes/cess.
 */
export const calculateGstBreakdown = (
  taxableAmount: number,
  splitRateInput: unknown,
  igstRateInput: unknown,
  additionalRateInput: unknown = 0
): GstBreakdown => {
  const rawSplitRate = toTaxNumber(splitRateInput);
  const rawIgstRate = toTaxNumber(igstRateInput);
  const splitRate = rawSplitRate > 0 ? rawSplitRate : 0;
  const igstRate = splitRate > 0 ? 0 : rawIgstRate;
  const additionalRate = toTaxNumber(additionalRateInput);

  const standardRate = money(splitRate || igstRate);
  const totalRate = money(standardRate + additionalRate);
  const cgstRate = splitRate / 2;
  const sgstRate = splitRate / 2;

  const cgstAmount = money(taxableAmount * cgstRate / 100);
  const sgstAmount = money(taxableAmount * sgstRate / 100);
  const igstAmount = money(taxableAmount * igstRate / 100);
  const additionalTaxAmount = money(taxableAmount * additionalRate / 100);

  return {
    standardRate,
    additionalRate,
    totalRate,
    cgstRate,
    sgstRate,
    igstRate,
    additionalTaxAmount,
    cgstAmount,
    sgstAmount,
    igstAmount,
    totalTaxAmount: money(cgstAmount + sgstAmount + igstAmount + additionalTaxAmount),
    label: [
      splitRate > 0 ? `CGST ${formatTaxRate(cgstRate)}% + SGST ${formatTaxRate(sgstRate)}%` : '',
      igstRate > 0 ? `IGST ${formatTaxRate(igstRate)}%` : '',
      additionalRate > 0 ? `Other ${formatTaxRate(additionalRate)}%` : ''
    ].filter(Boolean).join(' + ') || 'No tax'
  };
};

type GstTaxPickerProps = {
  /** Combined CGST+SGST rate as a string (e.g. "18"). Empty = not applied. */
  splitRate: string;
  /** IGST rate as a string. Empty = not applied. */
  igstRate: string;
  additionalRate: string;
  onChange: (next: { splitRate: string; igstRate: string; additionalRate: string }) => void;
  totalInputName?: string;
  taxableAmount?: number;
  className?: string;
};

export function GstTaxPicker({
  splitRate,
  igstRate,
  additionalRate,
  onChange,
  totalInputName,
  taxableAmount = 0,
  className = ''
}: GstTaxPickerProps) {
  const [otherTaxes, setOtherTaxes] = React.useState<Array<{ id: number; name: string; rate: string }>>([]);
  const otherTaxTotal = otherTaxes.reduce((sum, tax) => sum + toTaxNumber(tax.rate), 0);
  const effectiveAdditionalRate = otherTaxes.length > 0 ? String(otherTaxTotal) : additionalRate;
  const breakdown = calculateGstBreakdown(taxableAmount, splitRate, igstRate, effectiveAdditionalRate);

  const syncOtherTaxes = (rows: Array<{ id: number; name: string; rate: string }>) => {
    setOtherTaxes(rows);
    const total = rows.reduce((sum, tax) => sum + toTaxNumber(tax.rate), 0);
    onChange({ splitRate, igstRate, additionalRate: total ? String(total) : '' });
  };

  return (
    <div className={className}>
      {totalInputName && <input type="hidden" name={totalInputName} value={breakdown.totalRate} />}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
          CGST + SGST Rate (%)
          <select
            value={splitRate}
            onChange={event => onChange({ splitRate: event.target.value, igstRate: event.target.value ? '' : igstRate, additionalRate })}
            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/20"
          >
            <option value="">-Select-</option>
            {GST_STANDARD_RATES.map(rate => (
              <option key={`split-${rate}`} value={String(rate)}>
                {rate === 0 ? '0 + 0' : `${formatTaxRate(rate / 2)} + ${formatTaxRate(rate / 2)}`}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
          IGST Rate (%)
          <select
            value={igstRate}
            onChange={event => onChange({ splitRate: event.target.value ? '' : splitRate, igstRate: event.target.value, additionalRate })}
            className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/20"
          >
            <option value="">-Select-</option>
            {GST_STANDARD_RATES.map(rate => (
              <option key={`igst-${rate}`} value={String(rate)}>{formatTaxRate(rate)}</option>
            ))}
          </select>
        </label>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Other Tax (%)</span>
            <button
              type="button"
              onClick={() => syncOtherTaxes([...otherTaxes, { id: Date.now(), name: '', rate: '' }])}
              className="flex h-7 w-7 items-center justify-center rounded-md border border-[#12335f]/20 bg-white text-[#12335f] hover:bg-[#12335f]/5"
              title="Add other tax"
            >
              <Plus className="h-3.5 w-3.5" />
            </button>
          </div>

          {otherTaxes.length === 0 ? (
            <button
              type="button"
              onClick={() => syncOtherTaxes([{ id: Date.now(), name: '', rate: additionalRate || '' }])}
              className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 px-3 text-left text-xs font-semibold text-slate-400 outline-none hover:border-[#12335f]/40"
            >
              Add if applicable
            </button>
          ) : (
            <div className="space-y-2">
              {otherTaxes.map((tax) => (
                <div key={tax.id} className="grid grid-cols-[1fr_90px_28px] gap-2">
                  <input
                    type="text"
                    value={tax.name}
                    onChange={event => syncOtherTaxes(otherTaxes.map(row => row.id === tax.id ? { ...row, name: event.target.value } : row))}
                    placeholder="Tax name"
                    className="h-10 min-w-0 rounded-md border border-slate-200 bg-slate-50 px-3 text-xs font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/20"
                  />
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.01"
                    value={tax.rate}
                    onChange={event => syncOtherTaxes(otherTaxes.map(row => row.id === tax.id ? { ...row, rate: event.target.value } : row))}
                    placeholder="%"
                    className="h-10 min-w-0 rounded-md border border-slate-200 bg-slate-50 px-2 text-xs font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/20"
                  />
                  <button
                    type="button"
                    onClick={() => syncOtherTaxes(otherTaxes.filter(row => row.id !== tax.id))}
                    className="flex h-10 w-7 items-center justify-center rounded-md border border-red-100 bg-white text-red-500 hover:bg-red-50"
                    title="Remove other tax"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="mt-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-[11px] font-semibold text-slate-600">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span>{breakdown.label}</span>
          <span className="font-black text-[#12335f]">Total tax {formatTaxRate(breakdown.totalRate)}%</span>
        </div>
        {splitRate && igstRate && (
          <p className="mt-1 text-[10px] font-bold text-amber-700">
            CGST+SGST and IGST cannot be applied together; CGST+SGST has been used for the calculation.
          </p>
        )}
      </div>
    </div>
  );
}
