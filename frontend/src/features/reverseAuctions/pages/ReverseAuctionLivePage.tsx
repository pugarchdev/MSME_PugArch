import { FormEvent, useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  Clock3,
  EyeOff,
  Gavel,
  History,
  IndianRupee,
  LineChart as LineChartIcon,
  RadioTower,
  RefreshCw,
  Send,
  ShieldCheck,
  Trophy,
  Users,
  X,
  Gauge,
  Percent,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip
} from 'recharts';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDateTime, formatNumber } from '../../shared/format';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../../hooks/useAuth';
import { reverseAuctionApi, type ReverseAuction, type ReverseAuctionBid, type ReverseAuctionParticipant } from '../api';
import { toast } from 'sonner';

const numberValue = (value: unknown, fallback = 0) => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const getStatus = (auction?: ReverseAuction) => String(auction?.statusEnum || auction?.status || 'DRAFT').toUpperCase();

const isAuctionLive = (auction?: ReverseAuction, serverTime?: string) => {
  if (!auction) return false;
  const now = serverTime ? new Date(serverTime).getTime() : Date.now();
  return getStatus(auction) === 'LIVE' && new Date(auction.startTime).getTime() <= now && new Date(auction.endTime).getTime() > now;
};

const getCurrentLowest = (auction?: ReverseAuction) =>
  numberValue(auction?.currentLowestAmount ?? auction?.currentLowestBid ?? auction?.currentBid ?? auction?.startPrice, 0);

const getBidAmount = (bid: ReverseAuctionBid) => numberValue(bid.amount ?? bid.bidAmount, 0);

const liveSummaryCache = new Map<number, any>();

const liveAwareRefetch = (query: any) => {
  const auction = query?.state?.data?.auction || query?.state?.data;
  if (!auction) return 15_000;
  return isAuctionLive(auction, query?.state?.data?.serverTime) ? 3_000 : 20_000;
};

export default function ReverseAuctionLivePage({ id }: { id: number }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isBuyerOrAdmin = user?.role === 'buyer' || user?.role === 'admin' || user?.role === 'master_admin';
  const [amount, setAmount] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [localError, setLocalError] = useState('');

  const summary = useQuery({
    queryKey: ['reverse-auction-live', id],
    queryFn: async () => {
      const result = await reverseAuctionApi.liveSummary(id);
      liveSummaryCache.set(id, result);
      return result;
    },
    staleTime: 3_000,
    refetchInterval: liveAwareRefetch,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => {
      if (previous !== undefined) return previous;
      if (liveSummaryCache.has(id)) return liveSummaryCache.get(id);
      const cached = qc.getQueryData<any>(['reverse-auction-live', id]);
      if (cached !== undefined) return cached;
      return undefined;
    }
  });

  const participants = useQuery({
    queryKey: ['reverse-auction-participants', id],
    queryFn: () => reverseAuctionApi.participants(id),
    staleTime: 5_000,
    refetchInterval: liveAwareRefetch,
    refetchOnWindowFocus: false,
    enabled: !summary.isError,
  });

  const bids = useQuery({
    queryKey: ['reverse-auction-bids', id],
    queryFn: () => reverseAuctionApi.bids(id),
    staleTime: 3_000,
    refetchInterval: liveAwareRefetch,
    refetchOnWindowFocus: false,
    enabled: !summary.isError,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['reverse-auction-live', id] });
    qc.invalidateQueries({ queryKey: ['reverse-auction-participants', id] });
    qc.invalidateQueries({ queryKey: ['reverse-auction-bids', id] });
  };

  const transition = useMutation({
    mutationFn: (action: 'schedule' | 'start' | 'pause' | 'resume' | 'close') => reverseAuctionApi.transition(id, action),
    onSuccess: () => {
      setLocalError('');
      invalidate();
    },
    onError: (err: any) => {
      setLocalError(`Action failed: ${err.message}`);
    }
  });

  const bid = useMutation({
    mutationFn: (nextAmount: number) => reverseAuctionApi.placeBid(id, nextAmount),
    onSuccess: () => {
      setAmount('');
      setLocalError('');
      toast.success('Bid submitted successfully!');
      invalidate();
    },
    onError: (err: any) => {
      const errorMsg = err.message || 'Bid submission failed';
      setLocalError(errorMsg);
      toast.error(errorMsg);
    }
  });

  const auction = (summary.data?.auction || liveSummaryCache.get(id)?.auction) as ReverseAuction | undefined;
  
  const loading = summary.isLoading && !auction;

  // Countdown timer logic
  const [timeLeft, setTimeLeft] = useState('00:00:00');
  const live = auction ? isAuctionLive(auction, summary.data?.serverTime || liveSummaryCache.get(id)?.serverTime) : false;
  const status = auction ? getStatus(auction) : 'DRAFT';

  useEffect(() => {
    if (!live || !auction?.endTime) {
      setTimeLeft('00:00:00');
      return;
    }
    const updateTimer = () => {
      const end = new Date(auction.endTime).getTime();
      const now = Date.now();
      const diff = end - now;
      if (diff <= 0) {
        setTimeLeft('00:00:00');
      } else {
        const hrs = String(Math.floor(diff / 3600000)).padStart(2, '0');
        const mins = String(Math.floor((diff % 3600000) / 60000)).padStart(2, '0');
        const secs = String(Math.floor((diff % 60000) / 1000)).padStart(2, '0');
        setTimeLeft(`${hrs}:${mins}:${secs}`);
      }
    };
    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [live, auction?.endTime]);

  if (loading) return <LoadingState label="Loading live auction..." />;
  if (summary.error) return <InlineError message={(summary.error as Error).message} onRetry={() => summary.refetch()} />;
  if (!auction) return <EmptyState title="Auction not found" />;

  const participant = (summary.data?.participant || liveSummaryCache.get(id)?.participant) as ReverseAuctionParticipant | null | undefined;
  const participantRows = participants.data?.participants || [];
  const bidRows = (bids.data?.bids || []).slice().sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
  const currentLowest = getCurrentLowest(auction);
  const startPrice = numberValue(auction.startPrice);
  const savings = startPrice > currentLowest && currentLowest > 0 ? startPrice - currentLowest : 0;
  const savingsPercent = startPrice > 0 && savings > 0 ? (savings / startPrice) * 100 : 0;
  const minNextBid = numberValue(summary.data?.minimumNextBid || liveSummaryCache.get(id)?.minimumNextBid, currentLowest);
  const decrement = numberValue(auction.minDecrementAmount ?? auction.minDecrement, 0);
  const latestBid = bidRows[0];
  const myBestBid = bidRows.reduce((best, row) => {
    const value = getBidAmount(row);
    return value > 0 && (!best || value < best) ? value : best;
  }, 0);
  const extensionCount = numberValue(auction.extensionCount, 0);
  const maxExtensions = auction.maxAutoExtensions ?? 0;

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const nextAmount = Number(amount);
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) {
      setLocalError('Please enter a valid positive number');
      return;
    }
    if (minNextBid > 0 && nextAmount > minNextBid) {
      setLocalError(`Bid amount cannot exceed ${formatCurrency(minNextBid)}`);
      return;
    }
    if (!acceptedTerms) {
      setLocalError('Please accept the auction terms and rules first');
      return;
    }
    setLocalError('');
    setShowConfirmModal(true);
  };

  const confirmSubmit = () => {
    const nextAmount = Number(amount);
    setShowConfirmModal(false);
    bid.mutate(nextAmount);
  };

  // Process data for the real-time bid chart
  // Group bids chronologically to show pricing drops
  const chartData = bidRows
    .slice()
    .reverse()
    .map((b, idx) => ({
      index: idx + 1,
      amount: getBidAmount(b),
      time: new Date(b.submittedAt || 0).toLocaleTimeString(),
      label: b.sellerOrgName || `Bid #${idx + 1}`
    }));

  return (
    <div className="space-y-6 pb-8 bg-white text-zinc-900 p-6 rounded-3xl border border-zinc-200 shadow-xl animate-in fade-in duration-500">
      
      {/* Error alert */}
      {localError && (
        <div className="rounded-xl border border-red-500/30 bg-red-950/40 p-4 text-xs font-bold text-red-400 flex justify-between items-center shadow-lg shadow-red-950/20 backdrop-blur-md">
          <span>{localError}</span>
          <button onClick={() => setLocalError('')} className="text-red-400 hover:text-red-300">
            <X className="h-4.5 w-4.5" />
          </button>
        </div>
      )}

      {/* Header section */}
      <section className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-6 border-b border-zinc-200 pb-6">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <Link href="/reverse-auctions" className="inline-flex h-8 items-center rounded-lg border border-zinc-200 bg-white px-3 text-xs font-bold text-zinc-600 hover:border-zinc-300 hover:text-zinc-900 transition">
              <ArrowLeft className="mr-1.5 h-3.5 w-3.5" /> All Auctions
            </Link>
            
            {/* Live Indicator */}
            {live ? (
              <span className="inline-flex items-center rounded-full bg-red-50 border border-red-200 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-red-600">
                <span className="mr-2 h-2 w-2 rounded-full bg-red-500 animate-ping" />
                Live Auction
              </span>
            ) : (
              <span className="inline-flex items-center rounded-full bg-zinc-100 border border-zinc-200 px-3 py-1 text-[10px] font-black uppercase tracking-wider text-zinc-600">
                {status.replace(/_/g, ' ')}
              </span>
            )}
            
            {auction.auctionCode && (
              <span className="rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-amber-700">
                {auction.auctionCode}
              </span>
            )}
          </div>
          
          <h1 className="text-2xl font-black tracking-tight text-zinc-900">{auction.title || `Auction #${id}`}</h1>
          <p className="max-w-4xl text-sm font-semibold leading-relaxed text-zinc-500">
            {auction.description || 'Participate in a price-only reverse auction with server-time validation, rank tracking, decrement controls, and audit-backed bid submission.'}
          </p>
        </div>

        {/* Controls and Countdown */}
        <div className="flex flex-col sm:items-end gap-3.5 shrink-0">
          {/* Glowing Red Countdown Timer */}
          <div className="flex flex-col sm:items-end">
            <p className="text-[10px] font-black uppercase tracking-widest text-zinc-400">Remaining Time</p>
            <div className="mt-1 text-3xl font-mono font-extrabold text-red-600 tracking-wider drop-shadow-[0_0_8px_rgba(220,38,38,0.2)]">
              ( {timeLeft} )
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={invalidate} disabled={summary.isFetching} className="border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700">
              <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', summary.isFetching && 'animate-spin')} /> Refresh
            </Button>
            <Link href={`/reverse-auctions/${id}`}>
              <Button type="button" variant="outline" className="border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700">Details</Button>
            </Link>
            
            {isBuyerOrAdmin && (
              <>
                {status === 'DRAFT' && (
                  <Button onClick={() => transition.mutate('schedule')} variant="outline" className="border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-700">Schedule</Button>
                )}
                {['DRAFT', 'SCHEDULED', 'PAUSED'].includes(status) && (
                  <Button onClick={() => transition.mutate('start')} className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold">Start</Button>
                )}
                {status === 'LIVE' && (
                  <Button onClick={() => transition.mutate('pause')} variant="secondary" className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800">Pause</Button>
                )}
                {['LIVE', 'PAUSED'].includes(status) && (
                  <Button onClick={() => transition.mutate('close')} className="bg-red-600 hover:bg-red-500 text-white font-bold">Close</Button>
                )}
                <Link href={`/reverse-auctions/${id}/results`}>
                  <Button type="button" variant="secondary" className="bg-zinc-100 hover:bg-zinc-200 text-zinc-800">Results</Button>
                </Link>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Stats Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatsCard
          icon={IndianRupee}
          label="Current Lowest Bid"
          value={currentLowest > 0 ? formatCurrency(currentLowest) : 'No bids yet'}
          color="emerald"
        />
        <StatsCard
          icon={Trophy}
          label="My Current Rank"
          value={isBuyerOrAdmin ? 'N/A (Buyer Mode)' : participant?.currentRank ? `L${participant.currentRank}` : 'Not ranked'}
          color="amber"
        />
        <StatsCard
          icon={Users}
          label="Active Participants"
          value={formatNumber(participantRows.length)}
          color="blue"
        />
        <StatsCard
          icon={Percent}
          label="Savings Generated"
          value={savings > 0 ? `${formatCurrency(savings)} (${savingsPercent.toFixed(1)}%)` : '0.0%'}
          color="cyan"
        />
      </div>

      {/* Real-time price chart */}
      <Card className="border-zinc-200 bg-white shadow-md overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 border-b border-zinc-200 pb-4 mb-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
              <LineChartIcon className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-zinc-900">Live Bidding Price Movement</h2>
              <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">Visual mapping of bid downward progression over server time.</p>
            </div>
          </div>

          <div className="h-72 w-full mt-4">
            {chartData.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full border border-dashed border-zinc-200 rounded-xl bg-zinc-50 text-zinc-400 p-6">
                <LineChartIcon className="h-10 w-10 text-zinc-300 mb-2 stroke-[1.5]" />
                <p className="text-xs font-bold">Waiting for bidding data to populate chart...</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={chartData} margin={{ top: 10, right: 10, left: 10, bottom: 5 }}>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="time" stroke="#71717a" fontSize={9} tickLine={false} />
                  <YAxis stroke="#71717a" fontSize={9} tickLine={false} domain={['auto', 'auto']} />
                  <RechartsTooltip
                    contentStyle={{ backgroundColor: '#ffffff', borderColor: '#e2e8f0', borderRadius: '12px' }}
                    labelClassName="text-[10px] font-black text-zinc-500"
                    itemStyle={{ fontSize: '11px', color: '#059669', fontWeight: 'bold' }}
                  />
                  <Line
                    type="monotone"
                    dataKey="amount"
                    stroke="#10b981"
                    strokeWidth={2.5}
                    dot={{ fill: '#10b981', strokeWidth: 1, r: 4 }}
                    activeDot={{ r: 6, fill: '#059669', stroke: '#10b981' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bottom Grid Layout */}
      <div className="grid gap-6 xl:grid-cols-[1fr_390px]">
        
        {/* Left Column: Live Bidding History Table */}
        <Card className="border-zinc-200 bg-white shadow-md overflow-hidden">
          <CardContent className="p-6">
            <div className="flex items-center gap-3 border-b border-zinc-200 pb-4 mb-4">
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                <History className="h-5 w-5" />
              </span>
              <div>
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-900">Live Bidding Log</h2>
                <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">Real-time sequence of valid downward commercial offers.</p>
              </div>
            </div>

            {bidRows.length === 0 ? (
              <div className="rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-8 text-center text-zinc-500">
                <p className="text-xs font-bold">No bids submitted yet.</p>
                <p className="text-[10px] mt-1">Once live bids are validated by the server, they will populate here.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-zinc-50 text-[10px] font-black uppercase tracking-widest text-zinc-500 border-b border-zinc-200">
                    <tr>
                      <th className="px-4 py-3">Rank</th>
                      {isBuyerOrAdmin && <th className="px-4 py-3">Seller Organization</th>}
                      <th className="px-4 py-3">Bid Time</th>
                      <th className="px-4 py-3">Bid Amount</th>
                      <th className="px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-200">
                    {bidRows.map((row) => (
                      <tr key={row.id} className="hover:bg-zinc-50 transition duration-150">
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-extrabold",
                            row.rankAtSubmission === 1 ? "bg-emerald-50 text-emerald-700 border border-emerald-200/50" : "bg-zinc-100 text-zinc-600"
                          )}>
                            L{row.rankAtSubmission || '-'}
                          </span>
                        </td>
                        {isBuyerOrAdmin && (
                          <td className="px-4 py-3 font-bold text-zinc-800">
                            {row.sellerOrgName || `Org #${row.sellerOrgId}`}
                          </td>
                        )}
                        <td className="px-4 py-3 font-semibold text-zinc-500">
                          {formatDateTime(row.submittedAt)}
                        </td>
                        <td className="px-4 py-3 font-black text-zinc-900">
                          {formatCurrency(getBidAmount(row))}
                        </td>
                        <td className="px-4 py-3">
                          <span className={cn(
                            "inline-flex items-center rounded-full px-2 py-0.5 text-[9px] font-black uppercase",
                            row.isValid === false ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"
                          )}>
                            {row.isValid === false ? 'Invalid' : 'Valid'}
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

        {/* Right Column: PLACE YOUR BID Console Card */}
        <aside className="space-y-4">
          <Card className="border-zinc-200 bg-white shadow-md overflow-hidden">
            <CardContent className="p-6 space-y-5">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-red-600">
                  {isBuyerOrAdmin ? 'Live Console' : 'Bid Console'}
                </p>
                <h2 className="mt-1 text-base font-black text-zinc-900">
                  {isBuyerOrAdmin ? 'Sourcing Monitor' : 'Place Your Bid'}
                </h2>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-zinc-500">
                  {isBuyerOrAdmin
                    ? 'Monitor active MSME participant bids, adjust parameters, or close the event.'
                    : 'Submit a lower downward offer. Bids are verified using UTC server timestamps.'}
                </p>
              </div>

              {/* Status constraints warning */}
              {!live && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-3.5">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                    <p className="text-xs font-bold leading-relaxed text-amber-800">
                      Bidding console is locked. Auction status: {status.toLowerCase().replace(/_/g, ' ')}.
                    </p>
                  </div>
                </div>
              )}

              {/* Bid constraints metadata */}
              <div className="grid grid-cols-2 gap-3.5">
                <BidSpec label="Min Next Bid" value={minNextBid > 0 ? formatCurrency(minNextBid) : '-'} color="red" />
                <BidSpec label="Min Decrement" value={decrement > 0 ? formatCurrency(decrement) : '-'} />
                <BidSpec label="Reserve Price" value={isBuyerOrAdmin && auction.reservePrice ? formatCurrency(auction.reservePrice) : 'Protected'} />
                <BidSpec label="Extensions" value={auction.autoExtensionEnabled ? `${extensionCount}/${maxExtensions}` : 'None'} />
              </div>

              {/* Active forms */}
              {isBuyerOrAdmin ? (
                <div className="rounded-xl bg-zinc-50 border border-zinc-200 p-4 text-xs font-semibold leading-relaxed text-zinc-600 space-y-2">
                  <p className="font-bold text-zinc-800 mb-2">Buyer Monitor Statistics</p>
                  <p className="flex justify-between"><span>Invited Suppliers:</span> <span className="font-bold text-zinc-800">{participantRows.length}</span></p>
                  <p className="flex justify-between"><span>Active Sellers:</span> <span className="font-bold text-emerald-600">{participantRows.filter((p: any) => p.status === 'ACCEPTED').length}</span></p>
                  <p className="flex justify-between"><span>Total Bids Placed:</span> <span className="font-bold text-zinc-800">{bidRows.length}</span></p>
                  <p className="flex justify-between"><span>Auto Extensions Triggered:</span> <span className="font-bold text-zinc-800">{extensionCount} / {maxExtensions}</span></p>
                </div>
              ) : (
                <form onSubmit={submit} className="space-y-4">
                  {/* Quick Bid Helper Button */}
                  {live && minNextBid > 0 && (
                    <button
                      type="button"
                      onClick={() => setAmount(String(minNextBid))}
                      className="w-full rounded-lg border border-zinc-200 bg-zinc-50 p-2 text-center text-[10px] font-black text-emerald-600 hover:bg-zinc-100 hover:border-emerald-300 transition duration-200"
                    >
                      Fill Next Minimum Bid: {formatCurrency(minNextBid)}
                    </button>
                  )}

                  <label className="block">
                    <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-zinc-500">Your Commercial Offer Amount</span>
                    <input
                      value={amount}
                      onChange={event => setAmount(event.target.value)}
                      name="amount"
                      type="number"
                      min="1"
                      max={minNextBid > 0 ? minNextBid : undefined}
                      step="0.01"
                      required
                      placeholder={minNextBid > 0 ? `Max permitted: ${minNextBid}` : 'Enter amount'}
                      className="h-11 w-full rounded-xl border border-zinc-200 bg-zinc-50 px-3.5 text-sm font-bold text-zinc-900 outline-none transition focus:bg-white focus:border-red-500 focus:ring-1 focus:ring-red-500/30"
                      disabled={!live || bid.isPending || participant?.status === 'DISQUALIFIED'}
                    />
                  </label>

                  {/* Terms acceptance */}
                  <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-zinc-200 bg-zinc-50 p-3 transition hover:bg-zinc-100/50">
                    <input
                      type="checkbox"
                      checked={acceptedTerms}
                      onChange={e => setAcceptedTerms(e.target.checked)}
                      className="mt-0.5 h-4 w-4 rounded border-zinc-300 bg-white text-red-600 focus:ring-red-500/40"
                      disabled={!live || bid.isPending || participant?.status === 'DISQUALIFIED'}
                    />
                    <span className="text-[10px] font-semibold text-zinc-500 leading-normal select-none">
                      I accept the reverse auction terms, bidding rules, and confirm our capacity to supply.
                    </span>
                  </label>

                  <Button 
                    disabled={!live || bid.isPending || !acceptedTerms || participant?.status === 'DISQUALIFIED'} 
                    className="h-11 w-full rounded-xl bg-gradient-to-r from-red-600 to-red-700 hover:from-red-500 hover:to-red-600 text-white font-extrabold shadow-lg shadow-red-600/10 transition duration-300"
                  >
                    <Send className="mr-1.5 h-3.5 w-3.5" /> {bid.isPending ? 'Submitting...' : 'SUBMIT LOWER BID'}
                  </Button>

                  {/* Confirmation Dialog Panel */}
                  {showConfirmModal && (
                    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4 text-xs font-semibold text-zinc-700 space-y-3 shadow-md">
                      <p className="font-bold text-zinc-900">Confirm Downward Bid</p>
                      <p className="leading-relaxed">Are you sure you want to submit a downward commercial bid of <span className="font-black text-red-600">{formatCurrency(Number(amount))}</span>? This is a legally binding contract submission.</p>
                      <div className="flex gap-2">
                        <Button size="sm" type="button" onClick={confirmSubmit} className="bg-red-600 hover:bg-red-500 text-white font-bold">Confirm & Submit</Button>
                        <Button size="sm" type="button" variant="outline" onClick={() => setShowConfirmModal(false)} className="border-zinc-200 bg-white text-zinc-600 hover:bg-zinc-50">Cancel</Button>
                      </div>
                    </div>
                  )}
                </form>
              )}
            </CardContent>
          </Card>

          {/* Compliance & Audit information */}
          <Card className="border-zinc-200 bg-white shadow-md overflow-hidden">
            <CardContent className="p-6 space-y-4">
              <div className="flex items-center gap-3 border-b border-zinc-200 pb-4 mb-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <h2 className="text-sm font-black uppercase tracking-wider text-zinc-900">Compliance & Audit</h2>
              </div>

              <div className="space-y-2 text-xs font-semibold text-zinc-500">
                <div className="flex justify-between"><span>Server Validation:</span> <span className="text-emerald-600 font-bold">Active</span></div>
                <div className="flex justify-between"><span>Audit Log ID:</span> <span className="text-zinc-800 font-mono">MD-RA-{id}</span></div>
                <div className="flex justify-between"><span>Auto Extension Window:</span> <span className="text-zinc-800">{auction.autoExtensionEnabled ? `${auction.autoExtensionWindowMinutes || 0} min` : 'Disabled'}</span></div>
                <div className="flex justify-between"><span>Extension Period:</span> <span className="text-zinc-800">{auction.autoExtensionEnabled ? `${auction.autoExtensionByMinutes || 0} min` : 'Disabled'}</span></div>
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>

      {/* Rules Summary Card */}
      <Card className="border-zinc-200 bg-white shadow-md overflow-hidden">
        <CardContent className="p-6">
          <div className="flex items-center gap-3 border-b border-zinc-200 pb-4 mb-4">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-zinc-100 text-zinc-600">
              <Gavel className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-sm font-black uppercase tracking-wider text-zinc-900">Reverse Auction Rules & Parameters</h2>
              <p className="text-[11px] text-zinc-500 font-semibold mt-0.5">Verified parameters and commercial conditions applied to bid packets.</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4">
            <RuleItem label="Start Price" value={formatCurrency(auction.startPrice)} />
            <RuleItem label="Reserve Price" value={auction.reservePrice ? formatCurrency(auction.reservePrice) : 'Not configured'} />
            <RuleItem label="Auto Extension" value={auction.autoExtensionEnabled ? 'Enabled' : 'Disabled'} />
            <RuleItem label="Extension Limit" value={auction.autoExtensionEnabled ? `${auction.maxAutoExtensions || 0} times` : 'N/A'} />
            <RuleItem label="Auction Start" value={formatDateTime(auction.startTime)} className="sm:col-span-2" />
            <RuleItem label="Auction End" value={formatDateTime(auction.endTime)} className="sm:col-span-2" />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatsCard({ icon: Icon, label, value, color }: { icon: any; label: string; value: string; color: 'emerald' | 'amber' | 'blue' | 'cyan' }) {
  const colorMap = {
    emerald: 'text-emerald-600 bg-emerald-50 border-emerald-200/50',
    amber: 'text-amber-600 bg-amber-50 border-amber-200/50',
    blue: 'text-blue-600 bg-blue-50 border-blue-200/50',
    cyan: 'text-cyan-600 bg-cyan-50 border-cyan-200/50',
  };

  return (
    <Card className="border-zinc-200 bg-white shadow-md overflow-hidden transition hover:border-zinc-300 duration-200">
      <CardContent className="p-5 flex justify-between items-start gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</p>
          <p className={cn("text-lg font-mono font-extrabold truncate", colorMap[color].split(' ')[0])}>{value}</p>
        </div>
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border", colorMap[color])}>
          <Icon className="h-4.5 w-4.5" />
        </span>
      </CardContent>
    </Card>
  );
}

function BidSpec({ label, value, color }: { label: string; value: string; color?: 'red' }) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-zinc-500">{label}</p>
      <p className={cn("mt-1.5 text-xs font-mono font-extrabold", color === 'red' ? 'text-red-650' : 'text-zinc-800')}>{value}</p>
    </div>
  );
}

function RuleItem({ label, value, className }: { label: string; value: string; className?: string }) {
  return (
    <div className={cn("rounded-xl border border-zinc-200 bg-zinc-50 p-3.5", className)}>
      <p className="text-[10px] font-black uppercase tracking-widest text-zinc-500">{label}</p>
      <p className="mt-2 text-xs font-bold text-zinc-800 leading-normal">{value}</p>
    </div>
  );
}
