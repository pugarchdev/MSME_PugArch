'use client';

import React, { useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  AlertTriangle,
  BadgeIndianRupee,
  Building2,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  FileCheck2,
  FileText,
  FileUp,
  Gavel,
  Loader2,
  Package,
  RotateCcw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  Wrench,
} from 'lucide-react';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { MarketplaceHeader } from '../../marketplace/components/MarketplaceHeader';
import { MarketplaceFooter } from '../../marketplace/components/MarketplaceFooter';
import { PageShell, ProcurementHero, StatusBadge } from '../components';
import { procurementBidApi } from '../api';

type PendingDoc = {
  id: string;
  file: File;
  progress: number;
  status: 'ready' | 'uploading' | 'uploaded' | 'error';
  error?: string;
};

type FormState = {
  title: string;
  buyerOrganizationName: string;
  buyerType: string;
  departmentName: string;
  contactPersonName: string;
  contactEmail: string;
  contactMobile: string;
  procurementType: string;
  bidType: string;
  category: string;
  subCategory: string;
  itemName: string;
  description: string;
  quantity: string;
  unit: string;
  estimatedValue: string;
  deliveryLocation: string;
  state: string;
  district: string;
  pincode: string;
  deliveryTimeline: string;
  installationRequired: boolean;
  warrantyRequired: boolean;
  inspectionRequired: boolean;
  startDate: string;
  endDate: string;
  clarificationLastDate: string;
  technicalOpeningDate: string;
  financialOpeningDate: string;
  bidValidityDate: string;
  expectedAwardDate: string;
  minExperience: string;
  minTurnover: string;
  emdRequired: boolean;
  emdAmount: string;
  documentFee: string;
  generalTerms: string;
  paymentTerms: string;
  deliveryTerms: string;
  penaltyClause: string;
  warrantyTerms: string;
  evaluationMethod: string;
  awardCriteria: string;
};

const today = new Date().toISOString().slice(0, 10);
const plusDays = (days: number) => new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);

const initialForm: FormState = {
  title: '',
  buyerOrganizationName: '',
  buyerType: 'Private Enterprise',
  departmentName: '',
  contactPersonName: '',
  contactEmail: '',
  contactMobile: '',
  procurementType: 'Tender',
  bidType: 'Product',
  category: '',
  subCategory: '',
  itemName: '',
  description: '',
  quantity: '1',
  unit: 'Nos',
  estimatedValue: '',
  deliveryLocation: '',
  state: '',
  district: '',
  pincode: '',
  deliveryTimeline: '',
  installationRequired: false,
  warrantyRequired: false,
  inspectionRequired: false,
  startDate: today,
  endDate: plusDays(14),
  clarificationLastDate: plusDays(7),
  technicalOpeningDate: plusDays(15),
  financialOpeningDate: plusDays(16),
  bidValidityDate: plusDays(45),
  expectedAwardDate: plusDays(21),
  minExperience: '',
  minTurnover: '',
  emdRequired: false,
  emdAmount: '',
  documentFee: '',
  generalTerms: '',
  paymentTerms: '',
  deliveryTerms: '',
  penaltyClause: '',
  warrantyTerms: '',
  evaluationMethod: 'Lowest price among technically qualified sellers',
  awardCriteria: 'Overall L1',
};

const procurementTypes = [
  { key: 'Direct Purchase', icon: Package, title: 'Direct Purchase', description: 'Connects to cart and order module in a later phase.', future: true },
  { key: 'RFQ', icon: ClipboardList, title: 'RFQ', description: 'Request quotes from verified sellers with structured terms.' },
  { key: 'Tender', icon: FileText, title: 'Tender', description: 'Formal tender with documents, eligibility, and approvals.' },
  { key: 'BOQ Bid', icon: BadgeIndianRupee, title: 'BOQ Bid', description: 'Bid with bill of quantity and commercial schedule.' },
  { key: 'Product Bid', icon: Package, title: 'Product Bid', description: 'Procure products with technical and commercial criteria.' },
  { key: 'Service Bid', icon: Wrench, title: 'Service Bid', description: 'Procure service contracts, AMC, installation, or support.' },
  { key: 'Rate Contract', icon: ShieldCheck, title: 'Rate Contract', description: 'Create recurring supply/service rate contracts.' },
  { key: 'Reverse Auction', icon: Gavel, title: 'Reverse Auction', description: 'Future optional flow after bid publication.', future: true },
];

const methodToPublishType: Record<string, string> = {
  tender: 'Tender',
  rfq: 'RFQ',
  boq: 'BOQ Bid',
  'custom-product': 'Product Bid',
  'custom-service': 'Service Bid',
  pac: 'Tender',
  'rate-contract': 'Rate Contract',
  emergency: 'Tender',
  'reverse-auction': 'Reverse Auction',
};

const methodToBidType: Record<string, string> = {
  'custom-service': 'Service',
  'rate-contract': 'Rate Contract',
  boq: 'Works',
};

const methodToTitle = (method: string) => method
  .split('-')
  .filter(Boolean)
  .map(part => part.charAt(0).toUpperCase() + part.slice(1))
  .join(' ');

const documentOptions = [
  'GST Certificate', 'PAN Card', 'Udyam Certificate', 'Company Registration', 'Turnover Certificate', 'CA Certificate',
  'Experience Certificate', 'Past Work Order', 'Completion Certificate', 'Product Catalogue', 'Technical Compliance Sheet',
  'OEM Authorization Letter', 'BIS/ISI/ISO Certificate', 'Make in India Declaration', 'EMD Payment Proof or Exemption Proof',
  'Financial Quote PDF', 'BOQ Price Sheet', 'Bank Details', 'Undertaking / Declaration', 'Other document',
];

const eligibilityFlags = [
  ['gstRequired', 'GST registration required'],
  ['panRequired', 'PAN required'],
  ['udyamRequired', 'Udyam certificate required'],
  ['pastWorkRequired', 'Past work order required'],
  ['oemRequired', 'OEM authorization required'],
  ['certRequired', 'ISO/BIS/ISI certificate required'],
  ['makeInIndiaRequired', 'Make in India declaration required'],
  ['msePreference', 'MSE preference applicable'],
  ['blacklistingDeclaration', 'Blacklisting declaration required'],
] as const;

const inputClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm outline-none focus:border-[#0b2447] focus:ring-2 focus:ring-[#0b2447]/10';
const textAreaClass = 'min-h-24 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-[#0b2447] focus:ring-2 focus:ring-[#0b2447]/10';

const isBuyerVerified = (user: any) => {
  if (!user || user.role !== 'buyer') return false;
  if (['approved_for_procurement', 'approved'].includes(String(user.onboardingStatus))) return true;
  if (user.organization?.verificationStatus === 'VERIFIED' && !user.organization?.isBlacklisted) return true;
  return Boolean(user.buyerProfile?.verificationStatus === 'VERIFIED' || user.buyerProfile?.verificationStatusEnum === 'VERIFIED');
};

const toIso = (value: string) => new Date(`${value}T10:00:00`).toISOString();

const formatBytes = (size: number) => size < 1024 * 1024 ? `${Math.max(1, Math.round(size / 1024))} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;

export default function BuyerPublishBidPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedMethod = String(searchParams?.get('method') || '').toLowerCase();
  const [form, setForm] = useState<FormState>(() => ({
    ...initialForm,
    buyerOrganizationName: user?.organization?.organizationName || user?.buyerProfile?.organizationName || user?.name || '',
    contactPersonName: user?.name || '',
    contactEmail: user?.email || '',
    contactMobile: user?.mobile || '',
    procurementType: methodToPublishType[selectedMethod] || initialForm.procurementType,
    bidType: methodToBidType[selectedMethod] || initialForm.bidType,
    title: selectedMethod ? `${methodToTitle(selectedMethod)} procurement` : initialForm.title,
    generalTerms: selectedMethod === 'pac'
      ? 'PAC route selected from Create Procurement. Attach PAC certificate and single-source justification before publishing.'
      : selectedMethod === 'emergency'
        ? 'Emergency procurement route selected from Create Procurement. Record approval authority and audit justification before publishing.'
        : initialForm.generalTerms,
  }));
  const [eligibility, setEligibility] = useState<Record<string, boolean>>({
    gstRequired: true,
    panRequired: true,
    udyamRequired: false,
    pastWorkRequired: false,
    oemRequired: false,
    certRequired: false,
    makeInIndiaRequired: false,
    msePreference: false,
    blacklistingDeclaration: true,
  });
  const [requiredDocs, setRequiredDocs] = useState<Record<string, { selected: boolean; required: boolean; instruction: string }>>(() =>
    Object.fromEntries(documentOptions.map(doc => [doc, { selected: ['GST Certificate', 'PAN Card', 'Financial Quote PDF'].includes(doc), required: true, instruction: '' }]))
  );
  const [draftBid, setDraftBid] = useState<any>(null);
  const [files, setFiles] = useState<PendingDoc[]>([]);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [uploadedDocs, setUploadedDocs] = useState<any[]>([]);

  const selectedType = procurementTypes.find(type => type.key === form.procurementType);
  const buyerVerified = isBuyerVerified(user);
  const guard = useMemo(() => {
    if (!user) return { tone: 'amber', message: 'Please login as a buyer to publish a bid.', action: 'Login as Buyer' };
    if (user.role !== 'buyer') return { tone: 'red', message: 'Only buyers can publish RFQ/tender requirements.' };
    if (!buyerVerified) return { tone: 'amber', message: 'Please complete buyer organization verification before publishing bids.' };
    return null;
  }, [buyerVerified, user]);

  const update = <K extends keyof FormState>(key: K, value: FormState[K]) => setForm(prev => ({ ...prev, [key]: value }));

  const validation = useMemo(() => {
    const errors: string[] = [];
    if (!form.title.trim()) errors.push('Bid title is required.');
    if (!form.description.trim()) errors.push('Requirement description is required.');
    if (!form.category.trim()) errors.push('Category is required.');
    if (!form.deliveryLocation.trim()) errors.push('Delivery location is required.');
    if (!form.startDate || !form.endDate) errors.push('Start and end dates are required.');
    if (form.endDate && form.startDate && new Date(form.endDate) <= new Date(form.startDate)) errors.push('End date must be after start date.');
    if (form.technicalOpeningDate && form.endDate && new Date(form.technicalOpeningDate) < new Date(form.endDate)) errors.push('Technical opening date should be after bid end date.');
    if (form.financialOpeningDate && form.technicalOpeningDate && new Date(form.financialOpeningDate) < new Date(form.technicalOpeningDate)) errors.push('Financial opening date should be after technical opening date.');
    if (selectedType?.future) errors.push(`${selectedType.title} is marked for a later phase.`);
    return errors;
  }, [form, selectedType]);

  const buildPayload = () => {
    const selectedDocuments = Object.entries(requiredDocs)
      .filter(([, value]) => value.selected)
      .map(([name, value]) => `${name} - ${value.required ? 'Required' : 'Optional'}${value.instruction ? ` - ${value.instruction}` : ''}`);
    const criteria = [
      ...Object.entries(eligibility).filter(([, value]) => value).map(([key]) => eligibilityFlags.find(([flag]) => flag === key)?.[1] || key),
      form.minExperience ? `Minimum experience: ${form.minExperience} years` : '',
      form.minTurnover ? `Minimum annual turnover: INR ${form.minTurnover}` : '',
      form.emdRequired ? `EMD required: INR ${form.emdAmount || 0}` : 'EMD not required',
    ].filter(Boolean);
    const terms = [
      form.generalTerms && `General terms: ${form.generalTerms}`,
      form.paymentTerms && `Payment terms: ${form.paymentTerms}`,
      form.deliveryTerms && `Delivery terms: ${form.deliveryTerms}`,
      form.penaltyClause && `Penalty clause: ${form.penaltyClause}`,
      form.warrantyTerms && `Warranty terms: ${form.warrantyTerms}`,
      `Evaluation method: ${form.evaluationMethod}`,
      `Award criteria: ${form.awardCriteria}`,
      `Contact: ${form.contactPersonName || user?.name || 'Buyer'} ${form.contactEmail ? `(${form.contactEmail})` : ''} ${form.contactMobile || ''}`,
      `Department: ${form.departmentName || 'Procurement'}`,
      `Delivery timeline: ${form.deliveryTimeline || 'As per bid terms'}`,
      `Installation required: ${form.installationRequired ? 'Yes' : 'No'}`,
      `Warranty required: ${form.warrantyRequired ? 'Yes' : 'No'}`,
      `Inspection required: ${form.inspectionRequired ? 'Yes' : 'No'}`,
      form.clarificationLastDate && `Clarification last date: ${form.clarificationLastDate}`,
      form.expectedAwardDate && `Expected award date: ${form.expectedAwardDate}`,
    ].filter(Boolean);

    return {
      title: form.title.trim(),
      description: `${form.description.trim()}\n\nItem/service: ${form.itemName || form.title}`,
      buyerOrganizationName: form.buyerOrganizationName || user?.organization?.organizationName || user?.name || 'Buyer organization',
      buyerType: form.buyerType,
      category: form.category,
      subCategory: form.subCategory || undefined,
      bidType: form.bidType,
      procurementType: form.procurementType,
      quantity: Number(form.quantity || 1),
      unit: form.unit,
      estimatedValue: Number(form.estimatedValue || 0),
      deliveryLocation: form.deliveryLocation,
      state: form.state,
      district: form.district,
      pincode: form.pincode,
      startDate: toIso(form.startDate),
      endDate: toIso(form.endDate),
      technicalOpeningDate: form.technicalOpeningDate ? toIso(form.technicalOpeningDate) : undefined,
      financialOpeningDate: form.financialOpeningDate ? toIso(form.financialOpeningDate) : undefined,
      bidValidityDate: form.bidValidityDate ? toIso(form.bidValidityDate) : undefined,
      evaluationMethod: form.evaluationMethod,
      isEmdRequired: form.emdRequired,
      emdAmount: form.emdRequired ? Number(form.emdAmount || 0) : undefined,
      documentFee: Number(form.documentFee || 0),
      allowClarification: true,
      allowReverseAuction: false,
      allowBoq: form.procurementType === 'BOQ Bid',
      eligibilityCriteria: criteria,
      requiredDocuments: selectedDocuments,
      termsAndConditions: terms,
    };
  };

  const saveDraft = async () => {
    if (guard) return;
    if (validation.length) {
      toast.error(validation[0]);
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      const saved = draftBid
        ? await procurementBidApi.updateBuyerBid(draftBid.bidNumber || String(draftBid.id), payload)
        : await procurementBidApi.createBuyerBid(payload);
      setDraftBid(saved);
      toast.success(draftBid ? 'Draft updated.' : 'Draft saved.');
      return saved;
    } catch (err: any) {
      toast.error(err?.message || 'Unable to save draft.');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const addFiles = (incoming: FileList | File[]) => {
    setFiles(prev => [...prev, ...Array.from(incoming).map(file => ({
      id: `${file.name}-${file.size}-${Date.now()}-${Math.random()}`,
      file,
      progress: 0,
      status: 'ready' as const,
    }))]);
  };

  const uploadDocs = async (bid = draftBid) => {
    if (!bid || !files.length) {
      if (!bid) toast.error('Save the draft before uploading documents.');
      return;
    }
    setUploading(true);
    setFiles(prev => prev.map(file => ({ ...file, status: 'uploading', progress: 0 })));
    try {
      const uploaded = await procurementBidApi.uploadBuyerBidDocuments(
        bid.bidNumber || String(bid.id),
        files.map(item => item.file),
        { documentType: 'TENDER_DOCUMENT', visibility: 'PUBLIC' },
        (index, percent) => setFiles(prev => prev.map((item, i) => i === index ? { ...item, progress: percent } : item))
      );
      setUploadedDocs(prev => [...prev, ...uploaded]);
      setFiles(prev => prev.map(file => ({ ...file, status: 'uploaded', progress: 100 })));
      toast.success('Bid documents uploaded.');
    } catch (err: any) {
      setFiles(prev => prev.map(file => file.status === 'uploading' ? { ...file, status: 'error', error: err?.message || 'Upload failed' } : file));
      toast.error(err?.message || 'Unable to upload documents.');
    } finally {
      setUploading(false);
    }
  };

  const submitForApproval = async () => {
    if (guard) return;
    const bid = draftBid || await saveDraft();
    if (!bid) return;
    const pendingFiles = files.filter(file => file.status !== 'uploaded');
    if (pendingFiles.length) await uploadDocs(bid);
    setSubmitting(true);
    try {
      const submitted = await procurementBidApi.submitBidForApproval(bid.bidNumber || String(bid.id));
      setDraftBid(submitted);
      const isFeatureEnabled = user?.enabledFeatures?.includes('admin-bid-approval');
      if (isFeatureEnabled) {
        toast.success('Bid submitted for admin approval.');
      } else {
        toast.success('Bid published and verified automatically.');
      }
      setTimeout(() => {
        router.push('/buyer/bids');
      }, 1500);
    } catch (err: any) {
      toast.error(err?.message || 'Unable to submit for approval.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <PageShell>
      <div className="brand-tricolor-strip w-full" />
      <MarketplaceHeader user={user} />
      <main className="mx-auto w-full max-w-7xl px-4 py-5">
        <ProcurementHero
          title="Publish RFQ / Tender Requirement"
          subtitle="Create a buyer bid draft, attach tender documents, and submit it for admin approval."
          action={draftBid ? <StatusBadge label={draftBid.approvalStatus || draftBid.status || 'Draft'} /> : undefined}
        />

        <div className="mt-5 flex flex-col gap-3 border border-blue-100 bg-blue-50 p-4 text-blue-950 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-xs font-black uppercase tracking-widest text-blue-700">Create Procurement is the main entry point</p>
            <p className="mt-1 text-sm font-bold">
              {selectedMethod
                ? `${methodToTitle(selectedMethod)} was selected in Create Procurement. This page is the linked bid workbench for final tender/RFQ publication.`
                : 'For new procurements, start from Create Procurement so the correct method, validation, draft, and approval flow are selected first.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/buyer/procurement/create')}
            className="inline-flex h-10 shrink-0 items-center justify-center rounded-md bg-[#0b2447] px-4 text-xs font-black uppercase text-white"
          >
            Open Create Procurement
          </button>
        </div>

        {guard && (
          <div className={`mt-5 flex flex-col gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between ${guard.tone === 'red' ? 'border-red-200 bg-red-50 text-red-800' : 'border-amber-200 bg-amber-50 text-amber-800'}`}>
            <span className="flex items-center gap-2 text-xs font-black"><AlertTriangle className="h-4 w-4" /> {guard.message}</span>
            {guard.action && <button onClick={() => router.push('/login')} className="h-9 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white">{guard.action}</button>}
          </div>
        )}

        <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_320px]">
          <form className="space-y-5" onSubmit={event => { event.preventDefault(); void saveDraft(); }}>
            <Section icon={<ClipboardList className="h-5 w-5" />} title="Procurement Type">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {procurementTypes.map(type => {
                  const Icon = type.icon;
                  const active = form.procurementType === type.key;
                  return (
                    <button key={type.key} type="button" onClick={() => update('procurementType', type.key)} className={`min-h-28 border p-3 text-left transition ${active ? 'border-[#0b2447] bg-blue-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}>
                      <Icon className={`h-5 w-5 ${active ? 'text-[#0b2447]' : 'text-slate-500'}`} />
                      <p className="mt-2 text-xs font-black text-slate-800">{type.title}</p>
                      <p className="mt-1 text-[11px] leading-4 text-slate-500">{type.description}</p>
                    </button>
                  );
                })}
              </div>
              {selectedType?.future && <p className="mt-3 border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">{selectedType.title} will connect to its dedicated module in a later phase.</p>}
            </Section>

            <Section icon={<Building2 className="h-5 w-5" />} title="Basic Bid Details">
              <div className="grid gap-4 md:grid-cols-2">
                <Input label="Bid title" value={form.title} onChange={v => update('title', v)} required />
                <Input label="Buyer organization name" value={form.buyerOrganizationName} onChange={v => update('buyerOrganizationName', v)} required />
                <Select label="Buyer type" value={form.buyerType} onChange={v => update('buyerType', v)} options={['Private Enterprise', 'MSME Buyer', 'Government Buyer', 'PSU Buyer', 'Large Industry']} />
                <Input label="Department name" value={form.departmentName} onChange={v => update('departmentName', v)} />
                <Input label="Contact person name" value={form.contactPersonName} onChange={v => update('contactPersonName', v)} />
                <Input label="Contact email" value={form.contactEmail} onChange={v => update('contactEmail', v)} />
                <Input label="Contact mobile" value={form.contactMobile} onChange={v => update('contactMobile', v.replace(/\D/g, '').slice(0, 10))} />
                <Select label="Bid type" value={form.bidType} onChange={v => update('bidType', v)} options={['Product', 'Service', 'Works', 'Rate Contract']} required />
                <Input label="Category" value={form.category} onChange={v => update('category', v)} required />
                <Input label="Sub-category" value={form.subCategory} onChange={v => update('subCategory', v)} />
              </div>
            </Section>

            <Section icon={<Package className="h-5 w-5" />} title="Requirement Details">
              <div className="grid gap-4 md:grid-cols-2">
                <Input label="Product/service name" value={form.itemName} onChange={v => update('itemName', v)} required />
                <Input label="Estimated budget/value" value={form.estimatedValue} onChange={v => update('estimatedValue', v.replace(/[^\d.]/g, ''))} required />
                <Field label="Requirement description" value={form.description} onChange={v => update('description', v)} required />
                <Input label="Quantity" value={form.quantity} onChange={v => update('quantity', v.replace(/[^\d.]/g, ''))} required />
                <Input label="Unit" value={form.unit} onChange={v => update('unit', v)} required />
                <Input label="Delivery location" value={form.deliveryLocation} onChange={v => update('deliveryLocation', v)} required />
                <Input label="State" value={form.state} onChange={v => update('state', v)} />
                <Input label="District" value={form.district} onChange={v => update('district', v)} />
                <Input label="Pincode" value={form.pincode} onChange={v => update('pincode', v.replace(/\D/g, '').slice(0, 6))} />
                <Input label="Delivery timeline" value={form.deliveryTimeline} onChange={v => update('deliveryTimeline', v)} />
                <Toggle label="Installation required" value={form.installationRequired} onChange={v => update('installationRequired', v)} />
                <Toggle label="Warranty required" value={form.warrantyRequired} onChange={v => update('warrantyRequired', v)} />
                <Toggle label="Inspection required" value={form.inspectionRequired} onChange={v => update('inspectionRequired', v)} />
              </div>
            </Section>

            <Section icon={<CalendarClock className="h-5 w-5" />} title="Important Dates">
              <div className="grid gap-4 md:grid-cols-3">
                <Input type="date" label="Bid start date" value={form.startDate} onChange={v => update('startDate', v)} required />
                <Input type="date" label="Bid end date" value={form.endDate} onChange={v => update('endDate', v)} required />
                <Input type="date" label="Clarification last date" value={form.clarificationLastDate} onChange={v => update('clarificationLastDate', v)} />
                <Input type="date" label="Technical opening date" value={form.technicalOpeningDate} onChange={v => update('technicalOpeningDate', v)} />
                <Input type="date" label="Financial opening date" value={form.financialOpeningDate} onChange={v => update('financialOpeningDate', v)} />
                <Input type="date" label="Bid validity date" value={form.bidValidityDate} onChange={v => update('bidValidityDate', v)} />
                <Input type="date" label="Expected award date" value={form.expectedAwardDate} onChange={v => update('expectedAwardDate', v)} />
              </div>
            </Section>

            <Section icon={<ShieldCheck className="h-5 w-5" />} title="Eligibility Criteria">
              <div className="grid gap-3 md:grid-cols-3">
                {eligibilityFlags.map(([key, label]) => (
                  <label key={key} className={`flex min-h-12 items-center gap-3 border p-3 text-xs font-bold ${eligibility[key] ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-white text-slate-600'}`}>
                    <input type="checkbox" checked={eligibility[key]} onChange={event => setEligibility(prev => ({ ...prev, [key]: event.target.checked }))} className="h-4 w-4 accent-[#0b2447]" />
                    {label}
                  </label>
                ))}
              </div>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <Input label="Minimum years of experience" value={form.minExperience} onChange={v => update('minExperience', v.replace(/[^\d.]/g, ''))} />
                <Input label="Minimum annual turnover" value={form.minTurnover} onChange={v => update('minTurnover', v.replace(/[^\d.]/g, ''))} />
                <Toggle label="EMD required" value={form.emdRequired} onChange={v => update('emdRequired', v)} />
                <Input label="EMD amount" value={form.emdAmount} onChange={v => update('emdAmount', v.replace(/[^\d.]/g, ''))} />
                <Input label="Document fee, if any" value={form.documentFee} onChange={v => update('documentFee', v.replace(/[^\d.]/g, ''))} />
              </div>
            </Section>

            <Section icon={<FileCheck2 className="h-5 w-5" />} title="Required Seller Documents">
              <div className="grid gap-3 md:grid-cols-2">
                {documentOptions.map(doc => {
                  const state = requiredDocs[doc];
                  return (
                    <div key={doc} className={`border p-3 ${state.selected ? 'border-[#0b2447]/30 bg-blue-50' : 'border-slate-200 bg-white'}`}>
                      <label className="flex items-center gap-2 text-xs font-black text-slate-700">
                        <input type="checkbox" checked={state.selected} onChange={event => setRequiredDocs(prev => ({ ...prev, [doc]: { ...prev[doc], selected: event.target.checked } }))} className="h-4 w-4 accent-[#0b2447]" />
                        {doc}
                      </label>
                      {state.selected && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-[120px_1fr]">
                          <select value={state.required ? 'required' : 'optional'} onChange={event => setRequiredDocs(prev => ({ ...prev, [doc]: { ...prev[doc], required: event.target.value === 'required' } }))} className={inputClass}>
                            <option value="required">Required</option>
                            <option value="optional">Optional</option>
                          </select>
                          <input value={state.instruction} onChange={event => setRequiredDocs(prev => ({ ...prev, [doc]: { ...prev[doc], instruction: event.target.value } }))} placeholder="Short instruction" className={inputClass} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Section>

            <Section icon={<FileText className="h-5 w-5" />} title="Terms and Conditions">
              <div className="grid gap-4 md:grid-cols-2">
                <Field label="General terms and conditions" value={form.generalTerms} onChange={v => update('generalTerms', v)} />
                <Field label="Payment terms" value={form.paymentTerms} onChange={v => update('paymentTerms', v)} />
                <Field label="Delivery terms" value={form.deliveryTerms} onChange={v => update('deliveryTerms', v)} />
                <Field label="Penalty clause" value={form.penaltyClause} onChange={v => update('penaltyClause', v)} />
                <Field label="Warranty terms" value={form.warrantyTerms} onChange={v => update('warrantyTerms', v)} />
                <Select label="Evaluation method" value={form.evaluationMethod} onChange={v => update('evaluationMethod', v)} options={['Lowest price among technically qualified sellers', 'Quality and cost based selection', 'Item-wise L1', 'Overall L1']} required />
                <Select label="Award criteria" value={form.awardCriteria} onChange={v => update('awardCriteria', v)} options={['Overall L1', 'Item-wise L1', 'Split award allowed', 'Buyer committee recommendation']} required />
              </div>
            </Section>

            <Section icon={<FileUp className="h-5 w-5" />} title="Tender / Specification / BOQ Documents">
              <UploadDropZone onFiles={addFiles} />
              <div className="mt-4 space-y-2">
                {files.map(file => (
                  <div key={file.id} className="border border-slate-200 bg-slate-50 p-3">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                      <FileText className="h-5 w-5 text-[#0b2447]" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-xs font-black text-slate-800">{file.file.name}</p>
                        <p className="text-[10px] font-bold text-slate-500">{formatBytes(file.file.size)} - {file.status}</p>
                        {file.status === 'uploading' && <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-[#0b2447]" style={{ width: `${file.progress}%` }} /></div>}
                        {file.error && <p className="mt-1 text-[10px] font-bold text-red-600">{file.error}</p>}
                      </div>
                      {file.status !== 'uploaded' && <button type="button" onClick={() => setFiles(prev => prev.filter(item => item.id !== file.id))} className="inline-flex h-8 items-center gap-1 rounded-md border border-red-200 bg-white px-3 text-[10px] font-black text-red-600"><Trash2 className="h-3.5 w-3.5" /> Remove</button>}
                    </div>
                  </div>
                ))}
              </div>
              {uploadedDocs.length > 0 && <p className="mt-3 text-xs font-bold text-emerald-700">{uploadedDocs.length} bid document(s) uploaded to backend.</p>}
              <div className="mt-4">
                <button type="button" onClick={() => uploadDocs()} disabled={!draftBid || !files.length || uploading} className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 disabled:opacity-50">
                  {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Upload documents
                </button>
              </div>
            </Section>

            {validation.length > 0 && (
              <div className="border border-amber-200 bg-amber-50 p-4">
                <p className="text-xs font-black uppercase tracking-wider text-amber-800">Validation</p>
                <ul className="mt-2 space-y-1 text-xs font-bold text-amber-800">{validation.map(item => <li key={item}>- {item}</li>)}</ul>
              </div>
            )}
          </form>

          <aside className="lg:sticky lg:top-28 lg:self-start">
            <div className="border border-slate-200 bg-white p-4">
              <p className="text-sm font-black text-[#0b2447]">Publish Status</p>
              <div className="mt-4 space-y-3">
                <Ready ok={!guard} label="Buyer access verified" />
                <Ready ok={validation.length === 0} label="Required form fields valid" />
                <Ready ok={Boolean(draftBid)} label={draftBid ? `Draft saved: ${draftBid.bidNumber || draftBid.id}` : 'Draft not saved'} />
                <Ready ok={uploadedDocs.length > 0 || files.length === 0} label={files.length ? 'Documents uploaded' : 'Documents optional'} />
                <Ready ok={draftBid?.approvalStatus === 'PENDING' || draftBid?.status === 'PENDING_ADMIN_APPROVAL'} label="Submitted for admin approval" />
              </div>
              <div className="mt-5 space-y-2">
                <button type="button" onClick={() => void saveDraft()} disabled={Boolean(guard) || saving || validation.length > 0} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 disabled:opacity-50">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save draft
                </button>
                <button type="button" onClick={() => void submitForApproval()} disabled={Boolean(guard) || saving || uploading || submitting || validation.length > 0} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white disabled:opacity-50">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Submit for approval
                </button>
                <button type="button" onClick={() => { setForm(initialForm); setDraftBid(null); setFiles([]); setUploadedDocs([]); }} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">
                  <RotateCcw className="h-4 w-4" /> Reset
                </button>
              </div>
            </div>
          </aside>
        </div>
      </main>
      <MarketplaceFooter />
    </PageShell>
  );
}

function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <section className="border border-slate-200 bg-white p-4">
      <div className="mb-4 flex items-center gap-3 border-b border-slate-100 pb-3">
        <div className="flex h-9 w-9 items-center justify-center rounded-md bg-[#0b2447] text-white">{icon}</div>
        <h2 className="text-base font-black text-[#0b2447]">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Input({ label, value, onChange, type = 'text', required }: { label: string; value: string; onChange: (value: string) => void; type?: string; required?: boolean }) {
  return (
    <label>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}{required ? ' *' : ''}</span>
      <input type={type} value={value} onChange={event => onChange(event.target.value)} className={inputClass} />
    </label>
  );
}

function Field({ label, value, onChange, required }: { label: string; value: string; onChange: (value: string) => void; required?: boolean }) {
  return (
    <label className="md:col-span-2">
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}{required ? ' *' : ''}</span>
      <textarea value={value} onChange={event => onChange(event.target.value)} className={textAreaClass} />
    </label>
  );
}

function Select({ label, value, onChange, options, required }: { label: string; value: string; onChange: (value: string) => void; options: string[]; required?: boolean }) {
  return (
    <label>
      <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label}{required ? ' *' : ''}</span>
      <select value={value} onChange={event => onChange(event.target.value)} className={inputClass}>
        {options.map(option => <option key={option} value={option}>{option}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <label className={`flex h-10 items-center justify-between rounded-md border px-3 text-xs font-black ${value ? 'border-[#0b2447] bg-blue-50 text-[#0b2447]' : 'border-slate-200 bg-white text-slate-600'}`}>
      {label}
      <input type="checkbox" checked={value} onChange={event => onChange(event.target.checked)} className="h-4 w-4 accent-[#0b2447]" />
    </label>
  );
}

function Ready({ ok, label }: { ok: boolean; label: string }) {
  return <div className="flex items-center gap-2 text-xs font-bold text-slate-600">{ok ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-amber-500" />} {label}</div>;
}

function UploadDropZone({ onFiles }: { onFiles: (files: FileList | File[]) => void }) {
  const [dragging, setDragging] = useState(false);
  return (
    <label
      onDragOver={event => { event.preventDefault(); setDragging(true); }}
      onDragLeave={() => setDragging(false)}
      onDrop={event => {
        event.preventDefault();
        setDragging(false);
        if (event.dataTransfer.files.length) onFiles(event.dataTransfer.files);
      }}
      className={`flex min-h-32 cursor-pointer flex-col items-center justify-center border border-dashed p-5 text-center ${dragging ? 'border-[#0b2447] bg-blue-50 text-[#0b2447]' : 'border-slate-300 bg-slate-50 text-slate-600 hover:bg-white'}`}
    >
      <FileUp className="h-8 w-8" />
      <span className="mt-3 text-sm font-black">Drag and drop tender/specification files</span>
      <span className="mt-1 text-xs">PDF, DOC, DOCX, XLS, XLSX, CSV, JPG, PNG up to 10 MB</span>
      <input type="file" multiple accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png" onChange={event => event.target.files && onFiles(event.target.files)} className="hidden" />
    </label>
  );
}
