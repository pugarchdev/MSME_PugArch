import { useState, type FormEvent, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from 'react';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { ArrowLeft, CalendarClock, FileText, Gavel, IndianRupee, RotateCw, Save, ShieldCheck, AlertCircle, type LucideIcon } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { reverseAuctionApi } from '../api';

type LinkType = 'linkedTenderId' | 'linkedBidId' | 'linkedRequirementId';

export default function ReverseAuctionCreatePage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-xl py-20 px-6 text-center space-y-6 bg-white border border-slate-200 rounded-xl shadow-xs mt-10">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-amber-50 text-amber-600 border border-amber-200 mx-auto animate-pulse">
        <AlertCircle className="h-6 w-6" />
      </div>
      <h2 className="text-sm font-black uppercase text-slate-900 tracking-wider">Legacy Creation Flow Replaced</h2>
      <p className="text-xs text-slate-500 font-semibold leading-relaxed">
        This old reverse auction creation flow has been replaced by the unified guided Create Procurement wizard.
      </p>
      <div className="flex flex-col sm:flex-row justify-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => router.push('/reverse-auctions')}
          className="h-10 px-5 text-slate-700 rounded-lg text-[10px] uppercase font-black tracking-wide border border-slate-200"
        >
          Back to Auctions List
        </Button>
        <Button
          type="button"
          onClick={() => router.push('/buyer/procurement/create')}
          className="bg-[#12335f] text-white hover:bg-[#0e2a4f] text-[10px] uppercase font-black tracking-wide h-10 px-6 rounded-lg shadow-sm"
        >
          Open Create Procurement
        </Button>
      </div>
    </div>
  );
}

const controlClass = 'h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 shadow-sm outline-none transition placeholder:text-slate-400 focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10 disabled:cursor-not-allowed disabled:bg-slate-50';

function Section({ icon: Icon, title, description, children }: { icon: LucideIcon; title: string; description: string; children: ReactNode }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="mb-4 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#12335f] text-white">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-black text-slate-950">{title}</h2>
            <p className="mt-1 text-xs font-semibold text-slate-500">{description}</p>
          </div>
        </div>
        {children}
      </CardContent>
    </Card>
  );
}

function Field({ label, children, required, className = '' }: { label: string; children: ReactNode; required?: boolean; className?: string }) {
  return (
    <label className={`block space-y-1.5 ${className}`}>
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label} {required && <span className="text-red-500">*</span>}</span>
      {children}
    </label>
  );
}

function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className || ''}`} />;
}

function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className || ''}`} />;
}

function Toggle({ name, label, description }: { name: string; label: string; description: string }) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 transition hover:bg-slate-100">
      <input name={name} type="checkbox" className="mt-1 h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f]" />
      <span>
        <span className="block text-xs font-black text-slate-900">{label}</span>
        <span className="mt-1 block text-xs font-semibold leading-5 text-slate-500">{description}</span>
      </span>
    </label>
  );
}
