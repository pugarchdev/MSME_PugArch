import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { api } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/input';
import { 
  Building2,
  MapPin,
  CreditCard,
  User,
  Shield,
  Users,
  Settings,
  Bell,
  Trash2,
  ChevronRight,
  Save,
  CheckCircle2,
  Menu,
  X,
  Phone,
  Mail,
  Lock,
  ExternalLink,
  Plus,
  ShoppingBag
} from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { MSME_TYPES } from '../constants/dropdowns';

const SIDEBAR_NAV = [
  { id: 'address', label: 'Organisation Address', icon: MapPin },
  // { id: 'hierarchy', label: 'Organisation Hierarchy', icon: Users },
  // { id: 'team', label: 'Secondary Users / Roles', icon: Shield },
  // { id: 'bank', label: 'Bank Account Detail', icon: Building2 },
  // { id: 'personal', label: 'Personal Information', icon: User },
  { id: 'mobile', label: 'Update Mobile', icon: Phone },
  { id: 'email', label: 'Change Email', icon: Mail },
  { id: 'password', label: 'Change Password', icon: Lock },
  { id: 'deactivate', label: 'Deactivate Account', icon: Trash2 },
];

export default function BuyerProfile() {
  const { user, refreshUser } = useAuth();
  const [activeSection, setActiveSection] = useState('address');
  const [profile, setProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [personalOtp, setPersonalOtp] = useState('');
  const [personalOtpSent, setPersonalOtpSent] = useState(false);
  const [emailOtp, setEmailOtp] = useState('');
  const [emailOtpSent, setEmailOtpSent] = useState(false);
  const [isSendingEmailOtp, setIsSendingEmailOtp] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleFieldChange = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (formErrors[field]) {
      setFormErrors(prev => {
        const copy = { ...prev };
        delete copy[field];
        return copy;
      });
    }
  };

  const [formData, setFormData] = useState({
    pincode: '',
    state: '',
    district: '',
    streetAddress: '',
    stdCode: '',
    officeContact: '',
    extensionNo: '',
    websiteUrl: '',
    // Bank Account Details
    ifscCode: '',
    bankName: '',
    bankAddress: '',
    bankAccountNo: '',
    confirmBankAccountNo: '',
    accountHolderName: '',
    // Personal Information
    firstName: '',
    lastName: '',
    designation: '',
    dateOfRetirement: '',
    nameAsInPan: '',
    orgPan: '',
    dateAsInPan: '',
    registeredForGst: 'no',
    gstNotLiable: false,
    // Referral Verification
    competentAuthorityEmail: '',
    verifyingFirstName: '',
    verifyingLastName: '',
    verifyingEmail: '',
    verifyingMobile: '',
    verifyingDesignation: '',
    // Update Mobile
    aadhaarMobile: '',
    aadhaarConsent: false,
    // Change Email
    newEmail: '',
    verifyEmail: '',
    // Deactivate
    deactivateConsent: false,
    // Hierarchy
    ministry: '',
    division: '',
    employeeCount: '',
    organizationType: '',
    msmeType: '',
    // Team
    secondaryUsers: [] as any[]
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const token = localStorage.getItem('token');
        if (!token) return;

        const res = await api.fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${token}` }
        });
        
        if (res.ok) {
          const data = await res.json();
          setProfile(data.profile);
          if (data.profile) {
            setFormData(prev => ({
              ...prev,
              pincode: data.profile.pincode || '',
              state: data.profile.state || '',
              district: data.profile.district || '',
              streetAddress: data.profile.registeredAddress || '',
              stdCode: data.profile.stdCode || '',
              officeContact: data.profile.officeContact || data.profile.mobile || '',
              extensionNo: data.profile.extensionNo || '',
              websiteUrl: data.profile.website || '',
              msmeType: data.profile.msmeType || '',
              organizationType: data.profile.organizationType || '',
              ministry: data.profile.ministry || '',
              division: data.profile.division || '',
              employeeCount: data.profile.employeeCount || '',
              // Bank details
              ifscCode: data.profile.bankIfsc || '',
              bankName: data.profile.bankName || '',
              bankAddress: data.profile.bankAddress || '',
              bankAccountNo: data.profile.bankAccountNo || '',
              confirmBankAccountNo: data.profile.bankAccountNo || '',
              accountHolderName: data.profile.accountHolderName || '',
              // Personal details
              firstName: data.user?.name?.split(' ')[0] || '',
              lastName: data.user?.name?.split(' ').slice(1).join(' ') || '',
              designation: data.profile.designation || '',
              dateOfRetirement: data.profile.dateOfRetirement || '',
              nameAsInPan: data.profile.nameAsInPan || '',
              orgPan: data.profile.pan || '',
              dateAsInPan: data.profile.dateAsInPan || '',
              registeredForGst: data.profile.gst ? 'yes' : 'no',
              gstNotLiable: !data.profile.gst,
              // Referral details
              competentAuthorityEmail: data.profile.competentAuthorityEmail || '',
              verifyingFirstName: data.profile.verifyingFirstName || '',
              verifyingLastName: data.profile.verifyingLastName || '',
              verifyingEmail: data.profile.verifyingEmail || '',
              verifyingMobile: data.profile.verifyingMobile || '',
              verifyingDesignation: data.profile.verifyingDesignation || '',
              // Aadhaar mobile
              aadhaarMobile: '',
              aadhaarConsent: false,
              // Change Email
              newEmail: '',
              verifyEmail: ''
            }));
          }
        }
      } catch (err) {
        console.error('Failed to fetch profile', err);
      } finally {
        setLoading(false);
      }
    };
    fetchProfile();
  }, []);

  const handleGetPersonalOtp = async () => {
    const errors: Record<string, string> = {};
    if (!formData.firstName.trim()) errors.firstName = 'First name is required';
    if (!formData.lastName.trim()) errors.lastName = 'Last name is required';
    if (!formData.designation.trim()) errors.designation = 'Designation is required';
    if (!formData.dateOfRetirement.trim()) errors.dateOfRetirement = 'Date of retirement is required';
    if (!formData.nameAsInPan.trim()) errors.nameAsInPan = 'Name as in PAN is required';
    if (!formData.orgPan.trim()) errors.orgPan = 'Organisation PAN is required';
    if (!formData.dateAsInPan.trim()) errors.dateAsInPan = 'Date as in PAN is required';

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSendingOtp(true);
    try {
      const res = await api.fetch('/api/buyer/onboarding/send-otp', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        toast.success('OTP sent to your registered email');
        setPersonalOtpSent(true);
      } else {
        const body = await res.json().catch(() => null);
        toast.error(body?.message || 'Failed to send OTP');
      }
    } catch (err) {
      toast.error('Failed to send OTP');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const validateEmailChange = () => {
    const newEmail = formData.newEmail.trim().toLowerCase();
    const verifyEmail = formData.verifyEmail.trim().toLowerCase();
    const errors: Record<string, string> = {};
    if (!newEmail) errors.newEmail = 'New email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) errors.newEmail = 'Enter a valid email address';
    if (!verifyEmail) errors.verifyEmail = 'Confirm the new email';
    else if (newEmail !== verifyEmail) errors.verifyEmail = 'Email addresses do not match';
    if (user?.email?.toLowerCase() === newEmail) errors.newEmail = 'New email must be different from current email';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSendEmailOtp = async () => {
    if (!validateEmailChange()) return;

    setIsSendingEmailOtp(true);
    try {
      const res = await api.fetch('/api/buyer/settings/change-email/send-otp', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: formData.newEmail.trim().toLowerCase() })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || 'Failed to send OTP');

      setEmailOtpSent(true);
      setEmailOtp('');
      if (body?.data?.deliveryConfigured === false) {
        toast.warning('OTP generated, but email delivery is not configured. Check backend console/SMTP settings.');
      } else {
        toast.success('OTP sent to new email ID');
      }
    } catch (err: any) {
      toast.error(err?.message || 'Failed to send OTP');
    } finally {
      setIsSendingEmailOtp(false);
    }
  };

  const handleChangeEmail = async () => {
    if (!validateEmailChange()) return;
    if (!emailOtp.trim()) {
      setFormErrors(prev => ({ ...prev, emailOtp: 'Enter the OTP sent to the new email' }));
      return;
    }

    setIsSaving(true);
    try {
      const res = await api.fetch('/api/buyer/settings/change-email', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token')}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          newEmail: formData.newEmail.trim().toLowerCase(),
          otp: emailOtp.trim()
        })
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.message || 'Failed to update email');

      toast.success('Email updated successfully');
      setEmailOtp('');
      setEmailOtpSent(false);
      setFormData(prev => ({ ...prev, newEmail: '', verifyEmail: '' }));
      await refreshUser();
    } catch (err: any) {
      toast.error(err?.message || 'Failed to update email');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: any = {
        pincode: formData.pincode,
        state: formData.state,
        district: formData.district,
        registeredAddress: formData.streetAddress,
        website: formData.websiteUrl,
        stdCode: formData.stdCode,
        officeContact: formData.officeContact,
        extensionNo: formData.extensionNo
      };

      if (activeSection === 'bank') {
        const errors: Record<string, string> = {};
        const cleanIfsc = formData.ifscCode.trim().toUpperCase();
        const cleanAccountNo = formData.bankAccountNo.trim();
        const cleanConfirmAccountNo = formData.confirmBankAccountNo.trim();
        const cleanBankName = formData.bankName.trim();
        const cleanBankAddress = formData.bankAddress.trim();
        const cleanAccountHolder = formData.accountHolderName.trim();

        if (!cleanIfsc) {
          errors.ifscCode = 'IFSC code is required';
        } else {
          const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
          if (!ifscRegex.test(cleanIfsc)) {
            errors.ifscCode = 'Invalid IFSC code format (e.g. SBIN0001234)';
          }
        }

        if (!cleanAccountNo) {
          errors.bankAccountNo = 'Bank account number is required';
        } else {
          const accRegex = /^\d{9,18}$/;
          if (!accRegex.test(cleanAccountNo)) {
            errors.bankAccountNo = 'Bank account number must be between 9 and 18 digits';
          }
        }

        if (!cleanConfirmAccountNo) {
          errors.confirmBankAccountNo = 'Please confirm bank account number';
        } else if (cleanAccountNo !== cleanConfirmAccountNo) {
          errors.confirmBankAccountNo = 'Account numbers do not match';
        }

        if (!cleanBankName) {
          errors.bankName = 'Bank name is required';
        } else if (cleanBankName.length < 3 || cleanBankName.length > 100 || !/[a-zA-Z]/.test(cleanBankName)) {
          errors.bankName = 'Bank name must be between 3 and 100 characters and contain letters';
        }

        if (!cleanAccountHolder) {
          errors.accountHolderName = 'Account holder name is required';
        } else if (cleanAccountHolder.length < 3 || cleanAccountHolder.length > 100 || !/[a-zA-Z]/.test(cleanAccountHolder)) {
          errors.accountHolderName = 'Account holder name must be between 3 and 100 characters and contain letters';
        }

        if (!cleanBankAddress) {
          errors.bankAddress = 'Bank address is required';
        } else if (cleanBankAddress.length < 10 || cleanBankAddress.length > 250) {
          errors.bankAddress = 'Bank address must be between 10 and 250 characters';
        }

        if (Object.keys(errors).length > 0) {
          setFormErrors(errors);
          setIsSaving(false);
          return;
        }

        setFormErrors({});

        payload.bankIfsc = cleanIfsc;
        payload.bankName = cleanBankName;
        payload.bankAddress = cleanBankAddress;
        payload.bankAccountNo = cleanAccountNo;
        payload.accountHolderName = cleanAccountHolder;
      }

      if (activeSection === 'personal') {
        if (!personalOtpSent) {
          setIsSaving(false);
          await handleGetPersonalOtp();
          return;
        }
        if (!personalOtp.trim()) {
          setFormErrors({ personalOtp: 'Please enter the OTP' });
          setIsSaving(false);
          return;
        }
        payload.otp = personalOtp;
        payload.representativeName = `${formData.firstName} ${formData.lastName}`.trim();
        payload.designation = formData.designation;
        payload.dateOfRetirement = formData.dateOfRetirement;
        payload.nameAsInPan = formData.nameAsInPan;
        payload.pan = formData.orgPan;
        payload.dateAsInPan = formData.dateAsInPan;
        payload.gst = formData.registeredForGst === 'yes' ? (profile?.gst || 'PENDING') : '';
      }

      if (activeSection === 'referral') {
        payload.competentAuthorityEmail = formData.competentAuthorityEmail;
        payload.verifyingFirstName = formData.verifyingFirstName;
        payload.verifyingLastName = formData.verifyingLastName;
        payload.verifyingEmail = formData.verifyingEmail;
        payload.verifyingMobile = formData.verifyingMobile;
        payload.verifyingDesignation = formData.verifyingDesignation;
        payload.email = formData.competentAuthorityEmail || formData.verifyingEmail || profile?.email || '';
      }

      if (activeSection === 'mobile') {
        if (!formData.aadhaarConsent) {
          toast.error('Please provide your consent to update mobile number');
          setIsSaving(false);
          return;
        }
        payload.mobile = formData.aadhaarMobile;
      }

      if (activeSection === 'email') {
        setIsSaving(false);
        await handleSendEmailOtp();
        return;
      }

      // Enrich payload with GeM-specific fields
      payload.organizationType = formData.organizationType;
      payload.ministry = formData.ministry;
      payload.division = formData.division;
      payload.employeeCount = formData.employeeCount;
      payload.msmeType = formData.msmeType;
      
      const res = await api.put('/api/buyer/onboarding', payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (res.ok) {
        const body = await res.json().catch(() => null);
        setProfile(body?.data || body || profile);
        toast.success(`${activeSection === 'bank' ? 'Bank details' : 'Profile'} updated successfully`);
        if (activeSection === 'personal') {
          setPersonalOtp('');
          setPersonalOtpSent(false);
        }
        await refreshUser();
      } else {
        const body = await res.json().catch(() => null);
        const errMsg = body?.message || 'Failed to update details';
        
        // Map backend validation errors to formErrors to highlight fields inline
        const lowercaseMsg = errMsg.toLowerCase();
        if (lowercaseMsg.includes('ifsc')) {
          setFormErrors(prev => ({ ...prev, ifscCode: errMsg }));
        } else if (lowercaseMsg.includes('account number') || lowercaseMsg.includes('bank account no')) {
          setFormErrors(prev => ({ ...prev, bankAccountNo: errMsg }));
        } else if (lowercaseMsg.includes('bank name')) {
          setFormErrors(prev => ({ ...prev, bankName: errMsg }));
        } else if (lowercaseMsg.includes('account holder')) {
          setFormErrors(prev => ({ ...prev, accountHolderName: errMsg }));
        } else if (lowercaseMsg.includes('bank address')) {
          setFormErrors(prev => ({ ...prev, bankAddress: errMsg }));
        } else if (lowercaseMsg.includes('otp')) {
          setFormErrors(prev => ({ ...prev, personalOtp: errMsg }));
        } else {
          toast.error(errMsg);
        }
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[400px] items-center justify-center">
        <Loader2 className="h-10 w-10 shadow-xl shadow-blue-500/20" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col md:flex-row">
      {/* Sidebar - Mobile Toggle */}
      <div className="md:hidden bg-white border-b border-slate-200 p-4 flex items-center justify-between">
        <h2 className="text-sm font-black uppercase tracking-widest text-slate-900 ">Account Settings</h2>
        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="p-2 text-slate-600 hover:bg-slate-50 rounded-xl">
          {isSidebarOpen ? <X /> : <Menu />}
        </button>
      </div>

      {/* Sidebar Navigation */}
      <aside className={cn(
        "w-full md:w-72 bg-white border-r border-slate-200 shrink-0 transition-all md:static fixed inset-0 z-50 md:translate-x-0",
        isSidebarOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="p-6 border-b border-slate-100 flex items-center justify-between">
          <h2 className="hidden md:block text-xs font-black uppercase tracking-widest text-slate-400 ">User Profile</h2>
          <button onClick={() => setIsSidebarOpen(false)} className="md:hidden p-2 text-slate-400">
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="p-2 space-y-0.5 max-h-[calc(100vh-80px)] overflow-y-auto no-scrollbar">
          {SIDEBAR_NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setActiveSection(item.id);
                setIsSidebarOpen(false);
                setPersonalOtp('');
                setPersonalOtpSent(false);
                setFormErrors({});
              }}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left group",
                activeSection === item.id 
                  ? "bg-[#12335f]/5 text-[#12335f] shadow-sm border border-[#12335f]/10" 
                  : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
              )}
            >
              <item.icon className={cn("h-4 w-4 shrink-0", activeSection === item.id ? "text-[#12335f]" : "text-slate-400 group-hover:text-slate-600")} />
              <span className="text-xs font-bold truncate">{item.label}</span>
              {activeSection === item.id && <ChevronRight className="ml-auto h-3 w-3 opacity-50" />}
            </button>
          ))}
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 p-4 sm:p-6 md:p-6 max-w-5xl mx-auto w-full">
        <div className="mb-4 flex flex-col md:flex-row md:items-end justify-between gap-6">
          <div>
            <p className="text-[10px] font-black text-[#12335f] uppercase tracking-[0.2em]  mb-1">Buyer Settings</p>
            <h1 className="text-2xl font-black text-slate-900 uppercase tracking-tighter">
              {SIDEBAR_NAV.find(s => s.id === activeSection)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-3 bg-white p-2.5 rounded-2xl border border-slate-100 shadow-sm">
             <div className="h-10 w-10 rounded-xl bg-slate-900 flex items-center justify-center text-white font-black text-sm">
               {user?.name?.charAt(0)}
             </div>
             <div className="pr-4">
               <p className="text-[10px] font-black text-slate-900 uppercase  leading-none">{user?.name}</p>
               <p className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-1">ID: {profile?.pan || user?.id}</p>
             </div>
          </div>
        </div>

        <Card className="rounded-[2.5rem] border-none shadow-2xl shadow-slate-200/50 overflow-hidden bg-white">
          <CardContent className="p-5 sm:p-6 md:p-8">
            {activeSection === 'hierarchy' && (
              <div className="space-y-4 animate-in fade-in duration-500">
                <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                  <h3 className="text-lg font-black text-slate-900 uppercase ">Organisation Hierarchy</h3>
                  
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Select 
                    label="Type of Organisation *" 
                    value={formData.organizationType}
                    onChange={(e) => handleFieldChange('organizationType', e.target.value)}
                    error={formErrors.organizationType}
                  >
                    <option value="central">Central Government</option>
                    <option value="state">State Government</option>
                    <option value="psu">PSU</option>
                    <option value="autonomous">Autonomous Body</option>
                    <option value="local">Local Body</option>
                  </Select>
                  <Select 
                    label="MSME Type *" 
                    value={formData.msmeType}
                    onChange={(e) => handleFieldChange('msmeType', e.target.value)}
                    error={formErrors.msmeType}
                  >
                    <option value="">Select MSME Type</option>
                    {MSME_TYPES.map(t => (
                      <option key={t.value} value={t.value}>{t.label}</option>
                    ))}
                  </Select>
                  <Input 
                    label="Ministry/Department *" 
                    value={formData.ministry} 
                    onChange={(e) => handleFieldChange('ministry', e.target.value)}
                    placeholder="Enter Ministry name"
                    error={formErrors.ministry}
                  />
                  <Input 
                    label="Division *" 
                    value={formData.division} 
                    onChange={(e) => handleFieldChange('division', e.target.value)}
                    placeholder="Enter Division name"
                    error={formErrors.division}
                  />
                  <Input 
                    label="Number of Employees *" 
                    type="number"
                    value={formData.employeeCount} 
                    onChange={(e) => handleFieldChange('employeeCount', e.target.value)}
                    placeholder="e.g. 150"
                    error={formErrors.employeeCount}
                  />
                </div>

                <div className="bg-slate-50 rounded-3xl p-8 border border-slate-100 space-y-4">
                   <div className="flex items-center gap-3">
                      <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center text-indigo-600 shadow-sm">
                         <Shield className="h-5 w-5" />
                      </div>
                      <h4 className="text-sm font-black text-slate-900 uppercase ">Primary User (HOD)</h4>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Full Name</p>
                         <p className="text-xs font-bold text-slate-700">{user?.name}</p>
                      </div>
                      <div>
                         <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Designation</p>
                         <p className="text-xs font-bold text-slate-700">{profile?.designation || 'Head of Department'}</p>
                      </div>
                   </div>
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                   <Button onClick={handleSave} disabled={isSaving} className="bg-slate-900 hover:bg-black text-white font-black uppercase  text-xs tracking-[0.2em] h-14 px-10 rounded-2xl shadow-xl shadow-slate-200">
                      Save Hierarchy
                   </Button>
                </div>
              </div>
            )}

            {activeSection === 'team' && (
              <div className="space-y-2 animate-in fade-in duration-500">
                <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                  <h3 className="text-lg font-black text-slate-900 uppercase ">Secondary Users / Roles</h3>
                  <Button className="bg-indigo-600 hover:bg-indigo-700 text-white font-black uppercase  text-[10px] tracking-widest h-10 px-6 rounded-xl shadow-lg shadow-indigo-100 flex items-center gap-2">
                    <Plus className="h-3.5 w-3.5" />
                    Add User
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {[
                    { role: 'Buyer', desc: 'Can select items and create bids', icon: ShoppingBag, color: 'text-[#12335f]', bg: 'bg-[#12335f]/5' },
                    { role: 'Consignee', desc: 'Can receive and accept consignments', icon: MapPin, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                    { role: 'DDO / Paying Authority', desc: 'Can process payments and approvals', icon: CreditCard, color: 'text-amber-600', bg: 'bg-amber-50' },
                    { role: 'Technical Evaluator', desc: 'Can evaluate technical bid parameters', icon: Shield, color: 'text-indigo-600', bg: 'bg-slate-100' }
                  ].map((role) => (
                    <div key={role.role} className="p-6 rounded-3xl border border-slate-100 bg-white hover:shadow-xl hover:-translate-y-1 transition-all group">
                       <div className="flex items-start gap-4">
                          <div className={cn("h-12 w-12 rounded-2xl flex items-center justify-center shrink-0 transition-transform group-hover:scale-110", role.bg, role.color)}>
                             <role.icon className="h-5 w-5" />
                          </div>
                          <div className="space-y-1">
                             <h4 className="text-sm font-black text-slate-900 uppercase ">{role.role}</h4>
                             <p className="text-[11px] text-slate-500 font-medium  leading-relaxed">{role.desc}</p>
                             <div className="pt-2 flex items-center gap-2">
                                <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />
                                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">0 Active Users</p>
                             </div>
                          </div>
                       </div>
                    </div>
                  ))}
                </div>
                
                <div className="bg-amber-50 rounded-3xl p-8 border border-amber-100 space-y-3">
                   <div className="flex items-center gap-2 text-amber-700">
                      <Lock className="h-4 w-4" />
                      <p className="text-[10px] font-black uppercase tracking-widest">Security Protocol</p>
                   </div>
                   <p className="text-xs font-semibold text-amber-900  leading-relaxed">
                     Secondary users must verify their identity using an Aadhaar-linked mobile number before they can access assigned roles.
                   </p>
                </div>
              </div>
            )}

            {activeSection === 'address' && (
              <div className="space-y-2 animate-in fade-in duration-500">
                <div className="flex items-center justify-between border-b border-slate-50 pb-0">
                  <h3 className="text-lg font-black text-slate-900 uppercase ">Update Address</h3>
                  <Badge className="bg-[#12335f]/5 text-[#12335f] border-[#12335f]/10 rounded-lg px-4 py-1 text-[9px] font-black ">PRIMARY OFFICE</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                  <div className="space-y-6">
                    <Input 
                      label="Pincode *" 
                      value={formData.pincode} 
                      onChange={(e) => handleFieldChange('pincode', e.target.value)}
                      placeholder="e.g. 411030"
                      error={formErrors.pincode}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="State *" 
                      value={formData.state} 
                      onChange={(e) => handleFieldChange('state', e.target.value)}
                      placeholder="MAHARASHTRA"
                      error={formErrors.state}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="District *" 
                      value={formData.district} 
                      onChange={(e) => handleFieldChange('district', e.target.value)}
                      placeholder="Pune"
                      error={formErrors.district}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider ml-1">Street Address *</label>
                      <textarea 
                        value={formData.streetAddress}
                        onChange={(e) => handleFieldChange('streetAddress', e.target.value)}
                        placeholder="Enter full street address"
                        rows={5}
                        className={cn(
                          "w-full rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#12335f]/20 transition-all resize-none",
                          formErrors.streetAddress && "border-red-500 focus:ring-red-500 bg-red-50/30"
                        )}
                      />
                      {formErrors.streetAddress && (
                        <p className="text-xs text-red-500 mt-1">{formErrors.streetAddress}</p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider ml-1">Contact No. (Office) * <span className="text-slate-300 font-medium ml-2">ⓘ</span></label>
                  <div className="grid grid-cols-3 gap-4">
                    <Input 
                      placeholder="STD code" 
                      value={formData.stdCode}
                      onChange={(e) => handleFieldChange('stdCode', e.target.value)}
                      error={formErrors.stdCode}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      placeholder="Office Contact No." 
                      value={formData.officeContact}
                      onChange={(e) => handleFieldChange('officeContact', e.target.value)}
                      error={formErrors.officeContact}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      placeholder="Extension No." 
                      value={formData.extensionNo}
                      onChange={(e) => handleFieldChange('extensionNo', e.target.value)}
                      error={formErrors.extensionNo}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <Input 
                    label="Website URL *" 
                    value={formData.websiteUrl}
                    onChange={(e) => handleFieldChange('websiteUrl', e.target.value)}
                    placeholder="WWW.GEMEXPERT.COM"
                    error={formErrors.websiteUrl}
                    className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                  />
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                   <Button 
                     onClick={handleSave}
                     disabled={isSaving}
                     className="bg-[#12335f] hover:bg-slate-800 text-white font-black uppercase  text-xs tracking-[0.2em] h-14 px-10 rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-[0.98]"
                   >
                     {isSaving ? 'Processing...' : 'Save Changes'}
                   </Button>
                </div>
              </div>
            )}

            {activeSection === 'bank' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                  <h3 className="text-lg font-black text-slate-900 uppercase ">Bank Account Details</h3>
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 rounded-lg px-4 py-1 text-[9px] font-black ">VERIFIED SETTLEMENT</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                  <div className="space-y-6">
                    <Input 
                      label="IFSC Code *" 
                      value={formData.ifscCode} 
                      onChange={(e) => handleFieldChange('ifscCode', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))}
                      placeholder="e.g. SBIN0001234"
                      error={formErrors.ifscCode}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Bank Name *" 
                      value={formData.bankName} 
                      onChange={(e) => handleFieldChange('bankName', e.target.value.slice(0, 100))}
                      placeholder="STATE BANK OF INDIA"
                      error={formErrors.bankName}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider ml-1">Bank Address *</label>
                      <textarea 
                        value={formData.bankAddress}
                        onChange={(e) => handleFieldChange('bankAddress', e.target.value.slice(0, 250))}
                        placeholder="Enter full bank branch address"
                        rows={3}
                        className={cn(
                          "w-full rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none",
                          formErrors.bankAddress && "border-red-500 focus:ring-red-500 bg-red-50/30"
                        )}
                      />
                      {formErrors.bankAddress && (
                        <p className="text-xs text-red-500 mt-1">{formErrors.bankAddress}</p>
                      )}
                    </div>
                  </div>

                  <div className="space-y-6">
                    <Input 
                      label="Bank Account No *" 
                      type="password"
                      value={formData.bankAccountNo} 
                      onChange={(e) => handleFieldChange('bankAccountNo', e.target.value.replace(/\D/g, '').slice(0, 18))}
                      placeholder="••••••••••••"
                      error={formErrors.bankAccountNo}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Confirm Bank Account No *" 
                      value={formData.confirmBankAccountNo} 
                      onChange={(e) => handleFieldChange('confirmBankAccountNo', e.target.value.replace(/\D/g, '').slice(0, 18))}
                      placeholder="Enter account number again"
                      error={formErrors.confirmBankAccountNo}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Account Holder Name *" 
                      value={formData.accountHolderName} 
                      onChange={(e) => handleFieldChange('accountHolderName', e.target.value.slice(0, 100))}
                      placeholder="AS PER BANK RECORDS"
                      error={formErrors.accountHolderName}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                   <Button 
                     onClick={handleSave}
                     disabled={isSaving}
                     className="bg-slate-900 hover:bg-black text-white font-black uppercase  text-xs tracking-[0.2em] h-14 px-10 rounded-2xl shadow-xl shadow-slate-200 transition-all active:scale-[0.98]"
                   >
                     {isSaving ? 'Processing...' : 'Save Bank Details'}
                   </Button>
                </div>
              </div>
            )}

            {activeSection === 'personal' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                  <h3 className="text-lg font-black text-slate-900 uppercase ">Personal Information</h3>
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200 rounded-lg px-4 py-1 text-[9px] font-black ">SECURE IDENTITY</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                  <div className="space-y-6">
                    <Input 
                      label="First Name" 
                      value={formData.firstName} 
                      onChange={(e) => handleFieldChange('firstName', e.target.value)}
                      placeholder="e.g. Sampati"
                      error={formErrors.firstName}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Last Name *" 
                      value={formData.lastName} 
                      onChange={(e) => handleFieldChange('lastName', e.target.value)}
                      placeholder="e.g. Ingale"
                      error={formErrors.lastName}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Designation *" 
                      value={formData.designation} 
                      onChange={(e) => handleFieldChange('designation', e.target.value)}
                      placeholder="e.g. Primary User"
                      error={formErrors.designation}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Date of Retirement *" 
                      type="date"
                      value={formData.dateOfRetirement} 
                      onChange={(e) => handleFieldChange('dateOfRetirement', e.target.value)}
                      error={formErrors.dateOfRetirement}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="space-y-6">
                    <Input 
                      label="Name ( As in PAN ) *" 
                      value={formData.nameAsInPan} 
                      onChange={(e) => handleFieldChange('nameAsInPan', e.target.value)}
                      placeholder="ENTER FULL NAME"
                      error={formErrors.nameAsInPan}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Organisation PAN *" 
                      value={formData.orgPan} 
                      onChange={(e) => handleFieldChange('orgPan', e.target.value)}
                      placeholder="ABCDE1234F"
                      error={formErrors.orgPan}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Date (As in Pan) *" 
                      type="date"
                      value={formData.dateAsInPan} 
                      onChange={(e) => handleFieldChange('dateAsInPan', e.target.value)}
                      error={formErrors.dateAsInPan}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />

                    <div className="space-y-4 pt-2">
                       <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider ml-1">Are you registered for GST? *</p>
                       <div className="flex items-center gap-8">
                          <label className="flex items-center gap-2 cursor-pointer group">
                             <input 
                               type="radio" 
                               name="gst" 
                               value="yes"
                               checked={formData.registeredForGst === 'yes'}
                               onChange={() => setFormData({...formData, registeredForGst: 'yes'})}
                               className="w-4 h-4 text-[#12335f] border-slate-300 focus:ring-[#12335f]/20"
                             />
                             <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-colors">Yes</span>
                          </label>
                          <label className="flex items-center gap-2 cursor-pointer group">
                             <input 
                               type="radio" 
                               name="gst" 
                               value="no"
                               checked={formData.registeredForGst === 'no'}
                               onChange={() => setFormData({...formData, registeredForGst: 'no'})}
                               className="w-4 h-4 text-[#12335f] border-slate-300 focus:ring-[#12335f]/20"
                             />
                             <span className="text-xs font-bold text-slate-700 group-hover:text-slate-900 transition-colors">No</span>
                          </label>
                       </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-6 rounded-2xl flex items-start gap-4 group cursor-pointer" onClick={() => setFormData({...formData, gstNotLiable: !formData.gstNotLiable})}>
                   <input 
                     type="checkbox" 
                     checked={formData.gstNotLiable}
                     onChange={() => {}} 
                     className="mt-1 w-4 h-4 text-[#12335f] rounded border-slate-300"
                   />
                   <p className="text-xs font-medium text-slate-600 leading-relaxed  group-hover:text-slate-900 transition-colors">
                     I hereby declare that I am not liable to be registered under the ambit of GST.
                   </p>
                </div>

                <div className="bg-[#12335f]/5 border border-[#12335f]/10 p-6 rounded-3xl flex items-start gap-4">
                   <div className="h-10 w-10 bg-white rounded-xl flex items-center justify-center text-[#12335f] shadow-sm shrink-0">
                      <Shield className="h-5 w-5" />
                   </div>
                   <div className="space-y-1">
                      <p className="text-[10px] font-black uppercase text-[#12335f] tracking-widest leading-none">Security Verification Protocol</p>
                      <p className="text-xs font-semibold text-slate-600 leading-relaxed pt-1">
                         To authorize modifications to your Personal Information, an OTP will be sent to your registered email. After you enter the OTP, click verify to automatically update and save the changes.
                      </p>
                   </div>
                </div>

                {personalOtpSent && (
                  <div className="max-w-md pt-4 animate-in fade-in duration-300">
                    <Input 
                      label="Enter Email OTP *" 
                      placeholder="Enter 6-digit OTP sent to email"
                      value={personalOtp}
                      onChange={(e) => {
                        setPersonalOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                        if (formErrors.personalOtp) {
                          setFormErrors(prev => {
                            const copy = { ...prev };
                            delete copy.personalOtp;
                            return copy;
                          });
                        }
                      }}
                      error={formErrors.personalOtp}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <p className="text-[11px] text-slate-400 font-medium mt-2 ml-1">
                      Enter the 6-digit OTP sent to your registered email to automatically verify and save your changes.
                    </p>
                  </div>
                )}

                <div className="pt-6 border-t border-slate-50 flex justify-end gap-4">
                   {personalOtpSent && (
                     <Button 
                       onClick={handleGetPersonalOtp}
                       disabled={isSendingOtp || isSaving}
                       variant="outline"
                       className="border border-slate-200 text-[#12335f] hover:bg-slate-50 font-black uppercase text-xs tracking-wider h-14 px-8 rounded-2xl transition-all"
                     >
                       {isSendingOtp ? 'Sending...' : 'Resend OTP'}
                     </Button>
                   )}
                   <Button 
                     onClick={handleSave}
                     disabled={isSaving || isSendingOtp || (personalOtpSent && !personalOtp)}
                     className="bg-[#12335f] hover:bg-slate-800 text-white font-black uppercase text-xs tracking-[0.2em] h-14 px-10 rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-[0.98]"
                   >
                     {isSaving ? 'Processing...' : personalOtpSent ? 'Verify & Save' : 'Save Personal Info'}
                   </Button>
                </div>
              </div>
            )}

            {activeSection === 'referral' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="space-y-8">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                    <h3 className="text-lg font-black text-slate-900 uppercase ">Competent Authority Details</h3>
                    <Badge className="bg-[#12335f]/5 text-[#12335f] border-[#12335f]/10 rounded-lg px-4 py-1 text-[9px] font-black ">APPROVAL CHAIN</Badge>
                  </div>
                  
                  <div className="max-w-xl">
                    <Input 
                      label="Competent Authority Email *" 
                      value={formData.competentAuthorityEmail} 
                      onChange={(e) => handleFieldChange('competentAuthorityEmail', e.target.value)}
                      placeholder="e.g. secy.dhe@nic.in"
                      error={formErrors.competentAuthorityEmail}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                    <h3 className="text-lg font-black text-slate-900 uppercase ">Verifying Authority Details</h3>
                    <Badge className="bg-amber-50 text-amber-700 border-amber-100 rounded-lg px-4 py-1 text-[9px] font-black ">COMPLIANCE REVIEW</Badge>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-12 gap-y-8">
                    <Input 
                      label="First Name *" 
                      value={formData.verifyingFirstName} 
                      onChange={(e) => handleFieldChange('verifyingFirstName', e.target.value)}
                      placeholder="DATTATRAY"
                      error={formErrors.verifyingFirstName}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Last Name *" 
                      value={formData.verifyingLastName} 
                      onChange={(e) => handleFieldChange('verifyingLastName', e.target.value)}
                      placeholder="INGALE"
                      error={formErrors.verifyingLastName}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <div className="space-y-1">
                      <Input 
                        label="Email (Official) *" 
                        value={formData.verifyingEmail} 
                        onChange={(e) => handleFieldChange('verifyingEmail', e.target.value)}
                        placeholder="buycon5.gpmp.mh@gembuyer.in"
                        error={formErrors.verifyingEmail}
                        className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                      />
                      <p className="text-[10px] text-slate-400 font-medium  ml-1">Secondary email must be registered with NIC/GeM.</p>
                    </div>
                    <Input 
                      label="Mobile (Official) *" 
                      value={formData.verifyingMobile} 
                      onChange={(e) => handleFieldChange('verifyingMobile', e.target.value)}
                      placeholder="9763982676"
                      error={formErrors.verifyingMobile}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <div className="md:col-span-2 max-w-xl">
                      <Input 
                        label="Designation *" 
                        value={formData.verifyingDesignation} 
                        onChange={(e) => handleFieldChange('verifyingDesignation', e.target.value)}
                        placeholder="OWNER"
                        error={formErrors.verifyingDesignation}
                        className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                   <Button 
                     onClick={handleSave}
                     disabled={isSaving}
                     className="bg-[#12335f] hover:bg-slate-800 text-white font-black uppercase  text-xs tracking-[0.2em] h-14 px-10 rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-[0.98]"
                   >
                     {isSaving ? 'Processing...' : 'Save Authority Details'}
                   </Button>
                </div>
              </div>
            )}

            {activeSection === 'mobile' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="space-y-8">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                    <h3 className="text-lg font-black text-slate-900 uppercase ">User Details</h3>
                    <Badge className="bg-slate-50 text-slate-700 border-slate-100 rounded-lg px-4 py-1 text-[9px] font-black ">CURRENT ACCOUNT</Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">User Id</p>
                      <p className="text-sm font-bold text-slate-700">{profile?.pan || user?.id}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Mobile</p>
                      <p className="text-sm font-bold text-slate-700">******{profile?.mobile?.slice(-4) || 'XXXX'}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                    <h3 className="text-lg font-black text-slate-900 uppercase ">Update Mobile</h3>
                    <Badge className="bg-[#12335f]/5 text-[#12335f] border-[#12335f]/10 rounded-lg px-4 py-1 text-[9px] font-black ">AADHAAR LINKED</Badge>
                  </div>

                  <div className="space-y-8">
                    <div className="max-w-xl">
                      <Input 
                        label="Mobile number linked with Aadhaar *" 
                        value={formData.aadhaarMobile} 
                        onChange={(e) => handleFieldChange('aadhaarMobile', e.target.value)}
                        placeholder="Enter mobile number linked with Aadhaar"
                        error={formErrors.aadhaarMobile}
                        className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                      />
                    </div>

                    <div className="bg-slate-50 p-6 rounded-3xl flex items-start gap-4 group cursor-pointer" onClick={() => setFormData({...formData, aadhaarConsent: !formData.aadhaarConsent})}>
                       <input 
                         type="checkbox" 
                         checked={formData.aadhaarConsent}
                         onChange={() => {}} 
                         className="mt-1 w-4 h-4 text-[#12335f] rounded border-slate-300"
                       />
                       <div className="space-y-3">
                         <p className="text-[11px] font-medium text-slate-600 leading-relaxed  group-hover:text-slate-900 transition-colors">
                           I, the holder of Aadhaar, hereby give my consent to JsgSmile Portal, for using my Aadhaar number as allotted by UIDAI for registration. JsgSmile Portal has informed me that my Aadhaar data will not be stored/shared.
                         </p>
                         <p className="text-[11px] font-medium text-slate-400 leading-relaxed ">
                           मैं, आधार का धारक, एतदद्वारा अपनी पहचान प्राधिकरण द्वारा आवंटित अपने आधार नंबर को पंजीकरण हेतु प्रयोग में लाने हेतु JsgSmile Portal को अपनी सहमति प्रदान करता हूँ। JsgSmile Portal ने मुझे अवगत कराया है कि मेरे आधार डेटा को संग्रहीत/साझा नहीं किया जाएगा।
                         </p>
                       </div>
                    </div>

                    
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                   <Button 
                     onClick={handleSave}
                     disabled={isSaving}
                     className="bg-[#12335f] hover:bg-slate-800 text-white font-black uppercase  text-xs tracking-[0.2em] h-14 px-10 rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-[0.98]"
                   >
                     {isSaving ? 'Verifying...' : 'Verify & Update'}
                   </Button>
                </div>
              </div>
            )}

            {activeSection === 'hierarchy' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                  <h3 className="text-lg font-black text-slate-900 uppercase ">Organisation Details</h3>
                  <Badge className="bg-emerald-50 text-emerald-700 border-emerald-100 rounded-lg px-4 py-1 text-[9px] font-black ">VERIFIED HIERARCHY</Badge>
                </div>

                <div className="space-y-12">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-y-8 gap-x-16">
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Organisation Type</p>
                      <p className="text-sm font-bold text-slate-700">{profile?.businessType || 'Central Government'}</p>
                    </div>
                    {profile?.msmeType && (
                      <div className="space-y-1">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">MSME Type</p>
                        <p className="text-sm font-bold text-slate-700">{profile.msmeType.replace(/_/g, ' ')}</p>
                      </div>
                    )}
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Ministry</p>
                      <p className="text-sm font-bold text-slate-700">{profile?.ministry || 'Ministry of Education'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Department</p>
                      <p className="text-sm font-bold text-slate-700">{profile?.department || 'Department of Higher Education'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Organisation</p>
                      <p className="text-sm font-bold text-slate-700">{profile?.organizationName || 'National Institute of Technology (NIT)'}</p>
                    </div>
                    <div className="space-y-1">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Office / Zone</p>
                      <p className="text-sm font-bold text-slate-700">{profile?.officeZoneName || 'National institute of technology'}</p>
                    </div>
                  </div>

                  <div className="bg-amber-50/50 border border-amber-100 p-6 rounded-3xl space-y-6">
                    <div className="flex items-center gap-3 text-amber-800">
                      <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                      <p className="text-xs font-bold ">To change your organisation hierarchy please click here</p>
                    </div>
                    <Button 
                      className="bg-[#1e67d6] hover:bg-[#1656b5] text-white font-black uppercase  text-xs tracking-wider h-14 px-10 rounded-xl shadow-lg transition-all active:scale-[0.98]"
                      onClick={() => toast.info('Hierarchy change request submitted to administrator')}
                    >
                      Change Organisation Hierarchy
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'email' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="space-y-8">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                    <h3 className="text-lg font-black text-slate-900 uppercase ">Email/Mobile</h3>
                    <Badge className="bg-slate-50 text-slate-700 border-slate-100 rounded-lg px-4 py-1 text-[9px] font-black ">CURRENT CONTACT</Badge>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">User Id</p>
                      <p className="text-sm font-bold text-slate-700">{profile?.pan || user?.id}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Email</p>
                      <p className="text-sm font-bold text-slate-700">{user?.email}</p>
                    </div>
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Mobile</p>
                      <p className="text-sm font-bold text-slate-700">******{profile?.mobile?.slice(-4) || 'XXXX'}</p>
                    </div>
                  </div>
                </div>

                <div className="space-y-8">
                  <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                    <h3 className="text-lg font-black text-slate-900 uppercase ">Change Email</h3>
                    <Badge className="bg-slate-100 text-slate-700 border-slate-200 rounded-lg px-4 py-1 text-[9px] font-black ">SECURE UPDATE</Badge>
                  </div>

                  <div className="space-y-6 max-w-2xl">
                    <Input 
                      label="Official Email Id *" 
                      value={formData.newEmail} 
                      onChange={(e) => {
                        handleFieldChange('newEmail', e.target.value);
                        setEmailOtpSent(false);
                        setEmailOtp('');
                      }}
                      placeholder="Enter Official email id"
                      error={formErrors.newEmail}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Verify Email Id *" 
                      value={formData.verifyEmail} 
                      onChange={(e) => {
                        handleFieldChange('verifyEmail', e.target.value);
                        setEmailOtpSent(false);
                        setEmailOtp('');
                      }}
                      placeholder="Verify Official email id"
                      error={formErrors.verifyEmail}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    {emailOtpSent && (
                      <Input
                        label="OTP sent to new email *"
                        value={emailOtp}
                        onChange={(e) => {
                          setEmailOtp(e.target.value.replace(/\D/g, '').slice(0, 6));
                          if (formErrors.emailOtp) {
                            setFormErrors(prev => {
                              const copy = { ...prev };
                              delete copy.emailOtp;
                              return copy;
                            });
                          }
                        }}
                        placeholder="Enter 6-digit OTP"
                        error={formErrors.emailOtp}
                        className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                      />
                    )}
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 flex flex-wrap justify-end gap-3">
                  {emailOtpSent && (
                    <Button
                      onClick={handleSendEmailOtp}
                      disabled={isSendingEmailOtp || isSaving}
                      variant="outline"
                      className="font-black uppercase text-xs tracking-[0.2em] h-14 px-8 rounded-2xl shadow-sm"
                    >
                      {isSendingEmailOtp ? 'Sending...' : 'Resend OTP'}
                    </Button>
                  )}
                   <Button 
                     onClick={emailOtpSent ? handleChangeEmail : handleSendEmailOtp}
                     disabled={isSaving || isSendingEmailOtp}
                     className="bg-slate-200 hover:bg-slate-300 text-slate-600 font-black uppercase  text-xs tracking-[0.2em] h-14 px-10 rounded-2xl shadow-sm transition-all active:scale-[0.98]"
                   >
                     {isSendingEmailOtp ? 'Sending...' : isSaving ? 'Updating...' : emailOtpSent ? 'Update Email' : 'Send OTP'}
                   </Button>
                </div>
              </div>
            )}

            {activeSection === 'deactivate' && (
              <div className="space-y-10 animate-in fade-in duration-500">
                <div className="flex items-center justify-between border-b border-slate-50 pb-6">
                  <h3 className="text-lg font-black text-slate-900 uppercase ">Deactivate Account</h3>
                  <Badge className="bg-red-50 text-red-700 border-red-100 rounded-lg px-4 py-1 text-[9px] font-black ">CRITICAL ACTION</Badge>
                </div>

                <div className="bg-red-50/50 border border-red-100 rounded-[2.5rem] p-10 space-y-8">
                  <div className="h-16 w-16 bg-red-100 text-red-600 rounded-3xl flex items-center justify-center rotate-3 shadow-lg shadow-red-200/50">
                    <Trash2 className="h-8 w-8" />
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="text-xl font-black text-slate-900 uppercase ">Are you absolutely sure?</h4>
                    <p className="text-sm font-medium text-slate-600  leading-relaxed max-w-2xl">
                      Deactivating your account will immediately suspend all active procurement activities, bids, and dashboard access. This action is <span className="text-red-600 font-bold underline">irreversible</span> through the self-service portal and may require administrative intervention to restore.
                    </p>
                  </div>

                  <div className="space-y-6 pt-4">
                    <label className="flex items-start gap-4 cursor-pointer group">
                      <div className="mt-1">
                        <input 
                          type="checkbox" 
                          checked={formData.deactivateConsent}
                          onChange={(e) => setFormData({...formData, deactivateConsent: e.target.checked})}
                          className="h-5 w-5 rounded-lg border-red-200 text-red-600 focus:ring-red-500 transition-all cursor-pointer"
                        />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-black text-slate-900 uppercase ">I understand the consequences of deactivation</p>
                        <p className="text-[10px] font-bold text-slate-400 ">I confirm that I am authorized to deactivate this organizational profile.</p>
                      </div>
                    </label>

                    <div className="pt-6 border-t border-red-100 flex justify-end">
                      <Button 
                        disabled={!formData.deactivateConsent || isSaving}
                        onClick={() => toast.error('Please contact MSME administrator for account deactivation')}
                        className={cn(
                          "h-14 px-10 rounded-2xl font-black uppercase  text-xs tracking-widest transition-all active:scale-[0.98] shadow-xl",
                          formData.deactivateConsent 
                            ? "bg-red-600 hover:bg-red-700 text-white shadow-red-200" 
                            : "bg-slate-100 text-slate-400 cursor-not-allowed border-slate-200 shadow-none"
                        )}
                      >
                        Deactivate Account
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'password' && (
              <div className="space-y-4 animate-in fade-in duration-300 min-w-0 w-full">
                <div className="flex items-center justify-between border-b border-slate-50 pb-2">
                  <h3 className="text-lg font-black text-slate-900 uppercase ">Change Password</h3>
                  <Badge className="bg-[#12335f]/5 text-[#12335f] border-[#12335f]/10 rounded-lg px-4 py-1 text-[9px] font-black ">SECURITY POLICIES</Badge>
                </div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-8 border-t border-gray-100 gap-4 mt-4">
                  <p className="text-sm font-semibold text-slate-600  max-w-xl">Please complete OTP verification, by clicking the below button to proceed with change of password.</p>
                  <Button className="bg-[#12335f] hover:bg-slate-800 text-white rounded-xl px-8 h-12 font-black uppercase  text-xs tracking-widest whitespace-nowrap shadow-lg shadow-blue-100">
                     Get OTP
                  </Button>
                </div>
              </div>
            )}

            {activeSection !== 'address' && activeSection !== 'bank' && activeSection !== 'personal' && activeSection !== 'referral' && activeSection !== 'mobile' && activeSection !== 'hierarchy' && activeSection !== 'email' && activeSection !== 'deactivate' && activeSection !== 'password' && (
              <div className="flex flex-col items-center justify-center py-20 space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="h-20 w-20 rounded-[2rem] bg-slate-50 flex items-center justify-center rotate-3 transition-transform hover:rotate-0">
                  {SIDEBAR_NAV.find(s => s.id === activeSection)?.icon && (
                    <div className="text-slate-300">
                      {React.createElement(SIDEBAR_NAV.find(s => s.id === activeSection)!.icon, { className: "h-10 w-10" })}
                    </div>
                  )}
                </div>
                <div className="text-center space-y-2">
                  <h3 className="text-xl font-black text-slate-900 uppercase ">{SIDEBAR_NAV.find(s => s.id === activeSection)?.label}</h3>
                  <p className="text-sm text-slate-400 font-medium  max-w-xs mx-auto">
                    This section is currently being synchronized with the MSME central vault. Please check back shortly.
                  </p>
                </div>
                <Button variant="outline" className="border-slate-200 text-slate-500 font-black uppercase  text-[10px] tracking-widest h-10 px-6 rounded-xl">
                  Contact Support
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

       
      </main>

      {/* Background Decorations */}
      <div className="fixed top-0 right-0 w-[800px] h-[800px] bg-[#12335f]/[0.02] rounded-full blur-[150px] -z-50 pointer-events-none" />
      <div className="fixed bottom-0 left-0 w-[800px] h-[800px] bg-indigo-600/[0.02] rounded-full blur-[150px] -z-50 pointer-events-none" />
    </div>
  );
}

function Badge({ children, className }: { children: React.ReactNode, className?: string }) {
  return (
    <span className={cn("inline-flex items-center justify-center", className)}>
      {children}
    </span>
  );
}
