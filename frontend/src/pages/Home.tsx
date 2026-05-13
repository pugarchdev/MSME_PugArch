import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import { ShoppingCart, Building2, Store, ArrowRight, ShieldCheck, CheckCircle2, LayoutDashboard } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Home() {
  const { user } = useAuth();

  return (
    <div className="space-y-12 px-4 py-10 sm:space-y-16 sm:px-6 sm:py-16">
      {/* Hero Section */}
      <div className="mx-auto max-w-4xl space-y-6 text-center sm:space-y-8">
        <h1 className="text-3xl sm:text-5xl lg:text-7xl font-extrabold leading-[1.1] tracking-tight text-[#12335f]">
          Streamline Your Procurement Onboarding with <span className="text-[#f9a825]">PugArch MSME</span>
        </h1>
        <p className="mx-auto max-w-2xl text-base leading-relaxed text-slate-600 sm:text-xl">
          The unified portal for buyers and sellers to connect, register, and manage procurement lifecycle with simplicity and transparency.
        </p>
        <div className="flex flex-col justify-center gap-3 pt-2 sm:flex-row sm:gap-4 sm:pt-4">
          {!user ? (
            <>
              <Link to="/seller/register">
                <Button size="lg" className="h-14 w-full gap-2 px-6 text-base sm:h-16 sm:w-auto sm:px-8 sm:text-lg bg-gradient-to-r from-[#12335f] to-[#0b2445] hover:from-[#0b2445] hover:to-[#071830] text-white font-bold shadow-[0_20px_40px_-10px_rgba(18,51,95,0.3)] border-0 transition-all hover:translate-y-[-2px] active:scale-[0.98]">
                  <Store className="h-6 w-6" />
                  <span>Join as Seller</span>
                </Button>
              </Link>
              <Link to="/buyer/register">
                <Button variant="outline" size="lg" className="h-14 w-full gap-2 border-2 border-slate-200 px-6 text-base sm:h-16 sm:w-auto sm:px-8 sm:text-lg text-[#12335f] hover:bg-slate-50 hover:text-[#12335f]">
                  <Building2 className="h-6 w-6" />
                  <span>Join as Buyer</span>
                </Button>
              </Link>
            </>
          ) : (
            <Link to="/dashboard">
              <Button size="lg" className="h-14 w-full gap-2 px-6 text-base sm:h-16 sm:w-auto sm:px-8 sm:text-lg bg-[#12335f] hover:bg-[#0b2445] shadow-sm">
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
              <Link to="/login" className="text-[#f9a825] font-bold hover:underline decoration-2 underline-offset-2">
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
          <h3 className="text-lg font-bold text-[#12335f] tracking-tight">Secure Verification</h3>
          <p className="text-sm text-slate-600 leading-relaxed font-medium">Enterprise-grade document verification and KYB checks for all participants.</p>
        </div>
        <div className="group space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md sm:p-8">
          <div className="w-14 h-14 bg-[#f9a825]/10 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <CheckCircle2 className="h-7 w-7 text-[#f9a825]" />
          </div>
          <h3 className="text-lg font-bold text-[#12335f] tracking-tight">Fast Approval</h3>
          <p className="text-sm text-slate-600 leading-relaxed font-medium">Dedicated admin workflow ensures onboarding is processed within 48 hours.</p>
        </div>
        <div className="group space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition-all hover:shadow-md sm:p-8">
          <div className="w-14 h-14 bg-slate-100 rounded-xl flex items-center justify-center group-hover:scale-105 transition-transform">
            <ArrowRight className="h-7 w-7 text-[#12335f]" />
          </div>
          <h3 className="text-lg font-bold text-[#12335f] tracking-tight">Direct Integration</h3>
          <p className="text-sm text-slate-600 leading-relaxed font-medium">Connect directly into our ERP system once your profile is approved.</p>
        </div>
      </div>
      
      <div className="flex justify-center border-t border-slate-200 pt-8 sm:pt-12">
        <Link to="/admin/register" className="text-xs font-bold text-slate-400 hover:text-[#12335f] transition-colors uppercase tracking-widest">
          Admin Control Center
        </Link>
      </div>
    </div>
  );
}
