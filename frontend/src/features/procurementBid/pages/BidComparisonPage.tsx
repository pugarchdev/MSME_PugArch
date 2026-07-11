'use client';

import React, { useState, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, unwrapApiData } from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';
import { 
  ArrowLeft, ShieldAlert, Award, Star, Info,
  CheckCircle2, AlertTriangle, FileText, BadgePercent, IndianRupee,
  Activity, Users, ChevronRight, HelpCircle
} from 'lucide-react';
import { PageShell, StatusBadge, ProcurementHero, ProcurementLoadingState, ProcurementErrorState } from '../components';
import { money } from '../data';
import { toast } from 'sonner';

export default function BidComparisonPage() {
  const params = useParams();
  const bidId = params?.bidId as string;
  const router = useRouter();
  const { token, user } = useAuth();
  const queryClient = useQueryClient();
  const authHeaders = useMemo(() => {
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    return headers;
  }, [token]);

  const [highlightL1, setHighlightL1] = useState(true);
  const [highlightBestRating, setHighlightBestRating] = useState(false);

  // Fetch bid details with participations and ratings
  const { data: bid, isLoading, error, refetch } = useQuery({
    queryKey: ['procurement-bid', bidId],
    queryFn: async () => {
      const res = await api.fetch(`/api/bids/${bidId}`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch bid details');
      const json = await res.json();
      return unwrapApiData<any>(json);
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
      queryClient.invalidateQueries({ queryKey: ['procurement-bid', bidId] });
      router.push(`/bids/${bidId}`);
    },
    onError: (err: any) => {
      toast.error(err.message || 'Failed to award bid');
    }
  });

  const handleAward = (participationId: number, sellerName: string, rank: number) => {
    const remarks = window.prompt(`Enter award remarks for ${sellerName}:`, 'Selected based on optimal price-to-quality ratio.');
    if (remarks === null) return;
    awardMutation.mutate({ participationId, remarks, rank });
  };

  const participations = useMemo(() => {
    if (!bid || !Array.isArray(bid.participations)) return [];
    return [...bid.participations].sort((a, b) => {
      // Sort L1, L2 ranks first if available
      if (a.rank && b.rank) return a.rank - b.rank;
      if (a.rank) return -1;
      if (b.rank) return 1;
      return (a.totalAmount || 0) - (b.totalAmount || 0);
    });
  }, [bid]);

  const bestRatingSellerId = useMemo(() => {
    if (participations.length === 0) return null;
    let bestScore = -1;
    let bestId = null;
    participations.forEach(p => {
      const avg = p.averageRating?.rating || 0;
      if (avg > bestScore) {
        bestScore = avg;
        bestId = p.id;
      }
    });
    return bestId;
  }, [participations]);

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
        <div className="flex items-center gap-2">
          <button 
            onClick={() => router.push(`/bids/${bidId}`)}
            className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#0b2447] transition"
          >
            <ArrowLeft className="h-4 w-4" /> Back to Bid Details
          </button>
        </div>

        {/* Hero */}
        <ProcurementHero 
          title="Bid Evaluation & Comparison Matrix" 
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
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => {
                  setHighlightL1(prev => !prev);
                  if (!highlightL1) setHighlightBestRating(false);
                }}
                className={`inline-flex h-9 items-center justify-center rounded-lg border px-4 text-xs font-bold transition ${
                  highlightL1 
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700 shadow-sm' 
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-55/40'
                }`}
              >
                Highlight L1 Bidder
              </button>
              <button
                onClick={() => {
                  setHighlightBestRating(prev => !prev);
                  if (!highlightBestRating) setHighlightL1(false);
                }}
                className={`inline-flex h-9 items-center justify-center rounded-lg border px-4 text-xs font-bold transition ${
                  highlightBestRating 
                    ? 'border-amber-500 bg-amber-50 text-amber-700 shadow-sm' 
                    : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-55/40'
                }`}
              >
                Highlight Best Rated
              </button>
            </div>
          </div>
        </div>

        {/* Matrix table */}
        {participations.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
            <Users className="mx-auto h-12 w-12 text-slate-300 animate-pulse" />
            <h4 className="mt-3 text-sm font-black text-slate-700">No Participations Yet</h4>
            <p className="mt-1 text-xs text-slate-500">Sellers have not submitted any technical or financial proposals for this bid.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 font-black text-slate-600 uppercase tracking-wider">
                    <th className="p-4 w-[220px]">Supplier Details</th>
                    <th className="p-4 w-[160px]">Financial Proposal</th>
                    <th className="p-4 w-[160px]">Compliance Details</th>
                    <th className="p-4 w-[280px]">Supplier Rating & History</th>
                    <th className="p-4 w-[120px]">Documents</th>
                    {isBuyer && bid.status === 'UNDER_EVALUATION' && (
                      <th className="p-4 text-center w-[120px]">Action</th>
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {participations.map((p) => {
                    const isL1 = p.rank === 1;
                    const isBestRated = p.id === bestRatingSellerId;
                    const isHighlighted = (highlightL1 && isL1) || (highlightBestRating && isBestRated);
                    const avg = p.averageRating || { rating: 0, qualityScore: 0, deliveryScore: 0, communicationScore: 0, documentationScore: 0, count: 0 };

                    return (
                      <tr 
                        key={p.id} 
                        className={`transition-all duration-200 ${
                          isHighlighted 
                            ? isL1 
                              ? 'bg-emerald-50/50 hover:bg-emerald-50 ring-1 ring-emerald-200' 
                              : 'bg-amber-50/50 hover:bg-amber-50 ring-1 ring-amber-200'
                            : 'hover:bg-slate-50/50'
                        }`}
                      >
                        {/* Supplier Info */}
                        <td className="p-4">
                          <div className="flex flex-col">
                            <div className="flex items-center gap-1.5">
                              <span className="font-extrabold text-sm text-slate-900">{p.seller?.name || `Seller #${p.sellerId}`}</span>
                              {isL1 && (
                                <span className="rounded bg-emerald-100 px-1 py-0.5 text-[8px] font-black text-emerald-800 uppercase tracking-wide">
                                  L1
                                </span>
                              )}
                              {isBestRated && avg.count > 0 && (
                                <span className="rounded bg-amber-100 px-1 py-0.5 text-[8px] font-black text-amber-800 uppercase tracking-wide">
                                  Top Rated
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] font-bold text-slate-500 mt-0.5">Participation #: {p.participationNumber || `P-${p.id}`}</span>
                            <span className="text-[10px] font-bold text-slate-500">Tier: {p.seller?.onboardingStatus ? String(p.seller.onboardingStatus).replace(/_/g, ' ') : 'MSME verified'}</span>
                          </div>
                        </td>

                        {/* Financial Proposal */}
                        <td className="p-4">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1 text-sm font-extrabold text-[#0b2447]">
                              <IndianRupee className="h-3.5 w-3.5" />
                              <span>{money(p.totalAmount || p.quotedAmount || 0)}</span>
                            </div>
                            <span className="text-[10px] font-bold text-slate-500">Base: {money(p.quotedAmount || 0)}</span>
                            <span className="text-[10px] font-bold text-slate-500">GST: {p.gstPercentage || 0}% ({money((p.totalAmount || 0) - (p.quotedAmount || 0))})</span>
                          </div>
                        </td>

                        {/* Technical Status & Compliances */}
                        <td className="p-4">
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-slate-500">Tech:</span>
                              <StatusBadge label={p.technicalStatus || 'PENDING'} />
                            </div>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-bold text-slate-500">Finance:</span>
                              <StatusBadge label={p.financialStatus || 'PENDING'} />
                            </div>
                            {p.rejectionReason && (
                              <p className="max-w-[150px] truncate text-[9px] font-semibold text-red-500" title={p.rejectionReason}>
                                Reason: {p.rejectionReason}
                              </p>
                            )}
                          </div>
                        </td>

                        {/* Supplier Rating Details */}
                        <td className="p-4">
                          <div className="rounded-xl bg-slate-50 p-3 ring-1 ring-slate-100">
                            {avg.count > 0 ? (
                              <div className="space-y-2">
                                <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                                  <div className="flex items-center gap-1">
                                    <Star className="h-3.5 w-3.5 fill-amber-400 text-amber-400" />
                                    <span className="font-extrabold text-slate-800 text-xs">{Number(avg.rating).toFixed(1)}/5</span>
                                  </div>
                                  <span className="text-[9px] font-bold text-slate-400">({avg.count} orders rated)</span>
                                </div>
                                <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] font-bold text-slate-500">
                                  <div className="flex items-center justify-between">
                                    <span>Quality:</span>
                                    <span className="text-slate-850">{Number(avg.qualityScore).toFixed(1)}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>Delivery:</span>
                                    <span className="text-slate-850">{Number(avg.deliveryScore).toFixed(1)}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>Comm:</span>
                                    <span className="text-slate-850">{Number(avg.communicationScore).toFixed(1)}</span>
                                  </div>
                                  <div className="flex items-center justify-between">
                                    <span>Docs:</span>
                                    <span className="text-indigo-600 font-extrabold">{Number(avg.documentationScore).toFixed(1)}</span>
                                  </div>
                                </div>
                              </div>
                            ) : (
                              <div className="text-center py-2">
                                <span className="text-[9px] font-bold text-slate-400">No rating history available</span>
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Submitted Docs */}
                        <td className="p-4">
                          {Array.isArray(p.documents) && p.documents.length > 0 ? (
                            <div className="flex flex-col gap-1">
                              {p.documents.map((d: any, idx: number) => (
                                <button
                                  key={idx}
                                  onClick={() => toast.info(`Downloading ${d.fileName || d.documentName}...`)}
                                  className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:underline text-left truncate max-w-[120px]"
                                  title={d.fileName || d.documentName}
                                >
                                  <FileText className="h-3 w-3 shrink-0" />
                                  <span>{d.fileName || d.documentName || 'Document'}</span>
                                </button>
                              ))}
                            </div>
                          ) : (
                            <span className="text-[9px] font-semibold text-slate-400">None uploaded</span>
                          )}
                        </td>

                        {/* Action buttons (Only for Buyers under evaluation) */}
                        {isBuyer && bid.status === 'UNDER_EVALUATION' && (
                          <td className="p-4 text-center">
                            <button
                              onClick={() => handleAward(p.id, p.seller?.name || `Seller #${p.sellerId}`, p.rank || 999)}
                              className="inline-flex h-8 items-center gap-1 rounded bg-[#0b2447] px-2.5 text-[10px] font-black text-white hover:bg-[#12335f] transition shadow-sm"
                            >
                              <Award className="h-3.5 w-3.5" /> Award
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Explanatory insights card */}
        <div className="rounded-2xl border border-blue-100 bg-blue-50/40 p-4">
          <div className="flex gap-2">
            <Info className="h-5 w-5 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <h5 className="text-xs font-black uppercase text-blue-900 tracking-wider">Evaluation Rules</h5>
              <p className="mt-1 text-xs text-blue-800/90 leading-relaxed font-semibold">
                To proceed with award generation, the bid status must be <span className="font-extrabold">Under Evaluation</span>.
                Highlighting L1 and Best Rated cards will instantly spotlight the respective bids to facilitate objective visual selection.
                A documentation compliance score (0-5) aggregates the supplier's performance on previous orders in the network.
              </p>
            </div>
          </div>
        </div>
      </div>
    </PageShell>
  );
}
