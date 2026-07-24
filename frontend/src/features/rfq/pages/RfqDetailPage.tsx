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
  Users,
  Award,
  Wrench,
  Gavel,
  TrendingUp,
  Tag,
  Building,
  Zap,
  UserCheck,
  CheckCircle2,
  Sparkles,
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
  if (value === null || value === undefined || value === '' || value === '—' || value === '-') return false;
  if (typeof value === 'number' && value === 0) return false;
  if (Array.isArray(value)) return value.length > 0 && value.some(isPresentValue);
  if (typeof value === 'object') return Object.values(value).some(isPresentValue);
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
          return String(item.name || item.title || item.label || item.supplierName || item.itemName || item.fileName || item.location || item.id || JSON.stringify(item));
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
      .join(' • ');
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
  if (!val || val === '—' || val === '-') return '—';

  // Currency formatting for price / value / amount / budget / cost fields
  if (label) {
    const l = label.toLowerCase();
    if (l.includes('price') || l.includes('value') || l.includes('budget') || l.includes('amount') || l.includes('cost')) {
      const cleanVal = String(val).replace(/[^0-9.]/g, '');
      const num = Number(cleanVal);
      if (!isNaN(num) && num > 0) {
        return `₹${num.toLocaleString('en-IN')}`;
      }
    }
  }

  // Date / ISO String formatting (e.g. 2026-07-25T18:55 or 2026-07-25)
  if (typeof val === 'string') {
    if (val.match(/^\d{4}-\d{2}-\d{2}/)) {
      return formatDateString(val, val.includes('T') || val.includes(':'));
    }
  }

  // System concatenated description cleanup
  if (typeof val === 'string' && val.includes('Sourcing Method:')) {
    return val
      .replace(/Sourcing Method:\s*/gi, 'Sourcing Method: ')
      .replace(/RFQValue:\s*/gi, 'RFQ • Value: ')
      .replace(/Value:\s*INR\s*/gi, 'Value: ₹')
      .replace(/Urgency:\s*/gi, ' • Urgency: ');
  }

  // Capitalized CONSTANT_CASE strings
  if (typeof val === 'string' && val.match(/^[A-Z][A-Z0-9_]*$/)) {
    return val
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }

  return String(val);
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

  // Auto-update activeSection based on manual page scroll position
  React.useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleScroll = () => {
      const elements = document.querySelectorAll('[id^="sec-content-"]');
      if (!elements || elements.length === 0) return;

      const scrollPosition = window.scrollY + 160;
      for (let i = elements.length - 1; i >= 0; i--) {
        const el = elements[i] as HTMLElement;
        if (el) {
          const top = el.offsetTop;
          if (scrollPosition >= top) {
            setActiveSection(i);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

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

  const ownParticipation: any = user?.role === 'seller' ? (bidData?.participations || []).find((p: any) => 
    Number(p.sellerId) === Number(user?.id) || (user?.organizationId && p.seller?.organizationId === user.organizationId)
  ) : null;

  // Combine ownResponse from whichever path was used to reach this page
  const ownResponse = reqData?.ownResponse || bidReqData?.ownResponse || (ownParticipation ? {
    status: ownParticipation.status || 'SUBMITTED',
    createdAt: ownParticipation.createdAt,
    updatedAt: ownParticipation.updatedAt || ownParticipation.createdAt,
    offeredPrice: ownParticipation.offeredPrice || ownParticipation.responseData?.offeredPrice,
    offeredQuantity: ownParticipation.offeredQuantity || ownParticipation.responseData?.offeredQuantity,
    deliveryTimeline: ownParticipation.deliveryTimeline || ownParticipation.responseData?.deliveryTimeline,
    terms: ownParticipation.terms || ownParticipation.responseData?.terms,
    message: ownParticipation.message || ownParticipation.responseData?.message,
    responseData: ownParticipation.responseData,
  } : null);

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
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 md:px-8 pb-16 font-sans text-slate-800 scroll-smooth animate-in fade-in zoom-in-95 duration-300">

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
      <section className="relative overflow-hidden border border-slate-200/80 rounded-2xl bg-white p-6 md:p-8 shadow-sm transition-all duration-300 hover:shadow-md animate-in fade-in slide-in-from-bottom-3 duration-500">
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
              className="h-10 rounded-xl border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition-all flex items-center gap-1.5 hover:-translate-y-0.5"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={handleDownload}
              className="h-10 rounded-xl border-slate-200 bg-white text-xs font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-2xs transition-all flex items-center gap-2 hover:-translate-y-0.5"
            >
              <Download className="h-4 w-4 text-blue-600" /> <span className="hidden sm:inline">Download</span> RFQ
            </Button>
            {user && user.role === 'seller' && (
              ownResponse && ownResponse.status !== 'DRAFT' ? (
                <Button
                  type="button"
                  onClick={handleSubmitQuotation}
                  className="h-10 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-6 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-emerald-900/15 transition-all flex items-center gap-2 hover:scale-[1.01] active:scale-[0.99] hover:-translate-y-0.5"
                >
                  <CheckCircle className="h-4 w-4 text-emerald-200" /> View / Edit Quotation
                </Button>
              ) : ownResponse && ownResponse.status === 'DRAFT' ? (
                <Button
                  type="button"
                  onClick={handleSubmitQuotation}
                  className="h-10 rounded-xl bg-amber-600 hover:bg-amber-700 px-6 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-amber-900/15 transition-all flex items-center gap-2 hover:scale-[1.01] active:scale-[0.99] hover:-translate-y-0.5"
                >
                  <Clock className="h-4 w-4 text-amber-200" /> Continue Draft Quotation
                </Button>
              ) : (
                <Button
                  type="button"
                  onClick={handleSubmitQuotation}
                  className="h-10 rounded-xl bg-gradient-to-r from-[#12335f] to-[#1a447c] hover:from-[#0b2447] hover:to-[#12335f] px-6 text-xs font-black uppercase tracking-wider text-white shadow-md shadow-blue-900/15 transition-all flex items-center gap-2 hover:scale-[1.01] active:scale-[0.99] hover:-translate-y-0.5"
                >
                  Submit Quotation <ArrowRight className="h-4 w-4" />
                </Button>
              )
            )}
          </div>
        </div>
      </section>

      {/* ── Submitted Quotation Success Indicator Banner ── */}
      {user && user.role === 'seller' && ownResponse && ownResponse.status !== 'DRAFT' && (
        <div className="rounded-2xl border border-emerald-200/90 bg-emerald-50/80 p-4 sm:p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 animate-in fade-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-3.5">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white shadow-2xs">
              <ShieldCheck className="h-6 w-6 stroke-[2.5]" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-black text-emerald-950">Quotation Already Submitted</p>
                <span className="rounded-full bg-emerald-200/90 px-2.5 py-0.5 text-[9px] font-black uppercase text-emerald-800 tracking-wider">
                  Active Submission
                </span>
              </div>
              <p className="text-xs font-semibold text-emerald-700 mt-1 flex flex-wrap items-center gap-1.5">
                <span>Submitted on <strong className="font-extrabold text-emerald-900">{formatDateString(ownResponse.updatedAt || ownResponse.createdAt, true)}</strong></span>
                {ownResponse.offeredPrice && (
                  <>
                    <span className="text-emerald-400">•</span>
                    <span>Quoted Total: <strong className="font-black text-emerald-900">{formatCurrency(Number(ownResponse.offeredPrice))}</strong></span>
                  </>
                )}
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={handleSubmitQuotation}
            className="h-10 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white px-5 text-xs font-black uppercase tracking-wider shadow-sm transition-all flex items-center gap-2 shrink-0 self-end sm:self-center"
          >
            <Eye className="h-4 w-4" /> View / Edit Quotation
          </Button>
        </div>
      )}

      {/* ── Sticky Quick Navigation Bar ── */}
      <div className="sticky top-4 z-40 bg-white/90 backdrop-blur-md border border-slate-200/80 rounded-2xl px-4 py-2.5 shadow-md transition-all duration-300 animate-in fade-in slide-in-from-top-2 duration-400">
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => scrollToSection('overview')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95 hover:-translate-y-0.5"
          >
            <ClipboardList className="h-3.5 w-3.5 text-blue-600" /> Overview
          </button>
          <button
            type="button"
            onClick={() => scrollToSection('scope-items')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95 hover:-translate-y-0.5"
          >
            <FileText className="h-3.5 w-3.5 text-purple-600" /> Scope & Description
          </button>
          {itemsList.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToSection('line-items')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95 hover:-translate-y-0.5"
            >
              <Package className="h-3.5 w-3.5 text-amber-600" /> Items & Specifications
            </button>
          )}
          <button
            type="button"
            onClick={() => scrollToSection('buyer-info')}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95 hover:-translate-y-0.5"
          >
            <Building2 className="h-3.5 w-3.5 text-emerald-600" /> Buyer Details
          </button>
          {detailSections.length > 0 && (
            <button
              type="button"
              onClick={() => scrollToSection('additional-metadata')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold text-slate-600 hover:text-[#12335f] hover:bg-slate-100 transition-all whitespace-nowrap active:scale-95 hover:-translate-y-0.5"
            >
              <Layers className="h-3.5 w-3.5 text-indigo-600" /> Specifications & Metadata ({detailSections.length})
            </button>
          )}
        </div>
      </div>

      {/* ── Lifecycle Stepper / Progress Bar Section ── */}
      <section className="border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm overflow-x-auto animate-in fade-in slide-in-from-bottom-3 duration-500">
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
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#12335f]/10 text-[#12335f] border border-[#12335f]/20">
                  <FileText className="h-4 w-4" />
                </span>
                <span>RFQ Scope</span>
              </h2>
            </div>
            {(() => {
              const parsed = parseDescription(rfqData?.description);
              const urgencyVal = basics.urgency || payload.urgency || 'Normal';
              const summaryLine = `Sourcing Method: ${formatDisplayValue(String(methodLabel))} | Value: ${formatCurrency(estimatedValueVal)} | Urgency: ${urgencyVal}`;

              return (
                <div className="space-y-4">
                  <div className="bg-slate-50/80 p-4 rounded-xl border border-slate-200/70 text-xs font-bold text-slate-800">
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">Procurement Summary</p>
                    <p className="text-slate-900 font-extrabold">{summaryLine}</p>
                    {parsed.text && (
                      <p className="mt-2.5 text-xs font-semibold leading-relaxed text-slate-700 whitespace-pre-wrap break-words border-t border-slate-200/60 pt-2">
                        {parsed.text}
                      </p>
                    )}
                  </div>
                </div>
              );
            })()}
          </section>

          {/* Key Dates Vertical Timeline (Matching UI Mockup) */}
          <section id="key-dates" className="scroll-mt-24 border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm space-y-4 transition-all duration-300 hover:shadow-md">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-50 text-rose-600 border border-rose-200">
                  <CalendarDays className="h-4 w-4" />
                </span>
                <span>Key Dates</span>
              </h2>
            </div>

            <div className="space-y-3 pt-1">
              {/* Bid Published */}
              <div className="flex items-start gap-3.5 p-3 rounded-xl hover:bg-slate-50/80 transition-colors">
                <span className="h-3.5 w-3.5 rounded-full bg-emerald-500 ring-4 ring-emerald-100 mt-1 shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Bid Published</p>
                  <p className="text-xs font-black text-slate-900 mt-0.5">{publishedDateFormatted}</p>
                </div>
              </div>

              {/* Clarification Deadline */}
              <div className="flex items-start gap-3.5 p-3 rounded-xl hover:bg-slate-50/80 transition-colors">
                <span className="h-3.5 w-3.5 rounded-full bg-slate-300 ring-4 ring-slate-100 mt-1 shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Clarification Deadline</p>
                  <p className="text-xs font-black text-slate-900 mt-0.5">{clarificationDeadlineStr}</p>
                </div>
              </div>

              {/* Proposal Submission End (Highlighted Red Alert Box) */}
              <div className="flex items-start gap-3.5 p-3.5 rounded-xl bg-rose-50/70 border border-rose-200/90 text-rose-950 shadow-2xs">
                <span className="h-3.5 w-3.5 rounded-full bg-rose-500 ring-4 ring-rose-200 mt-1 shrink-0 animate-pulse" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-rose-700">Proposal / Quotation Submission End</p>
                  <p className="text-xs font-black text-rose-900 mt-0.5">{closesAtFormatted}</p>
                </div>
              </div>

              {/* Technical Opening */}
              <div className="flex items-start gap-3.5 p-3 rounded-xl hover:bg-slate-50/80 transition-colors">
                <span className="h-3.5 w-3.5 rounded-full bg-blue-500 ring-4 ring-blue-100 mt-1 shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Technical Opening</p>
                  <p className="text-xs font-black text-slate-900 mt-0.5">{closesAtFormatted !== '—' ? closesAtFormatted : 'Pending'}</p>
                </div>
              </div>

              {/* Presentation */}
              <div className="flex items-start gap-3.5 p-3 rounded-xl hover:bg-slate-50/80 transition-colors">
                <span className="h-3.5 w-3.5 rounded-full bg-slate-300 ring-4 ring-slate-100 mt-1 shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Presentation</p>
                  <p className="text-xs font-black text-slate-900 mt-0.5">—</p>
                </div>
              </div>

              {/* Financial Opening */}
              <div className="flex items-start gap-3.5 p-3 rounded-xl hover:bg-slate-50/80 transition-colors">
                <span className="h-3.5 w-3.5 rounded-full bg-blue-500 ring-4 ring-blue-100 mt-1 shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Financial Opening</p>
                  <p className="text-xs font-black text-slate-900 mt-0.5">{closesAtFormatted !== '—' ? closesAtFormatted : 'Pending'}</p>
                </div>
              </div>

              {/* Awarding Date */}
              <div className="flex items-start gap-3.5 p-3 rounded-xl hover:bg-slate-50/80 transition-colors">
                <span className="h-3.5 w-3.5 rounded-full bg-slate-300 ring-4 ring-slate-100 mt-1 shrink-0" />
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Awarding Date</p>
                  <p className="text-xs font-black text-slate-900 mt-0.5">—</p>
                </div>
              </div>
            </div>
          </section>

          {/* ── Documents & Activity Snapshot Row ── */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">

            {/* Left: RFP DOCUMENTS (7 cols) */}
            <section id="documents" className="lg:col-span-7 scroll-mt-24 border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm space-y-4 transition-all duration-300 hover:shadow-md">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600 border border-blue-200">
                    <Paperclip className="h-4 w-4" />
                  </span>
                  <span>RFP DOCUMENTS</span>
                </h2>
              </div>

              {documents.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                  {documents.map((doc, idx) => {
                    const isUploaded = doc.fileAssetId !== null && doc.fileAssetId !== undefined;
                    return (
                      <div
                        key={idx}
                        onClick={() => {
                          if (isUploaded && doc.fileAssetId) {
                            openFileAsset({ id: doc.fileAssetId, fileAssetId: doc.fileAssetId, originalName: doc.fileName }, doc.fileName);
                          }
                        }}
                        className="flex items-center gap-3 p-3.5 rounded-xl border border-slate-200/80 bg-slate-50/50 hover:bg-white hover:shadow-md hover:border-blue-300 transition-all cursor-pointer group"
                      >
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-blue-50 border border-blue-200 text-[#12335f] group-hover:scale-105 transition-transform">
                          <FileText className="h-5 w-5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-black text-slate-900 truncate" title={doc.fileName}>{doc.fileName}</p>
                          <span className="inline-block mt-0.5 text-[9px] font-black uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                            {isUploaded ? 'Uploaded Document' : 'Required'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="text-xs font-bold text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl bg-slate-50/30">
                  No documents attached for this RFQ.
                </p>
              )}
            </section>

            {/* Right: ACTIVITY SNAPSHOT (5 cols) */}
            <section className="lg:col-span-5 border border-slate-200/80 rounded-2xl bg-white p-6 shadow-sm space-y-4 transition-all duration-300 hover:shadow-md">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h2 className="text-base font-black text-slate-900 flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-200">
                    <TrendingUp className="h-4 w-4" />
                  </span>
                  <span>ACTIVITY SNAPSHOT</span>
                </h2>
              </div>

              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 flex flex-col justify-between space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Queries</span>
                  <span className="text-2xl font-black text-slate-900">{rfqData?.clarifications?.length || 0}</span>
                </div>

                <div className="p-4 rounded-xl border border-slate-200/80 bg-slate-50/50 flex flex-col justify-between space-y-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Total Responses</span>
                  <span className="text-2xl font-black text-slate-900">{rfqData?.participations?.length || 0}</span>
                </div>
              </div>
            </section>
          </div>

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

      {/* ── Left-Side Vertical Navigation Panel + Right Detailed Content ── */}
      {detailSections.length > 0 && (() => {
        const getSectionIcon = (title: string) => {
          const t = title.toLowerCase();
          if (t.includes('intent') || t.includes('scope')) return ClipboardList;
          if (t.includes('consignee') || t.includes('location') || t.includes('address')) return MapPin;
          if (t.includes('vendor') || t.includes('supplier') || t.includes('seller')) return Users;
          if (t.includes('timeline') || t.includes('schedule') || t.includes('date') || t.includes('rule')) return CalendarDays;
          if (t.includes('commercial') || t.includes('payment') || t.includes('price') || t.includes('budget')) return IndianRupee;
          if (t.includes('evaluation') || t.includes('basis') || t.includes('score')) return Award;
          if (t.includes('approval') || t.includes('notes')) return ShieldCheck;
          if (t.includes('service')) return Wrench;
          if (t.includes('rate') || t.includes('contract')) return FileText;
          if (t.includes('auction')) return Gavel;
          return Layers;
        };

        const getFieldIcon = (label: string) => {
          const l = label.toLowerCase();
          if (l.includes('title') || l.includes('name')) return FileText;
          if (l.includes('category')) return Tag;
          if (l.includes('buyer') || l.includes('org')) return Building;
          if (l.includes('value') || l.includes('amount') || l.includes('budget') || l.includes('price') || l.includes('rate')) return IndianRupee;
          if (l.includes('location') || l.includes('address') || l.includes('consignee')) return MapPin;
          if (l.includes('buying') || l.includes('item') || l.includes('product') || l.includes('what')) return Package;
          if (l.includes('method') || l.includes('strategy') || l.includes('type')) return Zap;
          if (l.includes('date') || l.includes('time') || l.includes('deadline')) return CalendarDays;
          if (l.includes('user') || l.includes('person') || l.includes('contact')) return UserCheck;
          if (l.includes('status') || l.includes('state')) return CheckCircle2;
          return Info;
        };

        const getSectionStatus = (sec: { title: string; fields: Array<{ label: string; value: string }> }) => {
          if (!sec.fields || sec.fields.length === 0) {
            return { label: 'Optional', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
          }
          const filledCount = sec.fields.filter(f => {
            const val = String(f.value || '').trim();
            return val && val !== '—' && val !== '-' && val !== 'N/A' && val !== 'None';
          }).length;

          if (filledCount === sec.fields.length && filledCount > 0) {
            return { label: 'Completed', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200/80' };
          } else if (filledCount > 0) {
            return { label: `${filledCount}/${sec.fields.length} Filled`, badgeClass: 'bg-blue-50 text-blue-700 border-blue-200/80' };
          } else {
            return { label: 'Optional', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' };
          }
        };

        return (
          <section id="additional-metadata" className="scroll-mt-24 space-y-4">
            {/* Header Banner */}
            <div className="relative overflow-hidden rounded-2xl bg-gradient-to-r from-[#0b2447] via-[#12335f] to-[#1e4b8a] p-5 shadow-md border border-indigo-900/40 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="absolute -right-10 -top-10 h-36 w-36 rounded-full bg-white/5 blur-3xl pointer-events-none" />
              <div className="flex items-center gap-3.5 relative z-10">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/10 text-amber-400 border border-white/20 shadow-inner backdrop-blur-md shrink-0 font-bold">
                  <Layers className="h-5.5 w-5.5" />
                </span>
                <div>
                  <h2 className="text-base font-black tracking-tight uppercase flex items-center gap-2 text-white">
                    <span>COMPREHENSIVE PROCUREMENT DETAILS</span>
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-400/20 px-2.5 py-0.5 text-[9px] font-black text-amber-300 border border-amber-400/30 uppercase tracking-widest">
                      <Sparkles className="h-2.5 w-2.5" />
                      RFQ Specs
                    </span>
                  </h2>
                  <p className="text-xs text-slate-300 font-medium mt-0.5">
                    Specifications, terms, and requirements for this RFQ.
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2 relative z-10 shrink-0">
                <span className="px-3 py-1 rounded-xl text-[11px] font-black bg-white/10 text-amber-300 border border-white/20 backdrop-blur-md shadow-2xs">
                  {detailSections.length} Sections Defined
                </span>
              </div>
            </div>

            {/* Mobile Navigation Dropdown (< lg screens) */}
            <div className="block lg:hidden bg-white border border-slate-200/80 rounded-2xl p-4 shadow-xs space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-[10px] font-black uppercase tracking-wider text-slate-400">Select Section to View</label>
                <span className="text-[10px] font-bold text-slate-400">{detailSections.length} Sections</span>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1 scroll-smooth custom-scrollbar">
                {detailSections.map((sec, idx) => {
                  const isActive = (activeSection === null && idx === 0) || activeSection === idx;
                  const SectionIcon = getSectionIcon(sec.title);
                  return (
                    <button
                      key={`mob-${sec.title}-${idx}`}
                      type="button"
                      onClick={() => {
                        setActiveSection(idx);
                        const el = document.getElementById(`sec-content-${idx}`);
                        if (el) {
                          el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                      }}
                      className={cn(
                        "flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold whitespace-nowrap transition-all duration-200 shrink-0 border shadow-2xs",
                        isActive
                          ? "bg-[#12335f] text-white border-[#12335f] shadow-sm"
                          : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      )}
                    >
                      <SectionIcon className="h-3.5 w-3.5" />
                      <span>{sec.title}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Master-Detail Grid Layout */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
              
              {/* Sticky Left Vertical Navigation Sidebar */}
              <div className="hidden lg:block lg:col-span-4 xl:col-span-3 sticky top-24 space-y-2">
                <div className="bg-white border border-slate-200/90 rounded-2xl p-3.5 shadow-xs space-y-1.5 transition-all duration-300 hover:shadow-md">
                  <div className="px-3 py-2 text-[10px] font-black uppercase tracking-wider text-slate-400 border-b border-slate-100 mb-1 flex items-center justify-between">
                    <span>Navigation Panel</span>
                    <span className="text-slate-400 font-semibold">{detailSections.length} Items</span>
                  </div>

                  {detailSections.map((sec, idx) => {
                    const isActive = (activeSection === null && idx === 0) || activeSection === idx;
                    const SectionIcon = getSectionIcon(sec.title);
                    const status = getSectionStatus(sec);

                    return (
                      <button
                        key={`nav-${sec.title}-${idx}`}
                        type="button"
                        onClick={() => {
                          setActiveSection(idx);
                          const el = document.getElementById(`sec-content-${idx}`);
                          if (el) {
                            el.scrollIntoView({ behavior: 'smooth', block: 'start' });
                          }
                        }}
                        className={cn(
                          "w-full flex items-center justify-between p-3 rounded-xl text-left transition-all duration-200 group border text-xs font-bold",
                          isActive
                            ? "bg-gradient-to-r from-[#12335f] to-[#1e4b8a] text-white border-[#12335f] shadow-md border-l-4 border-l-amber-400 scale-[1.01]"
                            : "bg-slate-50/60 hover:bg-slate-100/90 text-slate-700 border-slate-200/80 hover:border-indigo-200 border-l-4 border-l-transparent"
                        )}
                      >
                        <div className="flex items-center gap-2.5 truncate pr-1">
                          <span className={cn(
                            "flex h-7 w-7 items-center justify-center rounded-lg text-xs transition-colors shrink-0 font-bold",
                            isActive ? "bg-white/20 text-white" : "bg-[#12335f]/10 text-[#12335f] group-hover:bg-[#12335f] group-hover:text-white"
                          )}>
                            <SectionIcon className="h-3.5 w-3.5" />
                          </span>
                          <span className="truncate font-extrabold">{sec.title}</span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className={cn(
                            "px-2 py-0.5 rounded-md text-[9px] font-black uppercase border tracking-wider",
                            isActive ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/30" : status.badgeClass
                          )}>
                            {status.label}
                          </span>
                          <ChevronRight className={cn(
                            "h-3.5 w-3.5 transition-transform duration-200",
                            isActive ? "text-amber-400 translate-x-0.5" : "text-slate-400 group-hover:translate-x-0.5"
                          )} />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Right-Side Detailed Content Cards (Review Summary Format) */}
              <div className="lg:col-span-8 xl:col-span-9 space-y-6">
                {detailSections.map((sec, idx) => {
                  const SectionIcon = getSectionIcon(sec.title);
                  const status = getSectionStatus(sec);
                  const isActive = (activeSection === null && idx === 0) || activeSection === idx;

                  return (
                    <div
                      key={`content-${sec.title}-${idx}`}
                      id={`sec-content-${idx}`}
                      className={cn(
                        "scroll-mt-28 rounded-2xl border bg-white p-6 shadow-xs transition-all duration-300 space-y-5",
                        isActive
                          ? "border-[#12335f]/50 shadow-md ring-2 ring-[#12335f]/10 border-l-4 border-l-[#12335f]"
                          : "border-slate-200/90 hover:border-slate-300"
                      )}
                    >
                      {/* Section Content Header */}
                      <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                        <div className="flex items-center gap-3">
                          <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#12335f] to-indigo-900 text-white shadow-xs font-bold shrink-0">
                            <SectionIcon className="h-5 w-5" />
                          </span>
                          <div>
                            <h3 className="text-base font-black uppercase tracking-wide text-[#12335f]">{sec.title}</h3>
                            <p className="text-xs text-slate-400 font-semibold">{sec.fields.length} {sec.fields.length === 1 ? 'parameter' : 'parameters'} defined</p>
                          </div>
                        </div>

                        <span className={cn("px-3 py-1 rounded-md text-[10px] font-black uppercase border tracking-wider shadow-2xs", status.badgeClass)}>
                          {status.label}
                        </span>
                      </div>

                      {/* Content Body: Full-Width Information Card with 2-Column Desktop Grid */}
                      {(() => {
                        const longTextFields = sec.fields.filter(f => {
                          const val = String(f.value || '');
                          return val.length > 80 || f.label.toLowerCase().includes('description') || f.label.toLowerCase().includes('reason') || f.label.toLowerCase().includes('justification') || f.label.toLowerCase().includes('notes') || f.label.toLowerCase().includes('scope') || f.label.toLowerCase().includes('terms');
                        });

                        const propertyFields = sec.fields.filter(f => !longTextFields.includes(f));

                        return (
                          <div className="space-y-5">
                            {/* Full-width Grouped Information Card (2-Column Grid on Desktop) */}
                            {propertyFields.length > 0 && (
                              <div className="rounded-xl border border-slate-200/80 bg-slate-50/40 p-5 shadow-2xs">
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-5">
                                  {propertyFields.map((field, fieldIdx) => {
                                    const formattedVal = formatDisplayValue(field.value, field.label);
                                    const strVal = String(field.value).trim().toLowerCase();
                                    const isYes = strVal === 'yes' || strVal === 'true';
                                    const isNo = strVal === 'no' || strVal === 'false';
                                    const isCurrency = field.label.toLowerCase().includes('value') || field.label.toLowerCase().includes('price') || field.label.toLowerCase().includes('amount') || field.label.toLowerCase().includes('budget');
                                    const isTitle = field.label.toLowerCase().includes('title');
                                    const FieldIcon = getFieldIcon(field.label);

                                    return (
                                      <div
                                        key={`${field.label}-${fieldIdx}`}
                                        className={cn(
                                          "flex flex-col space-y-1.5 pb-3 border-b border-slate-200/60 last:border-b-0 md:last:border-b-0",
                                          isTitle ? "col-span-full md:col-span-2 pb-4 border-b border-slate-200" : ""
                                        )}
                                      >
                                        <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide flex items-center gap-1.5">
                                          <FieldIcon className="h-3.5 w-3.5 text-indigo-600/70 shrink-0" />
                                          {field.label}
                                        </span>
                                        <div className="pt-0.5">
                                          {isYes ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700 border border-emerald-200 uppercase shadow-2xs">
                                              ✓ Yes
                                            </span>
                                          ) : isNo ? (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold text-slate-600 border border-slate-200 uppercase shadow-2xs">
                                              No
                                            </span>
                                          ) : isCurrency ? (
                                            <span className="inline-flex items-center gap-1 text-sm font-extrabold text-emerald-700 bg-emerald-50 px-3 py-1 rounded-lg border border-emerald-200 shadow-2xs">
                                              {formattedVal}
                                            </span>
                                          ) : (
                                            <span className={cn(
                                              "text-sm font-extrabold text-slate-900 leading-relaxed break-words whitespace-normal",
                                              isTitle ? "text-base text-[#12335f]" : ""
                                            )}>
                                              {formattedVal}
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Dedicated Full-Width Cards for Long Text Fields */}
                            {longTextFields.length > 0 && (
                              <div className="space-y-4 pt-1">
                                {longTextFields.map((field, fieldIdx) => {
                                  const FieldIcon = getFieldIcon(field.label);
                                  return (
                                    <div
                                      key={`long-${field.label}-${fieldIdx}`}
                                      className="rounded-xl border border-indigo-100 bg-gradient-to-br from-indigo-50/30 via-slate-50/40 to-white p-5 shadow-2xs border-l-4 border-l-[#12335f] space-y-2"
                                    >
                                      <div className="flex items-center gap-2 pb-2 border-b border-indigo-100/60">
                                        <span className="flex h-6 w-6 items-center justify-center rounded-md bg-[#12335f] text-white shadow-2xs shrink-0">
                                          <FieldIcon className="h-3.5 w-3.5" />
                                        </span>
                                        <span className="text-xs font-extrabold uppercase tracking-wider text-[#12335f]">
                                          {field.label}
                                        </span>
                                      </div>
                                      <p className="text-xs md:text-sm font-semibold leading-relaxed text-slate-800 whitespace-pre-wrap break-words">
                                        {formatDisplayValue(field.value, field.label)}
                                      </p>
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })()}
                    </div>
                  );
                })}
              </div>

            </div>
          </section>
        );
      })()}

    </div>
  );
}
