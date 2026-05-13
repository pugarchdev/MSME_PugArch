import React, { useState } from 'react';
import Prerequisites from '../components/registration/Prerequisites';
import TermsConditions from '../components/registration/TermsConditions';
import RegistrationDetailsFlow from '../components/registration/RegistrationDetailsFlow';
import { Check } from 'lucide-react';

export default function BuyerRegistrationFlow() {
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState('');

  const handlePrerequisitesProceed = (type: string) => {
    setBusinessType(type);
    setStep(2);
  };

  const handleTermsAccept = () => {
    setStep(3);
  };

  const handleBackToPrerequisites = () => {
    setStep(1);
  };

  return (
    <div className="buyer-font min-h-dvh bg-white px-3 py-4 sm:px-4 md:py-6">
      <div className="mx-auto flex max-w-5xl flex-col">
        <div className="mb-4 flex shrink-0 justify-center md:mb-6">
          <div className="no-scrollbar flex w-full max-w-5xl items-center justify-start gap-3 overflow-x-auto rounded-xl bg-[#f5f5f5] px-3 py-2.5 sm:justify-center sm:gap-5 sm:px-6 sm:py-3 md:gap-8">
            <StepIndicator number={1} label="Pre-requisites" active={step === 1} completed={step > 1} />
            <div className="h-px w-16 flex-shrink-0 bg-slate-400 md:w-24" />
            <StepIndicator number={2} label="Terms & Conditions" active={step === 2} completed={step > 2} />
            <div className="h-px w-16 flex-shrink-0 bg-slate-400 md:w-24" />
            <StepIndicator number={3} label="Registration" active={step === 3} completed={step > 3} />
          </div>
        </div>

        <div className="min-h-0 flex-1 animate-in fade-in duration-700">
          {step === 1 && <Prerequisites onProceed={handlePrerequisitesProceed} role="buyer" />}
          {step === 2 && <TermsConditions onAccept={handleTermsAccept} onBack={handleBackToPrerequisites} role="buyer" />}
          {step === 3 && <RegistrationDetailsFlow businessType={businessType} onBack={() => setStep(2)} role="buyer" />}
        </div>

        <div className="mt-4 shrink-0 px-2 text-center text-[9px] font-black uppercase tracking-[0.18em] text-slate-300 sm:text-[10px] sm:tracking-[0.3em]">
          Professional Procurement Portal | Secure & Verified
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ number, label, active, completed }: { number: number, label: string, active: boolean, completed: boolean }) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 sm:gap-2.5">
      <div className={`flex h-8 w-8 items-center justify-center rounded-full text-base font-black transition-all sm:h-9 sm:w-9 ${
        active ? 'bg-blue-600 text-white' :
        completed ? 'bg-green-600 text-white' : 'bg-white text-slate-800 border border-slate-200'
      }`}>
        {completed ? <Check className="h-4 w-4" strokeWidth={3} /> : number}
      </div>
      <span className={`whitespace-nowrap text-xs font-black tracking-tight sm:text-xs md:text-base ${
        active ? 'text-blue-600' : completed ? 'text-green-600' : 'text-slate-500'
      }`}>
        {label}
      </span>
    </div>
  );
}
