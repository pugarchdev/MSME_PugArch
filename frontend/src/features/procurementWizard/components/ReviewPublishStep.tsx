import { ArrowRight, CheckCircle2, ExternalLink, FileText, Save, UploadCloud } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/card';
import type { ProcurementMethod, ProcurementWizardDraft } from '../types';
import { METHOD_LABELS, METHOD_ROUTE_MAP } from '../types';
import { PROCUREMENT_TYPE_OPTIONS, UNIT_OPTIONS, formatDocumentSize, getDocumentTypeLabel } from '../procurementOptions';

const Row = ({ label, value }: { label: string; value?: string }) => (
  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
    <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{label}</p>
    <p className="mt-1 text-sm font-bold text-slate-900 text-wrap-anywhere">{value || 'Not provided'}</p>
  </div>
);

export default function ReviewPublishStep({
  draft,
  selectedMethod,
  specificationDocumentUrl,
  onSave,
  onPublish,
}: {
  draft: ProcurementWizardDraft;
  selectedMethod: ProcurementMethod;
  specificationDocumentUrl?: string;
  onSave: () => void;
  onPublish: () => void;
}) {
  const itemTypeLabel = draft.itemType === 'OTHER' ? draft.otherItemType : PROCUREMENT_TYPE_OPTIONS.find(option => option.value === draft.itemType)?.label;
  const categoryLabel = draft.categoryName === 'Other' ? draft.otherCategoryName : draft.categoryName;
  const unitLabel = UNIT_OPTIONS.find(option => option.value === draft.unit)?.label || draft.unit;
  const documentSize = formatDocumentSize(draft.specificationDocumentSize);
  const documentType = getDocumentTypeLabel(draft.specificationDocumentName, draft.specificationDocumentType);
  const selectedAt = draft.specificationDocumentSelectedAt
    ? new Date(draft.specificationDocumentSelectedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
    : '';

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
          <Row label="Procurement type" value={itemTypeLabel} />
          <Row label="Product or service" value={draft.productOrService} />
          <Row label="Category" value={categoryLabel} />
          <Row label="Quantity" value={[draft.quantity, unitLabel].filter(Boolean).join(' ')} />
          <Row label="Estimated value" value={draft.estimatedValue || draft.budgetMax} />
          <Row label="Delivery location" value={draft.deliveryLocation} />
          <Row label="Required by" value={draft.requiredDeliveryDate} />
          <Row label="Delivery type" value={draft.deliveryType} />
          <Row label="Payment terms" value={draft.paymentTerms} />
        </div>

        <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">Uploaded specification document</p>
          {draft.specificationDocumentName ? (
            <div className="mt-2 flex flex-col gap-3 rounded-lg border border-emerald-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-[#12335f] text-white">
                  <FileText className="h-5 w-5" />
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-black text-slate-950 text-wrap-anywhere">{draft.specificationDocumentName}</p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-black uppercase tracking-wide text-emerald-700">
                      <CheckCircle2 className="h-3 w-3" /> Ready
                    </span>
                  </div>
                  <p className="mt-1 text-xs font-semibold text-slate-600">
                    {[documentType, documentSize, selectedAt ? `Selected ${selectedAt}` : ''].filter(Boolean).join(' | ')}
                  </p>
                  <p className="mt-1 text-[11px] font-semibold text-slate-500">
                    This file is attached to the guided draft. The existing selected workflow will handle final upload/submission.
                  </p>
                </div>
              </div>
              {specificationDocumentUrl ? (
                <a
                  href={specificationDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-9 shrink-0 items-center justify-center gap-1 rounded-md bg-[#12335f] px-3 text-xs font-bold text-white hover:bg-[#0b2445]"
                >
                  <ExternalLink className="h-3.5 w-3.5" /> Open document
                </a>
              ) : (
                <span className="inline-flex h-9 shrink-0 items-center justify-center rounded-md border border-amber-200 bg-amber-50 px-3 text-xs font-bold text-amber-700">
                  Reselect file to view
                </span>
              )}
            </div>
          ) : (
            <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed border-slate-300 bg-white px-3 py-3 text-xs font-semibold text-slate-500">
              <UploadCloud className="h-4 w-4 text-slate-400" />
              No specification document selected yet.
            </div>
          )}
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
            Supporting documents: {draft.supportingDocuments || 'Add full files in the existing workflow after continuing.'}
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
