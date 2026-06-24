import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { ShieldCheck, Mail, Lock, UserX, Info, AlertTriangle, PlayCircle, Building2 } from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { GeMSettingsSidebar } from '../components/GeMSettingsSidebar';
import { GeMProfileHeader } from '../components/GeMProfileHeader';

export default function SellerSettings() {
  const { user, refreshUser, logout } = useAuth();
  const searchParams = useSearchParams();
  const sectionParam = searchParams?.get('section');
  const [currentSection, setCurrentSection] = useState(sectionParam || 'profile');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);

  // Logo & Branding states
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [bannerUrl, setBannerUrl] = useState<string | null>(null);
  const [isBrandingLoading, setIsBrandingLoading] = useState(false);
  const [isLogoLoading, setIsLogoLoading] = useState(false);
  const [isBannerLoading, setIsBannerLoading] = useState(false);

  // Form states
  const [aadhaarForm, setAadhaarForm] = useState({ number: '', mobile: '', consent: false });
  
  // Password change states
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [passwordOtpSent, setPasswordOtpSent] = useState(false);
  const [passwordOtp, setPasswordOtp] = useState('');

  // Email change states
  const [emailForm, setEmailForm] = useState({ newEmail: '', confirmEmail: '' });
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [emailOtp, setEmailOtp] = useState('');
  const [emailPassword, setEmailPassword] = useState('');

  // Close account custom modal state
  const [isCloseModalOpen, setIsCloseModalOpen] = useState(false);

  // Profile edit states
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [profileForm, setProfileForm] = useState({ firstName: '', lastName: '', mobile: '' });
  const [profileOtpSent, setProfileOtpSent] = useState(false);
  const [profileOtp, setProfileOtp] = useState('');


  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        const profile = data.user?.sellerProfile || data.user?.shgProfile || {};
        setProfileData(profile);
        if (profile.aadhaarNumber) {
           setAadhaarForm(prev => ({ ...prev, number: profile.aadhaarNumber }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsFetching(false);
      }
    };
    fetchProfile();
  }, []);

  useEffect(() => {
    if (currentSection === 'branding') {
      const fetchBranding = async () => {
        setIsBrandingLoading(true);
        try {
          const res = await api.fetch('/api/seller/settings/branding', {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          if (res.ok) {
            const data = await res.json();
            setLogoUrl(data.data?.logoUrl || null);
            setBannerUrl(data.data?.bannerUrl || null);
          }
        } catch (err) {
          console.error(err);
        } finally {
          setIsBrandingLoading(false);
        }
      };
      fetchBranding();
    }
  }, [currentSection]);

    const handleLogoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const limitMB = 2;
    if (file.size > limitMB * 1024 * 1024) {
      return toast.error(`File size exceeds limit of ${limitMB}MB`);
    }

    const formData = new FormData();
    formData.append('file', file);
    const loadingToast = toast.loading('Uploading logo...');
    setIsLogoLoading(true);
    try {
      const uploadRes = await api.fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      if (uploadRes.ok) {
        const body = await uploadRes.json();
        const uploadedLogoUrl = body.data?.url || body.url;

        const saveRes = await api.fetch('/api/seller/settings/branding', {
          method: 'PUT',
          body: JSON.stringify({ logoUrl: uploadedLogoUrl }),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (saveRes.ok) {
          setLogoUrl(uploadedLogoUrl);
          toast.success('Logo uploaded and updated successfully');
        } else {
          toast.error('Failed to update logo in your profile settings');
        }
      } else {
        toast.error('Logo file upload failed');
      }
    } catch (err) {
      console.error(err);
      toast.error('Logo upload failed due to network error');
    } finally {
      setIsLogoLoading(false);
      toast.dismiss(loadingToast);
    }
  };

  const handleRemoveLogo = async () => {
    const loadingToast = toast.loading('Removing logo...');
    setIsLogoLoading(true);
    try {
      const res = await api.fetch('/api/seller/settings/branding', {
        method: 'PUT',
        body: JSON.stringify({ logoUrl: null }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        setLogoUrl(null);
        toast.success('Logo removed successfully');
      } else {
        toast.error('Failed to remove logo');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove logo due to network error');
    } finally {
      setIsLogoLoading(false);
      toast.dismiss(loadingToast);
    }
  };

  const handleBannerUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const limitMB = 5;
    if (file.size > limitMB * 1024 * 1024) {
      return toast.error(`File size exceeds limit of ${limitMB}MB`);
    }

    const formData = new FormData();
    formData.append('file', file);
    const loadingToast = toast.loading('Uploading banner...');
    setIsBannerLoading(true);
    try {
      const uploadRes = await api.fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      if (uploadRes.ok) {
        const body = await uploadRes.json();
        const uploadedBannerUrl = body.data?.url || body.url;

        const saveRes = await api.fetch('/api/seller/settings/branding', {
          method: 'PUT',
          body: JSON.stringify({ bannerUrl: uploadedBannerUrl }),
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${localStorage.getItem('token')}`
          }
        });
        if (saveRes.ok) {
          setBannerUrl(uploadedBannerUrl);
          toast.success('Storefront cover banner uploaded successfully');
        } else {
          toast.error('Failed to update banner in your profile settings');
        }
      } else {
        toast.error('Banner file upload failed');
      }
    } catch (err) {
      console.error(err);
      toast.error('Banner upload failed due to network error');
    } finally {
      setIsBannerLoading(false);
      toast.dismiss(loadingToast);
    }
  };

  const handleRemoveBanner = async () => {
    const loadingToast = toast.loading('Removing banner...');
    setIsBannerLoading(true);
    try {
      const res = await api.fetch('/api/seller/settings/branding', {
        method: 'PUT',
        body: JSON.stringify({ bannerUrl: null }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      if (res.ok) {
        setBannerUrl(null);
        toast.success('Storefront cover banner removed successfully');
      } else {
        toast.error('Failed to remove banner');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to remove banner due to network error');
    } finally {
      setIsBannerLoading(false);
      toast.dismiss(loadingToast);
    }
  };

  const handleUpdateAadhaar = async () => {
    if (!aadhaarForm.number || !aadhaarForm.mobile) return toast.error("Please fill all required fields");
    if (!aadhaarForm.consent) return toast.error("Please provide your consent");

    setIsLoading(true);
    try {
      await api.fetch('/api/seller/settings/aadhaar', {
        method: 'POST',
        body: JSON.stringify({ aadhaarNumber: aadhaarForm.number }),
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success("Aadhaar updated successfully");
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGetPasswordOtp = async () => {
    if (!passwordForm.newPassword) return toast.error("Please enter new password first");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) return toast.error("Passwords do not match");

    setIsLoading(true);
    try {
      await api.fetch('/api/seller/settings/change-password/send-otp', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success("OTP sent to your registered email");
      setPasswordOtpSent(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangePassword = async () => {
    if (!passwordForm.newPassword) return toast.error("Please enter new password");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) return toast.error("Passwords do not match");
    if (!passwordOtp) return toast.error("Please enter the OTP");

    setIsLoading(true);
    try {
      await api.fetch('/api/seller/settings/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: passwordForm.newPassword, otp: passwordOtp }),
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success("Password changed successfully");
      setPasswordForm({ newPassword: '', confirmPassword: '' });
      setPasswordOtp('');
      setPasswordOtpSent(false);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendEmailOtp = async () => {
    if (!emailForm.newEmail) return toast.error("Please enter new email first");
    if (emailForm.newEmail !== emailForm.confirmEmail) return toast.error("Emails do not match");

    setIsLoading(true);
    try {
      const res = await api.fetch('/api/auth/send-email-otp', {
        method: 'POST',
        body: JSON.stringify({ email: emailForm.newEmail }),
        headers: { 'Content-Type': 'application/json' }
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to send OTP to new email address");
      }
      toast.success("Verification OTP sent to your new email");
      setEmailOtpSent(true);
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!emailForm.newEmail) return toast.error("Please enter new email");
    if (emailForm.newEmail !== emailForm.confirmEmail) return toast.error("Emails do not match");
    if (!emailOtp || !emailPassword) return toast.error("OTP and current password are required");

    setIsLoading(true);
    try {
      const res = await api.fetch('/api/seller/settings/change-email', {
        method: 'POST',
        body: JSON.stringify({ newEmail: emailForm.newEmail, otp: emailOtp, password: emailPassword }),
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!res.ok) {
        const errorData = await res.json();
        throw new Error(errorData.message || "Failed to update email");
      }
      toast.success("Email changed successfully. Please login again.");
      logout();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseAccount = async () => {
    setIsLoading(true);
    try {
      await api.fetch('/api/seller/settings/close-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success("Account closed successfully");
      setIsCloseModalOpen(false);
      logout();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEditing = () => {
    const firstName = user?.name?.split(' ')[0] || '';
    const lastName = user?.name?.split(' ').slice(1).join(' ') || '';
    const mobile = user?.mobile || '';
    setProfileForm({ firstName, lastName, mobile });
    setIsEditingProfile(true);
    setProfileOtpSent(false);
    setProfileOtp('');
  };

  const handleGetProfileOtp = async () => {
    if (!profileForm.firstName.trim() || !profileForm.lastName.trim() || !profileForm.mobile.trim()) {
      return toast.error("Please fill in First Name, Last Name, and Mobile number");
    }
    
    setIsLoading(true);
    try {
      const res = await api.fetch('/api/seller/settings/profile/send-otp', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        toast.success("OTP sent to your registered email");
        setProfileOtpSent(true);
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to send OTP");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdateProfile = async () => {
    if (!profileOtp) return toast.error("Please enter the OTP");

    setIsLoading(true);
    try {
      const res = await api.fetch('/api/seller/settings/profile', {
        method: 'POST',
        body: JSON.stringify({
          firstName: profileForm.firstName,
          lastName: profileForm.lastName,
          mobile: profileForm.mobile,
          otp: profileOtp
        }),
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token')}`
        }
      });
      
      if (res.ok) {
        toast.success("Profile updated successfully!");
        setIsEditingProfile(false);
        setProfileOtp('');
        setProfileOtpSent(false);
        await refreshUser();
      } else {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.message || "Failed to update profile");
      }
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (sectionParam && sectionParam !== currentSection) {
      setCurrentSection(sectionParam);
    }
  }, [sectionParam]);

  const handleSectionChange = (id: string) => {
    setCurrentSection(id);
    const params = new URLSearchParams(window.location.search);
    params.set('section', id);
    window.history.pushState(null, '', `?${params.toString()}`);
  };

  const calculateCompletion = () => {
    return 60;
  };

  if (isFetching) return <div className="flex h-screen items-center justify-center px-4 text-center font-black text-[#12335f] animate-pulse">Loading JsgSmile Portal - Jharsuguda Synergy for MSME and Industry Linkage Ecosystem account settings...</div>;

  return (
    <div className="flex flex-col lg:flex-row bg-gray-50 min-h-screen">
      <GeMSettingsSidebar 
        currentSection={currentSection} 
        onSectionChange={handleSectionChange} 
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        {/* <GeMProfileHeader 
          companyName={profileData?.businessName || user?.name || "Seller Company"} 
          completionPercentage={calculateCompletion()} 
          warnings={[
            "Please complete your profile to start transacting on MSME",
            "Please complete 'Beneficial Ownership Compliance'. Click here"
          ]} 
        /> */}
        
        <main className="p-3 sm:p-8 max-w-5xl mx-auto w-full">
          

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {currentSection === 'profile' && (
              <div className="p-5 sm:p-8 space-y-6 sm:space-y-8 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Seller Profile</h2>
                  <p className="text-gray-500 mt-1">Summary of your Personal Profile with JsgSmile</p>
                </div>

                {!isEditingProfile ? (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-tight">First Name</label>
                        <div className="w-full h-12 px-4 rounded bg-gray-100 border border-gray-200 flex items-center text-gray-600">
                          {user?.name?.split(' ')[0] || 'N/A'}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-tight">Last Name</label>
                        <div className="w-full h-12 px-4 rounded bg-gray-100 border border-gray-200 flex items-center text-gray-600">
                          {user?.name?.split(' ').slice(1).join(' ') || 'N/A'}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-tight">Mobile</label>
                        <div className="w-full h-12 px-4 rounded bg-gray-100 border border-gray-200 flex items-center text-gray-600">
                          {user?.mobile || 'N/A'}
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-tight">Email Id</label>
                        <div className="w-full h-12 px-4 rounded bg-gray-100 border border-gray-200 flex items-center text-gray-600">
                          {user?.email || 'N/A'}
                        </div>
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-tight">Roles</label>
                        <div className="w-full h-12 px-4 rounded bg-gray-100 border border-gray-200 flex items-center text-gray-600">
                          Primary Seller
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end pt-4 border-t border-gray-100">
                      <Button
                        onClick={handleStartEditing}
                        className="w-full sm:w-auto bg-[#12335f] hover:bg-slate-800 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs shadow-lg shadow-blue-100 rounded"
                      >
                        EDIT PROFILE
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8">
                      <Input
                        label="First Name*"
                        placeholder="Enter first name"
                        value={profileForm.firstName}
                        onChange={(e) => setProfileForm({ ...profileForm, firstName: e.target.value })}
                      />
                      <Input
                        label="Last Name*"
                        placeholder="Enter last name"
                        value={profileForm.lastName}
                        onChange={(e) => setProfileForm({ ...profileForm, lastName: e.target.value })}
                      />
                      <Input
                        label="Mobile*"
                        placeholder="Enter mobile number"
                        value={profileForm.mobile}
                        onChange={(e) => setProfileForm({ ...profileForm, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                      />
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-tight">Email Id</label>
                        <div className="w-full h-12 px-4 rounded bg-gray-100 border border-gray-200 flex items-center text-gray-600">
                          {user?.email || 'N/A'}
                        </div>
                      </div>
                      <div className="space-y-1.5 md:col-span-2">
                        <label className="text-xs font-bold text-gray-700 uppercase tracking-tight">Roles</label>
                        <div className="w-full h-12 px-4 rounded bg-gray-100 border border-gray-200 flex items-center text-gray-600">
                          Primary Seller
                        </div>
                      </div>
                    </div>

                    {profileOtpSent && (
                      <div className="max-w-md pt-4">
                        <Input
                          label="Enter OTP*"
                          placeholder="Enter 6-digit OTP sent to registered email"
                          value={profileOtp}
                          onChange={(e) => setProfileOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        />
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
                      <Button
                        type="button"
                        onClick={() => setIsEditingProfile(false)}
                        variant="outline"
                        className="w-full sm:w-auto order-last sm:order-first border border-gray-300 text-gray-600 hover:bg-gray-50 font-bold px-8 h-12 uppercase tracking-widest text-xs rounded"
                      >
                        Cancel
                      </Button>
                      {!profileOtpSent ? (
                        <Button
                          onClick={handleGetProfileOtp}
                          disabled={isLoading}
                          className="w-full sm:w-auto bg-[#12335f] hover:bg-slate-800 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs shadow-lg shadow-blue-100 rounded"
                        >
                          {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : "GET OTP"}
                        </Button>
                      ) : (
                        <>
                          <Button
                            onClick={handleGetProfileOtp}
                            disabled={isLoading}
                            variant="outline"
                            className="w-full sm:w-auto border border-indigo-200 text-indigo-600 hover:bg-indigo-50 font-bold px-8 h-12 uppercase tracking-widest text-xs rounded"
                          >
                            Resend OTP
                          </Button>
                          <Button
                            onClick={handleUpdateProfile}
                            disabled={isLoading || !profileOtp}
                            className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs shadow-lg shadow-emerald-100 rounded"
                          >
                            {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : "UPDATE PROFILE"}
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentSection === 'aadhaar' && (
              <div className="p-5 sm:p-8 space-y-6 sm:space-y-8 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-gray-800">Update Aadhaar</h2>

            

                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8">
                  <Input label="Aadhaar Number / Virtual ID*" placeholder="Enter Aadhaar number / Virtual ID" value={aadhaarForm.number} onChange={e => setAadhaarForm({...aadhaarForm, number: e.target.value})} />
                  <Input label="Mobile number linked with Aadhaar*" placeholder="Enter mobile number linked with Aadhaar" value={aadhaarForm.mobile} onChange={e => setAadhaarForm({...aadhaarForm, mobile: e.target.value})} />
                </div>

                <div className="border border-gray-100 rounded-lg p-4 sm:p-6 bg-gray-50/50 space-y-4">
                  <div className="flex items-start gap-4">
                    <input type="checkbox" checked={aadhaarForm.consent} onChange={e => setAadhaarForm({...aadhaarForm, consent: e.target.checked})} className="mt-1 h-5 w-5 rounded border-gray-300 text-[#12335f]" />
                    <div className="space-y-4 text-[13px] leading-relaxed text-gray-600">
                      <p>
                        I, the holder of the above Aadhaar, hereby give my consent to JsgSmile Portal, for using my Aadhaar number as allotted by UIDAI for JsgSmile Portal registration. JsgSmile Portal has informed me that my Aadhaar data will not be stored/shared.
                      </p>
                      <p className="font-medium">
                        Please read this consent carefully before continuing.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row items-center justify-end gap-4 pt-4 border-t border-gray-100">
                  <Button onClick={handleUpdateAadhaar} disabled={isLoading} className="w-full sm:w-auto bg-[#12335f] hover:bg-slate-800 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs shadow-lg shadow-blue-100">
                    {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'UPDATE AADHAAR'}
                  </Button>
                </div>
              </div>
            )}

            {currentSection === 'branding' && (
              <div className="p-5 sm:p-8 space-y-6 sm:space-y-8 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Logo & Branding</h2>
                  <p className="text-gray-500 mt-1">Upload your organization logo and cover banner to show on your public storefront and portal landing pages.</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Logo Upload Card */}
                  <div className="bg-[#f8fafc]/60 border border-[#e2e8f0] hover:border-[#12335f]/20 hover:shadow-md transition-all duration-300 rounded-2xl p-6 flex flex-col items-center justify-between min-h-[280px]">
                    <div className="text-center space-y-1.5 w-full flex flex-col items-center">
                      <p className="text-xs font-black uppercase tracking-wider text-[#12335f] mb-2">Organization Logo</p>
                      {(isLogoLoading || isBrandingLoading) ? (
                        <div className="flex flex-col items-center justify-center h-32 animate-pulse">
                          <Loader2 className="animate-spin h-8 w-8 text-[#12335f]" />
                        </div>
                      ) : logoUrl ? (
                        <div className="h-32 w-32 rounded-xl border border-slate-100 bg-white p-2.5 shadow-sm flex items-center justify-center transition-transform hover:scale-105 duration-300">
                          <img src={logoUrl} alt="Organization Logo" className="max-h-full max-w-full object-contain rounded-lg" />
                        </div>
                      ) : (
                        <div className="h-32 w-32 rounded-xl bg-slate-100/80 border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                          <Building2 className="h-10 w-10" />
                        </div>
                      )}
                    </div>
                    
                    {!(isLogoLoading || isBrandingLoading) && (
                      <div className="w-full flex flex-col items-center gap-2 mt-4">
                        {logoUrl ? (
                          <Button onClick={handleRemoveLogo} className="bg-red-50 hover:bg-red-100 text-red-600 font-extrabold uppercase text-[10px] tracking-wider h-9 px-6 rounded-lg w-full">
                            Remove Logo
                          </Button>
                        ) : (
                          <>
                            <p className="text-[10px] text-slate-500 font-medium text-center">PNG, JPG (Max 2MB)</p>
                            <label className="cursor-pointer inline-flex items-center justify-center bg-[#12335f] hover:bg-slate-800 text-white font-black uppercase text-[10px] tracking-wider h-10 px-6 rounded-xl shadow-md w-full transition-all">
                              <span>Upload Logo</span>
                              <input type="file" onChange={handleLogoUpload} className="hidden" accept="image/png, image/jpeg, image/jpg" />
                            </label>
                          </>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Banner Upload Card */}
                  <div className="bg-[#f8fafc]/60 border border-[#e2e8f0] hover:border-[#12335f]/20 hover:shadow-md transition-all duration-300 rounded-2xl p-6 flex flex-col items-center justify-between min-h-[280px]">
                    <div className="text-center space-y-1.5 w-full flex flex-col items-center">
                      <p className="text-xs font-black uppercase tracking-wider text-[#12335f] mb-2">Storefront Cover Banner</p>
                      {(isBannerLoading || isBrandingLoading) ? (
                        <div className="flex flex-col items-center justify-center h-32 animate-pulse">
                          <Loader2 className="animate-spin h-8 w-8 text-[#12335f]" />
                        </div>
                      ) : bannerUrl ? (
                        <div className="h-32 w-full rounded-xl border border-slate-100 bg-white shadow-sm flex items-center justify-center overflow-hidden transition-transform hover:scale-102 duration-300">
                          <img src={bannerUrl} alt="Storefront Cover Banner" className="h-full w-full object-cover" />
                        </div>
                      ) : (
                        <div className="h-32 w-full rounded-xl bg-slate-100/80 border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                          <div className="flex flex-col items-center gap-1">
                            <Building2 className="h-8 w-8" />
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">No Banner Selected</span>
                          </div>
                        </div>
                      )}
                    </div>

                    {!(isBannerLoading || isBrandingLoading) && (
                      <div className="w-full flex flex-col items-center gap-2 mt-4">
                        {bannerUrl ? (
                          <Button onClick={handleRemoveBanner} className="bg-red-50 hover:bg-red-100 text-red-600 font-extrabold uppercase text-[10px] tracking-wider h-9 px-6 rounded-lg w-full">
                            Remove Banner
                          </Button>
                        ) : (
                          <>
                            <p className="text-[10px] text-slate-500 font-medium text-center">Recommended aspect ratio: 4:1 (Max 5MB)</p>
                            <label className="cursor-pointer inline-flex items-center justify-center bg-[#12335f] hover:bg-slate-800 text-white font-black uppercase text-[10px] tracking-wider h-10 px-6 rounded-xl shadow-md w-full transition-all">
                              <span>Upload Banner</span>
                              <input type="file" onChange={handleBannerUpload} className="hidden" accept="image/png, image/jpeg, image/jpg" />
                            </label>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {currentSection === 'password' && (
              <div className="p-5 sm:p-8 space-y-6 sm:space-y-8 animate-in fade-in duration-300">
                <div className="space-y-1">
                  <h2 className="text-2xl font-bold text-gray-800">Change Password</h2>
                  <p className="text-gray-500">Password must fulfill MSME password policy</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8 pt-4">
                    <Input label="New Password*" type="password" placeholder="Enter new password" value={passwordForm.newPassword} onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} />
                    <Input label="Confirm New Password*" type="password" placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})} />
                </div>

                {passwordOtpSent && (
                  <div className="pt-4 max-w-md">
                    <Input 
                      label="Enter OTP*" 
                      placeholder="Enter 6-digit OTP" 
                      value={passwordOtp} 
                      onChange={e => setPasswordOtp(e.target.value)} 
                    />
                  </div>
                )}

                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
                  <Button 
                    onClick={handleGetPasswordOtp} 
                    disabled={isLoading || !passwordForm.newPassword}
                    className="w-full sm:w-auto bg-[#12335f] hover:bg-slate-800 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs shadow-lg shadow-blue-100"
                  >
                    {passwordOtpSent ? 'RESEND OTP' : 'GET OTP'}
                  </Button>
                  <Button 
                    onClick={handleChangePassword} 
                    disabled={isLoading || !passwordForm.newPassword || !passwordOtpSent || !passwordOtp} 
                    className="w-full sm:w-auto bg-[#12335f] hover:bg-slate-800 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs shadow-lg shadow-blue-100"
                  >
                    {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'CHANGE PASSWORD'}
                  </Button>
                </div>
              </div>
            )}

            {currentSection === 'email' && (
              <div className="p-5 sm:p-8 space-y-6 sm:space-y-8 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-gray-800">Change Email</h2>
                <p className="text-gray-500">Please note that the new email ID will be used for business done on JsgSmile.</p>

                <div className="bg-sky-50 border border-sky-100 p-4 sm:p-6 rounded-lg space-y-4">
                  <h3 className="font-bold text-red-600 uppercase tracking-tight">Important Update on Bid Notifications</h3>
                  <p className="text-sm text-sky-800 leading-relaxed">
                    This is to inform you that, to receive bid notifications on your updated email ID, you are required to click on the <span className="font-bold">Ongoing Bids</span> page at least once. Until this action is completed, bid notifications will not be delivered to the updated email address.
                  </p>
                </div>

                <div className="space-y-6">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 uppercase tracking-tight">Current Email ID</label>
                    <div className="w-full h-12 px-4 rounded bg-gray-100 border border-gray-200 flex items-center text-gray-600 max-w-md">
                      {user?.email || 'N/A'}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8">
                    <Input label="New Email Id*" placeholder="Please enter your email address" value={emailForm.newEmail} onChange={e => setEmailForm({...emailForm, newEmail: e.target.value})} />
                    <Input label="Verify New Email Id*" placeholder="Please enter your email address" value={emailForm.confirmEmail} onChange={e => setEmailForm({...emailForm, confirmEmail: e.target.value})} />
                  </div>
                </div>

                {emailOtpSent && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-5 sm:gap-8 pt-4">
                    <Input 
                      label="Enter OTP*" 
                      placeholder="Enter 6-digit OTP" 
                      value={emailOtp} 
                      onChange={e => setEmailOtp(e.target.value)} 
                    />
                    <Input 
                      label="Current Password*" 
                      type="password" 
                      placeholder="Enter current password to authorize" 
                      value={emailPassword} 
                      onChange={e => setEmailPassword(e.target.value)} 
                    />
                  </div>
                )}

                <div className="flex flex-col sm:flex-row justify-end gap-3 pt-4 border-t border-gray-100">
                  <Button 
                    onClick={handleSendEmailOtp}
                    disabled={isLoading || !emailForm.newEmail || emailForm.newEmail !== emailForm.confirmEmail}
                    className="w-full sm:w-auto bg-[#12335f] hover:bg-slate-800 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs shadow-lg shadow-blue-100"
                  >
                    {emailOtpSent ? 'RESEND OTP' : 'SEND OTP'}
                  </Button>
                  <Button 
                    onClick={handleChangeEmail} 
                    disabled={isLoading || !emailForm.newEmail || emailForm.newEmail !== emailForm.confirmEmail || !emailOtpSent || !emailOtp || !emailPassword} 
                    className="w-full sm:w-auto bg-[#12335f] hover:bg-slate-800 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs shadow-lg shadow-blue-100"
                  >
                    {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'UPDATE EMAIL'}
                  </Button>
                </div>
              </div>
            )}

            {currentSection === 'close' && (
              <div className="p-5 sm:p-8 space-y-6 sm:space-y-8 animate-in fade-in duration-300">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                  <h2 className="text-2xl font-bold text-gray-800">Close Account</h2>
                  <div className="text-[10px] flex items-center gap-2 text-gray-400 uppercase tracking-widest font-black">
                    Need help with Seller Profile completion? <PlayCircle className="h-4 w-4 text-red-600" />
                  </div>
                </div>

                <p className="text-sm text-gray-600">
                  If you close your account, your account will be closed permanently. You will not be able to login with this account. In addition, all the secondary seller accounts will also be closed.
                </p>

                <div className="bg-sky-50 border border-sky-100 p-4 sm:p-6 rounded-lg">
                  <p className="text-sm text-sky-800 leading-relaxed">
                    You are advised to check and validate your bank account details before closing your seller account on JsgSmile. The bank account details cannot be updated once the account is closed, which may affect pending refunds or settlements.
                  </p>
                </div>

                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-8 border-t border-gray-100">
                  <p className="text-sm font-medium text-gray-700">To close your account permanently click on</p>
                  <Button onClick={() => setIsCloseModalOpen(true)} disabled={isLoading} className="w-full sm:w-auto bg-[#12335f] hover:bg-slate-800 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs shadow-lg shadow-blue-100">
                    CLOSE ACCOUNT
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>

      {isCloseModalOpen && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl border border-gray-100 space-y-6 animate-in zoom-in-95 duration-200">
            <div className="flex items-center gap-3 text-red-600">
              <div className="bg-red-50 p-2 rounded-full">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="text-lg font-bold">Close Account Permanently</h3>
            </div>
            
            <p className="text-sm text-gray-600 leading-relaxed">
              This action is permanent and irreversible. Your account will be <span className="font-bold text-red-600">permanently deleted</span> and you will <span className="font-bold text-red-600">not be able to retrieve this account</span> or any associated data.
            </p>

            <div className="flex justify-end gap-3 pt-2">
              <Button 
                onClick={() => setIsCloseModalOpen(false)} 
                disabled={isLoading}
                className="bg-gray-100 hover:bg-gray-200 text-gray-700 font-bold px-6 h-12 uppercase tracking-widest text-xs border border-gray-200"
              >
                CANCEL
              </Button>
              <Button 
                onClick={handleCloseAccount} 
                disabled={isLoading}
                className="bg-red-600 hover:bg-red-700 text-white font-bold px-6 h-12 uppercase tracking-widest text-xs shadow-lg shadow-red-100"
              >
                {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'DELETE PERMANENTLY'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
