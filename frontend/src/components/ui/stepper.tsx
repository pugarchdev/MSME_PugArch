import React from 'react';
import { cn } from '../../lib/utils';

export interface Step {
  id: number;
  label: string;
}

interface StepperProps {
  steps: Step[];
  currentStep: number;
  className?: string;
  onStepChange?: (stepId: number) => void;
}

export function Stepper({ steps, currentStep, className, onStepChange }: StepperProps) {
  return (
    <div className={cn("mb-8 w-full overflow-hidden md:mb-12", className)}>
      <div className="mx-auto grid w-full max-w-4xl grid-cols-2 xs:grid-cols-3 sm:grid-cols-4 lg:flex lg:items-start lg:justify-center lg:gap-3">
        {steps.map((step, idx) => (
          <React.Fragment key={step.id}>
            <div className="flex min-w-0 flex-col items-center rounded-2xl border border-slate-100 bg-white/70 p-2 shadow-sm lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none">
              <button
                type="button"
                onClick={() => onStepChange?.(step.id)}
                className={cn(
                  "flex h-9 w-9 items-center justify-center rounded-full text-[10px] font-bold transition-all duration-300 md:h-10 md:w-10 md:text-xs",
                  onStepChange && "cursor-pointer hover:scale-105 focus:outline-none focus:ring-2 focus:ring-indigo-300 focus:ring-offset-2",
                  currentStep >= step.id 
                    ? "bg-indigo-600 text-white shadow-lg shadow-indigo-500/30" 
                    : "bg-white border-2 border-slate-200 text-slate-400"
                )}
              >
                {step.id}
              </button>
              <span className={cn(
                 "mt-2 max-w-full text-center text-[9px] font-bold uppercase leading-tight tracking-wide sm:text-[10px] lg:tracking-widest",
                 currentStep >= step.id ? "text-indigo-600" : "text-slate-400"
              )}>
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={cn(
                "hidden h-0.5 w-12 self-start lg:block lg:mt-5",
                currentStep > step.id ? "bg-indigo-600" : "bg-slate-200"
              )} />
            )}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
