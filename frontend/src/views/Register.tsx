import React, { useState } from 'react';
import { api } from '../lib/api';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { Store, Building2, ShieldCheck, Mail, Key, Phone, Clock, ArrowRight } from 'lucide-react';
import { getSellerPortalPath, getSellerPortalLabel } from '../lib/shg';
import { sanitizeIndianMobileInput, sanitizePersonNameInput, validateIndianMobile, validatePersonName } from '../lib/validation';

export default function Register({ type }: { type: 'seller' | 'buyer' | 'admin' }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    mobile: '',
    password: '',
  });
  const [passwordError, setPasswordError] = useState('');

  const [emailOtp, setEmailOtp] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [isSendingEmailOtp, setIsSendingEmailOtp] = useState(false);
  const [isVerifyingEmailOtp, setIsVerifyingEmailOtp] = useState(false);

  const [mobileOtp, setMobileOtp] = useState('');
  const [mobileOtpSent, setMobileOtpSent] = useState(false);
  const [isSendingMobileOtp, setIsSendingMobileOtp] = useState(false);
  const [isVerifyingMobileOtp, setIsVerifyingMobileOtp] = useState(false);

  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isMobileVerified, setIsMobileVerified] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [showPendingModal, setShowPendingModal] = useState(false);
  const [redirectPath, setRedirectPath] = useState('');
  const [redirectLabel, setRedirectLabel] = useState('');

  const { login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get('returnUrl');

  const getPasswordError = (password: string) => {
    const errors: string[] = [];
    if (password.length < 12) errors.push('at least 12 characters');
    if (!/[A-Z]/.test(password)) errors.push('one uppercase letter');
    if (!/[a-z]/.test(password)) errors.push('one lowercase letter');
    if (!/\d/.test(password)) errors.push('one number');
    if (!/[^A-Za-z0-9]/.test(password)) errors.push('one special character');
    return errors.length ? `Password must include ${errors.join(', ')}.` : '';
  };

  const getApiErrorMessage = (data: any) => {
    const fieldErrors = data?.details?.fieldErrors;
    const firstFieldError = fieldErrors && Object.values(fieldErrors).flat().find(Boolean);
    if (typeof firstFieldError === 'string' && !firstFieldError.includes('*')) return firstFieldError;
    if (fieldErrors?.password?.length) return 'Password must be at least 12 characters.';
    return data?.message || 'Registration failed';
  };

  const handleSendEmailOtp = async () => {
    if (!formData.email) {
      toast.error('Please enter an email address first');
      return;
    }
    setIsSendingEmailOtp(true);
    try {
      const res = await api.post('/api/auth/send-email-otp', { email: formData.email });
      const data = await res.json();
      if (res.ok) {
        setEmailOtpSent(true);
        toast.success(data.deliveryConfigured === false ? 'Email OTP saved (SMTP is disabled)' : 'Verification code sent to your email.');
      } else {
        toast.error(data.message || 'Failed to send email OTP');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Network error.');
    } finally {
      setIsSendingEmailOtp(false);
    }
  };

  const handleVerifyEmailOtp = async () => {
    if (!emailOtp) {
      toast.error('Please enter the email verification code');
      return;
    }
    setIsVerifyingEmailOtp(true);
    try {
      const res = await api.post('/api/auth/verify-email-otp', { email: formData.email, otp: emailOtp });
      const data = await res.json();
      if (res.ok) {
        setIsEmailVerified(true);
        toast.success('Email verified successfully!');
      } else {
        toast.error(data.message || 'Invalid email OTP');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Email verification failed');
    } finally {
      setIsVerifyingEmailOtp(false);
    }
  };

  const handleSendMobileOtp = async () => {
    const cleanedMobile = sanitizeIndianMobileInput(formData.mobile);
    const mobileError = validateIndianMobile(cleanedMobile, 'Mobile number');
    if (mobileError) {
      toast.error(mobileError);
      return;
    }
    setIsSendingMobileOtp(true);
    try {
      const res = await api.post('/api/auth/send-mobile-otp', { mobile: cleanedMobile });
      const data = await res.json();
      if (res.ok) {
        setMobileOtpSent(true);
        toast.success(data.smsEnabled === false ? 'Mobile OTP saved (SMS is disabled)' : 'Verification code sent to your mobile.');
      } else {
        toast.error(data.message || 'Failed to send mobile OTP');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Network error.');
    } finally {
      setIsSendingMobileOtp(false);
    }
  };

  const handleVerifyMobileOtp = async () => {
    if (!mobileOtp) {
      toast.error('Please enter the mobile verification code');
      return;
    }
    setIsVerifyingMobileOtp(true);
    try {
      const cleanedMobile = formData.mobile.replace(/\D/g, '');
      const res = await api.post('/api/auth/verify-mobile-otp', { mobile: cleanedMobile, otp: mobileOtp });
      const data = await res.json();
      if (res.ok) {
        setIsMobileVerified(true);
        toast.success('Mobile number verified successfully!');
      } else {
        toast.error(data.message || 'Invalid mobile OTP');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Mobile verification failed');
    } finally {
      setIsVerifyingMobileOtp(false);
    }
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, email: e.target.value });
    setIsEmailVerified(false);
    setEmailOtpSent(false);
    setEmailOtp('');
  };

  const handleMobileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, mobile: sanitizeIndianMobileInput(e.target.value) });
    setIsMobileVerified(false);
    setMobileOtpSent(false);
    setMobileOtp('');
  };

  const getTitle = () => {
    if (type === 'seller') return 'Seller Account';
    if (type === 'buyer') return 'Buyer Account';
    return 'Admin Account';
  };

  const getNameLabel = () => {
    if (type === 'seller') return 'Authorized Representative Name';
    if (type === 'buyer') return 'Procurement Officer Name';
    return 'Admin Name';
  };

  const isVerified = isEmailVerified && isMobileVerified;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nameError = validatePersonName(formData.name, getNameLabel());
    if (nameError) {
      toast.error(nameError);
      return;
    }
    if (!isEmailVerified) {
      toast.error('Please verify your email address to continue');
      return;
    }
    const mobileError = validateIndianMobile(formData.mobile, 'Mobile number');
    if (mobileError) {
      toast.error(mobileError);
      return;
    }
    if (!isMobileVerified) {
      toast.error('Please verify your mobile number to continue');
      return;
    }
    const nextPasswordError = getPasswordError(formData.password);
    setPasswordError(nextPasswordError);
    if (nextPasswordError) {
      toast.error(nextPasswordError);
      return;
    }
    setIsLoading(true);

    try {
      const payload = {
        ...formData,
        name: sanitizePersonNameInput(formData.name).trim(),
        mobile: formData.mobile.replace(/\D/g, ''),
        role: type
      };
      const res = await api.post('/api/auth/register', payload);
      const data = await res.json();

      if (res.ok) {
        login(data.accessToken || data.token, data.user, data.refreshToken);
        toast.success(type === 'admin' ? 'Admin account created!' : `Account created!`);

        let targetPath = '/dashboard';
        let targetLabel = 'Dashboard';

        if (type === 'seller') {
          targetPath = getSellerPortalPath(data.user);
          targetLabel = getSellerPortalLabel(data.user);
        } else if (type === 'buyer') {
          targetPath = '/buyer/onboarding';
          targetLabel = 'Buyer Onboarding';
        }

        if (type !== 'admin' && data.user?.onboardingStatus === 'pending') {
          setRedirectPath(targetPath);
          setRedirectLabel(targetLabel);
          setShowPendingModal(true);
        } else {
          router.push(returnUrl || targetPath);
        }
      } else {
        toast.error(getApiErrorMessage(data));
      }
    } catch (err: any) {
      toast.error(err?.message || 'Registration failed due to server error');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-3 py-6 sm:px-4 bg-slate-50">
      <Card className="animate-in w-full max-w-md overflow-hidden rounded-2xl border-none shadow-xl shadow-indigo-100 fade-in slide-in-from-bottom-4 duration-500 sm:rounded-3xl sm:shadow-2xl bg-white">
        <CardHeader className="bg-indigo-50/50 pb-6 pt-7 text-center">
          <div className="mx-auto w-14 h-14 bg-white shadow-xl rounded-2xl flex items-center justify-center mb-4 animate-in zoom-in-50 duration-500">
            {type === 'seller' ? <Store className="h-8 w-8 text-indigo-600" /> : <Building2 className="h-8 w-8 text-indigo-600" />}
          </div>
          <CardTitle className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 uppercase">Create {getTitle()}</CardTitle>
          <p className="text-sm font-medium text-slate-500 mt-2">Start your journey with JsgSmile Portal</p>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={getNameLabel()}
              placeholder="e.g. John Doe"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: sanitizePersonNameInput(e.target.value) })}
              required
              maxLength={100}
              className="rounded-xl border-slate-200 focus:border-indigo-500"
            />

            {/* Email Field with inline verification */}
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest ml-1">Official Email</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={formData.email}
                    onChange={handleEmailChange}
                    disabled={isEmailVerified || emailOtpSent}
                    required
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:bg-slate-50 disabled:text-slate-500 font-medium"
                  />
                </div>
                {!isEmailVerified && !emailOtpSent && (
                  <Button
                    type="button"
                    onClick={handleSendEmailOtp}
                    disabled={isSendingEmailOtp}
                    variant="outline"
                    className="w-full sm:w-auto h-11 rounded-xl px-4 font-black uppercase text-[10px] border-indigo-100 text-indigo-600 hover:bg-indigo-50"
                  >
                    {isSendingEmailOtp ? 'Sending...' : 'Verify'}
                  </Button>
                )}
                {isEmailVerified && (
                  <div className="flex items-center justify-center gap-1.5 text-green-600 font-black text-[10px] uppercase bg-green-50 px-3 h-11 rounded-xl border border-green-100">
                    <ShieldCheck className="h-4 w-4" />
                    Verified
                  </div>
                )}
              </div>
            </div>

            {/* Email OTP Verification Box */}
            {emailOtpSent && !isEmailVerified && (
              <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl animate-in slide-in-from-top-4 duration-500">
                <label className="text-xs font-black uppercase text-indigo-600 tracking-widest ml-1">Enter Email OTP</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400" />
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      value={emailOtp}
                      onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                      className="h-11 w-full rounded-xl border-2 border-indigo-100 pl-10 pr-4 text-center text-lg font-black tracking-[0.25em] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleVerifyEmailOtp}
                    disabled={isVerifyingEmailOtp}
                    className="w-full sm:w-auto h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] px-6"
                  >
                    {isVerifyingEmailOtp ? 'Verifying...' : 'Verify'}
                  </Button>
                </div>
                <p className="text-[10px] text-slate-400 font-bold ml-1">
                  Code valid for 10 min. No code?{' '}
                  <button type="button" onClick={handleSendEmailOtp} disabled={isSendingEmailOtp} className="text-indigo-600 underline disabled:text-slate-400">
                    Resend
                  </button>
                </p>
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest ml-1">Mobile Number *</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="tel"
                    placeholder="10-digit mobile number"
                    maxLength={10}
                    inputMode="numeric"
                    value={formData.mobile}
                    onChange={handleMobileChange}
                    disabled={isMobileVerified || mobileOtpSent}
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:bg-slate-50 disabled:text-slate-500 font-medium"
                  />
                </div>
                {formData.mobile.length === 10 && !isMobileVerified && !mobileOtpSent && (
                  <Button
                    type="button"
                    onClick={handleSendMobileOtp}
                    disabled={isSendingMobileOtp}
                    variant="outline"
                    className="w-full sm:w-auto h-11 rounded-xl px-4 font-black uppercase text-[10px] border-indigo-100 text-indigo-600 hover:bg-indigo-50"
                  >
                    {isSendingMobileOtp ? 'Sending...' : 'Verify'}
                  </Button>
                )}
                {isMobileVerified && (
                  <div className="flex items-center justify-center gap-1.5 text-green-600 font-black text-[10px] uppercase bg-green-50 px-3 h-11 rounded-xl border border-green-100">
                    <ShieldCheck className="h-4 w-4" />
                    Verified
                  </div>
                )}
              </div>
            </div>

            {/* Mobile OTP Verification Box */}
            {mobileOtpSent && !isMobileVerified && (
              <div className="space-y-2 p-3 bg-slate-50 border border-slate-200 rounded-xl animate-in slide-in-from-top-4 duration-500">
                <label className="text-xs font-black uppercase text-indigo-600 tracking-widest ml-1">Enter Mobile OTP</label>
                <div className="flex flex-col sm:flex-row gap-2">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400" />
                    <input
                      type="text"
                      maxLength={6}
                      placeholder="000000"
                      value={mobileOtp}
                      onChange={(e) => setMobileOtp(e.target.value.replace(/\D/g, ''))}
                      className="h-11 w-full rounded-xl border-2 border-indigo-100 pl-10 pr-4 text-center text-lg font-black tracking-[0.25em] focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <Button
                    type="button"
                    onClick={handleVerifyMobileOtp}
                    disabled={isVerifyingMobileOtp}
                    className="w-full sm:w-auto h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] px-6"
                  >
                    {isVerifyingMobileOtp ? 'Verifying...' : 'Verify'}
                  </Button>
                </div>
                <p className="text-[10px] text-slate-400 font-bold ml-1">
                  Code valid for 10 min. No code?{' '}
                  <button type="button" onClick={handleSendMobileOtp} disabled={isSendingMobileOtp} className="text-indigo-600 underline disabled:text-slate-400">
                    Resend
                  </button>
                </p>
              </div>
            )}

            <Input
              label="Password"
              type="password"
              placeholder="12+ chars with upper, lower, number, symbol"
              value={formData.password}
              onChange={(e) => {
                const password = e.target.value;
                setFormData({ ...formData, password });
                if (passwordError) setPasswordError(getPasswordError(password));
              }}
              required
              minLength={12}
              error={passwordError}
              className="rounded-xl border-slate-200"
            />

            <Button
              type="submit"
              className="w-full h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-[0.2em] shadow-xl shadow-slate-200 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
              disabled={isLoading || !isVerified}
            >
              {isLoading ? 'Creating Account...' : 'Finish Registration'}
            </Button>

            <div className="text-center mt-4">
              <p className="text-sm font-medium text-slate-500">
                Already have an account?{' '}
                <Link href="/login" className="text-indigo-600 font-black uppercase text-[10px] hover:underline underline-offset-4 tracking-widest">Sign in</Link>
              </p>
            </div>

            {type !== 'admin' && (
              <div className="pt-4 mt-1 border-t border-slate-100 text-center">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                  Registering as the wrong role?{' '}
                  <Link href={type === 'seller' ? '/buyer/register' : '/seller/register'} className="text-indigo-600 underline decoration-indigo-200 underline-offset-4">
                    Switch to {type === 'seller' ? 'Buyer' : 'Seller'}
                  </Link>
                </p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>

      {showPendingModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-100 flex flex-col items-center text-center animate-in zoom-in-95 duration-300">
            <div className="h-14 w-14 rounded-full bg-amber-50 border border-amber-250 flex items-center justify-center text-amber-500 mb-4 animate-bounce">
              <Clock className="h-7 w-7" />
            </div>
            <h3 className="text-lg font-black uppercase text-[#12335f] tracking-tight">Organization Onboarding Pending</h3>
            <p className="mt-2 text-xs font-semibold text-slate-500 leading-relaxed">
              Your registration is complete. However, your organization onboarding is pending. Please verify/complete it to access all the portal features.
            </p>
            <Button
              onClick={() => {
                setShowPendingModal(false);
                router.push(redirectPath);
              }}
              className="mt-6 w-full h-10 bg-[#12335f] hover:bg-[#0b2445] text-white font-bold uppercase tracking-wide text-xs rounded-xl flex items-center justify-center gap-1.5"
            >
              <span>Verify & Complete in {redirectLabel}</span>
              <ArrowRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
