'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Download, Trophy } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { MarketplaceHeader } from '../../marketplace/components/MarketplaceHeader';
import { MarketplaceFooter } from '../../marketplace/components/MarketplaceFooter';
import { PageShell, ProcurementEmptyState, ProcurementErrorState, ProcurementHero, ProcurementLoadingState, ResultsTable, StatusBadge } from '../components';
import { money, type BidResultRow, type ProcurementBid } from '../data';
import { procurementBidApi } from '../api';

export default function BidResultsPage() {
  const { user } = useAuth();
  const pathname = usePathname() || '';
  const bidId = pathname.split('/')[2];
  const [bid, setBid] = useState<ProcurementBid | null>(null);
  const [ranking, setRanking] = useState<BidResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const loadBid = React.useCallback(() => {
    let alive = true;
    setLoading(true);
    setError('');
    Promise.all([
      procurementBidApi.getBidResults(bidId),
      procurementBidApi.getFinancialRanking(bidId),
    ])
      .then(([data, rankingRows]) => {
        if (!alive) return;
        setBid(data);
        setRanking(rankingRows);
      })
      .catch((err: any) => {
        if (!alive) return;
        setBid(null);
        setRanking([]);
        setError(err?.message || 'Unable to load bid results right now.');
      })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [bidId]);

  useEffect(() => {
    return loadBid();
  }, [loadBid]);

  if (loading) {
    return (
      <PageShell>
        <div className="brand-tricolor-strip w-full" />
        <MarketplaceHeader user={user} />
        <main className="mx-auto w-full max-w-7xl px-4 py-5">
          <ProcurementHero title="Bid Result and Financial Ranking" subtitle="Loading live evaluation results from the backend." />
          <div className="mt-5"><ProcurementLoadingState message="Loading bid results..." /></div>
        </main>
        <MarketplaceFooter />
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <div className="brand-tricolor-strip w-full" />
        <MarketplaceHeader user={user} />
        <main className="mx-auto w-full max-w-7xl px-4 py-5">
          <ProcurementHero title="Bid Result and Financial Ranking" subtitle={bidId || 'Requested bid'} action={<Link href="/bids" className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">Back to bids</Link>} />
          <div className="mt-5"><ProcurementErrorState message={error} onRetry={loadBid} /></div>
        </main>
        <MarketplaceFooter />
      </PageShell>
    );
  }

  if (!bid) {
    return (
      <PageShell>
        <div className="brand-tricolor-strip w-full" />
        <MarketplaceHeader user={user} />
        <main className="mx-auto w-full max-w-7xl px-4 py-5">
          <ProcurementHero title="Bid Result and Financial Ranking" subtitle={bidId || 'Requested bid'} action={<Link href="/bids" className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">Back to bids</Link>} />
          <div className="mt-5"><ProcurementEmptyState title="No bid results available currently." message="This bid was not returned by the live backend." /></div>
        </main>
        <MarketplaceFooter />
      </PageShell>
    );
  }

  return (
    <PageShell>
      <div className="brand-tricolor-strip w-full" />
      <MarketplaceHeader user={user} />
      <main className="mx-auto w-full max-w-7xl px-4 py-5">
        <ProcurementHero title="Bid Result and Financial Ranking" subtitle={`${bid.id} • ${bid.title}`} action={<Link href={`/bids/${bid.id}`} className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">Back to bid</Link>} />
        <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div><h2 className="text-base font-black text-[#0b2447]">Seller Evaluation Result</h2><p className="text-xs text-slate-500">Technical status, sealed/open financial stage, L1-L4 ranking, and final result.</p></div>
            <StatusBadge label={bid.status} />
          </div>
          <div className="table-shell">
            <div className="table-shell-scroller">
              <table className="min-w-[980px] w-full text-xs">
                <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                  <tr>{['Seller name', 'Offered item', 'Make/Brand', 'Model', 'Technical status', 'Financial status', 'Evaluated amount', 'Final rank', 'Result status'].map(head => <th key={head} className="px-4 py-3 font-black">{head}</th>)}</tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {ranking.length ? ranking.map(row => (
                    <tr key={`${row.participationId || row.sellerName}-${row.finalRank}`} className="bg-white hover:bg-slate-50">
                      <td className="px-4 py-3 font-black text-slate-800">{row.sellerName}</td>
                      <td className="px-4 py-3">{row.offeredItem}</td>
                      <td className="px-4 py-3">{row.makeBrand}</td>
                      <td className="px-4 py-3">{row.model}</td>
                      <td className="px-4 py-3"><StatusBadge label={row.technicalStatus} /></td>
                      <td className="px-4 py-3"><StatusBadge label={row.financialStatus} /></td>
                      <td className="px-4 py-3 font-black text-[#0b2447]">{row.totalPrice ? money(row.totalPrice) : 'Sealed/Pending'}</td>
                      <td className="px-4 py-3"><StatusBadge label={row.finalRank} /></td>
                      <td className="px-4 py-3"><StatusBadge label={row.resultStatus} /></td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={9} className="px-4 py-8 text-center text-xs font-bold text-slate-500">No evaluation results available currently.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
        <section className="mt-5 rounded-lg border border-slate-200 bg-white p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-[#0b2447]">Financial Ranking Table</h2>
              <p className="text-xs text-slate-500">Lowest evaluated total is L1, followed by L2, L3, L4, and later ranks when returned by the backend.</p>
            </div>
            <button
              onClick={() => {
                const csv = [
                  'sellerName,sellerType,offeredItem,totalPrice,rank,status',
                  ...ranking.map(row => `"${row.sellerName}","${row.sellerType}","${row.offeredItem}",${row.totalPrice},"${row.finalRank}","${row.resultStatus}"`)
                ].join('\n');
                const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
                const link = document.createElement('a');
                link.href = url;
                link.download = `${bid.id}-result.csv`;
                link.click();
                URL.revokeObjectURL(url);
              }}
              className="inline-flex h-9 items-center gap-2 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white"
            ><Download className="h-4 w-4" /> Export result</button>
          </div>
          {ranking.length ? (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-4">
                {ranking.slice(0, 4).map(row => (
                  <div key={row.finalRank} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <div className="flex items-center justify-between gap-2">
                      <StatusBadge label={row.finalRank} />
                      <Trophy className="h-4 w-4 text-[#0b2447]" />
                    </div>
                    <p className="mt-3 text-xs font-black text-slate-800">{row.sellerName}</p>
                    <p className="mt-1 text-[11px] font-bold text-slate-500">{row.totalPrice ? money(row.totalPrice) : 'Amount pending'}</p>
                  </div>
                ))}
              </div>
              <ResultsTable rows={ranking} />
            </div>
          ) : <ProcurementEmptyState title="No financial ranking available currently." message="Financial rankings will appear after the live backend opens financial evaluation." />}
        </section>
      </main>
      <MarketplaceFooter />
    </PageShell>
  );
}
