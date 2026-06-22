import React from 'react';
import FormField from '../common/FormField';
import SearchableSelect from '../common/SearchableSelect';
import { FINANCIAL_YEAR_OPTIONS } from '../../utils/constants';
import { useMasterData } from '../../hooks/useMasterData';
import type { StepComponentProps } from '../../types/steps';

const inputClass = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15';

export default function Step2_BuyerDetails({ data, errors, updateField }: StepComponentProps) {
  const resolveString = (val: any) => {
    if (val && typeof val === 'object') {
      return val.dropdownValue === 'Other' ? val.otherValue : val.dropdownValue;
    }
    return val || '';
  };

  const resolvedState = resolveString(data.state);
  const resolvedDistrict = resolveString(data.district);

  const masterData = useMasterData(resolvedDistrict, resolvedState);

  const fields = [
    ['organizationName', 'Organization Name'], ['ministry', 'Ministry / Parent Department'], ['buyerName', 'Buyer Name'],
    ['designation', 'Designation'], ['email', 'Email'], ['mobile', 'Mobile'],
    ['competentAuthorityName', 'Competent Authority Name'], ['competentAuthorityDesignation', 'Competent Authority Designation'],
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2">
      {fields.map(([field, label]) => <FormField key={field} label={label} required error={errors[field]}><input value={data[field] || ''} onChange={event => updateField(field, event.target.value)} className={inputClass} /></FormField>)}
      <FormField label="State" required error={errors.state}>
        <SearchableSelect
          value={data.state}
          options={masterData.states}
          onChange={value => {
            updateField('state', value);
            updateField('district', '');
            updateField('taluka', '');
            updateField('villageOrCity', '');
          }}
          allowOther
        />
      </FormField>
      <FormField label="District" required error={errors.district}>
        <SearchableSelect
          value={data.district}
          options={masterData.districts}
          onChange={value => {
            updateField('district', value);
            updateField('taluka', '');
            updateField('villageOrCity', '');
          }}
          allowOther
          allowNA={false}
        />
      </FormField>
      <FormField label="Taluka" required error={errors.taluka}><SearchableSelect value={data.taluka} options={masterData.talukas} onChange={value => updateField('taluka', value)} allowOther /></FormField>
      <FormField label="Village / City / Ward"><SearchableSelect value={data.villageOrCity} options={masterData.villages} onChange={value => updateField('villageOrCity', value)} allowOther allowNA /></FormField>
      <FormField label="Financial Year" required error={errors.financialYear}><SearchableSelect value={data.financialYear} options={FINANCIAL_YEAR_OPTIONS} onChange={value => updateField('financialYear', value)} allowOther={false} /></FormField>
      <FormField label="Department File No"><input value={data.departmentFileNumber || ''} onChange={event => updateField('departmentFileNumber', event.target.value)} className={inputClass} /></FormField>
      <FormField label="Office Address" className="md:col-span-2"><textarea value={data.officeAddress || ''} onChange={event => updateField('officeAddress', event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15" /></FormField>
    </div>
  );
}
