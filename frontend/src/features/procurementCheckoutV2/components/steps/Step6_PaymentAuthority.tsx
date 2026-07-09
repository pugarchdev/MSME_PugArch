'use client';

import React, { useEffect, useState } from 'react';
import { Input, Select } from '../../../../components/ui/input';
import { SearchableSelect } from '../common/SearchableSelect';
import { PAYMENT_MODE_OPTIONS } from '../../constants';

const RequiredMark = ({ required }: { required?: boolean }) =>
  required ? <span className="ml-0.5 text-red-600 font-bold">*</span> : null;

export default function Step6_PaymentAuthority({
  data,
  onChange,
  errors,
}: {
  data: Record<string, unknown>;
  onChange: (field: string, value: unknown) => void;
  errors: Record<string, string>;
}) {
  const [designationDropdown, setDesignationDropdown] = useState(() => {
    const val = String(data.payingAuthorityDesignation || '');
    if (!val) return '';
    const isStandard = [
      'Accounts Officer (AO)',
      'Pay & Accounts Officer (PAO)',
      'Drawing & Disbursing Officer (DDO)',
      'Financial Advisor & Chief Accounts Officer (FA&CAO)',
      'Finance Controller',
      'Director (Finance)'
    ].includes(val);
    return isStandard ? val : 'Other';
  });

  useEffect(() => {
    const val = String(data.payingAuthorityDesignation || '');
    if (!val) {
      setDesignationDropdown('');
    } else {
      const isStandard = [
        'Accounts Officer (AO)',
        'Pay & Accounts Officer (PAO)',
        'Drawing & Disbursing Officer (DDO)',
        'Financial Advisor & Chief Accounts Officer (FA&CAO)',
        'Finance Controller',
        'Director (Finance)'
      ].includes(val);
      setDesignationDropdown(isStandard ? val : 'Other');
    }
  }, [data.payingAuthorityDesignation]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-black text-slate-950">Step 6 — Payment Authority</h2>
      <p className="text-xs text-slate-500">Government procurement payment is status-tracking only unless online gateway is enabled by admin.</p>
      
      <div className="grid gap-3 md:grid-cols-2">
        {/* Row 1 */}
        <div className="space-y-1">
          <Input
            label="Paying Authority Name"
            required
            value={String(data.payingAuthorityName || '')}
            onChange={e => onChange('payingAuthorityName', e.target.value)}
            error={errors.payingAuthorityName}
          />
        </div>

        <div className="space-y-1">
          <Select
            label="Paying Authority Designation"
            value={designationDropdown}
            onChange={e => {
              const val = e.target.value;
              setDesignationDropdown(val);
              if (val === 'Other') {
                onChange('payingAuthorityDesignation', '');
              } else {
                onChange('payingAuthorityDesignation', val);
              }
            }}
            error={errors.payingAuthorityDesignation && designationDropdown !== 'Other' ? errors.payingAuthorityDesignation : undefined}
          >
            <option value="">Select Designation...</option>
            <option value="Accounts Officer (AO)">Accounts Officer (AO)</option>
            <option value="Pay & Accounts Officer (PAO)">Pay & Accounts Officer (PAO)</option>
            <option value="Drawing & Disbursing Officer (DDO)">Drawing & Disbursing Officer (DDO)</option>
            <option value="Financial Advisor & Chief Accounts Officer (FA&CAO)">Financial Advisor & Chief Accounts Officer (FA&CAO)</option>
            <option value="Finance Controller">Finance Controller</option>
            <option value="Director (Finance)">Director (Finance)</option>
            <option value="Other">Other</option>
          </Select>
        </div>

        {designationDropdown === 'Other' && (
          <div className="md:col-start-2 space-y-1">
            <Input
              label="Specify Designation"
              value={
                ![
                  'Accounts Officer (AO)',
                  'Pay & Accounts Officer (PAO)',
                  'Drawing & Disbursing Officer (DDO)',
                  'Financial Advisor & Chief Accounts Officer (FA&CAO)',
                  'Finance Controller',
                  'Director (Finance)'
                ].includes(String(data.payingAuthorityDesignation))
                  ? String(data.payingAuthorityDesignation || '')
                  : ''
              }
              onChange={e => onChange('payingAuthorityDesignation', e.target.value)}
              error={errors.payingAuthorityDesignation}
              placeholder="Enter custom designation"
            />
          </div>
        )}

        {/* Row 2 */}
        <div className="space-y-1">
          <Input
            label="DDO / PAO / Accounts Officer"
            value={String(data.ddoPaoAccountsOfficer || '')}
            onChange={e => onChange('ddoPaoAccountsOfficer', e.target.value)}
            error={errors.ddoPaoAccountsOfficer}
          />
        </div>

        <div className="space-y-1">
          <Input
            label="Payment Timeline"
            value={String(data.paymentTimeline || '')}
            onChange={e => onChange('paymentTimeline', e.target.value)}
            error={errors.paymentTimeline}
            placeholder="e.g. As per sanction"
          />
        </div>

        {/* Row 3 */}
        <div className="space-y-1">
          <Input
            label="Payment Remarks"
            value={String(data.paymentRemarks || '')}
            onChange={e => onChange('paymentRemarks', e.target.value)}
            error={errors.paymentRemarks}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 text-[11px] leading-snug">
            Payment Mode<RequiredMark required />
          </label>
          <SearchableSelect
            options={PAYMENT_MODE_OPTIONS.map(o => ({ value: o, label: o }))}
            value={String(data.paymentMode || 'PFMS')}
            onChange={v => onChange('paymentMode', v)}
            allowOther
          />
        </div>

        {/* Row 4 */}
        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 text-[11px] leading-snug">
            Invoice in name of
          </label>
          <SearchableSelect
            options={[{ value: 'Buyer', label: 'Buyer' }, { value: 'Consignee', label: 'Consignee' }]}
            value={String(data.invoiceInNameOf || 'Buyer')}
            onChange={v => onChange('invoiceInNameOf', v)}
          />
        </div>

        <div className="space-y-1">
          <label className="text-xs font-bold uppercase tracking-wider text-slate-500 text-[11px] leading-snug">
            TDS applicable
          </label>
          <SearchableSelect
            options={[{ value: 'Yes', label: 'Yes' }, { value: 'No', label: 'No' }]}
            value={String(data.tdsApplicable || 'No')}
            onChange={v => onChange('tdsApplicable', v)}
          />
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
