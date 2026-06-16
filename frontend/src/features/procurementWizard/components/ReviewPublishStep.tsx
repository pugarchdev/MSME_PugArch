import { ArrowRight, FileText, Save } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/card';
import type { ProcurementMethod, ProcurementWizardDraft } from '../types';
import { METHOD_LABELS, METHOD_ROUTE_MAP } from '../types';

const Row = ({ label, value }: { label: string; value?: string }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
    <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-bold text-slate-900 text-wrap-anywhere">{value || 'Not provided'}</p>
  </div>
);

export default function ReviewPublishStep({
  draft,
  selectedMethod,
  onSave,
  onPublish,
}: {
  draft: ProcurementWizardDraft;
  selectedMethod: ProcurementMethod;
  onSave: () => void;
  onPublish: () => void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-slate-200 bg-white p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Review and publish</p>
            <h2 className="mt-1 text-xl font-black text-slate-950 text-wrap-anywhere">{draft.title || 'Untitled procurement draft'}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">This first pass saves a guided draft and then continues into the existing workflow for the selected method.</p>
          </div>
          <Badge className="w-fit rounded-md">{METHOD_LABELS[selectedMethod]}</Badge>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <Row label="Product or service" value={draft.productOrService} />
          <Row label="Category" value={draft.categoryName} />
          <Row label="Quantity" value={[draft.quantity, draft.unit].filter(Boolean).join(' ')} />
          <Row label="Estimated value" value={draft.estimatedValue || draft.budgetMax} />
          <Row label="Delivery location" value={draft.deliveryLocation} />
          <Row label="Required by" value={draft.requiredDeliveryDate} />
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div className="rounded-lg border border-slate-200 bg-white p-4">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-[#12335f]" />
            <h3 className="text-sm font-black text-slate-950">Specifications and compliance notes</h3>
          </div>
          <p className="mt-3 whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-xs font-semibold leading-relaxed text-slate-700">
            {draft.specifications || 'No specifications added yet.'}
          </p>
          <p className="mt-3 text-xs font-semibold text-slate-500">
            Documents: {draft.supportingDocuments || 'Add full files in the existing workflow after continuing.'}
          </p>
        </div>

        <aside className="rounded-lg border border-slate-200 bg-[#12335f] p-4 text-white">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/60">Next step</p>
          <h3 className="mt-1 text-base font-black">{METHOD_LABELS[selectedMethod]}</h3>
          <p className="mt-2 text-xs font-semibold leading-relaxed text-blue-50">
            Publishing continues to {METHOD_ROUTE_MAP[selectedMethod]}, preserving the existing approval, upload, seller response, and order generation workflow.
          </p>
          <div className="mt-4 grid gap-2">
            <Button type="button" variant="outline" onClick={onSave} className="border-white/20 bg-white/10 text-white hover:bg-white/20">
              <Save className="mr-2 h-4 w-4" /> Save Draft
            </Button>
            <Button type="button" onClick={onPublish} className="bg-white text-[#12335f] hover:bg-slate-100">
              Continue <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </aside>
      </div>
    </div>
  );
}
