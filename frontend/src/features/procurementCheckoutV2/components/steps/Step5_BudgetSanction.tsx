'use client';

import { Input } from '../../../../components/ui/input';
import { SearchableSelect } from '../common/SearchableSelect';

const budgetFields = [
  ['budgetHead', 'Budget Head / Scheme', false],
  ['sanctionAmount', 'Sanction Amount', true],
  ['sanctionOrderNumber', 'Sanction Order Number', false],
  ['sanctionDate', 'Sanction Date', false],
  ['approvingAuthority', 'Approving Authority', false],
  ['approvalNote', 'Approval Note', false],
  ['departmentRemarks', 'Department Remarks', false],
] as const;

const priceFields = [
  ['lastPurchasePrice', 'Last Purchase Price', false],
  ['marketComparisonPrice', 'Market Comparison Price', false],
  ['portalL1Price', 'Portal L1 Price', false],
  ['estimatedPrice', 'Estimated Price', true],
  ['priceReasonabilityRemarks', 'Price Reasonability Remarks', false],
] as const;

const RequiredMark = ({ required }: { required?: boolean }) =>
  required ? <span className="ml-0.5 text-red-600">*</span> : null;

export default function Step5_BudgetSanction({
  data,
  priceReasonability,
  onChange,
  onPriceChange,
  errors,
  highValue,
}: {
  data: Record<string, unknown>;
  priceReasonability: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  onPriceChange: (field: string, value: unknown) => void;
  errors: Record<string, string>;
  highValue?: boolean;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-black text-slate-950">Step 5 — Budget & Sanction</h2>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1">
          <label className="text-xs font-bold">Budget Availability Confirmed<RequiredMark required /></label>
          <SearchableSelect
            options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
            value={String(data.budgetAvailabilityConfirmed || 'Yes')}
            onChange={v => onChange('budgetAvailabilityConfirmed', v)}
          />
        </div>
        {budgetFields.map(([field, label, required]) => (
          <div key={field} className="space-y-1">
            <label className="text-xs font-bold">{label}<RequiredMark required={required} /></label>
            <Input
              type={field === 'sanctionDate' ? 'date' : 'text'}
              value={String(data[field] || '')}
              onChange={e => {
                const val = field === 'sanctionAmount' ? e.target.value.replace(/-/g, '') : e.target.value;
                onChange(field, val);
              }}
              error={errors[field]}
            />
          </div>
        ))}
      </div>
      <h3 className="text-sm font-black text-slate-800">Price Reasonability</h3>
      <div className="grid gap-3 md:grid-cols-2">
        {priceFields.map(([field, label, required]) => (
          <div key={field} className="space-y-1">
            <label className="text-xs font-bold">{label}<RequiredMark required={required || (highValue && field === 'priceReasonabilityRemarks')} /></label>
            <Input
              value={String(priceReasonability[field] || '')}
              onChange={e => {
                const val = field !== 'priceReasonabilityRemarks' ? e.target.value.replace(/-/g, '') : e.target.value;
                onPriceChange(field, val);
              }}
              error={errors[field]}
            />
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-amber-100 bg-amber-50 p-3 text-[11px] leading-relaxed text-slate-700">
        <p className="font-black uppercase tracking-wide text-[#12335f]">Budget and sanction notes</p>
        <p><strong>Budget Head / Scheme:</strong> enter budget code, grant head, project head, or scheme name used by accounts for booking expenditure.</p>
        <p><strong>Sanction Amount:</strong> approved amount available for this procurement. It should be equal to or higher than expected order value.</p>
        <p><strong>Sanction Order Number:</strong> administrative or financial approval order reference, for example <span className="font-mono">SO/PROC/2026-27/008</span>. If not issued yet, enter proposal or approval note reference and upload final sanction later in Terms & Documents.</p>
        <p><strong>Approving Authority:</strong> name/designation of authority approving budget usage, such as CEO, Department Head, DDO, Finance Officer, or Procurement Head.</p>
        <p><strong>Price Reasonability:</strong> use last purchase price, market comparison, portal L1, quotation, or estimate basis to justify purchase value.</p>
        <p><span className="text-red-600">*</span> fields are compulsory for this step.</p>
      </div>
    </div>
  );
}
