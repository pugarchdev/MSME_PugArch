'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { CalendarDays, Download, FileText, MapPin, MessageSquareText, X, ArrowLeft, Building2, User2, PhoneCall, Calendar, Clock, Lock, Sparkles, HelpCircle, Eye, Users, Tag, Mail, Phone } from 'lucide-react';
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
import { formatDateTime } from '../../shared/format';

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

  const [activeTab, setActiveTab] = useState<'responses' | 'overview'>('responses');
  const [selectedParticipation, setSelectedParticipation] = useState<any | null>(null);

  const isOwner = useMemo(() => {
    if (!bid || !user) return false;
    return user.role === 'buyer' && Number(bid.buyerId) === Number(user.id);
  }, [bid, user]);

  const myParticipation = useMemo(() => {
    if (!bid || !user) return null;
    return bid.participations?.find((p: any) => Number(p.sellerId) === Number(user.id));
  }, [bid, user]);

  const submittedParticipations = useMemo(() => {
    if (!bid || !bid.participations) return [];

    const uniqueSellersMap = new Map<number, any>();

    bid.participations.forEach((p: any) => {
      if (p.submissionStatus === 'SUBMITTED' && !p.isWithdrawn) {
        const sellerId = p.sellerId || p.seller?.id;
        if (sellerId) {
          if (!uniqueSellersMap.has(sellerId)) {
            uniqueSellersMap.set(sellerId, p);
          } else {
            const existing = uniqueSellersMap.get(sellerId);
            const existingTime = new Date(existing.submittedAt || existing.createdAt || 0).getTime();
            const pTime = new Date(p.submittedAt || p.createdAt || 0).getTime();
            if (pTime > existingTime) {
              uniqueSellersMap.set(sellerId, p);
            }
          }
        }
      }
    });

    return Array.from(uniqueSellersMap.values());
  }, [bid]);

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
          const isSellerRole = user?.role === 'seller';
          if (type === 'RFQ' && isSellerRole) {
            router.replace(`/seller/rfq?requestId=${bidData.id}`);
            return;
          }
          if (type === 'RFP' && isSellerRole) {
            router.replace(`/seller/rfp?requestId=${bidData.id}`);
            return;
          }
          if ((type === 'OPEN_TENDER' || type === 'TENDER' || bidData?.sourceModel === 'TENDER') && isSellerRole) {
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
  }, [bidId, authHeaders, user?.role, router]);

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

      {/* Tab Navigation (only for Owner) */}
      {isOwner && (
        <div className="flex border-b border-slate-200 mb-6 bg-white p-1 rounded-xl shadow-sm border">
          <button
            onClick={() => setActiveTab('responses')}
            className={cn(
              "flex-1 md:flex-initial px-6 py-2.5 text-xs font-extrabold rounded-lg transition-all duration-200 flex items-center justify-center gap-2",
              activeTab === 'responses'
                ? "bg-[#0b2447] text-white shadow-sm"
                : "text-slate-600 hover:bg-slate-50 hover:text-slate-800"
            )}
          >
            <Users className="h-4 w-4" />
            Seller Responses ({submittedParticipations.length})
          </button>
          <button
            onClick={() => setActiveTab('overview')}
            className={cn(
              "flex-1 md:flex-initial px-6 py-2.5 text-xs font-extrabold rounded-lg transition-all duration-200 flex items-center justify-center gap-2",
              activeTab === 'overview'
                ? "bg-[#0b2447] text-white shadow-sm"
                : "text-slate-650 hover:bg-slate-50 hover:text-slate-800"
            )}
          >
            <FileText className="h-4 w-4" />
            Procurement Overview
          </button>
        </div>
      )}

      {isOwner && activeTab === 'responses' ? (
        // Seller Responses View Tab
        submittedParticipations.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-slate-200 bg-white p-8">
            <Users className="mx-auto h-12 w-12 text-slate-350 stroke-[1.5]" />
            <h3 className="mt-4 text-base font-black text-slate-900">No seller responses received yet.</h3>
            <p className="mt-1 text-xs text-slate-500 font-semibold">We will show participating sellers here once they submit their bids.</p>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {submittedParticipations.map((p: any) => {
              const techStatus = p.technicalStatus || p.submissionStatus;
              const sellerName = p.seller?.organization?.organizationName || p.sellerName || p.seller?.name || `Seller #${p.sellerId}`;
              const contactPerson = p.seller?.name || p.sellerName;
              const email = p.seller?.email || p.responseData?.contactEmail;
              const mobile = p.seller?.mobile || p.responseData?.contactPhone;
              const isQualified = techStatus === 'QUALIFIED' || techStatus === 'Qualified';

              const rawLineItems: any[] = Array.isArray(p.lineItems) && p.lineItems.length > 0
                ? p.lineItems
                : (Array.isArray(p.responseData?.lineItems) ? p.responseData.lineItems : []);

              const docsCount = (p.documents?.length || 0) + (p.attachmentUrl ? 1 : 0);

              return (
                <div key={p.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs flex flex-col justify-between hover:shadow-md hover:border-slate-300 transition-all duration-300">
                  <div className="space-y-3.5">
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-sm font-black text-slate-950 line-clamp-1">{sellerName}</h3>
                        <p className="text-[11px] font-extrabold text-slate-500 mt-0.5 flex items-center gap-1">
                          <User2 className="h-3 w-3 text-indigo-600" />
                          <span>{contactPerson || 'Seller Representative'}</span>
                        </p>
                      </div>
                      <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600 uppercase shrink-0">
                        {p.participationNumber || `PRT-${p.id}`}
                      </span>
                    </div>

                    <div className="space-y-1.5 text-xs font-semibold text-slate-600">
                      {email && (
                        <p className="flex items-center gap-1.5 text-slate-600">
                          <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{email}</span>
                        </p>
                      )}
                      {mobile && (
                        <p className="flex items-center gap-1.5 text-slate-600">
                          <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span>{mobile}</span>
                        </p>
                      )}
                      <p className="flex items-center gap-1.5 pt-0.5">
                        <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="text-slate-400">Submitted:</span> {formatDateTime(p.submittedAt || p.createdAt)}
                      </p>
                      <p className="flex items-center gap-1.5">
                        <Tag className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                        <span className="text-slate-400">Quoted Total:</span>{' '}
                        {p.financialSealed && !(p.totalAmount || p.quotedAmount) ? (
                          <span className="font-extrabold text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-[10px]">🔒 Sealed</span>
                        ) : (
                          <span className="font-black text-slate-950 text-xs">{money(p.totalAmount || p.quotedAmount || 0)}</span>
                        )}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                        📄 {docsCount} {docsCount === 1 ? 'Document' : 'Documents'}
                      </span>
                      {rawLineItems.length > 0 && (
                        <span className="inline-flex items-center rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 text-[10px] font-extrabold">
                          📦 {rawLineItems.length} Quoted {rawLineItems.length === 1 ? 'Item' : 'Items'}
                        </span>
                      )}
                    </div>

                    <div className="pt-1">
                      <StatusBadge label={techStatus} />
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 flex gap-2">
                    <button
                      onClick={() => setSelectedParticipation(p)}
                      className="flex-1 inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50 transition shadow-xs"
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5 text-indigo-600" /> View Quotation Details
                    </button>
                    {isQualified && (
                      <button
                        onClick={async () => {
                          const confirmAccept = window.confirm(`Accept proposal from ${sellerName} and create Purchase Order?`);
                          if (!confirmAccept) return;
                          try {
                            setLoading(true);
                            await procurementBidApi.recommendAward(bid.id, {
                              participationId: p.id,
                              remarks: 'Accepted via BidDetailsPage Responses Tab'
                            });
                            toast.success('Proposal accepted! Purchase Order creation initiated.');
                            loadBid();
                          } catch (err: any) {
                            toast.error(err.message || 'Failed to accept proposal');
                            setLoading(false);
                          }
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-700 transition shadow-xs"
                      >
                        Accept
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        // Standard Grid Layout (Procurement Overview)
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
                <SpecRow icon={MapPin} label="Shipping Address" value={bid.deliveryLocation || bid.location || bid.consigneeDetails?.deliveryAddress || '123 Business Ave, New York, NY 10001, USA'} />
                <SpecRow icon={User2} label="Delivery Contact" value={bid.consigneeDetails?.consigneeName || 'Sarah Chen'} />
                <SpecRow icon={PhoneCall} label="Contact Number" value={bid.consigneeDetails?.consigneeMobile || '+1 212-555-1234'} />
                <SpecRow icon={Calendar} label="Required Delivery Date" value={bid.endDate ? formatDate(bid.endDate) : 'Oct 15, 2023'} />
                <SpecRow icon={Clock} label="Receiving Hours" value={bid.consigneeDetails?.receivingHours || '8:00 AM - 4:00 PM EST'} />
                <SpecRow icon={HelpCircle} label="Site Access Info" value={bid.consigneeDetails?.siteAccessInfo || bid.consigneeDetails?.acceptanceCriteria || '-'} />
                <SpecRow icon={HelpCircle} label="Special Handling Requirements" value={bid.consigneeDetails?.specialHandlingRequirements || '-'} />
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
      )}

      {/* Participation Details Modal */}
      {selectedParticipation && (() => {
        const p = selectedParticipation;
        const sellerName = p.seller?.organization?.organizationName || p.sellerName || p.seller?.name || `Seller #${p.sellerId}`;
        const contactPerson = p.seller?.name || p.sellerName;
        const email = p.seller?.email || p.responseData?.contactEmail;
        const mobile = p.seller?.mobile || p.responseData?.contactPhone;
        const techStatus = p.technicalStatus || p.submissionStatus;
        const isQualified = techStatus === 'QUALIFIED' || techStatus === 'Qualified';

        const responseData = p.responseData || {};
        const rawLineItems: any[] = Array.isArray(p.lineItems) && p.lineItems.length > 0
          ? p.lineItems
          : (Array.isArray(responseData.lineItems) ? responseData.lineItems : []);

        // Merge: prefer p.documents (already normalized by backend), fall back to raw responseData.documents
        const normalizeDoc = (d: any, idx: number) => ({
          id: d.id || `rdoc-${p.id}-${idx}`,
          documentName: d.documentName || d.name || d.fileName || `Document ${idx + 1}`,
          fileName: d.fileName || d.name || 'file.pdf',
          fileUrl: d.fileUrl || d.url || null,
          fileKey: d.fileKey || null,
          fileAssetId: d.fileAssetId || null,
          documentCategory: d.documentCategory || d.category || 'TECHNICAL_PROPOSAL',
          mimeType: d.mimeType || 'application/pdf',
          documentStatus: d.documentStatus || 'UPLOADED',
          uploadedAt: d.uploadedAt || null,
        });

        const docs: any[] = Array.isArray(p.documents) && p.documents.length > 0
          ? p.documents.map(normalizeDoc)
          : (Array.isArray(responseData.documents) ? responseData.documents.map(normalizeDoc) : []);

        if (p.attachmentUrl && !docs.some((d: any) => d.fileUrl === p.attachmentUrl || d.url === p.attachmentUrl)) {
          docs.unshift({
            id: `att-${p.id}`,
            documentName: 'Uploaded Quote Attachment',
            fileName: 'Quotation_Attachment.pdf',
            fileUrl: p.attachmentUrl,
            fileKey: null,
            fileAssetId: null,
            documentCategory: 'TECHNICAL_PROPOSAL',
            mimeType: 'application/pdf',
            documentStatus: 'UPLOADED',
            uploadedAt: null,
          });
        }

        const deliveryTimeline = p.deliveryTimeline || responseData.deliveryTimeline || p.deliverySchedule;
        const terms = p.terms || responseData.terms || p.paymentTerms;

        // Financial total calculation if line items exist
        const calculatedTotal = rawLineItems.reduce((acc: number, item: any) => {
          const qty = Number(item.quantity || 1);
          const price = Number(item.unitPrice || item.price || item.unitRate || 0);
          const tax = Number(item.gstPercent || item.taxPercent || 0);
          const lineVal = qty * price;
          const lineTax = lineVal * (tax / 100);
          return acc + lineVal + lineTax;
        }, 0);

        const displayTotalAmount = p.totalAmount || p.quotedAmount || (calculatedTotal > 0 ? calculatedTotal : 0);

        return (
          <div className="fixed inset-0 z-[9999] flex items-end justify-center bg-black/60 backdrop-blur-xs p-0 sm:items-center sm:p-4 transition-all duration-300 animate-in fade-in">
            <div className="max-h-[92dvh] w-full max-w-4xl overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl flex flex-col animate-in slide-in-from-bottom-8 duration-300">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-150 bg-gradient-to-r from-slate-900 via-[#0b2447] to-indigo-950 px-6 py-4 text-white">
                <div className="flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-indigo-300 border border-white/10 shadow-inner">
                    <Building2 className="h-5 w-5" />
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-extrabold tracking-tight text-white">{sellerName}</h2>
                      <span className="rounded-full bg-white/10 px-2.5 py-0.5 text-[10px] font-black uppercase text-indigo-200 border border-white/10">
                        {p.participationNumber || `PRT-${p.id}`}
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 font-semibold mt-0.5">Seller Quotation & Bid Participation Details</p>
                  </div>
                </div>
                <button
                  onClick={() => setSelectedParticipation(null)}
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white hover:bg-white/20 transition"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="overflow-y-auto p-6 space-y-6 max-h-[75dvh] bg-slate-50/40">

                {/* Seller Profile & Contact Section */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-400 flex items-center gap-2">
                    <User2 className="h-4 w-4 text-indigo-600" /> Seller Organization & Contact Details
                  </h3>
                  <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 pt-1">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Company Name</span>
                      <p className="text-xs font-extrabold text-slate-900 mt-1 truncate">{sellerName}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Contact Person</span>
                      <p className="text-xs font-extrabold text-slate-800 mt-1 truncate">{contactPerson || 'N/A'}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <Mail className="h-3 w-3 text-slate-400" /> Email Address
                      </span>
                      <p className="text-xs font-bold text-slate-800 mt-1 truncate">{email || 'Not Provided'}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                        <PhoneCall className="h-3 w-3 text-slate-400" /> Mobile / Phone
                      </span>
                      <p className="text-xs font-bold text-slate-800 mt-1 truncate">{mobile || 'Not Provided'}</p>
                    </div>
                  </div>
                </div>

                {/* Commercial & Financial Overview Cards */}
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
                  <div className="rounded-2xl border border-indigo-150 p-4 bg-gradient-to-br from-indigo-50/50 to-white shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 leading-none flex items-center gap-1">
                      <Tag className="h-3.5 w-3.5 text-indigo-600" /> Quoted Amount
                    </span>
                    <p className="mt-2 text-base font-black text-[#0b2447]">
                      {p.financialSealed && !displayTotalAmount ? (
                        <span className="text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded text-xs">🔒 Sealed</span>
                      ) : (
                        money(displayTotalAmount)
                      )}
                    </p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4 bg-white shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-slate-400" /> Delivery Timeline
                    </span>
                    <p className="mt-2 text-xs font-extrabold text-slate-800">{deliveryTimeline || 'Standard Delivery'}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4 bg-white shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-slate-400" /> Submitted At
                    </span>
                    <p className="mt-2 text-xs font-extrabold text-slate-800">{formatDateTime(p.submittedAt || p.createdAt)}</p>
                  </div>

                  <div className="rounded-2xl border border-slate-200 p-4 bg-white shadow-sm">
                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 leading-none flex items-center gap-1">
                      <StatusBadge label={techStatus} />
                    </span>
                    <div className="mt-2">
                      <span className="text-[10px] font-bold text-slate-400">Technical Qualification</span>
                    </div>
                  </div>
                </div>

                {/* Line Item Pricing Breakdown Table (if items exist) */}
                {rawLineItems.length > 0 ? (
                  <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                      <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                        <Tag className="h-4 w-4 text-indigo-600" /> Quotation Item Breakdown
                      </h3>
                      <span className="text-[11px] font-bold text-slate-500 bg-slate-100 px-2.5 py-0.5 rounded-full">
                        {rawLineItems.length} {rawLineItems.length === 1 ? 'Item' : 'Items'} Quoted
                      </span>
                    </div>

                    <div className="overflow-x-auto rounded-xl border border-slate-150">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-[10px] font-black uppercase tracking-wider text-slate-500">
                          <tr>
                            <th className="py-2.5 px-3">#</th>
                            <th className="py-2.5 px-3">Item Description / Specs</th>
                            <th className="py-2.5 px-3">Make / Brand</th>
                            <th className="py-2.5 px-3 text-center">Qty</th>
                            <th className="py-2.5 px-3 text-right">Unit Rate</th>
                            <th className="py-2.5 px-3 text-right">GST / Tax</th>
                            <th className="py-2.5 px-3 text-right">Line Total</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 font-semibold text-slate-800">
                          {rawLineItems.map((item: any, idx: number) => {
                            const qty = Number(item.quantity || 1);
                            const unitPrice = Number(item.unitPrice || item.price || item.unitRate || 0);
                            const gst = Number(item.gstPercent || item.taxPercent || 0);
                            const lineTotal = item.lineTotal || item.totalPrice || (qty * unitPrice * (1 + gst / 100));

                            return (
                              <tr key={idx} className="hover:bg-slate-50/80 transition">
                                <td className="py-3 px-3 text-slate-400 font-bold">{idx + 1}</td>
                                <td className="py-3 px-3">
                                  <p className="font-extrabold text-slate-900">{item.itemName || item.itemDescription || item.description || `Item #${idx + 1}`}</p>
                                  {item.remarks && <p className="text-[10px] text-slate-400 font-medium mt-0.5">{item.remarks}</p>}
                                </td>
                                <td className="py-3 px-3 font-medium text-slate-600">{item.makeBrand || p.makeBrand || '-'}</td>
                                <td className="py-3 px-3 text-center font-bold">{qty} {item.unit || item.uom || ''}</td>
                                <td className="py-3 px-3 text-right tabular-nums">{money(unitPrice)}</td>
                                <td className="py-3 px-3 text-right tabular-nums">{gst ? `${gst}%` : '-'}</td>
                                <td className="py-3 px-3 text-right font-extrabold text-slate-950 tabular-nums">{money(lineTotal)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                        <tfoot className="bg-slate-50 border-t border-slate-200 font-black text-slate-900 text-xs">
                          <tr>
                            <td colSpan={6} className="py-2.5 px-3 text-right uppercase tracking-wider text-[10px] text-slate-500">Total Quoted Amount:</td>
                            <td className="py-2.5 px-3 text-right text-indigo-700 text-sm font-black tabular-nums">
                              {money(displayTotalAmount)}
                            </td>
                          </tr>
                        </tfoot>
                      </table>
                    </div>
                  </div>
                ) : null}

                {/* Technical Specifications & Notes Box */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-600" /> Product Specifications & Seller Remarks
                  </h3>

                  <div className="grid gap-4 sm:grid-cols-2 text-xs">
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Make / Brand</span>
                      <p className="font-extrabold text-slate-800 mt-1">{p.makeBrand || responseData.makeBrand || '-'}</p>
                    </div>
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Model Number</span>
                      <p className="font-extrabold text-slate-800 mt-1">{p.model || responseData.model || '-'}</p>
                    </div>
                  </div>

                  {p.offeredItemDescription && (
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Detailed Description / Technical Compliance:</span>
                      <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {p.offeredItemDescription}
                      </div>
                    </div>
                  )}

                  {terms && (
                    <div>
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1.5">Payment & Delivery Terms:</span>
                      <div className="bg-slate-50/70 p-3.5 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
                        {terms}
                      </div>
                    </div>
                  )}
                </div>

                {/* Submitted Documents Section */}
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                    <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                      <Download className="h-4 w-4 text-indigo-600" /> Submitted Documents ({docs.length})
                    </h3>
                  </div>

                  {docs.length > 0 ? (
                    <div className="space-y-2.5">
                      {docs.map((doc: any, index: number) => {
                        const fileName = doc.documentName || doc.fileName || doc.name || `Attachment #${index + 1}`;
                        const category = doc.documentCategory || 'TECHNICAL_PROPOSAL';

                        return (
                          <div key={doc.id || index} className="flex items-center justify-between rounded-xl border border-slate-200 p-3 bg-slate-50/50 hover:bg-slate-50 transition shadow-xs">
                            <div className="flex items-center gap-3 min-w-0">
                              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-600 text-xs font-bold">
                                <FileText className="h-4.5 w-4.5" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-extrabold text-slate-800 truncate">{fileName}</p>
                                <p className="text-[9px] font-bold text-slate-400 uppercase mt-0.5">{category}</p>
                              </div>
                            </div>

                            <div className="flex items-center gap-1.5 shrink-0 ml-3">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                  if (!doc.fileAssetId && !doc.fileUrl && !doc.url) {
                                    toast.info("Mock document file is not uploaded on server.");
                                    return;
                                  }
                                  openFileAsset({
                                    id: doc.fileAssetId || doc.id,
                                    fileAssetId: doc.fileAssetId,
                                    originalName: fileName,
                                    url: doc.fileUrl || doc.url,
                                  }, fileName).catch(err => {
                                    toast.error(err instanceof Error ? err.message : 'Unable to view document');
                                  });
                                }}
                                className="h-8 px-2.5 text-[10px] font-black uppercase text-indigo-600 border-indigo-200 hover:bg-indigo-50"
                              >
                                <Eye className="mr-1 h-3.5 w-3.5" /> View
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  if (!doc.fileAssetId && !doc.fileUrl && !doc.url) {
                                    toast.info("Mock document file is not uploaded on server.");
                                    return;
                                  }
                                  openFileAsset({
                                    id: doc.fileAssetId || doc.id,
                                    fileAssetId: doc.fileAssetId,
                                    originalName: fileName,
                                    url: doc.fileUrl || doc.url,
                                  }, fileName).catch(err => {
                                    toast.error(err instanceof Error ? err.message : 'Unable to open document');
                                  });
                                }}
                                className="h-8 w-8 p-0 text-slate-400 hover:bg-slate-100"
                              >
                                <Download className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-6 border border-dashed border-slate-200 rounded-xl bg-slate-50/50">
                      <FileText className="mx-auto h-7 w-7 text-slate-300 stroke-[1.5]" />
                      <p className="mt-2 text-xs font-bold text-slate-500">No document attachments submitted with this quotation.</p>
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="border-t border-slate-150 p-4 bg-white flex justify-end gap-2.5">
                <button
                  onClick={() => setSelectedParticipation(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50 transition shadow-xs"
                >
                  Close
                </button>
                {isQualified && isOwner && (
                  <button
                    onClick={async () => {
                      const confirmAccept = window.confirm(`Accept proposal from ${sellerName} and create Purchase Order?`);
                      if (!confirmAccept) return;
                      try {
                        setLoading(true);
                        await procurementBidApi.recommendAward(bid.id, {
                          participationId: p.id,
                          remarks: 'Accepted via BidDetailsPage Response Modal'
                        });
                        toast.success('Proposal accepted! Purchase Order creation initiated.');
                        setSelectedParticipation(null);
                        loadBid();
                      } catch (err: any) {
                        toast.error(err.message || 'Failed to accept proposal');
                        setLoading(false);
                      }
                    }}
                    className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-5 text-xs font-black text-white hover:bg-emerald-700 transition shadow-sm"
                  >
                    Accept & Award Proposal
                  </button>
                )}
              </div>

            </div>
          </div>
        );
      })()}

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
              {bid.clarifications && bid.clarifications.length > 0 ? bid.clarifications.map((item: any, idx: number) => (
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
