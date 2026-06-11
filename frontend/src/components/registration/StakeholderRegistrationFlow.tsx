import React, { useState } from 'react';
import { Check } from 'lucide-react';
import Prerequisites from './Prerequisites';
import TermsConditions from './TermsConditions';
import RegistrationDetailsFlow from './RegistrationDetailsFlow';
import { cn } from '../../lib/utils';

export type RegistrationVariant = 'seller' | 'buyer' | 'hershg';

interface StakeholderRegistrationFlowProps {
  role: 'buyer' | 'seller';
  variant?: RegistrationVariant;
  initialBusinessType?: string;
}

const variantCopy: Record<RegistrationVariant, { footer: string; maxWidth: string }> = {
  seller: {
    footer: 'Jharsuguda | Synergy for MSME and Industry Linkage Ecosystem',
    maxWidth: 'max-w-7xl'
  },
  buyer: {
    footer: 'Jharsuguda | Synergy for MSME and Industry Linkage Ecosystem',
    maxWidth: 'max-w-5xl'
  },
  hershg: {
    footer: 'herSHG | Women Self-Help Group Seller Registration',
    maxWidth: 'max-w-7xl'
  }
};

const steps = [
  { number: 1, label: 'Pre-requisites' },
  { number: 2, label: 'Terms & Conditions' },
  { number: 3, label: 'Registration' }
];

export default function StakeholderRegistrationFlow({ role, variant = role, initialBusinessType = '' }: StakeholderRegistrationFlowProps) {
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState(initialBusinessType);
  const [selectedDocuments, setSelectedDocuments] = useState<string[]>([]);
  const copy = variantCopy[variant];

  const handlePrerequisitesProceed = (type: string, documents: string[] = []) => {
    setBusinessType(type);
    setSelectedDocuments(documents);
    setStep(2);
  };

  return (
    <div className={cn('min-h-dvh bg-white px-3 py-4 sm:px-4 md:py-6', role === 'buyer' && 'buyer-font')}>
      <div className={cn('mx-auto flex w-full flex-col', copy.maxWidth)}>
        <div className="mb-4 flex shrink-0 justify-center md:mb-6">
          <div className="no-scrollbar flex w-full items-center justify-start gap-2 overflow-x-auto rounded-xl bg-[#f5f5f5] px-3 py-2.5 sm:justify-center sm:gap-5 sm:px-6 sm:py-3 md:gap-8">
            {steps.map((item, index) => (
              <React.Fragment key={item.number}>
                <StepIndicator number={item.number} label={item.label} active={step === item.number} completed={step > item.number} />
                {index < steps.length - 1 && <div className="h-px w-10 flex-shrink-0 bg-slate-400 sm:w-16 md:w-24" />}
              </React.Fragment>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 animate-in fade-in duration-700">
          {step === 1 && <Prerequisites onProceed={handlePrerequisitesProceed} role={role} variant={variant} />}
          {step === 2 && <TermsConditions onAccept={() => setStep(3)} onBack={() => setStep(1)} role={role} />}
          {step === 3 && (
            <RegistrationDetailsFlow
              businessType={businessType}
              onBack={() => setStep(2)}
              role={role}
              variant={variant}
              prereqSelectedDocuments={selectedDocuments}
            />
          )}
        </div>

        <div className="mt-4 shrink-0 px-2 text-center text-[9px] font-black uppercase tracking-[0.18em] text-slate-300 sm:text-[10px] sm:tracking-[0.3em]">
          {copy.footer}
        </div>
      </div>
    </div>
  );
}

function StepIndicator({ number, label, active, completed }: { number: number; label: string; active: boolean; completed: boolean }) {
  return (
    <div className="flex flex-shrink-0 items-center gap-2 sm:gap-2.5">
      <div className={cn(
        'flex h-8 w-8 items-center justify-center rounded-full text-base font-black transition-all sm:h-9 sm:w-9',
        active ? 'bg-[#12335f] text-white' : completed ? 'bg-green-600 text-white' : 'border border-slate-200 bg-white text-slate-800'
      )}>
        {completed ? <Check className="h-4 w-4" strokeWidth={3} /> : number}
      </div>
      <span className={cn(
        'whitespace-nowrap text-xs font-black tracking-tight sm:text-xs md:text-base',
        active ? 'text-[#12335f]' : completed ? 'text-green-600' : 'text-slate-500'
      )}>
        {label}
      </span>
    </div>
  );
}
