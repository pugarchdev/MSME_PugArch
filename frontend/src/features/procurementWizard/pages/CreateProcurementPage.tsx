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
  Loader2,
  X,
  RotateCcw,
  AlertTriangle,
} from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { PROCUREMENT_DRAFTS_ROUTE, fetchProcurementDrafts, fetchProcurementDraft, saveProcurementDraft, submitProcurementDraft, uploadProcurementDocument } from '../api';
import { DELIVERY_TYPES, PAYMENT_TERMS, QUANTITY_UNITS } from '../../../constants/dropdowns';
import { marketplaceApi, type MarketplaceSeller } from '../../marketplace/api';

type ProcurementType =
  | 'direct-purchase'
  | 'l1-comparison'
  | 'rfq'
  | 'tender'
  | 'reverse-auction'
  | 'boq'
  | 'custom-product'
  | 'custom-service'
  | 'pac'
  | 'rate-contract'
  | 'emergency'
  | 'repeat-order';
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

type ConsigneeRow = {
  id: string;
  name: string;
  location: string;
  contact: string;
  quantity: number;
};

type DocumentRow = {
  id: string;
  name: string;
  requirement: 'Mandatory' | 'Optional' | 'Not Required';
  fileName: string;
  version: number;
  fileAssetId?: number | null;
  documentUrl?: string;
  mimeType?: string;
  size?: number;
  uploadedAt?: string;
  uploadStatus?: 'idle' | 'uploading' | 'uploaded' | 'failed';
  uploadProgress?: number;
  uploadError?: string;
};

type PaymentMilestone = {
  id: string;
  label: string;
  percentage: string;
  trigger: string;
};

type Draft = {
  id?: number;
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
    selectedSellerId?: number | null;
    selectedSellerName?: string;
    selectedSellerCode?: string;
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
  consigneeDetails: ConsigneeRow[];
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
  slug: ProcurementType;
  title: string;
  subtitle: string;
  icon: typeof ShoppingCart;
  accent: string;
  route?: string;
  badge: string;
  valueHint: string;
  fit: string[];
  gates: string[];
};

type StepConfig = {
  id: StepKind;
  label: string;
  description: string;
  icon: typeof ClipboardCheck;
};

type AdvisorState = {
  estimatedValue: string;
  catalogAvailable: boolean;
  technicalEvaluation: boolean;
  proprietary: boolean;
  boqRequired: boolean;
};

const DRAFT_KEY = 'msme:guided-procurement-create:v1';
const TENDER_HANDOFF_KEY = 'msme:tender-create-prefill:v1';
const REQUIREMENT_HANDOFF_KEY = 'msme:requirement-create-prefill:v1';
const RFQ_HANDOFF_KEY = 'msme:rfq-create-prefill:v1';
const PROCUREMENT_SUMMARIES_KEY = 'msme:procurement-intake-summaries:v1';
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

const PROCUREMENT_SUBCATEGORY_OPTIONS = [
  'Raw materials',
  'Finished goods',
  'Consumables',
  'Spares and components',
  'Capital equipment',
  'AMC / maintenance',
  'Installation and commissioning',
  'Civil execution',
  'Electrical works',
  'IT implementation',
  'Logistics support',
  'Professional services',
  'Statutory compliance',
];

const DEPARTMENT_OPTIONS = [
  'Administration',
  'Procurement',
  'Operations',
  'Production',
  'Maintenance',
  'Engineering',
  'Projects',
  'Finance',
  'IT',
  'HR',
  'Quality',
  'Safety',
  'Warehouse',
  'Sales',
  'Legal',
];

const FUNDING_SOURCE_OPTIONS = [
  'Operating budget',
  'Project budget',
  'Capex budget',
  'Opex budget',
  'Department budget',
  'Scheme / grant',
  'CSR budget',
  'Emergency approval',
  'Buyer funded',
];

const COST_CENTER_OPTIONS = [
  'Administration',
  'Factory / plant',
  'Project site',
  'Warehouse',
  'Head office',
  'Regional office',
  'Maintenance',
  'IT services',
  'Quality control',
  'Safety and compliance',
];

const MINIMUM_TURNOVER_OPTIONS = [
  'Not required',
  'Rs 1 lakh and above',
  'Rs 5 lakh and above',
  'Rs 10 lakh and above',
  'Rs 25 lakh and above',
  'Rs 50 lakh and above',
  'Rs 1 crore and above',
  'Rs 5 crore and above',
];

const EXPERIENCE_REQUIRED_OPTIONS = [
  'Not required',
  '1 year',
  '2 years',
  '3 years',
  '5 years',
  '7 years',
  '10 years',
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
const CURRENCY_OPTIONS = ['INR', 'USD', 'EUR'];
const OTHER_OPTION = 'Other';

const isTenderMethod = (type: ProcurementType) =>
  ['tender', 'boq', 'custom-product', 'custom-service', 'pac', 'rate-contract', 'emergency'].includes(type);

const isDirectMethod = (type: ProcurementType) =>
  ['direct-purchase', 'pac', 'repeat-order'].includes(type);

const isAuctionMethod = (type: ProcurementType) => type === 'reverse-auction';

const isComparisonMethod = (type: ProcurementType) => type === 'l1-comparison';

const normalizeProcurementType = (type?: string): ProcurementType => {
  const legacy: Record<string, ProcurementType> = {
    direct: 'direct-purchase',
    comparison: 'l1-comparison',
    auction: 'reverse-auction',
  };
  const normalized = legacy[type || ''] || type;
  return methodConfigs.some(method => method.id === normalized) ? normalized as ProcurementType : 'rfq';
};

const methodConfigs: MethodConfig[] = [
  {
    id: 'direct-purchase',
    slug: 'direct-purchase',
    title: 'Direct Purchase',
    subtitle: 'Known item, catalogue or identified seller, short approval path',
    icon: ShoppingCart,
    accent: 'border-emerald-200 bg-emerald-50 text-emerald-800',
    route: '/buyer/direct-purchase',
    badge: 'Common',
    valueHint: 'Best for low-value or approved direct buys',
    fit: ['Low value or PAC purchase', 'Known seller or catalogue item', 'Budget check before approval'],
    gates: ['Vendor and bank verification', 'Budget availability', 'Short approval workflow'],
  },
  {
    id: 'l1-comparison',
    slug: 'l1-comparison',
    title: 'L1 Comparison',
    subtitle: 'Compare sellers before order',
    icon: BarChart3,
    accent: 'border-cyan-200 bg-cyan-50 text-cyan-800',
    route: '/buyer/marketplace',
    badge: 'Recommended',
    valueHint: 'Use where comparable offers exist',
    fit: ['Comparable catalogue items', 'Need price reasonableness record', 'Shortlisting 3 or more sellers'],
    gates: ['Equivalent specifications', 'Tax and freight comparison', 'Approval of selected L1'],
  },
  {
    id: 'rfq',
    slug: 'rfq',
    title: 'RFQ / eRFQ',
    subtitle: 'Request quotations with controlled vendor invite',
    icon: FileText,
    accent: 'border-blue-200 bg-blue-50 text-blue-800',
    route: '/buyer/rfq',
    badge: 'Common',
    valueHint: 'Useful for custom specs and supplier quotes',
    fit: ['Custom specification', 'Need quote validity', 'Open or invited supplier set'],
    gates: ['Clear BOQ/specification', 'Submission schedule', 'Commercial and eligibility terms'],
  },
  {
    id: 'tender',
    slug: 'tender',
    title: 'Tender / Open Bid',
    subtitle: 'Published bidding with committee evaluation',
    icon: ClipboardCheck,
    accent: 'border-amber-200 bg-amber-50 text-amber-900',
    route: '/buyer/publish-bid?method=tender',
    badge: 'Compliance Required',
    valueHint: 'Formal bids and higher-value procurement',
    fit: ['Higher value procurement', 'Two-bid or formal compliance checks', 'Public audit trail needed'],
    gates: ['NIT and document checklist', 'Bid opening committee', 'Technical and financial evaluation'],
  },
  {
    id: 'reverse-auction',
    slug: 'reverse-auction',
    title: 'Reverse Auction',
    subtitle: 'Price discovery after qualified competition',
    icon: Gavel,
    accent: 'border-violet-200 bg-violet-50 text-violet-800',
    route: '/reverse-auctions/create',
    badge: 'Advanced',
    valueHint: 'Use after technical qualification',
    fit: ['Comparable items and qualified bidders', 'Need transparent price reduction', 'RA intent declared upfront'],
    gates: ['Start and reserve price', 'Minimum decrement', 'Auto-extension and rank visibility rules'],
  },
  {
    id: 'boq',
    slug: 'boq',
    title: 'BOQ Based Bid',
    subtitle: 'Line item bidding with BOQ schedule and validation',
    icon: Package,
    accent: 'border-slate-200 bg-slate-50 text-slate-800',
    route: '/buyer/publish-bid?method=boq',
    badge: 'Advanced',
    valueHint: 'Works, AMC, item-wise rates',
    fit: ['Multiple line items', 'Need rate and tax comparison', 'BOQ template or line table available'],
    gates: ['BOQ upload or completed line items', 'Quantity and unit validation', 'Commercial schedule review'],
  },
  {
    id: 'custom-product',
    slug: 'custom-product',
    title: 'Custom Product Bid',
    subtitle: 'Non-catalogue product with custom technical specifications',
    icon: ClipboardCheck,
    accent: 'border-indigo-200 bg-indigo-50 text-indigo-800',
    route: '/buyer/publish-bid?method=custom-product',
    badge: 'Approval Required',
    valueHint: 'Use when catalogue item is unavailable',
    fit: ['Catalogue item unavailable', 'Golden parameters or drawings required', 'Admin approval may be needed'],
    gates: ['Unavailability reason', 'Technical specification', 'Drawing/specification attachment'],
  },
  {
    id: 'custom-service',
    slug: 'custom-service',
    title: 'Custom Service Bid',
    subtitle: 'Scope, SLA, manpower, milestones and service terms',
    icon: Users,
    accent: 'border-sky-200 bg-sky-50 text-sky-800',
    route: '/buyer/publish-bid?method=custom-service',
    badge: 'Service',
    valueHint: 'For work orders and service contracts',
    fit: ['Scope of work based procurement', 'SLA or manpower requirement', 'Milestone payment schedule'],
    gates: ['Scope of work', 'SLA and duration', 'Payment milestone review'],
  },
  {
    id: 'pac',
    slug: 'pac',
    title: 'PAC / Proprietary Bid',
    subtitle: 'Single OEM or proprietary article certificate route',
    icon: ShieldCheck,
    accent: 'border-rose-200 bg-rose-50 text-rose-800',
    route: '/buyer/publish-bid?method=pac',
    badge: 'Compliance Required',
    valueHint: 'Single-source justification required',
    fit: ['OEM/proprietary item', 'No equivalent substitute', 'Competent authority approval required'],
    gates: ['PAC certificate', 'Manufacturer details', 'Single-source justification'],
  },
  {
    id: 'rate-contract',
    slug: 'rate-contract',
    title: 'Rate Contract',
    subtitle: 'Reusable rate schedule for recurring procurement',
    icon: CalendarClock,
    accent: 'border-teal-200 bg-teal-50 text-teal-800',
    route: '/buyer/publish-bid?method=rate-contract',
    badge: 'Advanced',
    valueHint: 'For repeated demand over a validity period',
    fit: ['Recurring items/services', 'Rate validity needed', 'Quantity slabs or renewal terms'],
    gates: ['Contract duration', 'Rate validity', 'Renewal and slab terms'],
  },
  {
    id: 'emergency',
    slug: 'emergency',
    title: 'Emergency Procurement',
    subtitle: 'Urgent procurement with audit justification',
    icon: AlertTriangle,
    accent: 'border-orange-200 bg-orange-50 text-orange-800',
    route: '/buyer/publish-bid?method=emergency',
    badge: 'Urgent',
    valueHint: 'Use only with emergency justification',
    fit: ['Operational emergency', 'Shortened timeline', 'Approval authority identified'],
    gates: ['Emergency justification', 'Approval authority', 'Audit note mandatory'],
  },
  {
    id: 'repeat-order',
    slug: 'repeat-order',
    title: 'Repeat Order / Reorder',
    subtitle: 'Repeat a previous order with same item or seller',
    icon: RotateCcw,
    accent: 'border-lime-200 bg-lime-50 text-lime-800',
    route: '/buyer/direct-purchase?method=repeat-order',
    badge: 'Common',
    valueHint: 'Use with prior order reference',
    fit: ['Same item or service', 'Known previous seller', 'Repeat quantity within policy'],
    gates: ['Previous order reference', 'Price comparison', 'Reorder reason'],
  },
];

const stepLibrary: Record<StepKind, StepConfig> = {
  basics: { id: 'basics', label: 'Requirement', description: 'Purpose, category, value and budget ownership', icon: ClipboardCheck },
  items: { id: 'items', label: 'Items / BOQ', description: 'Line items, quantity, tax and specifications', icon: Package },
  vendors: { id: 'vendors', label: 'Suppliers', description: 'Vendor reach, preferences and eligibility filters', icon: Users },
  schedule: { id: 'schedule', label: 'Schedule', description: 'Publishing, submission, opening and delivery dates', icon: CalendarClock },
  rules: { id: 'rules', label: 'Rules', description: 'Bid mode, EMD, evaluation and auction settings', icon: ShieldCheck },
  documents: { id: 'documents', label: 'Documents', description: 'Supporting documents and compliance files', icon: Upload },
  approval: { id: 'approval', label: 'Approval', description: 'Review chain and publishing controls', icon: BadgeCheck },
  review: { id: 'review', label: 'Review', description: 'Readiness checks before moving ahead', icon: CheckCircle2 },
};

const stepsByType: Record<ProcurementType, StepKind[]> = {
  'direct-purchase': ['basics', 'items', 'vendors', 'schedule', 'documents', 'approval', 'review'],
  'l1-comparison': ['basics', 'items', 'vendors', 'schedule', 'documents', 'approval', 'review'],
  rfq: ['basics', 'items', 'vendors', 'schedule', 'rules', 'documents', 'approval', 'review'],
  tender: ['basics', 'items', 'schedule', 'vendors', 'rules', 'documents', 'approval', 'review'],
  'reverse-auction': ['basics', 'items', 'vendors', 'rules', 'schedule', 'documents', 'approval', 'review'],
  boq: ['basics', 'items', 'schedule', 'vendors', 'rules', 'documents', 'approval', 'review'],
  'custom-product': ['basics', 'items', 'schedule', 'vendors', 'rules', 'documents', 'approval', 'review'],
  'custom-service': ['basics', 'items', 'schedule', 'vendors', 'rules', 'documents', 'approval', 'review'],
  pac: ['basics', 'items', 'vendors', 'schedule', 'rules', 'documents', 'approval', 'review'],
  'rate-contract': ['basics', 'items', 'schedule', 'vendors', 'rules', 'documents', 'approval', 'review'],
  emergency: ['basics', 'items', 'schedule', 'vendors', 'rules', 'documents', 'approval', 'review'],
  'repeat-order': ['basics', 'items', 'vendors', 'schedule', 'documents', 'approval', 'review'],
};

const defaultDocuments = (type: ProcurementType = 'rfq'): DocumentRow[] => [
  { id: makeId(), name: isTenderMethod(type) ? 'Tender Specification File' : 'Requirement note / indent approval', requirement: isTenderMethod(type) ? 'Mandatory' : 'Optional', fileName: '', version: 1 },
  { id: makeId(), name: type === 'pac' ? 'PAC Certificate' : 'BOQ / Price Schedule', requirement: isTenderMethod(type) || type === 'boq' ? 'Mandatory' : 'Optional', fileName: '', version: 1 },
  { id: makeId(), name: 'Terms & Conditions', requirement: 'Optional', fileName: '', version: 1 },
  { id: makeId(), name: isTenderMethod(type) ? 'Annexures / Drawings' : 'Technical specification', requirement: ['custom-product', 'custom-service'].includes(type) ? 'Mandatory' : 'Optional', fileName: '', version: 1 },
  { id: makeId(), name: isTenderMethod(type) ? 'Technical Documents' : 'Commercial terms and delivery conditions', requirement: type === 'emergency' ? 'Mandatory' : 'Optional', fileName: '', version: 1 },
  { id: makeId(), name: isTenderMethod(type) ? 'Compliance Documents' : 'Budget approval / fund availability', requirement: type === 'pac' ? 'Mandatory' : 'Optional', fileName: '', version: 1 },
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
    category: isTenderMethod(type) ? '' : isDirectMethod(type) ? 'Office Supplies' : 'Goods',
    subCategory: '',
    department: '',
    priority: type === 'emergency' ? 'Emergency' : 'Normal',
    requirementType: type === 'custom-service' ? 'Services' : 'Goods',
    estimatedValue: 0,
    fundingSource: '',
    costCenter: '',
    justification: '',
  },
  vendors: {
    selection: isDirectMethod(type) ? 'Single / PAC Vendor' : 'Open',
    inviteCount: 0,
    msmePreference: true,
    makeInIndiaPreference: true,
    localVendorPreference: false,
    minimumTurnover: '',
    experienceYears: '',
    complianceNotes: '',
    selectedSellerId: null,
    selectedSellerName: '',
    selectedSellerCode: '',
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
    bidType: isDirectMethod(type) || isComparisonMethod(type) ? 'Price Bid Only' : 'Two Bid',
    evaluation: 'L1 Lowest Price',
    emdRequired: false,
    emdAmount: 0,
    performanceSecurity: false,
    reverseAuctionIntent: isAuctionMethod(type),
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
  consigneeDetails: [
    {
      id: makeId(),
      name: '',
      location: '',
      contact: '',
      quantity: 1,
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
  if (draft.basics.priority === 'Emergency') return 'emergency';
  if (draft.type === 'pac' || draft.vendors.selection === 'Single / PAC Vendor') return 'pac';
  if (isAuctionMethod(draft.type) || draft.rules.reverseAuctionIntent) return 'reverse-auction';
  if (value > 1000000) return 'tender';
  if (value > 50000 && draft.vendors.selection === 'Open') return 'rfq';
  if (value > 50000) return 'l1-comparison';
  return 'direct-purchase';
};

const recommendFromAdvisor = (advisor: AdvisorState): ProcurementType => {
  const value = Number(advisor.estimatedValue || 0);
  if (advisor.proprietary) return 'pac';
  if (advisor.boqRequired) return 'boq';
  if (advisor.catalogAvailable && value > 0 && value <= 25000 && !advisor.technicalEvaluation) return 'direct-purchase';
  if (advisor.catalogAvailable && !advisor.technicalEvaluation) return 'l1-comparison';
  if (advisor.technicalEvaluation || value > 1000000) return 'tender';
  if (value > 50000) return 'rfq';
  return 'direct-purchase';
};

const methodLabel = (type: ProcurementType) => methodConfigs.find(method => method.id === type)?.title || type;

const attachedDocuments = (draft: Draft) => draft.documents.filter(document => document.fileName);

const buildProcurementSummary = (draft: Draft) => {
  const value = draft.basics.estimatedValue || grandTotal(draft.items);
  const documents = attachedDocuments(draft);
  return {
    id: `PI-${Date.now()}`,
    createdAt: new Date().toISOString(),
    method: draft.type,
    methodLabel: methodLabel(draft.type),
    title: draft.basics.title || 'Untitled procurement',
    category: draft.basics.category,
    subCategory: draft.basics.subCategory,
    department: draft.basics.department,
    requirementType: draft.basics.requirementType,
    priority: draft.basics.priority,
    estimatedValue: value,
    justification: draft.basics.justification,
    supplierSelection: draft.vendors.selection,
    publishDate: draft.schedule.publishDate,
    submissionDate: isTenderMethod(draft.type) ? draft.tender.bidClosingDate : draft.schedule.submissionDate,
    deliveryDate: draft.schedule.deliveryDate,
    bidType: draft.rules.bidType,
    evaluation: isTenderMethod(draft.type) ? draft.tender.evaluationMethod : draft.rules.evaluation,
    approvalWorkflow: isTenderMethod(draft.type) ? draft.tender.approvalChain : draft.approval.workflow,
    items: draft.items.map(item => ({
      name: item.name,
      specification: item.specification || item.technicalSpecification,
      quantity: item.quantity,
      unit: item.unit,
      unitPrice: item.unitPrice,
      gst: item.gst,
      total: itemTotal(item),
    })),
    consigneeDetails: draft.consigneeDetails.map(consignee => ({
      name: consignee.name,
      location: consignee.location,
      contact: consignee.contact,
      quantity: consignee.quantity,
    })),
    documents: documents.map(document => ({
      name: document.name,
      requirement: document.requirement,
      fileName: document.fileName,
      version: document.version,
      fileAssetId: document.fileAssetId || null,
      documentUrl: document.documentUrl || '',
      mimeType: document.mimeType || '',
      size: document.size || 0,
      uploadedAt: document.uploadedAt || '',
    })),
  };
};

const formatProcurementSummaryText = (draft: Draft) => {
  const summary = buildProcurementSummary(draft);
  const docs = summary.documents.length
    ? summary.documents.map(document => `- ${document.name}: ${document.fileName} (${document.requirement}, v${document.version})`).join('\n')
    : '- No documents attached';
  const items = summary.items.length
    ? summary.items.map(item => `- ${item.name || 'Unnamed item'}: ${item.quantity} ${item.unit}, ${item.specification || 'No specification'}, unit ${money(item.unitPrice || 0)}`).join('\n')
    : '- No line items';
  const consignees = summary.consigneeDetails.length
    ? summary.consigneeDetails.map(consignee => `- ${consignee.name || 'Consignee'}: ${consignee.quantity}, ${consignee.location || 'Location not set'}`).join('\n')
    : '- No consignee allocation';

  return [
    draft.basics.justification || draft.tender.scopeOfWork || draft.tender.shortDescription || 'Procurement requirement captured from Create Procurement.',
    '',
    'Procurement Intake Summary',
    `Route: ${summary.methodLabel}`,
    `Category: ${summary.category || '-'} / ${summary.subCategory || '-'}`,
    `Department: ${summary.department || '-'}`,
    `Requirement Type: ${summary.requirementType}`,
    `Estimated Value: ${money(summary.estimatedValue)}`,
    `Supplier Selection: ${summary.supplierSelection}`,
    `Submission / Closing: ${summary.submissionDate || '-'}`,
    `Delivery Required By: ${summary.deliveryDate || '-'}`,
    `Evaluation: ${summary.evaluation}`,
    `Approval Workflow: ${summary.approvalWorkflow || '-'}`,
    '',
    'Line Items',
    items,
    '',
    'Consignee Allocation',
    consignees,
    '',
    'Attached Documents',
    docs,
  ].join('\n');
};

const writeProcurementSummary = (draft: Draft) => {
  const summary = buildProcurementSummary(draft);
  try {
    const existing = JSON.parse(localStorage.getItem(PROCUREMENT_SUMMARIES_KEY) || '[]');
    const list = Array.isArray(existing) ? existing : [];
    localStorage.setItem(PROCUREMENT_SUMMARIES_KEY, JSON.stringify([summary, ...list].slice(0, 10)));
  } catch {
    localStorage.setItem(PROCUREMENT_SUMMARIES_KEY, JSON.stringify([summary]));
  }
};

const buildRequirementHandoffDraft = (draft: Draft) => ({
  draft: {
    requirementTitle: draft.basics.title,
    requirementType: isDirectMethod(draft.type)
      ? 'Direct Purchase'
      : isAuctionMethod(draft.type)
        ? 'Reverse Auction'
        : draft.type === 'rfq'
          ? 'RFQ'
          : methodLabel(draft.type),
    procurementCategory: draft.basics.requirementType,
    description: formatProcurementSummaryText(draft),
    department: draft.basics.department,
    priority: draft.basics.priority === 'Normal' ? 'Medium' : draft.basics.priority,
    closingDate: isTenderMethod(draft.type) ? draft.tender.bidClosingDate : draft.schedule.submissionDate,
    bidEndDate: isTenderMethod(draft.type) ? draft.tender.bidClosingDate : draft.schedule.submissionDate,
    deliveryAddress: draft.tender.deliveryLocation,
    consigneeDetails: draft.consigneeDetails,
    deliveryPeriod: draft.tender.deliveryTimeline,
    deliveryType: draft.tender.deliveryType,
    paymentTerms: draft.tender.paymentTerms || '100% After Delivery',
    minimumTurnover: draft.vendors.minimumTurnover,
    experienceYears: draft.vendors.experienceYears,
    fundingSource: draft.basics.fundingSource,
    budgetHead: draft.basics.costCenter,
    needReason: draft.basics.justification,
    evaluationMethod: draft.rules.evaluation,
    technicalWeightage: draft.tender.technicalWeightage,
    financialWeightage: draft.tender.priceWeightage,
    technicalContactName: draft.tender.contactName,
    technicalContactEmail: draft.tender.contactEmail,
    technicalContactNumber: draft.tender.contactMobile,
    terms: draft.approval.notes || draft.vendors.complianceNotes,
  },
  items: draft.items.map(item => ({
    name: item.name,
    category: draft.basics.category || draft.basics.requirementType,
    subCategory: draft.basics.subCategory,
    description: item.specification || item.technicalSpecification,
    quantity: item.quantity,
    unit: item.unit,
    budget: item.unitPrice,
    equivalentBrandAllowed: item.brandPolicy !== 'OEM only',
  })),
  consigneeDetails: draft.consigneeDetails,
  docs: draft.documents.map(document => ({
    category: document.name,
    requirement: document.requirement,
    files: document.fileName ? [{
      name: document.fileName,
      size: document.size || 0,
      uploadedAt: document.uploadedAt || new Date().toISOString(),
      version: document.version,
      fileAssetId: document.fileAssetId || null,
      url: document.documentUrl || '',
    }] : [],
  })),
});

const buildRfqHandoffDraft = (draft: Draft) => ({
  subject: draft.basics.title,
  message: formatProcurementSummaryText(draft),
  estimatedValue: String(draft.basics.estimatedValue || grandTotal(draft.items) || ''),
  deadlineDate: draft.schedule.submissionDate,
  documentName: attachedDocuments(draft)[0]?.fileName || '',
  fileAssetId: attachedDocuments(draft)[0]?.fileAssetId || null,
  documentUrl: attachedDocuments(draft)[0]?.documentUrl || '',
});

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
  consigneeDetails: draft.consigneeDetails,
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
    fileAssetId: document.fileAssetId || null,
    documentUrl: document.documentUrl || '',
    mimeType: document.mimeType || '',
    size: document.size || 0,
    uploadedAt: document.uploadedAt || '',
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

const buildProcurementApiPayload = (draft: Draft, draftStep = 0) => ({
  id: draft.id,
  methodSlug: draft.type,
  procurementMethod: draft.type,
  title: draft.basics.title || `${methodLabel(draft.type)} draft`,
  description: formatProcurementSummaryText(draft),
  estimatedValue: draft.basics.estimatedValue || grandTotal(draft.items),
  requiredBy: isTenderMethod(draft.type)
    ? draft.tender.bidClosingDate || draft.schedule.submissionDate || draft.schedule.deliveryDate || undefined
    : draft.schedule.submissionDate || draft.schedule.deliveryDate || undefined,
  draftStep,
  workflowStatus: 'DRAFT',
  approvalStatus: draft.tender.approvalStatus || draft.approval.workflow || 'DRAFT',
  payload: draft,
  items: draft.items
    .filter(item => item.name.trim())
    .map(item => ({
      itemName: item.name,
      description: item.specification || item.technicalSpecification,
      quantity: item.quantity,
      unitOfMeasure: item.unit,
      estimatedUnitPrice: item.unitPrice,
      specifications: {
        brandPolicy: item.brandPolicy,
        technicalSpecification: item.technicalSpecification,
        specificationFileName: item.specificationFileName,
        deliveryDate: item.deliveryDate,
        gst: item.gst,
      }
    }))
});

export default function CreateProcurementPage() {
  const router = useRouter();
  const pathname = usePathname() || '';
  const searchParams = useSearchParams();
  const draftIdParam = searchParams?.get('id') || searchParams?.get('draftId');

  const routeMethod = useMemo(() => {
    const match = pathname.match(/^\/buyer\/create-procurement\/([^/?#]+)$/);
    return match ? normalizeProcurementType(match[1]) : null;
  }, [pathname]);
  const [draft, setDraft] = useState<Draft>(() => defaultDraft(routeMethod || 'rfq'));
  const [methodSelected, setMethodSelected] = useState(Boolean(routeMethod));
  const [activeStep, setActiveStep] = useState(0);
  const [preview, setPreview] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingDraft, setSubmittingDraft] = useState(false);
  const [advisor, setAdvisor] = useState<AdvisorState>({
    estimatedValue: '',
    catalogAvailable: true,
    technicalEvaluation: false,
    proprietary: false,
    boqRequired: false,
  });
  const [savedDraftMeta, setSavedDraftMeta] = useState<Draft | null>(null);
  const [serverDraftMeta, setServerDraftMeta] = useState<any | null>(null);

  // Load a specific draft from query parameter if provided
  useEffect(() => {
    if (!draftIdParam) return;
    const draftId = parseInt(draftIdParam, 10);
    if (isNaN(draftId)) return;

    fetchProcurementDraft(draftId)
      .then((data) => {
        const source = data?.payload;
        if (!source) return;
        const type = normalizeProcurementType(source.type || data.methodSlug);
        const restored = {
          ...defaultDraft(type),
          ...source,
          id: data.id,
          type,
          tender: { ...defaultTenderDetails(), ...source.tender }
        };
        setDraft(restored);
        setSavedDraftMeta(restored);
        localStorage.setItem(DRAFT_KEY, JSON.stringify(restored));
        setMethodSelected(true);
        setPreview(false);
        setActiveStep(data.draftStep || restored.draftStep || 0);
      })
      .catch((err) => {
        toast.error('Failed to load draft from server: ' + err.message);
      });
  }, [draftIdParam]);

  useEffect(() => {
    if (routeMethod) {
      setDraft(defaultDraft(routeMethod));
      setMethodSelected(true);
      setPreview(false);
      setActiveStep(0);
      return;
    }
    if (draftIdParam) return;
    try {
      const saved = localStorage.getItem(DRAFT_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<Draft>;
        const type = normalizeProcurementType(parsed.type);
        const restored = { ...defaultDraft(type), ...parsed, type, tender: { ...defaultTenderDetails(), ...parsed.tender } };
        setDraft(restored);
        setSavedDraftMeta(restored);
      }
    } catch {
      localStorage.removeItem(DRAFT_KEY);
    }
  }, [routeMethod, draftIdParam]);

  useEffect(() => {
    if (routeMethod || draftIdParam) return;
    fetchProcurementDrafts()
      .then((result) => {
        const drafts = result?.drafts || result?.records || result?.data?.drafts || [];
        setServerDraftMeta(Array.isArray(drafts) ? drafts[0] || null : null);
      })
      .catch(() => undefined);
  }, [routeMethod, draftIdParam]);

  const activeSteps = stepsByType[draft.type];
  const currentStep = activeSteps[Math.min(activeStep, activeSteps.length - 1)];
  const method = methodConfigs.find(config => config.id === draft.type) || methodConfigs[2];
  const MethodIcon = method.icon;
  const recommendedType = useMemo(() => recommendProcurementType(draft), [draft]);
  const advisorRecommendation = useMemo(() => recommendFromAdvisor(advisor), [advisor]);
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
  };

  const goToDetails = () => {
    router.push(`/buyer/create-procurement/${draft.type}`);
    setPreview(false);
    setActiveStep(0);
  };

  const goBack = () => {
    if (methodSelected) {
      router.push('/buyer/create-procurement');
      setMethodSelected(false);
      setPreview(false);
      setActiveStep(0);
      return;
    }
    router.back();
  };

  const saveDraft = async (opts: { silent?: boolean; draftOverride?: Draft } = {}) => {
    const saved = { ...(opts.draftOverride || draft), updatedAt: new Date().toISOString() };
    localStorage.setItem(DRAFT_KEY, JSON.stringify(saved));
    setSavedDraftMeta(saved);
    setSavingDraft(true);
    try {
      const backendDraft = await saveProcurementDraft(buildProcurementApiPayload(saved, activeStep));
      const merged = { ...saved, id: Number(backendDraft?.id || backendDraft?.data?.id || saved.id || 0) || saved.id };
      setDraft(merged);
      setSavedDraftMeta(merged);
      localStorage.setItem(DRAFT_KEY, JSON.stringify(merged));
      if (!opts.silent) toast.success('Procurement draft saved');
      return merged;
    } catch (err) {
      if (!opts.silent) toast.error(err instanceof Error ? err.message : 'Draft saved locally, but backend save failed');
      return saved;
    } finally {
      setSavingDraft(false);
    }
  };

  const advanceStep = async () => {
    await saveDraft({ silent: true });
    setActiveStep(step => Math.min(activeSteps.length - 1, step + 1));
  };

  const uploadDocumentForDraft = async (documentId: string, file: File) => {
    const target = draft.documents.find(document => document.id === documentId);
    if (!target) return;

    if (file.size > 10 * 1024 * 1024) {
      toast.error('Document upload limit is 10 MB');
      return;
    }

    const optimisticDraft: Draft = {
      ...draft,
      documents: draft.documents.map(document => document.id === documentId
        ? {
          ...document,
          fileName: file.name,
          version: document.fileName ? (document.version || 1) + 1 : 1,
          uploadStatus: 'uploading',
          uploadProgress: 1,
          uploadError: '',
        }
        : document),
      tender: isTenderMethod(draft.type) && target.name === 'Tender Specification File'
        ? { ...draft.tender, documentUrl: file.name }
        : draft.tender,
    };
    updateDraft(() => optimisticDraft);

    try {
      const saved = await saveDraft({ silent: true, draftOverride: optimisticDraft });
      if (!saved.id) {
        throw new Error('Unable to create procurement draft before upload');
      }
      const asset = await uploadProcurementDocument(saved.id, file, percent => {
        updateDraft(current => ({
          ...current,
          documents: current.documents.map(document => document.id === documentId
            ? { ...document, uploadStatus: 'uploading', uploadProgress: Math.max(1, percent) }
            : document),
        }));
      });
      const documentUrl = asset.url || asset.documentUrl || `/api/files/${asset.id}/view`;
      const uploadedDraft: Draft = {
        ...saved,
        documents: saved.documents.map(document => document.id === documentId
          ? {
            ...document,
            fileName: asset.originalName || file.name,
            fileAssetId: asset.id,
            documentUrl,
            mimeType: asset.mimeType || file.type,
            size: asset.size || file.size,
            uploadedAt: new Date().toISOString(),
            uploadStatus: 'uploaded',
            uploadProgress: 100,
            uploadError: '',
          }
          : document),
        tender: isTenderMethod(saved.type) && target.name === 'Tender Specification File'
          ? { ...saved.tender, documentUrl }
          : saved.tender,
      };
      updateDraft(() => uploadedDraft);
      toast.success('Document uploaded');
      await saveDraft({ silent: true, draftOverride: uploadedDraft });
    } catch (err) {
      updateDraft(current => ({
        ...current,
        documents: current.documents.map(document => document.id === documentId
          ? { ...document, uploadStatus: 'failed', uploadProgress: 0, uploadError: err instanceof Error ? err.message : 'Upload failed' }
          : document),
      }));
      toast.error(err instanceof Error ? err.message : 'Document upload failed');
    }
  };

  const continueToModule = async () => {
    const missing = readiness.filter(item => !item.ok);
    if (missing.length > 0) {
      toast.error(`Complete required fields first: ${missing.map(item => item.label).join(', ')}`);
      return;
    }
    setSubmittingDraft(true);
    try {
      const saved = await saveDraft({ silent: true });
      const submitPayload = buildProcurementApiPayload(saved, activeStep);
      const submitted = await submitProcurementDraft(submitPayload);
      writeProcurementSummary(saved);
      localStorage.setItem(REQUIREMENT_HANDOFF_KEY, JSON.stringify(buildRequirementHandoffDraft(saved)));
      if (saved.type === 'rfq') {
        localStorage.setItem(RFQ_HANDOFF_KEY, JSON.stringify(buildRfqHandoffDraft(saved)));
      }
      if (isTenderMethod(saved.type)) {
        localStorage.setItem(TENDER_HANDOFF_KEY, JSON.stringify(buildTenderHandoffDraft(saved)));
      }
      if (isDirectMethod(saved.type)) {
        localStorage.setItem('msme:direct-purchase-create-prefill:v1', JSON.stringify({
          sellerId: saved.vendors.selectedSellerId,
          vendorName: saved.vendors.selectedSellerName,
          vendorCode: saved.vendors.selectedSellerCode,
          purchaseTitle: saved.basics.title,
          department: saved.basics.department,
          costCenter: saved.basics.costCenter,
          totalAmount: grandTotal(saved.items),
          items: saved.items.map(item => ({
            id: item.id,
            name: item.name,
            spec: item.specification,
            qty: item.quantity,
            unit: item.unit,
            price: item.unitPrice,
            tax: item.gst
          }))
        }));
      }
      const referenceNumber = submitted?.referenceNumber || submitted?.procurement?.requirementNumber || submitted?.data?.referenceNumber;
      toast.success(referenceNumber ? `Procurement submitted: ${referenceNumber}` : 'Procurement submitted');
      if (method.route) {
        router.push(method.route);
        return;
      }
      toast.success('Tender workbench draft is ready for approval');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to submit procurement');
    } finally {
      setSubmittingDraft(false);
    }
  };

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      {/* Tri-color Accent Strip */}
      <div className="h-1.5 w-full bg-gradient-to-r from-[#ff9933] via-white to-[#128807]" />

      {/* Official Government Branding Banner */}
     

      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1720px] flex-col gap-4 px-4 py-4 lg:px-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div className="min-w-0">
              <button
                type="button"
                onClick={goBack}
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
              {methodSelected && (
                <Button type="button" variant="outline" onClick={() => setPreview(value => !value)} className="h-10">
                  <Info className="mr-2 h-4 w-4" /> {preview ? 'Edit' : 'Preview'}
                </Button>
              )}
              <Button type="button" variant="outline" onClick={() => void saveDraft()} disabled={savingDraft || submittingDraft} className="h-10">
                {savingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />} Save Draft
              </Button>
              <Button type="button" onClick={methodSelected ? () => void continueToModule() : goToDetails} disabled={savingDraft || submittingDraft} className="h-10 bg-[#12335f] text-white">
                {submittingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : methodSelected ? <Send className="mr-2 h-4 w-4" /> : <ArrowRight className="mr-2 h-4 w-4" />}
                {methodSelected ? submittingDraft ? 'Submitting...' : 'Submit & Continue' : 'Next'}
              </Button>
            </div>
          </div>

          {!methodSelected && (
            <div className="grid gap-3 xl:grid-cols-5">
              {methodConfigs.map(config => (
                <MethodCard
                  key={config.id}
                  config={config}
                  selected={draft.type === config.id}
                  recommended={recommendedType === config.id}
                  onSelect={() => changeType(config.id)}
                  onStart={() => router.push(`/buyer/create-procurement/${config.slug}`)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {!methodSelected ? (
        <div className="mx-auto max-w-[1720px] px-4 py-5 lg:px-6">
          <div className="grid gap-4 xl:grid-cols-[1fr_330px]">
            <section className="space-y-4">
              <GuidanceBand draft={draft} method={method} />
              <Panel title={`${method.title} route preview`} icon={<MethodIcon className="h-4 w-4" />}>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Use this when</p>
                    <div className="mt-3">
                      <Checklist rows={method.fit} />
                    </div>
                  </div>
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest text-slate-500">Before publishing</p>
                    <div className="mt-3">
                      <Checklist rows={method.gates} />
                    </div>
                  </div>
                </div>
              </Panel>
              <MethodHelpSection />
              <div className="flex flex-col-reverse gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <Button type="button" variant="outline" onClick={() => router.back()}>
                  <ArrowLeft className="mr-2 h-4 w-4" /> Back
                </Button>
                <div className="text-center text-xs font-bold text-slate-500">
                  Select a procurement method, then continue to its form.
                </div>
                <Button type="button" onClick={goToDetails} className="bg-[#12335f] text-white">
                  Next <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </section>
            <aside className="space-y-4">
              <SummaryCard draft={draft} readiness={readiness} method={method} />
              <ProcurementAdvisor
                advisor={advisor}
                recommendation={advisorRecommendation}
                onChange={setAdvisor}
                onApply={(type) => changeType(type)}
                onStart={(type) => router.push(`/buyer/create-procurement/${type}`)}
              />
              <DraftPanel
                draft={savedDraftMeta}
                serverDraft={serverDraftMeta}
                onContinue={() => {
                  const source = savedDraftMeta || serverDraftMeta?.payload;
                  if (!source) return;
                  const type = normalizeProcurementType(source.type || serverDraftMeta?.methodSlug);
                  const restored = { ...defaultDraft(type), ...source, id: source.id || serverDraftMeta?.id, type, tender: { ...defaultTenderDetails(), ...source.tender } };
                  setDraft(restored);
                  setSavedDraftMeta(restored);
                  localStorage.setItem(DRAFT_KEY, JSON.stringify(restored));
                  setMethodSelected(true);
                  setPreview(false);
                  setActiveStep(0);
                }}
                onOpenDrafts={() => router.push(PROCUREMENT_DRAFTS_ROUTE)}
              />
            </aside>
          </div>
        </div>
      ) : (
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
          <Button type="button" variant="outline" onClick={() => setMethodSelected(false)} className="w-full">
            <ArrowLeft className="mr-2 h-4 w-4" /> Change Method
          </Button>
        </aside>

        <section className="min-w-0 space-y-4">
          <GuidanceBand draft={draft} method={method} />
          {preview ? (
            <ReviewStep draft={draft} readiness={readiness} />
          ) : (
            <StepBody step={currentStep} draft={draft} updateDraft={updateDraft} onDocumentUpload={uploadDocumentForDraft} />
          )}

          <div className="flex flex-col-reverse gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
            <Button
              type="button"
              variant="outline"
              onClick={() => activeStep === 0 ? setMethodSelected(false) : setActiveStep(step => Math.max(0, step - 1))}
            >
              <ArrowLeft className="mr-2 h-4 w-4" /> Previous
            </Button>
            <div className="text-center text-xs font-bold text-slate-500">
              Step {Math.min(activeStep + 1, activeSteps.length)} of {activeSteps.length}
            </div>
            {activeStep < activeSteps.length - 1 ? (
              <Button type="button" onClick={() => void advanceStep()} disabled={savingDraft || submittingDraft} className="bg-[#12335f] text-white">
                {savingDraft ? 'Saving...' : 'Next'} {savingDraft ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>
            ) : (
              <Button type="button" onClick={() => void continueToModule()} disabled={savingDraft || submittingDraft} className="bg-[#12335f] text-white">
                {submittingDraft ? 'Submitting...' : 'Submit & Continue'} {submittingDraft ? <Loader2 className="ml-2 h-4 w-4 animate-spin" /> : <Send className="ml-2 h-4 w-4" />}
              </Button>
            )}
          </div>
        </section>

        <aside className="space-y-4">
          <SummaryCard draft={draft} readiness={readiness} method={method} />
        <Panel title="Before Publishing" icon={<ShieldCheck className="h-4 w-4" />}>
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
      )}
    </main>
  );
}

function ProcurementAdvisor({
  advisor,
  recommendation,
  onChange,
  onApply,
  onStart,
}: {
  advisor: AdvisorState;
  recommendation: ProcurementType;
  onChange: (advisor: AdvisorState) => void;
  onApply: (type: ProcurementType) => void;
  onStart: (type: ProcurementType) => void;
}) {
  const method = methodConfigs.find(config => config.id === recommendation) || methodConfigs[2];
  const update = (patch: Partial<AdvisorState>) => onChange({ ...advisor, ...patch });

  return (
    <Panel title="Not sure what to choose?" icon={<Info className="h-4 w-4" />}>
      <div className="space-y-3">
        <div>
          <label className="text-[10px] font-black uppercase tracking-wide text-slate-500">Estimated procurement value</label>
          <input
            type="number"
            min={0}
            value={advisor.estimatedValue}
            onChange={event => update({ estimatedValue: event.target.value })}
            className={inputClass}
            placeholder="Enter estimated value"
          />
        </div>
        <div className="grid gap-2">
          <Toggle label="Item available in catalogue" checked={advisor.catalogAvailable} onChange={value => update({ catalogAvailable: value })} />
          <Toggle label="Technical evaluation required" checked={advisor.technicalEvaluation} onChange={value => update({ technicalEvaluation: value })} />
          <Toggle label="Proprietary / single OEM" checked={advisor.proprietary} onChange={value => update({ proprietary: value })} />
          <Toggle label="BOQ or line-item schedule required" checked={advisor.boqRequired} onChange={value => update({ boqRequired: value })} />
        </div>
        <div className="rounded-lg border border-blue-100 bg-blue-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-widest text-blue-700">Recommended Method</p>
          <p className="mt-1 text-sm font-black text-blue-950">{method.title}</p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-blue-900">{method.subtitle}</p>
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Button type="button" variant="outline" onClick={() => onApply(recommendation)} className="h-9 text-xs font-black uppercase">
            Apply
          </Button>
          <Button type="button" onClick={() => onStart(recommendation)} className="h-9 bg-[#12335f] text-xs font-black uppercase text-white">
            Start <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </div>
    </Panel>
  );
}

function MethodHelpSection() {
  const rows = [
    {
      name: 'Direct Purchase',
      use: 'Low-value or approved single-seller purchase where catalogue or vendor selection is clear.',
      caution: 'Keep vendor, budget, and delivery proof ready before submission.',
    },
    {
      name: 'RFQ',
      use: 'Need quotations from invited or open sellers before deciding commercial terms.',
      caution: 'Use when specs are clear but final seller price discovery is still required.',
    },
    {
      name: 'Tender / Open Bid',
      use: 'Formal public procurement with eligibility, bid dates, EMD/ePBG, and technical evaluation.',
      caution: 'Requires complete timeline, documents, and evaluation settings.',
    },
    {
      name: 'BOQ Based Bid',
      use: 'Works, AMC, fabrication, or item-wise schedule where rates are evaluated line by line.',
      caution: 'Upload BOQ or complete the line-item schedule before submission.',
    },
    {
      name: 'PAC Bid',
      use: 'Proprietary or single-OEM procurement where competition is not feasible.',
      caution: 'PAC certificate and justification are mandatory.',
    },
    {
      name: 'Reverse Auction',
      use: 'Post-qualification price discovery where eligible sellers compete through decrements.',
      caution: 'Set start price, decrement, and auction rules clearly.',
    },
  ];

  return (
    <Panel title="Method help" icon={<Info className="h-4 w-4" />}>
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {rows.map(row => (
          <div key={row.name} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-sm font-black text-slate-950">{row.name}</p>
            <p className="mt-2 text-xs font-semibold leading-5 text-slate-600">{row.use}</p>
            <p className="mt-2 rounded-md border border-slate-200 bg-white px-2 py-1.5 text-[11px] font-bold leading-4 text-slate-500">{row.caution}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function DraftPanel({
  draft,
  serverDraft,
  onContinue,
  onOpenDrafts,
}: {
  draft: Draft | null;
  serverDraft?: any | null;
  onContinue: () => void;
  onOpenDrafts: () => void;
}) {
  const title = draft?.basics.title || serverDraft?.title || '';
  const method = draft?.type || normalizeProcurementType(serverDraft?.methodSlug || serverDraft?.procurementMethod);
  const updatedAt = draft?.updatedAt || serverDraft?.updatedAt;
  const hasDraft = Boolean(draft || serverDraft);

  return (
    <Panel title="Recently saved drafts" icon={<History className="h-4 w-4" />}>
      {hasDraft ? (
        <div className="space-y-3">
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="text-[10px] font-black uppercase tracking-wide text-slate-500">{methodLabel(method)}</p>
            <p className="mt-1 text-sm font-black text-slate-950 text-wrap-anywhere">{title || 'Untitled procurement draft'}</p>
            <p className="mt-1 text-xs font-semibold text-slate-500">
              {updatedAt ? `Saved ${new Date(updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}` : 'Saved in this browser'}
            </p>
          </div>
          <Button type="button" onClick={onContinue} className="h-9 w-full bg-[#12335f] text-xs font-black uppercase text-white">
            Continue Draft <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4 text-center">
          <p className="text-sm font-black text-slate-800">No saved draft in this browser</p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">Choose a procurement method and save the wizard to resume it here.</p>
        </div>
      )}
      <Button type="button" variant="outline" onClick={onOpenDrafts} className="mt-3 h-9 w-full text-xs font-black uppercase">
        Open Draft Register
      </Button>
    </Panel>
  );
}

function MethodCard({
  config,
  selected,
  recommended,
  onSelect,
  onStart,
}: {
  config: MethodConfig;
  selected: boolean;
  recommended: boolean;
  onSelect: () => void;
  onStart: () => void;
}) {
  const Icon = config.icon;
  return (
    <article
      className={cn(
        'min-h-[136px] rounded-xl border bg-gradient-to-br from-white to-slate-50/30 p-4 text-left transition-all duration-300 hover:-translate-y-1 hover:shadow-lg flex flex-col justify-between border-slate-200',
        selected 
          ? 'border-[#12335f] bg-[#12335f]/5 shadow-md ring-1 ring-[#12335f] border-l-4 border-l-[#ff9933]' 
          : recommended 
            ? 'border-slate-200 border-l-4 border-l-emerald-500 hover:border-slate-300' 
          : 'border-slate-200 border-l-4 border-l-slate-300 hover:border-slate-300'
      )}
    >
      <button type="button" onClick={onSelect} className="w-full text-left">
        <div className="w-full flex items-start justify-between gap-3">
          <span className={cn(
            'flex h-10 w-10 items-center justify-center rounded-lg border shadow-sm', 
            selected ? 'bg-[#12335f] text-white border-transparent' : config.accent
          )}>
            <Icon className="h-5 w-5" />
          </span>
          <span className="flex flex-col items-end gap-1">
            {recommended && (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-emerald-700 shadow-sm">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" /> RECOMMENDED
              </span>
            )}
            <span className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-slate-500">
              {config.badge}
            </span>
          </span>
        </div>
      </button>
      <div>
        <p className="mt-3 text-sm font-black text-slate-950">{config.title}</p>
        <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-500">{config.subtitle}</p>
        <p className="mt-2 text-[10px] font-bold uppercase tracking-wide text-slate-400">{config.valueHint}</p>
      </div>
      <Button type="button" variant={selected ? 'primary' : 'outline'} size="sm" onClick={onStart} className={cn('mt-3 h-8 justify-center text-[10px] font-black uppercase', selected && 'bg-[#12335f] text-white')}>
        Start <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
      </Button>
    </article>
  );
}

function StepBody({
  step,
  draft,
  updateDraft,
  onDocumentUpload,
}: {
  step: StepKind;
  draft: Draft;
  updateDraft: (updater: (current: Draft) => Draft) => void;
  onDocumentUpload: (documentId: string, file: File) => Promise<void>;
}) {
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
      return <DocumentsStep draft={draft} updateDraft={updateDraft} onDocumentUpload={onDocumentUpload} />;
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
          <SelectWithOther value={draft.basics.requirementType} options={REQUIREMENT_TYPE_OPTIONS} onChange={value => updateBasics('requirementType', value)} otherPlaceholder="Enter requirement type" />
        </Field>
        <Field label="Priority">
          <select value={draft.basics.priority} onChange={event => updateBasics('priority', event.target.value)} className={inputClass}>
            {PRIORITY_OPTIONS.map(option => <option key={option} value={option}>{option}</option>)}
          </select>
        </Field>
        <Field label="Category" required>
          <SelectWithOther value={draft.basics.category} options={PROCUREMENT_CATEGORY_OPTIONS} onChange={value => updateBasics('category', value)} placeholder="Select category" otherPlaceholder="Enter category" />
        </Field>
        <Field label="Sub category">
          <SelectWithOther value={draft.basics.subCategory} options={PROCUREMENT_SUBCATEGORY_OPTIONS} onChange={value => updateBasics('subCategory', value)} placeholder="Select sub category" otherPlaceholder="Enter sub category" />
        </Field>
        <Field label="Department">
          <SelectWithOther value={draft.basics.department} options={DEPARTMENT_OPTIONS} onChange={value => updateBasics('department', value)} placeholder="Select department" otherPlaceholder="Enter department" />
        </Field>
        <Field label="Estimated value">
          <input type="number" min={0} value={draft.basics.estimatedValue || ''} onChange={event => updateBasics('estimatedValue', Number(event.target.value || 0))} className={inputClass} placeholder="0" />
        </Field>
        <Field label="Funding source">
          <SelectWithOther value={draft.basics.fundingSource} options={FUNDING_SOURCE_OPTIONS} onChange={value => updateBasics('fundingSource', value)} placeholder="Select funding source" otherPlaceholder="Enter funding source" />
        </Field>
        <Field label="Cost center">
          <SelectWithOther value={draft.basics.costCenter} options={COST_CENTER_OPTIONS} onChange={value => updateBasics('costCenter', value)} placeholder="Select cost center" otherPlaceholder="Enter cost center" />
        </Field>
        <Field label="Justification / scope" className="lg:col-span-4">
          <textarea value={draft.basics.justification} onChange={event => updateBasics('justification', event.target.value)} rows={5} maxLength={1000} className={textareaClass} placeholder="Why this procurement is required, expected outcome, constraints and delivery need." />
        </Field>
        {isTenderMethod(draft.type) && (
          <>
            <Field label="Tender number">
              <input value={draft.tender.tenderNumber} onChange={event => updateTender('tenderNumber', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Tender type" required>
              <SelectWithOther value={draft.tender.tenderType} options={TENDER_TYPE_OPTIONS} onChange={value => updateTender('tenderType', value)} otherPlaceholder="Enter tender type" />
            </Field>
            <Field label="Tender mode">
              <SelectWithOther value={draft.tender.tenderMode} options={TENDER_MODE_OPTIONS} onChange={value => updateTender('tenderMode', value)} otherPlaceholder="Enter tender mode" />
            </Field>
            <Field label="Tender visibility">
              <SelectWithOther value={draft.tender.visibility} options={TENDER_VISIBILITY_OPTIONS} onChange={value => updateTender('visibility', value)} otherPlaceholder="Enter tender visibility" />
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
              {isTenderMethod(draft.type) && <th className="px-3 py-2">Delivery date</th>}
              {isTenderMethod(draft.type) && <th className="px-3 py-2">Brand policy</th>}
              <th className="px-3 py-2">Unit price</th>
              <th className="px-3 py-2">GST %</th>
              {isTenderMethod(draft.type) && <th className="px-3 py-2">Spec file</th>}
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
                  {isTenderMethod(draft.type) && (
                    <input value={item.technicalSpecification} onChange={event => updateItem(item.id, { technicalSpecification: event.target.value })} className={cn(tableInputClass, 'mt-2')} placeholder="Technical compliance notes" />
                  )}
                </td>
                <td className="px-3 py-2"><input type="number" min={0} value={item.quantity || ''} onChange={event => updateItem(item.id, { quantity: Number(event.target.value || 0) })} className={tableInputClass} /></td>
                <td className="px-3 py-2">
                  <SelectWithOther value={item.unit} options={QUANTITY_UNITS} onChange={value => updateItem(item.id, { unit: value })} placeholder="Select unit" otherPlaceholder="Enter unit" className={tableInputClass} />
                </td>
                {isTenderMethod(draft.type) && <td className="px-3 py-2"><input type="date" value={item.deliveryDate} onChange={event => updateItem(item.id, { deliveryDate: event.target.value })} className={tableInputClass} /></td>}
                {isTenderMethod(draft.type) && (
                  <td className="px-3 py-2">
                    <SelectWithOther value={item.brandPolicy} options={BRAND_POLICY_OPTIONS} onChange={value => updateItem(item.id, { brandPolicy: value })} placeholder="Select brand policy" otherPlaceholder="Enter brand policy" className={tableInputClass} />
                  </td>
                )}
                <td className="px-3 py-2"><input type="number" min={0} value={item.unitPrice || ''} onChange={event => updateItem(item.id, { unitPrice: Number(event.target.value || 0) })} className={tableInputClass} /></td>
                <td className="px-3 py-2"><input type="number" min={0} value={item.gst || ''} onChange={event => updateItem(item.id, { gst: Number(event.target.value || 0) })} className={tableInputClass} /></td>
                {isTenderMethod(draft.type) && (
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

interface VendorSearchableDropdownProps {
  value: string | number;
  onChange: (seller: MarketplaceSeller | null) => void;
  placeholder?: string;
  className?: string;
}

function VendorSearchableDropdown({ value, onChange, placeholder = 'Search vendor name or organization...', className }: VendorSearchableDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sellers, setSellers] = useState<MarketplaceSeller[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<MarketplaceSeller | null>(null);

  // Fetch initial seller if value exists
  useEffect(() => {
    if (value) {
      setLoading(true);
      marketplaceApi.getSellers({ pageSize: 50 })
        .then(res => {
          const found = res?.sellers?.find((s: any) => s.sellerUserId === Number(value) || s.id === Number(value));
          if (found) {
            setSelectedSeller(found);
            setSearch(found.organizationName);
          }
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    } else {
      setSelectedSeller(null);
      setSearch('');
    }
  }, [value]);

  // Debounce search query
  useEffect(() => {
    if (!open) return;
    const delayDebounce = setTimeout(() => {
      setLoading(true);
      const params: Record<string, string | number> = { pageSize: 20 };
      if (search) params.q = search;
      marketplaceApi.getSellers(params)
        .then(res => {
          setSellers(res?.sellers || []);
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [search, open]);

  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative">
        <input
          type="text"
          className="h-11 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-10 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15"
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-[#12335f]" />}
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedSeller(null);
                onChange(null);
                setSellers([]);
              }}
              className="hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg z-20">
            {loading && sellers.length === 0 ? (
              <div className="p-3 text-center text-xs font-semibold text-slate-500">Loading sellers...</div>
            ) : sellers.length === 0 ? (
              <div className="p-3 text-center text-xs font-semibold text-slate-500">No sellers found</div>
            ) : (
              sellers.map((seller) => {
                const isValid = seller.sellerUserId !== null && seller.sellerUserId !== undefined;
                const isSelected = selectedSeller?.id === seller.id;
                return (
                  <button
                    key={seller.id}
                    type="button"
                    disabled={!isValid}
                    onClick={() => {
                      setSelectedSeller(seller);
                      setSearch(seller.organizationName);
                      onChange(seller);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-xs transition",
                      !isValid ? "opacity-50 cursor-not-allowed bg-slate-50/50" : "hover:bg-slate-50",
                      isSelected && "bg-blue-50 text-[#12335f]"
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{seller.organizationName}</span>
                      {seller.verificationStatus === 'VERIFIED' && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] uppercase font-bold border border-emerald-200 text-emerald-700">Verified</span>
                      )}
                    </div>
                    <div className="mt-1 flex w-full items-center justify-between text-[10px] text-slate-500 font-semibold">
                      <span>
                        {seller.organizationType} · {[seller.city, seller.state].filter(Boolean).join(', ')}
                      </span>
                      {!isValid && (
                        <span className="text-red-500 font-bold">No active user account</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

function VendorsStep({ draft, updateDraft }: StepProps) {
  const updateVendors = (key: keyof Draft['vendors'], value: string | number | boolean | null) =>
    updateDraft(current => ({ ...current, vendors: { ...current.vendors, [key]: value } }));
  const updateTender = (key: keyof Draft['tender'], value: string | boolean) =>
    updateDraft(current => ({ ...current, tender: { ...current.tender, [key]: value } }));

  const showSingleVendor = isDirectMethod(draft.type) || draft.vendors.selection === 'Single / PAC Vendor';

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
          <SelectWithOther value={draft.vendors.minimumTurnover} options={MINIMUM_TURNOVER_OPTIONS} onChange={value => updateVendors('minimumTurnover', value)} placeholder="Select turnover requirement" otherPlaceholder="Enter turnover requirement" />
        </Field>
        {showSingleVendor && (
          <>
            <Field label="Select Single Vendor *" required className="lg:col-span-3">
              <VendorSearchableDropdown
                value={draft.vendors.selectedSellerId || ''}
                onChange={(seller) => {
                  updateDraft(current => ({
                    ...current,
                    vendors: {
                      ...current.vendors,
                      selectedSellerId: seller ? seller.sellerUserId || seller.id : null,
                      selectedSellerName: seller ? seller.organizationName : '',
                      selectedSellerCode: seller ? `VEN${10000 + seller.id}` : ''
                    }
                  }));
                }}
              />
            </Field>
            {draft.vendors.selectedSellerId && (
              <div className="lg:col-span-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs font-semibold space-y-1">
                <p><span className="text-slate-500 font-bold uppercase text-[10px]">Selected Vendor Name:</span> {draft.vendors.selectedSellerName}</p>
                <p><span className="text-slate-500 font-bold uppercase text-[10px]">Seller User ID:</span> {draft.vendors.selectedSellerId}</p>
                <p><span className="text-slate-500 font-bold uppercase text-[10px]">Vendor Code:</span> {draft.vendors.selectedSellerCode}</p>
              </div>
            )}
          </>
        )}
        <Field label="Experience required">
          <SelectWithOther value={draft.vendors.experienceYears} options={EXPERIENCE_REQUIRED_OPTIONS} onChange={value => updateVendors('experienceYears', value)} placeholder="Select experience" otherPlaceholder="Enter experience requirement" />
        </Field>
        <Toggle label="MSME preference" checked={draft.vendors.msmePreference} onChange={value => updateVendors('msmePreference', value)} />
        <Toggle label="Make in India preference" checked={draft.vendors.makeInIndiaPreference} onChange={value => updateVendors('makeInIndiaPreference', value)} />
        <Toggle label="Local vendor preference" checked={draft.vendors.localVendorPreference} onChange={value => updateVendors('localVendorPreference', value)} />
        {isTenderMethod(draft.type) && (
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
  const updateConsignee = (id: string, patch: Partial<ConsigneeRow>) =>
    updateDraft(current => ({
      ...current,
      consigneeDetails: current.consigneeDetails.map(consignee => consignee.id === id ? { ...consignee, ...patch } : consignee),
    }));
  const addConsignee = () =>
    updateDraft(current => ({
      ...current,
      consigneeDetails: [...current.consigneeDetails, { id: makeId(), name: '', location: '', contact: '', quantity: 0 }],
    }));
  const removeConsignee = (id: string) =>
    updateDraft(current => ({
      ...current,
      consigneeDetails: current.consigneeDetails.length === 1 ? current.consigneeDetails : current.consigneeDetails.filter(consignee => consignee.id !== id),
    }));
  const totalItemQuantity = draft.items.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const totalConsigneeQuantity = draft.consigneeDetails.reduce((total, consignee) => total + Number(consignee.quantity || 0), 0);

  return (
    <Panel
      title="Schedule & Delivery"
      icon={<CalendarClock className="h-4 w-4" />}
      action={<Button type="button" variant="outline" size="sm" onClick={addConsignee}>Add consignee</Button>}
    >
      <div className="grid gap-4 lg:grid-cols-4">
        <Field label="Publish date">
          <input type="date" value={draft.schedule.publishDate} onChange={event => updateSchedule('publishDate', event.target.value)} className={inputClass} />
        </Field>
        <Field label="Submission end date">
          <input type="date" value={draft.schedule.submissionDate} onChange={event => updateSchedule('submissionDate', event.target.value)} className={inputClass} />
        </Field>
        <Field label="Opening date">
          <input type="date" value={draft.schedule.openingDate} onChange={event => updateSchedule('openingDate', event.target.value)} className={inputClass} />
        </Field>
        <Field label="Quote validity days">
          <input type="number" min={1} value={draft.schedule.validityDays || ''} onChange={event => updateSchedule('validityDays', Number(event.target.value || 0))} className={inputClass} />
        </Field>
        <Field label="Required delivery date">
          <input type="date" value={draft.schedule.deliveryDate} onChange={event => updateSchedule('deliveryDate', event.target.value)} className={inputClass} />
        </Field>
        <Toggle label="Pre-bid meeting" checked={draft.schedule.preBidMeeting} onChange={value => updateSchedule('preBidMeeting', value)} />
        {draft.schedule.preBidMeeting && (
          <Field label="Pre-bid date">
            <input type="date" value={draft.schedule.preBidDate} onChange={event => updateSchedule('preBidDate', event.target.value)} className={inputClass} />
          </Field>
        )}
        {isTenderMethod(draft.type) && (
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
            <Field label="Delivery location" className="lg:col-span-2">
              <input value={draft.tender.deliveryLocation} onChange={event => updateTender('deliveryLocation', event.target.value)} className={inputClass} placeholder="Full delivery or execution address" />
            </Field>
            <Field label="Delivery type">
              <SelectWithOther value={draft.tender.deliveryType} options={DELIVERY_TYPES} onChange={value => updateTender('deliveryType', value)} placeholder="Select delivery type" otherPlaceholder="Enter delivery type" />
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
      <div className="mt-5 overflow-x-auto rounded-lg border border-slate-200">
        <table className="min-w-[760px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
            <tr>
              {['Consignee / office', 'Delivery location', 'Contact', 'Quantity', 'Action'].map(head => <th key={head} className="px-3 py-2">{head}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {draft.consigneeDetails.map(consignee => (
              <tr key={consignee.id} className="align-top">
                <td className="px-3 py-2"><input value={consignee.name} onChange={event => updateConsignee(consignee.id, { name: event.target.value })} className={tableInputClass} placeholder="Stores / department / site" /></td>
                <td className="px-3 py-2"><input value={consignee.location} onChange={event => updateConsignee(consignee.id, { location: event.target.value })} className={tableInputClass} placeholder="Delivery address" /></td>
                <td className="px-3 py-2"><input value={consignee.contact} onChange={event => updateConsignee(consignee.id, { contact: event.target.value })} className={tableInputClass} placeholder="Name / phone" /></td>
                <td className="px-3 py-2"><input type="number" min={0} value={consignee.quantity || ''} onChange={event => updateConsignee(consignee.id, { quantity: Number(event.target.value || 0) })} className={tableInputClass} /></td>
                <td className="px-3 py-2">
                  <button type="button" onClick={() => removeConsignee(consignee.id)} className="rounded-md p-2 text-rose-600 hover:bg-rose-50" aria-label="Remove consignee">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <Metric label="Procurement quantity" value={String(totalItemQuantity)} />
        <Metric label="Consignee quantity" value={String(totalConsigneeQuantity)} />
        <Metric label="Quantity check" value={totalItemQuantity === totalConsigneeQuantity ? 'Matched' : 'Mismatch'} />
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
    <Panel title={isAuctionMethod(draft.type) ? 'Auction Rules' : 'Bid & Evaluation Rules'} icon={<ShieldCheck className="h-4 w-4" />}>
      <div className="grid gap-4 lg:grid-cols-3">
        <Field label="Bid type" required>
          <SelectWithOther value={draft.rules.bidType} options={BID_TYPE_OPTIONS} onChange={value => updateRules('bidType', value)} otherPlaceholder="Enter bid type" />
        </Field>
        <Field label="Evaluation method" required>
          <SelectWithOther value={draft.rules.evaluation} options={EVALUATION_OPTIONS} onChange={value => updateRules('evaluation', value)} otherPlaceholder="Enter evaluation method" />
        </Field>
        <Field label="EMD amount">
          <input type="number" min={0} value={draft.rules.emdAmount || ''} onChange={event => updateRules('emdAmount', Number(event.target.value || 0))} className={inputClass} />
        </Field>
        <Toggle label="EMD required" checked={draft.rules.emdRequired} onChange={value => updateRules('emdRequired', value)} />
        <Toggle label="Performance security" checked={draft.rules.performanceSecurity} onChange={value => updateRules('performanceSecurity', value)} />
        <Toggle label="Reverse auction intent" checked={draft.rules.reverseAuctionIntent} onChange={value => updateRules('reverseAuctionIntent', value)} />
        {(isAuctionMethod(draft.type) || draft.rules.reverseAuctionIntent) && (
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
        {isTenderMethod(draft.type) && (
          <>
            <Field label="Currency">
              <SelectWithOther value={draft.tender.currency} options={CURRENCY_OPTIONS} onChange={value => updateTender('currency', value)} otherPlaceholder="Enter currency" />
            </Field>
            <Field label="Price type">
              <SelectWithOther value={draft.tender.priceType} options={PRICE_TYPE_OPTIONS} onChange={value => updateTender('priceType', value)} otherPlaceholder="Enter price type" />
            </Field>
            <Field label="Tax type">
              <SelectWithOther value={draft.tender.taxType} options={TAX_TYPE_OPTIONS} onChange={value => updateTender('taxType', value)} otherPlaceholder="Enter tax type" />
            </Field>
            <Toggle label="GST included" checked={draft.tender.gstIncluded} onChange={value => updateTender('gstIncluded', value)} />
            <Field label="GST rate">
              <input type="number" value={draft.tender.gstRate} onChange={event => updateTender('gstRate', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Payment terms">
              <SelectWithOther value={draft.tender.paymentTerms} options={PAYMENT_TERMS} onChange={value => updateTender('paymentTerms', value)} placeholder="Select payment terms" otherPlaceholder="Enter payment terms" />
            </Field>
            <Field label="Performance security amount">
              <input type="number" value={draft.tender.performanceSecurityAmount} onChange={event => updateTender('performanceSecurityAmount', event.target.value)} disabled={!draft.rules.performanceSecurity} className={inputClass} />
            </Field>
            <Field label="Tender evaluation method">
              <SelectWithOther value={draft.tender.evaluationMethod} options={TENDER_EVALUATION_OPTIONS} onChange={value => updateTender('evaluationMethod', value)} otherPlaceholder="Enter tender evaluation method" />
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

function DocumentsStep({ draft, updateDraft, onDocumentUpload }: StepProps) {
  const updateDocument = (id: string, patch: Partial<DocumentRow>) => updateDraft(current => ({
    ...current,
    documents: current.documents.map(document => document.id === id ? { ...document, ...patch } : document),
  }));

  const handleFile = (documentId: string, event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      void onDocumentUpload?.(documentId, file);
    }
    event.target.value = '';
  };

  return (
    <Panel title="Documents & Compliance" icon={<Upload className="h-4 w-4" />}>
      <div className="space-y-4">
        {isTenderMethod(draft.type) && (
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
                  <td className="px-3 py-3 text-slate-600">
                    <div className="max-w-[260px] space-y-1">
                      <p className="truncate font-bold text-slate-700">{document.fileName || 'No file attached'}</p>
                      {document.uploadStatus === 'uploading' && (
                        <div className="space-y-1">
                          <div className="h-1.5 rounded-full bg-slate-100">
                            <div className="h-1.5 rounded-full bg-[#12335f]" style={{ width: `${Math.max(1, Math.min(100, document.uploadProgress || 1))}%` }} />
                          </div>
                          <p className="text-[10px] font-black uppercase text-slate-500">Uploading {document.uploadProgress || 1}%</p>
                        </div>
                      )}
                      {document.uploadStatus === 'uploaded' && (
                        <p className="text-[10px] font-black uppercase text-emerald-700">Uploaded asset #{document.fileAssetId}</p>
                      )}
                      {document.uploadStatus === 'failed' && (
                        <p className="text-[10px] font-bold text-rose-600">{document.uploadError || 'Upload failed'}</p>
                      )}
                    </div>
                  </td>
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
          <SelectWithOther value={draft.approval.workflow} options={APPROVAL_WORKFLOW_OPTIONS} onChange={value => updateApproval('workflow', value)} otherPlaceholder="Enter approval workflow" />
        </Field>
        <Field label="Approver">
          <input value={draft.approval.approver} onChange={event => updateApproval('approver', event.target.value)} className={inputClass} placeholder="Name / role" />
        </Field>
        <Field label="Approval note" className="lg:col-span-3">
          <textarea value={draft.approval.notes} onChange={event => updateApproval('notes', event.target.value)} rows={4} className={textareaClass} placeholder="Approval context, special conditions, exceptions and publication notes." />
        </Field>
        {isTenderMethod(draft.type) && (
          <>
            <Field label="Contact name">
              <input value={draft.tender.contactName} onChange={event => updateTender('contactName', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Contact email">
              <input value={draft.tender.contactEmail} onChange={event => updateTender('contactEmail', event.target.value)} className={inputClass} />
            </Field>
            <Field label="Contact mobile">
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
              <SelectWithOther value={draft.tender.approvalStatus} options={APPROVAL_STATUS_OPTIONS} onChange={value => updateTender('approvalStatus', value)} otherPlaceholder="Enter approval status" />
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
  const submissionLabel = isTenderMethod(draft.type)
    ? `${draft.tender.bidClosingDate || 'Date not set'} ${draft.tender.bidClosingTime || ''}`.trim()
    : draft.schedule.submissionDate || 'Not set';

  return (
    <Panel title="Review & Handoff Readiness" icon={<CheckCircle2 className="h-4 w-4" />}>
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
            <Metric label={isTenderMethod(draft.type) ? 'Bid closing' : 'Submission'} value={submissionLabel} />
          </div>
          {isTenderMethod(draft.type) && (
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
    <div className="rounded-xl border border-amber-200 bg-amber-50/20 p-4 border-l-4 border-l-[#ff9933]">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between font-sans">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-lg bg-white border border-amber-200 shadow-sm text-[#ff9933] shrink-0">
            <Info className="h-5 w-5" />
          </span>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-black text-slate-900">{method.title} Setup Protocol</p>
              <span className="text-[9px] font-black bg-amber-100 border border-amber-200 text-amber-800 px-1.5 py-0.5 rounded uppercase">GFR 2017 Regulatory Guide</span>
            </div>
            <p className="mt-1 max-w-3xl text-xs font-semibold leading-relaxed text-slate-600">
              {isDirectMethod(draft.type)
                ? 'Under Rule 154 of GFR 2017, Direct Purchase is admissible for goods/services up to Rs. 25,000 without tenders. Ensure bank details and items are verified.'
                : isAuctionMethod(draft.type)
                  ? 'Reverse Auction is triggered when technical evaluations are finalized. The lowest bidding seller (L1) is determined dynamically via active price decrements.'
                  : isTenderMethod(draft.type)
                    ? `${method.title} follows the formal bid workbench path with documents, eligibility, schedule, approval and seller visibility controls.`
                    : isComparisonMethod(draft.type)
                      ? 'L1 Comparison is used for procurement up to Rs. 2.5 Lakhs by comparing at least three distinct sellers to establish a competitive price record.'
                      : 'Request for Quotation (RFQ) is deployed to solicit sealed bids from verified micro and small enterprise suppliers in the local registry.'}
            </p>
          </div>
        </div>
        <div className="rounded-xl border border-amber-200 bg-white px-4 py-2 text-right shrink-0 shadow-sm">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Sanction Value</p>
          <p className="text-lg font-mono font-black text-[#12335f]">{money(value)}</p>
        </div>
      </div>
    </div>
  );
}

function SummaryCard({ draft, readiness, method }: { draft: Draft; readiness: Array<{ label: string; ok: boolean }>; method: MethodConfig }) {
  const ready = readiness.filter(item => item.ok).length;
  const workflow = isTenderMethod(draft.type)
    ? draft.tender.approvalChain || draft.approval.workflow
    : draft.approval.workflow;
  const deadline = isTenderMethod(draft.type)
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
        <Metric label={isTenderMethod(draft.type) ? 'Bid closing' : 'Submission'} value={deadline} />
        <Metric label="Workflow" value={workflow} />
      </div>
    </Panel>
  );
}

function getReadiness(draft: Draft) {
  const value = draft.basics.estimatedValue || grandTotal(draft.items);
  const hasItems = draft.items.some(item => item.name.trim() && item.quantity > 0);
  const requiredDocs = draft.documents.filter(document => document.requirement === 'Mandatory');
  const totalItemQuantity = draft.items.reduce((total, item) => total + Number(item.quantity || 0), 0);
  const totalConsigneeQuantity = draft.consigneeDetails.reduce((total, consignee) => total + Number(consignee.quantity || 0), 0);
  const hasConsigneeDetails = draft.consigneeDetails.some(consignee => consignee.location.trim() || consignee.name.trim());
  const hasAllRequiredDocs = requiredDocs.length === 0 || requiredDocs.every(document => document.fileName);
  const hasAnyBoqFile = draft.documents.some(document => /boq|price schedule|specification/i.test(document.name) && document.fileName);
  const hasPacCertificate = draft.documents.some(document => /pac certificate/i.test(document.name) && document.fileName);
  const hasCustomSpecification = draft.items.some(item => item.specification.trim().length >= 10 || item.technicalSpecification.trim().length >= 10 || item.specificationFileName);
  const bidStart = draft.tender.bidStartDate || draft.schedule.publishDate;
  const bidEnd = draft.tender.bidClosingDate || draft.schedule.submissionDate;
  const technicalDate = draft.tender.technicalEvaluationDate || draft.schedule.openingDate;
  const financialDate = draft.tender.financialEvaluationDate;
  const isAfter = (later?: string, earlier?: string) => {
    if (!later || !earlier) return true;
    return new Date(later).getTime() > new Date(earlier).getTime();
  };
  const hasContact = Boolean(draft.tender.contactName || draft.tender.contactEmail || draft.tender.contactMobile);
  const baseChecks = [
    { label: 'Requirement title', ok: draft.basics.title.trim().length >= 3 },
    { label: 'Budget estimate', ok: value > 0 },
    { label: 'Line item details', ok: hasItems },
    { label: 'Consignee allocation', ok: hasConsigneeDetails && totalItemQuantity > 0 && totalItemQuantity === totalConsigneeQuantity },
    { label: 'Supplier path', ok: Boolean(draft.vendors.selection) },
  ];
  const methodChecks = [
    ...(isDirectMethod(draft.type) ? [{ label: 'Selected vendor', ok: Boolean(draft.vendors.selectedSellerId) }] : []),
    ...(draft.type === 'boq' ? [{ label: 'BOQ file or line schedule', ok: hasAnyBoqFile || hasItems }] : []),
    ...(draft.type === 'pac' ? [
      { label: 'PAC certificate', ok: hasPacCertificate },
      { label: 'PAC justification', ok: draft.basics.justification.trim().length >= 20 },
    ] : []),
    ...(draft.type === 'custom-product' ? [
      { label: 'Catalogue unavailability reason', ok: draft.basics.justification.trim().length >= 20 },
      { label: 'Custom specification', ok: hasCustomSpecification },
    ] : []),
    ...(draft.type === 'custom-service' ? [
      { label: 'Scope of work', ok: (draft.tender.scopeOfWork || draft.basics.justification).trim().length >= 20 },
      { label: 'Service milestone', ok: draft.tender.milestones.some(milestone => milestone.label.trim() && Number(milestone.percentage) > 0) },
    ] : []),
    ...(draft.type === 'emergency' ? [{ label: 'Emergency audit justification', ok: draft.basics.justification.trim().length >= 30 }] : []),
    ...(draft.type === 'repeat-order' ? [{ label: 'Previous order reference', ok: draft.basics.justification.trim().length >= 10 || draft.approval.notes.trim().length >= 10 }] : []),
    ...(isAuctionMethod(draft.type) || draft.rules.reverseAuctionIntent ? [
      { label: 'Auction start price', ok: draft.rules.startPrice > 0 },
      { label: 'Auction decrement', ok: draft.rules.minimumDecrement > 0 },
    ] : []),
    ...(draft.rules.emdRequired ? [{ label: 'EMD amount', ok: draft.rules.emdAmount > 0 }] : []),
    ...(draft.rules.performanceSecurity ? [{ label: 'ePBG / performance security amount', ok: Number(draft.tender.performanceSecurityAmount || 0) > 0 }] : []),
  ];

  if (isTenderMethod(draft.type)) {
    const technicalWeightage = Number(draft.tender.technicalWeightage);
    const priceWeightage = Number(draft.tender.priceWeightage);
    return [
      ...baseChecks,
      { label: 'Tender scope', ok: draft.tender.shortDescription.trim().length >= 10 && draft.tender.scopeOfWork.trim().length >= 10 },
      { label: 'Bid closing', ok: Boolean(draft.tender.bidClosingDate && draft.tender.bidClosingTime) },
      { label: 'Bid end after start', ok: isAfter(bidEnd, bidStart) },
      { label: 'Technical opening after bid end', ok: isAfter(technicalDate, bidEnd) },
      { label: 'Financial opening after technical', ok: isAfter(financialDate, technicalDate) },
      { label: 'Delivery details', ok: Boolean(draft.tender.deliveryLocation || draft.tender.deliveryTimeline || draft.schedule.deliveryDate) },
      { label: 'Commercial basis', ok: Boolean(draft.tender.priceType && draft.tender.taxType) },
      { label: 'Evaluation weights', ok: Number.isFinite(technicalWeightage) && Number.isFinite(priceWeightage) && technicalWeightage + priceWeightage === 100 },
      { label: 'Buyer contact', ok: hasContact },
      { label: 'Approval workflow', ok: !draft.tender.approvalRequired || Boolean(draft.tender.approverName || draft.tender.approvalChain) },
      { label: 'Primary documents', ok: hasAllRequiredDocs },
      ...methodChecks,
    ];
  }

  return [
    ...baseChecks,
    { label: 'Schedule date', ok: Boolean(draft.schedule.submissionDate || draft.schedule.deliveryDate) },
    { label: 'Submission after publish', ok: isAfter(draft.schedule.submissionDate, draft.schedule.publishDate) },
    { label: 'Approval workflow', ok: Boolean(draft.approval.workflow) },
    { label: 'Supporting documents', ok: hasAllRequiredDocs },
    ...methodChecks,
  ];
}

type StepProps = {
  draft: Draft;
  updateDraft: (updater: (current: Draft) => Draft) => void;
  onDocumentUpload?: (documentId: string, file: File) => Promise<void>;
};

type SelectWithOtherOption = string | { value: string; label: string };

const getOptionValue = (option: SelectWithOtherOption) => typeof option === 'string' ? option : option.value;
const getOptionLabel = (option: SelectWithOtherOption) => typeof option === 'string' ? option : option.label;

function SelectWithOther({
  value,
  options,
  onChange,
  placeholder = 'Select option',
  otherPlaceholder = 'Enter other value',
  className = inputClass,
}: {
  value: string;
  options: readonly SelectWithOtherOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  otherPlaceholder?: string;
  className?: string;
}) {
  const optionValues = options.map(getOptionValue);
  const isOtherSelected = Boolean(value) && !optionValues.includes(value);
  const selectValue = isOtherSelected ? OTHER_OPTION : value;

  return (
    <div className="space-y-2">
      <select
        value={selectValue}
        onChange={event => onChange(event.target.value === OTHER_OPTION ? OTHER_OPTION : event.target.value)}
        className={className}
      >
        {placeholder && <option value="">{placeholder}</option>}
        {options.map(option => {
          const optionValue = getOptionValue(option);
          return <option key={optionValue} value={optionValue}>{getOptionLabel(option)}</option>;
        })}
        <option value={OTHER_OPTION}>{OTHER_OPTION}</option>
      </select>
      {selectValue === OTHER_OPTION && (
        <input
          value={value === OTHER_OPTION ? '' : value}
          onChange={event => onChange(event.target.value)}
          className={className}
          placeholder={otherPlaceholder}
        />
      )}
    </div>
  );
}

function Panel({ title, icon, action, children }: { title: string; icon: ReactNode; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden border-t-2 border-t-[#12335f]">
      <div className="flex items-center justify-between gap-3 border-b border-slate-150 bg-slate-50/70 px-4 py-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white border border-slate-200 shadow-sm text-[#12335f]">{icon}</span>
          <h2 className="text-sm font-black text-slate-900 tracking-tight">{title}</h2>
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
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
