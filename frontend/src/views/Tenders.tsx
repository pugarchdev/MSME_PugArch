import React, { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '../lib/api';
import { getFileAssetPreview, type DocumentPreview } from '../lib/files';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { QUANTITY_UNITS, PAYMENT_TERMS, DELIVERY_TYPES } from '../constants/dropdowns';
import { compressImage } from '../lib/compress';
import { Card, CardHeader, CardTitle, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import {
  Plus,
  Search,
  Filter,
  Clock,
  CheckCircle2,
  XCircle,
  MoreVertical,
  ChevronRight,
  FileText,
  AlertCircle,
  X,
  Upload,
  Download,
  Paperclip,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Eye,
  Edit3,
  Trash2,
  Save,
  List,
  LayoutGrid,
  CalendarDays,
  Copy,
  FileUp,
  ShieldCheck,
  UserRound,
  IndianRupee,
  ClipboardCheck,
  CheckSquare,
  UploadCloud,
  Trophy,
  BarChart3
} from 'lucide-react';
import { cn } from '../lib/utils';
import { Loader2 } from '@/components/ui/loader';
import { toast } from 'sonner';
import { Pagination } from '../features/shared/Pagination';
import { EntityIdLink } from '../features/shared/EntityIdLink';
import { ViewModeToggle } from '../features/shared/ViewModeToggle';
import { useFeatureQuery, usePaginatedFeatureQuery, useResponsiveViewMode } from '../features/shared/hooks';
import { EmptyState, InlineError, LoadingState } from '../features/shared/FeatureStates';

interface Tender {
  id: number;
  tenderId: string;
  title: string;
  category: string;
  budget: number;
  status: 'draft' | 'approved' | 'published' | 'bid_submission' | 'tech_bid_opening' | 'tech_evaluation' | 'financial_bid_opening' | 'financial_opening' | 'financial_evaluation' | 'awarded' | 'po_generated' | 'closed';
  bidsCount: number;
  description: string;
  documentUrl?: string;
  closesAt?: string;
  quantityUnit?: string;
  paymentTerms?: string;
  deliveryType?: string;
  createdAt?: string;
  updatedAt?: string;
  isV2?: boolean;
  documents?: Array<{ fileAssetId: number; fileName: string; documentType?: string }>;
}

const TENDER_STAGES = [
  { id: 'draft', label: 'Tender Draft' },
  { id: 'approved', label: 'Approve' },
  { id: 'published', label: 'Publish' },
  { id: 'bid_submission', label: 'Bid Submission' },
  { id: 'tech_bid_opening', label: 'Tech Bid Opening' },
  { id: 'tech_evaluation', label: 'Technical Evaluation' },
  { id: 'financial_bid_opening', label: 'Financial Bid Opening' },
  { id: 'financial_opening', label: 'Financial Opening' },
  { id: 'financial_evaluation', label: 'Financial Evaluation' },
  { id: 'awarded', label: 'Award' },
  { id: 'po_generated', label: 'PO Generation' }
];

const TENDER_CATEGORY_OPTIONS = [
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
  'Refractories',
  'Steel & Metals',
  'Cement & Building Materials',
  'Pipes & Hardware',
  'Safety Equipment',
  'Fire Safety',
  'Mining Equipment',
  'Power & Energy',
  'Oil & Gas',
  'Telecom',
  'Fabrication',
  'Welding Services',
  'Repair & Maintenance',
  'AMC Services',
  'Consultancy Services',
  'Agriculture Supplies',
  'Tyres & Rubber',
  'Pumps & Motors',
  'Bearings & Spare Parts',
  'Industrial Consumables',
  'Cleaning Services',
  'Water Treatment',
  'HVAC',
  'Interior & Furnishing',
  'Event Management',
  'General Services',
  'OEM Supply',
  'Manpower Supply'
];

const TENDER_HANDOFF_KEY = 'msme:tender-create-prefill:v1';

type BoqLineItem = {
  id: string;
  name: string;
  description: string;
  quantity: string;
  unit: string;
  deliveryDate: string;
  brandPolicy: string;
  technicalSpecification: string;
  specificationFileName: string;
};

type TenderDocumentRow = {
  id: string;
  label: string;
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

type TenderDraft = {
  title: string;
  tenderNumber: string;
  tenderType: string;
  category: string;
  subCategory: string;
  department: string;
  tenderMode: string;
  visibility: string;
  shortDescription: string;
  scopeOfWork: string;
  purpose: string;
  items: BoqLineItem[];
  deliveryLocation: string;
  deliveryType: string;
  deliveryTimeline: string;
  installationRequired: boolean;
  trainingRequired: boolean;
  specialInstructions: string;
  budget: string;
  currency: string;
  priceType: string;
  taxType: string;
  gstIncluded: boolean;
  gstRate: string;
  paymentTerms: string;
  emdRequired: boolean;
  emdAmount: string;
  performanceSecurityRequired: boolean;
  performanceSecurityAmount: string;
  milestones: PaymentMilestone[];
  publishDate: string;
  bidStartDate: string;
  bidClosingDate: string;
  bidClosingTime: string;
  technicalEvaluationDate: string;
  financialEvaluationDate: string;
  awardDate: string;
  documents: TenderDocumentRow[];
  msmePreference: boolean;
  startupPreference: boolean;
  shgPreference: boolean;
  womenOwnedPreference: boolean;
  localSupplierPreference: boolean;
  minExperience: string;
  minTurnover: string;
  requiredCertifications: string;
  gstMandatory: boolean;
  panMandatory: boolean;
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
  requirementId?: number | null;
};

const createId = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const emptyBoqItem = (): BoqLineItem => ({
  id: createId(),
  name: '',
  description: '',
  quantity: '1',
  unit: 'Nos',
  deliveryDate: '',
  brandPolicy: 'Equivalent or better allowed',
  technicalSpecification: '',
  specificationFileName: ''
});

const emptyMilestone = (): PaymentMilestone => ({
  id: createId(),
  label: 'Delivery acceptance',
  percentage: '100',
  trigger: 'After delivery, inspection, and acceptance'
});

const defaultDocuments = (): TenderDocumentRow[] => [
  { id: createId(), label: 'Tender Specification File', requirement: 'Mandatory', fileName: '', version: 1 },
  { id: createId(), label: 'BOQ / Price Schedule', requirement: 'Mandatory', fileName: '', version: 1 },
  { id: createId(), label: 'Terms & Conditions', requirement: 'Mandatory', fileName: '', version: 1 },
  { id: createId(), label: 'Annexures / Drawings', requirement: 'Optional', fileName: '', version: 1 },
  { id: createId(), label: 'Technical Documents', requirement: 'Optional', fileName: '', version: 1 },
  { id: createId(), label: 'Compliance Documents', requirement: 'Optional', fileName: '', version: 1 },
  { id: createId(), label: 'Other Attachments', requirement: 'Optional', fileName: '', version: 1 }
];

const createTenderDraft = (): TenderDraft => ({
  title: '',
  tenderNumber: `TDR-${new Date().getFullYear()}-${Math.floor(100000 + Math.random() * 900000)}`,
  tenderType: 'Open Tender',
  category: '',
  subCategory: '',
  department: '',
  tenderMode: 'Two Bid',
  visibility: 'Verified suppliers',
  shortDescription: '',
  scopeOfWork: '',
  purpose: '',
  items: [emptyBoqItem()],
  deliveryLocation: '',
  deliveryType: '',
  deliveryTimeline: '',
  installationRequired: false,
  trainingRequired: false,
  specialInstructions: '',
  budget: '',
  currency: 'INR',
  priceType: 'Firm fixed price',
  taxType: 'GST',
  gstIncluded: true,
  gstRate: '18',
  paymentTerms: '',
  emdRequired: false,
  emdAmount: '',
  performanceSecurityRequired: false,
  performanceSecurityAmount: '',
  milestones: [emptyMilestone()],
  publishDate: '',
  bidStartDate: '',
  bidClosingDate: '',
  bidClosingTime: '',
  technicalEvaluationDate: '',
  financialEvaluationDate: '',
  awardDate: '',
  documents: defaultDocuments(),
  msmePreference: true,
  startupPreference: false,
  shgPreference: false,
  womenOwnedPreference: false,
  localSupplierPreference: true,
  minExperience: '',
  minTurnover: '',
  requiredCertifications: '',
  gstMandatory: true,
  panMandatory: true,
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
  requirementId: null
});

type TenderDraftErrors = Partial<Record<keyof TenderDraft | 'items' | 'timeline' | 'documents' | 'contact', string>>;

const normalizeTenderHandoffDraft = (payload: unknown): TenderDraft | null => {
  if (!payload || typeof payload !== 'object') return null;
  const source = payload as Partial<TenderDraft> & {
    documents?: Array<Partial<TenderDocumentRow> & { name?: string }>;
    items?: Array<Partial<BoqLineItem>>;
    milestones?: Array<Partial<PaymentMilestone>>;
  };
  const base = createTenderDraft();

  return {
    ...base,
    ...source,
    items: Array.isArray(source.items) && source.items.length > 0
      ? source.items.map(item => ({
        ...emptyBoqItem(),
        ...item,
        id: item.id || createId(),
        quantity: String(item.quantity || '1'),
      }))
      : base.items,
    documents: Array.isArray(source.documents) && source.documents.length > 0
      ? source.documents.map(document => {
        const procurementDocument = document as Partial<TenderDocumentRow> & { name?: string };
        return {
          id: procurementDocument.id || createId(),
          label: procurementDocument.label || procurementDocument.name || 'Document',
          requirement: procurementDocument.requirement || 'Optional',
          fileName: procurementDocument.fileName || '',
          version: Number(procurementDocument.version || 1),
        };
      })
      : base.documents,
    milestones: Array.isArray(source.milestones) && source.milestones.length > 0
      ? source.milestones.map(milestone => ({
        ...emptyMilestone(),
        ...milestone,
        id: milestone.id || createId(),
        percentage: String(milestone.percentage || ''),
      }))
      : base.milestones,
    budget: String(source.budget || ''),
    emdAmount: String(source.emdAmount || ''),
    performanceSecurityAmount: String(source.performanceSecurityAmount || ''),
    technicalWeightage: String(source.technicalWeightage || base.technicalWeightage),
    priceWeightage: String(source.priceWeightage || base.priceWeightage),
  };
};

const getCategorySuggestions = (category: string) => {
  const normalized = category.toLowerCase();
  if (/(construction|civil|building|interior|fire|safety)/.test(normalized)) {
    return {
      documents: ['Drawings / site layout', 'Safety compliance certificate', 'Material test certificate'],
      eligibility: 'Prefer vendors with 3+ years project execution experience, GST/PAN, and safety compliance.',
      evaluation: 'Use QCBS with 70% technical and 30% financial weightage.'
    };
  }
  if (/(it|software|cloud|networking|telecom|automation)/.test(normalized)) {
    return {
      documents: ['Solution architecture', 'SLA document', 'OEM authorization / partner certificate'],
      eligibility: 'Require GST/PAN, OEM authorization where applicable, and prior implementation references.',
      evaluation: 'Use technical scoring for compliance, uptime SLA, implementation plan, and support model.'
    };
  }
  if (/(medical|laboratory|chemicals|equipment)/.test(normalized)) {
    return {
      documents: ['Technical data sheet', 'Quality certificate', 'Warranty and calibration terms'],
      eligibility: 'Require GST/PAN, quality certifications, warranty support, and compliance declarations.',
      evaluation: 'Use compliance-first technical screening before financial comparison.'
    };
  }
  if (/(service|housekeeping|security|manpower|consultancy|amc|repair)/.test(normalized)) {
    return {
      documents: ['Scope of service', 'Manpower deployment plan', 'Statutory compliance declaration'],
      eligibility: 'Require statutory registrations, minimum experience, GST/PAN, and service references.',
      evaluation: 'Use service quality, experience, compliance, and price weightage.'
    };
  }
  return {
    documents: ['Tender specification', 'BOQ / price schedule', 'Terms and conditions'],
    eligibility: 'GST/PAN, local supplier preference, MSME preference, and minimum experience can be configured.',
    evaluation: 'Use QCBS for quality-sensitive procurements or L1 for standard commodity purchases.'
  };
};

const getTenderDraftErrors = (draft: TenderDraft): TenderDraftErrors => {
  const errors: TenderDraftErrors = {};
  if (draft.title.trim().length < 3) errors.title = 'Tender title must be at least 3 characters.';
  if (!draft.tenderNumber.trim()) errors.tenderNumber = 'Tender number is required.';
  if (!draft.tenderType.trim()) errors.tenderType = 'Tender type is required.';
  if (!draft.category.trim()) errors.category = 'Procurement category is required.';
  if (!draft.department.trim()) errors.department = 'Buyer department is required.';
  if (!draft.shortDescription.trim()) errors.shortDescription = 'Short description is required.';
  if (draft.scopeOfWork.trim().length < 10) errors.scopeOfWork = 'Detailed scope of work must be at least 10 characters.';
  if (!draft.items.some(item => item.name.trim() && Number(item.quantity) > 0)) {
    errors.items = 'Add at least one BOQ item with item name and valid quantity.';
  }
  if (!draft.deliveryLocation.trim()) errors.deliveryLocation = 'Delivery location is required.';
  if (!draft.deliveryType.trim()) errors.deliveryType = 'Delivery type is required.';
  if (Number(draft.budget) <= 0) errors.budget = 'Estimated budget must be greater than zero.';
  if (!draft.paymentTerms.trim()) errors.paymentTerms = 'Payment terms are required.';
  if (draft.emdRequired && Number(draft.emdAmount) <= 0) errors.emdAmount = 'Enter a valid EMD amount.';
  if (draft.performanceSecurityRequired && Number(draft.performanceSecurityAmount) <= 0) {
    errors.performanceSecurityAmount = 'Enter a valid performance security amount.';
  }

  const datedSteps = [
    { key: 'publishDate', label: 'Publish date', value: draft.publishDate },
    { key: 'bidStartDate', label: 'Bid start date', value: draft.bidStartDate },
    { key: 'bidClosingDate', label: 'Bid closing date', value: draft.bidClosingDate },
    { key: 'technicalEvaluationDate', label: 'Technical evaluation date', value: draft.technicalEvaluationDate },
    { key: 'financialEvaluationDate', label: 'Financial evaluation date', value: draft.financialEvaluationDate },
    { key: 'awardDate', label: 'Award date', value: draft.awardDate }
  ].filter(step => step.value);
  for (let index = 1; index < datedSteps.length; index += 1) {
    if (new Date(datedSteps[index].value) < new Date(datedSteps[index - 1].value)) {
      errors.timeline = `${datedSteps[index].label} must be on or after ${datedSteps[index - 1].label}.`;
      break;
    }
  }
  if (draft.bidClosingDate && !draft.bidClosingTime) errors.timeline = 'Bid closing time is required when closing date is set.';

  if (!draft.gstMandatory && !draft.panMandatory) errors.documents = 'At least one statutory identifier should remain mandatory.';
  if (Number(draft.technicalWeightage) + Number(draft.priceWeightage) !== 100) {
    errors.technicalWeightage = 'Technical and price weightage must total 100.';
  }
  if (!draft.contactName.trim()) errors.contactName = 'Buyer contact name is required.';
  if (!/^\S+@\S+\.\S+$/.test(draft.contactEmail)) errors.contactEmail = 'Valid buyer email is required.';
  if (!/^[0-9+\-\s]{8,15}$/.test(draft.contactMobile)) errors.contactMobile = 'Valid mobile number is required.';
  if (draft.approvalRequired && !draft.approverName.trim()) errors.approverName = 'Approver name is required.';
  return errors;
};

const buildTenderDescription = (draft: TenderDraft) => {
  const activeDocs = draft.documents
    .filter(doc => doc.requirement !== 'Not Required')
    .map(doc => `${doc.label}: ${doc.requirement}${doc.fileName ? ` (${doc.fileName}, v${doc.version})` : ''}`)
    .join('; ');
  const itemSummary = draft.items
    .filter(item => item.name.trim())
    .map((item, index) => `${index + 1}. ${item.name} - ${item.quantity} ${item.unit}; ${item.description || item.technicalSpecification || 'Specification pending'}`)
    .join('\n');
  const milestoneSummary = draft.milestones
    .filter(milestone => milestone.label.trim())
    .map(milestone => `${milestone.label}: ${milestone.percentage}% on ${milestone.trigger}`)
    .join('; ');

  return [
    `Tender No: ${draft.tenderNumber}`,
    `Type: ${draft.tenderType}; Mode: ${draft.tenderMode}; Visibility: ${draft.visibility}`,
    `Department: ${draft.department}; Category: ${draft.category}${draft.subCategory ? ` / ${draft.subCategory}` : ''}`,
    `Short Description: ${draft.shortDescription}`,
    `Scope of Work: ${draft.scopeOfWork}`,
    `Purpose / Objective: ${draft.purpose || 'Not specified'}`,
    `BOQ:\n${itemSummary || 'BOQ to be finalized'}`,
    `Delivery: ${draft.deliveryLocation}; ${draft.deliveryType}; ${draft.deliveryTimeline || 'Timeline to be finalized'}; Installation: ${draft.installationRequired ? 'Yes' : 'No'}; Training: ${draft.trainingRequired ? 'Yes' : 'No'}`,
    `Commercials: Budget ${draft.currency} ${draft.budget}; ${draft.priceType}; ${draft.taxType}; GST ${draft.gstIncluded ? `included at ${draft.gstRate}%` : 'excluded'}; Payment terms: ${draft.paymentTerms}`,
    `Security: EMD ${draft.emdRequired ? draft.emdAmount : 'Not required'}; Performance security ${draft.performanceSecurityRequired ? draft.performanceSecurityAmount : 'Not required'}`,
    `Payment Milestones: ${milestoneSummary || 'Standard payment milestone'}`,
    `Timeline: Publish ${draft.publishDate || '-'}, Bid start ${draft.bidStartDate || '-'}, Bid close ${draft.bidClosingDate || '-'} ${draft.bidClosingTime || ''}, Technical eval ${draft.technicalEvaluationDate || '-'}, Financial eval ${draft.financialEvaluationDate || '-'}, Award ${draft.awardDate || '-'}`,
    `Eligibility: MSME ${draft.msmePreference ? 'Yes' : 'No'}, Startup ${draft.startupPreference ? 'Yes' : 'No'}, SHG ${draft.shgPreference ? 'Yes' : 'No'}, Women-owned ${draft.womenOwnedPreference ? 'Yes' : 'No'}, Local supplier ${draft.localSupplierPreference ? 'Yes' : 'No'}, Experience ${draft.minExperience || 'Not specified'}, Turnover ${draft.minTurnover || 'Not specified'}, Certifications ${draft.requiredCertifications || 'Not specified'}, GST ${draft.gstMandatory ? 'Mandatory' : 'Optional'}, PAN ${draft.panMandatory ? 'Mandatory' : 'Optional'}`,
    `Evaluation: ${draft.evaluationMethod}; Technical ${draft.technicalWeightage}%, Price ${draft.priceWeightage}%, Experience ${draft.experienceScore}, Certification ${draft.certificationScore}, Compliance ${draft.complianceScore}`,
    `Documents: ${activeDocs || 'No documents attached'}`,
    `Buyer Contact: ${draft.contactName}; ${draft.contactEmail}; ${draft.contactMobile}; Department ${draft.departmentContact || draft.department}; Escalation ${draft.escalationContact || 'Not specified'}`,
    `Approval: ${draft.approvalRequired ? 'Required' : 'Not required'}; Approver ${draft.approverName || '-'}; Chain ${draft.approvalChain || '-'}; Status ${draft.approvalStatus}`
  ].join('\n\n').slice(0, 4900);
};

const BOQ_TEMPLATE_HEADERS = [
  'Item / Service Name',
  'Description / Specification',
  'Quantity',
  'Unit',
  'Delivery Date (YYYY-MM-DD)',
  'Brand Policy',
  'Technical Specification',
  'Specification File Name'
];

const BOQ_TEMPLATE_ROWS = [
  [
    'Voltage Stabilizer 10 KVA',
    'Copper winding, digital display, overload protection',
    '5',
    'Nos',
    '2026-07-31',
    'Equivalent or better allowed',
    'Input 160-280V, output 230V +/- 5%, IS compliant',
    'stabilizer-specification.pdf'
  ],
  [
    'Installation and commissioning service',
    'Installation, testing, handover, and buyer staff briefing',
    '1',
    'Job',
    '2026-08-05',
    'No brand restriction',
    'Certified technician deployment with test report submission',
    ''
  ]
];

const csvCell = (value: string) => `"${value.replace(/"/g, '""')}"`;

const parseCsvRows = (text: string) => {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') index += 1;
      row.push(current.trim());
      if (row.some(cell => cell.length > 0)) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }
  row.push(current.trim());
  if (row.some(cell => cell.length > 0)) rows.push(row);
  return rows;
};

const normalizeHeader = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');

const mapBoqCsvRows = (text: string): BoqLineItem[] => {
  const rows = parseCsvRows(text);
  if (rows.length < 2) return [];
  const headerMap = new Map(rows[0].map((header, index) => [normalizeHeader(header), index]));
  const find = (keys: string[]) => keys.map(normalizeHeader).map(key => headerMap.get(key)).find(index => index !== undefined);
  const indexes = {
    name: find(['Item / Service Name', 'Item Name', 'Service Name']),
    description: find(['Description / Specification', 'Description', 'Specification']),
    quantity: find(['Quantity', 'Qty']),
    unit: find(['Unit', 'UOM']),
    deliveryDate: find(['Delivery Date (YYYY-MM-DD)', 'Delivery Date']),
    brandPolicy: find(['Brand Policy']),
    technicalSpecification: find(['Technical Specification']),
    specificationFileName: find(['Specification File Name', 'Spec File'])
  };
  if (indexes.name === undefined || indexes.quantity === undefined) return [];

  return rows.slice(1).map(row => ({
    id: createId(),
    name: row[indexes.name ?? -1]?.trim() || '',
    description: row[indexes.description ?? -1]?.trim() || '',
    quantity: row[indexes.quantity ?? -1]?.trim() || '1',
    unit: row[indexes.unit ?? -1]?.trim() || 'Nos',
    deliveryDate: row[indexes.deliveryDate ?? -1]?.trim() || '',
    brandPolicy: row[indexes.brandPolicy ?? -1]?.trim() || 'Equivalent or better allowed',
    technicalSpecification: row[indexes.technicalSpecification ?? -1]?.trim() || '',
    specificationFileName: row[indexes.specificationFileName ?? -1]?.trim() || ''
  })).filter(item => item.name && Number(item.quantity) > 0);
};

const downloadBoqTemplate = () => {
  const csv = [BOQ_TEMPLATE_HEADERS, ...BOQ_TEMPLATE_ROWS]
    .map(row => row.map(csvCell).join(','))
    .join('\r\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'tender-boq-template.csv';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

const normalizeTenderList = (payload: any): Tender[] => {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.tenders)) return payload.tenders;
  if (Array.isArray(payload?.data?.tenders)) return payload.data.tenders;
  if (Array.isArray(payload?.data?.records)) return payload.data.records;
  if (Array.isArray(payload?.records)) return payload.records;
  return [];
};

export default function Tenders() {
  const router = useRouter();
  const authOptions = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
  const [activeTab, setActiveTab] = useState<string>('published');
  const [searchText, setSearchText] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState('All');
  const [budgetFilter, setBudgetFilter] = useState('All');
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' }>({ key: 'createdAt', direction: 'desc' });
  const [viewMode, setViewMode] = useResponsiveViewMode();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [newTender, setNewTender] = useState<TenderDraft>(() => createTenderDraft());
  const [tenderWizardStep, setTenderWizardStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [publishingId, setPublishingId] = useState<number | null>(null);
  const [selectedTender, setSelectedTender] = useState<Tender | null>(null);
  const [editingTender, setEditingTender] = useState<Tender | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreview | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(TENDER_HANDOFF_KEY);
      if (!raw) return;
      const handoffDraft = normalizeTenderHandoffDraft(JSON.parse(raw));
      localStorage.removeItem(TENDER_HANDOFF_KEY);
      if (handoffDraft) {
        setNewTender(handoffDraft);
        setTenderWizardStep(0);
        setIsModalOpen(true);
        toast.success('Tender draft loaded from Create Procurement');
      }
    } catch {
      localStorage.removeItem(TENDER_HANDOFF_KEY);
    }
  }, []);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchText);
    }, 400);
    return () => clearTimeout(handler);
  }, [searchText]);

  const {
    records: pagedTenders,
    loading,
    refreshing,
    error,
    reload,
    setRecords: setPagedTenders,
    page,
    pageSize,
    total,
    setPage,
    setPageSize
  } = usePaginatedFeatureQuery<Tender>(
    '/api/tenders',
    {
      search: debouncedSearch,
      status: activeTab,
      category: selectedCategoryFilter,
      budget: budgetFilter,
      sortBy: sortConfig.key,
      sortOrder: sortConfig.direction
    },
    10
  );

  const { data: summaryData, reload: reloadSummary } = useFeatureQuery<{ draftCount: number; activeCount: number; closedCount: number } | null>(
    '/api/tenders/summary',
    null
  );

  const refreshAll = () => {
    void reload();
    void reloadSummary();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    const optimizedFile = file.type.startsWith('image/') ? await compressImage(file) : file;
    const formDataUpload = new FormData();
    formDataUpload.append('file', optimizedFile);

    try {
      const res = await api.fetch('/api/upload', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formDataUpload
      });

      if (res.ok) {
        const data = await res.json();
        const uploaded = data?.data || data;
        const fileId = Number(uploaded?.fileId || uploaded?.file?.id || 0);
        const documentUrl = uploaded?.file?.documentUrl || uploaded?.url || (fileId ? `/api/files/${fileId}/view` : '');
        setNewTender(prev => ({ ...prev, documentUrl }));
        toast.success('Specifications document uploaded successfully');
      } else {
        toast.error('Failed to upload document');
      }
    } catch (err) {
      toast.error('Network error during upload');
    } finally {
      setIsUploading(false);
    }
  };

  useEffect(() => () => {
    if (previewDocument?.url.startsWith('blob:')) URL.revokeObjectURL(previewDocument.url);
  }, [previewDocument]);

  const handlePreviewDocument = async (url: string, label: string) => {
    try {
      setPreviewDocument(await getFileAssetPreview({ url }, label));
    } catch (error: any) {
      toast.error(error?.message || 'Unable to open document');
    }
  };

  const handlePublish = async (tenderId: number) => {
    setPublishingId(tenderId);
    try {
      const res = await api.put(`/api/tenders/${tenderId}/status`, {
        status: 'published'
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (res.ok) {
        toast.success('Tender published successfully');
        refreshAll();
        setActiveTab('published');
      } else {
        const errorData = await res.json();
        console.error('Publish Failed:', errorData);
        toast.error(errorData.message || 'Failed to publish tender');
      }
    } catch (err: any) {
      console.error('Network Error during Publish:', err);
      toast.error(`Network error: ${err.message || 'Check connection'}`);
    } finally {
      setPublishingId(null);
    }
  };

  const handleCreateTender = async (e: React.FormEvent) => {
    e.preventDefault();
    const submitter = (e.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const requestedAction = submitter?.dataset.action === 'publish' ? 'publish' : 'draft';

    const draftErrors = getTenderDraftErrors(newTender);
    if (Object.keys(draftErrors).length > 0) {
      toast.error(Object.values(draftErrors)[0] || 'Please complete required tender details');
      return;
    }

    setSubmitting(true);
    try {
      const closingAt = newTender.bidClosingDate
        ? new Date(`${newTender.bidClosingDate}T${newTender.bidClosingTime || '23:59'}`).toISOString()
        : undefined;
      const res = await api.post('/api/tenders', {
        title: newTender.title.trim(),
        category: newTender.category,
        budget: Number(newTender.budget),
        description: buildTenderDescription(newTender),
        documentUrl: newTender.documentUrl || undefined,
        closesAt: closingAt,
        quantityUnit: newTender.items[0]?.unit || undefined,
        paymentTerms: newTender.paymentTerms || undefined,
        deliveryType: newTender.deliveryType || undefined,
        status: 'draft',
        requirementId: newTender.requirementId ? Number(newTender.requirementId) : undefined
      }, {
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
      });

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        const createdTender = data?.data || data;
        if (requestedAction === 'publish' && createdTender?.id) {
          const publishRes = await api.put(`/api/tenders/${createdTender.id}/status`, {
            status: 'published'
          }, {
            headers: { Authorization: `Bearer ${localStorage.getItem('token')}` }
          });
          if (publishRes.ok) {
            toast.success('Tender published successfully');
            setActiveTab('published');
          } else {
            const publishError = await publishRes.json().catch(() => null);
            toast.warning(publishError?.message || 'Tender saved as draft, but publish failed');
            setActiveTab('draft');
          }
        } else {
          toast.success('Tender saved as draft');
          setActiveTab('draft');
        }
        setIsModalOpen(false);
        setNewTender(createTenderDraft());
        setTenderWizardStep(0);
        refreshAll();
      } else {
        const errorData = await res.json().catch(() => null);
        toast.error(errorData?.message || 'Failed to create tender');
      }
    } catch (err) {
      toast.error('Network error');
    } finally {
      setSubmitting(false);
    }
  };

  const handleUpdateTender = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingTender) return;
    const form = new FormData(event.currentTarget);
    const payload = {
      title: String(form.get('title') || '').trim(),
      category: String(form.get('category') || '').trim(),
      budget: Number(form.get('budget') || 0),
      description: String(form.get('description') || '').trim(),
      documentUrl: editingTender.documentUrl || undefined,
      closesAt: form.get('closesAt') ? new Date(String(form.get('closesAt'))).toISOString() : undefined,
      quantityUnit: String(form.get('quantityUnit') || '').trim() || undefined,
      paymentTerms: String(form.get('paymentTerms') || '').trim() || undefined,
      deliveryType: String(form.get('deliveryType') || '').trim() || undefined
    };
    if (payload.title.length < 3) return toast.error('Title must be at least 3 characters long');
    if (!payload.category) return toast.error('Please select a category');
    if (payload.budget <= 0) return toast.error('Budget must be a positive number');
    if (payload.description.length < 10) return toast.error('Description must be at least 10 characters long');

    setSavingEdit(true);
    try {
      const res = await api.put(`/api/tenders/${editingTender.id}`, payload, authOptions);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to update tender');
      const updatedTender = data?.data || data;
      toast.success('Tender updated successfully');
      setEditingTender(null);
      setSelectedTender(updatedTender);
      refreshAll();
    } catch (err: any) {
      toast.error(err?.message || 'Network error');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleDeleteTender = async (tender: Tender) => {
    if (!window.confirm(`Delete tender "${tender.title}"?`)) return;
    try {
      const res = await api.delete(`/api/tenders/${tender.id}`, authOptions);
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data?.message || 'Failed to delete tender');
      toast.success('Tender deleted successfully');
      setSelectedTender(null);
      setEditingTender(null);
      refreshAll();
    } catch (err: any) {
      toast.error(err?.message || 'Network error');
    }
  };

  const getDaysLeft = (date?: string) => {
    if (!date) return 'Not set';
    const diff = new Date(date).getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days > 0 ? `${days}d` : 'Expired';
  };

  const tenderPageInsights = useMemo(() => {
    const totalBudget = pagedTenders.reduce((sum, tender) => sum + Number(tender.budget || 0), 0);
    const totalBids = pagedTenders.reduce((sum, tender) => sum + Number(tender.bidsCount || 0), 0);
    const expiringSoon = pagedTenders.filter(tender => {
      if (!tender.closesAt) return false;
      const days = Math.ceil((new Date(tender.closesAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 7;
    }).length;
    const withoutBids = pagedTenders.filter(tender => Number(tender.bidsCount || 0) === 0).length;
    const categoryCount = new Set(pagedTenders.map(tender => tender.category).filter(Boolean)).size;
    const highestBudget = pagedTenders.reduce<Tender | null>((best, tender) => {
      if (!best || Number(tender.budget || 0) > Number(best.budget || 0)) return tender;
      return best;
    }, null);
    return {
      totalBudget,
      totalBids,
      expiringSoon,
      withoutBids,
      categoryCount,
      highestBudget,
      averageBudget: pagedTenders.length ? Math.round(totalBudget / pagedTenders.length) : 0
    };
  }, [pagedTenders]);

  const toggleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const SortHeader = ({ label, sortKey, className = '' }: { label: string; sortKey: string; className?: string }) => {
    const isActive = sortConfig.key === sortKey;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKey)}
        className={cn("inline-flex items-center gap-1.5 text-xs font-bold uppercase text-slate-500 hover:text-[#12335f] transition-colors", className)}
      >
        {label}
        {isActive ? (
          sortConfig.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-[#12335f]" /> : <ArrowDown className="h-3.5 w-3.5 text-[#12335f]" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    );
  };

  const renderTenderActions = (tender: Tender) => (
    <div className="flex flex-wrap items-center justify-end gap-1.5">
      <button
        type="button"
        onClick={() => setSelectedTender(tender)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-[#dadce0] bg-white text-[#12335f] hover:bg-slate-50"
        title="View tender details"
      >
        <Eye className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => setEditingTender(tender)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-[#dadce0] bg-white text-slate-700 hover:bg-slate-50"
        title="Edit tender"
      >
        <Edit3 className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => handleDeleteTender(tender)}
        className="flex h-9 w-9 items-center justify-center rounded-md border border-red-200 bg-white text-red-600 hover:bg-red-50"
        title="Delete tender"
      >
        <Trash2 className="h-4 w-4" />
      </button>
      {tender.status === 'draft' ? (
        <Button
          className="bg-[#12335f] hover:bg-[#0b2445] text-white text-xs font-bold h-9 px-3 rounded-md shadow-sm transition-all flex items-center gap-1.5"
          onClick={() => handlePublish(tender.id)}
          disabled={publishingId === tender.id}
        >
          {publishingId === tender.id ? 'Publishing...' : 'Publish'}
          <Plus className="h-3.5 w-3.5" />
        </Button>
      ) : (
        <Button
          variant="outline"
          className="bg-white border border-[#dadce0] text-slate-900 text-xs font-bold h-9 px-3 rounded-md hover:bg-slate-50 flex items-center gap-1.5"
          onClick={() => router.push(`/buyer/tenders/${tender.id}/evaluate`)}
        >
          Bids
          <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );

  if (loading && pagedTenders.length === 0) {
    return <LoadingState label="Loading tenders..." />;
  }

  return (
    <div className="min-h-screen bg-[#f8f9fa] text-slate-900">
      <div className="border-b border-[#dfe3e8] bg-white px-6 py-5 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#12335f]">Tender Management</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-[#1a1c21]">Large Procurement Control Desk</h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              Monitor tender drafts, active bid windows, supplier participation, budget exposure, and upcoming closure risk from one register.
            </p>
          </div>
          <Button
            onClick={() => router.push('/buyer/create-bid  ')}
            className="h-10 shrink-0 rounded-md bg-[#12335f] px-5 text-[11px] font-black uppercase tracking-wide text-white shadow-sm transition-all hover:bg-[#0b2445]"
          >
            <Plus className="mr-2 h-3.5 w-3.5" />
            Create Tender
          </Button>
        </div>
      </div>

      <div className="p-4 md:p-6 space-y-4">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <TenderInsightCard
            label="Page budget exposure"
            value={`Rs. ${tenderPageInsights.totalBudget.toLocaleString('en-IN')}`}
            helper={`Average Rs. ${tenderPageInsights.averageBudget.toLocaleString('en-IN')} across loaded records.`}
            icon={IndianRupee}
          />
          <TenderInsightCard
            label="Supplier participation"
            value={tenderPageInsights.totalBids}
            helper={`${tenderPageInsights.withoutBids} loaded tender${tenderPageInsights.withoutBids === 1 ? '' : 's'} still have no bids.`}
            icon={Trophy}
            tone={tenderPageInsights.withoutBids ? 'amber' : 'green'}
          />
          <TenderInsightCard
            label="Closing attention"
            value={tenderPageInsights.expiringSoon}
            helper="Loaded active tenders closing within the next 7 days."
            icon={Clock}
            tone={tenderPageInsights.expiringSoon ? 'amber' : 'green'}
          />
          <TenderInsightCard
            label="Category spread"
            value={tenderPageInsights.categoryCount}
            helper={tenderPageInsights.highestBudget ? `Largest: ${tenderPageInsights.highestBudget.title}` : 'No tender category loaded yet.'}
            icon={BarChart3}
            tone="slate"
          />
        </div>

        <div className="rounded-lg border border-blue-100 bg-blue-50 p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#12335f]">Operational summary</p>
              <p className="mt-1 text-sm font-semibold text-slate-700">
                Showing {pagedTenders.length} loaded record{pagedTenders.length === 1 ? '' : 's'} from {total} matching tender{total === 1 ? '' : 's'}.
                Use Draft for unpublished tenders, Active for live supplier bidding, and Closed for completed windows.
              </p>
            </div>
            {refreshing && <span className="text-xs font-black uppercase tracking-wide text-[#12335f]">Refreshing...</span>}
          </div>
        </div>

        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-1 bg-[#f1f3f4] p-1 rounded-lg border border-[#e8eaed]">
            {[
              { id: 'draft', label: 'Draft', count: summaryData?.draftCount ?? 0 },
              { id: 'published', label: 'Active', count: summaryData?.activeCount ?? 0 },
              { id: 'closed', label: 'Closed', count: summaryData?.closedCount ?? 0 }
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={cn(
                  "flex items-center gap-2 px-5 py-2 rounded-md text-sm font-bold transition-all",
                  activeTab === tab.id
                    ? "bg-white text-slate-900 shadow-sm border border-[#dadce0]"
                    : "text-slate-500 hover:text-slate-700"
                )}
              >
                {tab.label}
                <span className="text-slate-400 font-medium ml-2">{tab.count}</span>
              </button>
            ))}
          </div>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>

        {/* Filters and Search Row */}
        <div className="grid grid-cols-1 gap-3 pt-1 pb-1 lg:grid-cols-[minmax(260px,1fr)_220px_180px_170px]">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <Input
              placeholder="Quick search by Tender ID or Title..."
              className="pl-9 h-10 border-slate-200 bg-slate-50/50 text-sm font-medium focus:bg-white transition-all"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
          <div>
            <select
              className="w-full bg-white border border-slate-200 rounded-md h-10 px-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#12335f] transition-all cursor-pointer"
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
            >
              <option value="All">All Categories</option>
              {TENDER_CATEGORY_OPTIONS.map(category => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </div>
          <div>
            <select
              className="w-full bg-white border border-slate-200 rounded-md h-10 px-3 text-sm font-semibold text-slate-700 focus:outline-none focus:ring-1 focus:ring-[#12335f] transition-all cursor-pointer"
              value={budgetFilter}
              onChange={(e) => setBudgetFilter(e.target.value)}
            >
              <option value="All">All Budgets</option>
              <option value="under_10l">Under Rs. 10 Lakh</option>
              <option value="10l_50l">Rs. 10-50 Lakh</option>
              <option value="above_50l">Above Rs. 50 Lakh</option>
            </select>
          </div>
          <button
            type="button"
            onClick={() => {
              setSearchText('');
              setSelectedCategoryFilter('All');
              setBudgetFilter('All');
              setSortConfig({ key: 'createdAt', direction: 'desc' });
            }}
            className="h-10 rounded-md border border-slate-200 bg-white px-4 text-[10px] font-black uppercase tracking-wide text-slate-500 hover:text-[#12335f]"
          >
            Reset Filters
          </button>
        </div>

        {(searchText || selectedCategoryFilter !== 'All' || budgetFilter !== 'All') && (
          <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-500">
            <span className="text-slate-900">Active filters:</span>
            {searchText && <span className="rounded bg-slate-100 px-2 py-1">Search: {searchText}</span>}
            {selectedCategoryFilter !== 'All' && <span className="rounded bg-slate-100 px-2 py-1">Category: {selectedCategoryFilter}</span>}
            {budgetFilter !== 'All' && <span className="rounded bg-slate-100 px-2 py-1">Budget: {budgetFilter.replace(/_/g, ' ')}</span>}
          </div>
        )}

        {/* Tenders Table */}
        <div className={cn('overflow-x-auto border border-[#dadce0] rounded-lg bg-white shadow-sm', viewMode === 'grid' && 'hidden')}>
          <table className="w-full text-left border-collapse min-w-[960px]">
            <thead className="bg-white border-b border-[#dadce0]">
              <tr>
                <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500 w-20">Sr. No.</th>
                <th className="px-4 py-3 w-32"><SortHeader label="Tender ID" sortKey="tenderId" /></th>
                <th className="px-4 py-3"><SortHeader label="Title" sortKey="title" /></th>
                <th className="px-4 py-3"><SortHeader label="Category" sortKey="category" /></th>
                <th className="px-4 py-3 text-right"><SortHeader label="Budget" sortKey="budget" className="justify-end" /></th>
                <th className="px-4 py-3 text-center"><SortHeader label="Bids" sortKey="bids" /></th>
                <th className="px-4 py-3"><SortHeader label="Closes" sortKey="closes" /></th>
                <th className="px-4 py-3"><SortHeader label="Status" sortKey="status" /></th>
                <th className="px-4 py-3 text-xs font-bold uppercase text-slate-500 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#dadce0]">
              {loading ? (
                [1, 2, 3].map(i => (
                  <tr key={i} className="animate-pulse">
                    <td colSpan={9} className="px-8 py-10"><div className="h-4 bg-slate-50 rounded w-full"></div></td>
                  </tr>
                ))
              ) : pagedTenders.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-8 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-30">
                      <FileText className="h-12 w-12" />
                      <p className="text-sm font-bold uppercase tracking-widest">No Tenders Found</p>
                    </div>
                  </td>
                </tr>
              ) : (
                pagedTenders.map((tender, index) => (
                  <tr key={tender.id} className="hover:bg-slate-50/30 transition-colors">
                    <td className="px-4 py-4 text-xs font-mono font-bold text-slate-400">
                      {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                    </td>
                    <td className="px-4 py-4 text-xs font-mono text-slate-500">
                      <EntityIdLink label={tender.tenderId || `T-2026-01${tender.id}`} id={tender.id} size="sm" onClick={() => setSelectedTender(tender)} />
                    </td>
                    <td className="px-4 py-4 w-64">
                      <p className="text-[15px] font-bold text-slate-900 leading-snug">{tender.title}</p>
                      <p className="mt-1 line-clamp-2 text-xs font-medium leading-relaxed text-slate-500">
                        {tender.description || 'No tender scope summary captured yet.'}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <span className="inline-flex max-w-[180px] truncate text-xs font-bold text-slate-900 px-3 py-1.5 rounded-md border border-[#dadce0] bg-slate-50 whitespace-nowrap">
                        {tender.category}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[15px] font-bold text-slate-900 text-right">
                      <span className="block">Rs. {tender.budget?.toLocaleString('en-IN')}</span>
                      <span className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Estimated</span>
                    </td>
                    <td className="px-4 py-4 text-base font-medium text-slate-900 text-center">
                      <span className={cn(
                        'inline-flex min-w-9 justify-center rounded-md border px-2.5 py-1 text-xs font-black',
                        Number(tender.bidsCount || 0) > 0 ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-amber-200 bg-amber-50 text-amber-700'
                      )}>
                        {tender.bidsCount || 0}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-[15px] font-medium text-slate-500">
                      <DeadlineBadge closesAt={tender.closesAt} />
                      <p className="mt-1 text-[10px] font-semibold text-slate-400">
                        {tender.closesAt ? new Date(tender.closesAt).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : ''}
                      </p>
                    </td>
                    <td className="px-4 py-4">
                      <TenderStatusBadge status={tender.status} />
                    </td>
                    <td className="px-4 py-4 text-right">
                      {renderTenderActions(tender)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {viewMode === 'grid' && pagedTenders.length === 0 && (
          <div className="rounded-lg border border-[#dadce0] bg-white px-8 py-20 text-center shadow-sm">
            <div className="flex flex-col items-center gap-4 opacity-30">
              <FileText className="h-12 w-12" />
              <p className="text-sm font-bold uppercase tracking-widest">No Tenders Found</p>
            </div>
          </div>
        )}

        {viewMode === 'grid' && pagedTenders.length > 0 && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pagedTenders.map((tender, index) => (
              <div key={tender.id} className="rounded-lg border border-[#dadce0] bg-white p-4 shadow-sm transition hover:shadow-md">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                      Sr. No. {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                    </p>
                    <div className="mt-1">
                      <EntityIdLink
                        label={tender.tenderId || `T-2026-01${tender.id}`}
                        id={tender.id}
                        size="sm"
                        onClick={() => setSelectedTender(tender)}
                      />
                    </div>
                  </div>
                  <TenderStatusBadge status={tender.status} />
                </div>

                <h3 className="mt-4 line-clamp-2 text-base font-black leading-snug text-slate-950">{tender.title}</h3>
                <p className="mt-2 line-clamp-3 text-xs font-medium leading-relaxed text-slate-500">
                  {tender.description || 'No tender scope summary captured yet.'}
                </p>

                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="font-black uppercase tracking-widest text-slate-400">Category</p>
                    <p className="mt-1 font-bold text-slate-900">{tender.category || '-'}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="font-black uppercase tracking-widest text-slate-400">Budget</p>
                    <p className="mt-1 font-bold text-slate-900">Rs. {tender.budget?.toLocaleString('en-IN')}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="font-black uppercase tracking-widest text-slate-400">Bids</p>
                    <p className={cn('mt-1 font-bold', Number(tender.bidsCount || 0) > 0 ? 'text-emerald-700' : 'text-amber-700')}>{tender.bidsCount || 0}</p>
                  </div>
                  <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
                    <p className="font-black uppercase tracking-widest text-slate-400">Closes</p>
                    <div className="mt-1"><DeadlineBadge closesAt={tender.closesAt} /></div>
                  </div>
                </div>

                <div className="mt-4 flex justify-end border-t border-slate-100 pt-4">
                  {renderTenderActions(tender)}
                </div>
              </div>
            ))}
          </div>
        )}

        {pagedTenders.length > 0 && (
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="tenders" />
        )}

        {isModalOpen && (
          <TenderCreationWizard
            draft={newTender}
            step={tenderWizardStep}
            submitting={submitting}
            isUploading={isUploading}
            onStepChange={setTenderWizardStep}
            onChange={(patch) => setNewTender(prev => ({ ...prev, ...patch }))}
            onClose={() => setIsModalOpen(false)}
            onSubmit={handleCreateTender}
            onUpload={handleFileUpload}
            onPreviewDocument={handlePreviewDocument}
          />
        )}
        {selectedTender && (
          <TenderDetailsModal
            tender={selectedTender}
            onClose={() => setSelectedTender(null)}
            onEdit={() => {
              setEditingTender(selectedTender);
            }}
            onDelete={() => handleDeleteTender(selectedTender)}
            onViewBids={() => router.push(`/buyer/tenders/${selectedTender.id}/evaluate`)}
            onPreviewDocument={handlePreviewDocument}
          />
        )}
        {editingTender && (
          <TenderEditModal
            tender={editingTender}
            saving={savingEdit}
            onClose={() => setEditingTender(null)}
            onSubmit={handleUpdateTender}
            onPreviewDocument={handlePreviewDocument}
          />
        )}
        <DocumentPreviewModal previewDocument={previewDocument} onClose={() => setPreviewDocument(null)} />
      </div>
    </div>
  );
}

function TenderCreationWizard({
  draft,
  step,
  submitting,
  isUploading,
  onStepChange,
  onChange,
  onClose,
  onSubmit,
  onUpload,
  onPreviewDocument
}: {
  draft: TenderDraft;
  step: number;
  submitting: boolean;
  isUploading: boolean;
  onStepChange: (step: number) => void;
  onChange: (patch: Partial<TenderDraft>) => void;
  onClose: () => void;
  onSubmit: (event: React.FormEvent) => void;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
  onPreviewDocument: (url: string, label: string) => void;
}) {
  const steps = [
    { title: 'Basic Information', icon: FileText },
    { title: 'Items / BOQ', icon: List },
    { title: 'Delivery Details', icon: CalendarDays },
    { title: 'Commercial Details', icon: IndianRupee },
    { title: 'Timeline', icon: Clock },
    { title: 'Documents', icon: UploadCloud },
    { title: 'Eligibility', icon: ShieldCheck },
    { title: 'Evaluation', icon: ClipboardCheck },
    { title: 'Buyer Contact', icon: UserRound },
    { title: 'Internal Approval', icon: CheckSquare },
    { title: 'Review & Publish', icon: Eye }
  ];
  const errors = useMemo(() => getTenderDraftErrors(draft), [draft]);
  const suggestions = useMemo(() => getCategorySuggestions(draft.category), [draft.category]);
  const gstAmount = Number(draft.budget || 0) * (Number(draft.gstRate || 0) / 100);
  const currentStep = steps[step] || steps[0];
  const CurrentIcon = currentStep.icon;

  const inputClass = (hasError?: boolean) => cn(
    'w-full rounded-md border bg-white px-3 py-2.5 text-sm font-medium text-slate-900 outline-none transition focus:ring-2 focus:ring-[#12335f]/20',
    hasError ? 'border-red-400' : 'border-slate-200'
  );
  const label = (text: string, required = false) => (
    <label className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
      {text}{required && <span className="ml-1 text-red-500">*</span>}
    </label>
  );
  const fieldError = (message?: string) => message ? <p className="text-[11px] font-semibold text-red-500">{message}</p> : null;
  const updateItem = (id: string, patch: Partial<BoqLineItem>) => {
    onChange({ items: draft.items.map(item => item.id === id ? { ...item, ...patch } : item) });
  };
  const updateDocument = (id: string, patch: Partial<TenderDocumentRow>) => {
    onChange({ documents: draft.documents.map(doc => doc.id === id ? { ...doc, ...patch } : doc) });
  };
  const updateMilestone = (id: string, patch: Partial<PaymentMilestone>) => {
    onChange({ milestones: draft.milestones.map(milestone => milestone.id === id ? { ...milestone, ...patch } : milestone) });
  };
  const importBoqFile = (file?: File) => {
    if (!file) return;
    const extension = file.name.split('.').pop()?.toLowerCase();
    if (extension && !['csv', 'txt'].includes(extension)) {
      toast.error('Please download and import the CSV BOQ template. Excel can open and save this template as CSV.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const importedItems = mapBoqCsvRows(String(reader.result || ''));
      if (importedItems.length === 0) {
        toast.error('No valid BOQ rows found. Use the downloaded template headers and keep Item Name and Quantity filled.');
        return;
      }
      const boqDoc = draft.documents.find(doc => doc.label.includes('BOQ'));
      if (boqDoc) updateDocument(boqDoc.id, { fileName: file.name, version: boqDoc.fileName ? boqDoc.version + 1 : 1 });
      onChange({ items: importedItems });
      toast.success(`${importedItems.length} BOQ item${importedItems.length === 1 ? '' : 's'} imported from template`);
    };
    reader.onerror = () => toast.error('Unable to read BOQ template file');
    reader.readAsText(file);
  };
  const captureDocumentFile = (id: string, file?: File) => {
    if (!file) return;
    const target = draft.documents.find(doc => doc.id === id);
    updateDocument(id, { fileName: file.name, version: target?.fileName ? (target.version || 1) + 1 : 1 });
  };
  const firstSpecDocument = draft.documents[0];

  const renderBasic = () => (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-2 lg:col-span-2">
        {label('Tender Title', true)}
        <input value={draft.title} onChange={(e) => onChange({ title: e.target.value })} className={inputClass(Boolean(errors.title))} placeholder="Supply, installation, and commissioning of..." />
        {fieldError(errors.title)}
      </div>
      <div className="space-y-2">
        {label('Tender Number / Auto-generated number', true)}
        <input value={draft.tenderNumber} onChange={(e) => onChange({ tenderNumber: e.target.value })} className={inputClass(Boolean(errors.tenderNumber))} />
      </div>
      <div className="space-y-2">
        {label('Tender Type', true)}
        <select value={draft.tenderType} onChange={(e) => onChange({ tenderType: e.target.value })} className={inputClass(Boolean(errors.tenderType))}>
          {['Open Tender', 'Limited Tender', 'Single Tender', 'Global Tender', 'Expression of Interest', 'Request for Quotation'].map(option => <option key={option}>{option}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {label('Procurement Category', true)}
        <select value={draft.category} onChange={(e) => onChange({ category: e.target.value })} className={inputClass(Boolean(errors.category))}>
          <option value="">Select category</option>
          {TENDER_CATEGORY_OPTIONS.map(category => <option key={category} value={category}>{category}</option>)}
        </select>
        {fieldError(errors.category)}
      </div>
      <div className="space-y-2">
        {label('Sub Category')}
        <input value={draft.subCategory} onChange={(e) => onChange({ subCategory: e.target.value })} className={inputClass()} placeholder="Example: networking switches, furniture, AMC" />
      </div>
      <div className="space-y-2">
        {label('Department / Buyer Department', true)}
        <input value={draft.department} onChange={(e) => onChange({ department: e.target.value })} className={inputClass(Boolean(errors.department))} placeholder="Procurement, IT, Operations, Works..." />
        {fieldError(errors.department)}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          {label('Tender Mode')}
          <select value={draft.tenderMode} onChange={(e) => onChange({ tenderMode: e.target.value })} className={inputClass()}>
            {['Single Bid', 'Two Bid', 'Three Packet', 'Reverse Auction enabled'].map(option => <option key={option}>{option}</option>)}
          </select>
        </div>
        <div className="space-y-2">
          {label('Tender Visibility')}
          <select value={draft.visibility} onChange={(e) => onChange({ visibility: e.target.value })} className={inputClass()}>
            {['Public marketplace', 'Verified suppliers', 'Invited suppliers only', 'MSME suppliers only'].map(option => <option key={option}>{option}</option>)}
          </select>
        </div>
      </div>
      <div className="space-y-2 lg:col-span-2">
        {label('Short Description', true)}
        <textarea value={draft.shortDescription} onChange={(e) => onChange({ shortDescription: e.target.value })} className={inputClass(Boolean(errors.shortDescription))} rows={3} placeholder="Concise business need and procurement outcome." />
        {fieldError(errors.shortDescription)}
      </div>
      <div className="space-y-2 lg:col-span-2">
        {label('Detailed Scope of Work', true)}
        <textarea value={draft.scopeOfWork} onChange={(e) => onChange({ scopeOfWork: e.target.value })} className={inputClass(Boolean(errors.scopeOfWork))} rows={5} placeholder="Detailed deliverables, standards, acceptance criteria, dependencies, exclusions, and site constraints." />
        {fieldError(errors.scopeOfWork)}
      </div>
      <div className="space-y-2 lg:col-span-2">
        {label('Purpose / Objective')}
        <textarea value={draft.purpose} onChange={(e) => onChange({ purpose: e.target.value })} className={inputClass()} rows={3} placeholder="Why this tender is being floated and the expected business outcome." />
      </div>
      <div className="rounded-md border border-blue-100 bg-blue-50 p-4 lg:col-span-2">
        <p className="text-xs font-black uppercase tracking-[0.16em] text-[#12335f]">Category-based suggestions</p>
        <p className="mt-2 text-sm font-medium text-slate-700">{suggestions.eligibility}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          {suggestions.documents.map(doc => <span key={doc} className="rounded-md bg-white px-3 py-1 text-xs font-bold text-[#12335f] ring-1 ring-blue-100">{doc}</span>)}
        </div>
      </div>
    </div>
  );

  const renderItems = () => (
    <div className="space-y-4">
      {fieldError(errors.items)}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-black text-slate-950">BOQ line items</h3>
          <p className="text-xs font-medium text-slate-500">Add each product or service requirement with specification, delivery date, and brand policy.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={downloadBoqTemplate} className="inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50">
            <Download className="h-4 w-4" /> Download BOQ Template
          </button>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 bg-white px-3 py-2 text-xs font-black text-slate-700 shadow-sm hover:bg-slate-50">
            <FileUp className="h-4 w-4" /> Import Filled Template
            <input type="file" accept=".csv,.txt" className="hidden" onChange={(e) => importBoqFile(e.target.files?.[0])} />
          </label>
          <button type="button" onClick={() => onChange({ items: [...draft.items, emptyBoqItem()] })} className="inline-flex items-center gap-2 rounded-md bg-[#12335f] px-3 py-2 text-xs font-black text-white">
            <Plus className="h-4 w-4" /> Add item
          </button>
        </div>
      </div>
      <div className="rounded-md border border-blue-100 bg-blue-50 px-4 py-3 text-xs font-semibold text-slate-700">
        Download the template, fill it in Excel, then save or export it as CSV before importing. Required columns are Item / Service Name and Quantity.
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-[1100px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            <tr>
              <th className="px-3 py-3">Item / Service</th>
              <th className="px-3 py-3">Description / Specification</th>
              <th className="px-3 py-3">Qty</th>
              <th className="px-3 py-3">Unit</th>
              <th className="px-3 py-3">Delivery Date</th>
              <th className="px-3 py-3">Brand Policy</th>
              <th className="px-3 py-3">Spec File</th>
              <th className="px-3 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {draft.items.map(item => (
              <tr key={item.id} className="align-top">
                <td className="px-3 py-3"><input value={item.name} onChange={(e) => updateItem(item.id, { name: e.target.value })} className={inputClass()} placeholder="Voltage stabilizer" /></td>
                <td className="px-3 py-3">
                  <textarea value={item.description} onChange={(e) => updateItem(item.id, { description: e.target.value })} className={inputClass()} rows={2} placeholder="Functional and technical specification" />
                  <input value={item.technicalSpecification} onChange={(e) => updateItem(item.id, { technicalSpecification: e.target.value })} className={cn(inputClass(), 'mt-2')} placeholder="Technical specification / compliance notes" />
                </td>
                <td className="px-3 py-3"><input type="number" min="0" value={item.quantity} onChange={(e) => updateItem(item.id, { quantity: e.target.value })} className={inputClass()} /></td>
                <td className="px-3 py-3">
                  <select value={item.unit} onChange={(e) => updateItem(item.id, { unit: e.target.value })} className={inputClass()}>
                    {QUANTITY_UNITS.map(unit => <option key={unit.value} value={unit.value}>{unit.label}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3"><input type="date" value={item.deliveryDate} onChange={(e) => updateItem(item.id, { deliveryDate: e.target.value })} className={inputClass()} /></td>
                <td className="px-3 py-3">
                  <select value={item.brandPolicy} onChange={(e) => updateItem(item.id, { brandPolicy: e.target.value })} className={inputClass()}>
                    {['Equivalent or better allowed', 'OEM only', 'No brand restriction', 'Specific make with justification'].map(option => <option key={option}>{option}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-slate-300 px-3 py-2 font-bold text-slate-600">
                    <Paperclip className="h-4 w-4" /> {item.specificationFileName || 'Attach'}
                    <input type="file" className="hidden" onChange={(e) => updateItem(item.id, { specificationFileName: e.target.files?.[0]?.name || '' })} />
                  </label>
                </td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-1">
                    <button type="button" title="Duplicate item" onClick={() => onChange({ items: [...draft.items, { ...item, id: createId(), name: `${item.name} copy` }] })} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><Copy className="h-4 w-4" /></button>
                    <button type="button" title="Delete item" onClick={() => onChange({ items: draft.items.length > 1 ? draft.items.filter(row => row.id !== item.id) : draft.items })} className="rounded-md p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderDelivery = () => (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-2 lg:col-span-2">
        {label('Delivery Location', true)}
        <input value={draft.deliveryLocation} onChange={(e) => onChange({ deliveryLocation: e.target.value })} className={inputClass(Boolean(errors.deliveryLocation))} placeholder="Full delivery or execution address" />
        {fieldError(errors.deliveryLocation)}
      </div>
      <div className="space-y-2">
        {label('Delivery Type', true)}
        <select value={draft.deliveryType} onChange={(e) => onChange({ deliveryType: e.target.value })} className={inputClass(Boolean(errors.deliveryType))}>
          <option value="">Select delivery type</option>
          {DELIVERY_TYPES.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {fieldError(errors.deliveryType)}
      </div>
      <div className="space-y-2">
        {label('Delivery Timeline')}
        <input value={draft.deliveryTimeline} onChange={(e) => onChange({ deliveryTimeline: e.target.value })} className={inputClass()} placeholder="Within 30 days from PO" />
      </div>
      <ToggleRow labelText="Installation Required" checked={draft.installationRequired} onChange={(checked) => onChange({ installationRequired: checked })} />
      <ToggleRow labelText="Training Required" checked={draft.trainingRequired} onChange={(checked) => onChange({ trainingRequired: checked })} />
      <div className="space-y-2 lg:col-span-2">
        {label('Special Instructions')}
        <textarea value={draft.specialInstructions} onChange={(e) => onChange({ specialInstructions: e.target.value })} className={inputClass()} rows={4} placeholder="Site access, packaging, delivery window, installation dependencies, inspection instructions." />
      </div>
    </div>
  );

  const renderCommercial = () => (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-2">
        {label('Estimated Budget in INR', true)}
        <input type="number" value={draft.budget} onChange={(e) => onChange({ budget: e.target.value })} className={inputClass(Boolean(errors.budget))} placeholder="2500000" />
        {fieldError(errors.budget)}
      </div>
      <div className="space-y-2">
        {label('Currency')}
        <select value={draft.currency} onChange={(e) => onChange({ currency: e.target.value })} className={inputClass()}>
          {['INR', 'USD', 'EUR'].map(option => <option key={option}>{option}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {label('Price Type')}
        <select value={draft.priceType} onChange={(e) => onChange({ priceType: e.target.value })} className={inputClass()}>
          {['Firm fixed price', 'Variable price', 'Rate contract', 'Item-wise price', 'Milestone-based'].map(option => <option key={option}>{option}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {label('Tax Type')}
        <select value={draft.taxType} onChange={(e) => onChange({ taxType: e.target.value })} className={inputClass()}>
          {['GST', 'IGST', 'Exempt', 'Composite tax'].map(option => <option key={option}>{option}</option>)}
        </select>
      </div>
      <ToggleRow labelText="GST Included" checked={draft.gstIncluded} onChange={(checked) => onChange({ gstIncluded: checked })} />
      <div className="space-y-2">
        {label('Auto GST calculation')}
        <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm font-black text-slate-900">
          GST {draft.gstRate}%: Rs. {Math.round(gstAmount).toLocaleString('en-IN')}
        </div>
      </div>
      <div className="space-y-2 lg:col-span-3">
        {label('Payment Terms', true)}
        <select value={draft.paymentTerms} onChange={(e) => onChange({ paymentTerms: e.target.value })} className={inputClass(Boolean(errors.paymentTerms))}>
          <option value="">Select payment terms</option>
          {PAYMENT_TERMS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        {fieldError(errors.paymentTerms)}
      </div>
      <ToggleRow labelText="EMD Required" checked={draft.emdRequired} onChange={(checked) => onChange({ emdRequired: checked })} />
      <div className="space-y-2">
        {label('EMD Amount')}
        <input type="number" value={draft.emdAmount} onChange={(e) => onChange({ emdAmount: e.target.value })} disabled={!draft.emdRequired} className={inputClass(Boolean(errors.emdAmount))} />
        {fieldError(errors.emdAmount)}
      </div>
      <ToggleRow labelText="Performance Security Required" checked={draft.performanceSecurityRequired} onChange={(checked) => onChange({ performanceSecurityRequired: checked })} />
      <div className="space-y-2">
        {label('Performance Security Amount')}
        <input type="number" value={draft.performanceSecurityAmount} onChange={(e) => onChange({ performanceSecurityAmount: e.target.value })} disabled={!draft.performanceSecurityRequired} className={inputClass(Boolean(errors.performanceSecurityAmount))} />
        {fieldError(errors.performanceSecurityAmount)}
      </div>
      <div className="space-y-3 lg:col-span-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-black text-slate-950">Payment milestone configuration</h3>
            <p className="text-xs font-medium text-slate-500">Define payable percentages and release triggers.</p>
          </div>
          <button type="button" onClick={() => onChange({ milestones: [...draft.milestones, emptyMilestone()] })} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Add milestone</button>
        </div>
        {draft.milestones.map(milestone => (
          <div key={milestone.id} className="grid gap-3 rounded-md border border-slate-200 p-3 lg:grid-cols-[1fr_120px_1.5fr_auto]">
            <input value={milestone.label} onChange={(e) => updateMilestone(milestone.id, { label: e.target.value })} className={inputClass()} placeholder="Advance / delivery / acceptance" />
            <input type="number" value={milestone.percentage} onChange={(e) => updateMilestone(milestone.id, { percentage: e.target.value })} className={inputClass()} placeholder="%" />
            <input value={milestone.trigger} onChange={(e) => updateMilestone(milestone.id, { trigger: e.target.value })} className={inputClass()} placeholder="Payment trigger" />
            <button type="button" onClick={() => onChange({ milestones: draft.milestones.length > 1 ? draft.milestones.filter(row => row.id !== milestone.id) : draft.milestones })} className="rounded-md p-2 text-red-500 hover:bg-red-50"><Trash2 className="h-4 w-4" /></button>
          </div>
        ))}
      </div>
    </div>
  );

  const renderTimeline = () => (
    <div className="space-y-4">
      {fieldError(errors.timeline)}
      <div className="grid gap-5 lg:grid-cols-3">
        {[
          ['Publish Date', 'publishDate'],
          ['Bid Start Date', 'bidStartDate'],
          ['Bid Closing Date', 'bidClosingDate'],
          ['Technical Evaluation Date', 'technicalEvaluationDate'],
          ['Financial Evaluation Date', 'financialEvaluationDate'],
          ['Award Date', 'awardDate']
        ].map(([title, key]) => (
          <div key={key} className="space-y-2">
            {label(title, key === 'bidClosingDate')}
            <input type="date" value={String(draft[key as keyof TenderDraft] || '')} onChange={(e) => onChange({ [key]: e.target.value } as Partial<TenderDraft>)} className={inputClass(Boolean(errors.timeline))} />
          </div>
        ))}
        <div className="space-y-2">
          {label('Bid Closing Time', true)}
          <input type="time" value={draft.bidClosingTime} onChange={(e) => onChange({ bidClosingTime: e.target.value })} className={inputClass(Boolean(errors.timeline))} />
        </div>
      </div>
      <div className="rounded-md border border-amber-200 bg-amber-50 p-4 text-sm font-medium text-amber-900">
        Dates are validated instantly in chronological order from publish date through award date.
      </div>
    </div>
  );

  const renderDocuments = () => (
    <div className="space-y-5">
      <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="rounded-md bg-white p-3 text-[#12335f] shadow-sm"><UploadCloud className="h-5 w-5" /></div>
            <div>
              <h3 className="text-sm font-black text-slate-950">Tender Specification File</h3>
              <p className="text-xs font-medium text-slate-500">Upload the primary file that suppliers should review first.</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {draft.documentUrl && (
              <button type="button" onClick={() => onPreviewDocument(draft.documentUrl, 'Tender Specification File')} className="rounded-md border border-slate-200 px-3 py-2 text-xs font-black text-slate-700">Preview</button>
            )}
            <label className="inline-flex cursor-pointer items-center gap-2 rounded-md bg-[#12335f] px-3 py-2 text-xs font-black text-white">
              <Upload className="h-4 w-4" /> {isUploading ? 'Uploading...' : draft.documentUrl ? 'Change file' : 'Upload file'}
              <input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx" className="hidden" onChange={(event) => {
                captureDocumentFile(firstSpecDocument?.id || '', event.target.files?.[0]);
                onUpload(event);
              }} disabled={isUploading} />
            </label>
          </div>
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border border-slate-200">
        <table className="min-w-[900px] w-full text-left text-xs">
          <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">
            <tr><th className="px-3 py-3">Document</th><th className="px-3 py-3">Requirement</th><th className="px-3 py-3">Version</th><th className="px-3 py-3">File preview</th><th className="px-3 py-3">Upload</th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {draft.documents.map(doc => (
              <tr key={doc.id}>
                <td className="px-3 py-3 font-bold text-slate-900">{doc.label}</td>
                <td className="px-3 py-3">
                  <select value={doc.requirement} onChange={(e) => updateDocument(doc.id, { requirement: e.target.value as TenderDocumentRow['requirement'] })} className={inputClass()}>
                    {['Mandatory', 'Optional', 'Not Required'].map(option => <option key={option}>{option}</option>)}
                  </select>
                </td>
                <td className="px-3 py-3 font-black text-slate-700">v{doc.version}</td>
                <td className="px-3 py-3 text-slate-600">{doc.fileName || 'No file attached'}</td>
                <td className="px-3 py-3">
                  <label className="inline-flex cursor-pointer items-center gap-2 rounded-md border border-slate-200 px-3 py-2 font-black text-slate-700">
                    <Paperclip className="h-4 w-4" /> Select
                    <input type="file" multiple className="hidden" onChange={(e) => captureDocumentFile(doc.id, e.target.files?.[0])} />
                  </label>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const renderEligibility = () => (
    <div className="grid gap-5 lg:grid-cols-2">
      {[
        ['MSME preference', 'msmePreference'],
        ['Startup preference', 'startupPreference'],
        ['SHG preference', 'shgPreference'],
        ['Women-owned business preference', 'womenOwnedPreference'],
        ['Local supplier preference', 'localSupplierPreference'],
        ['GST mandatory', 'gstMandatory'],
        ['PAN mandatory', 'panMandatory']
      ].map(([title, key]) => (
        <ToggleRow key={key} labelText={title} checked={Boolean(draft[key as keyof TenderDraft])} onChange={(checked) => onChange({ [key]: checked } as Partial<TenderDraft>)} />
      ))}
      <div className="space-y-2">
        {label('Minimum experience required')}
        <input value={draft.minExperience} onChange={(e) => onChange({ minExperience: e.target.value })} className={inputClass()} placeholder="Example: 3 years in similar work" />
      </div>
      <div className="space-y-2">
        {label('Minimum turnover required')}
        <input value={draft.minTurnover} onChange={(e) => onChange({ minTurnover: e.target.value })} className={inputClass()} placeholder="Example: Rs. 50 lakh average annual turnover" />
      </div>
      <div className="space-y-2 lg:col-span-2">
        {label('Required certifications')}
        <textarea value={draft.requiredCertifications} onChange={(e) => onChange({ requiredCertifications: e.target.value })} className={inputClass()} rows={3} placeholder="ISO, BIS, OEM authorization, safety license, statutory registrations." />
      </div>
    </div>
  );

  const renderEvaluation = () => (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-2">
        {label('Technical weightage', true)}
        <input type="number" value={draft.technicalWeightage} onChange={(e) => onChange({ technicalWeightage: e.target.value })} className={inputClass(Boolean(errors.technicalWeightage))} />
        {fieldError(errors.technicalWeightage)}
      </div>
      <div className="space-y-2">
        {label('Price weightage', true)}
        <input type="number" value={draft.priceWeightage} onChange={(e) => onChange({ priceWeightage: e.target.value })} className={inputClass(Boolean(errors.technicalWeightage))} />
      </div>
      <div className="space-y-2">
        {label('Evaluation method')}
        <select value={draft.evaluationMethod} onChange={(e) => onChange({ evaluationMethod: e.target.value })} className={inputClass()}>
          {['L1 method', 'L2 / L3 comparison', 'QCBS method', 'Technical compliance then L1', 'Reverse auction'].map(option => <option key={option}>{option}</option>)}
        </select>
      </div>
      <div className="space-y-2">
        {label('Experience score')}
        <input type="number" value={draft.experienceScore} onChange={(e) => onChange({ experienceScore: e.target.value })} className={inputClass()} />
      </div>
      <div className="space-y-2">
        {label('Certification score')}
        <input type="number" value={draft.certificationScore} onChange={(e) => onChange({ certificationScore: e.target.value })} className={inputClass()} />
      </div>
      <div className="space-y-2">
        {label('Compliance score')}
        <input type="number" value={draft.complianceScore} onChange={(e) => onChange({ complianceScore: e.target.value })} className={inputClass()} />
      </div>
      <div className="rounded-md border border-blue-100 bg-blue-50 p-4 text-sm font-medium text-slate-700 lg:col-span-3">
        {suggestions.evaluation}
      </div>
    </div>
  );

  const renderContact = () => (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="space-y-2">{label('Contact Name', true)}<input value={draft.contactName} onChange={(e) => onChange({ contactName: e.target.value })} className={inputClass(Boolean(errors.contactName))} />{fieldError(errors.contactName)}</div>
      <div className="space-y-2">{label('Email', true)}<input value={draft.contactEmail} onChange={(e) => onChange({ contactEmail: e.target.value })} className={inputClass(Boolean(errors.contactEmail))} />{fieldError(errors.contactEmail)}</div>
      <div className="space-y-2">{label('Mobile Number', true)}<input value={draft.contactMobile} onChange={(e) => onChange({ contactMobile: e.target.value })} className={inputClass(Boolean(errors.contactMobile))} />{fieldError(errors.contactMobile)}</div>
      <div className="space-y-2">{label('Phone / Landline')}<input value={draft.contactPhone} onChange={(e) => onChange({ contactPhone: e.target.value })} className={inputClass()} /></div>
      <div className="space-y-2">{label('Department-wise contact')}<input value={draft.departmentContact} onChange={(e) => onChange({ departmentContact: e.target.value })} className={inputClass()} /></div>
      <div className="space-y-2">{label('Escalation contact')}<input value={draft.escalationContact} onChange={(e) => onChange({ escalationContact: e.target.value })} className={inputClass()} /></div>
    </div>
  );

  const renderApproval = () => (
    <div className="grid gap-5 lg:grid-cols-2">
      <ToggleRow labelText="Approval Required" checked={draft.approvalRequired} onChange={(checked) => onChange({ approvalRequired: checked })} />
      <div className="space-y-2">{label('Approval Status')}<select value={draft.approvalStatus} onChange={(e) => onChange({ approvalStatus: e.target.value })} className={inputClass()}>{['Draft', 'Pending department approval', 'Pending finance approval', 'Approved', 'Returned for correction'].map(option => <option key={option}>{option}</option>)}</select></div>
      <div className="space-y-2">{label('Approver Name', draft.approvalRequired)}<input value={draft.approverName} onChange={(e) => onChange({ approverName: e.target.value })} disabled={!draft.approvalRequired} className={inputClass(Boolean(errors.approverName))} />{fieldError(errors.approverName)}</div>
      <div className="space-y-2">{label('Multi-level approval chain')}<input value={draft.approvalChain} onChange={(e) => onChange({ approvalChain: e.target.value })} className={inputClass()} /></div>
      <div className="space-y-2 lg:col-span-2">{label('Approver Remarks')}<textarea value={draft.approverRemarks} onChange={(e) => onChange({ approverRemarks: e.target.value })} className={inputClass()} rows={4} /></div>
    </div>
  );

  const renderReview = () => {
    const rows = [
      ['Basic details', `${draft.tenderNumber} - ${draft.title || 'Untitled'} (${draft.category || 'No category'})`],
      ['BOQ summary', `${draft.items.filter(item => item.name.trim()).length} item(s), first unit: ${draft.items[0]?.unit || '-'}`],
      ['Delivery summary', `${draft.deliveryLocation || '-'} / ${draft.deliveryType || '-'}`],
      ['Budget summary', `${draft.currency} ${Number(draft.budget || 0).toLocaleString('en-IN')} (${draft.gstIncluded ? 'GST included' : 'GST excluded'})`],
      ['Timeline summary', `Close: ${draft.bidClosingDate || '-'} ${draft.bidClosingTime || ''}`],
      ['Eligibility criteria', `${draft.msmePreference ? 'MSME preferred, ' : ''}${draft.gstMandatory ? 'GST mandatory, ' : ''}${draft.panMandatory ? 'PAN mandatory' : ''}`],
      ['Evaluation criteria', `${draft.evaluationMethod}; Technical ${draft.technicalWeightage}%, Price ${draft.priceWeightage}%`],
      ['Uploaded documents', `${draft.documents.filter(doc => doc.fileName).length} attached, ${draft.documents.filter(doc => doc.requirement === 'Mandatory').length} mandatory`],
      ['Approval status', `${draft.approvalStatus}; ${draft.approvalRequired ? draft.approvalChain : 'Approval not required'}`]
    ];
    return (
      <div className="space-y-5">
        {Object.keys(errors).length > 0 && (
          <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">
            Complete the highlighted required fields before publishing. First issue: {Object.values(errors)[0]}
          </div>
        )}
        <div className="grid gap-3 lg:grid-cols-2">
          {rows.map(([title, value]) => (
            <div key={title} className="rounded-md border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">{title}</p>
              <p className="mt-2 text-sm font-bold text-slate-900">{value}</p>
            </div>
          ))}
        </div>
        <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">Tender preview</p>
          <pre className="mt-3 max-h-72 overflow-auto whitespace-pre-wrap text-xs font-medium leading-relaxed text-slate-700">{buildTenderDescription(draft)}</pre>
        </div>
      </div>
    );
  };

  const renderStep = () => {
    if (step === 0) return renderBasic();
    if (step === 1) return renderItems();
    if (step === 2) return renderDelivery();
    if (step === 3) return renderCommercial();
    if (step === 4) return renderTimeline();
    if (step === 5) return renderDocuments();
    if (step === 6) return renderEligibility();
    if (step === 7) return renderEvaluation();
    if (step === 8) return renderContact();
    if (step === 9) return renderApproval();
    return renderReview();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/60 p-3 backdrop-blur-sm">
      <div className="mx-auto flex h-full max-w-7xl flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-2xl">
        <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-[#12335f]">Enterprise Tender Creation</p>
              <h2 className="mt-1 text-2xl font-black tracking-tight text-slate-950">Guided tender workflow</h2>
              <p className="mt-1 text-sm font-medium text-slate-500">Structured like GeM, SAP Ariba, e-Tendering, and RFQ portals with complete review before publish.</p>
            </div>
            <button type="button" onClick={onClose} className="rounded-md p-2 text-slate-500 hover:bg-slate-100"><X className="h-5 w-5" /></button>
          </div>
          <div className="grid min-h-0 flex-1 lg:grid-cols-[300px_1fr]">
            <aside className="overflow-y-auto border-r border-slate-200 bg-slate-50 p-4">
              <div className="mb-4 rounded-md bg-white p-3 ring-1 ring-slate-200">
                <div className="flex items-center justify-between text-xs font-black text-slate-600">
                  <span>Progress</span>
                  <span>{Math.round(((step + 1) / steps.length) * 100)}%</span>
                </div>
                <div className="mt-2 h-2 rounded-full bg-slate-100">
                  <div className="h-2 rounded-full bg-[#12335f]" style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
                </div>
              </div>
              <nav className="space-y-1">
                {steps.map((wizardStep, index) => {
                  const Icon = wizardStep.icon;
                  const active = index === step;
                  return (
                    <button
                      key={wizardStep.title}
                      type="button"
                      onClick={() => onStepChange(index)}
                      className={cn('flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-xs font-black transition', active ? 'bg-[#12335f] text-white shadow-sm' : 'text-slate-600 hover:bg-white')}
                    >
                      <Icon className="h-4 w-4" />
                      <span className="flex-1">{index + 1}. {wizardStep.title}</span>
                      {index < step && <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                    </button>
                  );
                })}
              </nav>
            </aside>
            <main className="min-h-0 overflow-y-auto p-5">
              <div className="mb-5 flex items-center gap-3 border-b border-slate-200 pb-4">
                <div className="rounded-md bg-[#12335f] p-3 text-white"><CurrentIcon className="h-5 w-5" /></div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Step {step + 1} of {steps.length}</p>
                  <h3 className="text-xl font-black text-slate-950">{currentStep.title}</h3>
                </div>
              </div>
              {renderStep()}
            </main>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4">
            <button type="button" onClick={() => onStepChange(Math.max(0, step - 1))} disabled={step === 0} className="rounded-md border border-slate-200 px-4 py-2 text-xs font-black text-slate-700 disabled:opacity-40">Back</button>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={onClose} className="px-4 py-2 text-xs font-black uppercase tracking-widest text-slate-500">Cancel</button>
              {step < steps.length - 1 ? (
                <button type="button" onClick={() => onStepChange(Math.min(steps.length - 1, step + 1))} className="inline-flex items-center gap-2 rounded-md bg-[#12335f] px-4 py-2 text-xs font-black text-white">Next <ChevronRight className="h-4 w-4" /></button>
              ) : (
                <>
                  <Button type="submit" data-action="draft" disabled={submitting} className="border border-slate-200 bg-white text-slate-700 hover:bg-slate-50">
                    <Save className="mr-2 h-4 w-4" /> {submitting ? 'Saving...' : 'Save as Draft'}
                  </Button>
                  <Button type="submit" data-action="publish" disabled={submitting || Object.keys(errors).length > 0} className="bg-[#12335f] text-white hover:bg-[#0b2445]">
                    <CheckCircle2 className="mr-2 h-4 w-4" /> {submitting ? 'Publishing...' : 'Publish Tender'}
                  </Button>
                </>
              )}
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function ToggleRow({ labelText, checked, onChange }: { labelText: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-white p-4">
      <span className="text-sm font-black text-slate-800">{labelText}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-[#12335f] focus:ring-[#12335f]" />
    </label>
  );
}

function getTenderStatusMeta(status: Tender['status']) {
  if (status === 'draft') return { label: 'Draft', className: 'bg-slate-100 text-slate-700 border-slate-200' };
  if (status === 'closed') return { label: 'Closed', className: 'bg-slate-100 text-slate-600 border-slate-200' };
  if (status === 'awarded' || status === 'po_generated') return { label: status === 'awarded' ? 'Awarded' : 'PO Generated', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  if (status.includes('evaluation') || status.includes('opening')) return { label: status.replace(/_/g, ' '), className: 'bg-blue-50 text-[#12335f] border-blue-200' };
  if (status === 'bid_submission') return { label: 'Bid Submission', className: 'bg-amber-50 text-amber-700 border-amber-200' };
  return { label: 'Active', className: 'bg-[#e6f4ea] text-[#1e8e3e] border-emerald-200' };
}

function TenderStatusBadge({ status }: { status: Tender['status'] }) {
  const meta = getTenderStatusMeta(status);
  return (
    <span className={cn('inline-flex rounded-md border px-2.5 py-1 text-[10px] font-black uppercase tracking-wide', meta.className)}>
      {meta.label}
    </span>
  );
}

function DeadlineBadge({ closesAt }: { closesAt?: string }) {
  if (!closesAt) {
    return <span className="inline-flex rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-black text-slate-500">Not set</span>;
  }
  const days = Math.ceil((new Date(closesAt).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
  const className = days < 0
    ? 'border-red-200 bg-red-50 text-red-700'
    : days <= 7
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : 'border-blue-100 bg-blue-50 text-[#12335f]';
  const label = days < 0 ? 'Expired' : days === 0 ? 'Closes today' : `${days} day${days === 1 ? '' : 's'}`;
  return <span className={cn('inline-flex rounded-md border px-2.5 py-1 text-xs font-black', className)}>{label}</span>;
}

function TenderInsightCard({
  label,
  value,
  helper,
  icon: Icon,
  tone = 'blue'
}: {
  label: string;
  value: string | number;
  helper: string;
  icon: React.ElementType;
  tone?: 'blue' | 'green' | 'amber' | 'slate';
}) {
  const toneClass = tone === 'green'
    ? 'bg-emerald-50 text-emerald-700'
    : tone === 'amber'
      ? 'bg-amber-50 text-amber-700'
      : tone === 'slate'
        ? 'bg-slate-100 text-slate-700'
        : 'bg-blue-50 text-[#12335f]';
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start gap-3">
        <div className={cn('flex h-10 w-10 shrink-0 items-center justify-center rounded-md', toneClass)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-500">{label}</p>
          <p className="mt-1 break-words text-xl font-black leading-tight text-slate-950">{value}</p>
          <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{helper}</p>
        </div>
      </div>
    </div>
  );
}

function TenderDetailsModal({
  tender,
  onClose,
  onEdit,
  onDelete,
  onViewBids,
  onPreviewDocument
}: {
  tender: Tender;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onViewBids: () => void;
  onPreviewDocument: (url: string, label: string) => void;
}) {
  const closesLabel = tender.closesAt ? new Date(tender.closesAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', hour12: true }) : 'Not available';
  const documentName = tender.documentUrl ? tender.documentUrl.split('/').pop() || 'Specification document' : '';
  const statusMeta = getTenderStatusMeta(tender.status);
  const daysLeft = getTenderDaysLeft(tender.closesAt);
  const hasBids = Number(tender.bidsCount || 0) > 0;
  const createdLabel = tender.createdAt ? new Date(tender.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', hour12: true }) : '-';
  const updatedLabel = tender.updatedAt ? new Date(tender.updatedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short', hour12: true }) : '-';
  const workflowSteps = [
    { label: 'Draft', active: tender.status === 'draft' },
    { label: 'Published', active: ['published', 'bid_submission', 'tech_bid_opening', 'tech_evaluation', 'financial_bid_opening', 'financial_opening', 'financial_evaluation', 'awarded', 'po_generated'].includes(tender.status) },
    { label: 'Bid Review', active: ['bid_submission', 'tech_bid_opening', 'tech_evaluation', 'financial_bid_opening', 'financial_opening', 'financial_evaluation'].includes(tender.status) },
    { label: 'Award / PO', active: ['awarded', 'po_generated'].includes(tender.status) },
    { label: 'Closed', active: tender.status === 'closed' }
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[94vh] w-full max-w-5xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 bg-slate-50 px-6 py-5">
          <div className="min-w-0">
            <p className="font-mono text-[11px] font-black uppercase tracking-wider text-[#12335f]">{tender.tenderId || `T-2026-01${tender.id}`}</p>
            <h2 className="mt-1 break-words text-2xl font-black text-slate-900">{tender.title}</h2>
            <p className="mt-1 text-sm font-semibold text-slate-500">{tender.category || 'General Procurement'} tender record</p>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="max-h-[calc(92vh-76px)] overflow-y-auto p-6">
          <div className="mb-5 grid gap-3 md:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Tender Status</p>
              <span className={cn('mt-2 inline-flex rounded-md border px-3 py-1.5 text-xs font-black uppercase tracking-wide', statusMeta.className)}>
                {statusMeta.label}
              </span>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Bid Response</p>
              <p className={cn('mt-2 text-lg font-black', hasBids ? 'text-emerald-700' : 'text-amber-700')}>{tender.bidsCount || 0} received</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">{hasBids ? 'Supplier response available for evaluation.' : 'No supplier response recorded yet.'}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Closing Window</p>
              <div className="mt-2"><DeadlineBadge closesAt={tender.closesAt} /></div>
              <p className="mt-1 text-xs font-semibold text-slate-500">{closesLabel}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-white p-4">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-slate-400">Estimated Budget</p>
              <p className="mt-2 text-lg font-black text-[#12335f]">Rs. {Number(tender.budget || 0).toLocaleString('en-IN')}</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Buyer declared procurement value.</p>
            </div>
          </div>

          <div className="mb-5 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <div className="flex flex-wrap items-center gap-2">
              {workflowSteps.map((step, index) => (
                <React.Fragment key={step.label}>
                  <span className={cn(
                    'inline-flex items-center rounded-md border px-3 py-1.5 text-[10px] font-black uppercase tracking-wide',
                    step.active ? 'border-blue-200 bg-blue-50 text-[#12335f]' : 'border-slate-200 bg-white text-slate-400'
                  )}>
                    {step.label}
                  </span>
                  {index < workflowSteps.length - 1 && <ChevronRight className="h-3.5 w-3.5 text-slate-300" />}
                </React.Fragment>
              ))}
            </div>
          </div>

          <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr]">
            <div className="space-y-5">
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Scope / Description</p>
                <p className="mt-3 whitespace-pre-wrap text-sm font-semibold leading-relaxed text-slate-700">{tender.description || 'No description provided.'}</p>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Tender Attributes</p>
                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <TenderInfoBox label="Category" value={tender.category || '-'} />
                  <TenderInfoBox label="Quantity Unit" value={tender.quantityUnit || 'Not specified'} />
                  <TenderInfoBox label="Payment Terms" value={tender.paymentTerms ? tender.paymentTerms.replace(/_/g, ' ') : 'Not specified'} />
                  <TenderInfoBox label="Delivery Type" value={tender.deliveryType ? tender.deliveryType.replace(/_/g, ' ') : 'Not specified'} />
                  <TenderInfoBox label="Created" value={createdLabel} />
                  <TenderInfoBox label="Last Updated" value={updatedLabel} />
                </div>
              </section>
            </div>

            <div className="space-y-5">
              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Evaluation Readiness</p>
                <div className="mt-3 space-y-3">
                  <ReadinessLine label="Specification document" ready={Boolean(tender.documentUrl)} detail={tender.documentUrl ? 'Buyer document is attached.' : 'No specification document attached.'} />
                  <ReadinessLine label="Supplier bids" ready={hasBids} detail={hasBids ? `${tender.bidsCount} supplier response available.` : 'Awaiting supplier bids.'} />
                  <ReadinessLine label="Closing date" ready={Boolean(tender.closesAt)} detail={daysLeft} />
                </div>
              </section>

              <section className="rounded-lg border border-slate-200 bg-white p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Specification Documents</p>
                {tender.isV2 && tender.documents && tender.documents.length > 0 ? (
                  <div className="mt-3 space-y-2">
                    {tender.documents.map((doc, idx) => (
                      <div key={idx} className="rounded-md border border-slate-200 bg-slate-50 p-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-bold text-slate-900">{doc.fileName}</p>
                          <p className="text-[9px] font-semibold text-slate-400 uppercase tracking-wider mt-0.5">{doc.documentType || 'Document'}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => onPreviewDocument(`/api/files/${doc.fileAssetId}/view`, doc.fileName)}
                          className="shrink-0 inline-flex items-center gap-2 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-black text-[#12335f] hover:bg-slate-50"
                        >
                          <FileText className="h-3.5 w-3.5" />
                          Open
                        </button>
                      </div>
                    ))}
                  </div>
                ) : tender.documentUrl ? (
                  <div className="mt-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
                    <p className="truncate text-sm font-black text-slate-900">{documentName}</p>
                    <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-emerald-700">Attached to tender</p>
                    <button type="button" onClick={() => onPreviewDocument(tender.documentUrl!, `${tender.tenderId} Specifications`)} className="mt-3 inline-flex items-center gap-2 rounded-md border border-emerald-200 bg-white px-3 py-2 text-xs font-black text-emerald-700 hover:bg-emerald-50">
                      <FileText className="h-4 w-4" />
                      Open Document
                    </button>
                  </div>
                ) : (
                  <div className="mt-3 rounded-md border border-dashed border-slate-200 bg-slate-50 p-4 text-sm font-semibold text-slate-500">
                    No specification document is attached to this tender.
                  </div>
                )}
              </section>
            </div>
          </div>

          <div className="mt-5 flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <Button variant="outline" onClick={onViewBids} className="h-10 rounded-md border-slate-200 text-xs font-black uppercase">
              <Trophy className="mr-2 h-4 w-4" />
              View Bids
            </Button>
            <Button variant="outline" onClick={onEdit} className="h-10 rounded-md border-slate-200 text-xs font-black uppercase">
              <Edit3 className="mr-2 h-4 w-4" />
              Edit
            </Button>
            <Button variant="outline" onClick={onDelete} className="h-10 rounded-md border-red-200 text-xs font-black uppercase text-red-700 hover:bg-red-50">
              <Trash2 className="mr-2 h-4 w-4" />
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadinessLine({ label, ready, detail }: { label: string; ready: boolean; detail: string }) {
  return (
    <div className="flex gap-3 rounded-md border border-slate-200 bg-slate-50 p-3">
      <div className={cn('mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full', ready ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700')}>
        {ready ? <CheckCircle2 className="h-4 w-4" /> : <AlertCircle className="h-4 w-4" />}
      </div>
      <div>
        <p className="text-sm font-black text-slate-900">{label}</p>
        <p className="mt-0.5 text-xs font-semibold text-slate-500">{detail}</p>
      </div>
    </div>
  );
}

function TenderEditModal({
  tender,
  saving,
  onClose,
  onSubmit,
  onPreviewDocument
}: {
  tender: Tender;
  saving: boolean;
  onClose: () => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onPreviewDocument: (url: string, label: string) => void;
}) {
  const documentName = tender.documentUrl ? tender.documentUrl.split('/').pop() || 'Specification document' : '';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-sm">
      <div className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-6 py-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Edit Tender</p>
            <h2 className="text-lg font-black text-slate-900">{tender.tenderId || `Tender #${tender.id}`}</h2>
          </div>
          <button type="button" onClick={onClose} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 text-slate-500 hover:bg-white">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={onSubmit} className="space-y-4 p-6">
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
            Title
            <input name="title" defaultValue={tender.title} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20" />
          </label>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Category
              <select
                name="category"
                defaultValue={tender.category}
                className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20"
              >
                <option value="">Select Category</option>
                {TENDER_CATEGORY_OPTIONS.map(category => (
                  <option key={category} value={category}>{category}</option>
                ))}
              </select>
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Budget
              <input name="budget" type="number" min="1" defaultValue={tender.budget} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Closing Date
              <input name="closesAt" type="date" defaultValue={tender.closesAt ? tender.closesAt.split('T')[0] : ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20" />
            </label>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Quantity Unit
              <select name="quantityUnit" defaultValue={tender.quantityUnit || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20">
                <option value="">Select Unit</option>
                {QUANTITY_UNITS.map(u => <option key={u.value} value={u.value}>{u.label}</option>)}
              </select>
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Payment Terms
              <select name="paymentTerms" defaultValue={tender.paymentTerms || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20">
                <option value="">Select Payment Terms</option>
                {PAYMENT_TERMS.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
              Delivery Type
              <select name="deliveryType" defaultValue={tender.deliveryType || ''} className="mt-1 h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20">
                <option value="">Select Delivery Type</option>
                {DELIVERY_TYPES.map(d => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
          </div>
          <label className="block text-[10px] font-black uppercase tracking-wider text-slate-500">
            Description
            <textarea name="description" rows={5} defaultValue={tender.description} className="mt-1 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-[#12335f]/20" />
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Specification Document</p>
            {tender.documentUrl ? (
              <div className="mt-3 flex flex-col gap-3 rounded-md border border-emerald-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex min-w-0 items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-emerald-50 text-emerald-700">
                    <Paperclip className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-black text-slate-900">{documentName}</p>
                    <p className="text-xs font-semibold text-emerald-700">Attached to this tender</p>
                  </div>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onPreviewDocument(tender.documentUrl!, `${tender.tenderId || `Tender #${tender.id}`} Specifications`)}
                  className="h-9 shrink-0 rounded-md border-slate-200 text-xs font-black uppercase text-[#12335f]"
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Open Document
                </Button>
              </div>
            ) : (
              <p className="mt-2 rounded-md border border-dashed border-slate-200 bg-white px-3 py-3 text-xs font-bold text-slate-500">No specification document is attached to this tender.</p>
            )}
          </div>
          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <Button type="button" variant="outline" onClick={onClose} className="h-10 rounded-md border-slate-200 text-xs font-black uppercase">Cancel</Button>
            <Button type="submit" disabled={saving} className="h-10 rounded-md bg-[#12335f] px-5 text-xs font-black uppercase text-white hover:bg-[#0b2445]">
              <Save className="mr-2 h-4 w-4" />
              {saving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TenderInfoBox({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-3 py-3">
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 break-words text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}

function getTenderDaysLeft(date?: string) {
  if (!date) return 'Not set';
  const diff = new Date(date).getTime() - new Date().getTime();
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
  return days > 0 ? `${days} days` : 'Expired';
}
