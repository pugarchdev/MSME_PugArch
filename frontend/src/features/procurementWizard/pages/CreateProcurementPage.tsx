'use client';

import React, { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  Plus,
  Save,
  History,
  Loader2,
  X,
  ClipboardCheck,
  ShieldCheck,
  Package,
  Users,
  CalendarClock,
  FileText,
  Upload,
  BarChart3,
  BadgeCheck,
  ArrowRight,
  ChevronRight,
  Info,
  Trash2
} from 'lucide-react';

import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi } from '../../marketplace/api';
import { DELIVERY_TYPES, PAYMENT_TERMS, QUANTITY_UNITS } from '../../../constants/dropdowns';
import {
  PROCUREMENT_DRAFTS_ROUTE,
  fetchProcurementDraft,
  saveProcurementDraft,
  submitProcurementDraft
} from '../api';
import { api } from '../../../lib/api';
import { authHeaders, unwrap } from '../../shared/apiClient';
import { fetchDeliveryAddresses, createDeliveryAddress, type DeliveryAddressDto } from '../../directPurchase/api';
import { SearchableSelect } from '../../../components/ui/SearchableSelect';
import { Input } from '../../../components/ui/input';
import { STATE_OPTIONS, getDistrictOptions } from '../../../data/indianLocations';
import {
  suggestProcurementMethod,
  mapToDatabaseMethod,
  METHOD_DEFINITIONS,
  type ProcurementMethodId,
  type BuyerType,
  type RecommendationResult
} from '../procurementMethodsConfig';

// Import Reusable Sourcing components from Loop 3
import {
  ProcurementStepper,
  ProcurementMethodCard,
  ProcurementStatusBadge,
  BuyerTypeBadge,
  MethodBadge,
  SectionCard,
  StickyActionBar,
  EmptyState,
  BOQTable,
  SupplierSelector,
  DocumentRequirementBuilder,
  EvaluationCriteriaBuilder,
  ApprovalTimeline,
  ProcurementSummaryPanel,
  type BOQRow,
  type Supplier,
  type SourcingDoc,
  type EvalCriteria
} from '../components/SourcingWizardComponents';

type StepKind = 'basics' | 'internal' | 'items' | 'vendors' | 'schedule' | 'terms' | 'documents' | 'evaluation' | 'publish';

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
  fileAssetId?: number | null;
  hsn_sac_code?: string;
  brand_preference?: string;
  brand_flexible?: string;
};

type DocumentRow = {
  id: string;
  name: string;
  required: boolean;
  fileType: string;
  maxSize: number;
  instructions: string;
};

type AuctionConfig = {
  auctionNumber: string;
  auctionTitle: string;
  auctionDescription: string;
  procurementMethod: 'REVERSE_AUCTION' | 'BID_WITH_REVERSE_AUCTION';
  auctionCategory: string;
  auctionSubCategory: string;
  currency: string;
  auctionStatus: 'DRAFT';
  buyerOrganization: string;
  department: string;
  purchaseGroup: string;
  purchaseOrganization: string;
  auctionType: 'ENGLISH_REVERSE' | 'RANK_BASED_REVERSE';
  auctionMode: 'ONLINE';
  startDateTime: string;
  endDateTime: string;
  durationMinutes: number;
  startingBidPrice: number;
  reservePrice: number | null;
  minimumBidDecrement: number;
  autoExtensionEnabled: boolean;
  extensionTriggerMinutes: number;
  extensionDurationMinutes: number;
  maximumExtensions: number;
  rankVisibility: 'SHOW_RANK_ONLY' | 'SHOW_LOWEST_PRICE' | 'HIDDEN';
  minimumQualifiedBidders: number;
  termsDocumentFileId: number | null;
  termsDocumentName: string;
  buyerMonitorSettings: {
    showLiveRank: boolean;
    alertOnReserveBreach: boolean;
    allowManualExtension: boolean;
  };
  triggerConfiguration: {
    trigger: 'AFTER_TECHNICAL_QUALIFICATION' | 'TOP_N_BIDDERS' | 'ALL_TECHNICALLY_QUALIFIED';
    topN: number;
    preBidStageRequired: boolean;
  };
};

type RateContractItem = {
  id: string;
  itemName: string;
  specification: string;
  uom: string;
  estimatedAnnualQuantity: number;
  baseRate: number;
  gst: number;
  discount: number;
  slabPricingEnabled: boolean;
  slabPricing: Array<{ id: string; minQuantity: number; maxQuantity: number | null; rate: number }>;
};

type RateContractConfig = {
  rateContractNumber: string;
  contractTitle: string;
  contractDescription: string;
  contractCategory: string;
  contractSubCategory: string;
  periodStartDate: string;
  periodEndDate: string;
  rateValidityPeriod: string;
  supplierSelectionStrategy: 'SINGLE_SUPPLIER' | 'MULTI_SUPPLIER' | 'PANEL_RATE_CONTRACT' | 'ITEM_WISE_L1';
  selectedSuppliers: Array<{ supplierId: number; supplierUserId?: number | null; supplierName?: string | null }>;
  itemRateSchedule: RateContractItem[];
  priceVariationClause: 'FIXED_PRICE' | 'INDEX_BASED_VARIATION' | 'MUTUALLY_AGREED_REVISION';
  callOffOrderAllowed: boolean;
  maximumOrderQuantityPerCallOff: number;
  minimumOrderQuantity: number;
  deliverySla: string;
  penaltyClause: string;
  securityDepositRequired: boolean;
  securityDepositAmount: number;
  pbgRequired: boolean;
  pbgAmount: number;
  approvalWorkflow: string;
  contractDocument: {
    fileAssetId: number | null;
    fileName: string;
  };
};

type Draft = {
  id?: number;
  type: ProcurementMethodId;
  basics: {
    buyerType: BuyerType;
    title: string;
    whatAreYouBuying: string;
    category: string;
    subCategory: string;
    department: string;
    priority: 'Normal' | 'Urgent' | 'Emergency';
    estimatedValue: number;
    requiredByDate: string;
    deliveryLocation: string;
    isCatalogueAvailable: boolean;
    isOnlyOneVendor: boolean;
    isReverseAuctionNeeded: boolean;
    isTechnicalEvaluationNeeded: boolean;
    justification: string;
    isSpecClear: boolean;
    isRepeatedSupply: boolean;
    marketResearchOnly: boolean;
  };
  internal: {
    orgName: string;
    department: string;
    costCenter: string;
    budgetHead: string;
    projectCode: string;
    contactPerson: string;
    email: string;
    mobile: string;
    competentAuthority: string;
    approvalAuthority: string;
    internalFileNumber: string;
    justification: string;
    budgetConfirmed: boolean;
  };
  items: ItemRow[];
  serviceDetails: {
    serviceTitle: string;
    scopeOfWork: string;
    deliverables: string;
    inclusions: string;
    exclusions: string;
    slaResponseTime: string;
    duration: string;
    manpowerRequired: string;
    experienceRequired: string;
    milestones: Array<{ id: string; label: string; percentage: string; trigger: string }>;
    penaltyClause: string;
    location: string;
  };
  boqTable: BOQRow[];
  boqFileAssetId: number | null;
  boqFileName: string;
  vendors: {
    selection: 'Open' | 'Selected' | 'Category' | 'Past';
    inviteCount: number;
    msmePreference: boolean;
    localVendorPreference: boolean;
    excludeBlacklisted: boolean;
    selectedSellerId: number | null;
    selectedSellerName: string;
    selectedSellerCode: string;
    invitedSellers: number[];
  };
  schedule: {
    packetType: 'Single' | 'Two';
    publishDate: string;
    submissionDate: string;
    validityDays: number;
    submissionStartDate: string;
    clarificationAllowed: boolean;
    clarificationDeadline: string;
    preBidMeeting: boolean;
    preBidDate: string;
    technicalOpeningDate: string;
    financialOpeningDate: string;
    bidValidityDate: string;
    allowWithdrawal: boolean;
    allowRevision: boolean;
    showSellerRank: boolean;
    showLowestPrice: boolean;
    autoClose: boolean;
    minimumBidders: number;
    rebidsAllowed: boolean;
  };
  terms: {
    paymentTerms: string;
    deliveryTerms: string;
    freightIncluded: boolean;
    gstIncluded: boolean;
    warrantyTerms: string;
    penaltyClause: string;
    advanceAllowed: boolean;
    retentionAmount: number;
    securityDeposit: number;
    emdRequired: boolean;
    emdAmount: number;
    documentFee: number;
    pbgRequired: boolean;
  };
  requiredDocs: DocumentRow[];
  evaluation: {
    method: string;
    techWeight: number;
    commWeight: number;
    minQualifyingMarks: number;
    technicalCriteria: EvalCriteria[];
  };
  approval: {
    workflow: string;
    approver: string;
    notes: string;
  };
  auctionConfig: AuctionConfig;
  rateContractConfig: RateContractConfig;
  rfqType?: 'OPEN' | 'LIMITED' | '';
  questionnaire?: Array<{ id: string; type: 'TEXT' | 'YES_NO' | 'ATTACHMENT'; text: string }>;
  requireDemo?: boolean;
  tenderType?: 'OPEN' | 'LIMITED' | 'SEALED' | '';
  limitedTenderJustification?: string;
  sealedSubmissionFlag?: boolean;
};

const DRAFT_KEY = 'msme:guided-procurement-create:v2';

const today = new Date().toISOString().split('T')[0];
const nextWeek = new Date(Date.now() + 7 * 86400000).toISOString().split('T')[0];
const nextFortnight = new Date(Date.now() + 14 * 86400000).toISOString().split('T')[0];
const toDateTimeLocal = (date: Date) => date.toISOString().slice(0, 16);
const nextWeekDateTime = toDateTimeLocal(new Date(Date.now() + 7 * 86400000));
const nextWeekPlusOneHourDateTime = toDateTimeLocal(new Date(Date.now() + 7 * 86400000 + 60 * 60000));

const makeId = () => Math.random().toString(36).substring(2, 9);
const isReverseAuctionMethod = (method: ProcurementMethodId) => method === 'REVERSE_AUCTION' || method === 'BID_WITH_REVERSE_AUCTION';
const isRateContractMethod = (method: ProcurementMethodId) => method === 'RATE_CONTRACT';

const defaultAuctionConfig = (method: ProcurementMethodId): AuctionConfig => ({
  auctionNumber: `RA-${Date.now()}`,
  auctionTitle: '',
  auctionDescription: '',
  procurementMethod: method === 'BID_WITH_REVERSE_AUCTION' ? 'BID_WITH_REVERSE_AUCTION' : 'REVERSE_AUCTION',
  auctionCategory: '',
  auctionSubCategory: '',
  currency: 'INR',
  auctionStatus: 'DRAFT',
  buyerOrganization: '',
  department: '',
  purchaseGroup: '',
  purchaseOrganization: '',
  auctionType: 'ENGLISH_REVERSE',
  auctionMode: 'ONLINE',
  startDateTime: nextWeekDateTime,
  endDateTime: nextWeekPlusOneHourDateTime,
  durationMinutes: 60,
  startingBidPrice: 0,
  reservePrice: null,
  minimumBidDecrement: 0,
  autoExtensionEnabled: false,
  extensionTriggerMinutes: 5,
  extensionDurationMinutes: 5,
  maximumExtensions: 3,
  rankVisibility: 'SHOW_RANK_ONLY',
  minimumQualifiedBidders: 2,
  termsDocumentFileId: null,
  termsDocumentName: '',
  buyerMonitorSettings: {
    showLiveRank: true,
    alertOnReserveBreach: true,
    allowManualExtension: true,
  },
  triggerConfiguration: {
    trigger: 'AFTER_TECHNICAL_QUALIFICATION',
    topN: 3,
    preBidStageRequired: method === 'BID_WITH_REVERSE_AUCTION',
  },
});

const syncAuctionDefaults = (draft: Draft, method: ProcurementMethodId): Draft => {
  if (!isReverseAuctionMethod(method)) {
    return { ...draft, type: method };
  }

  const base = draft.auctionConfig || defaultAuctionConfig(method);
  return {
    ...draft,
    type: method,
    basics: {
      ...draft.basics,
      isReverseAuctionNeeded: true,
      isTechnicalEvaluationNeeded: method === 'BID_WITH_REVERSE_AUCTION' ? true : draft.basics.isTechnicalEvaluationNeeded,
    },
    schedule: {
      ...draft.schedule,
      packetType: method === 'BID_WITH_REVERSE_AUCTION' ? 'Two' : draft.schedule.packetType,
      minimumBidders: Math.max(draft.schedule.minimumBidders || 0, base.minimumQualifiedBidders || 2),
    },
    auctionConfig: {
      ...base,
      procurementMethod: method === 'BID_WITH_REVERSE_AUCTION' ? 'BID_WITH_REVERSE_AUCTION' : 'REVERSE_AUCTION',
      auctionTitle: base.auctionTitle || draft.basics.title,
      auctionDescription: base.auctionDescription || draft.basics.justification,
      auctionCategory: base.auctionCategory || draft.basics.category,
      auctionSubCategory: base.auctionSubCategory || draft.basics.subCategory,
      buyerOrganization: base.buyerOrganization || draft.internal.orgName,
      department: base.department || draft.internal.department || draft.basics.department,
      startingBidPrice: base.startingBidPrice || draft.basics.estimatedValue || 0,
      triggerConfiguration: {
        ...base.triggerConfiguration,
        preBidStageRequired: method === 'BID_WITH_REVERSE_AUCTION',
      },
    },
  };
};

const defaultRateContractConfig = (): RateContractConfig => ({
  rateContractNumber: `RC-${Date.now()}`,
  contractTitle: '',
  contractDescription: '',
  contractCategory: '',
  contractSubCategory: '',
  periodStartDate: today,
  periodEndDate: nextFortnight,
  rateValidityPeriod: 'Contract period',
  supplierSelectionStrategy: 'SINGLE_SUPPLIER',
  selectedSuppliers: [],
  itemRateSchedule: [],
  priceVariationClause: 'FIXED_PRICE',
  callOffOrderAllowed: true,
  maximumOrderQuantityPerCallOff: 0,
  minimumOrderQuantity: 0,
  deliverySla: 'Delivery within agreed SLA from call-off order date',
  penaltyClause: 'As per agreed contract terms',
  securityDepositRequired: false,
  securityDepositAmount: 0,
  pbgRequired: false,
  pbgAmount: 0,
  approvalWorkflow: 'Finance + Procurement',
  contractDocument: {
    fileAssetId: null,
    fileName: '',
  },
});

const rateScheduleFromDraftItems = (draft: Draft): RateContractItem[] => {
  const source = draft.basics.whatAreYouBuying === 'BOQ'
    ? draft.boqTable.map(row => ({
      name: row.description,
      specification: row.remarks || row.category || '',
      unit: row.uom,
      quantity: row.quantity,
      rate: row.estimatedRate,
      gst: row.taxPercent || 0,
    }))
    : draft.items.map(item => ({
      name: item.name,
      specification: item.specification || item.technicalSpecification || '',
      unit: item.unit,
      quantity: item.quantity,
      rate: item.unitPrice,
      gst: item.gst || 0,
    }));

  return source
    .filter(item => String(item.name || '').trim())
    .map(item => ({
      id: makeId(),
      itemName: String(item.name || ''),
      specification: String(item.specification || ''),
      uom: String(item.unit || 'Nos'),
      estimatedAnnualQuantity: Number(item.quantity || 1),
      baseRate: Number(item.rate || 0),
      gst: Number(item.gst || 0),
      discount: 0,
      slabPricingEnabled: false,
      slabPricing: [],
    }));
};

const syncRateContractDefaults = (draft: Draft): Draft => {
  const base = draft.rateContractConfig || defaultRateContractConfig();
  const itemRateSchedule = base.itemRateSchedule.length ? base.itemRateSchedule : rateScheduleFromDraftItems(draft);
  const selectedSuppliers = base.selectedSuppliers.length
    ? base.selectedSuppliers
    : draft.vendors.invitedSellers.map(supplierId => ({ supplierId }));

  return {
    ...draft,
    type: 'RATE_CONTRACT',
    basics: {
      ...draft.basics,
      isRepeatedSupply: true,
    },
    rateContractConfig: {
      ...base,
      contractTitle: base.contractTitle || draft.basics.title,
      contractDescription: base.contractDescription || draft.basics.justification,
      contractCategory: base.contractCategory || draft.basics.category,
      contractSubCategory: base.contractSubCategory || draft.basics.subCategory,
      selectedSuppliers,
      itemRateSchedule,
      deliverySla: base.deliverySla || draft.terms.deliveryTerms,
      penaltyClause: base.penaltyClause || draft.terms.penaltyClause,
      securityDepositRequired: base.securityDepositRequired || draft.terms.emdRequired,
      securityDepositAmount: base.securityDepositAmount || draft.terms.securityDeposit || draft.terms.emdAmount || 0,
      pbgRequired: base.pbgRequired || draft.terms.pbgRequired,
      pbgAmount: base.pbgAmount || draft.terms.securityDeposit || 0,
      approvalWorkflow: base.approvalWorkflow || draft.approval.workflow,
    },
  };
};

const applyMethodDefaults = (draft: Draft, method: ProcurementMethodId): Draft => {
  if (isReverseAuctionMethod(method)) return syncAuctionDefaults(draft, method);
  if (isRateContractMethod(method)) return syncRateContractDefaults(draft);
  return { ...draft, type: method };
};

const CATEGORY_OPTIONS = [
  'Raw Materials',
  'Steel, Plates & Structural Materials',
  'Cement, Sand & Civil Materials',
  'Pipes, Hume Pipes & Fittings',
  'Mechanical Spares',
  'Bearings & Industrial Components',
  'Electrical Equipment',
  'Automobile & HEMM Spares',
  'Lubricants, Oils & Filters',
  'Refractory & Furnace Materials',
  'Hardware, Fasteners & Consumables',
  'Lab Chemicals & Reagents',
  'IT Hardware, Printers & Toners',
  'Office Supplies & Stationery',
  'Safety, Medical & Ambulance Supplies',
  'Transport, Cab & Vehicle Hiring',
  'Facility Management & Canteen Services',
  'Repair, AMC & Overhauling Services',
  'Mining, Material Handling & Crane Services',
  'Construction & Works Contract',
  'Other',
];

const stepLibrary = {
  basics: { id: 'basics', label: 'Procurement Intent', description: 'Buyer type, title, value & method', icon: ClipboardCheck },
  internal: { id: 'internal', label: 'Internal Details', description: 'Cost center, CFA & justifications', icon: ShieldCheck },
  items: { id: 'items', label: 'Item / Service / BOQ', description: 'Quantities, specs and BOQ items', icon: Package },
  vendors: { id: 'vendors', label: 'Suppliers', description: 'MSME reach, invite selection pool', icon: Users },
  schedule: { id: 'schedule', label: 'Timeline & Rules', description: 'Envelope bids & deadline schedules', icon: CalendarClock },
  terms: { id: 'terms', label: 'Commercial Terms', description: 'Payment, delivery and EM/PBG fees', icon: FileText },
  documents: { id: 'documents', label: 'Required Documents', description: 'Checklists and validation requests', icon: Upload },
  evaluation: { id: 'evaluation', label: 'Evaluation Basis', description: 'QCBS weights and technical scores', icon: BarChart3 },
  publish: { id: 'publish', label: 'Approval & Publish', description: 'Summary review & workflow release', icon: BadgeCheck },
} as const;

const ALL_STEPS: StepKind[] = ['basics', 'internal', 'items', 'vendors', 'schedule', 'terms', 'documents', 'evaluation', 'publish'];

const defaultRequiredDocs = (buyerType: BuyerType, method: ProcurementMethodId): DocumentRow[] => {
  const isGov = buyerType === 'GOVERNMENT_BUYER';
  const docs: DocumentRow[] = [
    { id: 'gst', name: 'GST Certificate', required: true, fileType: 'pdf', maxSize: 5, instructions: 'Upload verified GST registration document.' },
    { id: 'pan', name: 'PAN Card', required: true, fileType: 'pdf', maxSize: 2, instructions: 'Upload official PAN card.' },
    { id: 'bank', name: 'Bank Details', required: true, fileType: 'pdf', maxSize: 2, instructions: 'Cancelled cheque or passbook.' },
    { id: 'tech_compliance', name: 'Technical Compliance Sheet', required: method !== 'DIRECT_PURCHASE' && method !== 'CATALOG_PURCHASE', fileType: 'pdf,docx', maxSize: 10, instructions: 'Compliance report against specified standards.' },
    { id: 'financial_quote', name: 'Detailed Price Breakup', required: true, fileType: 'pdf,xlsx', maxSize: 5, instructions: 'Itemized cost schedule.' },
  ];

  if (isGov) {
    docs.push(
      { id: 'experience', name: 'Experience Certificate', required: true, fileType: 'pdf', maxSize: 10, instructions: 'Proof of similar supply in past 3 years.' },
      { id: 'turnover', name: 'Turnover Certificate', required: true, fileType: 'pdf', maxSize: 5, instructions: 'Chartered Accountant certified turnover.' },
      { id: 'no_deviation', name: 'No-Deviation Certificate', required: true, fileType: 'pdf', maxSize: 2, instructions: 'Declaration confirming no specs deviation.' }
    );
  }

  if (method === 'PAC') {
    docs.push({ id: 'pac_cert', name: 'Proprietary Article Certificate (PAC)', required: true, fileType: 'pdf', maxSize: 5, instructions: 'OEM signed proprietary certificate.' });
  }

  return docs;
};

const defaultDraft = (type: ProcurementMethodId = 'RFQ', buyerType: BuyerType = 'PRIVATE_BUYER'): Draft => ({
  type,
  basics: {
    buyerType,
    title: '',
    whatAreYouBuying: 'Product',
    category: 'Office Supplies & Stationery',
    subCategory: '',
    department: '',
    priority: 'Normal',
    estimatedValue: 0,
    requiredByDate: nextFortnight,
    deliveryLocation: '',
    isCatalogueAvailable: false,
    isOnlyOneVendor: false,
    isReverseAuctionNeeded: false,
    isTechnicalEvaluationNeeded: false,
    justification: '',
    isSpecClear: true,
    isRepeatedSupply: false,
    marketResearchOnly: false,
  },
  internal: {
    orgName: '',
    department: '',
    costCenter: '',
    budgetHead: '',
    projectCode: '',
    contactPerson: '',
    email: '',
    mobile: '',
    competentAuthority: '',
    approvalAuthority: '',
    internalFileNumber: '',
    justification: '',
    budgetConfirmed: false,
  },
  items: [],
  serviceDetails: {
    serviceTitle: '',
    scopeOfWork: '',
    deliverables: '',
    inclusions: '',
    exclusions: '',
    slaResponseTime: '4 hours',
    duration: '1 Year',
    manpowerRequired: '0',
    experienceRequired: '0',
    milestones: [
      { id: makeId(), label: 'Mobilization advance', percentage: '10', trigger: 'Signing of contract' },
      { id: makeId(), label: 'Monthly running bill', percentage: '90', trigger: 'Completion of monthly service' },
    ],
    penaltyClause: '0.5% per week delay up to max 10%',
    location: '',
  },
  boqTable: [
    { srNo: 1, description: '', category: 'General', quantity: 1, uom: 'Nos', estimatedRate: 0, taxPercent: 18, total: 0, remarks: '' }
  ],
  boqFileAssetId: null,
  boqFileName: '',
  vendors: {
    selection: 'Open',
    inviteCount: 0,
    msmePreference: true,
    localVendorPreference: false,
    excludeBlacklisted: true,
    selectedSellerId: null,
    selectedSellerName: '',
    selectedSellerCode: '',
    invitedSellers: [],
  },
  schedule: {
    packetType: 'Single',
    publishDate: today,
    submissionDate: nextWeek,
    validityDays: 90,
    submissionStartDate: today,
    clarificationAllowed: true,
    clarificationDeadline: nextWeek,
    preBidMeeting: false,
    preBidDate: '',
    technicalOpeningDate: nextWeek,
    financialOpeningDate: nextWeek,
    bidValidityDate: nextFortnight,
    allowWithdrawal: true,
    allowRevision: true,
    showSellerRank: true,
    showLowestPrice: true,
    autoClose: true,
    minimumBidders: 3,
    rebidsAllowed: true,
  },
  terms: {
    paymentTerms: '100% after delivery and acceptance',
    deliveryTerms: 'Door delivery to site',
    freightIncluded: true,
    gstIncluded: false,
    warrantyTerms: '12 Months standard warranty',
    penaltyClause: '0.5% per week delay up to max 10%',
    advanceAllowed: false,
    retentionAmount: 0,
    securityDeposit: 0,
    emdRequired: false,
    emdAmount: 0,
    documentFee: 0,
    pbgRequired: false,
  },
  requiredDocs: defaultRequiredDocs(buyerType, type),
  evaluation: {
    method: 'L1 total value',
    techWeight: 70,
    commWeight: 30,
    minQualifyingMarks: 60,
    technicalCriteria: [
      { id: makeId(), name: 'Company credentials', description: 'Years of operation, certifications, experience.', maxScore: 30, weightage: 30, mandatory: true, minMarks: 15 },
      { id: makeId(), name: 'Technical compliance', description: 'Compliance score based on technical specification sheet.', maxScore: 50, weightage: 50, mandatory: true, minMarks: 35 },
      { id: makeId(), name: 'Past performance rating', description: 'Seller platform rating and past order delivery.', maxScore: 20, weightage: 20, mandatory: false, minMarks: 0 }
    ],
  },
  approval: {
    workflow: 'Finance + Procurement',
    approver: '',
    notes: '',
  },
  auctionConfig: defaultAuctionConfig(type),
  rateContractConfig: defaultRateContractConfig(),
  rfqType: '',
  questionnaire: [],
  requireDemo: false,
  tenderType: '',
  limitedTenderJustification: '',
  sealedSubmissionFlag: false,
});

export default function CreateProcurementPage() {
  const router = useRouter();
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const draftIdParam = searchParams?.get('id') || searchParams?.get('draftId');

  // Determine initial buyer type from profile
  const initialBuyerType = useMemo<BuyerType>(() => {
    const u = user as any;
    const orgType = u?.buyerProfile?.organizationType || u?.organization?.organizationType || u?.organizationType || '';
    const isGov = String(orgType).toUpperCase().includes('GOVT') ||
      String(orgType).toUpperCase().includes('GOVERNMENT') ||
      String(orgType).toUpperCase().includes('MINISTRY') ||
      String(orgType).toUpperCase().includes('DEPT') ||
      String(orgType).toUpperCase().includes('PSU');
    return isGov ? 'GOVERNMENT_BUYER' : 'PRIVATE_BUYER';
  }, [user]);

  const [draft, setDraft] = useState<Draft>(() => defaultDraft('RFQ', initialBuyerType));
  const [activeStep, setActiveStep] = useState(0);
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingDraft, setSubmittingDraft] = useState(false);
  const [showItemDrawer, setShowItemDrawer] = useState(false);
  const [selectedItemForEdit, setSelectedItemForEdit] = useState<ItemRow | null>(null);
  const [hasAutofilled, setHasAutofilled] = useState(false);

  // Auto-fill buyer details and organization on load for new drafts
  useEffect(() => {
    if (user && !draftIdParam && !hasAutofilled) {
      const u = user as any;
      const orgName = u.organization?.organizationName || u.buyerProfile?.organizationName || '';
      const department = u.buyerProfile?.department || '';
      const contactPerson = u.buyerProfile?.representativeName || u.name || '';
      const email = u.buyerProfile?.email || u.email || '';
      const mobile = u.buyerProfile?.mobile || u.mobile || '';

      setDraft(current => ({
        ...current,
        internal: {
          ...current.internal,
          orgName: current.internal.orgName || orgName,
          department: current.internal.department || department,
          contactPerson: current.internal.contactPerson || contactPerson,
          email: current.internal.email || email,
          mobile: current.internal.mobile || mobile,
        }
      }));
      setHasAutofilled(true);
    }
  }, [user, draftIdParam, hasAutofilled]);

  // Auto-fill buyer type on load
  useEffect(() => {
    if (initialBuyerType && !draft.basics.title) {
      setDraft(current => ({
        ...current,
        basics: { ...current.basics, buyerType: initialBuyerType },
        requiredDocs: defaultRequiredDocs(initialBuyerType, current.type)
      }));
    }
  }, [initialBuyerType]);

  // Load draft
  useEffect(() => {
    if (!draftIdParam) return;
    const id = parseInt(draftIdParam, 10);
    if (isNaN(id)) return;

    fetchProcurementDraft(id)
      .then((res) => {
        const payload = res?.payload;
        if (!payload) return;

        const base = defaultDraft(payload.type || 'RFQ', payload.basics?.buyerType || initialBuyerType);

        setDraft({
          ...base,
          ...payload,
          id: res.id,
          basics: { ...base.basics, ...(payload.basics || {}) },
          internal: { ...base.internal, ...(payload.internal || {}) },
          serviceDetails: { ...base.serviceDetails, ...(payload.serviceDetails || {}) },
          vendors: { ...base.vendors, ...(payload.vendors || {}) },
          schedule: { ...base.schedule, ...(payload.schedule || {}) },
          terms: { ...base.terms, ...(payload.terms || {}) },
          evaluation: { ...base.evaluation, ...(payload.evaluation || {}) },
          approval: { ...base.approval, ...(payload.approval || {}) },
          auctionConfig: {
            ...base.auctionConfig,
            ...(payload.auctionConfig || payload.rules?.auctionConfig || {}),
          },
          rateContractConfig: {
            ...base.rateContractConfig,
            ...(payload.rateContractConfig || payload.rateContract || {}),
          },
          items: Array.isArray(payload.items) ? payload.items : base.items,
          boqTable: Array.isArray(payload.boqTable) ? payload.boqTable : base.boqTable,
          requiredDocs: Array.isArray(payload.requiredDocs) ? payload.requiredDocs : base.requiredDocs,
        });
        setActiveStep(res.draftStep || 0);
      })
      .catch((err) => {
        toast.error('Failed to load draft: ' + err.message);
      });
  }, [draftIdParam, initialBuyerType]);

  const updateDraft = (updater: (current: Draft) => Draft) => {
    setDraft(current => {
      const next = updater(current);
      localStorage.setItem(DRAFT_KEY, JSON.stringify(next));
      return next;
    });
  };

  // Sourcing Validation Checklist
  const getReadiness = (d: Draft) => {
    const list: Array<{ label: string; ok: boolean; severity: 'error' | 'warning' | 'info' }> = [];
    
    // Step 1 Basics - Errors
    list.push({ label: 'Title is required (min 3 chars)', ok: d.basics.title.trim().length >= 3, severity: 'error' });
    list.push({ label: 'Estimated budget must be set (> 0)', ok: d.basics.estimatedValue > 0, severity: 'error' });
    list.push({ label: 'Required by date is required', ok: Boolean(d.basics.requiredByDate), severity: 'error' });
    list.push({ label: 'Delivery location is required', ok: d.basics.deliveryLocation.trim().length > 0, severity: 'error' });

    // Step 2 Internal Details - Errors
    list.push({ label: 'Internal Org Name is required', ok: d.internal.orgName.trim().length > 0, severity: 'error' });
    if (d.basics.buyerType === 'GOVERNMENT_BUYER') {
      list.push({ label: 'Competent Authority (CFA) is required', ok: d.internal.competentAuthority.trim().length > 0, severity: 'error' });
      list.push({ label: 'Department File / Case Number is required', ok: d.internal.internalFileNumber.trim().length > 0, severity: 'error' });
      list.push({ label: 'Sanction Approval Authority is required', ok: d.internal.approvalAuthority.trim().length > 0, severity: 'error' });
    } else {
      list.push({ label: 'Cost Center code is required', ok: d.internal.costCenter.trim().length > 0, severity: 'error' });
      list.push({ label: 'Buying Department name is required', ok: d.internal.department.trim().length > 0, severity: 'error' });
      if (d.basics.estimatedValue >= 1000000) {
        list.push({ label: 'Budget Head / Code is required for corporate spends >= 10L', ok: d.internal.budgetHead.trim().length > 0, severity: 'error' });
      }
    }

    // Step 3 Sourcing specification items - Errors
    if (d.basics.whatAreYouBuying === 'BOQ') {
      list.push({ label: 'At least one BOQ item is required', ok: d.boqTable.length > 0 && d.boqTable.some(r => r.description.trim()), severity: 'error' });
      if (d.boqTable.length > 0) {
        list.push({ label: 'All BOQ rows must have positive quantities & rates', ok: d.boqTable.every(r => r.quantity > 0 && r.estimatedRate >= 0), severity: 'error' });
      }
    } else if (d.basics.whatAreYouBuying === 'Service') {
      list.push({ label: 'Service Contract SOW is required (min 10 chars)', ok: d.serviceDetails.scopeOfWork.trim().length >= 10, severity: 'error' });
      list.push({ label: 'Service Deliverables list is required (min 5 chars)', ok: d.serviceDetails.deliverables.trim().length >= 5, severity: 'error' });
      list.push({ label: 'Service Duration is required', ok: d.serviceDetails.duration.trim().length > 0, severity: 'error' });
    } else {
      list.push({ label: 'At least one product item is required', ok: d.items.length > 0, severity: 'error' });
      if (d.items.length > 0) {
        list.push({ label: 'All product items must have valid name & quantity > 0', ok: d.items.every(i => i.name.trim().length > 0 && i.quantity > 0), severity: 'error' });
      }
    }

    // Step 4 Sourcing reach - Errors
    if (d.vendors.selection !== 'Open') {
      list.push({ label: 'At least one invited supplier is required for non-open strategy', ok: (d.vendors.invitedSellers || []).length > 0, severity: 'error' });
    }

    // Step 5 Event timeline - Errors
    list.push({ label: 'Submission deadline date is required', ok: Boolean(d.schedule.submissionDate), severity: 'error' });
    if (d.schedule.submissionDate && d.schedule.submissionStartDate) {
      list.push({ label: 'Submission deadline must be after submission start date', ok: new Date(d.schedule.submissionDate) > new Date(d.schedule.submissionStartDate), severity: 'error' });
    }
    if (d.basics.isTechnicalEvaluationNeeded) {
      list.push({ label: 'Technical opening date is required', ok: Boolean(d.schedule.technicalOpeningDate), severity: 'error' });
      if (d.schedule.technicalOpeningDate && d.schedule.submissionDate) {
        list.push({ label: 'Technical opening date must be after submission deadline', ok: new Date(d.schedule.technicalOpeningDate) >= new Date(d.schedule.submissionDate), severity: 'error' });
      }
    }
    if (d.schedule.packetType === 'Two') {
      list.push({ label: 'Financial opening date is required for two packet flows', ok: Boolean(d.schedule.financialOpeningDate), severity: 'error' });
      if (d.schedule.financialOpeningDate && d.schedule.technicalOpeningDate) {
        list.push({ label: 'Financial opening date must be on or after technical envelope opening', ok: new Date(d.schedule.financialOpeningDate) >= new Date(d.schedule.technicalOpeningDate), severity: 'error' });
      }
    }

    // Step 6 Commercial Terms - Errors
    list.push({ label: 'Payment terms are required', ok: Boolean(d.terms.paymentTerms), severity: 'error' });
    list.push({ label: 'Delivery terms location is required', ok: Boolean(d.terms.deliveryTerms), severity: 'error' });
    if (d.terms.emdRequired) {
      list.push({ label: 'EMD amount must be greater than 0 if EMD is required', ok: d.terms.emdAmount > 0, severity: 'error' });
    }

    // Step 7 Documents - Errors
    list.push({ label: 'At least one required document must be checklist', ok: d.requiredDocs.length > 0, severity: 'error' });
    
    // Step 8 Evaluation criteria - Errors
    list.push({ label: 'Evaluation method is required', ok: Boolean(d.evaluation.method), severity: 'error' });
    if (d.evaluation.method === 'QCBS / weighted technical-commercial score') {
      const qcbsTotal = d.evaluation.technicalCriteria.reduce((sum, c) => sum + Number(c.weightage || 0), 0);
      list.push({ label: 'QCBS evaluation weightage sum must be exactly 100%', ok: qcbsTotal === 100, severity: 'error' });
    }

    // Warnings / Advisories
    if (d.basics.buyerType === 'GOVERNMENT_BUYER' && d.basics.estimatedValue > 250000 && d.vendors.selection !== 'Open') {
      const isExempt = d.basics.isOnlyOneVendor || d.basics.priority === 'Emergency' || d.type === 'PAC' || d.type === 'SINGLE_SOURCE';
      list.push({
        label: 'Est. value > 2.5 Lakhs. GFR rules require open advertised tender unless PAC/Single/Emergency is justified.',
        ok: isExempt,
        severity: 'warning'
      });
    }
    if (d.basics.isOnlyOneVendor || d.type === 'PAC' || d.type === 'SINGLE_SOURCE') {
      list.push({
        label: 'PAC / Single Source justification note is short (recommend min 15 chars)',
        ok: d.internal.justification.trim().length >= 15,
        severity: 'warning'
      });
    }
    if (!d.terms.penaltyClause || d.terms.penaltyClause.trim().length < 5) {
      list.push({
        label: 'Late Delivery Penalty Clause is recommended for contract compliance',
        ok: false,
        severity: 'warning'
      });
    }
    if (d.basics.priority === 'Emergency') {
      const hasEmergencyDoc = d.requiredDocs.some(doc => doc.name.toLowerCase().includes('emergency') || doc.name.toLowerCase().includes('justification'));
      list.push({
        label: 'Emergency procurement priority selected: emergency approval file is recommended in checklist.',
        ok: hasEmergencyDoc,
        severity: 'warning'
      });
    }

    // Info (Sourcing Overrides)
    const customDocs = d.requiredDocs.filter(doc => !['PAN Card', 'GST Certificate', 'MSME Certificate', 'Bid Security / EMD exemption', 'Technical Proposal', 'Proprietary Article Certificate', 'Sanction Letter'].includes(doc.name));
    customDocs.forEach(c => {
      list.push({ label: `Custom document checklist added: "${c.name}"`, ok: true, severity: 'info' });
    });
    
    return list;
  };

  const readiness = useMemo(() => getReadiness(draft), [draft]);
  
  const completionPercentage = useMemo(() => {
    const valid = readiness.filter(r => r.ok).length;
    return Math.round((valid / readiness.length) * 100);
  }, [readiness]);

  // Suggested Sourcing Method Engine
  const recommendedMethod = useMemo(() => {
    return suggestProcurementMethod({
      buyerType: draft.basics.buyerType,
      estimatedValue: draft.basics.estimatedValue,
      whatAreYouBuying: draft.basics.whatAreYouBuying,
      isCatalogueAvailable: draft.basics.isCatalogueAvailable,
      isOnlyOneVendor: draft.basics.isOnlyOneVendor,
      isReverseAuctionNeeded: draft.basics.isReverseAuctionNeeded,
      isTechnicalEvaluationNeeded: draft.basics.isTechnicalEvaluationNeeded,
      urgency: draft.basics.priority,
      lineItemsCount: draft.basics.whatAreYouBuying === 'BOQ' ? draft.boqTable.length : draft.items.length,
      isSpecClear: draft.basics.isSpecClear,
      isRepeatedSupply: draft.basics.isRepeatedSupply,
      marketResearchOnly: draft.basics.marketResearchOnly,
    });
  }, [draft]);

  // Save Draft to Backend
  const saveDraftLocally = async (silent = false) => {
    setSavingDraft(true);
    try {
      const payload = buildProcurementApiPayload(draft, activeStep);
      const res = await saveProcurementDraft(payload);
      const serverId = Number(res?.id || res?.data?.id || draft.id || 0);
      if (serverId) {
        updateDraft(current => ({ ...current, id: serverId }));
      }
      if (!silent) toast.success('Draft saved successfully');
    } catch (err) {
      if (!silent) toast.error('Failed to save draft on server');
    } finally {
      setSavingDraft(false);
    }
  };

  // Validations per Step
  const validateStep = (stepIdx: number): boolean => {
    const d = draft;
    if (stepIdx === 0) {
      // Step 1 Basics
      if (d.basics.title.trim().length < 3) {
        toast.error('Procurement title is required (min 3 chars).');
        return false;
      }
      if (d.basics.estimatedValue <= 0) {
        toast.error('Estimated value must be greater than 0.');
        return false;
      }
      if (!d.basics.requiredByDate) {
        toast.error('Required by date is required.');
        return false;
      }
      if (!d.basics.deliveryLocation.trim()) {
        toast.error('Delivery location is required.');
        return false;
      }
    } else if (stepIdx === 1) {
      // Step 2 Internal details
      if (!d.internal.orgName.trim()) {
        toast.error('Organization name is required.');
        return false;
      }
      if (d.basics.buyerType === 'GOVERNMENT_BUYER') {
        if (!d.internal.internalFileNumber.trim()) {
          toast.error('Department File/Case Number is required for government buyers.');
          return false;
        }
        if (!d.internal.competentAuthority.trim()) {
          toast.error('Competent Financial Authority is required.');
          return false;
        }
        if (!d.internal.approvalAuthority.trim()) {
          toast.error('Sanction Approval Authority is required.');
          return false;
        }
      } else {
        if (!d.internal.department.trim()) {
          toast.error('Buying Department name is required.');
          return false;
        }
        if (!d.internal.costCenter.trim()) {
          toast.error('Cost Center code is required for private buyers.');
          return false;
        }
        if (d.basics.estimatedValue >= 1000000 && !d.internal.budgetHead.trim()) {
          toast.error('Budget Head/Code is required for corporate spends >= 10 Lakhs.');
          return false;
        }
      }
    } else if (stepIdx === 2) {
      // Step 3 Items details
      if (d.basics.whatAreYouBuying === 'BOQ') {
        if (d.boqTable.length === 0 || !d.boqTable.some(r => r.description.trim())) {
          toast.error('At least one Bill of Quantities (BOQ) row must be filled.');
          return false;
        }
        if (d.boqTable.some(r => r.quantity <= 0 || r.estimatedRate < 0)) {
          toast.error('All BOQ rows must have positive quantities & rates.');
          return false;
        }
      } else if (d.basics.whatAreYouBuying === 'Service') {
        if (!d.serviceDetails.serviceTitle.trim()) {
          toast.error('Service Contract Title is required.');
          return false;
        }
        if (d.serviceDetails.scopeOfWork.trim().length < 10) {
          toast.error('Scope of Work is required (min 10 chars).');
          return false;
        }
        if (d.serviceDetails.deliverables.trim().length < 5) {
          toast.error('Service deliverables list is required.');
          return false;
        }
        if (!d.serviceDetails.duration.trim()) {
          toast.error('Service duration is required.');
          return false;
        }
      } else {
        if (d.items.length === 0 || d.items.some(i => !i.name.trim() || i.quantity <= 0)) {
          toast.error('At least one product item with a valid name and quantity is required.');
          return false;
        }
      }
    } else if (stepIdx === 3) {
      // Step 4 Suppliers
      if (d.vendors.selection !== 'Open' && (!d.vendors.invitedSellers || d.vendors.invitedSellers.length === 0)) {
        toast.error('Please invite at least 1 supplier or change sourcing scope to Open.');
        return false;
      }
      if (isReverseAuctionMethod(d.type) && d.vendors.invitedSellers.length < d.auctionConfig.minimumQualifiedBidders) {
        toast.error(`Reverse auction requires at least ${d.auctionConfig.minimumQualifiedBidders} qualified suppliers.`);
        return false;
      }
      if (isRateContractMethod(d.type) && d.rateContractConfig.selectedSuppliers.length === 0 && d.vendors.invitedSellers.length === 0) {
        toast.error('Rate Contract requires at least one selected supplier.');
        return false;
      }
    } else if (stepIdx === 4) {
      // Step 5 Event timeline
      if (!d.schedule.submissionDate) {
        toast.error('Submission deadline date is required.');
        return false;
      }
      const nowTime = new Date(d.schedule.submissionStartDate).getTime();
      const endTime = new Date(d.schedule.submissionDate).getTime();
      if (endTime <= nowTime) {
        toast.error('Submission closing date must be after submission start date.');
        return false;
      }
      if (d.basics.isTechnicalEvaluationNeeded) {
        if (!d.schedule.technicalOpeningDate) {
          toast.error('Technical opening date is required.');
          return false;
        }
        if (new Date(d.schedule.technicalOpeningDate) < new Date(d.schedule.submissionDate)) {
          toast.error('Technical opening date cannot be scheduled before submission deadline.');
          return false;
        }
      }
      if (d.schedule.packetType === 'Two') {
        if (!d.schedule.financialOpeningDate) {
          toast.error('Financial opening date is required for Two Packet flow.');
          return false;
        }
        if (new Date(d.schedule.financialOpeningDate) < new Date(d.schedule.technicalOpeningDate)) {
          toast.error('Financial opening date must be scheduled on or after technical envelope opening.');
          return false;
        }
      }
      if (isReverseAuctionMethod(d.type)) {
        const auction = d.auctionConfig;
        const start = new Date(auction.startDateTime).getTime();
        const end = new Date(auction.endDateTime).getTime();
        if (!auction.auctionTitle.trim()) {
          toast.error('Auction title is required.');
          return false;
        }
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
          toast.error('Auction start datetime must be before auction end datetime.');
          return false;
        }
        if (auction.durationMinutes <= 0) {
          toast.error('Auction duration must be greater than 0 minutes.');
          return false;
        }
        if (auction.startingBidPrice <= 0) {
          toast.error('Starting bid price must be greater than 0.');
          return false;
        }
        if (auction.reservePrice !== null && auction.reservePrice > auction.startingBidPrice) {
          toast.error('Reserve price cannot exceed starting bid price.');
          return false;
        }
        if (auction.minimumBidDecrement <= 0) {
          toast.error('Minimum bid decrement must be greater than 0.');
          return false;
        }
        if (auction.autoExtensionEnabled && (
          auction.extensionTriggerMinutes <= 0 ||
          auction.extensionDurationMinutes <= 0 ||
          auction.maximumExtensions <= 0
        )) {
          toast.error('Auto extension trigger, duration, and maximum extensions are required.');
          return false;
        }
        if (d.type === 'BID_WITH_REVERSE_AUCTION' && !auction.triggerConfiguration.trigger) {
          toast.error('Bid with Reverse Auction requires an auction trigger configuration.');
          return false;
        }
      }
      if (isRateContractMethod(d.type)) {
        const contract = d.rateContractConfig;
        const start = new Date(contract.periodStartDate).getTime();
        const end = new Date(contract.periodEndDate).getTime();
        if (!contract.contractTitle.trim()) {
          toast.error('Contract title is required.');
          return false;
        }
        if (!Number.isFinite(start) || !Number.isFinite(end) || start >= end) {
          toast.error('Rate Contract start date must be before end date.');
          return false;
        }
        if (!contract.rateValidityPeriod.trim()) {
          toast.error('Rate validity period is required.');
          return false;
        }
        if (contract.itemRateSchedule.length === 0) {
          toast.error('Rate Contract requires at least one item in the rate schedule.');
          return false;
        }
        if (contract.itemRateSchedule.some(item => !item.itemName.trim() || !item.uom.trim() || item.estimatedAnnualQuantity <= 0 || item.baseRate <= 0)) {
          toast.error('Every rate schedule item must have item name, UOM, annual quantity, and base rate.');
          return false;
        }
        if (contract.itemRateSchedule.some(item => item.slabPricingEnabled && item.slabPricing.some(slab => slab.minQuantity <= 0 || (slab.maxQuantity !== null && slab.maxQuantity < slab.minQuantity) || slab.rate <= 0))) {
          toast.error('Slab pricing rows must have valid quantity ranges and positive rates.');
          return false;
        }
        if (contract.callOffOrderAllowed && contract.maximumOrderQuantityPerCallOff > 0 && contract.maximumOrderQuantityPerCallOff < contract.minimumOrderQuantity) {
          toast.error('Maximum call-off quantity cannot be lower than minimum order quantity.');
          return false;
        }
        if (!contract.deliverySla.trim()) {
          toast.error('Delivery SLA is required.');
          return false;
        }
        if (!contract.penaltyClause.trim()) {
          toast.error('Penalty clause is required.');
          return false;
        }
        if (contract.securityDepositRequired && contract.securityDepositAmount <= 0) {
          toast.error('Security deposit amount is required.');
          return false;
        }
        if (contract.pbgRequired && contract.pbgAmount <= 0) {
          toast.error('PBG amount is required.');
          return false;
        }
      }
    } else if (stepIdx === 5) {
      // Step 6 Terms
      if (!d.terms.paymentTerms) {
        toast.error('Payment terms are required.');
        return false;
      }
      if (!d.terms.deliveryTerms) {
        toast.error('Delivery location terms are required.');
        return false;
      }
      if (d.terms.emdRequired && d.terms.emdAmount <= 0) {
        toast.error('Please specify an EMD amount greater than 0.');
        return false;
      }
    } else if (stepIdx === 6) {
      // Step 7 Documents
      if (d.requiredDocs.length === 0) {
        toast.error('Please specify at least 1 required verification document.');
        return false;
      }
    } else if (stepIdx === 7) {
      // Step 8 Evaluation criteria
      if (!d.evaluation.method) {
        toast.error('Evaluation method is required.');
        return false;
      }
      if (d.evaluation.method === 'QCBS / weighted technical-commercial score') {
        const total = d.evaluation.technicalCriteria.reduce((sum, c) => sum + Number(c.weightage || 0), 0);
        if (total !== 100) {
          toast.error('QCBS evaluation weightage sum must be exactly 100%.');
          return false;
        }
      }
    }
    return true;
  };

  const goNext = async () => {
    if (!validateStep(activeStep)) return;
    await saveDraftLocally(true);
    if (activeStep < ALL_STEPS.length - 1) {
      setActiveStep(step => step + 1);
    }
  };

  const goBack = () => {
    if (activeStep > 0) {
      setActiveStep(step => step - 1);
    } else {
      router.push('/buyer/procurement');
    }
  };

  const submitProcurement = async () => {
    const failed = readiness.filter(r => !r.ok && r.severity === 'error');
    if (failed.length > 0) {
      toast.error(`Please fix missing details: ${failed.map(f => f.label).join(', ')}`);
      return;
    }
    setSubmittingDraft(true);
    try {
      const payload = buildProcurementApiPayload(draft, activeStep);
      await submitProcurementDraft(payload);
      toast.success('Procurement request submitted successfully');
      router.push(`/buyer/procurement`);
    } catch (err: any) {
      toast.error('Submission failed: ' + err.message);
    } finally {
      setSubmittingDraft(false);
    }
  };

  const currentStepKind = ALL_STEPS[activeStep];
  const stepConfig = stepLibrary[currentStepKind];

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,#eef5ff_0,#f7f9fc_42%,#eef2f7_100%)] pb-20 text-slate-950">
      {/* Accent Header Line */}
      <div className="h-1.5 w-full bg-[#12335f]" />

      <div className="mx-auto max-w-[1560px] px-4 py-6 lg:px-6">
        
        {/* Step Header Row */}
        <div className="mb-6 flex flex-col gap-4 rounded-[24px] bg-white/95 p-4 shadow-[0_12px_36px_rgba(15,23,42,0.07)] ring-1 ring-slate-200/70 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-wider">
              <span>Guided Procurement Wizard</span>
              <span>&middot;</span>
              <BuyerTypeBadge buyerType={draft.basics.buyerType} />
              <span>&middot;</span>
              <MethodBadge method={draft.type} />
            </div>
            <h1 className="text-lg font-black text-slate-900 tracking-tight mt-1 truncate">
              {draft.basics.title || 'Draft Sourcing Event'}
            </h1>
            <p className="text-[11px] text-slate-500 font-semibold mt-0.5">
              Step {activeStep + 1} of {ALL_STEPS.length}: {stepConfig.label} &middot; {completionPercentage}% Form Completion
            </p>
          </div>
          <div className="flex flex-wrap gap-2 shrink-0">
            <Button variant="outline" size="sm" onClick={() => saveDraftLocally()} disabled={savingDraft} className="h-9 font-bold text-slate-700">
              {savingDraft ? <Loader2 className="h-4 w-4 animate-spin mr-1.5" /> : <Save className="h-4 w-4 mr-1.5" />}
              Save Draft
            </Button>
            <Button variant="outline" size="sm" onClick={() => router.push(PROCUREMENT_DRAFTS_ROUTE)} className="h-9 font-bold text-slate-700">
              <History className="h-4 w-4 mr-1.5" /> Drafts History
            </Button>
          </div>
        </div>

        {/* Wizard Main Layout */}
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          
          {/* Stepper Sidebar */}
          <aside className="space-y-4">
            <div className="rounded-[24px] bg-slate-50/80 p-4 ring-1 ring-slate-200/70">
              <h2 className="text-[9px] font-black uppercase text-slate-400 tracking-wider mb-2.5 px-0.5">Wizard Progression</h2>
              <ProcurementStepper
                steps={ALL_STEPS.map(s => ({
                  id: s,
                  label: stepLibrary[s].label,
                  description: stepLibrary[s].description,
                  icon: stepLibrary[s].icon
                }))}
                currentStep={activeStep}
                completedSteps={ALL_STEPS.slice(0, activeStep)}
                onStepClick={async (idx) => {
                  if (idx < activeStep || validateStep(activeStep)) {
                    await saveDraftLocally(true);
                    setActiveStep(idx);
                  }
                }}
                disabledFutureSteps={true}
              />
            </div>
          </aside>

          {/* Form Step Body Wrapper */}
          <div className="space-y-6">
            
            {/* Step 1 Sourcing Intent */}
            {currentStepKind === 'basics' && (
              <SectionCard title="Procurement Intent & Strategy" description="Specify buyer profile, sourcing title, categories, priority and method selections" icon={stepLibrary.basics.icon}>
                <BasicsStepForm
                  draft={draft}
                  updateDraft={updateDraft}
                  recommendedMethod={recommendedMethod}
                />
              </SectionCard>
            )}

            {/* Step 2 Buyer details */}
            {currentStepKind === 'internal' && (
              <SectionCard title="Buyer & Internal Details" description="Fill out organization hierarchy, project cost codes, and statutory approvals" icon={stepLibrary.internal.icon}>
                <InternalDetailsForm
                  draft={draft}
                  updateDraft={updateDraft}
                />
              </SectionCard>
            )}

            {/* Step 3 Items specs */}
            {currentStepKind === 'items' && (
              <SectionCard title="Item / Service / BOQ details" description="Upload or map required products, custom SLA contracts, or multiple BOQ schedules" icon={stepLibrary.items.icon}>
                <ItemsDetailsForm
                  draft={draft}
                  updateDraft={updateDraft}
                  showItemDrawer={showItemDrawer}
                  setShowItemDrawer={setShowItemDrawer}
                  selectedItemForEdit={selectedItemForEdit}
                  setSelectedItemForEdit={setSelectedItemForEdit}
                />
              </SectionCard>
            )}

            {/* Step 4 Sellers Selection */}
            {currentStepKind === 'vendors' && (
              <SectionCard title="Supplier Reach & Invites" description="Configure bidding scopes and invite registered verified companies" icon={stepLibrary.vendors.icon}>
                <VendorsStepForm
                  draft={draft}
                  updateDraft={updateDraft}
                />
              </SectionCard>
            )}

            {/* Step 5 Timeline Event Rules */}
            {currentStepKind === 'schedule' && (
              <SectionCard title="Event Timeline & Auction Rules" description="Set submission windows, envelope opening schedules, and transparency parameters" icon={stepLibrary.schedule.icon}>
                <ScheduleStepForm
                  draft={draft}
                  updateDraft={updateDraft}
                />
              </SectionCard>
            )}

            {/* Step 6 Commercial Terms */}
            {currentStepKind === 'terms' && (
              <SectionCard title="Commercial & Payment Terms" description="Configure delivery, warranty clauses, and financial deposit parameters" icon={stepLibrary.terms.icon}>
                <CommercialTermsForm
                  draft={draft}
                  updateDraft={updateDraft}
                />
              </SectionCard>
            )}

            {/* Step 7 Document Checklists */}
            {currentStepKind === 'documents' && (
              <SectionCard title="Required Document Checklists" description="Add mandatory credentials required from bidders at technical opening" icon={stepLibrary.documents.icon}>
                <DocumentsStepForm
                  draft={draft}
                  updateDraft={updateDraft}
                />
              </SectionCard>
            )}

            {/* Step 8 Evaluation scoring */}
            {currentStepKind === 'evaluation' && (
              <SectionCard title="Evaluation Basis & Weightages" description="Define QCBS scoring percentages or L1 award guidelines" icon={stepLibrary.evaluation.icon}>
                <EvaluationBasisForm
                  draft={draft}
                  updateDraft={updateDraft}
                />
              </SectionCard>
            )}

            {/* Step 9 Preview & approval */}
            {currentStepKind === 'publish' && (
              <SectionCard title="Review, Approval & Publish Sourcing Event" description="Overview all configurations and submit for corporate/regulatory compliance workflow" icon={stepLibrary.publish.icon}>
                <PreviewPublishForm
                  draft={draft}
                  updateDraft={updateDraft}
                  readiness={readiness}
                />
              </SectionCard>
            )}

            {/* Sticky Actions control bar */}
            <StickyActionBar
              onBack={goBack}
              onSaveDraft={() => saveDraftLocally()}
              onContinue={goNext}
              onSubmit={submitProcurement}
              isSaving={savingDraft}
              isSubmitting={submittingDraft}
              showSubmit={activeStep === ALL_STEPS.length - 1}
            />

          </div>

        </div>

      </div>
    </main>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 1 Form components: Sourcing Intent
// ─────────────────────────────────────────────────────────────────────────────
function BasicsStepForm({
  draft,
  updateDraft,
  recommendedMethod
}: {
  draft: Draft;
  updateDraft: (updater: (current: Draft) => Draft) => void;
  recommendedMethod: RecommendationResult;
}) {
  const availableMethods = useMemo(() => {
    return METHOD_DEFINITIONS.filter(m => m.buyerTypes.includes(draft.basics.buyerType));
  }, [draft.basics.buyerType]);

  const handleApplyRecommendation = () => {
    updateDraft(current => ({
      ...current,
      type: recommendedMethod.id,
      requiredDocs: defaultRequiredDocs(current.basics.buyerType, recommendedMethod.id)
    }));
    toast.success(`Applied recommended method: ${recommendedMethod.id}`);
  };

  // Delivery address dropdown and modal states
  const [deliveryAddressesList, setDeliveryAddressesList] = useState<DeliveryAddressDto[]>([]);
  const [loadingAddresses, setLoadingAddresses] = useState(false);
  const [isAddressModalOpen, setIsAddressModalOpen] = useState(false);

  // Address form fields state
  const [addressLabel, setAddressLabel] = useState('');
  const [organizationName, setOrganizationName] = useState('');
  const [addressType, setAddressType] = useState('OFFICE');
  const [contactPersonName, setContactPersonName] = useState('');
  const [mobileNumber, setMobileNumber] = useState('');
  const [alternateMobileNumber, setAlternateMobileNumber] = useState('');
  const [email, setEmail] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [addressLine2, setAddressLine2] = useState('');
  const [state, setState] = useState('');
  const [district, setDistrict] = useState('');
  const [city, setCity] = useState('');
  const [pincode, setPincode] = useState('');
  const [landmark, setLandmark] = useState('');
  const [gstState, setGstState] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('');

  useEffect(() => {
    let active = true;
    setLoadingAddresses(true);
    fetchDeliveryAddresses()
      .then(res => {
        if (active) setDeliveryAddressesList(res || []);
      })
      .catch(err => {
        console.warn('Failed to load saved addresses:', err);
      })
      .finally(() => {
        if (active) setLoadingAddresses(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const handleStateChange = (val: string) => {
    setState(val);
    setDistrict('');
  };

  const handleDistrictChange = (val: string) => {
    setDistrict(val);
  };

  const handleCreateAddress = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const newAddr = await createDeliveryAddress({
        addressLabel,
        organizationName: organizationName || null,
        contactPersonName,
        mobileNumber,
        alternateMobileNumber: alternateMobileNumber || null,
        email: email || null,
        addressLine1,
        addressLine2: addressLine2 || null,
        city,
        district,
        state,
        pincode,
        landmark: landmark || null,
        gstState: gstState || null,
        placeOfSupply: placeOfSupply || null,
        addressType,
        isDefault: deliveryAddressesList.length === 0
      });
      toast.success('New delivery address added.');
      setIsAddressModalOpen(false);
      
      // Update delivery address list
      setDeliveryAddressesList(prev => [newAddr, ...prev]);
      
      // Autofetch and populate delivery location
      const fullAddr = `${newAddr.addressLabel}: ${newAddr.addressLine1}${newAddr.addressLine2 ? ', ' + newAddr.addressLine2 : ''}, ${newAddr.city}, ${newAddr.district}, ${newAddr.state} - ${newAddr.pincode}. Contact: ${newAddr.contactPersonName} (${newAddr.mobileNumber})`;
      updateDraft(c => ({
        ...c,
        basics: { ...c.basics, deliveryLocation: fullAddr }
      }));

      // Reset address form fields
      setAddressLabel('');
      setOrganizationName('');
      setAddressType('OFFICE');
      setContactPersonName('');
      setMobileNumber('');
      setAlternateMobileNumber('');
      setEmail('');
      setAddressLine1('');
      setAddressLine2('');
      setState('');
      setDistrict('');
      setCity('');
      setPincode('');
      setLandmark('');
      setGstState('');
      setPlaceOfSupply('');
    } catch (err: any) {
      toast.error(err.message || 'Failed to add address.');
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Buyer type workflow" required>
          <div className="grid grid-cols-2 gap-2 border border-slate-200 p-1.5 rounded-lg bg-slate-50">
            <button
              type="button"
              onClick={() => {
                updateDraft(current => ({
                  ...current,
                  basics: { ...current.basics, buyerType: 'PRIVATE_BUYER' },
                  requiredDocs: defaultRequiredDocs('PRIVATE_BUYER', current.type)
                }));
              }}
              className={cn("h-9 rounded-md text-xs font-black uppercase transition-all", draft.basics.buyerType === 'PRIVATE_BUYER' ? "bg-white text-[#12335f] shadow-sm" : "text-slate-500 hover:text-slate-900")}
            >
              Private Buyer (SAP)
            </button>
            <button
              type="button"
              onClick={() => {
                updateDraft(current => ({
                  ...current,
                  basics: { ...current.basics, buyerType: 'GOVERNMENT_BUYER' },
                  requiredDocs: defaultRequiredDocs('GOVERNMENT_BUYER', current.type)
                }));
              }}
              className={cn("h-9 rounded-md text-xs font-black uppercase transition-all", draft.basics.buyerType === 'GOVERNMENT_BUYER' ? "bg-white text-[#12335f] shadow-sm" : "text-slate-500 hover:text-slate-900")}
            >
              Govt Buyer (GeM)
            </button>
          </div>
          <p className="text-[10px] text-slate-500 font-semibold mt-1">
            Private Buyer uses corporate SAP compliance. Govt Buyer uses GeM GFR-2017 rules.
          </p>
        </Field>

        {['RFQ', 'RFI', 'RFP', 'OPEN_TENDER', 'LIMITED_TENDER', 'SEALED_TENDER', 'TWO_PACKET_BID', 'BOQ_BASED_BID'].includes(draft.type) && (
          <Field label={`${draft.type.includes('TENDER') || draft.type === 'TWO_PACKET_BID' || draft.type === 'BOQ_BASED_BID' ? 'Tender' : draft.type} Number`}>
            <input
              type="text"
              value={draft.id ? `${draft.type === 'TWO_PACKET_BID' || draft.type === 'BOQ_BASED_BID' ? 'TDR' : draft.type}-${draft.id}` : 'Auto-generated after first save'}
              disabled
              className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 text-sm font-semibold text-slate-500 outline-none cursor-not-allowed"
            />
          </Field>
        )}

        {draft.type === 'RFQ' && (
          <Field label="RFQ Type" required>
            <select
              value={draft.rfqType || 'OPEN'}
              onChange={e => updateDraft(c => ({ ...c, rfqType: e.target.value as any }))}
              className={inputClass}
            >
              <option value="OPEN">Open RFQ (All registered sellers can quote)</option>
              <option value="LIMITED">Limited RFQ (Only invited/selected sellers can quote)</option>
            </select>
          </Field>
        )}

        {(draft.type === 'LIMITED_TENDER' || (draft.type === 'RFQ' && draft.rfqType === 'LIMITED')) && (
          <div className="sm:col-span-2">
            <Field label="Limited Tender / RFQ Justification" required>
              <textarea
                value={draft.limitedTenderJustification || ''}
                onChange={e => updateDraft(c => ({ ...c, limitedTenderJustification: e.target.value }))}
                rows={2}
                className={textareaClass}
                placeholder="Explain why this event is restricted to a limited vendor list (minimum 15 characters)..."
              />
            </Field>
          </div>
        )}

        <Field label="Procurement title" required>
          <input
            value={draft.basics.title}
            onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, title: e.target.value } }))}
            className={inputClass}
            placeholder="Office computers, AMC maintenance, raw supply..."
          />
        </Field>

        <Field label="What are you buying?" required>
          <select
            value={draft.basics.whatAreYouBuying}
            onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, whatAreYouBuying: e.target.value } }))}
            className={inputClass}
          >
            <option value="Product">Product / Goods</option>
            <option value="Service">Service Contract</option>
            <option value="Works">Works Contract</option>
            <option value="BOQ">BOQ Sourced (Multi line)</option>
            <option value="Catalogue item">Catalogue Standard Item</option>
          </select>
          <p className="text-[10px] text-slate-500 font-semibold mt-1">
            Category of sourcing requirement (e.g. Products, Services, or Bill of Quantities).
          </p>
        </Field>

        <Field label="Estimated value (INR)" required>
          <input
            type="number"
            min={0}
            value={draft.basics.estimatedValue || ''}
            onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, estimatedValue: Number(e.target.value || 0) } }))}
            className={inputClass}
            placeholder="0"
          />
          <p className="text-[10px] text-slate-500 font-semibold mt-1">
            Estimated budget for the procurement in INR.
          </p>
        </Field>

        <Field label="Procurement category" required>
          <select
            value={draft.basics.category}
            onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, category: e.target.value } }))}
            className={inputClass}
          >
            {CATEGORY_OPTIONS.map(opt => <option key={opt} value={opt}>{opt}</option>)}
          </select>
        </Field>

        <Field label="Urgency priority">
          <select
            value={draft.basics.priority}
            onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, priority: e.target.value as any } }))}
            className={inputClass}
          >
            <option value="Normal">Normal</option>
            <option value="Urgent">Urgent</option>
            <option value="Emergency">Emergency</option>
          </select>
        </Field>

        <Field label="Required by date" required>
          <input
            type="date"
            value={draft.basics.requiredByDate}
            onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, requiredByDate: e.target.value } }))}
            className={inputClass}
          />
        </Field>

        <div className="sm:col-span-2 space-y-4">
          <div>
            {deliveryAddressesList.length > 0 ? (
              <div className="mb-2">
                <label className="text-[11px] font-bold text-slate-500 uppercase tracking-wide mb-1 block">
                  Select From Saved Addresses
                </label>
                <div className="flex gap-2 items-center">
                  <div className="flex-1">
                    <SearchableSelect
                      placeholder={loadingAddresses ? "Loading addresses..." : "Search and select a saved address..."}
                      options={deliveryAddressesList.map(addr => ({
                        value: String(addr.id),
                        label: `${addr.addressLabel}: ${addr.addressLine1}, ${addr.city} (${addr.contactPersonName})`
                      }))}
                      value=""
                      onChange={(val) => {
                        if (!val) return;
                        const selected = deliveryAddressesList.find(a => String(a.id) === String(val));
                        if (selected) {
                          const fullAddr = `${selected.addressLabel}: ${selected.addressLine1}${selected.addressLine2 ? ', ' + selected.addressLine2 : ''}, ${selected.city}, ${selected.district}, ${selected.state} - ${selected.pincode}. Contact: ${selected.contactPersonName} (${selected.mobileNumber})`;
                          updateDraft(c => ({
                            ...c,
                            basics: { ...c.basics, deliveryLocation: fullAddr }
                          }));
                        }
                      }}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => setIsAddressModalOpen(true)}
                    className="h-10 text-xs font-bold shrink-0 border-slate-300 hover:bg-slate-50 text-slate-700"
                  >
                    + Add Address
                  </Button>
                </div>
              </div>
            ) : (
              <div className="mb-2 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between">
                <span className="text-xs text-slate-500 font-semibold">No saved addresses found.</span>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddressModalOpen(true)}
                  className="h-8 text-xs font-bold border-slate-300 hover:bg-slate-50 text-slate-700"
                >
                  + Add Address
                </Button>
              </div>
            )}
          </div>

          <Field label="Delivery location" required>
            <textarea
              value={draft.basics.deliveryLocation}
              onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, deliveryLocation: e.target.value } }))}
              rows={2}
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15"
              placeholder="Warehouse yard, Central office..."
            />
          </Field>
        </div>
      </div>

      {/* Sourcing parameters checkboxes */}
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">Procurement Parameters</h3>
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.basics.isCatalogueAvailable}
              onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, isCatalogueAvailable: e.target.checked } }))}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>Catalog item available?</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.basics.isOnlyOneVendor}
              onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, isOnlyOneVendor: e.target.checked } }))}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>Only one vendor allowed?</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.basics.isReverseAuctionNeeded}
              onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, isReverseAuctionNeeded: e.target.checked } }))}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>Reverse auction needed?</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.basics.isTechnicalEvaluationNeeded}
              onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, isTechnicalEvaluationNeeded: e.target.checked } }))}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>Tech opening needed?</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.basics.isSpecClear}
              onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, isSpecClear: e.target.checked } }))}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>Specifications are clear?</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.basics.isRepeatedSupply}
              onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, isRepeatedSupply: e.target.checked } }))}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>Repeated/recurring supply?</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.basics.marketResearchOnly}
              onChange={e => updateDraft(c => ({ ...c, basics: { ...c.basics, marketResearchOnly: e.target.checked } }))}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>Market research/RFI only?</span>
          </label>
        </div>
      </div>

      {draft.type === 'RFI' && (
        <div className="border border-slate-200 bg-white p-5 rounded-xl space-y-4 shadow-sm mb-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">RFI Questionnaire Builder</h3>
              <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Add market research questions for responding vendors (at least 1 question is required).</p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                updateDraft(c => ({
                  ...c,
                  questionnaire: [
                    ...(c.questionnaire || []),
                    { id: makeId(), type: 'TEXT', text: '' }
                  ]
                }));
              }}
              className="h-8 text-xs font-bold text-[#12335f] border-slate-300 hover:bg-slate-50"
            >
              + Add Question
            </Button>
          </div>

          {(draft.questionnaire || []).length === 0 ? (
            <div className="text-center py-6 text-xs text-slate-400 font-semibold">
              No questions added yet. Click "+ Add Question" to start building your RFI survey.
            </div>
          ) : (
            <div className="space-y-3">
              {(draft.questionnaire || []).map((q, idx) => (
                <div key={q.id} className="flex gap-3 items-start border border-slate-100 p-3 rounded-lg bg-slate-50/50">
                  <span className="text-xs font-bold text-slate-400 mt-2.5">Q{idx + 1}.</span>
                  <div className="flex-1 grid gap-3 sm:grid-cols-[1fr_160px]">
                    <input
                      type="text"
                      value={q.text}
                      onChange={e => {
                        const newQ = [...(draft.questionnaire || [])];
                        newQ[idx].text = e.target.value;
                        updateDraft(c => ({ ...c, questionnaire: newQ }));
                      }}
                      placeholder="Type your market research or capability question..."
                      className={inputClass}
                    />
                    <select
                      value={q.type}
                      onChange={e => {
                        const newQ = [...(draft.questionnaire || [])];
                        newQ[idx].type = e.target.value as any;
                        updateDraft(c => ({ ...c, questionnaire: newQ }));
                      }}
                      className={inputClass}
                    >
                      <option value="TEXT">Text Answer</option>
                      <option value="YES_NO">Yes / No Option</option>
                      <option value="ATTACHMENT">Document Attachment</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      updateDraft(c => ({
                        ...c,
                        questionnaire: (c.questionnaire || []).filter(x => x.id !== q.id)
                      }));
                    }}
                    className="p-2 rounded text-rose-500 hover:bg-rose-50 transition-all mt-1"
                    title="Delete question"
                  >
                    <Trash2 className="h-4.5 w-4.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Suggested method banner */}
      <div className="border border-amber-250 bg-amber-50/40 p-5 rounded-xl space-y-4 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
          <div className="flex gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-amber-600/10 text-amber-700">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h4 className="text-xs font-black uppercase text-amber-900 tracking-wider">Suggested Sourcing Method</h4>
                <span className={cn(
                  "px-2 py-0.5 rounded text-[8px] font-black uppercase leading-none border",
                  recommendedMethod.confidence === 'HIGH' ? "bg-emerald-100 border-emerald-250 text-emerald-850" :
                  recommendedMethod.confidence === 'MEDIUM' ? "bg-amber-100 border-amber-250 text-amber-850" :
                  "bg-rose-100 border-rose-250 text-rose-850"
                )}>
                  {recommendedMethod.confidence} Confidence
                </span>
              </div>
              <p className="text-[11px] font-semibold text-amber-800 mt-1.5 leading-relaxed max-w-2xl">
                <strong>{recommendedMethod.id.replace(/_/g, ' ')}</strong>: {recommendedMethod.reason}
              </p>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleApplyRecommendation}
            disabled={draft.type === recommendedMethod.id}
            className="bg-amber-600 hover:bg-amber-700 text-white rounded text-[10px] uppercase font-black tracking-wide h-9 shrink-0"
          >
            {draft.type === recommendedMethod.id ? 'Applied' : 'Apply Recommendation'}
          </Button>
        </div>

        {/* Alternative recommendation options */}
        {recommendedMethod.alternativeMethods && recommendedMethod.alternativeMethods.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-t border-amber-200/50 pt-3 text-[10px] font-semibold text-amber-850">
            <span>Alternative methods:</span>
            {recommendedMethod.alternativeMethods.map(alt => (
              <button
                key={alt}
                type="button"
                onClick={() => {
                  updateDraft(current => ({
                    ...current,
                    type: alt,
                    requiredDocs: defaultRequiredDocs(current.basics.buyerType, alt)
                  }));
                  toast.success(`Selected alternative: ${alt}`);
                }}
                className="bg-white border border-amber-250 hover:border-amber-400 px-2 py-0.5 rounded text-[9px] uppercase font-bold text-amber-900 transition shadow-2xs"
              >
                {alt.replace(/_/g, ' ')}
              </button>
            ))}
          </div>
        )}

        {/* Suggested Warnings */}
        {recommendedMethod.warnings && recommendedMethod.warnings.length > 0 && (
          <div className="border-t border-amber-200/50 pt-3 text-[10px] font-semibold text-amber-800 space-y-1">
            <span className="text-amber-900 font-extrabold uppercase text-[8px] tracking-wider block">Compliance Alerts:</span>
            {recommendedMethod.warnings.map((warning, idx) => (
              <p key={idx} className="flex items-center gap-1.5 pl-1 text-[10.5px]">
                <span className="text-amber-600 text-xs shrink-0">⚠️</span>
                <span>{warning}</span>
              </p>
            ))}
          </div>
        )}

        {/* Sourcing Justifications */}
        {recommendedMethod.requiredJustifications && recommendedMethod.requiredJustifications.length > 0 && (
          <div className="border-t border-amber-200/50 pt-3 text-[10px] font-semibold text-amber-800 space-y-1">
            <span className="text-amber-900 font-extrabold uppercase text-[8px] tracking-wider block">Required Justifications:</span>
            {recommendedMethod.requiredJustifications.map((just, idx) => (
              <p key={idx} className="flex items-center gap-1.5 pl-1 text-[10.5px]">
                <span className="text-slate-400 shrink-0">&middot;</span>
                <span>{just}</span>
              </p>
            ))}
          </div>
        )}
      </div>

      {/* Override Alert Banner */}
      {draft.type !== recommendedMethod.id && (
        <div className="p-4 bg-amber-50/50 border border-amber-200 text-amber-850 rounded-xl text-xs font-semibold flex items-start gap-2.5 shadow-2xs">
          <span className="text-amber-600 text-sm shrink-0">⚠️</span>
          <div>
            <span className="text-amber-900 font-black uppercase text-[9px] tracking-wider block">Manual Method Override Active</span>
            <p className="mt-0.5 leading-relaxed text-amber-700 font-medium">
              You have manually selected <strong>{draft.type.replace(/_/g, ' ')}</strong> instead of the suggested <strong>{recommendedMethod.id.replace(/_/g, ' ')}</strong>. Ensure corporate policy or GFR rules approve this override.
            </p>
          </div>
        </div>
      )}

      {/* Method specific notices */}
      {['PAC', 'SINGLE_SOURCE', 'EMERGENCY_PURCHASE'].includes(draft.type) && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl text-xs font-semibold flex items-start gap-2.5 shadow-2xs">
          <span className="text-rose-600 text-sm shrink-0">⚠️</span>
          <div>
            <span className="text-rose-950 font-black uppercase text-[9px] tracking-wider block">Exclusivity / Emergency Sourcing Active</span>
            <p className="mt-0.5 leading-relaxed text-rose-700 font-medium">
              This method skips open-market competition. You must upload legal justifications (e.g. PAC Certificate) in Step 7 and obtain CFA approval signatures.
            </p>
          </div>
        </div>
      )}

      {draft.type === 'REVERSE_AUCTION' && !draft.basics.isSpecClear && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold flex items-start gap-2.5 shadow-2xs">
          <span className="text-amber-600 text-sm shrink-0">⚠️</span>
          <div>
            <span className="text-amber-950 font-black uppercase text-[9px] tracking-wider block">Reverse Auction Spec Warning</span>
            <p className="mt-0.5 leading-relaxed text-amber-700 font-medium">
              Conducting reverse auctions with unclear specifications increases the risk of delivery disputes. Verify item dimensions and specifications.
            </p>
          </div>
        </div>
      )}

      {draft.type === 'DIRECT_PURCHASE' && !draft.basics.isCatalogueAvailable && (
        <div className="p-4 bg-slate-50 border border-slate-200 text-slate-800 rounded-xl text-xs font-semibold flex items-start gap-2.5 shadow-2xs">
          <span className="text-slate-500 text-sm shrink-0">ℹ️</span>
          <div>
            <span className="text-slate-900 font-black uppercase text-[9px] tracking-wider block">Direct Purchase Catalogue Notice</span>
            <p className="mt-0.5 leading-relaxed text-slate-600 font-medium">
              Direct Sourcing is best applied when matching pre-approved catalog numbers or identical previous orders to ensure price reasonability.
            </p>
          </div>
        </div>
      )}

      {draft.type === 'TWO_PACKET_BID' && (
        <div className="p-4 bg-indigo-50 border border-indigo-200 text-indigo-800 rounded-xl text-xs font-semibold flex items-start gap-2.5 shadow-2xs">
          <span className="text-indigo-600 text-sm shrink-0">ℹ️</span>
          <div>
            <span className="text-indigo-900 font-black uppercase text-[9px] tracking-wider block">Two Packet Envelopes Setup</span>
            <p className="mt-0.5 leading-relaxed text-indigo-750 font-medium">
              Two-packet bidding mandates separate Technical Opening and Financial Opening dates. Setup these dates carefully in Step 5 (Timeline & Rules).
            </p>
          </div>
        </div>
      )}

      {/* Sourcing Method Selection Cards */}
      <div className="space-y-3.5">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide pl-0.5">Select Sourcing Method</h3>
        <div className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
          {availableMethods.map(method => (
            <ProcurementMethodCard
              key={method.id}
              title={method.title}
              subtitle={method.subtitle}
              icon={method.icon}
              complexity={method.complexity}
              estimatedTime={method.estimatedTime}
              isSelected={draft.type === method.id}
              onSelect={() => {
                updateDraft(current => ({
                  ...applyMethodDefaults(current, method.id),
                  requiredDocs: defaultRequiredDocs(current.basics.buyerType, method.id)
                }));
              }}
            />
          ))}
        </div>
      </div>

      {isAddressModalOpen && (
        <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-100 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-4">
              <h2 className="text-lg font-bold text-[#12335f]">
                Add New Delivery Address
              </h2>
              <button
                type="button"
                onClick={() => setIsAddressModalOpen(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-50 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateAddress} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Address Label *
                  </label>
                  <Input
                    required
                    placeholder="e.g. Headquarters, Warehouse A"
                    value={addressLabel}
                    onChange={e => setAddressLabel(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Organisation Name
                  </label>
                  <Input
                    placeholder="Company / Department Name"
                    value={organizationName}
                    onChange={e => setOrganizationName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Address Type *
                  </label>
                  <select
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15"
                    value={['OFFICE', 'WAREHOUSE', 'PROJECT_SITE', 'FACTORY'].includes(addressType) ? addressType : 'OTHER'}
                    onChange={e => setAddressType(e.target.value)}
                  >
                    <option value="OFFICE">Office</option>
                    <option value="WAREHOUSE">Warehouse</option>
                    <option value="PROJECT_SITE">Project Site</option>
                    <option value="FACTORY">Factory</option>
                    <option value="OTHER">Other</option>
                  </select>
                </div>

                {!['OFFICE', 'WAREHOUSE', 'PROJECT_SITE', 'FACTORY'].includes(addressType) && (
                  <div className="space-y-1.5 animate-in slide-in-from-top-1 duration-150">
                    <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                      Specify Address Type *
                    </label>
                    <Input
                      required
                      placeholder="e.g. Temporary, SHG Center, Hub"
                      value={addressType === 'OTHER' ? '' : addressType}
                      onChange={e => setAddressType(e.target.value)}
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Contact Person Name *
                  </label>
                  <Input
                    required
                    placeholder="Receiver Name"
                    value={contactPersonName}
                    onChange={e => setContactPersonName(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Mobile Number *
                  </label>
                  <Input
                    required
                    type="tel"
                    pattern="[0-9]{10,15}"
                    minLength={10}
                    maxLength={15}
                    title="Mobile number must be between 10 and 15 digits"
                    placeholder="10-digit Mobile Number"
                    value={mobileNumber}
                    onChange={e => setMobileNumber(e.target.value.replace(/\D/g, ''))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Alternate Mobile
                  </label>
                  <Input
                    type="tel"
                    pattern="[0-9]{10,15}"
                    maxLength={15}
                    title="Alternate mobile number must be between 10 and 15 digits"
                    placeholder="Optional Mobile"
                    value={alternateMobileNumber}
                    onChange={e => setAlternateMobileNumber(e.target.value.replace(/\D/g, ''))}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Email Address
                  </label>
                  <Input
                    type="email"
                    placeholder="Receiver Email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Address Line 1 *
                </label>
                <Input
                  required
                  placeholder="Building/Flat/Plot Number, Street Name"
                  value={addressLine1}
                  onChange={e => setAddressLine1(e.target.value)}
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                  Address Line 2
                </label>
                <Input
                  placeholder="Locality, Sector, Area (Optional)"
                  value={addressLine2}
                  onChange={e => setAddressLine2(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    State *
                  </label>
                  <select
                    required
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15"
                    value={state}
                    onChange={e => handleStateChange(e.target.value)}
                  >
                    <option value="">Select State</option>
                    {STATE_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    District *
                  </label>
                  <select
                    required
                    disabled={!state}
                    className="h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15 disabled:cursor-not-allowed disabled:bg-slate-50 disabled:text-slate-400"
                    value={district}
                    onChange={e => handleDistrictChange(e.target.value)}
                  >
                    <option value="">Select District</option>
                    {getDistrictOptions(state).map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    City *
                  </label>
                  <Input
                    required
                    placeholder="Enter city / town / village"
                    value={city}
                    onChange={e => setCity(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Pincode *
                  </label>
                  <Input
                    required
                    pattern="[0-9]{6,10}"
                    minLength={6}
                    maxLength={10}
                    title="Pincode must be between 6 and 10 digits"
                    placeholder="6 digits"
                    value={pincode}
                    onChange={e => setPincode(e.target.value.replace(/\D/g, ''))}
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Landmark
                  </label>
                  <Input
                    placeholder="Nearby popular spot"
                    value={landmark}
                    onChange={e => setLandmark(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    GST State Code
                  </label>
                  <Input
                    placeholder="e.g. 27-Maharashtra"
                    value={gstState}
                    onChange={e => setGstState(e.target.value)}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-black uppercase tracking-wider text-slate-700">
                    Place of Supply
                  </label>
                  <Input
                    placeholder="e.g. Maharashtra"
                    value={placeOfSupply}
                    onChange={e => setPlaceOfSupply(e.target.value)}
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 mt-6">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsAddressModalOpen(false)}
                  className="h-10 text-xs font-bold border-slate-300 hover:bg-slate-50 text-slate-700"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="h-10 text-xs font-bold bg-[#12335f] hover:bg-[#12335f]/90 text-white"
                >
                  Save Address
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}


// ─────────────────────────────────────────────────────────────────────────────
// STEP 2 Form components: Buyer & Internal details
// ─────────────────────────────────────────────────────────────────────────────
function InternalDetailsForm({
  draft,
  updateDraft
}: {
  draft: Draft;
  updateDraft: (updater: (current: Draft) => Draft) => void;
}) {
  const isGov = draft.basics.buyerType === 'GOVERNMENT_BUYER';
  const updateInternal = (key: keyof Draft['internal'], val: string | boolean) => {
    updateDraft(c => ({ ...c, internal: { ...c.internal, [key]: val } }));
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Organization name" required>
          <input
            value={draft.internal.orgName}
            onChange={e => updateInternal('orgName', e.target.value)}
            className={inputClass}
            placeholder="Enter organization title"
          />
        </Field>

        <Field label="Buying Department" required>
          <input
            value={draft.internal.department}
            onChange={e => updateInternal('department', e.target.value)}
            className={inputClass}
            placeholder="Sourcing, Procurement, IT Dept..."
          />
        </Field>

        <Field label="Contact Person Name" required>
          <input
            value={draft.internal.contactPerson}
            onChange={e => updateInternal('contactPerson', e.target.value)}
            className={inputClass}
            placeholder="John Doe"
          />
        </Field>

        <Field label="Contact Email Address" required>
          <input
            type="email"
            value={draft.internal.email}
            onChange={e => updateInternal('email', e.target.value)}
            className={inputClass}
            placeholder="john.doe@company.com"
          />
        </Field>

        <Field label="Contact Mobile Number" required>
          <input
            value={draft.internal.mobile}
            onChange={e => updateInternal('mobile', e.target.value)}
            className={inputClass}
            placeholder="9876543210"
          />
        </Field>

        {/* Private vs Government Specific Forms UI emphasis */}
        {!isGov ? (
          <>
            <Field label="Cost Center" required>
              <input
                value={draft.internal.costCenter}
                onChange={e => updateInternal('costCenter', e.target.value)}
                className={inputClass}
                placeholder="CC-MKTG-102"
              />
              <p className="text-[10px] text-slate-500 font-semibold mt-1">
                Internal corporate code for cost tracking and accounting allocation.
              </p>
            </Field>

            <Field label="Budget Head / Code">
              <input
                value={draft.internal.budgetHead}
                onChange={e => updateInternal('budgetHead', e.target.value)}
                className={inputClass}
                placeholder="BH-CAPEX-IT"
              />
            </Field>

            <Field label="Project Code reference">
              <input
                value={draft.internal.projectCode}
                onChange={e => updateInternal('projectCode', e.target.value)}
                className={inputClass}
                placeholder="PROJ-2026-CLOUD"
              />
            </Field>

            <Field label="Internal Approval Authority" required>
              <input
                value={draft.internal.approvalAuthority}
                onChange={e => updateInternal('approvalAuthority', e.target.value)}
                className={inputClass}
                placeholder="Chief Sourcing Officer"
              />
            </Field>
          </>
        ) : (
          <>
            <Field label="Department File / Case Number" required>
              <input
                value={draft.internal.internalFileNumber}
                onChange={e => updateInternal('internalFileNumber', e.target.value)}
                className={inputClass}
                placeholder="DEPT/2026/RFQ/8801"
              />
            </Field>

            <Field label="Competent Financial Authority (CFA)" required>
              <input
                value={draft.internal.competentAuthority}
                onChange={e => updateInternal('competentAuthority', e.target.value)}
                className={inputClass}
                placeholder="Director of Finance (DF)"
              />
              <p className="text-[10px] text-slate-500 font-semibold mt-1">
                Financial authority who possesses delegation of power to sanction.
              </p>
            </Field>

            <Field label="Sanction Approval Authority" required>
              <input
                value={draft.internal.approvalAuthority}
                onChange={e => updateInternal('approvalAuthority', e.target.value)}
                className={inputClass}
                placeholder="Joint Secretary Sourcing"
              />
            </Field>
          </>
        )}

        <Field label="Purchase justification & compliance reason" className="sm:col-span-2" required>
          <textarea
            value={draft.internal.justification}
            onChange={e => updateInternal('justification', e.target.value)}
            rows={4}
            maxLength={1000}
            className={textareaClass}
            placeholder="State business justification, urgency reason, or GFR rule compliance justification..."
          />
        </Field>
      </div>

      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50">
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={draft.internal.budgetConfirmed}
            onChange={e => updateInternal('budgetConfirmed', e.target.checked)}
            className="h-5 w-5 rounded mt-0.5 accent-[#12335f]"
          />
          <div>
            <span className="text-xs font-black text-slate-800 uppercase tracking-wide">Confirm Budget Allocation & Sanction</span>
            <p className="text-[10px] text-slate-500 font-semibold mt-1">
              I verify that sufficient funds are allocated and sanctioned for this procurement purchase order under GFR/Corporate compliance guidelines.
            </p>
          </div>
        </label>
      </div>

      {/* Guidance Note Section */}
      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
        <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
          <Info className="h-3.5 w-3.5 text-[#12335f]" /> Guidance on Accounting Codes & Project References
        </h4>
        <div className="grid gap-4 md:grid-cols-3 text-[11px] text-slate-600 font-medium leading-relaxed">
          <div className="space-y-1">
            <span className="font-bold text-slate-800 uppercase text-[9px] tracking-wide block">Cost Center *</span>
            <p>
              An internal unit or department code (e.g., <code className="bg-slate-100/80 px-1 py-0.5 rounded text-slate-700 font-semibold">CC-MKTG-102</code>) responsible for the expense. Required for ERP routing and tracking department-level spending.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-bold text-slate-800 uppercase text-[9px] tracking-wide block">Budget Head / Code</span>
            <p>
              The specific budget category or ledger line item (e.g., <code className="bg-slate-100/80 px-1 py-0.5 rounded text-slate-700 font-semibold">BH-CAPEX-IT</code>) to deduct funds from. Standard for category-wise limit control.
            </p>
          </div>
          <div className="space-y-1">
            <span className="font-bold text-slate-800 uppercase text-[9px] tracking-wide block">Project Code Reference</span>
            <p>
              The unique code for a temporary project or initiative (e.g., <code className="bg-slate-100/80 px-1 py-0.5 rounded text-slate-700 font-semibold">PROJ-2026-CLOUD</code>). Used to aggregate and monitor total project expenditure.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 3 Form components: Items / Service / BOQ details
// ─────────────────────────────────────────────────────────────────────────────
function ItemsDetailsForm({
  draft,
  updateDraft,
  showItemDrawer,
  setShowItemDrawer,
  selectedItemForEdit,
  setSelectedItemForEdit
}: {
  draft: Draft;
  updateDraft: (updater: (current: Draft) => Draft) => void;
  showItemDrawer: boolean;
  setShowItemDrawer: (open: boolean) => void;
  selectedItemForEdit: ItemRow | null;
  setSelectedItemForEdit: (item: ItemRow | null) => void;
}) {
  const whatBuying = draft.basics.whatAreYouBuying;
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  const [uploadingFile, setUploadingFile] = useState(false);

  const handleSaveItemWithValidation = (item: ItemRow) => {
    const errs: Record<string, string> = {};
    if (!item.name.trim()) {
      errs.name = 'Item Name is required';
    } else if (item.name.length > 150) {
      errs.name = 'Item Name must be at most 150 characters';
    }

    if (!item.specification.trim()) {
      errs.specification = 'Item Description is required';
    } else if (item.specification.length > 500) {
      errs.specification = 'Item Description must be at most 500 characters';
    }

    const qty = Number(item.quantity);
    if (!item.quantity || isNaN(qty) || qty <= 0 || !Number.isInteger(qty)) {
      errs.quantity = 'Quantity must be a positive integer';
    } else if (String(qty).length > 9) {
      errs.quantity = 'Quantity must be at most 9 digits';
    }

    if (!item.unit) {
      errs.unit = 'Unit is required';
    }

    if (item.hsn_sac_code) {
      if (!/^\d+$/.test(item.hsn_sac_code)) {
        errs.hsn_sac_code = 'HSN/SAC Code must contain digits only';
      } else if (item.hsn_sac_code.length > 10) {
        errs.hsn_sac_code = 'HSN/SAC Code must be at most 10 digits';
      }
    }

    if (item.brand_preference && item.brand_preference.length > 100) {
      errs.brand_preference = 'Preferred Brand must be at most 100 characters';
    }

    if (Object.keys(errs).length > 0) {
      setValidationErrors(errs);
      toast.error('Please fix validation errors before saving.');
      return;
    }

    setValidationErrors({});
    handleSaveItem(item);
  };

  const handleItemFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedExtensions = ['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.png', '.jpg', '.jpeg'];
    const extension = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
    if (!allowedExtensions.includes(extension)) {
      toast.error('Invalid file type. Allowed: PDF, DOC, DOCX, XLS, XLSX, PNG, JPG, JPEG');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      toast.error('File size must be 5MB or less');
      return;
    }

    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', 'procurement_draft');
      const response = await api.fetch('/api/files/upload', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const resData = await unwrap<any>(response);
      const asset = resData.file || resData;
      const fileId = Number(resData.fileId || asset.id || 0);

      if (selectedItemForEdit) {
        setSelectedItemForEdit({
          ...selectedItemForEdit,
          fileAssetId: fileId,
          specificationFileName: asset.originalName || file.name
        });
      }
      toast.success('Technical Specs uploaded successfully');
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || 'Failed to upload file');
    } finally {
      setUploadingFile(false);
    }
  };

  // Item list handlers
  const handleSaveItem = (item: ItemRow) => {
    updateDraft(current => {
      const idx = current.items.findIndex(i => i.id === item.id);
      const nextItems = [...current.items];
      if (idx >= 0) {
        nextItems[idx] = item;
      } else {
        nextItems.push(item);
      }
      return {
        ...current,
        items: nextItems
      };
    });
    toast.success('Item details saved');
    setShowItemDrawer(false);
    setSelectedItemForEdit(null);
  };

  const handleAddNewItem = () => {
    setSelectedItemForEdit({
      id: makeId(),
      name: '',
      specification: '',
      quantity: 1,
      unit: 'Nos',
      unitPrice: 0,
      gst: 18,
      deliveryDate: nextFortnight,
      brandPolicy: 'Equivalent allowed',
      technicalSpecification: '',
      specificationFileName: '',
      hsn_sac_code: '',
      brand_preference: '',
      brand_flexible: 'Yes',
      fileAssetId: null,
    });
    setShowItemDrawer(true);
  };

  const handleRemoveItem = (id: string) => {
    updateDraft(current => {
      const nextItems = current.items.filter(item => item.id !== id);
      return {
        ...current,
        items: nextItems
      };
    });
  };

  // Service details handlers
  const updateService = (key: keyof Draft['serviceDetails'], val: string) => {
    updateDraft(current => ({
      ...current,
      serviceDetails: { ...current.serviceDetails, [key]: val }
    }));
  };

  const handleBOQUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('entityType', 'procurement_draft');
      const response = await api.fetch('/api/files/upload', {
        method: 'POST',
        headers: authHeaders(),
        body: formData,
      });
      const resData = await unwrap<any>(response);
      const asset = resData.file || resData;
      const fileId = Number(resData.fileId || asset.id || 0);

      updateDraft(c => ({
        ...c,
        boqFileAssetId: fileId,
        boqFileName: asset.originalName || file.name
      }));
      toast.success('BOQ file uploaded successfully');
    } catch (err: any) {
      toast.error(err.message || 'Failed to upload BOQ');
    } finally {
      setUploadingFile(false);
    }
  };

  // BOQ Handlers
  const handleAddBOQRow = () => {
    updateDraft(c => {
      const nextTable = [...c.boqTable, {
        srNo: c.boqTable.length + 1,
        description: '',
        category: 'General',
        quantity: 1,
        uom: 'Nos',
        estimatedRate: 0,
        taxPercent: 18,
        total: 0,
        remarks: ''
      }];
      const sum = nextTable.reduce((acc, r) => acc + (r.quantity * r.estimatedRate), 0);
      return { ...c, boqTable: nextTable, basics: { ...c.basics, estimatedValue: sum } };
    });
  };

  const handleBOQDuplicateRow = (idx: number) => {
    updateDraft(c => {
      const target = c.boqTable[idx];
      const nextTable = [...c.boqTable];
      nextTable.splice(idx + 1, 0, {
        ...target,
        srNo: nextTable.length + 1
      });
      const reindexed = nextTable.map((row, i) => ({ ...row, srNo: i + 1 }));
      const sum = reindexed.reduce((acc, r) => acc + (r.quantity * r.estimatedRate), 0);
      return { ...c, boqTable: reindexed, basics: { ...c.basics, estimatedValue: sum } };
    });
  };

  const handleRemoveBOQRow = (idx: number) => {
    updateDraft(c => {
      const nextTable = c.boqTable.filter((_, i) => i !== idx).map((row, i) => ({ ...row, srNo: i + 1 }));
      const sum = nextTable.reduce((acc, r) => acc + (r.quantity * r.estimatedRate), 0);
      return { ...c, boqTable: nextTable, basics: { ...c.basics, estimatedValue: sum } };
    });
  };

  const handleBOQCellChange = (idx: number, key: keyof BOQRow, val: any) => {
    updateDraft(c => {
      const nextTable = [...c.boqTable];
      const row = { ...nextTable[idx], [key]: val } as BOQRow;
      if (key === 'quantity' || key === 'estimatedRate' || key === 'taxPercent') {
        const qty = Number(key === 'quantity' ? val : row.quantity || 0);
        const rate = Number(key === 'estimatedRate' ? val : row.estimatedRate || 0);
        const tax = Number(key === 'taxPercent' ? val : row.taxPercent || 0);
        row.total = qty * rate * (1 + tax / 100);
      }
      nextTable[idx] = row;
      const sum = nextTable.reduce((acc, r) => acc + (r.quantity * r.estimatedRate), 0);
      return { ...c, boqTable: nextTable, basics: { ...c.basics, estimatedValue: sum } };
    });
  };

  // 1. BOQ Table Mode
  if (whatBuying === 'BOQ') {
    return (
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 pb-2.5 gap-2">
          <div>
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">Structured Bill of Quantities (BOQ)</h3>
            <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Invite quotes using a itemized spreadsheet schedule</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                toast.info('Downloading BOQ Excel Template...');
              }}
              className="h-8 text-xs font-bold text-slate-700"
            >
              Download Template
            </Button>
            
            <div className="relative">
              <input
                type="file"
                id="boq-upload"
                accept=".xls,.xlsx,.csv"
                onChange={handleBOQUpload}
                className="hidden"
                disabled={uploadingFile}
              />
              <label
                htmlFor="boq-upload"
                className={cn(
                  "cursor-pointer inline-flex items-center justify-center h-8 px-3 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-xs font-bold text-slate-700 transition-all",
                  uploadingFile && "opacity-50 pointer-events-none"
                )}
              >
                {uploadingFile ? 'Uploading...' : 'Upload BOQ'}
              </label>
            </div>
          </div>
        </div>

        {draft.boqFileName && (
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-800 bg-emerald-50 border border-emerald-100 p-2 rounded-lg max-w-md animate-fadeIn">
            <span>Uploaded BOQ: <strong>{draft.boqFileName}</strong></span>
            <button
              type="button"
              onClick={() => updateDraft(c => ({ ...c, boqFileName: '', boqFileAssetId: null }))}
              className="text-rose-500 hover:text-rose-700 font-bold ml-auto"
            >
              Remove
            </button>
          </div>
        )}

        {/* Use BOQTable Component from Loop 3 */}
        <BOQTable
          rows={draft.boqTable}
          onChange={handleBOQCellChange}
          onAddRow={handleAddBOQRow}
          onDuplicateRow={handleBOQDuplicateRow}
          onDeleteRow={handleRemoveBOQRow}
          estimatedTotal={draft.basics.estimatedValue}
        />
      </div>
    );
  }

  // 2. Service SOW Mode
  if (whatBuying === 'Service') {
    return (
      <div className="space-y-6">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2">Service Contract Parameters</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Service Contract Title" required className="sm:col-span-2">
            <input
              value={draft.serviceDetails.serviceTitle}
              onChange={e => updateService('serviceTitle', e.target.value)}
              className={inputClass}
              placeholder="e.g. Annual Support Services..."
            />
          </Field>

          <Field label="Scope of Work (SOW)" required className="sm:col-span-2">
            <textarea
              value={draft.serviceDetails.scopeOfWork}
              onChange={e => updateService('scopeOfWork', e.target.value)}
              rows={4}
              className={textareaClass}
              placeholder="Provide detail out tasks, milestones, deliverables, requirements..."
            />
          </Field>

          <Field label="Key Deliverables" required>
            <textarea
              value={draft.serviceDetails.deliverables}
              onChange={e => updateService('deliverables', e.target.value)}
              rows={3}
              className={textareaClass}
              placeholder="Reports, uptime, outcomes..."
            />
          </Field>

          <Field label="Exclusions / Inclusions">
            <textarea
              value={draft.serviceDetails.exclusions}
              onChange={e => updateService('exclusions', e.target.value)}
              rows={3}
              className={textareaClass}
              placeholder="Resources or tools not included in bidding scope..."
            />
          </Field>

          <Field label="SLA response time">
            <input
              value={draft.serviceDetails.slaResponseTime}
              onChange={e => updateService('slaResponseTime', e.target.value)}
              className={inputClass}
              placeholder="e.g. 4 hours response, 24 hours resolution"
            />
          </Field>

          <Field label="Service Duration" required>
            <input
              value={draft.serviceDetails.duration}
              onChange={e => updateService('duration', e.target.value)}
              className={inputClass}
              placeholder="e.g. 1 Year, 6 Months"
            />
          </Field>

          <Field label="Manpower Count required">
            <input
              type="number"
              value={draft.serviceDetails.manpowerRequired}
              onChange={e => updateService('manpowerRequired', e.target.value)}
              className={inputClass}
            />
          </Field>

          <Field label="Penalty terms for delay">
            <input
              value={draft.serviceDetails.penaltyClause}
              onChange={e => updateService('penaltyClause', e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </div>
    );
  }

  // 3. Product Mode
  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">Line Items Schedule</h3>
          <p className="text-[10px] text-slate-500 font-semibold mt-0.5">Specify products or items to buy.</p>
        </div>
        <Button type="button" size="sm" onClick={handleAddNewItem} className="h-8.5 font-bold">
          <Plus className="h-4 w-4 mr-1" /> Add Product Item
        </Button>
      </div>

      <div className="overflow-x-auto border border-slate-200 rounded-lg">
        <table className="w-full min-w-[800px] border-collapse text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-black uppercase text-slate-500 border-b border-slate-200">
            <tr>
              <th className="px-3 py-2.5">Item Name</th>
              <th className="px-3 py-2.5">Description</th>
              <th className="px-3 py-2.5 w-24">Quantity</th>
              <th className="px-3 py-2.5 w-24">Unit</th>
              <th className="px-3 py-2.5 w-28">HSN/SAC</th>
              <th className="px-3 py-2.5 w-32">Pref. Brand</th>
              <th className="px-3 py-2.5 w-24">Flexible?</th>
              <th className="px-3 py-2.5 w-36">Technical Specs</th>
              <th className="px-3 py-2.5 w-24 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
            {draft.items.length === 0 ? (
              <tr>
                <td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <Package className="h-8 w-8 text-slate-350" />
                    <p className="text-xs font-bold text-slate-500">No items added yet</p>
                    <p className="text-[10px] text-slate-400 font-semibold">Click the &quot;Add Product Item&quot; button above to specify your procurement items.</p>
                  </div>
                </td>
              </tr>
            ) : (
              draft.items.map(item => {
                return (
                  <tr key={item.id} className="align-middle hover:bg-slate-50/50">
                    <td className="px-3 py-3 font-extrabold text-slate-900">{item.name || <span className="text-rose-500">Unnamed Item</span>}</td>
                    <td className="px-3 py-3 text-slate-450 truncate max-w-[180px] font-medium" title={item.specification}>{item.specification || 'No spec set'}</td>
                    <td className="px-3 py-3">{item.quantity}</td>
                    <td className="px-3 py-3">{item.unit}</td>
                    <td className="px-3 py-3 font-medium text-slate-500">{item.hsn_sac_code || '—'}</td>
                    <td className="px-3 py-3 font-medium text-slate-700">{item.brand_preference || '—'}</td>
                    <td className="px-3 py-3 font-bold">
                      {item.brand_flexible === 'No' ? (
                        <span className="text-amber-600 bg-amber-50/10 border border-amber-200/30 px-1.5 py-0.5 rounded text-[9px] uppercase font-black">No</span>
                      ) : (
                        <span className="text-emerald-750 bg-emerald-50/10 border border-emerald-250/20 px-1.5 py-0.5 rounded text-[9px] uppercase font-black">Yes</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      {item.specificationFileName ? (
                        <a
                          href={`/api/files/${item.fileAssetId}/view`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center text-[#12335f] hover:underline gap-1 text-[11px] font-bold"
                        >
                          <FileText className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate max-w-[80px]" title={item.specificationFileName}>
                            {item.specificationFileName}
                          </span>
                        </a>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-right space-x-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedItemForEdit(item);
                          setValidationErrors({});
                          setShowItemDrawer(true);
                        }}
                        className="text-[#12335f] hover:underline text-[10px] uppercase font-bold"
                      >
                        Edit
                      </button>
                      <span className="text-slate-200">|</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveItem(item.id)}
                        className="text-rose-500 hover:underline text-[10px] uppercase font-bold"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="text-right font-extrabold text-[#12335f] text-sm bg-slate-50 border border-slate-200 rounded-lg p-3">
        Total Estimated Value: {new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(draft.basics.estimatedValue)}
      </div>

      {/* Edit Drawer Overlay */}
      {showItemDrawer && selectedItemForEdit && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex justify-end z-[9999]">
          <div className="w-full max-w-md bg-white h-full shadow-2xl p-6 overflow-y-auto flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-5">
                <h3 className="text-sm font-black text-slate-950 uppercase tracking-wide">Item Specifications</h3>
                <button type="button" onClick={() => setShowItemDrawer(false)} className="p-1 rounded-full hover:bg-slate-50"><X className="h-5 w-5" /></button>
              </div>

              <div className="space-y-4">
                <Field label="Item / Product Name" required>
                  <input
                    value={selectedItemForEdit.name}
                    onChange={e => {
                      setSelectedItemForEdit({ ...selectedItemForEdit, name: e.target.value });
                      if (validationErrors.name) setValidationErrors(prev => ({ ...prev, name: '' }));
                    }}
                    className={cn(inputClass, validationErrors.name && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15")}
                    placeholder="Dell Latitude 7440, Office Desk, etc."
                    maxLength={150}
                  />
                  {validationErrors.name && (
                    <p className="text-[10px] font-bold text-rose-600 mt-1">{validationErrors.name}</p>
                  )}
                </Field>

                <Field label="Item Description specs / details (Internal)" required>
                  <textarea
                    value={selectedItemForEdit.specification}
                    onChange={e => {
                      setSelectedItemForEdit({ ...selectedItemForEdit, specification: e.target.value });
                      if (validationErrors.specification) setValidationErrors(prev => ({ ...prev, specification: '' }));
                    }}
                    rows={3}
                    className={cn(textareaClass, validationErrors.specification && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15")}
                    placeholder="e.g. 16GB RAM, 512GB SSD, Windows 11 Pro, 3 Years Onsite Warranty"
                    maxLength={500}
                  />
                  {validationErrors.specification && (
                    <p className="text-[10px] font-bold text-rose-600 mt-1">{validationErrors.specification}</p>
                  )}
                </Field>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="Quantity" required>
                    <input
                      type="number"
                      min={1}
                      value={selectedItemForEdit.quantity}
                      onChange={e => {
                        setSelectedItemForEdit({ ...selectedItemForEdit, quantity: Number(e.target.value || 1) });
                        if (validationErrors.quantity) setValidationErrors(prev => ({ ...prev, quantity: '' }));
                      }}
                      className={cn(inputClass, validationErrors.quantity && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15")}
                    />
                    {validationErrors.quantity && (
                      <p className="text-[10px] font-bold text-rose-600 mt-1">{validationErrors.quantity}</p>
                    )}
                  </Field>
                  <Field label="Unit (UOM)" required>
                    <select
                      value={selectedItemForEdit.unit}
                      onChange={e => {
                        setSelectedItemForEdit({ ...selectedItemForEdit, unit: e.target.value });
                        if (validationErrors.unit) setValidationErrors(prev => ({ ...prev, unit: '' }));
                      }}
                      className={cn(inputClass, validationErrors.unit && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15")}
                    >
                      {QUANTITY_UNITS.map((u: any) => <option key={u.value} value={u.value}>{u.label}</option>)}
                    </select>
                    {validationErrors.unit && (
                      <p className="text-[10px] font-bold text-rose-600 mt-1">{validationErrors.unit}</p>
                    )}
                  </Field>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <Field label="HSN / SAC Code">
                    <input
                      value={selectedItemForEdit.hsn_sac_code || ''}
                      onChange={e => {
                        setSelectedItemForEdit({ ...selectedItemForEdit, hsn_sac_code: e.target.value });
                        if (validationErrors.hsn_sac_code) setValidationErrors(prev => ({ ...prev, hsn_sac_code: '' }));
                      }}
                      className={cn(inputClass, validationErrors.hsn_sac_code && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15")}
                      placeholder="e.g. 847130"
                      maxLength={10}
                    />
                    {validationErrors.hsn_sac_code && (
                      <p className="text-[10px] font-bold text-rose-600 mt-1">{validationErrors.hsn_sac_code}</p>
                    )}
                  </Field>
                  <Field label="Preferred Brand">
                    <input
                      value={selectedItemForEdit.brand_preference || ''}
                      onChange={e => {
                        setSelectedItemForEdit({ ...selectedItemForEdit, brand_preference: e.target.value });
                        if (validationErrors.brand_preference) setValidationErrors(prev => ({ ...prev, brand_preference: '' }));
                      }}
                      className={cn(inputClass, validationErrors.brand_preference && "border-rose-500 focus:border-rose-500 focus:ring-rose-500/15")}
                      placeholder="e.g. Dell, HP"
                      maxLength={100}
                    />
                    {validationErrors.brand_preference && (
                      <p className="text-[10px] font-bold text-rose-600 mt-1">{validationErrors.brand_preference}</p>
                    )}
                  </Field>
                </div>

                <Field label="Are alternate brands allowed? (Brand Flexibility)">
                  <select
                    value={selectedItemForEdit.brand_flexible || 'Yes'}
                    onChange={e => setSelectedItemForEdit({ ...selectedItemForEdit, brand_flexible: e.target.value })}
                    className={inputClass}
                  >
                    <option value="Yes">Yes (Alternate brands allowed)</option>
                    <option value="No">No (Strict brand lock, no alternates)</option>
                  </select>
                </Field>

                <Field label="Technical Specs File Attachment">
                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <input
                        type="file"
                        id="item-file-upload"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg"
                        onChange={handleItemFileChange}
                        className="hidden"
                      />
                      <label
                        htmlFor="item-file-upload"
                        className={cn(
                          "cursor-pointer inline-flex items-center justify-center gap-1.5 h-10 px-4 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 transition-all",
                          uploadingFile && "opacity-50 pointer-events-none"
                        )}
                      >
                        {uploadingFile ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin text-slate-500" />
                            <span>Uploading...</span>
                          </>
                        ) : (
                          <>
                            <Upload className="h-4 w-4 text-slate-500" />
                            <span>Choose Spec File</span>
                          </>
                        )}
                      </label>
                      <span className="text-[10px] text-slate-500">PDF, DOC, XLS or Image up to 5MB</span>
                    </div>

                    {selectedItemForEdit.specificationFileName && (
                      <div className="flex items-center justify-between rounded-lg border border-emerald-100 bg-emerald-50/50 p-2.5 text-xs font-semibold text-slate-800 animate-fadeIn">
                        <div className="flex items-center gap-2 min-w-0">
                          <FileText className="h-4 w-4 shrink-0 text-emerald-600" />
                          <span className="truncate max-w-[220px]" title={selectedItemForEdit.specificationFileName}>
                            {selectedItemForEdit.specificationFileName}
                          </span>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedItemForEdit({
                              ...selectedItemForEdit,
                              fileAssetId: null,
                              specificationFileName: ''
                            });
                          }}
                          className="p-1 rounded text-rose-500 hover:bg-rose-50 transition-all ml-2"
                          title="Remove file"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    )}
                  </div>
                </Field>
              </div>
            </div>

            <div className="border-t border-slate-100 pt-4 flex gap-2">
              <Button variant="outline" onClick={() => setShowItemDrawer(false)} className="w-1/2">Cancel</Button>
              <Button
                type="button"
                onClick={() => handleSaveItemWithValidation(selectedItemForEdit)}
                className="w-1/2 bg-[#12335f] text-white hover:bg-[#0b2445]"
              >
                Save Item
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 4 Form components: Supplier Selection
// ─────────────────────────────────────────────────────────────────────────────
function VendorsStepForm({
  draft,
  updateDraft
}: {
  draft: Draft;
  updateDraft: (updater: (current: Draft) => Draft) => void;
}) {
  const [sellers, setSellers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [msmeOnly, setMsmeOnly] = useState(false);

  const fetchSellersList = () => {
    setLoading(true);
    const params: Record<string, string | number> = { pageSize: 50 };
    if (search) params.q = search;
    marketplaceApi.getSellers(params)
      .then(res => {
        // Map API response to Supplier interface
        const items = (res?.sellers || []).map((s: any) => ({
          id: s.id || s.sellerUserId,
          organizationName: s.organizationName || s.name || 'Vendor',
          msmeCategory: s.msmeCategory || 'General',
          officeCity: s.officeCity || s.city || 'N/A',
          rating: s.rating || '4.0',
          pastOrdersCount: s.pastOrdersCount || 0,
          onTimeDeliveryRate: s.onTimeDeliveryRate || 95,
          gstVerified: true
        }));
        setSellers(items);
      })
      .catch(err => console.error(err))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchSellersList();
  }, [search]);

  const toggleInviteSeller = (id: number, name: string) => {
    updateDraft(current => {
      const invited = current.vendors.invitedSellers || [];
      const exists = invited.includes(id);
      let nextInvites = [...invited];
      if (exists) {
        nextInvites = nextInvites.filter(x => x !== id);
      } else {
        nextInvites.push(id);
      }
      return {
        ...current,
        vendors: {
          ...current.vendors,
          invitedSellers: nextInvites,
          selectedSellerId: nextInvites[0] || null,
          selectedSellerName: nextInvites[0] ? name : '',
        }
      };
    });
  };

  useEffect(() => {
    const isLimited = draft.type === 'LIMITED_TENDER' || (draft.type === 'RFQ' && draft.rfqType === 'LIMITED');
    if (isLimited && draft.vendors.selection !== 'Selected') {
      updateDraft(c => ({ ...c, vendors: { ...c.vendors, selection: 'Selected' } }));
    }
  }, [draft.type, draft.rfqType, draft.vendors.selection]);

  const handleSelectionModeChange = (mode: 'Open' | 'Selected' | 'Category' | 'Past') => {
    updateDraft(c => ({
      ...c,
      vendors: { ...c.vendors, selection: mode }
    }));
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Supplier Sourcing Strategy" required>
          {draft.type === 'LIMITED_TENDER' || (draft.type === 'RFQ' && draft.rfqType === 'LIMITED') ? (
            <div className="h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center text-sm font-semibold text-slate-700 select-none">
              Invite selected verified suppliers pool (Locked for Limited methods)
            </div>
          ) : (
            <select
              value={draft.vendors.selection}
              onChange={e => handleSelectionModeChange(e.target.value as any)}
              className={inputClass}
            >
              <option value="Open">Open Advertised / Public Sourcing</option>
              <option value="Selected">Invite selected verified suppliers pool</option>
              <option value="Category">Invite category-matched registered vendors</option>
              <option value="Past">Invite prior order vendors</option>
            </select>
          )}
        </Field>

        <Field label="Minimum Sourcing bids required">
          <input
            type="number"
            value={draft.schedule.minimumBidders || 3}
            onChange={e => updateDraft(c => ({ ...c, schedule: { ...c.schedule, minimumBidders: Number(e.target.value || 3) } }))}
            className={inputClass}
          />
        </Field>
      </div>

      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">MSME & Preference Parameters</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.vendors.msmePreference}
              onChange={e => updateDraft(c => ({ ...c, vendors: { ...c.vendors, msmePreference: e.target.checked } }))}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>MSME pricing preference?</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.vendors.localVendorPreference}
              onChange={e => updateDraft(c => ({ ...c, vendors: { ...c.vendors, localVendorPreference: e.target.checked } }))}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>Local supplier preference?</span>
          </label>

          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.vendors.excludeBlacklisted}
              onChange={e => updateDraft(c => ({ ...c, vendors: { ...c.vendors, excludeBlacklisted: e.target.checked } }))}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>Auto-exclude blacklisted?</span>
          </label>
        </div>
      </div>

      {draft.vendors.selection !== 'Open' && (
        <SupplierSelector
          suppliers={sellers}
          invitedIds={draft.vendors.invitedSellers}
          onToggleInvite={toggleInviteSeller}
          isLoading={loading}
          searchQuery={search}
          onSearchChange={setSearch}
          msmeOnly={msmeOnly}
          onMsmeOnlyChange={setMsmeOnly}
        />
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 5 Form components: Timeline rules & deadlines
// ─────────────────────────────────────────────────────────────────────────────
function ScheduleStepForm({
  draft,
  updateDraft
}: {
  draft: Draft;
  updateDraft: (updater: (current: Draft) => Draft) => void;
}) {
  const isGov = draft.basics.buyerType === 'GOVERNMENT_BUYER';
  const isTwoPacket = draft.schedule.packetType === 'Two';
  const isAuction = isReverseAuctionMethod(draft.type);
  const isRateContract = isRateContractMethod(draft.type);

  const updateSchedule = (key: keyof Draft['schedule'], val: any) => {
    updateDraft(c => ({ ...c, schedule: { ...c.schedule, [key]: val } }));
  };
  const updateAuction = <K extends keyof AuctionConfig>(key: K, val: AuctionConfig[K]) => {
    updateDraft(c => ({ ...c, auctionConfig: { ...c.auctionConfig, [key]: val } }));
  };
  const updateTrigger = <K extends keyof AuctionConfig['triggerConfiguration']>(
    key: K,
    val: AuctionConfig['triggerConfiguration'][K]
  ) => {
    updateDraft(c => ({
      ...c,
      auctionConfig: {
        ...c.auctionConfig,
        triggerConfiguration: { ...c.auctionConfig.triggerConfiguration, [key]: val },
      },
    }));
  };
  const updateMonitor = <K extends keyof AuctionConfig['buyerMonitorSettings']>(
    key: K,
    val: AuctionConfig['buyerMonitorSettings'][K]
  ) => {
    updateDraft(c => ({
      ...c,
      auctionConfig: {
        ...c.auctionConfig,
        buyerMonitorSettings: { ...c.auctionConfig.buyerMonitorSettings, [key]: val },
      },
    }));
  };
  const updateRateContract = <K extends keyof RateContractConfig>(key: K, val: RateContractConfig[K]) => {
    updateDraft(c => ({ ...c, rateContractConfig: { ...c.rateContractConfig, [key]: val } }));
  };
  const updateRateItem = <K extends keyof RateContractItem>(id: string, key: K, val: RateContractItem[K]) => {
    updateDraft(c => ({
      ...c,
      rateContractConfig: {
        ...c.rateContractConfig,
        itemRateSchedule: c.rateContractConfig.itemRateSchedule.map(item => item.id === id ? { ...item, [key]: val } : item),
      },
    }));
  };
  const addRateItem = () => {
    updateDraft(c => ({
      ...c,
      rateContractConfig: {
        ...c.rateContractConfig,
        itemRateSchedule: [
          ...c.rateContractConfig.itemRateSchedule,
          {
            id: makeId(),
            itemName: '',
            specification: '',
            uom: 'Nos',
            estimatedAnnualQuantity: 1,
            baseRate: 0,
            gst: 18,
            discount: 0,
            slabPricingEnabled: false,
            slabPricing: [],
          },
        ],
      },
    }));
  };
  const removeRateItem = (id: string) => {
    updateDraft(c => ({
      ...c,
      rateContractConfig: {
        ...c.rateContractConfig,
        itemRateSchedule: c.rateContractConfig.itemRateSchedule.filter(item => item.id !== id),
      },
    }));
  };

  // Warnings collection
  const warnings: string[] = [];
  if (draft.schedule.submissionDate && draft.schedule.submissionStartDate) {
    if (new Date(draft.schedule.submissionDate) <= new Date(draft.schedule.submissionStartDate)) {
      warnings.push('Submission closing date must be schedule after submission start date.');
    }
  }
  if (draft.basics.isTechnicalEvaluationNeeded && draft.schedule.technicalOpeningDate && draft.schedule.submissionDate) {
    if (new Date(draft.schedule.technicalOpeningDate) < new Date(draft.schedule.submissionDate)) {
      warnings.push('Technical opening date cannot be scheduled before submission deadline.');
    }
  }
  if (isTwoPacket && draft.schedule.financialOpeningDate && draft.schedule.technicalOpeningDate) {
    if (new Date(draft.schedule.financialOpeningDate) < new Date(draft.schedule.technicalOpeningDate)) {
      warnings.push('Financial opening date must be scheduled on or after technical envelope opening.');
    }
  }

  return (
    <div className="space-y-6">
      {warnings.length > 0 && (
        <div className="border border-rose-250 bg-rose-50 text-rose-800 p-4 rounded-xl text-xs space-y-1.5">
          <div className="flex items-center gap-1.5 font-bold uppercase tracking-wider text-rose-955">
            <Info className="h-4.5 w-4.5" /> Sourcing Validation Warning
          </div>
          <ul className="list-disc list-inside font-semibold space-y-0.5">
            {warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      )}

      {isAuction && (
        <div className="border border-indigo-200 rounded-xl p-4 bg-indigo-50/40 space-y-4">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">Reverse Auction Configuration</h3>
            <p className="text-[11px] text-slate-600 font-semibold mt-1">
              Saved auction rules are shown to qualified sellers and used by live bidding.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Auction Number">
              <input value={draft.auctionConfig.auctionNumber} readOnly className={cn(inputClass, 'bg-slate-100 text-slate-500')} />
            </Field>
            <Field label="Procurement Method">
              <input value={draft.auctionConfig.procurementMethod} readOnly className={cn(inputClass, 'bg-slate-100 text-slate-500')} />
            </Field>
            <Field label="Auction Title" required>
              <input value={draft.auctionConfig.auctionTitle} onChange={e => updateAuction('auctionTitle', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Auction Description">
              <textarea value={draft.auctionConfig.auctionDescription} onChange={e => updateAuction('auctionDescription', e.target.value)} className={cn(inputClass, 'min-h-[76px]')} />
            </Field>
            <Field label="Auction Category">
              <input value={draft.auctionConfig.auctionCategory} onChange={e => updateAuction('auctionCategory', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Auction Subcategory">
              <input value={draft.auctionConfig.auctionSubCategory} onChange={e => updateAuction('auctionSubCategory', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Currency" required>
              <input value={draft.auctionConfig.currency} onChange={e => updateAuction('currency', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Estimated Value">
              <input value={draft.basics.estimatedValue || 0} readOnly className={cn(inputClass, 'bg-slate-100 text-slate-500')} />
            </Field>
            <Field label="Auction Status">
              <input value={draft.auctionConfig.auctionStatus} readOnly className={cn(inputClass, 'bg-slate-100 text-slate-500')} />
            </Field>
            <Field label="Buyer Organization">
              <input value={draft.auctionConfig.buyerOrganization} onChange={e => updateAuction('buyerOrganization', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Department">
              <input value={draft.auctionConfig.department} onChange={e => updateAuction('department', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Purchase Group">
              <input value={draft.auctionConfig.purchaseGroup} onChange={e => updateAuction('purchaseGroup', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Purchase Organization">
              <input value={draft.auctionConfig.purchaseOrganization} onChange={e => updateAuction('purchaseOrganization', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Auction Type" required>
              <select value={draft.auctionConfig.auctionType} onChange={e => updateAuction('auctionType', e.target.value as AuctionConfig['auctionType'])} className={inputClass}>
                <option value="ENGLISH_REVERSE">English Reverse</option>
                <option value="RANK_BASED_REVERSE">Rank Based Reverse</option>
              </select>
            </Field>
            <Field label="Auction Mode" required>
              <input value={draft.auctionConfig.auctionMode} readOnly className={cn(inputClass, 'bg-slate-100 text-slate-500')} />
            </Field>
            <Field label="Auction Start DateTime" required>
              <input type="datetime-local" value={draft.auctionConfig.startDateTime} onChange={e => updateAuction('startDateTime', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Auction End DateTime" required>
              <input type="datetime-local" value={draft.auctionConfig.endDateTime} onChange={e => updateAuction('endDateTime', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Auction Duration (Minutes)" required>
              <input type="number" min={1} value={draft.auctionConfig.durationMinutes || ''} onChange={e => updateAuction('durationMinutes', Number(e.target.value || 0))} className={inputClass} />
            </Field>
            <Field label="Starting Bid Price" required>
              <input type="number" min={0} value={draft.auctionConfig.startingBidPrice || ''} onChange={e => updateAuction('startingBidPrice', Number(e.target.value || 0))} className={inputClass} />
            </Field>
            <Field label="Reserve Price">
              <input type="number" min={0} value={draft.auctionConfig.reservePrice ?? ''} onChange={e => updateAuction('reservePrice', e.target.value ? Number(e.target.value) : null)} className={inputClass} />
            </Field>
            <Field label="Minimum Bid Decrement" required>
              <input type="number" min={0} value={draft.auctionConfig.minimumBidDecrement || ''} onChange={e => updateAuction('minimumBidDecrement', Number(e.target.value || 0))} className={inputClass} />
            </Field>
            <Field label="Rank Visibility" required>
              <select value={draft.auctionConfig.rankVisibility} onChange={e => updateAuction('rankVisibility', e.target.value as AuctionConfig['rankVisibility'])} className={inputClass}>
                <option value="SHOW_RANK_ONLY">Show Rank Only</option>
                <option value="SHOW_LOWEST_PRICE">Show Lowest Price</option>
                <option value="HIDDEN">Hidden</option>
              </select>
            </Field>
            <Field label="Minimum Qualified Bidders" required>
              <input
                type="number"
                min={2}
                value={draft.auctionConfig.minimumQualifiedBidders || ''}
                onChange={e => {
                  const value = Number(e.target.value || 0);
                  updateAuction('minimumQualifiedBidders', value);
                  updateSchedule('minimumBidders', value);
                }}
                className={inputClass}
              />
            </Field>
            <Field label="Auction Terms Document">
              <input value={draft.auctionConfig.termsDocumentName} onChange={e => updateAuction('termsDocumentName', e.target.value)} className={inputClass} placeholder="Document name or reference" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 border-t border-indigo-100 pt-4">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
              <input type="checkbox" checked={draft.auctionConfig.autoExtensionEnabled} onChange={e => updateAuction('autoExtensionEnabled', e.target.checked)} className="h-4 w-4 rounded accent-[#12335f]" />
              <span>Auto Extension Enabled?</span>
            </label>
            {draft.auctionConfig.autoExtensionEnabled && (
              <>
                <Field label="Extension Trigger Minutes" required>
                  <input type="number" min={1} value={draft.auctionConfig.extensionTriggerMinutes || ''} onChange={e => updateAuction('extensionTriggerMinutes', Number(e.target.value || 0))} className={inputClass} />
                </Field>
                <Field label="Extension Duration Minutes" required>
                  <input type="number" min={1} value={draft.auctionConfig.extensionDurationMinutes || ''} onChange={e => updateAuction('extensionDurationMinutes', Number(e.target.value || 0))} className={inputClass} />
                </Field>
                <Field label="Maximum Extensions" required>
                  <input type="number" min={1} value={draft.auctionConfig.maximumExtensions || ''} onChange={e => updateAuction('maximumExtensions', Number(e.target.value || 0))} className={inputClass} />
                </Field>
              </>
            )}
          </div>

          {draft.type === 'BID_WITH_REVERSE_AUCTION' && (
            <div className="grid gap-4 sm:grid-cols-2 border-t border-indigo-100 pt-4">
              <Field label="Auction Trigger Configuration" required>
                <select value={draft.auctionConfig.triggerConfiguration.trigger} onChange={e => updateTrigger('trigger', e.target.value as AuctionConfig['triggerConfiguration']['trigger'])} className={inputClass}>
                  <option value="AFTER_TECHNICAL_QUALIFICATION">After Technical Qualification</option>
                  <option value="TOP_N_BIDDERS">Among Top N Bidders</option>
                  <option value="ALL_TECHNICALLY_QUALIFIED">All Technically Qualified Bidders</option>
                </select>
              </Field>
              {draft.auctionConfig.triggerConfiguration.trigger === 'TOP_N_BIDDERS' && (
                <Field label="Top N Bidders" required>
                  <input type="number" min={2} value={draft.auctionConfig.triggerConfiguration.topN || ''} onChange={e => updateTrigger('topN', Number(e.target.value || 0))} className={inputClass} />
                </Field>
              )}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-3 border-t border-indigo-100 pt-4">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
              <input type="checkbox" checked={draft.auctionConfig.buyerMonitorSettings.showLiveRank} onChange={e => updateMonitor('showLiveRank', e.target.checked)} className="h-4 w-4 rounded accent-[#12335f]" />
              <span>Show Live Rank</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
              <input type="checkbox" checked={draft.auctionConfig.buyerMonitorSettings.alertOnReserveBreach} onChange={e => updateMonitor('alertOnReserveBreach', e.target.checked)} className="h-4 w-4 rounded accent-[#12335f]" />
              <span>Alert On Reserve Breach</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
              <input type="checkbox" checked={draft.auctionConfig.buyerMonitorSettings.allowManualExtension} onChange={e => updateMonitor('allowManualExtension', e.target.checked)} className="h-4 w-4 rounded accent-[#12335f]" />
              <span>Allow Manual Extension</span>
            </label>
          </div>
        </div>
      )}

      {isRateContract && (
        <div className="border border-teal-200 rounded-xl p-4 bg-teal-50/40 space-y-4">
          <div>
            <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide">Rate Contract Configuration</h3>
            <p className="text-[11px] text-slate-600 font-semibold mt-1">
              Define recurring purchase rates, validity, selected suppliers, and call-off order controls.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Rate Contract Number">
              <input value={draft.rateContractConfig.rateContractNumber} readOnly className={cn(inputClass, 'bg-slate-100 text-slate-500')} />
            </Field>
            <Field label="Contract Title" required>
              <input value={draft.rateContractConfig.contractTitle} onChange={e => updateRateContract('contractTitle', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Contract Description">
              <textarea value={draft.rateContractConfig.contractDescription} onChange={e => updateRateContract('contractDescription', e.target.value)} className={cn(inputClass, 'min-h-[76px]')} />
            </Field>
            <Field label="Contract Category">
              <input value={draft.rateContractConfig.contractCategory} onChange={e => updateRateContract('contractCategory', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Contract Subcategory">
              <input value={draft.rateContractConfig.contractSubCategory} onChange={e => updateRateContract('contractSubCategory', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Contract Start Date" required>
              <input type="date" value={draft.rateContractConfig.periodStartDate} onChange={e => updateRateContract('periodStartDate', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Contract End Date" required>
              <input type="date" value={draft.rateContractConfig.periodEndDate} onChange={e => updateRateContract('periodEndDate', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Rate Validity Period" required>
              <input value={draft.rateContractConfig.rateValidityPeriod} onChange={e => updateRateContract('rateValidityPeriod', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Supplier Selection Strategy" required>
              <select value={draft.rateContractConfig.supplierSelectionStrategy} onChange={e => updateRateContract('supplierSelectionStrategy', e.target.value as RateContractConfig['supplierSelectionStrategy'])} className={inputClass}>
                <option value="SINGLE_SUPPLIER">Single Supplier</option>
                <option value="MULTI_SUPPLIER">Multiple Suppliers</option>
                <option value="PANEL_RATE_CONTRACT">Panel Rate Contract</option>
                <option value="ITEM_WISE_L1">Item-wise L1</option>
              </select>
            </Field>
            <Field label="Selected Supplier(s)" required>
              <input
                value={`${draft.rateContractConfig.selectedSuppliers.length || draft.vendors.invitedSellers.length} supplier(s) selected from Supplier step`}
                readOnly
                className={cn(inputClass, 'bg-slate-100 text-slate-500')}
              />
            </Field>
          </div>

          <div className="rounded-lg border border-teal-100 bg-white p-3 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-[11px] font-black uppercase tracking-wide text-slate-800">Item / Rate Schedule</h4>
              <Button type="button" variant="outline" size="sm" onClick={addRateItem} className="h-8 text-[10px] font-black">
                <Plus className="mr-1 h-3.5 w-3.5" /> Add Item
              </Button>
            </div>
            <div className="space-y-3">
              {draft.rateContractConfig.itemRateSchedule.map(item => (
                <div key={item.id} className="rounded-lg border border-slate-200 p-3">
                  <div className="grid gap-3 md:grid-cols-4">
                    <Field label="Item Name" required>
                      <input value={item.itemName} onChange={e => updateRateItem(item.id, 'itemName', e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Specification">
                      <input value={item.specification} onChange={e => updateRateItem(item.id, 'specification', e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="UOM" required>
                      <input value={item.uom} onChange={e => updateRateItem(item.id, 'uom', e.target.value)} className={inputClass} />
                    </Field>
                    <Field label="Estimated Annual Quantity" required>
                      <input type="number" min={0} value={item.estimatedAnnualQuantity || ''} onChange={e => updateRateItem(item.id, 'estimatedAnnualQuantity', Number(e.target.value || 0))} className={inputClass} />
                    </Field>
                    <Field label="Base Rate" required>
                      <input type="number" min={0} value={item.baseRate || ''} onChange={e => updateRateItem(item.id, 'baseRate', Number(e.target.value || 0))} className={inputClass} />
                    </Field>
                    <Field label="GST %">
                      <input type="number" min={0} max={100} value={item.gst} onChange={e => updateRateItem(item.id, 'gst', Number(e.target.value || 0))} className={inputClass} />
                    </Field>
                    <Field label="Discount %">
                      <input type="number" min={0} max={100} value={item.discount} onChange={e => updateRateItem(item.id, 'discount', Number(e.target.value || 0))} className={inputClass} />
                    </Field>
                    <div className="flex items-end justify-between gap-2">
                      <label className="flex items-center gap-2 pb-2 text-xs font-semibold cursor-pointer select-none">
                        <input type="checkbox" checked={item.slabPricingEnabled} onChange={e => updateRateItem(item.id, 'slabPricingEnabled', e.target.checked)} className="h-4 w-4 rounded accent-[#12335f]" />
                        <span>Slab pricing optional</span>
                      </label>
                      <Button type="button" variant="ghost" size="sm" onClick={() => removeRateItem(item.id)} className="h-8 px-2 text-rose-700">
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              {draft.rateContractConfig.itemRateSchedule.length === 0 && (
                <p className="rounded-lg border border-dashed border-slate-300 p-4 text-xs font-semibold text-slate-500">
                  Add at least one item and rate for this contract.
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Price Variation Clause" required>
              <select value={draft.rateContractConfig.priceVariationClause} onChange={e => updateRateContract('priceVariationClause', e.target.value as RateContractConfig['priceVariationClause'])} className={inputClass}>
                <option value="FIXED_PRICE">Fixed Price</option>
                <option value="INDEX_BASED_VARIATION">Index-based Variation</option>
                <option value="MUTUALLY_AGREED_REVISION">Mutually Agreed Revision</option>
              </select>
            </Field>
            <label className="flex items-center gap-2 pt-6 text-xs font-semibold cursor-pointer select-none">
              <input type="checkbox" checked={draft.rateContractConfig.callOffOrderAllowed} onChange={e => updateRateContract('callOffOrderAllowed', e.target.checked)} className="h-4 w-4 rounded accent-[#12335f]" />
              <span>Call-off Order Allowed?</span>
            </label>
            {draft.rateContractConfig.callOffOrderAllowed && (
              <>
                <Field label="Maximum Order Quantity Per Call-off">
                  <input type="number" min={0} value={draft.rateContractConfig.maximumOrderQuantityPerCallOff || ''} onChange={e => updateRateContract('maximumOrderQuantityPerCallOff', Number(e.target.value || 0))} className={inputClass} />
                </Field>
                <Field label="Minimum Order Quantity">
                  <input type="number" min={0} value={draft.rateContractConfig.minimumOrderQuantity || ''} onChange={e => updateRateContract('minimumOrderQuantity', Number(e.target.value || 0))} className={inputClass} />
                </Field>
              </>
            )}
            <Field label="Delivery SLA" required>
              <input value={draft.rateContractConfig.deliverySla} onChange={e => updateRateContract('deliverySla', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Penalty Clause" required>
              <input value={draft.rateContractConfig.penaltyClause} onChange={e => updateRateContract('penaltyClause', e.target.value)} className={inputClass} />
            </Field>
            <label className="flex items-center gap-2 pt-6 text-xs font-semibold cursor-pointer select-none">
              <input type="checkbox" checked={draft.rateContractConfig.securityDepositRequired} onChange={e => updateRateContract('securityDepositRequired', e.target.checked)} className="h-4 w-4 rounded accent-[#12335f]" />
              <span>Security Deposit Required?</span>
            </label>
            {draft.rateContractConfig.securityDepositRequired && (
              <Field label="Security Deposit Amount" required>
                <input type="number" min={0} value={draft.rateContractConfig.securityDepositAmount || ''} onChange={e => updateRateContract('securityDepositAmount', Number(e.target.value || 0))} className={inputClass} />
              </Field>
            )}
            <label className="flex items-center gap-2 pt-6 text-xs font-semibold cursor-pointer select-none">
              <input type="checkbox" checked={draft.rateContractConfig.pbgRequired} onChange={e => updateRateContract('pbgRequired', e.target.checked)} className="h-4 w-4 rounded accent-[#12335f]" />
              <span>Performance Bank Guarantee Required?</span>
            </label>
            {draft.rateContractConfig.pbgRequired && (
              <Field label="PBG Amount" required>
                <input type="number" min={0} value={draft.rateContractConfig.pbgAmount || ''} onChange={e => updateRateContract('pbgAmount', Number(e.target.value || 0))} className={inputClass} />
              </Field>
            )}
            <Field label="Approval Workflow" required>
              <input value={draft.rateContractConfig.approvalWorkflow} onChange={e => updateRateContract('approvalWorkflow', e.target.value)} className={inputClass} />
            </Field>
            <Field label="Contract Document Upload">
              <input value={draft.rateContractConfig.contractDocument.fileName} onChange={e => updateRateContract('contractDocument', { ...draft.rateContractConfig.contractDocument, fileName: e.target.value })} className={inputClass} placeholder="Document name or uploaded file reference" />
            </Field>
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Packet envelope configuration" required>
          <select
            value={draft.schedule.packetType}
            onChange={e => updateSchedule('packetType', e.target.value as any)}
            className={inputClass}
          >
            <option value="Single">Single Packet Envelope (Commercial Only)</option>
            <option value="Two">Two Packet Envelope (Technical + Commercial Separated)</option>
          </select>
          <p className="text-[10px] text-slate-500 font-semibold mt-1">
            Single packet evaluates technical/commercial together. Two packet evaluates technical first, then opens commercial quotes for qualified bidders.
          </p>
        </Field>

        <Field label="Submission Start Date" required>
          <input
            type="date"
            value={draft.schedule.submissionStartDate}
            onChange={e => updateSchedule('submissionStartDate', e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Submission End Date (Deadline)" required>
          <input
            type="date"
            value={draft.schedule.submissionDate}
            onChange={e => updateSchedule('submissionDate', e.target.value)}
            className={inputClass}
          />
        </Field>

        <Field label="Bid Validity Period (Days)">
          <input
            type="number"
            value={draft.schedule.validityDays || 90}
            onChange={e => updateSchedule('validityDays', Number(e.target.value || 90))}
            className={inputClass}
          />
        </Field>

        {draft.basics.isTechnicalEvaluationNeeded && (
          <Field label="Technical Opening Date" required>
            <input
              type="date"
              value={draft.schedule.technicalOpeningDate}
              onChange={e => updateSchedule('technicalOpeningDate', e.target.value)}
              className={inputClass}
            />
            <p className="text-[10px] text-slate-500 font-semibold mt-1">
              Technical envelope unlocking date. Must be after submission closing.
            </p>
          </Field>
        )}

        {isTwoPacket && (
          <Field label="Financial Opening Date" required>
            <input
              type="date"
              value={draft.schedule.financialOpeningDate}
              onChange={e => updateSchedule('financialOpeningDate', e.target.value)}
              className={inputClass}
            />
            <p className="text-[10px] text-slate-500 font-semibold mt-1">
              Financial envelope unlocking date for technically qualified bidders. Must be after technical opening.
            </p>
          </Field>
        )}
      </div>

      <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 space-y-3">
        <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">Clarification & Visibility Rules</h3>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              checked={draft.schedule.clarificationAllowed}
              onChange={e => updateSchedule('clarificationAllowed', e.target.checked)}
              className="h-4 w-4 rounded accent-[#12335f]"
            />
            <span>Allow bidder clarifications?</span>
          </label>

          {draft.schedule.clarificationAllowed && (
            <Field label="Clarification Deadline Date">
              <input
                type="date"
                value={draft.schedule.clarificationDeadline}
                onChange={e => updateSchedule('clarificationDeadline', e.target.value)}
                className={inputClass}
              />
            </Field>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 6 Form components: Commercial Terms
// ─────────────────────────────────────────────────────────────────────────────
function CommercialTermsForm({
  draft,
  updateDraft
}: {
  draft: Draft;
  updateDraft: (updater: (current: Draft) => Draft) => void;
}) {
  const isGov = draft.basics.buyerType === 'GOVERNMENT_BUYER';
  const updateTerms = (key: keyof Draft['terms'], val: any) => {
    updateDraft(c => ({ ...c, terms: { ...c.terms, [key]: val } }));
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-6 md:grid-cols-2">
        {/* Pricing & Commercial terms card */}
        <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5 mb-2">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">Payment & Delivery Terms</h3>
          </div>

          <Field label="Payment terms" required>
            <select
              value={draft.terms.paymentTerms}
              onChange={e => updateTerms('paymentTerms', e.target.value)}
              className={inputClass}
            >
              {PAYMENT_TERMS.map((t: any) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          <Field label="Delivery terms location" required>
            <select
              value={draft.terms.deliveryTerms}
              onChange={e => updateTerms('deliveryTerms', e.target.value)}
              className={inputClass}
            >
              {DELIVERY_TYPES.map((t: any) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3 pt-1">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.terms.freightIncluded}
                onChange={e => updateTerms('freightIncluded', e.target.checked)}
                className="h-4 w-4 rounded accent-[#12335f]"
              />
              <span>Freight included?</span>
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
              <input
                type="checkbox"
                checked={draft.terms.gstIncluded}
                onChange={e => updateTerms('gstIncluded', e.target.checked)}
                className="h-4 w-4 rounded accent-[#12335f]"
              />
              <span>GST included in budget?</span>
            </label>
          </div>
        </div>

        {/* Guarantees card */}
        <div className="border border-slate-200 rounded-xl p-5 space-y-4 bg-white">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-2.5 mb-2">
            <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide">Guarantees & Compliance Fees</h3>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none mt-3.5">
                <input
                  type="checkbox"
                  checked={draft.terms.emdRequired}
                  onChange={e => updateTerms('emdRequired', e.target.checked)}
                  className="h-4 w-4 rounded accent-[#12335f]"
                />
                <span>EMD deposit required?</span>
              </label>

              {draft.terms.emdRequired && (
                <Field label="EMD Amount (INR)">
                  <input
                    type="number"
                    value={draft.terms.emdAmount || ''}
                    onChange={e => updateTerms('emdAmount', Number(e.target.value || 0))}
                    className={inputClass}
                  />
                </Field>
              )}
            </div>
            <p className="text-[10px] text-slate-500 font-semibold leading-normal">
              Earnest Money Deposit (Bid Security) ensures serious bidder participation.
            </p>
          </div>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none mt-3.5">
                <input
                  type="checkbox"
                  checked={draft.terms.pbgRequired}
                  onChange={e => updateTerms('pbgRequired', e.target.checked)}
                  className="h-4 w-4 rounded accent-[#12335f]"
                />
                <span>PBG Guarantee?</span>
              </label>

              <Field label="Document cost fee (INR)">
                <input
                  type="number"
                  value={draft.terms.documentFee || ''}
                  onChange={e => updateTerms('documentFee', Number(e.target.value || 0))}
                  className={inputClass}
                />
              </Field>
            </div>
            <p className="text-[10px] text-slate-500 font-semibold leading-normal">
              Performance Bank Guarantee secures contract delivery and warranty performance.
            </p>
          </div>

          <Field label="Late Delivery (LD) Penalty Clause" required>
            <input
              value={draft.terms.penaltyClause}
              onChange={e => updateTerms('penaltyClause', e.target.value)}
              className={inputClass}
            />
          </Field>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 7 Form components: Required Documents Checklist
// ─────────────────────────────────────────────────────────────────────────────
function DocumentsStepForm({
  draft,
  updateDraft
}: {
  draft: Draft;
  updateDraft: (updater: (current: Draft) => Draft) => void;
}) {
  const handleToggleDocRequired = (id: string) => {
    updateDraft(c => ({
      ...c,
      requiredDocs: c.requiredDocs.map(d => d.id === id ? { ...d, required: !d.required } : d)
    }));
  };

  const handleRemoveDoc = (id: string) => {
    updateDraft(c => ({
      ...c,
      requiredDocs: c.requiredDocs.filter(d => d.id !== id)
    }));
  };

  const handleAddCustomDoc = (name: string, required: boolean) => {
    updateDraft(c => ({
      ...c,
      requiredDocs: [
        ...c.requiredDocs,
        { id: makeId(), name, required, fileType: 'pdf', maxSize: 5, instructions: 'Additional custom document.' }
      ]
    }));
    toast.success('Custom document added to checklist');
  };

  return (
    <DocumentRequirementBuilder
      documents={draft.requiredDocs}
      onToggleRequired={handleToggleDocRequired}
      onRemove={handleRemoveDoc}
      onAddCustomDoc={handleAddCustomDoc}
    />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 8 Form components: Evaluation criteria weightages
// ─────────────────────────────────────────────────────────────────────────────
function EvaluationBasisForm({
  draft,
  updateDraft
}: {
  draft: Draft;
  updateDraft: (updater: (current: Draft) => Draft) => void;
}) {
  const updateEval = (key: keyof Draft['evaluation'], val: any) => {
    updateDraft(c => ({ ...c, evaluation: { ...c.evaluation, [key]: val } }));
  };

  const handleAddCriteria = () => {
    updateDraft(c => ({
      ...c,
      evaluation: {
        ...c.evaluation,
        technicalCriteria: [
          ...c.evaluation.technicalCriteria,
          { id: makeId(), name: '', description: '', maxScore: 20, weightage: 20, mandatory: false, minMarks: 0 }
        ]
      }
    }));
  };

  const handleRemoveCriteria = (id: string) => {
    updateDraft(c => ({
      ...c,
      evaluation: {
        ...c.evaluation,
        technicalCriteria: c.evaluation.technicalCriteria.filter(x => x.id !== id)
      }
    }));
  };

  const handleCriteriaChange = (id: string, key: keyof EvalCriteria, val: any) => {
    updateDraft(c => ({
      ...c,
      evaluation: {
        ...c.evaluation,
        technicalCriteria: c.evaluation.technicalCriteria.map(x => x.id === id ? { ...x, [key]: val } : x)
      }
    }));
  };

  const isQCBS = draft.evaluation.method === 'QCBS / weighted technical-commercial score';

  useEffect(() => {
    if (draft.type === 'RFI') {
      const rfiMethods = ['INFORMATION_ONLY', 'MARKET_CAPABILITY_REVIEW', 'TECHNICAL_FEASIBILITY_REVIEW'];
      if (!rfiMethods.includes(draft.evaluation.method)) {
        updateDraft(c => ({ ...c, evaluation: { ...c.evaluation, method: 'INFORMATION_ONLY' } }));
      }
    }
  }, [draft.type, draft.evaluation.method]);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Evaluation Method basis" required>
          <select
            value={draft.evaluation.method}
            onChange={e => updateEval('method', e.target.value)}
            className={inputClass}
          >
            {draft.type === 'RFI' ? (
              <>
                <option value="INFORMATION_ONLY">Information Only (Market Research)</option>
                <option value="MARKET_CAPABILITY_REVIEW">Market Capability Review</option>
                <option value="TECHNICAL_FEASIBILITY_REVIEW">Technical Feasibility Review</option>
              </>
            ) : (
              <>
                <option value="L1 total value">L1 Total Value basis</option>
                <option value="Item-wise L1">Item-wise L1 rates basis</option>
                <option value="Package-wise L1">Package-wise L1 rates basis</option>
                <option value="Technical qualification then L1">Technical Qualification then L1 Sourcing</option>
                <option value="QCBS / weighted technical-commercial score">Quality and Cost Based Selection (QCBS)</option>
                <option value="Reverse auction final rank">Reverse Auction Final Bid Rank</option>
                <option value="Lowest landed cost">Lowest Landed Cost</option>
              </>
            )}
          </select>
          <p className="text-[10px] text-slate-500 font-semibold mt-1">
            {draft.type === 'RFI' 
              ? 'RFI submissions are only evaluated for capability and feasibility review. Sourcing does not request commercial bids.' 
              : 'QCBS evaluates both technical capabilities (e.g. 70% weight) and commercial offer rates. L1 total value selects purely the lowest total landed cost.'}
          </p>
        </Field>

        {isQCBS && (
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tech weightage %">
              <input
                type="number"
                value={draft.evaluation.techWeight || 70}
                onChange={e => updateEval('techWeight', Number(e.target.value || 0))}
                className={inputClass}
              />
            </Field>
            <Field label="Financial weightage %">
              <input
                type="number"
                value={draft.evaluation.commWeight || 30}
                onChange={e => updateEval('commWeight', Number(e.target.value || 0))}
                className={inputClass}
              />
            </Field>
          </div>
        )}

        {draft.type === 'RFP' && (
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 text-xs font-semibold cursor-pointer select-none border border-slate-200 p-3 rounded-lg bg-slate-50/50">
              <input
                type="checkbox"
                checked={draft.requireDemo || false}
                onChange={e => updateDraft(c => ({ ...c, requireDemo: e.target.checked }))}
                className="h-4 w-4 rounded accent-[#12335f]"
              />
              <div>
                <span className="font-bold text-slate-800">Proposal presentation / Demo required?</span>
                <span className="block text-[10px] text-slate-500 font-medium mt-0.5">Require shortlisted bidders to present their solution/demo.</span>
              </div>
            </label>
          </div>
        )}
      </div>

      {draft.type === 'RFI' && (
        <div className="p-4 bg-amber-50 border border-amber-200 text-amber-800 rounded-xl text-xs font-semibold flex items-start gap-2.5 shadow-2xs mt-4">
          <span className="text-amber-600 text-sm shrink-0">⚠️</span>
          <div>
            <span className="text-amber-900 font-black uppercase text-[9px] tracking-wider block">RFI (Request for Information) Notice</span>
            <p className="mt-0.5 leading-relaxed text-amber-700 font-medium">
              RFIs are strictly for market research and vendor capability assessment. You cannot directly award a Purchase Order (PO) from an RFI. You must convert it to an RFQ, RFP, or Tender later to seek commercial bids.
            </p>
          </div>
        </div>
      )}

      {/* Render Criteria Builder */}
      <EvaluationCriteriaBuilder
        criteria={draft.evaluation.technicalCriteria}
        onChange={handleCriteriaChange}
        onAddRow={handleAddCriteria}
        onDeleteRow={handleRemoveCriteria}
        isQCBS={isQCBS}
      />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// STEP 9 Form components: Preview summary panels
// ─────────────────────────────────────────────────────────────────────────────
function PreviewPublishForm({
  draft,
  updateDraft,
  readiness
}: {
  draft: Draft;
  updateDraft: (updater: (current: Draft) => Draft) => void;
  readiness: Array<{ label: string; ok: boolean; severity: 'error' | 'warning' | 'info' }>;
}) {
  const isGov = draft.basics.buyerType === 'GOVERNMENT_BUYER';
  
  const approvalHandoff = isGov
    ? ['Requester Sourcing Officer', 'Department Head (DH)', 'Finance & Audit Team', 'Competent Authority (Sanction)', 'Govt Admin Audit']
    : ['Requester Sourcing Officer', 'Department Head (DH)', 'Finance Controller', 'Procurement Head Approval'];

  const errors = readiness.filter(r => r.severity === 'error');
  const warnings = readiness.filter(r => r.severity === 'warning');
  const infos = readiness.filter(r => r.severity === 'info');

  return (
    <div className="space-y-6">
      <h3 className="text-xs font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2 pl-0.5">Final Sourcing Summary</h3>

      {/* Sourcing summary panel from Loop 3 */}
      <ProcurementSummaryPanel
        title={draft.basics.title}
        buyerType={draft.basics.buyerType}
        method={draft.type}
        estimatedValue={draft.basics.estimatedValue}
        priority={draft.basics.priority}
        requiredBy={draft.basics.requiredByDate}
        location={draft.basics.deliveryLocation}
        itemsCount={draft.basics.whatAreYouBuying === 'BOQ' ? draft.boqTable.length : draft.items.length}
        suppliersCount={draft.vendors.invitedSellers.length}
        docsCount={draft.requiredDocs.length}
      />

      <div className="border border-slate-200 rounded-xl p-4 bg-white space-y-4">
        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide border-b border-slate-100 pb-2">Readiness & Validation Summary</h4>
        
        {/* Required Fields Section */}
        <div className="space-y-2">
          <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Required Sourcing Inputs</h5>
          <div className="grid gap-2 sm:grid-cols-2">
            {errors.map((r, idx) => (
              <div key={idx} className="flex items-center gap-2 text-xs font-semibold leading-normal">
                <span className={cn(
                  "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white text-[9px] font-black",
                  r.ok ? "bg-emerald-500" : "bg-rose-500"
                )}>
                  {r.ok ? '✓' : '✗'}
                </span>
                <span className={r.ok ? 'text-slate-700 font-medium' : 'text-rose-600 font-bold'}>{r.label}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Warnings Section */}
        {warnings.length > 0 && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Compliance Warnings & Advisories</h5>
            <div className="grid gap-2 sm:grid-cols-2">
              {warnings.map((r, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs font-semibold leading-normal">
                  <span className={cn(
                    "flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-white text-[9px] font-black",
                    r.ok ? "bg-emerald-500" : "bg-amber-500"
                  )}>
                    {r.ok ? '✓' : '!'}
                  </span>
                  <span className={r.ok ? 'text-slate-700 font-medium' : 'text-amber-600 font-bold'}>{r.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Custom Overrides Section */}
        {infos.length > 0 && (
          <div className="border-t border-slate-100 pt-3 space-y-2">
            <h5 className="text-[10px] font-black text-slate-500 uppercase tracking-wider">Sourcing Customizations</h5>
            <div className="grid gap-2 sm:grid-cols-2">
              {infos.map((r, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs font-semibold leading-normal">
                  <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-indigo-500 text-white text-[9px] font-black">
                    i
                  </span>
                  <span className="text-slate-700 font-semibold">{r.label}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3">
        <h4 className="text-xs font-black text-slate-800 uppercase tracking-wide pl-0.5">Approval Sourcing Flow Path</h4>
        <ApprovalTimeline
          stages={approvalHandoff}
          currentIdx={0}
        />
      </div>

      <Field label="Approval notes / Submission Remarks">
        <textarea
          value={draft.approval.notes}
          onChange={e => updateDraft(c => ({ ...c, approval: { ...c.approval, notes: e.target.value } }))}
          className={textareaClass}
          rows={3}
          placeholder="Enter remarks for the approval authority..."
        />
      </Field>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// REUSABLE FORM FIELD
// ─────────────────────────────────────────────────────────────────────────────
function Field({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: ReactNode }) {
  return (
    <label className={cn('block space-y-1.5', className)}>
      <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">
        {label} {required && <span className="text-rose-600">*</span>}
      </span>
      {children}
    </label>
  );
}

const inputClass = 'h-11 w-full rounded-2xl border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-900 shadow-3xs outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15';
const textareaClass = 'w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-900 shadow-3xs outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15';

// Compatibility payload mapping helper
const buildProcurementApiPayload = (draft: Draft, draftStep = 0) => {
  const dbMethod = mapToDatabaseMethod(draft.type);
  const title = draft.basics.title || `${draft.type} draft`;
  const estimatedValue = draft.basics.estimatedValue || 0;

  // Handle BOQ item list vs Standard item list
  const mappedItems = draft.basics.whatAreYouBuying === 'BOQ'
    ? draft.boqTable.map(item => ({
        itemName: item.description,
        description: item.remarks || '',
        quantity: item.quantity,
        unitOfMeasure: item.uom,
        estimatedUnitPrice: item.estimatedRate,
      }))
    : draft.items.map(item => ({
        itemName: item.name,
        description: item.specification || '',
        quantity: item.quantity,
        unitOfMeasure: item.unit,
        estimatedUnitPrice: 0,
        specifications: {
          hsn_sac_code: item.hsn_sac_code || '',
          brand_preference: item.brand_preference || '',
          brand_flexible: item.brand_flexible || 'Yes',
          fileAssetId: item.fileAssetId || null,
          specificationFileName: item.specificationFileName || '',
        }
      }));

  // Build default consignee matching total quantity
  const totalQty = draft.basics.whatAreYouBuying === 'BOQ'
    ? draft.boqTable.reduce((acc, item) => acc + Number(item.quantity || 0), 0)
    : draft.items.reduce((acc, item) => acc + Number(item.quantity || 0), 0);

  const deliveryLocation = draft.basics.deliveryLocation || draft.internal.orgName || 'Primary Delivery Location';
  const consigneeDetails = [
    {
      name: draft.internal.contactPerson || 'Default Consignee',
      location: deliveryLocation,
      quantity: totalQty
    }
  ];

  // Map compliance required documents checklist to document formats expected by backend file validators
  const mappedDocuments = draft.requiredDocs.map(doc => ({
    name: doc.name,
    fileName: doc.name.toLowerCase().includes('boq') && draft.boqFileName 
      ? draft.boqFileName 
      : (doc.name.toLowerCase().includes('specification') && draft.items?.[0]?.specificationFileName 
        ? draft.items[0].specificationFileName 
        : 'attached_doc.pdf'),
    fileAssetId: doc.name.toLowerCase().includes('boq') ? draft.boqFileAssetId : null,
    required: doc.required
  }));

  // Map rules and timelines matching backend validator nested structures
  const tender = {
    bidStartDate: draft.schedule.submissionStartDate || new Date().toISOString(),
    bidClosingDate: draft.schedule.submissionDate || draft.basics.requiredByDate || new Date(Date.now() + 15 * 24 * 60 * 60 * 1000).toISOString(),
    technicalEvaluationDate: draft.schedule.technicalOpeningDate || undefined,
    financialEvaluationDate: draft.schedule.financialOpeningDate || undefined,
    performanceSecurityAmount: draft.terms.securityDeposit || 0,
    scopeOfWork: draft.serviceDetails.scopeOfWork || draft.basics.justification || '',
  };

  const basics = {
    title,
    justification: draft.basics.justification || draft.internal.justification || '',
    description: `Sourcing Method: ${draft.type}\nValue: INR ${estimatedValue.toLocaleString('en-IN')}\nUrgency: ${draft.basics.priority}`,
    buyerType: draft.basics.buyerType,
    whatAreYouBuying: draft.basics.whatAreYouBuying,
  };

  const auctionConfigPayload = isReverseAuctionMethod(draft.type) ? {
    ...draft.auctionConfig,
    auctionTitle: draft.auctionConfig.auctionTitle || title,
    auctionDescription: draft.auctionConfig.auctionDescription || draft.basics.justification || basics.description,
    auctionCategory: draft.auctionConfig.auctionCategory || draft.basics.category,
    auctionSubCategory: draft.auctionConfig.auctionSubCategory || draft.basics.subCategory,
    buyerOrganization: draft.auctionConfig.buyerOrganization || draft.internal.orgName,
    department: draft.auctionConfig.department || draft.internal.department || draft.basics.department,
    estimatedValue,
    qualifiedVendors: draft.vendors.invitedSellers,
  } : null;

  const rateContractConfigPayload = isRateContractMethod(draft.type) ? {
    ...draft.rateContractConfig,
    contractTitle: draft.rateContractConfig.contractTitle || title,
    contractDescription: draft.rateContractConfig.contractDescription || draft.basics.justification || basics.description,
    contractCategory: draft.rateContractConfig.contractCategory || draft.basics.category,
    contractSubCategory: draft.rateContractConfig.contractSubCategory || draft.basics.subCategory,
    selectedSuppliers: draft.rateContractConfig.selectedSuppliers.length
      ? draft.rateContractConfig.selectedSuppliers
      : draft.vendors.invitedSellers.map(supplierId => ({ supplierId })),
    itemRateSchedule: draft.rateContractConfig.itemRateSchedule.map(item => ({
      ...item,
      slabPricing: item.slabPricingEnabled ? item.slabPricing : []
    })),
  } : null;

  const rules = {
    emdRequired: draft.terms.emdRequired,
    emdAmount: draft.terms.emdAmount,
    performanceSecurity: draft.terms.pbgRequired,
    startPrice: auctionConfigPayload?.startingBidPrice ?? draft.basics.estimatedValue ?? 0,
    minimumDecrement: auctionConfigPayload?.minimumBidDecrement ?? 0,
    auctionConfig: auctionConfigPayload
  };

  // Run suggestion engine to capture recommendation result
  const recommendation = suggestProcurementMethod({
    buyerType: draft.basics.buyerType,
    estimatedValue: draft.basics.estimatedValue,
    whatAreYouBuying: draft.basics.whatAreYouBuying,
    isCatalogueAvailable: draft.basics.isCatalogueAvailable,
    isOnlyOneVendor: draft.basics.isOnlyOneVendor,
    isReverseAuctionNeeded: draft.basics.isReverseAuctionNeeded,
    isTechnicalEvaluationNeeded: draft.basics.isTechnicalEvaluationNeeded,
    urgency: draft.basics.priority,
    lineItemsCount: draft.basics.whatAreYouBuying === 'BOQ' ? draft.boqTable.length : draft.items.length,
    isSpecClear: draft.basics.isSpecClear,
    isRepeatedSupply: draft.basics.isRepeatedSupply,
    marketResearchOnly: draft.basics.marketResearchOnly,
  });

  const payloadJson = {
    ...draft,
    fullProcurementMethod: draft.type, // canonical method name inside payload JSON
    buyerType: draft.basics.buyerType,
    buyingType: draft.basics.whatAreYouBuying,
    recommendation,
    consigneeDetails,
    documents: mappedDocuments,
    tender,
    rules,
    basics,
    auctionConfig: auctionConfigPayload,
    rateContractConfig: rateContractConfigPayload,
    rateContract: rateContractConfigPayload
  };

  return {
    id: draft.id,
    methodSlug: draft.type,
    procurementMethod: dbMethod,
    canonicalMethod: draft.type,
    sealedSubmission: draft.sealedSubmissionFlag || draft.type === 'SEALED_TENDER',
    title,
    description: basics.description,
    estimatedValue,
    requiredBy: draft.basics.requiredByDate || undefined,
    draftStep,
    workflowStatus: 'DRAFT',
    approvalStatus: draft.approval?.workflow || 'DRAFT',
    payload: payloadJson,
    items: mappedItems
  };
};
