import { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Send } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { reverseAuctionApi } from '../api';

export default function ReverseAuctionLivePage({ id }: { id: number }) {
  const qc = useQueryClient();
  const summary = useQuery({ queryKey: ['reverse-auction-live', id], queryFn: () => reverseAuctionApi.liveSummary(id), refetchInterval: 5_000 });
  const bid = useMutation({
    mutationFn: (amount: number) => reverseAuctionApi.placeBid(id, amount),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reverse-auction-live', id] })
  });

  if (summary.isLoading) return <LoadingState label="Loading live auction..." />;
  if (summary.error) return <InlineError message={(summary.error as Error).message} onRetry={() => summary.refetch()} />;

  const auction = summary.data?.auction;
  const participant = summary.data?.participant;
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    bid.mutate(Number(form.get('amount')));
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
      <section className="space-y-4">
        <div className="border-b border-slate-200 pb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Live Reverse Auction</p>
          <h1 className="text-2xl font-black text-slate-950">{auction?.title || `Auction #${id}`}</h1>
          <p className="mt-1 text-xs font-semibold text-slate-500">Server time {formatDate(summary.data?.serverTime)}</p>
        </div>
        <div className="grid gap-3 md:grid-cols-4">
          <Metric label="Status" value={String(auction?.status || '-')} />
          <Metric label="Current lowest" value={auction?.currentLowestAmount ? formatCurrency(auction.currentLowestAmount) : '-'} />
          <Metric label="My rank" value={participant?.currentRank ? `L${participant.currentRank}` : '-'} />
          <Metric label="Ends" value={formatDate(auction?.endTime)} />
        </div>
        <Card>
          <CardContent className="p-4">
            <p className="text-sm font-black text-slate-950">Auction rules</p>
            <p className="mt-2 text-sm font-semibold leading-6 text-slate-600">
              Minimum next bid is {summary.data?.minimumNextBid ? formatCurrency(summary.data.minimumNextBid) : '-'}.
              Bids are validated against server time and submitted through a backend lock.
            </p>
          </CardContent>
        </Card>
      </section>
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <Card>
          <CardContent className="space-y-4 p-4">
            <div>
              <p className="text-sm font-black text-slate-950">Submit lower bid</p>
              <p className="mt-1 text-xs font-semibold text-slate-500">Seller identity is hidden from competitors unless admin enables disclosure.</p>
            </div>
            {bid.error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs font-bold text-red-700">{(bid.error as Error).message}</div>}
            <form onSubmit={submit} className="space-y-3">
              <input name="amount" type="number" min="1" step="0.01" required className="h-11 w-full rounded-lg border border-slate-200 px-3 text-sm font-semibold outline-none" />
              <Button disabled={bid.isPending} className="w-full"><Send className="mr-2 h-4 w-4" />Submit bid</Button>
            </form>
          </CardContent>
        </Card>
      </aside>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
        <p className="mt-1 text-sm font-black text-slate-950">{value}</p>
      </CardContent>
    </Card>
  );
}
