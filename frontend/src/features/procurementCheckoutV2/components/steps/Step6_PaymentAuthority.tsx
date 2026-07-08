'use client';

import { Input } from '../../../../components/ui/input';
import { SearchableSelect } from '../common/SearchableSelect';
import { PAYMENT_MODE_OPTIONS } from '../../constants';

const paymentFields = [
  ['payingAuthorityName', 'Paying Authority Name', true],
  ['payingAuthorityDesignation', 'Paying Authority Designation', false],
  ['ddoPaoAccountsOfficer', 'DDO / PAO / Accounts Officer', false],
  ['paymentTimeline', 'Payment Timeline', false],
  ['paymentRemarks', 'Payment Remarks', false],
] as const;

const RequiredMark = ({ required }: { required?: boolean }) =>
  required ? <span className="ml-0.5 text-red-600">*</span> : null;

export default function Step6_PaymentAuthority({
  data,
  onChange,
  errors,
}: {
  data: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-black text-slate-950">Step 6 — Payment Authority</h2>
      <p className="text-xs text-slate-500">Government procurement payment is status-tracking only unless online gateway is enabled by admin.</p>
      <div className="grid gap-3 md:grid-cols-2">
        {paymentFields.map(([field, label, required]) => (
          <div key={field} className="space-y-1">
            <label className="text-xs font-bold">{label}<RequiredMark required={required} /></label>
            <Input value={String(data[field] || '')} onChange={e => onChange(field, e.target.value)} className={errors[field] ? 'border-red-400' : ''} />
          </div>
        ))}
        <div className="space-y-1">
          <label className="text-xs font-bold">Payment Mode<RequiredMark required /></label>
          <SearchableSelect
            options={PAYMENT_MODE_OPTIONS.map(o => ({ value: o, label: o }))}
            value={String(data.paymentMode || 'PFMS')}
            onChange={v => onChange('paymentMode', v)}
            allowOther
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold">Invoice in name of</label>
          <SearchableSelect
            options={[{ value: 'Buyer', label: 'Buyer' }, { value: 'Consignee', label: 'Consignee' }]}
            value={String(data.invoiceInNameOf || 'Buyer')}
            onChange={v => onChange('invoiceInNameOf', v)}
          />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-bold">TDS applicable</label>
          <SearchableSelect options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]} value={String(data.tdsApplicable || 'No')} onChange={v => onChange('tdsApplicable', v)} />
        </div>
      </div>
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[11px] leading-relaxed text-slate-700">
        <p className="font-black uppercase tracking-wide text-[#12335f]">Payment authority notes</p>
        <p><strong>Paying Authority:</strong> department, officer, or accounts unit responsible for releasing payment after invoice and delivery/GRN verification.</p>
        <p><strong>DDO / PAO / Accounts Officer:</strong> enter Drawing and Disbursing Officer, Pay and Accounts Office, finance controller, or accounts contact if applicable.</p>
        <p><strong>Payment Timeline:</strong> expected release condition, for example <span className="font-mono">Within 30 days after invoice and GRN approval</span>.</p>
      </div>
    </div>
  );
}
