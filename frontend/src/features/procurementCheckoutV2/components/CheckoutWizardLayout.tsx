'use client';

import React from 'react';
import { ArrowLeft, ArrowRight, Save, Send, Loader2 } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { STEP_TITLES } from '../constants';

export default function CheckoutWizardLayout({
  currentStep,
  isSubmitting,
  isSavingDraft = false,
  onStepClick,
  onPrevious,
  onNext,
  onSave,
  onSubmitApproval,
  onPlaceOrder,
  onConvertBid,
  canPlaceOrder,
  canConvertBid,
  children,
}: {
  currentStep: number;
  isSubmitting: boolean;
  isSavingDraft?: boolean;
  onStepClick: (step: number) => void;
  onPrevious: () => void;
  onNext: () => void;
  onSave: () => void;
  onSubmitApproval: () => void;
  onPlaceOrder: () => void;
  onConvertBid: () => void;
  canPlaceOrder: boolean;
  canConvertBid: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto max-w-7xl space-y-4">
      <div className="border-b border-slate-200 pb-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Marketplace · Cart · Procurement Checkout</p>
        <h1 className="text-xl font-black text-slate-950">Procurement Checkout Wizard</h1>
        <p className="text-xs text-slate-500">Select Direct Purchase, L1, Bid/RA, or PAC based on cart value and rules.</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[240px_1fr]">
        <aside className="space-y-1 rounded-lg border border-slate-200 bg-white p-3">
          {STEP_TITLES.map((title, index) => {
            const step = index + 1;
            return (
              <button
                key={title}
                type="button"
                onClick={() => onStepClick(step)}
                className={cn(
                  'flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-xs font-bold',
                  currentStep === step ? 'bg-[#12335f] text-white' : 'text-slate-600 hover:bg-slate-50'
                )}
              >
                <span className={cn('flex h-6 w-6 items-center justify-center rounded text-[10px]', currentStep === step ? 'bg-white/20' : 'bg-slate-100')}>
                  {step}
                </span>
                {title}
              </button>
            );
          })}
        </aside>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-white p-5">{children}</div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button type="button" variant="outline" onClick={onPrevious} disabled={currentStep <= 1}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Previous
            </Button>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={onSave} disabled={isSubmitting || isSavingDraft}>
                {isSavingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin text-slate-500" /> : <Save className="mr-2 h-4 w-4" />}
                {isSavingDraft ? 'Saving...' : 'Save Draft'}
              </Button>
              {currentStep < 8 ? (
                <Button type="button" onClick={onNext} className="bg-[#12335f] hover:bg-[#0e2a4f]">
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              ) : (
                <>
                  <Button type="button" variant="outline" onClick={onSubmitApproval} disabled={isSubmitting}>
                    <Send className="mr-2 h-4 w-4" /> Submit for Approval
                  </Button>
                  {canConvertBid && (
                    <Button type="button" variant="outline" onClick={onConvertBid} disabled={isSubmitting}>
                      Convert to Bid/RA
                    </Button>
                  )}
                  {canPlaceOrder && (
                    <Button type="button" onClick={onPlaceOrder} disabled={isSubmitting} className="bg-[#12335f] hover:bg-[#0e2a4f]">
                      Place Order
                    </Button>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
