import React, { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import { Card, CardHeader, CardTitle, CardContent } from '../ui/card';
import { Button } from '../ui/button';
import { Input, Select } from '../ui/input';
import { toast } from 'sonner';
import { 
  Building2, 
  UserCheck, 
  Mail, 
  Lock, 
  CheckCircle2, 
  ShieldCheck, 
  Fingerprint, 
  FileText,
  Key,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Info,
  EyeOff,
  Pencil
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { cn } from '../../lib/utils';
import { indiaStates, indiaStatesDistricts } from '../../data/indiaStatesDistricts';

interface RegistrationDetailsFlowProps {
  businessType: string;
  onBack: () => void;
  role: 'buyer' | 'seller';
}

const cooperativeOrganisationTypes = [
  'Proprietorship',
  'Partnership Firm',
  'Company (Pvt Ltd / Ltd)',
  'LLP',
  'MSME',
  'Startup'
];

const districtOrganisationOverrides: Record<string, string[]> = {
  'MAHARASHTRA:Mumbai': [
    'GS Mahanagar Co-operative Bank Ltd.',
    'Janakalyan Sahakari Bank Ltd.',
    'Maharashtra Rajya Machhimar Sahakari Sangh Ltd.',
    'Maharashtra Rajya Sahakari Dudh Mahasangh Maryadit'
  ],
  'MAHARASHTRA:Mumbai City': [
    'GS Mahanagar Co-operative Bank Ltd.',
    'Janakalyan Sahakari Bank Ltd.',
    'Maharashtra Rajya Machhimar Sahakari Sangh Ltd.',
    'Maharashtra Rajya Sahakari Dudh Mahasangh Maryadit'
  ],
  'MAHARASHTRA:Mumbai Suburban': [
    'GS Mahanagar Co-operative Bank Ltd.',
    'Janakalyan Sahakari Bank Ltd.',
    'Maharashtra Rajya Machhimar Sahakari Sangh Ltd.',
    'Maharashtra Rajya Sahakari Dudh Mahasangh Maryadit'
  ],
  'MAHARASHTRA:Pune': [
    'Maharashtra Rajya Sahakari Dudh Mahasangh Maryadit'
  ],
  'MAHARASHTRA:Latur': [
    'Maharashtra Rajya Sahakari Dudh Mahasangh Maryadit'
  ],
  'MAHARASHTRA:Nagpur': [
    'Maharashtra Rajya Sahakari Dudh Mahasangh Maryadit'
  ]
};

const getDistrictOrganisations = (state: string, district: string) => {
  if (!state || !district) return [];
  
  const overrides = districtOrganisationOverrides[`${state}:${district}`];
  if (overrides && overrides.length > 0) return overrides;

  // Fallback realistic dummy data for each district if no override exists
  return [
    `${district} District Central Co-operative Bank Ltd.`,
    `${district} Zilla Parishad Office`,
    `${district} Municipal Corporation / Nagar Palika`,
    `${state} State Electricity Distribution Co. Ltd - ${district} Division`,
    `${district} Sahakari Dudh Utpadak Sangh (Dairy)`,
    `Department of Agriculture - ${district} Unit`,
    `District Rural Development Agency (DRDA) - ${district}`,
    `Integrated Child Development Services (ICDS) - ${district} Project`
  ];
};

export default function RegistrationDetailsFlow({ businessType, onBack, role }: RegistrationDetailsFlowProps) {
  const [currentSubStep, setCurrentSubStep] = useState(1);
  const { login } = useAuth();
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingGst, setIsFetchingGst] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    businessName: '',
    industry: '',
    cin: '',
    gstin: '',
    udyamNumber: '',
    website: '',
    orgPan: '',
    personalVerificationMethod: role === 'buyer' ? 'aadhaar' : '', // 'aadhaar' | 'pan'
    aadhaarNumber: '',
    panNumber: '',
    personalName: '',
    personalLastName: '',
    dob: '',
    mobile: '',
    roleInOrg: '',
    email: '',
    verifyEmail: '',
    userId: '',
    password: '',
    confirmPassword: '',
    organisationType: '',
    state: '',
    district: '',
    organisation: '',
    officeZoneName: ''
  });

  const fetchGstDetails = async () => {
    if (!formData.gstin || formData.gstin.length !== 15) {
      toast.error('Please enter a valid 15-digit GSTIN');
      return;
    }

    setIsFetchingGst(true);
    try {
      const res = await api.fetch(`/api/utils/gst-verify/${formData.gstin}`);
      
      if (res.ok) {
        const data = await res.json();
        if (!data?.legalName || !data?.address) {
          toast.error('Live GST details are incomplete. Please verify GSTIN and enter details manually.');
          return;
        }
        setFormData((prev: any) => ({
          ...prev,
          businessName: data.legalName?.trim() || prev.businessName,
          orgPan: data.pan || prev.orgPan,
          state: data.state?.trim() || prev.state,
          district: data.city?.trim() || prev.district,
        }));
        toast.success(`GST verified: ${data.status || 'Status available'}`);
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || 'Could not fetch GST details');
      }
    } catch (err) {
      toast.error('Verification service unavailable');
    } finally {
      setIsFetchingGst(false);
    }
  };

  const [aadhaarOtp, setAadhaarOtp] = useState('');
  const [isAadhaarVerified, setIsAadhaarVerified] = useState(false);
  const [aadhaarOtpSent, setAadhaarOtpSent] = useState(false);
  const [simulatedAadhaarOtp, setSimulatedAadhaarOtp] = useState('');
  const [aadhaarConsent, setAadhaarConsent] = useState(false);
  const [isPanVerified, setIsPanVerified] = useState(false);
  const [mobileAvailability, setMobileAvailability] = useState<'idle' | 'checking' | 'available' | 'exists'>('idle');

  const [emailOtp, setEmailOtp] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);

  const steps = [
    { id: 1, title: 'Organisation Details', icon: Building2 },
    { id: 2, title: 'Personal Verification', icon: UserCheck },
    { id: 3, title: 'Email Verification', icon: Mail },
    { id: 4, title: 'User Credentials', icon: Lock }
  ];

  const sellerRoleOptions = [
    'Director',
    'CEO',
    'Managing Director',
    'Managerial Personnel Authorized by Board of Directors',
    'Proprietor',
    'Partner',
    'Authorized Signatory'
  ];

  const isPrimaryBuyer = role === 'buyer' && businessType.startsWith('Primary User');
  const isPrimaryBuyerOrganisationComplete = Boolean(
    formData.organisationType &&
    formData.state &&
    formData.district &&
    formData.organisation &&
    formData.officeZoneName
  );
  const districtOptions = formData.state ? indiaStatesDistricts[formData.state] || [] : [];
  const organisationOptions = getDistrictOrganisations(formData.state, formData.district);
  const missingPrimaryBuyerFields = [
    !formData.organisationType && 'Organisation Type',
    !formData.state && 'State',
    !formData.district && 'District',
    !formData.organisation && 'Organisation',
    !formData.officeZoneName && 'Office/Zone Name'
  ].filter(Boolean);

  const aadhaarValue = formData.aadhaarNumber.trim();
  const mobileValue = formData.mobile.trim();
  const isAadhaarNumberValid = /^\d{12}$/.test(aadhaarValue);
  const isVirtualIdValid = /^\d{16}$/.test(aadhaarValue);
  const isAadhaarOrVidValid = isAadhaarNumberValid || isVirtualIdValid;
  const isMobileValid = /^[6-9]\d{9}$/.test(mobileValue) && !/^(\d)\1{9}$/.test(mobileValue);
  const panNumberValid = /^[A-Z]{5}\d{4}[A-Z]$/.test(formData.panNumber);
  const panNameValid = /^[A-Za-z .-]{2,100}$/.test(formData.personalName.trim());
  const dobDate = formData.dob ? new Date(formData.dob) : null;
  const today = new Date();
  const age = dobDate
    ? today.getFullYear() - dobDate.getFullYear() - (today < new Date(today.getFullYear(), dobDate.getMonth(), dobDate.getDate()) ? 1 : 0)
    : 0;
  const dobValid = Boolean(dobDate && dobDate <= today && age >= 18);
  const aadhaarErrors = {
    aadhaarNumber: !aadhaarValue
      ? 'Aadhaar Number / Virtual ID is required.'
      : !isAadhaarOrVidValid
        ? 'Enter exactly 12 digits for Aadhaar or 16 digits for Virtual ID.'
        : '',
    mobile: !mobileValue
      ? 'Mobile number linked with Aadhaar is required.'
      : !isMobileValid
        ? 'Enter a valid 10 digit mobile number starting with 6, 7, 8, or 9.'
        : '',
    consent: !aadhaarConsent ? 'Consent is required before Aadhaar verification.' : ''
  };
  const panErrors = {
    panNumber: !formData.panNumber
      ? 'PAN number is required.'
      : !panNumberValid
        ? 'PAN must follow ABCDE1234F format.'
        : '',
    personalName: !formData.personalName.trim()
      ? 'Name as on PAN is required.'
      : !panNameValid
        ? 'Use 2-100 characters: alphabets, spaces, dots, and hyphens only.'
        : '',
    dob: !formData.dob
      ? 'Date of birth is required.'
      : !dobValid
        ? 'Date of birth cannot be future and age must be at least 18 years.'
        : ''
  };
  const isAadhaarReady = isAadhaarOrVidValid && isMobileValid && aadhaarConsent;
  const isPanReady = panNumberValid && panNameValid && dobValid;
  const maskedAadhaar = isAadhaarOrVidValid ? `${'X'.repeat(aadhaarValue.length - 4).replace(/(.{4})/g, '$1 ').trim()} ${aadhaarValue.slice(-4)}` : '';
  const mobileAlreadyRegistered = mobileAvailability === 'exists';

  useEffect(() => {
    if (!mobileValue || !isMobileValid) {
      setMobileAvailability('idle');
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setMobileAvailability('checking');
      try {
        const response = await api.fetch(`/api/auth/mobile-exists?mobile=${encodeURIComponent(mobileValue)}`, {
          skipCache: true
        });
        if (cancelled) return;
        if (response.ok) {
          const data = await response.json();
          setMobileAvailability(data.exists ? 'exists' : 'available');
        } else {
          setMobileAvailability('idle');
        }
      } catch {
        if (!cancelled) setMobileAvailability('idle');
      }
    }, 400);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isMobileValid, mobileValue]);

  const handleAadhaarFieldChange = (patch: Partial<typeof formData>) => {
    setFormData({ ...formData, ...patch });
    setIsAadhaarVerified(false);
    setAadhaarOtpSent(false);
    setAadhaarOtp('');
    setSimulatedAadhaarOtp('');
  };

  const handleEditAadhaarDetails = () => {
    setFormData({ ...formData, aadhaarNumber: '', mobile: '' });
    setAadhaarConsent(false);
    setIsAadhaarVerified(false);
    setAadhaarOtpSent(false);
    setAadhaarOtp('');
    setSimulatedAadhaarOtp('');
    setMobileAvailability('idle');
  };

  const handleSendAadhaarOtp = () => {
    if (!isAadhaarReady) return toast.error('Please complete valid Aadhaar details and consent');
    if (mobileAlreadyRegistered) return toast.error('This Aadhaar-linked mobile number is already registered. Please edit Aadhaar details.');
    
    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    setSimulatedAadhaarOtp(otp);
    setAadhaarOtpSent(true);
    toast.success('Simulation: Aadhaar OTP Generated');
  };

  const handleVerifyAadhaarOtp = () => {
    if (aadhaarOtp === simulatedAadhaarOtp) {
      setIsAadhaarVerified(true);
      toast.success('Aadhaar Verified Successfully');
    } else {
      toast.error('Invalid OTP');
    }
  };

  const handleVerifyPan = () => {
    if (!isPanReady) return toast.error('Please complete valid PAN details');
    setIsPanVerified(true);
    toast.success('PAN Verified Successfully');
  };

  const handleNext = () => {
    if (currentSubStep === 1) {
      if (isPrimaryBuyer && !isPrimaryBuyerOrganisationComplete) {
        toast.error('Please complete Organisation Details');
        return;
      }
      if (!formData.businessName) {
        toast.error('Please enter Organization Name');
        return;
      }
      if (role === 'seller' && !formData.udyamNumber) {
        toast.error('Please enter Udyam Number');
        return;
      }
    }
    if (currentSubStep === 2) {
      if (!formData.personalVerificationMethod) {
        toast.error('Please select Aadhaar or Personal PAN verification');
        return;
      }
      if (formData.personalVerificationMethod === 'aadhaar') {
        if (!isAadhaarVerified) {
          toast.error('Please verify Aadhaar first');
          return;
        }
      } else {
         if (!isPanVerified) {
          toast.error('Please verify PAN first');
          return;
        }
      }
      if (role === 'seller') {
        if (!formData.personalName.trim()) {
          toast.error('Please enter first name');
          return;
        }
        if (!formData.roleInOrg) {
          toast.error('Please select your role');
          return;
        }
      }
    }
    if (currentSubStep === 3 && !isEmailVerified) {
      toast.error('Please verify your email address first');
      return;
    }

    if (currentSubStep === 3 && isEmailVerified && role === 'seller') {
      if (!formData.userId && formData.email) {
        const prefix = formData.email.split('@')[0];
        setFormData(prev => ({ ...prev, userId: prefix }));
      }
    }
    
    if (currentSubStep < 4) setCurrentSubStep(currentSubStep + 1);
  };

  const handleBack = () => {
    if (currentSubStep > 1) setCurrentSubStep(currentSubStep - 1);
    else onBack();
  };

  const handleSendOtp = async () => {
    if (!formData.email) return toast.error('Email is required');
    if (role === 'buyer' && formData.email !== formData.verifyEmail) return toast.error('Email IDs do not match');
    setIsSendingOtp(true);
    try {
      const res = await api.post('/api/auth/send-email-otp', { email: formData.email });
      if (res.ok) {
        setOtpSent(true);
        toast.success('OTP sent successfully');
      } else {
        const data = await res.json();
        toast.error(data.message || 'Failed to send OTP');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setIsSendingOtp(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (!emailOtp) return toast.error('Enter OTP');
    try {
      const res = await api.post('/api/auth/verify-email-otp', { email: formData.email, otp: emailOtp });
      if (res.ok) {
        setIsEmailVerified(true);
        toast.success('Email verified!');
      } else {
        const data = await res.json();
        toast.error(data.message || 'Invalid OTP');
      }
    } catch (err) {
      toast.error('Verification failed');
    }
  };

  const handleSubmit = async () => {
    if (role === 'buyer' && !formData.userId) {
      return toast.error('Please enter user id');
    }
    if (formData.password !== formData.confirmPassword) {
      return toast.error('Passwords do not match');
    }
    
    setIsLoading(true);
    try {
      const accountName = [formData.personalName, formData.personalLastName].map(v => v.trim()).filter(Boolean).join(' ') || formData.userId.trim() || formData.businessName.trim();
      const res = await api.post('/api/auth/register', {
        name: accountName,
        email: formData.email || formData.userId,
        password: formData.password,
        role,
        mobile: formData.mobile,
        dob: formData.dob,
        registrationDetails: {
          businessType,
          businessName: formData.businessName,
          userId: formData.userId,
          verificationMethod: formData.personalVerificationMethod,
          isEmailVerified: true,
          state: formData.state,
          district: formData.district,
          officeZoneName: formData.officeZoneName,
          aadhaarNumber: formData.aadhaarNumber,
          isAadhaarVerified: isAadhaarVerified,
          pan: formData.panNumber,
          roleInOrg: formData.roleInOrg,
          udyamNumber: formData.udyamNumber,
          accountName
        }
      });
      
      const data = await res.json();
      if (res.ok) {
        login(data.token, data.user);
        toast.success(`Registration completed! Proceeding to ${role} onboarding.`);
        navigate(`/${role}/onboarding`);
      } else {
        toast.error(data.message || 'Registration failed');
      }
    } catch (err) {
      toast.error('Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const isPasswordStrong = (pw: string) => {
    return pw.length >= 8 && pw.length <= 16 && 
           /[A-Z]/.test(pw) && /[a-z]/.test(pw) && 
           /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
  };
  const isBuyerAadhaarReady = formData.aadhaarNumber.length === 12 && formData.mobile.length === 10 && aadhaarConsent && !mobileAlreadyRegistered && mobileAvailability !== 'checking';
  const isBuyerEmailReady = Boolean(formData.email && formData.verifyEmail && formData.email === formData.verifyEmail);

  return (
    <div className="mx-auto w-full max-w-5xl text-xs font-sans">
      <Card className="overflow-hidden rounded border border-slate-200 bg-white shadow-sm">
        <div className="flex flex-col md:flex-row min-h-[400px]">
          {/* Left Side Navigation */}
          <div className="w-full md:w-64 bg-white border-r border-slate-100 py-6">
            <div className="flex flex-col">
              {steps.map((step) => {
                const isActive = currentSubStep === step.id;
                return (
                  <div 
                    key={step.id}
                    className={cn(
                      "relative px-6 py-3 cursor-pointer transition-colors",
                      isActive ? "bg-slate-50" : "hover:bg-slate-50/50"
                    )}
                    onClick={() => currentSubStep > step.id && setCurrentSubStep(step.id)}
                  >
                    {isActive && (
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-blue-600" />
                    )}
                    <span className={cn(
                      "text-[13px] font-semibold tracking-tight",
                      isActive ? "text-slate-700" : "text-slate-400"
                    )}>
                      {step.title}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Side Content */}
          <div className="flex-1 p-6 md:p-8">
            <CardContent className="p-0">
            {currentSubStep === 1 && (
              <div className="animate-in slide-in-from-right-2 duration-300">
                <h2 className="text-2xl font-bold text-slate-800 mb-8 tracking-tight">Organisation Details</h2>
                
                {isPrimaryBuyer ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-2">
                      <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                        Business / Organisation Type * <Info className="h-3.5 w-3.5 text-slate-400" />
                      </label>
                      <Select
                        value={formData.organisationType}
                        onChange={(e) => setFormData({...formData, organisationType: e.target.value})}
                        className="h-10 rounded border-slate-300 bg-slate-50/50 text-[13px] text-slate-700 focus:ring-blue-500"
                      >
                        <option value="">Select Type</option>
                        {cooperativeOrganisationTypes.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                        State * <Info className="h-3.5 w-3.5 text-slate-400" />
                      </label>
                      <Select
                        value={formData.state}
                        onChange={(e) => setFormData({...formData, state: e.target.value, district: '', organisation: ''})}
                        className="h-10 rounded border-slate-300 bg-slate-50/50 text-[13px] text-slate-700 focus:ring-blue-500"
                      >
                        <option value="">Select State</option>
                        {indiaStates.map((state) => (
                          <option key={state} value={state}>{state}</option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                        District * <Info className="h-3.5 w-3.5 text-slate-400" />
                      </label>
                      <Select
                        value={formData.district}
                        disabled={!formData.state}
                        onChange={(e) => setFormData({...formData, district: e.target.value, organisation: ''})}
                        className="h-10 rounded border-slate-300 bg-slate-50/50 text-[13px] text-slate-700 focus:ring-blue-500"
                      >
                        <option value="">Select District</option>
                        {districtOptions.map((d) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                        Organisation Name * <Info className="h-3.5 w-3.5 text-slate-400" />
                      </label>
                      <Input
                        placeholder="Enter organisation name"
                        value={formData.organisation}
                        onChange={(e) => setFormData({...formData, organisation: e.target.value, businessName: e.target.value})}
                        className="h-10 rounded border-slate-300 bg-white text-[13px]"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                        Office / Zone Name * <Info className="h-3.5 w-3.5 text-slate-400" />
                      </label>
                      <Input
                        placeholder="Enter unit/location name"
                        value={formData.officeZoneName}
                        onChange={(e) => setFormData({...formData, officeZoneName: e.target.value})}
                        className="h-10 rounded border-slate-300 bg-white text-[13px]"
                      />
                    </div>
                  </div>
                ) : role === 'buyer' ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-2">
                      <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                        GSTIN (Optional) <Info className="h-3.5 w-3.5 text-slate-400" />
                      </label>
                      <div className="flex gap-2">
                        <Input
                          placeholder="Enter GSTIN"
                          value={formData.gstin}
                          onChange={(e) => setFormData({...formData, gstin: e.target.value.toUpperCase()})}
                          className="h-10 rounded border-slate-300 bg-white text-[13px] flex-1"
                        />
                        <Button 
                          type="button"
                          variant="outline"
                          onClick={fetchGstDetails}
                          disabled={isFetchingGst || !formData.gstin}
                          className="h-10 px-4 rounded bg-slate-50 text-slate-600 border-slate-300 text-[12px] font-bold"
                        >
                          {isFetchingGst ? '...' : 'Fetch'}
                        </Button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                        Business / Organisation Type * <Info className="h-3.5 w-3.5 text-slate-400" />
                      </label>
                      <Input
                        value={businessType}
                        disabled
                        className="h-10 rounded border-slate-300 bg-slate-100 text-slate-600 text-[13px] font-medium"
                      />
                    </div>

                    <div className="space-y-2 md:col-span-2">
                      <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                        Business / Organisation Name * <Info className="h-3.5 w-3.5 text-slate-400" />
                      </label>
                      <Input
                        placeholder="Please enter your Business/Company Name"
                        value={formData.businessName}
                        onChange={(e) => setFormData({...formData, businessName: e.target.value})}
                        className="h-10 rounded border-slate-300 bg-white text-[13px]"
                      />
                      {!formData.businessName && (
                        <p className="text-[10px] text-red-500 mt-1">Please enter Business / Organisation Name.</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                    <div className="space-y-2">
                      <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                        Business / Organisation Type * <Info className="h-3.5 w-3.5 text-slate-400" />
                      </label>
                      <Input
                        value={businessType}
                        disabled
                        className="h-10 rounded border-slate-200 bg-slate-100 text-slate-500 text-[13px]"
                      />
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                        Business / Organisation Name * <Info className="h-3.5 w-3.5 text-slate-400" />
                      </label>
                      <Input
                        placeholder="Please enter your Business/Company Name"
                        value={formData.businessName}
                        onChange={(e) => setFormData({...formData, businessName: e.target.value})}
                        className="h-10 rounded border-slate-300 bg-white text-[13px]"
                      />
                      {!formData.businessName && (
                        <p className="text-[10px] text-red-500 mt-1 font-medium tracking-tight">Please enter Business / Organisation Name.</p>
                      )}
                    </div>

                    <div className="space-y-2">
                      <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                        Udyam Number * <Info className="h-3.5 w-3.5 text-slate-400" />
                      </label>
                      <Input
                        placeholder="e.g., UDYAM-XX-00-0000000"
                        value={formData.udyamNumber}
                        onChange={(e) => setFormData({...formData, udyamNumber: e.target.value.toUpperCase()})}
                        className="h-10 rounded border-slate-300 bg-white text-[13px]"
                      />
                      {!formData.udyamNumber && (
                        <p className="text-[10px] text-red-500 mt-1 font-medium tracking-tight">Please enter valid Udyam Number.</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentSubStep === 2 && (
              <div className="space-y-8 animate-in slide-in-from-right-4 duration-300">
                {role === 'buyer' ? (
                  <div className="space-y-7">
                    <h2 className="text-base md:text-base font-bold text-slate-800">Personal Verification</h2>
                    <div className="rounded-md bg-sky-100 px-5 py-4 text-xs font-medium text-slate-700">
                      We respect your Privacy, We do not share your personal details with anyone.
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <div className="space-y-1.5">
                        <label className="text-xs font-bold text-slate-700">
                          Aadhaar Number / Virtual ID* <Info className="inline h-3.5 w-3.5 text-slate-500" />
                        </label>
                        <div className="relative">
                          <input
                            type="password"
                            placeholder="Enter Aadhaar number / Virtual ID"
                            maxLength={12}
                            value={formData.aadhaarNumber}
                            onChange={(e) => handleAadhaarFieldChange({ aadhaarNumber: e.target.value.replace(/\D/g, '') })}
                            disabled={isAadhaarVerified || aadhaarOtpSent}
                            className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 pr-11 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-60"
                          />
                          <EyeOff className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                        </div>
                      </div>

                      <Input
                        label="Mobile number linked with Aadhaar*"
                        placeholder="Enter mobile number linked with Aadhaar"
                        maxLength={10}
                        value={formData.mobile}
                        onChange={(e) => handleAadhaarFieldChange({ mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                        disabled={isAadhaarVerified || aadhaarOtpSent}
                        error={mobileAlreadyRegistered ? 'This mobile number is already registered.' : undefined}
                        className={cn(
                          "h-11 rounded-lg bg-white",
                          mobileAlreadyRegistered ? "border-red-400" : "border-slate-200"
                        )}
                      />
                    </div>

                    {isMobileValid && mobileAvailability === 'checking' && (
                      <p className="text-xs font-medium text-slate-500">Checking mobile number...</p>
                    )}

                    {mobileAlreadyRegistered && (
                      <div className="flex flex-col gap-3 rounded-lg border border-red-100 bg-red-50 px-4 py-3 text-xs text-red-700 sm:flex-row sm:items-center sm:justify-between">
                        <span className="font-semibold">This Aadhaar-linked mobile number already exists in the database.</span>
                        <button
                          type="button"
                          onClick={handleEditAadhaarDetails}
                          className="inline-flex items-center gap-1 font-bold text-red-700 hover:underline"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit Aadhaar Details
                        </button>
                      </div>
                    )}

                    {!aadhaarOtpSent && !isAadhaarVerified && (
                      <>
                        <div className="space-y-5">
                          <label className="flex items-start gap-3 text-xs leading-relaxed text-slate-700">
                            <input
                              type="checkbox"
                              checked={aadhaarConsent}
                              onChange={(e) => setAadhaarConsent(e.target.checked)}
                              className="mt-1 h-5 w-5 rounded border-slate-300 accent-indigo-600"
                            />
                            <span>
                              I, the holder of the above Aadhaar, hereby give my consent to MSME Portal, for using my Aadhaar number as allotted by UIDAI for MSME Portal Registration. MSME Portal,have informed me that my aadhaar data will not be stored/shared.
                            </span>
                          </label>

                          <p className="pl-8 text-xs leading-relaxed text-slate-700">
                            मैं, उपर्युक्त आधार का धारक, भारतीय विशिष्ट पहचान प्राधिकरण द्वारा आवंटित अपने आधार नंबर को एमएसएमई पोर्टल पंजीकरण हेतु प्रयोग में लाने हेतु एमएसएमई पोर्टल को एतदद्वारा अपनी सहमति प्रदान करता हूं। एमएसएमई पोर्टल,ने मुझे अवगत कराया है कि मेरे आधार डेटा को संग्रहीत/साझा नहीं किया जाएगा।
                          </p>

                          <div className="space-y-3">
                            <p className="text-xs text-slate-700">Click on the play button to listen consent/ सहमति सुनने के लिए प्ले बटन पर क्लिक करें।</p>
                            <audio controls className="w-full max-w-sm" />
                          </div>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            onClick={handleSendAadhaarOtp}
                            disabled={!isBuyerAadhaarReady}
                            className={cn(
                              "h-11 w-full sm:w-64 rounded-lg font-bold  tracking-wide",
                              isBuyerAadhaarReady ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-500"
                            )}
                          >
                            {mobileAvailability === 'checking' ? 'Checking...' : 'Verify Aadhaar'}
                          </Button>
                        </div>
                      </>
                    )}

                    {aadhaarOtpSent && !isAadhaarVerified && (
                      <div className="space-y-4 rounded border border-indigo-100 bg-white p-4 shadow-sm sm:p-6">
                         <div className="flex items-center justify-between">
                            <h4 className="text-[10px] font-bold text-indigo-600  ">Enter OTP sent to your Aadhaar-linked mobile</h4>
                            <div className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[9px] font-bold animate-pulse">
                               {simulatedAadhaarOtp}
                            </div>
                         </div>
                         <div className="flex flex-col sm:flex-row gap-2">
                           <input
                             placeholder="6 Digit OTP"
                             maxLength={6}
                             value={aadhaarOtp}
                             onChange={(e) => setAadhaarOtp(e.target.value.replace(/\D/g, ''))}
                             className="flex-1 h-12 px-4 rounded border border-slate-200 text-center font-bold "
                           />
                           <Button
                             onClick={() => setAadhaarOtp(simulatedAadhaarOtp)}
                             className="h-12 px-4 rounded border border-indigo-200 text-indigo-600 font-bold  text-[10px] "
                           >
                             Auto-fill
                           </Button>
                         </div>
                         <Button
                           onClick={handleVerifyAadhaarOtp}
                           className="w-full h-12 rounded bg-slate-900 text-white font-bold   text-[10px]"
                         >
                           Validate Aadhaar
                         </Button>
                      </div>
                    )}

                    {isAadhaarVerified && (
                      <div className="space-y-6">
                        <div className="max-w-md">
                          <Input
                            label="Mobile number linked with Aadhaar*"
                            value={formData.mobile}
                            disabled
                            className="h-11 rounded-lg border-slate-200 bg-slate-100 text-slate-700"
                          />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                          <Input
                            label="First Name*"
                            value={formData.personalName}
                            onChange={(e) => setFormData({...formData, personalName: e.target.value})}
                            disabled
                            className="h-11 rounded-lg border-slate-200 bg-slate-100 text-slate-700"
                          />
                          <Input
                            label="Last Name"
                            value={formData.roleInOrg}
                            onChange={(e) => setFormData({...formData, roleInOrg: e.target.value})}
                            disabled
                            className="h-11 rounded-lg border-slate-200 bg-slate-100 text-slate-700"
                          />
                        </div>

                        <div className="flex items-center gap-3 text-slate-800">
                          <CheckCircle2 className="h-5 w-5 rounded-full fill-green-600 text-green-600" />
                          <p className="text-xs font-bold">Aadhaar Details Verified Successfully.</p>
                        </div>

                        <div className="flex justify-end">
                          <Button
                            onClick={handleNext}
                            className="h-11 w-full sm:w-40 rounded-lg bg-blue-600 text-white font-bold  tracking-wide hover:bg-blue-700"
                          >
                            Next
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="space-y-5">
                    <h2 className="text-2xl font-bold text-slate-800">Personal Verification</h2>
                    <div className="flex flex-wrap items-center gap-8">
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                        <input
                          type="radio"
                          name="seller-personal-verification"
                          checked={formData.personalVerificationMethod === 'aadhaar'}
                          onChange={() => setFormData({...formData, personalVerificationMethod: 'aadhaar'})}
                          className="h-4 w-4 accent-blue-600"
                        />
                        Aadhaar
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                        <input
                          type="radio"
                          name="seller-personal-verification"
                          checked={formData.personalVerificationMethod === 'pan'}
                          onChange={() => setFormData({...formData, personalVerificationMethod: 'pan'})}
                          className="h-4 w-4 accent-blue-600"
                        />
                        Personal PAN
                      </label>
                    </div>

                    <div className="max-w-xl rounded-none bg-sky-100 px-5 py-3 text-sm font-medium text-slate-700">
                      We respect your Privacy, We do not share your personal details with anyone.
                    </div>

                    {formData.personalVerificationMethod === 'aadhaar' && (
                      <div className="space-y-4">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-800">
                              Aadhaar Number / Virtual ID* <Info className="inline h-3.5 w-3.5 text-slate-500" />
                            </label>
                            <div className="relative">
                              <input
                                placeholder="Enter Aadhaar number / Virtual ID"
                                maxLength={16}
                                value={formData.aadhaarNumber}
                                onChange={(event) => handleAadhaarFieldChange({ aadhaarNumber: event.target.value.replace(/\D/g, '').slice(0, 16) })}
                                disabled={isAadhaarVerified || aadhaarOtpSent}
                                className={cn(
                                  "h-11 w-full rounded border bg-white px-4 pr-11 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-60",
                                  aadhaarErrors.aadhaarNumber ? "border-red-400 focus:ring-red-500" : "border-slate-300 focus:ring-blue-500"
                                )}
                              />
                              <EyeOff className="absolute right-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-600" />
                            </div>
                            {maskedAadhaar && <p className="text-xs font-semibold text-slate-500">Masked: {maskedAadhaar}</p>}
                            {aadhaarErrors.aadhaarNumber && <p className="text-xs font-medium text-red-600">{aadhaarErrors.aadhaarNumber}</p>}
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-800">Mobile number linked with Aadhaar*</label>
                            <input
                              placeholder="Enter mobile number linked with Aadhaar"
                              maxLength={10}
                              value={formData.mobile}
                              onChange={(event) => handleAadhaarFieldChange({ mobile: event.target.value.replace(/\D/g, '').slice(0, 10) })}
                              disabled={isAadhaarVerified || aadhaarOtpSent}
                              className={cn(
                                "h-11 w-full rounded border bg-white px-4 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-60",
                                aadhaarErrors.mobile || mobileAlreadyRegistered ? "border-red-400 focus:ring-red-500" : "border-slate-300 focus:ring-blue-500"
                              )}
                            />
                            {aadhaarErrors.mobile && <p className="text-xs font-medium text-red-600">{aadhaarErrors.mobile}</p>}
                            {isMobileValid && mobileAvailability === 'checking' && <p className="text-xs font-medium text-slate-500">Checking mobile number...</p>}
                            {mobileAlreadyRegistered && <p className="text-xs font-medium text-red-600">This mobile number is already registered.</p>}
                          </div>
                        </div>

                        {mobileAlreadyRegistered && (
                          <div className="flex flex-col gap-3 rounded border border-red-100 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
                            <span className="font-semibold">This Aadhaar-linked mobile number already exists in the database.</span>
                            <button
                              type="button"
                              onClick={handleEditAadhaarDetails}
                              className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-red-700 hover:underline"
                            >
                              <Pencil className="h-3.5 w-3.5" /> Edit Aadhaar Details
                            </button>
                          </div>
                        )}

                        {!aadhaarOtpSent && !isAadhaarVerified && (
                          <>
                            <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">
                              <input
                                type="checkbox"
                                checked={aadhaarConsent}
                                onChange={(event) => setAadhaarConsent(event.target.checked)}
                                className="mt-1 h-5 w-5 rounded border-slate-300 accent-blue-600"
                              />
                              <span>
                                I, the holder of the above Aadhaar, hereby give my consent to MSME Portal,for using my Aadhaar number as allotted by UIDAI for MSME Portal Registration. MSME Portal,has informed me that my Aadhaar data will not be stored/shared.
                              </span>
                            </label>
                            {aadhaarErrors.consent && <p className="pl-8 text-xs font-medium text-red-600">{aadhaarErrors.consent}</p>}
                            <p className="pl-8 text-sm leading-relaxed text-slate-700">
                              I provide consent for identity verification only. Aadhaar details will be used for verification and masked after entry.
                            </p>
                            <div className="space-y-3">
                              <p className="text-sm text-slate-700">Click on the play button to listen consent.</p>
                              <audio controls className="w-full max-w-sm" />
                            </div>
                            <div className="flex justify-end">
                              <Button
                                onClick={handleSendAadhaarOtp}
                                disabled={!isAadhaarReady || mobileAlreadyRegistered || mobileAvailability === 'checking'}
                                className={cn(
                                  "h-11 w-full rounded font-bold uppercase tracking-wide sm:w-52",
                                  isAadhaarReady && !mobileAlreadyRegistered && mobileAvailability !== 'checking' ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-200 text-slate-500 cursor-not-allowed"
                                )}
                              >
                                {mobileAvailability === 'checking' ? 'Checking...' : 'Verify Aadhaar'}
                              </Button>
                            </div>
                          </>
                        )}

                        {aadhaarOtpSent && !isAadhaarVerified && (
                          <div className="space-y-4 rounded border border-indigo-100 bg-white p-4 shadow-sm sm:p-6">
                             <div className="flex items-center justify-between">
                                <h4 className="text-xs font-bold text-indigo-600">Enter OTP sent to your Aadhaar-linked mobile</h4>
                                <div className="rounded bg-amber-50 px-3 py-1 text-[10px] font-bold text-amber-600 animate-pulse">
                                   {simulatedAadhaarOtp}
                                </div>
                             </div>
                             <div className="flex flex-col gap-2 sm:flex-row">
                               <input
                                 placeholder="6 Digit OTP"
                                 maxLength={6}
                                 value={aadhaarOtp}
                                 onChange={(event) => setAadhaarOtp(event.target.value.replace(/\D/g, ''))}
                                 className="h-12 flex-1 rounded border border-slate-200 px-4 text-center font-bold"
                               />
                               <Button onClick={() => setAadhaarOtp(simulatedAadhaarOtp)} className="h-12 rounded border border-indigo-200 px-4 text-xs font-bold text-indigo-600">
                                 Auto-fill
                               </Button>
                             </div>
                             <Button onClick={handleVerifyAadhaarOtp} className="h-12 w-full rounded bg-slate-900 text-xs font-bold text-white">
                               Validate Aadhaar
                             </Button>
                          </div>
                        )}

                        {isAadhaarVerified && (
                          <div className="space-y-5">
                            <div className="flex items-center gap-3 text-green-700">
                              <CheckCircle2 className="h-5 w-5 fill-green-600 text-green-600" />
                              <p className="text-sm font-bold">Aadhaar Details Verified Successfully.</p>
                            </div>
                            <SellerRoleDetails
                              firstName={formData.personalName}
                              lastName={formData.personalLastName}
                              roleInOrg={formData.roleInOrg}
                              roleOptions={sellerRoleOptions}
                              onChange={(patch) => setFormData({...formData, ...patch})}
                            />
                          </div>
                        )}
                      </div>
                    )}

                    {formData.personalVerificationMethod === 'pan' && (
                      <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                          <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-800">PAN Number* <Info className="inline h-3.5 w-3.5 text-slate-500" /></label>
                            <input
                              placeholder="ABCDE1234F"
                              maxLength={10}
                              value={formData.panNumber}
                              onChange={(event) => {
                                setIsPanVerified(false);
                                setFormData({...formData, panNumber: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10)});
                              }}
                              className={cn(
                                "h-11 w-full rounded border bg-white px-4 text-sm focus:outline-none focus:ring-1",
                                panErrors.panNumber ? "border-red-400 focus:ring-red-500" : "border-slate-300 focus:ring-blue-500"
                              )}
                            />
                            {panErrors.panNumber && <p className="text-xs font-medium text-red-600">{panErrors.panNumber}</p>}
                          </div>
                          <div className="space-y-1.5">
                            <label className="text-sm font-semibold text-slate-800">Name (as on PAN)* <Info className="inline h-3.5 w-3.5 text-slate-500" /></label>
                            <input
                              value={formData.personalName}
                              onChange={(event) => {
                                setIsPanVerified(false);
                                setFormData({...formData, personalName: event.target.value.replace(/[^A-Za-z .-]/g, '').slice(0, 100)});
                              }}
                              className={cn(
                                "h-11 w-full rounded border bg-white px-4 text-sm focus:outline-none focus:ring-1",
                                panErrors.personalName ? "border-red-400 focus:ring-red-500" : "border-slate-300 focus:ring-blue-500"
                              )}
                            />
                            {panErrors.personalName && <p className="text-xs font-medium text-red-600">{panErrors.personalName}</p>}
                          </div>
                          <div className="space-y-1.5">
                             <label className="text-sm font-semibold text-slate-800">Date Of Birth*</label>
                             <Input
                               type="date"
                               value={formData.dob}
                               onChange={(event) => {
                                 setIsPanVerified(false);
                                 setFormData({...formData, dob: event.target.value});
                               }}
                               className={cn("h-11 rounded border-slate-300 bg-white", panErrors.dob && "border-red-400 focus-visible:ring-red-500")}
                             />
                             {panErrors.dob && <p className="text-xs font-medium text-red-600">{panErrors.dob}</p>}
                          </div>
                        </div>
                        <div className="flex justify-end">
                          <Button
                            onClick={handleVerifyPan}
                            disabled={!isPanReady}
                            className={cn(
                              "h-11 w-full rounded font-bold uppercase tracking-wide sm:w-44",
                              isPanReady ? "bg-blue-600 text-white hover:bg-blue-700" : "bg-slate-200 text-slate-500 cursor-not-allowed"
                            )}
                          >
                            Verify PAN
                          </Button>
                        </div>
                        {isPanVerified && (
                          <div className="space-y-5">
                            <div className="flex items-center gap-3 text-green-700">
                              <CheckCircle2 className="h-5 w-5 fill-green-600 text-green-600" />
                              <p className="text-sm font-bold">PAN Details Verified Successfully.</p>
                            </div>
                            <SellerRoleDetails
                              firstName={formData.personalName}
                              lastName={formData.personalLastName}
                              roleInOrg={formData.roleInOrg}
                              roleOptions={sellerRoleOptions}
                              onChange={(patch) => setFormData({...formData, ...patch})}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {currentSubStep === 3 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                {role === 'buyer' ? (
                  <>
                    <h2 className="text-base md:text-base font-bold text-slate-800">Email Verification</h2>
                    <div className="rounded-md bg-sky-100 px-5 py-4 text-xs font-medium text-slate-700">
                      To view list of whitelisted domains (accepted at MSME Portal),{' '}
                      <button type="button" className="font-bold text-blue-600 hover:underline">Click here</button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Input
                        label="Official Email Id *"
                        type="email"
                        placeholder="Enter Official email id"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        disabled={isEmailVerified || otpSent}
                        className="h-11 rounded-lg border-slate-200 bg-white"
                      />
                      <Input
                        label="Verify Email Id*"
                        type="email"
                        placeholder="Verify Official email id"
                        value={formData.verifyEmail}
                        onChange={(e) => setFormData({...formData, verifyEmail: e.target.value})}
                        disabled={isEmailVerified || otpSent}
                        error={formData.verifyEmail && formData.email !== formData.verifyEmail ? 'Email does not match.' : undefined}
                        className="h-11 rounded-lg border-slate-200 bg-white"
                      />
                    </div>

                    {!otpSent && !isEmailVerified && (
                      <div className="flex justify-end">
                        <Button
                          onClick={handleSendOtp}
                          disabled={isSendingOtp || !isBuyerEmailReady}
                          className={cn(
                            "h-11 w-full sm:w-48 rounded-lg font-bold  tracking-wide",
                            isBuyerEmailReady ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-500"
                          )}
                        >
                          {isSendingOtp ? 'Sending...' : 'Send OTP'}
                        </Button>
                      </div>
                    )}

                    {isEmailVerified && (
                      <div className="flex items-center justify-between gap-2 px-6 py-3 bg-green-50 text-green-600 rounded-lg border border-green-100 font-bold text-[10px]">
                        <span className="flex items-center gap-2">
                          <ShieldCheck className="h-5 w-5" />
                          Verified
                        </span>
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setIsEmailVerified(false);
                            setEmailOtp("");
                          }}
                          className="flex items-center gap-1 text-blue-600 hover:underline font-bold"
                        >
                          <Pencil className="h-3.5 w-3.5" /> Edit
                        </button>
                      </div>
                    )}
                    {otpSent && !isEmailVerified && (
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setIsEmailVerified(false);
                            setEmailOtp("");
                          }}
                          className="text-[10px] font-bold text-blue-600 hover:underline flex items-center gap-1"
                        >
                          <Pencil className="h-3 w-3" /> Change/Edit Email
                        </button>
                      </div>
                    )}
                  </>
                ) : (
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-semibold text-slate-500 ml-1">Official Email ID</label>
                    <div className={cn(
                      "flex items-center gap-3 px-4 h-12 rounded-md border transition-colors w-full",
                      otpSent || isEmailVerified ? "bg-blue-50 border-blue-100" : "bg-white border-slate-300"
                    )}>
                      <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
                      <input
                        type="email"
                        placeholder="name@company.com"
                        value={formData.email}
                        onChange={(e) => setFormData({...formData, email: e.target.value})}
                        disabled={isEmailVerified || otpSent}
                        className={cn(
                          "flex-1 bg-transparent outline-none border-none text-[13px] font-bold text-slate-800",
                          (otpSent || isEmailVerified) && "cursor-not-allowed"
                        )}
                      />
                      {!isEmailVerified && !otpSent && (
                        <Button 
                          onClick={handleSendOtp} 
                          disabled={isSendingOtp} 
                          variant="ghost"
                          className="h-8 px-4 text-indigo-600 font-bold text-[11px] hover:bg-indigo-50 border border-transparent"
                        >
                          {isSendingOtp ? '...' : 'Send OTP'}
                        </Button>
                      )}
                      {isEmailVerified && (
                        <span className="text-[11px] font-bold text-green-600 flex items-center gap-1">
                          <ShieldCheck className="h-4 w-4" />
                          Verified
                        </span>
                      )}
                      {(otpSent || isEmailVerified) && (
                        <button
                          type="button"
                          onClick={() => {
                            setOtpSent(false);
                            setIsEmailVerified(false);
                            setEmailOtp("");
                          }}
                          className="ml-2 flex items-center gap-1 rounded-full bg-slate-200/50 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200 hover:text-blue-600 transition-all border border-transparent active:scale-95"
                          title="Edit Email"
                        >
                          <Pencil className="h-3 w-3" /> Edit
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {otpSent && !isEmailVerified && (
                  <div className="mt-6 flex flex-col items-center gap-6 rounded-md border border-slate-100 bg-[#f8fafc]/60 px-6 py-10 sm:px-12 md:rounded-md">
                    <h4 className="text-[13px] font-bold text-[#5e35b1]">Enter Verification Code</h4>
                    <div className="flex flex-row gap-3 w-full max-w-xl">
                        <input
                          type="text"
                          maxLength={6}
                          value={emailOtp}
                          onChange={(e) => setEmailOtp(e.target.value.replace(/\D/g, ''))}
                          className="h-11 w-32 rounded border-2 border-slate-900 bg-white text-center text-sm font-bold tracking-[0.2em] focus:ring-2 focus:ring-slate-400 outline-none"
                        />
                        <Button 
                          onClick={handleVerifyOtp} 
                          className="flex-1 h-11 rounded bg-[#0f172a] text-white font-bold text-[11px] hover:bg-[#1e293b] transition-colors shadow-sm"
                        >
                           Verify Code
                        </Button>
                    </div>
                    <button 
                      onClick={handleSendOtp} 
                      className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 underline decoration-slate-400 underline-offset-4"
                    >
                      Didn't receive? Resend Code
                    </button>
                  </div>
                )}
              </div>
            )}

            {currentSubStep === 4 && (
              <div className="space-y-6 animate-in slide-in-from-right-4 duration-300">
                {role === 'buyer' ? (
                  <>
                    <h2 className="text-base md:text-base font-bold text-slate-800">User Credentials</h2>
                    <div className="max-w-md">
                      <Input
                        label="User Id *"
                        placeholder="Enter User id"
                        value={formData.userId}
                        onChange={(e) => setFormData({...formData, userId: e.target.value})}
                        error={!formData.userId ? 'Please enter user id.' : undefined}
                        className="h-11 rounded-lg border-slate-200 bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Input
                        label="Password *"
                        type="password"
                        placeholder="Enter Password"
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        className="h-11 rounded-lg border-slate-200 bg-white"
                      />
                      <Input
                        label="Confirm Password*"
                        type="password"
                        placeholder="Confirm Password"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                        className="h-11 rounded-lg border-slate-200 bg-white"
                      />
                    </div>

                    <div className="space-y-3 text-xs text-slate-400">
                      <p>Password must contain minimum of</p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-16 gap-y-3 max-w-xl">
                        <CredentialRule label="One Upper Case" valid={/[A-Z]/.test(formData.password)} />
                        <CredentialRule label="One Lower Case" valid={/[a-z]/.test(formData.password)} />
                        <CredentialRule label="One Numeric" valid={/[0-9]/.test(formData.password)} />
                        <CredentialRule label="One Special Character" valid={/[^A-Za-z0-9]/.test(formData.password)} />
                        <CredentialRule label="8 characters and maximum of 16 characters" valid={formData.password.length >= 8 && formData.password.length <= 16} />
                      </div>
                    </div>

                    <div className="flex justify-end">
                      <Button
                        onClick={handleSubmit}
                        disabled={isLoading || !formData.userId || !isPasswordStrong(formData.password) || formData.password !== formData.confirmPassword}
                        className={cn(
                          "h-11 w-full sm:w-64 rounded-lg font-bold  tracking-wide",
                          !isLoading && formData.userId && isPasswordStrong(formData.password) && formData.password === formData.confirmPassword
                            ? "bg-slate-900 text-white"
                            : "bg-slate-200 text-slate-500"
                        )}
                      >
                        {isLoading ? 'Creating Account...' : 'Create Account'}
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl md:text-2xl font-black text-slate-800">User Credentials</h2>
                    <div className="max-w-md">
                      <Input
                        label="User Id *"
                        placeholder="Enter unique user id"
                        value={formData.userId}
                        onChange={(e) => setFormData({...formData, userId: e.target.value})}
                        error={!formData.userId ? 'Please enter user id.' : undefined}
                        className="h-14 rounded-lg border-slate-200 bg-white"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                      <Input
                        label="Password *"
                        type="password"
                        placeholder="Enter Password"
                        value={formData.password}
                        onChange={(e) => setFormData({...formData, password: e.target.value})}
                        className="h-14 rounded-lg border-slate-200 bg-white"
                      />
                      <Input
                        label="Confirm Password*"
                        type="password"
                        placeholder="Confirm Password"
                        value={formData.confirmPassword}
                        onChange={(e) => setFormData({...formData, confirmPassword: e.target.value})}
                        className="h-14 rounded-lg border-slate-200 bg-white"
                      />
                    </div>

                    <div className="rounded bg-slate-50 p-4 sm:p-6 md:rounded">
                       <h4 className="text-[10px] font-bold  text-slate-400 mb-4  ">Password Security Checklist</h4>
                       <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <ValidationItem label="8-16 Characters" valid={formData.password.length >= 8 && formData.password.length <= 16} />
                          <ValidationItem label=" Letter" valid={/[A-Z]/.test(formData.password)} />
                          <ValidationItem label="Lowercase Letter" valid={/[a-z]/.test(formData.password)} />
                          <ValidationItem label="Numeric Value" valid={/[0-9]/.test(formData.password)} />
                          <ValidationItem label="Special Character" valid={/[^A-Za-z0-9]/.test(formData.password)} />
                          <ValidationItem label="Passwords Match" valid={formData.password !== '' && formData.password === formData.confirmPassword} />
                       </div>
                    </div>
                    <div className="flex justify-end pt-6">
                      <Button
                        onClick={handleSubmit}
                        disabled={isLoading || !formData.userId || !isPasswordStrong(formData.password) || formData.password !== formData.confirmPassword}
                        className={cn(
                          "h-14 w-full sm:w-64 rounded-lg font-black uppercase tracking-wide",
                          !isLoading && formData.userId && isPasswordStrong(formData.password) && formData.password === formData.confirmPassword
                            ? "bg-slate-900 text-white"
                            : "bg-slate-200 text-slate-500"
                        )}
                      >
                        {isLoading ? 'Creating Account...' : 'Create Account'}
                      </Button>
                    </div>
                  </>
                )}
              </div>
            )}

            <div className="mt-10 flex items-center justify-end gap-4 pt-6">
              <Button 
                  variant="ghost" 
                  onClick={handleBack}
                  disabled={isLoading}
                  className="h-10 px-6 rounded bg-slate-100 hover:bg-slate-200 text-slate-600 text-[13px] font-bold  tracking-wide"
                >
                  Back
                </Button>
              
              {currentSubStep === 2 && role === 'buyer' && isAadhaarVerified ? null : currentSubStep === 4 && role === 'buyer' ? null : currentSubStep < 4 ? (
                <Button 
                  onClick={handleNext}
                  disabled={currentSubStep === 1 && isPrimaryBuyer && !isPrimaryBuyerOrganisationComplete}
                  className={cn(
                    "h-10 px-8 rounded text-[13px] font-bold  tracking-wider transition-all",
                    currentSubStep === 1 && isPrimaryBuyer && !isPrimaryBuyerOrganisationComplete
                      ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                      : "bg-slate-200 hover:bg-slate-300 text-slate-600" 
                  )}
                >
                  {currentSubStep === 1 && isPrimaryBuyer && !isPrimaryBuyerOrganisationComplete ? 'Complete Details' : 'Next'}
                </Button>
              ) : (
                <Button 
                  onClick={handleSubmit}
                  disabled={isLoading || !isPasswordStrong(formData.password) || formData.password !== formData.confirmPassword}
                  className="h-10 px-8 rounded bg-blue-600 hover:bg-blue-700 text-white text-[13px] font-bold  tracking-wider shadow-sm flex items-center gap-2"
                >
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  {isLoading ? 'Creating...' : 'Create Account'}
                </Button>
              )}
            </div>
          </CardContent>
        </div>
      </div>
    </Card>
  </div>
  );
}

function ValidationItem({ label, valid }: { label: string, valid: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <div className={`w-4 h-4 rounded-full flex items-center justify-center ${valid ? 'bg-green-500' : 'bg-slate-200'}`}>
         {valid && <CheckCircle2 className="h-3 w-3 text-white" />}
      </div>
      <span className={`text-[10px] font-bold   ${valid ? 'text-green-600' : 'text-slate-400'}`}>{label}</span>
    </div>
  );
}

function SellerRoleDetails({
  firstName,
  lastName,
  roleInOrg,
  roleOptions,
  onChange
}: {
  firstName: string;
  lastName: string;
  roleInOrg: string;
  roleOptions: string[];
  onChange: (patch: { personalName?: string; personalLastName?: string; roleInOrg?: string }) => void;
}) {
  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-800">First Name*</label>
          <input
            value={firstName}
            onChange={(event) => onChange({ personalName: event.target.value.replace(/[^A-Za-z .-]/g, '').slice(0, 100) })}
            placeholder="Enter first name"
            className="h-11 w-full rounded border border-slate-300 bg-white px-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
          {!firstName.trim() && <p className="text-xs font-medium text-red-600">First name is required.</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-800">Last Name</label>
          <input
            value={lastName}
            onChange={(event) => onChange({ personalLastName: event.target.value.replace(/[^A-Za-z .-]/g, '').slice(0, 100) })}
            placeholder="Enter last name"
            className="h-11 w-full rounded border border-slate-300 bg-white px-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      <div className="max-w-md space-y-1.5">
        <label className="text-sm font-semibold text-slate-800">Role in Organisation*</label>
        <select
          value={roleInOrg}
          onChange={(event) => onChange({ roleInOrg: event.target.value })}
          className="h-11 w-full rounded border border-slate-300 bg-white px-4 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
        >
          <option value="">Select your role</option>
          {roleOptions.map((option) => (
            <option key={option} value={option}>{option}</option>
          ))}
        </select>
        {!roleInOrg && <p className="text-xs font-medium text-red-600">Please select your role.</p>}
      </div>
    </div>
  );
}

function CredentialRule({ label, valid }: { label: string, valid: boolean }) {
  return (
    <div className="flex items-center gap-3">
      <span className={cn("h-3.5 w-3.5 rounded-full", valid ? "bg-green-500" : "bg-slate-300")} />
      <span className={cn("text-xs", valid ? "text-green-700" : "text-slate-400")}>{label}</span>
    </div>
  );
}
