'use client';

import React from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import {
  Download,
  Share2,
  Calendar,
  MapPin,
  Building2,
  Phone,
  Mail,
  User,
  Check,
  ChevronRight,
  Loader2,
  Eye,
  FileText,
  MessageSquare,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  TrendingUp,
  HelpCircle,
  ArrowLeft,
  Clock,
  Info,
  IndianRupee,
  Layers,
  ClipboardCheck,
  ClipboardList,
  Package,
  CalendarDays,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApi } from '../../shared/apiClient';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { useQuery } from '@tanstack/react-query';
import { openFileAsset } from '../../../lib/files';
import { procurementBidApi } from '../../procurementBid/api';

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

const formatDisplayValue = (val: string, label?: string) => {
  if (!val) return '—';
  if (val.match(/^[A-Z][A-Z0-9_]*$/)) {
    return val
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  return val;
};

export default function RfpDetailPage() {
  const [activeSection, setActiveSection] = React.useState<number | null>(0);
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname() || '';
  const { user } = useAuth();
  const requestId = searchParams?.get('requestId') || '';
  const requirementId = searchParams?.get('requirementId') || '';

  // Fetch ProcurementBid data when requestId is provided (numeric ID or REQ-* reference ID)
  const { data: bidData, isLoading: bidLoading, error: bidError } = useQuery({
    queryKey: ['procurement-bid-rfp-detail', requestId],
    queryFn: () => procurementBidApi.detail(requestId),
    enabled: !!requestId,
  });

  // Fetch BuyerRequirement data when requirementId is provided
  const { data: reqData, isLoading: reqLoading, error: reqError } = useQuery({
    queryKey: ['marketplace-requirement-rfp-detail', requirementId],
    queryFn: async () => {
      const data = await getApi<any>(`/api/marketplace/requirements/${requirementId}`);
      return data;
    },
    enabled: !!requirementId,
  });

  const isLoading = (!!requestId && bidLoading) || (!!requirementId && reqLoading);
  const error = (!!requestId && bidError) || (!!requirementId && reqError);

  const reqObj = reqData?.requirement || reqData;
  const ownResponse = reqData?.ownResponse || null;
  const hasSubmittedProposal = bidData?.participations?.some((p: any) => p.submissionStatus === 'SUBMITTED' && p.sellerId === user?.id) || ownResponse?.status === 'SUBMITTED';

  // Map data from whichever source responded
  const rfpData: any = bidData ? {
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
    status: bidData.status,
    location: bidData.deliveryLocation,
    requirementNumber: bidData.id,
    paymentTerms: bidData.technicalPacket?.terms?.paymentTerms || bidData.terms?.[0] || '',
    deliveryTerms: bidData.technicalPacket?.terms?.deliveryTerms || '',
    description: bidData.description,
    payload: bidData.technicalPacket,
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
    category: bidData.category,
    buyerOrganization: bidData.buyerOrganization || { organizationName: bidData.buyerName },
    buyerOrganizationName: bidData.buyerName,
    emdAmount: bidData.emdAmount,
    isEmdRequired: bidData.isEmdRequired,
    evaluationMethod: bidData.evaluationMethod,
    contactPerson: bidData.technicalPacket?.internal?.contactPerson || bidData.buyer?.name || '',
    buyerEmail: bidData.technicalPacket?.internal?.email || bidData.buyer?.email || '',
    buyerMobile: bidData.technicalPacket?.internal?.mobile || bidData.buyer?.mobile || '',
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
    status: reqObj.status,
    tenders: reqObj.tenders,
    location: reqObj.location,
    requirementNumber: reqObj.requirementNumber,
    paymentTerms: reqObj.paymentTerms || reqObj.payload?.paymentTerms,
    deliveryTerms: reqObj.deliveryTerms || reqObj.payload?.deliveryTerms,
    description: reqObj.description,
    payload: reqObj.payload,
    documents: reqObj.documents,
    items: reqObj.items,
    category: reqObj.category,
    buyerOrganization: reqObj.buyerOrganization,
  } : null;

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
        let hours = d.getHours();
        const minutes = d.getMinutes().toString().padStart(2, '0');
        const ampm = 'IST';
        const formattedHours = hours.toString().padStart(2, '0');
        base += ` ${formattedHours}:${minutes} ${ampm}`;
      }
      return base;
    } catch {
      return String(dateStr);
    }
  };

  // Payload data extraction
  const payload = rfpData?.payload || {};
  const basics = payload.basics || {};
  const internal = payload.internal || {};
  const schedule = payload.schedule || {};
  const terms = payload.terms || {};
  const rules = payload.rules || {};
  const evaluation = payload.evaluation || {};

  // Detail Sections for Accordion
  const detailSections = rfpData?.payload ? [
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

  if (isLoading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-blue-600" />
        <p className="text-sm font-bold text-slate-500">Loading RFP details...</p>
      </div>
    );
  }

  // Determine which RFP is being viewed
  let subject = rfpData?.subject || rfpData?.title || '';
  const isSeedId = [100, 101, 102, 103, 104].includes(Number(requestId));
  if (!subject && isSeedId) {
    if (Number(requestId) === 100) subject = '[SEED] Implementation of Cloud-Based Inventory System';
    else if (Number(requestId) === 101) subject = '[SEED] Structural Design Consultancy for Nagpur Plant';
    else if (Number(requestId) === 102) subject = '[SEED] Hazardous Chemical Waste Disposal Service';
    else if (Number(requestId) === 103) subject = '[SEED] Warehouse Robot Sorting Automation Integration';
    else if (Number(requestId) === 104) subject = '[SEED] Annual Maintenance Contract for HVAC Systems';
  }
  if (!subject) subject = 'RFP Sourcing Opportunity';

  const isInventory = isSeedId && (subject.toLowerCase().includes('inventory') || subject.toLowerCase().includes('cloud'));
  const isStructural = isSeedId && (subject.toLowerCase().includes('structural') || subject.toLowerCase().includes('nagpur'));
  const isWaste = isSeedId && (subject.toLowerCase().includes('waste') || subject.toLowerCase().includes('chemical'));
  const isRobot = isSeedId && (subject.toLowerCase().includes('robot') || subject.toLowerCase().includes('sorting'));
  const isHvac = isSeedId && (subject.toLowerCase().includes('hvac') || subject.toLowerCase().includes('annual'));

  // 1. RFP Number
  let rfpNumberString = rfpData?.requirementNumber || (rfpData?.id ? `RFP-2026-015${Math.abs(Number(rfpData.id))}` : '—');
  if (!rfpData?.requirementNumber && isSeedId) {
    if (isInventory) rfpNumberString = 'SEED-BID-RFP-100-8451';
    else if (isStructural) rfpNumberString = 'SEED-BID-RFP-101-9214';
    else if (isWaste) rfpNumberString = 'SEED-BID-RFP-102-7634';
    else if (isRobot) rfpNumberString = 'SEED-BID-RFP-103-3482';
    else if (isHvac) rfpNumberString = 'SEED-BID-RFP-104-5109';
  }

  // 2. Buyer Info
  const orgName = rfpData?.buyerOrganization?.organizationName 
    || rfpData?.buyer?.buyerProfile?.organizationName 
    || rfpData?.buyerOrganizationName
    || rfpData?.buyer?.name
    || (isSeedId ? 'Govt. Buyer Org' : '—');

  const contactPerson = rfpData?.contactPerson 
    || rfpData?.buyer?.buyerProfile?.contactPerson 
    || rfpData?.payload?.internal?.contactPerson
    || (isSeedId ? 'M. R. Patnaik' : '—');

  const email = rfpData?.buyer?.email 
    || rfpData?.buyerEmail 
    || rfpData?.payload?.internal?.email
    || (isSeedId ? 'tenders@govorg.in' : '—');

  const phone = rfpData?.buyer?.mobile 
    || rfpData?.buyerMobile 
    || rfpData?.payload?.internal?.mobile
    || (isSeedId ? '+91 94370 67890' : '—');

  let address = '—';
  if (rfpData?.buyer?.buyerProfile?.city) {
    address = `${rfpData.buyer.buyerProfile.organizationName || orgName}, ${rfpData.buyer.buyerProfile.city}, ${rfpData.buyer.buyerProfile.state || ''}`;
  } else if (rfpData?.location) {
    address = rfpData?.location || '—';
  } else if (isSeedId) {
    address = 'Secretariat Main Annex, Bhubaneswar - 751001, Odisha';
  }

  // 3. Estimated Value
  let estimatedValueVal: number | undefined = undefined;
  if (rfpData?.estimatedValue) estimatedValueVal = Number(rfpData.estimatedValue);
  else if (isSeedId) {
    if (isInventory) estimatedValueVal = 7500000;
    else if (isStructural) estimatedValueVal = 1800000;
    else if (isWaste) estimatedValueVal = 2400000;
    else if (isRobot) estimatedValueVal = 9500000;
    else if (isHvac) estimatedValueVal = 1500000;
    else estimatedValueVal = 45000000;
  }

  // 4. Category & Subcategory
  let category = rfpData?.category || rfpData?.payload?.basics?.category || (isSeedId ? 'IT Services' : '—');
  let subCategory = rfpData?.payload?.basics?.subCategory || (isSeedId ? 'ERP Implementation' : '—');
  if (isSeedId) {
    if (isInventory) {
      category = 'IT & Computer Equipment';
      subCategory = 'Cloud Inventory';
    } else if (isStructural) {
      category = 'Engineering Services';
      subCategory = 'Structural Design';
    } else if (isWaste) {
      category = 'Environmental Services';
      subCategory = 'Waste Management';
    } else if (isRobot) {
      category = 'Automation & Robotics';
      subCategory = 'Robotics Sorting';
    } else if (isHvac) {
      category = 'Maintenance Services';
      subCategory = 'HVAC AMC';
    }
  }

  // 5. Closes At / Closes At formatted
  let closesAtFormatted = '—';
  if (rfpData?.deadlineDate) closesAtFormatted = formatDateString(rfpData.deadlineDate, true);
  else if (isSeedId) {
    if (isInventory) closesAtFormatted = '26 Jul 2026 17:00 IST';
    else if (isStructural) closesAtFormatted = '28 Jul 2026 17:00 IST';
    else if (isWaste) closesAtFormatted = '30 Jul 2026 17:00 IST';
    else if (isRobot) closesAtFormatted = '02 Aug 2026 17:00 IST';
    else if (isHvac) closesAtFormatted = '04 Aug 2026 17:00 IST';
    else closesAtFormatted = '26 Jul 2026 15:00 IST';
  }

  const publishedDateFormatted = rfpData?.createdAt ? formatDateString(rfpData.createdAt) : (isSeedId ? '10 Jul 2026' : '—');

  // 6. RFP Scope Text
  const scopeText = rfpData?.description || (isSeedId 
    ? (isInventory ? "Sourcing a cloud-based inventory tracking and storage reconciliation platform integrated with internal ERP modules."
      : isStructural ? "Consultancy contract for designing the load bearing structural framework of Nagpur factory assembly plant expansion."
      : isWaste ? "Safe disposal, packaging, logistics, and compliance reporting of hazardous chemical byproducts from manufacturing plant."
      : isRobot ? "Integration and programming of automated robotic arm sorting systems along shipping conveyors in main sorting zone."
      : isHvac ? "Annual Maintenance Contract for heavy industrial centralized ventilation, air filter chambers, and HVAC overhauls."
      : "Implementation of end-to-end ERP solution covering Finance, Inventory, Procurement, Sales, HR & Payroll modules with integration and user training.")
    : "No scope description provided.");

  // 7. Timeline Steps (blue checked circles, matching mockup style)
  const timelineSteps = [
    { label: 'RFP Published', date: publishedDateFormatted, completed: true },
    { label: 'Pre-Bid Meeting', date: isSeedId ? '15 Jul 2026' : '—', completed: isSeedId },
    { label: 'Proposal Submission', date: closesAtFormatted !== '—' ? closesAtFormatted.split(' ')[0] + ' ' + (closesAtFormatted.split(' ')[1] || '') : '—', completed: false },
    { label: 'Technical Evaluation', date: 'Pending', completed: false },
    { label: 'Presentation', date: 'Pending', completed: false },
    { label: 'Final Evaluation', date: 'Pending', completed: false },
    { label: 'Award', date: 'Pending', completed: false },
  ];

  // 8. Key Dates Rows
  let preBidMeetingDate = isSeedId ? '15 Jul 2026, 11:00 IST' : '—';
  let submissionEndDate = closesAtFormatted;
  let technicalEvalDate = isSeedId ? '26 Jul 2026 - 03 Aug 2026' : '—';
  let presentationDate = isSeedId ? '05 Aug 2026' : '—';
  let finalEvalDate = isSeedId ? '06 Aug 2026 - 08 Aug 2026' : '—';
  let awardDate = isSeedId ? '10 Aug 2026 (Tentative)' : '—';

  if (isSeedId && isStructural) {
    preBidMeetingDate = '17 Jul 2026, 11:00 IST';
    submissionEndDate = closesAtFormatted;
    technicalEvalDate = '28 Jul 2026 - 05 Aug 2026';
    presentationDate = '07 Aug 2026';
    finalEvalDate = '08 Aug 2026 - 11 Aug 2026';
    awardDate = '12 Aug 2026 (Tentative)';
  } else if (isSeedId && isWaste) {
    preBidMeetingDate = '19 Jul 2026, 11:00 IST';
    submissionEndDate = closesAtFormatted;
    technicalEvalDate = '30 Jul 2026 - 07 Aug 2026';
    presentationDate = '09 Aug 2026';
    finalEvalDate = '10 Aug 2026 - 13 Aug 2026';
    awardDate = '15 Aug 2026 (Tentative)';
  }

  // 9. Activity Snapshot counts
  const totalQueries = rfpData?.clarifications?.length || (isSeedId ? (isInventory ? 9 : isStructural ? 4 : isWaste ? 7 : 15) : 0);
  const totalResponses = rfpData?.participations?.length || (isSeedId ? (isInventory ? 9 : isStructural ? 4 : isWaste ? 7 : 15) : 0);
  const totalViews = rfpData?.viewsCount || (isSeedId ? (isInventory ? 84 : isStructural ? 45 : isWaste ? 62 : 120) : 0);

  // 10. Documents
  const documents: any[] = [];
  const rawDocs = (rfpData as any)?.documents || (reqData as any)?.documents || (bidData as any)?.bidDocuments || [];
  if (Array.isArray(rawDocs) && rawDocs.length > 0) {
    rawDocs.forEach((doc: any) => {
      documents.push({
        id: doc.id,
        name: doc.fileName || doc.documentType || 'Bid document',
        meta: [doc.documentType, doc.mimeType].filter(Boolean).join(' - ') || 'Uploaded document',
        fileAssetId: doc.fileAssetId,
        url: doc.fileUrl || doc.url,
      });
    });
  }
  if (rfpData?.documentUrl) {
    documents.push({
      id: rfpData.id,
      name: rfpData.documentUrl.split('/').pop() || 'RFP Document',
      meta: 'Document link',
      url: rfpData.documentUrl
    });
  }

  const handleDownload = () => {
    toast.success('Downloading RFP package...');
  };

  const handleSubmitProposal = () => {
    if (!user) {
      toast.error('Please login to participate and submit your proposal.');
      router.push(`/login?redirect=${encodeURIComponent(pathname + (requestId ? `?requestId=${requestId}` : (requirementId ? `?requirementId=${requirementId}` : '')))}`);
      return;
    }
    const targetBidId = requestId || rfpData?.payload?.linkedProcurementBidId || rfpData?.tenders?.[0]?.id || (requirementId && !isNaN(Number(requirementId)) ? Math.abs(Number(requirementId)) : requirementId);
    router.push(`/bids/${targetBidId}/participate`);
  };

  const InfoRow = ({ label, value, red }: { label: string; value: string; red?: boolean }) => (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className={cn("text-xs font-black text-right", red ? "text-red-600" : "text-slate-800")}>{value}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 md:px-8">
      {/* ── Breadcrumb Navigation ── */}
      <nav className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        {pathname.startsWith('/buyer') ? (
          <>
            <span className="hover:text-slate-800 cursor-pointer" onClick={() => router.push('/buyer/my-procurements')}>My Procurements</span>
            <ChevronRight className="h-3 w-3" />
          </>
        ) : (
          <>
            <span className="hover:text-slate-800 cursor-pointer" onClick={() => router.push('/seller/opportunities')}>Opportunities</span>
            <ChevronRight className="h-3 w-3" />
            <span className="hover:text-slate-800 cursor-pointer" onClick={() => router.push('/seller/opportunities/rfps')}>RFPs</span>
            <ChevronRight className="h-3 w-3" />
          </>
        )}
        <span className="hover:text-slate-800 cursor-pointer">{rfpNumberString}</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-blue-600">Details</span>
      </nav>

      {/* Guest login banner */}
      {!user && (
        <div className="mb-5 flex items-center gap-3 rounded-xl border border-blue-200 bg-blue-50 px-5 py-4 shadow-sm">
          <Info className="h-5 w-5 text-blue-600 shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-bold text-blue-800">Want to participate in this procurement?</p>
            <p className="text-xs text-blue-600 mt-0.5">Please login or register as a seller to submit your quotation/proposal.</p>
          </div>
          <a
            href={`/login?redirect=${encodeURIComponent(pathname + (requestId ? `?requestId=${requestId}` : (requirementId ? `?requirementId=${requirementId}` : '')))}`}
            className="whitespace-nowrap rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
          >
            Login to Participate
          </a>
        </div>
      )}

      {/* ── Page Header ── */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
              {subject}
            </h1>
            <span className="inline-flex items-center rounded-full bg-orange-50 px-3 py-1 text-xs font-extrabold tracking-wide text-orange-700 border border-orange-100">
              RFP Published
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-500">
            <span className="font-mono font-bold text-slate-600">{rfpNumberString}</span>
            <span className="mx-2">•</span>
            Published on {publishedDateFormatted} by {orgName}
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleDownload}
            className="h-10 rounded-xl border-slate-200 text-xs font-black uppercase text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Download className="h-4 w-4" /> Download RFP
          </Button>
          {user && user.role === 'seller' && (
            <Button
              type="button"
              onClick={handleSubmitProposal}
              className="h-10 rounded-xl bg-teal-650 bg-teal-600 px-6 text-xs font-black uppercase text-white hover:bg-teal-700 shadow-sm transition-colors flex items-center gap-1.5"
            >
              {hasSubmittedProposal ? 'View Submitted Proposal' : 'Submit Proposal'} <ArrowRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </section>

      {/* ── Timeline Section ── */}
      <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm overflow-x-auto">
        <div className="min-w-[1000px] flex items-center justify-between relative px-6 py-4">
          {timelineSteps.map((step, idx) => {
            const hasNext = idx < timelineSteps.length - 1;
            const nextStepCompleted = hasNext && timelineSteps[idx + 1].completed;
            return (
              <div key={idx} className="flex items-center flex-1 last:flex-none">
                {/* Circle Icon Node */}
                <div className="flex flex-col items-center gap-3 relative z-10 w-32 text-center shrink-0">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300",
                      step.completed
                        ? "bg-blue-600 border-blue-600 text-white shadow-md shadow-blue-100"
                        : "bg-white border-slate-200 text-slate-400"
                    )}
                  >
                    {step.completed ? (
                      <Check className="h-4.5 w-4.5 stroke-[3]" />
                    ) : (
                      <div className="h-2.5 w-2.5 rounded-full bg-slate-200" />
                    )}
                  </div>

                  <div className="space-y-1">
                    <p className={cn(
                      "text-xs font-black tracking-tight",
                      step.completed ? "text-blue-700" : "text-slate-800"
                    )}>
                      {step.label}
                    </p>
                    <p className="text-[10px] font-semibold text-slate-500">
                      {step.date}
                    </p>
                  </div>
                </div>

                {/* Connecting Line segment */}
                {hasNext && (
                  <div className={cn(
                    "flex-1 h-[3px] -mt-10 mx-2 rounded",
                    step.completed && nextStepCompleted ? "bg-blue-600" : "bg-slate-100"
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── RFP Overview ── */}
      <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm transition-all duration-300 hover:shadow-md animate-fade-in">
        <div className="flex items-center gap-2 pb-3.5 border-b border-slate-100">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-700">
            <ClipboardList className="h-4 w-4" />
          </div>
          <h2 className="text-base font-black text-slate-900 uppercase tracking-wider">
            RFP Overview
          </h2>
        </div>
        
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-6 pt-5">
          {/* Estimated Value */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all duration-200 hover:scale-[1.02] cursor-pointer">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <IndianRupee className="h-3 w-3 text-emerald-600" /> Estimated Value
            </span>
            <span className="text-sm font-black text-emerald-800 block">{formatCurrency(estimatedValueVal)}</span>
          </div>

          {/* RFP Number */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all duration-200 hover:scale-[1.02] cursor-pointer">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Layers className="h-3 w-3 text-blue-600" /> RFP Number
            </span>
            <span className="text-sm font-mono font-black text-slate-800 block">{rfpNumberString}</span>
          </div>

          {/* Category */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all duration-200 hover:scale-[1.02] cursor-pointer min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Package className="h-3 w-3 text-amber-600" /> Category
            </span>
            <span className="text-sm font-black text-slate-800 block truncate" title={category}>{category}</span>
          </div>

          {/* Sub Category */}
          {subCategory && (
            <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all duration-200 hover:scale-[1.02] cursor-pointer min-w-0">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                <Package className="h-3 w-3 text-purple-600" /> Sub Category
              </span>
              <span className="text-sm font-black text-slate-800 block truncate" title={subCategory}>{subCategory}</span>
            </div>
          )}

          {/* Published Date */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all duration-200 hover:scale-[1.02] cursor-pointer">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Calendar className="h-3 w-3 text-blue-500" /> Published Date
            </span>
            <span className="text-sm font-black text-slate-800 block">{publishedDateFormatted}</span>
          </div>

          {/* Closing Date */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all duration-200 hover:scale-[1.02] cursor-pointer">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Clock className="h-3 w-3 text-red-650" /> Closing Date
            </span>
            <span className="text-sm font-black text-red-650 text-red-600 block">{closesAtFormatted}</span>
          </div>

          {/* Project Duration */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all duration-200 hover:scale-[1.02] cursor-pointer">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Clock className="h-3 w-3 text-indigo-600" /> Project Duration
            </span>
            <span className="text-sm font-black text-slate-800 block">12 Months</span>
          </div>

          {/* Delivery Location */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all duration-200 hover:scale-[1.02] cursor-pointer min-w-0">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <MapPin className="h-3 w-3 text-red-500" /> Delivery Location
            </span>
            <span className="text-sm font-black text-slate-800 block truncate" title={rfpData?.location || (isInventory || isStructural || isWaste || isRobot || isHvac ? 'Mumbai, Maharashtra' : 'Bengaluru, Karnataka')}>
              {rfpData?.location || (isInventory || isStructural || isWaste || isRobot || isHvac ? 'Mumbai, Maharashtra' : 'Bengaluru, Karnataka')}
            </span>
          </div>

          {/* Payment Terms */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all duration-200 hover:scale-[1.02] cursor-pointer">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <Info className="h-3 w-3 text-sky-600" /> Payment Terms
            </span>
            <span className="text-sm font-black text-slate-800 block truncate" title={rfpData?.paymentTerms || rfpData?.payload?.terms?.paymentTerms || "Milestone Based"}>
              {rfpData?.paymentTerms || rfpData?.payload?.terms?.paymentTerms || "Milestone Based"}
            </span>
          </div>

          {/* Evaluation Method */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all duration-200 hover:scale-[1.02] cursor-pointer">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <ClipboardCheck className="h-3 w-3 text-teal-600" /> Evaluation Method
            </span>
            <span className="text-sm font-black text-slate-800 block">{rfpData?.evaluationMethod || rfpData?.payload?.evaluation?.evaluationMethod || 'QCBS'}</span>
          </div>

          {/* EMD Required */}
          <div className="space-y-1.5 p-3 rounded-2xl bg-slate-50/50 hover:bg-slate-50 transition-all duration-200 hover:scale-[1.02] cursor-pointer">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1">
              <IndianRupee className="h-3 w-3 text-rose-500" /> EMD Required
            </span>
            <span className="text-sm font-black text-slate-850 text-slate-800 block">
              {rfpData?.emdAmount ? formatCurrency(Number(rfpData.emdAmount)) : rfpData?.payload?.terms?.emdAmount ? formatCurrency(Number(rfpData.payload.terms.emdAmount)) : formatCurrency(isInventory || isStructural || isWaste || isRobot || isHvac ? 100000 : 250000)}
            </span>
          </div>
        </div>
      </section>

      {/* ── Main Details Grid (2 columns layout) ── */}
      <div className="grid gap-6 lg:grid-cols-3">
        
        {/* Left Column (spans 2) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Scope Card */}
          <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-3.5">
            <h2 className="text-base font-black text-slate-900 pb-3.5 border-b border-slate-100 uppercase tracking-wider">
              RFP Scope
            </h2>
            <p className="text-xs font-semibold leading-relaxed text-slate-650 text-slate-600">
              {scopeText}
            </p>
          </section>

          {/* Key Dates Card */}
          <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-base font-black text-slate-900 pb-3.5 border-b border-slate-100 uppercase tracking-wider">
              Key Dates
            </h2>
            <div className="space-y-3">
              {[
                { label: 'Pre-Bid Meeting', value: preBidMeetingDate, active: true },
                { label: 'Proposal Submission End', value: submissionEndDate, active: true },
                { label: 'Technical Evaluation', value: technicalEvalDate, active: false },
                { label: 'Presentation', value: presentationDate, active: false },
                { label: 'Final Evaluation', value: finalEvalDate, active: false },
                { label: 'Awarding Date', value: awardDate, active: false },
              ].map((row, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs font-semibold">
                  <span className="flex items-center gap-2 text-slate-500">
                    <span className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full text-[9px]",
                      row.active ? "bg-blue-50 text-blue-600" : "bg-slate-100 text-slate-400"
                    )}>
                      {row.active ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : <Clock className="h-2.5 w-2.5" />}
                    </span>
                    {row.label}
                  </span>
                  <span className={cn("font-bold", row.label.includes('End') ? "text-red-650 text-red-600 font-extrabold" : "text-slate-800")}>{row.value}</span>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* ═══ COLUMN 3: Buyer Information ═══ */}
        <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-base font-black text-slate-900 pb-3.5 border-b border-slate-100 uppercase tracking-wider">
            Buyer Information
          </h2>
          
          <div className="space-y-4 mt-2">
            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Organization</span>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-xs font-black text-slate-900">{orgName}</span>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-600 border border-emerald-100">
                  <ShieldCheck className="h-3 w-3 stroke-[2.5]" /> Verified Buyer
                </span>
              </div>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contact Person</span>
              <span className="text-xs font-bold text-slate-800 block mt-0.5">{contactPerson}</span>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email</span>
              <span className="text-xs font-mono font-bold text-blue-600 block mt-0.5 hover:underline cursor-pointer">{email}</span>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Phone</span>
              <span className="text-xs font-bold text-slate-800 block mt-0.5">{phone}</span>
            </div>

            <div>
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Address</span>
              <span className="text-xs font-semibold leading-relaxed text-slate-600 block mt-0.5">{address}</span>
            </div>
          </div>
        </section>
      </div>

      {/* ── Bottom Section: RFP Documents & Activity Snapshot ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_0.9fr]">
        
        {/* RFP Documents Card */}
        <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-900 pb-3.5 border-b border-slate-100 uppercase tracking-wider">
            RFP Documents
          </h2>
          
          <div className="grid grid-cols-1 gap-3.5 pt-4 sm:grid-cols-3">
            {documents.length > 0 ? (
              documents.map((doc, idx) => (
                <div 
                  key={idx} 
                  onClick={() => {
                    if (doc.fileAssetId || doc.url) {
                      openFileAsset({
                        id: doc.fileAssetId || doc.id,
                        fileAssetId: doc.fileAssetId,
                        originalName: doc.name,
                        url: doc.url,
                      }, doc.name).catch(err => {
                        toast.error(err instanceof Error ? err.message : 'Unable to open document');
                      });
                    }
                  }}
                  className="rounded-2xl border border-slate-100 bg-slate-50/20 p-4 flex items-center gap-3.5 hover:shadow-2xs transition-all duration-200 cursor-pointer hover:border-purple-200"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-xs font-black text-slate-800 block leading-tight truncate">{doc.name}</span>
                    <span className="text-[9px] font-bold text-slate-400 block mt-0.5 whitespace-nowrap">{doc.meta || 'Document'}</span>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs font-bold text-slate-500 col-span-3 py-4 text-center border border-dashed border-slate-200 rounded-2xl">
                No documents uploaded for this RFP.
              </p>
            )}
          </div>
        </section>

        {/* Activity Snapshot Section */}
        <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-900 pb-3.5 border-b border-slate-100 uppercase tracking-wider">
            Activity Snapshot
          </h2>
          
          <div className="grid grid-cols-3 gap-4 mt-4">
            <div className="border-r border-slate-100 pr-4">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Queries</span>
              <span className="text-xl font-black text-slate-900 mt-1 block tabular-nums">{totalQueries}</span>
            </div>

            <div className="border-r border-slate-100 pr-4 pl-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Responses</span>
              <span className="text-xl font-black text-slate-900 mt-1 block tabular-nums">{totalResponses}</span>
            </div>

            <div className="pl-2">
              <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Total Views</span>
              <span className="text-xl font-black text-slate-900 mt-1 block tabular-nums">{totalViews}</span>
            </div>
          </div>
        </section>
      </div>

      {/* ── Additional Details Accordion ── */}
      {detailSections.length > 0 && (
        <section className="mt-8 border border-slate-100 rounded-3xl bg-white shadow-sm overflow-hidden">
          <div className="p-6 pb-4 border-b border-slate-100/60 bg-slate-50/30">
            <h2 className="text-base font-black text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Layers className="h-5 w-5 text-purple-600" />
              Additional Details
            </h2>
            <p className="text-xs font-semibold text-slate-500 mt-1">
              Comprehensive specifications, terms, and requirements for this RFP.
            </p>
          </div>
          
          <div className="p-4 grid gap-3">
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
                    "rounded-2xl border transition-all duration-300 overflow-hidden",
                    isOpen 
                      ? "border-[#12335f]/25 bg-slate-50/30 shadow-sm border-l-4 border-l-[#12335f]" 
                      : "border-slate-100 hover:border-slate-200 bg-white border-l-4 border-l-transparent"
                  )}
                >
                  {/* Accordion Header */}
                  <button
                    type="button"
                    onClick={() => setActiveSection(isOpen ? null : idx)}
                    className="group w-full flex items-center justify-between p-4 text-left font-black text-xs uppercase tracking-wider text-[#12335f] hover:bg-slate-50/50 transition-colors"
                  >
                    <span className="flex items-center gap-2.5">
                      <span className={cn(
                        "flex h-7 w-7 items-center justify-center rounded-lg text-xs transition-colors font-black",
                        isOpen ? "bg-[#12335f] text-white" : "bg-[#12335f]/10 text-[#12335f]"
                      )}>
                        <SectionIcon className="h-3.5 w-3.5" />
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
                    "grid transition-all duration-300 ease-in-out border-t border-slate-100/60 bg-white",
                    isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                  )}>
                    <div className="overflow-hidden">
                      <div className="px-6 pb-6 pt-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                          {section.fields.map((field, fieldIdx) => (
                            <div key={`${field.label}-${fieldIdx}`} className="rounded-xl border border-slate-100 bg-slate-50/30 p-4 hover:bg-slate-50/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-sm">
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
