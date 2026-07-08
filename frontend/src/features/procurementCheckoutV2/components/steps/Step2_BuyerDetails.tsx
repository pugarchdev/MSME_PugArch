'use client';

import { Input } from '../../../../components/ui/input';

const FIELDS = [
  ['organizationName', 'Buyer Department / Organization', true],
  ['buyerOfficerName', 'Buyer Officer Name', true],
  ['designation', 'Designation', false],
  ['email', 'Email', true],
  ['mobile', 'Mobile', false],
  ['officeAddress', 'Office Address', false],
  ['financialYear', 'Financial Year', false],
  ['departmentFileNumber', 'Department File Number', false],
  ['budgetHead', 'Budget Head / Scheme', false],
  ['competentAuthorityName', 'Competent Authority Name', false],
  ['competentAuthorityDesignation', 'Competent Authority Designation', false],
] as const;

const RequiredMark = ({ required }: { required?: boolean }) =>
  required ? <span className="ml-0.5 text-red-600">*</span> : null;

export default function Step2_BuyerDetails({
  data,
  onChange,
  errors,
}: {
  data: Record<string, unknown>;
  onChange: (field: string, value: string) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      <h2 className="text-lg font-black text-slate-950">Step 2 — Buyer Details</h2>
      <div className="grid gap-3 md:grid-cols-2">
        {FIELDS.map(([key, label, required]) => (
          <div key={key} className="space-y-1">
            <label className="text-xs font-bold">{label}<RequiredMark required={required} /></label>
            <Input
              value={String(data[key] || '')}
              onChange={e => onChange(key, e.target.value)}
              className={errors[key] ? 'border-red-400' : ''}
            />
            {errors[key] && <p className="text-[10px] text-red-600">{errors[key]}</p>}
          </div>
        ))}
      </div>
      <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[11px] leading-relaxed text-slate-700">
        <p className="font-black uppercase tracking-wide text-[#12335f]">Field notes</p>
        <p><strong>Department File Number:</strong> internal procurement or office file reference, for example <span className="font-mono">PUR/IT/2026-27/014</span>. Use "NA" only when your organization does not maintain file numbers.</p>
        <p><strong>Budget Head / Scheme:</strong> approved budget line or scheme code from which payment will be booked, for example <span className="font-mono">MSME Procurement 2026-27</span> or <span className="font-mono">4059-Capital Works</span>.</p>
        <p><strong>Competent Authority:</strong> officer authorized to approve this purchase, such as Department Head, CEO, Managing Director, Procurement Head, or DDO.</p>
        <p><span className="text-red-600">*</span> fields are compulsory for moving ahead in the wizard.</p>
      </div>
    </div>
  );
}
