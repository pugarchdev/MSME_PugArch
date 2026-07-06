import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Award, RefreshCw } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency } from '../../shared/format';
import { reverseAuctionApi } from '../api';

export default function AuctionResultPage({ id }: { id: number }) {
  const qc = useQueryClient();
  const query = useQuery({ queryKey: ['reverse-auction-result', id], queryFn: () => reverseAuctionApi.result(id), staleTime: 10_000 });
  const award = useMutation({
    mutationFn: (participantId?: number) => reverseAuctionApi.recommendAward(id, participantId),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['reverse-auction-result', id] })
  });

  if (query.isLoading) return <LoadingState label="Loading auction result..." />;
  if (query.error) return <InlineError message={(query.error as Error).message} onRetry={() => query.refetch()} />;

  const ranking = query.data?.ranking || [];

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Reverse Auction Result</p>
          <h1 className="text-2xl font-black text-slate-950">{query.data?.auction?.title || `Auction #${id}`}</h1>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {query.data?.auction?.procurementMethod || 'REVERSE_AUCTION'} · Rank visibility: {query.data?.auction?.rankVisibility || 'SHOW_RANK_ONLY'} · Award basis: final L1 auction rank
          </p>
        </div>
        <Button variant="outline" onClick={() => query.refetch()}><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>
      {ranking.length === 0 ? (
        <EmptyState title="No ranked bids yet" />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] text-left text-sm">
                <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-widest text-slate-500">
                  <tr>
                    <th className="p-3">Rank</th>
                    <th className="p-3">Seller Org</th>
                    <th className="p-3">Last Bid</th>
                    <th className="p-3">Status</th>
                    <th className="p-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ranking.map((row: any, index: number) => (
                    <tr key={row.id}>
                      <td className="p-3 text-lg font-black text-slate-950">L{row.currentRank || index + 1}</td>
                      <td className="p-3 font-bold text-slate-800">{row.sellerOrgName || `Organization #${row.sellerOrgId}`}</td>
                      <td className="p-3 font-black text-slate-950">{row.lastBidAmount ? formatCurrency(row.lastBidAmount) : '-'}</td>
                      <td className="p-3 text-xs font-bold uppercase text-slate-500">{row.status}</td>
                      <td className="p-3 text-right">
                        <Button size="sm" onClick={() => award.mutate(row.id)} disabled={award.isPending}>
                          <Award className="mr-1 h-3.5 w-3.5" />Recommend
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
