'use client';

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, unwrapApiData } from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';
import { 
  ArrowLeft, ShieldAlert, Award, Star, Info,
  CheckCircle2, AlertTriangle, FileText, BadgePercent, IndianRupee,
  Activity, Users, ChevronRight, HelpCircle, Eye, Download, Printer, X
} from 'lucide-react';
import { PageShell, StatusBadge, ProcurementHero, ProcurementLoadingState, ProcurementErrorState } from '../components';
import { money } from '../data';
import { toast } from 'sonner';
import { procurementBidApi } from '../api';

export default function BidComparisonPage() {
  const params = useParams();
  let bidId = params?.bidId as string;
  
  if (!bidId && typeof window !== 'undefined') {
    const match = window.location.pathname.match(/^\/bids\/([^/]+)\/compare$/);
    if (match) bidId = match[1];
  }
  
  const router = useRouter();
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const authHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [token]);

  const [activeTab, setActiveTab] = useState<'l1' | 'matrix'>('l1');
  const [sortBy, setSortBy] = useState<string>('lowest-price');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Award Modal state
  const [awardModal, setAwardModal] = useState<{
    show: boolean;
    participationId: number;
    sellerName: string;
    rank: number;
    amount: number;
    delivery: string;
    remarks: string;
    confirmed: boolean;
  }>({
    show: false,
    participationId: 0,
    sellerName: '',
    rank: 999,
    amount: 0,
    delivery: '',
    remarks: '',
    confirmed: false
  });

  // Fetch bid details with participations and ratings
  const { data: bid, isLoading, error, refetch } = useQuery({
    queryKey: ['procurement-bid', bidId],
    queryFn: async () => {
      const res = await procurementBidApi.detail(bidId);
      return res as any;
    },
    enabled: !!bidId && !!token,
  });

  // Award Mutation
  const awardMutation = useMutation({
    mutationFn: async ({ participationId, remarks, rank }: { participationId: number; remarks: string; rank: number }) => {
      const body: any = { participationId, remarks };
      if (rank !== 1) {
        body.adminOverrideReason = remarks || 'Override to select optimal rated supplier';
      }
      const res = await api.fetch(`/api/buyer/bids/${bidId}/recommend-award`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...authHeaders
        },
        body: JSON.stringify(body)
      });
      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson?.error || 'Failed to award bid');
      }
      return res.json();
    },
    onSuccess: () => {
      toast.success('Bid awarded successfully and Purchase Order generated!');
      setAwardModal(prev => ({ ...prev, show: false }));
      queryClient.invalidateQueries({ queryKey: ['procurement-bid', bidId] });
      router.push(`/bids/${bidId}`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to award bid');
    }
  });

  const handleOpenAwardModal = (p: any) => {
    const tech = parseTechnicalOffer(p.offeredItemDescription);
    setAwardModal({
      show: true,
      participationId: p.id,
      sellerName: p.seller?.name || `Seller #${p.sellerId}`,
      rank: p.rank || 999,
      amount: p.totalAmount || p.quotedAmount || 0,
      delivery: tech.deliveryTimeline || 'Not specified',
      remarks: p.rank === 1 ? 'Selected based on lowest compliant financial quotation (L1).' : '',
      confirmed: false
    });
  };

  const handleConfirmAward = () => {
    if (!awardModal.confirmed) {
      toast.error('Please check the confirmation box to proceed.');
      return;
    }
    if (awardModal.rank !== 1 && !awardModal.remarks.trim()) {
      toast.error('Award remarks/justification is mandatory when selecting a supplier other than L1.');
      return;
    }
    awardMutation.mutate({
      participationId: awardModal.participationId,
      remarks: awardModal.remarks,
      rank: awardModal.rank
    });
  };

  const handleExport = () => {
    window.print();
    toast.success('Successfully exported comparison report!');
  };

  const getDeliveryDays = (timeline: string) => {
    const match = String(timeline || '').match(/(\d+)/);
    return match ? Number(match[1]) : Infinity;
  };

  const getWarrantyMonths = (warranty: string) => {
    const match = String(warranty || '').match(/(\d+)/);
    if (!match) return 0;
    const val = Number(match[1]);
    if (String(warranty).toLowerCase().includes('year')) {
      return val * 12;
    }
    return val;
  };

  const parseTechnicalOffer = (descString: string) => {
    try {
      if (descString && descString.startsWith('{')) {
        return JSON.parse(descString);
      }
    } catch (e) {
      // Ignore
    }
    return { offeredItemDescription: descString || '' };
  };

  // Filter and Sort participations
  const filteredAndSortedParticipations = useMemo(() => {
    if (!bid || !Array.isArray(bid.participations)) return [];
    
    let items = [...bid.participations];
    
    // 1. Filtering
    if (filterStatus !== 'all') {
      items = items.filter(p => {
        const tech = String(p.technicalStatus || '').toUpperCase();
        const fin = String(p.financialStatus || '').toUpperCase();
        if (filterStatus === 'technically-qualified') return tech === 'QUALIFIED';
        if (filterStatus === 'financially-qualified') return fin === 'QUALIFIED';
        if (filterStatus === 'pending') return tech === 'PENDING' || tech === 'UNDER_REVIEW';
        if (filterStatus === 'shortlisted') return tech === 'SHORTLISTED' || p.finalStatus === 'SHORTLISTED';
        if (filterStatus === 'rejected') return tech === 'DISQUALIFIED' || p.finalStatus === 'REJECTED';
        if (filterStatus === 'clarification') return tech === 'CLARIFICATION_REQUIRED';
        return true;
      });
    }

    // 2. Sorting
    items.sort((a, b) => {
      const aTech = parseTechnicalOffer(a.offeredItemDescription);
      const bTech = parseTechnicalOffer(b.offeredItemDescription);

      if (sortBy === 'lowest-price') {
        return (a.totalAmount || a.quotedAmount || 0) - (b.totalAmount || b.quotedAmount || 0);
      }
      if (sortBy === 'highest-price') {
        return (b.totalAmount || b.quotedAmount || 0) - (a.totalAmount || a.quotedAmount || 0);
      }
      if (sortBy === 'earliest-submission') {
        return new Date(a.submittedAt || a.createdAt).getTime() - new Date(b.submittedAt || b.createdAt).getTime();
      }
      if (sortBy === 'fastest-delivery') {
        return getDeliveryDays(aTech.deliveryTimeline) - getDeliveryDays(bTech.deliveryTimeline);
      }
      if (sortBy === 'highest-rating') {
        return (b.averageRating?.rating || 0) - (a.averageRating?.rating || 0);
      }
      if (sortBy === 'warranty') {
        return getWarrantyMonths(bTech.warrantyDetails) - getWarrantyMonths(aTech.warrantyDetails);
      }
      if (sortBy === 'supplier-name') {
        return String(a.seller?.name || '').localeCompare(String(b.seller?.name || ''));
      }
      return 0;
    });

    return items;
  }, [bid, filterStatus, sortBy]);

  // Global Highlights metrics across all participants
  const highlights = useMemo(() => {
    const list = bid?.participations || [];
    if (list.length === 0) return null;

    const prices = list.map((p: any) => p.totalAmount || p.quotedAmount || 0).filter(v => v > 0);
    const lowestPrice = prices.length ? Math.min(...prices) : 0;
    const highestPrice = prices.length ? Math.max(...prices) : 0;
    const averagePrice = prices.length ? prices.reduce((a, b) => a + b, 0) / prices.length : 0;
    const priceDiff = highestPrice - lowestPrice;

    // Delivery days
    const deliveryDaysList = list.map((p: any) => {
      const tech = parseTechnicalOffer(p.offeredItemDescription);
      return { id: p.id, days: getDeliveryDays(tech.deliveryTimeline) };
    }).filter(d => d.days !== Infinity);
    const minDeliveryDays = deliveryDaysList.length ? Math.min(...deliveryDaysList.map(d => d.days)) : Infinity;

    // Warranty months
    const warrantyMonthsList = list.map((p: any) => {
      const tech = parseTechnicalOffer(p.offeredItemDescription);
      return { id: p.id, months: getWarrantyMonths(tech.warrantyDetails) };
    });
    const maxWarrantyMonths = warrantyMonthsList.length ? Math.max(...warrantyMonthsList.map(w => w.months)) : 0;

    // Supplier average rating
    const ratings = list.map((p: any) => p.averageRating?.rating || 0);
    const maxRating = ratings.length ? Math.max(...ratings) : 0;

    return {
      lowestPrice,
      highestPrice,
      averagePrice,
      priceDiff,
      minDeliveryDays,
      maxWarrantyMonths,
      maxRating
    };
  }, [bid]);

  if (isLoading) {
    return (
      <PageShell>
        <div className="container mx-auto p-6">
          <ProcurementLoadingState message="Analyzing and comparing bid submissions..." />
        </div>
      </PageShell>
    );
  }

  if (error || !bid) {
    return (
      <PageShell>
        <div className="container mx-auto p-6">
          <ProcurementErrorState message="Could not fetch bid comparison details." onRetry={refetch} />
        </div>
      </PageShell>
    );
  }

  const isBuyer = user?.role === 'buyer';

  return (
    <PageShell>
      <div className="container mx-auto space-y-6 p-6">
        {/* Back Link */}
        <div className="flex items-center justify-between">
          <button 
            onClick={() => router.push(`/bids/${bidId}`)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#0b2447] transition"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Bid Details
          </button>
          <button
            onClick={handleExport}
            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition shadow-sm"
          >
            <Printer className="h-3.5 w-3.5" /> Export Report (PDF/Excel)
          </button>
        </div>

        {/* Hero */}
        <ProcurementHero 
          title="Bid Evaluation & Comparison Workspace" 
          subtitle={`Compare technical compliance, financial bids, and supplier history for Bid #${bid.id}`}
        />

        {/* Bid summary card */}
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Title</span>
                <StatusBadge label={bid.status} />
              </div>
              <h3 className="mt-1 text-base font-extrabold text-slate-900">{bid.title}</h3>
              <p className="mt-1 text-xs text-slate-500 font-semibold">
                Estimated Value: <span className="text-slate-800 font-black">{money(bid.estimatedValue)}</span> | Item: {bid.itemName}
              </p>
            </div>
          </div>
        </div>

        {/* Summary Insights Analytics Block */}
        {highlights && (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Lowest Price (L1)</p>
              <p className="text-lg font-black text-emerald-600">{money(highlights.lowestPrice)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Highest Price</p>
              <p className="text-lg font-black text-red-600">{money(highlights.highestPrice)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Average Bid Value</p>
              <p className="text-lg font-black text-slate-800">{money(highlights.averagePrice)}</p>
            </div>
            <div className="space-y-1">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">L1 to Highest Spread</p>
              <p className="text-lg font-black text-indigo-600">{money(highlights.priceDiff)}</p>
            </div>
          </div>
        )}

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-200">
          <button
            onClick={() => setActiveTab('l1')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition ${
              activeTab === 'l1' 
                ? 'border-indigo-650 text-indigo-700 bg-indigo-50/10' 
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            🏆 L1 Ranking Sheet
          </button>
          <button
            onClick={() => setActiveTab('matrix')}
            className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition ${
              activeTab === 'matrix' 
                ? 'border-indigo-650 text-indigo-700 bg-indigo-50/10' 
                : 'border-transparent text-slate-400 hover:text-slate-700'
            }`}
          >
            📊 Compare Matrix Table
          </button>
        </div>

        {/* Sorting and Filtering controls (shown only on Matrix View) */}
        {activeTab === 'matrix' && (
          <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Filter:</span>
                <select
                  value={filterStatus}
                  onChange={e => setFilterStatus(e.target.value)}
                  className="rounded-lg border border-slate-250 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="all">All Submissions</option>
                  <option value="technically-qualified">Technically Qualified</option>
                  <option value="financially-qualified">Financially Qualified</option>
                  <option value="pending">Pending Review</option>
                  <option value="shortlisted">Shortlisted</option>
                  <option value="rejected">Rejected</option>
                  <option value="clarification">Requires Clarification</option>
                </select>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-bold text-slate-500">Sort by:</span>
                <select
                  value={sortBy}
                  onChange={e => setSortBy(e.target.value)}
                  className="rounded-lg border border-slate-250 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400"
                >
                  <option value="lowest-price">Lowest Price</option>
                  <option value="highest-price">Highest Price</option>
                  <option value="earliest-submission">Earliest Submission</option>
                  <option value="fastest-delivery">Fastest Delivery</option>
                  <option value="highest-rating">Highest Rating</option>
                  <option value="warranty">Warranty Duration</option>
                  <option value="supplier-name">Company Name</option>
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Tab content rendering */}
        {activeTab === 'l1' ? (
          /* L1 Ranking Sheet View */
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
            <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
              <div>
                <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">L1 Comparison Sheet</h4>
                <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Ranked in ascending order of evaluated quotation price.</p>
              </div>
              <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-700 uppercase tracking-wide">
                Financial Evaluation Ranks
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-black text-slate-600 uppercase tracking-wider">
                    <th className="p-4 w-[100px]">Rank</th>
                    <th className="p-4">Seller</th>
                    <th className="p-4">Technical Status</th>
                    <th className="p-4">Evaluated Price</th>
                    <th className="p-4">Delivery</th>
                    <th className="p-4">Warranty</th>
                    <th className="p-4">Eligibility Status</th>
                    {isBuyer && bid.status === 'UNDER_EVALUATION' && <th className="p-4 text-center w-[120px]">Action</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {filteredAndSortedParticipations.map((p: any) => {
                    const tech = parseTechnicalOffer(p.offeredItemDescription);
                    const isQualified = String(p.technicalStatus || '').toUpperCase() === 'QUALIFIED';
                    
                    let rankLabel = '-';
                    let rankColorClass = 'text-slate-400 bg-slate-100 border-slate-200';
                    let emoji = '⚪';
                    if (isQualified && p.rank) {
                      if (p.rank === 1) {
                        rankLabel = 'L1';
                        rankColorClass = 'text-emerald-800 bg-emerald-100 border-emerald-200';
                        emoji = '🟢';
                      } else if (p.rank === 2) {
                        rankLabel = 'L2';
                        rankColorClass = 'text-amber-800 bg-amber-100 border-amber-200';
                        emoji = '🟡';
                      } else if (p.rank === 3) {
                        rankLabel = 'L3';
                        rankColorClass = 'text-orange-850 bg-orange-100 border-orange-255';
                        emoji = '🟠';
                      } else {
                        rankLabel = `L${p.rank}`;
                        rankColorClass = 'text-slate-700 bg-slate-150 border-slate-200';
                        emoji = '🔵';
                      }
                    } else if (!isQualified) {
                      rankLabel = '❌';
                      rankColorClass = 'text-red-800 bg-red-100 border-red-200';
                    }

                    let eligibilityText = 'Under Evaluation';
                    let eligibilityColor = 'text-slate-500 font-semibold';
                    if (!isQualified) {
                      eligibilityText = 'Technically Disqualified';
                      eligibilityColor = 'text-red-600 font-black';
                    } else if (p.rank === 1 && (bid.status === 'L1_GENERATED' || bid.status === 'UNDER_EVALUATION')) {
                      eligibilityText = 'Eligible for Award';
                      eligibilityColor = 'text-emerald-600 font-black';
                    } else if (p.finalStatus === 'AWARDED' || bid.status === 'AWARDED') {
                      eligibilityText = p.finalStatus === 'AWARDED' ? 'Awarded Winner' : 'Not Selected';
                      eligibilityColor = p.finalStatus === 'AWARDED' ? 'text-indigo-650 font-black' : 'text-slate-455';
                    }

                    return (
                      <tr 
                        key={p.id} 
                        className={`hover:bg-slate-50/40 transition ${!isQualified ? 'bg-slate-50/20 text-slate-400' : ''}`}
                      >
                        <td className="p-4">
                          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${rankColorClass}`}>
                            <span>{emoji}</span>
                            <span>{rankLabel}</span>
                          </span>
                        </td>
                        <td className="p-4">
                          <div className="font-extrabold text-slate-800">{p.seller?.name || `Seller #${p.sellerId}`}</div>
                          <div className="text-[10px] text-slate-450 mt-0.5">Part #: {p.participationNumber || `P-${p.id}`}</div>
                        </td>
                        <td className="p-4">
                          <StatusBadge label={p.technicalStatus || 'PENDING'} />
                        </td>
                        <td className="p-4 font-extrabold text-slate-800">
                          {isQualified ? money(p.totalAmount || p.quotedAmount || 0) : '—'}
                        </td>
                        <td className="p-4 font-semibold text-slate-650">
                          {tech.deliveryTimeline || '—'}
                        </td>
                        <td className="p-4 font-semibold text-slate-650">
                          {tech.warrantyDetails || '—'}
                        </td>
                        <td className={`p-4 ${eligibilityColor}`}>
                          {eligibilityText}
                        </td>
                        {isBuyer && bid.status === 'UNDER_EVALUATION' && (
                          <td className="p-4 text-center">
                            {isQualified && (
                              <button
                                onClick={() => handleOpenAwardModal(p)}
                                className="inline-flex h-8 items-center gap-1 rounded bg-[#0b2447] px-2.5 text-[10px] font-black text-white hover:bg-[#12335f] transition shadow-sm"
                              >
                                <Award className="h-3.5 w-3.5" /> Award
                              </button>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* Detailed Comparison Matrix View */
          filteredAndSortedParticipations.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
              <Users className="mx-auto h-12 w-12 text-slate-300 animate-pulse" />
              <h4 className="mt-3 text-sm font-black text-slate-700">No Bids Match Selection</h4>
              <p className="mt-1 text-xs text-slate-500">Adjust your filtering parameters or wait for seller bids.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-black text-slate-600 uppercase tracking-wider">
                      <th className="p-4 border-r border-slate-200 w-[220px]">Evaluation Criteria</th>
                      {filteredAndSortedParticipations.map(p => {
                        const price = p.totalAmount || p.quotedAmount || 0;
                        const isL1 = highlights && price === highlights.lowestPrice;
                        return (
                          <th key={p.id} className={`p-4 border-r border-slate-200 text-center ${isL1 ? 'bg-emerald-50/40' : ''}`}>
                            <div className="font-extrabold text-slate-900 text-sm">{p.seller?.name || `Seller #${p.sellerId}`}</div>
                            <div className="text-[10px] text-slate-450 font-bold mt-1">
                              Participation #: {p.participationNumber || `P-${p.id}`}
                            </div>
                            {isL1 && (
                              <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[8px] font-black text-emerald-800 uppercase tracking-wide mt-1.5">
                                L1 Bidder
                              </span>
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {/* Supplier Onboarding Status */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">Supplier Tier</td>
                      {filteredAndSortedParticipations.map(p => (
                        <td key={p.id} className="p-4 border-r border-slate-200 text-center font-bold text-slate-650">
                          {p.seller?.onboardingStatus ? String(p.seller.onboardingStatus).replace(/_/g, ' ') : 'MSME Verified'}
                        </td>
                      ))}
                    </tr>

                    {/* Submission date & time */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">Submitted At</td>
                      {filteredAndSortedParticipations.map(p => (
                        <td key={p.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500">
                          {p.submittedAt ? new Date(p.submittedAt).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                        </td>
                      ))}
                    </tr>

                    {/* Quotation Validity & status */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">Quotation Status</td>
                      {filteredAndSortedParticipations.map(p => {
                        const isExpired = p.validityDate && new Date(p.validityDate) < new Date();
                        return (
                          <td key={p.id} className={`p-4 border-r border-slate-200 text-center ${isExpired ? 'bg-orange-50/40 text-orange-850' : ''}`}>
                            <div className="flex flex-col items-center gap-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-[10px] text-slate-400 font-bold">Tech:</span>
                                <StatusBadge label={p.technicalStatus || 'PENDING'} />
                              </div>
                              {isExpired && (
                                <span className="rounded bg-orange-100 px-1 py-0.5 text-[8px] font-black uppercase tracking-wide">
                                  Expired
                                </span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Grand total price */}
                    <tr className="hover:bg-slate-55/30">
                      <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">Grand Total</td>
                      {filteredAndSortedParticipations.map(p => {
                        const price = p.totalAmount || p.quotedAmount || 0;
                        const isLowest = highlights && price === highlights.lowestPrice;
                        return (
                          <td key={p.id} className={`p-4 border-r border-slate-200 text-center font-extrabold text-sm ${isLowest ? 'bg-emerald-50 text-emerald-800' : 'text-slate-900'}`}>
                            {money(price)}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Taxes breakdown */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">GST & Taxes</td>
                      {filteredAndSortedParticipations.map(p => (
                        <td key={p.id} className="p-4 border-r border-slate-200 text-center font-bold text-slate-500">
                          {p.gstPercentage || 0}% ({money((p.totalAmount || 0) - (p.quotedAmount || 0))})
                        </td>
                      ))}
                    </tr>

                    {/* Base Quote Amount */}
                    <tr className="hover:bg-slate-55/30">
                      <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">Base Price</td>
                      {filteredAndSortedParticipations.map(p => (
                        <td key={p.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-450">
                          {money(p.quotedAmount || 0)}
                        </td>
                      ))}
                    </tr>

                    {/* Delivery Timeline */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">Delivery Timeline</td>
                      {filteredAndSortedParticipations.map(p => {
                        const tech = parseTechnicalOffer(p.offeredItemDescription);
                        const days = getDeliveryDays(tech.deliveryTimeline);
                        const isFastest = highlights && days !== Infinity && days === highlights.minDeliveryDays;
                        return (
                          <td key={p.id} className={`p-4 border-r border-slate-200 text-center font-bold ${isFastest ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'}`}>
                            {tech.deliveryTimeline || 'Not specified'}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Warranty period */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">Warranty Period</td>
                      {filteredAndSortedParticipations.map(p => {
                        const tech = parseTechnicalOffer(p.offeredItemDescription);
                        const months = getWarrantyMonths(tech.warrantyDetails);
                        const isLongest = highlights && months > 0 && months === highlights.maxWarrantyMonths;
                        return (
                          <td key={p.id} className={`p-4 border-r border-slate-200 text-center font-bold ${isLongest ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'}`}>
                            {tech.warrantyDetails || 'None'}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Compliance remarks */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">Compliance Remarks</td>
                      {filteredAndSortedParticipations.map(p => {
                        const tech = parseTechnicalOffer(p.offeredItemDescription);
                        const isDisqualified = p.technicalStatus === 'DISQUALIFIED';
                        return (
                          <td key={p.id} className={`p-4 border-r border-slate-200 text-center font-medium ${isDisqualified ? 'bg-red-50 text-red-700' : 'text-slate-650'}`}>
                            <p className="max-w-[200px] mx-auto truncate" title={tech.complianceRemarks}>
                              {tech.complianceRemarks || 'Compliant'}
                            </p>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Star Rating Performance */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">Supplier Rating</td>
                      {filteredAndSortedParticipations.map(p => {
                        const avg = p.averageRating;
                        const isTopRated = highlights && avg?.rating && avg.rating === highlights.maxRating;
                        return (
                          <td key={p.id} className={`p-4 border-r border-slate-200 text-center ${isTopRated ? 'bg-amber-50/40' : ''}`}>
                            {avg && avg.count > 0 ? (
                              <div className="flex flex-col items-center gap-1">
                                <div className="flex items-center gap-1">
                                  <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                  <span className="font-extrabold text-slate-800 text-xs">{Number(avg.rating).toFixed(1)}/5</span>
                                </div>
                                <div className="grid grid-cols-2 gap-x-2 text-[8px] font-bold text-slate-450">
                                  <span>Qual: {Number(avg.qualityScore).toFixed(0)}</span>
                                  <span>Deliv: {Number(avg.deliveryScore).toFixed(0)}</span>
                                </div>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-semibold">No history</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Technical & Financial Rank */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">Technical rank</td>
                      {filteredAndSortedParticipations.map(p => {
                        const techScore = p.evaluations?.reduce((sum: number, r: any) => sum + Number(r.score || 0), 0) || 0;
                        return (
                          <td key={p.id} className="p-4 border-r border-slate-200 text-center font-bold text-slate-650">
                            <div>Score: {techScore}</div>
                            <div className="text-[10px] text-slate-400">Rank: {p.rank || 'N/A'}</div>
                          </td>
                        );
                      })}
                    </tr>

                    {/* Uploaded documents view & download options */}
                    <tr className="hover:bg-slate-50/30">
                      <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">Uploaded Documents</td>
                      {filteredAndSortedParticipations.map(p => {
                        const hasDocs = Array.isArray(p.documents) && p.documents.length > 0;
                        return (
                          <td key={p.id} className={`p-4 border-r border-slate-200 text-center ${!hasDocs ? 'bg-red-50/40 text-red-800' : ''}`}>
                            {hasDocs ? (
                              <div className="flex flex-col gap-1 items-center">
                                {p.documents.map((d: any, idx: number) => (
                                  <button
                                    key={idx}
                                    onClick={() => {
                                      if (d.fileAssetId) {
                                        window.open(`/api/files/${d.fileAssetId}/view`, '_blank', 'noopener');
                                      } else {
                                        toast.error('File is not available for download.');
                                      }
                                    }}
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:underline truncate max-w-[160px]"
                                    title={d.fileName || d.documentName}
                                  >
                                    <FileText className="h-3 w-3 shrink-0" />
                                    <span className="truncate">{d.fileName || d.documentName}</span>
                                  </button>
                                ))}
                              </div>
                            ) : (
                              <span className="text-[10px] font-extrabold">Missing Documents</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>

                    {/* Recommendation Award Decision */}
                    {isBuyer && bid.status === 'UNDER_EVALUATION' && (
                      <tr className="hover:bg-slate-50/30">
                        <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50">Award Option</td>
                        {filteredAndSortedParticipations.map(p => (
                          <td key={p.id} className="p-4 border-r border-slate-200 text-center">
                            <button
                              onClick={() => handleOpenAwardModal(p)}
                              className="inline-flex h-8 items-center gap-1 rounded bg-[#0b2447] px-3 text-[10px] font-black text-white hover:bg-[#12335f] transition shadow-sm"
                            >
                              <Award className="h-3.5 w-3.5" /> Award RFQ
                            </button>
                          </td>
                        ))}
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )
        )}

        {/* Explanatory insights card */}
        <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 space-y-3">
          <div className="flex gap-2">
            <Info className="h-5 w-5 text-indigo-650 shrink-0 mt-0.5" />
            <div>
              <h5 className="text-xs font-black uppercase text-indigo-900 tracking-wider">Evaluation Rules & L1 Protocol</h5>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed font-semibold">
                To proceed with award generation, the bid status must be <span className="font-extrabold">Under Evaluation</span>.
                Spotlighting L1 and Best Rated cards will instantly highlight key parameters to facilitate visual selection.
                A documentation compliance score (0-5) aggregates the supplier's performance on previous orders in the network.
              </p>
            </div>
          </div>
          <div className="border-t border-slate-200 pt-3">
            <h6 className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Procurement Policy:</h6>
            <ul className="list-disc list-inside mt-1 text-[11px] font-bold text-slate-550 space-y-1">
              <li>Only technically qualified suppliers are evaluated in the L1 financial sheet.</li>
              <li>Selecting any supplier other than L1 requires entering a mandatory justification reason in the popup dialog box.</li>
              <li>Every action and override is recorded in the immutable audit ledger.</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Award Decision Confirmation Modal */}
      {awardModal.show && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in duration-250">
            <button 
              onClick={() => setAwardModal(prev => ({ ...prev, show: false }))}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="h-5 w-5" />
            </button>

            <div>
              <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                <Award className="h-5 w-5 text-indigo-650" /> Confirm Award Decision
              </h3>
              <p className="text-xs text-slate-500 font-semibold mt-1">
                Officially award the procurement contract to the selected seller.
              </p>
            </div>

            <div className="rounded-xl border border-slate-150 bg-slate-50/50 p-4 space-y-3 text-xs">
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="font-bold text-slate-500">Selected Seller:</span>
                <span className="font-black text-slate-900">{awardModal.sellerName}</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="font-bold text-slate-500">Procurement Reference:</span>
                <span className="font-extrabold text-slate-900">Bid #{bid.id} ({bid.bidNumber || 'N/A'})</span>
              </div>
              <div className="flex justify-between border-b border-slate-200/60 pb-2">
                <span className="font-bold text-slate-500">Evaluated Award Value:</span>
                <span className="font-black text-emerald-700 text-sm">{money(awardModal.amount)}</span>
              </div>
              <div className="flex justify-between pb-1">
                <span className="font-bold text-slate-500">Delivery Schedule:</span>
                <span className="font-extrabold text-slate-800">{awardModal.delivery}</span>
              </div>
            </div>

            {/* Warning if L2+ Override */}
            {awardModal.rank !== 1 && (
              <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
                <div>
                  <p className="font-black">L1 Non-Selection Override Warning</p>
                  <p className="mt-0.5 text-amber-800/90 font-semibold">
                    You have selected a supplier other than the L1 Lowest Bidder. You are required by procurement policy to provide a detailed, audit-compliant justification reason below.
                  </p>
                </div>
              </div>
            )}

            {/* Remarks Input */}
            <div className="space-y-1.5">
              <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider">
                Award Justification / Remarks {awardModal.rank !== 1 && <span className="text-red-500">*</span>}
              </label>
              <textarea
                value={awardModal.remarks}
                onChange={e => setAwardModal(prev => ({ ...prev, remarks: e.target.value }))}
                placeholder={awardModal.rank === 1 ? "Remarks or policy justifications..." : "Mandatory justification for L1 non-selection..."}
                rows={3}
                className="w-full rounded-lg border border-slate-250 p-2.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            {/* Confirmation Checkbox */}
            <label className="flex items-start gap-2.5 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={awardModal.confirmed}
                onChange={e => setAwardModal(prev => ({ ...prev, confirmed: e.target.checked }))}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-650 focus:ring-indigo-500"
              />
              <span className="text-xs font-bold text-slate-600 leading-snug">
                I officially declare that this award decision complies with local procurement rules, standard evaluation criteria, and is backed by authorized audit justification.
              </span>
            </label>

            {/* Modal Actions */}
            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setAwardModal(prev => ({ ...prev, show: false }))}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmAward}
                disabled={awardMutation.isPending || !awardModal.confirmed || (awardModal.rank !== 1 && !awardModal.remarks.trim())}
                className="inline-flex h-9 items-center gap-1.5 justify-center rounded-lg bg-[#0b2447] px-4 text-xs font-black text-white hover:bg-[#12335f] transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Award className="h-4 w-4" /> Confirm & Issue Award
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
