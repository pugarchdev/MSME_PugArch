import Link from 'next/link';
import { Button } from '../components/ui/button';
import { ShoppingCart, Building2, Store, ArrowRight, ShieldCheck, CheckCircle2, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="min-h-dvh w-full bg-gradient-to-br from-slate-50 via-white to-slate-100/60 flex flex-col justify-between px-4 py-6 sm:px-6 sm:py-12">
      <div className="max-w-4xl mx-auto w-full flex-grow flex flex-col justify-center space-y-12 py-8 sm:space-y-16 sm:py-12">
        {/* Hero Section */}
        <div className="mx-auto max-w-4xl space-y-6 text-center sm:space-y-8">
          <h1 className="text-3xl sm:text-5xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight text-brand-navy">
            Streamline Your Procurement Onboarding with <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-amber to-amber-700">JsgSmile</span>
          </h1>
          <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-600 sm:text-xl">
            The unified portal for buyers and sellers to connect, register, and manage procurement lifecycle with simplicity and transparency.
          </p>
          <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row sm:gap-4 sm:pt-4">
            {!user ? (
              <>
                <Link href="/seller/register">
                  <Button variant="primary" size="lg" className="h-14 w-full gap-2 px-6 text-base sm:h-16 sm:w-auto sm:px-8 sm:text-lg bg-brand-navy hover:bg-brand-deep text-white font-bold border-0 transition-all hover:translate-y-[-2px] active:scale-[0.98] shadow-lg shadow-brand-navy/15">
                    <Store className="h-6 w-6" />
                    <span>Join as Seller</span>
                  </Button>
                </Link>
                <Link href="/buyer/register">
                  <Button variant="outline" size="lg" className="h-14 w-full gap-2 border-2 border-brand-navy px-6 text-base sm:h-16 sm:w-auto sm:px-8 sm:text-lg text-brand-navy hover:bg-brand-navy hover:text-white font-bold transition-all hover:translate-y-[-2px] active:scale-[0.98] shadow-sm">
                    <Building2 className="h-6 w-6" />
                    <span>Join as Buyer</span>
                  </Button>
                </Link>
              </>
            ) : (
              <Link href="/dashboard">
                <Button variant="primary" size="lg" className="h-14 w-full gap-2 px-6 text-base sm:h-16 sm:w-auto sm:px-8 sm:text-lg bg-brand-navy hover:bg-brand-deep text-white font-bold border-0 transition-all hover:translate-y-[-2px] active:scale-[0.98] shadow-lg shadow-brand-navy/15">
                  <LayoutDashboard className="h-6 w-6" />
                  <span>Go to Dashboard</span>
                </Button>
              </Link>
            )}
          </div>
          {!user && (
            <div className="pt-6">
              <p className="text-slate-500 text-sm font-medium">
                Already have an account? {' '}
                <Link href="/login" className="text-brand-amber font-bold hover:underline decoration-2 underline-offset-2">
                  Login here
                </Link>
              </p>
            </div>
          )}
        </div>
 
        {/* Features */}
        <div className="grid gap-6 md:grid-cols-3">
          <div className="group space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md sm:p-8">
            <div className="w-14 h-14 bg-amber-50 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
              <ShieldCheck className="h-7 w-7 text-amber-600" />
            </div>
            <h3 className="text-lg font-bold text-brand-navy tracking-tight">Secure Verification</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">Enterprise-grade document verification and KYB checks for all participants.</p>
          </div>
          <div className="group space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md sm:p-8">
            <div className="w-14 h-14 bg-amber-50 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
              <CheckCircle2 className="h-7 w-7 text-brand-amber" />
            </div>
            <h3 className="text-lg font-bold text-brand-navy tracking-tight">Fast Approval</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">Dedicated admin workflow ensures onboarding is processed within 48 hours.</p>
          </div>
          <div className="group space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md sm:p-8">
            <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
              <ArrowRight className="h-7 w-7 text-brand-navy" />
            </div>
            <h3 className="text-lg font-bold text-brand-navy tracking-tight">Direct Integration</h3>
            <p className="text-sm text-slate-600 leading-relaxed font-medium">Connect directly into our ERP system once your profile is approved.</p>
          </div>
        </div>
      </div>
      
      <div className="max-w-4xl mx-auto w-full flex justify-center border-t border-slate-200 pt-6">
        <Link href="/admin/register" className="text-xs font-bold text-slate-400 hover:text-brand-navy transition-colors uppercase tracking-widest">
          Admin Control Center
        </Link>
      </div>
    </div>
  );
}
