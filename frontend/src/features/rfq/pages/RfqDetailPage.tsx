'use client';

import React, { useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import {
  Download,
  Calendar,
  MapPin,
  Building2,
  Check,
  ChevronRight,
  Loader2,
  Eye,
  FileText,
  ShieldCheck,
  ArrowRight,
  ArrowLeft,
  Layers,
  Paperclip,
  ClipboardList,
  IndianRupee,
  AlertTriangle,
  Info,
  Package,
  CalendarDays,
  ClipboardCheck,
  Clock,
  CheckCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApi } from '../../shared/apiClient';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { openFileAsset } from '../../../lib/files';
import ClarificationPanel from '../components/ClarificationPanel';
import { procurementBidApi } from '../../procurementBid/api';

/* ═══════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════ */

const isPresentValue = (value: any): boolean => {
  if (value === null || value === undefined || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return Object.keys(value).length > 0;
  return true;
};

const humanizeKey = (key: string): string =>
  key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());

const formatDetailValue = (value: any): string => {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toLocaleDateString('en-IN');
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (Array.isArray(value)) {
    return value
      .map(item => {
        if (item && typeof item === 'object') {
          return String(item.name || item.label || item.supplierName || item.itemName || item.fileName || item.location || item.id || JSON.stringify(item));
        }
        return String(item);
      })
      .filter(Boolean)
      .join(', ');
  }
  if (typeof value === 'object') {
    return Object.entries(value)
      .filter(([, v]) => isPresentValue(v))
      .map(([k, v]) => `${humanizeKey(k)}: ${formatDetailValue(v)}`)
      .join('; ');
  }
  return String(value);
};

const detailFieldsFromObject = (source: any, labelMap: Record<string, string> = {}) => {
  if (!source || typeof source !== 'object' || Array.isArray(source)) return [];
  return Object.entries(source)
    .filter(([key, value]) => isPresentValue(value) && !['id', 'documents', 'items', 'boqTable'].includes(key))
    .map(([key, value]) => ({
      label: labelMap[key] || humanizeKey(key),
      value: formatDetailValue(value)
    }))
    .filter(field => field.value);
};

const detailSection = (title: string, source: any, labelMap?: Record<string, string>) => {
  const fields = detailFieldsFromObject(source, labelMap);
  return fields.length ? { title, fields } : null;
};

const formatCurrency = (val?: number) => {
  if (!val) return '—';
  return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
};

const formatDateString = (dateStr?: string | Date, includeTime = false) => {
  if (!dateStr) return '—';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return String(dateStr);
    const day = d.getDate().toString().padStart(2, '0');
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const month = monthNames[d.getMonth()];
    const year = d.getFullYear();
    let base = `${day} ${month} ${year}`;
    if (includeTime) {
      const hours = d.getHours().toString().padStart(2, '0');
      const minutes = d.getMinutes().toString().padStart(2, '0');
      base += ` ${hours}:${minutes} IST`;
    }
    return base;
  } catch {
    return String(dateStr);
  }
};

const formatDisplayValue = (val: string, label?: string) => {
  if (!val) return '—';
  if (val.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) || val.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return formatDateString(val);
  }
  if (val.match(/^[A-Z][A-Z0-9_]*$/)) {
    return val
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return val;
};

const parseDescription = (desc?: string) => {
  if (!desc) return { method: '', value: '', urgency: '', text: '' };
  const cleanedDesc = desc.replace(/\r/g, '');
  const methodMatch = cleanedDesc.match(/Sourcing Method:\s*([^V\n]*?)(?=(?:Value:|Urgency:|$))/i);
  const valueMatch = cleanedDesc.match(/Value:\s*([^U\n]*?)(?=(?:Urgency:|$))/i);
  const urgencyMatch = cleanedDesc.match(/Urgency:\s*(.*?)(?=\n|$)/i);
  
  let cleanText = cleanedDesc;
  if (methodMatch || valueMatch || urgencyMatch) {
    cleanText = cleanedDesc
      .replace(/Sourcing Method:\s*.*?(?=(?:Value:|Urgency:|$))/gi, '')
      .replace(/Value:\s*.*?(?=(?:Urgency:|$))/gi, '')
      .replace(/Urgency:\s*.*?(?=\n|$)/gi, '')
      .replace(/\n+/g, '\n')
      .trim();
  }
  return {
    method: methodMatch ? methodMatch[1].trim() : '',
    value: valueMatch ? valueMatch[1].trim() : '',
    urgency: urgencyMatch ? urgencyMatch[1].trim() : '',
    text: cleanText
  };
};

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */

export default function RfqDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname() || '';
  const { user } = useAuth();
  const requestId = searchParams?.get('requestId') || '';
  const requirementId = searchParams?.get('requirementId') || '';

  const [activeSection, setActiveSection] = useState<number | null>(0);

  const scrollToSection = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      const yOffset = -90;
      const y = el.getBoundingClientRect().top + window.pageYOffset + yOffset;
      window.scrollTo({ top: y, behavior: 'smooth' });
    }
  };

  // Fetch ProcurementBid data when requestId is provided (numeric ID or REQ-* reference ID)
  const { data: bidData, isLoading: bidLoading, error: bidError } = useQuery({
    queryKey: ['procurement-bid-rfq-detail', requestId],
    queryFn: () => procurementBidApi.detail(requestId),
    enabled: !!requestId,
  });
  
  // Fetch BuyerRequirement data when requirementId is provided
  const { data: reqData, isLoading: reqLoading, error: reqError } = useQuery({
    queryKey: ['marketplace-requirement-rfq-detail', requirementId],
    queryFn: async () => {
      const data = await getApi<any>(`/api/marketplace/requirements/${requirementId}`);
      return data;
    },
    enabled: !!requirementId,
  });

  // When page is accessed via requestId (procurement bid path), bidData doesn't include ownResponse.
  // After bidData resolves and gives us a numeric sourceId, fetch the marketplace requirement
  // to get the seller's own quotation status (ownResponse) for the Submit button state.
  const bidSourceId = bidData?.sourceId || null;
  const { data: bidReqData } = useQuery({
    queryKey: ['marketplace-requirement-rfq-ownresponse', bidSourceId],
    queryFn: async () => {
      const data = await getApi<any>(`/api/marketplace/requirements/${bidSourceId}`);
      return data;
    },
    enabled: !!requestId && !!bidSourceId && user?.role === 'seller',
    staleTime: 30_000,
  });

  const isLoading = (!!requestId && bidLoading) || (!!requirementId && reqLoading);
  const error = (!!requestId && bidError) || (!!requirementId && reqError);

  const reqObj = reqData?.requirement || reqData;
  // Combine ownResponse from whichever path was used to reach this page
  const ownResponse = reqData?.ownResponse || bidReqData?.ownResponse || null;

  // Map data from whichever source responded
  const rfqData: any = bidData ? {
    id: bidData.id || bidData.sourceId,
    subject: bidData.title,
    buyer: bidData.buyer || {
      name: bidData.buyerName,
      email: '',
      mobile: '',
      buyerProfile: null
    },
    estimatedValue: bidData.estimatedValue,
    deadlineDate: bidData.endDate,
    createdAt: bidData.startDate,
    updatedAt: bidData.startDate,
    status: bidData.status,
    location: bidData.deliveryLocation,
    requirementNumber: bidData.id,
    paymentTerms: bidData.technicalPacket?.terms?.paymentTerms || bidData.terms?.[0] || '',
    deliveryTerms: bidData.technicalPacket?.terms?.deliveryTerms || '',
    payload: bidData.technicalPacket,
    description: bidData.description,
    documents: bidData.documents?.length
      ? bidData.documents
      : (bidData.bidDocuments?.length
        ? bidData.bidDocuments
        : ((bidData as any).requiredDocuments || []).map((name: any, i: number) => ({
            id: `req-doc-${i}`,
            fileName: typeof name === 'string' ? name : name?.name || 'Required Document',
            documentType: 'REQUIRED',
            fileUrl: '#',
          }))
      ),
    items:
      ((bidData as any).items?.length ? (bidData as any).items : null)
      || bidData.technicalPacket?.boq
      || bidData.technicalPacket?.items
      || bidData.technicalPacket?.wizardData?.items
      || (bidData as any).financialPacket?.boq
      || [],
    procurementMethod: bidData.procurementType || 'RFQ',
    category: bidData.category,
    categoryName: bidData.category,
    quantity: bidData.quantity,
    unit: '',
    buyerOrganization: bidData.buyerOrganization || { organizationName: bidData.buyerName },
    buyerOrganizationName: bidData.buyerName,
    emdAmount: bidData.emdAmount,
    isEmdRequired: bidData.isEmdRequired,
    evaluationMethod: bidData.evaluationMethod,
    contactPerson: bidData.technicalPacket?.internal?.contactPerson || '',
    buyerEmail: bidData.technicalPacket?.internal?.email || '',
    buyerMobile: bidData.technicalPacket?.internal?.mobile || '',
  } : reqObj ? {
    id: reqObj.id,
    subject: reqObj.title || reqObj.description,
    buyer: {
      name: reqObj.buyerOrganization?.organizationName || 'Buyer',
      email: reqObj.buyerEmail || reqObj.buyer?.email || '',
      mobile: reqObj.buyerMobile || reqObj.buyer?.mobile || '',
      buyerProfile: reqObj.buyerOrganization || reqObj.buyer?.buyerProfile
    },
    estimatedValue: reqObj.estimatedValue || reqObj.budgetMax || reqObj.budgetMin,
    deadlineDate: reqObj.lastDate,
    createdAt: reqObj.createdAt,
    updatedAt: reqObj.updatedAt,
    status: reqObj.status,
    items: reqObj.items,
    tenders: reqObj.tenders,
    location: reqObj.location,
    requirementNumber: reqObj.requirementNumber,
    paymentTerms: reqObj.paymentTerms || reqObj.payload?.paymentTerms || reqObj.payload?.terms?.paymentTerms,
    deliveryTerms: reqObj.deliveryTerms || reqObj.payload?.deliveryTerms || reqObj.payload?.terms?.deliveryTerms,
    payload: reqObj.payload,
    description: reqObj.description,
    documents: reqObj.documents,
    procurementMethod: reqObj.procurementMethod || reqObj.procurementMethodLabel,
    category: reqObj.category,
    categoryName: reqObj.category?.name,
    quantity: reqObj.quantity,
    unit: reqObj.unit,
    directPurchase: reqObj.directPurchase,
    buyerOrganization: reqObj.buyerOrganization,
  } : null;

  if (isLoading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-[#12335f]" />
        <p className="text-sm font-bold text-slate-500">Loading procurement details...</p>
      </div>
    );
  }

  /* ── Data Extraction ── */
  let subject = rfqData?.subject || rfqData?.title || '';
  const isSeedId = [180, 181, 182, 183].includes(Number(requestId));
  if (!subject && isSeedId) {
    if (Number(requestId) === 180) subject = '[SEED] Supply of High-Grade Copper Wire Reels';
    else if (Number(requestId) === 181) subject = '[SEED] Bulk Office Stationery and Printing Paper Sourcing';
    else if (Number(requestId) === 182) subject = '[SEED] Spare Parts for CNC Milling Machinery';
    else if (Number(requestId) === 183) subject = '[SEED] Industrial Grade Fire Extinguishers and Safety Gear';
  }
  if (!subject) subject = 'RFQ Sourcing Opportunity';

  const isCopper = isSeedId && subject.toLowerCase().includes('copper');
  const isStationery = isSeedId && (subject.toLowerCase().includes('stationery') || subject.toLowerCase().includes('paper'));
  const isCNC = isSeedId && (subject.toLowerCase().includes('cnc') || subject.toLowerCase().includes('milling'));
  const isFire = isSeedId && (subject.toLowerCase().includes('fire') || subject.toLowerCase().includes('extinguisher'));

  // RFQ Number
  let rfqNumberString = rfqData?.requirementNumber || (rfqData?.id ? `RFQ-2026-0101${Math.abs(Number(rfqData.id))}` : '—');
  if (!rfqData?.requirementNumber && isSeedId) {
    if (isCopper) rfqNumberString = 'SEED-BID-RFQ-180-0169';
    else if (isStationery) rfqNumberString = 'SEED-BID-RFQ-181-2036';
    else if (isCNC) rfqNumberString = 'SEED-BID-RFQ-182-4281';
    else if (isFire) rfqNumberString = 'SEED-BID-RFQ-183-8154';
  }

  // Payload data extraction
  const payload = rfqData?.payload || {};
  const basics = payload.basics || {};
  const internal = payload.internal || {};
  const schedule = payload.schedule || {};
  const terms = payload.terms || {};
  const rules = payload.rules || {};
  const evaluation = payload.evaluation || {};

  // Detail Sections for Accordion
  const detailSections = rfqData?.payload ? [
    detailSection('Procurement Intent', {
      ...(payload.basics || {}),
      buyerType: payload.buyerType,
      buyingType: payload.buyingType,
      recommendedMethod: payload.recommendation?.id,
      recommendationReason: payload.recommendation?.reason,
    }),
    detailSection('Consignee Details', { consigneeDetails: payload.consigneeDetails }),
    detailSection('Vendor / Supplier Selection', payload.vendors),
    detailSection('Timeline & Rules', { ...(payload.schedule || {}), ...(payload.tender || {}), ...(payload.rules || {}) }),
    detailSection('Commercial Terms', payload.terms),
    detailSection('Evaluation Basis', payload.evaluation),
    detailSection('Approval Notes', payload.approval),
    detailSection('Service Details', payload.serviceDetails),
    detailSection('Rate Contract', payload.rateContractConfig || payload.rateContract),
    detailSection('Reverse Auction', payload.auctionConfig),
  ].filter(Boolean) as Array<{ title: string; fields: Array<{ label: string; value: string }> }> : [];

  // Buyer Info
  const orgName = rfqData?.buyerOrganization?.organizationName 
    || rfqData?.buyer?.buyerProfile?.organizationName 
    || rfqData?.buyerOrganizationName
    || rfqData?.buyer?.name
    || internal.orgName 
    || basics.buyerOrganizationName 
    || (isSeedId ? 'Govt. Buyer Org' : '—');
  
  const contactPerson = rfqData?.contactPerson 
    || rfqData?.buyer?.buyerProfile?.contactPerson 
    || internal.contactPerson 
    || (isSeedId ? 'A. K. Mohanty' : '—');

  const email = rfqData?.buyer?.email 
    || rfqData?.buyerEmail 
    || internal.email 
    || (isSeedId ? 'procurement@govorg.in' : '—');

  const phone = rfqData?.buyer?.mobile 
    || rfqData?.buyerMobile 
    || internal.mobile 
    || (isSeedId ? '+91 94370 12345' : '—');
  
  let address = '—';
  if (rfqData?.buyer?.buyerProfile?.city) {
    address = `${rfqData.buyer.buyerProfile.organizationName || orgName}, ${rfqData.buyer.buyerProfile.city}, ${rfqData.buyer.buyerProfile.state || ''}`;
  } else if (rfqData?.buyerOrganization?.city) {
    address = [rfqData.buyerOrganization.city, rfqData.buyerOrganization.district, rfqData.buyerOrganization.state].filter(Boolean).join(', ');
  } else if (internal.deliveryAddress || basics.deliveryLocation || rfqData?.location) {
    address = internal.deliveryAddress || basics.deliveryLocation || rfqData?.location || '—';
  } else if (isSeedId) {
    address = 'Secretariat Building, Bhubaneswar - 751001, Odisha';
  }

  // Estimated Value
  let estimatedValueVal: number | undefined = undefined;
  if (rfqData?.estimatedValue) estimatedValueVal = Number(rfqData.estimatedValue);
  else if (basics.estimatedValue) estimatedValueVal = Number(basics.estimatedValue);
  else if (isSeedId) {
    if (isCopper) estimatedValueVal = 450000;
    else if (isStationery) estimatedValueVal = 120000;
    else if (isCNC) estimatedValueVal = 850000;
    else if (isFire) estimatedValueVal = 320000;
    else estimatedValueVal = 1250000;
  }

  // Category & Subcategory
  let category = rfqData?.categoryName || rfqData?.category?.name || basics.category || (isSeedId ? 'General Sourcing' : '—');
  let subCategory = basics.subCategory || (isSeedId ? 'Standard Sourcing' : '');
  if (!rfqData?.payload && isSeedId) {
    if (isCopper) { category = 'Electrical & Power'; subCategory = 'Copper Wire Winding'; }
    else if (isStationery) { category = 'Office Supplies'; subCategory = 'Paper & Stationery'; }
    else if (isCNC) { category = 'Industrial Machinery'; subCategory = 'CNC & Milling Parts'; }
    else if (isFire) { category = 'Safety & Security'; subCategory = 'Fire Fighting Equipment'; }
  }

  // Dates
  let closesAtFormatted = '—';
  if (rfqData?.deadlineDate) closesAtFormatted = formatDateString(rfqData.deadlineDate, true);
  else if (schedule.submissionDate) closesAtFormatted = formatDateString(schedule.submissionDate, true);
  else if (isSeedId) {
    if (isCopper) closesAtFormatted = '26 Jul 2026 17:00 IST';
    else if (isStationery) closesAtFormatted = '27 Jul 2026 17:00 IST';
    else if (isCNC) closesAtFormatted = '28 Jul 2026 17:00 IST';
    else if (isFire) closesAtFormatted = '29 Jul 2026 17:00 IST';
    else closesAtFormatted = '20 Jul 2026 15:00 IST';
  }

  const publishedDateFormatted = rfqData?.createdAt 
    ? formatDateString(rfqData.createdAt) 
    : (schedule.publishDate ? formatDateString(schedule.publishDate) : (isSeedId ? '10 Jul 2026' : '—'));

  // Sourcing Method
  const methodLabel = rfqData?.procurementMethod || basics.procurementMethod || payload.recommendation?.id || 'RFQ';
  const urgency = basics.urgency || payload.urgency || (isSeedId ? 'Normal' : '');

  // Items
  let itemsList: Array<{
    itemName: string;
    quantity: number | string;
    unitOfMeasure: string;
    description?: string;
    estimatedUnitPrice?: number;
    specifications?: any;
  }> = [];
  if (rfqData?.items && Array.isArray(rfqData.items) && rfqData.items.length > 0) {
    itemsList = rfqData.items.map((item: any) => ({
      itemName: item.itemName || item.name || item.description || '—',
      quantity: item.quantity || 0,
      unitOfMeasure: item.unitOfMeasure || item.unit || 'Nos',
      description: item.description,
      estimatedUnitPrice: item.estimatedUnitPrice,
      specifications: item.specifications,
    }));
  } else if (payload.items && Array.isArray(payload.items) && payload.items.length > 0) {
    itemsList = payload.items.map((item: any) => ({
      itemName: item.name || item.itemName || item.description || '—',
      quantity: item.quantity || 0,
      unitOfMeasure: item.unit || item.unitOfMeasure || 'Nos',
      description: item.description,
      estimatedUnitPrice: item.estimatedUnitPrice,
      specifications: item.specifications,
    }));
  } else if (isSeedId) {
    if (isCopper) {
      itemsList = [
        { itemName: 'High-Grade Copper Wire Reel (100m)', quantity: 50, unitOfMeasure: 'Nos' },
        { itemName: 'Insulation Tape Rolls', quantity: 100, unitOfMeasure: 'Nos' },
        { itemName: 'PVC Conduit Pipe (3m)', quantity: 200, unitOfMeasure: 'Nos' },
        { itemName: 'Junction Box', quantity: 50, unitOfMeasure: 'Nos' },
      ];
    } else if (isStationery) {
      itemsList = [
        { itemName: 'A4 Printing Paper (80 GSM)', quantity: 200, unitOfMeasure: 'Nos' },
        { itemName: 'Ballpoint Pens (Blue/Black Box)', quantity: 10, unitOfMeasure: 'Nos' },
        { itemName: 'Executive Notebooks', quantity: 100, unitOfMeasure: 'Nos' },
        { itemName: 'Staplers & Pin Boxes', quantity: 50, unitOfMeasure: 'Nos' },
      ];
    } else if (isCNC) {
      itemsList = [
        { itemName: 'Carbide End Mills (10mm)', quantity: 30, unitOfMeasure: 'Nos' },
        { itemName: 'CNC Spindle Drive Belt', quantity: 10, unitOfMeasure: 'Nos' },
        { itemName: 'Linear Guide Rails (1.5m)', quantity: 4, unitOfMeasure: 'Nos' },
        { itemName: 'Recirculating Ball Screws', quantity: 6, unitOfMeasure: 'Nos' },
      ];
    } else if (isFire) {
      itemsList = [
        { itemName: 'CO2 Fire Extinguisher (5kg)', quantity: 25, unitOfMeasure: 'Nos' },
        { itemName: 'Dry Powder Extinguisher (9kg)', quantity: 50, unitOfMeasure: 'Nos' },
        { itemName: 'Industrial Safety Helmets', quantity: 100, unitOfMeasure: 'Nos' },
        { itemName: 'Heavy Duty Fire Blankets', quantity: 20, unitOfMeasure: 'Nos' },
      ];
    } else {
      itemsList = [
        { itemName: 'Office Table', quantity: 20, unitOfMeasure: 'Nos' },
        { itemName: 'Ergonomic Chair', quantity: 50, unitOfMeasure: 'Nos' },
        { itemName: 'Storage Cabinet', quantity: 10, unitOfMeasure: 'Nos' },
        { itemName: 'Conference Table', quantity: 5, unitOfMeasure: 'Nos' },
      ];
    }
  }

  // Documents
  const documents: Array<{
    id?: number;
    fileName: string;
    documentType?: string;
    required?: boolean;
    instructions?: string;
    fileAssetId?: number | null;
    url?: string;
  }> = [];
  const rawDocs = (rfqData as any)?.documents || (reqData as any)?.documents || (bidData as any)?.bidDocuments || [];
  if (Array.isArray(rawDocs) && rawDocs.length > 0) {
    rawDocs.forEach((doc: any) => {
      documents.push({
        id: doc.id,
        fileName: doc.fileName || doc.documentType || 'Bid document',
        documentType: doc.documentType,
        required: doc.required,
        instructions: doc.instructions,
        fileAssetId: doc.fileAssetId,
        url: doc.fileUrl || doc.url,
      });
    });
  }
  if (rfqData?.documentUrl) {
    documents.push({
      id: rfqData.id,
      fileName: rfqData.documentUrl.split('/').pop() || 'RFQ Document',
      documentType: 'Document link',
      url: rfqData.documentUrl
    });
  }

  // Budget & Sanction
  const budgetDetails = internal && Object.keys(internal).length > 0 ? {
    budgetHead: internal.budgetHead || '',
    financialYear: internal.financialYear || '',
    fundSource: internal.fundSource || '',
    sanctionAmount: internal.sanctionAmount ? Number(internal.sanctionAmount) : undefined,
    sanctionOrderNumber: internal.sanctionOrderNumber || internal.internalFileNumber || '',
    sanctionDate: internal.sanctionDate || '',
    approvingAuthority: internal.approvalAuthority || internal.competentAuthority || '',
    paymentMode: internal.paymentMode || '',
    costCenter: internal.costCenter || '',
    justification: internal.justification || basics.justification || '',
    remarks: internal.remarks || '',
  } : null;

  const hasBudget = budgetDetails && Object.values(budgetDetails).some(v => v !== '' && v !== undefined && v !== null);

  // Terms & Conditions
  const eligibilityCriteria: string[] = [];
  const termsAndConditions: string[] = [];
  if (terms.eligibilityCriteria && Array.isArray(terms.eligibilityCriteria)) {
    eligibilityCriteria.push(...terms.eligibilityCriteria);
  }
  if (terms.termsAndConditions && Array.isArray(terms.termsAndConditions)) {
    termsAndConditions.push(...terms.termsAndConditions);
  }
  if (terms.specialConditions) {
    termsAndConditions.push(String(terms.specialConditions));
  }
  if (rules.bidSecurityRequired) {
    termsAndConditions.push(`Bid Security Required: ${rules.bidSecurityRequired}`);
  }
  if (rules.emDRequired) {
    termsAndConditions.push(`EMD Required: ₹${rules.emDAmount || rules.emDRequired}`);
  }

  // Timeline steps
  let clarificationDeadlineStr = schedule.clarificationDeadline 
    ? `Up to ${formatDateString(schedule.clarificationDeadline)}` 
    : '—';

  const timelineSteps = [
    { label: 'RFQ Published', date: publishedDateFormatted, active: true },
    { label: 'Clarification', date: clarificationDeadlineStr, active: false },
    { label: 'Quotation Submission', date: rfqData?.deadlineDate ? `Up to ${formatDateString(rfqData.deadlineDate)}` : (schedule.submissionDate ? `Up to ${formatDateString(schedule.submissionDate)}` : 'Pending'), active: false },
    { label: 'Evaluation', date: 'Pending', active: false },
    { label: 'Order', date: 'Pending', active: false },
  ];


  /* ── Handlers ── */
  const handleDownload = () => {
    toast.success('Downloading RFQ package...');
  };

  const handleSubmitQuotation = () => {
    if (!user) {
      toast.error('Please login to participate and submit your quotation.');
      router.push(`/login?redirect=${encodeURIComponent(pathname + (requestId ? `?requestId=${requestId}` : (requirementId ? `?requirementId=${requirementId}` : '')))}`);
      return;
    }
    // Prefer the actual numeric ID from the fetched data over the URL parameter,
    // which may be a string requirement number (e.g. REQ-2026-...).
    const numericId = rfqData?.id;
    const id = numericId || requirementId || requestId;
    if (!id) {
      toast.error('Requirement ID not found');
      return;
    }
    router.push(`/seller/rfq/submit-quotation?requirementId=${id}`);
  };

  /* ── InfoRow for Columns ── */
  const InfoRow = ({ label, value, mono, highlight }: { label: string; value?: string | number | null; mono?: boolean; highlight?: boolean }) => {
    if (!value && value !== 0) return null;
    return (
      <div className="flex justify-between items-start gap-4">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <span className={cn('text-xs font-black text-right', mono ? 'font-mono font-bold text-slate-700' : highlight ? 'font-extrabold text-red-600 tabular-nums' : 'text-slate-800')}>{value}</span>
      </div>
    );
  };

  /* ═══════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════ */

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 md:px-8 pb-12 font-sans text-slate-800">

      {/* ── Breadcrumb Navigation ── */}
      <nav className="flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500 bg-white/80 backdrop-blur-xs border border-slate-200/80 rounded-full px-4 py-2 w-fit shadow-2xs">
        {pathname.startsWith('/buyer') ? (
          <>
            <span className="hover:text-[#12335f] transition-colors cursor-pointer" onClick={() => router.push('/buyer/my-procurements')}>My Procurements</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </>
        ) : (
          <>
            <span className="hover:text-[#12335f] transition-colors cursor-pointer flex items-center gap-1" onClick={() => router.push('/seller/opportunities')}>
              <Building2 className="h-3.5 w-3.5 text-slate-400" /> Opportunities
            </span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
            <span className="hover:text-[#12335f] transition-colors cursor-pointer" onClick={() => router.push('/seller/opportunities/rfqs')}>RFQs</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
          </>
        )}
        <span className="font-mono font-bold text-slate-700 hover:text-[#12335f] cursor-pointer">{rfqNumberString}</span>
        <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
        <span className="text-[#12335f] font-black uppercase tracking-wider bg-blue-50 px-2 py-0.5 rounded text-[10px] border border-blue-100">Details</span>
      </nav>

      {/* Guest login banner */}
      {!user && (
        <div className="mb-5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 rounded-2xl border border-blue-200/80 bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-white px-6 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#12335f] text-white shadow-sm">
              <Info className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-extrabold text-slate-900">Want to participate in this procurement?</p>
              <p className="text-xs font-medium text-slate-600 mt-0.5">Please login or register as a seller to submit your quotation/proposal.</p>
            </div>
          </div>
          <a
            href={`/login?redirect=${encodeURIComponent(pathname + (requestId ? `?requestId=${requestId}` : (requirementId ? `?requirementId=${requirementId}` : '')))}`}
            className="whitespace-nowrap rounded-xl bg-[#12335f] px-5 py-2.5 text-xs font-black uppercase tracking-wider text-white shadow-sm hover:bg-[#0b2447] transition-all hover:shadow-md"
          >
            Login to Participate
          </a>
        </div>
      )}

      {/* ── Page Header ── */}
      <section className="relative overflow-hidden border border-slate-200/80 rounded-2xl bg-white p-6 md:p-8 shadow-sm transition-all duration-300 hover:shadow-md">
        {/* Subtle top accent border line */}
        <div className="absolute top-0 left-0 right-0 h-1.5 bg-gradient-to-r from-[#12335f] via-indigo-600 to-blue-500" />
        
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between pt-1">
          <div className="space-y-3 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 leading-tight">
                {subject}
              </h1>
              <div className="flex items-center gap-2 shrink-0">
                <span className="inline-flex items-center rounded-full bg-indigo-50 px-3 py-1 text-xs font-black tracking-wider text-indigo-700 border border-indigo-200/80 shadow-2xs">
                  RFQ
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3.5 py-1 text-xs font-black tracking-wider text-emerald-700 border border-emerald-200/80 shadow-2xs">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  {rfqData?.status || 'Open'}
                </span>
              </div>
            </div>
            <p className="text-xs md:text-sm font-medium text-slate-500 flex flex-wrap items-center gap-2">
              <span className="font-mono font-bold text-slate-700 bg-slate-100 px-2 py-0.5 rounded text-xs border border-slate-200">{rfqNumberString}</span>
              <span className="text-slate-300">•</span>
              <span className="flex items-center gap-1">
                <Calendar className="h-3.5 w-3.5 text-slate-400" />
                Published on <strong className="text-slate-700 font-bold">{publishedDateFormatted}</strong>
              </span>
              {orgName !== '—' && (
                <>
                  <span className="text-slate-300">•</span>
                  <span className="flex items-center gap-1 text-slate-700 font-semibold">
                    <Building2 className="h-3.5 w-3.5 text-slate-400" />
                    by <strong className="text-slate-900 font-bold">{orgName}</strong>
                  </span>
                </>
              )}
            </p>
          </div>

          {/* Header Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 border-t lg:border-t-0 border-slate-100 pt-4 lg:pt-0">
            <Button
              type="button"
              variant="outline"
              onClick={() => router.back()}
              className="h-10 rounded-xl border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition-all flex items-center gap-1.5"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownload}
              className="h-10 rounded-xl border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition-all flex items-center gap-2"
            >
              <Download className="h-4 w-4 text-blue-600" /> <span className="hidden sm:inline">Download</span> RFQ
            </Button>
            {user && user.role === 'seller' && (
              <Button
                type="button"
                onClick={handleSubmitQuotation}
                className="h-10 rounded-xl bg-gradient-to-r from-[#12335f] to-[#1a447c] hover:from-[#0b2447] hover:to-[#12335f] px-6 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-blue-900/15 transition-all flex items-center gap-2 hover:scale-[1.01] active:scale-[0.99]"
              >
                {ownResponse && ownResponse.status !== 'DRAFT' ? 'View Submitted Quotation' : 'Submit Quotation'} <ArrowRight className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* ── Sticky Quick Navigation Bar ── */}
      <div className="sticky top-4 z-40 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl px-4 py-2.5 shadow-md transition-all duration-300">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => scrollToSection('overview')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95"
          >
            <ClipboardList className="h-3.5 w-3.5 text-blue-600" /> Overview
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('scope-items')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95"
          >
            <FileText className="h-3.5 w-3.5 text-purple-600" /> Scope & Description
          </button>
          {itemsList.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToSection('line-items')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95"
            >
              <Package className="h-3.5 w-3.5 text-amber-600" /> Items & Specifications
            </button>
          )}
          <button
            type="button"
            onClick={() => scrollToSection('buyer-info')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95"
          >
            <Building2 className="h-3.5 w-3.5 text-emerald-600" /> Buyer Details
          </button>
          {detailSections.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToSection('additional-metadata')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95"
            >
              <Layers className="h-3.5 w-3.5 text-indigo-600" /> Specifications & Metadata ({detailSections.length})
            </button>
          )}
        </div>
      </div>

      {/* ── Lifecycle Stepper / Progress Bar Section ── */}
      <section className="border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm overflow-x-auto">
        <div className="min-w-[720px] flex items-center justify-between relative px-8 py-2">
          {/* Horizontal Connection Line */}
          <div className="absolute top-[38px] left-[60px] right-[60px] h-[3px] bg-slate-100 -z-0 rounded-full" />
          {/* Active progress bar indicator */}
          <div 
            className="absolute top-[38px] left-[60px] h-[3px] bg-gradient-to-r from-[#12335f] to-indigo-600 -z-0 rounded-full transition-all duration-500" 
            style={{ width: `${Math.min(100, Math.max(0, (timelineSteps.filter(s => s.active).length - 1) / Math.max(1, timelineSteps.length - 1) * 100))}%` }} 
          />

          {timelineSteps.map((step, idx) => (
            <div key={idx} className="flex flex-col items-center gap-2.5 relative z-10 w-32 text-center group">
              <div
                className={cn(
                  'flex h-10 w-10 items-center justify-center rounded-full border-2 transition-all duration-300',
                  step.active
                    ? 'bg-[#12335f] border-[#12335f] text-white shadow-md shadow-blue-900/20 scale-105'
                    : 'bg-white border-slate-300 text-slate-400 group-hover:border-slate-400'
                )}
              >
                {step.active ? (
                  <Check className="h-4 w-4 stroke-[3]" />
                ) : (
                  <span className="text-xs font-extrabold text-slate-400">{idx + 1}</span>
                )}
              </div>
              <div className="space-y-0.5">
                <p className={cn('text-xs font-black tracking-tight', step.active ? 'text-[#12335f]' : 'text-slate-700')}>
                  {step.label}
                </p>
                <p className="text-[11px] font-bold text-slate-400">{step.date}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Procurement Overview Grid ── */}
      <section id="overview" className="scroll-mt-24 border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-blue-50 text-[#12335f] border border-blue-100">
              <ClipboardList className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-wider">
                Procurement Overview
              </h2>
              <p className="text-[11px] font-medium text-slate-500">Key specs, schedule & terms for this RFQ</p>
            </div>
          </div>
        </div>
        
        {(() => {
          const parsed = parseDescription(rfqData?.description);
          const displayUrgency = parsed.urgency ? formatDisplayValue(parsed.urgency) : urgency ? formatDisplayValue(urgency) : 'Normal';

          return (
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 pt-5">
              
              {/* Estimated Value */}
              <div className="space-y-1.5 p-4 rounded-xl bg-emerald-50/40 border border-emerald-100/90 hover:border-emerald-300 transition-all duration-200 hover:shadow-2xs">
                <span className="text-[10px] font-extrabold text-emerald-700 uppercase tracking-wider flex items-center gap-1.5">
                  <IndianRupee className="h-3.5 w-3.5 text-emerald-600" /> Estimated Value
                </span>
                <span className="text-base font-black text-emerald-900 block tabular-nums">{formatCurrency(estimatedValueVal)}</span>
              </div>

              {/* RFQ Number */}
              <div className="space-y-1.5 p-4 rounded-xl bg-slate-50/80 border border-slate-200/70 hover:border-slate-300 transition-all duration-200 hover:shadow-2xs">
                <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="h-3.5 w-3.5 text-slate-500" /> RFQ Number
                </span>
                <span className="text-sm font-mono font-bold text-slate-900 block truncate" title={rfqNumberString}>{rfqNumberString}</span>
              </div>

              {/* Sourcing Method */}
              <div className="space-y-1.5 p-4 rounded-xl bg-indigo-50/40 border border-indigo-100/80 hover:border-indigo-200 transition-all duration-200 hover:shadow-2xs">
                <span className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-wider flex items-center gap-1.5">
                  <ClipboardCheck className="h-3.5 w-3.5 text-indigo-600" /> Sourcing Method
                </span>
                <span className="text-sm font-extrabold text-indigo-950 block">RFQ ({formatDisplayValue(String(methodLabel))})</span>
              </div>

              {/* Category */}
              <div className="space-y-1.5 p-4 rounded-xl bg-amber-50/40 border border-amber-100/80 hover:border-amber-200 transition-all duration-200 hover:shadow-2xs min-w-0">
                <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Package className="h-3.5 w-3.5 text-amber-600" /> Category
                </span>
                <span className="text-sm font-bold text-amber-950 block truncate" title={category}>{category}</span>
              </div>

              {/* Delivery Location */}
              <div className="space-y-1.5 p-4 rounded-xl bg-sky-50/40 border border-sky-100/80 hover:border-sky-200 transition-all duration-200 hover:shadow-2xs min-w-0">
                <span className="text-[10px] font-extrabold text-sky-700 uppercase tracking-wider flex items-center gap-1.5">
                  <MapPin className="h-3.5 w-3.5 text-sky-600" /> Delivery Location
                </span>
                <span className="text-sm font-bold text-slate-900 block truncate" title={rfqData?.location || address}>{rfqData?.location || address}</span>
              </div>

              {/* Quantity */}
              <div className="space-y-1.5 p-4 rounded-xl bg-teal-50/40 border border-teal-100/80 hover:border-teal-200 transition-all duration-200 hover:shadow-2xs">
                <span className="text-[10px] font-extrabold text-teal-700 uppercase tracking-wider flex items-center gap-1.5">
                  <CheckCircle className="h-3.5 w-3.5 text-teal-600" /> Quantity
                </span>
                <span className="text-sm font-extrabold text-slate-900 block">
                  {rfqData?.quantity ? (rfqData.unit ? `${rfqData.quantity} ${rfqData.unit}` : rfqData.quantity) : '2 Nos'}
                </span>
              </div>

              {/* Published Date */}
              <div className="space-y-1.5 p-4 rounded-xl bg-blue-50/40 border border-blue-100/80 hover:border-blue-200 transition-all duration-200 hover:shadow-2xs">
                <span className="text-[10px] font-extrabold text-blue-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 text-blue-600" /> Published Date
                </span>
                <span className="text-sm font-bold text-slate-900 block">{publishedDateFormatted}</span>
              </div>

              {/* Closing Date */}
              <div className="space-y-1.5 p-4 rounded-xl bg-rose-50/60 border border-rose-200/80 hover:border-rose-300 transition-all duration-200 hover:shadow-2xs">
                <span className="text-[10px] font-extrabold text-rose-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-rose-600" /> Closing Date
                </span>
                <span className="text-sm font-black text-rose-600 block">{closesAtFormatted}</span>
              </div>

              {/* Payment Terms */}
              <div className="space-y-1.5 p-4 rounded-xl bg-purple-50/40 border border-purple-100/80 hover:border-purple-200 transition-all duration-200 hover:shadow-2xs">
                <span className="text-[10px] font-extrabold text-purple-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-purple-600" /> Payment Terms
                </span>
                <span className="text-xs font-bold text-slate-900 block truncate" title={rfqData?.paymentTerms || terms.paymentTerms}>
                  {rfqData?.paymentTerms || terms.paymentTerms || '—'}
                </span>
              </div>

              {/* Delivery Terms */}
              <div className="space-y-1.5 p-4 rounded-xl bg-orange-50/40 border border-orange-100/80 hover:border-orange-200 transition-all duration-200 hover:shadow-2xs">
                <span className="text-[10px] font-extrabold text-orange-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-orange-600" /> Delivery Terms
                </span>
                <span className="text-xs font-bold text-slate-900 block truncate" title={rfqData?.deliveryTerms || terms.deliveryTerms}>
                  {rfqData?.deliveryTerms || terms.deliveryTerms || '—'}
                </span>
              </div>

              {/* GST */}
              <div className="space-y-1.5 p-4 rounded-xl bg-violet-50/40 border border-violet-100/80 hover:border-violet-200 transition-all duration-200 hover:shadow-2xs">
                <span className="text-[10px] font-extrabold text-violet-700 uppercase tracking-wider flex items-center gap-1.5">
                  <Info className="h-3.5 w-3.5 text-violet-600" /> GST Rate
                </span>
                <span className="text-sm font-bold text-slate-900 block">{terms.gstInclusion || 'Exclusive'}</span>
              </div>

              {/* Urgency / Priority */}
              <div className="space-y-1.5 p-4 rounded-xl bg-amber-50/40 border border-amber-100/80 hover:border-amber-200 transition-all duration-200 hover:shadow-2xs">
                <span className="text-[10px] font-extrabold text-amber-700 uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className={cn("h-3.5 w-3.5", displayUrgency.toLowerCase().includes('high') || displayUrgency.toLowerCase().includes('urgent') ? "text-rose-600" : "text-amber-600")} /> Urgency
                </span>
                <div>
                  <span className={cn(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wider border shadow-2xs",
                    displayUrgency.toLowerCase().includes('high') || displayUrgency.toLowerCase().includes('urgent')
                      ? "bg-rose-50 border-rose-200 text-rose-700"
                      : "bg-amber-50 border-amber-200 text-amber-800"
                  )}>
                    {displayUrgency}
                  </span>
                </div>
              </div>

            </div>
          );
        })()}
      </section>

      {/* ── Main Details Grid (2 columns layout) ── */}
      <div className="grid gap-6 lg:grid-cols-3">

        {/* ═══ COLUMN 1 & 2: Scope & Items (Spans 2 cols) ═══ */}
        <div className="lg:col-span-2 space-y-6 flex flex-col">

          {/* Scope / Description */}
          <section id="scope-items" className="scroll-mt-24 border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm space-y-5 transition-all duration-300 hover:shadow-md">
            <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100 flex items-center gap-2">
              <FileText className="h-4 w-4 text-[#12335f]" /> Scope & Description
            </h2>
            {(() => {
              const parsed = parseDescription(rfqData?.description);

              return (
                <div className="space-y-4">
                  {parsed.text ? (
                    <div className="space-y-1.5 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Description / Scope of Work</span>
                      <p className="text-xs font-semibold leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
                        {parsed.text}
                      </p>
                    </div>
                  ) : rfqData?.description ? (
                    <div className="space-y-1.5 bg-slate-50/50 p-4 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Description / Scope of Work</span>
                      <p className="text-xs font-semibold leading-relaxed text-slate-700 whitespace-pre-wrap break-words">
                        {rfqData.description}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {/* Color stat cards */}
            <div className="grid grid-cols-2 gap-3 pt-1">
              <div className="rounded-xl bg-purple-50/50 border border-purple-100/90 p-4 text-left shadow-2xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-purple-700">Documents</span>
                <p className="mt-1 text-xl font-black text-purple-950 tabular-nums">{documents.length}</p>
              </div>
              <div className="rounded-xl bg-amber-50/50 border border-amber-100/90 p-4 text-left shadow-2xs">
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700">Line Items</span>
                <p className="mt-1 text-xl font-black text-amber-950 tabular-nums">{itemsList.length}</p>
              </div>
            </div>

            {/* Documents & Bidder Checklist */}
            {documents.length > 0 && (
              <div className="border-t border-slate-100 pt-5 space-y-3">
                <h4 className="text-[11px] font-black text-slate-600 uppercase tracking-wider flex items-center gap-2">
                  <Paperclip className="h-4 w-4 text-[#12335f]" /> Documents & Required Checklist
                </h4>
                <div className="space-y-2.5">
                  {documents.map((doc, idx) => {
                    const isUploaded = doc.fileAssetId !== null && doc.fileAssetId !== undefined;
                    const isMandatory = doc.required || doc.documentType?.toLowerCase() === 'mandatory';

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border transition-all text-left gap-3",
                          isMandatory
                            ? "bg-rose-50/20 border-rose-100 hover:border-rose-200"
                            : "bg-slate-50/40 border-slate-200/80 hover:border-slate-300"
                        )}
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          <div className={cn(
                            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border shadow-2xs",
                            isUploaded ? "bg-blue-50 border-blue-200 text-[#12335f]" : "bg-slate-100 border-slate-200 text-slate-500"
                          )}>
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="text-xs font-black text-slate-900 break-words">{doc.fileName}</p>
                              <span className={cn(
                                "rounded-full px-2 py-0.5 text-[9px] font-black uppercase border tracking-wider shrink-0",
                                isMandatory
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : "border-slate-200 bg-slate-100 text-slate-600"
                              )}>
                                {isMandatory ? 'Mandatory' : 'Optional'}
                              </span>
                              {isUploaded && (
                                <span className="rounded-full px-2 py-0.5 text-[9px] font-black uppercase border border-blue-200 bg-blue-50 text-blue-700 shrink-0">
                                  Attachment Available
                                </span>
                              )}
                            </div>
                            {doc.instructions && (
                              <p className="text-[11px] font-medium text-slate-500 leading-relaxed whitespace-pre-wrap break-words">{doc.instructions}</p>
                            )}
                          </div>
                        </div>
                        
                        {isUploaded && doc.fileAssetId ? (
                          <div className="flex items-center gap-1.5 shrink-0 self-end sm:self-center ml-auto sm:ml-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                openFileAsset({ id: doc.fileAssetId!, fileAssetId: doc.fileAssetId!, originalName: doc.fileName }, doc.fileName).catch(err => {
                                  toast.error(err instanceof Error ? err.message : 'Unable to open document');
                                });
                              }}
                              className="h-8 px-3 text-[10px] font-black uppercase text-[#12335f] border-blue-200 bg-blue-50/50 hover:bg-blue-100/80 shadow-2xs"
                            >
                              <Eye className="mr-1.5 h-3.5 w-3.5" /> View
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              onClick={() => {
                                openFileAsset({ id: doc.fileAssetId!, fileAssetId: doc.fileAssetId!, originalName: doc.fileName }, doc.fileName).catch(err => {
                                  toast.error(err instanceof Error ? err.message : 'Unable to open document');
                                });
                              }}
                              className="h-8 px-3 text-slate-700 border-slate-200 bg-white hover:bg-slate-50 shadow-2xs"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty documents fallback */}
            {documents.length === 0 && (
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-bold text-slate-500 py-4 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/30">
                  No documents uploaded for this RFQ.
                </p>
              </div>
            )}
          </section>

          {/* Items & Specifications Table */}
          {itemsList.length > 0 && (
            <section id="line-items" className="scroll-mt-24 border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm overflow-hidden transition-all duration-300 hover:shadow-md">
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-100">
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <Package className="h-4 w-4 text-[#12335f]" /> Items & Line Specifications
                </h2>
                <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full border border-slate-200">
                  {itemsList.length} {itemsList.length === 1 ? 'Item' : 'Items'}
                </span>
              </div>
              <div className="mt-4 overflow-x-auto border border-slate-200/80 rounded-xl bg-white shadow-2xs">
                <table className="min-w-[800px] w-full text-left border-collapse table-fixed">
                  <thead className="bg-slate-100/80 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-600 tracking-wider w-[250px]">Item Details</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-600 tracking-wider w-[100px] text-right">Qty / Unit</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-600 tracking-wider w-[120px] text-right">Est. Unit Price</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-600 tracking-wider w-[80px] text-center">GST Rate</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-600 tracking-wider w-[200px]">Specifications & Brands</th>
                      <th className="px-4 py-3 text-[10px] font-black uppercase text-slate-600 tracking-wider w-[150px] text-center">Attachments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {itemsList.map((item, idx) => {
                      const spec = item.specifications || {};
                      const itemType = spec.itemType || (item as any).itemType;
                      const hsn = spec.hsn_sac_code;
                      const brandPref = spec.brand_preference;
                      const brandFlex = spec.brand_flexible;
                      const gstVal = spec.gst !== undefined ? spec.gst : (item as any).gst;
                      const files = spec.attachments || [];
                      const fileId = spec.fileAssetId || (item as any).fileAssetId;
                      const fileName = spec.specificationFileName || (item as any).specificationFileName;

                      return (
                        <tr key={idx} className="hover:bg-blue-50/30 transition-colors align-top">
                          {/* Item Details */}
                          <td className="px-4 py-3.5 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-black text-slate-900 break-words">{item.itemName}</span>
                              {itemType && (
                                <span className={cn(
                                  "rounded-full px-2 py-0.5 text-[8px] font-black uppercase border shrink-0",
                                  itemType.toLowerCase() === 'service' 
                                    ? "border-purple-200 bg-purple-50 text-purple-700" 
                                    : "border-blue-200 bg-blue-50 text-blue-700"
                                )}>
                                  {itemType}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-[11px] font-semibold text-slate-600 leading-normal break-words whitespace-pre-wrap">{item.description}</p>
                            )}
                            {hsn && (
                              <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider pt-0.5">
                                HSN/SAC: <span className="font-mono font-bold text-slate-700 bg-slate-100 px-1 py-0.5 rounded">{hsn}</span>
                              </p>
                            )}
                          </td>
                          
                          {/* Qty / Unit */}
                          <td className="px-4 py-3.5 text-right font-bold text-slate-900 text-xs tabular-nums whitespace-nowrap">
                            <span className="bg-slate-100 text-slate-800 font-black px-2 py-1 rounded-md border border-slate-200 text-xs">
                              {item.quantity} <span className="text-[9px] font-semibold text-slate-500 uppercase ml-0.5">{item.unitOfMeasure || 'Nos'}</span>
                            </span>
                          </td>
                          
                          {/* Est. Unit Price */}
                          <td className="px-4 py-3.5 text-right font-black text-slate-900 text-xs tabular-nums">
                            {item.estimatedUnitPrice !== undefined && item.estimatedUnitPrice !== null ? (
                              <span className="text-emerald-700 font-black">{formatCurrency(item.estimatedUnitPrice)}</span>
                            ) : (
                              '—'
                            )}
                          </td>
                          
                          {/* GST */}
                          <td className="px-4 py-3.5 text-center font-bold text-slate-700 text-xs tabular-nums">
                            {gstVal !== undefined && gstVal !== null && Number(gstVal) > 0 ? (
                              <span className="bg-violet-50 text-violet-700 border border-violet-200 px-2 py-0.5 rounded font-black text-xs">{gstVal}%</span>
                            ) : '—'}
                          </td>
                          
                          {/* Specifications & Preferences */}
                          <td className="px-4 py-3.5 text-xs text-slate-600 space-y-1">
                            {brandPref ? (
                              <div className="space-y-1">
                                <p className="font-black text-slate-400 text-[9px] uppercase tracking-wider">Brand Preference</p>
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-bold text-slate-900 text-xs">{brandPref}</span>
                                  {brandFlex && (
                                    <span className={cn(
                                      "px-1.5 py-0.5 rounded text-[8px] uppercase font-black border",
                                      brandFlex.toLowerCase() === 'no'
                                        ? "text-rose-700 bg-rose-50 border-rose-200"
                                        : "text-emerald-700 bg-emerald-50 border-emerald-200"
                                    )}>
                                      {brandFlex.toLowerCase() === 'no' ? 'Strict' : 'Flexible'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[11px]">No specific brand</span>
                            )}
                          </td>
                          
                          {/* Attachments */}
                          <td className="px-4 py-3.5 text-center text-xs">
                            {files.length > 0 ? (
                              <div className="flex flex-col gap-1 items-center">
                                {files.map((file: any, fidx: number) => (
                                  <button
                                    key={fidx}
                                    type="button"
                                    onClick={() => openFileAsset({ id: file.fileAssetId, fileAssetId: file.fileAssetId, originalName: file.fileName }, file.fileName)}
                                    className="inline-flex items-center gap-1 text-[#12335f] hover:underline font-bold text-[10px] bg-blue-50 px-2 py-1 rounded border border-blue-100"
                                  >
                                    <FileText className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[100px]" title={file.fileName}>{file.fileName}</span>
                                  </button>
                                ))}
                              </div>
                            ) : fileId ? (
                              <button
                                type="button"
                                onClick={() => openFileAsset({ id: fileId, fileAssetId: fileId, originalName: fileName || 'Specification' }, fileName || 'Specification')}
                                className="inline-flex items-center gap-1 text-[#12335f] hover:underline font-bold text-[10px] bg-blue-50 px-2 py-1 rounded border border-blue-100 mx-auto"
                              >
                                <FileText className="h-3 w-3 shrink-0" />
                                <span className="truncate max-w-[100px]" title={fileName || 'Specification file'}>{fileName || 'Spec File'}</span>
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Terms & Conditions */}
          {(eligibilityCriteria.length > 0 || termsAndConditions.length > 0) && (
            <section className="border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm space-y-4 transition-all duration-300 hover:shadow-md">
              <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100 flex items-center gap-2">
                <ClipboardCheck className="h-4 w-4 text-[#12335f]" /> Terms & Conditions
              </h2>
              {eligibilityCriteria.length > 0 && (
                <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#12335f] mb-2 flex items-center gap-1">
                    <ShieldCheck className="h-3.5 w-3.5 text-blue-600" /> Eligibility Criteria
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5">
                    {eligibilityCriteria.map((c, idx) => (
                      <li key={idx} className="text-xs font-semibold text-slate-700 leading-normal">{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {termsAndConditions.length > 0 && (
                <div className="bg-slate-50/60 p-4 rounded-xl border border-slate-100">
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#12335f] mb-2 flex items-center gap-1">
                    <Info className="h-3.5 w-3.5 text-indigo-600" /> Special Terms & Conditions
                  </p>
                  <ul className="list-disc pl-5 space-y-1.5">
                    {termsAndConditions.map((t, idx) => (
                      <li key={idx} className="text-xs font-semibold text-slate-700 leading-normal">{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ═══ COLUMN 3: Buyer Info & Budget ═══ */}
        <div id="buyer-info" className="scroll-mt-24 space-y-6 flex flex-col">

          {/* Buyer / Organization Info */}
          <section className="border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md">
            <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100 flex items-center gap-2">
              <Building2 className="h-4 w-4 text-[#12335f]" /> Buyer Information
            </h2>
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3 bg-slate-50/80 p-3.5 rounded-xl border border-slate-100">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#12335f] text-white shadow-2xs">
                  <Building2 className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-black text-slate-900 truncate" title={orgName}>{orgName}</p>
                  <div className="flex items-center gap-1.5 mt-1">
                    <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[9px] font-black text-emerald-700 border border-emerald-200/80 shadow-2xs">
                      <ShieldCheck className="h-3 w-3 stroke-[2.5]" /> Verified Buyer
                    </span>
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-1">
                <div className="p-3 rounded-xl bg-slate-50/40 border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Contact Person</span>
                  <span className="text-xs font-bold text-slate-900 block mt-0.5">{contactPerson}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/40 border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Email</span>
                  <span className="text-xs font-mono font-bold text-blue-600 block mt-0.5 hover:underline cursor-pointer truncate" title={email}>{email}</span>
                </div>

                <div className="p-3 rounded-xl bg-slate-50/40 border border-slate-100">
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Phone</span>
                  <span className="text-xs font-bold text-slate-900 block mt-0.5">{phone}</span>
                </div>

                {address !== '—' && (
                  <div className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50/40 border border-slate-100">
                    <MapPin className="h-4 w-4 text-slate-400 mt-0.5 shrink-0" />
                    <p className="text-xs font-semibold leading-relaxed text-slate-700">{address}</p>
                  </div>
                )}
              </div>
            </div>
          </section>

          {/* Budget & Sanction */}
          {hasBudget && budgetDetails && (
            <section className="border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md">
              <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100 flex items-center gap-2">
                <IndianRupee className="h-4 w-4 text-emerald-600" /> Budget & Financial Sanction
              </h2>
              <div className="mt-4 space-y-3">
                {budgetDetails.budgetHead && <InfoRow label="Budget Head" value={budgetDetails.budgetHead} />}
                {budgetDetails.financialYear && <InfoRow label="Financial Year" value={budgetDetails.financialYear} />}
                {budgetDetails.fundSource && <InfoRow label="Fund Source" value={budgetDetails.fundSource} />}
                {budgetDetails.sanctionAmount && <InfoRow label="Sanction Amount" value={formatCurrency(budgetDetails.sanctionAmount)} />}
                {budgetDetails.sanctionOrderNumber && <InfoRow label="Sanction Order No." value={budgetDetails.sanctionOrderNumber} mono />}
                {budgetDetails.sanctionDate && <InfoRow label="Sanction Date" value={formatDateString(budgetDetails.sanctionDate)} />}
                {budgetDetails.approvingAuthority && <InfoRow label="Approving Authority" value={budgetDetails.approvingAuthority} />}
                {budgetDetails.paymentMode && <InfoRow label="Payment Mode" value={budgetDetails.paymentMode} />}
                {budgetDetails.costCenter && <InfoRow label="Cost Center" value={budgetDetails.costCenter} />}
              </div>
              {budgetDetails.justification && (
                <div className="mt-4 rounded-xl bg-amber-50/50 border border-amber-100 p-4">
                  <span className="text-[10px] font-black uppercase tracking-wider text-amber-800">Justification</span>
                  <p className="mt-1 text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap">{budgetDetails.justification}</p>
                </div>
              )}
              {budgetDetails.remarks && (
                <div className="mt-3 rounded-xl bg-slate-50/60 border border-slate-100 p-4">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-600">Remarks</span>
                  <p className="mt-1 text-xs font-semibold text-slate-800 leading-relaxed whitespace-pre-wrap">{budgetDetails.remarks}</p>
                </div>
              )}
            </section>
          )}
        </div>
      </div>

      {Number(rfqData?.sourceId || rfqData?.id || 0) > 0 && user && (
        <ClarificationPanel
          quoteRequestId={Number(rfqData?.sourceId || rfqData?.id || 0)}
          kind={rfqData?.sourceModel === 'REQUIREMENT' || !!requirementId ? 'requirement' : 'quote-request'}
          role={user?.role === 'seller' ? 'seller' : 'buyer'}
          deadlinePassed={!!rfqData?.deadlineDate && new Date(rfqData.deadlineDate).getTime() < Date.now()}
        />
      )}

      {/* ── Full-width: Additional Details Accordion ── */}
      {detailSections.length > 0 && (
        <section id="additional-metadata" className="scroll-mt-24 border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm space-y-4 transition-all duration-300 hover:shadow-md">
          <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100 flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Layers className="h-4 w-4 text-[#12335f]" /> Additional Specifications & Metadata
            </span>
            <span className="text-[10px] font-black uppercase bg-[#12335f]/5 text-[#12335f] px-3 py-1 rounded-full border border-[#12335f]/10">
              {detailSections.length} {detailSections.length === 1 ? 'Section' : 'Sections'}
            </span>
          </h2>
          <div className="space-y-3">
            {detailSections.map((section, idx) => {
              const isOpen = activeSection === idx;
              const getSectionIcon = (title: string) => {
                const t = title.toLowerCase();
                if (t.includes('intent') || t.includes('scope')) return ClipboardList;
                if (t.includes('buyer') || t.includes('user') || t.includes('contact') || t.includes('org')) return Info;
                if (t.includes('item') || t.includes('qty')) return Package;
                if (t.includes('date') || t.includes('time') || t.includes('schedule')) return CalendarDays;
                if (t.includes('price') || t.includes('budget') || t.includes('cost') || t.includes('value')) return IndianRupee;
                if (t.includes('terms') || t.includes('eligibility') || t.includes('criteria') || t.includes('rule')) return ClipboardCheck;
                return Layers;
              };
              const SectionIcon = getSectionIcon(section.title);
              return (
                <div 
                  key={`${section.title}-${idx}`} 
                  className={cn(
                    "rounded-xl border transition-all duration-300 overflow-hidden",
                    isOpen 
                      ? "border-[#12335f]/30 bg-slate-50/40 shadow-2xs border-l-4 border-l-[#12335f]" 
                      : "border-slate-200/80 hover:border-slate-300 bg-white border-l-4 border-l-transparent"
                  )}
                >
                  {/* Accordion Header */}
                  <button
                    type="button"
                    onClick={() => setActiveSection(isOpen ? null : idx)}
                    className="group w-full flex items-center justify-between p-4 text-left font-black text-xs uppercase tracking-wider text-[#12335f] hover:bg-slate-50/60 transition-colors"
                  >
                    <span className="flex items-center gap-3">
                      <span className={cn(
                        "flex h-8 w-8 items-center justify-center rounded-xl text-xs transition-colors font-black shadow-2xs",
                        isOpen ? "bg-[#12335f] text-white" : "bg-[#12335f]/10 text-[#12335f]"
                      )}>
                        <SectionIcon className="h-4 w-4" />
                      </span>
                      <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                        {section.title}
                      </span>
                    </span>
                    <ChevronRight className={cn(
                      "h-4 w-4 text-slate-400 transition-transform duration-300 group-hover:scale-110",
                      isOpen && "rotate-90 text-[#12335f]"
                    )} />
                  </button>

                  {/* Accordion Body */}
                  <div className={cn(
                    "grid transition-all duration-300 ease-in-out border-t border-slate-100 bg-white",
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                  )}>
                    <div className="overflow-hidden">
                      <div className="px-6 pb-6 pt-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                          {section.fields.map((field, fieldIdx) => (
                            <div key={`${field.label}-${fieldIdx}`} className="rounded-xl border border-slate-100 bg-slate-50/40 p-4 hover:bg-slate-50 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xs">
                              <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{field.label}</p>
                              <p className="mt-1.5 text-xs font-bold leading-relaxed text-slate-800 break-words whitespace-pre-wrap">{formatDisplayValue(field.value, field.label)}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

    </div>
  );
}
