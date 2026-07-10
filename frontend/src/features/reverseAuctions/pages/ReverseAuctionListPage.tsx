import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Clock3, Filter, Gavel, Plus, RadioTower, RefreshCw, Search, Trophy, Building2, UserCheck, Eye, ClipboardList, ArrowLeft, type LucideIcon } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate, formatDateTime, formatNumber, formatRelative } from '../../shared/format';
import { Pagination } from '../../shared/Pagination';
import { usePagination, useResponsiveViewMode } from '../../shared/hooks';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { reverseAuctionApi, type ReverseAuction } from '../api';
import { useAuth } from '../../../hooks/useAuth';

const statusOptions = ['All', 'DRAFT', 'SCHEDULED', 'LIVE', 'PAUSED', 'CLOSED', 'AWARD_RECOMMENDED', 'CANCELLED'];
const priceBands = [
  { label: 'All values', value: 'all' },
  { label: 'Up to Rs. 1L', value: 'lt1l' },
  { label: 'Rs. 1L - Rs. 10L', value: '1l-10l' },
  { label: 'Above Rs. 10L', value: 'gt10l' }
];

let globalAuctionsCache: { auctions: ReverseAuction[]; total: number } | null = null;

export default function ReverseAuctionListPage() {
  const { user } = useAuth();
  const isSeller = user?.role === 'seller';
  const [viewMode, setViewMode] = useResponsiveViewMode('reverse-auctions:view-mode');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [priceBand, setPriceBand] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');

  const queryClient = useQueryClient();

  const query = useQuery<{ auctions: ReverseAuction[]; total: number }>({
    queryKey: ['reverse-auctions', 'dashboard'],
    queryFn: async () => {
      const result = await reverseAuctionApi.list({ pageSize: 100 });
      globalAuctionsCache = result;
      return result;
    },
    staleTime: 45_000,
    refetchOnWindowFocus: false,
    placeholderData: (previous) => {
      if (previous !== undefined) return previous;
      if (globalAuctionsCache !== null) return globalAuctionsCache;
      const cached = queryClient.getQueryData<{ auctions: ReverseAuction[]; total: number }>(['reverse-auctions', 'dashboard']);
      if (cached !== undefined) return cached;
      return undefined;
    }
  });

  const auctions = query.data?.auctions || globalAuctionsCache?.auctions || [];
  const filteredAuctions = useMemo(() => {
    const term = search.trim().toLowerCase();
    const now = Date.now();

    return auctions.filter(auction => {
      const normalizedStatus = getAuctionStatus(auction);
      const start = new Date(auction.startTime).getTime();
      const end = new Date(auction.endTime).getTime();
      const price = Number(auction.startPrice || 0);
      const text = [auction.title, auction.auctionCode, auction.description, auction.id].join(' ').toLowerCase();

      if (term && !text.includes(term)) return false;
      if (status !== 'All' && normalizedStatus !== status) return false;
      if (timeFilter === 'liveNow' && !(start <= now && end >= now)) return false;
      if (timeFilter === 'upcoming' && !(start > now)) return false;
      if (timeFilter === 'closed' && !(end < now || ['CLOSED', 'AWARD_RECOMMENDED', 'CANCELLED'].includes(normalizedStatus))) return false;
      if (priceBand === 'lt1l' && !(price < 100000)) return false;
      if (priceBand === '1l-10l' && !(price >= 100000 && price <= 1000000)) return false;
      if (priceBand === 'gt10l' && !(price > 1000000)) return false;
      return true;
    });
  }, [auctions, priceBand, search, status, timeFilter]);

  const stats = useMemo(() => {
    const live = auctions.filter(auction => getAuctionStatus(auction) === 'LIVE').length;
    const scheduled = auctions.filter(auction => getAuctionStatus(auction) === 'SCHEDULED').length;
    const closed = auctions.filter(auction => ['CLOSED', 'AWARD_RECOMMENDED'].includes(getAuctionStatus(auction))).length;
    const actionRequired = auctions.filter(auction => ['LIVE', 'PAUSED'].includes(getAuctionStatus(auction))).length;
    const savings = auctions.reduce((sum, auction) => {
      const start = Number(auction.startPrice || 0);
      const current = Number(auction.currentLowestAmount || 0);
      return current > 0 && start > current ? sum + (start - current) : sum;
    }, 0);
    return { total: auctions.length, live, scheduled, closed, actionRequired, savings };
  }, [auctions]);

  const nextAuction = useMemo(() => {
    const now = Date.now();
    return auctions
      .filter(auction => new Date(auction.endTime).getTime() >= now)
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())[0];
  }, [auctions]);

  const { page, pageSize, pageItems, total, setPage, setPageSize } = usePagination(filteredAuctions, 10);

  const loading = query.isLoading && auctions.length === 0;

  if (loading) return <LoadingState label="Loading reverse auctions..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href={isSeller ? "/dashboard" : "/buyer/dashboard"} className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-2.5 text-xs font-black text-slate-600 hover:border-[#12335f] hover:text-[#12335f]">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to Dashboard
        </Link>
      </div>
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">
            {isSeller ? 'Sourcing Portal' : 'Procurement Sourcing'}
          </p>
          <h1 className="text-2xl font-black text-slate-950">
            {isSeller ? 'Unified Sourcing Auctions' : 'Reverse Auctions'}
          </h1>
          <p className="mt-1 max-w-3xl text-xs font-semibold leading-relaxed text-slate-500">
            {isSeller
              ? 'Review upcoming auction windows, join live bidding consoles, and track your latest commercial position from one screen.'
              : 'Create, monitor, close, and recommend L1 awards with clear visibility into schedule, rules, participation, and savings.'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} size="sm" />
          <Button type="button" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          {!isSeller && (
            <Link href="/buyer/procurement/create">
              <Button type="button"><Plus className="mr-2 h-4 w-4" />Create Procurement</Button>
            </Link>
          )}
        </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_1fr]">
          <GuideTile
            title={stats.live > 0 ? 'Live auction needs attention' : 'No live auction right now'}
            description={stats.live > 0 ? 'Use the Live button to open the server-time bidding screen.' : 'Use timeline filters to prepare for upcoming sessions.'}
          />
          <GuideTile
            title={nextAuction ? `Next window: ${formatRelative(nextAuction.startTime)}` : 'No upcoming window'}
            description={nextAuction ? `${nextAuction.auctionCode || `RA-${nextAuction.id}`} starts ${formatDateTime(nextAuction.startTime)}.` : 'Create or schedule a reverse auction from procurement wizard.'}
          />
          <GuideTile
            title={`${formatNumber(filteredAuctions.length)} visible after filters`}
            description="Search and filters apply locally after first load, so switching views stays fast."
          />
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Total auctions" value={formatNumber(stats.total)} icon={Gavel} tone="navy" />
        <KpiTile label="Live now" value={formatNumber(stats.live)} icon={RadioTower} tone="green" />
        <KpiTile label={isSeller ? 'Action windows' : 'Scheduled'} value={formatNumber(isSeller ? stats.actionRequired : stats.scheduled)} icon={Clock3} tone="amber" />
        <KpiTile label="Tracked savings" value={formatCurrency(stats.savings)} icon={Trophy} tone="blue" />
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[minmax(240px,1fr)_180px_180px_180px_auto]">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="Search auction code, title, description..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-9 pr-3 text-sm font-semibold text-slate-700 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10"
            />
          </div>
          <Select value={status} onChange={setStatus} options={statusOptions.map(value => ({ label: value === 'All' ? 'All statuses' : prettifyStatus(value), value }))} />
          <Select value={timeFilter} onChange={setTimeFilter} options={[
            { label: 'All timelines', value: 'all' },
            { label: 'Live now', value: 'liveNow' },
            { label: 'Upcoming', value: 'upcoming' },
            { label: 'Closed', value: 'closed' }
          ]} />
          <Select value={priceBand} onChange={setPriceBand} options={priceBands} />
          <Button
            type="button"
            variant="outline"
            onClick={() => {
              setSearch('');
              setStatus('All');
              setTimeFilter('all');
              setPriceBand('all');
            }}
            className="h-10"
          >
            <Filter className="mr-2 h-4 w-4" />Reset
          </Button>
        </div>
      </div>

      {query.error && <InlineError message={(query.error as Error).message} onRetry={() => query.refetch()} />}

      {filteredAuctions.length === 0 ? (
        <EmptyState
          title="No reverse auctions found"
          description="Change filters or create a new auction to invite sellers into a live L1 event."
          icon={Gavel}
        />
      ) : viewMode === 'grid' ? (
        <div className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {pageItems.map(auction => <AuctionCard key={auction.id} auction={auction} isSeller={isSeller} />)}
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="auctions" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                {isSeller ? (
                  <tr>
                    <th className="w-16 px-4 py-3">S.No.</th>
                    <th className="px-4 py-3">Auction Details</th>
                    <th className="px-4 py-3">Buyer Organization</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Timeline</th>
                    <th className="px-4 py-3 text-right">My Last Bid</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                ) : (
                  <tr>
                    <th className="w-16 px-4 py-3">S.No.</th>
                    <th className="px-4 py-3">Auction Details</th>
                    <th className="px-4 py-3">Linked Sourcing Event</th>
                    <th className="px-4 py-3">Method</th>
                    <th className="px-4 py-3">Status</th>
                    <th className="px-4 py-3">Timeline</th>
                    <th className="px-4 py-3 text-right">Start Price</th>
                    <th className="px-4 py-3 text-right">Current L1</th>
                    <th className="px-4 py-3 text-right">Actions</th>
                  </tr>
                )}
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageItems.map((auction, index) => {
                  const statusVal = getAuctionStatus(auction);
                  return (
                    <tr key={auction.id} className="align-top transition hover:bg-slate-50/80">
                      <td className="px-4 py-3 text-xs font-black text-slate-500">{(page - 1) * pageSize + index + 1}</td>
                      <td className="max-w-sm px-4 py-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{auction.auctionCode || `RA-${auction.id}`}</p>
                        <p className="mt-1 text-sm font-black text-slate-950 text-wrap-anywhere">{auction.title || 'Reverse auction'}</p>
                        {auction.description && <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{auction.description}</p>}
                      </td>
                      {isSeller ? (
                        <>
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            <span className="inline-flex items-center gap-1">
                              <Building2 className="h-3.5 w-3.5 text-slate-400" />
                              {auction.buyerOrgId ? `Buyer Org #${auction.buyerOrgId}` : 'Verified Buyer'}
                            </span>
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={statusVal} /></td>
                          <td className="px-4 py-3 font-semibold text-slate-600">
                            <p>{formatDateTime(auction.startTime)}</p>
                            <p className="mt-1 text-slate-400">to {formatDateTime(auction.endTime)}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-black text-slate-600">
                            <span className="text-[10px] uppercase font-bold text-slate-400">See Live Screen</span>
                          </td>
                        </>
                      ) : (
                        <>
                          <td className="px-4 py-3 font-semibold text-slate-700">
                            {auction.referenceNo ? (
                              <span className="inline-flex rounded bg-[#12335f]/5 px-2 py-1 text-[10px] font-bold text-[#12335f]">
                                {auction.referenceNo}
                              </span>
                            ) : (
                              <span className="text-slate-400 font-medium">No link</span>
                            )}
                          </td>
                          <td className="px-4 py-3 font-semibold text-slate-600">
                            {auction.tenderId ? 'Bid with Reverse Auction' : 'Standalone Reverse Auction'}
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={statusVal} /></td>
                          <td className="px-4 py-3 font-semibold text-slate-600">
                            <p>{formatDateTime(auction.startTime)}</p>
                            <p className="mt-1 text-slate-400">to {formatDateTime(auction.endTime)}</p>
                          </td>
                          <td className="px-4 py-3 text-right font-black text-slate-900">{formatCurrency(auction.startPrice)}</td>
                          <td className="px-4 py-3 text-right font-black text-emerald-700">{auction.currentLowestAmount ? formatCurrency(auction.currentLowestAmount) : '-'}</td>
                        </>
                      )}
                      <td className="px-4 py-3">
                        <AuctionActions auction={auction} isSeller={isSeller} align="right" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="auctions" />
        </div>
      )}
    </div>
  );
}

function KpiTile({ label, value, icon: Icon, tone }: { label: string; value: string; icon: LucideIcon; tone: 'navy' | 'green' | 'amber' | 'blue' }) {
  const toneClass = {
    navy: 'bg-[#12335f] text-white',
    green: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    blue: 'bg-sky-50 text-sky-700'
  }[tone];
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-2 text-xl font-black text-slate-950">{value}</p>
        </div>
        <div className={`flex h-10 w-10 items-center justify-center rounded-lg ${toneClass}`}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </div>
  );
}

function GuideTile({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-xs font-black text-slate-900">{title}</p>
      <p className="mt-1 text-[11px] font-semibold leading-relaxed text-slate-500">{description}</p>
    </div>
  );
}

function Select({ value, onChange, options }: { value: string; onChange: (value: string) => void; options: Array<{ label: string; value: string }> }) {
  return (
    <select
      value={value}
      onChange={event => onChange(event.target.value)}
      className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10"
    >
      {options.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
    </select>
  );
}

function AuctionCard({ auction, isSeller }: { auction: ReverseAuction; isSeller?: boolean }) {
  const status = getAuctionStatus(auction);
  const currentLowest = Number(auction.currentLowestAmount || auction.currentLowestBid || auction.currentBid || 0);
  const savings = Number(auction.startPrice || 0) > currentLowest && currentLowest > 0 ? Number(auction.startPrice || 0) - currentLowest : 0;
  return (
    <Card className="h-full border-slate-200 shadow-sm">
      <CardContent className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{auction.auctionCode || `Auction #${auction.id}`}</p>
            <h2 className="mt-1 text-base font-black text-slate-950 text-wrap-anywhere">{auction.title || 'Reverse auction'}</h2>
          </div>
          <StatusBadge status={status} />
        </div>
        <div className="mt-3 rounded-md border border-slate-200 bg-slate-50 p-2.5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">
            {status === 'LIVE' ? 'Join live console' : status === 'SCHEDULED' ? `Starts ${formatRelative(auction.startTime)}` : `Status: ${prettifyStatus(status)}`}
          </p>
          <p className="mt-1 text-xs font-semibold text-slate-600">
            {savings > 0 ? `${formatCurrency(savings)} saved from opening price.` : 'No confirmed price movement yet.'}
          </p>
        </div>
        {isSeller ? (
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <Metric label="Buyer Organization" value={auction.buyerOrgId ? `Buyer Org #${auction.buyerOrgId}` : 'Verified Buyer'} />
            <Metric label="Start" value={formatDate(auction.startTime)} />
            <Metric label="End" value={formatDate(auction.endTime)} />
            <Metric label="My Last Bid" value="See Live Screen" />
          </div>
        ) : (
          <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
            <Metric label="Starting price" value={formatCurrency(auction.startPrice)} />
            <Metric label="Current L1" value={auction.currentLowestAmount ? formatCurrency(auction.currentLowestAmount) : '-'} />
            <Metric label="Start" value={formatDate(auction.startTime)} />
            <Metric label="End" value={formatDate(auction.endTime)} />
          </div>
        )}
        {auction.description && <p className="mt-4 line-clamp-2 text-xs font-semibold text-slate-500">{auction.description}</p>}
        <div className="mt-auto pt-4">
          <AuctionActions auction={auction} isSeller={isSeller} />
        </div>
      </CardContent>
    </Card>
  );
}

function AuctionActions({ auction, isSeller, align = 'left' }: { auction: ReverseAuction; isSeller?: boolean; align?: 'left' | 'right' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
      <Link href={`/reverse-auctions/${auction.id}`}><Button type="button" size="sm" variant="outline">Details</Button></Link>
      <Link href={`/reverse-auctions/${auction.id}/live`}><Button type="button" size="sm"><RadioTower className="mr-1 h-3.5 w-3.5" />Live</Button></Link>
      {!isSeller && (
        <Link href={`/reverse-auctions/${auction.id}/results`}><Button type="button" size="sm" variant="secondary">Results</Button></Link>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900 text-wrap-anywhere">{value}</p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone = status === 'LIVE'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : status === 'SCHEDULED'
      ? 'border-blue-200 bg-blue-50 text-blue-700'
      : status === 'CLOSED' || status === 'AWARD_RECOMMENDED'
        ? 'border-slate-200 bg-slate-100 text-slate-700'
        : 'border-amber-200 bg-amber-50 text-amber-700';
  return (
    <span className={`inline-flex rounded-full border px-2.5 py-1 text-[10px] font-black uppercase tracking-widest ${tone}`}>
      {prettifyStatus(status)}
    </span>
  );
}

function getAuctionStatus(auction: ReverseAuction) {
  return String(auction.statusEnum || auction.status || 'DRAFT').toUpperCase();
}

function prettifyStatus(value: string) {
  return value.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, char => char.toUpperCase());
}
