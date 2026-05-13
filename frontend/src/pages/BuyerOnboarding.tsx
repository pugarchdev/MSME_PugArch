import React, { useState, useEffect } from 'react';
import { api } from '../lib/api';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/input';
import { Card, CardContent, Badge } from '../components/ui/card';
import { Stepper, Step } from '../components/ui/stepper';
import { toast } from 'sonner';
import { ArrowLeft, ArrowRight, Save, Upload, CheckCircle2, AlertTriangle, Clock, ShieldCheck, X, ExternalLink, Plus, MapPin } from 'lucide-react';
import { cn } from '../lib/utils';
import { validateField, FieldType } from '../lib/validation';


const SIDEBAR_SECTIONS = [
  { id: 'org', label: 'Organisation Details' },
  { id: 'rep', label: 'Authorized Representative' },
  { id: 'procurement', label: 'Procurement Profile' },
  { id: 'docs', label: 'Document Upload' },
  { id: 'account', label: 'Account Setup' },
];

const DEPARTMENT_OPTIONS = ['Procurement', 'Finance', 'Admin', 'Operations', 'Management', 'Others'];
const PROCUREMENT_CATEGORY_OPTIONS = ['IT Equipment', 'Office Supplies', 'Machinery', 'Services', 'Construction', 'Consulting', 'Others'];
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

const getDocumentPreviewUrl = (url: string) => {
  if (!url) return url;

  const lowerUrl = url.toLowerCase();
  if (lowerUrl.includes('.png') || lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg') || lowerUrl.includes('.gif') || lowerUrl.includes('.webp') || lowerUrl.includes('.pdf')) {
    return url;
  }

  return `https://docs.google.com/gview?embedded=1&url=${encodeURIComponent(url)}`;
};

const getOfficePreviewUrl = (url: string) =>
  `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(url)}`;

const getDocumentExtension = (url: string) => {
  const cleanedUrl = url.split('?')[0].toLowerCase();
  const match = cleanedUrl.match(/\.([a-z0-9]+)$/);
  return match?.[1] || '';
};

const getDocumentPreviewMode = (url: string) => {
  const extension = getDocumentExtension(url);

  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(extension)) return 'image';
  if (extension === 'pdf') return 'pdf';
  if (['doc', 'docx', 'ppt', 'pptx', 'xls', 'xlsx'].includes(extension)) return 'office';
  return 'google';
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
  department: 'Procurement',
  customDepartment: '',
  email: '',
  mobile: '',
  alternateMobile: '',

  // Address Details
  country: 'India',
  state: '',
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
  password: '',
  confirmPassword: '',
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
  const profileDepartment = data?.profile?.department || '';
  const hasPresetDepartment = DEPARTMENT_OPTIONS.includes(profileDepartment) && profileDepartment !== 'Others';
  const draftDepartment = storedDraft?.formData?.department || '';
  const hasDraftPresetDepartment = DEPARTMENT_OPTIONS.includes(draftDepartment) && draftDepartment !== 'Others';

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
    email: storedDraft?.formData?.email || data?.user?.email || fallback.email,
    organizationName: data?.profile?.organizationName || regDetails.businessName || data?.user?.name || fallback.organizationName,
    mobile: data?.profile?.mobile || data?.user?.mobile || fallback.mobile,
    representativeName: data?.profile?.representativeName || data?.user?.name || fallback.representativeName,
    officeZoneName: data?.profile?.officeZoneName || regDetails.officeZoneName || fallback.officeZoneName,
    aadhaarNumber: data?.profile?.aadhaarNumber || regDetails.aadhaarNumber || fallback.aadhaarNumber,
    aadhaarVerified: data?.profile?.aadhaarVerified || regDetails.isAadhaarVerified || fallback.aadhaarVerified,
    
    state: cleanPlaceholder(data?.profile?.state) || regDetails.state || fallback.state,
    district: cleanPlaceholder(data?.profile?.district) || regDetails.district || fallback.district,
    city: cleanPlaceholder(storedDraft?.formData?.city || data?.profile?.city || fallback.city),
    pincode: cleanPlaceholder(storedDraft?.formData?.pincode || data?.profile?.pincode || fallback.pincode),
    registeredAddress: cleanPlaceholder(storedDraft?.formData?.registeredAddress || data?.profile?.registeredAddress || fallback.registeredAddress),
  };
};

export default function BuyerOnboarding() {
  const { user } = useAuth();
  const location = useLocation();
  const authHeaders = { headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` } };
  const cachedProfile = api.peek('/api/auth/me', authHeaders);
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
  const [previewDocument, setPreviewDocument] = useState<{ label: string; url: string; mode: 'image' | 'pdf' | 'office' | 'google' } | null>(null);
  const [isFetchingGst, setIsFetchingGst] = useState(false);
  const activeGstinLookupRef = React.useRef('');
  const lastFetchedGstinRef = React.useRef('');
  const gstFetchedFieldsRef = React.useRef<Record<string, string>>({});
  const navigate = useNavigate();

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const section = params.get('section');
    const mappedSection = section ? DASHBOARD_SECTION_TO_BUYER_SECTION[section] : null;
    if (mappedSection) {
      setActiveSection(mappedSection);
    }
  }, [location.search]);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        const res = await api.fetch('/api/auth/me', authHeaders);
        const data = await res.json();
        const profileLocked = data.user?.onboardingStatus === 'approved_for_procurement' && false; // Force unlock as requested
        setIsProfileLocked(profileLocked);
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
      cleared.state = '';
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
        setFormData((prev: any) => ({
          ...prev,
          organizationName: data.legalName?.trim() || prev.organizationName,
          registeredAddress: data.address?.trim() || prev.registeredAddress,
          state: data.state?.trim() || prev.state,
          city: data.city?.trim() || prev.city,
          pincode: String(data.pincode || '').replace(/\D/g, '').slice(0, 6) || prev.pincode,
          pan: data.pan || prev.pan,
        }));
        if (data.partial) {
          toast.message(data.message || 'Partial GST details applied. Please verify manually.');
        } else {
          toast.success(`GST verified: ${data.status || 'Status available'}`);
        }
      } else {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.message || 'Could not fetch GST details. Please enter manually.');
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
      state: 'State is required',
      city: 'City is required',
      registeredAddress: 'Registered office address is required',
      password: 'Password is required',
      confirmPassword: 'Confirm password is required'
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
    const file = e.target.files?.[0];
    if (!file) return;

    // 10MB limit
    if (file.size > 10 * 1024 * 1024) {
      toast.error('File is too large. Max limit is 10MB.');
      e.target.value = '';
      return;
    }

    console.log(`--- Starting upload for ${fieldName}: ${file.name} (${file.size} bytes) ---`);
    setIsUploading(fieldName);
    const formDataUpload = new FormData();
    formDataUpload.append('file', file);

    try {
      const res = await api.fetch('/api/upload', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: formDataUpload
      });

      if (res.ok) {
        const data = await res.json();
        const fieldPath = fieldName.split('.');
        if (fieldPath.length > 1) {
          setFormData({
            ...formData,
            [fieldPath[0]]: {
              ...formData[fieldPath[0]],
              [fieldPath[1]]: data.url
            }
          });
        } else {
          setFormData({ ...formData, [fieldName]: data.url });
        }
        toast.success('Document uploaded successfully');
      } else {
        const errData = await res.json();
        console.error('Upload failed:', errData);
        toast.error(errData.message || 'Upload failed');
      }
    } catch (err: any) {
      console.error('Upload error:', err);
      toast.error(`Upload error: ${err.message || 'Check network'}`);
    } finally {
      setIsUploading(null);
      // Reset the file input so the same file can be selected again if needed
      e.target.value = '';
    }
  };

  const validateSection = (sectionId: string) => {
    if (sectionId === 'procurement') {
      const validCats = (formData.procurementCategories.filter((cat: string) => cat !== 'Others').length > 0 || formData.customProcurementCategories.length > 0);
      const validBudget = !!formData.annualBudget;
      const validMethods = formData.preferredMethods.length > 0;
      setErrors(prev => ({
        ...prev,
        procurementCategories: validCats ? '' : 'Required: select category',
        annualBudget: validBudget ? '' : 'Required: select budget',
        preferredMethods: validMethods ? '' : 'Required: select method'
      }));
      return validCats && validBudget && validMethods;
    }
    if (sectionId === 'docs') {
      const hasPan = !!formData.documents?.panCard;
      const hasReg = !!formData.documents?.regCert;
      const hasAddr = !!formData.documents?.addressProof;
      setErrors(prev => ({
        ...prev,
        'docs.panCard': hasPan ? '' : 'Required',
        'docs.regCert': hasReg ? '' : 'Required',
        'docs.addressProof': hasAddr ? '' : 'Required'
      }));
      return hasPan && hasReg && hasAddr;
    }

    let fields: string[] = [];
    if (sectionId === 'org') fields = ['organizationName', 'businessType', 'industry', 'cin', 'pan', 'gst', 'website', 'state', 'city', 'pincode', 'registeredAddress'];
    if (sectionId === 'rep') fields = ['representativeName', 'email', 'mobile'];

    if (sectionId === 'account') fields = ['password', 'confirmPassword'];

    let isValid = true;
    setTouched(prev => fields.reduce((acc, field) => ({ ...acc, [field]: true }), { ...prev }));
    fields.forEach(field => {
      if (['cin', 'gst'].includes(field) && !String(formData[field] || '').trim()) {
        setErrors(prev => ({ ...prev, [field]: '' }));
        return;
      }
      const isFieldValid = field === 'website'
        ? validateWebsite(formData[field] || '')
        : validate(field, formData[field] || '');
      if (!isFieldValid) isValid = false;
    });

    return isValid;
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
      return (
        hasValue(formData.representativeName) &&
        hasValue(formData.designation) &&
        hasValue(departmentValue) &&
        !validateField('email', formData.email || '') &&
        !validateField('mobile', formData.mobile || '')
      );
    }

    if (sectionId === 'address') {
      return (
        hasValue(formData.country) &&
        hasValue(formData.state) &&
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
      return (
        hasValue(formData.documents?.panCard) &&
        hasValue(formData.documents?.regCert) &&
        hasValue(formData.documents?.addressProof)
      );
    }

    if (sectionId === 'account') {
      return (
        hasValue(formData.password) &&
        hasValue(formData.confirmPassword) &&
        formData.password === formData.confirmPassword &&
        Boolean(formData.declaration) &&
        Boolean(formData.agreeTerms)
      );
    }

    return false;
  };

  const completedSectionCount = SIDEBAR_SECTIONS.filter(section => getSectionCompletion(section.id)).length;
  const complianceProgress = Math.round((completedSectionCount / SIDEBAR_SECTIONS.length) * 100);

  const openDocumentPreview = (label: string, url: string) => {
    setPreviewDocument({
      label,
      url,
      mode: getDocumentPreviewMode(url) as 'image' | 'pdf' | 'office' | 'google'
    });
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
      if (!validateSection('account')) return;
      if (formData.password !== formData.confirmPassword) {
        toast.error('Passwords do not match');
        return;
      }
      if (!formData.declaration || !formData.agreeTerms) {
        toast.error('Please accept both declarations');
        return;
      }

      setIsLoading(true);
      try {
        const normalizedProcurementCategories = formData.procurementCategories.filter((category: string) => category !== 'Others');
        const normalizedPreferredMethods = formData.preferredMethods.filter((method: string) => method !== 'Others');
        const submissionData = {
          ...formData,
          department: formData.department === 'Others' ? formData.customDepartment.trim() || 'Others' : formData.department,
          procurementCategories: [
            ...normalizedProcurementCategories,
            ...formData.customProcurementCategories
          ],
          otherCategoryDetails: formData.customProcurementCategories.join(', '),
          preferredMethods: [
            ...normalizedPreferredMethods,
            ...formData.customPreferredMethods
          ],
          otherMethodDetails: formData.customPreferredMethods.join(', ')
        };

        const res = await api.post('/api/buyer/register', submissionData, {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('token')}`
          }
        });

        if (res.ok) {
          localStorage.removeItem(BUYER_ONBOARDING_DRAFT_KEY);
          toast.success('Registration finished successfully');
          navigate('/dashboard');
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
      if (validateSection(activeSection)) {
        setSubmitAttempted(false);
        setActiveSection(SIDEBAR_SECTIONS[currentIndex + 1].id);
      } else {
        toast.error('Please fix validation errors');
      }
    }
  };

  if (isFetching) return <div className="buyer-font flex min-h-dvh items-center justify-center px-4 text-center font-bold  text-indigo-600">Loading form...</div>;

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
                  setActiveSection(section.id);
                }}
                className={cn(
                  "flex items-center gap-2 px-3 sm:px-5 py-2 sm:py-2.5 rounded-full text-[10px] sm:text-xs font-bold transition-all whitespace-nowrap border",
                  isActive
                    ? "bg-slate-50 text-[#12335f] border-slate-200 shadow-sm"
                    : isCompleted
                      ? "bg-white text-slate-900 border-slate-200 shadow-sm"
                      : "bg-transparent text-slate-400 border-transparent hover:text-slate-600"
                )}
              >
                <span className={cn(
                  "w-5 h-5 rounded-full flex items-center justify-center text-[10px]",
                  isActive ? "bg-[#12335f] text-white" : "bg-slate-100 text-slate-500"
                )}>
                  {idx + 1}
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
                          'Secure your account with a password.'}
              </p>
              {user?.onboardingStatus === 'approved_for_procurement' && (
                <p className="mt-2 inline-flex rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[9px] font-black uppercase tracking-widest text-blue-700 animate-pulse">
Approved Profile: Unlocked for Manual Updates
                </p>
              )}
            </div>

            <form onSubmit={handleSubmit} onKeyDown={handleFormKeyDown} className="space-y-6">
              <fieldset disabled={isProfileLocked} className={cn("min-h-[400px]", isProfileLocked && "opacity-70")}>
                {/* Section Content */}
                {activeSection === 'org' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Input label="Organization / Company Name" name="organizationName" value={formData.organizationName} onChange={handleChange} onBlur={handleBlur} error={getFieldError('organizationName')} required className="h-10" />
                    <Select label="Business Type" name="businessType" value={formData.businessType} onChange={handleChange} onBlur={handleBlur} error={getFieldError('businessType')} required className="h-10">
                      <option value="Private Limited Company">Private Limited Company</option>
                      <option value="Public Limited Company">Public Limited Company</option>
                      <option value="Partnership Firm">Partnership Firm</option>
                      <option value="LLP">LLP</option>
                      <option value="Proprietorship">Proprietorship</option>
                      <option value="Startup">Startup</option>
                      <option value="NGO / Trust">NGO / Trust</option>
                      <option value="Educational Institution">Educational Institution</option>
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
                    <Input label="STATE" name="state" value={formData.state} onChange={handleChange} onBlur={handleBlur} error={getFieldError('state')} required className="h-10" />
                    <Input label="CITY" name="city" value={formData.city} onChange={handleChange} onBlur={handleBlur} error={getFieldError('city')} required className="h-10" />
                    <Input label="PIN CODE" name="pincode" value={formData.pincode} onChange={handleChange} onBlur={handleBlur} error={getFieldError('pincode')} required className="h-10" />
                    <div className="md:col-span-2">
                      <Input label="REGISTERED OFFICE ADDRESS" name="registeredAddress" value={formData.registeredAddress} onChange={handleChange} onBlur={handleBlur} error={getFieldError('registeredAddress')} required className="h-10" />
                    </div>
                    <div className="md:col-span-2">
                      <Input label="CORPORATE OFFICE ADDRESS (Optional - if different)" name="corporateAddress" value={formData.corporateAddress} onChange={handleChange} onBlur={handleBlur} placeholder="Enter corporate address if different from registered address" className="h-10" />
                    </div>
                  </div>
                )}

                {activeSection === 'rep' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Input label="FULL NAME" name="representativeName" value={formData.representativeName} onChange={handleChange} onBlur={handleBlur} error={getFieldError('representativeName')} required className="h-10" />
                    <Input label="DESIGNATION" name="designation" value={formData.designation} onChange={handleChange} placeholder="e.g. Director" className="h-10" />
                    <div className="space-y-3">
                      <Select label="DEPARTMENT" name="department" value={formData.department} onChange={handleChange} className="h-10">
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
                          required
                          className="h-10 animate-in slide-in-from-top-2 duration-300"
                        />
                      )}
                    </div>
                    <Input label="OFFICIAL EMAIL ID" name="email" value={formData.email} onChange={handleChange} className="h-10" />
                    <Input label="MOBILE NUMBER" name="mobile" value={formData.mobile} onChange={handleChange} onBlur={handleBlur} error={getFieldError('mobile')} required className="h-10" />
                    <Input label="ALTERNATE NUMBER" name="alternateMobile" value={formData.alternateMobile} onChange={handleChange} className="h-10" />
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
                        <li>PAN Card of Organization</li>
                        <li>Company Registration Certificate (CIN / Partnership Deed / Shop Act / Trust Registration)</li>
                        <li>GST Certificate (if applicable)</li>
                        <li>Address Proof</li>
                        <li>Authorization Letter of Representative (Optional)</li>
                      </ul>
                      <p className="font-bold text-[#12335f]">Allowed formats: PDF / JPG / PNG</p>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {[
                        { label: 'PAN Card of Organization', field: 'panCard' },
                        { label: 'Company Registration Certificate (CIN / Partnership Deed / Shop Act / Trust Registration)', field: 'regCert' },
                        { label: 'GST Certificate (if applicable)', field: 'gstCert' },
                        { label: 'Address Proof', field: 'addressProof' },
                        { label: 'Authorization Letter of Representative (Optional)', field: 'authLetter' }
                      ].map(doc => (
                        <div 
                          key={doc.field} 
                          className={cn(
                            "p-4 rounded-xl border flex flex-col gap-3 transition-all",
                            submitAttempted && !formData.documents[doc.field] && ['panCard', 'regCert', 'addressProof'].includes(doc.field) 
                              ? "border-red-400 bg-red-50/30" 
                              : "border-slate-100 bg-slate-50/50"
                          )}
                        >
                          <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">{doc.label}</span>
                          <div className="flex items-center justify-between gap-3">
                            <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={(e) => handleFileUpload(e, `documents.${doc.field}`)} id={`upload-${doc.field}`} className="hidden" />
                            <label htmlFor={`upload-${doc.field}`} className="cursor-pointer text-[11px] font-bold text-[#12335f] hover:text-[#12335f] underline">
                              {isUploading === `documents.${doc.field}` ? 'Uploading...' : formData.documents[doc.field] ? 'Change File' : 'Upload File'}
                            </label>
                            {formData.documents[doc.field] && (
                              <button type="button" onClick={() => openDocumentPreview(doc.label, formData.documents[doc.field])} className="text-[11px] font-bold text-slate-500 hover:text-slate-700">
                                View
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {activeSection === 'account' && (
                  <div className="max-w-md space-y-5 animate-in fade-in slide-in-from-bottom-4 duration-500">
                    <Input label="PASSWORD" name="password" type="password" value={formData.password} onChange={handleChange} onBlur={handleBlur} error={getFieldError('password')} className="h-10" />
                    <Input label="CONFIRM PASSWORD" name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} onBlur={handleBlur} error={getFieldError('confirmPassword')} className="h-10" />
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
                  <Button type="submit" disabled={isLoading || isProfileLocked} className="bg-[#12335f] hover:bg-[#0b2445] text-white font-bold px-8 rounded-lg h-10 text-sm flex items-center gap-2">
                    {isProfileLocked ? 'Locked' : isLoading ? 'Processing...' : activeSection === 'account' ? 'Finish Registration' : 'Continue'}
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

      {previewDocument && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-3 backdrop-blur-sm sm:p-4">
          <div className="flex h-[88vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:rounded-[2rem]">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3 sm:px-6 sm:py-4">
              <div className="min-w-0">
                <h3 className="truncate text-sm font-black uppercase text-slate-900  sm:text-lg">{previewDocument.label}</h3>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Document Preview</p>
              </div>
              <div className="flex shrink-0 items-center gap-2 sm:gap-3">
                <a
                  href={previewDocument.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hidden h-10 items-center justify-center rounded-xl border border-slate-200 px-4 text-[10px] font-black uppercase  text-slate-600 transition-all hover:bg-slate-50 sm:inline-flex"
                >
                  Open Original
                </a>
                <button
                  type="button"
                  onClick={() => setPreviewDocument(null)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 text-slate-500 transition-all hover:bg-slate-50"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div className="flex-1 bg-slate-100">
              {previewDocument.mode === 'image' && (
                <div className="flex h-full items-center justify-center p-4">
                  <img
                    src={previewDocument.url}
                    alt={previewDocument.label}
                    className="max-h-full max-w-full rounded-2xl bg-white object-contain shadow-lg"
                  />
                </div>
              )}
              {previewDocument.mode === 'pdf' && (
                <iframe
                  src={previewDocument.url}
                  title={previewDocument.label}
                  className="h-full w-full"
                />
              )}
              {previewDocument.mode === 'office' && (
                <iframe
                  src={getOfficePreviewUrl(previewDocument.url)}
                  title={previewDocument.label}
                  className="h-full w-full"
                />
              )}
              {previewDocument.mode === 'google' && (
                <iframe
                  src={getDocumentPreviewUrl(previewDocument.url)}
                  title={previewDocument.label}
                  className="h-full w-full"
                />
              )}
            </div>
          </div>
        </div>
      )}
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
