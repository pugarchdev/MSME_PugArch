import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../lib/api';
import { openFileAsset } from '../lib/files';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { indiaStates, indiaStatesDistricts } from '../data/indiaStatesDistricts';
import { toast } from 'sonner';
import { 
  Save, 
  UploadCloud, 
  CheckCircle2, 
  Info, 
  FileText, 
  Lock, 
  X, 
  ArrowLeft, 
  ArrowRight,
  Circle,
  Loader2,
  Trash2,
  ExternalLink,
  ChevronRight
} from 'lucide-react';
import { cn } from '../lib/utils';

interface Step {
  number: number;
  label: string;
  desc: string;
}

const steps: Step[] = [
  { number: 1, label: 'SHG Verification', desc: 'Registration & activity details' },
  { number: 2, label: 'Leader Details', desc: 'Primary contact information' },
  { number: 3, label: 'Bank Details', desc: 'Group bank account information' },
  { number: 4, label: 'Member Information', desc: 'Office bearers & strength' },
  { number: 5, label: 'Business / Activity', desc: 'Products, income & market' },
  { number: 6, label: 'Documents Upload', desc: 'Mandatory & optional documents' },
  { number: 7, label: 'Review & Submit', desc: 'Verify and submit application' }
];

const SHG_TYPES = {
  'women_shg': 'Women SHG',
  'farmer_shg': 'Farmer SHG / Producer Group',
  'artisan_shg': 'Artisan SHG',
  'dairy_shg': 'Dairy Cooperatives / SHG',
  'livelihood_shg': 'Livelihood SHG',
  'tribal_shg': 'Tribal SHG',
  'youth_shg': 'Youth SHG',
  'other_shg': 'Other Self-Help Group'
};

const MONTHLY_INCOMES = [
  { value: 'less_than_10k', label: 'Less than ₹10,000' },
  { value: '10k_to_25k', label: '₹10,000 - ₹25,000' },
  { value: '25k_to_50k', label: '₹25,000 - ₹50,000' },
  { value: 'more_than_50k', label: 'More than ₹50,000' }
];

const MARKET_AREAS = [
  { value: 'local', label: 'Local Village / Town' },
  { value: 'district', label: 'District Level' },
  { value: 'state', label: 'State Level' },
  { value: 'national', label: 'National Level' }
];

const LEADER_ROLES = ['President', 'Secretary', 'Treasurer', 'Leader', 'Coordinator', 'Other'];

export default function ShgOnboarding() {
  const { user } = useAuth();
  const [me, setMe] = useState<any>(null);
  const [currentStep, setCurrentStep] = useState(1);
  const [isFetching, setIsFetching] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isUploadingMap, setIsUploadingMap] = useState<Record<string, boolean>>({});
  const [sellerDocuments, setSellerDocuments] = useState<any[]>([]);
  const [onboardingStatus, setOnboardingStatus] = useState('pending');
  const [isProfileLocked, setIsProfileLocked] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    // Step 1: SHG Verification
    shgRegistrationNumber: '',
    nrlmId: '',
    mainActivity: '',
    registrationStatus: '',
    shgType: 'women_shg',
    shgName: '',
    state: '',
    district: '',
    village: '',
    formationYear: '',

    // Step 2: Leader Details
    leaderName: '',
    leaderRole: '',
    leaderMobile: '',
    alternateMobile: '',
    leaderEmail: '',

    // Step 3: Bank Details
    bankName: '',
    accountHolderName: '',
    accountNumber: '',
    ifscCode: '',
    branchName: '',

    // Step 4: Member Information
    totalMembers: '',
    presidentName: '',
    secretaryName: '',
    treasurerName: '',

    // Step 5: Business / Activity
    primaryProduct: '',
    monthlyIncomeRange: '',
    yearsOfOperation: '',
    marketArea: ''
  });

  const [otpSent, setOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [submitOtp, setSubmitOtp] = useState('');
  const [declarationAccepted, setDeclarationAccepted] = useState(true);

  const fetchMe = useCallback(async () => {
    try {
      const res = await api.fetch('/api/auth/me', {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
      });
      if (res.ok) {
        const data = await res.json();
        setMe(data);
        const reg = data.user?.registrationDetails || {};
        const prof = data.profile || {};
        setSellerDocuments(prof.sellerDocuments || []);

        if (!data.profile && data.user?.role === 'seller') {
          const initialPayload = {
            pan: reg.pan || `PENDING${data.user.id}`,
            businessName: reg.shgName || reg.businessName || data.user.name || '',
            mobile: reg.leaderMobile || data.user.mobile || '',
            roleInOrg: reg.leaderRole || '',
            registrationDetails: {
              shgType: reg.shgType || reg.businessType || 'women_shg',
              shgName: reg.shgName || reg.businessName || data.user.name || '',
              state: reg.state || '',
              district: reg.district || '',
              village: reg.village || '',
              formationYear: reg.formationYear || '',
              totalMembers: reg.totalMembers || reg.memberCount || '',
              mainActivity: reg.mainActivity || '',
              registrationStatus: reg.registrationStatus || '',
              ...reg
            }
          };

          api.post('/api/seller/register', initialPayload, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
          }).then(registerRes => {
            if (registerRes.ok) {
              registerRes.json().then(registerData => {
                const updatedProfile = registerData.profile || registerData;
                if (updatedProfile) {
                  setMe(prev => prev ? { ...prev, profile: updatedProfile } : prev);
                  setSellerDocuments(updatedProfile.sellerDocuments || []);
                }
              });
            }
          }).catch(err => {
            console.error('Failed to auto-create profile', err);
          });
        }

        setFormData(prev => ({
          ...prev,
          // Step 1: SHG Verification
          shgRegistrationNumber: reg.shgRegistrationNumber || '',
          nrlmId: reg.nrlmId || '',
          mainActivity: reg.mainActivity || '',
          registrationStatus: reg.registrationStatus || '',
          shgType: reg.shgType || reg.businessType || 'women_shg',
          shgName: reg.shgName || reg.businessName || data.user?.name || '',
          state: reg.state || '',
          district: reg.district || '',
          village: reg.village || '',
          formationYear: reg.formationYear || '',
          // Step 2: Leader Details
          leaderName: reg.leaderName || data.user?.name || '',
          leaderRole: reg.leaderRole || '',
          leaderMobile: reg.leaderMobile || data.user?.mobile || '',
          alternateMobile: reg.alternateMobile || '',
          leaderEmail: reg.leaderEmail || data.user?.email || '',
          // Step 3: Bank Details
          bankName: reg.bankName || '',
          accountHolderName: reg.accountHolderName || '',
          accountNumber: reg.accountNumber || '',
          ifscCode: reg.ifscCode || '',
          branchName: reg.branchName || '',
          // Step 4: Member Information
          totalMembers: reg.totalMembers || reg.memberCount || '',
          presidentName: reg.presidentName || '',
          secretaryName: reg.secretaryName || '',
          treasurerName: reg.treasurerName || '',
          // Step 5: Business / Activity
          primaryProduct: reg.primaryProduct || '',
          monthlyIncomeRange: reg.monthlyIncomeRange || '',
          yearsOfOperation: reg.yearsOfOperation || '',
          marketArea: reg.marketArea || ''
        }));

        setOnboardingStatus(data.user?.onboardingStatus || 'pending');
        setIsProfileLocked(
          data.user?.onboardingStatus === 'approved_for_procurement' || 
          data.user?.sectionStatus?.submitted === true ||
          data.user?.onboardingStatus === 'under_compliance_review'
        );
      }
    } catch (err) {
      toast.error('Failed to load user profile details');
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchMe();
  }, [fetchMe]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleNumericChange = (e: React.ChangeEvent<HTMLInputElement>, name: string, maxLen = 10) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, maxLen);
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const validateStep = (stepNum: number, silent = false): boolean => {
    switch (stepNum) {
      case 1:
        if (!formData.shgType) {
          if (!silent) toast.error('SHG Type is required');
          return false;
        }
        if (!formData.shgName.trim()) {
          if (!silent) toast.error('SHG Name is required');
          return false;
        }
        if (!formData.state) {
          if (!silent) toast.error('State is required');
          return false;
        }
        if (!formData.district) {
          if (!silent) toast.error('District is required');
          return false;
        }
        if (!formData.village.trim()) {
          if (!silent) toast.error('Village is required');
          return false;
        }
        const year = parseInt(formData.formationYear, 10);
        const currentYear = new Date().getFullYear();
        if (isNaN(year) || year < 1900 || year > currentYear) {
          if (!silent) toast.error(`Please enter a valid Formation Year (between 1900 and ${currentYear})`);
          return false;
        }
        const memCount = parseInt(formData.totalMembers, 10);
        if (isNaN(memCount) || memCount < 3) {
          if (!silent) toast.error('Number of Members must be at least 3');
          return false;
        }
        if (!formData.mainActivity.trim()) {
          if (!silent) toast.error('Main Activity is required');
          return false;
        }
        if (!formData.registrationStatus) {
          if (!silent) toast.error('Registration Status is required');
          return false;
        }
        return true;
      case 2:
        if (!formData.leaderName.trim()) {
          if (!silent) toast.error('Leader Name is required');
          return false;
        }
        if (!formData.leaderRole) {
          if (!silent) toast.error('Leader Role is required');
          return false;
        }
        if (!/^[6-9]\d{9}$/.test(formData.leaderMobile)) {
          if (!silent) toast.error('Enter a valid 10-digit Leader Mobile Number');
          return false;
        }
        if (formData.alternateMobile && !/^[6-9]\d{9}$/.test(formData.alternateMobile)) {
          if (!silent) toast.error('Enter a valid 10-digit Alternate Mobile Number');
          return false;
        }
        if (formData.leaderEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.leaderEmail)) {
          if (!silent) toast.error('Enter a valid Email Address');
          return false;
        }
        return true;
      case 3:
        if (!formData.bankName.trim()) {
          if (!silent) toast.error('Bank Name is required');
          return false;
        }
        if (!formData.accountHolderName.trim()) {
          if (!silent) toast.error('Account Holder Name is required');
          return false;
        }
        if (!formData.accountNumber.trim()) {
          if (!silent) toast.error('Account Number is required');
          return false;
        }
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(formData.ifscCode.toUpperCase())) {
          if (!silent) toast.error('Enter a valid 11-digit IFSC code (e.g. SBIN0123456)');
          return false;
        }
        if (!formData.branchName.trim()) {
          if (!silent) toast.error('Branch Name is required');
          return false;
        }
        return true;
      case 4:
        const tm = parseInt(formData.totalMembers, 10);
        if (isNaN(tm) || tm < 3) {
          if (!silent) toast.error('Total Members must be at least 3');
          return false;
        }
        if (!formData.presidentName.trim()) {
          if (!silent) toast.error('President Name is required');
          return false;
        }
        if (!formData.secretaryName.trim()) {
          if (!silent) toast.error('Secretary Name is required');
          return false;
        }
        if (!formData.treasurerName.trim()) {
          if (!silent) toast.error('Treasurer Name is required');
          return false;
        }
        return true;
      case 5:
        if (!formData.primaryProduct.trim()) {
          if (!silent) toast.error('Primary Product or Service is required');
          return false;
        }
        if (!formData.monthlyIncomeRange) {
          if (!silent) toast.error('Monthly Income Range is required');
          return false;
        }
        if (!formData.yearsOfOperation.trim() || isNaN(parseInt(formData.yearsOfOperation, 10))) {
          if (!silent) toast.error('Years of Operation is required');
          return false;
        }
        if (!formData.marketArea) {
          if (!silent) toast.error('Market Area is required');
          return false;
        }
        return true;
      case 6:
        // Validate required documents
        const uploadedTypes = sellerDocuments.map(d => d.documentType);
        const mandatoryDocs = ['leader_aadhaar', 'bank_passbook', 'member_list', 'address_proof'];
        const missing = mandatoryDocs.filter(doc => !uploadedTypes.includes(doc));
        if (missing.length > 0) {
          if (!silent) {
            const docLabels: Record<string, string> = {
              leader_aadhaar: 'Group Leader Aadhaar Card',
              bank_passbook: 'Bank Passbook / Cancelled Cheque',
              member_list: 'Member List',
              address_proof: 'Address Proof'
            };
            toast.error(`Please upload mandatory documents: ${missing.map(m => docLabels[m] || m).join(', ')}`);
          }
          return false;
        }
        return true;
      default:
        return true;
    }
  };

  const handleSaveDraft = async (showSuccess = true) => {
    setIsLoading(true);
    try {
      const payload = {
        pan: me?.profile?.pan || me?.user?.registrationDetails?.pan || `PENDING${me?.user?.id}`,
        businessName: formData.shgName || me?.user?.registrationDetails?.businessName || me?.user?.name || formData.leaderName,
        mobile: formData.leaderMobile,
        roleInOrg: formData.leaderRole,
        registrationDetails: {
          ...formData
        }
      };

      const res = await api.post('/api/seller/register', payload, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
      });

      if (res.ok) {
        if (showSuccess) toast.success('Draft saved successfully.');
        await fetchMe();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || 'Failed to save draft onboarding data');
      }
    } catch {
      toast.error('Network error saving draft');
    } finally {
      setIsLoading(false);
    }
  };

  const handleNext = async () => {
    if (isProfileLocked) {
      if (currentStep < 7) setCurrentStep(currentStep + 1);
      return;
    }

    if (!validateStep(currentStep)) return;

    // Save draft auto-continue
    await handleSaveDraft(false);
    if (currentStep < 7) setCurrentStep(currentStep + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(currentStep - 1);
  };

  const handleUploadDocument = async (documentType: string, file: File) => {
    if (isProfileLocked) return;

    // File validation: PDF, JPG, JPEG, PNG <= 10MB
    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
    const fileExt = file.name.split('.').pop()?.toLowerCase() || '';
    if (!allowedExtensions.includes(fileExt)) {
      toast.error('Only PDF, JPG, JPEG, and PNG files are allowed.');
      return;
    }
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File size must be less than 10MB.');
      return;
    }

    setIsUploadingMap(prev => ({ ...prev, [documentType]: true }));
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('documentType', documentType);

      const res = await api.fetch('/api/onboarding/upload-document', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`
        },
        body: fd
      });

      const data = await res.json();
      if (res.ok) {
        toast.success('Document uploaded successfully.');
        if (data.document && data.asset) {
          setSellerDocuments(current => [
            ...current.filter((doc: any) => doc.documentType !== documentType),
            { ...data.document, fileAsset: data.asset }
          ]);
        }
        await fetchMe();
      } else {
        toast.error(data.message || 'Failed to upload document.');
      }
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload document due to a network error.');
    } finally {
      setIsUploadingMap(prev => ({ ...prev, [documentType]: false }));
    }
  };

  const handleRequestOtp = async () => {
    if (!declarationAccepted) {
      toast.error('Please accept the declaration checkbox first.');
      return;
    }

    setIsSendingOtp(true);
    try {
      const res = await api.post('/api/seller/ownership/send-otp', {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setOtpSent(true);
        setSubmitOtp('');
        toast.success(`Submission verification OTP sent to your registered email address.`);
      } else {
        toast.error(data.message || 'Failed to request OTP');
      }
    } catch {
      toast.error('Failed to request OTP due to a network error.');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (!declarationAccepted) {
      toast.error('Accept the beneficial declaration first.');
      return;
    }
    if (!submitOtp || !/^\d{6}$/.test(submitOtp)) {
      toast.error('Please enter a valid 6-digit OTP.');
      return;
    }

    setIsLoading(true);
    try {
      const res = await api.post('/api/seller/submit', { otp: submitOtp }, {
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${localStorage.getItem('token') || ''}`
        }
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        toast.success('Onboarding application submitted successfully!');
        setIsProfileLocked(true);
        setOnboardingStatus('under_compliance_review');
      } else {
        toast.error(data.message || 'Onboarding submission failed.');
      }
    } catch {
      toast.error('Network error during final onboarding submission.');
    } finally {
      setIsLoading(false);
    }
  };

  const documentList = [
    // Mandatory Documents
    { id: 'leader_aadhaar', label: 'Group Leader Aadhaar Card *', desc: 'Scanned copy of Aadhaar Card of the SHG Leader.' },
    { id: 'bank_passbook', label: 'Bank Passbook / Cancelled Cheque *', desc: 'First page of passbook showing Account No. and IFSC.' },
    { id: 'member_list', label: 'Member List *', desc: 'List of all active group members with signatures.' },
    { id: 'address_proof', label: 'Address Proof *', desc: 'Aadhaar, Utility Bill or Local Authority certificate.' },

    // Optional Documents
    { id: 'registration_certificate', label: 'SHG Registration Certificate', desc: 'Certificate issued by NRLM/SRLM/Cooperative registrar.' },
    { id: 'pan_copy', label: 'PAN Card', desc: 'PAN Card of the SHG or Leader.' },
    { id: 'udyam_certificate', label: 'Udyam Registration Certificate', desc: 'Udyam registration certificate of the SHG.' },
    { id: 'gst_certificate', label: 'GST Certificate', desc: 'GST registration certificate of the SHG.' },
    { id: 'training_certificate', label: 'Training / Skill Certificates', desc: 'Certificates of any training or skills acquired by members.' },
    { id: 'product_photos', label: 'Product Photos / Catalogue', desc: 'Photos or catalog of SHG products.' }
  ];

  if (isFetching) {
    return (
      <div className="flex h-[400px] w-full items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="h-8 w-8 animate-spin text-[#12335f]" />
          <p className="text-sm font-semibold text-slate-500">Loading SHG Profile Details...</p>
        </div>
      </div>
    );
  }

  const completionPercentage = Math.round((currentStep / 7) * 100);

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 font-sans">
      <div className="flex flex-col gap-6">
        
        {/* Header Block */}
        <div className="bg-white border border-slate-200/80 rounded-xl p-6 shadow-sm flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
          <div>
            <h1 className="text-xl font-black text-slate-800 tracking-tight flex items-center gap-2">
              SHG ONBOARDING HUB
            </h1>
            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest mt-1">
              {me?.user?.registrationDetails?.businessName || me?.user?.name || 'Self-Help Group Profile'}
            </p>
          </div>
          <div className="flex items-center gap-4 bg-slate-50 border border-slate-100 rounded-xl px-5 py-3 shrink-0">
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Onboarding Status</span>
              <span className={cn(
                "text-xs font-extrabold capitalize px-2 py-0.5 rounded-full inline-block mt-1",
                onboardingStatus === 'approved_for_procurement' ? "bg-emerald-100 text-emerald-700" :
                onboardingStatus === 'under_compliance_review' ? "bg-amber-100 text-amber-700" : "bg-blue-100 text-[#12335f]"
              )}>
                {onboardingStatus.replace(/_/g, ' ')}
              </span>
            </div>
            <div className="h-10 w-[1px] bg-slate-200" />
            <div className="text-right">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Progress</span>
              <span className="text-lg font-black text-[#12335f] mt-0.5 block">{completionPercentage}%</span>
            </div>
          </div>
        </div>

        {/* Custom Onboarding Steps Container */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 items-start">
          
          {/* Left Side: Step Indicator Sidebar */}
          <div className="lg:col-span-1 bg-white border border-slate-200/80 rounded-xl shadow-sm overflow-hidden p-4">
            <div className="mb-4 pb-3 border-b border-slate-100">
              <h2 className="text-xs font-black uppercase text-slate-400 tracking-wider">SHG ONBOARDING</h2>
              <p className="text-[10px] text-slate-500 font-semibold mt-1">Complete each section to register your Self Help Group.</p>
            </div>
            <div className="flex flex-row lg:flex-col gap-2 overflow-x-auto no-scrollbar py-1">
              {steps.map((s) => {
                const isCurrent = currentStep === s.number;
                const isDone = s.number === 7 ? isProfileLocked : (isProfileLocked || validateStep(s.number, true));
                return (
                  <button
                    key={s.number}
                    onClick={() => setCurrentStep(s.number)}
                    className={cn(
                      "flex items-center gap-3 px-3 py-3 rounded-lg text-left transition-all shrink-0 w-60 lg:w-full border border-transparent",
                      isCurrent ? "bg-slate-50 border-slate-100" : "hover:bg-slate-50/50"
                    )}
                  >
                    <div className={cn(
                      "h-7 w-7 rounded-full flex items-center justify-center font-bold text-xs shrink-0 transition-all border",
                      isCurrent ? "bg-[#12335f] text-white border-transparent" :
                      isDone ? "bg-green-100 text-green-600 border-transparent" : "bg-white text-slate-400 border-slate-200"
                    )}>
                      {isDone ? <CheckCircle2 className="h-4.5 w-4.5 text-green-600" /> : s.number}
                    </div>
                    <div className="min-w-0">
                      <span className={cn(
                        "text-xs font-black tracking-tight block",
                        isCurrent ? "text-slate-800" : "text-slate-500"
                      )}>
                        {s.label}
                      </span>
                      <span className="text-[9px] text-slate-400 font-medium truncate block mt-0.5">{s.desc}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right Side: Onboarding Forms Card */}
          <div className="lg:col-span-3 bg-white border border-slate-200/80 rounded-xl shadow-sm min-h-[450px] flex flex-col justify-between overflow-hidden">
            
            {/* Step Description Header inside the main panel */}
            <div className="bg-slate-50/50 border-b border-slate-100 px-6 py-4 flex justify-between items-center">
              <div>
                <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">{steps[currentStep - 1].label}</h3>
                <p className="text-[11px] text-slate-500 font-semibold mt-0.5">{steps[currentStep - 1].desc}</p>
              </div>
              <div className="text-right shrink-0">
                <span className="text-[10px] font-bold text-slate-400 uppercase">Step {currentStep} of 7</span>
                <div className="h-1.5 w-24 bg-slate-200 rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-[#12335f] transition-all" style={{ width: `${completionPercentage}%` }} />
                </div>
              </div>
            </div>

            {/* Main Content Form Section */}
            <CardContent className="p-6 flex-1">
              <fieldset disabled={isProfileLocked} className="space-y-6">
                
                {/* STEP 1: SHG Verification */}
                {currentStep === 1 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">SHG Type *</label>
                      <Select
                        name="shgType"
                        value={formData.shgType}
                        onChange={handleChange}
                        className="h-10 border-slate-200 rounded text-xs text-slate-700 focus:ring-[#12335f]"
                      >
                        {Object.entries(SHG_TYPES).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">SHG Name *</label>
                      <Input
                        name="shgName"
                        value={formData.shgName}
                        onChange={handleChange}
                        placeholder="Enter SHG name"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">State *</label>
                      <Select
                        name="state"
                        value={formData.state}
                        onChange={(e) => {
                          const val = e.target.value;
                          setFormData(prev => ({ ...prev, state: val, district: '' }));
                        }}
                        className="h-10 border-slate-200 rounded text-xs text-slate-700 focus:ring-[#12335f]"
                      >
                        <option value="">Select State</option>
                        {indiaStates.map(state => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">District *</label>
                      <Select
                        name="district"
                        value={formData.district}
                        onChange={handleChange}
                        disabled={!formData.state}
                        className="h-10 border-slate-200 rounded text-xs text-slate-700 focus:ring-[#12335f] disabled:bg-slate-50"
                      >
                        <option value="">Select District</option>
                        {(formData.state ? indiaStatesDistricts[formData.state] || [] : []).map(dist => (
                          <option key={dist} value={dist}>{dist}</option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Village *</label>
                      <Input
                        name="village"
                        value={formData.village}
                        onChange={handleChange}
                        placeholder="Enter village name"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Formation Year *</label>
                      <Input
                        name="formationYear"
                        value={formData.formationYear}
                        onChange={(e) => handleNumericChange(e, 'formationYear', 4)}
                        placeholder="Enter formation year"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Number of Members *</label>
                      <Input
                        name="totalMembers"
                        value={formData.totalMembers}
                        onChange={(e) => handleNumericChange(e, 'totalMembers', 4)}
                        placeholder="Enter number of members"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Registration Status *</label>
                      <Select
                        name="registrationStatus"
                        value={formData.registrationStatus}
                        onChange={handleChange}
                        className="h-10 border-slate-200 rounded text-xs text-slate-700 focus:ring-[#12335f]"
                      >
                        <option value="">Select...</option>
                        <option value="registered">Registered</option>
                        <option value="unregistered">Unregistered</option>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">SHG Registration Number</label>
                      <Input
                        name="shgRegistrationNumber"
                        value={formData.shgRegistrationNumber}
                        onChange={handleChange}
                        placeholder="e.g. SHG/2023/001234"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                      <span className="text-[10px] text-slate-400 font-semibold block">Optional</span>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">NRLM / SRLM ID</label>
                      <Input
                        name="nrlmId"
                        value={formData.nrlmId}
                        onChange={handleChange}
                        placeholder="e.g. NRLM123456"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                      <span className="text-[10px] text-slate-400 font-semibold block">Optional</span>
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Main Activity *</label>
                      <textarea
                        name="mainActivity"
                        value={formData.mainActivity}
                        onChange={handleChange}
                        placeholder="Describe the main activity of your SHG (e.g. dairy farming, handicrafts, tailoring)"
                        rows={3}
                        className="w-full p-3 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#12335f] bg-white resize-none"
                      />
                    </div>
                  </div>
                )}

                {/* STEP 2: Leader Details */}
                {currentStep === 2 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Leader Name *</label>
                      <Input
                        name="leaderName"
                        value={formData.leaderName}
                        onChange={handleChange}
                        placeholder="Full name"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Role *</label>
                      <Select
                        name="leaderRole"
                        value={formData.leaderRole}
                        onChange={handleChange}
                        className="h-10 border-slate-200 rounded text-xs text-slate-700 focus:ring-[#12335f]"
                      >
                        <option value="">Select...</option>
                        {LEADER_ROLES.map(role => (
                          <option key={role} value={role}>{role}</option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Mobile Number *</label>
                      <Input
                        name="leaderMobile"
                        value={formData.leaderMobile}
                        onChange={(e) => handleNumericChange(e, 'leaderMobile', 10)}
                        placeholder="10-digit mobile"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Alternate Mobile Number</label>
                      <Input
                        name="alternateMobile"
                        value={formData.alternateMobile}
                        onChange={(e) => handleNumericChange(e, 'alternateMobile', 10)}
                        placeholder="Optional"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Email Address</label>
                      <Input
                        name="leaderEmail"
                        value={formData.leaderEmail}
                        onChange={handleChange}
                        placeholder="name@example.com"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                      <span className="text-[10px] text-slate-400 font-semibold block">Optional</span>
                    </div>
                  </div>
                )}

                {/* STEP 3: Bank Details */}
                {currentStep === 3 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Bank Name *</label>
                      <Input
                        name="bankName"
                        value={formData.bankName}
                        onChange={handleChange}
                        placeholder="e.g. State Bank of India"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Account Holder Name *</label>
                      <Input
                        name="accountHolderName"
                        value={formData.accountHolderName}
                        onChange={handleChange}
                        placeholder="Enter account holder name"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Account Number *</label>
                      <Input
                        name="accountNumber"
                        value={formData.accountNumber}
                        onChange={(e) => handleNumericChange(e, 'accountNumber', 18)}
                        placeholder="Enter account number"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">IFSC Code *</label>
                      <Input
                        name="ifscCode"
                        value={formData.ifscCode}
                        onChange={(e) => setFormData(prev => ({ ...prev, ifscCode: e.target.value.toUpperCase().slice(0, 11) }))}
                        placeholder="E.G. SBIN0123456"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Branch Name *</label>
                      <Input
                        name="branchName"
                        value={formData.branchName}
                        onChange={handleChange}
                        placeholder="Enter branch name"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>
                  </div>
                )}

                {/* STEP 4: Member Information */}
                {currentStep === 4 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Total Members *</label>
                      <Input
                        name="totalMembers"
                        value={formData.totalMembers}
                        onChange={(e) => handleNumericChange(e, 'totalMembers', 4)}
                        placeholder="Enter total members"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                      <span className="text-[10px] text-slate-400 font-semibold block">Minimum 3 members</span>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">President Name *</label>
                      <Input
                        name="presidentName"
                        value={formData.presidentName}
                        onChange={handleChange}
                        placeholder="Enter president's name"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Secretary Name *</label>
                      <Input
                        name="secretaryName"
                        value={formData.secretaryName}
                        onChange={handleChange}
                        placeholder="Enter secretary's name"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Treasurer Name *</label>
                      <Input
                        name="treasurerName"
                        value={formData.treasurerName}
                        onChange={handleChange}
                        placeholder="Enter treasurer's name"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>
                  </div>
                )}

                {/* STEP 5: Business / Activity */}
                {currentStep === 5 && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Primary Product or Service *</label>
                      <Input
                        name="primaryProduct"
                        value={formData.primaryProduct}
                        onChange={handleChange}
                        placeholder="e.g. Handwoven sarees"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Monthly Income Range *</label>
                      <Select
                        name="monthlyIncomeRange"
                        value={formData.monthlyIncomeRange}
                        onChange={handleChange}
                        className="h-10 border-slate-200 rounded text-xs text-slate-700 focus:ring-[#12335f]"
                      >
                        <option value="">Select...</option>
                        {MONTHLY_INCOMES.map(item => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Years of Operation *</label>
                      <Input
                        name="yearsOfOperation"
                        value={formData.yearsOfOperation}
                        onChange={(e) => handleNumericChange(e, 'yearsOfOperation', 2)}
                        placeholder="Enter years of operation"
                        className="h-10 border-slate-200 rounded text-xs focus:ring-[#12335f]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="text-[11px] font-black uppercase text-slate-700 tracking-wider block">Market Area *</label>
                      <Select
                        name="marketArea"
                        value={formData.marketArea}
                        onChange={handleChange}
                        className="h-10 border-slate-200 rounded text-xs text-slate-700 focus:ring-[#12335f]"
                      >
                        <option value="">Select...</option>
                        {MARKET_AREAS.map(item => (
                          <option key={item.value} value={item.value}>{item.label}</option>
                        ))}
                      </Select>
                    </div>
                  </div>
                )}

                {/* STEP 6: Documents Upload */}
                {currentStep === 6 && (
                  <div className="space-y-6">
                    <div className="rounded-lg bg-blue-50 border border-blue-100 p-4 text-[11px] font-semibold text-blue-800 leading-relaxed">
                      Please upload scanned copy of mandatory verification documents. Uploaded files must be in PDF, JPG, JPEG, or PNG format and less than 10MB in size.
                    </div>

                    <div className="divide-y divide-slate-100">
                      {documentList.map((doc) => {
                        const isMandatory = ['leader_aadhaar', 'bank_passbook', 'member_list', 'address_proof'].includes(doc.id);

                        const uploadedDoc = sellerDocuments.find(d => d.documentType === doc.id);
                        const fileAsset = uploadedDoc?.fileAsset;
                        const isUploading = isUploadingMap[doc.id];
                        const verificationStatus = uploadedDoc?.verificationStatus || 'NOT_UPLOADED';

                        return (
                          <div key={doc.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div className="min-w-0 flex-1">
                              <h4 className="text-xs font-bold text-slate-800 tracking-tight">{doc.label}</h4>
                              <p className="text-[10px] text-slate-400 font-medium mt-0.5">{doc.desc}</p>
                              {fileAsset && (
                                <div className="mt-2 flex items-center gap-1.5 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 cursor-pointer" onClick={() => openFileAsset(fileAsset, doc.label)}>
                                  <FileText className="h-3.5 w-3.5" />
                                  <span className="underline truncate max-w-xs">{fileAsset.originalName || 'View Document'}</span>
                                  <ExternalLink className="h-3 w-3 inline" />
                                </div>
                              )}
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {/* Status Badge */}
                              <span className={cn(
                                "text-[9px] font-bold uppercase tracking-wider px-2 py-0.5 rounded",
                                verificationStatus === 'APPROVED' ? "bg-green-100 text-green-700" :
                                verificationStatus === 'PENDING' ? "bg-amber-100 text-amber-700" :
                                verificationStatus === 'REJECTED' ? "bg-red-100 text-red-700" : "bg-slate-100 text-slate-500"
                              )}>
                                {verificationStatus.replace(/_/g, ' ')}
                              </span>

                              {/* Action Buttons */}
                              {fileAsset && (
                                <button
                                  type="button"
                                  onClick={() => openFileAsset(fileAsset, doc.label)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-indigo-200 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-600 hover:text-indigo-800 text-[11px] font-bold cursor-pointer transition-all shadow-sm"
                                >
                                  <FileText className="h-3.5 w-3.5" />
                                  View
                                </button>
                              )}

                              {!isProfileLocked && (
                                <div className="relative">
                                  <input
                                    type="file"
                                    id={`file-input-${doc.id}`}
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleUploadDocument(doc.id, file);
                                    }}
                                    disabled={isUploading}
                                  />
                                  <label
                                    htmlFor={`file-input-${doc.id}`}
                                    className={cn(
                                      "inline-flex items-center gap-1.5 px-3 py-1.5 rounded text-[11px] font-bold cursor-pointer border shadow-sm transition-all",
                                      isUploading 
                                        ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed" 
                                        : fileAsset
                                          ? "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                                          : "bg-[#12335f] text-white border-transparent hover:bg-[#0c2340]"
                                    )}
                                  >
                                    {isUploading ? (
                                      <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin text-slate-400" />
                                        Uploading...
                                      </>
                                    ) : (
                                      <>
                                        <UploadCloud className="h-3.5 w-3.5" />
                                        {fileAsset ? 'Change' : 'Upload'}
                                      </>
                                    )}
                                  </label>
                                </div>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* STEP 7: Review & Submit */}
                {currentStep === 7 && (
                  <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
                    {!isProfileLocked ? (
                      <div className="w-full max-w-2xl bg-white border border-slate-200/80 rounded-xl p-8 space-y-6 shadow-sm">
                        <h3 className="text-sm font-black uppercase tracking-wider text-slate-800">
                          FINAL ONBOARDING SUBMISSION
                        </h3>
                        <p className="text-xs text-slate-500 font-semibold leading-relaxed">
                          OTP will be sent to your login email: <span className="font-bold text-slate-750">{me?.user?.email}</span>
                        </p>

                        <div className="flex flex-col sm:flex-row gap-3 items-center justify-center pt-2 max-w-lg mx-auto">
                          <Button
                            type="button"
                            onClick={handleRequestOtp}
                            disabled={isSendingOtp}
                            className="bg-slate-500 hover:bg-slate-650 text-white px-5 rounded h-10 font-bold uppercase text-[11px] tracking-wide shrink-0 min-w-[120px]"
                          >
                            {isSendingOtp ? (
                              <>
                                <Loader2 className="h-4 w-4 animate-spin mr-1.5 inline" />
                                Sending...
                              </>
                            ) : (
                              'SEND OTP'
                            )}
                          </Button>

                          <input
                            type="text"
                            maxLength={6}
                            value={submitOtp}
                            onChange={(e) => setSubmitOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                            placeholder="Enter 6-digit OTP"
                            disabled={!otpSent}
                            className="h-10 border border-slate-200 rounded-lg text-center font-bold tracking-widest text-slate-800 placeholder:text-slate-400 placeholder:font-semibold placeholder:tracking-normal text-xs focus:outline-none focus:ring-1 focus:ring-[#12335f] bg-white w-full max-w-[180px] disabled:bg-slate-100 disabled:cursor-not-allowed"
                          />

                          <Button
                            type="button"
                            onClick={handleFinalSubmit}
                            disabled={isLoading || !otpSent || submitOtp.length !== 6}
                            className="bg-[#12335f] hover:bg-[#0c2340] disabled:bg-slate-400 text-white px-5 rounded h-10 font-bold uppercase text-[11px] tracking-wide shrink-0 min-w-[140px]"
                          >
                            {isLoading ? (
                              <Loader2 className="h-4 w-4 animate-spin inline" />
                            ) : (
                              'FINAL SUBMISSION'
                            )}
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="py-8 flex flex-col items-center justify-center text-center animate-in fade-in duration-500 max-w-md mx-auto">
                        <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center mb-4 border-2 border-white shadow-sm">
                          <CheckCircle2 className="h-8 w-8 text-emerald-600" />
                        </div>
                        <h4 className="text-sm font-bold text-slate-800">Application Submitted For Scrutiny</h4>
                        <p className="mt-2 text-[11px] text-slate-500 font-semibold leading-relaxed">
                          Your Self-Help Group details are locked and currently under administrative review. You will receive notification on verification completion. Standard processing time is 3-5 business days.
                        </p>
                      </div>
                    )}
                  </div>
                )}
              </fieldset>
            </CardContent>

            {/* Bottom Footer Actions (Next, Back, Save Draft) */}
            <div className="bg-slate-50/50 border-t border-slate-100 px-6 py-4 flex items-center justify-between gap-3 shrink-0">
              <Button
                onClick={() => handleSaveDraft(true)}
                disabled={isLoading || isProfileLocked}
                variant="outline"
                className="h-10 px-4 text-xs font-bold border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5"
              >
                <Save className="h-4 w-4 text-slate-500" />
                Save as Draft
              </Button>

              <div className="flex items-center gap-3">
                <Button
                  onClick={handleBack}
                  disabled={currentStep === 1}
                  variant="outline"
                  className="h-10 px-4 text-xs font-bold border-slate-300 text-slate-700 hover:bg-slate-100 inline-flex items-center gap-1.5"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Back
                </Button>

                {currentStep < 7 ? (
                  <Button
                    onClick={handleNext}
                    className="bg-[#12335f] hover:bg-[#0c2340] text-white px-5 rounded h-10 font-bold uppercase text-[11px] tracking-wide inline-flex items-center gap-1.5 shadow-sm"
                  >
                    Next
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                ) : null}
              </div>
            </div>

          </div>

        </div>

      </div>
    </div>
  );
}
