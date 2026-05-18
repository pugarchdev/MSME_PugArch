import { useMemo, useState } from 'react';
import { MessageSquareText, RefreshCw, Search, Star, ThumbsUp, TrendingUp } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatDate } from '../../shared/format';
import { useFeatureQuery } from '../../shared/hooks';

type RatingRow = {
  id: number;
  sellerId?: number;
  buyerId?: number;
  purchaseOrderId?: number;
  rating?: number;
  qualityScore?: number;
  deliveryScore?: number;
  communicationScore?: number;
  review?: string;
  status?: string;
  createdAt?: string;
  seller?: { name?: string };
  buyer?: { name?: string };
  purchaseOrder?: { poNumber?: string; title?: string };
};

const score = (value?: number) => Number(value || 0);
const stars = (value?: number) => Array.from({ length: 5 }, (_, index) => index < Math.round(score(value)));

export default function RatingsPage({ endpoint, mode = 'supplier' }: { endpoint: string; mode?: 'supplier' | 'buyer' }) {
  const { data: ratings, loading, error, reload } = useFeatureQuery<RatingRow[]>(endpoint, []);
  const [searchTerm, setSearchTerm] = useState('');
  const [scoreFilter, setScoreFilter] = useState('');

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return ratings.filter(rating => {
      const haystack = [
        rating.review,
        rating.status,
        rating.seller?.name,
        rating.buyer?.name,
        rating.purchaseOrder?.poNumber,
        rating.purchaseOrder?.title
      ].filter(Boolean).join(' ').toLowerCase();
      return (!term || haystack.includes(term)) && (!scoreFilter || score(rating.rating) >= Number(scoreFilter));
    });
  }, [ratings, searchTerm, scoreFilter]);

  const average = filtered.length ? filtered.reduce((sum, item) => sum + score(item.rating), 0) / filtered.length : 0;
  const highScoreCount = filtered.filter(item => score(item.rating) >= 4).length;
  const reviewCount = filtered.filter(item => item.review).length;

  if (loading) return <LoadingState label="Loading ratings..." />;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">{mode === 'supplier' ? 'Supplier Performance' : 'Buyer Performance'}</p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Ratings</h1>
          <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">Performance feedback across quality, delivery, communication, and completed procurement records.</p>
        </div>
        <Button variant="outline" onClick={reload} className="h-10 rounded-lg text-xs font-black uppercase"><RefreshCw className="mr-2 h-4 w-4" />Refresh</Button>
      </div>

      <div className="grid gap-3 md:grid-cols-4">
        <Metric label="Average Rating" value={average.toFixed(1)} icon={Star} />
        <Metric label="4+ Star Records" value={highScoreCount} icon={TrendingUp} />
        <Metric label="Written Reviews" value={reviewCount} icon={MessageSquareText} />
        <Metric label="Total Ratings" value={filtered.length} icon={ThumbsUp} />
      </div>

      {error && <InlineError message={error} onRetry={reload} />}

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_190px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Search supplier, buyer, PO, review..." className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20" />
          </div>
          <select value={scoreFilter} onChange={event => setScoreFilter(event.target.value)} className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
            <option value="">All scores</option>
            <option value="5">5 star</option>
            <option value="4">4 star and above</option>
            <option value="3">3 star and above</option>
          </select>
        </CardContent>
      </Card>

      {filtered.length === 0 ? <EmptyState title="No ratings found" description="Ratings appear after completed purchase orders are reviewed." /> : (
        <div className="grid gap-3 lg:grid-cols-2">
          {filtered.map(item => (
            <Card key={item.id}>
              <CardContent className="space-y-4 p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <p className="text-sm font-black text-slate-950">{mode === 'supplier' ? item.seller?.name || `Seller #${item.sellerId || '-'}` : item.buyer?.name || `Buyer #${item.buyerId || '-'}`}</p>
                    <p className="mt-1 text-xs font-semibold text-slate-500">{item.purchaseOrder?.poNumber || `PO #${item.purchaseOrderId || '-'}`} | {formatDate(item.createdAt)}</p>
                  </div>
                  <div className="flex gap-1">
                    {stars(item.rating).map((active, index) => <Star key={index} className={`h-4 w-4 ${active ? 'fill-amber-400 text-amber-400' : 'text-slate-200'}`} />)}
                  </div>
                </div>

                <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-700">{item.review || 'No written review provided.'}</p>

                <div className="grid grid-cols-3 gap-2">
                  <Score label="Quality" value={item.qualityScore} />
                  <Score label="Delivery" value={item.deliveryScore} />
                  <Score label="Communication" value={item.communicationScore} />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return <Card><CardContent className="flex items-center justify-between p-4"><div><p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p><p className="mt-1 text-lg font-black text-slate-950">{value}</p></div><div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-50 text-[#12335f]"><Icon className="h-5 w-5" /></div></CardContent></Card>;
}

function Score({ label, value }: { label: string; value?: number }) {
  return <div className="rounded-lg border border-slate-200 p-3"><p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p><p className="mt-1 text-sm font-black text-slate-950">{score(value)}/5</p></div>;
}
