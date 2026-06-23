import React from 'react';
import FormField from '../common/FormField';
import SearchableSelect from '../common/SearchableSelect';
import { PROCUREMENT_CATEGORIES, PRIORITY_OPTIONS, SECTOR_OPTIONS } from '../../utils/constants';
import type { StepComponentProps } from '../../types/steps';

const inputClass = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15';

export default function Step3_BidBasicDetails({ data, errors, updateField }: StepComponentProps) {
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <FormField label="Bid Title" required error={errors.title} className="md:col-span-2"><input value={data.title || ''} onChange={event => updateField('title', event.target.value)} className={inputClass} /></FormField>
      <FormField label="Short Description" required error={errors.shortDescription} className="md:col-span-2"><textarea value={data.shortDescription || ''} onChange={event => updateField('shortDescription', event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15" /></FormField>
      <FormField label="Procurement Category" required error={errors.procurementCategory}><SearchableSelect value={data.procurementCategory} options={PROCUREMENT_CATEGORIES} onChange={value => updateField('procurementCategory', value)} allowOther /></FormField>
      <FormField label="Sector / Department Area" required error={errors.sector}><SearchableSelect value={data.sector} options={SECTOR_OPTIONS} onChange={value => updateField('sector', value)} allowOther /></FormField>
      <FormField label="Estimated Bid Value" required error={errors.estimatedValue}><input type="number" value={data.estimatedValue || ''} onChange={event => updateField('estimatedValue', event.target.value)} className={inputClass} /></FormField>
      <FormField label="Priority" required error={errors.priority}><SearchableSelect value={data.priority} options={PRIORITY_OPTIONS} onChange={value => updateField('priority', value)} allowOther={false} /></FormField>
      <FormField label="Publishing Date" required error={errors.publishingDate}><input type="datetime-local" value={data.publishingDate || ''} onChange={event => updateField('publishingDate', event.target.value)} className={inputClass} /></FormField>
      <FormField label="Closing Date & Time" required error={errors.closingDate}><input type="datetime-local" value={data.closingDate || ''} onChange={event => updateField('closingDate', event.target.value)} className={inputClass} /></FormField>
      <FormField label="Bid Validity Period" required error={errors.validityPeriod}><SearchableSelect value={data.validityPeriod} options={['30 days', '60 days', '90 days', '120 days', 'Other']} onChange={value => updateField('validityPeriod', value)} allowOther /></FormField>
      <FormField label="Budget Head"><input value={data.budgetHead || ''} onChange={event => updateField('budgetHead', event.target.value)} className={inputClass} /></FormField>
      <FormField label="Procurement Purpose" required error={errors.procurementPurpose} className="md:col-span-2"><textarea value={data.procurementPurpose || ''} onChange={event => updateField('procurementPurpose', event.target.value)} rows={3} className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15" /></FormField>
    </div>
  );
}
