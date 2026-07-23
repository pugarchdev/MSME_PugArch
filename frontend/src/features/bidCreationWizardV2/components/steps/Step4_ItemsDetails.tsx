import React from 'react';
import FormField from '../common/FormField';
import SearchableSelect from '../common/SearchableSelect';
import DocumentUploadSection from '../common/DocumentUploadSection';
import { EVALUATION_METHOD_OPTIONS, PRODUCT_CATEGORIES, SERVICE_CATEGORIES, UNIT_OPTIONS } from '../../utils/constants';
import type { StepComponentProps } from '../../types/steps';

const inputClass = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15';
const textClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15';

export default function Step4_ItemsDetails({ data, bidType, errors, updateField }: StepComponentProps) {
  if (bidType === 'SERVICE_BID') {
    return <div className="grid gap-4 md:grid-cols-2">
      <FormField label="Service Category" required error={errors.serviceCategory}><SearchableSelect value={data.serviceCategory} options={SERVICE_CATEGORIES} onChange={value => updateField('serviceCategory', value)} allowOther /></FormField>
      <FormField label="Service Location" required error={errors.serviceLocation}><input value={data.serviceLocation || ''} onChange={event => updateField('serviceLocation', event.target.value)} className={inputClass} /></FormField>
      <FormField label="Scope of Work" required error={errors.scopeOfWork} className="md:col-span-2"><textarea value={data.scopeOfWork || ''} onChange={event => updateField('scopeOfWork', event.target.value)} rows={4} className={textClass} /></FormField>
      {['contractDuration', 'startDate', 'endDate', 'serviceReportFrequency'].map(field => <FormField key={field} label={field} required error={errors[field]}><input type={field.includes('Date') ? 'date' : 'text'} value={data[field] || ''} onChange={event => updateField(field, event.target.value)} className={inputClass} /></FormField>)}
      {['manpowerRequired', 'slaRequired', 'statutoryComplianceRequired'].map(field => <ToggleField key={field} label={field} checked={Boolean(data[field])} onChange={value => updateField(field, value)} />)}
      {data.manpowerRequired && <>
        <FormField label="Number of Personnel"><input type="number" value={data.numberOfPersonnel || ''} onChange={event => updateField('numberOfPersonnel', event.target.value)} className={inputClass} /></FormField>
        <FormField label="Skill Level"><input value={data.skillLevel || ''} onChange={event => updateField('skillLevel', event.target.value)} className={inputClass} /></FormField>
        <FormField label="Working Hours"><input value={data.workingHours || ''} onChange={event => updateField('workingHours', event.target.value)} className={inputClass} /></FormField>
        <FormField label="Shift Type"><input value={data.shiftType || ''} onChange={event => updateField('shiftType', event.target.value)} className={inputClass} /></FormField>
      </>}
      {data.slaRequired && <FormField label="SLA Details" className="md:col-span-2"><textarea value={data.slaDetails || ''} onChange={event => updateField('slaDetails', event.target.value)} rows={3} className={textClass} /></FormField>}
    </div>;
  }
  if (bidType === 'CUSTOM_BID') {
    return <div className="grid gap-4 md:grid-cols-2">{['background', 'detailedScopeOfWork', 'deliverables', 'projectTimeline', 'financialProposalFormat'].map(field => <FormField key={field} label={field} required error={errors[field]} className={field.includes('Scope') || field === 'background' ? 'md:col-span-2' : ''}><textarea value={data[field] || ''} onChange={event => updateField(field, event.target.value)} rows={field.includes('Scope') || field === 'background' ? 3 : 2} className={textClass} /></FormField>)}<ToggleField label="Milestones Required" checked={Boolean(data.milestonesRequired)} onChange={value => updateField('milestonesRequired', value)} /><ToggleField label="Technical Proposal Required" checked={Boolean(data.technicalProposalRequired)} onChange={value => updateField('technicalProposalRequired', value)} /><FormField label="Evaluation Method" required><SearchableSelect value={data.evaluationMethod} options={EVALUATION_METHOD_OPTIONS} onChange={value => updateField('evaluationMethod', value)} allowOther /></FormField></div>;
  }
  if (bidType === 'BOQ_BID') {
    const lineItems = Array.isArray(data.lineItems) ? data.lineItems : [];
    
    const updateLineItem = (index: number, field: string, value: any) => {
      const newItems = [...lineItems];
      newItems[index] = { ...newItems[index], [field]: value };
      updateField('lineItems', newItems);
    };

    const addLineItem = () => {
      updateField('lineItems', [...lineItems, { itemNumber: lineItems.length + 1 }]);
    };

    const removeLineItem = (index: number) => {
      const newItems = lineItems.filter((_, i) => i !== index);
      updateField('lineItems', newItems.map((item, i) => ({ ...item, itemNumber: i + 1 })));
    };

    return (
      <div className="grid gap-4 md:grid-cols-2">
        {['boqTitle', 'priceQuoteBasis', 'boqValidationStatus'].map(field => (
          <FormField key={field} label={field} required error={errors[field]}>
            <input value={data[field] || ''} onChange={event => updateField(field, event.target.value)} className={inputClass} />
          </FormField>
        ))}
        <FormField label="BOQ Entry Mode" required>
          <SearchableSelect value={data.boqEntryMode} options={['UPLOAD', 'MANUAL']} onChange={value => updateField('boqEntryMode', value)} allowOther={false} />
        </FormField>
        <ToggleField label="GST Applicable" checked={Boolean(data.gstApplicable)} onChange={value => updateField('gstApplicable', value)} />
        <div className="md:col-span-2">
          <DocumentUploadSection label="BOQ Excel Upload" mandatory={data.boqEntryMode === 'UPLOAD'} value={data.boqDocumentUploads} onChange={value => updateField('boqDocumentUploads', value)} />
        </div>
        
        {data.boqEntryMode === 'MANUAL' && (
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-800">Manual Line Items</h3>
              <button type="button" onClick={addLineItem} className="rounded-lg bg-[#12335f] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#12335f]/90">
                + Add Item
              </button>
            </div>
            {lineItems.length === 0 ? (
              <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                No items added yet. Click "+ Add Item" to add a BOQ item.
              </div>
            ) : (
              <div className="space-y-4">
                {lineItems.map((item: any, idx: number) => (
                  <div key={idx} className="relative rounded-xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                    <button type="button" onClick={() => removeLineItem(idx)} className="absolute right-3 top-3 rounded bg-red-50 px-2 py-1 text-xs font-bold text-red-600 hover:bg-red-100">
                      Remove
                    </button>
                    <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-slate-500">Item {idx + 1}</h4>
                    <div className="grid gap-4 md:grid-cols-2">
                      <FormField label="Item Name" required><input value={item.itemName || ''} onChange={e => updateLineItem(idx, 'itemName', e.target.value)} className={inputClass} /></FormField>
                      <FormField label="Quantity" required><input type="number" value={item.quantity || ''} onChange={e => updateLineItem(idx, 'quantity', e.target.value)} className={inputClass} /></FormField>
                      <FormField label="Unit of Measure" required><SearchableSelect value={item.unitOfMeasure} options={UNIT_OPTIONS} onChange={val => updateLineItem(idx, 'unitOfMeasure', val)} allowOther /></FormField>
                      <FormField label="Estimated Unit Price"><input type="number" value={item.estimatedUnitPrice || ''} onChange={e => updateLineItem(idx, 'estimatedUnitPrice', e.target.value)} className={inputClass} /></FormField>
                      <FormField label="GST %"><input type="number" value={item.gst || ''} onChange={e => updateLineItem(idx, 'gst', e.target.value)} className={inputClass} /></FormField>
                      <FormField label="HSN / SAC Code"><input value={item.hsn || ''} onChange={e => updateLineItem(idx, 'hsn', e.target.value)} className={inputClass} /></FormField>
                      <FormField label="Brand"><input value={item.brand || ''} onChange={e => updateLineItem(idx, 'brand', e.target.value)} className={inputClass} /></FormField>
                      <FormField label="Make"><input value={item.make || ''} onChange={e => updateLineItem(idx, 'make', e.target.value)} className={inputClass} /></FormField>
                      <FormField label="Model"><input value={item.model || ''} onChange={e => updateLineItem(idx, 'model', e.target.value)} className={inputClass} /></FormField>
                      <ToggleField label="Alternate Brand Allowed" checked={Boolean(item.alternateBrandAllowed)} onChange={val => updateLineItem(idx, 'alternateBrandAllowed', val)} />
                      <FormField label="Warranty (Months)"><input value={item.warranty || ''} onChange={e => updateLineItem(idx, 'warranty', e.target.value)} className={inputClass} /></FormField>
                      <FormField label="Delivery Schedule"><input value={item.deliverySchedule || ''} onChange={e => updateLineItem(idx, 'deliverySchedule', e.target.value)} className={inputClass} /></FormField>
                      <FormField label="Item Description" className="md:col-span-2"><textarea value={item.description || ''} onChange={e => updateLineItem(idx, 'description', e.target.value)} rows={2} className={textClass} /></FormField>
                      <FormField label="Technical Specifications" className="md:col-span-2"><textarea value={item.technicalSpecification || ''} onChange={e => updateLineItem(idx, 'technicalSpecification', e.target.value)} rows={3} className={textClass} /></FormField>
                      <div className="md:col-span-2">
                        <DocumentUploadSection label="Uploaded Specification Files" mandatory={false} value={item.uploadedSpecificationFiles} onChange={val => updateLineItem(idx, 'uploadedSpecificationFiles', val)} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
  if (bidType === 'PAC_BID') {
    return <div className="grid gap-4 md:grid-cols-2">{['oemBrandName', 'modelName', 'proprietaryJustification', 'technicalReason', 'alternativesNotSuitableReason'].map(field => <FormField key={field} label={field} required error={errors[field]} className={field.includes('Reason') || field.includes('Justification') ? 'md:col-span-2' : ''}><textarea value={data[field] || ''} onChange={event => updateField(field, event.target.value)} rows={field.includes('Reason') || field.includes('Justification') ? 3 : 1} className={textClass} /></FormField>)}<ToggleField label="Alternative Product Analysis Done" checked={Boolean(data.alternativeProductAnalysisDone)} onChange={value => updateField('alternativeProductAnalysisDone', value)} /><div className="md:col-span-2 grid gap-4 md:grid-cols-3"><DocumentUploadSection label="PAC Certificate Upload" mandatory value={data.pacCertificateUploads} onChange={value => updateField('pacCertificateUploads', value)} /><DocumentUploadSection label="Competent Authority Approval Upload" mandatory value={data.competentAuthorityApprovalUploads} onChange={value => updateField('competentAuthorityApprovalUploads', value)} /><DocumentUploadSection label="Price Reasonability Document" mandatory value={data.priceReasonabilityDocumentUploads} onChange={value => updateField('priceReasonabilityDocumentUploads', value)} /></div></div>;
  }
  if (bidType === 'REVERSE_AUCTION') {
    return <ReverseAuctionFields data={data} errors={errors} updateField={updateField} />;
  }
  return <div className="space-y-5"><ProductFields data={data} errors={errors} updateField={updateField} />{bidType === 'BID_WITH_RA' && <ReverseAuctionFields data={data} errors={errors} updateField={updateField} />}</div>;
}

function ProductFields({ data, errors, updateField }: any) {
  return <div className="grid gap-4 md:grid-cols-2">
    <FormField label="Product Category" required error={errors.productCategory}><SearchableSelect value={data.productCategory} options={PRODUCT_CATEGORIES} onChange={(value) => updateField('productCategory', value)} allowOther /></FormField>
    <FormField label="Product Name" required error={errors.productName}><input value={data.productName || ''} onChange={event => updateField('productName', event.target.value)} className={inputClass} /></FormField>
    <FormField label="Quantity" required error={errors.quantity}><input type="number" value={data.quantity || ''} onChange={event => updateField('quantity', event.target.value)} className={inputClass} /></FormField>
    <FormField label="Unit" required error={errors.unitOfMeasurement}><SearchableSelect value={data.unitOfMeasurement} options={UNIT_OPTIONS} onChange={(value) => updateField('unitOfMeasurement', value)} allowOther /></FormField>
    <FormField label="Product Description" required error={errors.productDescription} className="md:col-span-2"><textarea value={data.productDescription || ''} onChange={event => updateField('productDescription', event.target.value)} rows={3} className={textClass} /></FormField>
    <FormField label="Technical Specification" required error={errors.technicalSpecification} className="md:col-span-2"><textarea value={data.technicalSpecification || ''} onChange={event => updateField('technicalSpecification', event.target.value)} rows={4} className={textClass} /></FormField>
    {['specificationFormat', 'brandRestriction', 'inspectionType'].map(field => <FormField key={field} label={field} required error={errors[field]}><input value={data[field] || ''} onChange={event => updateField(field, event.target.value)} className={inputClass} /></FormField>)}
    {['warrantyRequired', 'installationRequired', 'testingCommissioningRequired'].map(field => <ToggleField key={field} label={field} checked={Boolean(data[field])} onChange={value => updateField(field, value)} />)}
  </div>;
}

function ReverseAuctionFields({ data, errors, updateField }: any) {
  return <div className="grid gap-4 rounded-lg border border-violet-200 bg-violet-50/30 p-4 md:grid-cols-2">
    {['raTriggerStage', 'raDuration', 'minimumDecrementValue', 'raStartPrice', 'eligibleSellersForRa', 'raWinnerRule'].map(field => <FormField key={field} label={field} required error={errors[field]}><input type={field.includes('Value') || field.includes('Price') ? 'number' : 'text'} value={data[field] || ''} onChange={event => updateField(field, event.target.value)} className={inputClass} /></FormField>)}
    <ToggleField label="Auto Extension Required" checked={Boolean(data.autoExtensionRequired)} onChange={value => updateField('autoExtensionRequired', value)} />
  </div>;
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className="flex min-h-11 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700">
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 accent-[#12335f]" />
      {label}
    </label>
  );
}
