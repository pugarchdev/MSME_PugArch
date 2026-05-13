import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { ShieldCheck, Mail, Lock, UserX, Info, Loader2, AlertTriangle, PlayCircle } from 'lucide-react';
import { GeMSettingsSidebar } from '../components/GeMSettingsSidebar';
import { GeMProfileHeader } from '../components/GeMProfileHeader';

export default function SellerSettings() {
  const { user, refreshUser, logout } = useAuth();
  const [currentSection, setCurrentSection] = useState('profile');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [profileData, setProfileData] = useState<any>(null);

  // Form states
  const [aadhaarForm, setAadhaarForm] = useState({ number: '', mobile: '', consent: false });
  const [passwordForm, setPasswordForm] = useState({ newPassword: '', confirmPassword: '' });
  const [emailForm, setEmailForm] = useState({ newEmail: '', confirmEmail: '' });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        const data = await res.json();
        setProfileData(data.user?.sellerProfile || {});
        if (data.user?.sellerProfile?.aadhaarNumber) {
           setAadhaarForm(prev => ({ ...prev, number: data.user.sellerProfile.aadhaarNumber }));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setIsFetching(false);
      }
    };
    fetchProfile();
  }, []);

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

  const handleChangePassword = async () => {
    if (!passwordForm.newPassword) return toast.error("Please enter new password");
    if (passwordForm.newPassword !== passwordForm.confirmPassword) return toast.error("Passwords do not match");

    setIsLoading(true);
    try {
      await api.fetch('/api/seller/settings/change-password', {
        method: 'POST',
        body: JSON.stringify({ newPassword: passwordForm.newPassword }),
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success("Password changed successfully");
      setPasswordForm({ newPassword: '', confirmPassword: '' });
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!emailForm.newEmail) return toast.error("Please enter new email");
    if (emailForm.newEmail !== emailForm.confirmEmail) return toast.error("Emails do not match");

    setIsLoading(true);
    try {
      await api.fetch('/api/seller/settings/change-email', {
        method: 'POST',
        body: JSON.stringify({ newEmail: emailForm.newEmail }),
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success("Email changed successfully. Please login again.");
      logout();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCloseAccount = async () => {
    if (!confirm("Are you sure you want to close your account permanently?")) return;

    setIsLoading(true);
    try {
      await api.fetch('/api/seller/settings/close-account', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      toast.success("Account closed successfully");
      logout();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const calculateCompletion = () => {
    return 60;
  };

  if (isFetching) return <div className="flex h-screen items-center justify-center font-black  text-blue-600 animate-pulse">Loading Account Settings...</div>;

  return (
    <div className="flex flex-col lg:flex-row bg-gray-50 min-h-screen">
      <GeMSettingsSidebar 
        currentSection={currentSection} 
        onSectionChange={setCurrentSection} 
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        <GeMProfileHeader 
          companyName={profileData?.businessName || user?.name || "Seller Company"} 
          completionPercentage={calculateCompletion()} 
          warnings={[
            "Please complete your profile to start transacting on GeM",
            "Please complete 'Beneficial Ownership Compliance'. Click here"
          ]} 
        />
        
        <main className="p-4 sm:p-8 max-w-5xl mx-auto w-full">
          <div className="bg-amber-50 border border-amber-100 p-4 rounded-lg mb-8 space-y-2">
             <div className="flex items-start gap-2 text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <p className="text-sm font-bold uppercase tracking-tight ">Please complete your profile to start transacting on GeM</p>
             </div>
             <div className="flex items-start gap-2 text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5" />
                <p className="text-sm font-bold uppercase tracking-tight ">
                  Please complete 'Beneficial Ownership Compliance'. <span className="text-blue-600 hover:underline cursor-pointer">Click here</span>
                </p>
             </div>
          </div>

          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            {currentSection === 'profile' && (
              <div className="p-8 space-y-8 animate-in fade-in duration-300">
                <div>
                  <h2 className="text-2xl font-bold text-gray-800">Seller Profile</h2>
                  <p className="text-gray-500 mt-1">Summary of your Personal Profile with GeM</p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
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
              </div>
            )}

            {currentSection === 'aadhaar' && (
              <div className="p-8 space-y-8 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-gray-800">Update Aadhaar</h2>

                <div className="bg-sky-50 border border-sky-100 p-4 rounded-lg text-sky-800 text-sm  font-medium">
                  On Aadhaar update, Pan Validation has to be reverified
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Input label="Aadhaar Number / Virtual ID*" placeholder="Enter Aadhaar number / Virtual ID" value={aadhaarForm.number} onChange={e => setAadhaarForm({...aadhaarForm, number: e.target.value})} />
                  <Input label="Mobile number linked with Aadhaar*" placeholder="Enter mobile number linked with Aadhaar" value={aadhaarForm.mobile} onChange={e => setAadhaarForm({...aadhaarForm, mobile: e.target.value})} />
                </div>

                <div className="border border-gray-100 rounded-lg p-6 bg-gray-50/50 space-y-4">
                  <div className="flex items-start gap-4">
                    <input type="checkbox" checked={aadhaarForm.consent} onChange={e => setAadhaarForm({...aadhaarForm, consent: e.target.checked})} className="mt-1 h-5 w-5 rounded border-gray-300 text-blue-600" />
                    <div className="space-y-4 text-[13px] leading-relaxed text-gray-600 ">
                      <p>
                        I, the holder of the above Aadhaar, hereby give my consent to GeM (Government e Marketplace), for using my Aadhaar number as allotted by UIDAI for GeM Registration. GeM (Government e Marketplace) have informed me that my aadhaar data will not be stored/shared.
                      </p>
                      <p className="font-medium">
                        मैं, उपर्युक्त आधार का धारक, भारतीय विशिष्ट पहचान प्राधिकरण द्वारा आवंटित अपने आधार नंबर को जेम पंजीकरण हेतु प्रयोग में लाने हेतु जेम (गवर्नमेंट ई-मार्केटप्लेस) को एतद्द्वारा अपनी सहमति प्रदान करता हूँ। जेम (गवर्नमेंट ई-मार्केटप्लेस) ने मुझे अवगत कराया है कि मेरे आधार डेटा को संग्रहीत/साझा नहीं किया जाएगा।
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4 text-sm font-medium text-gray-600 ">
                    Click on the play button to listen consent / सहमति सुनने के लिए प्ले बटन पर क्लिक करें।
                    <PlayCircle className="h-6 w-6 text-gray-400 cursor-pointer hover:text-gray-600" />
                  </div>
                  <Button onClick={handleUpdateAadhaar} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs  shadow-lg shadow-blue-100">
                    {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'UPDATE AADHAAR'}
                  </Button>
                </div>
              </div>
            )}

            {currentSection === 'password' && (
              <div className="p-8 space-y-8 animate-in fade-in duration-300">
                <div className="flex justify-between items-start">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-bold text-gray-800">Change Password</h2>
                    <p className="text-gray-500 ">Password must fulfill GeM password policy</p>
                  </div>
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-8 h-12 uppercase tracking-widest text-xs  shadow-lg shadow-blue-100">
                    GET OTP
                  </Button>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 pt-4">
                    <Input label="New Password*" type="password" placeholder="Enter new password" value={passwordForm.newPassword} onChange={e => setPasswordForm({...passwordForm, newPassword: e.target.value})} />
                    <Input label="Confirm New Password*" type="password" placeholder="Confirm new password" value={passwordForm.confirmPassword} onChange={e => setPasswordForm({...passwordForm, confirmPassword: e.target.value})} />
                </div>

                <div className="flex justify-end pt-4">
                  <Button onClick={handleChangePassword} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs  shadow-lg shadow-blue-100">
                    {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'CHANGE PASSWORD'}
                  </Button>
                </div>
              </div>
            )}

            {currentSection === 'email' && (
              <div className="p-8 space-y-8 animate-in fade-in duration-300">
                <h2 className="text-2xl font-bold text-gray-800">Change Email</h2>
                <p className="text-gray-500 ">Please note that the new email ID will be used for business done on GeM</p>

                <div className="bg-sky-50 border border-sky-100 p-6 rounded-lg space-y-4">
                  <h3 className="font-bold text-red-600 uppercase tracking-tight ">Important Update on Bid Notifications</h3>
                  <p className="text-sm text-sky-800  leading-relaxed">
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

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <Input label="New Email Id*" placeholder="Please enter your email address" value={emailForm.newEmail} onChange={e => setEmailForm({...emailForm, newEmail: e.target.value})} />
                    <Input label="Verify New Email Id*" placeholder="Please enter your email address" value={emailForm.confirmEmail} onChange={e => setEmailForm({...emailForm, confirmEmail: e.target.value})} />
                  </div>
                </div>

                <div className="flex justify-end gap-4">
                  <Button disabled className="bg-gray-200 text-gray-400 font-bold px-10 h-12 uppercase tracking-widest text-xs ">
                    SEND OTP
                  </Button>
                  <Button onClick={handleChangeEmail} disabled={isLoading || !emailForm.newEmail} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs  shadow-lg shadow-blue-100">
                    {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'UPDATE EMAIL'}
                  </Button>
                </div>
              </div>
            )}

            {currentSection === 'close' && (
              <div className="p-8 space-y-8 animate-in fade-in duration-300">
                <div className="flex justify-between items-start">
                  <h2 className="text-2xl font-bold text-gray-800">Close Account</h2>
                  <div className="text-[10px] flex items-center gap-2 text-gray-400 uppercase tracking-widest font-black ">
                    Need help with Seller Profile completion? <PlayCircle className="h-4 w-4 text-red-600" />
                  </div>
                </div>

                <p className="text-sm text-gray-600 ">
                  If you close your account, your account will be closed permanently. You will not be able to login with this account. In addition, all the secondary seller accounts will also be closed.
                </p>

                <div className="bg-sky-50 border border-sky-100 p-6 rounded-lg">
                  <p className="text-sm text-sky-800  leading-relaxed">
                    You are advised to check and validate your bank account detail before closing your seller account at GeM. The bank account details cannot be updated once the account is closed which may hamper refund of the caution money.
                  </p>
                </div>

                <div className="flex items-center justify-between pt-8">
                  <p className="text-sm font-medium text-gray-700 ">To close your account permanently click on</p>
                  <Button onClick={handleCloseAccount} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 h-12 uppercase tracking-widest text-xs  shadow-lg shadow-blue-100">
                    {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'CLOSE ACCOUNT'}
                  </Button>
                </div>
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
