import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { openFileAsset } from '../lib/files';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/ui/button';
import { Input, Select } from '../components/ui/input';
import { Card, CardContent } from '../components/ui/card';
import { toast } from 'sonner';
import { Save, Plus, Trash2, ShieldCheck, Loader2, Info, CheckCircle2, ArrowUpDown, FileText, UploadCloud, AlertCircle, ExternalLink, Clock } from 'lucide-react';
import { GeMSellerSidebar } from '../components/GeMSellerSidebar';
import { GeMProfileHeader } from '../components/GeMProfileHeader';
import { indiaStates, indiaStatesDistricts } from '../data/indiaStatesDistricts';
import { MSME_TYPES, VENDOR_TYPES, REGISTRATION_TYPES } from '../constants/dropdowns';
import { cn } from '../lib/utils';

const toDateInputValue = (value: unknown) => {
  if (!value) return '';
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? '' : parsed.toISOString().split('T')[0];
};

const SUBMITTED_REVIEW_STATUSES = new Set([
  'under_compliance_review',
  'pending_validation',
  'manual_review_required',
  'approved_for_procurement'
]);

const hasSubmittedApplication = (userRecord: any) => userRecord?.sectionStatus?.submitted === true;

const shouldShowSubmissionOverlay = (userRecord: any) =>
  hasSubmittedApplication(userRecord) && SUBMITTED_REVIEW_STATUSES.has(String(userRecord?.onboardingStatus || ''));

const shouldLockSellerProfile = (userRecord: any) => {
  const status = String(userRecord?.onboardingStatus || '');
  if (status === 'approved_for_procurement') return true;
  return hasSubmittedApplication(userRecord) && SUBMITTED_REVIEW_STATUSES.has(status);
};

const SELLER_SAVED_SECTIONS_KEY_PREFIX = 'seller-onboarding-saved-sections';
const SELLER_ONBOARDING_SECTIONS = ['pan', 'details', 'additional', 'offices', 'bank', 'einvoicing', 'ownership', 'documents'];

const normalizeSavedSections = (value: unknown) =>
  Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];

const hasItems = (value: unknown) => Array.isArray(value) && value.length > 0;
const bankAccountDisplay = (bank: any) =>
  bank?.accountNumberMasked || bank?.maskedAccountNumber || bank?.accountNumber || bank?.bankAccountNumber || '-';
const ACCOUNT_SETTINGS_ITEMS = [
  { id: 'sellerProfile', label: 'Seller Profile' },
  { id: 'updateAadhaar', label: 'Update Aadhaar' },
  { id: 'changePassword', label: 'Change Password' },
  { id: 'changeEmail', label: 'Change Email' },
  { id: 'closeAccount', label: 'Close Account' }
];

const isCompletedSectionStatus = (status: unknown) =>
  status === 'completed' || status === 'approved';

const completedSellerSectionsFromStatus = (sectionStatus: unknown) => {
  if (!sectionStatus || typeof sectionStatus !== 'object' || Array.isArray(sectionStatus)) return [];
  const statusMap = sectionStatus as Record<string, unknown>;
  return SELLER_ONBOARDING_SECTIONS.filter(section => isCompletedSectionStatus(statusMap[section]));
};

const completedSellerSectionsFromUser = (userRecord: any) => {
  if (String(userRecord?.onboardingStatus || '') === 'approved_for_procurement') {
    return SELLER_ONBOARDING_SECTIONS;
  }
  return completedSellerSectionsFromStatus(userRecord?.sectionStatus);
};

const inferCompletedSellerSections = (profile: any) => {
  const completed = new Set<string>();
  if (profile?.panVerified) completed.add('pan');
  if (profile?.detailsUpdated) completed.add('details');
  if (profile?.isStartup || profile?.isUdyamCertified || profile?.participateInBid || profile?.msmeType || profile?.vendorType) completed.add('additional');
  if (hasItems(profile?.offices)) completed.add('offices');
  if (hasItems(profile?.bankAccounts)) completed.add('bank');
  if (profile?.turnoverMax3Yrs || profile?.eInvoicingExcluded === true) completed.add('einvoicing');
  if (profile?.ownershipDeclarationAccepted || profile?.ownershipVerified) completed.add('ownership');
  return Array.from(completed);
};

export default function SellerOnboarding() {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const getAuthHeaders = () => ({ Authorization: `Bearer ${localStorage.getItem('token') || ''}` });

  const cachedMe = api.peek('/api/auth/me', { headers: getAuthHeaders() });
  const cachedProfile = cachedMe?.profile || {};
  const cachedRegDetails = cachedMe?.user?.registrationDetails || {};
  const router = useRouter();
  const sectionParam = searchParams?.get('section');

  const [currentSection, setCurrentSection] = useState(sectionParam || 'pan');
  const isAccountSettings = ['sellerProfile', 'updateAadhaar', 'changePassword', 'changeEmail', 'closeAccount'].includes(currentSection);
  const [bankTab, setBankTab] = useState<'manage' | 'add'>('manage');
  const [officeTab, setOfficeTab] = useState<'manage' | 'add'>('manage');
  const [officeSortKey, setOfficeSortKey] = useState<'name' | 'address' | 'gst'>('name');
  const [bankSortKey, setBankSortKey] = useState<'ifsc' | 'bankName' | 'accountNumber' | 'holderName' | 'pfms' | 'primary'>('bankName');
  const [isLoading, setIsLoading] = useState(false);
  const [isFetching, setIsFetching] = useState(!cachedMe);
  const initialSavedSections = Array.from(new Set([
    ...inferCompletedSellerSections(cachedProfile),
    ...completedSellerSectionsFromUser(cachedMe?.user)
  ]));
  const [savedSections, setSavedSections] = useState<string[]>(initialSavedSections);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const cachedStatus = cachedMe?.user?.onboardingStatus;
  const [onboardingStatus, setOnboardingStatus] = useState(cachedStatus || 'pending');
  const [isProfileLocked, setIsProfileLocked] = useState(shouldLockSellerProfile(cachedMe?.user));
  const [showSuccessOverlay, setShowSuccessOverlay] = useState(shouldShowSubmissionOverlay(cachedMe?.user));
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
  const [officeErrors, setOfficeErrors] = useState<Record<string, string>>({});
  const officeDistrictOptions = officeForm.state ? indiaStatesDistricts[officeForm.state] || [] : [];

  const validateOfficeForm = (candidate = officeForm) => {
    const errors: Record<string, string> = {};
    const pincodeRegex = /^\d{6}$/;
    const contactRegex = /^\d{10}$/;

    if (!candidate.name.trim()) errors.name = 'Office name is required.';
    if (!candidate.type || candidate.type === 'Select type of address') errors.type = 'Type of office is required.';
    
    if (!candidate.pincode.trim()) errors.pincode = 'Pincode is required.';
    else if (!pincodeRegex.test(candidate.pincode.trim())) errors.pincode = 'Enter a valid 6-digit pincode.';

    if (!candidate.state) errors.state = 'State is required.';
    if (!candidate.city) errors.city = 'Town/City/District is required.';
    if (!candidate.flat.trim()) errors.flat = 'Flat/Door/Block No is required.';
    if (!candidate.area.trim()) errors.area = 'Area/Locality is required.';

    if (!candidate.contact.trim()) errors.contact = 'Contact number is required.';
    else if (!contactRegex.test(candidate.contact.trim())) errors.contact = 'Enter a valid 10-digit contact number.';

    return { errors, isValid: Object.keys(errors).length === 0 };
  };

  const updateOfficeForm = (field: keyof typeof officeForm, value: string) => {
    const next = { ...officeForm, [field]: value };
    setOfficeForm(next);
    setOfficeErrors(validateOfficeForm(next).errors);
  };
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
  const [additionalErrors, setAdditionalErrors] = useState<Record<string, string>>({});
  const [ownershipOtp, setOwnershipOtp] = useState('');
  const [ownershipOtpSent, setOwnershipOtpSent] = useState(false);
  const [isSendingOwnershipOtp, setIsSendingOwnershipOtp] = useState(false);
  
  const [aadhaarData, setAadhaarData] = useState({ number: '', mobile: '', consent: false });
  const [emailData, setEmailData] = useState({ newEmail: '', verifyEmail: '' });
  const [regDetails, setRegDetails] = useState<any>(cachedRegDetails);
  const [sellerDocuments, setSellerDocuments] = useState<any[]>(cachedProfile.sellerDocuments || []);
  const [isUploadingMap, setIsUploadingMap] = useState<Record<string, boolean>>({});
  const savedSectionsStorageKey = `${SELLER_SAVED_SECTIONS_KEY_PREFIX}:${user?.id || user?.email || 'current'}`;

  const validateAdditionalForm = (candidate = formData) => {
    const errors: Record<string, string> = {};
    if (candidate.isStartup !== true && candidate.isStartup !== false) {
      errors.isStartup = 'Are you registered with DPIIT as Startup? (Please select Yes or No)';
    }
    if (candidate.isUdyamCertified !== true && candidate.isUdyamCertified !== false) {
      errors.isUdyamCertified = 'Do you have Udyam Registration certified by MSME? (Please select Yes or No)';
    }
    if (candidate.participateInBid !== true && candidate.participateInBid !== false) {
      errors.participateInBid = 'Do you want to participate in Bid? (Please select Yes or No)';
    }
    if (!candidate.msmeType) {
      errors.msmeType = 'Please select MSME Type';
    }
    if (!candidate.vendorType) {
      errors.vendorType = 'Please select Vendor Type';
    }
    return { errors, isValid: Object.keys(errors).length === 0 };
  };

  const sellerFormDefaults = {
    organizationType: 'Proprietorship',
    pan: '',
    nameAsInPan: '',
    dateAsInPan: '',
    panVerified: false,
    
    businessName: '',
    dateOfIncorporation: '',
    detailsUpdated: false,
    
    isStartup: null,
    isUdyamCertified: null,
    participateInBid: null,
    
    turnoverMax3Yrs: '',
    eInvoicingExcluded: false,
    
    ownershipDeclarationAccepted: false,
    ownershipVerified: false,
    
    offices: [],
    bankAccounts: [],
    mobile: '',
    dob: '',
    roleInOrg: '',
    msmeType: '',
    vendorType: '',
    registrationTypes: []
  };

  const normalizeList = (value: unknown) => Array.isArray(value) ? value : [];
  
  const initialAdditionalSaved = cachedMe?.user?.sectionStatus?.additional === 'completed' || cachedMe?.user?.sectionStatus?.additional === 'approved';

  const [formData, setFormData] = useState<any>({
    ...sellerFormDefaults,
    ...cachedProfile,
    organizationType: cachedProfile.organizationType || cachedRegDetails.businessType || 'Proprietorship',
    businessName: cachedProfile.businessName || cachedRegDetails.businessName || cachedMe?.user?.name || '',
    nameAsInPan: cachedProfile.nameAsInPan || cachedRegDetails.businessName || cachedMe?.user?.name || '',
    dateAsInPan: toDateInputValue(cachedProfile.dateAsInPan),
    dateOfIncorporation: toDateInputValue(cachedProfile.dateOfIncorporation),
    mobile: cachedProfile.mobile || cachedMe?.user?.mobile || '',
    dob: toDateInputValue(cachedProfile.dob) || toDateInputValue(cachedMe?.user?.dob),
    roleInOrg: cachedProfile.roleInOrg || cachedRegDetails.roleInOrg || '',
    pan: cachedProfile.pan || cachedRegDetails.pan || '',
    offices: normalizeList(cachedProfile.offices),
    bankAccounts: normalizeList(cachedProfile.bankAccounts),
    isStartup: initialAdditionalSaved ? (cachedProfile.isStartup ?? null) : null,
    isUdyamCertified: initialAdditionalSaved ? (cachedProfile.isUdyamCertified ?? null) : null,
    participateInBid: initialAdditionalSaved ? (cachedProfile.participateInBid ?? null) : null,
    msmeType: cachedProfile.msmeType || '',
    vendorType: cachedProfile.vendorType || '',
    registrationTypes: Array.isArray(cachedProfile.registrationTypes) ? cachedProfile.registrationTypes : []
  });

  const getRequiredDocuments = useCallback(() => {
    const required: { id: string; label: string }[] = [
      { id: 'pan_copy', label: 'PAN Card Copy' },
      { id: 'bank_passbook', label: 'Bank Passbook / Cancelled Cheque' },
      { id: 'address_proof', label: 'Address Proof' }
    ];

    if (formData.isUdyamCertified || regDetails.udyamNumber) {
      required.push({ id: 'udyam_certificate', label: 'Udyam Certificate' });
    }

    const hasGstin = regDetails.gstin || formData.offices?.some((o: any) => o.gst);
    if (hasGstin) {
      required.push({ id: 'gst_certificate', label: 'GST Certificate' });
    }

    if (regDetails.verificationMethod === 'Aadhaar' || regDetails.aadhaarNumber) {
      required.push({ id: 'aadhaar_card', label: 'Aadhaar of Authorized Person' });
    }

    const corporateTypes = ['Company', 'LLP', 'Partnership', 'Cooperative', 'Society', 'Trust'];
    const isCorporate = corporateTypes.some(t => String(formData.organizationType || regDetails.businessType).toLowerCase().includes(t.toLowerCase()));
    if (isCorporate && (regDetails.cinNumber || regDetails.registrationNumber || regDetails.cin)) {
      required.push({ id: 'business_registration_proof', label: 'Business Registration Proof (CIN/Shop Act)' });
    }

    return required;
  }, [formData, regDetails]);

  const areAllDocumentsUploaded = useCallback(() => {
    const required = getRequiredDocuments();
    const uploadedTypes = sellerDocuments.map((d: any) => d.documentType);
    return required.every(reqDoc => uploadedTypes.includes(reqDoc.id));
  }, [getRequiredDocuments, sellerDocuments]);

  const submittedOnboardingDocuments = useMemo(() => {
    const requiredIds = new Set(getRequiredDocuments().map(doc => doc.id));
    return sellerDocuments.filter((doc: any) => requiredIds.has(doc.documentType));
  }, [getRequiredDocuments, sellerDocuments]);

  const isApprovedProfile = onboardingStatus === 'approved_for_procurement';
  const lockBadgeText = isApprovedProfile ? 'Approved profile locked' : 'Submitted profile under review';
  const lockToastText = isApprovedProfile
    ? 'Approved profiles are locked'
    : 'Submitted profiles are locked during compliance review';

  useEffect(() => {
    try {
      const stored = localStorage.getItem(savedSectionsStorageKey);
      if (stored) {
        const storedSections = normalizeSavedSections(JSON.parse(stored));
        setSavedSections(prev => Array.from(new Set([...prev, ...storedSections])));
      }
    } catch {
      localStorage.removeItem(savedSectionsStorageKey);
    }
  }, [savedSectionsStorageKey]);

  useEffect(() => {
    if (!savedSectionsStorageKey) return;
    localStorage.setItem(savedSectionsStorageKey, JSON.stringify(savedSections));
  }, [savedSections, savedSectionsStorageKey]);

  const fetchProfile = useCallback(async () => {
    try {
      const res = await api.fetch('/api/auth/me', {
        headers: getAuthHeaders(),
        skipCache: true
      });
      const data = await res.json();
      
      const regDetails = data.user?.registrationDetails || {};
      const profile = data.profile || {};
      setRegDetails(regDetails);
      setSellerDocuments(profile.sellerDocuments || []);
      
      const serverCompletedSections = completedSellerSectionsFromUser(data.user);
      
      const inferredSections = inferCompletedSellerSections(profile);
      setSavedSections(Array.from(new Set([...inferredSections, ...serverCompletedSections])));
      const userRecord = data.user || {};
      const currentStatus = userRecord.onboardingStatus;
      setOnboardingStatus(currentStatus || 'pending');
      setIsProfileLocked(shouldLockSellerProfile(userRecord));
      setShowSuccessOverlay(shouldShowSubmissionOverlay(userRecord));
      
      const hasAdditionalCompleted = data.user?.sectionStatus?.additional === 'completed' || data.user?.sectionStatus?.additional === 'approved';
      setFormData((prev: any) => ({
        ...prev,
        ...profile,
        organizationType: profile.organizationType || regDetails.businessType || prev.organizationType,
        businessName: profile.businessName || regDetails.businessName || data.user?.name || prev.businessName,
        nameAsInPan: profile.nameAsInPan || regDetails.businessName || data.user?.name || prev.nameAsInPan || '',
        dateAsInPan: toDateInputValue(profile.dateAsInPan),
        dateOfIncorporation: toDateInputValue(profile.dateOfIncorporation),
        mobile: profile.mobile || data.user?.mobile || prev.mobile,
        dob: toDateInputValue(profile.dob) || toDateInputValue(data.user?.dob) || prev.dob,
        roleInOrg: profile.roleInOrg || regDetails.roleInOrg || prev.roleInOrg,
        pan: profile.pan || regDetails.pan || prev.pan,
        offices: normalizeList(profile.offices),
        bankAccounts: normalizeList(profile.bankAccounts).length > 0 ? normalizeList(profile.bankAccounts) : normalizeList(prev.bankAccounts),
        isStartup: hasAdditionalCompleted ? (profile.isStartup ?? null) : null,
        isUdyamCertified: hasAdditionalCompleted ? (profile.isUdyamCertified ?? null) : null,
        participateInBid: hasAdditionalCompleted ? (profile.participateInBid ?? null) : null
      }));
    } catch (err) {
      console.error(err);
    } finally {
      setIsFetching(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

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

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (isProfileLocked && !isAccountSettings) return;
    const { name, value, type } = e.target as any;
    const val = type === 'checkbox' ? (e.target as HTMLInputElement).checked : value;
    setFormData((prev: any) => ({ ...prev, [name]: val }));
  };

  const handleSaveSection = async (nextSection?: string | React.MouseEvent) => {
    if (isProfileLocked && !isAccountSettings) {
      toast.info(lockToastText);
      return;
    }
    if (currentSection === 'additional') {
      const { errors, isValid } = validateAdditionalForm(formData);
      if (!isValid) {
        setAdditionalErrors(errors);
        toast.error('Please answer all mandatory questions in this section.');
        return;
      }
    }
    if (currentSection === 'details' && !/^[6-9]\d{9}$/.test(String(formData.mobile || '').trim())) {
      toast.error('Please enter a valid 10-digit registered mobile number.');
      return;
    }
    setIsLoading(true);
    try {
      let dataToSave = { ...formData, _completedSection: currentSection };
      if (currentSection === 'details') {
        dataToSave.detailsUpdated = true;
      }
      const res = await api.post('/api/seller/register', dataToSave, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        toast.success('Section saved successfully');
        if (currentSection === 'details') {
          setFormData((prev: any) => ({ ...prev, detailsUpdated: true }));
        }
        setSavedSections(prev => Array.from(new Set([...prev, currentSection])));
        if (typeof nextSection === 'string') {
          setCurrentSection(nextSection);
          // Update URL to reflect the new section
          const params = new URLSearchParams(window.location.search);
          params.set('section', nextSection);
          window.history.pushState(null, '', `?${params.toString()}`);
        }
      } else {
        const data = await res.json().catch(() => null);
        toast.error(data?.message || 'Failed to save section');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendOwnershipOtp = async () => {
    if (isProfileLocked) return;
    if (!formData.ownershipDeclarationAccepted) {
      toast.error('Accept the beneficial ownership declaration before requesting OTP.');
      return;
    }

    setIsSendingOwnershipOtp(true);
    try {
      const res = await api.post('/api/seller/ownership/send-otp', {}, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.message || 'Failed to send OTP');
        return;
      }
      setOwnershipOtpSent(true);
      setOwnershipOtp('');
      toast.success(`OTP sent to ${data.email || user?.email || 'your login email'}`);
    } catch {
      toast.error('Unable to send OTP right now');
    } finally {
      setIsSendingOwnershipOtp(false);
    }
  };

  const handleFinalSubmit = async () => {
    if (isProfileLocked) return;
    if (!formData.ownershipDeclarationAccepted) {
      toast.error('Accept the beneficial ownership declaration before final submission.');
      return;
    }
    if (!/^\d{6}$/.test(ownershipOtp.trim())) {
      toast.error('Enter the 6-digit OTP sent to your login email.');
      return;
    }

    setIsLoading(true);
    try {
      const saveRes = await api.post('/api/seller/register', formData, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (!saveRes.ok) {
        const data = await saveRes.json().catch(() => ({}));
        toast.error(data.message || 'Failed to save section');
        return;
      }

      const res = await api.post('/api/seller/submit', { otp: ownershipOtp.trim() }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        toast.success('Application submitted successfully');
        setFormData((prev: any) => ({ ...prev, ownershipVerified: true }));
        setOnboardingStatus('under_compliance_review');
        setIsProfileLocked(true);
        setShowSuccessOverlay(true);
      } else {
        const data = await res.json().catch(() => ({}));
        toast.error(data.message || 'Failed to submit application');
      }
    } catch {
      toast.error('Network error');
    } finally {
      setIsLoading(false);
    }
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
        await fetchProfile();
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

  const handleViewDocument = async (fileAsset: any, label: string) => {
    try {
      await openFileAsset(fileAsset, label);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open document');
    }
  };

  const handleAddOffice = async (officeDataArg?: any) => {
    if (isProfileLocked) {
      toast.info(lockToastText);
      return;
    }

    const validation = validateOfficeForm();
    setOfficeErrors(validation.errors);
    if (!validation.isValid) {
      toast.error("Please fix the office address details.");
      return;
    }
    
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
    setOfficeErrors({});
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
    setOfficeErrors({});
    setEditingOfficeId(null);
  };

  const handleDeleteOffice = async (id: number) => {
    if (isProfileLocked) {
      toast.info(lockToastText);
      return;
    }
    try {
      await api.delete(`/api/seller/profile/offices/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      setFormData((prev: any) => {
        const nextOffices = prev.offices.filter((o: any) => o.id !== id);
        if (nextOffices.length === 0) {
          setSavedSections(curr => curr.filter(s => s !== 'offices'));
        }
        return { ...prev, offices: nextOffices };
      });
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
    if (!formData.dateAsInPan) {
      toast.error('Please select Date (As in PAN) before verification');
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
      toast.info(lockToastText);
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
          bankAccounts: normalizeList(data.bankAccounts).length > 0 ? normalizeList(data.bankAccounts) : [...normalizeList(prev.bankAccounts).map((bank: any) => ({
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
      toast.info(lockToastText);
      return;
    }
    try {
      const res = await api.delete(`/api/seller/profile/bank/${id}`, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });
      if (res.ok) {
        const data = await res.json();
        setFormData((prev: any) => {
          const nextBanks = normalizeList(data.bankAccounts).length > 0 ? normalizeList(data.bankAccounts) : normalizeList(prev.bankAccounts).filter((bank: any) => bank.id !== id);
          if (nextBanks.length === 0) {
            setSavedSections(curr => curr.filter(s => s !== 'bank'));
          }
          return {
            ...prev,
            bankAccounts: nextBanks
          };
        });
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
    const bankAccounts = normalizeList(formData.bankAccounts);
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

    const isDuplicate = bankAccounts.some((bank: any) =>
      String(bank.accountNumber) === values.accountNumber &&
      String(bank.ifsc).toUpperCase() === values.ifsc
    );
    if (isDuplicate) errors.accountNumber = 'This bank account is already added.';

    if (bankAccounts.length === 0 && !values.isPrimary) {
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
    isPrimary: normalizeList(formData.bankAccounts).length === 0 ? true : newBank.isPrimary
  });

  const calculateCompletion = () => {
    const isSaved = (section: string) => savedSections.includes(section);
    let completed = 0;
    if (formData.panVerified || isSaved('pan')) completed += 1;
    if ((formData.businessName && formData.dateOfIncorporation) || isSaved('details')) completed += 1;
    if (isSaved('additional')) completed += 1;
    if (normalizeList(formData.offices).length > 0 || isSaved('offices')) completed += 1;
    if (normalizeList(formData.bankAccounts).length > 0 || isSaved('bank')) completed += 1;
    if (formData.turnoverMax3Yrs || formData.eInvoicingExcluded === true || isSaved('einvoicing')) completed += 1;
    if (formData.ownershipDeclarationAccepted || formData.ownershipVerified || isSaved('ownership')) completed += 1;
    if (areAllDocumentsUploaded() || isSaved('documents')) completed += 1;
    return Math.round((completed / 8) * 100);
  };

  const getSectionStatus = () => {
    const status: any = {};
    const isSaved = (section: string) => savedSections.includes(section);
    status.pan = formData.panVerified || isSaved('pan') ? 'completed' : 'pending';
    status.details = (formData.businessName && formData.dateOfIncorporation && formData.detailsUpdated) || isSaved('details') ? 'completed' : 'pending';
    status.additional = isSaved('additional') ? 'completed' : 'pending';
    status.offices = normalizeList(formData.offices).length > 0 || isSaved('offices') ? 'completed' : 'pending';
    status.bank = normalizeList(formData.bankAccounts).length > 0 || isSaved('bank') ? 'completed' : 'pending';
    status.einvoicing = formData.turnoverMax3Yrs || formData.eInvoicingExcluded === true || isSaved('einvoicing') ? 'completed' : 'pending';
    status.ownership = formData.ownershipDeclarationAccepted || formData.ownershipVerified || isSaved('ownership') ? 'completed' : 'pending';
    status.documents = areAllDocumentsUploaded() || isSaved('documents') ? 'completed' : 'pending';
    return status;
  };

  const warnings: string[] = [];
  if (!formData.panVerified) warnings.push("Kindly verify Business PAN");
  if (formData.offices.length === 0) warnings.push("Registered Address details missing");
  if (!formData.ownershipDeclarationAccepted) warnings.push("Please complete Beneficial Ownership Compliance");
  if (!areAllDocumentsUploaded()) warnings.push("Please upload all required onboarding documents");

  if (isFetching) return <div className="flex h-screen items-center justify-center font-black  text-[#12335f] animate-pulse">Initializing Profile...</div>;

  return (
    <div className="flex flex-col md:flex-row bg-gray-50 min-h-screen">
      <GeMSellerSidebar 
        currentSection={currentSection} 
        onSectionChange={handleSectionChange} 
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
        
        <div className="p-3 sm:p-4 max-w-4xl mx-auto w-full">
          <Card className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
            <div className="border-b border-gray-100 bg-gray-50/50 px-5 py-3">
               <h3 className="text-base font-bold uppercase tracking-tight text-gray-800">
                 {currentSection.replace(/([A-Z])/g, ' $1').toUpperCase()}
               </h3>
               {isProfileLocked && (
                 <p className="mt-3 inline-flex rounded-full border border-emerald-100 bg-emerald-50 px-3 py-1 text-[10px] font-black uppercase tracking-widest text-emerald-700">
                   {lockBadgeText}
                 </p>
               )}
            </div>
            
            {isAccountSettings && (
              <div className="border-b border-gray-100 bg-white p-3 sm:p-4">
                <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap">
                  {ACCOUNT_SETTINGS_ITEMS.map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSectionChange(item.id)}
                      className={cn(
                        "min-h-10 rounded-lg border px-3 py-2 text-left text-xs font-black uppercase tracking-wide transition-colors sm:text-center",
                        currentSection === item.id
                          ? "border-[#12335f] bg-[#12335f] text-white shadow-sm"
                          : "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100"
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <CardContent className="p-4 sm:p-5 w-full min-w-0">
              {showSuccessOverlay && !isAccountSettings ? (
                <div className="py-12 flex flex-col items-center justify-center text-center animate-in zoom-in-95 duration-500 min-w-0 w-full">
                  <div className="h-24 w-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 shadow-inner border-4 border-white shadow-emerald-100">
                    <CheckCircle2 className="h-12 w-12 text-emerald-600" />
                  </div>
                  <h2 className="text-2xl font-bold text-slate-900">Application Submitted Successfully</h2>
                  <p className="mt-3 text-slate-500 max-w-md mx-auto text-sm font-medium">
                    {isApprovedProfile
                      ? 'Your business profile has been approved for procurement access. The approved profile is locked to preserve the verified record.'
                      : 'Your business profile has been securely submitted to our compliance team for review. It is locked during review and you will be notified via email once verification is complete.'}
                  </p>
                  
                  <div className="mt-8 p-4 bg-slate-50 border border-slate-100 rounded-xl text-left max-w-md w-full mx-auto">
                     <div className="flex items-start gap-3">
                        <Info className="h-5 w-5 text-[#12335f] mt-0.5 shrink-0" />
                        <div>
                           <p className="text-sm font-bold text-slate-900">Review Period Notice</p>
                           <p className="text-xs font-medium text-[#12335f] mt-1">Standard processing time is 3-5 business days. You cannot modify your registration data during this period.</p>
                        </div>
                     </div>
                  </div>
                  
                  <Button onClick={() => setShowSuccessOverlay(false)} className="mt-10 bg-[#12335f] hover:bg-[#0b2342] text-white px-8 font-bold tracking-wide rounded-lg uppercase text-xs h-10">
                     Review Submission Data
                  </Button>
                </div>
              ) : (
                <fieldset disabled={isProfileLocked && !isAccountSettings && currentSection !== 'documents'} className={`min-w-0 w-full ${(isProfileLocked && !isAccountSettings) ? 'opacity-70' : ''}`}>
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
                    <Button onClick={fetchPanDetails} disabled={isLoading} className="bg-[#12335f] hover:bg-slate-800 rounded-xl px-8 h-12 font-black uppercase text-xs  tracking-widest shadow-lg shadow-blue-100">
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
                    <Input
                      label="Registered Mobile Number"
                      name="mobile"
                      value={formData.mobile}
                      onChange={(event) => setFormData((prev: any) => ({ ...prev, mobile: event.target.value.replace(/\D/g, '').slice(0, 10) }))}
                      placeholder="Enter registered mobile number"
                    />
                  </div>
                  <div className="flex justify-end gap-3 pt-2">
                    <Button onClick={() => handleSaveSection('additional')} className="bg-[#12335f] hover:bg-slate-800 rounded px-6 h-9 font-bold uppercase text-xs tracking-wide text-white">
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
                   ].map(item => (
                     <div key={item.name} className="space-y-2">
                       <div className={`flex items-center justify-between p-3 bg-gray-50 rounded-lg border font-medium text-gray-700 transition-colors ${additionalErrors[item.name] ? 'border-red-400 bg-red-50/20' : 'border-gray-100'}`}>
                          <span className="text-sm">{item.label}</span>
                          <div className="flex gap-4">
                             <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                  type="radio" 
                                  name={item.name} 
                                  checked={formData[item.name] === true} 
                                  onChange={() => {
                                    setFormData((prev: any) => ({ ...prev, [item.name]: true }));
                                    setAdditionalErrors(prev => {
                                      const next = { ...prev };
                                      delete next[item.name];
                                      return next;
                                    });
                                  }} 
                                  className="accent-[#12335f] h-4 w-4" 
                                />
                                <span className="text-xs uppercase">Yes</span>
                             </label>
                             <label className="flex items-center gap-2 cursor-pointer">
                                <input 
                                  type="radio" 
                                  name={item.name} 
                                  checked={formData[item.name] === false} 
                                  onChange={() => {
                                    setFormData((prev: any) => ({ ...prev, [item.name]: false }));
                                    setAdditionalErrors(prev => {
                                      const next = { ...prev };
                                      delete next[item.name];
                                      return next;
                                    });
                                  }} 
                                  className="accent-[#12335f] h-4 w-4" 
                                />
                                <span className="text-xs uppercase">No</span>
                             </label>
                          </div>
                       </div>
                       {additionalErrors[item.name] && (
                         <p className="text-xs font-semibold text-red-600 pl-1">{additionalErrors[item.name]}</p>
                       )}
                     </div>
                   ))}

                   {/* MSME Type */}
                   <div className="space-y-2">
                     <label className="block text-xs font-bold text-gray-700 mb-1">MSME Type*</label>
                     <select
                       value={formData.msmeType || ''}
                       onChange={(e) => {
                         setFormData((prev: any) => ({ ...prev, msmeType: e.target.value }));
                         setAdditionalErrors((prev: any) => {
                           const next = { ...prev };
                           delete next.msmeType;
                           return next;
                         });
                       }}
                       className={`w-full h-12 bg-white rounded border text-sm px-4 focus:outline-none focus:ring-1 ${additionalErrors.msmeType ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`}
                     >
                       <option value="">Select MSME Type</option>
                       {MSME_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                     </select>
                     {additionalErrors.msmeType && (
                       <p className="text-xs font-semibold text-red-600 pl-1">{additionalErrors.msmeType}</p>
                     )}
                   </div>

                   {/* Vendor Type */}
                   <div className="space-y-2">
                     <label className="block text-xs font-bold text-gray-700 mb-1">Vendor Type*</label>
                     <select
                       value={formData.vendorType || ''}
                       onChange={(e) => {
                         setFormData((prev: any) => ({ ...prev, vendorType: e.target.value }));
                         setAdditionalErrors((prev: any) => {
                           const next = { ...prev };
                           delete next.vendorType;
                           return next;
                         });
                       }}
                       className={`w-full h-12 bg-white rounded border text-sm px-4 focus:outline-none focus:ring-1 ${additionalErrors.vendorType ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`}
                     >
                       <option value="">Select Vendor Type</option>
                       {VENDOR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                     </select>
                     {additionalErrors.vendorType && (
                       <p className="text-xs font-semibold text-red-600 pl-1">{additionalErrors.vendorType}</p>
                     )}
                   </div>

                   {/* Registration Type (Multi-select Checkboxes) */}
                   <div className="space-y-3">
                     <label className="block text-xs font-bold text-gray-700">Registration Type / Certifications</label>
                     <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-gray-50 p-4 rounded-lg border border-gray-100">
                       {REGISTRATION_TYPES.map((reg) => {
                         const isChecked = Array.isArray(formData.registrationTypes) && formData.registrationTypes.includes(reg.value);
                         return (
                           <label key={reg.value} className="flex items-center gap-3 cursor-pointer select-none py-1">
                             <input
                               type="checkbox"
                               checked={isChecked}
                               onChange={(e) => {
                                 const currentTypes = Array.isArray(formData.registrationTypes) ? formData.registrationTypes : [];
                                 let nextTypes;
                                 if (e.target.checked) {
                                   nextTypes = [...currentTypes, reg.value];
                                 } else {
                                   nextTypes = currentTypes.filter(t => t !== reg.value);
                                 }
                                 setFormData((prev: any) => ({ ...prev, registrationTypes: nextTypes }));
                               }}
                               className="accent-[#12335f] h-4 w-4 rounded border-gray-300"
                             />
                             <span className="text-sm text-gray-700 font-medium">{reg.label}</span>
                           </label>
                         );
                       })}
                     </div>
                   </div>

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
                     <button onClick={() => { setOfficeTab('manage'); setEditingOfficeId(null); }} className={`px-6 py-3 text-sm font-semibold ${officeTab === 'manage' ? 'text-[#12335f] border-t-2 border-l-2 border-r-2 border-gray-200 rounded-t-lg bg-white -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>Manage Offices</button>
                     <button onClick={() => { setOfficeTab('add'); if(!editingOfficeId) resetOfficeForm(); }} className={`px-6 py-3 text-sm font-semibold ${officeTab === 'add' ? 'text-[#12335f] border-t-2 border-l-2 border-r-2 border-gray-200 rounded-t-lg bg-white -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>{editingOfficeId ? 'Edit Office' : 'Add New Office'}</button>
                   </div>

                    {officeTab === 'manage' && (
                      <div className="pt-4 space-y-6 animate-in fade-in min-w-0 w-full">
                         <p className="text-sm text-gray-700">You need to update your GSTIN for getting the order above 40 lakhs.</p>
                         
                         <div className="overflow-x-auto border border-gray-200 bg-white rounded-xl w-full">
                            <table className="w-full text-left text-sm min-w-[600px]">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                 <tr>
                                    <th className="px-4 py-4 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight">Sr. No.</th>
                                    <th className="px-4 py-4 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight w-1/4"><button type="button" onClick={() => setOfficeSortKey('name')} className="inline-flex items-center">Office <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" /></button></th>
                                    <th className="px-4 py-4 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight w-1/2"><button type="button" onClick={() => setOfficeSortKey('address')} className="inline-flex items-center">Address <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" /></button></th>
                                   
                                    <th className="px-4 py-4 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight">ACTION</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {formData.offices.length === 0 ? (
                                    <tr>
                                       <td colSpan={5} className="py-6 px-0 text-gray-500">
                                          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-6">
                                            <span className="text-xs sm:text-sm">No offices added.</span>
                                            <button onClick={() => setOfficeTab('add')} className="text-[#12335f] font-bold hover:underline uppercase text-[10px] sm:text-xs">ADD NEW OFFICE</button>
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
                                         {/* <td className="px-4 py-4 text-gray-600 break-all">-</td> */}
                                          <td className="px-4 py-4">
                                             <button onClick={() => handleEditOffice(office)} className="text-[#12335f] hover:text-[#0b2445] font-bold text-xs uppercase mr-4">EDIT</button>
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
                               <button onClick={() => setOfficeTab('add')} className="text-[#12335f] font-bold hover:underline uppercase text-xs">ADD NEW OFFICE</button>
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
                               <input value={officeForm.name} onChange={(e) => updateOfficeForm('name', e.target.value)} placeholder="Enter Office Name" className={`w-full h-12 px-4 rounded border text-sm focus:outline-none focus:ring-1 bg-white ${officeErrors.name ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`} />
                               {officeErrors.name && <p className="mt-1 text-xs font-medium text-red-600">{officeErrors.name}</p>}
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1">Type Of Office*</label>
                               <select value={officeForm.type} onChange={(e) => updateOfficeForm('type', e.target.value)} className={`w-full h-12 px-4 rounded border text-sm focus:outline-none focus:ring-1 bg-white text-gray-500 ${officeErrors.type ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`}>
                                  <option value="Registered">Select type of address</option>
                                  <option value="Registered">Registered Office</option>
                                  <option value="Branch">Branch</option>
                                  <option value="Warehouse">Warehouse</option>
                               </select>
                               {officeErrors.type && <p className="mt-1 text-xs font-medium text-red-600">{officeErrors.type}</p>}
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1">Pincode*</label>
                               <input value={officeForm.pincode} onChange={(e) => updateOfficeForm('pincode', e.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="Enter 6 digit pincode" className={`w-full h-12 px-4 rounded border text-sm focus:outline-none focus:ring-1 bg-white ${officeErrors.pincode ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`} />
                               {officeErrors.pincode && <p className="mt-1 text-xs font-medium text-red-600">{officeErrors.pincode}</p>}
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1">State*</label>
                               <select 
                                 id="new-office-state" 
                                 value={officeForm.state}
                                 onChange={(e) => {
                                   const next = { ...officeForm, state: e.target.value, city: '' };
                                   setOfficeForm(next);
                                   setOfficeErrors(validateOfficeForm(next).errors);
                                 }}
                                 className={`w-full h-12 px-4 rounded border text-sm focus:outline-none focus:ring-1 bg-white ${officeErrors.state ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`}
                               >
                                 <option value="">Select State</option>
                                 {indiaStates.map(st => (
                                   <option key={st} value={st}>{st}</option>
                                 ))}
                               </select>
                               {officeErrors.state && <p className="mt-1 text-xs font-medium text-red-600">{officeErrors.state}</p>}
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1">Town/City/District*</label>
                               <select 
                                 id="new-office-city"
                                 value={officeForm.city}
                                 disabled={!officeForm.state}
                                 onChange={(e) => updateOfficeForm('city', e.target.value)}
                                 className={`w-full h-12 px-4 rounded border text-sm focus:outline-none focus:ring-1 bg-white disabled:opacity-60 disabled:bg-gray-50 ${officeErrors.city ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`}
                               >
                                 <option value="">{officeForm.state ? 'Select District' : 'Select State First'}</option>
                                 {officeDistrictOptions.map((dist) => (
                                   <option key={dist} value={dist}>{dist}</option>
                                 ))}
                               </select>
                               {officeErrors.city && <p className="mt-1 text-xs font-medium text-red-600">{officeErrors.city}</p>}
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1">Flat/Door/Block No*</label>
                               <input value={officeForm.flat} onChange={(e) => updateOfficeForm('flat', e.target.value)} placeholder="Enter Flat/Door/Block number" className={`w-full h-12 px-4 rounded border text-sm focus:outline-none focus:ring-1 bg-white ${officeErrors.flat ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`} />
                               {officeErrors.flat && <p className="mt-1 text-xs font-medium text-red-600">{officeErrors.flat}</p>}
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1">Name of Premises/ Building/ Village</label>
                               <input value={officeForm.premises} onChange={(e) => updateOfficeForm('premises', e.target.value)} placeholder="Enter Building/Premises/Village" className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-[#12335f]" />
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1">Road/Street/Post Office</label>
                               <input value={officeForm.road} onChange={(e) => updateOfficeForm('road', e.target.value)} placeholder="Enter Road/Street/Post Office" className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-[#12335f]" />
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1">Area/Locality*</label>
                               <input value={officeForm.area} onChange={(e) => updateOfficeForm('area', e.target.value)} placeholder="Enter Area/Locality" className={`w-full h-12 px-4 rounded border text-sm focus:outline-none focus:ring-1 bg-white ${officeErrors.area ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`} />
                               {officeErrors.area && <p className="mt-1 text-xs font-medium text-red-600">{officeErrors.area}</p>}
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1">Contact Number* <span className="text-gray-400 font-normal ml-1">ⓘ</span></label>
                               <input value={officeForm.contact} onChange={(e) => updateOfficeForm('contact', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="Enter Contact Number" className={`w-full h-12 px-4 rounded border text-sm focus:outline-none focus:ring-1 bg-white ${officeErrors.contact ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`} />
                              
                               {officeErrors.contact && <p className="mt-1 text-xs font-medium text-red-600">{officeErrors.contact}</p>}
                            </div>
                            <div>
                               <label className="block text-xs font-bold text-gray-700 mb-1">Office Email Address*</label>
                               <select id="new-office-email" className="w-full h-12 px-4 rounded border border-gray-300 bg-white text-sm focus:outline-none focus:ring-1 focus:ring-[#12335f] text-gray-500">
                                  <option value={user?.email || "registered@example.com"}>{user?.email || "registered@example.com"}</option>
                               </select>
                            </div>
                         </div>
                         <div className="flex justify-end mt-6 pt-6 border-t border-gray-100">
                            <Button onClick={() => handleAddOffice()} className="bg-[#12335f] hover:bg-slate-800 text-white font-bold px-10 h-12 rounded transition-colors uppercase tracking-widest text-xs  shadow-lg shadow-blue-100">
                                {editingOfficeId ? 'UPDATE OFFICE' : <><Plus className="mr-2 h-4 w-4" /> ADD OFFICE</>}
                            </Button>
                         </div>
                      </div>
                   )}

                   <div className="flex justify-end pt-4">
                      <Button onClick={() => {
                        if (normalizeList(formData.offices).length === 0) {
                          toast.error("Please add at least one office location.");
                          return;
                        }
                        handleSaveSection('bank');
                      }} className="bg-gray-900 text-white rounded px-6 h-9 font-bold uppercase text-xs tracking-wide">
                         Save & Continue
                      </Button>
                   </div>
                </div>
              )}

              {currentSection === 'bank' && (
                <div className="space-y-4 animate-in fade-in duration-300 min-w-0 w-full">
                   <p className="text-sm text-gray-600">You can add multiple Bank accounts for your Business. One account must be selected as Primary account</p>
                   
                   <div className="flex border-b border-gray-200">
                     <button onClick={() => setBankTab('manage')} className={`px-6 py-3 text-sm font-semibold ${bankTab === 'manage' ? 'text-[#12335f] border-t-2 border-l-2 border-r-2 border-gray-200 rounded-t-lg bg-white -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>Manage Bank Account</button>
                     <button onClick={() => setBankTab('add')} className={`px-6 py-3 text-sm font-semibold ${bankTab === 'add' ? 'text-[#12335f] border-t-2 border-l-2 border-r-2 border-gray-200 rounded-t-lg bg-white -mb-px' : 'text-gray-500 hover:text-gray-700'}`}>Add new Bank Account</button>
                   </div>

                    {bankTab === 'manage' && (
                      <div className="pt-4 space-y-6 animate-in fade-in min-w-0 w-full">

                         <div className="overflow-x-auto border border-gray-200 bg-white rounded-xl w-full">
                            <table className="w-full text-left text-sm min-w-[640px]">
                              <thead className="bg-gray-50 border-b border-gray-200">
                                 <tr>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight">Sr. No.</th>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setBankSortKey('ifsc')} className="inline-flex items-center">IFSC <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" /></button></th>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setBankSortKey('bankName')} className="inline-flex items-center">Bank Name <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" /></button></th>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setBankSortKey('accountNumber')} className="inline-flex items-center">Bank Account Number <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" /></button></th>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setBankSortKey('holderName')} className="inline-flex items-center">Account Holder <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" /></button></th>
                                     {/* <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setBankSortKey('pfms')} className="inline-flex items-center">PFMS <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" /></button></th> */}
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight"><button type="button" onClick={() => setBankSortKey('primary')} className="inline-flex items-center">Primary <ArrowUpDown className="ml-1 h-3 w-3 opacity-40" /></button></th>
                                     <th className="px-3 py-3 font-semibold text-gray-800 text-[10px] sm:text-xs uppercase tracking-wider whitespace-normal leading-tight">ACTION</th>
                                 </tr>
                              </thead>
                              <tbody>
                                 {normalizeList(formData.bankAccounts).length === 0 ? (
                                    <tr>
                                       <td colSpan={8} className="py-6 px-0 text-gray-500">
                                          <div className="flex flex-col sm:flex-row justify-between items-center gap-3 px-6">
                                             <span className="text-xs sm:text-sm">No accounts added.</span>
                                             <button onClick={() => setBankTab('add')} className="text-[#12335f] font-bold hover:underline uppercase text-[10px] sm:text-xs">ADD NEW BANK ACCOUNT</button>
                                          </div>
                                       </td>
                                    </tr>
                                 ) : (
                                    [...normalizeList(formData.bankAccounts)].sort((a: any, b: any) => String(a[bankSortKey] ?? '').localeCompare(String(b[bankSortKey] ?? ''))).map((bank: any, index: number) => (
                                        <tr key={bank.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50/50 transition-colors text-xs">
                                           <td className="px-3 py-3 font-mono font-bold text-gray-400">{String(index + 1).padStart(2, '0')}</td>
                                           <td className="px-3 py-3 text-gray-600 font-medium">{bank.ifsc}</td>
                                           <td className="px-3 py-3 text-gray-600 break-words max-w-[150px]">{bank.bankName}</td>
                                           <td className="px-3 py-3 text-gray-600 break-all font-mono">{bankAccountDisplay(bank)}</td>
                                           <td className="px-3 py-3 text-gray-600 break-words max-w-[150px]">{bank.holderName || '-'}</td>
                                         {/*  <td className="px-3 py-3 text-gray-600">-</td>*/}
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
                                className={`w-full h-12 px-4 rounded border bg-gray-50/50 text-sm focus:outline-none focus:ring-1 ${bankErrors.ifsc ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`}
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
                                className={`w-full h-12 px-4 rounded border bg-gray-100 text-sm focus:outline-none focus:ring-1 ${bankErrors.bankName ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`}
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
                                className={`w-full h-24 p-4 rounded border bg-gray-100 text-sm resize-none focus:outline-none focus:ring-1 ${bankErrors.bankAddress ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`}
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
                                  className={`w-full h-12 px-4 rounded border bg-gray-50/50 text-sm focus:outline-none focus:ring-1 ${bankErrors.holderName ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`}
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
                                className={`w-full h-12 px-4 rounded border bg-gray-50/50 text-sm focus:outline-none focus:ring-1 ${bankErrors.accountNumber ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`}
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
                                className={`w-full h-12 px-4 rounded border bg-gray-50/50 text-sm focus:outline-none focus:ring-1 ${bankErrors.confirmAccountNumber ? 'border-red-400 focus:ring-red-500' : 'border-gray-300 focus:ring-[#12335f]'}`}
                              />
                              {bankErrors.confirmAccountNumber && <p className="mt-1 text-xs font-medium text-red-600">{bankErrors.confirmAccountNumber}</p>}
                           </div>
                        </div>

                        <label className="flex items-center gap-2 mt-4 cursor-pointer">
                           <input
                            id="new-bank-primary"
                            type="checkbox"
                            checked={normalizeList(formData.bankAccounts).length === 0 ? true : newBank.isPrimary}
                            onChange={(event) => updateNewBank('isPrimary', event.target.checked)}
                            disabled={normalizeList(formData.bankAccounts).length === 0}
                            className="w-4 h-4 text-[#12335f] rounded border-gray-300"
                           />
                           <span className="text-sm font-medium text-gray-700">Is Primary Account?</span>
                        </label>
                        {normalizeList(formData.bankAccounts).length === 0 && <p className="text-xs font-medium text-[#12335f]">First bank account will be saved as the primary account.</p>}
                        {bankErrors.isPrimary && <p className="text-xs font-medium text-red-600">{bankErrors.isPrimary}</p>}
                         <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mt-8 pt-6 border-t border-gray-100">
                           <p className="text-sm font-medium text-gray-800 mb-4 sm:mb-0">Complete validation to add a new bank account</p>
                           <Button onClick={() => {
                             const validation = validateBankForm({
                               ...newBank,
                               isPrimary: normalizeList(formData.bankAccounts).length === 0 ? true : newBank.isPrimary
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
                           }} disabled={!bankValidation.isValid || isLoading} className="bg-[#12335f] hover:bg-slate-800 text-white font-bold px-6 h-9 rounded transition-colors tracking-wide uppercase text-xs disabled:cursor-not-allowed disabled:opacity-50">
                               VALIDATE & ADD
                           </Button>
                        </div>
                     </div>
                   )}

                   <div className="flex justify-end pt-2">
                      <Button onClick={() => {
                        if (normalizeList(formData.bankAccounts).length === 0) {
                          toast.error("Please add at least one bank account.");
                          return;
                        }
                        handleSaveSection('einvoicing');
                      }} className="bg-gray-900 text-white rounded px-6 h-9 font-bold uppercase text-xs tracking-wide">
                         Save & Continue
                      </Button>
                   </div>
                </div>
              )}

              {currentSection === 'einvoicing' && (
                <div className="space-y-6 animate-in fade-in duration-300 min-w-0 w-full">
                   <div className="bg-slate-50/50 border border-slate-100 p-5 rounded-2xl space-y-2 ">
                      <p className="text-[10px] font-black uppercase text-[#12335f]">e-Invoice Information</p>
                      <p className="text-xs font-medium text-slate-900 leading-relaxed opacity-80">
                        As per Government regulations, taxpayers with turnover exceeding specific limits must generate e-invoices. Please declare your status below.
                      </p>
                   </div>
                   <div className="grid grid-cols-1 gap-6">
                      <Input label="Turnover (Max in last 3 years)" name="turnoverMax3Yrs" value={formData.turnoverMax3Yrs} onChange={handleChange} placeholder="e.g. 10 Crores" />
                      <div className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-100  font-bold">
                        <span className="text-sm">Specific category excluded from e-invoicing?</span>
                        <div className="flex gap-4">
                           <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={formData.eInvoicingExcluded} onChange={() => setFormData((prev: any) => ({ ...prev, eInvoicingExcluded: true }))} className="accent-[#12335f] h-4 w-4" />
                              <span className="text-xs uppercase">Yes</span>
                           </label>
                           <label className="flex items-center gap-2 cursor-pointer">
                              <input type="radio" checked={!formData.eInvoicingExcluded} onChange={() => setFormData((prev: any) => ({ ...prev, eInvoicingExcluded: false }))} className="accent-[#12335f] h-4 w-4" />
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
                   
                   <div className="flex justify-end pt-4 border-t border-slate-100">
                      <Button
                        onClick={() => handleSaveSection('documents')}
                        disabled={isLoading || !formData.ownershipDeclarationAccepted}
                        className="bg-gray-900 text-white rounded px-6 h-9 font-bold uppercase text-xs tracking-wide disabled:cursor-not-allowed disabled:opacity-60 hover:bg-gray-800"
                      >
                         {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Save & Continue'}
                      </Button>
                   </div>
                </div>
              )}

              {currentSection === 'documents' && (
                <div className="space-y-8 animate-in fade-in duration-300 min-w-0 w-full">
                  <div>
                    <h2 className="text-xl font-bold text-slate-800">Documents Upload</h2>
                    <p className="text-sm text-slate-500">Upload all required verification documents to complete onboarding.</p>
                  </div>

                  <div className="space-y-4">
                    {getRequiredDocuments().map((doc) => {
                      const uploadedDoc = submittedOnboardingDocuments.find((d: any) => d.documentType === doc.id);
                      const fileAsset = uploadedDoc?.fileAsset;
                      const isUploading = isUploadingMap[doc.id];
                      const status = uploadedDoc?.verificationStatus || 'NOT_UPLOADED'; // PENDING, APPROVED, REJECTED, NOT_UPLOADED
                      const remarks = uploadedDoc?.remarks;

                      return (
                        <div key={doc.id} className="border border-slate-200 rounded-xl bg-white p-5 shadow-sm transition-all hover:shadow-md">
                          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                            <div className="flex items-start gap-3">
                              <div className="mt-1 p-2 bg-slate-50 text-[#12335f] rounded-lg">
                                <FileText className="h-5 w-5" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <h4 className="text-sm font-bold text-slate-800">{doc.label}</h4>
                                {fileAsset ? (
                                  <div className="mt-1 flex items-center gap-2">
                                    <span className="text-xs text-slate-500 font-medium truncate max-w-[200px] sm:max-w-xs">
                                      {fileAsset.originalName || 'Uploaded Document'}
                                    </span>
                                    <button
                                      type="button"
                                      onClick={() => handleViewDocument(fileAsset, doc.label)}
                                      className="inline-flex items-center gap-1 text-xs text-[#12335f] font-semibold hover:underline"
                                    >
                                      View <ExternalLink className="h-3 w-3" />
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-xs text-slate-400 font-medium mt-1 block">No file uploaded yet (Max 10MB, PDF/JPG/PNG)</span>
                                )}
                              </div>
                            </div>

                            <div className="flex items-center gap-3 self-end sm:self-center">
                              {/* Status Badge */}
                              {status === 'APPROVED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-green-50 text-green-700 border border-green-200">
                                  <CheckCircle2 className="h-3.5 w-3.5" /> Approved
                                </span>
                              )}
                              {status === 'REJECTED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-red-50 text-red-700 border border-red-200">
                                  <AlertCircle className="h-3.5 w-3.5" /> Rejected
                                </span>
                              )}
                              {status === 'PENDING' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
                                  <Clock className="h-3.5 w-3.5" /> Pending Review
                                </span>
                              )}
                              {status === 'NOT_UPLOADED' && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                  Missing
                                </span>
                              )}

                              {/* Upload Action */}
                              {!isProfileLocked && (
                                <label className="relative cursor-pointer">
                                  <input
                                    type="file"
                                    accept=".pdf,.jpg,.jpeg,.png"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      if (file) handleUploadDocument(doc.id, file);
                                    }}
                                    disabled={isUploading}
                                  />
                                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-[#12335f] text-white hover:bg-slate-800 transition-colors shadow-sm disabled:opacity-50">
                                    {isUploading ? (
                                      <>
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Uploading...
                                      </>
                                    ) : fileAsset ? (
                                      'Replace File'
                                    ) : (
                                      <>
                                        <UploadCloud className="h-3.5 w-3.5" /> Upload
                                      </>
                                    )}
                                  </span>
                                </label>
                              )}
                            </div>
                          </div>

                          {/* Rejection Remarks */}
                          {status === 'REJECTED' && remarks && (
                            <div className="mt-3 p-3 bg-red-50/50 border border-red-100 rounded-lg flex items-start gap-2 text-xs text-red-800 animate-in fade-in duration-200">
                              <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                              <div>
                                <span className="font-bold">Rejection Reason:</span> {remarks}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* OTP / Submission Panel */}
                  <div className="border-t border-slate-200 pt-8">
                    <div className="flex flex-col items-center gap-6 py-6 bg-slate-50 border border-slate-200 rounded-2xl p-6 sm:p-8">
                      <h3 className="text-sm font-bold text-slate-800 uppercase tracking-wider">Final Onboarding Submission</h3>
                      
                      {!formData.ownershipDeclarationAccepted ? (
                        <p className="text-xs font-medium text-amber-600 text-center">
                          Please accept the Beneficial Ownership Declaration in Section 7 before submitting.
                        </p>
                      ) : !areAllDocumentsUploaded() ? (
                        <p className="text-xs font-medium text-amber-600 text-center">
                          All mandatory documents must be uploaded before final submission.
                        </p>
                      ) : (
                        <p className="text-xs font-semibold text-slate-500 text-center">
                          OTP will be sent to your login email: <span className="text-slate-800">{user?.email || 'registered email'}</span>
                        </p>
                      )}

                      <div className="flex w-full max-w-xl flex-col items-center gap-3 sm:flex-row sm:justify-center">
                        <Button
                          onClick={handleSendOwnershipOtp}
                          disabled={isSendingOwnershipOtp || !formData.ownershipDeclarationAccepted || !areAllDocumentsUploaded() || isProfileLocked}
                          className="bg-[#12335f] text-white rounded px-6 h-9 font-bold uppercase text-xs tracking-wide disabled:cursor-not-allowed disabled:opacity-60 hover:bg-slate-800"
                        >
                          {isSendingOwnershipOtp ? <Loader2 className="animate-spin h-4 w-4" /> : ownershipOtpSent ? 'Resend OTP' : 'Send OTP'}
                        </Button>
                        <input
                          value={ownershipOtp}
                          onChange={(e) => setOwnershipOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                          inputMode="numeric"
                          maxLength={6}
                          placeholder="Enter 6-digit OTP"
                          disabled={!ownershipOtpSent || isProfileLocked}
                          className="h-9 w-44 rounded border border-slate-300 px-3 text-center text-xs font-bold tracking-widest text-slate-800 outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-100 disabled:text-slate-400"
                        />
                        <Button
                          onClick={() => handleFinalSubmit()}
                          disabled={isLoading || !ownershipOtpSent || !formData.ownershipDeclarationAccepted || !areAllDocumentsUploaded() || !/^\d{6}$/.test(ownershipOtp) || isProfileLocked}
                          className="bg-gray-900 text-white rounded px-6 h-9 font-bold uppercase text-xs tracking-wide disabled:cursor-not-allowed disabled:opacity-60 hover:bg-gray-800"
                        >
                          {isLoading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Final Submission'}
                        </Button>
                      </div>
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
                            {formData.mobile || user?.mobile || '9356150561'}
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
                   <div className="bg-slate-50 text-blue-800 p-4 rounded text-sm border border-slate-100 font-medium">
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
                      <div className="rounded-lg border border-slate-100 bg-slate-50/60 p-3 text-xs font-medium text-slate-600">
                         Consent audio is currently not configured. Please read the consent text above before continuing.
                      </div>
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
                      <Button className="bg-[#12335f] hover:bg-slate-800 text-white rounded-lg px-8 h-10 font-bold uppercase text-xs tracking-wide whitespace-nowrap shadow-md shadow-blue-100">
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
                   <div className="bg-slate-50/50 border border-blue-200 rounded-lg p-5 space-y-2 mt-4">
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
                         <p>Please complete your profile to start transacting on MSME </p>
                      </div>
                      <div className="flex gap-2 items-start">
                         <Info className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                         <p>Kindly verify Business PAN, Registered address and CIN (for companies) to view GeM Seller ID.</p>
                      </div>
                      <div className="flex gap-2 items-start">
                         <Info className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                         <p>Please complete 'Beneficial Ownership Compliance'. <span className="text-[#12335f] cursor-pointer hover:underline">Click here</span></p>
                      </div>
                   </div>
                   
                   <div>
                      <h2 className="text-xl font-bold text-slate-800">Close Account</h2>
                      <p className="mt-2 text-sm text-slate-600 font-medium">If you close your account, your account will be closed permanently. You will not be able to login with this account. In addition, all the secondary seller accounts will also be closed.</p>
                   </div>
                   
                   <div className="bg-slate-50 border border-slate-100 text-slate-700 text-sm p-5 rounded-lg">
                      You are advised to check and validate your bank account detail before closing your seller account at GeM. The bank account details cannot be updated once the account is closed which may hamper refund of the caution money.
                   </div>
                   
                   <div className="flex flex-col sm:flex-row sm:items-center justify-between pt-8 border-t border-gray-100 gap-4">
                      <p className="text-sm text-slate-700 font-medium">To close your account permanently click on</p>
                      <Button className="bg-[#12335f] hover:bg-slate-800 text-white rounded-lg px-6 h-10 font-bold uppercase text-xs tracking-wide shadow-md shadow-blue-100 whitespace-nowrap">
                         Close Account
                      </Button>
                   </div>
                </div>
              )}
              </fieldset>
              )}
            </CardContent>
          </Card>

        </div>
      </div>
    </div>
  );
}
