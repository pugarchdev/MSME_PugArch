import React from 'react';
import { ArrowLeft, ArrowRight, FileText, Save, Send } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { STEP_TITLES } from '../utils/constants';
import type { PacketType, SaveStatus } from '../types/steps';
import PacketTypeBadge from './common/PacketTypeBadge';
import SaveStatusIndicator from './common/SaveStatusIndicator';
import StepValidationBanner from './common/StepValidationBanner';

export default function BidWizardLayout({
  currentStep,
  packetType,
  saveStatus,
  lastSavedAt,
  canSubmit,
  isSubmitting,
  validationErrors,
  stepContentRef,
  onStepClick,
  onPrevious,
  onNext,
  onSave,
  onSubmit,
  onPublish,
  onGeneratePdf,
  children,
}: {
  currentStep: number;
  packetType: PacketType;
  saveStatus: SaveStatus;
  lastSavedAt: string | null;
  canSubmit: boolean;
  isSubmitting: boolean;
  validationErrors?: Record<number, Record<string, string[]>>;
  stepContentRef?: React.RefObject<HTMLDivElement | null>;
  onStepClick: (step: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onSave: () => void;
  onSubmit: () => void;
  onPublish: () => void;
  onGeneratePdf: () => void;
  children: React.ReactNode;
}) {
  const currentStepErrors = validationErrors?.[currentStep] || {};
  const stepsWithErrors = Object.entries(validationErrors || {})
    .filter(([, errors]) => Object.keys(errors || {}).length > 0)
    .map(([step]) => Number(step));

  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#12335f] text-white"><FileText className="h-5 w-5" /></span>
            <div>
              <h1 className="text-xl font-black text-slate-950">Formal Bid Creation</h1>
              <p className="text-xs font-bold text-slate-500">Procurement / Bid Management</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <PacketTypeBadge packetType={packetType} />
          <SaveStatusIndicator status={saveStatus} lastSavedAt={lastSavedAt} />
          <Button type="button" variant="outline" onClick={onSave}><Save className="mr-2 h-4 w-4" />Save Draft</Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <aside className="space-y-2 rounded-lg border border-slate-200 bg-white p-3">
          {STEP_TITLES.map((title, index) => {
            const step = index + 1;
            const hasErrors = stepsWithErrors.includes(step);
            return (
              <button
                key={title}
                type="button"
                onClick={() => onStepClick(step)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-xs font-black transition',
                  currentStep === step ? 'bg-[#12335f] text-white' : 'text-slate-600 hover:bg-slate-50',
                  hasErrors && currentStep !== step && 'border border-red-200 bg-red-50 text-red-700'
                )}
              >
                <span className={cn(
                  'relative flex h-6 w-6 items-center justify-center rounded-md',
                  currentStep === step ? 'bg-white/15' : hasErrors ? 'bg-red-100 text-red-700' : 'bg-slate-100'
                )}>
                  {step}
                  {hasErrors && (
                    <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-red-500" />
                  )}
                </span>
                {title}
              </button>
            );
          })}
        </aside>

        <section className="rounded-lg border border-slate-200 bg-white">
          <div className="border-b border-slate-200 bg-slate-50 px-5 py-4">
            <p className="text-[11px] font-black uppercase text-slate-500">Step {currentStep} of 9</p>
            <h2 className="mt-1 text-lg font-black text-slate-950">{STEP_TITLES[currentStep - 1]}</h2>
          </div>
          <div ref={stepContentRef} className="p-5">
            <StepValidationBanner errors={currentStepErrors} />
            {children}
          </div>
          <div className="flex flex-col gap-3 border-t border-slate-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={onPrevious} disabled={currentStep === 1}><ArrowLeft className="mr-2 h-4 w-4" />Previous</Button>
            {currentStep < 9 ? (
              <Button type="button" onClick={onNext}>Next<ArrowRight className="ml-2 h-4 w-4" /></Button>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" onClick={onGeneratePdf}>Generate Preview PDF</Button>
                <Button type="button" variant="outline" onClick={onPublish} disabled={!canSubmit || isSubmitting}>Publish Bid</Button>
                <Button type="button" onClick={onSubmit} disabled={!canSubmit || isSubmitting}><Send className="mr-2 h-4 w-4" />{isSubmitting ? 'Submitting...' : 'Submit for Approval'}</Button>
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
