import { FormEvent, useEffect, useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Gavel, Pause, Play, RefreshCw, Send, Square, UserPlus, Loader2, X, Building2, Tag, Activity, FileText, Users, Award, ShieldAlert, Scale, Clock, Settings, HelpCircle, ChevronRight, ArrowLeft } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../shared/format';
import { reverseAuctionApi } from '../api';
import { procurementBidApi } from '../../procurementBid/api';
import { marketplaceApi, type MarketplaceSeller } from '../../marketplace/api';
import { useAuth } from '../../../hooks/useAuth';
import { cn } from '../../../lib/utils';

export default function ReverseAuctionDetailPage({ id }: { id: number }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isSeller = user?.role === 'seller';
  const [message, setMessage] = useState('');
  const [selectedSeller, setSelectedSeller] = useState<MarketplaceSeller | null>(null);

  // Queries
  const auction = useQuery({ 
    queryKey: ['reverse-auction', id], 
    queryFn: () => reverseAuctionApi.get(id), 
    refetchInterval: 10_000 
  });
  
  const summary = useQuery({ 
    queryKey: ['reverse-auction-summary', id], 
    queryFn: () => reverseAuctionApi.liveSummary(id), 
    refetchInterval: 5_000 
  });

  const participantsQuery = useQuery({
    queryKey: ['reverse-auction-participants', id],
    queryFn: () => reverseAuctionApi.participants(id),
    refetchInterval: 10_000,
    enabled: !isSeller
  });

  const bidsQuery = useQuery({
    queryKey: ['reverse-auction-bids', id],
    queryFn: () => reverseAuctionApi.bids(id),
    refetchInterval: 5_000,
    enabled: !isSeller
  });

  const linkedBidId = auction.data?.linkedBidId;
  const tenderId = auction.data?.tenderId;
  
  const linkedBid = useQuery({
    queryKey: ['linked-bid', linkedBidId || tenderId],
    queryFn: () => procurementBidApi.detail(String(linkedBidId || `TENDER-${tenderId}`)),
    enabled: !!(auction.data && (linkedBidId || tenderId))
  });

  // Mutators
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['reverse-auction', id] });
    qc.invalidateQueries({ queryKey: ['reverse-auction-summary', id] });
    qc.invalidateQueries({ queryKey: ['reverse-auction-participants', id] });
    qc.invalidateQueries({ queryKey: ['reverse-auction-bids', id] });
  };

  const transition = useMutation({ 
    mutationFn: (action: 'schedule' | 'start' | 'pause' | 'resume' | 'close') => 
      reverseAuctionApi.transition(id, action), 
    onSuccess: () => {
      setMessage(`Auction status transitioned.`);
      invalidate();
    },
    onError: (err: any) => {
      setMessage(`Transition failed: ${err.message}`);
    }
  });

  const invite = useMutation({
    mutationFn: (args: { sellerOrgId: number; sellerUserId?: number }) => 
      reverseAuctionApi.inviteSellers(id, [args]),
    onSuccess: () => { 
      setMessage('Seller organization invited successfully.'); 
      invalidate(); 
    },
    onError: err => setMessage((err as Error).message)
  });

  const recommendAwardMutation = useMutation({
    mutationFn: (participantId?: number) => reverseAuctionApi.recommendAward(id, participantId),
    onSuccess: () => {
      setMessage('Award recommendation submitted.');
      invalidate();
    },
    onError: err => setMessage((err as Error).message)
  });

  if (auction.isLoading) return <LoadingState label="Loading reverse auction details..." />;
  if (auction.error) return <InlineError message={(auction.error as Error).message} onRetry={() => auction.refetch()} />;
  if (!auction.data) return <EmptyState title="Auction not found" />;

  const submitInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedSeller) return;
    invite.mutate({
      sellerOrgId: selectedSeller.id,
      sellerUserId: selectedSeller.sellerUserId || undefined
    });
    setSelectedSeller(null);
  };

  const status = String(auction.data.statusEnum || auction.data.status || 'DRAFT').toUpperCase();
  const participants = participantsQuery.data?.participants || [];
  const bids = (bidsQuery.data?.bids || []).slice().sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
  
  const currentLowest = Number(auction.data.currentLowestAmount || auction.data.currentLowestBid || auction.data.currentBid || auction.data.startPrice || 0);
  const startPrice = Number(auction.data.startPrice || 0);
  const savings = startPrice > currentLowest && currentLowest > 0 ? startPrice - currentLowest : 0;
  const savingsPercent = startPrice > 0 && savings > 0 ? (savings / startPrice) * 100 : 0;
  const autoExtensionEnabled = auction.data.autoExtensionEnabled || false;
  const extensionCount = auction.data.extensionCount || 0;

  // Find L1 seller
  const l1Participant = [...participants].sort((a, b) => Number(a.currentRank || 99) - Number(b.currentRank || 99))[0];

  // Calculate duration in minutes
  const startMs = new Date(auction.data.startTime).getTime();
  const endMs = new Date(auction.data.endTime).getTime();
  const durationMin = Math.round((endMs - startMs) / 60000);

  if (isSeller) {
    return (
      <div className="mx-auto max-w-4xl space-y-4 pb-12">
        <div className="flex flex-wrap items-center gap-2 mb-2">
          <Link href="/reverse-auctions" className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-600 hover:border-[#12335f] hover:text-[#12335f]">
            <ArrowLeft className="mr-1 h-4 w-4" /> Back to Auctions
          </Link>
        </div>
        <div className="flex items-center justify-between border-b border-slate-200 pb-4">
          <div>
            <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 text-[9px] font-black uppercase tracking-widest text-[#12335f]">{auction.data.auctionCode || `RA-${id}`}</span>
            <h1 className="mt-1 text-xl font-black text-slate-900">{auction.data.title || 'Reverse Auction Sourcing'}</h1>
          </div>
          <Link href={`/reverse-auctions/${id}/live`}>
            <Button type="button"><Activity className="mr-2 h-4 w-4" />Open Live Bid Console</Button>
          </Link>
        </div>

        <div className="rounded-lg border border-amber-200 bg-amber-50 p-4">
          <div className="flex gap-3">
            <ShieldAlert className="h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <p className="text-xs font-bold text-amber-800">Dynamic Commercial Bidding Active</p>
              <p className="mt-1 text-xs font-semibold leading-relaxed text-amber-700">
                To respect competitive rules and prevent information leakage, the full bidding panel, competitor ranks, and increment tools are located on the live screen. Please click the button above to join.
              </p>
            </div>
          </div>
        </div>

        {/* Seller Info Cards */}
        <div className="grid gap-4 md:grid-cols-2">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-1.5"><FileText className="h-4 w-4 text-[#12335f]" /> Overview & Schedule</h3>
              <div className="grid gap-2 text-xs">
                <InfoRow label="Start Time" value={formatDateTime(auction.data.startTime)} />
                <InfoRow label="End Time" value={formatDateTime(auction.data.endTime)} />
                <InfoRow label="Duration" value={`${durationMin} minutes`} />
                <InfoRow label="Status" value={status} />
                <InfoRow label="Auction Type" value={auction.data.auctionType || 'ENGLISH_REVERSE'} />
                <InfoRow label="Auction Mode" value={auction.data.auctionMode || 'ONLINE'} />
              </div>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <h3 className="text-xs font-black uppercase text-slate-900 tracking-wider flex items-center gap-1.5"><Scale className="h-4 w-4 text-[#12335f]" /> Sourcing Guardrails</h3>
              <div className="grid gap-2 text-xs">
                <InfoRow label="Opening Price" value={formatCurrency(auction.data.startPrice)} />
                <InfoRow label="Min Decrement" value={auction.data.minDecrementAmount ? formatCurrency(auction.data.minDecrementAmount) : `${auction.data.minDecrementPercent}%`} />
                <InfoRow label="Rank Visibility" value={auction.data.rankVisibility || 'SHOW_RANK_ONLY'} />
                <InfoRow label="Minimum Qualified Bidders" value={String(auction.data.minimumQualifiedBidders || 2)} />
                <InfoRow label="Auto-Extension" value={autoExtensionEnabled ? 'Enabled' : 'Disabled'} />
                {auction.data.termsDocumentName && <InfoRow label="Terms Document" value={auction.data.termsDocumentName} />}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  // Buyer View
  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-12">
      {/* Detail Header */}
      <div className="flex flex-col gap-3 border-b border-slate-200 bg-white p-4 rounded-lg shadow-xs border md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/reverse-auctions" className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-600 hover:border-[#12335f] hover:text-[#12335f]">
              Back to Auctions
            </Link>
            <span className="rounded bg-emerald-50 px-2 py-0.5 text-[9px] uppercase font-bold text-emerald-700 border border-emerald-200">
              {status}
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{auction.data.auctionCode || `RA-${id}`}</span>
          </div>
          <h1 className="mt-2 text-xl font-black text-slate-950">{auction.data.title || 'Reverse Auction Sourcing'}</h1>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Button variant="outline" onClick={() => invalidate()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          
          {status === 'DRAFT' && (
            <Button variant="outline" onClick={() => transition.mutate('schedule')}><Clock className="mr-2 h-4 w-4" />Schedule</Button>
          )}
          {['DRAFT', 'SCHEDULED', 'PAUSED'].includes(status) && (
            <Button onClick={() => transition.mutate('start')}><Play className="mr-2 h-4 w-4" />Start</Button>
          )}
          {status === 'LIVE' && (
            <Button variant="secondary" onClick={() => transition.mutate('pause')}><Pause className="mr-2 h-4 w-4" />Pause</Button>
          )}
          {['LIVE', 'PAUSED'].includes(status) && (
            <Button variant="danger" onClick={() => transition.mutate('close')}><Square className="mr-2 h-4 w-4" />Close</Button>
          )}
        </div>
      </div>

      {message && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-[#12335f] flex justify-between items-center">
          <span>{message}</span>
          <button onClick={() => setMessage('')}><X className="h-4 w-4" /></button>
        </div>
      )}

      {/* Grid of Sections */}
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        {/* Left Hand: Detailed panels */}
        <div className="space-y-4">
          
          {/* SECTION 1: Overview */}
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <h2 className="text-sm font-black uppercase text-[#12335f] tracking-wider flex items-center gap-2 border-b pb-2">
                <FileText className="h-4 w-4" /> 1. Auction Overview
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3">
                <MetricCard label="Procurement Method" value={auction.data.procurementMethod === 'BID_WITH_REVERSE_AUCTION' ? 'Bid with Reverse Auction' : 'Reverse Auction'} icon={Scale} />
                <MetricCard label="Buyer Organization" value={auction.data.buyerOrgId ? `Buyer Org #${auction.data.buyerOrgId}` : 'Verified Buyer'} icon={Building2} />
                <MetricCard label="Category" value={auction.data.category || 'Not specified'} icon={Tag} />
                <MetricCard label="Auction Type" value={auction.data.auctionType || 'ENGLISH_REVERSE'} icon={Settings} />
                <MetricCard label="Auction Mode" value={auction.data.auctionMode || 'ONLINE'} icon={Activity} />
                <MetricCard label="Minimum Qualified Bidders" value={String(auction.data.minimumQualifiedBidders || 2)} icon={Users} />
                <MetricCard label="Start Time" value={formatDateTime(auction.data.startTime)} icon={Clock} />
                <MetricCard label="End Time" value={formatDateTime(auction.data.endTime)} icon={Clock} />
                <MetricCard label="Calculated Duration" value={`${durationMin} mins`} icon={Clock} />
              </div>
              
              <div className="rounded bg-slate-50 p-3 mt-2">
                <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider mb-1">Linked Procurement Event</p>
                {linkedBid.data ? (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-slate-900">{linkedBid.data.title}</p>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5">Reference: {linkedBid.data.id}</p>
                    </div>
                    <Link href={linkedBidId ? `/buyer/procurement/events` : `/buyer/tenders`} className="inline-flex items-center text-xs font-black text-[#12335f] hover:underline">
                      View Event <ChevronRight className="h-4 w-4 ml-0.5" />
                    </Link>
                  </div>
                ) : linkedBid.isLoading ? (
                  <p className="text-xs font-semibold text-slate-500 animate-pulse">Resolving linked procurement details...</p>
                ) : (
                  <p className="text-xs font-bold text-red-500">Linked procurement details unavailable.</p>
                )}
              </div>

              {auction.data.description && (
                <div className="mt-2 text-xs font-semibold text-slate-600 leading-relaxed bg-slate-50/50 p-3 rounded">
                  <p className="font-bold text-slate-800 mb-1">Description</p>
                  {auction.data.description}
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECTION 2: Rules */}
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <h2 className="text-sm font-black uppercase text-[#12335f] tracking-wider flex items-center gap-2 border-b pb-2">
                <Settings className="h-4 w-4" /> 2. Sourcing & Auction Rules
              </h2>
              <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                <InfoRow label="Opening Price" value={formatCurrency(auction.data.startPrice)} />
                <InfoRow label="Reserve Price" value={auction.data.reservePrice ? formatCurrency(auction.data.reservePrice) : 'Not configured'} />
                <InfoRow label="Minimum Decrement" value={auction.data.minDecrementAmount ? formatCurrency(auction.data.minDecrementAmount) : `${auction.data.minDecrementPercent}%`} />
                <InfoRow label="Rank Visibility" value={auction.data.rankVisibility || (auction.data.allowCompetitorNames ? 'SHOW_LOWEST_PRICE' : 'SHOW_RANK_ONLY')} />
                <InfoRow label="Auto Extension" value={autoExtensionEnabled ? `Trigger window: ${auction.data.autoExtensionWindowMinutes}m` : 'Disabled'} />
                <InfoRow label="Extension Length" value={autoExtensionEnabled ? `${auction.data.autoExtensionByMinutes} mins` : 'N/A'} />
                <InfoRow label="Max Auto-Extensions" value={autoExtensionEnabled ? String(auction.data.maxAutoExtensions) : 'N/A'} />
                <InfoRow label="Extension Count" value={String(extensionCount)} />
                <InfoRow label="Currency" value={auction.data.currency || 'INR'} />
                <InfoRow label="Terms Document" value={auction.data.termsDocumentName || 'Not attached'} />
                <InfoRow label="Auction Trigger" value={auction.data.auctionTrigger || (auction.data.procurementMethod === 'BID_WITH_REVERSE_AUCTION' ? 'TECHNICAL_QUALIFICATION' : 'DIRECT_AUCTION')} />
                <InfoRow label="Taxes Rule" value="Excluded from bid values" />
                <InfoRow label="Freight Rule" value="Excluded from bid values" />
                <InfoRow label="Award Basis" value="L1 lowest bid amount" />
              </div>
            </CardContent>
          </Card>

          {/* SECTION 3: Participants */}
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <h2 className="text-sm font-black uppercase text-[#12335f] tracking-wider flex items-center gap-2 border-b pb-2">
                <Users className="h-4 w-4" /> 3. Invited & Participating Sellers
              </h2>
              {participants.length === 0 ? (
                <EmptyPanel title="No sellers invited yet" description="Use the invite panel on the right to add qualified MSMEs or bidding participants." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="p-2.5">S.No.</th>
                        <th className="p-2.5">Seller Organization</th>
                        <th className="p-2.5">Status</th>
                        <th className="p-2.5">Technical Qualification</th>
                        <th className="p-2.5 text-right">Last Bid</th>
                        <th className="p-2.5 text-right">Rank</th>
                        <th className="p-2.5 text-right">Eligibility</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {participants.map((p: any, idx: number) => (
                        <tr key={p.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 text-slate-400 font-black">{idx + 1}</td>
                          <td className="p-2.5 text-slate-900 font-bold">{p.sellerOrgName || `Org #${p.sellerOrgId}`}</td>
                          <td className="p-2.5">
                            <span className={cn('rounded px-1.5 py-0.5 text-[10px] font-bold uppercase', p.status === 'ACCEPTED' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600')}>
                              {p.status}
                            </span>
                          </td>
                          <td className="p-2.5">
                            <span className="rounded bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 text-[9px] font-bold text-indigo-700">Qualified</span>
                          </td>
                          <td className="p-2.5 text-right font-black text-slate-900">
                            {p.lastBidAmount ? formatCurrency(p.lastBidAmount) : '-'}
                          </td>
                          <td className="p-2.5 text-right font-black text-slate-900">
                            {p.currentRank ? `L${p.currentRank}` : '-'}
                          </td>
                          <td className="p-2.5 text-right text-emerald-600">Eligible</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECTION 4: Live Auction Monitor */}
          <Card className="border-indigo-150 bg-indigo-50/10 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <h2 className="text-sm font-black uppercase text-indigo-950 tracking-wider flex items-center justify-between border-b border-indigo-100 pb-2">
                <span className="flex items-center gap-2"><Activity className="h-4 w-4 text-indigo-700" /> 4. Live Sourcing Monitor</span>
                {status === 'LIVE' && <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-600 animate-ping" />}
              </h2>
              <div className="grid gap-3 sm:grid-cols-4">
                <div className="bg-white border rounded p-3 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Current Lowest Bid</p>
                  <p className="text-base font-black text-emerald-700 mt-1">{currentLowest > 0 ? formatCurrency(currentLowest) : '-'}</p>
                </div>
                <div className="bg-white border rounded p-3 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Total Bids Recd</p>
                  <p className="text-base font-black text-slate-900 mt-1">{bids.length}</p>
                </div>
                <div className="bg-white border rounded p-3 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Active MSMEs</p>
                  <p className="text-base font-black text-indigo-900 mt-1">{participants.filter((p: any) => p.status === 'ACCEPTED').length}</p>
                </div>
                <div className="bg-white border rounded p-3 text-center">
                  <p className="text-[9px] font-black uppercase text-slate-500 tracking-wider">Tracked Savings</p>
                  <p className="text-base font-black text-[#12335f] mt-1">{savings > 0 ? `${savingsPercent.toFixed(1)}%` : '0%'}</p>
                </div>
              </div>
              <div className="flex gap-2 justify-end">
                <Link href={`/reverse-auctions/${id}/live`} className="w-full sm:w-auto">
                  <Button type="button" className="w-full"><Activity className="mr-2 h-4 w-4" />Open Full Live Board</Button>
                </Link>
              </div>
            </CardContent>
          </Card>

          {/* SECTION 5: Bid History */}
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <h2 className="text-sm font-black uppercase text-[#12335f] tracking-wider flex items-center gap-2 border-b pb-2">
                <RefreshCw className="h-4 w-4" /> 5. Audit-Backed Bid Log
              </h2>
              {bids.length === 0 ? (
                <EmptyPanel title="No bids registered" description="All valid seller lower bids will be logged here chronologically with server validation checks." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                      <tr>
                        <th className="p-2.5">S.No.</th>
                        <th className="p-2.5">Submission Time</th>
                        <th className="p-2.5">Seller Organization</th>
                        <th className="p-2.5 text-right">Bid Amount</th>
                        <th className="p-2.5 text-right">Rank at Submission</th>
                        <th className="p-2.5 text-right">Validity Check</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-semibold">
                      {bids.map((b: any, idx: number) => (
                        <tr key={b.id} className="hover:bg-slate-50/50">
                          <td className="p-2.5 text-slate-400 font-black">{idx + 1}</td>
                          <td className="p-2.5 text-slate-600">{formatDateTime(b.submittedAt)}</td>
                          <td className="p-2.5 text-slate-900 font-bold">{b.sellerOrgName || `Org #${b.sellerOrgId}`}</td>
                          <td className="p-2.5 text-right font-black text-slate-950">{formatCurrency(b.amount || b.bidAmount)}</td>
                          <td className="p-2.5 text-right font-bold text-slate-700">{b.rankAtSubmission ? `L${b.rankAtSubmission}` : '-'}</td>
                          <td className="p-2.5 text-right">
                            <span className={cn('rounded px-1.5 py-0.5 text-[9px] font-bold uppercase', b.isValid === false ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>
                              {b.isValid === false ? 'Invalid' : 'Valid'}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* SECTION 6: Award Recommendation */}
          {['CLOSED', 'AWARD_RECOMMENDED', 'AWARDED'].includes(status) && (
            <Card className="border-emerald-200 bg-emerald-50/20 shadow-sm">
              <CardContent className="p-4 space-y-3">
                <h2 className="text-sm font-black uppercase text-emerald-950 tracking-wider flex items-center gap-2 border-b border-emerald-100 pb-2">
                  <Award className="h-4 w-4 text-emerald-700" /> 6. L1 Sourcing Recommendation
                </h2>
                
                {l1Participant ? (
                  <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
                    <InfoRow label="Recommended L1 Seller" value={l1Participant.sellerOrgName || `Org #${l1Participant.sellerOrgId}`} />
                    <InfoRow label="Final Commercial Bid" value={l1Participant.lastBidAmount ? formatCurrency(l1Participant.lastBidAmount) : '-'} />
                    <InfoRow label="Savings Relative to Start" value={`${savingsPercent.toFixed(1)}%`} />
                    <InfoRow label="Technical Status" value="Passed Scrutiny" />
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-slate-500">No participants ranked to calculate award.</p>
                )}

                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-xs leading-relaxed font-semibold text-amber-800">
                  <HelpCircle className="h-4 w-4 inline mr-1 text-amber-700" /> Note: Clicking recommend saves the audit decision and prompts backend validation. If automatic PO triggers are pending, final execution occurs manually.
                </div>

                <div className="flex gap-2">
                  <Button 
                    disabled={recommendAwardMutation.isPending || !l1Participant || status === 'AWARD_RECOMMENDED'} 
                    onClick={() => recommendAwardMutation.mutate(l1Participant?.id)}
                    className="bg-emerald-700 hover:bg-emerald-800 text-white"
                  >
                    <Award className="mr-2 h-4 w-4" />
                    {status === 'AWARD_RECOMMENDED' ? 'Award Recommendation Submitted' : 'Submit L1 Award Recommendation'}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

        </div>

        {/* Right Hand Side: Side Panel (Invite Panel & Quick Bid Panel) */}
        <div className="space-y-4">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-[#12335f]">Invite Sourcing Participants</p>
              <form onSubmit={submitInvite} className="space-y-3">
                <VendorSearchableDropdown
                  value={selectedSeller?.id || ''}
                  onChange={(seller) => setSelectedSeller(seller)}
                />
                <Button disabled={invite.isPending || !selectedSeller} className="w-full">
                  <UserPlus className="mr-2 h-4 w-4" /> Invite Organization
                </Button>
              </form>
            </CardContent>
          </Card>
          
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 space-y-3">
              <p className="text-xs font-black uppercase tracking-widest text-slate-500">Auction Guidelines</p>
              <div className="text-xs text-slate-600 leading-relaxed space-y-2 font-semibold">
                <p>1. Standalone auctions are created immediately. Bids with reverse auctions require technical screening first.</p>
                <p>2. Reverse auctions calculate L1 ranking using net price inputs. Tax and freight calculations are kept separate.</p>
                <p>3. If auto-extension is enabled, any bid submitted in the closing minutes triggers a dynamic end-time extension.</p>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function MetricCard({ label, value, icon: Icon }: { label: string; value: string; icon: any }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-white p-3.5 shadow-sm transition hover:shadow-md hover:border-[#12335f]/25">
      <div className="flex justify-between items-start gap-2">
        <div className="space-y-1">
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
          <p className="text-sm font-extrabold text-slate-900 leading-tight">{value}</p>
        </div>
        <span className="rounded-lg bg-blue-50 p-2 text-[#12335f]"><Icon className="h-4 w-4" /></span>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 hover:bg-slate-50 transition">
      <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]/80">{label}</p>
      <p className="mt-1.5 text-xs font-bold text-slate-800 text-wrap-anywhere leading-relaxed">{value}</p>
    </div>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-250 bg-slate-50 p-6 text-center">
      <p className="text-xs font-black text-slate-800">{title}</p>
      <p className="mt-1 text-[11px] font-semibold text-slate-400">{description}</p>
    </div>
  );
}

interface VendorSearchableDropdownProps {
  value: string | number;
  onChange: (seller: MarketplaceSeller | null) => void;
  placeholder?: string;
  className?: string;
}

function VendorSearchableDropdown({ value, onChange, placeholder = 'Search vendor name or organization...', className }: VendorSearchableDropdownProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [sellers, setSellers] = useState<MarketplaceSeller[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedSeller, setSelectedSeller] = useState<MarketplaceSeller | null>(null);

  // Fetch initial seller if value exists
  useEffect(() => {
    if (value) {
      setLoading(true);
      marketplaceApi.getSellers({ pageSize: 50 })
        .then(res => {
          const found = res?.sellers?.find((s: any) => s.id === Number(value));
          if (found) {
            setSelectedSeller(found);
            setSearch(found.organizationName);
          }
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    } else {
      setSelectedSeller(null);
      setSearch('');
    }
  }, [value]);

  // Debounce search query
  useEffect(() => {
    if (!open) return;
    const delayDebounce = setTimeout(() => {
      setLoading(true);
      const params: Record<string, string | number> = { pageSize: 20 };
      if (search) params.q = search;
      marketplaceApi.getSellers(params)
        .then(res => {
          setSellers(res?.sellers || []);
        })
        .catch(err => console.error(err))
        .finally(() => setLoading(false));
    }, 300);

    return () => clearTimeout(delayDebounce);
  }, [search, open]);

  return (
    <div className={cn("relative w-full", className)}>
      <div className="relative">
        <input
          type="text"
          className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-3 pr-10 text-sm font-semibold text-slate-900 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/15"
          placeholder={placeholder}
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1.5 text-slate-400">
          {loading && <Loader2 className="h-4 w-4 animate-spin text-[#12335f]" />}
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                setSelectedSeller(null);
                onChange(null);
                setSellers([]);
              }}
              className="hover:text-slate-600"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute left-0 right-0 mt-1 max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white p-1 shadow-lg z-20">
            {loading && sellers.length === 0 ? (
              <div className="p-3 text-center text-xs font-semibold text-slate-500">Loading sellers...</div>
            ) : sellers.length === 0 ? (
              <div className="p-3 text-center text-xs font-semibold text-slate-500">No sellers found</div>
            ) : (
              sellers.map((seller) => {
                const isValid = seller.sellerUserId !== null && seller.sellerUserId !== undefined;
                const isSelected = selectedSeller?.id === seller.id;
                return (
                  <button
                    key={seller.id}
                    type="button"
                    disabled={!isValid}
                    onClick={() => {
                      setSelectedSeller(seller);
                      setSearch(seller.organizationName);
                      onChange(seller);
                      setOpen(false);
                    }}
                    className={cn(
                      "flex w-full flex-col items-start rounded-md px-3 py-2 text-left text-xs transition",
                      !isValid ? "opacity-50 cursor-not-allowed bg-slate-50/50" : "hover:bg-slate-50",
                      isSelected && "bg-blue-50 text-[#12335f]"
                    )}
                  >
                    <div className="flex w-full items-center justify-between gap-2">
                      <span className="font-bold text-slate-900">{seller.organizationName}</span>
                      {seller.verificationStatus === 'VERIFIED' && (
                        <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[9px] uppercase font-bold border border-emerald-200 text-emerald-700">Verified</span>
                      )}
                    </div>
                    <div className="mt-1 flex w-full items-center justify-between text-[10px] text-slate-500 font-semibold">
                      <span>
                        {seller.organizationType} · {[seller.city, seller.state].filter(Boolean).join(', ')}
                      </span>
                      {!isValid && (
                        <span className="text-red-500 font-bold">No active user account</span>
                      )}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </>
      )}
    </div>
  );
}

