import { FormEvent, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { Gavel, Pause, Play, RefreshCw, Send, Square, UserPlus } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { reverseAuctionApi } from '../api';

export default function ReverseAuctionDetailPage({ id }: { id: number }) {
  const qc = useQueryClient();
  const [message, setMessage] = useState('');
  const auction = useQuery({ queryKey: ['reverse-auction', id], queryFn: () => reverseAuctionApi.get(id), refetchInterval: 10_000 });
  const summary = useQuery({ queryKey: ['reverse-auction-summary', id], queryFn: () => reverseAuctionApi.liveSummary(id), refetchInterval: 5_000 });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['reverse-auction', id] });
    qc.invalidateQueries({ queryKey: ['reverse-auction-summary', id] });
  };
  const transition = useMutation({ mutationFn: (action: 'schedule' | 'start' | 'pause' | 'resume' | 'close') => reverseAuctionApi.transition(id, action), onSuccess: invalidate });
  const invite = useMutation({
    mutationFn: (sellerOrgId: number) => reverseAuctionApi.inviteSellers(id, [{ sellerOrgId }]),
    onSuccess: () => { setMessage('Seller invited'); invalidate(); },
    onError: err => setMessage((err as Error).message)
  });
  const bid = useMutation({
    mutationFn: (amount: number) => reverseAuctionApi.placeBid(id, amount),
    onSuccess: () => { setMessage('Bid submitted'); invalidate(); },
    onError: err => setMessage((err as Error).message)
  });

  if (auction.isLoading) return <LoadingState label="Loading reverse auction..." />;
  if (auction.error) return <InlineError message={(auction.error as Error).message} onRetry={() => auction.refetch()} />;
  if (!auction.data) return <EmptyState title="Auction not found" />;

  const submitInvite = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    invite.mutate(Number(form.get('sellerOrgId')));
    event.currentTarget.reset();
  };
  const submitBid = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    bid.mutate(Number(form.get('amount')));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{auction.data.auctionCode || `Auction #${id}`}</p>
          <h1 className="text-2xl font-black text-slate-950">{auction.data.title || 'Reverse auction'}</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">{formatDate(auction.data.startTime)} - {formatDate(auction.data.endTime)}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={() => auction.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
          <Button variant="outline" onClick={() => transition.mutate('schedule')}><Gavel className="mr-2 h-4 w-4" />Schedule</Button>
          <Button onClick={() => transition.mutate('start')}><Play className="mr-2 h-4 w-4" />Start</Button>
          <Button variant="secondary" onClick={() => transition.mutate('pause')}><Pause className="mr-2 h-4 w-4" />Pause</Button>
          <Button variant="danger" onClick={() => transition.mutate('close')}><Square className="mr-2 h-4 w-4" />Close</Button>
        </div>
      </div>
      {message && <div className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-xs font-bold text-[#12335f]">{message}</div>}
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card>
          <CardContent className="space-y-4 p-4">
            <div className="grid gap-3 md:grid-cols-4">
              <Metric label="Status" value={String(auction.data.status).replace(/_/g, ' ')} />
              <Metric label="Starting price" value={formatCurrency(auction.data.startPrice)} />
              <Metric label="Current lowest" value={auction.data.currentLowestAmount ? formatCurrency(auction.data.currentLowestAmount) : '-'} />
              <Metric label="Minimum next" value={summary.data?.minimumNextBid ? formatCurrency(summary.data.minimumNextBid) : '-'} />
            </div>
            <p className="text-sm font-semibold leading-6 text-slate-600">{auction.data.description || 'No description provided.'}</p>
            <div className="flex gap-2">
              <Link href={`/reverse-auctions/${id}/live`}><Button size="sm">Open Live Screen</Button></Link>
              <Link href={`/reverse-auctions/${id}/results`}><Button size="sm" variant="outline">View Results</Button></Link>
            </div>
          </CardContent>
        </Card>
        <div className="space-y-4">
          <Card>
            <CardContent className="p-4">
              <form onSubmit={submitInvite} className="space-y-3">
                <p className="text-sm font-black text-slate-950">Invite seller organization</p>
                <input name="sellerOrgId" type="number" min="1" required placeholder="Seller org ID" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none" />
                <Button disabled={invite.isPending} className="w-full"><UserPlus className="mr-2 h-4 w-4" />Invite</Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <form onSubmit={submitBid} className="space-y-3">
                <p className="text-sm font-black text-slate-950">Seller bid</p>
                <input name="amount" type="number" min="1" step="0.01" required placeholder="Bid amount" className="h-10 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none" />
                <Button disabled={bid.isPending} className="w-full"><Send className="mr-2 h-4 w-4" />Submit Bid</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </div>
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
