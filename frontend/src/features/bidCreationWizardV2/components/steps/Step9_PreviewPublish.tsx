import React from 'react';
import PreviewSection from '../common/PreviewSection';
import DeclarationCheckbox from '../common/DeclarationCheckbox';
import type { StepComponentProps } from '../../types/steps';
import { STEP_TITLES } from '../../utils/constants';

export default function Step9_PreviewPublish({ data, allData, errors, updateField, goToStep }: StepComponentProps) {
  const missingDocuments = [
    !Array.isArray(allData.step7?.technicalSpecificationDocumentIds) || allData.step7.technicalSpecificationDocumentIds.length === 0 ? 'Technical Specification Document' : null,
    !Array.isArray(allData.step7?.budgetSanctionDocumentIds) || allData.step7.budgetSanctionDocumentIds.length === 0 ? 'Budget Sanction Document' : null,
    !Array.isArray(allData.step7?.administrativeApprovalDocumentIds) || allData.step7.administrativeApprovalDocumentIds.length === 0 ? 'Administrative Approval Document' : null,
  ].filter(Boolean) as string[];

  return (
    <div className="space-y-4">
      {missingDocuments.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <p className="text-sm font-black text-amber-900">Mandatory documents are still missing</p>
          <p className="mt-1 text-xs font-semibold text-amber-800">
            Upload the required documents in Step 7 before submitting this bid for approval.
          </p>
          <ul className="mt-2 list-disc pl-5 text-xs font-bold text-amber-900">
            {missingDocuments.map(item => <li key={item}>{item}</li>)}
          </ul>
          <button type="button" onClick={() => goToStep?.(7)} className="mt-3 text-xs font-black text-[#12335f] underline underline-offset-4">
            Go to Terms & Documents
          </button>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-2">
        {STEP_TITLES.slice(0, 8).map((title, index) => (
          <PreviewSection key={title} title={`${index + 1}. ${title}`} data={allData[`step${index + 1}` as keyof typeof allData]} onEdit={() => goToStep?.(index + 1)} />
        ))}
      </div>
      <DeclarationCheckbox checked={Boolean(data.buyerDeclarationAccepted)} onChange={checked => updateField('buyerDeclarationAccepted', checked)} error={errors.buyerDeclarationAccepted}>
        Buyer confirms bid details, specifications, eligibility, delivery details, documents and terms are correct.
      </DeclarationCheckbox>
      <DeclarationCheckbox checked={Boolean(data.restrictiveConditionsDeclarationAccepted)} onChange={checked => updateField('restrictiveConditionsDeclarationAccepted', checked)} error={errors.restrictiveConditionsDeclarationAccepted}>
        Buyer confirms the bid does not contain restrictive, biased or unnecessary conditions and follows applicable procurement rules.
      </DeclarationCheckbox>
    </div>
  );
}
