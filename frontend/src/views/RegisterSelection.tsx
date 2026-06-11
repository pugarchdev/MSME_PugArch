import React from 'react';
import Link from 'next/link';
import { Card, CardContent } from '../components/ui/card';
import { ArrowLeft, ArrowRight, Building2, ShieldCheck, Store, UsersRound } from 'lucide-react';
import { cn } from '../lib/utils';

const registrationOptions = [
  {
    href: '/seller/register',
    title: 'Register as Seller / Vendor',
    cta: 'Get Started as Seller',
    description: 'For MSMEs, private companies, firms, startups, or proprietors looking to sell products/services, register catalogues, and bid on public/private tenders.',
    icon: Store,
    iconClass: 'bg-indigo-50 text-indigo-650 border-indigo-100'
  },
  {
    href: '/buyer/register',
    title: 'Register as Buyer / User',
    cta: 'Get Started as Buyer',
    description: 'For government departments, co-operatives, institutions, and authorized procurement users who publish requirements, compare vendors, and manage purchases.',
    icon: Building2,
    iconClass: 'bg-amber-50 text-amber-650 border-amber-100'
  },
  {
    href: '/hershg/register',
    title: 'Register as herSHG',
    cta: 'Get Started as herSHG',
    description: 'For women Self-Help Groups and producer collectives selling handcrafted, food, textile, service, or local products with SHG-ready verification documents.',
    icon: UsersRound,
    iconClass: 'bg-emerald-50 text-emerald-650 border-emerald-100'
  }
];

export default function RegisterSelection() {
  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-50 px-3 py-16 sm:px-4 sm:py-20 lg:py-8">
      <Link
        href="/login"
        className="group absolute left-4 top-4 z-20 flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/85 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-650 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.05)] backdrop-blur-md transition-all hover:-translate-x-1 hover:text-[#12335f] hover:shadow-[0_12px_20px_-8px_rgba(18,51,95,0.15)] active:scale-[0.98] sm:left-6 sm:top-6 sm:px-4 sm:py-2.5 sm:text-xs"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        <span>Back to Login</span>
      </Link>

      <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[40%] w-[40%] animate-pulse rounded-full bg-blue-200/40 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] animate-pulse rounded-full bg-slate-200/40 blur-[120px]" />

      <div className="relative z-10 w-full max-w-6xl px-1 text-center sm:px-4">
        <div className="mb-6 text-center sm:mb-8">
          <div className="mx-auto mb-2 flex h-24 w-24 items-center justify-center border border-slate-100 p-2 sm:h-28 sm:w-28 md:h-30 md:w-30">
            <img src="/msme-logo.png" alt="Official MSME Logo" className="h-full w-full object-contain" />
          </div>
          <h2 className="text-2xl font-black uppercase tracking-tight text-slate-800 sm:text-3xl md:text-4xl">
            <span className="mb-1.5 block text-xs font-bold uppercase tracking-[0.3em] text-[#f9a825]">Join JsgSmile</span>
            Create Your Stakeholder Profile
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-sm font-semibold leading-relaxed text-slate-500">
            Select the stakeholder profile that best describes your business, procurement organization, or women Self-Help Group to begin a guided registration flow.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:gap-5 md:grid-cols-2 xl:grid-cols-3">
          {registrationOptions.map((option) => {
            const Icon = option.icon;
            return (
              <Link key={option.href} href={option.href} className="group block h-full">
                <Card className="flex h-full flex-col overflow-hidden rounded-[1.5rem] border border-white/70 bg-white/80 p-5 text-left shadow-lg backdrop-blur-md transition-all duration-300 hover:-translate-y-1 hover:shadow-2xl sm:rounded-[2rem] sm:p-7">
                  <CardContent className="flex h-full flex-col justify-between p-0">
                    <div>
                      <div className={cn('mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border transition-transform duration-300 group-hover:scale-105', option.iconClass)}>
                        <Icon className="h-7 w-7" />
                      </div>
                      <h3 className="mb-3 text-lg font-extrabold tracking-tight text-[#0b2447] sm:text-xl">{option.title}</h3>
                      <p className="mb-6 text-xs font-semibold leading-relaxed text-slate-500 sm:text-sm">{option.description}</p>
                    </div>
                    <div className="mt-auto flex items-center justify-between border-t border-slate-100/70 pt-4">
                      <span className="text-[11px] font-black uppercase tracking-widest text-indigo-600 group-hover:underline">{option.cta}</span>
                      <div className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-900 text-white transition-transform duration-300 group-hover:translate-x-1.5">
                        <ArrowRight className="h-4 w-4" />
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>

        <div className="mx-auto mt-6 flex max-w-3xl items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50/70 px-4 py-3 text-left text-xs font-semibold leading-relaxed text-emerald-800">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
          <p>herSHG registration follows the seller pathway and adds SHG-specific readiness checks such as authorization resolution, member list, SHG bank details, and registration proof.</p>
        </div>
      </div>
    </div>
  );
}
