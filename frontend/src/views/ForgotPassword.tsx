import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { api } from '../lib/api';
import { Button } from '../components/ui/button';

export default function ForgotPassword() {
  const [channel, setChannel] = useState<'email' | 'sms'>('email');
  const [identifier, setIdentifier] = useState('');
  const [otp, setOtp] = useState('');
  const [otpToken, setOtpToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([]);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    api.get('/api/auth/features')
      .then(res => res.json())
      .then(data => {
        if (data?.enabledFeatures) {
          setEnabledFeatures(data.enabledFeatures);
          if (!data.enabledFeatures.includes('sms')) {
            setChannel('email');
          }
        }
      })
      .catch(err => console.error(err));
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => {
      setCooldown(c => c - 1);
    }, 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const isSmsEnabled = enabledFeatures.includes('sms');
  const isMobile = channel === 'sms';
  const normalizedMobile = identifier.replace(/\D/g, '').slice(-10);
  const canSubmitIdentifier = isMobile ? /^[6-9]\d{9}$/.test(normalizedMobile) : /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identifier.trim());

  const requestReset = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canSubmitIdentifier) {
      toast.error(isMobile ? 'Enter a valid registered Indian mobile number.' : 'Enter a valid registered email address.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.post('/api/auth/forgot-password/send-otp', {
        identifier: isMobile ? normalizedMobile : identifier.trim().toLowerCase(),
        channel
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Unable to request reset');
      setSent(true);
      setCooldown(60);
      toast.success('If the details are registered, an OTP has been sent.');
    } catch (err: any) {
      toast.error(err.message || 'Unable to request reset');
    } finally {
      setIsLoading(false);
    }
  };

  const verifyResetOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^\d{6}$/.test(otp)) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.post('/api/auth/forgot-password/verify-otp', {
        identifier: isMobile ? normalizedMobile : identifier.trim().toLowerCase(),
        channel,
        otp: otp.trim()
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Unable to verify OTP');
      setOtpToken(data.otpToken);
      toast.success('OTP verified successfully. Now choose your new password.');
    } catch (err: any) {
      toast.error(err.message || 'Unable to verify OTP');
    } finally {
      setIsLoading(false);
    }
  };

  const resetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPassword || newPassword.length < 12) {
      toast.error('Password must be at least 12 characters.');
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.post('/api/auth/reset-password', {
        identifier: isMobile ? normalizedMobile : identifier.trim().toLowerCase(),
        channel,
        otpToken,
        newPassword
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Unable to reset password');
      toast.success('Password reset successful. Please sign in.');
      setSent(false);
      setOtp('');
      setOtpToken('');
      setNewPassword('');
      setIdentifier('');
    } catch (err: any) {
      toast.error(err.message || 'Unable to reset password');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    if (!sent) {
      requestReset(e);
    } else if (!otpToken) {
      verifyResetOtp(e);
    } else {
      resetPassword(e);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center bg-slate-50 px-4 py-8">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <h1 className="text-xl font-black text-[#12335f]">Reset Password</h1>
        <p className="mt-1 text-sm font-medium text-slate-500">
          {!sent 
            ? 'Use your registered email or mobile number to receive a secure reset code.' 
            : !otpToken 
              ? 'Enter the 6-digit verification code sent to your registered account.'
              : 'Choose a strong new password to secure your account.'
          }
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          {!sent && isSmsEnabled && (
            <div className="grid grid-cols-2 gap-2 rounded-xl bg-slate-100 p-1">
              {(['email', 'sms'] as const).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => {
                    setChannel(item);
                    setIdentifier('');
                    setOtp('');
                  }}
                  className={`h-10 rounded-lg text-xs font-black uppercase tracking-widest ${channel === item ? 'bg-white text-[#12335f] shadow-sm' : 'text-slate-500'}`}
                >
                  {item === 'email' ? 'Email OTP' : 'Mobile OTP'}
                </button>
              ))}
            </div>
          )}

          {!otpToken && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">{isMobile ? 'Registered Mobile' : 'Official Email'}</label>
                {sent && (
                  <button
                    type="button"
                    onClick={() => {
                      setSent(false);
                      setOtp('');
                      setOtpToken('');
                    }}
                    className="text-xs font-bold text-[#12335f] hover:underline"
                  >
                    Change
                  </button>
                )}
              </div>
              <input
                type={isMobile ? 'tel' : 'email'}
                inputMode={isMobile ? 'numeric' : 'email'}
                value={identifier}
                onChange={(e) => setIdentifier(isMobile ? e.target.value.replace(/\D/g, '').slice(0, 10) : e.target.value)}
                disabled={sent}
                required
                placeholder={isMobile ? '10 digit mobile number' : 'name@example.com'}
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20 disabled:bg-slate-50 disabled:text-slate-500"
              />
              {isMobile && identifier && !canSubmitIdentifier && (
                <p className="mt-1 text-xs font-semibold text-red-600">Enter a valid 10 digit Indian mobile number.</p>
              )}
            </div>
          )}

          {sent && !otpToken && (
            <div>
              <div className="flex items-center justify-between">
                <label className="text-xs font-black uppercase tracking-widest text-slate-500">Reset Code</label>
                <button
                  type="button"
                  disabled={cooldown > 0 || isLoading}
                  onClick={() => requestReset()}
                  className="text-xs font-bold text-[#12335f] disabled:text-slate-400 hover:underline"
                >
                  {cooldown > 0 ? `Resend OTP in ${cooldown}s` : 'Resend OTP'}
                </button>
              </div>
              <input
                type="text"
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                required
                placeholder="000000"
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-center text-lg font-black tracking-[0.5em] outline-none focus:ring-2 focus:ring-[#12335f]/20"
              />
            </div>
          )}

          {otpToken && (
            <div>
              <label className="text-xs font-black uppercase tracking-widest text-slate-500">New Password</label>
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={12}
                placeholder="12+ chars with upper, lower, number, symbol"
                className="mt-1 h-11 w-full rounded-xl border border-slate-200 px-3 text-sm font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
              />
            </div>
          )}

          <Button type="submit" disabled={isLoading} className="h-11 w-full rounded-xl bg-[#12335f] font-black uppercase tracking-widest text-white">
            {isLoading ? 'Please wait...' : !sent ? 'Send Reset Code' : !otpToken ? 'Verify OTP' : 'Reset Password'}
          </Button>
        </form>

        <Link href="/login" className="mt-4 block text-center text-xs font-black uppercase tracking-widest text-[#12335f] underline underline-offset-4">
          Back to login
        </Link>
      </div>
    </div>
  );
}
