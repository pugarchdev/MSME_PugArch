import React from 'react';
import Link from 'next/link';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Building2, Store, ArrowRight, ShieldCheck, ArrowLeft } from 'lucide-react';

export default function RegisterSelection() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-50 px-3 py-3 sm:px-4">
      {/* BACK BUTTON */}
      <Link
        href="/login"
        className="group absolute top-6 left-6 z-20 flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-650 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.05)] backdrop-blur-md transition-all hover:-translate-x-1 hover:text-[#12335f] hover:shadow-[0_12px_20px_-8px_rgba(18,51,95,0.15)] active:scale-[0.98]"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        <span>Back to Login</span>
      </Link>

      {/* BACKGROUND DECORATIONS */}
      <div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-blue-200/40 blur-[120px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-slate-200/40 blur-[120px] animate-pulse pointer-events-none" />

      <div className="relative z-10 w-full max-w-4xl px-4 text-center">
        {/* Header Branding */}
        <div className="mb-5 text-center">
          <div className="mx-auto w-30 h-30  flex items-center justify-center mb-2 border border-slate-100 p-2">
            <img src="/msme-logo.png" alt="Official MSME Logo" className="w-full h-full object-contain" />
          </div>
          <h2 className="text-3xl font-black uppercase tracking-tight text-slate-800 sm:text-4xl">
            <span className="block text-[#f9a825] text-xs tracking-[0.3em] mb-1.5 font-bold uppercase">Join JsgSmile</span>
            Create Your Stakeholder Profile
          </h2>
          <p className="max-w-md mx-auto text-sm font-semibold text-slate-500 mt-3 leading-relaxed">
            Select the stakeholder profile type that best describes your business or official organization to begin.
          </p>
        </div>

        {/* Choices Container */}
        <div className="grid md:grid-cols-2 gap-6 max-w-4xl mx-auto">
          {/* Seller Card */}
          <Link href="/seller/register" className="group block h-full">
            <Card className="h-full overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 backdrop-blur-md shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1.5 flex flex-col p-8 text-left justify-between">
              <CardContent className="p-0 flex flex-col justify-between h-full">
                <div>
                  <div className="w-14 h-14 bg-indigo-50 rounded-2xl flex items-center justify-center border border-indigo-100 mb-6 group-hover:scale-105 transition-transform duration-300">
                    <Store className="h-7 w-7 text-indigo-650" />
                  </div>
                  <h3 className="text-xl font-extrabold text-[#0b2447] mb-3 tracking-tight">
                    Register as Seller / Vendor
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold mb-6">
                    For MSMEs, private companies, firms, startups, or proprietors looking to sell products/services, register catalogues, and bid on public/private tenders.
                  </p>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-slate-100/50 mt-auto">
                  <span className="text-[11px] font-black text-indigo-600 uppercase tracking-widest group-hover:underline">
                    Get Started as Seller
                  </span>
                  <div className="h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1.5">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>

          {/* Buyer Card */}
          <Link href="/buyer/register" className="group block h-full">
            <Card className="h-full overflow-hidden rounded-[2rem] border border-white/60 bg-white/70 backdrop-blur-md shadow-lg hover:shadow-2xl transition-all duration-300 hover:-translate-y-1.5 flex flex-col p-8 text-left justify-between">
              <CardContent className="p-0 flex flex-col justify-between h-full">
                <div>
                  <div className="w-14 h-14 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-100 mb-6 group-hover:scale-105 transition-transform duration-300">
                    <Building2 className="h-7 w-7 text-amber-700" />
                  </div>
                  <h3 className="text-xl font-extrabold text-[#0b2447] mb-3 tracking-tight">
                    Register as Buyer / Department
                  </h3>
                  <p className="text-xs text-slate-500 leading-relaxed font-semibold mb-6">
                    For government offices, corporate purchasing bodies, or PSU managers authorized to float requirements, evaluate proposals, and issue direct purchase orders.
                  </p>
                </div>
                <div className="flex items-center justify-between pt-4 border-t border-slate-100/50 mt-auto">
                  <span className="text-[11px] font-black text-amber-700 uppercase tracking-widest group-hover:underline">
                    Get Started as Buyer
                  </span>
                  <div className="h-8 w-8 rounded-full bg-slate-900 text-white flex items-center justify-center transition-transform duration-300 group-hover:translate-x-1.5">
                    <ArrowRight className="h-4 w-4" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </Link>
        </div>

        {/* Footer Brand Info */}
        <div className="mt-14 text-xs font-bold text-slate-400 uppercase tracking-widest">
          Jharsuguda Synergy for MSME and Industry Linkage Ecosystem
          <span className="block text-[#f9a825] mt-1 text-sm font-black">
            <ShieldCheck className="h-3 w-3 inline mr-1 mb-0.5" />
            Secure • Trusted • Transparent
          </span>
        </div>
      </div>
    </div>
  );
}
