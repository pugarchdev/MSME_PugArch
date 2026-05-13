import React, { useState } from 'react';
import { api } from '../lib/api';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/input';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { Store, Building2, ShieldCheck, Mail, Key } from 'lucide-react';

export default function Register({ type }: { type: 'seller' | 'buyer' | 'admin' }) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
  });
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [isVerifyingOtp, setIsVerifyingOtp] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSendOtp = async () => {
    if (!formData.email) {
      toast.error('Please enter an email address first');
      return;
    }
    setIsSendingOtp(true);
    try {
      const res = await api.post('/api/auth/send-email-otp', { email: formData.email });
      if (res.ok) {
        setOtpSent(true);
        toast.success('Verification code sent to your email');
      } else {
        const data = await res.json();
        toast.error(data.message || 'Failed to send OTP');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Network error. Check your connection.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!otp) {
      toast.error('Please enter the verification code');
      return;
    }
    setIsVerifyingOtp(true);
    try {
      const res = await api.post('/api/auth/verify-email-otp', { email: formData.email, otp });
      if (res.ok) {
        setIsEmailVerified(true);
        toast.success('Email verified successfully!');
      } else {
        const data = await res.json();
        toast.error(data.message || 'Invalid code');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Verification failed');
    } finally {
      setIsVerifyingOtp(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isEmailVerified) {
      toast.error('Please verify your email address to continue');
      return;
    }
    setIsLoading(true);

    try {
      const res = await api.post('/api/auth/register', { ...formData, role: type });
      const data = await res.json();
      
      if (res.ok) {
        login(data.token, data.user);
        toast.success(type === 'admin' ? 'Admin account created!' : `Account created! Let's complete your onboarding.`);
        if (type === 'seller') navigate('/seller/onboarding');
        else if (type === 'buyer') navigate('/buyer/onboarding');
        else navigate('/dashboard');
      } else {
        toast.error(data.message || 'Registration failed');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Something went wrong');
    } finally {
      setIsLoading(false);
    }
  };

  const getTitle = () => {
    if (type === 'seller') return 'Seller Account';
    if (type === 'buyer') return 'Buyer Account';
    return 'Admin Account';
  };

  const getNameLabel = () => {
    if (type === 'seller') return 'Full Name';
    if (type === 'buyer') return 'Authorized Representative Name';
    return 'Administrator Name';
  };

  return (
    <div className="flex min-h-dvh items-center justify-center px-3 py-6 sm:px-4">
      <Card className="animate-in w-full max-w-md overflow-hidden rounded-2xl border-none shadow-xl shadow-indigo-100 fade-in slide-in-from-bottom-4 duration-500 sm:rounded-3xl sm:shadow-2xl">
        <CardHeader className="bg-indigo-50/50 pb-6 pt-7 text-center">
          <div className="mx-auto w-14 h-14 bg-white shadow-xl rounded-2xl flex items-center justify-center mb-4 animate-in zoom-in-50 duration-500">
            {type === 'seller' ? <Store className="h-8 w-8 text-indigo-600" /> : <Building2 className="h-8 w-8 text-indigo-600" />}
          </div>
          <CardTitle className="text-2xl md:text-3xl font-black  tracking-tight text-slate-900 uppercase">Create {getTitle()}</CardTitle>
          <p className="text-sm font-medium text-slate-500 mt-2 ">Start your journey with PugArch MSME Marketplace</p>
        </CardHeader>
        <CardContent className="p-4 sm:p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <Input
              label={getNameLabel()}
              placeholder="e.g. John Doe"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              required
              className="rounded-xl border-slate-200 focus:border-indigo-500"
            />
            
            <div className="space-y-1.5">
              <label className="text-xs font-black uppercase text-slate-400 tracking-widest  ml-1">Official Email</label>
              <div className="flex flex-col sm:flex-row gap-2">
                <div className="relative flex-1">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                  <input
                    type="email"
                    placeholder="name@company.com"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    disabled={isEmailVerified || otpSent}
                    required
                    className="w-full h-11 pl-10 pr-4 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all disabled:bg-slate-50 disabled:text-slate-500 font-medium "
                  />
                </div>
                {!isEmailVerified && !otpSent && (
                  <Button 
                    type="button" 
                    onClick={handleSendOtp} 
                    disabled={isSendingOtp}
                    variant="outline"
                    className="w-full sm:w-auto h-11 rounded-xl px-4 font-black uppercase text-[10px]  border-indigo-100 text-indigo-600 hover:bg-indigo-50"
                  >
                    {isSendingOtp ? 'Sending...' : 'Verify'}
                  </Button>
                )}
                {isEmailVerified && (
                  <div className="flex items-center gap-1.5 text-green-600 font-black  text-[10px] uppercase bg-green-50 px-3 rounded-xl border border-green-100">
                    <ShieldCheck className="h-4 w-4" />
                    Verified
                  </div>
                )}
              </div>
            </div>

            {otpSent && !isEmailVerified && (
              <div className="space-y-4 animate-in slide-in-from-top-4 duration-500">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase text-indigo-600 tracking-widest  ml-1">Enter 6-Digit OTP</label>
                  <div className="flex flex-col sm:flex-row gap-2">
                    <div className="relative flex-1">
                      <Key className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-indigo-400" />
                      <input
                        type="text"
                        maxLength={6}
                        placeholder="000000"
                        value={otp}
                        onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                        className="h-11 w-full rounded-xl border-2 border-indigo-100 pl-10 pr-4 text-center text-lg font-black tracking-[0.25em] transition-all placeholder:font-medium placeholder:tracking-normal placeholder:text-slate-300 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-indigo-500 sm:tracking-[0.5em]"
                      />
                    </div>
                    <Button 
                      type="button" 
                      onClick={handleVerifyOtp} 
                      disabled={isVerifyingOtp}
                      className="w-full sm:w-auto h-11 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase text-[10px] px-6 "
                    >
                      {isVerifyingOtp ? 'Checking...' : 'Apply Code'}
                    </Button>
                  </div>
                  <p className="text-[10px] text-slate-400 font-bold  ml-1">Code expires in 5 minutes. No code? <button type="button" onClick={handleSendOtp} className="text-indigo-600 underline">Resend</button></p>
                </div>
              </div>
            )}

            <Input
              label="Password"
              type="password"
              placeholder="Min. 8 characters"
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
              required
              minLength={8}
              className="rounded-xl border-slate-200"
            />
            
            <Button 
              type="submit" 
              className="w-full h-12 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white font-black uppercase tracking-[0.2em]  shadow-xl shadow-slate-200 transition-all active:scale-95 disabled:opacity-50" 
              disabled={isLoading || !isEmailVerified}
            >
              {isLoading ? 'Creating Account...' : 'Finish Registration'}
            </Button>
            
            <div className="text-center mt-4">
              <p className="text-sm font-medium text-slate-500 ">
                Already have an account?{' '}
                <Link to="/login" className="text-indigo-600 font-black uppercase text-[10px] hover:underline underline-offset-4 tracking-widest">Sign in</Link>
              </p>
            </div>
            
            {type !== 'admin' && (
              <div className="pt-4 mt-1 border-t border-slate-100 text-center">
                 <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ">
                  Registering as the wrong role? {' '}
                  <Link to={type === 'seller' ? '/buyer/register' : '/seller/register'} className="text-indigo-600 underline decoration-indigo-200 underline-offset-4">
                    Switch to {type === 'seller' ? 'Buyer' : 'Seller'}
                  </Link>
                 </p>
              </div>
            )}
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
