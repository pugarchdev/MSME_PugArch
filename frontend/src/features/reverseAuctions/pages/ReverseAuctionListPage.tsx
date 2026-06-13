import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { Plus, RefreshCw, RadioTower } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { reverseAuctionApi } from '../api';

export default function ReverseAuctionListPage() {
  const query = useQuery({ queryKey: ['reverse-auctions'], queryFn: () => reverseAuctionApi.list(), staleTime: 20_000 });

  if (query.isLoading) return <LoadingState label="Loading reverse auctions..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement</p>
          <h1 className="text-2xl font-black text-slate-950">Reverse Auctions</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">Create, monitor, close, and recommend L1 awards.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          <Link href="/reverse-auctions/create"><Button><Plus className="mr-2 h-4 w-4" />Create</Button></Link>
        </div>
      </div>

      {query.error && <InlineError message={(query.error as Error).message} onRetry={() => query.refetch()} />}
      {(query.data?.auctions || []).length === 0 ? (
        <EmptyState title="No reverse auctions found" />
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {query.data?.auctions.map(auction => (
            <Card key={auction.id}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{auction.auctionCode || `Auction #${auction.id}`}</p>
                    <h2 className="mt-1 truncate text-lg font-black text-slate-950">{auction.title || 'Reverse auction'}</h2>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(auction.startTime)} - {formatDate(auction.endTime)}</p>
                  </div>
                  <span className="rounded-lg border border-blue-200 bg-blue-50 px-2 py-1 text-[10px] font-black uppercase text-[#12335f]">
                    {String(auction.status).replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
                  <Metric label="Starting price" value={formatCurrency(auction.startPrice)} />
                  <Metric label="Current lowest" value={auction.currentLowestAmount ? formatCurrency(auction.currentLowestAmount) : '-'} />
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={`/reverse-auctions/${auction.id}`}><Button size="sm" variant="outline">Details</Button></Link>
                  <Link href={`/reverse-auctions/${auction.id}/live`}><Button size="sm"><RadioTower className="mr-1 h-3.5 w-3.5" />Live</Button></Link>
                  <Link href={`/reverse-auctions/${auction.id}/results`}><Button size="sm" variant="secondary">Results</Button></Link>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-900">{value}</p>
    </div>
  );
}
