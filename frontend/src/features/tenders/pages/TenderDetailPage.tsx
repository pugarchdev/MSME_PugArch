'use client';

import React, { useEffect, useState } from 'react';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import {
  Download,
  Calendar,
  Building2,
  ChevronRight,
  Loader2,
  FileText,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  Info,
  Eye,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApi } from '../../shared/apiClient';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { openFileAsset } from '../../../lib/files';
import { api } from '../../../lib/api';

// --- Types ---
interface TenderDetail {
  id: number;
  tenderId: string;
  title: string;
  category: string;
  subCategory?: string;
  budget: number;
  description: string;
  status: string;
  statusEnum?: string;
  visibility?: string;
  publishedAt?: string | Date;
  closesAt?: string | Date;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  paymentTerms?: string;
  deliveryType?: string;
  itemCondition?: string;
  bidValidityDays?: number;
  emdAmount?: number;
  evaluationMethod?: string;
  buyerId?: number;
  buyer?: {
    id: number;
    name: string;
    email: string;
    buyerProfile?: {
      id: number;
      organizationName?: string;
      department?: string;
      contactPerson?: string;
      email?: string;
      phone?: string;
      address?: string;
      state?: string;
      district?: string;
      pincode?: string;
    };
  };
  tenderItems?: Array<{
    id: number;
    itemName: string;
    quantity: number;
    unitOfMeasure: string;
    description?: string;
    estimatedUnitPrice?: number;
    estimatedTotal?: number;
    technicalSpecification?: string;
    brand?: string;
    make?: string;
    model?: string;
    hsn?: string;
    sac?: string;
    warranty?: string;
    deliverySchedule?: string;
  }>;
  tenderDocuments?: Array<{
    id: number;
    documentType: string;
    title?: string;
    fileAsset?: {
      id: number;
      originalName: string;
    };
    url?: string;
  }>;
  activitySnapshot?: {
    totalQueries?: number;
    totalResponses?: number;
    totalViews?: number;
    interestedSuppliers?: number;
  };
  isEmdRequired?: boolean;
  documentFee?: number;
  allowClarification?: boolean;
  allowReverseAuction?: boolean;
  allowBoq?: boolean;
  packetType?: string;
  technicalPacket?: any;
  financialPacket?: any;
  termsAndConditions?: string[];
  eligibilityCriteria?: string[];
  requiredDocuments?: string[];
  technicalOpeningDate?: string | Date;
  financialOpeningDate?: string | Date;
  bidValidityDate?: string | Date;
}

export default function TenderDetailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname() || '';
  const { user } = useAuth();
  const tenderRef = searchParams?.get('tender') || '';

  const [loading, setLoading] = useState(true);
  const [tender, setTender] = useState<TenderDetail | null>(null);

  useEffect(() => {
    if (!tenderRef) {
      setLoading(false);
      return;
    }

    const fetchTenderDetails = async () => {
      try {
        setLoading(true);
        const data = await getApi<TenderDetail>(`/api/tenders/${tenderRef}`, true);
        setTender(data);
      } catch (err: any) {
        console.error(err);
        toast.error('Failed to load tender details');
      } finally {
        setLoading(false);
      }
    };

    fetchTenderDetails();
  }, [tenderRef]);

  const formatCurrency = (val?: number) => {
    if (!val && val !== 0) return '—';
    return `₹${val.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
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

  if (loading) {
    return (
      <div className="flex h-[80vh] flex-col items-center justify-center gap-3">
        <Loader2 className="h-10 w-10 animate-spin text-[#12335f]" />
        <p className="text-sm font-bold text-slate-500">Loading tender details...</p>
      </div>
    );
  }

  if (!tender) {
    return (
      <div className="mx-auto max-w-4xl py-12 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-50 text-red-600">
          <FileText className="h-8 w-8" />
        </div>
        <h2 className="mt-4 text-xl font-black text-slate-900">Tender Not Found</h2>
        <p className="mt-2 text-sm font-semibold text-slate-500">
          We couldn't retrieve details for tender reference "{tenderRef}". Please verify the URL or link.
        </p>
        <div className="mt-6">
          <Button onClick={() => router.back()} className="bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]">
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  const title = tender.title || 'N/A';
  const tenderIdString = tender.tenderId || 'N/A';
  const publishedDateFormatted = formatDateString(tender.publishedAt);
  const closesAtFormatted = formatDateString(tender.closesAt, true);
  const orgName = tender.buyer?.buyerProfile?.organizationName || tender.buyer?.name || 'N/A';

  const handleParticipate = () => {
    router.push(`/bids/${tender.id}/participate`);
  };

  const handlePreviewDoc = (doc: any) => {
    const fileId = doc.fileAsset?.id || doc.id;
    if (!fileId) {
      toast.error('File ID not found');
      return;
    }
    openFileAsset({
      id: fileId,
      fileAssetId: fileId,
      originalName: doc.title || doc.fileAsset?.originalName || 'document',
      url: doc.url
    }, doc.title || doc.fileAsset?.originalName || 'Document').catch((err: any) => {
      toast.error(err instanceof Error ? err.message : 'Unable to open document');
    });
  };

  const handleDownloadDoc = async (doc: any) => {
    const fileId = doc.fileAsset?.id || doc.id;
    if (!fileId) {
      toast.error('File ID not found');
      return;
    }
    const toastId = toast.loading('Downloading document...');
    try {
      const res = await api.fetch(`/api/files/${fileId}/view`, { method: 'GET', skipCache: true });
      if (!res.ok) throw new Error('Failed to download file');
      const blob = await res.blob();
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = doc.title || doc.fileAsset?.originalName || 'document';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);
      toast.success('Download complete', { id: toastId });
    } catch (err) {
      toast.error('Failed to download document', { id: toastId });
    }
  };

  const handleDownload = () => {
    if (!tender.tenderDocuments || tender.tenderDocuments.length === 0) {
      toast.error('No documents available to download');
      return;
    }
    tender.tenderDocuments.forEach((doc) => {
      handleDownloadDoc(doc);
    });
  };

  const InfoRow = ({ label, value, red }: { label: string; value: any; red?: boolean }) => {
    if (value === undefined || value === null || value === '' || value === 'N/A' || value === 'Not Applicable' || value === 'Not Required' || value === 'Not Allowed') return null;
    return (
      <div className="grid grid-cols-3 items-start gap-4 py-3 border-b border-slate-100 last:border-0 hover:bg-slate-50/50 px-2 rounded-lg transition-colors">
        <span className="text-xs font-bold text-slate-500 uppercase tracking-wider col-span-1">{label}</span>
        <span className={cn("text-sm font-semibold col-span-2", red ? "text-red-600" : "text-slate-800")}>{value}</span>
      </div>
    );
  };

  const SectionHeading = ({ title }: { title: string }) => (
    <h2 className="text-sm font-black text-[#12335f] pb-3 border-b-2 border-[#12335f]/10 uppercase tracking-widest mb-4 flex items-center gap-2">
      <div className="w-1.5 h-4 bg-[#12335f] rounded-full" />
      {title}
    </h2>
  );

  const wizardData = tender.technicalPacket?.wizardData || {};

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-4 py-8 md:px-8 bg-slate-50 min-h-screen">
      {/* ── Breadcrumb Navigation ── */}
      <nav className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-6">
        <span className="hover:text-slate-800 cursor-pointer transition-colors" onClick={() => router.push(user?.role === 'seller' ? '/seller/opportunities' : '/buyer/tenders')}>Tenders</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-[#12335f]">{tenderIdString}</span>
      </nav>

      {/* Guest login banner */}
      {!user && (
        <div className="mb-6 flex items-center justify-between rounded-xl border border-blue-200 bg-blue-50 px-6 py-4 shadow-sm">
          <div className="flex items-center gap-3">
            <Info className="h-5 w-5 text-blue-600 shrink-0" />
            <div>
              <p className="text-sm font-bold text-blue-800">Want to participate in this procurement?</p>
              <p className="text-xs text-blue-600 mt-0.5">Please login or register as a seller to submit your quotation/proposal.</p>
            </div>
          </div>
          <a
            href={`/login?redirect=${encodeURIComponent(pathname + (tenderRef ? `?tender=${tenderRef}` : ''))}`}
            className="whitespace-nowrap rounded-lg bg-blue-600 px-6 py-2.5 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition-colors"
          >
            Login to Participate
          </a>
        </div>
      )}

      {/* 1. HEADER */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="inline-flex items-center rounded-md bg-slate-100 px-2.5 py-1 text-xs font-bold text-slate-700 border border-slate-200">
                {tenderIdString}
              </span>
              <span className={cn(
                "inline-flex items-center rounded-md px-2.5 py-1 text-xs font-black uppercase tracking-wide border",
                tender.status === 'PUBLISHED' || tender.status === 'OPEN' 
                  ? "bg-emerald-50 text-emerald-700 border-emerald-200" 
                  : "bg-amber-50 text-amber-700 border-amber-200"
              )}>
                {tender.statusEnum || tender.status || 'PUBLISHED'}
              </span>
              <span className="inline-flex items-center rounded-md bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700 border border-blue-200">
                v1.0
              </span>
            </div>
            <h1 className="text-2xl font-black text-slate-900 leading-tight">
              {title}
            </h1>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm font-semibold text-slate-600">
              <span className="flex items-center gap-1.5"><Building2 className="w-4 h-4 text-slate-400" /> {orgName}</span>
              <span className="flex items-center gap-1.5"><Calendar className="w-4 h-4 text-slate-400" /> Pub: {publishedDateFormatted}</span>
              <span className="flex items-center gap-1.5 text-red-600"><Calendar className="w-4 h-4 text-red-400" /> Closes: {closesAtFormatted}</span>
            </div>
          </div>
          
          <div className="flex flex-col sm:flex-row gap-3 shrink-0">
            <Button variant="outline" onClick={handleDownload} className="rounded-xl border-slate-300 font-bold text-slate-700 hover:bg-slate-50 hover:text-slate-900">
              <Download className="w-4 h-4 mr-2" /> Download Documents
            </Button>
            {user && user.role === 'seller' && (
              <Button onClick={handleParticipate} className="rounded-xl bg-[#12335f] hover:bg-[#0b2445] text-white font-bold px-8 shadow-md">
                Participate Now <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            )}
          </div>
        </div>
      </section>

      {/* TWO COLUMN LAYOUT FOR DETAILS */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* 2. BASIC INFORMATION */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <SectionHeading title="Basic Information" />
          <div className="space-y-1">
            <InfoRow label="Tender Number" value={tenderIdString} />
            <InfoRow label="Reference Number" value={tender.tenderId || 'N/A'} />
            <InfoRow label="Category" value={tender.category || 'N/A'} />
            <InfoRow label="Sub Category" value={tender.subCategory || 'N/A'} />
            <InfoRow label="Bid Type" value={wizardData.bidType || 'N/A'} />
            <InfoRow label="Procurement Method" value={wizardData.procurementMethod || 'N/A'} />
            <InfoRow label="Packet Type" value={wizardData.packetType || tender.packetType || 'N/A'} />
            <InfoRow label="Tender Visibility" value={tender.visibility || 'Public'} />
            <InfoRow label="Estimated Value" value={tender.budget ? formatCurrency(tender.budget) : 'Not Disclosed'} />
            <InfoRow label="Evaluation Method" value={tender.evaluationMethod || 'N/A'} />
            <InfoRow label="Bid Validity" value={tender.bidValidityDate ? formatDateString(tender.bidValidityDate) : (tender.bidValidityDays ? `${tender.bidValidityDays} Days` : 'N/A')} />
            <InfoRow label="Reverse Auction" value={tender.allowReverseAuction ? 'Enabled' : 'Disabled'} />
            <InfoRow label="Priority" value={wizardData.priority} />
            <InfoRow label="Budget Head" value={wizardData.budgetHead} />
            <InfoRow label="Financial Year" value={wizardData.financialYear} />
            <InfoRow label="Pre-Bid Meeting" value={wizardData.preBidMeetingRequired && wizardData.preBidMeetingDate ? `${formatDateString(wizardData.preBidMeetingDate, true)} [${wizardData.preBidMode || 'Offline'}] at ${wizardData.preBidVenue || 'Designated Venue'}` : undefined} />
          </div>
        </section>

        {/* 3. BUYER INFORMATION */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <SectionHeading title="Buyer Information" />
          <div className="space-y-1">
            <InfoRow label="Organization" value={
              <div className="flex items-center gap-2">
                <span>{orgName}</span>
                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-600 border border-emerald-100 uppercase">
                  <ShieldCheck className="h-3 w-3 stroke-[2.5]" /> Verified
                </span>
              </div>
            } />
            <InfoRow label="Department" value={tender.buyer?.buyerProfile?.department || 'N/A'} />
            <InfoRow label="Contact Person" value={wizardData.buyerName || tender.buyer?.buyerProfile?.contactPerson || 'N/A'} />
            <InfoRow label="Designation" value={wizardData.buyerDesignation} />
            <InfoRow label="Email" value={
              <span className="text-blue-600 hover:underline cursor-pointer">{wizardData.buyerEmail || tender.buyer?.buyerProfile?.email || tender.buyer?.email || 'N/A'}</span>
            } />
            <InfoRow label="Phone" value={wizardData.buyerMobile || tender.buyer?.buyerProfile?.phone || 'N/A'} />
            <InfoRow label="State" value={tender.buyer?.buyerProfile?.state || 'N/A'} />
            <InfoRow label="District" value={tender.buyer?.buyerProfile?.district || 'N/A'} />
            <InfoRow label="Taluka" value={wizardData.taluka} />
            <InfoRow label="Village / City" value={wizardData.villageOrCity} />
            <InfoRow label="Office Address" value={wizardData.buyerAddress || tender.buyer?.buyerProfile?.address || 'N/A'} />
            <InfoRow label="Dept File No" value={wizardData.departmentFileNumber} />
            <InfoRow label="Dept Ref No" value={wizardData.departmentReferenceNumber} />
            <InfoRow label="Competent Authority" value={wizardData.competentAuthorityName ? `${wizardData.competentAuthorityName} (${wizardData.competentAuthorityDesignation || ''})` : undefined} />
          </div>
        </section>
      </div>

      {/* 4. TENDER TIMELINE */}
      <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 overflow-x-auto">
        <SectionHeading title="Tender Timeline" />
        <div className="min-w-[800px] grid grid-cols-7 gap-4 pt-2">
          {[
            { label: 'Publishing Date', value: formatDateString(tender.publishedAt) },
            { label: 'Bid Submission Start', value: formatDateString(tender.publishedAt) },
            { label: 'Clarification Start', value: formatDateString(tender.publishedAt) },
            { label: 'Clarification End', value: formatDateString(tender.publishedAt) },
            { label: 'Bid Submission End', value: closesAtFormatted, red: true },
            { label: 'Technical Opening', value: tender.technicalOpeningDate ? formatDateString(tender.technicalOpeningDate, true) : 'To be notified' },
            { label: 'Financial Opening', value: tender.financialOpeningDate ? formatDateString(tender.financialOpeningDate, true) : 'To be notified' },
          ].map((timeline, idx) => (
            <div key={idx} className="flex flex-col gap-1 border-l-2 border-slate-200 pl-3 relative">
              <div className="absolute -left-[9px] top-0 w-4 h-4 rounded-full bg-white border-4 border-slate-300" />
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mt-1">{timeline.label}</span>
              <span className={cn("text-xs font-black", timeline.red ? "text-red-600" : "text-slate-800")}>{timeline.value}</span>
            </div>
          ))}
        </div>
      </section>

      {/* 5. ITEM / BOQ DETAILS */}
      {(tender.tenderItems && tender.tenderItems.length > 0) && (
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 overflow-x-auto">
          <SectionHeading title="Item / BOQ Details" />
          <table className="w-full text-left border-collapse min-w-[1200px] text-sm">
            <thead>
              <tr className="bg-slate-100 border-y border-slate-200">
                <th className="p-3 font-bold text-slate-600 uppercase text-xs">S.No</th>
                <th className="p-3 font-bold text-slate-600 uppercase text-xs w-[250px]">Item Name / Description</th>
                <th className="p-3 font-bold text-slate-600 uppercase text-xs">Technical Specs</th>
                <th className="p-3 font-bold text-slate-600 uppercase text-xs">Brand/Make/Model</th>
                <th className="p-3 font-bold text-slate-600 uppercase text-xs">HSN/SAC</th>
                <th className="p-3 font-bold text-slate-600 uppercase text-xs">Qty & Unit</th>
                <th className="p-3 font-bold text-slate-600 uppercase text-xs text-right">Unit Price</th>
                <th className="p-3 font-bold text-slate-600 uppercase text-xs text-right">Total Price</th>
                <th className="p-3 font-bold text-slate-600 uppercase text-xs text-center">Delivery / Warranty</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tender.tenderItems.map((item, idx) => (
                <tr key={item.id} className="hover:bg-slate-50/50">
                  <td className="p-3 font-semibold text-slate-600 align-top">{idx + 1}</td>
                  <td className="p-3 align-top">
                    <p className="font-black text-slate-900">{item.itemName}</p>
                    {item.description && <p className="text-xs text-slate-500 mt-1 line-clamp-3">{item.description}</p>}
                  </td>
                  <td className="p-3 align-top text-xs text-slate-700 whitespace-pre-wrap max-w-[200px]">
                    {item.technicalSpecification}
                  </td>
                  <td className="p-3 align-top text-xs text-slate-700">
                    {item.brand && <div><span className="font-semibold">Brand:</span> {item.brand}</div>}
                    {item.make && <div><span className="font-semibold">Make:</span> {item.make}</div>}
                    {item.model && <div><span className="font-semibold">Model:</span> {item.model}</div>}
                  </td>
                  <td className="p-3 align-top text-xs text-slate-700">
                    {item.hsn && <div><span className="font-semibold">HSN:</span> {item.hsn}</div>}
                    {item.sac && <div><span className="font-semibold">SAC:</span> {item.sac}</div>}
                  </td>
                  <td className="p-3 align-top">
                    <div className="font-black text-slate-900">{item.quantity}</div>
                    <div className="text-xs font-semibold text-slate-500">{item.unitOfMeasure}</div>
                  </td>
                  <td className="p-3 align-top text-right font-bold text-slate-800">{item.estimatedUnitPrice ? formatCurrency(item.estimatedUnitPrice) : ''}</td>
                  <td className="p-3 align-top text-right font-black text-slate-900">{item.estimatedTotal ? formatCurrency(item.estimatedTotal) : ''}</td>
                  <td className="p-3 align-top text-xs text-center text-slate-700">
                    {item.deliverySchedule && <div><span className="font-semibold block">Delivery:</span> {item.deliverySchedule}</div>}
                    {item.warranty && <div className="mt-1"><span className="font-semibold block">Warranty:</span> {item.warranty}</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* TWO COLUMN LAYOUT CONTINUED */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 6. DELIVERY & CONSIGNEE */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <SectionHeading title="Delivery & Consignee" />
          <div className="space-y-1">
            <InfoRow label="Delivery District" value={tender.itemCondition || tender.buyer?.buyerProfile?.district} />
            <InfoRow label="State" value={tender.buyer?.buyerProfile?.state} />
            <InfoRow label="Pincode" value={wizardData.pincode || tender.buyer?.buyerProfile?.pincode} />
            <InfoRow label="Delivery Period" value={wizardData.deliveryPeriod} />
            <InfoRow label="Consignee Name" value={wizardData.consigneeName} />
            <InfoRow label="Designation" value={wizardData.consigneeDesignation} />
            <InfoRow label="Contact" value={wizardData.consigneeEmail || wizardData.consigneeMobile ? `${wizardData.consigneeEmail || ''} ${wizardData.consigneeEmail && wizardData.consigneeMobile ? '/' : ''} ${wizardData.consigneeMobile || ''}` : ''} />
            <InfoRow label="Installation Address" value={wizardData.installationAddress} />
            <InfoRow label="Inspection Officer" value={wizardData.inspectionOfficer} />
            <InfoRow label="Acceptance Criteria" value={wizardData.acceptanceCriteria} />
            <InfoRow label="Delay Penalty" value={wizardData.delayPenaltyApplicable ? (wizardData.penaltyDetails || 'Applicable') : 'Not Applicable'} />
          </div>
          {wizardData.multipleConsignees && wizardData.multipleConsignees.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Multiple Delivery Locations</h3>
              <table className="w-full text-left text-xs border border-slate-200">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="p-2 border-b border-slate-200 font-bold text-slate-600">Name</th>
                    <th className="p-2 border-b border-slate-200 font-bold text-slate-600">Qty</th>
                    <th className="p-2 border-b border-slate-200 font-bold text-slate-600">Address</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {wizardData.multipleConsignees.map((c: any, i: number) => (
                    <tr key={i}>
                      <td className="p-2 font-semibold">{c.name || c.consigneeName}</td>
                      <td className="p-2">{c.quantity}</td>
                      <td className="p-2">{c.deliveryAddress || c.address}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* 7. ELIGIBILITY CRITERIA */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <SectionHeading title="Eligibility Criteria" />
          <div className="space-y-1">
            <InfoRow label="Experience Req." value={wizardData.experienceRequired} />
            <InfoRow label="Turnover Req." value={wizardData.turnoverRequired} />
            {wizardData.similarWorkRequired && <InfoRow label="Similar Work Req." value="Required" />}
            <InfoRow label="Startup Preference" value={wizardData.startupPreference ? 'Yes' : undefined} />
            <InfoRow label="MSE Preference" value={wizardData.msePreference ? 'Yes' : undefined} />
            <InfoRow label="Make In India" value={wizardData.makeInIndiaPreference ? 'Yes' : undefined} />
            <InfoRow label="Blacklisting Decl." value={wizardData.blacklistingDeclarationRequired ? 'Required' : undefined} />
            <InfoRow label="Conflict of Interest" value={wizardData.conflictOfInterestDeclarationRequired ? 'Required' : undefined} />
          </div>
          {tender.eligibilityCriteria && tender.eligibilityCriteria.length > 0 && (
            <div className="mt-4 pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Other Qualifications</h3>
              <ul className="space-y-2">
                {tender.eligibilityCriteria.map((crit, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                    <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                    <span>{crit}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 8. TECHNICAL REQUIREMENTS */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <SectionHeading title="Technical Requirements" />
          <div className="space-y-1">
            <InfoRow label="Evaluation Method" value={tender.evaluationMethod} />
            {wizardData.inspectionOfficer && <InfoRow label="Inspection Req." value="Required" />}
            <InfoRow label="Acceptance Rules" value={wizardData.acceptanceCriteria} />
            {tender.tenderItems?.some(i => i.technicalSpecification) && <InfoRow label="Tech Specs" value="Refer to BOQ Details or Uploaded Documents" />}
          </div>
        </section>

        {/* 9. FINANCIAL REQUIREMENTS */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <SectionHeading title="Financial Requirements" />
          <div className="space-y-1">
            <InfoRow label="Estimated Value" value={tender.budget ? formatCurrency(tender.budget) : undefined} />
            <InfoRow label="EMD Amount" value={tender.isEmdRequired === false ? 'Exempted' : (tender.emdAmount ? formatCurrency(tender.emdAmount) : undefined)} />
            <InfoRow label="PBG Percentage" value={wizardData.pbgRequired && wizardData.pbgPercentage ? `${wizardData.pbgPercentage}%` : undefined} />
            <InfoRow label="Document Fee" value={tender.documentFee ? formatCurrency(tender.documentFee) : undefined} />
            <InfoRow label="Payment Terms" value={wizardData.paymentTerms || tender.paymentTerms} />
            {wizardData.advancePaymentAllowed && <InfoRow label="Advance Payment" value="Allowed" />}
            {wizardData.partPaymentAllowed && <InfoRow label="Part Payment" value="Allowed" />}
            <InfoRow label="GST Invoice Req." value={wizardData.gstInvoiceRequired !== false ? 'Yes' : 'No'} />
            {wizardData.invoiceRequired && <InfoRow label="Invoice Required" value="Yes" />}
            {wizardData.ewayBillRequired && <InfoRow label="E-Way Bill Required" value="Yes" />}
          </div>
        </section>

        {/* 10. REQUIRED DOCUMENTS */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <SectionHeading title="Required Seller Documents" />
          {(!tender.requiredDocuments || tender.requiredDocuments.length === 0) ? (
            <p className="text-sm text-slate-500 italic">No specific documents requested.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {tender.requiredDocuments.map((doc, idx) => (
                <div key={idx} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 bg-slate-50">
                  <FileText className="h-5 w-5 text-blue-500 shrink-0" />
                  <span className="text-sm font-semibold text-slate-800">{doc}</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* 12. TERMS & CONDITIONS */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <SectionHeading title="Terms & Conditions" />
          <div className="space-y-1 mb-4">
            <InfoRow label="Cancellation Rules" value={wizardData.cancellationAllowedBeforeClosing ? 'Allowed Before Closing' : 'Strict / No Cancellation'} />
            {wizardData.corrigendumAllowed && <InfoRow label="Corrigendum" value="Allowed" />}
            {(tender.allowClarification || wizardData.sellerQueryAllowed || wizardData.clarificationWindowRequired) && <InfoRow label="Seller Queries" value="Allowed" />}
            {wizardData.rateContractRequired && <InfoRow label="Rate Contract" value="Required" />}
            {wizardData.multipleAwardAllowed && <InfoRow label="Multiple Award" value="Allowed" />}
            {wizardData.splittingQuantityAllowed && <InfoRow label="Splitting Quantity" value="Allowed" />}
            <InfoRow label="Delivery Terms" value={tender.deliveryType} />
          </div>
          {tender.termsAndConditions && tender.termsAndConditions.length > 0 && (
            <div className="pt-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3">Additional T&C</h3>
              <ul className="space-y-2">
                {tender.termsAndConditions.map((tc, idx) => (
                  <li key={idx} className="flex items-start gap-2 text-sm text-slate-700">
                    <div className="h-1.5 w-1.5 rounded-full bg-slate-400 shrink-0 mt-2" />
                    <span>{tc}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {/* 13. REVERSE AUCTION */}
        {tender.allowReverseAuction && (
          <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
            <SectionHeading title="Reverse Auction Rules" />
            <div className="space-y-1">
              <InfoRow label="Status" value={<span className="text-emerald-600 font-bold">Enabled</span>} />
              <InfoRow label="Trigger Stage" value={wizardData.raTriggerStage} />
              <InfoRow label="Duration" value={wizardData.raDuration} />
              <InfoRow label="Min Decrement" value={wizardData.minimumDecrementValue ? formatCurrency(wizardData.minimumDecrementValue) : undefined} />
              <InfoRow label="Starting Price" value={wizardData.raStartPrice ? formatCurrency(wizardData.raStartPrice) : undefined} />
              <InfoRow label="Eligible Sellers" value={wizardData.eligibleSellersForRa} />
              <InfoRow label="Winner Rule" value={wizardData.raWinnerRule} />
            </div>
          </section>
        )}

        {/* 14. ACTIVITY */}
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <SectionHeading title="Activity & Status" />
          <div className="space-y-1">
            <InfoRow label="Tender Status" value={<span className="uppercase text-emerald-600 font-black">{tender.statusEnum || tender.status || 'PUBLISHED'}</span>} />
            <InfoRow label="Current Stage" value="Open for Bidding" />
            <InfoRow label="Participants" value={tender.activitySnapshot?.interestedSuppliers} />
            <InfoRow label="Clarifications" value={tender.activitySnapshot?.totalQueries} />
            <InfoRow label="Corrigendum" value="" />
            <InfoRow label="Amendments" value="" />
          </div>
        </section>

      </div>

      {/* 11. BUYER UPLOADED DOCUMENTS (Full Width at Bottom) */}
      {(tender.tenderDocuments && tender.tenderDocuments.length > 0) && (
        <section className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
          <SectionHeading title="Buyer Uploaded Documents" />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {tender.tenderDocuments.map((doc, idx) => (
              <div key={idx} className="flex flex-col gap-3 rounded-xl border border-slate-200 p-4 bg-slate-50 hover:border-slate-300 hover:shadow-md transition-all">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 flex items-center justify-center rounded-lg bg-blue-100 text-blue-600 shrink-0">
                    <FileText className="h-5 w-5" />
                  </div>
                  <div className="flex-1 overflow-hidden">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider truncate">{doc.documentType}</p>
                    <p className="text-sm font-bold text-slate-900 line-clamp-2" title={doc.title || doc.fileAsset?.originalName || 'Document'}>
                      {doc.title || doc.fileAsset?.originalName || 'Document'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-auto pt-2 border-t border-slate-200">
                  <button 
                    onClick={() => handlePreviewDoc(doc)} 
                    className="flex-1 flex justify-center items-center gap-1.5 py-1.5 rounded bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-blue-50 hover:text-blue-700 hover:border-blue-200 transition-colors cursor-pointer"
                  >
                    <Eye className="h-3 w-3" /> Preview
                  </button>
                  <button 
                    onClick={() => handleDownloadDoc(doc)} 
                    className="flex-1 flex justify-center items-center gap-1.5 py-1.5 rounded bg-white border border-slate-200 text-xs font-bold text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 transition-colors cursor-pointer"
                  >
                    <Download className="h-3 w-3" /> Download
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  );
}
