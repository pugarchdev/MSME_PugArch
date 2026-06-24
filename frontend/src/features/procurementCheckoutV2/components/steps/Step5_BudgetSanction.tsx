'use client';

import { Input } from '../../../../components/ui/input';
import { SearchableSelect } from '../common/SearchableSelect';

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
          <label className="text-xs font-bold">Budget Availability Confirmed</label>
          <SearchableSelect
            options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
            value={String(data.budgetAvailabilityConfirmed || 'Yes')}
            onChange={v => onChange('budgetAvailabilityConfirmed', v)}
          />
        </div>
        {['budgetHead', 'sanctionAmount', 'sanctionOrderNumber', 'sanctionDate', 'approvingAuthority', 'approvalNote', 'departmentRemarks'].map(field => (
          <div key={field} className="space-y-1">
            <label className="text-xs font-bold">{field.replace(/([A-Z])/g, ' $1')}</label>
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
        {['lastPurchasePrice', 'marketComparisonPrice', 'portalL1Price', 'estimatedPrice', 'priceReasonabilityRemarks'].map(field => (
          <div key={field} className="space-y-1">
            <label className="text-xs font-bold">{field.replace(/([A-Z])/g, ' $1')}{field === 'estimatedPrice' || (highValue && field === 'priceReasonabilityRemarks') ? ' *' : ''}</label>
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
    </div>
  );
}
