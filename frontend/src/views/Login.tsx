import React, { useEffect, useState, useCallback } from 'react';
import { api, readJsonResponse } from '../lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { ShieldCheck, Mail, Key, Eye, EyeOff, RefreshCw, ArrowLeft } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';

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
      // If there's a returnUrl (e.g., from invite), go there; otherwise go to dashboard
      if (returnUrl) {
        router.replace(decodeURIComponent(returnUrl));
      } else {
        router.replace(user.role === 'master_admin' ? '/master-admin' : '/dashboard');
      }
    }
  }, [user, router, returnUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // if (userCaptcha !== captchaValue) {
    //   toast.error('Invalid security code. Please try again.');
    //   generateCaptcha();
    //   return;
    // }

    setIsLoading(true);
    const loadToast = toast.loading('Authenticating credentials...');

    try {
      const res = await api.post('/api/auth/login', { email, password });
      const data = await readJsonResponse(res);

      if (res.ok) {
        if (data.requiresTwoFactor) {
          setTwoFactorPending(true);
          toast.success('Enter the two-factor code sent to your email', { id: loadToast });
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
      const res = await api.post('/api/auth/2fa/verify', { email, otp: twoFactorOtp });
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
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-slate-50 px-3 py-6 sm:px-4">
      {/* BACK BUTTON */}
      <Link
        href="/"
        className="group absolute top-6 left-6 z-20 flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.05)] backdrop-blur-md transition-all hover:-translate-x-1 hover:text-[#12335f] hover:shadow-[0_12px_20px_-8px_rgba(18,51,95,0.15)] active:scale-[0.98]"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        <span>Back to Home</span>
      </Link>

      {/* BACKGROUND DECORATIONS */}
      <div className="absolute top-[-10%] left-[-10%] h-[40%] w-[40%] rounded-full bg-blue-200/40 blur-[120px] animate-pulse" />
      <div className="absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] rounded-full bg-slate-200/40 blur-[120px] animate-pulse" />

      <Card className="animate-in relative z-10 w-full max-w-[370px] overflow-hidden rounded-[2.5rem] border border-white/40 bg-white/70 backdrop-blur-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] fade-in zoom-in duration-700">
        <CardHeader className="relative bg-gradient-to-br from-[#0b1b33] via-[#12335f] to-[#0b1b33] pb-1 pt-2 text-center text-white">
          <div className="absolute top-0 right-0 p-6 opacity-5">
            <ShieldCheck className="h-28 w-28" />
          </div>
          <div className="relative mx-auto w-20 h-20 bg-white shadow-[0_12px_24px_-8px_rgba(0,0,0,0.3)] rounded-2xl flex items-center justify-center mb-1 border-2 border-white/30 transition-all duration-500 hover:scale-105 overflow-hidden p-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/msme-logo.png" alt="Official MSME Logo" className="w-full h-full object-contain" />
          </div>
          <CardTitle className="text-2xl font-black uppercase tracking-tight sm:text-3xl text-white">
            <span className="block text-[#f9a825] text-[10px] tracking-[0.3em] mb-1 text-center">Secure Portal</span>
            Stakeholder Access
          </CardTitle>
          <p className="text-[10px] font-bold text-slate-400 mt-3 uppercase tracking-[0.2em]  opacity-80 text-center">Jharsuguda Synergy for MSME and Industry Linkage Ecosystem</p>
        </CardHeader>

        <CardContent className="p-5 sm:p-8">
          <form onSubmit={twoFactorPending ? handleTwoFactorSubmit : handleSubmit} className="space-y-4">
            {twoFactorPending ? (
              <div className="space-y-2">
                <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em] ml-1">Two-Factor Code</label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={twoFactorOtp}
                  onChange={(e) => setTwoFactorOtp(e.target.value.replace(/\D/g, ''))}
                  className="w-full h-12 rounded-2xl border border-slate-200 bg-white/50 px-4 text-center text-lg font-black tracking-[0.5em] focus:outline-none focus:ring-2 focus:ring-[#12335f]/20"
                  required
                />
                <button type="button" onClick={() => setTwoFactorPending(false)} className="text-xs font-bold text-slate-500 underline">
                  Use different credentials
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]  ml-1">Official Email</label>
                  <div className="group relative">
                    <Mail className="absolute left-4 top-1/2 -translate-y-1/2 h-3 w-4 text-slate-400 group-focus-within:text-[#12335f] transition-colors" />
                    <input
                      type="email"
                      placeholder="name@company.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="w-full h-10 pl-12 pr-4 rounded-2xl border border-slate-200 bg-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all font-semibold"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className='flex gap-3 '> <label className="text-[10px] font-black uppercase text-slate-500 tracking-[0.2em]  ml-1 pr-3">Secure Password</label>
                    <Link href="/forgot-password" className="mb-3 block text-[10px] font-black uppercase tracking-widest text-[#12335f] underline decoration-blue-200 underline-offset-4 pl-6">
                      Forgot password?
                    </Link>
                  </div>
                  <div className="group relative">
                    <Key className="absolute left-4 top-1/2 -translate-y-1/2 h-3 w-4 text-slate-400 group-focus-within:text-[#12335f] transition-colors" />
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="w-full h-10 pl-12 pr-12 rounded-2xl border border-slate-200 bg-white/50 text-sm focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 focus:border-[#12335f] transition-all font-semibold"
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

                {/* Captcha Verification */}
                {/* <div className="bg-slate-50 p-3 rounded-2xl border border-slate-200 space-y-3">
               <div className="flex justify-between items-center">
                  <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block ml-1">Security Code</label>
                  <button type="button" onClick={generateCaptcha} className="text-[10px] flex items-center gap-1.5 font-black text-[#12335f] hover:text-[#0b2445] transition-colors uppercase tracking-widest">
                     <RefreshCw className="h-3 w-3" /> Refresh
                  </button>
               </div>
               <div className="flex gap-3 items-center">
                  <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-orange-100 px-4 py-2.5 rounded-xl select-none flex-1 text-center relative overflow-hidden font-serif tracking-[0.3em] text-lg font-black text-slate-700 italic line-through decoration-slate-400/50 decoration-2">
                     {captchaValue}
                     <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0IiBoZWlnaHQ9IjQiPgo8cmVjdCB3aWR0aD0iMSIgaGVpZ2h0PSIxIiBmaWxsPSIjMDAwMDAwMTUiPjwvcmVjdD4KPC9zdmc+')] opacity-20 pointer-events-none" />
                  </div>
                  <input
                    type="text"
                    maxLength={6}
                    value={userCaptcha}
                    onChange={(e) => setUserCaptcha(e.target.value)}
                    placeholder="Code"
                    className="w-24 h-10 text-center text-sm font-black tracking-widest bg-white border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#12335f]/10 focus:border-[#12335f] outline-none transition-all placeholder:tracking-normal placeholder:font-bold"
                    required
                  />
               </div>
            </div> */}
              </>
            )}

            <div className="pt-2">
              <Button
                type="submit"
                className="w-full h-10 rounded-[1.25rem] bg-gradient-to-r from-[#12335f] to-[#0b2445] hover:from-[#0b2445] hover:to-[#071830] text-white font-black uppercase tracking-[0.2em]  shadow-[0_20px_40px_-10px_rgba(18,51,95,0.3)] transition-all hover:translate-y-[-2px] active:scale-[0.98] disabled:opacity-50"
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

            <div className="text-center py-2">

              <p className="text-xs font-bold text-slate-500">
                New to the platform?{' '}
                <Link
                  href={returnUrl ? `/register?returnUrl=${encodeURIComponent(returnUrl)}` : '/register'}
                  className="text-[#12335f] font-black uppercase hover:text-[#0b2445] transition-colors underline decoration-blue-200 underline-offset-4 decoration-2"
                >
                  Create Profile
                </Link>
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
