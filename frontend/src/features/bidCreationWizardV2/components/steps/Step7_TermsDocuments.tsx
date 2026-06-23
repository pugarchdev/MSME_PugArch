import React from 'react';
import FormField from '../common/FormField';
import SearchableSelect from '../common/SearchableSelect';
import DocumentUploadSection from '../common/DocumentUploadSection';
import ConditionalSection from '../common/ConditionalSection';
import FinancialPacketSection from '../common/FinancialPacketSection';
import { PAYMENT_TERMS_OPTIONS } from '../../utils/constants';
import type { StepComponentProps } from '../../types/steps';

export default function Step7_TermsDocuments({ data, packetType, errors, updateField }: StepComponentProps) {
  return (
    <div className="space-y-5">
      <div className="grid gap-4 md:grid-cols-3">
        <DocumentUploadSection label="Technical Specification Document" mandatory value={data.technicalSpecificationDocumentIds} onChange={value => updateField('technicalSpecificationDocumentIds', value)} error={errors.technicalSpecificationDocumentIds} />
        <DocumentUploadSection label="Budget Sanction Document" mandatory value={data.budgetSanctionDocumentIds} onChange={value => updateField('budgetSanctionDocumentIds', value)} error={errors.budgetSanctionDocumentIds} />
        <DocumentUploadSection label="Administrative Approval Document" mandatory value={data.administrativeApprovalDocumentIds} onChange={value => updateField('administrativeApprovalDocumentIds', value)} error={errors.administrativeApprovalDocumentIds} />
        <DocumentUploadSection label="Scope of Work" value={data.scopeOfWorkDocumentIds} onChange={value => updateField('scopeOfWorkDocumentIds', value)} error={errors.scopeOfWorkDocumentIds} />
        <DocumentUploadSection label="BOQ Document" value={data.boqDocumentIds} onChange={value => updateField('boqDocumentIds', value)} error={errors.boqDocumentIds} />
        <DocumentUploadSection label="PAC Certificate" value={data.pacCertificateDocumentIds} onChange={value => updateField('pacCertificateDocumentIds', value)} error={errors.pacCertificateDocumentIds} />
        <DocumentUploadSection label="Drawings / Layouts" value={data.drawingDocumentIds} onChange={value => updateField('drawingDocumentIds', value)} />
        <DocumentUploadSection label="Additional Terms" value={data.additionalTermDocumentIds} onChange={value => updateField('additionalTermDocumentIds', value)} />
      </div>
      <div className="grid gap-4 md:grid-cols-2">
        <FormField label="Payment Terms" required error={errors.paymentTerms}><SearchableSelect value={data.paymentTerms} options={PAYMENT_TERMS_OPTIONS} onChange={value => updateField('paymentTerms', value)} allowOther /></FormField>
        {['advancePaymentAllowed', 'partPaymentAllowed', 'invoiceRequired', 'gstInvoiceRequired', 'ewayBillRequired'].map(field => (
          <label key={field} className="flex min-h-12 items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700">
            <input type="checkbox" checked={Boolean(data[field])} onChange={event => updateField(field, event.target.checked)} className="h-4 w-4 accent-[#12335f]" />
            {field}
          </label>
        ))}
      </div>
      <ConditionalSection showWhen={packetType === 'TWO_PACKET'}>
        <h3 className="mb-4 text-sm font-black text-slate-900">Financial Packet</h3>
        <div data-field-error={errors.financialPacket || errors['financialPacket.financialDocumentUploads'] ? 'true' : undefined}>
          <FinancialPacketSection value={data.financialPacket} onChange={value => updateField('financialPacket', value)} />
          {errors.financialPacket && <p className="mt-2 text-xs font-bold text-red-600">{errors.financialPacket[0]}</p>}
          {errors['financialPacket.financialDocumentUploads'] && (
            <p className="mt-2 text-xs font-bold text-red-600">{errors['financialPacket.financialDocumentUploads'][0]}</p>
          )}
        </div>
      </ConditionalSection>
    </div>
  );
}
