import { Input, Select } from '../../../components/ui/input';
import type { ProcurementWizardDraft } from '../types';

const fieldClass = 'bg-white';

export default function RequirementDetailsStep({
  draft,
  onChange,
}: {
  draft: ProcurementWizardDraft;
  onChange: (patch: Partial<ProcurementWizardDraft>) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <Input label="Title" value={draft.title} onChange={(event) => onChange({ title: event.target.value })} placeholder="e.g. Packaging material for June supply" className={fieldClass} />
        <Input label="Product or service" value={draft.productOrService} onChange={(event) => onChange({ productOrService: event.target.value })} placeholder="Item, service, or work category" className={fieldClass} />
        <Input label="Category name" value={draft.categoryName} onChange={(event) => onChange({ categoryName: event.target.value })} placeholder="Category" className={fieldClass} />
        <div className="grid grid-cols-2 gap-3">
          <Input label="Quantity" value={draft.quantity} onChange={(event) => onChange({ quantity: event.target.value })} type="number" min="0" className={fieldClass} />
          <Input label="Unit" value={draft.unit} onChange={(event) => onChange({ unit: event.target.value })} placeholder="pcs, kg, days" className={fieldClass} />
        </div>
        <Input label="Budget minimum" value={draft.budgetMin} onChange={(event) => onChange({ budgetMin: event.target.value })} type="number" min="0" className={fieldClass} />
        <Input label="Budget maximum" value={draft.budgetMax} onChange={(event) => onChange({ budgetMax: event.target.value, estimatedValue: draft.estimatedValue || event.target.value })} type="number" min="0" className={fieldClass} />
        <Input label="Estimated value" value={draft.estimatedValue} onChange={(event) => onChange({ estimatedValue: event.target.value })} type="number" min="0" className={fieldClass} />
        <Input label="Required delivery date" value={draft.requiredDeliveryDate} onChange={(event) => onChange({ requiredDeliveryDate: event.target.value })} type="date" className={fieldClass} />
        <Input label="Delivery location" value={draft.deliveryLocation} onChange={(event) => onChange({ deliveryLocation: event.target.value })} placeholder="City, district, state" className={fieldClass} />
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
        <span className="block text-[11px] font-bold uppercase tracking-wide text-slate-500">Supporting documents</span>
        <textarea
          value={draft.supportingDocuments}
          onChange={(event) => onChange({ supportingDocuments: event.target.value })}
          rows={3}
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none transition focus:ring-2 focus:ring-[#12335f]/20"
          placeholder="List attached files or notes for now. Full upload remains in the existing RFQ, requirement, bid, or auction flow."
        />
      </label>
    </div>
  );
}
