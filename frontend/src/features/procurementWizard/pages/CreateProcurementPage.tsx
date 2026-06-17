'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, ArrowRight, CheckCircle2, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import ProcurementIntentStep from '../components/ProcurementIntentStep';
import RequirementDetailsStep from '../components/RequirementDetailsStep';
import RecommendationStep from '../components/RecommendationStep';
import ReviewPublishStep from '../components/ReviewPublishStep';
import { recommendProcurementMethod } from '../components/ProcurementMethodAdvisor';
import { procurementWizardApi } from '../api';
import { EMPTY_PROCUREMENT_DRAFT, METHOD_LABELS, METHOD_ROUTE_MAP, type ProcurementMethod, type ProcurementWizardDraft } from '../types';

const steps = ['Choose Intent', 'Requirement Details', 'Recommendation', 'Review and Publish'] as const;

const canContinue = (step: number, draft: ProcurementWizardDraft) => {
  if (step === 0) return Boolean(draft.intent);
  if (step === 1) {
    const hasItemType = draft.itemType === 'OTHER' ? draft.otherItemType.trim().length >= 2 : Boolean(draft.itemType);
    const hasCategory = draft.categoryName === 'Other' ? draft.otherCategoryName.trim().length >= 2 : draft.categoryName.trim().length >= 2;
    return draft.title.trim().length >= 3 && hasItemType && hasCategory;
  }
  if (step === 2) return Boolean(draft.selectedMethod);
  return true;
};

export default function CreateProcurementPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProcurementWizardDraft>(() => procurementWizardApi.loadLocalDraft() || EMPTY_PROCUREMENT_DRAFT);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(draft.updatedAt || null);
  const [specificationDocumentUrl, setSpecificationDocumentUrl] = useState('');

  const recommendation = useMemo(() => recommendProcurementMethod(draft), [draft]);
  const selectedMethod = draft.selectedMethod || recommendation.method;
  const ready = canContinue(step, draft);

  const updateDraft = (patch: Partial<ProcurementWizardDraft>) => {
    setDraft(prev => ({ ...prev, ...patch }));
  };

  const updateSpecificationDocumentFile = (file?: File) => {
    setSpecificationDocumentUrl(prev => {
      if (prev) URL.revokeObjectURL(prev);
      return file ? URL.createObjectURL(file) : '';
    });
  };

  const saveDraft = () => {
    procurementWizardApi.saveLocalDraft(draft);
    const stamp = new Date().toISOString();
    setLastSavedAt(stamp);
    toast.success('Draft saved');
  };

  useEffect(() => {
    if (!draft.selectedMethod && step >= 2) {
      updateDraft({ selectedMethod: recommendation.method, recommendationReason: recommendation.reason });
    }
  }, [draft.selectedMethod, recommendation.method, recommendation.reason, step]);

  useEffect(() => {
    const handle = window.setInterval(() => {
      procurementWizardApi.saveLocalDraft(draft);
      setLastSavedAt(new Date().toISOString());
    }, 10_000);
    return () => window.clearInterval(handle);
  }, [draft]);

  useEffect(() => {
    return () => {
      if (specificationDocumentUrl) URL.revokeObjectURL(specificationDocumentUrl);
    };
  }, [specificationDocumentUrl]);

  const next = () => {
    if (!ready) {
      toast.info(step === 0 ? 'Choose a procurement intent first.' : 'Add title and product or service details first.');
      return;
    }
    if (step === 1) {
      updateDraft({ selectedMethod: recommendation.method, recommendationReason: recommendation.reason });
    }
    setStep(prev => Math.min(prev + 1, steps.length - 1));
  };

  const publish = () => {
    const method: ProcurementMethod = selectedMethod;
    procurementWizardApi.saveLocalDraft({ ...draft, selectedMethod: method, recommendationReason: recommendation.reason });
    toast.success(`Draft saved. Continuing to ${METHOD_LABELS[method]}.`);
    router.push(METHOD_ROUTE_MAP[method]);
  };

  return (
    <div className="mx-auto max-w-6xl space-y-4 pb-24 md:pb-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#12335f]">Procurement</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Create Procurement</h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Start with the business need. The portal recommends the right existing flow and keeps RFQ, tender, auction, requirement, and direct purchase routes intact.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
            {lastSavedAt ? (
              <span className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-emerald-700">
                <CheckCircle2 className="h-3.5 w-3.5" /> Draft saved
              </span>
            ) : (
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1">Autosaves every 10 seconds</span>
            )}
            <Button type="button" variant="outline" onClick={saveDraft} className="h-9 rounded-md text-xs">
              <Save className="mr-2 h-3.5 w-3.5" /> Save Draft
            </Button>
          </div>
        </div>

        <div className="mt-5 grid gap-2 sm:grid-cols-4">
          {steps.map((label, index) => (
            <button
              key={label}
              type="button"
              onClick={() => setStep(index)}
              className={cn(
                'rounded-md border px-3 py-2 text-left text-[10px] font-black uppercase tracking-wide transition',
                index === step ? 'border-[#12335f] bg-[#12335f] text-white' : index < step ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'
              )}
            >
              <span className="block text-[9px] opacity-70">Step {index + 1}</span>
              {label}
            </button>
          ))}
        </div>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {step === 0 && (
          <ProcurementIntentStep
            value={draft.intent}
            onChange={(method) => updateDraft({ intent: method, selectedMethod: method })}
          />
        )}
        {step === 1 && (
          <RequirementDetailsStep
            draft={draft}
            onChange={updateDraft}
            specificationDocumentUrl={specificationDocumentUrl}
            onSpecificationDocumentFileChange={updateSpecificationDocumentFile}
          />
        )}
        {step === 2 && (
          <RecommendationStep
            recommendation={recommendation}
            selectedMethod={selectedMethod}
            onSelect={(method) => updateDraft({ selectedMethod: method, recommendationReason: method === recommendation.method ? recommendation.reason : 'Buyer manually selected a different method after reviewing the recommendation.' })}
          />
        )}
        {step === 3 && (
          <ReviewPublishStep
            draft={draft}
            selectedMethod={selectedMethod}
            specificationDocumentUrl={specificationDocumentUrl}
            onSave={saveDraft}
            onPublish={publish}
          />
        )}
      </section>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 shadow-2xl backdrop-blur md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-2">
          <Button type="button" variant="outline" onClick={() => (step === 0 ? router.push('/dashboard') : setStep(prev => prev - 1))} className="rounded-md">
            <ArrowLeft className="mr-2 h-4 w-4" /> {step === 0 ? 'Dashboard' : 'Back'}
          </Button>
          {step < steps.length - 1 ? (
            <Button type="button" onClick={next} disabled={!ready} className="rounded-md bg-[#12335f] text-white hover:bg-[#0b2445]">
              Next <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={publish} className="rounded-md bg-[#12335f] text-white hover:bg-[#0b2445]">
              Publish <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
