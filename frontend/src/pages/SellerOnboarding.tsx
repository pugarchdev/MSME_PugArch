import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { Save, Plus, Trash2, ShieldCheck, ArrowRight, Loader2, Info, CheckCircle2 } from 'lucide-react';
import { GeMSellerSidebar } from '../components/GeMSellerSidebar';
import { GeMProfileHeader } from '../components/GeMProfileHeader';
import { indiaStates, indiaStatesDistricts } from '../data/indiaStatesDistricts';

export default function SellerOnboarding() {
  const { user } = useAuth();
  const authHeaders = { Authorization: `Bearer ${localStorage.getItem('token') || ''}` };
  const cachedMe = api.peek('/api/auth/me', { headers: authHeaders });
  const cachedProfile = cachedMe?.profile || {};
  const cachedRegDetails = cachedMe?.user?.registrationDetails || {};
  const [currentSection, setCurrentSection] = useState('pan');
  const isAccountSettings = ['sellerProfile', 'updateAadhaar', 'changePassword', 'changeEmail', 'closeAccount'].includes(currentSection);
  const [bankTab, setBankTab] = useState<'manage' | 'add'>('manage');
  const [officeTab, setOfficeTab] = useState<'manage' | 'add'>('manage');
  const [officeSortKey, setOfficeSortKey] = useState<'name' | 'address' | 'gst'>('name');
  const [bankSortKey, setBankSortKey] = useState<'ifsc' | 'bankName' | 'accountNumber' | 'holderName' | 'pfms' | 'primary'>('bankName');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(!cachedMe);
  const [savedSections, setSavedSections] = useState<string[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const lockedStatuses = ['approved_for_procurement', 'under_compliance_review', 'pending_validation'];
  const cachedStatus = cachedMe?.user?.onboardingStatus;
  const [isProfileLocked, setIsProfileLocked] = useState(lockedStatuses.includes(cachedStatus));
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(cachedStatus === 'under_compliance_review' || cachedStatus === 'approved_for_procurement');
  const [selectedOfficeState, setSelectedOfficeState] = useState('');
  const [selectedOfficeCity, setSelectedOfficeCity] = useState('');
  const [editingOfficeId, setEditingOfficeId] = useState<number | null>(null);
  const [officeForm, setOfficeForm] = useState({
    name: '',
    type: 'Registered',
    pincode: '',
    state: '',
    city: '',
    flat: '',
    premises: '',
    road: '',
    area: '',
    contact: ''
  });
  const [newBank, setNewBank] = useState({
    ifsc: '',
    bankName: '',
    bankAddress: '',
    holderName: '',
    accountNumber: '',
    confirmAccountNumber: '',
    isPrimary: false
  });
  const [bankErrors, setBankErrors] = useState<Record<string, string>>({});
  
  const [aadhaarData, setAadhaarData] = useState({ number: '', mobile: '', consent: false });
  const [emailData, setEmailData] = useState({ newEmail: '', verifyEmail: '' });

  const sellerFormDefaults = {
    organizationType: 'Proprietorship',
    pan: '',
    nameAsInPan: '',
    dateAsInPan: '',
    panVerified: false,
    
    businessName: '',
    dateOfIncorporation: '',
    detailsUpdated: false,
    
    isStartup: false,
    isUdyamCertified: false,
    participateInBid: false,
    optForSahay: false,
    
    turnoverMax3Yrs: '',
    eInvoicingExcluded: false,
    
    ownershipDeclarationAccepted: false,
    ownershipVerified: false,
    
    offices: [],
    bankAccounts: [],
    mobile: '',
    dob: '',
    roleInOrg: ''
  };
  
  const [formData, setFormData] = useState<any>({
    ...sellerFormDefaults,
    ...cachedProfile,
    organizationType: cachedProfile.organizationType || cachedRegDetails.businessType || 'Proprietorship',
    businessName: cachedProfile.businessName || cachedRegDetails.businessName || cachedMe?.user?.name || '',
    nameAsInPan: cachedProfile.nameAsInPan || cachedRegDetails.businessName || cachedMe?.user?.name || '',
    dateAsInPan: cachedProfile.dateAsInPan ? new Date(cachedProfile.dateAsInPan).toISOString().split('T')[0] : '',
    dateOfIncorporation: cachedProfile.dateOfIncorporation ? new Date(cachedProfile.dateOfIncorporation).toISOString().split('T')[0] : '',
    mobile: cachedProfile.mobile || cachedMe?.user?.mobile || '',
    dob: cachedProfile.dob ? new Date(cachedProfile.dob).toISOString().split('T')[0] : (cachedMe?.user?.dob ? new Date(cachedMe.user.dob).toISOString().split('T')[0] : ''),
    roleInOrg: cachedProfile.roleInOrg || cachedRegDetails.roleInOrg || '',
    pan: cachedProfile.pan || cachedRegDetails.pan || '',
    offices: cachedProfile.offices || [],
    bankAccounts: cachedProfile.bankAccounts || []
  });

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.fetch('/api/auth/me', {
          headers: authHeaders
        });
        const data = await res.json();
        
        const regDetails = data.user?.registrationDetails || {};
        const profile = data.profile || {};
        const currentStatus = data.user?.onboardingStatus;
        setIsProfileLocked(lockedStatuses.includes(currentStatus));
        setShowSuccessOverlay(currentStatus === 'under_compliance_review' || currentStatus === 'approved_for_procurement');
        
        setFormData((prev: any) => ({
          ...prev,
          ...profile,
          organizationType: profile.organizationType || regDetails.businessType || prev.organizationType,
          businessName: profile.businessName || regDetails.businessName || data.user?.name || prev.businessName,
          nameAsInPan: profile.nameAsInPan || '',
          dateAsInPan: profile.dateAsInPan ? new Date(profile.dateAsInPan).toISOString().split('T')[0] : '',
          dateOfIncorporation: profile.dateOfIncorporation ? new Date(profile.dateOfIncorporation).toISOString().split('T')[0] : '',
          mobile: profile.mobile || data.user?.mobile || prev.mobile,
          dob: profile.dob ? new Date(profile.dob).toISOString().split('T')[0] : (data.user?.dob ? new Date(data.user.dob).toISOString().split('T')[0] : prev.dob),
          roleInOrg: profile.roleInOrg || regDetails.roleInOrg || prev.roleInOrg,
          pan: profile.pan || regDetails.pan || prev.pan,
          offices: profile.offices || [],
          bankAccounts: profile.bankAccounts || []
        }));
      } catch (err) {
        console.error(err);
      } finally {
        setIsFetching(false);
      }
    };
    fetchProfile();
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (isProfileLocked && !isAccountSettings) return;
    const { name, value, type } = e.target as any;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev: any) => ({ ...prev, [name]: val }));
  };

  const handleSaveSection = async (nextSection?: string | React.MouseEvent) => {
    if (isProfileLocked && !isAccountSettings) {
      toast.info('Approved profiles are locked');
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.post('/api/seller/register', formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        toast.success('Section saved successfully');
        setSavedSections(prev => Array.from(new Set([...prev, currentSection])));
        if (typeof nextSection === 'string') {
          setCurrentSection(nextSection);
        }
      } else {
        toast.error('Failed to save section');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (isProfileLocked) return;
    setIsLoading(true);
    try {
      await api.post('/api/seller/register', formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const res = await api.post('/api/seller/submit', {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        toast.success('Application submitted successfully');
        setIsProfileLocked(true);
        setShowSuccessOverlay(true);
      } else {
        const data = await res.json();
        toast.error(data.message || 'Failed to submit application');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddOffice = async (officeDataArg?: any) => {
    if (isProfileLocked) {
      toast.info('Approved profiles are locked');
      return;
    }

    if (!officeForm.name) { toast.error("Please enter Office Name"); return; }
    
    const fullAddress = [officeForm.flat, officeForm.premises, officeForm.road, officeForm.area, `Contact: ${officeForm.contact}`].filter(Boolean).join(', ');
    const officeData = {
      name: officeForm.name,
      type: officeForm.type,
      pincode: officeForm.pincode,
      state: officeForm.state,
      city: officeForm.city,
      address: fullAddress,
      contactNumber: officeForm.contact,
      isMandatory: officeForm.type === 'Registered'
    };

    setIsLoading(true);
    try {
      if (editingOfficeId) {
        const res = await api.put(`/api/seller/profile/offices/${editingOfficeId}`, officeData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) {
          const data = await res.json();
          setFormData((prev: any) => ({
            ...prev,
            offices: prev.offices.map((o: any) => o.id === editingOfficeId ? data.office : o)
          }));
          toast.success('Office updated');
          setEditingOfficeId(null);
          setOfficeTab('manage');
          resetOfficeForm();
        }
      } else {
        const res = await api.post('/api/seller/profile/offices', officeData, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (res.ok) {
          const data = await res.json();
          setFormData((prev: any) => ({ ...prev, offices: [...prev.offices, data.office] }));
          toast.success('Office added');
          setOfficeTab('manage');
          resetOfficeForm();
        }
      }
    } catch (err) {
      toast.error(editingOfficeId ? 'Error updating office' : 'Error adding office');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEditOffice = (office: any) => {
    setEditingOfficeId(office.id);
    const parts = office.address.split(', ');
    setOfficeForm({
      name: office.name,
      type: office.type,
      pincode: office.pincode,
      state: office.state,
      city: office.city,
      flat: parts[0] || '',
      premises: parts[1] || '',
      road: parts[2] || '',
      area: parts[3] || '',
      contact: office.contactNumber || (parts[4]?.replace('Contact: ', '') || '')
    });
    setOfficeTab('add');
  };

  const resetOfficeForm = () => {
    setOfficeForm({
      name: '',
      type: 'Registered',
      pincode: '',
      state: '',
      city: '',
      flat: '',
      premises: '',
      road: '',
      area: '',
      contact: ''
    });
    setEditingOfficeId(null);
  };

  const handleDeleteOffice = async (id: number) => {
    if (isProfileLocked) {
      toast.info('Approved profiles are locked');
      return;
    }
    try {
      await api.delete(`/api/seller/profile/offices/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setFormData((prev: any) => ({ ...prev, offices: prev.offices.filter((o: any) => o.id !== id) }));
      toast.success('Office deleted');
    } catch (err) {
      toast.error('Error deleting office');
    }
  };

  const fetchPanDetails = async () => {
    if (!formData.pan || formData.pan.length !== 10) {
      toast.error('Please enter a valid 10-digit PAN');
      return;
    }
    setIsLoading(true);
    try {
      // Simulation of a PAN API response
      // In production, this would call a real backend endpoint that integrates with a PAN service
      setTimeout(() => {
        setFormData((prev: any) => ({
          ...prev,
          nameAsInPan: prev.businessName || "FETCHED NAME FROM PAN",
          dateAsInPan: "2010-01-01",
          panVerified: true
        }));
        toast.success('PAN details autofetched and verified');
        setIsLoading(false);
      }, 1000);
    } catch (err) {
      toast.error('PAN verification failed');
      setIsLoading(false);
    }
  };

  const handleAddBank = async (bankData: any) => {
    if (isProfileLocked) {
      toast.info('Approved profiles are locked');
      return;
    }
    setIsLoading(true);
    try {
      const res = await api.post('/api/seller/profile/bank', bankData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFormData((prev: any) => ({
          ...prev,
          bankAccounts: data.bankAccounts || [...prev.bankAccounts.map((bank: any) => ({
            ...bank,
            isPrimary: data.bank?.isPrimary ? false : bank.isPrimary
          })), data.bank]
        }));
        setNewBank({
          ifsc: '',
          bankName: '',
          bankAddress: '',
          holderName: '',
          accountNumber: '',
          confirmAccountNumber: '',
          isPrimary: false
        });
        setBankErrors({});
        toast.success('Bank account added');
      } else {
        const data = await res.json();
        toast.error(data.message || 'Error adding bank account');
      }
    } catch (err) {
      toast.error('Error adding bank account');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteBank = async (id: number) => {
    if (isProfileLocked) {
      toast.info('Approved profiles are locked');
      return;
    }
    try {
      const res = await api.delete(`/api/seller/profile/bank/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFormData((prev: any) => ({
          ...prev,
          bankAccounts: data.bankAccounts || prev.bankAccounts.filter((bank: any) => bank.id !== id)
        }));
        toast.success('Bank account deleted');
      } else {
        const data = await res.json();
        toast.error(data.message || 'Error deleting bank account');
      }
    } catch (err) {
      toast.error('Error deleting bank account');
    }
  };

  const normalizeSpaces = (value: string) => value.replace(/\s+/g, ' ').trim();

  const validateBankForm = (candidate = newBank) => {
    const values = {
      ifsc: candidate.ifsc.trim().toUpperCase(),
      bankName: normalizeSpaces(candidate.bankName),
      bankAddress: normalizeSpaces(candidate.bankAddress),
      holderName: normalizeSpaces(candidate.holderName),
      accountNumber: candidate.accountNumber.trim(),
      confirmAccountNumber: candidate.confirmAccountNumber.trim(),
      isPrimary: candidate.isPrimary
    };
    const errors: Record<string, string> = {};
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;
    const bankNameRegex = /^[A-Za-z0-9 .,&()/-]+$/;
    const holderRegex = /^[A-Za-z .'-]+$/;
    const accountRegex = /^\d{9,18}$/;

    if (!values.ifsc) errors.ifsc = 'IFSC code is required.';
    else if (!ifscRegex.test(values.ifsc)) errors.ifsc = 'Enter a valid 11-character IFSC, e.g. SBIN0001234.';

    if (!values.bankName) errors.bankName = 'Bank name is required.';
    else if (values.bankName.length < 2) errors.bankName = 'Bank name must be at least 2 characters.';
    else if (values.bankName.length > 100) errors.bankName = 'Bank name cannot exceed 100 characters.';
    else if (!bankNameRegex.test(values.bankName)) errors.bankName = 'Bank name contains invalid characters.';

    if (!values.bankAddress) errors.bankAddress = 'Bank address is required.';
    else if (values.bankAddress.length < 10) errors.bankAddress = 'Bank address must be at least 10 characters.';
    else if (values.bankAddress.length > 250) errors.bankAddress = 'Bank address cannot exceed 250 characters.';

    if (!values.holderName) errors.holderName = 'Account holder name is required.';
    else if (values.holderName.length < 2) errors.holderName = 'Account holder name must be at least 2 characters.';
    else if (!holderRegex.test(values.holderName)) errors.holderName = 'Use only alphabets, spaces, dots, hyphens, and apostrophes.';

    if (!values.accountNumber) errors.accountNumber = 'Bank account number is required.';
    else if (!accountRegex.test(values.accountNumber)) errors.accountNumber = 'Account number must be 9 to 18 digits only.';

    if (!values.confirmAccountNumber) errors.confirmAccountNumber = 'Please confirm the account number.';
    else if (values.accountNumber !== values.confirmAccountNumber) errors.confirmAccountNumber = 'Account numbers do not match.';

    const isDuplicate = formData.bankAccounts.some((bank: any) =>
      String(bank.accountNumber) === values.accountNumber &&
      String(bank.ifsc).toUpperCase() === values.ifsc
    );
    if (isDuplicate) errors.accountNumber = 'This bank account is already added.';

    if (formData.bankAccounts.length === 0 && !values.isPrimary) {
      errors.isPrimary = 'The first bank account must be marked as primary.';
    }

    return { values, errors, isValid: Object.keys(errors).length === 0 };
  };

  const updateNewBank = (field: keyof typeof newBank, value: string | boolean) => {
    const next = { ...newBank, [field]: value };
    setNewBank(next);
    setBankErrors(validateBankForm(next).errors);
  };

  const handleIfscBlur = async () => {
    const ifsc = newBank.ifsc.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) return;
    try {
      const res = await fetch(`https://ifsc.razorpay.com/${ifsc}`);
      if (!res.ok) return;
      const data = await res.json();
      const next = {
        ...newBank,
        ifsc,
        bankName: data.BANK || newBank.bankName,
        bankAddress: [data.BRANCH, data.ADDRESS, data.CITY, data.STATE].filter(Boolean).join(', ').slice(0, 250) || newBank.bankAddress
      };
      setNewBank(next);
      setBankErrors(validateBankForm(next).errors);
    } catch {
      // IFSC lookup is a convenience only; manual entry remains available.
    }
  };

  const bankValidation = validateBankForm({
    ...newBank,
    isPrimary: formData.bankAccounts.length === 0 ? true : newBank.isPrimary
  });

  const calculateCompletion = () => {
    let completed = 0;
    if (formData.panVerified) completed += 1;
    if (formData.businessName && formData.dateOfIncorporation) completed += 1;
    if (formData.isStartup || formData.isUdyamCertified) completed += 1; // Simplification
    if (formData.offices.length > 0) completed += 1;
    if (formData.bankAccounts.length > 0) completed += 1;
    if (formData.turnoverMax3Yrs) completed += 1;
    if (formData.ownershipDeclarationAccepted) completed += 1;
    return Math.round((completed / 7) * 100);
  };

  const getSectionStatus = () => {
    const status: any = {};
    status.pan = formData.panVerified || savedSections.includes('pan') ? 'completed' : 'pending';
    status.details = (formData.businessName && formData.dateOfIncorporation) || savedSections.includes('details') ? 'completed' : 'pending';
    status.additional = savedSections.includes('additional') || formData.isStartup || formData.isUdyamCertified || formData.participateInBid || formData.optForSahay ? 'completed' : 'pending';
    status.offices = formData.offices.length > 0 ? 'completed' : 'pending';
    status.bank = formData.bankAccounts.length > 0 ? 'completed' : 'pending';
    status.einvoicing = formData.turnoverMax3Yrs || savedSections.includes('einvoicing') ? 'completed' : 'pending';
    status.ownership = formData.ownershipDeclarationAccepted || savedSections.includes('ownership') ? 'completed' : 'pending';
    return status;
  };

  const warnings = [];
  if (!formData.panVerified) warnings.push("Kindly verify Business PAN");
  if (formData.offices.length === 0) warnings.push("Registered Address details missing");
  if (!formData.ownershipDeclarationAccepted) warnings.push("Please complete Beneficial Ownership Compliance");

  if (isFetching) return <div className="flex h-screen items-center justify-center font-black  text-blue-600 animate-pulse">Initializing Profile...</div>;

  return (
    <div className="flex flex-col md:flex-row bg-gray-50 min-h-screen">
      <GeMSellerSidebar 
        currentSection={currentSection} 
        onSectionChange={setCurrentSection} 
        sectionStatus={getSectionStatus()} 
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />
      
      <div className="flex-1 flex flex-col min-w-0">
        <GeMProfileHeader 
          companyName={formData.businessName} 
          completionPercentage={calculateCompletion()} 
          warnings={warnings} 
          onMenuClick={() => setIsSidebarOpen(true)}
        />
        
        <div className="p-4 max-w-4xl mx-auto w-full">
          <Card className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50/50 px-5 py-3">
               <h3 className="text-base font-bold uppercase tracking-tight text-gray-800">
                 {currentSection.replace(/([A-Z])/g, ' $1').toUpperCase()}
               </h3>
               {isProfileLocked && (
                 <p className="mt-3 inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                   Approved profile locked
                 </p>
               )}
            </div>
            
            <CardContent className="p-5 w-full min-w-0">
              {showSuccessOverlay ? (
                <div className="py-12 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500 min-w-0 w-full">
                  <div className="h-24 w-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 shadow-inner border-4 border-white shadow-emerald-100">
                    <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Application Submitted Successfully</h2>
                  <p className="mt-3 text-slate-500 max-w-md mx-auto text-sm font-medium">
                    Your business profile has been securely locked and submitted to our compliance team for review. You will be notified via email once the verification is complete.
                  </p>
                  
                  <div className="mt-8 p-4 bg-blue-50 border border-blue-100 rounded-xl text-left max-w-md w-full mx-auto">
                     <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                        <div>
                           <p className="text-sm font-bold text-blue-900">Review Period Notice</p>
                           <p className="text-xs font-medium text-blue-700 mt-1">Standard processing time is 3-5 business days. You cannot modify your registration data during this period.</p>
                        </div>
                     </div>
                  </div>
                  
                  <Button onClick={() => setShowSuccessOverlay(false)} className="mt-10 bg-[#12335f] hover:bg-[#0b2342] text-white px-8 font-bold tracking-wide rounded-lg uppercase text-xs h-10">
                     Review Submission Data
                  </Button>
                </div>
              ) : (
                <fieldset disabled={isProfileLocked && !isAccountSettings} className={`min-w-0 w-full ${(isProfileLocked && !isAccountSettings) ? 'opacity-70' : ''}`}>
              {currentSection === 'pan' && (
                <div className="space-y-4 animate-in fade-in duration-300 min-w-0 w-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Input 
                      label="Business / Organisation Type" 
                      name="organizationType" 
                      value={formData.organizationType} 
                      disabled
                      className="bg-slate-50 border-slate-200"
                    />
                    <Input label="Business PAN Number" name="pan" value={formData.pan} onChange={handleChange} placeholder="ABCDE1234F" />
                    <Input label="Name (As in PAN)" name="nameAsInPan" value={formData.nameAsInPan} onChange={handleChange} placeholder="Autofetched from PAN" />
                    <Input label="Date (As in PAN)" name="dateAsInPan" type="date" value={formData.dateAsInPan} onChange={handleChange} />
                  </div>
                  <div className="flex justify-end gap-3 pt-4">
                    <Button onClick={fetchPanDetails} disabled={isLoading} className="bg-blue-600 hover:bg-blue-700 rounded-xl px-8 h-12 font-black uppercase text-xs  tracking-widest shadow-lg shadow-blue-100">
                       {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Verify Business PAN'}
                    </Button>
                    <Button onClick={() => handleSaveSection('details')} disabled={isLoading || !formData.panVerified} className="bg-gray-900 hover:bg-black rounded-xl px-8 h-12 font-black uppercase text-xs  tracking-widest text-white">
                       {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : <Save className="mr-2 h-4 w-4" />}
                       Save & Continue
                    </Button>
                  </div>
                </div>
              )}

              {currentSection === 'details' && (
                <div className="space-y-6 animate-in fade-in duration-300 min-w-0 w-full">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <Input 
                      label="Business / Organisation Name" 
                      name="businessName" 
                      value={formData.businessName} 
                      disabled 
                      className="bg-slate-50 border-slate-200" 
                    />
                    <Input label="Date of Incorporation" name="dateOfIncorporation" type="date" value={formData.dateOfIncorporation} onChange={handleChange} />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button onClick={() => handleSaveSection('additional')} className="bg-blue-600 hover:bg-blue-700 rounded px-6 h-9 font-bold uppercase text-xs tracking-wide text-white">
                       Save & Continue
                    </Button>
                  </div>
                </div>
              )}

              {currentSection === 'additional' && (
                <div className="space-y-8 animate-in fade-in duration-300 min-w-0 w-full">
                   {[
                     { label: 'Are you registered with DPIIT as Startup?', name: 'isStartup' },
                     { label: 'Do you have Udyam Registration certified by MSME?', name: 'isUdyamCertified' },
                     { label: 'Do you want to participate in Bid?', name: 'participateInBid' },
                     { label: 'Do you want to Opt for SAHAY?', name: 'optForSahay' },
                   ].map(item => (
                     <div key={item.name} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-100 font-medium text-gray-700">
                        <span className="text-sm">{item.label}</span>
                        <div className="flex gap-4">
                           <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={formData[item.name]} onChange={() => setFormData((prev: any) => ({ ...prev, [item.name]: true }))} className="accent-blue-600 h-4 w-4" />
                              <span className="text-xs uppercase">Yes</span>
                           </label>
                           <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={!formData[item.name]} onChange={() => setFormData((prev: any) => ({ ...prev, [item.name]: false }))} className="accent-blue-600 h-4 w-4" />
                              <span className="text-xs uppercase">No</span>
                           </label>
                        </div>
                     </div>
                   ))}
                   <div className="flex justify-end pt-2">
                    <Button onClick={() => handleSaveSection('offices')} className="bg-gray-900 text-white rounded px-6 h-9 font-bold uppercase text-xs tracking-wide">
                       Save & Continue
                    </Button>
                  </div>
                </div>
              )}

              {currentSection === 'offices' && (
                <div className="space-y-4 animate-in fade-in duration-300 min-w-0 w-full">
                   <p className="text-sm text-gray-600">You can add multiple office locations as per their function/type for your Business</p>
                   
                   <div className="flex border-b border-gray-200">
                     <button onClick={() => { setOfficeTab('manage'); setEditingOfficeId(null); }} className={`px-6 py-3 text-sm font-semibold ${officeTab === 'manage' ? 'text-blue-600 border-t-2 border-l-2 border-r-2 border-gray-200 rounded-t-lg bg-white -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>Manage Offices</button>
                     <button onClick={() => { setOfficeTab('add'); if(!editingOfficeId) resetOfficeForm(); }} className={`px-6 py-3 text-sm font-semibold ${officeTab === 'add' ? 'text-blue-600 border-t-2 border-l-2 border-r-2 border-gray-200 rounded-t-lg bg-white -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>{editingOfficeId ? 'Edit Office' : 'Add New Office'}</button>
                   </div>

                    {officeTab === 'manage' && (
                      <div className="pt-4 space-y-6 animate-in fade-in min-w-0 w-full">
                         <p className="text-sm text-gray-700">You need to update your GSTIN for getting the order above 40 lakhs.</p>
                         
                         <div className="overflow-x-auto border border-gray-200 bg-white rounded-xl w-full">
                            <table className="w-full text-left text-sm min-w-[600px]">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                 <tr>
                                    <th className="px-4 py-4 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight">Sr. No.</th>
                                    <th className="px-4 py-4 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight w-1/4"><button type="button" onClick={() => setOfficeSortKey('name')}>Office SORT</button></th>
                                    <th className="px-4 py-4 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight w-1/2"><button type="button" onClick={() => setOfficeSortKey('address')}>Address SORT</button></th>
                                    <th className="px-4 py-4 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setOfficeSortKey('gst')}>GSTIN SORT</button></th>
                                    <th className="px-4 py-4 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight">ACTION</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {formData.offices.length === 0 ? (
                                    <tr>
                                       <td colSpan={5} className="py-6 px-0 text-gray-500">
                                          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-6">
                                            <span className="text-xs sm:text-sm">No offices added.</span>
                                            <button onClick={() => setOfficeTab('add')} className="text-blue-600 font-bold hover:underline uppercase text-[10px] sm:text-xs">ADD NEW OFFICE</button>
                                          </div>
                                       </td>
                                    </tr>
                                 ) : (
                                    [...formData.offices].sort((a: any, b: any) => String(officeSortKey === 'address' ? a.address : officeSortKey === 'gst' ? a.gstNumber || '' : a.name || '').localeCompare(String(officeSortKey === 'address' ? b.address : officeSortKey === 'gst' ? b.gstNumber || '' : b.name || ''))).map((office: any, index: number) => (
                                       <tr key={office.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors">
                                          <td className="px-4 py-4 font-mono text-xs font-bold text-gray-400">{String(index + 1).padStart(2, '0')}</td>
                                          <td className="px-4 py-4 text-gray-600 break-words max-w-[180px]">
                                            <div className="font-semibold">{office.name}</div>
                                            <div className="text-xs text-gray-400">{office.type}</div>
                                          </td>
                                          <td className="px-4 py-4 text-gray-600 whitespace-normal break-words max-w-[300px]">
                                            {office.address}, {office.city}, {office.state} - {office.pincode}
                                          </td>
                                          <td className="px-4 py-4 text-gray-600 break-all">-</td>
                                          <td className="px-4 py-4">
                                             <button onClick={() => handleEditOffice(office)} className="text-blue-600 hover:text-blue-800 font-bold text-xs uppercase mr-4">EDIT</button>
                                             <button onClick={() => handleDeleteOffice(office.id)} className="text-red-500 hover:text-red-700 font-bold text-xs uppercase">DELETE</button>
                                          </td>
                                       </tr>
                                    ))
                                 )}
                              </tbody>
                           </table>
                           {formData.offices.length > 0 && (
                             <div className="flex justify-between items-center px-4 py-3 bg-gray-50 border-t border-gray-200">
                               <span className="text-sm text-gray-600">{formData.offices.length} of {formData.offices.length} Office Location displayed.</span>
                               <button onClick={() => setOfficeTab('add')} className="text-blue-600 font-bold hover:underline uppercase text-xs">ADD NEW OFFICE</button>
                             </div>
                           )}
                        </div>
                     </div>
                   )}

                   {officeTab === 'add' && (
                     <div className="pt-4 space-y-6 animate-in fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Office Name*</label>
                              <input value={officeForm.name} onChange={(e) => setOfficeForm({...officeForm, name: e.target.value})} placeholder="Enter Office Name" className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Type Of Office*</label>
                              <select value={officeForm.type} onChange={(e) => setOfficeForm({...officeForm, type: e.target.value})} className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-500">
                                 <option value="Registered">Select type of address</option>
                                 <option value="Registered">Registered Office</option>
                                 <option value="Branch">Branch</option>
                                 <option value="Warehouse">Warehouse</option>
                              </select>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Pincode*</label>
                              <input value={officeForm.pincode} onChange={(e) => setOfficeForm({...officeForm, pincode: e.target.value})} placeholder="Enter 6 digit pincode" className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">State*</label>
                              <select 
                                id="new-office-state" 
                                value={selectedOfficeState}
                                onChange={(e) => {
                                  setSelectedOfficeState(e.target.value);
                                  setSelectedOfficeCity('');
                                  setOfficeForm({...officeForm, state: e.target.value});
                                }}
                                className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="">Select State</option>
                                {indiaStates.map(st => (
                                  <option key={st} value={st}>{st}</option>
                                ))}
                              </select>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Town/City/District*</label>
                              <select 
                                id="new-office-city"
                                value={selectedOfficeCity}
                                disabled={!selectedOfficeState}
                                onChange={(e) => {
                                  setSelectedOfficeCity(e.target.value);
                                  setOfficeForm({...officeForm, city: e.target.value});
                                }}
                                className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-60 disabled:bg-gray-50"
                              >
                                <option value="">Select District</option>
                                {selectedOfficeState && (indiaStatesDistricts as any)[selectedOfficeState]?.map((dist: string) => (
                                  <option key={dist} value={dist}>{dist}</option>
                                ))}
                              </select>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Flat/Door/Block No*</label>
                              <input value={officeForm.flat} onChange={(e) => setOfficeForm({...officeForm, flat: e.target.value})} placeholder="Enter Flat/Door/Block number" className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Name of Premises/ Building/ Village</label>
                              <input value={officeForm.premises} onChange={(e) => setOfficeForm({...officeForm, premises: e.target.value})} placeholder="Enter Building/Premises/Village" className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Road/Street/Post Office</label>
                              <input value={officeForm.road} onChange={(e) => setOfficeForm({...officeForm, road: e.target.value})} placeholder="Enter Road/Street/Post Office" className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Area/Locality*</label>
                              <input value={officeForm.area} onChange={(e) => setOfficeForm({...officeForm, area: e.target.value})} placeholder="Enter Area/Locality" className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Contact Number* <span className="text-gray-400 font-normal ml-1">ⓘ</span></label>
                              <input value={officeForm.contact} onChange={(e) => setOfficeForm({...officeForm, contact: e.target.value})} placeholder="Enter Contact Number" className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500" />
                              <p className="text-[10px] text-gray-500 mt-1 leading-tight">This number will be published on GeM Artifacts (such as Contract and Invoice) for helping the Buyer communicate with the Sellers post contract</p>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Office Email Address*</label>
                              <select id="new-office-email" className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-500">
                                 <option value={user?.email || "registered@example.com"}>{user?.email || "registered@example.com"}</option>
                              </select>
                           </div>
                        </div>
                        <div className="flex justify-end mt-6 pt-6 border-t border-gray-100">
                           <Button onClick={() => {
                             const name = officeForm.name;
                             const type = officeForm.type;
                             const flat = officeForm.flat;
                             const premises = officeForm.premises;
                             const road = officeForm.road;
                             const area = officeForm.area;
                             const contact = officeForm.contact;
                             const pincode = officeForm.pincode;
                             
                             if (!name) { toast.error("Please enter Office Name"); return; }
                             
                             const fullAddress = [flat, premises, road, area, `Contact: ${contact}`].filter(Boolean).join(', ');
                             
                             handleAddOffice({
                               name,
                               type: type === 'Registered' ? 'Registered' : type,
                               pincode: pincode,
                               state: selectedOfficeState,
                               city: selectedOfficeCity,
                               address: fullAddress,
                               contactNumber: contact,
                               isMandatory: type === 'Registered'
                             });
                           }} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-10 h-12 rounded transition-colors uppercase tracking-widest text-xs  shadow-lg shadow-blue-100">
                               {editingOfficeId ? 'UPDATE OFFICE' : <><Plus className="mr-2 h-4 w-4" /> ADD OFFICE</>}
                           </Button>
                        </div>
                     </div>
                   )}
                   <div className="flex justify-end pt-4">
                     <Button onClick={() => handleSaveSection('bank')} className="bg-gray-900 text-white rounded px-6 h-9 font-bold uppercase text-xs tracking-wide">
                        Save & Continue
                     </Button>
                   </div>
                </div>
              )}

              {currentSection === 'bank' && (
                <div className="space-y-4 animate-in fade-in duration-300 min-w-0 w-full">
                   <p className="text-sm text-gray-600">You can add multiple Bank accounts for your Business. One account must be selected as Primary account</p>
                   
                   <div className="flex border-b border-gray-200">
                     <button onClick={() => setBankTab('manage')} className={`px-6 py-3 text-sm font-semibold ${bankTab === 'manage' ? 'text-blue-600 border-t-2 border-l-2 border-r-2 border-gray-200 rounded-t-lg bg-white -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>Manage Bank Account</button>
                     <button onClick={() => setBankTab('add')} className={`px-6 py-3 text-sm font-semibold ${bankTab === 'add' ? 'text-blue-600 border-t-2 border-l-2 border-r-2 border-gray-200 rounded-t-lg bg-white -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>Add new Bank Account</button>
                   </div>

                    {bankTab === 'manage' && (
                      <div className="pt-4 space-y-6 animate-in fade-in min-w-0 w-full">
                         <div className="bg-blue-50/50 text-slate-700 p-5 rounded text-sm border border-blue-100">
                            <p>Public Finance Management System (PFMS) verification is mandatory to receive payments from buyers using PFMS method of payment. Enter your PFMS verified account for better experience.</p>
                            <p className="mt-4">Don't have a PFMS verification yet? Don't worry, you can proceed with a non-PFMS verified account now and come back to this section later.</p>
                         </div>
                         
                         <div className="overflow-x-auto border border-gray-200 bg-white rounded-xl w-full">
                            <table className="w-full text-left text-sm min-w-[640px]">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                 <tr>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight">Sr. No.</th>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setBankSortKey('ifsc')}>IFSC SORT</button></th>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setBankSortKey('bankName')}>Bank Name SORT</button></th>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setBankSortKey('accountNumber')}>Bank Account Number SORT</button></th>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setBankSortKey('holderName')}>Account Holder SORT</button></th>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setBankSortKey('pfms')}>PFMS SORT</button></th>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setBankSortKey('primary')}>Primary SORT</button></th>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight">ACTION</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {formData.bankAccounts.length === 0 ? (
                                    <tr>
                                       <td colSpan={8} className="py-6 px-0 text-gray-500">
                                          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-6">
                                             <span className="text-xs sm:text-sm">No accounts added.</span>
                                             <button onClick={() => setBankTab('add')} className="text-blue-600 font-bold hover:underline uppercase text-[10px] sm:text-xs">ADD NEW BANK ACCOUNT</button>
                                          </div>
                                       </td>
                                    </tr>
                                 ) : (
                                    [...formData.bankAccounts].sort((a: any, b: any) => String(a[bankSortKey] ?? '').localeCompare(String(b[bankSortKey] ?? ''))).map((bank: any, index: number) => (
                                        <tr key={bank.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors text-xs">
                                           <td className="px-3 py-3 font-mono font-bold text-gray-400">{String(index + 1).padStart(2, '0')}</td>
                                           <td className="px-3 py-3 text-gray-600 font-medium">{bank.ifsc}</td>
                                           <td className="px-3 py-3 text-gray-600 break-words max-w-[150px]">{bank.bankName}</td>
                                           <td className="px-3 py-3 text-gray-600 break-all font-mono">{bank.accountNumber}</td>
                                           <td className="px-3 py-3 text-gray-600 break-words max-w-[150px]">{bank.holderName || '-'}</td>
                                           <td className="px-3 py-3 text-gray-600">-</td>
                                           <td className="px-3 py-3 text-gray-600">{bank.isPrimary ? 'Yes' : 'No'}</td>
                                           <td className="px-3 py-3">
                                              <button onClick={() => handleDeleteBank(bank.id)} className="text-red-500 hover:text-red-700 font-bold text-[10px] uppercase">Delete</button>
                                           </td>
                                        </tr>
                                    ))
                                 )}
                              </tbody>
                           </table>
                        </div>
                     </div>
                   )}

                   {bankTab === 'add' && (
                     <div className="pt-4 space-y-6 animate-in fade-in">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">IFSC Code*</label>
                              <input
                                id="new-bank-ifsc"
                                value={newBank.ifsc}
                                onChange={(event) => updateNewBank('ifsc', event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 11))}
                                onBlur={handleIfscBlur}
                                placeholder="Enter IFSC Code"
                                className={`w-full h-12 px-4 rounded border bg-gray-50/50 text-sm focus:outline-none focus:ring-1 ${bankErrors.ifsc ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
                              />
                              {bankErrors.ifsc && <p className="mt-1 text-xs font-medium text-red-600">{bankErrors.ifsc}</p>}
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Bank Name*</label>
                              <input
                                id="new-bank-name"
                                value={newBank.bankName}
                                onChange={(event) => updateNewBank('bankName', event.target.value.slice(0, 100))}
                                placeholder="Bank Name"
                                className={`w-full h-12 px-4 rounded border bg-gray-100 text-sm focus:outline-none focus:ring-1 ${bankErrors.bankName ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
                              />
                              {bankErrors.bankName && <p className="mt-1 text-xs font-medium text-red-600">{bankErrors.bankName}</p>}
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Bank Address*</label>
                              <textarea
                                id="new-bank-address"
                                value={newBank.bankAddress}
                                onChange={(event) => updateNewBank('bankAddress', event.target.value.slice(0, 250))}
                                placeholder="Bank Address"
                                className={`w-full h-24 p-4 rounded border bg-gray-100 text-sm resize-none focus:outline-none focus:ring-1 ${bankErrors.bankAddress ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
                              />
                              {bankErrors.bankAddress && <p className="mt-1 text-xs font-medium text-red-600">{bankErrors.bankAddress}</p>}
                           </div>
                           <div className="space-y-6">
                              <div>
                                 <label className="block text-xs font-bold text-gray-700 mb-1">Account Holder Name*</label>
                                 <input
                                  id="new-bank-holder"
                                  value={newBank.holderName}
                                  onChange={(event) => updateNewBank('holderName', event.target.value.replace(/[^A-Za-z .'-]/g, ''))}
                                  placeholder="Enter Account Holder's Name"
                                  className={`w-full h-12 px-4 rounded border bg-gray-50/50 text-sm focus:outline-none focus:ring-1 ${bankErrors.holderName ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
                                 />
                                 {bankErrors.holderName && <p className="mt-1 text-xs font-medium text-red-600">{bankErrors.holderName}</p>}
                              </div>
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Bank Account No*</label>
                              <input
                                id="new-bank-number"
                                value={newBank.accountNumber}
                                onChange={(event) => updateNewBank('accountNumber', event.target.value.replace(/\D/g, '').slice(0, 18))}
                                inputMode="numeric"
                                placeholder="Enter Bank account number"
                                className={`w-full h-12 px-4 rounded border bg-gray-50/50 text-sm focus:outline-none focus:ring-1 ${bankErrors.accountNumber ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
                              />
                              {bankErrors.accountNumber && <p className="mt-1 text-xs font-medium text-red-600">{bankErrors.accountNumber}</p>}
                           </div>
                           <div>
                              <label className="block text-xs font-bold text-gray-700 mb-1">Confirm Bank Account No*</label>
                              <input
                                id="new-bank-confirm"
                                value={newBank.confirmAccountNumber}
                                onChange={(event) => updateNewBank('confirmAccountNumber', event.target.value.replace(/\D/g, '').slice(0, 18))}
                                inputMode="numeric"
                                placeholder="Confirm Bank account number"
                                className={`w-full h-12 px-4 rounded border bg-gray-50/50 text-sm focus:outline-none focus:ring-1 ${bankErrors.confirmAccountNumber ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-blue-500'}`}
                              />
                              {bankErrors.confirmAccountNumber && <p className="mt-1 text-xs font-medium text-red-600">{bankErrors.confirmAccountNumber}</p>}
                           </div>
                        </div>

                        <label className="flex items-center gap-2 mt-4 cursor-pointer">
                           <input
                            id="new-bank-primary"
                            type="checkbox"
                            checked={formData.bankAccounts.length === 0 ? true : newBank.isPrimary}
                            onChange={(event) => updateNewBank('isPrimary', event.target.checked)}
                            disabled={formData.bankAccounts.length === 0}
                            className="w-4 h-4 text-blue-600 rounded border-gray-300"
                           />
                           <span className="text-sm font-medium text-gray-700">Is Primary Account?</span>
                        </label>
                        {formData.bankAccounts.length === 0 && <p className="text-xs font-medium text-blue-700">First bank account will be saved as the primary account.</p>}
                        {bankErrors.isPrimary && <p className="text-xs font-medium text-red-600">{bankErrors.isPrimary}</p>}
                         <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-8 pt-6 border-t border-gray-100">
                           <p className="text-sm font-medium text-gray-800 mb-4 sm:mb-0">Complete validation to add a new bank account</p>
                           <Button onClick={() => {
                             const validation = validateBankForm({
                               ...newBank,
                               isPrimary: formData.bankAccounts.length === 0 ? true : newBank.isPrimary
                             });
                             setBankErrors(validation.errors);
                             if (!validation.isValid) {
                                toast.error("Please fix the bank account details.");
                                return;
                             }
                             handleAddBank({
                               ifsc: validation.values.ifsc,
                               bankName: validation.values.bankName,
                               bankAddress: validation.values.bankAddress,
                               holderName: validation.values.holderName,
                               accountNumber: validation.values.accountNumber,
                               isPrimary: validation.values.isPrimary
                             });
                             setBankTab('manage');
                           }} disabled={!bankValidation.isValid || isLoading} className="bg-blue-600 hover:bg-blue-700 text-white font-bold px-6 h-9 rounded transition-colors tracking-wide uppercase text-xs disabled:cursor-not-allowed disabled:opacity-50">
                               VALIDATE & ADD
                           </Button>
                        </div>
                     </div>
                   )}

                   <div className="flex justify-end pt-2">
                     <Button onClick={() => handleSaveSection('einvoicing')} className="bg-gray-900 text-white rounded px-6 h-9 font-bold uppercase text-xs tracking-wide">
                        Save & Continue
                     </Button>
                   </div>
                </div>
              )}

              {currentSection === 'einvoicing' && (
                <div className="space-y-6 animate-in fade-in duration-300 min-w-0 w-full">
                   <div className="bg-blue-50/50 border border-blue-100 p-5 rounded-2xl space-y-2 ">
                      <p className="text-[10px] font-black uppercase text-blue-700">e-Invoice Information</p>
                      <p className="text-xs font-medium text-blue-900 leading-relaxed opacity-80">
                        As per Government regulations, taxpayers with turnover exceeding specific limits must generate e-invoices. Please declare your status below.
                      </p>
                   </div>
                   <div className="grid grid-cols-1 gap-6">
                      <Input label="Turnover (Max in last 3 years)" name="turnoverMax3Yrs" value={formData.turnoverMax3Yrs} onChange={handleChange} placeholder="e.g. 10 Crores" />
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100  font-bold">
                        <span className="text-sm">Specific category excluded from e-invoicing?</span>
                        <div className="flex gap-4">
                           <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={formData.eInvoicingExcluded} onChange={() => setFormData((prev: any) => ({ ...prev, eInvoicingExcluded: true }))} className="accent-blue-600 h-4 w-4" />
                              <span className="text-xs uppercase">Yes</span>
                           </label>
                           <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={!formData.eInvoicingExcluded} onChange={() => setFormData((prev: any) => ({ ...prev, eInvoicingExcluded: false }))} className="accent-blue-600 h-4 w-4" />
                              <span className="text-xs uppercase">No</span>
                           </label>
                        </div>
                      </div>
                   </div>
                   <div className="flex justify-end pt-2">
                    <Button onClick={() => handleSaveSection('ownership')} className="bg-gray-900 text-white rounded px-6 h-9 font-bold uppercase text-xs tracking-wide">
                       Save & Continue
                    </Button>
                  </div>
                </div>
              )}

              {currentSection === 'ownership' && (
                <div className="space-y-8 animate-in fade-in duration-300 min-w-0 w-full">
                   <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-4 sm:p-8 text-white shadow-2xl">
                      <div className="absolute top-0 right-0 p-8 opacity-10">
                         <ShieldCheck className="h-32 w-32" />
                      </div>
                      <h3 className="border-b border-white/10 pb-4 text-xl font-black uppercase tracking-tight ">Beneficial Ownership Declaration</h3>
                      <p className="mt-4 text-slate-400 text-sm leading-relaxed font-medium ">
                         I hereby solemnly affirm and declare that I have read and understood Rule 144(xi) of GFR 2017 and subsequent orders issued by the Ministry of Finance. I declare that our organization is compliant with the beneficial ownership rules as prescribed.
                      </p>
                      <label className="mt-8 flex cursor-pointer items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 transition-colors hover:bg-white/10">
                         <input 
                           type="checkbox" 
                           name="ownershipDeclarationAccepted" 
                           checked={formData.ownershipDeclarationAccepted} 
                           onChange={handleChange}
                           className="mt-0.5 h-6 w-6 shrink-0 rounded accent-blue-500" 
                         />
                         <span className="text-xs font-black uppercase leading-relaxed text-blue-400 ">I Accept and Affirm Compliance</span>
                      </label>
                   </div>
                   
                   <div className="flex flex-col items-center gap-6 py-6 ">
                      <p className="text-xs font-bold text-gray-500 uppercase tracking-widest">Verification Required via OTP</p>
                      <div className="flex gap-4">
                         <Button onClick={() => setFormData((prev: any) => ({ ...prev, ownershipVerified: true }))} className="bg-blue-600 text-white rounded px-6 h-9 font-bold uppercase text-xs tracking-wide">
                            Send OTP
                         </Button>
                         <Button onClick={() => handleFinalSubmit()} className="bg-gray-900 text-white rounded px-6 h-9 font-bold uppercase text-xs tracking-wide">
                            {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Final Submission'}
                         </Button>
                      </div>
                   </div>
                </div>
              )}

              {currentSection === 'sellerProfile' && (
                <div className="space-y-6 animate-in fade-in duration-300 min-w-0 w-full">
                   <div>
                      <h2 className="text-xl font-bold text-slate-800">Seller Profile</h2>
                      <p className="text-sm text-slate-500">Summary of your Personal Profile with GeM</p>
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                      <div>
                         <label className="block text-xs font-bold text-slate-600 mb-1">First Name</label>
                         <div className="bg-gray-100 border border-gray-200 px-4 py-2.5 rounded text-sm text-slate-700 font-medium">
                            {user?.name ? user.name.split(' ')[0] : '-'}
                         </div>
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-slate-600 mb-1">Last Name</label>
                         <div className="bg-gray-100 border border-gray-200 px-4 py-2.5 rounded text-sm text-slate-700 font-medium">
                            {user?.name ? user.name.split(' ').slice(1).join(' ') || '-' : '-'}
                         </div>
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-slate-600 mb-1">Mobile</label>
                         <div className="bg-gray-100 border border-gray-200 px-4 py-2.5 rounded text-sm text-slate-700 font-medium">
                            {formData.mobile || user?.phone || '9356150561'}
                         </div>
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-slate-600 mb-1">Email Id</label>
                         <div className="bg-gray-100 border border-gray-200 px-4 py-2.5 rounded text-sm text-slate-700 font-medium">
                            {user?.email || '-'}
                         </div>
                      </div>
                      <div>
                         <label className="block text-xs font-bold text-slate-600 mb-1">Roles</label>
                         <div className="bg-gray-100 border border-gray-200 px-4 py-2.5 rounded text-sm text-slate-700 font-medium">
                            Primary Seller
                         </div>
                      </div>
                   </div>
                </div>
              )}

              {currentSection === 'updateAadhaar' && (
                <div className="space-y-6 animate-in fade-in duration-300 min-w-0 w-full">
                   <h2 className="text-xl font-bold text-slate-800">Update Aadhaar</h2>
                   <div className="bg-blue-50 text-blue-800 p-4 rounded text-sm border border-blue-100 font-medium">
                      On Aadhaar update, Key Person Validation has to be reverified
                   </div>
                   <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                      <Input 
                        label="Aadhaar Number / Virtual ID*" 
                        placeholder="Enter Aadhaar number / Virtual ID"
                        value={aadhaarData.number}
                        onChange={(e) => setAadhaarData(p => ({...p, number: e.target.value}))}
                      />
                      <Input 
                        label="Mobile number linked with Aadhaar*" 
                        placeholder="Enter mobile number linked with Aadhaar"
                        value={aadhaarData.mobile}
                        onChange={(e) => setAadhaarData(p => ({...p, mobile: e.target.value}))}
                      />
                   </div>
                   <div className="border border-gray-200 rounded-lg p-4 bg-gray-50/50 flex gap-3 items-start">
                      <input 
                        type="checkbox" 
                        checked={aadhaarData.consent}
                        onChange={(e) => setAadhaarData(p => ({...p, consent: e.target.checked}))}
                        className="mt-1.5 h-4 w-4" 
                      />
                      <div className="text-xs text-slate-600 space-y-2">
                         <p>I, the holder of the above Aadhaar, hereby give my consent to GeM ( Government e Marketplace), for using my Aadhaar number as allotted by UIDAI for GeM Registration. GeM ( Government e Marketplace) ,have informed me that my aadhaar data will not be stored/shared.</p>
                         <p className="font-medium">मैं, उपर्युक्त आधार का धारक, भारतीय विशिष्ट पहचान प्राधिकरण द्वारा आवंटित अपने आधार नंबर को जेम पंजीकरण हेतु प्रयोग में लाने हेतु जेम (गवर्नमेंट ई-मार्केटप्लेस) को एतदद्वारा अपनी सहमति प्रदान करता हूँ। जेम (गवर्नमेंट ई-मार्केटप्लेस) ने मुझे अवगत कराया है कि मेरे आधार डेटा को संग्रहीत/साझा नहीं किया जाएगा।</p>
                      </div>
                   </div>
                   <div className="space-y-2">
                      <p className="text-xs font-medium text-slate-500">Click on the play button to listen consent / सहमति सुनने के लिए प्ले बटन पर क्लिक करें।</p>
                      <audio controls className="w-full max-w-md h-10">
                         <source src="" type="audio/mpeg" />
                         Your browser does not support the audio element.
                      </audio>
                   </div>
                   <div className="flex justify-end border-t border-gray-100 pt-6">
                      <Button disabled className="bg-gray-300 text-gray-500 rounded px-6 h-10 font-bold uppercase text-xs tracking-wide">
                         Verify Aadhaar
                      </Button>
                   </div>
                </div>
              )}

              {currentSection === 'changePassword' && (
                <div className="space-y-6 animate-in fade-in duration-300 min-w-0 w-full">
                   <div>
                      <h2 className="text-xl font-bold text-slate-800">Change Password</h2>
                      <p className="text-sm text-slate-500">Password must fulfill password policy</p>
                   </div>
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-8 border-t border-gray-100 gap-4">
                      <p className="text-sm font-medium text-slate-700">Please complete OTP verification, by clicking the below button to proceed with change of password.</p>
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-8 h-10 font-bold uppercase text-xs tracking-wide whitespace-nowrap shadow-md shadow-blue-100">
                         Get OTP
                      </Button>
                   </div>
                </div>
              )}

              {currentSection === 'changeEmail' && (
                <div className="space-y-2 animate-in fade-in duration-300 min-w-0 w-full">
                   <div>
                      <p className="text-sm text-slate-500">Please note that the new email ID will be used for business done on GeM</p>
                   </div>
                   <div className="bg-blue-50/50 border border-blue-200 rounded-lg p-5 space-y-2 mt-4">
                      <h4 className="text-red-600 font-black text-sm">Important Update on Bid Notifications</h4>
                      <p className="text-sm text-slate-600 leading-relaxed">This is to inform you that, to receive bid notifications on your updated email ID, you are required to click on the <span className="font-bold text-slate-800">Ongoing Bids</span> page at least once. Until this action is completed, bid notifications will not be delivered to the updated email address.</p>
                   </div>
                   <div className="space-y-6 pt-4">
                      <div className="max-w-md">
                         <label className="block text-xs font-bold text-slate-600 mb-1">Current Email ID</label>
                         <div className="bg-gray-100 border border-gray-200 px-4 py-3 rounded text-sm text-slate-700 font-medium">
                            {user?.email || 'mukundmeheta@gmail.com'}
                         </div>
                      </div>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                         <Input 
                           label="Email Id *" 
                           placeholder="Please enter your email address"
                           value={emailData.newEmail}
                           onChange={(e) => setEmailData(p => ({...p, newEmail: e.target.value}))}
                         />
                         <Input 
                           label="Verify Email Id *" 
                           placeholder="Please enter your email address"
                           value={emailData.verifyEmail}
                           onChange={(e) => setEmailData(p => ({...p, verifyEmail: e.target.value}))}
                         />
                      </div>
                   </div>
                   <div className="flex justify-end border-t border-gray-100 pt-6">
                      <Button disabled className="bg-gray-300 text-gray-500 rounded px-8 h-10 font-bold uppercase text-xs tracking-wide shadow-sm">
                         Send OTP
                      </Button>
                   </div>
                </div>
              )}

              {currentSection === 'closeAccount' && (
                <div className="space-y-6 animate-in fade-in duration-300 min-w-0 w-full">
                   <div className="bg-[#fff8e1] border border-[#ffe082] p-4 rounded-lg text-xs text-slate-800 space-y-2 font-medium">
                      <div className="flex gap-2 items-start">
                         <Info className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                         <p>Please complete your profile to start transacting on GeM</p>
                      </div>
                      <div className="flex gap-2 items-start">
                         <Info className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                         <p>Kindly verify Business PAN, Registered address and CIN (for companies) to view GeM Seller ID.</p>
                      </div>
                      <div className="flex gap-2 items-start">
                         <Info className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                         <p>Please complete 'Beneficial Ownership Compliance'. <span className="text-blue-600 cursor-pointer hover:underline">Click here</span></p>
                      </div>
                   </div>
                   
                   <div>
                      <h2 className="text-xl font-bold text-slate-800">Close Account</h2>
                      <p className="mt-2 text-sm text-slate-600 font-medium">If you close your account, your account will be closed permanently. You will not be able to login with this account. In addition, all the secondary seller accounts will also be closed.</p>
                   </div>
                   
                   <div className="bg-blue-50 border border-blue-100 text-slate-700 text-sm p-5 rounded-lg">
                      You are advised to check and validate your bank account detail before closing your seller account at GeM. The bank account details cannot be updated once the account is closed which may hamper refund of the caution money.
                   </div>
                   
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-8 border-t border-gray-100 gap-4">
                      <p className="text-sm text-slate-700 font-medium">To close your account permanently click on</p>
                      <Button className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg px-6 h-10 font-bold uppercase text-xs tracking-wide shadow-md shadow-blue-100 whitespace-nowrap">
                         Close Account
                      </Button>
                   </div>
                </div>
              )}
              </fieldset>
              )}
            </CardContent>
          </Card>

          <div className="mt-8 flex items-center justify-between p-4 bg-blue-600 rounded-2xl shadow-md shadow-blue-100 animate-in slide-in-from-bottom-4 duration-500">
             <div className="text-white">
                <p className="text-[10px] font-bold uppercase tracking-wide opacity-80">Next Step Recommendation</p>
                <p className="text-sm font-bold uppercase">Proceed to Next Mandatory Section</p>
             </div>
             <button 
               onClick={() => {
                 const sections = ['pan', 'details', 'additional', 'offices', 'bank', 'einvoicing', 'ownership'];
                 const nextIdx = sections.indexOf(currentSection) + 1;
                 if (nextIdx < sections.length) setCurrentSection(sections[nextIdx]);
               }}
               className="bg-white text-blue-600 h-10 w-10 rounded-xl flex items-center justify-center shadow hover:-translate-x-1 transition-transform"
             >
                <ArrowRight className="h-5 w-5" />
             </button>
          </div>
        </div>
      </div>
    </div>
  );
}
