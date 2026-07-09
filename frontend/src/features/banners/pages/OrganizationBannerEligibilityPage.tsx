import { OrganizationBannerUploadCard } from '../components/OrganizationBannerUploadCard';
import { Sparkles, LayoutGrid, Clock, ImagePlus } from 'lucide-react';

export default function OrganizationBannerEligibilityPage() {
  return (
    <div className="mx-auto max-w-[86rem] space-y-5">
      <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white/92 shadow-sm">
        <div className="brand-tricolor-strip rounded-none" />
        <div className="p-4 sm:p-5 lg:p-6">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-[#12335f]">
            <Sparkles className="h-3 w-3 text-[#12335f]" />
            Marketing Hub
          </span>
          
          <h1 className="mt-3 text-2xl font-black tracking-tight text-slate-950 sm:text-3xl">
            Banner Eligibility
          </h1>
          
          <p className="mt-2 max-w-3xl text-xs font-semibold leading-relaxed text-slate-600 sm:text-sm">
            Eligible buyer and seller organizations can submit a homepage promotional banner here. New submissions remain pending until an admin approves them from Banner Management.
          </p>
          
          <div className="mt-5 grid gap-3 text-xs font-semibold text-slate-600 md:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-[#12335f]">
                <LayoutGrid className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Placement</span>
                <span className="block truncate text-[12.5px] font-extrabold text-slate-900">Homepage Hero Slider</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600">
                <Clock className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Default Display</span>
                <span className="block truncate text-[12.5px] font-extrabold text-slate-900">10 Days Active</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50/80 p-3.5">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-orange-600">
                <ImagePlus className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Formats</span>
                <span className="block truncate text-[12.5px] font-extrabold text-slate-900">JPG, PNG, WebP</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <OrganizationBannerUploadCard />
    </div>
  );
}
