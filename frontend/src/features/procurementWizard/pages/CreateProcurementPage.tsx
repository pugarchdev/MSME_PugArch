'use client';

import React, { useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  Gavel,
  History,
  Info,
  Package,
  Paperclip,
  Plus,
  Save,
  Send,
  ShieldCheck,
  ShoppingCart,
  Trash2,
  Upload,
  Users,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { PROCUREMENT_DRAFTS_ROUTE } from '../api';
import { DELIVERY_TYPES, PAYMENT_TERMS, QUANTITY_UNITS } from '../../../constants/dropdowns';

type ProcurementType = 'direct' | 'comparison' | 'rfq' | 'tender' | 'auction';
type StepKind = 'basics' | 'items' | 'vendors' | 'schedule' | 'rules' | 'documents' | 'approval' | 'review';

type ItemRow = {
  id: string;
  name: string;
  specification: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  gst: number;
  deliveryDate: string;
  brandPolicy: string;
  technicalSpecification: string;
  specificationFileName: string;
};

type DocumentRow = {
  id: string;
  name: string;
  requirement: 'Mandatory' | 'Optional' | 'Not Required';
  fileName: string;
  version: number;
};

type PaymentMilestone = {
  id: string;
  label: string;
  percentage: string;
  trigger: string;
};

type Draft = {
  type: ProcurementType;
  basics: {
    title: string;
    category: string;
    subCategory: string;
    department: string;
    priority: 'Normal' | 'Urgent' | 'Emergency';
    requirementType: 'Goods' | 'Services' | 'Works' | 'Consultancy';
    estimatedValue: number;
    fundingSource: string;
    costCenter: string;
    justification: string;
  };
  vendors: {
    selection: 'Open' | 'Selected Vendors' | 'Single / PAC Vendor';
    inviteCount: number;
    msmePreference: boolean;
    makeInIndiaPreference: boolean;
    localVendorPreference: boolean;
    minimumTurnover: string;
    experienceYears: string;
    complianceNotes: string;
  };
  schedule: {
    publishDate: string;
    submissionDate: string;
    openingDate: string;
    validityDays: number;
    deliveryDate: string;
    preBidMeeting: boolean;
    preBidDate: string;
  };
  rules: {
    bidType: 'Single Bid' | 'Two Bid' | 'Price Bid Only';
    evaluation: 'L1 Lowest Price' | 'QCBS' | 'Technical then Financial';
    emdRequired: boolean;
    emdAmount: number;
    performanceSecurity: boolean;
    reverseAuctionIntent: boolean;
    startPrice: number;
    reservePrice: number;
    minimumDecrement: number;
    autoExtension: boolean;
    hideVendorIdentity: boolean;
  };
  items: ItemRow[];
  documents: DocumentRow[];
  approval: {
    workflow: 'Department Approval' | 'Finance + Procurement' | 'Competent Authority';
    approver: string;
    notes: string;
  };
  tender: {
    tenderNumber: string;
    tenderType: string;
    tenderMode: string;
    visibility: string;
    shortDescription: string;
    scopeOfWork: string;
    purpose: string;
    deliveryLocation: string;
    deliveryType: string;
    deliveryTimeline: string;
    installationRequired: boolean;
    trainingRequired: boolean;
    specialInstructions: string;
    currency: string;
    priceType: string;
    taxType: string;
    gstIncluded: boolean;
    gstRate: string;
    paymentTerms: string;
    performanceSecurityAmount: string;
    milestones: PaymentMilestone[];
    bidStartDate: string;
    bidClosingDate: string;
    bidClosingTime: string;
    technicalEvaluationDate: string;
    financialEvaluationDate: string;
    awardDate: string;
    startupPreference: boolean;
    shgPreference: boolean;
    womenOwnedPreference: boolean;
    gstMandatory: boolean;
    panMandatory: boolean;
    requiredCertifications: string;
    technicalWeightage: string;
    experienceScore: string;
    certificationScore: string;
    complianceScore: string;
    priceWeightage: string;
    evaluationMethod: string;
    contactName: string;
    contactEmail: string;
    contactMobile: string;
    contactPhone: string;
    departmentContact: string;
    escalationContact: string;
    approvalRequired: boolean;
    approverName: string;
    approverRemarks: string;
    approvalChain: string;
    approvalStatus: string;
    documentUrl: string;
  };
  updatedAt?: string;
};

type MethodConfig = {
  id: ProcurementType;
  title: string;
  subtitle: string;
  icon: typeof ShoppingCart;
  accent: string;
  route?: string;
  fit: string[];
  gates: string[];
};

type StepConfig = {
  id: StepKind;
  label: string;
  description: string;
  icon: typeof ClipboardCheck;
};

const DRAFT_KEY = 'msme:guided-procurement-create:v1';
const TENDER_HANDOFF_KEY = 'msme:tender-create-prefill:v1';
const today = new Date().toISOString().slice(0, 10);
const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const nextFortnight = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const makeId = () => Math.random().toString(36).slice(2, 10);

const PROCUREMENT_CATEGORY_OPTIONS = [
  'Construction',
  'Civil Work',
  'Electrical',
  'Mechanical',
  'Hydraulics',
  'Industrial Machinery',
  'Automation',
  'IT & Software',
  'Cloud Services',
  'Networking',
  'Office Equipment',
  'Furniture',
  'Catering',
  'Housekeeping',
  'Security Services',
  'Transportation',
  'Logistics',
  'Packaging',
  'Printing',
  'Medical Supplies',
  'Laboratory Equipment',
  'Chemicals',
  'Steel & Metals',
  'Cement & Building Materials',
  'Safety Equipment',
  'Fire Safety',
  'Power & Energy',
  'Telecom',
  'Repair & Maintenance',
  'AMC Services',
  'Consultancy Services',
  'Office Supplies',
  'General Services',
  'OEM Supply',
  'Manpower Supply',
];

const REQUIREMENT_TYPE_OPTIONS = ['Goods', 'Services', 'Works', 'Consultancy'];
const PRIORITY_OPTIONS = ['Normal', 'Urgent', 'Emergency'];
const TENDER_TYPE_OPTIONS = ['Open Tender', 'Limited Tender', 'Single Tender', 'Global Tender', 'Expression of Interest', 'Request for Quotation'];
const TENDER_MODE_OPTIONS = ['Single Bid', 'Two Bid', 'Three Packet', 'Reverse Auction enabled'];
const TENDER_VISIBILITY_OPTIONS = ['Public marketplace', 'Verified suppliers', 'Invited suppliers only', 'MSME suppliers only'];
const SUPPLIER_SELECTION_OPTIONS = ['Open', 'Selected Vendors', 'Single / PAC Vendor'];
const BID_TYPE_OPTIONS = ['Single Bid', 'Two Bid', 'Price Bid Only'];
const EVALUATION_OPTIONS = ['L1 Lowest Price', 'QCBS', 'Technical then Financial'];
const TENDER_EVALUATION_OPTIONS = ['L1 method', 'L2 / L3 comparison', 'QCBS method', 'Technical compliance then L1', 'Reverse auction'];
const PRICE_TYPE_OPTIONS = ['Firm fixed price', 'Variable price', 'Rate contract', 'Item-wise price', 'Milestone-based'];
const TAX_TYPE_OPTIONS = ['GST', 'IGST', 'Exempt', 'Composite tax'];
const DOCUMENT_REQUIREMENT_OPTIONS: DocumentRow['requirement'][] = ['Mandatory', 'Optional', 'Not Required'];
const BRAND_POLICY_OPTIONS = ['Equivalent or better allowed', 'OEM only', 'No brand restriction', 'Specific make with justification'];
const APPROVAL_STATUS_OPTIONS = ['Draft', 'Pending department approval', 'Pending finance approval', 'Approved', 'Returned for correction'];
const APPROVAL_WORKFLOW_OPTIONS = ['Department Approval', 'Finance + Procurement', 'Competent Authority'];

const methodConfigs: MethodConfig[] = [
  {
    id: 'direct',
    title: 'Direct Purchase',
    subtitle: 'Known item, low value, quick approval',
    icon: ShoppingCart,
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    route: '/buyer/direct-purchase',
    fit: ['Low value or PAC purchase', 'Known seller or catalogue item', 'Budget check before approval'],
    gates: ['Vendor and bank verification', 'Budget availability', 'Short approval workflow'],
  },
  {
    id: 'comparison',
    title: 'L1 Comparison',
    subtitle: 'Compare sellers before order',
    icon: BarChart3,
    accent: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    route: '/buyer/marketplace',
    fit: ['Comparable catalogue items', 'Need price reasonableness record', 'Shortlisting 3 or more sellers'],
    gates: ['Equivalent specifications', 'Tax and freight comparison', 'Approval of selected L1'],
  },
  {
    id: 'rfq',
    title: 'RFQ / eRFQ',
    subtitle: 'Request quotations with controlled vendor invite',
    icon: FileText,
    accent: 'border-blue-200 bg-blue-50 text-blue-800',
    route: '/buyer/rfq',
    fit: ['Custom specification', 'Need quote validity', 'Open or invited supplier set'],
    gates: ['Clear BOQ/specification', 'Submission schedule', 'Commercial and eligibility terms'],
  },
  {
    id: 'tender',
    title: 'Tender / e-Bid',
    subtitle: 'Published bidding with committee evaluation',
    icon: ClipboardCheck,
    accent: 'border-amber-200 bg-amber-50 text-amber-900',
    route: '/buyer/tenders',
    fit: ['Higher value procurement', 'Two-bid or formal compliance checks', 'Public audit trail needed'],
    gates: ['NIT and document checklist', 'Bid opening committee', 'Technical and financial evaluation'],
  },
  {
    id: 'auction',
    title: 'Reverse Auction',
    subtitle: 'Price discovery after qualified competition',
    icon: Gavel,
    accent: 'border-violet-200 bg-violet-50 text-violet-800',
    route: '/reverse-auctions/create',
    fit: ['Comparable items and qualified bidders', 'Need transparent price reduction', 'RA intent declared upfront'],
    gates: ['Start and reserve price', 'Minimum decrement', 'Auto-extension and rank visibility rules'],
  },
];

const stepLibrary: Record<StepKind, StepConfig> = {
  basics: { id: 'basics', label: 'Requirement', description: 'Purpose, category, value and budget ownership', icon: ClipboardCheck },
  items: { id: 'items', label: 'Items / BOQ', description: 'Line items, quantity, tax and specifications', icon: Package },
  vendors: { id: 'vendors', label: 'Suppliers', description: 'Vendor reach, preferences and eligibility filters', icon: Users },
  schedule: { id: 'schedule', label: 'Schedule', description: 'Publishing, submission, opening and delivery dates', icon: CalendarClock },
  rules: { id: 'rules', label: 'Rules', description: 'Bid mode, EMD, evaluation and auction settings', icon: ShieldCheck },
  documents: { id: 'documents', label: 'Documents', description: 'Mandatory documents and compliance files', icon: Upload },
  approval: { id: 'approval', label: 'Approval', description: 'Review chain and publishing controls', icon: BadgeCheck },
  review: { id: 'review', label: 'Review', description: 'Readiness checks before moving ahead', icon: CheckCircle2 },
};

const stepsByType: Record<ProcurementType, StepKind[]> = {
  direct: ['basics', 'items', 'vendors', 'schedule', 'approval', 'review'],
  comparison: ['basics', 'items', 'vendors', 'schedule', 'approval', 'review'],
  rfq: ['basics', 'items', 'vendors', 'schedule', 'rules', 'documents', 'approval', 'review'],
  tender: ['basics', 'items', 'schedule', 'vendors', 'rules', 'documents', 'approval', 'review'],
  auction: ['basics', 'items', 'vendors', 'rules', 'schedule', 'documents', 'approval', 'review'],
};

const defaultDocuments = (type: ProcurementType = 'rfq'): DocumentRow[] => [
  { id: makeId(), name: type === 'tender' ? 'Tender Specification File' : 'Requirement note / indent approval', requirement: 'Mandatory', fileName: '', version: 1 },
  { id: makeId(), name: 'BOQ / Price Schedule', requirement: 'Mandatory', fileName: '', version: 1 },
  { id: makeId(), name: 'Terms & Conditions', requirement: 'Mandatory', fileName: '', version: 1 },
  { id: makeId(), name: type === 'tender' ? 'Annexures / Drawings' : 'Technical specification', requirement: type === 'tender' ? 'Optional' : 'Mandatory', fileName: '', version: 1 },
  { id: makeId(), name: type === 'tender' ? 'Technical Documents' : 'Commercial terms and delivery conditions', requirement: type === 'tender' ? 'Optional' : 'Mandatory', fileName: '', version: 1 },
  { id: makeId(), name: type === 'tender' ? 'Compliance Documents' : 'Budget approval / fund availability', requirement: type === 'tender' ? 'Optional' : 'Mandatory', fileName: '', version: 1 },
  { id: makeId(), name: 'Other Attachments', requirement: 'Optional', fileName: '', version: 1 },
];

const emptyMilestone = (): PaymentMilestone => ({
  id: makeId(),
  label: 'Delivery acceptance',
  percentage: '100',
  trigger: 'After delivery, inspection, and acceptance',
});

const defaultTenderDetails = () => ({
  tenderNumber: `TDR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
  tenderType: 'Open Tender',
  tenderMode: 'Two Bid',
  visibility: 'Verified suppliers',
  shortDescription: '',
  scopeOfWork: '',
  purpose: '',
  deliveryLocation: '',
  deliveryType: '',
  deliveryTimeline: '',
  installationRequired: false,
  trainingRequired: false,
  specialInstructions: '',
  currency: 'INR',
  priceType: 'Firm fixed price',
  taxType: 'GST',
  gstIncluded: true,
  gstRate: '18',
  paymentTerms: '',
  performanceSecurityAmount: '',
  milestones: [emptyMilestone()],
  bidStartDate: '',
  bidClosingDate: '',
  bidClosingTime: '',
  technicalEvaluationDate: '',
  financialEvaluationDate: '',
  awardDate: '',
  startupPreference: false,
  shgPreference: false,
  womenOwnedPreference: false,
  gstMandatory: true,
  panMandatory: true,
  requiredCertifications: '',
  technicalWeightage: '70',
  experienceScore: '20',
  certificationScore: '20',
  complianceScore: '30',
  priceWeightage: '30',
  evaluationMethod: 'QCBS method',
  contactName: '',
  contactEmail: '',
  contactMobile: '',
  contactPhone: '',
  departmentContact: '',
  escalationContact: '',
  approvalRequired: true,
  approverName: '',
  approverRemarks: '',
  approvalChain: 'Department Head > Finance > Procurement Head',
  approvalStatus: 'Draft',
  documentUrl: '',
});

const defaultDraft = (type: ProcurementType = 'rfq'): Draft => ({
  type,
  basics: {
    title: '',
    category: type === 'tender' ? '' : type === 'direct' ? 'Office Supplies' : 'Goods',
    subCategory: '',
    department: '',
    priority: 'Normal',
    requirementType: 'Goods',
    estimatedValue: 0,
    fundingSource: '',
    costCenter: '',
    justification: '',
  },
  vendors: {
    selection: type === 'direct' ? 'Single / PAC Vendor' : 'Open',
    inviteCount: 0,
    msmePreference: true,
    makeInIndiaPreference: true,
    localVendorPreference: false,
    minimumTurnover: '',
    experienceYears: '',
    complianceNotes: '',
  },
  schedule: {
    publishDate: today,
    submissionDate: nextWeek,
    openingDate: nextWeek,
    validityDays: 90,
    deliveryDate: nextFortnight,
    preBidMeeting: false,
    preBidDate: '',
  },
  rules: {
    bidType: type === 'direct' || type === 'comparison' ? 'Price Bid Only' : 'Two Bid',
    evaluation: 'L1 Lowest Price',
    emdRequired: false,
    emdAmount: 0,
    performanceSecurity: false,
    reverseAuctionIntent: type === 'auction',
    startPrice: 0,
    reservePrice: 0,
    minimumDecrement: 5000,
    autoExtension: true,
    hideVendorIdentity: true,
  },
  items: [
    {
      id: makeId(),
      name: '',
      specification: '',
      quantity: 1,
      unit: 'Nos',
      unitPrice: 0,
      gst: 18,
      deliveryDate: '',
      brandPolicy: 'Equivalent or better allowed',
      technicalSpecification: '',
      specificationFileName: '',
    },
  ],
  documents: defaultDocuments(type),
  approval: {
    workflow: 'Finance + Procurement',
    approver: '',
    notes: '',
  },
  tender: defaultTenderDetails(),
});

const money = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(Number.isFinite(value) ? value : 0);

const itemTotal = (item: ItemRow) => item.quantity * item.unitPrice * (1 + item.gst / 100);
const subtotal = (items: ItemRow[]) => items.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0);
const grandTotal = (items: ItemRow[]) => items.reduce((sum, item) => sum + itemTotal(item), 0);

const recommendProcurementType = (draft: Draft): ProcurementType => {
  const value = draft.basics.estimatedValue || grandTotal(draft.items);
  if (draft.type === 'auction' && draft.rules.reverseAuctionIntent) return 'auction';
  if (value > 1000000) return 'tender';
  if (value > 50000 && draft.vendors.selection === 'Open') return 'rfq';
  if (value > 50000) return 'comparison';
  return 'direct';
};

const methodLabel = (type: ProcurementType) => methodConfigs.find(method => method.id === type)?.title || type;

const buildTenderHandoffDraft = (draft: Draft) => ({
  title: draft.basics.title,
  tenderNumber: draft.tender.tenderNumber,
  tenderType: draft.tender.tenderType,
  category: draft.basics.category,
  subCategory: draft.basics.subCategory,
  department: draft.basics.department,
  tenderMode: draft.tender.tenderMode,
  visibility: draft.tender.visibility,
  shortDescription: draft.tender.shortDescription,
  scopeOfWork: draft.tender.scopeOfWork || draft.basics.justification,
  purpose: draft.tender.purpose || draft.basics.justification,
  items: draft.items.map(item => ({
    id: item.id,
    name: item.name,
    description: item.specification,
    quantity: String(item.quantity || 1),
    unit: item.unit,
    deliveryDate: item.deliveryDate,
    brandPolicy: item.brandPolicy,
    technicalSpecification: item.technicalSpecification,
    specificationFileName: item.specificationFileName,
  })),
  deliveryLocation: draft.tender.deliveryLocation,
  deliveryType: draft.tender.deliveryType,
  deliveryTimeline: draft.tender.deliveryTimeline,
  installationRequired: draft.tender.installationRequired,
  trainingRequired: draft.tender.trainingRequired,
  specialInstructions: draft.tender.specialInstructions,
  budget: String(draft.basics.estimatedValue || subtotal(draft.items) || ''),
  currency: draft.tender.currency,
  priceType: draft.tender.priceType,
  taxType: draft.tender.taxType,
  gstIncluded: draft.tender.gstIncluded,
  gstRate: draft.tender.gstRate,
  paymentTerms: draft.tender.paymentTerms,
  emdRequired: draft.rules.emdRequired,
  emdAmount: draft.rules.emdAmount ? String(draft.rules.emdAmount) : '',
  performanceSecurityRequired: draft.rules.performanceSecurity,
  performanceSecurityAmount: draft.tender.performanceSecurityAmount,
  milestones: draft.tender.milestones,
  publishDate: draft.schedule.publishDate,
  bidStartDate: draft.tender.bidStartDate,
  bidClosingDate: draft.tender.bidClosingDate,
  bidClosingTime: draft.tender.bidClosingTime,
  technicalEvaluationDate: draft.tender.technicalEvaluationDate,
  financialEvaluationDate: draft.tender.financialEvaluationDate,
  awardDate: draft.tender.awardDate,
  documents: draft.documents.map(document => ({
    id: document.id,
    label: document.name,
    requirement: document.requirement,
    fileName: document.fileName,
    version: document.version,
  })),
  msmePreference: draft.vendors.msmePreference,
  startupPreference: draft.tender.startupPreference,
  shgPreference: draft.tender.shgPreference,
  womenOwnedPreference: draft.tender.womenOwnedPreference,
  localSupplierPreference: draft.vendors.localVendorPreference,
  minExperience: draft.vendors.experienceYears,
  minTurnover: draft.vendors.minimumTurnover,
  requiredCertifications: draft.tender.requiredCertifications,
  gstMandatory: draft.tender.gstMandatory,
  panMandatory: draft.tender.panMandatory,
  technicalWeightage: draft.tender.technicalWeightage,
  experienceScore: draft.tender.experienceScore,
  certificationScore: draft.tender.certificationScore,
  complianceScore: draft.tender.complianceScore,
  priceWeightage: draft.tender.priceWeightage,
  evaluationMethod: draft.tender.evaluationMethod,
  contactName: draft.tender.contactName,
  contactEmail: draft.tender.contactEmail,
  contactMobile: draft.tender.contactMobile,
  contactPhone: draft.tender.contactPhone,
  departmentContact: draft.tender.departmentContact,
  escalationContact: draft.tender.escalationContact,
  approvalRequired: draft.tender.approvalRequired,
  approverName: draft.tender.approverName || draft.approval.approver,
  approverRemarks: draft.tender.approverRemarks || draft.approval.notes,
  approvalChain: draft.tender.approvalChain,
  approvalStatus: draft.tender.approvalStatus,
  documentUrl: draft.tender.documentUrl,
});

export default function CreateProcurementPage() {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>(() => defaultDraft());
  const [activeStep, setActiveStep] = useState(0);
  const [preview, setPreview] = useState(false);

  useEffect(() => {
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Draft>;
        const type = parsed.type && stepsByType[parsed.type] ? parsed.type : 'rfq';
        setDraft({ ...defaultDraft(type), ...parsed, tender: { ...defaultTenderDetails(), ...parsed.tender } });
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, []);

  const activeSteps = stepsByType[draft.type];
  const currentStep = activeSteps[Math.min(activeStep, activeSteps.length - 1)];
  const method = methodConfigs.find(config => config.id === draft.type) || methodConfigs[2];
  const recommendedType = useMemo(() => recommendProcurementType(draft), [draft]);
  const readiness = useMemo(() => getReadiness(draft), [draft]);

  useEffect(() => {
    if (activeStep > activeSteps.length - 1) setActiveStep(activeSteps.length - 1);
  }, [activeStep, activeSteps.length]);

  const updateDraft = (updater: (current: Draft) => Draft) => {
    setDraft(current => {
      const next = { ...updater(current), updatedAt: new Date().toISOString() };
      return next;
    });
  };

  const changeType = (type: ProcurementType) => {
    setDraft({ ...defaultDraft(type), updatedAt: new Date().toISOString() });
    setPreview(false);
    setActiveStep(0);
    toast.info(`${methodLabel(type)} draft started`);
  };

  const saveDraft = () => {
    localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, updatedAt: new Date().toISOString() }));
    toast.success('Procurement draft saved');
  };

  const continueToModule = () => {
    saveDraft();
    if (draft.type === 'tender') {
      localStorage.setItem(TENDER_HANDOFF_KEY, JSON.stringify(buildTenderHandoffDraft(draft)));
    }
    if (method.route) {
      router.push(method.route);
      return;
    }
    toast.success('Tender workbench draft is ready for approval');
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1720px] flex-col gap-4 px-4 py-4 lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={() => router.back()}
                className="mb-2 inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-widest text-slate-500 hover:text-[#12335f]"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Procurement
              </button>
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="text-2xl font-black tracking-tight text-slate-950">Create Procurement</h1>
                <span className={cn('rounded-full border px-3 py-1 text-[11px] font-black uppercase', method.accent)}>
                  {method.title}
                </span>
                {recommendedType !== draft.type && (
                  <span className="rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-[11px] font-black text-amber-800">
                    Suggested: {methodLabel(recommendedType)}
                  </span>
                )}
              </div>
              <p className="mt-1 max-w-3xl text-sm font-semibold text-slate-500">
                Choose the procurement route first, then complete only the controls needed for that route.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" onClick={() => router.push(PROCUREMENT_DRAFTS_ROUTE)} className="h-10">
                <History className="mr-2 h-4 w-4" /> Drafts
              </Button>
              <Button type="button" variant="outline" onClick={() => setPreview(value => !value)} className="h-10">
                <Info className="mr-2 h-4 w-4" /> {preview ? 'Edit' : 'Preview'}
              </Button>
              <Button type="button" variant="outline" onClick={saveDraft} className="h-10">
                <Save className="mr-2 h-4 w-4" /> Save Draft
              </Button>
              <Button type="button" onClick={continueToModule} className="h-10 bg-[#12335f] text-white">
                <Send className="mr-2 h-4 w-4" /> Continue
              </Button>
            </div>
          </div>

          <div className="grid gap-3 xl:grid-cols-5">
            {methodConfigs.map(config => (
              <MethodCard
                key={config.id}
                config={config}
                selected={draft.type === config.id}
                recommended={recommendedType === config.id}
                onSelect={() => changeType(config.id)}
              />
            ))}
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1720px] gap-4 px-4 py-5 lg:px-6 xl:grid-cols-[300px_1fr_330px]">
        <aside className="space-y-4">
          <Panel title="Process" icon={<ClipboardCheck className="h-4 w-4" />}>
            <div className="space-y-2">
              {activeSteps.map((stepId, index) => {
                const step = stepLibrary[stepId];
                const Icon = step.icon;
                const active = currentStep === stepId;
                const done = index < activeStep;
                return (
                  <button
                    key={stepId}
                    type="button"
                    onClick={() => setActiveStep(index)}
                    className={cn(
                      'flex w-full items-start gap-3 rounded-lg border px-3 py-2 text-left transition',
                      active ? 'border-[#12335f] bg-[#12335f]/5' : 'border-slate-200 bg-white hover:bg-slate-50'
                    )}
                  >
                    <span className={cn('mt-0.5 flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-black', done ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : active ? 'border-[#12335f] bg-[#12335f] text-white' : 'border-slate-200 text-slate-400')}>
                      {done ? <CheckCircle2 className="h-4 w-4" /> : index + 1}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-1.5 text-sm font-black text-slate-900">
                        <Icon className="h-3.5 w-3.5" /> {step.label}
                      </span>
                      <span className="mt-0.5 block text-[11px] font-semibold leading-4 text-slate-500">{step.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Panel>

          <Panel title="Route Fit" icon={<BadgeCheck className="h-4 w-4" />}>
            <Checklist rows={method.fit} />
          </Panel>
        </aside>

        <section className="min-w-0 space-y-4">
          <GuidanceBand draft={draft} method={method} />
          {preview ? (
            <ReviewStep draft={draft} readiness={readiness} />
          ) : (
            <StepBody step={currentStep} draft={draft} updateDraft={updateDraft} />
          )}

          <div className="flex flex-col-reverse gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <Button type="button" variant="outline" onClick={() => setActiveStep(step => Math.max(0, step - 1))} disabled={activeStep === 0}>
              <ArrowLeft className="mr-2 h-4 w-4" /> Previous
            </Button>
            <div className="text-center text-xs font-bold text-slate-500">
              Step {Math.min(activeStep + 1, activeSteps.length)} of {activeSteps.length}
            </div>
            {activeStep < activeSteps.length - 1 ? (
              <Button type="button" onClick={() => setActiveStep(step => Math.min(activeSteps.length - 1, step + 1))} className="bg-[#12335f] text-white">
                Next <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="button" onClick={continueToModule} className="bg-[#12335f] text-white">
                Continue <Send className="ml-2 h-4 w-4" />
              </Button>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <SummaryCard draft={draft} readiness={readiness} method={method} />
          <Panel title="Gating Rules" icon={<ShieldCheck className="h-4 w-4" />}>
            <Checklist rows={method.gates} />
          </Panel>
          <Panel title="Readiness" icon={<CheckCircle2 className="h-4 w-4" />}>
            <div className="space-y-2">
              {readiness.map(item => (
                <div key={item.label} className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-2">
                  <span className="text-xs font-bold text-slate-600">{item.label}</span>
                  <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-black uppercase', item.ok ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-700')}>
                    {item.ok ? 'Ready' : 'Needed'}
                  </span>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </div>
    </main>
  );
}

function MethodCard({
  config,
  selected,
  recommended,
  onSelect,
}: {
  config: MethodConfig;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
}) {
  const Icon = config.icon;
  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'min-h-[122px] rounded-lg border bg-white p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md',
        selected ? 'border-[#12335f] ring-2 ring-[#12335f]/10' : 'border-slate-200'
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <span className={cn('flex h-10 w-10 items-center justify-center rounded-lg border', config.accent)}>
          <Icon className="h-5 w-5" />
        </span>
        {recommended && <span className="rounded-full bg-emerald-50 px-2 py-1 text-[10px] font-black uppercase text-emerald-700">Recommended</span>}
      </div>
      <p className="mt-3 text-sm font-black text-slate-950">{config.title}</p>
      <p className="mt-1 text-xs font-semibold leading-5 text-slate-500">{config.subtitle}</p>
    </button>
  );
}

function StepBody({ step, draft, updateDraft }: { step: StepKind; draft: Draft; updateDraft: (updater: (current: Draft) => Draft) => void }) {
  switch (step) {
    case 'basics':
      return <BasicsStep draft={draft} updateDraft={updateDraft} />;
    case 'items':
      return <ItemsStep draft={draft} updateDraft={updateDraft} />;
    case 'vendors':
      return <VendorsStep draft={draft} updateDraft={updateDraft} />;
    case 'schedule':
      return <ScheduleStep draft={draft} updateDraft={updateDraft} />;
    case 'rules':
      return <RulesStep draft={draft} updateDraft={updateDraft} />;
    case 'documents':
      return <DocumentsStep draft={draft} updateDraft={updateDraft} />;
    case 'approval':
      return <ApprovalStep draft={draft} updateDraft={updateDraft} />;
    case 'review':
    default:
      return <ReviewStep draft={draft} readiness={getReadiness(draft)} />;
  }
}

function BasicsStep({ draft, updateDraft }: StepProps) {
  const updateBasics = (key: keyof Draft['basics'], value: string | number) =>
    updateDraft(current => ({ ...current, basics: { ...current.basics, [key]: value } }));
  const updateTender = (key: keyof Draft['tender'], value: string | boolean) =>
    updateDraft(current => ({ ...current, tender: { ...current.tender, [key]: value } }));

  return (
    <Panel title="Requirement Details" icon={<ClipboardCheck className="h-4 w-4" />}>
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Procurement title" required className="lg:col-span-2">
          <input value={draft.basics.title} onChange={event => updateBasics('title', event.target.value)} className={inputClass} placeholder="Office equipment, AMC renewal, raw material supply..." />
        </Field>
        <Field label="Requirement type" required>
          <select value={draft.basics.requirementType} onChange={event => updateBasics('requirementType', event.target.value)} className={inputClass}>
            {REQUIREMENT_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Priority">
          <select value={draft.basics.priority} onChange={event => updateBasics('priority', event.target.value)} className={inputClass}>
            {PRIORITY_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Category" required>
          <select value={draft.basics.category} onChange={event => updateBasics('category', event.target.value)} className={inputClass}>
            <option value="">Select category</option>
            {PROCUREMENT_CATEGORY_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Sub category">
          <input value={draft.basics.subCategory} onChange={event => updateBasics('subCategory', event.target.value)} className={inputClass} placeholder="Stationery, laptops, logistics..." />
        </Field>
        <Field label="Department" required>
          <input value={draft.basics.department} onChange={event => updateBasics('department', event.target.value)} className={inputClass} placeholder="Administration" />
        </Field>
        <Field label="Estimated value" required>
          <input type="number" min={0} value={draft.basics.estimatedValue || ''} onChange={event => updateBasics('estimatedValue', Number(event.target.value || 0))} className={inputClass} placeholder="0" />
        </Field>
        <Field label="Funding source">
          <input value={draft.basics.fundingSource} onChange={event => updateBasics('fundingSource', event.target.value)} className={inputClass} placeholder="Budget / project / scheme" />
        </Field>
        <Field label="Cost center">
          <input value={draft.basics.costCenter} onChange={event => updateBasics('costCenter', event.target.value)} className={inputClass} placeholder="ADM-001" />
        </Field>
        <Field label="Justification / scope" required className="lg:col-span-4">
          <textarea value={draft.basics.justification} onChange={event => updateBasics('justification', event.target.value)} rows={5} maxLength={1000} className={textareaClass} placeholder="Why this procurement is required, expected outcome, constraints and delivery need." />
        </Field>
        {draft.type === 'tender' && (
          <>
            <Field label="Tender number" required>
              <input value={draft.tender.tenderNumber} onChange={event => updateTender('tenderNumber', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Tender type" required>
              <select value={draft.tender.tenderType} onChange={event => updateTender('tenderType', event.target.value)} className={inputClass}>
                {TENDER_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Tender mode">
              <select value={draft.tender.tenderMode} onChange={event => updateTender('tenderMode', event.target.value)} className={inputClass}>
                {TENDER_MODE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Tender visibility">
              <select value={draft.tender.visibility} onChange={event => updateTender('visibility', event.target.value)} className={inputClass}>
                {TENDER_VISIBILITY_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Short description" required className="lg:col-span-4">
              <textarea value={draft.tender.shortDescription} onChange={event => updateTender('shortDescription', event.target.value)} rows={3} className={textareaClass} placeholder="Concise business need and procurement outcome." />
            </Field>
            <Field label="Detailed scope of work" required className="lg:col-span-4">
              <textarea value={draft.tender.scopeOfWork} onChange={event => updateTender('scopeOfWork', event.target.value)} rows={5} className={textareaClass} placeholder="Deliverables, standards, acceptance criteria, exclusions, dependencies and site constraints." />
            </Field>
            <Field label="Purpose / objective" className="lg:col-span-4">
              <textarea value={draft.tender.purpose} onChange={event => updateTender('purpose', event.target.value)} rows={3} className={textareaClass} placeholder="Why this tender is being floated and expected business outcome." />
            </Field>
          </>
        )}
      </div>
    </Panel>
  );
}

function ItemsStep({ draft, updateDraft }: StepProps) {
  const updateItem = (id: string, patch: Partial<ItemRow>) => updateDraft(current => ({
    ...current,
    items: current.items.map(item => item.id === id ? { ...item, ...patch } : item),
  }));

  const addItem = () => updateDraft(current => ({
    ...current,
    items: [...current.items, {
      id: makeId(),
      name: '',
      specification: '',
      quantity: 1,
      unit: 'Nos',
      unitPrice: 0,
      gst: 18,
      deliveryDate: '',
      brandPolicy: 'Equivalent or better allowed',
      technicalSpecification: '',
      specificationFileName: '',
    }],
  }));

  const removeItem = (id: string) => updateDraft(current => ({
    ...current,
    items: current.items.length === 1 ? current.items : current.items.filter(item => item.id !== id),
  }));

  return (
    <Panel
      title="Items / BOQ"
      icon={<Package className="h-4 w-4" />}
      action={<Button type="button" size="sm" onClick={addItem} className="bg-[#12335f] text-white"><Plus className="mr-2 h-4 w-4" /> Add Item</Button>}
    >
      <div className="overflow-x-auto">
        <table className="min-w-[1180px] w-full border-collapse text-left text-xs">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-3 py-2">Item / service</th>
              <th className="px-3 py-2">Specification</th>
              <th className="px-3 py-2">Qty</th>
              <th className="px-3 py-2">Unit</th>
              {draft.type === 'tender' && <th className="px-3 py-2">Delivery date</th>}
              {draft.type === 'tender' && <th className="px-3 py-2">Brand policy</th>}
              <th className="px-3 py-2">Unit price</th>
              <th className="px-3 py-2">GST %</th>
              {draft.type === 'tender' && <th className="px-3 py-2">Spec file</th>}
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2 text-right">Action</th>
            </tr>
          </thead>
          <tbody>
            {draft.items.map(item => (
              <tr key={item.id} className="border-b border-slate-100 align-top">
                <td className="px-3 py-2"><input value={item.name} onChange={event => updateItem(item.id, { name: event.target.value })} className={tableInputClass} placeholder="Item name" /></td>
                <td className="px-3 py-2">
                  <input value={item.specification} onChange={event => updateItem(item.id, { specification: event.target.value })} className={tableInputClass} placeholder="Key specs" />
                  {draft.type === 'tender' && (
                    <input value={item.technicalSpecification} onChange={event => updateItem(item.id, { technicalSpecification: event.target.value })} className={cn(tableInputClass, 'mt-2')} placeholder="Technical compliance notes" />
                  )}
                </td>
                <td className="px-3 py-2"><input type="number" min={0} value={item.quantity || ''} onChange={event => updateItem(item.id, { quantity: Number(event.target.value || 0) })} className={tableInputClass} /></td>
                <td className="px-3 py-2">
                  <select value={item.unit} onChange={event => updateItem(item.id, { unit: event.target.value })} className={tableInputClass}>
                    {QUANTITY_UNITS.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                  </select>
                </td>
                {draft.type === 'tender' && <td className="px-3 py-2"><input type="date" value={item.deliveryDate} onChange={event => updateItem(item.id, { deliveryDate: event.target.value })} className={tableInputClass} /></td>}
                {draft.type === 'tender' && (
                  <td className="px-3 py-2">
                    <select value={item.brandPolicy} onChange={event => updateItem(item.id, { brandPolicy: event.target.value })} className={tableInputClass}>
                      {BRAND_POLICY_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                )}
                <td className="px-3 py-2"><input type="number" min={0} value={item.unitPrice || ''} onChange={event => updateItem(item.id, { unitPrice: Number(event.target.value || 0) })} className={tableInputClass} /></td>
                <td className="px-3 py-2"><input type="number" min={0} value={item.gst || ''} onChange={event => updateItem(item.id, { gst: Number(event.target.value || 0) })} className={tableInputClass} /></td>
                {draft.type === 'tender' && (
                  <td className="px-3 py-2">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 font-bold text-slate-600">
                      <Paperclip className="h-4 w-4" /> {item.specificationFileName || 'Attach'}
                      <input type="file" className="hidden" onChange={event => updateItem(item.id, { specificationFileName: event.target.files?.[0]?.name || '' })} />
                    </label>
                  </td>
                )}
                <td className="px-3 py-2 text-right font-black text-slate-900">{money(itemTotal(item))}</td>
                <td className="px-3 py-2 text-right">
                  <button type="button" onClick={() => removeItem(item.id)} className="rounded-md p-2 text-rose-600 hover:bg-rose-50" aria-label="Remove item">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Metric label="Sub total" value={money(subtotal(draft.items))} />
        <Metric label="Tax included total" value={money(grandTotal(draft.items))} />
        <Metric label="Items" value={String(draft.items.length)} />
      </div>
    </Panel>
  );
}

function VendorsStep({ draft, updateDraft }: StepProps) {
  const updateVendors = (key: keyof Draft['vendors'], value: string | number | boolean) =>
    updateDraft(current => ({ ...current, vendors: { ...current.vendors, [key]: value } }));
  const updateTender = (key: keyof Draft['tender'], value: string | boolean) =>
    updateDraft(current => ({ ...current, tender: { ...current.tender, [key]: value } }));

  return (
    <Panel title="Supplier Reach & Eligibility" icon={<Users className="h-4 w-4" />}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Supplier selection" required>
          <select value={draft.vendors.selection} onChange={event => updateVendors('selection', event.target.value)} className={inputClass}>
            {SUPPLIER_SELECTION_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Invite count">
          <input type="number" min={0} max={50} value={draft.vendors.inviteCount || ''} onChange={event => updateVendors('inviteCount', Number(event.target.value || 0))} className={inputClass} placeholder="0" />
        </Field>
        <Field label="Minimum turnover">
          <input value={draft.vendors.minimumTurnover} onChange={event => updateVendors('minimumTurnover', event.target.value)} className={inputClass} placeholder="e.g. Rs 10,00,000" />
        </Field>
        <Field label="Experience required">
          <input value={draft.vendors.experienceYears} onChange={event => updateVendors('experienceYears', event.target.value)} className={inputClass} placeholder="Years" />
        </Field>
        <Toggle label="MSME preference" checked={draft.vendors.msmePreference} onChange={value => updateVendors('msmePreference', value)} />
        <Toggle label="Make in India preference" checked={draft.vendors.makeInIndiaPreference} onChange={value => updateVendors('makeInIndiaPreference', value)} />
        <Toggle label="Local vendor preference" checked={draft.vendors.localVendorPreference} onChange={value => updateVendors('localVendorPreference', value)} />
        {draft.type === 'tender' && (
          <>
            <Toggle label="Startup preference" checked={draft.tender.startupPreference} onChange={value => updateTender('startupPreference', value)} />
            <Toggle label="SHG preference" checked={draft.tender.shgPreference} onChange={value => updateTender('shgPreference', value)} />
            <Toggle label="Women-owned business preference" checked={draft.tender.womenOwnedPreference} onChange={value => updateTender('womenOwnedPreference', value)} />
            <Toggle label="GST mandatory" checked={draft.tender.gstMandatory} onChange={value => updateTender('gstMandatory', value)} />
            <Toggle label="PAN mandatory" checked={draft.tender.panMandatory} onChange={value => updateTender('panMandatory', value)} />
            <Field label="Required certifications" className="lg:col-span-3">
              <textarea value={draft.tender.requiredCertifications} onChange={event => updateTender('requiredCertifications', event.target.value)} rows={3} className={textareaClass} placeholder="ISO, BIS, OEM authorization, safety license, statutory registrations." />
            </Field>
          </>
        )}
        <Field label="Compliance notes" className="lg:col-span-3">
          <textarea value={draft.vendors.complianceNotes} onChange={event => updateVendors('complianceNotes', event.target.value)} rows={4} className={textareaClass} placeholder="GST, PAN, Udyam, ISO, prior experience or special eligibility." />
        </Field>
      </div>
    </Panel>
  );
}

function ScheduleStep({ draft, updateDraft }: StepProps) {
  const updateSchedule = (key: keyof Draft['schedule'], value: string | number | boolean) =>
    updateDraft(current => ({ ...current, schedule: { ...current.schedule, [key]: value } }));
  const updateTender = (key: keyof Draft['tender'], value: string | boolean) =>
    updateDraft(current => ({ ...current, tender: { ...current.tender, [key]: value } }));

  return (
    <Panel title="Schedule & Delivery" icon={<CalendarClock className="h-4 w-4" />}>
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Publish date">
          <input type="date" value={draft.schedule.publishDate} onChange={event => updateSchedule('publishDate', event.target.value)} className={inputClass} />
        </Field>
        <Field label="Submission end date" required>
          <input type="date" value={draft.schedule.submissionDate} onChange={event => updateSchedule('submissionDate', event.target.value)} className={inputClass} />
        </Field>
        <Field label="Opening date">
          <input type="date" value={draft.schedule.openingDate} onChange={event => updateSchedule('openingDate', event.target.value)} className={inputClass} />
        </Field>
        <Field label="Quote validity days">
          <input type="number" min={1} value={draft.schedule.validityDays || ''} onChange={event => updateSchedule('validityDays', Number(event.target.value || 0))} className={inputClass} />
        </Field>
        <Field label="Required delivery date" required>
          <input type="date" value={draft.schedule.deliveryDate} onChange={event => updateSchedule('deliveryDate', event.target.value)} className={inputClass} />
        </Field>
        <Toggle label="Pre-bid meeting" checked={draft.schedule.preBidMeeting} onChange={value => updateSchedule('preBidMeeting', value)} />
        {draft.schedule.preBidMeeting && (
          <Field label="Pre-bid date">
            <input type="date" value={draft.schedule.preBidDate} onChange={event => updateSchedule('preBidDate', event.target.value)} className={inputClass} />
          </Field>
        )}
        {draft.type === 'tender' && (
          <>
            <Field label="Bid start date">
              <input type="date" value={draft.tender.bidStartDate} onChange={event => updateTender('bidStartDate', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Bid closing date" required>
              <input type="date" value={draft.tender.bidClosingDate} onChange={event => updateTender('bidClosingDate', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Bid closing time" required>
              <input type="time" value={draft.tender.bidClosingTime} onChange={event => updateTender('bidClosingTime', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Technical evaluation date">
              <input type="date" value={draft.tender.technicalEvaluationDate} onChange={event => updateTender('technicalEvaluationDate', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Financial evaluation date">
              <input type="date" value={draft.tender.financialEvaluationDate} onChange={event => updateTender('financialEvaluationDate', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Award date">
              <input type="date" value={draft.tender.awardDate} onChange={event => updateTender('awardDate', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Delivery location" required className="lg:col-span-2">
              <input value={draft.tender.deliveryLocation} onChange={event => updateTender('deliveryLocation', event.target.value)} className={inputClass} placeholder="Full delivery or execution address" />
            </Field>
            <Field label="Delivery type" required>
              <select value={draft.tender.deliveryType} onChange={event => updateTender('deliveryType', event.target.value)} className={inputClass}>
                <option value="">Select delivery type</option>
                {DELIVERY_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Delivery timeline">
              <input value={draft.tender.deliveryTimeline} onChange={event => updateTender('deliveryTimeline', event.target.value)} className={inputClass} placeholder="Within 30 days from PO" />
            </Field>
            <Toggle label="Installation required" checked={draft.tender.installationRequired} onChange={value => updateTender('installationRequired', value)} />
            <Toggle label="Training required" checked={draft.tender.trainingRequired} onChange={value => updateTender('trainingRequired', value)} />
            <Field label="Special instructions" className="lg:col-span-4">
              <textarea value={draft.tender.specialInstructions} onChange={event => updateTender('specialInstructions', event.target.value)} rows={4} className={textareaClass} placeholder="Site access, packaging, delivery window, installation dependencies, inspection instructions." />
            </Field>
          </>
        )}
      </div>
    </Panel>
  );
}

function RulesStep({ draft, updateDraft }: StepProps) {
  const updateRules = (key: keyof Draft['rules'], value: string | number | boolean) =>
    updateDraft(current => ({ ...current, rules: { ...current.rules, [key]: value } }));
  const updateTender = (key: keyof Draft['tender'], value: string | boolean | PaymentMilestone[]) =>
    updateDraft(current => ({ ...current, tender: { ...current.tender, [key]: value } }));
  const updateMilestone = (id: string, patch: Partial<PaymentMilestone>) => {
    updateTender('milestones', draft.tender.milestones.map(milestone => milestone.id === id ? { ...milestone, ...patch } : milestone));
  };

  return (
    <Panel title={draft.type === 'auction' ? 'Auction Rules' : 'Bid & Evaluation Rules'} icon={<ShieldCheck className="h-4 w-4" />}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Bid type" required>
          <select value={draft.rules.bidType} onChange={event => updateRules('bidType', event.target.value)} className={inputClass}>
            {BID_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Evaluation method" required>
          <select value={draft.rules.evaluation} onChange={event => updateRules('evaluation', event.target.value)} className={inputClass}>
            {EVALUATION_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="EMD amount">
          <input type="number" min={0} value={draft.rules.emdAmount || ''} onChange={event => updateRules('emdAmount', Number(event.target.value || 0))} className={inputClass} />
        </Field>
        <Toggle label="EMD required" checked={draft.rules.emdRequired} onChange={value => updateRules('emdRequired', value)} />
        <Toggle label="Performance security" checked={draft.rules.performanceSecurity} onChange={value => updateRules('performanceSecurity', value)} />
        <Toggle label="Reverse auction intent" checked={draft.rules.reverseAuctionIntent} onChange={value => updateRules('reverseAuctionIntent', value)} />
        {(draft.type === 'auction' || draft.rules.reverseAuctionIntent) && (
          <>
            <Field label="Start / ceiling price">
              <input type="number" min={0} value={draft.rules.startPrice || ''} onChange={event => updateRules('startPrice', Number(event.target.value || 0))} className={inputClass} />
            </Field>
            <Field label="Reserve price">
              <input type="number" min={0} value={draft.rules.reservePrice || ''} onChange={event => updateRules('reservePrice', Number(event.target.value || 0))} className={inputClass} />
            </Field>
            <Field label="Minimum decrement">
              <input type="number" min={0} value={draft.rules.minimumDecrement || ''} onChange={event => updateRules('minimumDecrement', Number(event.target.value || 0))} className={inputClass} />
            </Field>
            <Toggle label="Auto extension" checked={draft.rules.autoExtension} onChange={value => updateRules('autoExtension', value)} />
            <Toggle label="Hide vendor identity" checked={draft.rules.hideVendorIdentity} onChange={value => updateRules('hideVendorIdentity', value)} />
          </>
        )}
        {draft.type === 'tender' && (
          <>
            <Field label="Currency">
              <select value={draft.tender.currency} onChange={event => updateTender('currency', event.target.value)} className={inputClass}>
                {['INR', 'USD', 'EUR'].map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Price type">
              <select value={draft.tender.priceType} onChange={event => updateTender('priceType', event.target.value)} className={inputClass}>
                {PRICE_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Tax type">
              <select value={draft.tender.taxType} onChange={event => updateTender('taxType', event.target.value)} className={inputClass}>
                {TAX_TYPE_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Toggle label="GST included" checked={draft.tender.gstIncluded} onChange={value => updateTender('gstIncluded', value)} />
            <Field label="GST rate">
              <input type="number" value={draft.tender.gstRate} onChange={event => updateTender('gstRate', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Payment terms" required>
              <select value={draft.tender.paymentTerms} onChange={event => updateTender('paymentTerms', event.target.value)} className={inputClass}>
                <option value="">Select payment terms</option>
                {PAYMENT_TERMS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            <Field label="Performance security amount">
              <input type="number" value={draft.tender.performanceSecurityAmount} onChange={event => updateTender('performanceSecurityAmount', event.target.value)} disabled={!draft.rules.performanceSecurity} className={inputClass} />
            </Field>
            <Field label="Tender evaluation method">
              <select value={draft.tender.evaluationMethod} onChange={event => updateTender('evaluationMethod', event.target.value)} className={inputClass}>
                {TENDER_EVALUATION_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Technical weightage">
              <input type="number" value={draft.tender.technicalWeightage} onChange={event => updateTender('technicalWeightage', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Price weightage">
              <input type="number" value={draft.tender.priceWeightage} onChange={event => updateTender('priceWeightage', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Experience score">
              <input type="number" value={draft.tender.experienceScore} onChange={event => updateTender('experienceScore', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Certification score">
              <input type="number" value={draft.tender.certificationScore} onChange={event => updateTender('certificationScore', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Compliance score">
              <input type="number" value={draft.tender.complianceScore} onChange={event => updateTender('complianceScore', event.target.value)} className={inputClass} />
            </Field>
            <div className="space-y-3 lg:col-span-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-black text-slate-950">Payment milestones</h3>
                  <p className="text-xs font-semibold text-slate-500">Define payable percentages and release triggers.</p>
                </div>
                <Button type="button" variant="outline" size="sm" onClick={() => updateTender('milestones', [...draft.tender.milestones, emptyMilestone()])}>Add milestone</Button>
              </div>
              {draft.tender.milestones.map(milestone => (
                <div key={milestone.id} className="grid gap-3 rounded-lg border border-slate-200 p-3 lg:grid-cols-[1fr_120px_1.5fr_auto]">
                  <input value={milestone.label} onChange={event => updateMilestone(milestone.id, { label: event.target.value })} className={inputClass} placeholder="Advance / delivery / acceptance" />
                  <input type="number" value={milestone.percentage} onChange={event => updateMilestone(milestone.id, { percentage: event.target.value })} className={inputClass} placeholder="%" />
                  <input value={milestone.trigger} onChange={event => updateMilestone(milestone.id, { trigger: event.target.value })} className={inputClass} placeholder="Payment trigger" />
                  <button type="button" onClick={() => updateTender('milestones', draft.tender.milestones.length > 1 ? draft.tender.milestones.filter(row => row.id !== milestone.id) : draft.tender.milestones)} className="rounded-md p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function DocumentsStep({ draft, updateDraft }: StepProps) {
  const updateDocument = (id: string, patch: Partial<DocumentRow>) => updateDraft(current => ({
    ...current,
    documents: current.documents.map(document => document.id === id ? { ...document, ...patch } : document),
  }));
  const updateTender = (key: keyof Draft['tender'], value: string) =>
    updateDraft(current => ({ ...current, tender: { ...current.tender, [key]: value } }));

  const handleFile = (documentId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const target = draft.documents.find(document => document.id === documentId);
      updateDocument(documentId, { fileName: file.name, version: target?.fileName ? (target.version || 1) + 1 : 1 });
      if (draft.type === 'tender' && target?.name === 'Tender Specification File') {
        updateTender('documentUrl', file.name);
      }
    }
    event.target.value = '';
  };

  return (
    <Panel title="Documents & Compliance" icon={<Upload className="h-4 w-4" />}>
      <div className="space-y-4">
        {draft.type === 'tender' && (
          <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-white p-3 text-[#12335f] shadow-sm"><Upload className="h-5 w-5" /></div>
                <div>
                  <h3 className="text-sm font-black text-slate-950">Tender Specification File</h3>
                  <p className="text-xs font-semibold text-slate-500">Primary supplier-facing tender document.</p>
                </div>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#12335f] px-3 py-2 text-xs font-black text-white">
                <Upload className="h-4 w-4" /> {draft.tender.documentUrl ? 'Change file' : 'Upload file'}
                <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={event => handleFile(draft.documents[0]?.id || '', event)} />
              </label>
            </div>
            {draft.tender.documentUrl && (
              <p className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800">{draft.tender.documentUrl}</p>
            )}
          </div>
        )}
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="min-w-[860px] w-full text-left text-xs">
            <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
              <tr>
                <th className="px-3 py-3">Document</th>
                <th className="px-3 py-3">Requirement</th>
                <th className="px-3 py-3">Version</th>
                <th className="px-3 py-3">File preview</th>
                <th className="px-3 py-3">Upload</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {draft.documents.map(document => (
                <tr key={document.id}>
                  <td className="px-3 py-3 font-bold text-slate-900">{document.name}</td>
                  <td className="px-3 py-3">
                    <select value={document.requirement} onChange={event => updateDocument(document.id, { requirement: event.target.value as DocumentRow['requirement'] })} className={tableInputClass}>
                      {DOCUMENT_REQUIREMENT_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 font-black text-slate-700">v{document.version}</td>
                  <td className="px-3 py-3 text-slate-600">{document.fileName || 'No file attached'}</td>
                  <td className="px-3 py-3">
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 font-black text-slate-700">
                      <Paperclip className="h-4 w-4" /> Select
                      <input type="file" multiple className="hidden" onChange={event => handleFile(document.id, event)} />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Panel>
  );
}

function ApprovalStep({ draft, updateDraft }: StepProps) {
  const updateApproval = (key: keyof Draft['approval'], value: string) =>
    updateDraft(current => ({ ...current, approval: { ...current.approval, [key]: value } }));
  const updateTender = (key: keyof Draft['tender'], value: string | boolean) =>
    updateDraft(current => ({ ...current, tender: { ...current.tender, [key]: value } }));

  return (
    <Panel title="Approval Workflow" icon={<BadgeCheck className="h-4 w-4" />}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Workflow" required>
          <select value={draft.approval.workflow} onChange={event => updateApproval('workflow', event.target.value)} className={inputClass}>
            {APPROVAL_WORKFLOW_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Approver">
          <input value={draft.approval.approver} onChange={event => updateApproval('approver', event.target.value)} className={inputClass} placeholder="Name / role" />
        </Field>
        <Field label="Approval note" className="lg:col-span-3">
          <textarea value={draft.approval.notes} onChange={event => updateApproval('notes', event.target.value)} rows={4} className={textareaClass} placeholder="Approval context, special conditions, exceptions and publication notes." />
        </Field>
        {draft.type === 'tender' && (
          <>
            <Field label="Contact name" required>
              <input value={draft.tender.contactName} onChange={event => updateTender('contactName', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Contact email" required>
              <input value={draft.tender.contactEmail} onChange={event => updateTender('contactEmail', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Contact mobile" required>
              <input value={draft.tender.contactMobile} onChange={event => updateTender('contactMobile', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Phone / landline">
              <input value={draft.tender.contactPhone} onChange={event => updateTender('contactPhone', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Department-wise contact">
              <input value={draft.tender.departmentContact} onChange={event => updateTender('departmentContact', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Escalation contact">
              <input value={draft.tender.escalationContact} onChange={event => updateTender('escalationContact', event.target.value)} className={inputClass} />
            </Field>
            <Toggle label="Approval required" checked={draft.tender.approvalRequired} onChange={value => updateTender('approvalRequired', value)} />
            <Field label="Approval status">
              <select value={draft.tender.approvalStatus} onChange={event => updateTender('approvalStatus', event.target.value)} className={inputClass}>
                {APPROVAL_STATUS_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Approver name">
              <input value={draft.tender.approverName} onChange={event => updateTender('approverName', event.target.value)} disabled={!draft.tender.approvalRequired} className={inputClass} />
            </Field>
            <Field label="Multi-level approval chain" className="lg:col-span-2">
              <input value={draft.tender.approvalChain} onChange={event => updateTender('approvalChain', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Approver remarks" className="lg:col-span-3">
              <textarea value={draft.tender.approverRemarks} onChange={event => updateTender('approverRemarks', event.target.value)} rows={4} className={textareaClass} />
            </Field>
          </>
        )}
      </div>
    </Panel>
  );
}

function ReviewStep({ draft, readiness }: { draft: Draft; readiness: Array<{ label: string; ok: boolean }> }) {
  const submissionLabel = draft.type === 'tender'
    ? `${draft.tender.bidClosingDate || 'Date not set'} ${draft.tender.bidClosingTime || ''}`.trim()
    : draft.schedule.submissionDate || 'Not set';

  return (
    <Panel title="Review & Publish Readiness" icon={<CheckCircle2 className="h-4 w-4" />}>
      <div className="grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Selected route</p>
            <h3 className="mt-1 text-xl font-black text-slate-950">{methodLabel(draft.type)}</h3>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">{draft.basics.title || 'Untitled procurement'}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Metric label="Estimated value" value={money(draft.basics.estimatedValue || grandTotal(draft.items))} />
            <Metric label="Line items" value={String(draft.items.length)} />
            <Metric label={draft.type === 'tender' ? 'Bid closing' : 'Submission'} value={submissionLabel} />
          </div>
          {draft.type === 'tender' && (
            <div className="grid gap-3 sm:grid-cols-3">
              <Metric label="Tender type" value={draft.tender.tenderType || 'Not set'} />
              <Metric label="Tender mode" value={draft.tender.tenderMode || 'Not set'} />
              <Metric label="Visibility" value={draft.tender.visibility || 'Not set'} />
            </div>
          )}
        </div>
        <div className="space-y-2">
          {readiness.map(item => (
            <div key={item.label} className={cn('flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-bold', item.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-amber-200 bg-amber-50 text-amber-800')}>
              {item.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
              {item.label}
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function GuidanceBand({ draft, method }: { draft: Draft; method: MethodConfig }) {
  const value = draft.basics.estimatedValue || grandTotal(draft.items);
  return (
    <div className="rounded-lg border border-blue-100 bg-blue-50/60 p-4">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-white text-[#12335f]">
            <Info className="h-5 w-5" />
          </span>
          <div>
            <p className="text-sm font-black text-slate-950">{method.title} setup</p>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-5 text-slate-600">
              {draft.type === 'direct'
                ? 'Use this path for fast, low-value buying where vendor, item and budget checks are enough before approval.'
                : draft.type === 'auction'
                  ? 'Use this path when technical qualification is complete and competition should move to price discovery.'
                  : draft.type === 'tender'
                    ? 'Use this path for formal public bidding with document checklist, committee review and audit trail.'
                    : draft.type === 'comparison'
                      ? 'Use this path when comparable marketplace options need a defensible L1 selection record.'
                      : 'Use this path to collect quotations against a defined requirement, schedule and eligibility set.'}
            </p>
          </div>
        </div>
        <div className="rounded-lg border border-blue-100 bg-white px-4 py-2 text-right">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Current value</p>
          <p className="text-lg font-black text-[#12335f]">{money(value)}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ draft, readiness, method }: { draft: Draft; readiness: Array<{ label: string; ok: boolean }>; method: MethodConfig }) {
  const ready = readiness.filter(item => item.ok).length;
  const workflow = draft.type === 'tender'
    ? draft.tender.approvalChain || draft.approval.workflow
    : draft.approval.workflow;
  const deadline = draft.type === 'tender'
    ? draft.tender.bidClosingDate || 'Not set'
    : draft.schedule.submissionDate || 'Not set';

  return (
    <Panel title="Summary" icon={<FileText className="h-4 w-4" />}>
      <div className="space-y-3">
        <div className={cn('rounded-lg border p-3', method.accent)}>
          <p className="text-[10px] font-black uppercase tracking-widest">Method</p>
          <p className="mt-1 text-base font-black">{method.title}</p>
        </div>
        <Metric label="Estimated value" value={money(draft.basics.estimatedValue || grandTotal(draft.items))} />
        <Metric label="Grand total from BOQ" value={money(grandTotal(draft.items))} />
        <Metric label="Readiness" value={`${ready}/${readiness.length}`} />
        <Metric label={draft.type === 'tender' ? 'Bid closing' : 'Submission'} value={deadline} />
        <Metric label="Workflow" value={workflow} />
      </div>
    </Panel>
  );
}

function getReadiness(draft: Draft) {
  const value = draft.basics.estimatedValue || grandTotal(draft.items);
  const hasItems = draft.items.some(item => item.name.trim() && item.quantity > 0);
  const requiredDocs = draft.documents.filter(document => document.requirement === 'Mandatory');
  const baseChecks = [
    { label: 'Requirement title', ok: draft.basics.title.trim().length >= 3 },
    { label: 'Budget value', ok: value > 0 },
    { label: 'Line item details', ok: hasItems },
    { label: 'Supplier path', ok: Boolean(draft.vendors.selection) },
  ];

  if (draft.type === 'tender') {
    const technicalWeightage = Number(draft.tender.technicalWeightage);
    const priceWeightage = Number(draft.tender.priceWeightage);
    return [
      ...baseChecks,
      { label: 'Tender scope', ok: draft.tender.shortDescription.trim().length >= 10 && draft.tender.scopeOfWork.trim().length >= 10 },
      { label: 'Bid timeline', ok: Boolean(draft.tender.bidStartDate && draft.tender.bidClosingDate && draft.tender.bidClosingTime) },
      { label: 'Delivery terms', ok: Boolean(draft.tender.deliveryLocation && draft.tender.deliveryType && draft.tender.deliveryTimeline) },
      { label: 'Commercial terms', ok: Boolean(draft.tender.paymentTerms && draft.tender.priceType && draft.tender.taxType) },
      { label: 'Evaluation weights', ok: Number.isFinite(technicalWeightage) && Number.isFinite(priceWeightage) && technicalWeightage + priceWeightage === 100 },
      { label: 'Buyer contact', ok: Boolean(draft.tender.contactName && draft.tender.contactEmail && draft.tender.contactMobile) },
      { label: 'Approval workflow', ok: !draft.tender.approvalRequired || Boolean(draft.tender.approverName || draft.tender.approvalChain) },
      { label: 'Mandatory documents', ok: requiredDocs.length > 0 && requiredDocs.every(document => document.fileName) },
    ];
  }

  return [
    ...baseChecks,
    { label: 'Schedule dates', ok: Boolean(draft.schedule.submissionDate && draft.schedule.deliveryDate) },
    { label: 'Approval workflow', ok: Boolean(draft.approval.workflow) },
    { label: 'Mandatory documents', ok: draft.type === 'direct' || requiredDocs.every(document => document.fileName) },
  ];
}

type StepProps = {
  draft: Draft;
  updateDraft: (updater: (current: Draft) => Draft) => void;
};

function Panel({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-slate-200 bg-white shadow-sm">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#12335f]/8 text-[#12335f]">{icon}</span>
          <h2 className="text-sm font-black text-slate-950">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-4">{children}</div>
    </section>
  );
}

function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-[11px] font-black uppercase tracking-wide text-slate-500">
        {label} {required && <span className="text-rose-600">*</span>}
      </span>
      {children}
    </label>
  );
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex min-h-[74px] cursor-pointer items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <span className="text-xs font-black text-slate-700">{label}</span>
      <input type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="h-4 w-4 accent-[#12335f]" />
    </label>
  );
}

function Checklist({ rows }: { rows: string[] }) {
  return (
    <div className="space-y-2">
      {rows.map(row => (
        <div key={row} className="flex gap-2 text-xs font-semibold leading-5 text-slate-600">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{row}</span>
        </div>
      ))}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

const inputClass = 'h-11 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15';
const textareaClass = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15';
const tableInputClass = 'h-9 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10';
