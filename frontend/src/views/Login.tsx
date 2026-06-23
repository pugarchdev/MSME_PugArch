import React, { useEffect, useState, useCallback } from 'react';
import { api, readJsonResponse } from '../lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { toast } from 'sonner';
import { ShieldCheck, Mail, Key, Eye, EyeOff, ArrowLeft, CheckCircle2, Building2, Store, UsersRound } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { isShgUser } from '../lib/shg';

const generateSecureCaptchaString = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [captchaValue, setCaptchaValue] = useState(generateSecureCaptchaString());
  const [userCaptcha, setUserCaptcha] = useState('');
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [twoFactorOtp, setTwoFactorOtp] = useState('');
  const [twoFactorChannel, setTwoFactorChannel] = useState<'email' | 'sms'>('email');
  const [canSms, setCanSms] = useState(false);

  const { user, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  const generateCaptcha = useCallback(() => {
    setCaptchaValue(generateSecureCaptchaString());
    setUserCaptcha('');
  }, []);

  useEffect(() => {
    if (user) {
      if (returnUrl) {
        router.replace(decodeURIComponent(returnUrl));
      } else {
        if (isShgUser(user)) {
          router.replace('/shg/onboarding');
        } else {
          router.replace(user.role === 'master_admin' ? '/master-admin' : '/dashboard');
        }
      }
    }
  }, [user, router, returnUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const loadToast = toast.loading('Authenticating credentials...');

    try {
      const res = await api.post('/api/auth/login', { email, password });
      const data = await readJsonResponse(res);

      if (res.ok) {
        if (data.requiresTwoFactor) {
          setTwoFactorPending(true);
          setTwoFactorChannel(data.channel === 'sms' ? 'sms' : 'email');
          setCanSms(!!data.canSms);
          toast.success(`Enter the two-factor code sent to your ${data.channel === 'sms' ? 'mobile' : 'email'}`, { id: loadToast });
          return;
        }
        login(data.accessToken || data.token, data.user, data.refreshToken);
        toast.success(`Welcome back, ${data.user.name}!`, { id: loadToast });
      } else {
        toast.error(data.message || 'Login failed', { id: loadToast });
        generateCaptcha();
      }
    } catch (err: any) {
      toast.error(err?.message || 'Unable to reach the backend API', { id: loadToast });
    } finally {
      setIsLoading(false);
    }
  };

  const handleTwoFactorSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const loadToast = toast.loading('Verifying secure code...');
    try {
      const res = await api.post('/api/auth/2fa/verify', { email, channel: twoFactorChannel, otp: twoFactorOtp });
      const data = await readJsonResponse(res);
      if (!res.ok) {
        toast.error(data.message || 'Invalid verification code', { id: loadToast });
        return;
      }
      login(data.accessToken || data.token, data.user, data.refreshToken);
      toast.success(`Welcome back, ${data.user.name}!`, { id: loadToast });
    } catch (err: any) {
      toast.error(err?.message || 'Unable to verify code', { id: loadToast });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh w-full overflow-hidden bg-slate-50">

      {/* ═══════════════════════════════════════════════════════════════════
          LEFT PANEL — Brand showcase with prominent logo
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="relative hidden lg:flex lg:w-[52%] xl:w-[55%] flex-col items-center justify-center overflow-hidden bg-gradient-to-br from-[#07172e] via-[#0b2447] to-[#0a1e3d]">
        {/* Tricolor accent strip at top */}
        <div className="brand-tricolor-strip absolute top-0 left-0 w-full z-10" />

        {/* Animated background orbs */}
        <div className="absolute top-[10%] left-[5%] h-[45%] w-[45%] rounded-full bg-blue-500/[0.08] blur-[140px] animate-pulse pointer-events-none" style={{ animationDuration: '7s' }} />
        <div className="absolute bottom-[5%] right-[10%] h-[40%] w-[40%] rounded-full bg-[#c8a45c]/[0.06] blur-[120px] animate-pulse pointer-events-none" style={{ animationDuration: '5s' }} />
        <div className="absolute top-[50%] left-[40%] h-[30%] w-[30%] rounded-full bg-emerald-500/[0.05] blur-[100px] animate-pulse pointer-events-none" style={{ animationDuration: '9s' }} />

        {/* Subtle grid pattern overlay */}
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='1'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E")`,
        }} />

        {/* Content */}
        <div className="relative z-10 flex flex-col items-center px-10 xl:px-16 text-center max-w-xl">
          {/* Logo — large and prominent */}
          <div className="relative group">
            <div className="absolute -inset-6 rounded-full bg-gradient-to-tr from-[#c8a45c]/20 to-white/10 blur-3xl opacity-80 group-hover:opacity-100 transition-opacity duration-700" />
            <div className="relative w-80 h-80 xl:w-96 xl:h-96 bg-white rounded-[2.5rem] shadow-[0_32px_80px_-16px_rgba(0,0,0,0.5)] flex items-center justify-center p-4 xl:p-6 border-2 border-white/30 overflow-hidden transition-all duration-500 group-hover:scale-[1.02] group-hover:shadow-[0_40px_100px_-16px_rgba(0,0,0,0.6)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src="/logoo.png"
                alt="SMiLE - Synergy for MSME and Industry Linkage Ecosystem"
                className="w-full h-full object-contain drop-shadow-md transition-transform duration-500 group-hover:scale-[1.04]"
              />
            </div>
          </div>

          {/* Separator */}
          <div className="mt-6 w-16 h-[2px] bg-gradient-to-r from-transparent via-[#c8a45c]/60 to-transparent" />

          {/* Title */}
          <h1 className="mt-4 text-2xl xl:text-3xl font-black tracking-tight text-white leading-tight">
            <span className="block text-[#c8a45c] text-[10px] xl:text-[11px] font-bold uppercase tracking-[0.35em] mb-1.5">Government of India</span>
            JSG <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#c8a45c] to-amber-400">SMiLE</span> Portal
          </h1>
          <p className="mt-3 text-[13px] xl:text-sm font-medium text-slate-300/90 leading-relaxed max-w-sm">
            Jharsuguda Synergy for MSME and Industry Linkage Ecosystem
          </p>

          {/* Trust badges */}
          <div className="mt-6 grid grid-cols-3 gap-3 w-full max-w-sm">
            {[
              { icon: ShieldCheck, label: 'AES-256 Encrypted' },
              { icon: CheckCircle2, label: 'Govt. Verified' },
              { icon: Building2, label: 'MSME Linked' },
            ].map((badge) => (
              <div key={badge.label} className="flex flex-col items-center gap-2 rounded-xl bg-white/5 border border-white/[0.08] py-3.5 px-2 backdrop-blur-sm transition-all hover:bg-white/[0.08] hover:border-white/[0.12]">
                <badge.icon className="h-5 w-5 text-[#c8a45c]" />
                <span className="text-[9px] font-bold text-slate-300/80 uppercase tracking-wider text-center leading-tight">{badge.label}</span>
              </div>
            ))}
          </div>

          {/* Tagline */}
          <p className="mt-6 text-[10px] font-bold uppercase tracking-[0.2em] text-slate-400/70">
            Connect &bull; Collaborate &bull; Grow
          </p>
        </div>

        {/* Bottom footer */}
        <div className="absolute bottom-5 left-0 right-0 text-center">
          <p className="text-[9px] font-medium text-slate-400/50 tracking-wider">
            &copy; {new Date().getFullYear()} District Administration, Jharsuguda, Odisha
          </p>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════════════════════
          RIGHT PANEL — Login form
          ═══════════════════════════════════════════════════════════════════ */}
      <div className="relative flex-1 flex flex-col items-center justify-center px-4 py-8 sm:px-6 lg:px-12 xl:px-16">
        {/* Back button */}
        <Link
          href="/"
          className="group absolute top-5 left-5 z-20 flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.05)] backdrop-blur-md transition-all hover:-translate-x-1 hover:text-[#12335f] hover:shadow-[0_12px_20px_-8px_rgba(18,51,95,0.15)] active:scale-[0.98]"
        >
          <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
          <span>Back to Home</span>
        </Link>

        {/* Background decorations */}
        <div className="absolute top-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-blue-100/50 blur-[120px] animate-pulse pointer-events-none" />
        <div className="absolute bottom-[-10%] left-[-10%] h-[35%] w-[35%] rounded-full bg-amber-100/30 blur-[100px] animate-pulse pointer-events-none" />

        {/* Mobile-only logo banner (visible on < lg) */}
        <div className="lg:hidden w-full max-w-md mb-6 animate-in fade-in zoom-in duration-500">
          <div className="relative rounded-3xl bg-gradient-to-br from-[#07172e] via-[#0b2447] to-[#0a1e3d] p-6 text-center overflow-hidden">
            <div className="brand-tricolor-strip absolute top-0 left-0 w-full" />
            <div className="absolute top-0 right-0 p-4 opacity-5">
              <ShieldCheck className="h-24 w-24 text-white" />
            </div>
            <div className="relative flex flex-col items-center">
              <div className="w-28 h-28 sm:w-32 sm:h-32 bg-white rounded-2xl shadow-[0_12px_32px_-8px_rgba(0,0,0,0.4)] flex items-center justify-center p-2 border-2 border-white/20 overflow-hidden transition-all duration-500 hover:scale-105">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src="/logoo.png" alt="SMiLE MSME Logo" className="w-full h-full object-contain" />
              </div>
              <h2 className="mt-4 text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
                <span className="block text-[#c8a45c] text-[10px] tracking-[0.3em] mb-1">Secure Portal</span>
                JSG SMiLE
              </h2>
              <p className="mt-2 text-[10px] font-bold text-slate-300/70 uppercase tracking-[0.15em]">
                Jharsuguda Synergy for MSME &amp; Industry Linkage
              </p>
            </div>
          </div>
        </div>

        {/* Login form card */}
        <div className="relative z-10 w-full max-w-md animate-in fade-in slide-in-from-right-4 duration-700">
          {/* Header */}
          <div className="mb-7">
            <div className="hidden lg:flex items-center gap-3 mb-5">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-[#0b2447] to-[#12335f] flex items-center justify-center shadow-md">
                <ShieldCheck className="h-5 w-5 text-[#c8a45c]" />
              </div>
              <div>
                <p className="text-[10px] font-black text-[#c8a45c] uppercase tracking-[0.2em]">Secure Portal</p>
                <p className="text-xs font-bold text-slate-500">Government-grade authentication</p>
              </div>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black uppercase tracking-tight text-[#0b2447]">
              Stakeholder Access
            </h2>
            <p className="mt-1.5 text-sm font-medium text-slate-500">
              Sign in to your MSME procurement portal account
            </p>
          </div>

          {/* Form */}
          <form onSubmit={twoFactorPending ? handleTwoFactorSubmit : handleSubmit} className="space-y-5">
            {twoFactorPending ? (
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] ml-1">Two-Factor Code</label>
                <p className="text-xs font-semibold text-slate-500">
                  Code sent to your {twoFactorChannel === 'sms' ? 'verified mobile number' : 'registered email'}.
                </p>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={twoFactorOtp}
                  onChange={(e) => setTwoFactorOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-14 rounded-2xl border border-slate-200 bg-white px-4 text-center text-xl font-black tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all shadow-sm"
                  required
                />
                {canSms && (
                  <div className="flex justify-between items-center pt-1 px-1">
                    <button
                      type="button"
                      onClick={async () => {
                        const newChannel = twoFactorChannel === 'sms' ? 'email' : 'sms';
                        const loadToast = toast.loading(`Sending code to your ${newChannel === 'sms' ? 'mobile' : 'email'}...`);
                        try {
                          const res = await api.post('/api/auth/login', { email, password, channel: newChannel });
                          const data = await readJsonResponse(res);
                          if (res.ok && data.requiresTwoFactor) {
                            setTwoFactorChannel(newChannel);
                            toast.success(`OTP sent to your ${newChannel === 'sms' ? 'mobile' : 'email'}`, { id: loadToast });
                          } else {
                            toast.error('Failed to send OTP to the requested channel', { id: loadToast });
                          }
                        } catch {
                          toast.error('Error switching verification channel', { id: loadToast });
                        }
                      }}
                      className="text-xs font-bold text-[#12335f] underline decoration-blue-200 underline-offset-4 animate-pulse"
                    >
                      Receive OTP via {twoFactorChannel === 'sms' ? 'Email' : 'SMS'} instead
                    </button>
                  </div>
                )}
                <button type="button" onClick={() => setTwoFactorPending(false)} className="text-xs font-bold text-slate-500 underline decoration-slate-300 underline-offset-4 block mt-1">
                  Use different credentials
                </button>
              </div>
            ) : (
              <>
                {/* Email Field */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] ml-1">Official Email</label>
                  <div className="group relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#12335f] transition-colors" />
                    <input
                      type="email"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full h-12 pl-12 pr-4 rounded-2xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all font-semibold shadow-sm hover:border-slate-300"
                    />
                  </div>
                </div>

                {/* Password Field */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] ml-1">Secure Password</label>
                    <Link href="/forgot-password" className="text-[10px] font-black uppercase tracking-widest text-[#12335f] hover:text-[#0b2445] underline decoration-blue-200 underline-offset-4 transition-colors">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="group relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 group-focus-within:text-[#12335f] transition-colors" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full h-12 pl-12 pr-12 rounded-2xl border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all font-semibold shadow-sm hover:border-slate-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[#12335f] focus:outline-none transition-colors"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Submit Button */}
            <div className="pt-1">
              <Button
                type="submit"
                className="w-full h-12 rounded-2xl bg-gradient-to-r from-[#0b2447] to-[#12335f] hover:from-[#12335f] hover:to-[#0b2447] text-white font-black uppercase tracking-[0.2em] shadow-[0_20px_40px_-10px_rgba(18,51,95,0.3)] transition-all hover:translate-y-[-2px] hover:shadow-[0_24px_48px_-12px_rgba(18,51,95,0.4)] active:scale-[0.98] disabled:opacity-50 text-sm"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4" />
                    Authenticating...
                  </span>
                ) : twoFactorPending ? 'Verify Code' : 'Sign In Now'}
              </Button>
            </div>

            {/* Divider */}
            <div className="flex items-center gap-3 py-1">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">or</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>

            {/* Registration CTA */}
            <div className="text-center space-y-3">
              <p className="text-xs font-semibold text-slate-500">
                New to the platform?{' '}
                <Link
                  href={returnUrl ? `/register?returnUrl=${encodeURIComponent(returnUrl)}` : '/register'}
                  className="text-[#12335f] font-black uppercase hover:text-[#0b2445] transition-colors underline decoration-blue-200 underline-offset-4 decoration-2"
                >
                  Create Profile
                </Link>
              </p>

              {/* Quick register shortcuts */}
              <div className="flex flex-wrap items-center justify-center gap-2">
                <Link
                  href="/seller/register"
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:border-[#12335f]/30 hover:text-[#12335f] transition-all shadow-sm hover:shadow"
                >
                  <Store className="h-3 w-3" />
                  Join as Seller
                </Link>
                <Link
                  href="/buyer/register"
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:border-[#12335f]/30 hover:text-[#12335f] transition-all shadow-sm hover:shadow"
                >
                  <Building2 className="h-3 w-3" />
                  Join as Buyer
                </Link>
                <Link
                  href="/hershg/register"
                  className="flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-[10px] font-bold text-slate-600 hover:border-[#12335f]/30 hover:text-[#12335f] transition-all shadow-sm hover:shadow"
                >
                  <UsersRound className="h-3 w-3" />
                  Join as SHG
                </Link>
              </div>
            </div>
          </form>

          {/* Footer text */}
          <p className="mt-8 text-center text-[9px] font-bold text-slate-400 uppercase tracking-wider">
            Protected by 256-bit SSL &bull; Government of India Portal
          </p>
        </div>
      </div>
    </div>
  );
}
