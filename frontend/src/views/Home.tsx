import Link from 'next/link';
import { Button } from '../components/ui/button';
import { Building2, Store, ArrowRight, ShieldCheck, CheckCircle2, LayoutDashboard, LogIn, Award } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="relative min-h-dvh w-full bg-[#f8fafc] text-[#1f2937] flex flex-col justify-between overflow-hidden">
      {/* 3-Color Flag Accent Strip at the very top */}
      <div className="brand-tricolor-strip w-full absolute top-0 left-0 z-50" />

      {/* Dynamic Glow Orbs in Background */}
      <div className="absolute top-[-10%] left-[-15%] h-[50%] w-[50%] rounded-full bg-blue-100/50 blur-[140px] animate-pulse pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-15%] h-[50%] w-[50%] rounded-full bg-amber-100/40 blur-[140px] animate-pulse pointer-events-none" />



      {/* Hero Section Container */}
      <div className="relative max-w-6xl mx-auto w-full flex-grow flex flex-col justify-center px-4 py-12 sm:px-6 lg:py-20 z-10">
        <div className="grid lg:grid-cols-12 gap-12 items-center">

          {/* Left Column: Hero Text */}
          <div className="lg:col-span-7 space-y-6 sm:space-y-8 text-left">
            <h1 className="text-4xl sm:text-6xl font-black leading-[1.05] tracking-tight text-[#0b2447] text-wrap-balance">
              Streamline Your <br className="hidden sm:inline" />
              Procurement Onboarding with <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c8a45c] to-amber-700">JsgSmile</span>
            </h1>

            <p className="max-w-xl text-base leading-relaxed text-slate-600 sm:text-lg font-medium">
              The unified government-linked gateway for verified buyers and sellers to seamlessly connect, register, and coordinate procurement workflows with unmatched speed, transparency, and simplicity.
            </p>

            <div className="flex flex-col sm:flex-row gap-4 pt-2">
              {!user ? (
                <>
                  <Link href="/seller/register" className="flex-1 sm:flex-none">
                    <Button className="h-14 w-full gap-3 px-8 rounded-2xl bg-gradient-to-r from-[#0b2447] to-[#12335f] hover:from-[#12335f] hover:to-[#0b2447] text-white font-extrabold uppercase tracking-wider transition-all hover:translate-y-[-2px] active:scale-[0.98] shadow-lg shadow-blue-900/10 text-sm">
                      <Store className="h-5 w-5" />
                      <span>Join as Seller</span>
                    </Button>
                  </Link>
                  <Link href="/buyer/register" className="flex-1 sm:flex-none">
                    <Button className="h-14 w-full gap-3 px-8 rounded-2xl border-2 border-[#0b2447] hover:border-[#12335f] bg-transparent text-[#0b2447] hover:bg-slate-50 font-extrabold uppercase tracking-wider transition-all hover:translate-y-[-2px] active:scale-[0.98] text-sm">
                      <Building2 className="h-5 w-5" />
                      <span>Join as Buyer</span>
                    </Button>
                  </Link>
                </>
              ) : (
                <Link href="/dashboard">
                  <Button className="h-14 gap-3 px-8 rounded-2xl bg-gradient-to-r from-[#0b2447] to-[#12335f] hover:from-[#12335f] hover:to-[#0b2447] text-white font-extrabold uppercase tracking-wider transition-all hover:translate-y-[-2px] active:scale-[0.98] shadow-lg shadow-blue-900/10 text-sm">
                    <LayoutDashboard className="h-5 w-5" />
                    <span>Access Your Dashboard</span>
                  </Button>
                </Link>
              )}
            </div>

            {!user && (
              <div className="pt-2">
                <p className="text-slate-500 text-xs font-bold uppercase tracking-wider">
                  Already have an account? {' '}
                  <Link href="/login" className="text-[#c8a45c] font-black hover:text-amber-700 transition-colors underline decoration-[#c8a45c] underline-offset-4 decoration-2">
                    Access Portal Here
                  </Link>
                </p>
              </div>
            )}
          </div>

          {/* Right Column: Dynamic Cards / Trust Badges */}
          <div className="lg:col-span-5 grid gap-4 sm:gap-6">

            {/* Card 1 */}
            <div className="group relative flex gap-5 rounded-3xl border border-white bg-white/60 hover:bg-white/80 p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all hover:translate-y-[-3px] duration-300">
              <div className="absolute top-4 right-4 text-xs font-black text-slate-300/40 select-none">01</div>
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-100 group-hover:scale-105 transition-transform duration-300 shrink-0">
                <ShieldCheck className="h-6 w-6 text-amber-600" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-[#0b2447] tracking-tight">Secure Verification</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">Enterprise-grade document verification and state-of-the-art KYB checks for all participants.</p>
              </div>
            </div>

            {/* Card 2 */}
            <div className="group relative flex gap-5 rounded-3xl border border-white bg-white/60 hover:bg-white/80 p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all hover:translate-y-[-3px] duration-300">
              <div className="absolute top-4 right-4 text-xs font-black text-slate-300/40 select-none">02</div>
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center border border-amber-100 group-hover:scale-105 transition-transform duration-300 shrink-0">
                <CheckCircle2 className="h-6 w-6 text-[#c8a45c]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-[#0b2447] tracking-tight">Fast Turnaround</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">Dedicated official workflows ensure processing and review completed securely within 48 hours.</p>
              </div>
            </div>

            {/* Card 3 */}
            <div className="group relative flex gap-5 rounded-3xl border border-white bg-white/60 hover:bg-white/80 p-6 sm:p-7 shadow-[0_8px_30px_rgb(0,0,0,0.02)] hover:shadow-[0_20px_40px_rgba(0,0,0,0.04)] backdrop-blur-md transition-all hover:translate-y-[-3px] duration-300">
              <div className="absolute top-4 right-4 text-xs font-black text-slate-300/40 select-none">03</div>
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center border border-blue-100 group-hover:scale-105 transition-transform duration-300 shrink-0">
                <ArrowRight className="h-6 w-6 text-[#0b2447]" />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-extrabold text-[#0b2447] tracking-tight">Direct Integration</h3>
                <p className="text-xs text-slate-500 leading-relaxed font-semibold">Instantly connect directly to unified industry ERP and catalog modules after authorization.</p>
              </div>
            </div>

          </div>
        </div>
      </div>

      {/* Premium Footer */}
      <footer className="w-full bg-white/50 backdrop-blur-sm border-t border-slate-200/50 py-6 px-4 z-10">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center sm:text-left">
            &copy; {new Date().getFullYear()} Jharsuguda Synergy for MSME and Industry Linkage Ecosystem. All Rights Reserved.
          </p>
          <Link href="/admin/register" className="group flex items-center gap-1.5 rounded-xl px-3 py-1.5 border border-slate-200 hover:border-slate-300 bg-white/50 hover:bg-white text-[10px] font-black text-slate-500 hover:text-[#0b2447] transition-all uppercase tracking-widest shadow-sm">
            <span>Admin Control Center</span>
            <ArrowRight className="h-3 w-3 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </footer>
    </div>
  );
}
