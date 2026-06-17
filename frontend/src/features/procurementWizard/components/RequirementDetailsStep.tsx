import { CheckCircle2, ExternalLink, FileText, UploadCloud, X } from 'lucide-react';
import { Input, Select } from '../../../components/ui/input';
import type { ProcurementWizardDraft } from '../types';
import {
  CATEGORY_OPTIONS,
  DELIVERY_TYPE_OPTIONS,
  PAYMENT_TERM_OPTIONS,
  PROCUREMENT_TYPE_OPTIONS,
  UNIT_OPTIONS,
  formatDocumentSize,
  getDocumentTypeLabel,
  getProcurementInsights,
} from '../procurementOptions';

const fieldClass = 'bg-white';

export default function RequirementDetailsStep({
  draft,
  onChange,
  specificationDocumentUrl,
  onSpecificationDocumentFileChange,
}: {
  draft: ProcurementWizardDraft;
  onChange: (patch: Partial<ProcurementWizardDraft>) => void;
  specificationDocumentUrl?: string;
  onSpecificationDocumentFileChange?: (file?: File) => void;
}) {
  const insights = getProcurementInsights({
    itemType: draft.itemType,
    categoryName: draft.categoryName === 'Other' ? draft.otherCategoryName : draft.categoryName,
    paymentTerms: draft.paymentTerms,
    deliveryType: draft.deliveryType,
    specificationDocumentName: draft.specificationDocumentName,
  });
  const documentSize = formatDocumentSize(draft.specificationDocumentSize);
  const documentType = getDocumentTypeLabel(draft.specificationDocumentName, draft.specificationDocumentType);

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="Title" value={draft.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="e.g. Packaging material for June supply" className={fieldClass} />
        <Select label="Procurement type" value={draft.itemType} onChange={(event) => onChange({ itemType: event.target.value as ProcurementWizardDraft['itemType'], otherItemType: event.target.value === 'OTHER' ? draft.otherItemType : '' })} className={fieldClass}>
          {PROCUREMENT_TYPE_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>{option.label}</option>
          ))}
        </Select>
        {draft.itemType === 'OTHER' && (
          <Input label="Other procurement type" value={draft.otherItemType} onChange={(event) => onChange({ otherItemType: event.target.value })} placeholder="Enter requirement type" className={fieldClass} />
        )}
        <Input label="Product or service name" value={draft.productOrService} onChange={(event) => onChange({ productOrService: event.target.value })} placeholder="Item, service, or work name"  />
        {/* <datalist id="procurement-item-suggestions">
          {ITEM_SUGGESTIONS.map(item => (
            <option key={item} value={item} />
          ))}
        </datalist> */}
        <Select label="Category" value={draft.categoryName} onChange={(event) => onChange({ categoryName: event.target.value, otherCategoryName: event.target.value === 'Other' ? draft.otherCategoryName : '' })} className={fieldClass}>
          <option value="">Select category</option>
          {CATEGORY_OPTIONS.map(category => (
            <option key={category} value={category}>{category}</option>
          ))}
        </Select>
        {draft.categoryName === 'Other' && (
          <Input label="Other category" value={draft.otherCategoryName} onChange={(event) => onChange({ otherCategoryName: event.target.value })} placeholder="Enter category" className={fieldClass} />
        )}
        <div className="grid grid-cols-2 gap-3">
          <Input label="Quantity" value={draft.quantity} onChange={(event) => onChange({ quantity: event.target.value })} type="number" min="0" className={fieldClass} />
          <Select label="Unit" value={draft.unit} onChange={(event) => onChange({ unit: event.target.value })} className={fieldClass}>
            <option value="">Select unit</option>
            {UNIT_OPTIONS.map(unit => (
              <option key={unit.value} value={unit.value}>{unit.label}</option>
            ))}
          </Select>
        </div>
        <Input label="Budget minimum" value={draft.budgetMin} onChange={(event) => onChange({ budgetMin: event.target.value })} type="number" min="0" className={fieldClass} />
        <Input label="Budget maximum" value={draft.budgetMax} onChange={(event) => onChange({ budgetMax: event.target.value, estimatedValue: draft.estimatedValue || event.target.value })} type="number" min="0" className={fieldClass} />
        <Input label="Estimated value" value={draft.estimatedValue} onChange={(event) => onChange({ estimatedValue: event.target.value })} type="number" min="0" className={fieldClass} />
        <Input label="Required delivery date" value={draft.requiredDeliveryDate} onChange={(event) => onChange({ requiredDeliveryDate: event.target.value })} type="date" className={fieldClass} />
        <Input label="Delivery location" value={draft.deliveryLocation} onChange={(event) => onChange({ deliveryLocation: event.target.value })} placeholder="City, district, state" className={fieldClass} />
        <Select label="Delivery type" value={draft.deliveryType} onChange={(event) => onChange({ deliveryType: event.target.value })} className={fieldClass}>
          <option value="">Select delivery type</option>
          {DELIVERY_TYPE_OPTIONS.map(type => (
            <option key={type} value={type}>{type}</option>
          ))}
        </Select>
        <Select label="Payment terms" value={draft.paymentTerms} onChange={(event) => onChange({ paymentTerms: event.target.value })} className={fieldClass}>
          <option value="">Select payment terms</option>
          {PAYMENT_TERM_OPTIONS.map(term => (
            <option key={term} value={term}>{term}</option>
          ))}
        </Select>
        <Select label="Seller visibility" value={draft.visibility} onChange={(event) => onChange({ visibility: event.target.value as ProcurementWizardDraft['visibility'] })} className={fieldClass}>
          <option value="VERIFIED_SELLERS_ONLY">Verified sellers only</option>
          <option value="PUBLIC">Public marketplace</option>
          <option value="INVITED_SUPPLIERS">Invited suppliers only</option>
        </Select>
      </div>

      <label className="block space-y-1.5">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Specifications</span>
        <textarea
          value={draft.specifications}
          onChange={(event) => onChange({ specifications: event.target.value })}
          rows={5}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:ring-2 focus:ring-[#12335f]/20"
          placeholder="Technical details, quality expectations, service scope, delivery terms, compliance needs..."
        />
      </label>

      <label className="block space-y-1.5">
        <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Specification document</span>
        <input
          type="file"
          accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
          onChange={(event) => {
            const file = event.target.files?.[0];
            onSpecificationDocumentFileChange?.(file);
            onChange({
              specificationDocumentName: file?.name || '',
              specificationDocumentType: file?.type || '',
              specificationDocumentSize: file?.size || 0,
              specificationDocumentSelectedAt: file ? new Date().toISOString() : '',
            });
          }}
          className="block w-full rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 file:mr-3 file:rounded-md file:border-0 file:bg-[#12335f] file:px-3 file:py-1.5 file:text-xs file:font-bold file:text-white hover:bg-slate-100 focus:outline-none focus:ring-2 focus:ring-[#12335f]/20"
        />
        {draft.specificationDocumentName ? (
          <div className="flex flex-col gap-3 rounded-lg border border-emerald-200 bg-emerald-50/70 p-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
                <FileText className="h-5 w-5" />
              </div>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black text-slate-950 text-wrap-anywhere">{draft.specificationDocumentName}</p>
                  <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                    <CheckCircle2 className="h-3 w-3" /> Selected
                  </span>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-600">
                  {[documentType, documentSize].filter(Boolean).join(' | ') || 'Specification document'}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {specificationDocumentUrl ? (
                <a
                  href={specificationDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-md bg-[#12335f] px-2.5 text-xs font-bold text-white hover:bg-[#0b2445]"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open document
                </a>
              ) : (
                <span className="inline-flex h-8 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-2.5 text-xs font-bold text-amber-700">
                  Reselect file to view
                </span>
              )}
              <button
                type="button"
                onClick={() => {
                  onSpecificationDocumentFileChange?.(undefined);
                  onChange({
                    specificationDocumentName: '',
                    specificationDocumentType: '',
                    specificationDocumentSize: 0,
                    specificationDocumentSelectedAt: '',
                  });
                }}
                className="inline-flex h-8 items-center justify-center gap-1 rounded-md border border-emerald-200 bg-white px-2.5 text-xs font-bold text-slate-600 hover:bg-emerald-50"
              >
                <X className="h-3.5 w-3.5" /> Remove
              </button>
            </div>
          </div>
        ) : (
          <span className="flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-slate-50 px-3 py-2 text-[11px] font-semibold text-slate-500">
            <UploadCloud className="h-4 w-4 text-slate-400" />
            Upload a specification, drawing, BOQ, scope, or compliance document for any procurement type.
          </span>
        )}
      </label>

    
    </div>
  );
}
