'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, FileText, Plus, RefreshCw, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { procurementWizardApi } from '../api';
import { METHOD_LABELS, type ProcurementWizardDraft } from '../types';
import { recommendProcurementMethod } from '../components/ProcurementMethodAdvisor';

const formatDateTime = (value?: string) => {
  if (!value) return 'Not saved yet';
  return new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', hour12: true });
};

const hasMeaningfulDraft = (draft: ProcurementWizardDraft | null) => Boolean(
  draft && (
    draft.intent ||
    draft.title.trim() ||
    draft.productOrService.trim() ||
    draft.categoryName.trim() ||
    draft.specifications.trim() ||
    draft.estimatedValue.trim()
  )
);

export default function ProcurementDraftsPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<ProcurementWizardDraft | null>(null);

  const loadDraft = () => setDraft(procurementWizardApi.loadLocalDraft());

  useEffect(() => {
    loadDraft();
  }, []);

  const recommendation = useMemo(() => draft ? recommendProcurementMethod(draft) : null, [draft]);
  const selectedMethod = draft?.selectedMethod || recommendation?.method;

  const discardDraft = () => {
    if (!window.confirm('Discard the saved procurement draft from this browser?')) return;
    procurementWizardApi.clearLocalDraft();
    setDraft(null);
    toast.success('Procurement draft discarded');
  };

  return (
    <div className="mx-auto max-w-6xl space-y-5 pb-8">
      <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#12335f]">Procurement</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Procurement Drafts</h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Drafts from the guided Create Procurement module are saved in this browser. Continue the active draft or start a new procurement.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={loadDraft} className="h-10 rounded-md text-xs font-black uppercase">
              <RefreshCw className="mr-2 h-4 w-4" /> Refresh
            </Button>
            <Button type="button" onClick={() => router.push('/buyer/procurement/create')} className="h-10 rounded-md bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]">
              <Plus className="mr-2 h-4 w-4" /> Create Procurement
            </Button>
          </div>
        </div>
      </section>

      {hasMeaningfulDraft(draft) && draft ? (
        <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-4 border-b border-slate-200 bg-slate-50 p-5 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-700">
                  Active local draft
                </span>
                {selectedMethod && (
                  <span className="inline-flex rounded-md border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-[#12335f]">
                    {METHOD_LABELS[selectedMethod]}
                  </span>
                )}
              </div>
              <h2 className="mt-3 break-words text-xl font-black text-slate-950">{draft.title || draft.productOrService || 'Untitled procurement draft'}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-500">Last saved: {formatDateTime(draft.updatedAt)}</p>
            </div>
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={discardDraft} className="h-10 rounded-md border-red-200 text-xs font-black uppercase text-red-700 hover:bg-red-50">
                <Trash2 className="mr-2 h-4 w-4" /> Discard
              </Button>
              <Button type="button" onClick={() => router.push('/buyer/procurement/create')} className="h-10 rounded-md bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]">
                Continue Draft <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          </div>

          <div className="grid gap-3 p-5 md:grid-cols-2 lg:grid-cols-4">
            <DraftMetric label="Intent" value={selectedMethod ? METHOD_LABELS[selectedMethod] : 'Not selected'} />
            <DraftMetric label="Item / Service" value={draft.productOrService || '-'} />
            <DraftMetric label="Category" value={draft.categoryName === 'Other' ? draft.otherCategoryName || 'Other' : draft.categoryName || '-'} />
            <DraftMetric label="Estimated Value" value={draft.estimatedValue ? `Rs. ${Number(draft.estimatedValue).toLocaleString('en-IN')}` : '-'} />
            <DraftMetric label="Quantity" value={[draft.quantity, draft.unit].filter(Boolean).join(' ') || '-'} />
            <DraftMetric label="Delivery Location" value={draft.deliveryLocation || '-'} />
            <DraftMetric label="Required Date" value={draft.requiredDeliveryDate || '-'} />
            <DraftMetric label="Visibility" value={draft.visibility.replace(/_/g, ' ')} />
          </div>

          <div className="border-t border-slate-200 p-5">
            <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Specification snapshot</p>
              <p className={cn('mt-2 text-sm font-medium leading-relaxed text-slate-700', !draft.specifications && 'text-slate-400')}>
                {draft.specifications || 'No specification text captured yet.'}
              </p>
              {draft.specificationDocumentName && (
                <p className="mt-3 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700">
                  <FileText className="h-4 w-4 text-[#12335f]" /> {draft.specificationDocumentName}
                </p>
              )}
            </div>
          </div>
        </section>
      ) : (
        <section className="rounded-lg border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-md bg-slate-50 text-[#12335f]">
            <FileText className="h-7 w-7" />
          </div>
          <h2 className="mt-4 text-lg font-black text-slate-950">No procurement draft saved</h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-500">
            Start Create Procurement and click Save Draft. The active draft will appear here for this browser session.
          </p>
          <Button type="button" onClick={() => router.push('/buyer/procurement/create')} className="mt-5 h-10 rounded-md bg-[#12335f] px-5 text-xs font-black uppercase text-white hover:bg-[#0b2445]">
            Create Procurement <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </section>
      )}
    </div>
  );
}

function DraftMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3">
      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}
