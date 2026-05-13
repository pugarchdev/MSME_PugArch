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
import { cn } from '../lib/utils';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';

const SIDEBAR_NAV = [
  { id: 'address', label: 'Organisation Address', icon: MapPin },
  { id: 'hierarchy', label: 'Organisation Hierarchy', icon: Users },
  { id: 'team', label: 'Secondary Users / Roles', icon: Shield },
  { id: 'bank', label: 'Bank Account Detail', icon: Building2 },
  { id: 'personal', label: 'Personal Information', icon: User },
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
  const navigate = useNavigate();

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
            setFormData({
              pincode: data.profile.pincode || '',
              state: data.profile.state || '',
              district: data.profile.district || '',
              streetAddress: data.profile.registeredAddress || '',
              stdCode: '',
              officeContact: data.profile.mobile || '',
              extensionNo: '',
              websiteUrl: data.profile.website || '',
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
            });
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

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const payload: any = {
        ...profile,
        pincode: formData.pincode,
        state: formData.state,
        district: formData.district,
        registeredAddress: formData.streetAddress,
        website: formData.websiteUrl
      };

      if (activeSection === 'bank') {
        if (formData.bankAccountNo !== formData.confirmBankAccountNo) {
          toast.error('Account numbers do not match');
          setIsSaving(false);
          return;
        }
        payload.bankIfsc = formData.ifscCode;
        payload.bankName = formData.bankName;
        payload.bankAddress = formData.bankAddress;
        payload.bankAccountNo = formData.bankAccountNo;
        payload.accountHolderName = formData.accountHolderName;
      }

      if (activeSection === 'personal') {
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
        if (formData.newEmail !== formData.verifyEmail) {
          toast.error('Email addresses do not match');
          setIsSaving(false);
          return;
        }
        toast.success('OTP sent to new email ID');
        setIsSaving(false);
        return;
      }

      // Enrich payload with GeM-specific fields
      payload.section = activeSection;
      payload.ministry = formData.ministry;
      payload.division = formData.division;
      payload.employeeCount = formData.employeeCount;
      payload.organizationType = formData.organizationType;
      
      const res = await api.post('/api/buyer/register', payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      
      if (res.ok) {
        toast.success(`${activeSection === 'bank' ? 'Bank details' : 'Profile'} updated successfully`);
        await refreshUser();
      } else {
        toast.error('Failed to update details');
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
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-[#12335f] border-t-transparent shadow-xl shadow-blue-500/20"></div>
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
                  <Badge className="bg-slate-100 text-slate-700 border-slate-200 rounded-lg px-4 py-1 text-[9px] font-black ">GE-M STRUCTURE</Badge>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <Select 
                    label="Type of Organisation *" 
                    value={formData.organizationType}
                    onChange={(e) => setFormData({...formData, organizationType: e.target.value})}
                    options={[
                      { label: 'Central Government', value: 'central' },
                      { label: 'State Government', value: 'state' },
                      { label: 'PSU', value: 'psu' },
                      { label: 'Autonomous Body', value: 'autonomous' },
                      { label: 'Local Body', value: 'local' }
                    ]}
                  />
                  <Input 
                    label="Ministry/Department *" 
                    value={formData.ministry} 
                    onChange={(e) => setFormData({...formData, ministry: e.target.value})}
                    placeholder="Enter Ministry name"
                  />
                  <Input 
                    label="Division *" 
                    value={formData.division} 
                    onChange={(e) => setFormData({...formData, division: e.target.value})}
                    placeholder="Enter Division name"
                  />
                  <Input 
                    label="Number of Employees *" 
                    type="number"
                    value={formData.employeeCount} 
                    onChange={(e) => setFormData({...formData, employeeCount: e.target.value})}
                    placeholder="e.g. 150"
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
                      onChange={(e) => setFormData({...formData, pincode: e.target.value})}
                      placeholder="e.g. 411030"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="State *" 
                      value={formData.state} 
                      onChange={(e) => setFormData({...formData, state: e.target.value})}
                      placeholder="MAHARASHTRA"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="District *" 
                      value={formData.district} 
                      onChange={(e) => setFormData({...formData, district: e.target.value})}
                      placeholder="Pune"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="space-y-6">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider ml-1">Street Address *</label>
                      <textarea 
                        value={formData.streetAddress}
                        onChange={(e) => setFormData({...formData, streetAddress: e.target.value})}
                        placeholder="Enter full street address"
                        rows={5}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500/20 transition-all resize-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider ml-1">Contact No. (Office) * <span className="text-slate-300 font-medium ml-2">ⓘ</span></label>
                  <div className="grid grid-cols-3 gap-4">
                    <Input 
                      placeholder="STD code" 
                      value={formData.stdCode}
                      onChange={(e) => setFormData({...formData, stdCode: e.target.value})}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      placeholder="Office Contact No." 
                      value={formData.officeContact}
                      onChange={(e) => setFormData({...formData, officeContact: e.target.value})}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      placeholder="Extension No." 
                      value={formData.extensionNo}
                      onChange={(e) => setFormData({...formData, extensionNo: e.target.value})}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="space-y-6">
                  <Input 
                    label="Website URL *" 
                    value={formData.websiteUrl}
                    onChange={(e) => setFormData({...formData, websiteUrl: e.target.value})}
                    placeholder="WWW.GEMEXPERT.COM"
                    className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                  />
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                   <Button 
                     onClick={handleSave}
                     disabled={isSaving}
                     className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase  text-xs tracking-[0.2em] h-14 px-10 rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-[0.98]"
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
                      onChange={(e) => setFormData({...formData, ifscCode: e.target.value})}
                      placeholder="e.g. SBIN0001234"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Bank Name *" 
                      value={formData.bankName} 
                      onChange={(e) => setFormData({...formData, bankName: e.target.value})}
                      placeholder="STATE BANK OF INDIA"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-black uppercase text-slate-500 tracking-wider ml-1">Bank Address *</label>
                      <textarea 
                        value={formData.bankAddress}
                        onChange={(e) => setFormData({...formData, bankAddress: e.target.value})}
                        placeholder="Enter full bank branch address"
                        rows={3}
                        className="w-full rounded-xl border border-slate-200 bg-slate-50/50 p-4 text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 transition-all resize-none"
                      />
                    </div>
                  </div>

                  <div className="space-y-6">
                    <Input 
                      label="Bank Account No *" 
                      type="password"
                      value={formData.bankAccountNo} 
                      onChange={(e) => setFormData({...formData, bankAccountNo: e.target.value})}
                      placeholder="••••••••••••"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Confirm Bank Account No *" 
                      value={formData.confirmBankAccountNo} 
                      onChange={(e) => setFormData({...formData, confirmBankAccountNo: e.target.value})}
                      placeholder="Enter account number again"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Account Holder Name *" 
                      value={formData.accountHolderName} 
                      onChange={(e) => setFormData({...formData, accountHolderName: e.target.value})}
                      placeholder="AS PER BANK RECORDS"
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
                      onChange={(e) => setFormData({...formData, firstName: e.target.value})}
                      placeholder="e.g. Sampati"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Last Name *" 
                      value={formData.lastName} 
                      onChange={(e) => setFormData({...formData, lastName: e.target.value})}
                      placeholder="e.g. Ingale"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Designation *" 
                      value={formData.designation} 
                      onChange={(e) => setFormData({...formData, designation: e.target.value})}
                      placeholder="e.g. Primary User"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Date of Retirement *" 
                      type="date"
                      value={formData.dateOfRetirement} 
                      onChange={(e) => setFormData({...formData, dateOfRetirement: e.target.value})}
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                  </div>

                  <div className="space-y-6">
                    <Input 
                      label="Name ( As in PAN ) *" 
                      value={formData.nameAsInPan} 
                      onChange={(e) => setFormData({...formData, nameAsInPan: e.target.value})}
                      placeholder="ENTER FULL NAME"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Organisation PAN *" 
                      value={formData.orgPan} 
                      onChange={(e) => setFormData({...formData, orgPan: e.target.value})}
                      placeholder="ABCDE1234F"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Date (As in Pan) *" 
                      type="date"
                      value={formData.dateAsInPan} 
                      onChange={(e) => setFormData({...formData, dateAsInPan: e.target.value})}
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
                               className="w-4 h-4 text-[#12335f] border-slate-300 focus:ring-blue-500/20"
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
                               className="w-4 h-4 text-[#12335f] border-slate-300 focus:ring-blue-500/20"
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

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                   <Button 
                     onClick={handleSave}
                     disabled={isSaving}
                     className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase  text-xs tracking-[0.2em] h-14 px-10 rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-[0.98]"
                   >
                     {isSaving ? 'Processing...' : 'Save Personal Info'}
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
                      onChange={(e) => setFormData({...formData, competentAuthorityEmail: e.target.value})}
                      placeholder="e.g. secy.dhe@nic.in"
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
                      onChange={(e) => setFormData({...formData, verifyingFirstName: e.target.value})}
                      placeholder="DATTATRAY"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Last Name *" 
                      value={formData.verifyingLastName} 
                      onChange={(e) => setFormData({...formData, verifyingLastName: e.target.value})}
                      placeholder="INGALE"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <div className="space-y-1">
                      <Input 
                        label="Email (Official) *" 
                        value={formData.verifyingEmail} 
                        onChange={(e) => setFormData({...formData, verifyingEmail: e.target.value})}
                        placeholder="buycon5.gpmp.mh@gembuyer.in"
                        className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                      />
                      <p className="text-[10px] text-slate-400 font-medium  ml-1">Secondary email must be registered with NIC/GeM.</p>
                    </div>
                    <Input 
                      label="Mobile (Official) *" 
                      value={formData.verifyingMobile} 
                      onChange={(e) => setFormData({...formData, verifyingMobile: e.target.value})}
                      placeholder="9763982676"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <div className="md:col-span-2 max-w-xl">
                      <Input 
                        label="Designation *" 
                        value={formData.verifyingDesignation} 
                        onChange={(e) => setFormData({...formData, verifyingDesignation: e.target.value})}
                        placeholder="OWNER"
                        className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                      />
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                   <Button 
                     onClick={handleSave}
                     disabled={isSaving}
                     className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase  text-xs tracking-[0.2em] h-14 px-10 rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-[0.98]"
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
                        onChange={(e) => setFormData({...formData, aadhaarMobile: e.target.value})}
                        placeholder="Enter mobile number linked with Aadhaar"
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
                           I, the holder of Aadhaar, hereby give my consent to MSME Marketplace, for using my Aadhaar number as allotted by UIDAI for registration. MSME Marketplace has informed me that my Aadhaar data will not be stored/shared.
                         </p>
                         <p className="text-[11px] font-medium text-slate-400 leading-relaxed ">
                           मैं, आधार का धारक, एतदद्वारा अपनी पहचान प्राधिकरण द्वारा आवंटित अपने आधार नंबर को पंजीकरण हेतु प्रयोग में लाने हेतु MSME Marketplace को अपनी सहमति प्रदान करता हूँ। MSME Marketplace ने मुझे अवगत कराया है कि मेरे आधार डेटा को संग्रहीत/साझा नहीं किया जाएगा।
                         </p>
                       </div>
                    </div>

                    <div className="flex items-center gap-4 bg-slate-100/50 p-4 rounded-2xl w-fit">
                       <p className="text-[10px] font-black uppercase text-slate-400  px-2">Audio Guide</p>
                       <div className="h-10 px-4 bg-white rounded-xl border border-slate-200 flex items-center gap-3">
                          <div className="w-2 h-2 rounded-full bg-blue-600 animate-pulse" />
                          <span className="text-[10px] font-bold text-slate-600">Consent playback available</span>
                       </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                   <Button 
                     onClick={handleSave}
                     disabled={isSaving}
                     className="bg-blue-600 hover:bg-blue-700 text-white font-black uppercase  text-xs tracking-[0.2em] h-14 px-10 rounded-2xl shadow-xl shadow-blue-200 transition-all active:scale-[0.98]"
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
                      onChange={(e) => setFormData({...formData, newEmail: e.target.value})}
                      placeholder="Enter Official email id"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                    <Input 
                      label="Verify Email Id *" 
                      value={formData.verifyEmail} 
                      onChange={(e) => setFormData({...formData, verifyEmail: e.target.value})}
                      placeholder="Verify Official email id"
                      className="h-12 text-sm font-bold bg-slate-50/50 border-slate-200 rounded-xl"
                    />
                  </div>
                </div>

                <div className="pt-6 border-t border-slate-50 flex justify-end">
                   <Button 
                     onClick={handleSave}
                     disabled={isSaving}
                     className="bg-slate-200 hover:bg-slate-300 text-slate-600 font-black uppercase  text-xs tracking-[0.2em] h-14 px-10 rounded-2xl shadow-sm transition-all active:scale-[0.98]"
                   >
                     {isSaving ? 'Sending...' : 'Send OTP'}
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
                  <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-xl px-8 h-12 font-black uppercase  text-xs tracking-widest whitespace-nowrap shadow-lg shadow-blue-100">
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
      <div className="fixed top-0 right-0 w-[800px] h-[800px] bg-blue-600/[0.02] rounded-full blur-[150px] -z-50 pointer-events-none" />
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
