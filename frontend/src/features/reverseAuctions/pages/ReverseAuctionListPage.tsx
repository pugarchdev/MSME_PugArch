import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Clock3, Filter, Gavel, Plus, RadioTower, RefreshCw, Search, Trophy, type LucideIcon } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate, formatDateTime, formatNumber } from '../../shared/format';
import { Pagination } from '../../shared/Pagination';
import { usePagination, useResponsiveViewMode } from '../../shared/hooks';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { reverseAuctionApi, type ReverseAuction } from '../api';

const statusOptions = ['All', 'DRAFT', 'SCHEDULED', 'LIVE', 'PAUSED', 'CLOSED', 'AWARD_RECOMMENDED', 'CANCELLED'];
const priceBands = [
  { label: 'All values', value: 'all' },
  { label: 'Up to Rs. 1L', value: 'lt1l' },
  { label: 'Rs. 1L - Rs. 10L', value: '1l-10l' },
  { label: 'Above Rs. 10L', value: 'gt10l' }
];

export default function ReverseAuctionListPage() {
  const [viewMode, setViewMode] = useResponsiveViewMode('reverse-auctions:view-mode');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [priceBand, setPriceBand] = useState('all');
  const [timeFilter, setTimeFilter] = useState('all');

  const query = useQuery({
    queryKey: ['reverse-auctions', 'dashboard'],
    queryFn: () => reverseAuctionApi.list({ pageSize: 100 }),
    staleTime: 20_000
  });

  const auctions = query.data?.auctions || [];
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
    const savings = auctions.reduce((sum, auction) => {
      const start = Number(auction.startPrice || 0);
      const current = Number(auction.currentLowestAmount || 0);
      return current > 0 && start > current ? sum + (start - current) : sum;
    }, 0);
    return { total: auctions.length, live, scheduled, closed, savings };
  }, [auctions]);

  const { page, pageSize, pageItems, total, setPage, setPageSize } = usePagination(filteredAuctions, 10);

  if (query.isLoading) return <LoadingState label="Loading reverse auctions..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement</p>
          <h1 className="text-2xl font-black text-slate-950">Reverse Auctions</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">Create, monitor, close, and recommend L1 awards.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} size="sm" />
          <Button type="button" variant="outline" onClick={() => query.refetch()} disabled={query.isFetching}>
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
          <Link href="/reverse-auctions/create">
            <Button type="button"><Plus className="mr-2 h-4 w-4" />Create</Button>
          </Link>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiTile label="Total auctions" value={formatNumber(stats.total)} icon={Gavel} tone="navy" />
        <KpiTile label="Live now" value={formatNumber(stats.live)} icon={RadioTower} tone="green" />
        <KpiTile label="Scheduled" value={formatNumber(stats.scheduled)} icon={Clock3} tone="amber" />
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
            {pageItems.map(auction => <AuctionCard key={auction.id} auction={auction} />)}
          </div>
          <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="auctions" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-4 py-3">Auction</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Timeline</th>
                  <th className="px-4 py-3 text-right">Start price</th>
                  <th className="px-4 py-3 text-right">Current L1</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pageItems.map(auction => (
                  <tr key={auction.id} className="align-top transition hover:bg-slate-50/80">
                    <td className="max-w-sm px-4 py-3">
                      <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{auction.auctionCode || `RA-${auction.id}`}</p>
                      <p className="mt-1 text-sm font-black text-slate-950 text-wrap-anywhere">{auction.title || 'Reverse auction'}</p>
                      {auction.description && <p className="mt-1 line-clamp-2 text-xs font-semibold text-slate-500">{auction.description}</p>}
                    </td>
                    <td className="px-4 py-3"><StatusBadge status={getAuctionStatus(auction)} /></td>
                    <td className="px-4 py-3 font-semibold text-slate-600">
                      <p>{formatDateTime(auction.startTime)}</p>
                      <p className="mt-1 text-slate-400">to {formatDateTime(auction.endTime)}</p>
                    </td>
                    <td className="px-4 py-3 text-right font-black text-slate-900">{formatCurrency(auction.startPrice)}</td>
                    <td className="px-4 py-3 text-right font-black text-emerald-700">{auction.currentLowestAmount ? formatCurrency(auction.currentLowestAmount) : '-'}</td>
                    <td className="px-4 py-3">
                      <AuctionActions auction={auction} align="right" />
                    </td>
                  </tr>
                ))}
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

function AuctionCard({ auction }: { auction: ReverseAuction }) {
  return (
    <Card className="h-full border-slate-200 shadow-sm">
      <CardContent className="flex h-full flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{auction.auctionCode || `Auction #${auction.id}`}</p>
            <h2 className="mt-1 text-base font-black text-slate-950 text-wrap-anywhere">{auction.title || 'Reverse auction'}</h2>
          </div>
          <StatusBadge status={getAuctionStatus(auction)} />
        </div>
        <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
          <Metric label="Starting price" value={formatCurrency(auction.startPrice)} />
          <Metric label="Current L1" value={auction.currentLowestAmount ? formatCurrency(auction.currentLowestAmount) : '-'} />
          <Metric label="Start" value={formatDate(auction.startTime)} />
          <Metric label="End" value={formatDate(auction.endTime)} />
        </div>
        {auction.description && <p className="mt-4 line-clamp-2 text-xs font-semibold text-slate-500">{auction.description}</p>}
        <div className="mt-auto pt-4">
          <AuctionActions auction={auction} />
        </div>
      </CardContent>
    </Card>
  );
}

function AuctionActions({ auction, align = 'left' }: { auction: ReverseAuction; align?: 'left' | 'right' }) {
  return (
    <div className={`flex flex-wrap gap-2 ${align === 'right' ? 'justify-end' : ''}`}>
      <Link href={`/reverse-auctions/${auction.id}`}><Button type="button" size="sm" variant="outline">Details</Button></Link>
      <Link href={`/reverse-auctions/${auction.id}/live`}><Button type="button" size="sm"><RadioTower className="mr-1 h-3.5 w-3.5" />Live</Button></Link>
      <Link href={`/reverse-auctions/${auction.id}/results`}><Button type="button" size="sm" variant="secondary">Results</Button></Link>
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
