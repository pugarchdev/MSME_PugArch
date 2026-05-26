/**
 * RatingsPage - shows the rating list and aggregate distribution for a single
 * supplier or buyer. Reads via the new ratings module (React Query) so
 * navigating away and back is instant from cache.
 */

import { useMemo, useState } from 'react';
import { MessageSquareText, RefreshCw, Search, Star, ThumbsUp, TrendingUp } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { EmptyState, InlineError } from '../../shared/FeatureStates';
import { ListSkeleton, MetricCardSkeleton } from '../../../components/ui/skeleton';
import { Pagination } from '../../shared/Pagination';
import { formatDate } from '../../shared/format';
import { RatingDistribution } from '../components/RatingDistribution';
import { StarRating } from '../components/StarRating';
import { RatingPill } from '../components/RatingPill';
import { useBuyerRatings, useSupplierRatings } from '../hooks';
import type { BuyerRatingDto, RatingsListResult, SupplierRatingDto } from '../types';

interface Props {
  endpoint: string;
  mode?: 'supplier' | 'buyer';
}

const subjectIdFromEndpoint = (endpoint: string) => {
  const match = endpoint.match(/\/api\/ratings\/(?:supplier|buyer)\/(\d+)/);
  return match ? Number(match[1]) : NaN;
};

export default function RatingsPage({ endpoint, mode = 'supplier' }: Props) {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchTerm, setSearchTerm] = useState('');
  const [scoreFilter, setScoreFilter] = useState('');

  const subjectId = subjectIdFromEndpoint(endpoint);

  const supplierQuery = useSupplierRatings(subjectId, { page, pageSize });
  const buyerQuery = useBuyerRatings(subjectId, { page, pageSize });
  const query = mode === 'supplier' ? supplierQuery : buyerQuery;

  const data = (query.data || { records: [], total: 0, summary: undefined }) as RatingsListResult<
    SupplierRatingDto | BuyerRatingDto
  >;

  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    return (data.records || []).filter(rating => {
      const haystack = [
        rating.review,
        (rating as any).seller?.name,
        (rating as any).buyer?.name,
        rating.purchaseOrderId ? `PO #${rating.purchaseOrderId}` : ''
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return (
        (!term || haystack.includes(term)) &&
        (!scoreFilter || (rating.rating || 0) >= Number(scoreFilter))
      );
    });
  }, [data.records, searchTerm, scoreFilter]);

  const summary = data.summary;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">
            {mode === 'supplier' ? 'Supplier Performance' : 'Buyer Performance'}
          </p>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Ratings</h1>
          <p className="mt-1 max-w-2xl text-xs font-semibold text-slate-500">
            Performance feedback across quality, delivery, communication, and completed procurement records.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {summary && summary.count > 0 && <RatingPill average={summary.average} count={summary.count} />}
          <Button
            variant="outline"
            onClick={() => query.refetch()}
            className="h-10 rounded-lg text-xs font-black uppercase"
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${query.isFetching ? 'animate-spin' : ''}`} /> Refresh
          </Button>
        </div>
      </div>

      {query.isLoading && !query.data ? (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          {[1, 2, 3, 4].map(i => (
            <MetricCardSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
          <MetricCard label="Average" value={summary?.average?.toFixed(1) ?? '0.0'} icon="star" />
          <MetricCard label="Total Ratings" value={summary?.count ?? 0} icon="thumbs" />
          <MetricCard
            label="Written Reviews"
            value={(data.records || []).filter(r => r.review).length}
            icon="msg"
          />
          <MetricCard
            label="High Score (4+)"
            value={(summary?.distribution || []).filter(b => b.star >= 4).reduce((a, b) => a + b.count, 0)}
            icon="trend"
          />
        </div>
      )}

      {query.error && (
        <InlineError
          message={query.error instanceof Error ? query.error.message : 'Failed to load ratings'}
          onRetry={() => query.refetch()}
        />
      )}

      {summary && summary.count > 0 && (
        <Card>
          <CardContent className="p-4">
            <p className="mb-3 text-[10px] font-black uppercase tracking-widest text-[#12335f]">
              Rating Distribution
            </p>
            <RatingDistribution summary={summary} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardContent className="grid gap-3 p-4 md:grid-cols-[1fr_190px]">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Search supplier, buyer, PO, review..."
              className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
            />
          </div>
          <select
            value={scoreFilter}
            onChange={event => setScoreFilter(event.target.value)}
            className="h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
          >
            <option value="">All scores</option>
            <option value="5">5 star</option>
            <option value="4">4 star and above</option>
            <option value="3">3 star and above</option>
          </select>
        </CardContent>
      </Card>

      {query.isLoading && !query.data ? (
        <ListSkeleton rows={3} />
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No ratings found"
          description="Ratings appear after completed purchase orders are reviewed."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
          <div className="grid gap-3 p-4 lg:grid-cols-2">
            {filtered.map(item => (
              <Card key={item.id}>
                <CardContent className="space-y-4 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="text-sm font-black text-slate-950">
                        {mode === 'supplier'
                          ? (item as any).seller?.name || `Seller #${item.sellerId || '-'}`
                          : (item as any).buyer?.name || `Buyer #${item.buyerId || '-'}`}
                      </p>
                      <p className="mt-1 text-xs font-semibold text-slate-500">
                        {item.purchaseOrderId ? `PO #${item.purchaseOrderId}` : 'Direct rating'} ·{' '}
                        {formatDate(item.createdAt)}
                      </p>
                    </div>
                    <StarRating value={item.rating} readOnly />
                  </div>

                  <p className="rounded-lg bg-slate-50 p-3 text-sm font-semibold text-slate-700">
                    {item.review || 'No written review provided.'}
                  </p>

                  <div className="grid grid-cols-3 gap-2">
                    {mode === 'supplier' ? (
                      <>
                        <Score label="Quality" value={(item as SupplierRatingDto).qualityScore} />
                        <Score label="Delivery" value={(item as SupplierRatingDto).deliveryScore} />
                        <Score
                          label="Communication"
                          value={(item as SupplierRatingDto).communicationScore}
                        />
                      </>
                    ) : (
                      <>
                        <Score
                          label="Payment"
                          value={(item as BuyerRatingDto).paymentTimelinessScore}
                        />
                        <Score
                          label="Communication"
                          value={(item as BuyerRatingDto).communicationScore}
                        />
                        <div />
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
          <Pagination
            page={page}
            pageSize={pageSize}
            total={data.total || 0}
            onPageChange={setPage}
            onPageSizeChange={setPageSize}
            label="ratings"
          />
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  icon
}: {
  label: string;
  value: string | number;
  icon: 'star' | 'trend' | 'msg' | 'thumbs';
}) {
  const Icon =
    icon === 'star' ? Star
      : icon === 'trend' ? TrendingUp
        : icon === 'msg' ? MessageSquareText
          : ThumbsUp;
  return (
    <Card>
      <CardContent className="flex items-center justify-between p-4">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-1 text-lg font-black text-slate-950">{value}</p>
        </div>
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-slate-50 text-[#12335f]">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  );
}

function Score({ label, value }: { label: string; value?: number | null }) {
  return (
    <div className="rounded-lg border border-slate-200 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 text-sm font-black text-slate-950">{value ? `${value}/5` : '-'}</p>
    </div>
  );
}
