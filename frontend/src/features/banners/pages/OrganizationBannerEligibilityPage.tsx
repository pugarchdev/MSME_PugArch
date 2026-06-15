import { OrganizationBannerUploadCard } from '../components/OrganizationBannerUploadCard';
import { Sparkles, LayoutGrid, Clock, ImagePlus } from 'lucide-react';

export default function OrganizationBannerEligibilityPage() {
  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Premium Dark Gradient Header Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a1b33] via-[#12335f] to-[#1e457e] p-6 text-white shadow-lg shadow-slate-200/50">
        {/* Decorative Light Glows */}
        <div className="absolute -right-24 -top-24 h-48 w-48 rounded-full bg-blue-400/20 blur-3xl pointer-events-none" />
        <div className="absolute -left-20 -bottom-20 h-40 w-40 rounded-full bg-emerald-400/10 blur-2xl pointer-events-none" />
        
        <div className="relative">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-blue-200 border border-white/5 backdrop-blur-sm">
            <Sparkles className="h-3 w-3 text-blue-300 animate-pulse" />
            Marketing Hub
          </span>
          
          <h1 className="mt-3 text-2xl sm:text-3xl font-black tracking-tight text-white">
            Banner Eligibility
          </h1>
          
          <p className="mt-2 max-w-3xl text-xs sm:text-sm text-slate-200/90 leading-relaxed font-semibold">
            Eligible buyer and seller organizations can submit a homepage promotional banner here. New submissions remain pending until an admin approves them from Banner Management.
          </p>
          
          {/* Quick Specifications Info Grid */}
          <div className="mt-6 grid gap-4 text-xs font-semibold text-slate-200 sm:grid-cols-3">
            <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3.5 backdrop-blur-md hover:bg-white/10 transition-colors">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-blue-500/25 text-blue-300">
                <LayoutGrid className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <span className="block text-[9px] uppercase tracking-wider text-slate-300/80 font-black">Placement</span>
                <span className="font-extrabold text-white text-[12.5px] truncate block">Homepage Hero Slider</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3.5 backdrop-blur-md hover:bg-white/10 transition-colors">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-emerald-500/25 text-emerald-300">
                <Clock className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <span className="block text-[9px] uppercase tracking-wider text-slate-300/80 font-black">Default Display</span>
                <span className="font-extrabold text-white text-[12.5px] truncate block">10 Days Active</span>
              </div>
            </div>
            
            <div className="flex items-center gap-3 rounded-xl bg-white/5 border border-white/10 p-3.5 backdrop-blur-md hover:bg-white/10 transition-colors">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-500/25 text-orange-300">
                <ImagePlus className="h-4.5 w-4.5" />
              </div>
              <div className="min-w-0">
                <span className="block text-[9px] uppercase tracking-wider text-slate-300/80 font-black">Formats</span>
                <span className="font-extrabold text-white text-[12.5px] truncate block">JPG, PNG, WebP</span>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      <OrganizationBannerUploadCard />
    </div>
  );
}
