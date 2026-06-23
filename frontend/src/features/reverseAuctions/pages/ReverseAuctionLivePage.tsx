import { FormEvent, useState } from 'react';
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
  LineChart,
  RadioTower,
  RefreshCw,
  Send,
  ShieldCheck,
  Trophy,
  Users,
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDateTime, formatNumber, formatRelative } from '../../shared/format';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../../hooks/useAuth';
import { reverseAuctionApi, type ReverseAuction, type ReverseAuctionBid, type ReverseAuctionParticipant } from '../api';

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

export default function ReverseAuctionLivePage({ id }: { id: number }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const isBuyerOrAdmin = user?.role === 'buyer' || user?.role === 'admin' || user?.role === 'master_admin';
  const [amount, setAmount] = useState('');
  const summary = useQuery({
    queryKey: ['reverse-auction-live', id],
    queryFn: async () => {
      const result = await reverseAuctionApi.liveSummary(id);
      liveSummaryCache.set(id, result);
      return result;
    },
    refetchInterval: 5_000,
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
    refetchInterval: 10_000,
    enabled: !summary.isError,
  });
  const bids = useQuery({
    queryKey: ['reverse-auction-bids', id],
    queryFn: () => reverseAuctionApi.bids(id),
    refetchInterval: 5_000,
    enabled: !summary.isError,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['reverse-auction-live', id] });
    qc.invalidateQueries({ queryKey: ['reverse-auction-participants', id] });
    qc.invalidateQueries({ queryKey: ['reverse-auction-bids', id] });
  };

  const bid = useMutation({
    mutationFn: (nextAmount: number) => reverseAuctionApi.placeBid(id, nextAmount),
    onSuccess: () => {
      setAmount('');
      invalidate();
    },
  });

  const auction = (summary.data?.auction || liveSummaryCache.get(id)?.auction) as ReverseAuction | undefined;
  
  const loading = summary.isLoading && !auction;

  if (loading) return <LoadingState label="Loading live auction..." />;
  if (summary.error) return <InlineError message={(summary.error as Error).message} onRetry={() => summary.refetch()} />;

  if (!auction) return <EmptyState title="Auction not found" />;

  const participant = (summary.data?.participant || liveSummaryCache.get(id)?.participant) as ReverseAuctionParticipant | null | undefined;
  const participantRows = participants.data?.participants || [];
  const bidRows = (bids.data?.bids || []).slice().sort((a, b) => new Date(b.submittedAt || 0).getTime() - new Date(a.submittedAt || 0).getTime());
  const status = getStatus(auction);
  const live = isAuctionLive(auction, summary.data?.serverTime || liveSummaryCache.get(id)?.serverTime);
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
    if (!Number.isFinite(nextAmount)) return;
    bid.mutate(nextAmount);
  };

  return (
    <div className="space-y-4 pb-6">
      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <Link href="/reverse-auctions" className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-600 hover:border-[#12335f] hover:text-[#12335f]">
                <ArrowLeft className="mr-1 h-4 w-4" /> Auctions
              </Link>
              <StatusPill status={status} />
              {auction.auctionCode && <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-[#c86413]">{auction.auctionCode}</span>}
              {auction.referenceNo && <span className="rounded-md border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{auction.referenceNo}</span>}
            </div>
            <p className="mt-3 text-[10px] font-black uppercase tracking-widest text-[#12335f]">Live Reverse Auction</p>
            <h1 className="mt-1 text-2xl font-black tracking-tight text-slate-950 text-wrap-anywhere">{auction.title || `Auction #${id}`}</h1>
            <p className="mt-2 max-w-4xl text-sm font-semibold leading-relaxed text-slate-600">
              {auction.description || 'Participate in a price-only reverse auction with server-time validation, rank tracking, decrement controls, and audit-backed bid submission.'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="outline" onClick={invalidate} disabled={summary.isFetching}>
              <RefreshCw className={cn('mr-2 h-4 w-4', summary.isFetching && 'animate-spin')} /> Refresh
            </Button>
            <Link href={`/reverse-auctions/${id}`}><Button type="button" variant="outline">Details</Button></Link>
            <Link href={`/reverse-auctions/${id}/results`}><Button type="button" variant="secondary">Results</Button></Link>
          </div>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <Metric icon={IndianRupee} label="Current lowest" value={currentLowest > 0 ? formatCurrency(currentLowest) : 'No bids yet'} tone="green" />
          <Metric icon={Trophy} label="My rank" value={participant?.currentRank ? `L${participant.currentRank}` : 'Not ranked'} tone="amber" />
          <Metric icon={LineChart} label="Savings from start" value={savings > 0 ? `${formatCurrency(savings)} (${savingsPercent.toFixed(1)}%)` : 'Not established'} tone="blue" />
          <Metric icon={Clock3} label="Ends" value={formatRelative(auction.endTime)} hint={formatDateTime(auction.endTime)} tone="slate" />
          <Metric icon={RadioTower} label="Server time" value={formatDateTime(summary.data?.serverTime)} tone="slate" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1fr_390px]">
        <main className="space-y-4">
          <section className="grid gap-4 lg:grid-cols-2">
            <AuctionRulesCard auction={auction} minimumNextBid={minNextBid} live={live} />
            <SellerPositionCard participant={participant || null} myBestBid={myBestBid} latestBid={latestBid} bidCount={bidRows.length} />
          </section>

          <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <SectionHeader icon={History} title="Bid History And Price Movement" subtitle="Seller view shows your own bid log; buyer/admin view may include all valid bids." />
                {bidRows.length === 0 ? (
                  <EmptyPanel title="No bids submitted yet" description="Once bidding starts, valid submissions and rank-at-submission details will appear here." />
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[640px] text-left text-xs">
                      <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                        <tr>
                          <th className="px-3 py-2">S.No.</th>
                          {isBuyerOrAdmin && <th className="px-3 py-2">Seller Organization</th>}
                          <th className="px-3 py-2">Bid amount</th>
                          <th className="px-3 py-2">Rank</th>
                          <th className="px-3 py-2">Submitted</th>
                          <th className="px-3 py-2">Validity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {bidRows.slice(0, 10).map((row, index) => (
                          <tr key={row.id} className="hover:bg-slate-50">
                            <td className="px-3 py-2 font-black text-slate-500">{index + 1}</td>
                            {isBuyerOrAdmin && <td className="px-3 py-2 font-bold text-slate-700">{row.sellerOrgName || `Organization #${row.sellerOrgId}`}</td>}
                            <td className="px-3 py-2 font-black text-[#12335f]">{formatCurrency(getBidAmount(row))}</td>
                            <td className="px-3 py-2 font-semibold text-slate-700">{row.rankAtSubmission ? `L${row.rankAtSubmission}` : '-'}</td>
                            <td className="px-3 py-2 font-semibold text-slate-600">{formatDateTime(row.submittedAt)}</td>
                            <td className="px-3 py-2"><span className={cn('rounded-full px-2 py-1 text-[10px] font-black uppercase', row.isValid === false ? 'bg-red-50 text-red-700' : 'bg-emerald-50 text-emerald-700')}>{row.isValid === false ? 'Invalid' : 'Valid'}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </CardContent>
            </Card>

            <Card className="border-slate-200 shadow-sm">
              <CardContent className="p-4">
                <SectionHeader icon={Users} title="Participation Snapshot" subtitle="Supplier identities remain protected unless buyer enables disclosure." />
                <div className="mt-4 grid gap-2">
                  <InfoRow label="Invited/visible participants" value={formatNumber(participantRows.length)} />
                  <InfoRow label="My participant status" value={participant?.status || 'Not available'} />
                  <InfoRow label="My last bid" value={participant?.lastBidAmount ? formatCurrency(participant.lastBidAmount) : myBestBid ? formatCurrency(myBestBid) : '-'} />
                  <InfoRow label="Visibility mode" value={auction.visibilityMode || (auction.allowCompetitorNames ? 'Competitor names visible' : 'Anonymous rank and price')} />
                </div>
                <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3">
                  <div className="flex items-start gap-2">
                    <EyeOff className="mt-0.5 h-4 w-4 shrink-0 text-slate-500" />
                    <p className="text-xs font-semibold leading-relaxed text-slate-600">
                      Competitor identity is hidden in seller view. Use rank, minimum next bid, decrement rule, and your own margin plan before submitting a lower offer.
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </section>
        </main>

        <aside className="space-y-4 xl:sticky xl:top-4 xl:self-start">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="space-y-4 p-4">
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Submit Lower Bid</p>
                <h2 className="mt-1 text-base font-black text-slate-950">Bidding Console</h2>
                <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">
                  Bid must be lower than or equal to the permitted next amount. Final validation happens on server time under an auction lock.
                </p>
              </div>

              {!live && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                    <p className="text-xs font-bold leading-relaxed text-amber-800">
                      Bidding is disabled because this auction is {status.toLowerCase().replace(/_/g, ' ')} or outside the scheduled time window.
                    </p>
                  </div>
                </div>
              )}

              {bid.error && <div className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{(bid.error as Error).message}</div>}

              <div className="grid grid-cols-2 gap-2">
                <BidGuardrail label="Minimum next bid" value={minNextBid > 0 ? formatCurrency(minNextBid) : '-'} />
                <BidGuardrail label="Decrement" value={decrement > 0 ? formatCurrency(decrement) : '-'} />
                <BidGuardrail label="Reserve price" value={auction.reservePrice ? formatCurrency(auction.reservePrice) : 'Not shown'} />
                <BidGuardrail label="Auto extensions" value={auction.autoExtensionEnabled ? `${extensionCount}/${maxExtensions}` : 'Disabled'} />
              </div>

              <form onSubmit={submit} className="space-y-3">
                <label className="block">
                  <span className="mb-1 block text-[10px] font-black uppercase tracking-widest text-slate-500">Your bid amount</span>
                  <input
                    value={amount}
                    onChange={event => setAmount(event.target.value)}
                    name="amount"
                    type="number"
                    min="1"
                    max={minNextBid > 0 ? minNextBid : undefined}
                    step="0.01"
                    required
                    placeholder={minNextBid > 0 ? `Up to ${minNextBid}` : 'Enter amount'}
                    className="h-11 w-full rounded-md border border-slate-200 px-3 text-sm font-black text-slate-900 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10"
                    disabled={!live || bid.isPending}
                  />
                </label>
                <Button disabled={!live || bid.isPending} className="h-11 w-full rounded-md">
                  <Send className="mr-2 h-4 w-4" /> {bid.isPending ? 'Submitting...' : 'Submit bid'}
                </Button>
              </form>
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4">
              <SectionHeader icon={ShieldCheck} title="Compliance And Audit" subtitle="Every valid bid is recorded with timestamp, device context, and rank recalculation." />
              <div className="mt-4 space-y-2">
                <InfoRow label="Server validation" value="Enabled" />
                <InfoRow label="Auction lock" value="Enabled" />
                <InfoRow label="Auto extension window" value={auction.autoExtensionEnabled ? `${auction.autoExtensionWindowMinutes || 0} min` : 'Disabled'} />
                <InfoRow label="Extension duration" value={auction.autoExtensionEnabled ? `${auction.autoExtensionByMinutes || 0} min` : 'Disabled'} />
              </div>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

function SectionHeader({ icon: Icon, title, subtitle }: { icon: typeof Activity; title: string; subtitle: string }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-[#12335f] text-white">
        <Icon className="h-4 w-4" />
      </span>
      <div>
        <h2 className="text-sm font-black text-slate-950">{title}</h2>
        <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-500">{subtitle}</p>
      </div>
    </div>
  );
}

function AuctionRulesCard({ auction, minimumNextBid, live }: { auction: ReverseAuction; minimumNextBid: number; live: boolean }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <SectionHeader icon={Gavel} title="Auction Rules" subtitle="Price-only reverse auction guardrails applied before server accepts a bid." />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <InfoRow label="Starting price" value={formatCurrency(auction.startPrice)} />
          <InfoRow label="Minimum next bid" value={minimumNextBid > 0 ? formatCurrency(minimumNextBid) : '-'} />
          <InfoRow label="Minimum decrement" value={auction.minDecrementAmount || auction.minDecrement ? formatCurrency(auction.minDecrementAmount ?? auction.minDecrement) : '-'} />
          <InfoRow label="Percent decrement" value={auction.minDecrementPercent ? `${auction.minDecrementPercent}%` : 'Not configured'} />
          <InfoRow label="Auction start" value={formatDateTime(auction.startTime)} />
          <InfoRow label="Auction end" value={formatDateTime(auction.endTime)} />
        </div>
        <div className={cn('mt-4 rounded-md border p-3 text-xs font-semibold leading-relaxed', live ? 'border-emerald-200 bg-emerald-50 text-emerald-800' : 'border-slate-200 bg-slate-50 text-slate-600')}>
          {live ? 'Auction is live. Submit only after checking your margin, logistics cost, and compliance capability.' : 'Auction is not live. You can review rules and history, but bid submission is locked.'}
        </div>
      </CardContent>
    </Card>
  );
}

function SellerPositionCard({ participant, myBestBid, latestBid, bidCount }: { participant: ReverseAuctionParticipant | null; myBestBid: number; latestBid?: ReverseAuctionBid; bidCount: number }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <SectionHeader icon={Trophy} title="My Live Position" subtitle="Rank is recalculated after valid lower bids are submitted." />
        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <InfoRow label="Current rank" value={participant?.currentRank ? `L${participant.currentRank}` : 'Not ranked'} />
          <InfoRow label="Participant status" value={participant?.status || 'Not available'} />
          <InfoRow label="My best bid" value={myBestBid > 0 ? formatCurrency(myBestBid) : '-'} />
          <InfoRow label="My bid count" value={formatNumber(bidCount)} />
          <InfoRow label="Latest submission" value={latestBid?.submittedAt ? formatDateTime(latestBid.submittedAt) : '-'} />
          <InfoRow label="Latest rank" value={latestBid?.rankAtSubmission ? `L${latestBid.rankAtSubmission}` : '-'} />
        </div>
      </CardContent>
    </Card>
  );
}

function Metric({ icon: Icon, label, value, hint, tone }: { icon: typeof IndianRupee; label: string; value: string; hint?: string; tone: 'green' | 'amber' | 'blue' | 'slate' }) {
  const toneClass = {
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-blue-50 text-blue-700',
    slate: 'bg-slate-100 text-slate-700',
  }[tone];
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
            <p className="mt-2 text-base font-black text-slate-950 text-wrap-anywhere">{value}</p>
            {hint && <p className="mt-1 text-[10px] font-bold text-slate-400">{hint}</p>}
          </div>
          <span className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-md', toneClass)}>
            <Icon className="h-4 w-4" />
          </span>
        </div>
      </CardContent>
    </Card>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-black text-slate-900 text-wrap-anywhere">{value}</p>
    </div>
  );
}

function BidGuardrail({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 px-3 py-2">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-black text-slate-950">{value}</p>
    </div>
  );
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="mt-4 rounded-lg border border-dashed border-slate-300 bg-slate-50 p-6 text-center">
      <p className="text-sm font-black text-slate-900">{title}</p>
      <p className="mt-1 text-xs font-semibold text-slate-500">{description}</p>
    </div>
  );
}

function StatusPill({ status }: { status: string }) {
  const live = status === 'LIVE';
  const closed = ['CLOSED', 'AWARD_RECOMMENDED', 'CANCELLED'].includes(status);
  return (
    <span className={cn(
      'inline-flex items-center rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest',
      live ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : closed ? 'border-slate-200 bg-slate-100 text-slate-700' : 'border-amber-200 bg-amber-50 text-amber-700'
    )}>
      {live && <span className="mr-1.5 h-1.5 w-1.5 rounded-full bg-emerald-600" />}
      {status.replace(/_/g, ' ')}
    </span>
  );
}
