import React, { useState, useEffect } from 'react';
import { api, unwrapApiData } from '../lib/api';
import { useSearchParams, useRouter } from 'next/navigation';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/input';
import { Card, CardContent, Badge } from '../components/ui/card';
import { Stepper, Step } from '../components/ui/stepper';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Save, Upload, CheckCircle2, AlertTriangle, Clock, ShieldCheck, X, ExternalLink, Plus, MapPin, Check } from 'lucide-react';
import { cn } from '../lib/utils';
import { validateField, validateOptionalField, FieldType } from '../lib/validation';
import { compressImage } from '../lib/compress';
import { getFileAssetPreview, type DocumentPreview } from '../lib/files';
import { indiaStates, indiaStatesDistricts } from '../data/indiaStatesDistricts';

const PRIMARY_USER_TYPES = ['Primary User (HOD)', 'Primary User (Co-operative)'];


const SIDEBAR_SECTIONS = [
  { id: 'org', label: 'Organisation Details' },
  { id: 'rep', label: 'Authorized Representative' },
  { id: 'procurement', label: 'Procurement Profile' },
  { id: 'docs', label: 'Document Upload' },
  { id: 'account', label: 'Account Setup' },
];

const DEPARTMENT_OPTIONS = ['Procurement', 'Finance', 'Admin', 'Operations', 'Management', 'Others'];
const DESIGNATION_OPTIONS = [
  'Director',
  'Managing Director',
  'CEO / President',
  'Proprietor',
  'Partner',
  'General Manager',
  'Head of Procurement',
  'Purchase Officer',
  'Finance Controller',
  'Executive',
  'Others'
];
const PROCUREMENT_CATEGORY_OPTIONS = [
  'Cement Industry',
  'Steel & Metal Industry',
  'Mining & Coal Industry',
  'Oil & Gas Industry',
  'Power & Energy Sector',
  'Construction & Infrastructure',
  'Manufacturing Industry',
  'Industrial Equipment & Machinery',
  'Automobile & Transport',
  'Electrical & Electronics',
  'Chemicals & Refractories',
  'IT & Technology Services',
  'Medical & Healthcare Supplies',
  'Agriculture & Agro Products',
  'Trading & Distribution',
  'Industrial Consumables',
  'Hydraulics & Engineering Services',
  'Safety Equipment & Industrial Safety',
  'Building Materials & Hardware',
  'Fuel & Lubricants',
  'Fabrication & Mechanical Works',
  'Logistics & Supply Chain',
  'Packaging & Printing',
  'Polymer & Plastic Industry',
  'Tyres & Rubber Products',
  'Tools & Industrial Hardware',
  'Nursery & Environmental Services',
  'Office Equipment & Stationery',
  'Telecom & Automation',
  'General Industrial Supplier',
  'Others'
];
const ANNUAL_BUDGET_OPTIONS = ['< ₹10 Lakh', '₹10 Lakh – ₹1 Crore', '₹1 Crore – ₹10 Crore', '₹10 Crore+'];
const PROCUREMENT_METHOD_OPTIONS = ['Direct Purchase', 'Quotation Based', 'Tender / Bidding', 'Reverse Auction', 'Others'];
const BUYER_ONBOARDING_DRAFT_KEY = 'buyer-onboarding-draft';
const INDUSTRY_OPTIONS = [
  'Information Technology',
  'Software Services',
  'Government Services',
  'Construction',
  'Healthcare',
  'Education',
  'Finance',
  'Manufacturing',
  'Retail',
  'Logistics',
  'Agriculture',
  'Telecommunications',
  'Media & Entertainment',
  'Energy',
  'Real Estate',
  'Hospitality',
  'E-commerce',
  'Consulting',
  'Electronics',
  'Automobile',
  'Pharmaceuticals',
  'Other'
];
const DASHBOARD_SECTION_TO_BUYER_SECTION: Record<string, string> = {
  basic: 'org',
  business: 'rep',
  compliance: 'org',
  bank: 'procurement',
  documents: 'docs',
};

const isPlaceholderValue = (value: unknown) => {
  if (typeof value !== 'string') return false;
  const normalized = value.trim().toLowerCase();
  return (
    normalized === 'n/a' ||
    normalized === 'na' ||
    normalized === 'please verify and enter address manually'
  );
};

const cleanPlaceholder = (value: unknown) => {
  if (typeof value !== 'string') return value;
  return isPlaceholderValue(value) ? '' : value;
};

const getDocumentFiles = (document: any) => {
  if (!document) return [];
  return Array.isArray(document) ? document.filter(Boolean) : [document];
};

const hasUploadedDocument = (document: any) => getDocumentFiles(document).length > 0;

const SUBMITTED_REVIEW_STATUSES = new Set([
  'under_compliance_review',
  'pending_validation',
  'manual_review_required',
  'approved_for_procurement'
]);

const hasSubmittedApplication = (userRecord: any) => userRecord?.sectionStatus?.submitted === true;
const isPrimaryUserType = (businessType: unknown) => PRIMARY_USER_TYPES.includes(String(businessType || ''));

const shouldShowSubmissionOverlay = (userRecord: any) =>
  hasSubmittedApplication(userRecord) && SUBMITTED_REVIEW_STATUSES.has(String(userRecord?.onboardingStatus || ''));

const shouldLockBuyerProfile = (userRecord: any) => {
  const status = String(userRecord?.onboardingStatus || '');
  if (status === 'approved_for_procurement') return true;
  return hasSubmittedApplication(userRecord) && SUBMITTED_REVIEW_STATUSES.has(status);
};

const DEFAULT_BUYER_FORM_DATA: any = {
  // Organisation Details
  organizationName: '',
  businessType: 'Private Limited Company',
  industry: '',
  cin: '',
  pan: '',
  gst: '',
  website: '',

  // Authorized Representative
  representativeName: '',
  designation: '',
  customDesignation: '',
  department: 'Procurement',
  customDepartment: '',
  email: '',
  mobile: '',
  alternateMobile: '',

  // Address Details
  country: 'India',
  state: '',
  district: '',
  city: '',
  pincode: '',
  registeredAddress: '',
  corporateAddress: '',

  // Procurement Profile
  procurementCategories: [],
  otherCategoryDetails: '',
  customProcurementCategoryInput: '',
  customProcurementCategories: [],
  annualBudget: '< ₹10 Lakh',
  preferredMethods: [],
  otherMethodDetails: '',
  customProcurementMethodInput: '',
  customPreferredMethods: [],

  // Document Upload
  documents: {
    panCard: '',
    regCert: '',
    gstCert: '',
    addressProof: '',
    authLetter: ''
  },

  // Account Setup
  declaration: false,
  agreeTerms: false,
};

const readBuyerDraft = () => {
  try {
    const rawDraft = localStorage.getItem(BUYER_ONBOARDING_DRAFT_KEY);
    return rawDraft ? JSON.parse(rawDraft) : null;
  } catch {
    localStorage.removeItem(BUYER_ONBOARDING_DRAFT_KEY);
    return null;
  }
};

const buildBuyerFormData = (data: any, storedDraft: any, fallback: any = DEFAULT_BUYER_FORM_DATA) => {
  const regDetails = data?.user?.registrationDetails || {};
  const resolvedBusinessType = data?.profile?.businessType || regDetails.businessType || fallback.businessType;
  const primaryUser = isPrimaryUserType(resolvedBusinessType);
  const registrationState = cleanPlaceholder(regDetails.state);
  const registrationDistrict = cleanPlaceholder(regDetails.district);
  const profileDepartment = data?.profile?.department || '';
  const hasPresetDepartment = DEPARTMENT_OPTIONS.includes(profileDepartment) && profileDepartment !== 'Others';
  const draftDepartment = storedDraft?.formData?.department || '';
  const hasDraftPresetDepartment = DEPARTMENT_OPTIONS.includes(draftDepartment) && draftDepartment !== 'Others';

  const profileDesignation = data?.profile?.designation || '';
  const hasPresetDesignation = DESIGNATION_OPTIONS.includes(profileDesignation) && profileDesignation !== 'Others';
  const draftDesignation = storedDraft?.formData?.designation || '';
  const hasDraftPresetDesignation = DESIGNATION_OPTIONS.includes(draftDesignation) && draftDesignation !== 'Others';

  const profileProcurementCategories = Array.isArray(data?.profile?.procurementCategories) ? data.profile.procurementCategories : [];
  const savedPresetProcurementCategories = profileProcurementCategories.filter((category: string) => PROCUREMENT_CATEGORY_OPTIONS.includes(category) && category !== 'Others');
  const savedCustomProcurementCategories = profileProcurementCategories.filter((category: string) => !PROCUREMENT_CATEGORY_OPTIONS.includes(category));
  const normalizedProcurementCategories = savedCustomProcurementCategories.length > 0
    ? [...savedPresetProcurementCategories, 'Others']
    : savedPresetProcurementCategories;

  const profilePreferredMethods = Array.isArray(data?.profile?.preferredMethods) ? data.profile.preferredMethods : [];
  const savedPresetMethods = profilePreferredMethods.filter((method: string) => PROCUREMENT_METHOD_OPTIONS.includes(method) && method !== 'Others');
  const savedCustomMethods = profilePreferredMethods.filter((method: string) => !PROCUREMENT_METHOD_OPTIONS.includes(method));
  const normalizedMethods = savedCustomMethods.length > 0 ? [...savedPresetMethods, 'Others'] : savedPresetMethods;

  return {
    ...fallback,
    ...(data?.profile || {}),
    procurementCategories: normalizedProcurementCategories.length > 0 ? normalizedProcurementCategories : fallback.procurementCategories,
    customProcurementCategories: savedCustomProcurementCategories,
    otherCategoryDetails: savedCustomProcurementCategories.join(', '),
    customProcurementCategoryInput: '',
    preferredMethods: normalizedMethods.length > 0 ? normalizedMethods : fallback.preferredMethods,
    customPreferredMethods: savedCustomMethods,
    otherMethodDetails: savedCustomMethods.join(', '),
    customProcurementMethodInput: '',
    ...(storedDraft?.formData || {}),
    department: profileDepartment ? (hasPresetDepartment ? profileDepartment : 'Others') : fallback.department,
    customDepartment: profileDepartment && !hasPresetDepartment ? profileDepartment : (fallback.customDepartment || ''),
    ...(storedDraft?.formData?.department ? {
      department: hasDraftPresetDepartment ? storedDraft.formData.department : 'Others',
      customDepartment: !hasDraftPresetDepartment ? storedDraft.formData.department : (storedDraft.formData.customDepartment || '')
    } : {}),
    designation: profileDesignation ? (hasPresetDesignation ? profileDesignation : 'Others') : fallback.designation,
    customDesignation: profileDesignation && !hasPresetDesignation ? profileDesignation : (fallback.customDesignation || ''),
    ...(storedDraft?.formData?.designation ? {
      designation: hasDraftPresetDesignation ? storedDraft.formData.designation : 'Others',
      customDesignation: !hasDraftPresetDesignation ? storedDraft.formData.designation : (storedDraft.formData.customDesignation || '')
    } : {}),
    email: storedDraft?.formData?.email || data?.user?.email || fallback.email,
    organizationName: data?.profile?.organizationName || regDetails.businessName || data?.user?.name || fallback.organizationName,
    businessType: resolvedBusinessType,
    mobile: data?.profile?.mobile || data?.user?.mobile || fallback.mobile,
    representativeName: data?.profile?.representativeName || data?.user?.name || fallback.representativeName,
    officeZoneName: data?.profile?.officeZoneName || regDetails.officeZoneName || fallback.officeZoneName,
    aadhaarNumber: data?.profile?.aadhaarNumber || regDetails.aadhaarNumber || fallback.aadhaarNumber,
    aadhaarVerified: data?.profile?.aadhaarVerified || regDetails.isAadhaarVerified || fallback.aadhaarVerified,
    gst: data?.profile?.gst || regDetails.gstin || fallback.gst,
    pan: data?.profile?.pan || regDetails.pan || fallback.pan,

    state: cleanPlaceholder(data?.profile?.state) || registrationState || fallback.state,
    district: cleanPlaceholder(data?.profile?.district) || registrationDistrict || fallback.district,
    city: cleanPlaceholder(storedDraft?.formData?.city || data?.profile?.city || (primaryUser ? registrationDistrict : '') || fallback.city),
    pincode: cleanPlaceholder(storedDraft?.formData?.pincode || data?.profile?.pincode || fallback.pincode),
    registeredAddress: cleanPlaceholder(storedDraft?.formData?.registeredAddress || data?.profile?.registeredAddress || fallback.registeredAddress),
  };
};

export default function BuyerOnboarding() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const sectionParam = searchParams?.get('section');
  const authHeaders = { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } };
  const cachedProfile = api.peek('/api/auth/me', authHeaders);
  const selectedDocs: string[] = user?.registrationDetails?.selectedDocuments || cachedProfile?.user?.registrationDetails?.selectedDocuments || ['panCard', 'regCert', 'addressProof'];
  const initialDraft = readBuyerDraft();
  const initialFormData = buildBuyerFormData(cachedProfile, initialDraft);
  const [activeSection, setActiveSection] = useState(
    initialDraft?.activeSection && SIDEBAR_SECTIONS.some(section => section.id === initialDraft.activeSection)
      ? initialDraft.activeSection
      : 'org'
  );

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [formData, setFormData] = useState<any>(initialFormData);

  const [isUploading, setIsUploading] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(!cachedProfile && !initialDraft?.formData);
  const [isProfileLocked, setIsProfileLocked] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreview | null>(null);
  const [isFetchingGst, setIsFetchingGst] = useState(false);
  const [buyerSubmissionOtp, setBuyerSubmissionOtp] = useState('');
  const [buyerSubmissionOtpSent, setBuyerSubmissionOtpSent] = useState(false);
  const [isSendingBuyerSubmissionOtp, setIsSendingBuyerSubmissionOtp] = useState(false);
  const [onboardingStatus, setOnboardingStatus] = useState(cachedProfile?.user?.onboardingStatus || 'pending');
  const [profileGstVerified, setProfileGstVerified] = useState(Boolean(cachedProfile?.profile?.gstFingerprint || cachedProfile?.profile?.gstMasked));
  const [hasFinalSubmission, setHasFinalSubmission] = useState(hasSubmittedApplication(cachedProfile?.user));
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(shouldShowSubmissionOverlay(cachedProfile?.user));
  const isSubmittedOrApproved = shouldLockBuyerProfile({
    onboardingStatus,
    sectionStatus: { submitted: hasFinalSubmission }
  });
  const activeGstinLookupRef = React.useRef('');
  const lastFetchedGstinRef = React.useRef('');
  const gstFetchedFieldsRef = React.useRef<Record<string, string>>({});
  const registrationDetails = user?.registrationDetails || cachedProfile?.user?.registrationDetails || {};
  const registrationVerifiedGstin = String(registrationDetails.gstin || '').trim().toUpperCase();
  const profileVerifiedGstin = String(cachedProfile?.profile?.gst || formData.gst || '').trim().toUpperCase();
  const hasVerifiedGst =
    profileGstVerified ||
    Boolean(cachedProfile?.profile?.gstFingerprint) ||
    Boolean(registrationDetails.gstVerified && registrationVerifiedGstin) ||
    Boolean(profileVerifiedGstin && cachedProfile?.profile?.gstMasked);

  useEffect(() => {
    const mappedSection = sectionParam ? DASHBOARD_SECTION_TO_BUYER_SECTION[sectionParam] : null;
    if (mappedSection && mappedSection !== activeSection) {
      setActiveSection(mappedSection);
    }
  }, [sectionParam]);

  useEffect(() => {
    return () => {
      if (previewDocument?.url?.startsWith('blob:')) URL.revokeObjectURL(previewDocument.url);
    };
  }, [previewDocument?.url]);

  const handleSectionChange = (id: string) => {
    setActiveSection(id);
    const params = new URLSearchParams(window.location.search);
    // Find if this ID corresponds to a dashboard section for reverse mapping (optional but good)
    // For now just keep the current ID as is or mapped back
    params.set('section', id);
    window.history.pushState(null, '', `?${params.toString()}`);
  };

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.fetch('/api/auth/me', authHeaders);
        const data = await res.json();
        const userRecord = data.user || {};
        const currentStatus = userRecord.onboardingStatus || 'pending';
        const submitted = hasSubmittedApplication(userRecord);
        const profileLocked = shouldLockBuyerProfile(userRecord);
        setOnboardingStatus(currentStatus);
        setProfileGstVerified(Boolean(data?.profile?.gstFingerprint || data?.profile?.gstMasked || data?.user?.registrationDetails?.gstVerified));
        setHasFinalSubmission(submitted);
        setIsProfileLocked(profileLocked);
        setShowSuccessOverlay(shouldShowSubmissionOverlay(userRecord));
        const storedDraft = !profileLocked ? readBuyerDraft() : null;
        setFormData((prev: any) => buildBuyerFormData(data, storedDraft, prev));
        if (storedDraft?.activeSection && SIDEBAR_SECTIONS.some(section => section.id === storedDraft.activeSection)) {
          setActiveSection(storedDraft.activeSection);
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
    if (!isPrimaryUserType(formData.businessType)) return;
    const regState = cleanPlaceholder(registrationDetails.state);
    const regDistrict = cleanPlaceholder(registrationDetails.district);
    if (!regState && !regDistrict) return;
    setFormData((prev: any) => {
      const nextState = regState || prev.state;
      const nextDistrict = regDistrict || prev.district;
      const nextCity = prev.city || nextDistrict;
      if (prev.state === nextState && prev.district === nextDistrict && prev.city === nextCity) return prev;
      return {
        ...prev,
        state: nextState,
        district: nextDistrict,
        city: nextCity
      };
    });
  }, [formData.businessType, registrationDetails.state, registrationDetails.district]);

  const fetchGstDetails = async () => {
    const gstin = String(formData.gst || '').trim().toUpperCase();
    const gstError = validateField('gst', gstin);
    if (gstError) {
      setTouched(prev => ({ ...prev, gst: true }));
      setErrors(prev => ({ ...prev, gst: gstError }));
      toast.error('Please enter a valid 15-digit GSTIN');
      return;
    }

    setIsFetchingGst(true);
    activeGstinLookupRef.current = gstin;
    setErrors(prev => ({ ...prev, gst: '', registeredAddress: '' }));
    setFormData((prev: any) => {
      const cleared = { ...prev, gst: gstin };
      cleared.country = 'India';
      cleared.registeredAddress = '';
      // Preserve state and district for primary user types (auto-loaded from registration)
      if (!isPrimaryUserType(prev.businessType)) {
        cleared.state = '';
        cleared.district = '';
      }
      cleared.city = '';
      cleared.pincode = '';
      return cleared;
    });

    try {
      const res = await api.fetch(`/api/utils/gst-verify/${gstin}`, {
        skipCache: true
      } as RequestInit & { skipCache: boolean });

      if (res.ok) {
        const data = await res.json();
        // Guard against a masked/garbled PAN ever landing in the field. A valid
        // PAN is ABCDE1234F; if the API returns a masked value ("AA***1P") we
        // derive the PAN from the GSTIN instead (chars 3–12 are the PAN).
        const PAN_RE = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
        const apiPan = String(data.pan || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
        const gstinPan = gstin.slice(2, 12);
        const resolvedPan = PAN_RE.test(apiPan) ? apiPan : (PAN_RE.test(gstinPan) ? gstinPan : '');
        setFormData((prev: any) => ({
          ...prev,
          organizationName: data.legalName?.trim() || prev.organizationName,
          registeredAddress: data.address?.trim() || prev.registeredAddress,
          state: data.state?.trim() || prev.state,
          city: data.city?.trim() || prev.city,
          pincode: String(data.pincode || '').replace(/\D/g, '').slice(0, 6) || prev.pincode,
          pan: resolvedPan || prev.pan,
        }));
        if (data.partial) {
          toast.message(data.message || 'Partial GST details applied. Please verify manually.');
        } else {
          toast.success(`GST verified: ${data.status || 'Status available'}`);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        const msg = err?.message || 'Could not fetch GST details. Please enter manually.';
        toast.error(msg);
        setErrors(prev => ({ ...prev, gst: msg }));
        setTouched(prev => ({ ...prev, gst: true }));
      }
    } catch (err) {
      toast.error('Live GST service is currently unreachable. Please try later or enter details manually.');
    } finally {
      setIsFetchingGst(false);
    }
  };

  useEffect(() => {
    if (isFetching || isProfileLocked) return;

    localStorage.setItem(BUYER_ONBOARDING_DRAFT_KEY, JSON.stringify({
      activeSection,
      formData
    }));
  }, [activeSection, formData, isFetching, isProfileLocked]);

  const validate = (name: string, value: string) => {
    const requiredFields: Record<string, string> = {
      organizationName: 'Organization name is required',
      businessType: 'Business type is required',
      industry: 'Industry / Sector is required',
      country: 'Country is required',
      state: 'State is required',
      district: 'District is required',
      city: 'City is required',
      registeredAddress: 'Registered office address is required',
      designation: 'Designation is required',
      customDesignation: 'Please specify your designation',
      department: 'Department is required',
      customDepartment: 'Please specify your department'
    };

    if (requiredFields[name] && !String(value || '').trim()) {
      setErrors(prev => ({ ...prev, [name]: requiredFields[name] }));
      return false;
    }

    let fieldType: FieldType | null = null;
    if (name === 'pan') fieldType = 'pan';
    if (name === 'gst') fieldType = 'gst';
    if (name === 'cin') fieldType = 'cin';
    if (name === 'mobile' || name === 'alternateMobile') fieldType = 'mobile';
    if (name === 'email') fieldType = 'email';
    if (name === 'pincode') fieldType = 'pincode';
    if (name === 'representativeName') fieldType = 'name';

    if (fieldType) {
      const error = validateField(fieldType, value);
      setErrors(prev => ({ ...prev, [name]: error || '' }));
      return !error;
    }
    if (requiredFields[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
    return true;
  };

  const getFieldError = (name: string) => (touched[name] || submitAttempted ? errors[name] || '' : '');

  const handleIndustryChange = (value: string) => {
    if (isProfileLocked) return;
    setFormData((prev: any) => ({ ...prev, industry: value }));
    if (touched.industry || submitAttempted) validate('industry', value);
  };

  const handleIndustryBlur = () => {
    setTouched(prev => ({ ...prev, industry: true }));
    validate('industry', formData.industry || '');
  };

  const isWebsiteUrlValid = (value: string) => {
    if (!value.trim()) return true;
    try {
      const normalizedValue = value.startsWith('http://') || value.startsWith('https://')
        ? value
        : `https://${value}`;
      new URL(normalizedValue);
      return true;
    } catch {
      return false;
    }
  };

  const validateWebsite = (value: string) => {
    if (isWebsiteUrlValid(value)) {
      setErrors(prev => ({ ...prev, website: '' }));
      return true;
    }
    setErrors(prev => ({ ...prev, website: 'Invalid Website URL' }));
    return false;
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setTouched(prev => ({ ...prev, [name]: true }));
    if (name === 'website') {
      validateWebsite(value);
      return;
    }
    if (['cin', 'gst'].includes(name) && !value.trim()) {
      setErrors(prev => ({ ...prev, [name]: '' }));
      return;
    }
    validate(name, value);
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    if (isProfileLocked) return;
    const { name, value, type } = (e.target as any);
    let newValue = value;

    // Character Blocking & Auto Formatting
    if (['mobile', 'alternateMobile', 'pincode'].includes(name)) {
      newValue = value.replace(/[^0-9]/g, '');
      if (name === 'mobile' || name === 'alternateMobile') newValue = newValue.slice(0, 10);
      if (name === 'pincode') newValue = newValue.slice(0, 6);
    }

    if (['pan', 'gst', 'cin'].includes(name)) {
      if (name === 'gst' && hasVerifiedGst) return;
      newValue = value.toUpperCase().trim();
      if (name === 'pan') newValue = newValue.slice(0, 10);
      if (name === 'gst') newValue = newValue.slice(0, 15);
      if (name === 'cin') newValue = newValue.slice(0, 21);
    }

    if (name === 'representativeName') {
      newValue = value.replace(/[^A-Za-z ]/g, '');
    }

    if (type === 'checkbox') {
      setFormData({ ...formData, [name]: (e.target as HTMLInputElement).checked });
    } else if (name === 'department') {
      setFormData({
        ...formData,
        department: newValue,
        customDepartment: newValue === 'Others' ? formData.customDepartment : ''
      });
      if (touched[name] || submitAttempted) validate(name, newValue);
    } else if (name === 'designation') {
      setFormData({
        ...formData,
        designation: newValue,
        customDesignation: newValue === 'Others' ? formData.customDesignation : ''
      });
      if (touched[name] || submitAttempted) validate(name, newValue);
    } else if (name === 'website') {
      setFormData({ ...formData, [name]: newValue.trim() });
      if (touched[name] || submitAttempted) validateWebsite(newValue);
    } else {
      setFormData({ ...formData, [name]: newValue });
      if (touched[name] || submitAttempted) validate(name, newValue);
    }
  };

  const toggleTag = (field: string, value: string) => {
    if (isProfileLocked) return;
    const values = [...formData[field]];
    if (values.includes(value)) {
      setFormData({
        ...formData,
        [field]: values.filter(v => v !== value),
        ...(field === 'procurementCategories' && value === 'Others'
          ? { otherCategoryDetails: '', customProcurementCategoryInput: '', customProcurementCategories: [] }
          : {}),
        ...(field === 'preferredMethods' && value === 'Others'
          ? { otherMethodDetails: '', customProcurementMethodInput: '', customPreferredMethods: [] }
          : {})
      });
    } else {
      setFormData({ ...formData, [field]: [...values, value] });
    }
  };

  const handleProcurementCategorySelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isProfileLocked) return;
    const { value } = e.target;
    if (!value) return;

    if (!formData.procurementCategories.includes(value)) {
      setFormData({
        ...formData,
        procurementCategories: [...formData.procurementCategories, value]
      });
    }
  };

  const addCustomProcurementCategory = () => {
    if (isProfileLocked) return;
    const category = formData.customProcurementCategoryInput.trim();
    if (!category) return;

    const existsInPreset = formData.procurementCategories.some((item: string) => item.toLowerCase() === category.toLowerCase());
    const existsInCustom = formData.customProcurementCategories.some((item: string) => item.toLowerCase() === category.toLowerCase());

    if (existsInPreset || existsInCustom) {
      toast.error('This procurement category is already added');
      return;
    }

    const updatedCustomProcurementCategories = [...formData.customProcurementCategories, category];
    setFormData({
      ...formData,
      procurementCategories: formData.procurementCategories.includes('Others')
        ? formData.procurementCategories
        : [...formData.procurementCategories, 'Others'],
      customProcurementCategoryInput: '',
      customProcurementCategories: updatedCustomProcurementCategories,
      otherCategoryDetails: updatedCustomProcurementCategories.join(', ')
    });
  };

  const removeCustomProcurementCategory = (categoryToRemove: string) => {
    if (isProfileLocked) return;
    const updatedCustomProcurementCategories = formData.customProcurementCategories.filter((item: string) => item !== categoryToRemove);
    setFormData({
      ...formData,
      customProcurementCategories: updatedCustomProcurementCategories,
      otherCategoryDetails: updatedCustomProcurementCategories.join(', '),
      procurementCategories: updatedCustomProcurementCategories.length === 0
        ? formData.procurementCategories.filter((item: string) => item !== 'Others')
        : formData.procurementCategories
    });
  };

  const handleProcurementMethodSelect = (e: React.ChangeEvent<HTMLSelectElement>) => {
    if (isProfileLocked) return;
    const { value } = e.target;
    if (!value) return;

    if (!formData.preferredMethods.includes(value)) {
      setFormData({
        ...formData,
        preferredMethods: [...formData.preferredMethods, value]
      });
    }
  };

  const addCustomPreferredMethod = () => {
    if (isProfileLocked) return;
    const method = formData.customProcurementMethodInput.trim();
    if (!method) return;

    const existsInPreset = formData.preferredMethods.some((item: string) => item.toLowerCase() === method.toLowerCase());
    const existsInCustom = formData.customPreferredMethods.some((item: string) => item.toLowerCase() === method.toLowerCase());

    if (existsInPreset || existsInCustom) {
      toast.error('This procurement method is already added');
      return;
    }

    const updatedCustomPreferredMethods = [...formData.customPreferredMethods, method];
    setFormData({
      ...formData,
      preferredMethods: formData.preferredMethods.includes('Others')
        ? formData.preferredMethods
        : [...formData.preferredMethods, 'Others'],
      customProcurementMethodInput: '',
      customPreferredMethods: updatedCustomPreferredMethods,
      otherMethodDetails: updatedCustomPreferredMethods.join(', ')
    });
  };

  const removeCustomPreferredMethod = (methodToRemove: string) => {
    if (isProfileLocked) return;
    const updatedCustomPreferredMethods = formData.customPreferredMethods.filter((item: string) => item !== methodToRemove);
    setFormData({
      ...formData,
      customPreferredMethods: updatedCustomPreferredMethods,
      otherMethodDetails: updatedCustomPreferredMethods.join(', '),
      preferredMethods: updatedCustomPreferredMethods.length === 0
        ? formData.preferredMethods.filter((item: string) => item !== 'Others')
        : formData.preferredMethods
    });
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, fieldName: string) => {
    if (isProfileLocked) return;
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;

    const oversizedFile = files.find(file => file.size > 10 * 1024 * 1024);
    if (oversizedFile) {
      toast.error(`${oversizedFile.name} is too large. Max limit is 10MB per file.`);
      e.target.value = '';
      return;
    }
    const allowedExtensions = ['pdf', 'jpg', 'jpeg', 'png'];
    const allowedMimeTypes = ['application/pdf', 'image/jpeg', 'image/png'];
    const invalidFile = files.find(file => {
      const extension = file.name.split('.').pop()?.toLowerCase() || '';
      return !allowedExtensions.includes(extension) || !allowedMimeTypes.includes(file.type);
    });
    if (invalidFile) {
      toast.error('Only PDF, JPG, JPEG, and PNG documents are allowed.');
      e.target.value = '';
      return;
    }

    setIsUploading(fieldName);

    try {
      const uploadedFiles: any[] = [];
      for (const file of files) {
        // Apply client-side image compression before sending across network
        const optimizedFile = await compressImage(file);
        console.log(`--- Starting upload for ${fieldName}: ${optimizedFile.name} (${optimizedFile.size} bytes) ---`);
        const formDataUpload = new FormData();
        formDataUpload.append('file', optimizedFile);

        const res = await api.fetch('/api/upload', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          },
          body: formDataUpload
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          console.error('Upload failed:', errData);
          throw new Error(errData.message || `Upload failed for ${file.name}`);
        }

        const data = unwrapApiData<any>(await res.json());
        uploadedFiles.push({
          url: data.url,
          fileId: data.fileId,
          originalName: data.file?.originalName || file.name,
          mimeType: data.file?.mimeType || optimizedFile.type
        });
      }

      const fieldPath = fieldName.split('.');
      let nextDocumentsForSave: any = null;
      setFormData((prev: any) => {
        if (fieldPath.length > 1) {
          const currentFiles = getDocumentFiles(prev[fieldPath[0]]?.[fieldPath[1]]);
          const nextNested = {
            ...prev[fieldPath[0]],
            [fieldPath[1]]: [...currentFiles, ...uploadedFiles]
          };
          if (fieldPath[0] === 'documents') nextDocumentsForSave = nextNested;
          return {
            ...prev,
            [fieldPath[0]]: nextNested
          };
        }

        return {
          ...prev,
          [fieldName]: [...getDocumentFiles(prev[fieldName]), ...uploadedFiles]
        };
      });
      if (nextDocumentsForSave) {
        const saveRes = await api.put('/api/buyer/onboarding', { documents: nextDocumentsForSave }, {
          headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
        });
        if (!saveRes.ok) {
          const errData = await saveRes.json().catch(() => ({}));
          throw new Error(errData.message || 'Document uploaded, but profile document save failed.');
        }
      }
      toast.success(files.length === 1 ? 'Document uploaded successfully' : `${files.length} documents uploaded successfully`);
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(`Upload error: ${err.message || 'Check network'}`);
    } finally {
      setIsUploading(null);
      // Reset the file input so the same file can be selected again if needed
      e.target.value = '';
    }
  };

  const removeUploadedDocument = async (fieldName: string, index: number) => {
    if (isProfileLocked) return;
    let nextDocumentsForSave: any = null;
    setFormData((prev: any) => {
      const nextFiles = getDocumentFiles(prev.documents?.[fieldName]).filter((_, fileIndex) => fileIndex !== index);
      nextDocumentsForSave = {
        ...prev.documents,
        [fieldName]: nextFiles
      };
      return {
        ...prev,
        documents: nextDocumentsForSave
      };
    });
    if (nextDocumentsForSave) {
      const saveRes = await api.put('/api/buyer/onboarding', { documents: nextDocumentsForSave }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!saveRes.ok) toast.error('Removed locally, but failed to save the document list.');
    }
  };

  const getDocumentDisplayName = (document: any, fallback: string, index: number) => {
    if (document?.originalName) return document.originalName;
    const url = getUploadedDocumentUrl(document);
    if (url) {
      const cleanUrl = url.split('?')[0];
      const filename = cleanUrl.split('/').pop();
      if (filename) {
        try {
          return decodeURIComponent(filename);
        } catch {
          return filename;
        }
      }
    }
    return `${fallback} ${index + 1}`;
  };

  const validateSection = (sectionId: string): { valid: boolean; errorFields: string[] } => {
    const errorFields: string[] = [];
    if (sectionId === 'procurement') {
      const validCats = (formData.procurementCategories.filter((cat: string) => cat !== 'Others').length > 0 || formData.customProcurementCategories.length > 0);
      const validBudget = !!formData.annualBudget;
      const validMethods = formData.preferredMethods.length > 0;
      setErrors(prev => ({
        ...prev,
        procurementCategories: validCats ? '' : 'Required: select at least one category',
        annualBudget: validBudget ? '' : 'Required: select a budget range',
        preferredMethods: validMethods ? '' : 'Required: select at least one method'
      }));
      if (!validCats) errorFields.push('Procurement Category');
      if (!validBudget) errorFields.push('Annual Budget');
      if (!validMethods) errorFields.push('Preferred Methods');
      return { valid: errorFields.length === 0, errorFields };
    }
    if (sectionId === 'docs') {
      const isMissingPan = selectedDocs.includes('panCard') && !hasUploadedDocument(formData.documents?.panCard);
      const isMissingReg = selectedDocs.includes('regCert') && !hasUploadedDocument(formData.documents?.regCert);
      const isMissingGst = selectedDocs.includes('gstCert') && !hasUploadedDocument(formData.documents?.gstCert);
      const isMissingAddr = selectedDocs.includes('addressProof') && !hasUploadedDocument(formData.documents?.addressProof);
      const isMissingAuth = selectedDocs.includes('authLetter') && !hasUploadedDocument(formData.documents?.authLetter);

      setErrors(prev => ({
        ...prev,
        'docs.panCard': isMissingPan ? 'PAN Card document is required' : '',
        'docs.regCert': isMissingReg ? 'Registration Certificate is required' : '',
        'docs.gstCert': isMissingGst ? 'GST Certificate is required' : '',
        'docs.addressProof': isMissingAddr ? 'Address Proof is required' : '',
        'docs.authLetter': isMissingAuth ? 'Authorization Letter is required' : ''
      }));

      if (isMissingPan) errorFields.push('PAN Card');
      if (isMissingReg) errorFields.push('Registration Certificate');
      if (isMissingGst) errorFields.push('GST Certificate');
      if (isMissingAddr) errorFields.push('Address Proof');
      if (isMissingAuth) errorFields.push('Authorization Letter');
      return { valid: errorFields.length === 0, errorFields };
    }

    let fields: string[] = [];
    const fieldLabels: Record<string, string> = {
      organizationName: 'Organization Name',
      businessType: 'Business Type',
      industry: 'Industry / Sector',
      cin: 'CIN',
      pan: 'PAN',
      gst: 'GSTIN',
      website: 'Website URL',
      country: 'Country',
      state: 'State',
      district: 'District',
      city: 'City',
      pincode: 'PIN Code',
      registeredAddress: 'Registered Address',
      representativeName: 'Full Name',
      designation: 'Designation',
      department: 'Department',
      email: 'Official Email',
      mobile: 'Mobile Number',
      alternateMobile: 'Alternate Number',
      customDepartment: 'Department (specify)',
      customDesignation: 'Designation (specify)',
    };
    if (sectionId === 'org') fields = ['organizationName', 'businessType', 'industry', 'cin', 'pan', 'gst', 'website', 'country', 'state', 'district', 'city', 'pincode', 'registeredAddress'];
    if (sectionId === 'rep') fields = ['representativeName', 'designation', 'department', 'email', 'mobile', 'alternateMobile'];

    if (sectionId === 'account') fields = [];

    let isValid = true;
    setTouched(prev => fields.reduce((acc, field) => ({ ...acc, [field]: true }), { ...prev }));
    fields.forEach(field => {
      if (['cin', 'gst', 'alternateMobile'].includes(field) && !String(formData[field] || '').trim()) {
        setErrors(prev => ({ ...prev, [field]: '' }));
        return;
      }
      if (field === 'department' && formData.department !== 'Others') {
        setErrors(prev => ({ ...prev, customDepartment: '' }));
      }
      if (field === 'department' && formData.department === 'Others') {
        const isCustomDepartmentValid = validate('customDepartment', formData.customDepartment || '');
        if (!isCustomDepartmentValid) {
          isValid = false;
          errorFields.push(fieldLabels.customDepartment || 'Department (specify)');
        }
      }
      if (field === 'designation' && formData.designation !== 'Others') {
        setErrors(prev => ({ ...prev, customDesignation: '' }));
      }
      if (field === 'designation' && formData.designation === 'Others') {
        const isCustomDesignationValid = validate('customDesignation', formData.customDesignation || '');
        if (!isCustomDesignationValid) {
          isValid = false;
          errorFields.push(fieldLabels.customDesignation || 'Designation (specify)');
        }
      }
      const isFieldValid = field === 'website'
        ? validateWebsite(formData[field] || '')
        : validate(field, formData[field] || '');
      if (!isFieldValid) {
        isValid = false;
        errorFields.push(fieldLabels[field] || field);
      }
    });

    if (sectionId === 'rep') {
      const alternateMobileError = validateOptionalField('mobile', formData.alternateMobile || '');
      if (alternateMobileError) {
        setErrors(prev => ({ ...prev, alternateMobile: alternateMobileError }));
        isValid = false;
        if (!errorFields.includes(fieldLabels.alternateMobile)) errorFields.push(fieldLabels.alternateMobile);
      }
    }

    return { valid: isValid, errorFields };
  };

  const scrollToFirstError = () => {
    // Wait for React to flush error state updates, then scroll to first visible error
    setTimeout(() => {
      const firstErrorEl = document.querySelector('[class*="border-red-500"]') as HTMLElement;
      if (firstErrorEl) {
        firstErrorEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
        firstErrorEl.focus?.();
      }
    }, 100);
  };
  const hasValue = (value: unknown) => typeof value === 'string' ? value.trim().length > 0 : Boolean(value);

  const getSectionCompletion = (sectionId: string) => {
    if (sectionId === 'org') {
      const hasRequiredOrganizationFields =
        hasValue(formData.organizationName) &&
        hasValue(formData.businessType) &&
        hasValue(formData.industry) &&
        hasValue(formData.pan) &&
        hasValue(formData.country) &&
        hasValue(formData.state) &&
        hasValue(formData.district) &&
        hasValue(formData.city) &&
        !validateField('pincode', formData.pincode || '') &&
        hasValue(formData.registeredAddress);

      const cinValid = !hasValue(formData.cin) || !validateField('cin', formData.cin);
      const gstValid = !hasValue(formData.gst) || !validateField('gst', formData.gst);
      const websiteValid = !hasValue(formData.website) || isWebsiteUrlValid(formData.website);

      return hasRequiredOrganizationFields && cinValid && gstValid && websiteValid;
    }

    if (sectionId === 'rep') {
      const departmentValue = formData.department === 'Others' ? formData.customDepartment : formData.department;
      const designationValue = formData.designation === 'Others' ? formData.customDesignation : formData.designation;
      return (
        hasValue(formData.representativeName) &&
        hasValue(designationValue) &&
        hasValue(departmentValue) &&
        !validateField('email', formData.email || '') &&
        !validateField('mobile', formData.mobile || '')
      );
    }

    if (sectionId === 'address') {
      return (
        hasValue(formData.country) &&
        hasValue(formData.state) &&
        hasValue(formData.district) &&
        hasValue(formData.city) &&
        !validateField('pincode', formData.pincode || '') &&
        hasValue(formData.registeredAddress)
      );
    }

    if (sectionId === 'procurement') {
      const selectedCategories = formData.procurementCategories.filter((category: string) => category !== 'Others');
      const hasCustomCategories = formData.customProcurementCategories.length > 0;
      return (
        (selectedCategories.length > 0 || hasCustomCategories) &&
        hasValue(formData.annualBudget) &&
        formData.preferredMethods.length > 0
      );
    }

    if (sectionId === 'docs') {
      if (selectedDocs.length === 0) return false;
      return selectedDocs.every((docId: string) => hasUploadedDocument(formData.documents?.[docId]));
    }

    if (sectionId === 'account') {
      return (
        Boolean(formData.declaration) &&
        Boolean(formData.agreeTerms)
      );
    }

    return false;
  };

  const completedSectionCount = SIDEBAR_SECTIONS.filter(section => getSectionCompletion(section.id)).length;
  const complianceProgress = Math.round((completedSectionCount / SIDEBAR_SECTIONS.length) * 100);

  const getUploadedDocumentUrl = (document: any) =>
    typeof document === 'string' ? document : document?.url || document?.signedUrl || '';

  const openDocumentPreview = async (label: string, document: any) => {
    try {
      const url = getUploadedDocumentUrl(document);
      setPreviewDocument(await getFileAssetPreview({ ...document, url }, label));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open document');
    }
  };

  const saveDraft = () => {
    if (isProfileLocked) {
      toast.info('Approved profiles are locked');
      return;
    }
    localStorage.setItem(BUYER_ONBOARDING_DRAFT_KEY, JSON.stringify({
      activeSection,
      formData
    }));
    toast.success('Draft saved');
  };

  const handleSendBuyerSubmissionOtp = async () => {
    if (isProfileLocked) return;
    if (!formData.declaration || !formData.agreeTerms) {
      toast.error('Please accept both declarations before requesting OTP.');
      return;
    }

    setIsSendingBuyerSubmissionOtp(true);
    try {
      const res = await api.post('/api/buyer/submission/send-otp', {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || 'Failed to send OTP');
        return;
      }
      setBuyerSubmissionOtpSent(true);
      setBuyerSubmissionOtp('');
      toast.success(`OTP sent to ${data.email || user?.email || 'your login email'}`);
    } catch {
      toast.error('Unable to send OTP right now');
    } finally {
      setIsSendingBuyerSubmissionOtp(false);
    }
  };

  const handleFormKeyDown = (event: React.KeyboardEvent<HTMLFormElement>) => {
    const target = event.target as HTMLElement;
    const isTextArea = target.tagName === 'TEXTAREA';
    const isSubmitControl = target instanceof HTMLButtonElement || (target instanceof HTMLInputElement && target.type === 'submit');

    if (event.key === 'Enter' && !isTextArea && !isSubmitControl) {
      event.preventDefault();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitAttempted(true);
    if (isProfileLocked) {
      toast.info('Approved profiles are locked');
      return;
    }

    // Final Submission Logic
    if (activeSection === 'account') {
      const requiredSections = SIDEBAR_SECTIONS.map(section => section.id);
      const invalidSection = requiredSections.find(sectionId => !validateSection(sectionId).valid);
      if (invalidSection) {
        setActiveSection(invalidSection);
        const { errorFields } = validateSection(invalidSection);
        const fieldList = errorFields.length > 0 ? errorFields.join(', ') : 'some fields';
        toast.error(`Please fix errors in: ${fieldList}`);
        scrollToFirstError();
        return;
      }
      if (!formData.declaration || !formData.agreeTerms) {
        toast.error('Please accept both declarations');
        return;
      }
      if (!buyerSubmissionOtpSent || !/^\d{6}$/.test(buyerSubmissionOtp.trim())) {
        toast.error('Send OTP and enter the 6-digit code sent to your login email.');
        return;
      }

      setIsLoading(true);
      try {
        const normalizedProcurementCategories = formData.procurementCategories.filter((category: string) => category !== 'Others');
        const normalizedPreferredMethods = formData.preferredMethods.filter((method: string) => method !== 'Others');
        const { password, confirmPassword, ...buyerSubmissionFormData } = formData;
        const submissionData = {
          ...buyerSubmissionFormData,
          department: formData.department === 'Others' ? formData.customDepartment.trim() || 'Others' : formData.department,
          designation: formData.designation === 'Others' ? formData.customDesignation.trim() || 'Others' : formData.designation,
          procurementCategories: [
            ...normalizedProcurementCategories,
            ...formData.customProcurementCategories
          ],
          otherCategoryDetails: formData.customProcurementCategories.join(', '),
          preferredMethods: [
            ...normalizedPreferredMethods,
            ...formData.customPreferredMethods
          ],
          otherMethodDetails: formData.customPreferredMethods.join(', '),
          otp: buyerSubmissionOtp.trim()
        };

        const res = await api.post('/api/buyer/register', submissionData, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (res.ok) {
          localStorage.removeItem(BUYER_ONBOARDING_DRAFT_KEY);
          toast.success('Application submitted successfully');
          setOnboardingStatus('under_compliance_review');
          setHasFinalSubmission(true);
          setIsProfileLocked(true);
          setShowSuccessOverlay(true);
        } else {
          const data = await res.json();
          toast.error(data.message || 'Submission failed');
        }
      } catch (err: any) {
        toast.error(err?.message || 'Network error');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Move to next sidebar section
      const currentIndex = SIDEBAR_SECTIONS.findIndex(s => s.id === activeSection);
      const result = validateSection(activeSection);
      if (result.valid) {
        setSubmitAttempted(false);
        handleSectionChange(SIDEBAR_SECTIONS[currentIndex + 1].id);
      } else {
        const fieldList = result.errorFields.length > 0 ? result.errorFields.join(', ') : 'some fields';
        toast.error(`Please fix: ${fieldList}`);
        scrollToFirstError();
      }
    }
  };

  if (isFetching) return <div className="buyer-font flex min-h-dvh items-center justify-center px-4 text-center font-bold text-indigo-600">Loading JsgSmile Portal - Jharsuguda Synergy for MSME and Industry Linkage Ecosystem form...</div>;

  if (showSuccessOverlay) {
    return (
      <div className="min-h-screen bg-white text-slate-900 p-4">
        <div className="mx-auto flex min-h-[70vh] max-w-2xl flex-col items-center justify-center text-center">
          <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-emerald-100 shadow-inner shadow-emerald-100">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900">Application Submitted Successfully</h2>
          <p className="mt-3 max-w-md text-sm font-medium text-slate-500">
            Your buyer profile has been securely locked and submitted to our compliance team for review. You will be notified via email once the verification is complete.
          </p>
          <div className="mt-8 w-full max-w-md rounded-xl border border-slate-100 bg-slate-50 p-4 text-left">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[#12335f]" />
              <div>
                <p className="text-sm font-bold text-slate-900">Review Period Notice</p>
                <p className="mt-1 text-xs font-medium text-[#12335f]">Standard processing time is 3-5 business days. You cannot modify your registration data during this period.</p>
              </div>
            </div>
          </div>
          <Button onClick={() => setShowSuccessOverlay(false)} className="mt-10 h-10 rounded-lg bg-[#12335f] px-8 text-xs font-bold uppercase tracking-wide text-white hover:bg-[#0b2342]">
            Review Submission Data
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-2 sm:p-4 md:p-5">
      <div className="max-w-7xl mx-auto">
        {/* Header Section */}
        <div className="mb-4 md:mb-5">
          <p className="text-[10px] sm:text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-0.5">Buyer Registration</p>
          <h1 className="text-xl sm:text-2xl font-bold text-slate-900 mb-1">Onboarding</h1>
          <div className="flex items-center gap-3">
            <p className="text-[13px] text-slate-500 font-medium">
              Step {SIDEBAR_SECTIONS.findIndex(s => s.id === activeSection) + 1} of {SIDEBAR_SECTIONS.length} — {SIDEBAR_SECTIONS.find(s => s.id === activeSection)?.label}
            </p>
          </div>
          <div className="mt-2 h-1 w-full bg-slate-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#12335f] transition-all duration-500"
              style={{ width: `${((SIDEBAR_SECTIONS.findIndex(s => s.id === activeSection) + 1) / SIDEBAR_SECTIONS.length) * 100}%` }}
            />
          </div>
        </div>

        {/* Stepper Navigation */}
        <div className="flex flex-wrap items-center gap-1.5 mb-5 overflow-x-auto pb-1.5 no-scrollbar">
          {SIDEBAR_SECTIONS.map((section, idx) => {
            const isActive = activeSection === section.id;
            const isCompleted = getSectionCompletion(section.id);
            return (
              <button
                key={section.id}
                onClick={() => {
                  setSubmitAttempted(false);
                  handleSectionChange(section.id);
                }}
                className={cn(
                  "flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap border",
                  isActive
                    ? "bg-slate-50 text-[#12335f] border-slate-200 shadow-sm"
                    : isCompleted
                      ? "bg-transparent text-slate-500 border-transparent hover:text-slate-700"
                      : "bg-transparent text-slate-400 border-transparent hover:text-slate-600"
                )}
              >
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px]",
                  isActive ? "bg-[#12335f] text-white" : isCompleted ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-500"
                )}>
                  {isCompleted && !isActive ? <Check className="h-3 w-3" /> : idx + 1}
                </span>
                {section.label}
              </button>
            );
          })}
        </div>

        {/* Form Card */}
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden mb-6">
          <div className="p-4 sm:p-6 md:p-7">
            <div className="mb-5 md:mb-6">
              <h2 className="text-lg sm:text-xl font-bold text-slate-900 mb-0.5">
                {SIDEBAR_SECTIONS.find(s => s.id === activeSection)?.label}
              </h2>
              <p className="text-xs text-slate-500">
                {activeSection === 'org' ? 'Tell us about your organization.' :
                  activeSection === 'rep' ? 'Contact details of the authorized person.' :
                    activeSection === 'address' ? 'Registered and corporate office locations.' :
                      activeSection === 'procurement' ? 'Define your procurement requirements.' :
                        activeSection === 'docs' ? 'Upload verification documents.' :
                          'Confirm your declarations and verify submission with OTP.'}
              </p>
              {user?.onboardingStatus === 'approved_for_procurement' && (
                <p className="mt-2 inline-flex rounded-full border border-slate-100 bg-slate-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-[#12335f] animate-pulse">
                  Approved Profile: Unlocked for Manual Updates
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-6">
              <fieldset disabled={isProfileLocked && activeSection !== 'docs'} className={cn("min-h-[400px]", isProfileLocked && "opacity-70")}>
                {/* Section Content */}
                {activeSection === 'org' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Input label="Organization / Company Name" name="organizationName" value={formData.organizationName} onChange={handleChange} onBlur={handleBlur} error={getFieldError('organizationName')} required className="h-10" />
                    <Select label="Business Type" name="businessType" value={formData.businessType} onChange={handleChange} onBlur={handleBlur} error={getFieldError('businessType')} required className="h-10" disabled={isPrimaryUserType(formData.businessType)}>
                      <option value="Private Limited Company">Private Limited Company</option>
                      <option value="Public Limited Company">Public Limited Company</option>
                      <option value="Partnership Firm">Partnership Firm</option>
                      <option value="LLP">LLP</option>
                      <option value="Proprietorship">Proprietorship</option>
                      <option value="Startup">Startup</option>
                      <option value="NGO / Trust">NGO / Trust</option>
                      <option value="Educational Institution">Educational Institution</option>
                      <option value="Primary User (HOD)">Primary User (HOD)</option>
                      <option value="Primary User (Co-operative)">Primary User (Co-operative)</option>
                    </Select>
                    <SearchableSelect
                      label="Industry / Sector"
                      value={formData.industry}
                      options={INDUSTRY_OPTIONS}
                      onChange={handleIndustryChange}
                      onBlur={handleIndustryBlur}
                      error={getFieldError('industry')}
                      placeholder="Search and select industry"
                      required
                      disabled={isProfileLocked}
                    />
                    <Input label="CIN / Registration Number (if applicable)" name="cin" value={formData.cin} onChange={handleChange} onBlur={handleBlur} error={getFieldError('cin')} placeholder="U12345KA2023PTC123456" className="h-10" />
                    <Input label="PAN of Organization" name="pan" value={formData.pan} onChange={handleChange} onBlur={handleBlur} error={getFieldError('pan')} placeholder="ABCDE1234F" required className="h-10" />
                    <div className="flex flex-col gap-1">
                      {hasVerifiedGst ? (
                        <div className="rounded-lg border border-emerald-200 bg-emerald-50/70 p-3">
                          <Input
                            label="GSTIN (Verified)"
                            name="gst"
                            value={formData.gst || registrationVerifiedGstin}
                            onChange={handleChange}
                            onBlur={handleBlur}
                            error=""
                            disabled
                            className="h-10 bg-white/80"
                          />
                          <p className="mt-2 text-[10px] font-bold uppercase tracking-wider text-emerald-700">
                            GST details already verified. No re-verification is required here.
                          </p>
                        </div>
                      ) : (
                        <div className="flex items-end gap-2">
                          <div className="flex-1">
                            <Input
                              label="GSTIN (Optional)"
                              name="gst"
                              value={formData.gst}
                              onChange={handleChange}
                              onBlur={handleBlur}
                              error={getFieldError('gst')}
                              placeholder="22ABCDE1234F1Z5"
                              className="h-10"
                            />
                          </div>
                          <Button
                            type="button"
                            variant="outline"
                            onClick={fetchGstDetails}
                            disabled={isFetchingGst || !formData.gst}
                            className="h-10 px-3 rounded-lg border-slate-200 text-[#12335f] font-bold uppercase text-[9px] hover:bg-slate-50"
                          >
                            {isFetchingGst ? 'Wait...' : 'Fetch Details'}
                          </Button>
                        </div>
                      )}
                    </div>
                    <div className="md:col-span-2">
                      <Input type="url" label="Website URL (Optional)" name="website" value={formData.website} onChange={handleChange} onBlur={handleBlur} error={getFieldError('website')} placeholder="https://www.company.com" className="h-10" />
                    </div>

                    {/* Organization Address Fields */}
                    <div className="md:col-span-2 pt-3 mt-1 border-t border-slate-100">
                      <h3 className="text-[13px] font-bold text-slate-900 flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-[#12335f]" />
                        Organization Address
                      </h3>
                    </div>
                    <Input label="COUNTRY" name="country" value={formData.country} onChange={handleChange} onBlur={handleBlur} required className="h-10" />
                    {isPrimaryUserType(formData.businessType) ? (
                      <Input label="STATE" name="state" value={formData.state} onChange={handleChange} onBlur={handleBlur} error={getFieldError('state')} required className="h-10" disabled />
                    ) : (
                      <Select label="STATE" name="state" value={formData.state} onChange={(e) => { if (!isProfileLocked) setFormData((prev: any) => ({ ...prev, state: e.target.value, district: '' })); }} onBlur={handleBlur} error={getFieldError('state')} required className="h-10">
                        <option value="">Select State</option>
                        {indiaStates.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </Select>
                    )}
                    {isPrimaryUserType(formData.businessType) ? (
                      <Input label="DISTRICT" name="district" value={formData.district} onChange={handleChange} onBlur={handleBlur} error={getFieldError('district')} required className="h-10" disabled />
                    ) : (
                      <Select label="DISTRICT" name="district" value={formData.district} onChange={handleChange} onBlur={handleBlur} error={getFieldError('district')} required className="h-10" disabled={!formData.state}>
                        <option value="">Select District</option>
                        {(formData.state ? indiaStatesDistricts[formData.state] || [] : []).map((d: string) => (
                          <option key={d} value={d}>{d}</option>
                        ))}
                      </Select>
                    )}
                    <Input label="CITY" name="city" value={formData.city} onChange={handleChange} onBlur={handleBlur} error={getFieldError('city')} required className="h-10" />
                    <Input label="PIN CODE" name="pincode" value={formData.pincode} onChange={handleChange} onBlur={handleBlur} error={getFieldError('pincode')} required className="h-10" />
                    <div className="md:col-span-2">
                      <Input label="REGISTERED OFFICE ADDRESS" name="registeredAddress" value={formData.registeredAddress} onChange={handleChange} onBlur={handleBlur} error={getFieldError('registeredAddress')} required className="h-10" />
                    </div>
                    <div className="md:col-span-2">
                      <Input label="CORPORATE OFFICE ADDRESS (Optional - if different)" name="corporateAddress" value={formData.corporateAddress} onChange={handleChange} onBlur={handleBlur} placeholder="Enter corporate address if different from registered address" className="h-10" />
                    </div>
                    {/* Jharsuguda District MSME Identification */}
                    <div className="md:col-span-2">
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-xl">
                        <div className="flex items-start gap-3 mb-3">
                          <span className="w-7 h-7 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">JD</span>
                          <div>
                            <h4 className="text-sm font-bold text-blue-900">Jharsuguda District Identification</h4>
                            <p className="text-[11px] text-blue-700 mt-0.5">
                              Identifies your organization as a Jharsuguda District entity — this helps the portal prioritise local supplier matching and opportunities.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center justify-between p-3 bg-white rounded-lg border border-blue-200 font-medium text-gray-700">
                          <span className="text-sm">Is your organization located in / procuring from <strong>Jharsuguda District</strong>, Odisha?</span>
                          <div className="flex gap-4 shrink-0 ml-3">
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" name="isJharsugudaOrg" checked={formData['isJharsugudaOrg'] === true} onChange={() => setFormData((prev: any) => ({ ...prev, isJharsugudaOrg: true }))} className="accent-blue-600 h-4 w-4" />
                              <span className="text-xs uppercase font-semibold text-green-700">Yes</span>
                            </label>
                            <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" name="isJharsugudaOrg" checked={formData['isJharsugudaOrg'] === false} onChange={() => setFormData((prev: any) => ({ ...prev, isJharsugudaOrg: false }))} className="accent-blue-600 h-4 w-4" />
                              <span className="text-xs uppercase font-semibold text-slate-500">No</span>
                            </label>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === 'rep' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Input label="FULL NAME" name="representativeName" value={formData.representativeName} onChange={handleChange} onBlur={handleBlur} error={getFieldError('representativeName')} required className="h-10" />
                    <div className="space-y-3">
                      <Select label="DESIGNATION" name="designation" value={formData.designation} onChange={handleChange} onBlur={handleBlur} error={getFieldError('designation')} className="h-10">
                        <option value="" disabled>Select designation</option>
                        {DESIGNATION_OPTIONS.map((designation) => (
                          <option key={designation} value={designation}>{designation}</option>
                        ))}
                      </Select>
                      {formData.designation === 'Others' && (
                        <Input
                          placeholder="Please specify your designation"
                          name="customDesignation"
                          value={formData.customDesignation}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={getFieldError('customDesignation')}
                          required
                          className="h-10 animate-in slide-in-from-top-2 duration-300"
                        />
                      )}
                    </div>
                    <div className="space-y-3">
                      <Select label="DEPARTMENT" name="department" value={formData.department} onChange={handleChange} onBlur={handleBlur} error={getFieldError('department')} className="h-10">
                        {DEPARTMENT_OPTIONS.map((department) => (
                          <option key={department} value={department}>{department}</option>
                        ))}
                      </Select>
                      {formData.department === 'Others' && (
                        <Input
                          placeholder="Please specify your department"
                          name="customDepartment"
                          value={formData.customDepartment}
                          onChange={handleChange}
                          onBlur={handleBlur}
                          error={getFieldError('customDepartment')}
                          required
                          className="h-10 animate-in slide-in-from-top-2 duration-300"
                        />
                      )}
                    </div>
                    <Input label="OFFICIAL EMAIL ID" name="email" value={formData.email} onChange={handleChange} onBlur={handleBlur} error={getFieldError('email')} className="h-10" />
                    <Input label="MOBILE NUMBER" name="mobile" value={formData.mobile} onChange={handleChange} onBlur={handleBlur} error={getFieldError('mobile')} required className="h-10" />
                    <Input label="ALTERNATE NUMBER" name="alternateMobile" value={formData.alternateMobile} onChange={handleChange} onBlur={handleBlur} error={getFieldError('alternateMobile')} className="h-10" />
                  </div>
                )}



                {activeSection === 'procurement' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                      <div className="space-y-3">
                        <Select
                          label="PROCUREMENT CATEGORY (Multiple)"
                          name="procurementCategoryPicker"
                          value=""
                          onChange={handleProcurementCategorySelect}
                          error={submitAttempted ? errors.procurementCategories : ''}
                          className="h-10"
                        >
                          <option value="" disabled>Select a category</option>
                          {PROCUREMENT_CATEGORY_OPTIONS.map((cat) => (
                            <option key={cat} value={cat} disabled={formData.procurementCategories.includes(cat)}>
                              {cat}
                            </option>
                          ))}
                        </Select>

                        <div className="flex flex-wrap gap-1.5">
                          {formData.procurementCategories.map((cat: string) => (
                            <span key={cat} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-[11px] font-bold border border-slate-200">
                              {cat}
                              <button type="button" onClick={() => toggleTag('procurementCategories', cat)} className="text-slate-400 hover:text-slate-600">
                                <X className="h-3 w-3" />
                              </button>
                            </span>
                          ))}
                        </div>

                        {formData.procurementCategories.includes('Others') && (
                          <div className="space-y-3 pt-1">
                            <div className="flex gap-2">
                              <Input
                                placeholder="Enter custom category"
                                name="customProcurementCategoryInput"
                                value={formData.customProcurementCategoryInput}
                                onChange={handleChange}
                                className="h-9"
                              />
                              <Button
                                type="button"
                                onClick={addCustomProcurementCategory}
                                className="bg-slate-900 text-white h-9 px-3 rounded-md"
                              >
                                <Plus className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {formData.customProcurementCategories.map((cat: string) => (
                                <span key={cat} className="inline-flex items-center gap-1.5 bg-slate-50 text-[#12335f] px-2.5 py-1 rounded-md text-[10px] font-black uppercase  border border-slate-200">
                                  {cat}
                                  <button type="button" onClick={() => removeCustomProcurementCategory(cat)} className="text-teal-400 hover:text-[#12335f]">
                                    <X className="h-2.5 w-2.5" />
                                  </button>
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="space-y-5">
                        <Select
                          label="ANNUAL PROCUREMENT BUDGET"
                          name="annualBudget"
                          value={formData.annualBudget}
                          onChange={handleChange}
                          error={submitAttempted ? errors.annualBudget : ''}
                          className="h-10"
                        >
                          <option value="">Select Budget Range</option>
                          {ANNUAL_BUDGET_OPTIONS.map(opt => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </Select>

                        <div className="space-y-3">
                          <Select
                            label="PREFERRED PROCUREMENT METHODS (Multiple)"
                            name="preferredMethodPicker"
                            value=""
                            onChange={handleProcurementMethodSelect}
                            error={submitAttempted ? errors.preferredMethods : ''}
                            className="h-10"
                          >
                            <option value="" disabled>Select a method</option>
                            {PROCUREMENT_METHOD_OPTIONS.map((method) => (
                              <option key={method} value={method} disabled={formData.preferredMethods.includes(method)}>
                                {method}
                              </option>
                            ))}
                          </Select>

                          <div className="flex flex-wrap gap-1.5">
                            {formData.preferredMethods.map((method: string) => (
                              <span key={method} className="inline-flex items-center gap-1.5 bg-slate-100 text-slate-700 px-2.5 py-1 rounded-md text-[11px] font-bold border border-slate-200">
                                {method}
                                <button type="button" onClick={() => toggleTag('preferredMethods', method)} className="text-slate-400 hover:text-slate-600">
                                  <X className="h-3 w-3" />
                                </button>
                              </span>
                            ))}
                          </div>

                          {formData.preferredMethods.includes('Others') && (
                            <div className="space-y-3 pt-1">
                              <div className="flex gap-2">
                                <Input
                                  placeholder="Enter custom method"
                                  name="customProcurementMethodInput"
                                  value={formData.customProcurementMethodInput}
                                  onChange={handleChange}
                                  className="h-9"
                                />
                                <Button
                                  type="button"
                                  onClick={addCustomPreferredMethod}
                                  className="bg-slate-900 text-white h-9 px-3 rounded-md"
                                >
                                  <Plus className="h-3.5 w-3.5" />
                                </Button>
                              </div>
                              <div className="flex flex-wrap gap-1.5">
                                {formData.customPreferredMethods.map((method: string) => (
                                  <span key={method} className="inline-flex items-center gap-1.5 bg-indigo-50 text-indigo-700 px-2.5 py-1 rounded-md text-[10px] font-black uppercase  border border-indigo-100">
                                    {method}
                                    <button type="button" onClick={() => removeCustomPreferredMethod(method)} className="text-indigo-400 hover:text-indigo-600">
                                      <X className="h-2.5 w-2.5" />
                                    </button>
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {activeSection === 'docs' && (
                  <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="bg-slate-100 p-3 rounded-lg text-[11px] text-slate-600 mb-4 border border-slate-200">
                      <p className="font-bold mb-1">Required documents for verification:</p>
                      <ul className="list-disc list-inside mb-1 space-y-0.5">
                        {selectedDocs.includes('panCard') && <li>PAN Card of Organization</li>}
                        {selectedDocs.includes('regCert') && <li>Company Registration Certificate (CIN / Partnership Deed / Shop Act / Trust Registration)</li>}
                        {selectedDocs.includes('gstCert') && <li>GST Certificate</li>}
                        {selectedDocs.includes('addressProof') && <li>Address Proof</li>}
                        {selectedDocs.includes('authLetter') && <li>Authorization Letter of Representative</li>}
                      </ul>
                      <p className="font-bold text-[#12335f]">Allowed formats: PDF / JPG / PNG</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { label: 'PAN Card of Organization', field: 'panCard' },
                        { label: 'Company Registration Certificate (CIN / Partnership Deed / Shop Act / Trust Registration)', field: 'regCert' },
                        { label: 'GST Certificate', field: 'gstCert' },
                        { label: 'Address Proof', field: 'addressProof' },
                        { label: 'Authorization Letter of Representative', field: 'authLetter' }
                      ].filter(doc => !isSubmittedOrApproved || hasUploadedDocument(formData.documents?.[doc.field])).map(doc => {
                        const isRequired = selectedDocs.includes(doc.field);
                        const documentFiles = getDocumentFiles(formData.documents?.[doc.field]);
                        const hasFile = documentFiles.length > 0;
                        const isFieldUploading = isUploading === `documents.${doc.field}`;
                        const displayLabel = isRequired ? `${doc.label} (Required)` : `${doc.label} (Optional)`;
                        const isInvalid = submitAttempted && isRequired && !hasFile;

                        return (
                          <div
                            key={doc.field}
                            className={cn(
                              "p-4 rounded-xl border flex flex-col gap-3 transition-all",
                              isInvalid
                                ? "border-red-400 bg-red-50/30"
                                : "border-slate-100 bg-slate-50/50"
                            )}
                          >
                            <div className="flex items-start justify-between">
                              <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{displayLabel}</span>
                              {isRequired && <span className="text-[8px] font-extrabold uppercase text-red-500 tracking-wider">Required</span>}
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              {!isSubmittedOrApproved && (
                                <>
                                  <input type="file" multiple accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleFileUpload(e, `documents.${doc.field}`)} id={`upload-${doc.field}`} className="hidden" />
                                  <label htmlFor={`upload-${doc.field}`} className="cursor-pointer text-[11px] font-bold text-[#12335f] hover:text-[#12335f] underline">
                                    {isFieldUploading ? 'Uploading...' : hasFile ? 'Add Files' : 'Upload Files'}
                                  </label>
                                </>
                              )}
                            </div>
                            {hasFile && (
                              <div className="space-y-2">
                                {documentFiles.map((file: any, fileIndex: number) => (
                                  <div key={`${doc.field}-${file?.fileId || file?.url || fileIndex}`} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                                    <span className="min-w-0 flex-1 truncate text-[11px] font-semibold text-slate-600">
                                      {getDocumentDisplayName(file, doc.label, fileIndex)}
                                    </span>
                                    <div className="flex shrink-0 items-center gap-2">
                                      <button type="button" onClick={() => openDocumentPreview(doc.label, file)} className="text-[11px] font-bold text-[#12335f] hover:underline">
                                        View
                                      </button>
                                      {!isSubmittedOrApproved && (
                                        <button type="button" onClick={() => removeUploadedDocument(doc.field, fileIndex)} className="text-[11px] font-bold text-red-500 hover:underline">
                                          Remove
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeSection === 'account' && (
                  <div className="max-w-2xl space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <div className="space-y-3">
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input type="checkbox" checked={formData.declaration} onChange={(e) => setFormData({ ...formData, declaration: e.target.checked })} className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f]" />
                        <span className="text-xs text-slate-600 font-medium">I confirm that the information provided is accurate.</span>
                      </label>
                      <label className="flex items-start gap-3 cursor-pointer group">
                        <input type="checkbox" checked={formData.agreeTerms} onChange={(e) => setFormData({ ...formData, agreeTerms: e.target.checked })} className="mt-0.5 w-3.5 h-3.5 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f]" />
                        <span className="text-xs text-slate-600 font-medium">I agree to the platform Terms & Conditions.</span>
                      </label>
                    </div>
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                      <p className="text-xs font-black uppercase tracking-widest text-slate-500">Verification Required via OTP</p>
                      <p className="mt-2 text-xs font-semibold text-slate-500">
                        OTP will be sent to your login email: <span className="text-slate-800">{user?.email || 'registered email'}</span>
                      </p>
                      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center">
                        <Button
                          type="button"
                          onClick={handleSendBuyerSubmissionOtp}
                          disabled={isSendingBuyerSubmissionOtp || !formData.declaration || !formData.agreeTerms}
                          className="h-10 rounded-lg bg-[#12335f] px-5 text-xs font-bold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          {isSendingBuyerSubmissionOtp ? 'Sending...' : buyerSubmissionOtpSent ? 'Resend OTP' : 'Send OTP'}
                        </Button>
                        <input
                          value={buyerSubmissionOtp}
                          onChange={(e) => setBuyerSubmissionOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="Enter 6-digit OTP"
                          className="h-10 w-44 rounded-lg border border-slate-300 px-3 text-center text-xs font-bold tracking-widest text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100"
                        />
                      </div>
                    </div>
                  </div>
                )}
              </fieldset>

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-6 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    const currentIndex = SIDEBAR_SECTIONS.findIndex(s => s.id === activeSection);
                    if (currentIndex > 0) setActiveSection(SIDEBAR_SECTIONS[currentIndex - 1].id);
                  }}
                  className="text-sm font-bold text-slate-400 hover:text-slate-600 flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" />
                  Previous Section
                </button>
                <div className="flex items-center gap-4">
                  <Button type="button" variant="ghost" onClick={saveDraft} disabled={isProfileLocked} className="text-slate-600 font-bold border border-slate-200 px-6 rounded-lg h-10 text-sm">
                    Save Draft
                  </Button>
                  <Button
                    type="submit"
                    disabled={
                      isLoading ||
                      isProfileLocked ||
                      (activeSection === 'account' && (!buyerSubmissionOtpSent || !/^\d{6}$/.test(buyerSubmissionOtp)))
                    }
                    className="bg-[#12335f] hover:bg-[#0b2445] text-white font-bold px-8 rounded-lg h-10 text-sm flex items-center gap-2 disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {isProfileLocked ? 'Locked' : isLoading ? 'Processing...' : activeSection === 'account' ? 'Final Submission' : 'Continue'}
                    <ArrowRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </form>
          </div>
        </div>

        {/* Bottom Footer Notice */}
        <div className="flex items-center justify-center gap-2 py-8 text-slate-400">
          <ShieldCheck className="h-4 w-4" />
          <p className="text-[10px] font-medium tracking-wide">Your information is encrypted and reviewed by our compliance team within 24-48 business hours.</p>
        </div>
      </div>

      <DocumentPreviewModal previewDocument={previewDocument} onClose={() => setPreviewDocument(null)} />
    </div>
  );
}

type SearchableSelectProps = {
  label: string;
  value: string;
  options: string[];
  onChange: (value: string) => void;
  onBlur?: () => void;
  error?: string;
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
};

function SearchableSelect({
  label,
  value,
  options,
  onChange,
  onBlur,
  error,
  placeholder = 'Select an option',
  required,
  disabled
}: SearchableSelectProps) {
  const id = React.useId();
  const containerRef = React.useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState('');
  const [highlightedIndex, setHighlightedIndex] = React.useState(0);

  const filteredOptions = React.useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return options;
    return options.filter(option => option.toLowerCase().includes(normalizedQuery));
  }, [options, query]);

  React.useEffect(() => {
    setHighlightedIndex(0);
  }, [query]);

  React.useEffect(() => {
    const handlePointerDown = (event: MouseEvent) => {
      if (!containerRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery('');
        onBlur?.();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [onBlur]);

  const selectOption = (option: string) => {
    onChange(option);
    setIsOpen(false);
    setQuery('');
    onBlur?.();
  };

  const clearSelection = () => {
    onChange('');
    setQuery('');
    setIsOpen(false);
    onBlur?.();
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (disabled) return;

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setIsOpen(true);
      setHighlightedIndex(current => Math.min(current + 1, Math.max(filteredOptions.length - 1, 0)));
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setHighlightedIndex(current => Math.max(current - 1, 0));
    }

    if (event.key === 'Enter') {
      event.preventDefault();
      if (isOpen && filteredOptions[highlightedIndex]) {
        selectOption(filteredOptions[highlightedIndex]);
      }
    }

    if (event.key === 'Escape') {
      setIsOpen(false);
      setQuery('');
    }
  };

  const displayValue = isOpen ? query : value;

  return (
    <div ref={containerRef} className="relative w-full min-w-0 space-y-1.5">
      <label htmlFor={id} className="block break-words text-[11px] font-bold uppercase tracking-wide text-slate-500 leading-snug sm:text-xs sm:tracking-wider">
        {label}{required ? ' *' : ''}
      </label>
      <div className="relative">
        <input
          id={id}
          role="combobox"
          aria-expanded={isOpen}
          aria-controls={`${id}-options`}
          aria-autocomplete="list"
          disabled={disabled}
          value={displayValue}
          onFocus={() => {
            setIsOpen(true);
            setQuery('');
          }}
          onChange={(event) => {
            setQuery(event.target.value);
            setIsOpen(true);
          }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className={cn(
            'flex h-12 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-100/50 px-3 py-2 pr-16 text-xs ring-offset-white placeholder:text-slate-400 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 disabled:cursor-not-allowed disabled:opacity-50 sm:text-xs',
            error && 'border-red-500 bg-red-50/30 focus-visible:ring-red-500'
          )}
        />
        {value && !disabled && (
          <button
            type="button"
            aria-label="Clear industry selection"
            onClick={clearSelection}
            className="absolute right-9 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:text-slate-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
        <button
          type="button"
          aria-label="Toggle industry options"
          disabled={disabled}
          onClick={() => {
            setIsOpen(open => !open);
            setQuery('');
          }}
          className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded text-slate-400 transition-colors hover:bg-slate-200 hover:text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span className={cn('text-[10px] transition-transform', isOpen && 'rotate-180')}>v</span>
        </button>
      </div>
      {isOpen && !disabled && (
        <div
          id={`${id}-options`}
          role="listbox"
          className="absolute z-40 mt-1 max-h-60 w-full overflow-auto rounded-lg border border-slate-200 bg-white py-1 text-xs shadow-lg"
        >
          {filteredOptions.length > 0 ? filteredOptions.map((option, index) => (
            <button
              key={option}
              type="button"
              role="option"
              aria-selected={value === option}
              onMouseEnter={() => setHighlightedIndex(index)}
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => selectOption(option)}
              className={cn(
                'block w-full px-3 py-2 text-left font-semibold text-slate-700 transition-colors',
                highlightedIndex === index && 'bg-indigo-50 text-indigo-700',
                value === option && 'bg-slate-50 text-[#12335f]'
              )}
            >
              {option}
            </button>
          )) : (
            <div className="px-3 py-3 text-slate-400">No matching industry found</div>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
