import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { api } from '../lib/api';
import { toast } from 'sonner';
import { User, Lock, Mail, Shield, CheckCircle2, ExternalLink } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import Link from 'next/link';
import { getSellerPortalPath, isShgUser } from '../lib/shg';

export default function Profile() {
  const { user, logout, refreshUser } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [twoFactorOtp, setTwoFactorOtp] = useState('');
  const [twoFactorPassword, setTwoFactorPassword] = useState('');
  const [twoFactorPending, setTwoFactorPending] = useState(false);
  const [passwords, setPasswords] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!passwords.currentPassword || !passwords.newPassword || !passwords.confirmPassword) {
      return toast.error('Please fill all password fields');
    }

    if (passwords.newPassword !== passwords.confirmPassword) {
      return toast.error('Passwords do not match');
    }

    if (passwords.newPassword.length < 12) {
      return toast.error('New password must be at least 12 characters long');
    }

    setIsSubmitting(true);
    try {
      const res = await api.fetch('/api/auth/change-password', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify({
          currentPassword: passwords.currentPassword,
          newPassword: passwords.newPassword
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || 'Failed to update password');
      }

      toast.success('Password updated successfully');
      setPasswords({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      logout();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const requestTwoFactorEnable = async () => {
    setIsSubmitting(true);
    try {
      const res = await api.post('/api/auth/2fa/enable', {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Unable to start 2FA setup');
      setTwoFactorPending(true);
      toast.success('Verification code sent to your email');
    } catch (err: any) {
      toast.error(err.message || 'Unable to start 2FA setup');
    } finally {
      setIsSubmitting(false);
    }
  };

  const confirmTwoFactorEnable = async () => {
    setIsSubmitting(true);
    try {
      const res = await api.post('/api/auth/2fa/enable', { otp: twoFactorOtp }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Unable to enable 2FA');
      setTwoFactorPending(false);
      setTwoFactorOtp('');
      await refreshUser();
      toast.success('Two-factor authentication enabled');
    } catch (err: any) {
      toast.error(err.message || 'Unable to enable 2FA');
    } finally {
      setIsSubmitting(false);
    }
  };

  const disableTwoFactor = async () => {
    setIsSubmitting(true);
    try {
      const res = await api.post('/api/auth/2fa/disable', { password: twoFactorPassword }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Unable to disable 2FA');
      setTwoFactorPassword('');
      await refreshUser();
      toast.success('Two-factor authentication disabled');
    } catch (err: any) {
      toast.error(err.message || 'Unable to disable 2FA');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!user) return null;

  return (
    <div className="max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-[#12335f]">My Profile</h1>
          <p className="text-slate-500 text-sm">Manage your account preferences and security settings.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* User Details Card */}
        <div className="md:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div className="w-20 h-20 rounded-full bg-[#f9a825] flex items-center justify-center text-3xl font-bold text-[#12335f] shadow-inner border-4 border-white">
                {user.name.charAt(0).toUpperCase()}
              </div>
              <h2 className="mt-4 text-lg font-bold text-slate-900">{user.name}</h2>
              <div className="mt-1 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800 capitalize">
                {user.role} Account
              </div>
            </div>

            <div className="mt-8 space-y-4">
              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-50 rounded-lg text-slate-400 shrink-0">
                  <Mail className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Email Address</p>
                  <p className="text-sm font-semibold text-slate-900 truncate">{user.email}</p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="p-2 bg-slate-50 rounded-lg text-slate-400 shrink-0">
                  <Shield className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500 uppercase tracking-wider">Account Status</p>
                  <div className="flex items-center gap-1 text-green-600">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <p className="text-sm font-semibold capitalize">Active</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
            <h3 className="text-sm font-bold text-slate-900 mb-3">Profile Actions</h3>
            <div className="space-y-2">
              {user.role === 'buyer' && (
                <Link href="/buyer/profile" className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-[#12335f]/40 hover:text-[#12335f]">
                  Buyer profile details
                  <ExternalLink className="h-4 w-4" />
                </Link>
              )}
              {user.role === 'seller' && (
                <Link href={getSellerPortalPath(user)} className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-[#12335f]/40 hover:text-[#12335f]">
                  {isShgUser(user) ? 'SHG profile details' : 'Seller profile details'}
                  <ExternalLink className="h-4 w-4" />
                </Link>
              )}
              {user.role === 'admin' && (
                <Link href="/admin/onboarding" className="flex items-center justify-between rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:border-[#12335f]/40 hover:text-[#12335f]">
                  Admin console
                  <ExternalLink className="h-4 w-4" />
                </Link>
              )}
            </div>
          </div>
        </div>

        {/* Security & Password Form */}
        <div className="md:col-span-2 space-y-6">
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg border border-slate-200 text-[#12335f]">
                <Lock className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Security Settings</h3>
                <p className="text-xs text-slate-500">Update your password to keep your account secure.</p>
              </div>
            </div>

            <div className="p-6">
              <form onSubmit={handlePasswordChange} className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-bold text-slate-700 ml-1 uppercase tracking-wide" htmlFor="currentPassword">Current Password</label>
                  <div className="relative">
                    <Input
                      id="currentPassword"
                      type="password"
                      placeholder="Enter current password"
                      value={passwords.currentPassword}
                      onChange={(e) => setPasswords({...passwords, currentPassword: e.target.value})}
                      className="pl-10"
                    />
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 ml-1 uppercase tracking-wide" htmlFor="newPassword">New Password</label>
                    <div className="relative">
                      <Input
                        id="newPassword"
                        type="password"
                        placeholder="12+ chars, mixed case, number, symbol"
                        value={passwords.newPassword}
                        onChange={(e) => setPasswords({...passwords, newPassword: e.target.value})}
                        className="pl-10"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-xs font-bold text-slate-700 ml-1 uppercase tracking-wide" htmlFor="confirmPassword">Confirm Password</label>
                    <div className="relative">
                      <Input
                        id="confirmPassword"
                        type="password"
                        placeholder="Confirm new password"
                        value={passwords.confirmPassword}
                        onChange={(e) => setPasswords({...passwords, confirmPassword: e.target.value})}
                        className="pl-10"
                      />
                      <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    </div>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 flex justify-end">
                  <Button 
                    type="submit" 
                    disabled={isSubmitting}
                    className="bg-[#12335f] hover:bg-[#0b2445] text-white min-w-[140px]"
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Updating...
                      </>
                    ) : (
                      'Update Password'
                    )}
                  </Button>
                </div>
              </form>
            </div>
          </div>

          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg border border-slate-200 text-[#12335f]">
                <Shield className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">Two-Factor Authentication</h3>
                <p className="text-xs text-slate-500">Require an email OTP after password login.</p>
              </div>
            </div>
            <div className="p-6 space-y-4">
              <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-4">
                <div>
                  <p className="text-sm font-bold text-slate-900">Status</p>
                  <p className="text-xs font-semibold text-slate-500">{user.twoFactorEnabled ? 'Enabled' : 'Disabled'}</p>
                </div>
                {!user.twoFactorEnabled && !twoFactorPending && (
                  <Button type="button" disabled={isSubmitting} onClick={requestTwoFactorEnable} className="bg-[#12335f] text-white">
                    Enable 2FA
                  </Button>
                )}
              </div>

              {!user.twoFactorEnabled && twoFactorPending && (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    label="Email OTP"
                    value={twoFactorOtp}
                    maxLength={6}
                    onChange={(e) => setTwoFactorOtp(e.target.value.replace(/\D/g, ''))}
                    placeholder="000000"
                  />
                  <Button type="button" disabled={isSubmitting || twoFactorOtp.length !== 6} onClick={confirmTwoFactorEnable} className="self-end bg-[#12335f] text-white">
                    Confirm
                  </Button>
                </div>
              )}

              {user.twoFactorEnabled && (
                <div className="flex flex-col gap-3 sm:flex-row">
                  <Input
                    label="Current Password"
                    type="password"
                    value={twoFactorPassword}
                    onChange={(e) => setTwoFactorPassword(e.target.value)}
                    placeholder="Confirm password"
                  />
                  <Button type="button" disabled={isSubmitting || !twoFactorPassword} onClick={disableTwoFactor} className="self-end bg-slate-900 text-white">
                    Disable 2FA
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
