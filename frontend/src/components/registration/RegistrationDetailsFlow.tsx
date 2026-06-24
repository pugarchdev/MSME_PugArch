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
  Info,
  Eye,
  EyeOff,
  Pencil
} from 'lucide-react';
import { Loader2 } from '../ui/loader';
import { useAuth } from '../../hooks/useAuth';
import { useRouter, useSearchParams } from 'next/navigation';
import { cn } from '../../lib/utils';
import { indiaStates, indiaStatesDistricts } from '../../data/indiaStatesDistricts';
import { aadhaarKycApi, type AadhaarKycStatus } from '../../features/kyc/aadhaarKycApi';

interface RegistrationDetailsFlowProps {
  businessType: string;
  shgType?: string;
  onBack: () => void;
  role: 'buyer' | 'seller';
  variant?: 'buyer' | 'seller' | 'hershg';
  prereqSelectedDocuments?: string[];
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

const getDistrictOrganisations = (state: string, district: string) =>
  state && district ? districtOrganisationOverrides[`${state}:${district}`] || [] : [];

const buyerDocOptions = [
  { id: 'panCard', label: 'PAN Card of Organization' },
  { id: 'regCert', label: 'Company Registration Certificate (CIN / Partnership Deed / Shop Act / Trust Registration)' },
  { id: 'gstCert', label: 'GST Certificate (if applicable)' },
  { id: 'addressProof', label: 'Address Proof' },
  { id: 'authLetter', label: 'Authorization Letter of Representative (Optional)' }
];

// MSME Udyam Registration Number — official format `UDYAM-<state>-<district>-<seq>`
// where state is 2 letters, district is 2 digits, sequence is 7 digits.
// Example: UDYAM-MH-12-0123456
const UDYAM_REGEX = /^UDYAM-[A-Z]{2}-\d{2}-\d{7}$/;

// Corporate Identification Number issued by MCA — 21 chars:
//   1 letter (L=listed, U=unlisted) + 5 digits (industry code)
//   + 2 letters (state) + 4 digits (year) + 3 letters (entity type)
//   + 6 digits (registration number).
// Example: U72900MH1996PLC104693
const CIN_REGEX = /^[LU]\d{5}[A-Z]{2}\d{4}[A-Z]{3}\d{6}$/;

const validateUdyam = (value: string) => {
  const v = value.trim().toUpperCase();
  if (!v) return 'Please enter Udyam Number.';
  if (!UDYAM_REGEX.test(v)) return 'Invalid Udyam format. Expected UDYAM-XX-00-0000000.';
  return '';
};

const validateCin = (value: string) => {
  const v = value.trim().toUpperCase();
  if (!v) return ''; // CIN is optional
  if (v.length !== 21) return 'CIN must be exactly 21 characters.';
  if (!CIN_REGEX.test(v)) return 'Invalid CIN format. Example: U72900MH1996PLC104693.';
  return '';
};

export default function RegistrationDetailsFlow({ businessType, shgType = '', onBack, role, variant, prereqSelectedDocuments = [] }: RegistrationDetailsFlowProps) {
  const [currentSubStep, setCurrentSubStep] = useState(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.has('aadhaar')) return 2;
      const saved = localStorage.getItem('preRegisterKycSubStep');
      if (saved) return Number(saved);
    }
    return 1;
  });
  const { user, login } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [enabledFeatures, setEnabledFeatures] = useState<string[]>([]);

  useEffect(() => {
    api.get('/api/auth/features')
      .then(res => res.json())
      .then(data => {
        if (data?.enabledFeatures) {
          setEnabledFeatures(data.enabledFeatures);
        }
      })
      .catch(err => console.error(err));
  }, []);

  const isSmsEnabled = enabledFeatures.includes('sms');

  useEffect(() => {
    const aadhaarParam = searchParams?.get('aadhaar');
    if (!aadhaarParam) return;
    if (aadhaarParam === 'failed') {
      toast.error('Aadhaar verification failed. Please try again.');
    } else if (aadhaarParam === 'expired') {
      toast.error('Aadhaar verification session expired. Please try again.');
    }
  }, [searchParams]);

  // Form State
  const [formData, setFormData] = useState(() => {
    const initial = {
      businessName: '',
      industry: '',
      cin: '',
      gstin: '',
      udyamNumber: '',
      website: '',
      orgPan: '',
      personalVerificationMethod: role === 'buyer' ? 'aadhaar' : 'pan',
      aadhaarNumber: '',
      panNumber: '',
      personalName: '',
      personalLastName: '',
      dob: '',
      mobile: '',
      kycSessionToken: '',
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
    };
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('preRegisterKycFormData');
      if (saved) {
        try {
          return { ...initial, ...JSON.parse(saved) };
        } catch {
          return initial;
        }
      }
    }
    return initial;
  });

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const { password, confirmPassword, kycSessionToken, ...safeFormData } = formData;
      localStorage.setItem('preRegisterKycFormData', JSON.stringify(safeFormData));
    }
  }, [formData]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('preRegisterKycSubStep', String(currentSubStep));
    }
  }, [currentSubStep]);

  const [isLoading, setIsLoading] = useState(false);
  const [isFetchingGst, setIsFetchingGst] = useState(false);
  const [showOptionalDetails, setShowOptionalDetails] = useState(false);
  const [selectedDocs, setSelectedDocs] = useState<string[]>(['panCard', 'regCert', 'addressProof']);
  const [isSuccess, setIsSuccess] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(5);
  const [showAadhaar, setShowAadhaar] = useState(false);

  useEffect(() => {
    if (!isSuccess) return;
    if (secondsLeft <= 0) {
      router.push('/login');
    }
  }, [secondsLeft, isSuccess, router]);

  useEffect(() => {
    if (!isSuccess) return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [isSuccess]);

  const [submitErrors, setSubmitErrors] = useState<Record<string, string>>({});
  const [gstError, setGstError] = useState<string>('');
  const [isGstVerified, setIsGstVerified] = useState(false);
  const [verifiedGstDetails, setVerifiedGstDetails] = useState<any>(null);

  const isHerShg = variant === 'hershg' || businessType === 'herSHG';

  const sellerRegistrationDocuments = () => {
    const docs = new Set(prereqSelectedDocuments);
    if (isHerShg) {
      docs.add('authorization_letter');
      docs.add('registration_certificate');
      docs.add('member_list');
      docs.add('bank_passbook');
      docs.add('address_proof');
    }
    if (formData.gstin && isGstVerified) docs.add('gst_certificate');
    if (formData.udyamNumber) docs.add('udyam_certificate');
    if (formData.cin) docs.add('business_registration_proof');
    if (businessType.toLowerCase().includes('startup')) docs.add('dipp_certificate');
    return Array.from(docs);
  };

  const fetchGstDetails = async () => {
    if (!formData.gstin || formData.gstin.length !== 15) {
      setGstError('Please enter a valid 15-digit GSTIN');
      return;
    }

    setIsFetchingGst(true);
    setGstError('');
    try {
      const res = await api.fetch(`/api/utils/gst-verify/${formData.gstin}`);

      if (res.ok) {
        const data = await res.json();
        if (!data?.legalName || !data?.address) {
          setGstError('Please verify GSTIN and enter.');
          return;
        }
        // Never let a masked PAN ("AA***1P") populate the field — derive it
        // from the GSTIN (chars 3–12) if the API value isn't a valid PAN.
        const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
        const apiPan = String(data.pan || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const gstinPan = String(formData.gstin || '').toUpperCase().slice(2, 12);
        const resolvedPan = PAN_RE.test(apiPan) ? apiPan : (PAN_RE.test(gstinPan) ? gstinPan : '');
        setFormData((prev: any) => ({
          ...prev,
          businessName: data.legalName?.trim() || prev.businessName,
          orgPan: resolvedPan || prev.orgPan,
          state: data.state?.trim() || prev.state,
          district: data.city?.trim() || prev.district,
        }));
        setVerifiedGstDetails(data);
        setIsGstVerified(true);
        toast.success(`GST verified: ${data.status || 'Status available'}`);
      } else {
        const err = await res.json().catch(() => ({}));
        setGstError(err?.message || 'Incorrect or invalid GST');
        setVerifiedGstDetails(null);
        setIsGstVerified(false);
      }
    } catch (err) {
      setGstError('Verification service unavailable');
      setVerifiedGstDetails(null);
      setIsGstVerified(false);
    } finally {
      setIsFetchingGst(false);
    }
  };

  const statusFetchedRef = React.useRef(false);
  const [isAadhaarVerified, setIsAadhaarVerified] = useState(false);
  const [rawAadhaar, setRawAadhaar] = useState('');
  const [aadhaarKycStatus, setAadhaarKycStatus] = useState<AadhaarKycStatus['status']>('NOT_STARTED');
  const [isStartingAadhaarKyc, setIsStartingAadhaarKyc] = useState(false);
  const [isFetchingAadhaarKyc, setIsFetchingAadhaarKyc] = useState(false);
  const [aadhaarConsent, setAadhaarConsent] = useState(false);
  const [isPanVerified, setIsPanVerified] = useState(false);
  const [mobileAvailability, setMobileAvailability] = useState<'idle' | 'checking' | 'available' | 'exists'>('idle');
  const [aadhaarTouched, setAadhaarTouched] = useState(false);
  const [mobileTouched, setMobileTouched] = useState(false);

  const [emailOtp, setEmailOtp] = useState('');
  const [isEmailVerified, setIsEmailVerified] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [isSendingOtp, setIsSendingOtp] = useState(false);
  const [mobileOtp, setMobileOtp] = useState('');
  const [isMobileOtpVerified, setIsMobileOtpVerified] = useState(false);
  const [mobileOtpSent, setMobileOtpSent] = useState(false);
  const [isSendingMobileOtp, setIsSendingMobileOtp] = useState(false);

  const getOtpSentMessage = (data: any) => {
    if (typeof data?.sendsRemaining !== 'number') return 'OTP sent successfully';
    if (data.sendsRemaining <= 0) return 'OTP sent. No resends remaining.';
    if (data.sendsRemaining === 1) return 'OTP sent. Last resend is remaining.';
    return `OTP sent. ${data.sendsRemaining} resends are remaining.`;
  };

  const getFriendlyFieldError = (field: string, message?: string) => {
    if (message) return message;
    if (field === 'verificationMethod') return 'Please select Aadhaar or Personal PAN verification.';
    if (field === 'aadhaarVerified') return 'Please verify Aadhaar before creating the account.';
    if (field === 'pan') return 'Please enter and verify a valid PAN number.';
    if (field === 'dob') return 'Date of birth cannot be future and age must be at least 18 years.';
    if (field === 'mobile') return 'Enter a valid 10 digit mobile number starting with 6, 7, 8, or 9.';
    if (field === 'password') return 'Password must be 12-128 characters and include uppercase, lowercase, number, and special character.';
    if (field === 'email') return 'Enter a valid email address.';
    if (field === 'role') return 'Select a valid registration type.';
    return 'Please check this field.';
  };

  const handleRegistrationError = (data: any) => {
    const fieldErrors = data?.details?.fieldErrors || data?.errors || {};
    const nextErrors = Object.entries(fieldErrors).reduce<Record<string, string>>((acc, [field, messages]) => {
      acc[field] = getFriendlyFieldError(field, Array.isArray(messages) ? String(messages[0] || '') : (typeof messages === 'string' ? messages : undefined));
      return acc;
    }, {});

    if (Object.keys(nextErrors).length > 0) {
      setSubmitErrors(nextErrors);
      if (nextErrors.verificationMethod || nextErrors.aadhaarVerified || nextErrors.pan || nextErrors.dob || nextErrors.mobile) {
        setCurrentSubStep(2);
        if (nextErrors.aadhaarVerified) {
          // Reset Aadhaar verification state since it failed on backend (expired/invalid)
          setIsAadhaarVerified(false);
          setAadhaarKycStatus('NOT_STARTED');
          statusFetchedRef.current = false;
          setFormData(prev => ({
            ...prev,
            kycSessionToken: ''
          }));
          if (typeof window !== 'undefined') {
            sessionStorage.removeItem('preRegisterKycSessionToken');
          }
        }
      }
      else if (nextErrors.email) setCurrentSubStep(3);
      else if (nextErrors.password || nextErrors.name || nextErrors.role) setCurrentSubStep(4);
      const firstError = Object.values(nextErrors)[0];
      toast.error(firstError);
      return;
    }

    toast.error(data?.message || 'Registration failed. Please check the highlighted fields.');
  };

  const steps = [
    { id: 1, title: 'Organisation Details', icon: Building2 },
    { id: 2, title: 'Personal Verification', icon: UserCheck },
    { id: 3, title: 'Email Verification', icon: Mail },
    { id: 4, title: 'User Credentials', icon: Lock }
  ].filter(step => !user || step.id === 1);

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
  getDistrictOrganisations(formData.state, formData.district);
  const missingPrimaryBuyerFields = [
    !formData.organisationType && 'Organisation Type',
    !formData.state && 'State',
    !formData.district && 'District',
    !formData.organisation && 'Organisation',
    !formData.officeZoneName && 'Office/Zone Name'
  ].filter(Boolean);

  const aadhaarValue = isAadhaarVerified ? formData.aadhaarNumber.trim() : rawAadhaar.trim();
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
    aadhaarNumber: isAadhaarVerified
      ? ''
      : !aadhaarValue
        ? (aadhaarTouched ? 'Aadhaar Number / Virtual ID is required.' : '')
        : !isAadhaarOrVidValid
          ? (aadhaarValue.length > 12 && aadhaarValue.length < 16
            ? `Aadhaar must be exactly 12 digits (entered ${aadhaarValue.length}). Virtual ID must be exactly 16 digits.`
            : aadhaarValue.length > 16
              ? 'Aadhaar must be 12 digits or Virtual ID must be 16 digits.'
              : `Enter exactly 12 digits for Aadhaar or 16 digits for Virtual ID (entered ${aadhaarValue.length}).`)
          : '',
    mobile: !mobileValue
      ? (mobileTouched ? 'Mobile number linked with Aadhaar is required.' : '')
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
  const isAadhaarReady = aadhaarConsent && !isFetchingAadhaarKyc && !isStartingAadhaarKyc;
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
    if ('aadhaarNumber' in patch) setAadhaarTouched(true);
    if ('mobile' in patch) setMobileTouched(true);
    if ('mobile' in patch || 'aadhaarNumber' in patch) {
      setSubmitErrors(prev => {
        const { mobile, aadhaarNumber, ...rest } = prev;
        return rest;
      });
    }
    setIsAadhaarVerified(false);
    setAadhaarKycStatus('NOT_STARTED');
  };

  const handleEditAadhaarDetails = () => {
    statusFetchedRef.current = false;
    setFormData(prev => ({
      ...prev,
      aadhaarNumber: '',
      mobile: '',
      personalName: '',
      personalLastName: '',
      kycSessionToken: ''
    }));
    setRawAadhaar('');
    setAadhaarConsent(false);
    setIsAadhaarVerified(false);
    setAadhaarKycStatus('NOT_STARTED');
    setMobileAvailability('idle');
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem('preRegisterKycSessionToken');
      localStorage.removeItem('preRegisterKycRedirectPath');
      localStorage.removeItem('preRegisterKycFormData');
      localStorage.removeItem('preRegisterKycSubStep');
      localStorage.removeItem('preRegisterKycStep');
      localStorage.removeItem('preRegisterKycBusinessType');
      localStorage.removeItem('preRegisterKycShgType');
      localStorage.removeItem('preRegisterKycSelectedDocs');
      sessionStorage.removeItem('registrationSessionActive');
      
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.has('aadhaar') || url.searchParams.has('reason')) {
          url.searchParams.delete('aadhaar');
          url.searchParams.delete('reason');
          window.history.replaceState({}, '', url.pathname + url.search);
        }
      } catch (e) {
        console.error('Error clearing URL params:', e);
      }
    }
  };

  const refreshAadhaarKycStatus = async () => {
    if (!user) return;
    setIsFetchingAadhaarKyc(true);
    try {
      const status = await aadhaarKycApi.status();
      setAadhaarKycStatus(status.status);
      setIsAadhaarVerified(status.status === 'VERIFIED');
    } catch {
      toast.error('Unable to fetch Aadhaar verification status. Please try again.');
    } finally {
      setIsFetchingAadhaarKyc(false);
    }
  };

  useEffect(() => {
    if (user) {
      if (currentSubStep === 2 && formData.personalVerificationMethod === 'aadhaar') {
        void refreshAadhaarKycStatus();
      }
    } else if (formData.personalVerificationMethod === 'aadhaar') {
      const token = sessionStorage.getItem('preRegisterKycSessionToken');
      if (token && !isAadhaarVerified) {
        if (statusFetchedRef.current) return;
        statusFetchedRef.current = true;
        setIsFetchingAadhaarKyc(true);
        aadhaarKycApi.status(token)
          .then(status => {
            setAadhaarKycStatus(status.status || 'VERIFIED');
            const verified = status.verified && status.isValid;
            setIsAadhaarVerified(Boolean(verified));
            if (verified) {
              if (currentSubStep === 2) {
                toast.success('Aadhaar verification successful');
              }
              setFormData(prev => ({
                ...prev,
                kycSessionToken: token,
                aadhaarNumber: status.maskedAadhaar || prev.aadhaarNumber || 'XXXX XXXX 5417',
                personalName: prev.personalName || status.firstName || '',
                personalLastName: prev.personalLastName || status.lastName || '',
              }));
            } else {
              statusFetchedRef.current = false;
              sessionStorage.removeItem('preRegisterKycSessionToken');
              setFormData(prev => ({
                ...prev,
                kycSessionToken: '',
              }));
            }
          })
          .catch((err: any) => {
            statusFetchedRef.current = false;
            sessionStorage.removeItem('preRegisterKycSessionToken');
            setFormData(prev => ({
              ...prev,
              kycSessionToken: '',
            }));
            if (currentSubStep === 2) {
              toast.error(err?.message || 'Failed to verify Aadhaar status. Please try again.');
            }
          })
          .finally(() => setIsFetchingAadhaarKyc(false));
      }
    }
  }, [user?.id, formData.personalVerificationMethod, isAadhaarVerified]);

  const handleStartAadhaarKyc = async () => {
    if (!aadhaarConsent) return toast.error('Consent is required before Aadhaar verification.');
    
    if (!user) {
      setIsStartingAadhaarKyc(true);
      try {
        const payload = {
          consent: aadhaarConsent,
          mobile: formData.mobile || formData.email || '',
          aadhaarNumber: rawAadhaar,
          redirectPath: window.location.pathname,
          frontendOrigin: window.location.origin,
        };
        const { authorizationUrl, kycSessionToken } = await aadhaarKycApi.preRegisterStart(payload);
        if (!authorizationUrl) throw new Error('Missing authorization URL');
        sessionStorage.setItem('preRegisterKycSessionToken', kycSessionToken);
        localStorage.setItem('preRegisterKycRedirectPath', window.location.pathname);
        localStorage.setItem('preRegisterKycFormData', JSON.stringify(formData));
        localStorage.setItem('preRegisterKycSubStep', String(currentSubStep));
        localStorage.setItem('preRegisterKycStep', '3');
        localStorage.setItem('preRegisterKycBusinessType', businessType);
        localStorage.setItem('preRegisterKycShgType', shgType);
        localStorage.setItem('preRegisterKycSelectedDocs', JSON.stringify(prereqSelectedDocuments));
        window.location.assign(authorizationUrl);
      } catch {
        toast.error('Unable to start Aadhaar verification. Please try again.');
      } finally {
        setIsStartingAadhaarKyc(false);
      }
      return;
    }

    setIsStartingAadhaarKyc(true);
    try {
      const { authorizationUrl } = await aadhaarKycApi.startUrl({ redirectPath: window.location.pathname, frontendOrigin: window.location.origin });
      if (!authorizationUrl) throw new Error('Missing authorization URL');
      window.location.assign(authorizationUrl);
    } catch {
      toast.error('Unable to start Aadhaar verification. Please try again.');
    } finally {
      setIsStartingAadhaarKyc(false);
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
      if (role === 'seller' && !isHerShg && showOptionalDetails && !formData.udyamNumber) {
        toast.error('Please enter Udyam Number');
        return;
      }
      if (role === 'seller' && showOptionalDetails && formData.udyamNumber) {
        const err = validateUdyam(formData.udyamNumber);
        if (err) {
          toast.error(err);
          return;
        }
      }
      if (showOptionalDetails && formData.cin) {
        const err = validateCin(formData.cin);
        if (err) {
          toast.error(err);
          return;
        }
      }
      if (formData.gstin && gstError) {
        toast.error(gstError);
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
      if (role === 'seller' || role === 'buyer') {
        if (!formData.personalName.trim()) {
          toast.error('Please enter first name');
          return;
        }
        if (role === 'seller' && !isHerShg && !formData.roleInOrg) {
          toast.error('Please select your role');
          return;
        }
      }
    }
    if (currentSubStep === 3 && !isEmailVerified) {
      toast.error('Please verify your email address first');
      return;
    }

    if (currentSubStep === 3 && isEmailVerified) {
      if (!formData.userId && formData.email) {
        setFormData(prev => ({ ...prev, userId: formData.email }));
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
    setIsSendingOtp(true);
    try {
      const res = await api.post('/api/auth/send-email-otp', { email: formData.email });
      const data = await res.json();
      if (res.ok) {
        setOtpSent(true);
        toast.success(getOtpSentMessage(data));
      } else {
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
      const data = await res.json();
      if (res.ok) {
        setIsEmailVerified(true);
        toast.success('Email verified!');
      } else {
        toast.error(data.message || 'Invalid OTP');
      }
    } catch (err) {
      toast.error('Verification failed');
    }
  };

  const handleSendMobileOtp = async () => {
    const mobile = formData.mobile.trim();
    if (!/^[6-9]\d{9}$/.test(mobile)) return toast.error('Enter a valid 10 digit mobile number.');
    setIsSendingMobileOtp(true);
    try {
      const res = await api.post('/api/auth/send-mobile-otp', { mobile });
      const data = await res.json();
      if (res.ok) {
        setMobileOtpSent(true);
        toast.success(data.smsEnabled === false ? 'Mobile OTP request saved. SMS delivery is currently disabled.' : getOtpSentMessage(data));
      } else {
        toast.error(data.message || 'Failed to send mobile OTP');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setIsSendingMobileOtp(false);
    }
  };

  const handleVerifyMobileOtp = async () => {
    const mobile = formData.mobile.trim();
    if (!mobileOtp) return toast.error('Enter mobile OTP');
    try {
      const res = await api.post('/api/auth/verify-mobile-otp', { mobile, otp: mobileOtp });
      const data = await res.json();
      if (res.ok) {
        setIsMobileOtpVerified(true);
        toast.success('Mobile number verified.');
      } else {
        toast.error(data.message || 'Invalid mobile OTP');
      }
    } catch {
      toast.error('Mobile verification failed');
    }
  };

  const handleSubmit = async () => {
    if (formData.gstin && gstError) {
      return toast.error(gstError);
    }
    if (!user) {
      if (!formData.userId) {
        return toast.error('Please enter user id');
      }
      if (formData.password !== formData.confirmPassword) {
        setSubmitErrors(prev => ({ ...prev, confirmPassword: 'Passwords do not match.' }));
        return toast.error('Passwords do not match');
      }
      if (!isPasswordStrong(formData.password)) {
        const message = getFriendlyFieldError('password');
        setSubmitErrors(prev => ({ ...prev, password: message }));
        toast.error(message);
        return;
      }
    }

    setIsLoading(true);
    try {
      let res;
      if (user) {
        // Activate dual role
        const profileData: any = {
          organizationName: formData.businessName || user.name,
          businessType: businessType || 'Proprietorship',
          shgType: shgType || null,
          pan: formData.panNumber || user.registrationDetails?.pan || '',
          state: formData.state,
          district: formData.district,
          officeZoneName: formData.officeZoneName,
          representativeName: user.name,
          mobile: formData.mobile || user.mobile || '',
          email: user.email,
          gst: formData.gstin || null,
          verificationMethod: formData.personalVerificationMethod,
          documents: role === 'buyer' ? selectedDocs : sellerRegistrationDocuments()
        };
        res = await api.post('/api/auth/activate-dual-role', {
          roleToActivate: role,
          profileData
        });
      } else {
        // Normal registration
        const token = formData.kycSessionToken || (typeof window !== 'undefined' ? sessionStorage.getItem('preRegisterKycSessionToken') || '' : '');
        console.error("DEBUG SUBMIT PAYLOAD:", {
          token,
          formDataKycToken: formData.kycSessionToken,
          sessionStorageKycToken: typeof window !== 'undefined' ? sessionStorage.getItem('preRegisterKycSessionToken') : null,
          isAadhaarVerified,
          verificationMethod: formData.personalVerificationMethod
        });
        const accountName = [formData.personalName, formData.personalLastName].map(v => v.trim()).filter(Boolean).join(' ') || formData.userId.trim() || formData.businessName.trim();
        const payload: any = {
          name: accountName,
          email: formData.email || formData.userId,
          password: formData.password,
          role,
          dob: formData.dob,
          kycSessionToken: token,
          registrationDetails: {
            businessType,
            shgType: shgType || null,
            stakeholderCategory: isHerShg ? 'herSHG' : role,
            businessName: formData.businessName,
            userId: formData.userId,
            verificationMethod: formData.personalVerificationMethod,
            isEmailVerified: true,
            state: formData.state,
            district: formData.district,
            officeZoneName: formData.officeZoneName,
            aadhaarVerificationId: token,
            aadhaarMasked: isAadhaarVerified ? formData.aadhaarNumber : undefined,
            pan: formData.panNumber,
            roleInOrg: formData.roleInOrg,
            udyamNumber: formData.udyamNumber,
            gstin: formData.gstin,
            gstVerified: Boolean(formData.gstin && isGstVerified),
            gstDetails: Boolean(formData.gstin && isGstVerified) ? verifiedGstDetails : null,
            cin: formData.cin,
            website: formData.website,
            accountName,
            selectedDocuments: role === 'buyer' ? selectedDocs : sellerRegistrationDocuments()
          }
        };
        if (formData.mobile.trim()) payload.mobile = formData.mobile.trim();
        console.log('DEBUG FRONTEND REGISTER payload keys:', Object.keys(payload));
        console.log('DEBUG FRONTEND REGISTER registrationDetails keys:', Object.keys(payload.registrationDetails || {}));
        console.log('Registration details normal submit payload:', {
          role,
          kycSessionToken: payload.kycSessionToken,
          aadhaarVerificationId: payload.registrationDetails?.aadhaarVerificationId,
          verificationMethod: payload.registrationDetails?.verificationMethod
        });
        res = await api.post('/api/auth/register', payload);
      }

      const data = await res.json();
      if (res.ok) {
        if (user) {
          login(data.accessToken || data.token, data.user, data.refreshToken);
          toast.success('Dual profile activated successfully!');
          router.push('/dashboard');
        } else {
          toast.success('Registration completed successfully!');
          sessionStorage.removeItem('preRegisterKycSessionToken');
          localStorage.removeItem('preRegisterKycRedirectPath');
          localStorage.removeItem('preRegisterKycFormData');
          localStorage.removeItem('preRegisterKycSubStep');
          localStorage.removeItem('preRegisterKycStep');
          localStorage.removeItem('preRegisterKycBusinessType');
          localStorage.removeItem('preRegisterKycShgType');
          localStorage.removeItem('preRegisterKycSelectedDocs');
          sessionStorage.removeItem('registrationSessionActive');
          setIsSuccess(true);
        }
      } else {
        handleRegistrationError(data);
      }
    } catch (err) {
      toast.error('Registration failed');
    } finally {
      setIsLoading(false);
    }
  };

  const isPasswordStrong = (pw: string) => {
    return pw.length >= 12 && pw.length <= 128 &&
      /[A-Z]/.test(pw) && /[a-z]/.test(pw) &&
      /[0-9]/.test(pw) && /[^A-Za-z0-9]/.test(pw);
  };
  const isBuyerAadhaarReady = isAadhaarReady;
  if (isSuccess) {
    return (
      <div className="mx-auto w-full max-w-md text-center py-10 px-4 font-sans">
        <Card className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white p-8 shadow-xl animate-in zoom-in-95 duration-500">
          <div className="flex justify-center mb-6">
            <div className="h-16 w-16 bg-emerald-100 rounded-full flex items-center justify-center animate-bounce">
              <CheckCircle2 className="h-10 w-10 text-emerald-600" />
            </div>
          </div>
          <h2 className="text-2xl font-black text-slate-800 tracking-tight">Registration Successful!</h2>
          <p className="mt-4 text-sm font-medium text-slate-650 leading-relaxed">
            You successfully registered. Please login again to access the portal.
          </p>
          <div className="mt-6 p-4 bg-slate-50 border border-slate-100 rounded-xl">
            <p className="text-xs text-slate-500 font-semibold">
              Redirecting to the login page in <span className="font-bold text-[#12335f] text-sm">{secondsLeft}</span> seconds...
            </p>
          </div>
          <Button
            onClick={() => router.push('/login')}
            className="mt-8 w-full bg-[#12335f] hover:bg-[#0c2340] text-white px-6 font-bold tracking-wide rounded-lg uppercase text-xs h-11 shadow-md hover:shadow-lg transition-all"
          >
            Go to Login
          </Button>
        </Card>
      </div>
    );
  }

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
                      <div className="absolute left-0 top-0 bottom-0 w-[3px] bg-[#12335f]" />
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
                  <h2 className="mb-8 text-xl font-bold tracking-tight text-slate-800 sm:text-2xl">{isHerShg ? 'herSHG Organisation Details' : 'Organisation Details'}</h2>

                  {isPrimaryBuyer ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-6">
                      <div className="space-y-2">
                        <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                          Business / Organisation Type * <Info className="h-3.5 w-3.5 text-slate-400" />
                        </label>
                        <Select
                          value={formData.organisationType}
                          onChange={(e) => setFormData({ ...formData, organisationType: e.target.value })}
                          className="h-10 rounded border-slate-300 bg-slate-50/50 text-[13px] text-slate-700 focus:ring-[#12335f]"
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
                          onChange={(e) => setFormData({ ...formData, state: e.target.value, district: '', organisation: '' })}
                          className="h-10 rounded border-slate-300 bg-slate-50/50 text-[13px] text-slate-700 focus:ring-[#12335f]"
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
                          onChange={(e) => setFormData({ ...formData, district: e.target.value, organisation: '' })}
                          className="h-10 rounded border-slate-300 bg-slate-50/50 text-[13px] text-slate-700 focus:ring-[#12335f]"
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
                          onChange={(e) => setFormData({ ...formData, organisation: e.target.value, businessName: e.target.value })}
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
                          onChange={(e) => setFormData({ ...formData, officeZoneName: e.target.value })}
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
                            onChange={(e) => {
                              setFormData({ ...formData, gstin: e.target.value.toUpperCase() });
                              setIsGstVerified(false);
                              setGstError('');
                            }}
                            error={gstError}
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
                          {isHerShg ? 'Self-Help Group Name *' : 'Business / Organisation Name *'} <Info className="h-3.5 w-3.5 text-slate-400" />
                        </label>
                        <Input
                          placeholder={isHerShg ? 'Please enter your Self-Help Group name' : 'Please enter your Business/Company Name'}
                          value={formData.businessName}
                          onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
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
                          {isHerShg ? 'Self-Help Group Name *' : 'Business / Organisation Name *'} <Info className="h-3.5 w-3.5 text-slate-400" />
                        </label>
                        <Input
                          placeholder={isHerShg ? 'Please enter your Self-Help Group name' : 'Please enter your Business/Company Name'}
                          value={formData.businessName}
                          onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
                          disabled={showOptionalDetails}
                          className="h-10 rounded border-slate-300 bg-white text-[13px] disabled:bg-slate-100 disabled:text-slate-500 disabled:cursor-not-allowed"
                        />
                        {!formData.businessName && (
                          <p className="text-[10px] text-red-500 mt-1 font-medium tracking-tight">Please enter Business / Organisation Name.</p>
                        )}
                      </div>

                      <div className="space-y-2 md:col-span-2 flex items-center gap-2 py-2">
                        <input
                          type="checkbox"
                          id="showOptionalDetails"
                          checked={showOptionalDetails}
                          onChange={(e) => setShowOptionalDetails(e.target.checked)}
                          className="h-4 w-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                        <label htmlFor="showOptionalDetails" className="text-[13px] font-semibold text-slate-700 cursor-pointer">
                          {isHerShg ? 'Provide Additional Details (GSTIN, Udyam Number, Website)' : 'Provide Optional Details (GSTIN, Udyam Number, CIN, Website)'}
                        </label>
                      </div>

                      {showOptionalDetails && (
                        <>
                          <div className="space-y-2">
                            <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                              GSTIN (Optional) <Info className="h-3.5 w-3.5 text-slate-400" />
                            </label>
                            <div className="flex gap-2">
                              <Input
                                placeholder="Enter GSTIN"
                                value={formData.gstin}
                                onChange={(e) => {
                                  setFormData({ ...formData, gstin: e.target.value.toUpperCase() });
                                  setIsGstVerified(false);
                                  setGstError('');
                                }}
                                error={gstError}
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
                              {isHerShg ? 'Udyam Number (Optional)' : 'Udyam Number *'} <Info className="h-3.5 w-3.5 text-slate-400" />
                            </label>
                            <Input
                              placeholder="e.g., UDYAM-MH-12-0123456"
                              value={formData.udyamNumber}
                              onChange={(e) => {
                                // Allow only uppercase letters, digits, and hyphen.
                                const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, '').slice(0, 19);
                                setFormData({ ...formData, udyamNumber: cleaned });
                              }}
                              maxLength={19}
                              className={cn(
                                "h-10 rounded bg-white text-[13px]",
                                formData.udyamNumber && validateUdyam(formData.udyamNumber)
                                  ? "border-red-400 focus-visible:ring-red-300"
                                  : "border-slate-300"
                              )}
                            />
                            {formData.udyamNumber && validateUdyam(formData.udyamNumber) ? (
                              <p className="text-[10px] text-red-500 mt-1 font-medium tracking-tight">
                                {validateUdyam(formData.udyamNumber)}
                              </p>
                            ) : !formData.udyamNumber && !isHerShg ? (
                              <p className="text-[10px] text-red-500 mt-1 font-medium tracking-tight">Please enter valid Udyam Number.</p>
                            ) : null}
                          </div>

                          <div className="space-y-2">
                            <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                              CIN (Optional) <Info className="h-3.5 w-3.5 text-slate-400" />
                            </label>
                            <Input
                              placeholder="e.g., U72900MH1996PLC104693"
                              value={formData.cin}
                              onChange={(e) => {
                                // CIN uses only uppercase letters and digits, capped at 21 chars.
                                const cleaned = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 21);
                                setFormData({ ...formData, cin: cleaned });
                              }}
                              maxLength={21}
                              className={cn(
                                "h-10 rounded bg-white text-[13px]",
                                formData.cin && validateCin(formData.cin)
                                  ? "border-red-400 focus-visible:ring-red-300"
                                  : "border-slate-300"
                              )}
                            />
                            {formData.cin && validateCin(formData.cin) && (
                              <p className="text-[10px] text-red-500 mt-1 font-medium tracking-tight">
                                {validateCin(formData.cin)}
                              </p>
                            )}
                          </div>

                          <div className="space-y-2">
                            <label className="flex items-center gap-1 text-[13px] font-semibold text-slate-700">
                              Website (Optional) <Info className="h-3.5 w-3.5 text-slate-400" />
                            </label>
                            <Input
                              placeholder="e.g., https://example.com"
                              value={formData.website}
                              onChange={(e) => setFormData({ ...formData, website: e.target.value })}
                              className="h-10 rounded border-slate-300 bg-white text-[13px]"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                  {role === 'buyer' && (
                    <div className="mt-8 border-t border-slate-200 pt-6">
                      <h3 className="text-[13px] font-bold text-slate-800 mb-2 tracking-tight flex items-center gap-1.5">
                        Required Onboarding Documents *
                      </h3>
                      <p className="text-[11px] text-slate-500 mb-4 font-medium leading-relaxed">
                        Select which verification documents you will upload during the onboarding process. Selected documents will be marked as required.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {buyerDocOptions.map((doc) => {
                          const isSelected = selectedDocs.includes(doc.id);
                          return (
                            <label key={doc.id} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg border border-slate-200 bg-slate-50/50 hover:bg-slate-50 transition-colors">
                              <input
                                type="checkbox"
                                checked={isSelected}
                                onChange={() => {
                                  if (isSelected) {
                                    setSelectedDocs(prev => prev.filter(id => id !== doc.id));
                                  } else {
                                    setSelectedDocs(prev => [...prev, doc.id]);
                                  }
                                }}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f] cursor-pointer"
                              />
                              <div className="flex flex-col">
                                <span className="text-[13px] font-semibold text-slate-700">{doc.label}</span>
                              </div>
                            </label>
                          );
                        })}
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
                      <div className="flex flex-wrap items-center gap-8">
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
                          <input
                            type="radio"
                            name="buyer-personal-verification"
                            checked={formData.personalVerificationMethod === 'aadhaar'}
                            onChange={() => {
                              setSubmitErrors(prev => {
                                const { verificationMethod, aadhaarVerified, pan, dob, mobile, ...rest } = prev;
                                return rest;
                              });
                              setFormData({ ...formData, personalVerificationMethod: 'aadhaar' });
                            }}
                            className="h-4 w-4 accent-[#12335f]"
                          />
                          Aadhaar
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-800">
                          <input
                            type="radio"
                            name="buyer-personal-verification"
                            checked={formData.personalVerificationMethod === 'pan'}
                            onChange={() => {
                              setSubmitErrors(prev => {
                                const { verificationMethod, aadhaarVerified, pan, dob, mobile, ...rest } = prev;
                                return rest;
                              });
                              setFormData({ ...formData, personalVerificationMethod: 'pan' });
                            }}
                            className="h-4 w-4 accent-[#12335f]"
                          />
                          Personal PAN
                        </label>
                      </div>

                      <div className="rounded-md bg-sky-100 px-5 py-4 text-xs font-medium text-slate-700">
                        We respect your Privacy, We do not share your personal details with anyone.
                      </div>

                      {formData.personalVerificationMethod === 'aadhaar' && (
                        <div className="space-y-7">
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-slate-700">
                                Aadhaar Number / Virtual ID* <Info className="inline h-3.5 w-3.5 text-slate-500" />
                              </label>
                              <div className="relative">
                                <input
                                  type={showAadhaar ? "text" : "password"}
                                  placeholder="Enter Aadhaar number / Virtual ID"
                                  maxLength={16}
                                  inputMode="numeric"
                                  value={isAadhaarVerified ? formData.aadhaarNumber : rawAadhaar}
                                  onChange={(e) => {
                                    const val = e.target.value.replace(/\D/g, '').slice(0, 16);
                                    setRawAadhaar(val);
                                    handleAadhaarFieldChange({});
                                  }}
                                  onBlur={() => setAadhaarTouched(true)}
                                  disabled={isAadhaarVerified}
                                  className={cn(
                                    "h-11 w-full rounded-lg border bg-white px-4 pr-11 text-xs placeholder:text-slate-400 focus:outline-none focus:ring-2 disabled:cursor-not-allowed disabled:opacity-60",
                                    aadhaarErrors.aadhaarNumber ? "border-red-400 focus:ring-red-500" : "border-slate-200 focus:ring-indigo-500"
                                  )}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowAadhaar(!showAadhaar)}
                                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800 transition-colors focus:outline-none disabled:opacity-50"
                                  disabled={isAadhaarVerified}
                                >
                                  {showAadhaar ? (
                                    <Eye className="h-4 w-4" />
                                  ) : (
                                    <EyeOff className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                              {maskedAadhaar && !aadhaarErrors.aadhaarNumber && (
                                <p className="text-[11px] font-semibold text-slate-500">
                                  {isAadhaarNumberValid ? 'Aadhaar' : 'Virtual ID'} masked: {maskedAadhaar}
                                </p>
                              )}
                              {aadhaarErrors.aadhaarNumber && (
                                <p className="text-[11px] font-medium text-red-600">{aadhaarErrors.aadhaarNumber}</p>
                              )}
                            </div>

                            <div className="space-y-1">
                              <Input
                                label="Mobile number linked with Aadhaar*"
                                placeholder="Enter mobile number linked with Aadhaar"
                                maxLength={10}
                                value={formData.mobile}
                                onChange={(e) => handleAadhaarFieldChange({ mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })}
                                disabled={isAadhaarVerified}
                                error={submitErrors.mobile || aadhaarErrors.mobile || (mobileAlreadyRegistered ? 'This mobile number is already registered.' : undefined)}
                                className={cn(
                                  "h-11 rounded-lg bg-white",
                                  submitErrors.mobile || aadhaarErrors.mobile || mobileAlreadyRegistered ? "border-red-400" : "border-slate-200"
                                )}
                              />
                            </div>
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

                          {!isAadhaarVerified && (
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
                                    I, the holder of the above Aadhaar, hereby give my consent to JsgSmile Portal, for using my Aadhaar number as allotted by UIDAI for JsgSmile Portal registration. JsgSmile Portal has informed me that my Aadhaar data will not be stored/shared.
                                  </span>
                                </label>

                                <p className="pl-8 text-xs leading-relaxed text-slate-700">
                                  मैं, उपर्युक्त आधार का धारक, भारतीय विशिष्ट पहचान प्राधिकरण द्वारा आवंटित अपने आधार नंबर को एमएसएमई पोर्टल पंजीकरण हेतु प्रयोग में लाने हेतु एमएसएमई पोर्टल को एतदद्वारा अपनी सहमति प्रदान करता हूं। एमएसएमई पोर्टल,ने मुझे अवगत कराया है कि मेरे आधार डेटा को संग्रहीत/साझा नहीं किया जाएगा।
                                </p>
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  onClick={handleStartAadhaarKyc}
                                  disabled={!isBuyerAadhaarReady}
                                  className={cn(
                                    "h-auto min-h-[44px] py-2.5 px-4 w-full sm:w-72 rounded-lg font-bold tracking-wide text-xs leading-normal text-center whitespace-normal",
                                    isBuyerAadhaarReady ? "bg-slate-900 text-white" : "bg-slate-200 text-slate-500"
                                  )}
                                >
                                  {mobileAvailability === 'checking' ? 'Checking...' : 'Verify with DigiLocker / MeriPehchaan'}
                                </Button>
                              </div>
                            </>
                          )}

                          {isAadhaarVerified && (
                            <div className="space-y-6">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                                <Input
                                  label="First Name*"
                                  value={formData.personalName}
                                  onChange={(e) => setFormData({ ...formData, personalName: e.target.value })}
                                  disabled
                                  className="h-11 rounded-lg border-slate-200 bg-slate-100 text-slate-700"
                                />
                                <Input
                                  label="Last Name"
                                  value={formData.personalLastName}
                                  onChange={(e) => setFormData({ ...formData, personalLastName: e.target.value })}
                                  disabled
                                  className="h-11 rounded-lg border-slate-200 bg-slate-100 text-slate-700"
                                />
                              </div>

                              <div className="flex items-center justify-between gap-3 text-slate-800">
                                <div className="flex items-center gap-3">
                                  <CheckCircle2 className="h-5 w-5 rounded-full fill-green-600 text-green-600" />
                                  <p className="text-xs font-bold">Aadhaar Details Verified Successfully.</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleEditAadhaarDetails}
                                  className="inline-flex items-center gap-1 text-xs font-bold text-red-700 hover:underline"
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Edit Aadhaar Details
                                </button>
                              </div>

                              <div className="flex justify-end">
                                <Button
                                  onClick={handleNext}
                                  className="h-11 w-full sm:w-40 rounded-lg bg-[#12335f] text-white font-bold  tracking-wide hover:bg-slate-800"
                                >
                                  Next
                                </Button>
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {formData.personalVerificationMethod === 'pan' && (
                        <div className="space-y-5">
                          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-slate-700">PAN Number* <Info className="inline h-3.5 w-3.5 text-slate-500" /></label>
                              <input
                                placeholder="ABCDE1234F"
                                maxLength={10}
                                value={formData.panNumber}
                                onChange={(event) => {
                                  setSubmitErrors(prev => {
                                    const { pan, ...rest } = prev;
                                    return rest;
                                  });
                                  setIsPanVerified(false);
                                  setFormData({ ...formData, panNumber: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) });
                                }}
                                className={cn(
                                  "h-11 w-full rounded-lg border bg-white px-4 text-xs focus:outline-none focus:ring-2",
                                  submitErrors.pan || panErrors.panNumber ? "border-red-400 focus:ring-red-500" : "border-slate-200 focus:ring-indigo-500"
                                )}
                              />
                              {(submitErrors.pan || panErrors.panNumber) && <p className="text-[11px] font-medium text-red-600">{submitErrors.pan || panErrors.panNumber}</p>}
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-slate-700">Name (as on PAN)* <Info className="inline h-3.5 w-3.5 text-slate-500" /></label>
                              <input
                                value={formData.personalName}
                                placeholder="Enter name as on PAN"
                                onChange={(event) => {
                                  setIsPanVerified(false);
                                  setFormData({ ...formData, personalName: event.target.value.replace(/[^A-Za-z .-]/g, '').slice(0, 100) });
                                }}
                                className={cn(
                                  "h-11 w-full rounded-lg border bg-white px-4 text-xs focus:outline-none focus:ring-2",
                                  panErrors.personalName ? "border-red-400 focus:ring-red-500" : "border-slate-200 focus:ring-indigo-500"
                                )}
                              />
                              {panErrors.personalName && <p className="text-[11px] font-medium text-red-600">{panErrors.personalName}</p>}
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-slate-700">Date Of Birth*</label>
                              <Input
                                type="date"
                                value={formData.dob}
                                onChange={(event) => {
                                  setSubmitErrors(prev => {
                                    const { dob, ...rest } = prev;
                                    return rest;
                                  });
                                  setIsPanVerified(false);
                                  setFormData({ ...formData, dob: event.target.value });
                                }}
                                className={cn("h-11 rounded-lg border-slate-200 bg-white text-xs", (submitErrors.dob || panErrors.dob) && "border-red-400 focus-visible:ring-red-500")}
                              />
                              {(submitErrors.dob || panErrors.dob) && <p className="text-[11px] font-medium text-red-600">{submitErrors.dob || panErrors.dob}</p>}
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              onClick={handleVerifyPan}
                              disabled={!isPanReady}
                              className={cn(
                                "h-11 w-full rounded-lg font-bold tracking-wide sm:w-44 text-xs",
                                isPanReady ? "bg-slate-900 text-white hover:bg-slate-800" : "bg-slate-200 text-slate-500 cursor-not-allowed"
                              )}
                            >
                              Verify PAN
                            </Button>
                          </div>
                          {isPanVerified && (
                            <div className="space-y-5">
                              <div className="flex items-center gap-3 text-green-700">
                                <CheckCircle2 className="h-5 w-5 fill-green-600 text-green-600" />
                                <p className="text-xs font-bold">PAN Details Verified Successfully.</p>
                              </div>
                              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                                <div className="space-y-1.5">
                                  <label className="text-xs font-bold text-slate-700">First Name*</label>
                                  <input
                                    value={formData.personalName}
                                    onChange={(event) => setFormData({ ...formData, personalName: event.target.value.replace(/[^A-Za-z .-]/g, '').slice(0, 100) })}
                                    placeholder="Enter first name"
                                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                  {!formData.personalName.trim() && <p className="text-[11px] font-medium text-red-600">First name is required.</p>}
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-xs font-bold text-slate-700">Last Name</label>
                                  <input
                                    value={formData.personalLastName}
                                    onChange={(event) => setFormData({ ...formData, personalLastName: event.target.value.replace(/[^A-Za-z .-]/g, '').slice(0, 100) })}
                                    placeholder="Enter last name"
                                    className="h-11 w-full rounded-lg border border-slate-200 bg-white px-4 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                  />
                                </div>
                              </div>
                              <div className="flex justify-end">
                                <Button
                                  onClick={handleNext}
                                  disabled={!formData.personalName.trim()}
                                  className="h-11 w-full sm:w-40 rounded-lg bg-[#12335f] text-white font-bold tracking-wide hover:bg-slate-800 disabled:opacity-50"
                                >
                                  Next
                                </Button>
                              </div>
                            </div>
                          )}
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
                            onChange={() => {
                              setSubmitErrors(prev => {
                                const { verificationMethod, aadhaarVerified, pan, dob, mobile, ...rest } = prev;
                                return rest;
                              });
                              setFormData({ ...formData, personalVerificationMethod: 'aadhaar' });
                            }}
                            className="h-4 w-4 accent-[#12335f]"
                          />
                          Aadhaar
                        </label>
                        <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-800">
                          <input
                            type="radio"
                            name="seller-personal-verification"
                            checked={formData.personalVerificationMethod === 'pan'}
                            onChange={() => {
                              setSubmitErrors(prev => {
                                const { verificationMethod, aadhaarVerified, pan, dob, mobile, ...rest } = prev;
                                return rest;
                              });
                              setFormData({ ...formData, personalVerificationMethod: 'pan' });
                            }}
                            className="h-4 w-4 accent-[#12335f]"
                          />
                          Personal PAN
                        </label>
                      </div>
                      {submitErrors.verificationMethod && <p className="text-xs font-medium text-red-600">{submitErrors.verificationMethod}</p>}

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
                                  type={showAadhaar ? "text" : "password"}
                                  placeholder="Enter Aadhaar number / Virtual ID"
                                  maxLength={16}
                                  inputMode="numeric"
                                  value={isAadhaarVerified ? formData.aadhaarNumber : rawAadhaar}
                                  onChange={(event) => {
                                    const val = event.target.value.replace(/\D/g, '').slice(0, 16);
                                    setRawAadhaar(val);
                                    handleAadhaarFieldChange({});
                                  }}
                                  onBlur={() => setAadhaarTouched(true)}
                                  disabled={isAadhaarVerified}
                                  className={cn(
                                    "h-11 w-full rounded border bg-white px-4 pr-11 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-60",
                                    aadhaarErrors.aadhaarNumber ? "border-red-400 focus:ring-red-500" : "border-slate-300 focus:ring-[#12335f]"
                                  )}
                                />
                                <button
                                  type="button"
                                  onClick={() => setShowAadhaar(!showAadhaar)}
                                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-800 transition-colors focus:outline-none disabled:opacity-50"
                                  disabled={isAadhaarVerified}
                                >
                                  {showAadhaar ? (
                                    <Eye className="h-4 w-4" />
                                  ) : (
                                    <EyeOff className="h-4 w-4" />
                                  )}
                                </button>
                              </div>
                              {maskedAadhaar && !aadhaarErrors.aadhaarNumber && (
                                <p className="text-xs font-semibold text-slate-500">
                                  {isAadhaarNumberValid ? 'Aadhaar' : 'Virtual ID'} masked: {maskedAadhaar}
                                </p>
                              )}
                              {aadhaarErrors.aadhaarNumber && <p className="text-xs font-medium text-red-600">{aadhaarErrors.aadhaarNumber}</p>}
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-sm font-semibold text-slate-800">Mobile number linked with Aadhaar*</label>
                              <input
                                placeholder="Enter mobile number linked with Aadhaar"
                                maxLength={10}
                                value={formData.mobile}
                                onChange={(event) => handleAadhaarFieldChange({ mobile: event.target.value.replace(/\D/g, '').slice(0, 10) })}
                                disabled={isAadhaarVerified}
                                className={cn(
                                  "h-11 w-full rounded border bg-white px-4 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-1 disabled:cursor-not-allowed disabled:opacity-60",
                                  submitErrors.mobile || aadhaarErrors.mobile || mobileAlreadyRegistered ? "border-red-400 focus:ring-red-500" : "border-slate-300 focus:ring-[#12335f]"
                                )}
                              />
                              {(submitErrors.mobile || aadhaarErrors.mobile) && <p className="text-xs font-medium text-red-600">{submitErrors.mobile || aadhaarErrors.mobile}</p>}
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

                          {!isAadhaarVerified && (
                            <>
                              <label className="flex items-start gap-3 text-sm leading-relaxed text-slate-700">
                                <input
                                  type="checkbox"
                                  checked={aadhaarConsent}
                                  onChange={(event) => setAadhaarConsent(event.target.checked)}
                                  className="mt-1 h-5 w-5 rounded border-slate-300 accent-[#12335f]"
                                />
                                <span>
                                  I, the holder of the above Aadhaar, hereby give my consent to JsgSmile Portal, for using my Aadhaar number as allotted by UIDAI for JsgSmile Portal registration. JsgSmile Portal has informed me that my Aadhaar data will not be stored/shared.
                                </span>
                              </label>
                              {aadhaarErrors.consent && <p className="pl-8 text-xs font-medium text-red-600">{aadhaarErrors.consent}</p>}
                              <p className="pl-8 text-sm leading-relaxed text-slate-700">
                                I provide consent for identity verification only. Aadhaar details will be used for verification and masked after entry.
                              </p>
                              {/* <div className="space-y-3">
                              <p className="text-sm text-slate-700">Click on the play button to listen consent.</p>
                              <audio controls className="w-full max-w-sm" />
                            </div> */}
                              <div className="flex justify-end">
                                <Button
                                  onClick={handleStartAadhaarKyc}
                                  disabled={!isAadhaarReady || mobileAlreadyRegistered || mobileAvailability === 'checking'}
                                  className={cn(
                                    "h-auto min-h-[44px] py-2.5 px-4 w-full rounded font-bold uppercase tracking-wide sm:w-72 text-xs leading-normal text-center whitespace-normal",
                                    isAadhaarReady && !mobileAlreadyRegistered && mobileAvailability !== 'checking' ? "bg-[#12335f] text-white hover:bg-slate-800" : "bg-slate-200 text-slate-500 cursor-not-allowed"
                                  )}
                                >
                                  {mobileAvailability === 'checking' ? 'Checking...' : 'Verify with DigiLocker / MeriPehchaan'}
                                </Button>
                              </div>
                            </>
                          )}



                          {isAadhaarVerified && (
                            <div className="space-y-5">
                              <div className="flex items-center justify-between gap-3 text-green-700">
                                <div className="flex items-center gap-3">
                                  <CheckCircle2 className="h-5 w-5 fill-green-600 text-green-600" />
                                  <p className="text-sm font-bold">Identity verified through DigiLocker/MeriPehchaan</p>
                                </div>
                                <button
                                  type="button"
                                  onClick={handleEditAadhaarDetails}
                                  className="inline-flex items-center gap-1 text-xs font-bold uppercase tracking-wide text-red-700 hover:underline"
                                >
                                  <Pencil className="h-3.5 w-3.5" /> Edit Aadhaar Details
                                </button>
                              </div>
                              <SellerRoleDetails
                                firstName={formData.personalName}
                                lastName={formData.personalLastName}
                                roleInOrg={formData.roleInOrg}
                                roleOptions={sellerRoleOptions}
                                hideRoleField={isHerShg}
                                onChange={(patch) => setFormData({ ...formData, ...patch })}
                              />
                              {role === 'seller' && !isHerShg && !formData.roleInOrg && (
                                <div className="rounded border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-800">
                                  Aadhaar verified. Please select your role in organisation to continue.
                                </div>
                              )}
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
                                  setSubmitErrors(prev => {
                                    const { pan, ...rest } = prev;
                                    return rest;
                                  });
                                  setIsPanVerified(false);
                                  setFormData({ ...formData, panNumber: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) });
                                }}
                                className={cn(
                                  "h-11 w-full rounded border bg-white px-4 text-sm focus:outline-none focus:ring-1",
                                  submitErrors.pan || panErrors.panNumber ? "border-red-400 focus:ring-red-500" : "border-slate-300 focus:ring-[#12335f]"
                                )}
                              />
                              {(submitErrors.pan || panErrors.panNumber) && <p className="text-xs font-medium text-red-600">{submitErrors.pan || panErrors.panNumber}</p>}
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-sm font-semibold text-slate-800">Name (as on PAN)* <Info className="inline h-3.5 w-3.5 text-slate-500" /></label>
                              <input
                                value={formData.personalName}
                                onChange={(event) => {
                                  setIsPanVerified(false);
                                  setFormData({ ...formData, personalName: event.target.value.replace(/[^A-Za-z .-]/g, '').slice(0, 100) });
                                }}
                                className={cn(
                                  "h-11 w-full rounded border bg-white px-4 text-sm focus:outline-none focus:ring-1",
                                  panErrors.personalName ? "border-red-400 focus:ring-red-500" : "border-slate-300 focus:ring-[#12335f]"
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
                                  setSubmitErrors(prev => {
                                    const { dob, ...rest } = prev;
                                    return rest;
                                  });
                                  setIsPanVerified(false);
                                  setFormData({ ...formData, dob: event.target.value });
                                }}
                                className={cn("h-11 rounded border-slate-300 bg-white", (submitErrors.dob || panErrors.dob) && "border-red-400 focus-visible:ring-red-500")}
                              />
                              {(submitErrors.dob || panErrors.dob) && <p className="text-xs font-medium text-red-600">{submitErrors.dob || panErrors.dob}</p>}
                            </div>
                          </div>
                          <div className="flex justify-end">
                            <Button
                              onClick={handleVerifyPan}
                              disabled={!isPanReady}
                              className={cn(
                                "h-11 w-full rounded font-bold uppercase tracking-wide sm:w-44",
                                isPanReady ? "bg-[#12335f] text-white hover:bg-slate-800" : "bg-slate-200 text-slate-500 cursor-not-allowed"
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
                                hideRoleField={isHerShg}
                                onChange={(patch) => setFormData({ ...formData, ...patch })}
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
                      <div className="space-y-1.5">
                        <label className="text-[11px] font-semibold text-slate-500 ml-1">Official Email ID *</label>
                        <div className={cn(
                          "flex items-center gap-3 px-4 h-12 rounded-md border transition-colors w-full",
                          otpSent || isEmailVerified ? "bg-slate-50 border-slate-100" : "bg-white border-slate-300"
                        )}>
                          <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
                          <input
                            type="email"
                            placeholder="name@company.com"
                            value={formData.email}
                            onChange={(e) => {
                              setSubmitErrors(prev => {
                                const { email, ...rest } = prev;
                                return rest;
                              });
                              setFormData({ ...formData, email: e.target.value });
                            }}
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
                              className="ml-2 flex items-center gap-1 rounded-full bg-slate-200/50 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200 hover:text-[#12335f] transition-all border border-transparent active:scale-95"
                              title="Edit Email"
                            >
                              <Pencil className="h-3 w-3" /> Edit
                            </button>
                          )}
                        </div>
                        {submitErrors.email && (
                          <p className="text-xs font-medium text-red-600 mt-1.5 ml-1">{submitErrors.email}</p>
                        )}
                      </div>
                    </>
                  ) : (
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-semibold text-slate-500 ml-1">Official Email ID *</label>
                      <div className={cn(
                        "flex items-center gap-3 px-4 h-12 rounded-md border transition-colors w-full",
                        otpSent || isEmailVerified ? "bg-slate-50 border-slate-100" : "bg-white border-slate-300"
                      )}>
                        <Mail className="h-4 w-4 text-slate-400 flex-shrink-0" />
                        <input
                          type="email"
                          placeholder="name@company.com"
                          value={formData.email}
                          onChange={(e) => {
                            setSubmitErrors(prev => {
                              const { email, ...rest } = prev;
                              return rest;
                            });
                            setFormData({ ...formData, email: e.target.value });
                          }}
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
                            className="ml-2 flex items-center gap-1 rounded-full bg-slate-200/50 px-2 py-1 text-[10px] font-bold text-slate-600 hover:bg-slate-200 hover:text-[#12335f] transition-all border border-transparent active:scale-95"
                            title="Edit Email"
                          >
                            <Pencil className="h-3 w-3" /> Edit
                          </button>
                        )}
                      </div>
                      {submitErrors.email && (
                        <p className="text-xs font-medium text-red-600 mt-1.5 ml-1">{submitErrors.email}</p>
                      )}
                    </div>
                  )}

                  {isSmsEnabled && formData.mobile && /^[6-9]\d{9}$/.test(formData.mobile.trim()) && (
                    <div className="rounded-lg border border-slate-200 bg-white p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Mobile Verification</p>
                          <p className="mt-1 text-sm font-bold text-slate-800">{formData.mobile}</p>
                          {!isMobileOtpVerified && (
                            <p className="mt-1 text-xs font-semibold text-slate-500">Optional SMS OTP verification for mobile-based alerts and OTP delivery.</p>
                          )}
                        </div>
                        {isMobileOtpVerified ? (
                          <span className="inline-flex items-center gap-2 rounded-full bg-green-50 px-3 py-1.5 text-xs font-black text-green-700">
                            <ShieldCheck className="h-4 w-4" />
                            Mobile verified
                          </span>
                        ) : (
                          <Button
                            type="button"
                            onClick={handleSendMobileOtp}
                            disabled={isSendingMobileOtp || mobileOtpSent}
                            className="h-10 rounded-md bg-[#12335f] px-4 text-xs font-black text-white"
                          >
                            {isSendingMobileOtp ? 'Sending...' : mobileOtpSent ? 'OTP Sent' : 'Send Mobile OTP'}
                          </Button>
                        )}
                      </div>
                      {mobileOtpSent && !isMobileOtpVerified && (
                        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                          <input
                            type="text"
                            inputMode="numeric"
                            maxLength={6}
                            value={mobileOtp}
                            onChange={(e) => setMobileOtp(e.target.value.replace(/\D/g, ''))}
                            placeholder="6 digit OTP"
                            className="h-10 w-full rounded-md border border-slate-300 bg-white px-3 text-center text-sm font-bold tracking-[0.2em] outline-none focus:ring-2 focus:ring-[#12335f]/20 sm:w-40"
                          />
                          <Button
                            type="button"
                            onClick={handleVerifyMobileOtp}
                            className="h-10 rounded-md bg-slate-900 px-4 text-xs font-black text-white"
                          >
                            Verify Mobile
                          </Button>
                          <button
                            type="button"
                            onClick={() => {
                              setMobileOtpSent(false);
                              setMobileOtp('');
                            }}
                            className="text-xs font-bold text-[#12335f] underline underline-offset-4"
                          >
                            Resend
                          </button>
                        </div>
                      )}
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
                        disabled={isSendingOtp}
                        className="text-[11px] font-bold text-slate-500 hover:text-indigo-600 underline decoration-slate-400 underline-offset-4"
                      >
                        {isSendingOtp ? 'Sending...' : "Didn't receive? Resend Code"}
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
                          onChange={(e) => {
                            setSubmitErrors(prev => {
                              const { name, ...rest } = prev;
                              return rest;
                            });
                            setFormData({ ...formData, userId: e.target.value });
                          }}
                          error={submitErrors.name || (!formData.userId ? 'Please enter user id.' : undefined)}
                          className="h-11 rounded-lg border-slate-200 bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <Input
                          label="Password *"
                          type="password"
                          placeholder="Enter Password"
                          value={formData.password}
                          onChange={(e) => {
                            setSubmitErrors(prev => {
                              const { password, ...rest } = prev;
                              return rest;
                            });
                            setFormData({ ...formData, password: e.target.value });
                          }}
                          error={submitErrors.password}
                          className="h-11 rounded-lg border-slate-200 bg-white"
                        />
                        <Input
                          label="Confirm Password*"
                          type="password"
                          placeholder="Confirm Password"
                          value={formData.confirmPassword}
                          onChange={(e) => {
                            setSubmitErrors(prev => {
                              const { confirmPassword, ...rest } = prev;
                              return rest;
                            });
                            setFormData({ ...formData, confirmPassword: e.target.value });
                          }}
                          error={submitErrors.confirmPassword}
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
                          <CredentialRule label="12 characters minimum" valid={formData.password.length >= 12 && formData.password.length <= 128} />
                        </div>
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
                          onChange={(e) => {
                            setSubmitErrors(prev => {
                              const { name, ...rest } = prev;
                              return rest;
                            });
                            setFormData({ ...formData, userId: e.target.value });
                          }}
                          error={submitErrors.name || (!formData.userId ? 'Please enter user id.' : undefined)}
                          className="h-14 rounded-lg border-slate-200 bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <Input
                          label="Password *"
                          type="password"
                          placeholder="Enter Password"
                          value={formData.password}
                          onChange={(e) => {
                            setSubmitErrors(prev => {
                              const { password, ...rest } = prev;
                              return rest;
                            });
                            setFormData({ ...formData, password: e.target.value });
                          }}
                          error={submitErrors.password}
                          className="h-14 rounded-lg border-slate-200 bg-white"
                        />
                        <Input
                          label="Confirm Password*"
                          type="password"
                          placeholder="Confirm Password"
                          value={formData.confirmPassword}
                          onChange={(e) => {
                            setSubmitErrors(prev => {
                              const { confirmPassword, ...rest } = prev;
                              return rest;
                            });
                            setFormData({ ...formData, confirmPassword: e.target.value });
                          }}
                          error={submitErrors.confirmPassword}
                          className="h-14 rounded-lg border-slate-200 bg-white"
                        />
                      </div>

                      <div className="rounded bg-slate-50 p-4 sm:p-6 md:rounded">
                        <h4 className="text-[10px] font-bold  text-slate-400 mb-4  ">Password Security Checklist</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <ValidationItem label="12+ Characters" valid={formData.password.length >= 12 && formData.password.length <= 128} />
                          <ValidationItem label=" Letter" valid={/[A-Z]/.test(formData.password)} />
                          <ValidationItem label="Lowercase Letter" valid={/[a-z]/.test(formData.password)} />
                          <ValidationItem label="Numeric Value" valid={/[0-9]/.test(formData.password)} />
                          <ValidationItem label="Special Character" valid={/[^A-Za-z0-9]/.test(formData.password)} />
                          <ValidationItem label="Passwords Match" valid={formData.password !== '' && formData.password === formData.confirmPassword} />
                        </div>
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

                {user ? (
                  <Button
                    onClick={handleSubmit}
                    disabled={isLoading || !formData.businessName}
                    className={cn(
                      "h-10 px-8 rounded text-[13px] font-bold tracking-wider shadow-sm flex items-center gap-2 transition-all",
                      !formData.businessName
                        ? "bg-slate-200 text-slate-400 cursor-not-allowed"
                        : "bg-[#12335f] hover:bg-slate-800 text-white"
                    )}
                  >
                    {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    {isLoading ? 'Activating...' : 'Activate Profile'}
                  </Button>
                ) : currentSubStep === 2 && role === 'buyer' && (isAadhaarVerified || isPanVerified) ? null : currentSubStep < 4 ? (
                  <Button
                    onClick={handleNext}
                    disabled={
                      (currentSubStep === 1 && isPrimaryBuyer && !isPrimaryBuyerOrganisationComplete) ||
                      (currentSubStep === 2 && formData.personalVerificationMethod === 'aadhaar' && isAadhaarVerified && role === 'seller' && !isHerShg && !formData.roleInOrg)
                    }
                    className={cn(
                      "h-10 px-8 rounded text-[13px] font-bold  tracking-wider transition-all",
                      ((currentSubStep === 1 && isPrimaryBuyer && !isPrimaryBuyerOrganisationComplete) ||
                       (currentSubStep === 2 && formData.personalVerificationMethod === 'aadhaar' && isAadhaarVerified && role === 'seller' && !isHerShg && !formData.roleInOrg))
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
                    className="h-10 px-8 rounded bg-[#12335f] hover:bg-slate-800 text-white text-[13px] font-bold  tracking-wider shadow-sm flex items-center gap-2"
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
  hideRoleField,
  onChange
}: {
  firstName: string;
  lastName: string;
  roleInOrg: string;
  roleOptions: string[];
  hideRoleField?: boolean;
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
            className="h-11 w-full rounded border border-slate-300 bg-white px-4 text-sm focus:outline-none focus:ring-1 focus:ring-[#12335f]"
          />
          {!firstName.trim() && <p className="text-xs font-medium text-red-600">First name is required.</p>}
        </div>
        <div className="space-y-1.5">
          <label className="text-sm font-semibold text-slate-800">Last Name</label>
          <input
            value={lastName}
            onChange={(event) => onChange({ personalLastName: event.target.value.replace(/[^A-Za-z .-]/g, '').slice(0, 100) })}
            placeholder="Enter last name"
            className="h-11 w-full rounded border border-slate-300 bg-white px-4 text-sm focus:outline-none focus:ring-1 focus:ring-[#12335f]"
          />
        </div>
      </div>

      {!hideRoleField && (
        <div className="max-w-md space-y-1.5">
          <label className="text-sm font-semibold text-slate-800">Role in Organisation*</label>
          <select
            value={roleInOrg}
            onChange={(event) => onChange({ roleInOrg: event.target.value })}
            className="h-11 w-full rounded border border-slate-300 bg-white px-4 text-sm focus:outline-none focus:ring-1 focus:ring-[#12335f]"
          >
            <option value="">Select your role</option>
            {roleOptions.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
          {!roleInOrg && <p className="text-xs font-medium text-red-600">Please select your role.</p>}
        </div>
      )}
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
