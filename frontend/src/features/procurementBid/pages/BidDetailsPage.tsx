'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { Download, FileText, X, ArrowLeft, Building2, User2, Clock, Sparkles, Eye, Users, Tag, Mail, Phone, PhoneCall, Calendar, LayoutGrid, List, Columns3, CheckSquare, Square } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { StatusBadge } from '../components';
import { money } from '../data';
import type { ProcurementBid } from '../data';
import { procurementBidApi } from '../api';
import PremiumLoader from '../../../components/PremiumLoader';
import { toast } from 'sonner';
import { cn } from '../../../lib/utils';
import { openFileAsset } from '../../../lib/files';
import { Button } from '../../../components/ui/button';
import { formatDateTime } from '../../shared/format';

const stages = [
  { key: 'PUBLISHED', label: 'Published' },
  { key: 'BIDDING', label: 'Bidding' },
  { key: 'AWARDED', label: 'Awarded' }
];

const getStageState = (stageKey: string, currentStatus: string) => {
  const statusStr = String(currentStatus || '').toUpperCase();
  let currentRank = 1;
  if (statusStr === 'DRAFT') currentRank = 0;
  else if (statusStr === 'PUBLISHED') currentRank = 1;
  else if (['OPEN_FOR_BIDDING', 'OPEN', 'TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'FINANCIAL_EVALUATION', 'L1_GENERATED', 'UNDER_EVALUATION'].includes(statusStr)) currentRank = 2;
  else if (['AWARDED', 'CLOSED', 'AWARD_RECOMMENDED'].includes(statusStr)) currentRank = 3;

  let targetRank = 1;
  if (stageKey === 'PUBLISHED') targetRank = 1;
  else if (stageKey === 'BIDDING') targetRank = 2;
  else if (stageKey === 'AWARDED') targetRank = 3;

  if (currentRank > targetRank) return 'COMPLETED';
  if (currentRank === targetRank) return 'ACTIVE';
  return 'PENDING';
};

const FIELD_LABELS: Record<string, string> = {
  offeredItemDescription: 'Offered Item Description',
  complianceRemarks: 'Compliance Remarks',
  warrantyDetails: 'Warranty Details',
  serviceSupport: 'Service Support',
  deliveryTimeline: 'Delivery Timeline',
  deviation: 'Deviations',
  deviations: 'Deviations',
  rfqNotes: 'RFQ Notes',
  makeBrand: 'Make / Brand',
  model: 'Model Number',
  modelNumber: 'Model Number',
  paymentTerms: 'Payment Terms',
  terms: 'Terms & Conditions',
  specs: 'Specifications',
  notes: 'Additional Notes',
};

function formatKeyToLabel(key: string): string {
  if (FIELD_LABELS[key]) return FIELD_LABELS[key];
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/_/g, ' ')
    .replace(/^\w/, (c) => c.toUpperCase())
    .trim();
}

function parseTechnicalCompliance(rawInput?: string): {
  isJson: boolean;
  rawText: string;
  fields: Array<{ key: string; label: string; value: string }>;
  extractedMakeBrand?: string;
  extractedModel?: string;
} {
  if (!rawInput || typeof rawInput !== 'string' || !rawInput.trim()) {
    return { isJson: false, rawText: '', fields: [] };
  }

  const trimmed = rawInput.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        const fields: Array<{ key: string; label: string; value: string }> = [];
        let extractedMakeBrand: string | undefined;
        let extractedModel: string | undefined;

        for (const [key, val] of Object.entries(parsed)) {
          if (
            val === null ||
            val === undefined ||
            (typeof val === 'string' && val.trim() === '') ||
            (Array.isArray(val) && val.length === 0)
          ) {
            continue;
          }

          const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val).trim();
          if (!strVal) continue;

          if (key === 'makeBrand') extractedMakeBrand = strVal;
          if (key === 'model' || key === 'modelNumber') extractedModel = strVal;

          fields.push({
            key,
            label: formatKeyToLabel(key),
            value: strVal,
          });
        }

        return {
          isJson: true,
          rawText: trimmed,
          fields,
          extractedMakeBrand,
          extractedModel,
        };
      }
    } catch {
      // Fallthrough to plain text fallback
    }
  }

  return {
    isJson: false,
    rawText: trimmed,
    fields: [],
  };
}

export default function BidDetailsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const pathname = usePathname() || '';
  const bidId = pathname.split('/')[2];
  const [bid, setBid] = useState<ProcurementBid | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const participateHref = user ? `/bids/${bidId}/participate` : `/login?returnUrl=${encodeURIComponent(`/bids/${bidId}/participate`)}`;
  const isPendingApproval = bid?.approvalStatus === 'PENDING' || bid?.approvalStatus === 'DRAFT';
  const [selectedParticipation, setSelectedParticipation] = useState<any | null>(null);
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [isCompareMode, setIsCompareMode] = useState(false);
  const [selectedForCompare, setSelectedForCompare] = useState<number[]>([]);
  const [showCompareModal, setShowCompareModal] = useState(false);
  const [acceptModalParticipation, setAcceptModalParticipation] = useState<any | null>(null);
  const [accepting, setAccepting] = useState(false);
  const [awardSuccessInfo, setAwardSuccessInfo] = useState<{
    sellerName: string;
    poId?: string | number;
    poNumber?: string;
    bidTitle: string;
  } | null>(null);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('seller_responses_view_mode') as 'grid' | 'list';
      if (saved === 'grid' || saved === 'list') {
        setViewMode(saved);
      }
    }
  }, []);

  const handleViewModeChange = (mode: 'grid' | 'list') => {
    setViewMode(mode);
    if (typeof window !== 'undefined') {
      localStorage.setItem('seller_responses_view_mode', mode);
    }
  };

  const toggleSelectForCompare = (id: number) => {
    setSelectedForCompare((prev) => {
      if (prev.includes(id)) {
        return prev.filter((item) => item !== id);
      }
      if (prev.length >= 4) {
        toast.info('You can select up to 4 sellers for comparison.');
        return prev;
      }
      return [...prev, id];
    });
  };

  const isOwner = useMemo(() => {
    if (!bid || !user) return false;
    return user.role === 'buyer' && Number(bid.buyerId) === Number(user.id);
  }, [bid, user]);

  const handleAcceptQuotation = async (p: any) => {
    if (!bid || !p) return;
    try {
      setAccepting(true);
      const sellerName = p.seller?.organization?.organizationName || p.sellerName || p.seller?.name || `Seller #${p.sellerId}`;
      const targetPartId = Number(p.id || p.participationId);
      const res = await procurementBidApi.recommendAward(bid.id, {
        participationId: targetPartId,
        remarks: `Accepted quotation from ${sellerName}`
      });
      setAcceptModalParticipation(null);
      setAwardSuccessInfo({
        sellerName,
        poId: res?.poId || res?.purchaseOrder?.id,
        poNumber: res?.poNumber || res?.purchaseOrder?.poNumber,
        bidTitle: bid.title
      });
      toast.success(`Quotation accepted! Awarded to ${sellerName}.`);
      await loadBid();
    } catch (err: any) {
      toast.error(err instanceof Error ? err.message : 'Failed to accept quotation');
    } finally {
      setAccepting(false);
    }
  };

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

    return Array.from(uniqueSellersMap.values()).sort((a, b) => {
      const aTime = new Date(a.submittedAt || a.createdAt || 0).getTime();
      const bTime = new Date(b.submittedAt || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }, [bid]);

  const isBidAwarded = useMemo(() => {
    if (!bid) return false;
    if (['AWARDED', 'AWARD_RECOMMENDED'].includes(String(bid.status))) return true;
    return submittedParticipations.some((p: any) => p.finalStatus === 'AWARDED' || p.award || ((bid as any).awardedParticipationId && Number((bid as any).awardedParticipationId) === Number(p.id)));
  }, [bid, submittedParticipations]);

  const loadBid = React.useCallback(() => {
    let alive = true;
    setLoading(true);
    setError('');

    procurementBidApi.detail(bidId)
      .then((bidData) => {
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
        }
      })
      .catch((err: any) => {
        if (!alive) return;
        setBid(null);
        setError(err?.message || 'Unable to load bid details right now.');
      })
      .finally(() => { if (alive) setLoading(false); });
      
    return () => { alive = false; };
  }, [bidId, user?.role, router]);

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
              <span className="mr-1.5">🔒</span> Pending Approval
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
          </div>
        </div>
      )}

      {/* Seller Responses Section */}
      <div className="space-y-4 relative">
        {/* Section Header with Grid / List View Switcher & Compare Toggle */}
        <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-2xl border border-slate-200 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600 border border-indigo-100">
              <Users className="h-4.5 w-4.5" />
            </span>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-slate-900">
                Seller Responses ({submittedParticipations.length})
              </h2>
              <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
                Review submitted seller quotations and technical details.
              </p>
            </div>
          </div>

          {/* Action Bar: Compare Button & View Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            {/* Compare Toggle Button */}
            <button
              type="button"
              onClick={() => {
                if (isCompareMode && selectedForCompare.length >= 2) {
                  setShowCompareModal(true);
                } else {
                  setIsCompareMode(!isCompareMode);
                }
              }}
              className={cn(
                "flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-extrabold transition-all duration-200 border shadow-2xs",
                isCompareMode
                  ? "bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-indigo-600/10"
                  : "bg-white text-slate-700 border-slate-200 hover:bg-slate-50"
              )}
            >
              <Columns3 className="h-4 w-4" />
              <span>
                {isCompareMode
                  ? selectedForCompare.length >= 2
                    ? `Compare (${selectedForCompare.length})`
                    : `Compare Mode (${selectedForCompare.length}/4)`
                  : "Compare"}
              </span>
            </button>

            {isCompareMode && (
              <>
                {selectedForCompare.length >= 2 && (
                  <button
                    type="button"
                    onClick={() => setShowCompareModal(true)}
                    className="flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-1.5 text-xs font-black text-white hover:bg-emerald-700 transition shadow-2xs"
                  >
                    <CheckSquare className="h-3.5 w-3.5" />
                    <span>Compare Now ({selectedForCompare.length})</span>
                  </button>
                )}

                {selectedForCompare.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedForCompare([])}
                    className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-100 transition"
                  >
                    Clear
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => {
                    setIsCompareMode(false);
                    setSelectedForCompare([]);
                  }}
                  className="rounded-xl border border-slate-200 bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200 transition"
                >
                  Exit
                </button>
              </>
            )}

            {/* Grid / List View Toggle */}
            <div className="flex items-center rounded-xl bg-slate-100 p-1 border border-slate-200/80">
              <button
                type="button"
                onClick={() => handleViewModeChange('grid')}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200",
                  viewMode === 'grid'
                    ? "bg-white text-indigo-600 shadow-xs font-black"
                    : "text-slate-500 hover:text-slate-800"
                )}
                title="Grid View"
              >
                <LayoutGrid className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">Grid</span>
              </button>
              <button
                type="button"
                onClick={() => handleViewModeChange('list')}
                className={cn(
                  "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all duration-200",
                  viewMode === 'list'
                    ? "bg-white text-indigo-600 shadow-xs font-black"
                    : "text-slate-500 hover:text-slate-800"
                )}
                title="List View"
              >
                <List className="h-3.5 w-3.5" />
                <span className="hidden sm:inline">List</span>
              </button>
            </div>
          </div>
        </div>

        {submittedParticipations.length === 0 ? (
          <div className="text-center py-16 rounded-2xl border border-dashed border-slate-200 bg-white p-8">
            <Users className="mx-auto h-12 w-12 text-slate-350 stroke-[1.5]" />
            <h3 className="mt-4 text-base font-black text-slate-900">No seller responses received yet.</h3>
            <p className="mt-1 text-xs text-slate-500 font-semibold">We will show participating sellers here once they submit their bids.</p>
          </div>
        ) : viewMode === 'grid' ? (
          /* Grid View Layout */
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
              const isSelected = selectedForCompare.includes(p.id);

              const rawQuoted = p.totalAmount || p.quotedAmount || p.responseData?.totalAmount || p.responseData?.quotedAmount || p.responseData?.totalPrice;
              const calculatedTotal = rawLineItems.reduce((acc: number, item: any) => {
                const qty = Number(item.quantity || 1);
                const price = Number(item.unitPrice || item.price || item.unitRate || 0);
                const tax = Number(item.gstPercent || item.taxPercent || 0);
                const lineVal = qty * price;
                const lineTax = lineVal * (tax / 100);
                return acc + lineVal + lineTax;
              }, 0);
              const displayTotalAmount = rawQuoted || (calculatedTotal > 0 ? calculatedTotal : 0);

              const isThisAwarded = p.finalStatus === 'AWARDED' || p.award || ((bid as any)?.awardedParticipationId && Number((bid as any).awardedParticipationId) === Number(p.id));
              const isThisRejected = p.finalStatus === 'NOT_SELECTED' || p.finalStatus === 'REJECTED' || (isBidAwarded && !isThisAwarded);

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (isCompareMode) toggleSelectForCompare(p.id);
                  }}
                  className={cn(
                    "rounded-2xl border bg-white p-5 shadow-xs flex flex-col justify-between hover:shadow-md transition-all duration-300 relative",
                    isCompareMode ? "cursor-pointer select-none" : "",
                    isSelected ? "border-indigo-600 ring-2 ring-indigo-600/20 bg-indigo-50/10" : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  <div className="space-y-3.5">
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex items-start gap-2.5 min-w-0">
                        {isCompareMode && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleSelectForCompare(p.id);
                            }}
                            className={cn(
                              "mt-0.5 flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold transition-all shrink-0",
                              isSelected
                                ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                                : "bg-white border-slate-300 text-transparent hover:border-indigo-400"
                            )}
                          >
                            ✓
                          </button>
                        )}
                        <div className="min-w-0">
                          <h3 className="text-sm font-black text-slate-950 line-clamp-1">{sellerName}</h3>
                          <p className="text-[11px] font-extrabold text-slate-500 mt-0.5 flex items-center gap-1">
                            <User2 className="h-3 w-3 text-indigo-600" />
                            <span>{contactPerson || 'Seller Representative'}</span>
                          </p>
                        </div>
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
                        {displayTotalAmount ? (
                          <span className="font-black text-slate-950 text-xs">{money(displayTotalAmount)}</span>
                        ) : (
                          <span className="font-bold text-slate-400 text-xs">N/A</span>
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
                      {isThisAwarded ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-xs font-black text-emerald-700 shadow-2xs">
                          🏆 Awarded
                        </span>
                      ) : isThisRejected ? (
                        <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2.5 py-1 text-xs font-bold text-slate-500">
                          Not Selected
                        </span>
                      ) : (
                        <StatusBadge label={techStatus} />
                      )}
                    </div>
                  </div>

                  <div className="pt-4 mt-4 border-t border-slate-100 flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedParticipation(p)}
                      className="flex-1 inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-50 transition shadow-xs"
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5 text-indigo-600" /> View Quotation Details
                    </button>
                    {isThisAwarded ? (
                      <span className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-2xs shrink-0">
                        🏆 Awarded
                      </span>
                    ) : isBidAwarded ? (
                      <span className="inline-flex h-9 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 px-3 text-xs font-bold text-slate-400 shrink-0">
                        Not Selected
                      </span>
                    ) : isOwner ? (
                      <button
                        type="button"
                        onClick={() => setAcceptModalParticipation(p)}
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-4 text-xs font-black text-white hover:bg-emerald-700 transition shadow-xs shrink-0"
                      >
                        Accept Quotation
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          /* List View Layout */
          <div className="space-y-3">
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
              const isSelected = selectedForCompare.includes(p.id);

              const rawQuoted = p.totalAmount || p.quotedAmount || p.responseData?.totalAmount || p.responseData?.quotedAmount || p.responseData?.totalPrice;
              const calculatedTotal = rawLineItems.reduce((acc: number, item: any) => {
                const qty = Number(item.quantity || 1);
                const price = Number(item.unitPrice || item.price || item.unitRate || 0);
                const tax = Number(item.gstPercent || item.taxPercent || 0);
                const lineVal = qty * price;
                const lineTax = lineVal * (tax / 100);
                return acc + lineVal + lineTax;
              }, 0);
              const displayTotalAmount = rawQuoted || (calculatedTotal > 0 ? calculatedTotal : 0);

              const isThisAwarded = p.finalStatus === 'AWARDED' || p.award || ((bid as any)?.awardedParticipationId && Number((bid as any).awardedParticipationId) === Number(p.id));
              const isThisRejected = p.finalStatus === 'NOT_SELECTED' || p.finalStatus === 'REJECTED' || (isBidAwarded && !isThisAwarded);

              return (
                <div
                  key={p.id}
                  onClick={() => {
                    if (isCompareMode) toggleSelectForCompare(p.id);
                  }}
                  className={cn(
                    "rounded-2xl border bg-white p-4 shadow-2xs hover:shadow-md transition-all duration-300 flex flex-col lg:flex-row lg:items-center justify-between gap-4",
                    isCompareMode ? "cursor-pointer select-none" : "",
                    isSelected ? "border-indigo-600 ring-2 ring-indigo-600/20 bg-indigo-50/10" : "border-slate-200 hover:border-slate-300"
                  )}
                >
                  {/* Checkbox + Seller Details Info Columns */}
                  <div className="flex-1 min-w-0 flex items-center gap-3">
                    {isCompareMode && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleSelectForCompare(p.id);
                        }}
                        className={cn(
                          "flex h-5 w-5 items-center justify-center rounded-md border text-xs font-bold transition-all shrink-0 self-center",
                          isSelected
                            ? "bg-indigo-600 border-indigo-600 text-white shadow-xs"
                            : "bg-white border-slate-300 text-transparent hover:border-indigo-400"
                        )}
                      >
                        ✓
                      </button>
                    )}

                    <div className="flex-1 min-w-0 grid gap-4 sm:grid-cols-2 lg:grid-cols-4 items-center">
                      {/* Col 1: Seller Name & Representative */}
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-black text-slate-950 truncate">{sellerName}</h3>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-600 uppercase shrink-0">
                            {p.participationNumber || `PRT-${p.id}`}
                          </span>
                        </div>
                        <p className="text-[11px] font-extrabold text-slate-500 flex items-center gap-1">
                          <User2 className="h-3 w-3 text-indigo-600 shrink-0" />
                          <span className="truncate">{contactPerson || 'Seller Representative'}</span>
                        </p>
                      </div>

                      {/* Col 2: Email & Mobile */}
                      <div className="min-w-0 space-y-1 text-xs font-semibold text-slate-600">
                        {email && (
                          <p className="flex items-center gap-1.5 truncate">
                            <Mail className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{email}</span>
                          </p>
                        )}
                        {mobile && (
                          <p className="flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span>{mobile}</span>
                          </p>
                        )}
                      </div>

                      {/* Col 3: Submission Date & Documents */}
                      <div className="min-w-0 space-y-1.5 text-xs font-semibold text-slate-600">
                        <p className="flex items-center gap-1.5 text-slate-500">
                          <Clock className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <span className="text-slate-800 font-bold">{formatDateTime(p.submittedAt || p.createdAt)}</span>
                        </p>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-600">
                            📄 {docsCount} {docsCount === 1 ? 'Doc' : 'Docs'}
                          </span>
                          {rawLineItems.length > 0 && (
                            <span className="inline-flex items-center rounded-md bg-indigo-50 text-indigo-700 border border-indigo-100 px-2 py-0.5 text-[10px] font-extrabold">
                              📦 {rawLineItems.length} {rawLineItems.length === 1 ? 'Item' : 'Items'}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Col 4: Status & Quoted Total */}
                      <div className="min-w-0 space-y-1.5">
                        <div className="flex items-center gap-1.5">
                          <Tag className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                          {displayTotalAmount ? (
                            <span className="font-black text-slate-950 text-sm">{money(displayTotalAmount)}</span>
                          ) : (
                            <span className="font-bold text-slate-400 text-xs">N/A</span>
                          )}
                        </div>
                        <div>
                          {isThisAwarded ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-[11px] font-black text-emerald-700 shadow-2xs">
                              🏆 Awarded
                            </span>
                          ) : isThisRejected ? (
                            <span className="inline-flex items-center gap-1 rounded-lg bg-slate-100 border border-slate-200 px-2 py-0.5 text-[11px] font-bold text-slate-500">
                              Not Selected
                            </span>
                          ) : (
                            <StatusBadge label={techStatus} />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Actions Column */}
                  <div className="flex items-center gap-2 shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-4 justify-end" onClick={(e) => e.stopPropagation()}>
                    <button
                      onClick={() => setSelectedParticipation(p)}
                      className="inline-flex h-9 items-center justify-center rounded-xl border border-slate-200 bg-white px-3.5 text-xs font-black text-slate-700 hover:bg-slate-50 transition shadow-2xs whitespace-nowrap"
                    >
                      <Eye className="mr-1.5 h-3.5 w-3.5 text-indigo-600" /> View Quotation Details
                    </button>
                    {isThisAwarded ? (
                      <span className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-3.5 text-xs font-black text-white shadow-2xs shrink-0 whitespace-nowrap">
                        🏆 Awarded
                      </span>
                    ) : isBidAwarded ? (
                      <span className="inline-flex h-9 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 px-3.5 text-xs font-bold text-slate-400 shrink-0 whitespace-nowrap">
                        Not Selected
                      </span>
                    ) : isOwner ? (
                      <button
                        type="button"
                        onClick={() => setAcceptModalParticipation(p)}
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-3.5 text-xs font-black text-white hover:bg-emerald-700 transition shadow-2xs whitespace-nowrap shrink-0"
                      >
                        Accept Quotation
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Floating Bottom Comparison Bar */}
        {isCompareMode && selectedForCompare.length > 0 && !showCompareModal && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[9000] flex items-center gap-3 rounded-2xl bg-slate-900 px-5 py-3 text-white shadow-2xl border border-slate-800 animate-in slide-in-from-bottom-5 duration-200">
            <span className="text-xs font-black text-indigo-300">
              {selectedForCompare.length} / 4 Selected
            </span>
            <span className="text-slate-700">|</span>
            <button
              type="button"
              disabled={selectedForCompare.length < 2}
              onClick={() => setShowCompareModal(true)}
              className={cn(
                "inline-flex h-8 items-center justify-center rounded-xl px-4 text-xs font-black transition",
                selectedForCompare.length >= 2
                  ? "bg-indigo-600 text-white hover:bg-indigo-500 shadow-sm"
                  : "bg-slate-800 text-slate-500 cursor-not-allowed border border-slate-700"
              )}
            >
              <Columns3 className="mr-1.5 h-3.5 w-3.5" />
              Compare Now {selectedForCompare.length < 2 && "(Select 2 to compare)"}
            </button>
            <button
              type="button"
              onClick={() => setSelectedForCompare([])}
              className="text-xs font-bold text-slate-400 hover:text-white transition ml-1"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Side-by-Side Commercial Quotation Comparison Modal */}
      {showCompareModal && selectedForCompare.length >= 2 && (() => {
        const selectedParticipationsList = submittedParticipations.filter((p: any) => selectedForCompare.includes(p.id));

        const getParticipationNormalized = (p: any) => {
          const responseData = p.responseData || {};
          const sellerName = p.seller?.organization?.organizationName || p.sellerName || p.seller?.name || `Seller #${p.sellerId}`;
          const contactPerson = p.seller?.name || p.sellerName || 'Seller Representative';
          const email = p.seller?.email || responseData.contactEmail || '-';
          const mobile = p.seller?.mobile || responseData.contactPhone || '-';
          const techStatus = p.technicalStatus || p.submissionStatus;
          const isQualified = techStatus === 'QUALIFIED' || techStatus === 'Qualified';

          const rawLineItems: any[] = Array.isArray(p.lineItems) && p.lineItems.length > 0
            ? p.lineItems
            : (Array.isArray(responseData.lineItems) ? responseData.lineItems : []);

          const parsedLineItems = rawLineItems.map((item: any, i: number) => {
            const description = String(item.itemName || item.itemDescription || item.title || item.name || `Item ${i + 1}`).trim();
            const quantity = Number(item.quantity || item.qty || 1);
            const unit = String(item.unit || item.uom || 'Unit');
            const unitPrice = Number(item.unitPrice || item.price || item.unitRate || 0);
            const gstPercent = Number(item.gstPercent || item.taxPercent || item.gst || 0);
            const lineVal = quantity * unitPrice;
            const taxAmount = lineVal * (gstPercent / 100);
            const totalLineAmount = Number(item.totalAmount || item.totalPrice || (lineVal + taxAmount));
            const makeBrand = String(item.makeBrand || item.brand || responseData.makeBrand || p.makeBrand || '-');
            const model = String(item.model || responseData.model || p.model || '-');
            return {
              id: item.id || `item-${i}`,
              description,
              quantity,
              unit,
              unitPrice,
              gstPercent,
              taxAmount,
              totalLineAmount,
              makeBrand,
              model,
            };
          });

          const calculatedTotal = parsedLineItems.reduce((acc: number, item: any) => acc + item.totalLineAmount, 0);

          const displayTotalAmount = p.totalAmount || p.quotedAmount || (calculatedTotal > 0 ? calculatedTotal : 0);
          const deliveryTimeline = p.deliveryTimeline || responseData.deliveryTimeline || p.deliverySchedule || '-';
          const terms = p.terms || responseData.terms || p.paymentTerms || '-';

          const parsedTech = parseTechnicalCompliance(p.offeredItemDescription);
          const displayMakeBrand = p.makeBrand || responseData.makeBrand || parsedTech.extractedMakeBrand || '-';
          const displayModel = p.model || responseData.model || parsedTech.extractedModel || '-';

          const normalizeDoc = (d: any, idx: number) => ({
            id: d.id || `rdoc-${p.id}-${idx}`,
            documentName: d.documentName || d.name || d.fileName || `Document ${idx + 1}`,
            fileName: d.fileName || d.name || 'file.pdf',
            fileUrl: d.fileUrl || d.url || null,
            fileAssetId: d.fileAssetId || null,
            mimeType: d.mimeType || 'application/pdf',
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
              mimeType: 'application/pdf',
            });
          }

          const getTechField = (keyName: string) => {
            const found = parsedTech.fields.find((f) => f.key.toLowerCase() === keyName.toLowerCase());
            if (found && found.value) return found.value;
            if (responseData[keyName]) return String(responseData[keyName]);
            if (p[keyName]) return String(p[keyName]);
            return '-';
          };

          return {
            id: p.id,
            p,
            sellerName,
            contactPerson,
            email,
            mobile,
            techStatus,
            isQualified,
            displayTotalAmount,
            deliveryTimeline,
            terms,
            submittedAt: p.submittedAt || p.createdAt,
            displayMakeBrand,
            displayModel,
            docs,
            parsedLineItems,
            offeredItemDescription: parsedTech.fields.find(f => f.key === 'offeredItemDescription')?.value || (parsedTech.isJson ? '-' : (parsedTech.rawText || '-')),
            complianceRemarks: getTechField('complianceRemarks'),
            warrantyDetails: getTechField('warrantyDetails'),
            serviceSupport: getTechField('serviceSupport'),
            deviations: getTechField('deviations') !== '-' ? getTechField('deviations') : getTechField('deviation'),
          };
        };

        const rawSellersData = selectedParticipationsList.map(getParticipationNormalized);

        // Rank sellers ascending by total quoted amount (L1, L2, L3...)
        const sellersData = [...rawSellersData].sort((a, b) => {
          const valA = Number(a.displayTotalAmount) || Infinity;
          const valB = Number(b.displayTotalAmount) || Infinity;
          return valA - valB;
        });

        const lowestQuotedTotal = sellersData.length > 0 ? (Number(sellersData[0].displayTotalAmount) || 0) : 0;
        const secondLowestQuotedTotal = sellersData.length > 1 ? (Number(sellersData[1].displayTotalAmount) || 0) : lowestQuotedTotal;
        const l1SavingsVal = Math.max(0, secondLowestQuotedTotal - lowestQuotedTotal);
        const l1SavingsPct = secondLowestQuotedTotal > 0 ? ((l1SavingsVal / secondLowestQuotedTotal) * 100).toFixed(1) : '0';

        sellersData.forEach((s: any, idx: number) => {
          s.rankIndex = idx + 1;
          s.rankBadge = `L${idx + 1}`;
          s.isL1 = idx === 0;
          const currAmount = Number(s.displayTotalAmount) || 0;
          if (s.isL1) {
            s.diffVsL1Amount = 0;
            s.diffVsL1Pct = 0;
            s.diffVsL1Text = 'Base L1 (Lowest Bid)';
          } else {
            s.diffVsL1Amount = currAmount - lowestQuotedTotal;
            s.diffVsL1Pct = lowestQuotedTotal > 0 ? (((currAmount - lowestQuotedTotal) / lowestQuotedTotal) * 100).toFixed(1) : 0;
            s.diffVsL1Text = `+${money(s.diffVsL1Amount)} (+${s.diffVsL1Pct}%)`;
          }
        });

        // Extract unified line items across all sellers & requirement items
        const unifiedItemNames: string[] = [];
        sellersData.forEach(s => {
          s.parsedLineItems.forEach((li: any) => {
            if (li.description && !unifiedItemNames.includes(li.description)) {
              unifiedItemNames.push(li.description);
            }
          });
        });
        if (unifiedItemNames.length === 0 && Array.isArray((bid as any)?.items) && (bid as any).items.length > 0) {
          (bid as any).items.forEach((it: any) => {
            const name = String(it.title || it.itemName || it.description || 'Quoted Item').trim();
            if (name && !unifiedItemNames.includes(name)) unifiedItemNames.push(name);
          });
        }

        const normalizeStr = (str: any) => String(str || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');

        const sections = [
          {
            section: 'Commercial Overview & L1 Ranking',
            items: [
              {
                key: 'rankBadge',
                label: 'Commercial Rank',
                getValue: (s: any) => s.rankBadge,
                renderCustom: (s: any) => (
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "px-2.5 py-1 rounded-md text-xs font-black uppercase tracking-wide border shadow-2xs",
                      s.isL1 ? "bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-400/30" :
                      s.rankIndex === 2 ? "bg-blue-100 text-blue-800 border-blue-300" :
                      s.rankIndex === 3 ? "bg-indigo-100 text-indigo-800 border-indigo-300" :
                      "bg-slate-100 text-slate-700 border-slate-300"
                    )}>
                      {s.isL1 ? '🥇 L1 (Lowest Bidder)' : s.rankIndex === 2 ? '🥈 L2' : s.rankIndex === 3 ? '🥉 L3' : `L${s.rankIndex}`}
                    </span>
                  </div>
                )
              },
              { key: 'sellerName', label: 'Organization Name', getValue: (s: any) => s.sellerName },
              { key: 'contactPerson', label: 'Contact Person', getValue: (s: any) => s.contactPerson },
              { key: 'email', label: 'Email Address', getValue: (s: any) => s.email },
              { key: 'mobile', label: 'Mobile Number', getValue: (s: any) => s.mobile },
              {
                key: 'quotedAmount',
                label: 'Quoted Total Amount',
                getValue: (s: any) => s.displayTotalAmount ? money(s.displayTotalAmount) : 'N/A',
                renderCustom: (s: any) => (
                  <div className="space-y-1">
                    <div className="text-sm font-black text-slate-900">
                      {s.displayTotalAmount ? money(s.displayTotalAmount) : 'N/A'}
                    </div>
                    {s.isL1 ? (
                      <span className="inline-flex items-center gap-1 rounded bg-emerald-100 border border-emerald-300 px-2 py-0.5 text-[10px] font-black text-emerald-800 uppercase">
                        ✓ Lowest Quote (L1)
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">
                        {s.diffVsL1Text}
                      </span>
                    )}
                  </div>
                )
              },
              {
                key: 'priceDiffVsL1',
                label: 'Price Variance vs L1',
                getValue: (s: any) => s.diffVsL1Text,
                renderCustom: (s: any) => (
                  <span className={cn(
                    "text-xs font-bold",
                    s.isL1 ? "text-emerald-700 font-extrabold" : "text-amber-700"
                  )}>
                    {s.diffVsL1Text}
                  </span>
                )
              },
              { key: 'deliveryTimeline', label: 'Delivery Schedule', getValue: (s: any) => s.deliveryTimeline },
              { key: 'submittedAt', label: 'Quotation Submission Date', getValue: (s: any) => formatDateTime(s.submittedAt) },
              {
                key: 'techStatus',
                label: 'Technical Status',
                getValue: (s: any) => s.techStatus,
                renderCustom: (s: any) => <StatusBadge label={s.techStatus} />
              },
            ]
          },
          ...(unifiedItemNames.length > 0 ? [
            {
              section: 'Item-Wise Commercial Breakdown',
              items: unifiedItemNames.flatMap((itemName, idx) => {
                const unitPrices = sellersData.map(s => {
                  const line = s.parsedLineItems.find((li: any) => normalizeStr(li.description) === normalizeStr(itemName));
                  return line && line.unitPrice > 0 ? line.unitPrice : null;
                }).filter((p): p is number => p !== null);
                const minUnitPrice = unitPrices.length > 0 ? Math.min(...unitPrices) : null;

                return [
                  {
                    key: `item_unit_price_${idx}`,
                    label: `${itemName} — Unit Price (Excl. Tax)`,
                    getValue: (s: any) => {
                      const line = s.parsedLineItems.find((li: any) => normalizeStr(li.description) === normalizeStr(itemName));
                      return line && line.unitPrice > 0 ? money(line.unitPrice) : '-';
                    },
                    renderCustom: (s: any) => {
                      const line = s.parsedLineItems.find((li: any) => normalizeStr(li.description) === normalizeStr(itemName));
                      if (!line || !line.unitPrice) return <span className="text-slate-400">-</span>;
                      const isLowest = minUnitPrice !== null && line.unitPrice === minUnitPrice;
                      return (
                        <div className="space-y-0.5">
                          <span className="font-extrabold text-slate-900">{money(line.unitPrice)}</span>
                          {isLowest && sellersData.length > 1 && (
                            <span className="ml-2 inline-flex items-center rounded bg-emerald-100 border border-emerald-300 px-1.5 py-0.2 text-[9px] font-black text-emerald-800 uppercase">
                              L1 Rate
                            </span>
                          )}
                        </div>
                      );
                    }
                  },
                  {
                    key: `item_qty_tax_${idx}`,
                    label: `${itemName} — Quoted Qty & GST %`,
                    getValue: (s: any) => {
                      const line = s.parsedLineItems.find((li: any) => normalizeStr(li.description) === normalizeStr(itemName));
                      if (!line) return '-';
                      return `${line.quantity} ${line.unit} (GST: ${line.gstPercent}%)`;
                    }
                  },
                  {
                    key: `item_line_total_${idx}`,
                    label: `${itemName} — Total Line Item Amount`,
                    getValue: (s: any) => {
                      const line = s.parsedLineItems.find((li: any) => normalizeStr(li.description) === normalizeStr(itemName));
                      return line && line.totalLineAmount > 0 ? money(line.totalLineAmount) : '-';
                    },
                    renderCustom: (s: any) => {
                      const line = s.parsedLineItems.find((li: any) => normalizeStr(li.description) === normalizeStr(itemName));
                      if (!line || !line.totalLineAmount) return <span className="text-slate-400">-</span>;
                      return <span className="font-extrabold text-slate-950">{money(line.totalLineAmount)}</span>;
                    }
                  }
                ];
              })
            }
          ] : []),
          {
            section: 'Commercial & Payment Terms',
            items: [
              { key: 'deliveryTimeline', label: 'Delivery Schedule / Timeline', getValue: (s: any) => s.deliveryTimeline },
              { key: 'terms', label: 'Payment Terms & Conditions', getValue: (s: any) => s.terms },
              { key: 'warrantyDetails', label: 'Warranty & Service Support Terms', getValue: (s: any) => s.warrantyDetails },
            ]
          },
          {
            section: 'Technical Specifications & Product Compliance',
            items: [
              { key: 'makeBrand', label: 'Make / Brand', getValue: (s: any) => s.displayMakeBrand },
              { key: 'model', label: 'Model Number', getValue: (s: any) => s.displayModel },
              { key: 'offeredItemDescription', label: 'Offered Item Description', getValue: (s: any) => s.offeredItemDescription },
              { key: 'complianceRemarks', label: 'Compliance Remarks', getValue: (s: any) => s.complianceRemarks },
              { key: 'serviceSupport', label: 'Service Support Details', getValue: (s: any) => s.serviceSupport },
              { key: 'deviations', label: 'Technical Deviations', getValue: (s: any) => s.deviations },
            ]
          },
          {
            section: 'Submitted Documents & Attachments',
            items: [
              {
                key: 'documents',
                label: 'Submitted Documents',
                getValue: (s: any) => `${s.docs.length} docs`,
                renderCustom: (s: any) => (
                  <div className="space-y-1.5">
                    <span className="text-[10px] font-bold text-slate-500 block">📄 {s.docs.length} {s.docs.length === 1 ? 'Document' : 'Documents'}</span>
                    {s.docs.map((doc: any) => (
                      <div key={doc.id} className="flex items-center justify-between gap-1.5 p-1.5 rounded-lg bg-slate-50 border border-slate-200/80 text-[11px]">
                        <span className="truncate font-semibold text-slate-700 max-w-[140px]" title={doc.documentName}>{doc.documentName}</span>
                        <button
                          type="button"
                          onClick={() => {
                            openFileAsset({
                              id: doc.fileAssetId || null,
                              fileAssetId: doc.fileAssetId || null,
                              originalName: doc.documentName,
                              url: doc.fileUrl,
                              fileUrl: doc.fileUrl,
                            }, doc.documentName).catch(err => {
                              toast.error(err instanceof Error ? err.message : 'Unable to view document');
                            });
                          }}
                          className="text-indigo-600 hover:text-indigo-800 font-extrabold shrink-0 text-[10px] uppercase"
                        >
                          View
                        </button>
                      </div>
                    ))}
                  </div>
                )
              }
            ]
          }
        ];

        const isRowEmpty = (getValueFn: (s: any) => any) => {
          return sellersData.every(s => {
            const val = String(getValueFn(s) || '').trim();
            return !val || val === '-' || val === 'N/A' || val === '0 docs' || val === 'None';
          });
        };

        const activeSections = sections.map(sec => ({
          ...sec,
          items: sec.items.filter(item => !isRowEmpty(item.getValue))
        })).filter(sec => sec.items.length > 0);

        const isRowDifferent = (getValueFn: (s: any) => any) => {
          if (sellersData.length <= 1) return false;
          const firstVal = String(getValueFn(sellersData[0]) || '').trim().toLowerCase();
          return sellersData.some(s => String(getValueFn(s) || '').trim().toLowerCase() !== firstVal);
        };

        return (
          <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-2 sm:p-4 transition-all duration-300 animate-in fade-in">
            <div className="max-h-[94dvh] w-full max-w-7xl overflow-hidden rounded-2xl bg-white shadow-2xl flex flex-col animate-in zoom-in-95 duration-300 border border-slate-200/80">
              
              {/* Light Executive Modal Header */}
              <div className="flex items-center justify-between border-b border-slate-200/80 bg-white px-6 py-4">
                <div className="flex items-center gap-3.5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600 border border-emerald-200/80 shadow-2xs">
                    <Columns3 className="h-5 w-5" />
                  </span>
                  <div>
                    <h2 className="text-lg font-black tracking-tight text-slate-900 flex items-center gap-2.5">
                      <span>Commercial Quotation & L1 Ranking Comparison</span>
                      <span className="rounded-md bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-[10px] font-black text-emerald-700 uppercase tracking-wider shadow-2xs">
                        L1 Evaluated
                      </span>
                    </h2>
                    <p className="text-xs text-slate-500 font-semibold mt-0.5">
                      Comparing {sellersData.length} seller quotations sorted by total quoted amount (L1 lowest bidder).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedForCompare([])}
                    className="rounded-xl border border-slate-200/80 bg-slate-50 px-3.5 py-1.5 text-xs font-extrabold text-slate-700 hover:bg-slate-100 hover:text-slate-900 transition-all duration-200 active:scale-95 shadow-2xs"
                  >
                    Clear Selection
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCompareModal(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/80 bg-slate-50 text-slate-500 hover:bg-red-50 hover:text-red-600 hover:border-red-200 transition-all duration-200 active:scale-95 shadow-2xs"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Modal Matrix Body with Smooth Scroll */}
              <div className="overflow-auto p-4 sm:p-6 flex-1 bg-slate-50/60 scroll-smooth custom-scrollbar">
                
                {/* Clean Light Executive KPI Summary Cards Bar with Hover Lift */}
                <div className="mb-5 grid grid-cols-1 sm:grid-cols-4 gap-3.5">
                  
                  {/* Card 1: L1 Lowest Bidder */}
                  <div className="p-4 bg-gradient-to-br from-emerald-50/90 via-emerald-50/40 to-white rounded-xl border border-emerald-200/80 shadow-xs hover:-translate-y-1 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 ease-out cursor-default">
                    <div className="text-[10px] font-black uppercase text-emerald-700 tracking-wider flex items-center gap-1.5">
                      <span>🥇 L1 Lowest Bidder</span>
                    </div>
                    <div className="text-sm font-black text-slate-900 truncate mt-1">{sellersData[0]?.sellerName || 'N/A'}</div>
                    <div className="text-xs font-black text-emerald-700 mt-0.5">{sellersData[0]?.displayTotalAmount ? money(sellersData[0].displayTotalAmount) : 'N/A'}</div>
                  </div>

                  {/* Card 2: L1 Savings */}
                  <div className="p-4 bg-gradient-to-br from-emerald-50/60 via-emerald-50/20 to-white rounded-xl border border-emerald-150 shadow-xs hover:-translate-y-1 hover:shadow-lg hover:border-emerald-300 transition-all duration-300 ease-out cursor-default">
                    <div className="text-[10px] font-black uppercase text-emerald-700 tracking-wider">💰 L1 Commercial Savings</div>
                    <div className="text-sm font-black text-emerald-800 mt-1">{l1SavingsVal > 0 ? money(l1SavingsVal) : '₹0'}</div>
                    <div className="text-[11px] font-bold text-emerald-600 mt-0.5">{l1SavingsVal > 0 ? `${l1SavingsPct}% lower than L2` : 'Base quote'}</div>
                  </div>

                  {/* Card 3: Price Spread */}
                  <div className="p-4 bg-gradient-to-br from-indigo-50/60 via-indigo-50/20 to-white rounded-xl border border-indigo-150 shadow-xs hover:-translate-y-1 hover:shadow-lg hover:border-indigo-300 transition-all duration-300 ease-out cursor-default">
                    <div className="text-[10px] font-black uppercase text-indigo-700 tracking-wider">📊 Quoted Price Spread</div>
                    <div className="text-xs font-extrabold text-slate-900 mt-1">{money(lowestQuotedTotal)} – {money(sellersData[sellersData.length - 1]?.displayTotalAmount || lowestQuotedTotal)}</div>
                    <div className="text-[11px] font-bold text-indigo-600 mt-0.5">{sellersData.length} Quotations Ranked</div>
                  </div>

                  {/* Card 4: Evaluation Status */}
                  <div className="p-4 bg-gradient-to-br from-amber-50/60 via-amber-50/20 to-white rounded-xl border border-amber-150 shadow-xs hover:-translate-y-1 hover:shadow-lg hover:border-amber-300 transition-all duration-300 ease-out cursor-default">
                    <div className="text-[10px] font-black uppercase text-amber-700 tracking-wider">⚡ Commercial Evaluation</div>
                    <div className="text-xs font-extrabold text-slate-900 mt-1">L1 Evaluated & Ranked</div>
                    <div className="text-[11px] font-bold text-amber-700 mt-0.5">Lowest Total Quoted Amount</div>
                  </div>
                </div>

                {/* Table Container with Smooth Horizontal & Vertical Scroll */}
                <div className="min-w-[750px] border border-slate-200/80 rounded-2xl bg-white shadow-xs overflow-x-auto scroll-smooth custom-scrollbar">
                  <table className="w-full border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200">
                        {/* Sticky Left Field Header */}
                        <th className="sticky left-0 bg-slate-50 z-20 w-64 min-w-[240px] p-4 text-left font-black uppercase tracking-wider text-slate-700 border-r border-slate-200 shadow-2xs backdrop-blur-md">
                          Commercial & Technical Field
                        </th>

                        {/* Seller Columns */}
                        {sellersData.map((s: any) => {
                          const isThisAwarded = s.p.finalStatus === 'AWARDED' || s.p.award || ((bid as any)?.awardedParticipationId && Number((bid as any).awardedParticipationId) === Number(s.id));
                          return (
                            <th
                              key={s.id}
                              className={cn(
                                "p-4 text-left min-w-[280px] border-r border-slate-200 last:border-r-0 transition-all duration-200 hover:bg-slate-100/60",
                                s.isL1 ? "bg-emerald-50/70 border-t-4 border-t-emerald-600" : "bg-white/80"
                              )}
                            >
                              <div className="flex items-center justify-between gap-2 border-b border-slate-200/80 pb-2 mb-2">
                                <span className={cn(
                                  "rounded-md px-2.5 py-1 text-[11px] font-black uppercase tracking-wider border shadow-2xs transition-all duration-200",
                                  s.isL1 ? "bg-emerald-600 text-white border-emerald-700 ring-2 ring-emerald-400/30" :
                                  s.rankIndex === 2 ? "bg-blue-50 text-blue-800 border-blue-200" :
                                  s.rankIndex === 3 ? "bg-indigo-50 text-indigo-800 border-indigo-200" :
                                  "bg-slate-100 text-slate-700 border-slate-300"
                                )}>
                                  {s.isL1 ? '🥇 L1 (LOWEST BIDDER)' : s.rankIndex === 2 ? `🥈 L2 (${s.diffVsL1Text})` : `L${s.rankIndex}`}
                                </span>
                                <button
                                  type="button"
                                  onClick={() => {
                                    const next = selectedForCompare.filter((id) => id !== s.id);
                                    setSelectedForCompare(next);
                                    if (next.length < 2) {
                                      setShowCompareModal(false);
                                      toast.info('Comparison closed: at least 2 sellers required.');
                                    }
                                  }}
                                  className="h-6 w-6 rounded-full bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-all duration-200 active:scale-90"
                                  title="Remove from comparison"
                                >
                                  <X className="h-3.5 w-3.5" />
                                </button>
                              </div>
                              <h3 className="text-sm font-black text-slate-950 line-clamp-1">{s.sellerName}</h3>
                              <p className="text-[11px] font-bold text-slate-500 mt-0.5 flex items-center gap-1">
                                <User2 className="h-3 w-3 text-indigo-600" />
                                <span>{s.contactPerson}</span>
                              </p>
                              <div className="pt-2.5">
                                {isThisAwarded ? (
                                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-3 py-1.5 text-xs font-black text-white shadow-2xs">
                                    🏆 Awarded Quotation
                                  </span>
                                ) : isBidAwarded ? (
                                  <span className="inline-flex items-center rounded-md bg-slate-100 border border-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                                    Not Selected
                                  </span>
                                ) : isOwner ? (
                                  <button
                                    type="button"
                                    onClick={() => setAcceptModalParticipation(s.p)}
                                    className={cn(
                                      "inline-flex items-center gap-1 rounded-lg px-3.5 py-1.5 text-xs font-black text-white transition-all duration-200 active:scale-95 shadow-2xs hover:shadow-md",
                                      s.isL1 ? "bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400/30 hover:scale-[1.03]" : "bg-indigo-600 hover:bg-indigo-700 hover:scale-[1.03]"
                                    )}
                                  >
                                    Accept Quotation
                                  </button>
                                ) : null}
                              </div>
                            </th>
                          );
                        })}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-200/80">
                      {activeSections.map((sec) => (
                        <React.Fragment key={sec.section}>
                          {/* Section Header Row */}
                          <tr className="bg-slate-100/80 border-t border-b border-slate-200">
                            <td
                              colSpan={sellersData.length + 1}
                              className="px-4 py-2.5 text-[11px] font-black uppercase tracking-wider text-slate-800 bg-slate-100/90 flex items-center gap-2"
                            >
                              <span>{sec.section}</span>
                            </td>
                          </tr>

                          {/* Section Item Rows */}
                          {sec.items.map((item) => {
                            const isDiff = isRowDifferent(item.getValue);
                            return (
                              <tr
                                key={item.key}
                                className={cn(
                                  "transition-all duration-200 ease-in-out group",
                                  isDiff ? "bg-amber-50/20 hover:bg-amber-50/40" : "hover:bg-indigo-50/30"
                                )}
                              >
                                {/* Left Field Label */}
                                <td className="sticky left-0 bg-white group-hover:bg-indigo-50/40 z-10 p-3.5 font-extrabold text-slate-700 border-r border-slate-200 align-top shadow-2xs transition-colors duration-200">
                                  <div className="flex items-center gap-2">
                                    <span>{item.label}</span>
                                    {isDiff && (
                                      <span className="text-[9px] font-black uppercase text-amber-900 bg-gradient-to-r from-amber-100 to-amber-50 px-2 py-0.5 rounded-full border border-amber-300/80 shadow-2xs shrink-0 tracking-wider">
                                        Differs
                                      </span>
                                    )}
                                  </div>
                                </td>

                                {/* Seller Values */}
                                {sellersData.map((s: any) => {
                                  const val = item.getValue(s);
                                  return (
                                    <td
                                      key={s.id}
                                      className={cn(
                                        "p-3.5 text-xs text-slate-800 border-r border-slate-200 last:border-r-0 align-top leading-relaxed whitespace-pre-wrap transition-colors duration-200",
                                        s.isL1 ? "bg-emerald-50/15" : "",
                                        isDiff ? "bg-amber-50/20 font-semibold" : ""
                                      )}
                                    >
                                      {item.renderCustom ? (
                                        item.renderCustom(s)
                                      ) : (
                                        <span>{val || '-'}</span>
                                      )}
                                    </td>
                                  );
                                })}
                              </tr>
                            );
                          })}
                        </React.Fragment>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Light Executive Modal Footer */}
              <div className="border-t border-slate-200/80 p-4 bg-white flex justify-between items-center">
                <p className="text-xs font-bold text-slate-500">
                  Select 2 to 4 seller quotations to evaluate detailed line-item rates, commercial terms, and L1 savings.
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setSelectedForCompare([])}
                    className="px-4 py-2 rounded-xl border border-slate-200 bg-slate-50 text-xs font-black text-slate-700 hover:bg-slate-100 transition-all duration-200 active:scale-95 shadow-2xs"
                  >
                    Clear Selection
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCompareModal(false)}
                    className="px-4 py-2 rounded-xl bg-slate-900 text-xs font-black text-white hover:bg-slate-800 transition-all duration-200 active:scale-95 shadow-2xs"
                  >
                    Close Comparison
                  </button>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

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

        const parsedTech = parseTechnicalCompliance(p.offeredItemDescription);
        const displayMakeBrand = p.makeBrand || responseData.makeBrand || parsedTech.extractedMakeBrand || '-';
        const displayModel = p.model || responseData.model || parsedTech.extractedModel || '-';
        const detailedFields = parsedTech.fields.filter(
          (f) => f.key !== 'makeBrand' && f.key !== 'model' && f.key !== 'modelNumber'
        );

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
                  className="flex h-9 w-9 items-center justify-center rounded-xl border border-white/15 bg-white/10 text-white hover:bg-white/20 transition duration-200"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Modal Body */}
              <div className="overflow-y-auto p-6 space-y-6 max-h-[75dvh] bg-slate-50/40 scroll-smooth">

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
                      {displayTotalAmount ? money(displayTotalAmount) : 'N/A'}
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
                <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4 hover:shadow-md transition-all duration-200">
                  <h3 className="text-xs font-black uppercase tracking-wider text-slate-900 flex items-center gap-2">
                    <FileText className="h-4 w-4 text-indigo-600" /> Product Specifications & Seller Remarks
                  </h3>

                  <div className="grid gap-4 sm:grid-cols-2 text-xs">
                    <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 transition">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Make / Brand</span>
                      <p className="font-extrabold text-slate-800 mt-1">{displayMakeBrand}</p>
                    </div>
                    <div className="bg-slate-50/80 p-3.5 rounded-xl border border-slate-100 hover:border-slate-200 transition">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Model Number</span>
                      <p className="font-extrabold text-slate-800 mt-1">{displayModel}</p>
                    </div>
                  </div>

                  {p.offeredItemDescription && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block mb-1">
                        Detailed Description / Technical Compliance:
                      </span>

                      {parsedTech.isJson ? (
                        detailedFields.length > 0 ? (
                          <div className="grid gap-3 sm:grid-cols-1 md:grid-cols-2">
                            {detailedFields.map((field) => {
                              const isFullWidth =
                                field.key === 'offeredItemDescription' ||
                                field.key === 'complianceRemarks' ||
                                field.key === 'rfqNotes' ||
                                field.value.length > 60;
                              return (
                                <div
                                  key={field.key}
                                  className={cn(
                                    "bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80 hover:border-indigo-200 hover:bg-slate-50 transition-all duration-200 shadow-2xs",
                                    isFullWidth ? "md:col-span-2" : ""
                                  )}
                                >
                                  <span className="text-[10px] font-black uppercase tracking-wider text-[#12335f] block">
                                    {field.label}
                                  </span>
                                  <p className="text-xs font-semibold text-slate-800 mt-1 leading-relaxed whitespace-pre-wrap">
                                    {field.value}
                                  </p>
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200 text-xs font-medium text-slate-500 italic">
                            No specific technical remarks or description populated.
                          </div>
                        )
                      ) : (
                        <div className="bg-slate-50/70 p-4 rounded-xl border border-slate-200 text-xs font-medium text-slate-700 leading-relaxed whitespace-pre-wrap">
                          {parsedTech.rawText}
                        </div>
                      )}
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
                                    toast.info("This document file is not uploaded on the server.");
                                    return;
                                  }
                                  openFileAsset({
                                    id: doc.fileAssetId || null,
                                    fileAssetId: doc.fileAssetId || null,
                                    originalName: fileName,
                                    url: doc.fileUrl || doc.url,
                                    fileUrl: doc.fileUrl || doc.url,
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
                                    toast.info("This document file is not uploaded on the server.");
                                    return;
                                  }
                                  openFileAsset({
                                    id: doc.fileAssetId || null,
                                    fileAssetId: doc.fileAssetId || null,
                                    originalName: fileName,
                                    url: doc.fileUrl || doc.url,
                                    fileUrl: doc.fileUrl || doc.url,
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
                {(() => {
                  const isThisAwarded = p.finalStatus === 'AWARDED' || p.award || ((bid as any)?.awardedParticipationId && Number((bid as any).awardedParticipationId) === Number(p.id));
                  if (isThisAwarded) {
                    return (
                      <span className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-4 text-xs font-black text-white shadow-2xs">
                        🏆 Awarded
                      </span>
                    );
                  }
                  if (isBidAwarded) {
                    return (
                      <span className="inline-flex h-9 items-center justify-center rounded-xl bg-slate-100 border border-slate-200 px-4 text-xs font-bold text-slate-400">
                        Not Selected
                      </span>
                    );
                  }
                  if (isOwner) {
                    return (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedParticipation(null);
                          setAcceptModalParticipation(p);
                        }}
                        className="inline-flex h-9 items-center justify-center rounded-xl bg-emerald-600 px-5 text-xs font-black text-white hover:bg-emerald-700 transition shadow-sm"
                      >
                        Accept Quotation
                      </button>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>
          </div>
        );
      })()}

      {/* Acceptance Confirmation Dialog */}
      {acceptModalParticipation && (() => {
        const p = acceptModalParticipation;
        const sellerName = p.seller?.organization?.organizationName || p.sellerName || p.seller?.name || `Seller #${p.sellerId}`;
        const rawAmount = p.totalAmount || p.quotedAmount || p.responseData?.totalAmount || p.responseData?.quotedAmount;
        const displayTotal = rawAmount && Number(rawAmount) > 0 ? money(rawAmount) : 'N/A';

        return (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
            <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-150 animate-in zoom-in-95 duration-200">
              
              {/* Header */}
              <div className="bg-gradient-to-r from-slate-900 via-[#0b2447] to-indigo-950 px-6 py-4 text-white flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                    🏆
                  </span>
                  <h3 className="text-base font-black text-white">Accept Quotation</h3>
                </div>
                <button
                  onClick={() => setAcceptModalParticipation(null)}
                  className="h-8 w-8 rounded-lg bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              {/* Content */}
              <div className="p-6 space-y-4">
                <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                  Are you sure you want to accept this quotation? This will award the procurement to the selected seller, automatically reject all other submitted quotations for this procurement, and generate a Purchase Order (PO). This action cannot be undone.
                </p>

                <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-2 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-slate-500">Selected Seller:</span>
                    <span className="font-black text-slate-900">{sellerName}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="font-extrabold text-slate-500">Participation No:</span>
                    <span className="font-bold text-slate-700">{p.participationNumber || `PRT-${p.id}`}</span>
                  </div>
                  <div className="flex justify-between items-center border-t border-slate-200 pt-2 mt-1">
                    <span className="font-extrabold text-slate-500">Quoted Total:</span>
                    <span className="font-black text-indigo-700 text-sm">{displayTotal}</span>
                  </div>
                </div>
              </div>

              {/* Footer Actions */}
              <div className="bg-slate-50 p-4 border-t border-slate-150 flex justify-end gap-2.5">
                <button
                  type="button"
                  disabled={accepting}
                  onClick={() => setAcceptModalParticipation(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-100 transition shadow-2xs disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={accepting}
                  onClick={() => handleAcceptQuotation(p)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-xs font-black text-white hover:bg-emerald-700 transition shadow-2xs disabled:opacity-50"
                >
                  {accepting ? (
                    <span>Accepting...</span>
                  ) : (
                    <span>Confirm & Accept Quotation</span>
                  )}
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* Award Success Dialog */}
      {awardSuccessInfo && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-in fade-in">
          <div className="w-full max-w-lg overflow-hidden rounded-2xl bg-white shadow-2xl border border-slate-150 animate-in zoom-in-95 duration-200">
            <div className="bg-gradient-to-r from-emerald-800 via-emerald-700 to-teal-900 px-6 py-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/20 text-white border border-white/20 shadow-inner text-xl">
                  🎉
                </span>
                <div>
                  <h3 className="text-base font-black text-white">Quotation Accepted & Awarded</h3>
                  <p className="text-xs text-emerald-100 font-medium">Purchase Order automatically generated</p>
                </div>
              </div>
              <button
                onClick={() => setAwardSuccessInfo(null)}
                className="h-8 w-8 rounded-lg bg-white/10 text-white hover:bg-white/20 flex items-center justify-center transition"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                The procurement has been successfully awarded to <strong className="text-slate-900">{awardSuccessInfo.sellerName}</strong>. All other submitted seller quotations have been automatically marked as <span className="text-slate-500 font-bold">Not Selected</span>.
              </p>

              <div className="rounded-xl border border-emerald-100 bg-emerald-50/60 p-4 space-y-2 text-xs">
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-slate-500">Procurement:</span>
                  <span className="font-black text-slate-900 truncate max-w-[240px]">{awardSuccessInfo.bidTitle}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="font-extrabold text-slate-500">Winning Seller:</span>
                  <span className="font-black text-emerald-700">{awardSuccessInfo.sellerName}</span>
                </div>
                {awardSuccessInfo.poNumber && (
                  <div className="flex justify-between items-center border-t border-emerald-200/60 pt-2 mt-1">
                    <span className="font-extrabold text-slate-500">Generated PO Number:</span>
                    <span className="font-black text-slate-950 text-sm font-mono">{awardSuccessInfo.poNumber}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="bg-slate-50 p-4 border-t border-slate-150 flex justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setAwardSuccessInfo(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 hover:bg-slate-100 transition shadow-2xs"
              >
                Close
              </button>
              <Link
                href="/orders"
                onClick={() => setAwardSuccessInfo(null)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 text-xs font-black text-white hover:bg-emerald-700 transition shadow-2xs"
              >
                <span>View Purchase Order</span>
              </Link>
            </div>
          </div>
        </div>
      )}

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
