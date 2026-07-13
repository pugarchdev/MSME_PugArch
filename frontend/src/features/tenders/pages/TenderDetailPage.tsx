'use client';

import React, { useEffect, useState } from 'react';
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
  Info,
} from 'lucide-react';
import { toast } from 'sonner';
import { getApi } from '../../shared/apiClient';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';

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
    };
  };
  tenderItems?: Array<{
    id: number;
    itemName: string;
    quantity: number;
    unitOfMeasure: string;
    description?: string;
  }>;
  tenderDocuments?: Array<{
    id: number;
    documentType: string;
    title?: string;
    fileAsset?: {
      id: number;
      originalName: string;
    };
  }>;
  activitySnapshot?: {
    totalQueries?: number;
    totalResponses?: number;
    totalViews?: number;
    interestedSuppliers?: number;
  };
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
        const ampm = 'IST'; // Simply appending IST format from image
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
          <Button
            onClick={() => router.back()}
            className="bg-[#12335f] text-xs font-black uppercase text-white hover:bg-[#0b2445]"
          >
            Go Back
          </Button>
        </div>
      </div>
    );
  }

  // Derived properties with mock fallbacks
  const title = tender.title || 'Construction of Warehousing Facility';
  const tenderIdString = tender.tenderId || 'OT-2026-00124';
  const publishedDateFormatted = formatDateString(tender.publishedAt || '2026-07-10T10:00:00.000Z');
  const orgName = tender.buyer?.buyerProfile?.organizationName || tender.buyer?.name || 'Metro Rail Corp.';
  const closesAtFormatted = formatDateString(tender.closesAt || '2026-07-26T15:00:00.000Z', true);

  // Timeline Steps Configuration (matches mockup layout steps exactly)
  const timelineSteps = [
    { label: 'Published', date: formatDateString(tender.publishedAt || '2026-07-10T10:00:00.000Z'), completed: true },
    { label: 'Clarification', date: 'Up to 15 Jul 2026', completed: true },
    { label: 'Bid Submission', date: 'Up to 26 Jul 2026', completed: true },
    { label: 'Technical Evaluation', date: 'Pending', completed: false },
    { label: 'Financial Evaluation', date: 'Pending', completed: false },
    { label: 'Award', date: 'Pending', completed: false },
    { label: 'Contract', date: 'Pending', completed: false },
  ];

  const handleParticipate = () => {
    router.push(`/bids/${tender.id}/participate`);
  };

  const handleDownload = () => {
    toast.success('Downloading specifications document...');
  };

  /* Helper Row component for lists */
  const InfoRow = ({ label, value, red }: { label: string; value: string; red?: boolean }) => (
    <div className="flex justify-between items-start gap-4 py-1.5 border-b border-slate-50 last:border-0">
      <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
      <span className={cn("text-xs font-black text-right", red ? "text-red-650 text-red-600" : "text-slate-800")}>{value}</span>
    </div>
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 px-4 py-6 md:px-8">
      {/* ── Breadcrumb Navigation ── */}
      <nav className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <span className="hover:text-slate-800 cursor-pointer" onClick={() => router.push('/seller/opportunities')}>Opportunities</span>
        <ChevronRight className="h-3 w-3" />
        <span className="hover:text-slate-800 cursor-pointer" onClick={() => router.push('/seller/opportunities/open-tenders')}>Open Tenders</span>
        <ChevronRight className="h-3 w-3" />
        <span className="hover:text-slate-800 cursor-pointer">{tenderIdString}</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-[#12335f]">Details</span>
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
            href={`/login?redirect=${encodeURIComponent(pathname + (tenderRef ? `?tender=${tenderRef}` : ''))}`}
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
              {title}
            </h1>
            <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-extrabold tracking-wide text-emerald-700 border border-emerald-100">
              OPEN TENDER
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-500">
            <span className="font-mono font-bold text-slate-600">{tenderIdString}</span>
            <span className="mx-2">•</span>
            Published on {publishedDateFormatted} by {orgName}
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          {user && user.role === 'seller' && (
            <Button
              type="button"
              onClick={handleParticipate}
              className="h-10 rounded-xl bg-emerald-750 bg-emerald-600 px-6 text-xs font-black uppercase text-white hover:bg-emerald-700 shadow-sm transition-colors flex items-center gap-1.5"
            >
              Participate <ArrowRight className="h-4 w-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            onClick={handleDownload}
            className="h-10 rounded-xl border-slate-200 text-xs font-black uppercase text-slate-700 hover:bg-slate-50 flex items-center gap-1.5"
          >
            <Download className="h-4 w-4" /> Download Documents
          </Button>
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
                <div className="flex flex-col items-center gap-3 relative z-10 w-28 text-center shrink-0">
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300",
                      step.completed
                        ? "bg-emerald-600 border-emerald-600 text-white shadow-md shadow-emerald-100"
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
                      step.completed ? "text-emerald-700" : "text-slate-800"
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
                    step.completed && nextStepCompleted ? "bg-emerald-600" : "bg-slate-100"
                  )} />
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Main Details Grid (3 columns) ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr_0.9fr]">
        
        {/* ═══ COLUMN 1: Procurement Specs ═══ */}
        <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-base font-black text-slate-900 pb-3.5 border-b border-slate-100 uppercase tracking-wider">
            Procurement Specs
          </h2>
          
          <div className="mt-4 space-y-1">
            <InfoRow label="Estimated Value" value={formatCurrency(tender.budget)} />
            <InfoRow label="Procurement Type" value="Open Tender" />
            <InfoRow label="Reference Number" value={tenderIdString} />
            <InfoRow label="Category" value={tender.category || 'Civil Works'} />
            <InfoRow label="Sub Category" value={tender.subCategory || 'Warehouse Construction'} />
            <InfoRow label="Published Date" value={publishedDateFormatted} />
            <InfoRow label="Closing Date" value={closesAtFormatted} red />
            <InfoRow label="Bid Validity" value={`${tender.bidValidityDays || 180} Days`} />
            <InfoRow label="EMD / Bid Security" value={formatCurrency(tender.emdAmount || 200000)} />
            <InfoRow label="Evaluation Method" value={tender.evaluationMethod || 'QCBS'} />
            <InfoRow label="Delivery / Completion" value={tender.deliveryType || '90 Days'} />
            <InfoRow label="Location" value={tender.itemCondition || 'Nagpur, Maharashtra'} />
          </div>
        </section>

        {/* ═══ COLUMN 2: Scope & Schedule ═══ */}
        <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-6">
          <div className="space-y-4">
            <h2 className="text-base font-black text-slate-900 pb-3.5 border-b border-slate-100 uppercase tracking-wider">
              Scope & Schedule
            </h2>
            
            <div className="space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider">Scope of Work</h3>
              <p className="text-xs font-semibold leading-relaxed text-slate-650 text-slate-600">
                {tender.description || "Construction of a modern warehousing facility including foundation, structure, roofing, flooring, electrical and plumbing works as per specifications."}
              </p>
            </div>

            {/* Custom specification boxes */}
            <div className="grid grid-cols-4 gap-2 pt-1">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-left shadow-3xs">
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 block leading-tight">Tender Documents</span>
                <span className="mt-1 text-base font-black text-slate-800 block leading-none">06</span>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-left shadow-3xs">
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 block leading-tight">Pre-Bid Queries</span>
                <span className="mt-1 text-base font-black text-slate-800 block leading-none">24</span>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-left shadow-3xs">
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 block leading-tight">Pre-Bid Meeting</span>
                <span className="mt-1 text-[10px] font-extrabold text-slate-800 block leading-tight">15 Jul 2026</span>
              </div>
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-2.5 text-left shadow-3xs">
                <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 block leading-tight">Site Visit</span>
                <span className="mt-1 text-[10px] font-extrabold text-slate-800 block leading-tight">Optional</span>
              </div>
            </div>
          </div>

          {/* Key Dates list */}
          <div className="space-y-4 pt-4 border-t border-slate-100">
            <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider">Key Dates</h3>
            <div className="space-y-3">
              {[
                { label: 'Clarification Start', value: '11 Jul 2026', active: true },
                { label: 'Clarification End', value: '15 Jul 2026', active: true },
                { label: 'Bid Submission Start', value: '10 Jul 2026', active: true },
                { label: 'Bid Submission End', value: closesAtFormatted, active: true, red: true },
                { label: 'Technical Evaluation', value: '27 Jul 2026 - 02 Aug 2026', active: false },
                { label: 'Financial Evaluation', value: '03 Aug 2026 - 06 Aug 2026', active: false },
                { label: 'Awarding Date', value: '07 Aug 2026 (Tentative)', active: false },
              ].map((row, idx) => (
                <div key={idx} className="flex justify-between items-center text-xs font-semibold">
                  <span className="flex items-center gap-2 text-slate-500">
                    <span className={cn(
                      "flex h-4 w-4 items-center justify-center rounded-full text-[9px]",
                      row.active ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-400"
                    )}>
                      {row.active ? <Check className="h-2.5 w-2.5 stroke-[3]" /> : <span className="h-1.5 w-1.5 rounded-full bg-slate-300" />}
                    </span>
                    {row.label}
                  </span>
                  <span className={cn("font-bold", row.red ? "text-red-600 font-extrabold" : "text-slate-800")}>{row.value}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══ COLUMN 3: Entities & Activity ═══ */}
        <div className="space-y-6">
          {/* Buyer Information Section */}
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
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Department</span>
                <span className="text-xs font-bold text-slate-800 block mt-0.5">
                  {tender.buyer?.buyerProfile?.department || 'Procurement Department'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Contact Person</span>
                <span className="text-xs font-bold text-slate-800 block mt-0.5">
                  {tender.buyer?.buyerProfile?.contactPerson || 'Rakesh Sharma'}
                </span>
              </div>

              <div>
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Email & Phone</span>
                <span className="text-xs font-mono font-bold text-blue-600 block mt-0.5 hover:underline cursor-pointer">
                  {tender.buyer?.buyerProfile?.email || tender.buyer?.email || 'procurement@mrc.in'}
                </span>
                <span className="text-xs font-bold text-slate-800 block mt-0.5">
                  {tender.buyer?.buyerProfile?.phone || '+91 90785 43210'}
                </span>
              </div>
            </div>
          </section>

          {/* Activity Snapshot Section */}
          <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100 uppercase tracking-wider">
              Activity Snapshot
            </h2>
            
            <div className="grid grid-cols-2 gap-3.5 mt-2">
              {[
                { label: 'Total Queries', value: tender.activitySnapshot?.totalQueries || 12, strokeColor: '#3b82f6', d: 'M0,15 Q20,25 40,10 T80,20 T100,5' },
                { label: 'Total Responses', value: tender.activitySnapshot?.totalResponses || 12, strokeColor: '#10b981', d: 'M0,25 Q15,10 35,20 T70,5 T100,15' },
                { label: 'Total Views', value: tender.activitySnapshot?.totalViews || 156, strokeColor: '#6366f1', d: 'M0,20 Q25,5 50,22 T75,10 T100,8' },
                { label: 'Interested Suppliers', value: tender.activitySnapshot?.interestedSuppliers || 28, strokeColor: '#f59e0b', d: 'M0,15 Q30,25 60,8 T100,18' }
              ].map((card, idx) => (
                <div key={idx} className="rounded-2xl border border-slate-100 bg-slate-50/20 p-3.5 flex flex-col justify-between hover:shadow-2xs transition-all duration-200">
                  <div className="flex justify-between items-start gap-1">
                    <span className="text-[8px] font-black uppercase tracking-wider text-slate-400 leading-tight block max-w-[80px]">{card.label}</span>
                    <TrendingUp className="h-3 w-3 text-slate-400" />
                  </div>
                  <p className="mt-1 text-lg font-black text-slate-900 tabular-nums">{card.value}</p>
                  
                  {/* Dynamic path sparkline SVG */}
                  <svg className="w-full h-8 mt-2" viewBox="0 0 100 30" fill="none">
                    <path d={card.d} stroke={card.strokeColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              ))}
            </div>
          </section>
        </div>

      </div>
    </div>
  );
}
