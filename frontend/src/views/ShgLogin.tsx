import React, { useEffect, useState, useCallback } from 'react';
import { api, readJsonResponse } from '../lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { UsersRound, Mail, Key, Eye, EyeOff, ArrowLeft, ShieldCheck } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';

const generateSecureCaptchaString = () => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
};

export default function ShgLogin() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [captchaValue] = useState(generateSecureCaptchaString());
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [twoFactorOtp, setTwoFactorOtp] = useState('');

  const { user, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  useEffect(() => {
    if (user) {
      if (returnUrl) {
        router.replace(decodeURIComponent(returnUrl));
      } else {
        router.replace('/dashboard');
      }
    }
  }, [user, router, returnUrl]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    const loadToast = toast.loading('Authenticating SHG credentials...');

    try {
      const res = await api.post('/api/auth/login', { email, password });
      const data = await readJsonResponse(res);

      if (res.ok) {
        if (data.requiresTwoFactor) {
          setTwoFactorPending(true);
          toast.success('Enter the two-factor code sent to your email', { id: loadToast });
          return;
        }
        // Verify the user is actually an SHG (herSHG businessType)
        const regDetails = data.user?.registrationDetails || {};
        const businessType = String(regDetails.businessType || '').toLowerCase();
        if (data.user?.role === 'seller' && businessType !== 'hershg') {
          toast.error('This login is for SHG members only. Please use the main login.', { id: loadToast });
          return;
        }
        login(data.accessToken || data.token, data.user, data.refreshToken);
        toast.success(`Welcome back, ${data.user.name}!`, { id: loadToast });
      } else {
        toast.error(data.message || 'Login failed', { id: loadToast });
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
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden bg-emerald-50/40 px-3 py-6 sm:px-4">
      {/* BACK BUTTON */}
      <Link
        href="/login"
        className="group absolute top-6 left-6 z-20 flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-white/80 px-4 py-2.5 text-xs font-black uppercase tracking-wider text-slate-600 shadow-[0_8px_16px_-6px_rgba(0,0,0,0.05)] backdrop-blur-md transition-all hover:-translate-x-1 hover:text-emerald-700 hover:shadow-[0_12px_20px_-8px_rgba(5,150,105,0.15)] active:scale-[0.98]"
      >
        <ArrowLeft className="h-4 w-4 transition-transform group-hover:-translate-x-0.5" />
        <span>Back to Login</span>
      </Link>

      {/* BACKGROUND DECORATIONS */}
      <div className="pointer-events-none absolute top-[-10%] left-[-10%] h-[40%] w-[40%] animate-pulse rounded-full bg-emerald-200/40 blur-[120px]" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-[40%] w-[40%] animate-pulse rounded-full bg-teal-200/30 blur-[120px]" />

      <Card className="animate-in relative z-10 w-full max-w-[380px] overflow-hidden rounded-[2.5rem] border border-white/40 bg-white/80 backdrop-blur-2xl shadow-[0_32px_64px_-16px_rgba(0,0,0,0.1)] fade-in zoom-in duration-700">
        <CardHeader className="relative bg-gradient-to-br from-emerald-900 via-emerald-800 to-teal-900 pb-5 pt-6 text-center text-white">
          <div className="absolute top-0 right-0 p-6 opacity-5">
            <UsersRound className="h-28 w-28" />
          </div>

          {/* SHG Icon */}
          <div className="relative mx-auto flex h-20 w-20 items-center justify-center rounded-2xl bg-white/10 border-2 border-white/20 shadow-[0_12px_24px_-8px_rgba(0,0,0,0.3)] mb-3 backdrop-blur-sm">
            <UsersRound className="h-10 w-10 text-emerald-200" />
          </div>

          <div className="mb-1 flex items-center justify-center gap-2">
            <span className="inline-block rounded-full bg-emerald-500/20 border border-emerald-400/30 px-3 py-0.5 text-[9px] font-black uppercase tracking-[0.3em] text-emerald-300">
              herSHG Portal
            </span>
          </div>

          <CardTitle className="text-2xl font-black uppercase tracking-tight sm:text-3xl text-white">
            SHG Access
          </CardTitle>
          <p className="mt-2 text-[10px] font-bold text-emerald-200/80 uppercase tracking-[0.2em] opacity-90">
            Self-Help Group Seller Login
          </p>
        </CardHeader>

        <CardContent className="p-5 sm:p-8">
          <form onSubmit={twoFactorPending ? handleTwoFactorSubmit : handleSubmit} className="space-y-4">
            {twoFactorPending ? (
              <div className="space-y-2">
                <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                  Two-Factor Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={twoFactorOtp}
                  onChange={(e) => setTwoFactorOtp(e.target.value.replace(/\D/g, ''))}
                  className="h-12 w-full rounded-2xl border border-slate-200 bg-white/50 px-4 text-center text-lg font-black tracking-[0.5em] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                  required
                />
                <button
                  type="button"
                  onClick={() => setTwoFactorPending(false)}
                  className="text-xs font-bold text-slate-500 underline"
                >
                  Use different credentials
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-1">
                  <label className="ml-1 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                    SHG Email Address
                  </label>
                  <div className="group relative">
                    <Mail className="absolute left-4 top-1/2 h-3 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-emerald-700" />
                    <input
                      type="email"
                      placeholder="name@shggroup.org"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      className="h-10 w-full rounded-2xl border border-slate-200 bg-white/50 pl-12 pr-4 text-sm font-semibold transition-all focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex gap-3">
                    <label className="ml-1 pr-3 text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">
                      Password
                    </label>
                    <Link
                      href="/forgot-password"
                      className="mb-1 block pl-6 text-[10px] font-black uppercase tracking-widest text-emerald-700 underline decoration-emerald-200 underline-offset-4"
                    >
                      Forgot password?
                    </Link>
                  </div>
                  <div className="group relative">
                    <Key className="absolute left-4 top-1/2 h-3 w-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-emerald-700" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      className="h-10 w-full rounded-2xl border border-slate-200 bg-white/50 pl-12 pr-12 text-sm font-semibold transition-all focus:border-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-600/20"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-emerald-700 focus:outline-none"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>
              </>
            )}

            <div className="pt-2">
              <Button
                type="submit"
                className="h-10 w-full rounded-[1.25rem] bg-gradient-to-r from-emerald-700 to-teal-700 font-black uppercase tracking-[0.2em] text-white shadow-[0_20px_40px_-10px_rgba(5,150,105,0.3)] transition-all hover:translate-y-[-2px] hover:from-emerald-800 hover:to-teal-800 active:scale-[0.98] disabled:opacity-50"
                disabled={isLoading}
              >
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2 className="h-4 w-4" />
                    Authenticating...
                  </span>
                ) : twoFactorPending ? (
                  'Verify Code'
                ) : (
                  'Sign In to SHG Portal'
                )}
              </Button>
            </div>

            <div className="py-2 text-center">
              <p className="text-xs font-bold text-slate-500">
                New SHG member?{' '}
                <Link
                  href="/hershg/register"
                  className="font-black uppercase tracking-widest text-emerald-700 underline decoration-emerald-200 underline-offset-4 transition-colors hover:text-emerald-800"
                >
                  Register SHG
                </Link>
              </p>
            </div>

            {/* SHG Info Banner */}
            <div className="flex items-start gap-2.5 rounded-2xl border border-emerald-100 bg-emerald-50/80 px-4 py-3 text-xs font-semibold leading-relaxed text-emerald-800">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
              <p>
                This portal is exclusively for registered Self-Help Groups (SHG). If you are a
                regular seller or buyer, please use the{' '}
                <Link href="/login" className="underline decoration-emerald-300 underline-offset-2">
                  main login
                </Link>
                .
              </p>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
