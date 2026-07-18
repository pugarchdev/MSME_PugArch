'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, Download, FileText, MapPin, MessageSquareText, X, ArrowLeft, Building2, User2, PhoneCall, Calendar, Clock, Lock, Sparkles, HelpCircle, Eye } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { ClarificationButton, ResultsTable, StatusBadge } from '../components';
import { formatDate, money } from '../data';
import type { ProcurementBid } from '../data';
import { procurementBidApi } from '../api';
import { api, unwrapApiData } from '../../../lib/api';
import PremiumLoader from '../../../components/PremiumLoader';
import { toast } from 'sonner';
import { cn } from '../../../lib/utils';
import { openFileAsset } from '../../../lib/files';
import { Button } from '../../../components/ui/button';

const stages = [
  { key: 'PUBLISHED', label: 'Published' },
  { key: 'BIDDING', label: 'Bidding' },
  { key: 'TECH_EVAL', label: 'Technical Evaluation' },
  { key: 'FIN_EVAL', label: 'Financial Evaluation' },
  { key: 'AWARDED', label: 'Awarded' }
];

const getStageState = (stageKey: string, currentStatus: string) => {
  const statusStr = String(currentStatus || '').toUpperCase();
  // Map currentStatus to a rank:
  // DRAFT = 0
  // PUBLISHED = 1
  // OPEN_FOR_BIDDING / OPEN = 2
  // TECHNICAL_EVALUATION = 3
  // TECHNICAL_EVALUATION_COMPLETED = 3.5
  // FINANCIAL_EVALUATION / L1_GENERATED / UNDER_EVALUATION = 4
  // AWARDED / CLOSED = 5
  let currentRank = 1;
  if (statusStr === 'DRAFT') currentRank = 0;
  else if (statusStr === 'PUBLISHED') currentRank = 1;
  else if (['OPEN_FOR_BIDDING', 'OPEN'].includes(statusStr)) currentRank = 2;
  else if (['TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED'].includes(statusStr)) currentRank = 3;
  else if (['FINANCIAL_EVALUATION', 'L1_GENERATED', 'UNDER_EVALUATION'].includes(statusStr)) currentRank = 4;
  else if (['AWARDED', 'CLOSED'].includes(statusStr)) currentRank = 5;

  let targetRank = 1;
  if (stageKey === 'PUBLISHED') targetRank = 1;
  else if (stageKey === 'BIDDING') targetRank = 2;
  else if (stageKey === 'TECH_EVAL') targetRank = 3;
  else if (stageKey === 'FIN_EVAL') targetRank = 4;
  else if (stageKey === 'AWARDED') targetRank = 5;

  if (currentRank > targetRank) return 'COMPLETED';
  if (currentRank === targetRank) return 'ACTIVE';
  return 'PENDING';
};

export default function BidDetailsPage() {
  const { user, token } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || '';
  const bidId = pathname.split('/')[2];
  const [bid, setBid] = useState<ProcurementBid | null>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showClarifications, setShowClarifications] = useState(false);
  const participateHref = user ? `/bids/${bidId}/participate` : `/login?returnUrl=${encodeURIComponent(`/bids/${bidId}/participate`)}`;
  const isPendingApproval = bid?.approvalStatus === 'PENDING' || bid?.approvalStatus === 'DRAFT';
  
  const authHeaders = React.useMemo(() => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [token]);

  const myParticipation = useMemo(() => {
    if (!bid || !user) return null;
    return bid.participations?.find((p: any) => Number(p.sellerId) === Number(user.id));
  }, [bid, user]);

  const loadBid = React.useCallback(() => {
    let alive = true;
    setLoading(true);
    setError('');
    
    Promise.all([
      procurementBidApi.detail(bidId),
      api.fetch(`/api/bids/${bidId}/timeline`, { headers: authHeaders }).then(r => r.ok ? r.json() : { data: [] }).catch(() => ({ data: [] }))
    ])
      .then(([bidData, timelineRes]) => {
        if (alive) {
          const type = String(bidData?.procurementType || bidData?.bidType || '').toUpperCase();
          if (type === 'RFQ') {
            router.replace(`/seller/rfq?requestId=${bidData.id}`);
            return;
          }
          if (type === 'RFP') {
            router.replace(`/seller/rfp?requestId=${bidData.id}`);
            return;
          }
          if (type === 'OPEN_TENDER' || type === 'TENDER' || bidData?.sourceModel === 'TENDER') {
            router.replace(`/tenders?tender=${bidData.sourceId || bidData.id}`);
            return;
          }

          setBid(bidData);
          setTimeline(unwrapApiData<any[]>(timelineRes) || []);
        }
      })
      .catch((err: any) => {
        if (!alive) return;
        setBid(null);
        setError(err?.message || 'Unable to load bid details right now.');
      })
      .finally(() => { if (alive) setLoading(false); });
      
    return () => { alive = false; };
  }, [bidId, authHeaders]);

  useEffect(() => {
    return loadBid();
  }, [loadBid]);

  if (loading) {
    return <PremiumLoader />;
  }

  if (error) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 animate-in fade-in duration-300">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/bids" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Bids
          </Link>
        </div>
        <ProcurementErrorState message={error} onRetry={loadBid} />
      </div>
    );
  }

  if (!bid) {
    return (
      <div className="mx-auto w-full max-w-7xl px-4 py-8 animate-in fade-in duration-300">
        <div className="flex items-center gap-3 mb-6">
          <Link href="/bids" className="inline-flex h-9 items-center rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 hover:bg-slate-50">
            <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to Bids
          </Link>
        </div>
        <ProcurementEmptyState title="No bid details available currently." message="This bid was not returned by the live backend." />
      </div>
    );
  }

  const isOwner = user?.role === 'buyer' && Number(bid.buyerId) === Number(user.id);

  const isSubmitted = myParticipation?.submissionStatus === 'SUBMITTED';
  const isRequiresResubmission = myParticipation?.rejectionReason?.startsWith('REQUIRES_RESUBMISSION');

  return (
    <div className="mx-auto w-full max-w-7xl px-4 py-6 space-y-6 animate-in fade-in duration-300">
      
      {/* guest notice banner */}
      {!user && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/50 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100 text-blue-800 text-lg">
              ℹ️
            </span>
            <div>
              <h4 className="text-sm font-extrabold text-slate-900">Want to participate in this procurement?</h4>
              <p className="text-xs text-slate-500 font-semibold mt-0.5">This is a public opportunity. To submit queries, request clarifications, or participate in the bidding process, please login.</p>
            </div>
          </div>
          <button 
            onClick={() => router.push(`/login?returnUrl=${encodeURIComponent(pathname)}`)}
            className="rounded-xl bg-[#0b2447] px-4 py-2 text-xs font-black uppercase text-white hover:bg-[#12335f] transition-colors shadow-sm whitespace-nowrap"
          >
            Login to Participate
          </button>
        </div>
      )}

      {/* Premium Navigation & Top Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/bids" className="inline-flex h-8 items-center rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-bold text-slate-600 hover:bg-slate-50">
              <ArrowLeft className="mr-1 h-3.5 w-3.5" /> Bids
            </Link>
            <span className="rounded-md bg-indigo-50 border border-indigo-100 px-2 py-0.5 text-[10px] font-black text-indigo-700 uppercase tracking-wider">
              {bid.bidType || 'Procurement'}
            </span>
            <span className="rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-600">
              ID: {bid.id}
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-black tracking-tight text-slate-950 text-wrap-anywhere">{bid.title}</h1>
          <p className="mt-1 text-xs text-slate-500 font-semibold">
            Managed by {bid.buyerName} ({bid.buyerType}) • Department: {bid.departmentName || 'Procurement'}
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          {isPendingApproval ? (
            <button disabled className="inline-flex h-10 items-center justify-center rounded-lg bg-slate-100 border border-slate-200 px-4 text-xs font-black text-slate-400 cursor-not-allowed">
              <Lock className="mr-1.5 h-3.5 w-3.5" /> Pending Approval
            </button>
          ) : (!user || user.role === 'seller') ? (
            <Link href={participateHref} className="inline-flex h-10 items-center justify-center rounded-lg bg-indigo-600 px-4 text-xs font-black text-white hover:bg-indigo-700 transition duration-200 shadow-sm shadow-indigo-600/10">
              <Sparkles className="mr-1.5 h-3.5 w-3.5" /> {
                !user ? 'Login to Participate' :
                isSubmitted ? 'View Submitted Quotation' :
                isRequiresResubmission ? 'Revise & Resubmit Quotation' :
                myParticipation ? 'Continue Submission' : 'Participate in Bid'
              }
            </Link>
          ) : null}
        </div>
      </div>

      {/* Horizontal Lifecycle Stepper */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 p-4 rounded-2xl bg-white border border-slate-200/80 shadow-sm relative overflow-hidden">
        {stages.map((stage, idx) => {
          const state = getStageState(stage.key, bid.status);
          return (
            <div key={stage.key} className="flex items-center gap-3 relative z-10 p-1">
              <div className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 font-bold text-xs transition-all duration-300",
                state === 'COMPLETED' ? "bg-emerald-500 border-emerald-500 text-white shadow-md shadow-emerald-500/15" :
                state === 'ACTIVE' ? "bg-indigo-600 border-indigo-600 text-white shadow-md shadow-indigo-600/15 animate-pulse" :
                "bg-white border-slate-200 text-slate-400"
              )}>
                {state === 'COMPLETED' ? '✓' : idx + 1}
              </div>
              <div className="min-w-0">
                <p className={cn(
                  "text-[10px] font-black uppercase tracking-wider leading-none",
                  state === 'ACTIVE' ? "text-indigo-600" :
                  state === 'COMPLETED' ? "text-emerald-600" : "text-slate-400"
                )}>
                  {stage.label}
                </p>
                <p className="text-[9px] font-bold text-slate-400 mt-1">
                  {state === 'COMPLETED' ? 'Completed' : state === 'ACTIVE' ? 'Active' : 'Pending'}
                </p>
              </div>
            </div>
          );
        })}
      </div>

      {/* Buyer Control Panel */}
      {isOwner && (
        <div className="rounded-2xl border border-indigo-100 bg-indigo-50/20 p-5 shadow-sm flex flex-col md:flex-row md:items-center md:justify-between gap-4 transition hover:bg-indigo-50/30">
          <div>
            <span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-wider text-indigo-700">
              Buyer Console
            </span>
            <h4 className="text-sm font-extrabold text-slate-900 mt-2">Manage Procurement Lifecycle</h4>
            <p className="text-xs text-slate-500 font-semibold mt-0.5">As the owner, you can manage progress, evaluate compliance, and recommend awards.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {String(bid.status) === 'DRAFT' && (
              <button
                onClick={async () => {
                  try {
                    setLoading(true);
                    await procurementBidApi.submitBidForApproval(bid.id);
                    toast.success('Bid published successfully!');
                    loadBid();
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to publish bid');
                    setLoading(false);
                  }
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-600 px-4 text-xs font-black text-white hover:bg-indigo-700 transition"
              >
                Publish Bid
              </button>
            )}
            {['PUBLISHED', 'OPEN_FOR_BIDDING', 'OPEN'].includes(String(bid.status)) && (
              <button
                onClick={async () => {
                  const confirmEval = window.confirm("Are you sure you want to close bidding and enter technical evaluation?");
                  if (!confirmEval) return;
                  try {
                    setLoading(true);
                    const parts = await procurementBidApi.getBidParticipants(bid.id);
                    if (parts.length === 0) {
                      toast.error("Cannot evaluate: No sellers have participated in this bid yet.");
                      setLoading(false);
                      return;
                    }
                    await procurementBidApi.submitTechnicalEvaluation(bid.id, {
                      evaluations: parts.map(p => ({ participationId: p.id, status: 'QUALIFIED', remarks: 'Technical criteria met' }))
                    });
                    toast.success('Technical evaluation initiated!');
                    loadBid();
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to initiate technical evaluation');
                    setLoading(false);
                  }
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-600 px-4 text-xs font-black text-white hover:bg-indigo-700 transition"
              >
                Start Evaluation
              </button>
            )}
            {String(bid.status) === 'TECHNICAL_EVALUATION' && (
              <button
                onClick={async () => {
                  try {
                    setLoading(true);
                    await procurementBidApi.completeTechnicalEvaluation(bid.id);
                    toast.success('Technical evaluation completed!');
                    loadBid();
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to complete technical evaluation');
                    setLoading(false);
                  }
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-600 px-4 text-xs font-black text-white hover:bg-indigo-700 transition"
              >
                Complete Tech Evaluation
              </button>
            )}
            {String(bid.status) === 'TECHNICAL_EVALUATION_COMPLETED' && (
              <button
                onClick={async () => {
                  try {
                    setLoading(true);
                    await procurementBidApi.openFinancialEvaluation(bid.id);
                    toast.success('Financial evaluation opened and ranking generated!');
                    loadBid();
                  } catch (err: any) {
                    toast.error(err.message || 'Failed to open financial evaluation');
                    setLoading(false);
                  }
                }}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-indigo-600 px-4 text-xs font-black text-white hover:bg-indigo-700 transition"
              >
                Open Financial Bids
              </button>
            )}
            {['TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'L1_GENERATED', 'FINANCIAL_EVALUATION', 'UNDER_EVALUATION'].includes(String(bid.status)) && (
              <Link
                href={`/bids/${bid.id}/compare`}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-amber-600 bg-amber-50 px-4 text-xs font-black text-amber-700 hover:bg-amber-100 transition"
              >
                Compare & Award
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Main Grid Content */}
      <div className="grid gap-6 lg:grid-cols-[1fr_390px]">
        
        {/* Left Panel */}
        <div className="space-y-6">
          
          {/* CONSIGNEE DELIVERY SPECS Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-5">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
                <MapPin className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Consignee Delivery Specs</h2>
                <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Shipping requirements, contact information, and delivery parameters.</p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <SpecRow icon={Building2} label="Buyer Company" value={bid.buyerName || 'Global Solutions Inc.'} />
              <SpecRow icon={MapPin} label="Shipping Address" value={bid.deliveryLocation || bid.location || '123 Business Ave, New York, NY 10001, USA'} />
              <SpecRow icon={User2} label="Delivery Contact" value={bid.consigneeDetails?.consigneeName || 'Sarah Chen'} />
              <SpecRow icon={PhoneCall} label="Contact Number" value={bid.consigneeDetails?.consigneeMobile || '+1 212-555-1234'} />
              <SpecRow icon={Calendar} label="Required Delivery Date" value={bid.endDate ? formatDate(bid.endDate) : 'Oct 15, 2023'} />
              <SpecRow icon={Clock} label="Receiving Hours" value="8:00 AM - 4:00 PM EST" />
              <SpecRow icon={HelpCircle} label="Site Access Info" value={bid.consigneeDetails?.acceptanceCriteria || '-'} />
              <SpecRow icon={HelpCircle} label="Special Handling Requirements" value="-" />
            </div>
          </div>

          {/* Description & Eligibility Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div>
              <h3 className="text-xs font-black uppercase tracking-wider text-slate-400">Project Scope & Specifications</h3>
              <p className="mt-2 text-sm text-slate-700 leading-relaxed font-medium whitespace-pre-wrap">{bid.description || 'No detailed description provided.'}</p>
            </div>
            
            {bid.eligibility && bid.eligibility.length > 0 && (
              <div className="border-t border-slate-100 pt-4">
                <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 mb-2">Eligibility Criteria</h3>
                <ul className="list-disc pl-4 space-y-1 text-xs text-slate-600 font-semibold">
                  {bid.eligibility.map((el, index) => (
                    <li key={index}>{el}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {/* Clarifications Section Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4 mb-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Clarification Stream</h2>
                <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Log of query resolutions and regulatory checklists.</p>
              </div>
              <ClarificationButton onClick={() => setShowClarifications(true)} />
            </div>
            
            <p className="text-xs text-slate-500 font-semibold leading-relaxed">
              Have questions regarding standard specifications, quality checklist, or payment terms? Click request clarification to send an inquiry directly to the buyer's procurement team.
            </p>
          </div>

          {/* Bid Result Table Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="mb-4 flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Bid Evaluation Results</h2>
                <p className="text-[11px] text-slate-400 font-semibold mt-0.5">Real-time status updates of bid commercial comparisons.</p>
              </div>
              <Link href={`/bids/${bid.id}/results`} className="text-xs font-black text-indigo-600 hover:text-indigo-700 underline underline-offset-4">
                Open Full Sheet
              </Link>
            </div>
            
            <div className="overflow-x-auto">
              <ResultsTable rows={bid.results} />
            </div>
          </div>

        </div>

        {/* Right Panel */}
        <div className="space-y-6">
          
          {/* Tender Overview Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-slate-900 text-white">
                <FileText className="h-5 w-5" />
              </span>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Tender Overview</h2>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <OverviewField label="Estimated Value" value={money(bid.estimatedValue) || '$750,000 USD'} />
              <OverviewField label="Quantity" value={bid.quantity ? `${bid.quantity}` : '5,000 Units'} />
              <OverviewField label="Evaluation Method" value={bid.evaluationMethod || 'Techno-Commercial Evaluation, Yes - Technical & Financial'} className="col-span-2" />
              <OverviewField label="RFQ Reference" value={bid.id || 'RFQ-2023-GlobalProcure'} />
              <OverviewField label="Category" value={bid.category || 'IT Infrastructure & Services'} />
              <OverviewField label="Closing Date" value={bid.endDate ? formatDate(bid.endDate) : 'Sep 15, 2023 5:00 PM EST'} className="col-span-2" />
            </div>
          </div>

          {/* Key Compliance Documents Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex items-center gap-3 border-b border-slate-100 pb-4 mb-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
                <Download className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">Key Compliance Documents</h2>
                <p className="text-[10px] text-slate-400 font-semibold mt-0.5">Review guidelines and required forms.</p>
              </div>
            </div>

            <div className="space-y-3">
              {(() => {
                const defaultDocs = [
                  { name: 'RFQ Document', meta: 'PDF • 2.4 MB • Uploaded: 24 Aug 2023' },
                  { name: 'Technical Specifications', meta: 'PDF • 4.1 MB • Uploaded: 24 Aug 2023' },
                  { name: 'Compliance Checklist', meta: 'DOCX • 1.2 MB • Uploaded: 25 Aug 2023' },
                  { name: 'Terms & Conditions', meta: 'PDF • 1.8 MB • Uploaded: 24 Aug 2023' },
                  { name: 'Non-Disclosure Agreement', meta: 'PDF • 950 KB • Uploaded: 25 Aug 2023' },
                  { name: 'Quality Certification', meta: 'PDF • 3.2 MB • Uploaded: 26 Aug 2023' }
                ];
                const docsToRender = bid.bidDocuments?.length ? bid.bidDocuments : defaultDocs;
                return docsToRender.map((doc: any) => (
                  <div key={doc.name} className="flex items-center justify-between rounded-xl border border-slate-100 p-3 hover:bg-slate-50/80 transition duration-200">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className={cn(
                        "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-xs font-bold",
                        doc.name.includes('Checklist') || doc.name.endsWith('.docx') ? "bg-blue-50 text-blue-600" : "bg-red-50 text-red-600"
                      )}>
                        <FileText className="h-4.5 w-4.5" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-xs font-extrabold text-slate-800 truncate">{doc.name}</p>
                        <p className="text-[9px] font-bold text-slate-400 mt-0.5 truncate">{doc.meta || 'PDF • 1.5 MB'}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!doc.fileAssetId) {
                            toast.info("Mock document. No file is uploaded on server.");
                            return;
                          }
                          openFileAsset({
                            id: doc.fileAssetId,
                            fileAssetId: doc.fileAssetId,
                            originalName: doc.name,
                            url: doc.url,
                          }, doc.name).catch(err => {
                            toast.error(err instanceof Error ? err.message : 'Unable to open document');
                          });
                        }}
                        className="h-7 px-2 text-[10px] font-black uppercase text-indigo-600 hover:bg-indigo-50"
                      >
                        <Eye className="mr-1 h-3.5 w-3.5" /> View
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        onClick={() => {
                          if (!doc.fileAssetId) {
                            toast.info("Mock document. No file is uploaded on server.");
                            return;
                          }
                          openFileAsset({
                            id: doc.fileAssetId,
                            fileAssetId: doc.fileAssetId,
                            originalName: doc.name,
                            url: doc.url,
                          }, doc.name).catch(err => {
                            toast.error(err instanceof Error ? err.message : 'Unable to open document');
                          });
                        }}
                        className="h-7 px-2 text-slate-400 hover:bg-slate-100"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                ));
              })()}
            </div>
          </div>

          {/* Action Box Card */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            {isPendingApproval ? (
              <button disabled className="flex h-11 w-full items-center justify-center rounded-lg bg-slate-100 text-xs font-black text-slate-400 cursor-not-allowed border border-slate-200">
                Pending Approval
              </button>
            ) : (
              <Link href={participateHref} className="flex h-11 items-center justify-center rounded-lg bg-indigo-600 text-xs font-black text-white hover:bg-indigo-700 transition shadow-sm shadow-indigo-600/10">
                Submit Bid Participation
              </Link>
            )}
            <Link href="/bids" className="flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50 transition">
              Back to Dashboard
            </Link>
          </div>

        </div>

      </div>

      {/* Clarifications Drawer Modal */}
      {showClarifications && (
        <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 transition-all duration-300 animate-in fade-in">
          <div className="max-h-[90dvh] w-full max-w-4xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl flex flex-col animate-in slide-in-from-bottom-8 duration-300">
            <div className="flex items-center justify-between border-b border-slate-100 p-5">
              <div>
                <h2 className="text-base font-black text-slate-900">Clarification History</h2>
                <p className="text-xs text-slate-400 font-bold mt-0.5">Procurement Ref: {bid.id}</p>
              </div>
              <button onClick={() => setShowClarifications(false)} className="flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="overflow-auto p-5 space-y-4 max-h-[70dvh]">
              {bid.clarifications && bid.clarifications.length > 0 ? bid.clarifications.map((item, idx) => (
                <div key={idx} className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge label={item.status} />
                    <p className="text-xs font-black text-slate-800">{item.requestNumber || `REQ-00${idx + 1}`}</p>
                    <p className="text-[10px] font-bold text-slate-400">{item.requestedAt}</p>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <InfoMini icon={<MessageSquareText className="h-4 w-4 text-indigo-500" />} label="Clarification Type" value={item.type || 'Specification Query'} />
                    <InfoMini icon={<FileText className="h-4 w-4 text-indigo-500" />} label="Uploaded Attachment" value={item.uploadedDocument || '-'} />
                    <InfoMini icon={<CalendarDays className="h-4 w-4 text-indigo-500" />} label="Query Description" value={item.description} className="col-span-2" />
                    {item.buyerResponse && (
                      <InfoMini icon={<MapPin className="h-4 w-4 text-indigo-500" />} label="Official Response" value={item.buyerResponse} className="col-span-2 bg-indigo-50/30 border border-indigo-100" />
                    )}
                  </div>
                </div>
              )) : (
                <div className="text-center py-12">
                  <MessageSquareText className="mx-auto h-10 w-10 text-slate-300 stroke-[1.5]" />
                  <p className="mt-3 text-sm font-black text-slate-900">No requests filed</p>
                  <p className="mt-1 text-xs text-slate-500 font-semibold">No clarification requests have been raised for this bid yet.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SpecRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/30 p-4 flex gap-3 hover:bg-slate-50 transition">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-slate-500 mt-0.5">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none">{label}</p>
        <p className="mt-2 text-xs font-black text-slate-800 leading-relaxed text-wrap-anywhere">{value}</p>
      </div>
    </div>
  );
}

function OverviewField({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-slate-100 bg-slate-50/50 p-4", className)}>
      <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none">{label}</p>
      <p className="mt-2.5 text-xs font-black text-slate-950 leading-relaxed">{value}</p>
    </div>
  );
}

function InfoMini({ icon, label, value, className }: { icon: React.ReactNode; label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-xl bg-white p-3 border border-slate-100", className)}>
      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-slate-400">
        {icon} {label}
      </p>
      <p className="mt-1.5 text-xs font-semibold text-slate-700 leading-relaxed">{value}</p>
    </div>
  );
}

function ProcurementErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="rounded-2xl border border-red-100 bg-red-50/30 p-8 text-center max-w-xl mx-auto space-y-4">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-600">
        <X className="h-6 w-6" />
      </div>
      <div className="space-y-1">
        <h3 className="text-base font-black text-slate-900">Failed to load details</h3>
        <p className="text-xs text-slate-500 font-semibold leading-relaxed">{message}</p>
      </div>
      <button onClick={onRetry} className="inline-flex h-9 items-center justify-center rounded-lg bg-red-600 px-4 text-xs font-black text-white hover:bg-red-700 transition">
        Retry Load
      </button>
    </div>
  );
}

function ProcurementEmptyState({ title, message }: { title: string; message: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-350 bg-slate-50 p-12 text-center max-w-xl mx-auto space-y-3">
      <FileText className="mx-auto h-12 w-12 text-slate-300 stroke-[1.5]" />
      <div className="space-y-1">
        <h3 className="text-base font-black text-slate-900">{title}</h3>
        <p className="text-xs text-slate-500 font-semibold leading-relaxed">{message}</p>
      </div>
    </div>
  );
}
