'use client';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { AadhaarVerificationCard } from './AadhaarVerificationCard';

export default function AadhaarKycPage() {
  return (
    <div className="mx-auto w-full max-w-5xl space-y-5 pb-16">
      <div className="brand-tricolor-strip rounded-full" />
      <div className="border-b border-slate-200 pb-5">
        <Link href="/dashboard" className="mb-3 inline-flex items-center gap-1 text-xs font-bold text-slate-500 hover:text-[#12335f]">
          <ArrowLeft className="h-3.5 w-3.5" /> Back to dashboard
        </Link>
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-[#12335f]/10 text-[#12335f]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Onboarding KYC</p>
            <h1 className="text-2xl font-black text-slate-950">Aadhaar Verification</h1>
          </div>
        </div>
        <p className="mt-2 max-w-2xl text-sm font-semibold text-slate-500">
          Complete or review your DigiLocker / MeriPehchaan Aadhaar verification status.
        </p>
      </div>
      <AadhaarVerificationCard />
    </div>
  );
}
