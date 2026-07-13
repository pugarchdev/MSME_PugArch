'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Download, Trophy, FileText, X } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { PageShell, ProcurementEmptyState, ProcurementErrorState, ProcurementHero, ProcurementLoadingState, ResultsTable, StatusBadge } from '../components';
import { money, type BidResultRow, type ProcurementBid } from '../data';
import { procurementBidApi } from '../api';
import { downloadCsv } from '../../shared/exportUtils';
import { openFileAsset } from '../../../lib/files';
import { toast } from 'sonner';

export default function BidResultsPage() {
  const { user } = useAuth();
  const pathname = usePathname() || '';
  const bidId = pathname.split('/')[2];
  const [bid, setBid] = useState<ProcurementBid | null>(null);
  const [ranking, setRanking] = useState<BidResultRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedResult, setSelectedResult] = useState<any | null>(null);

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
        <main className="mx-auto w-full max-w-7xl">
          <ProcurementHero title="Bid Result and Financial Ranking" subtitle="Loading live evaluation results from the backend." />
          <div className="mt-5"><ProcurementLoadingState message="Loading bid results..." /></div>
        </main>
      </PageShell>
    );
  }

  if (error) {
    return (
      <PageShell>
        <main className="mx-auto w-full max-w-7xl">
          <ProcurementHero title="Bid Result and Financial Ranking" subtitle={bidId || 'Requested bid'} action={<Link href="/bids" className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">Back to bids</Link>} />
          <div className="mt-5"><ProcurementErrorState message={error} onRetry={loadBid} /></div>
        </main>
      </PageShell>
    );
  }

  if (!bid) {
    return (
      <PageShell>
        <main className="mx-auto w-full max-w-7xl">
          <ProcurementHero title="Bid Result and Financial Ranking" subtitle={bidId || 'Requested bid'} action={<Link href="/bids" className="inline-flex h-10 items-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700">Back to bids</Link>} />
          <div className="mt-5"><ProcurementEmptyState title="No bid results available currently." message="This bid was not returned by the live backend." /></div>
        </main>
      </PageShell>
    );
  }

  return (
    <PageShell>
      <main className="mx-auto w-full max-w-7xl">
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
                  <tr>{['Seller name', 'Offered item', 'Make/Brand', 'Model', 'Technical status', 'Financial status', 'Evaluated amount', 'Final rank', 'Result status', 'Actions'].map(head => <th key={head} className="px-4 py-3 font-black">{head}</th>)}</tr>
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
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedResult(row)}
                          className="inline-flex h-8 items-center rounded-md bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 text-[10px] font-black tracking-wide uppercase transition-colors"
                        >
                          View Details
                        </button>
                      </td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan={10} className="px-4 py-8 text-center text-xs font-bold text-slate-500">No evaluation results available currently.</td>
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
                const rows = ranking.map(row => ({
                  sellerName: row.sellerName,
                  sellerType: row.sellerType,
                  offeredItem: row.offeredItem,
                  totalPrice: row.totalPrice,
                  rank: row.finalRank,
                  status: row.resultStatus
                }));
                downloadCsv(`${bid.id}-result.csv`, rows);
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

      {selectedResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl rounded-3xl border border-slate-150 bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div>
                <span className="text-[9px] font-black uppercase tracking-wider text-blue-600 bg-blue-50 px-2 py-0.5 rounded-sm">Supplier Response details</span>
                <h3 className="text-base font-black text-slate-900 mt-1">{selectedResult.sellerName}</h3>
              </div>
              <button 
                onClick={() => setSelectedResult(null)}
                className="flex h-8 w-8 items-center justify-center rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-655 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Content Scroll Shell */}
            <div className="flex-1 overflow-y-auto py-4 space-y-5 pr-1 text-xs">
              {/* Section 1: Technical Offer Details */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 border-l-2 border-blue-655 border-blue-600 pl-2 mb-3">Technical Specification</h4>
                <div className="grid grid-cols-2 gap-4 bg-slate-50/50 rounded-2xl p-4 border border-slate-100/50">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Make / Brand</span>
                    <span className="text-xs font-bold text-slate-855 text-slate-800 block mt-0.5">{selectedResult.makeBrand || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Model</span>
                    <span className="text-xs font-bold text-slate-855 text-slate-800 block mt-0.5">{selectedResult.model || '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Offered Item/Service Description</span>
                    <span className="text-xs font-bold text-slate-855 text-slate-800 block mt-0.5 leading-relaxed">{selectedResult.offeredItem || selectedResult.details?.offeredItemDescription || '—'}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Technical Compliance Remarks</span>
                    <span className="text-xs font-semibold text-slate-700 block mt-0.5 leading-relaxed">{selectedResult.details?.complianceRemarks || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Delivery Timeline</span>
                    <span className="text-xs font-bold text-slate-855 text-slate-800 block mt-0.5">{selectedResult.details?.deliveryTimeline || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Warranty Details</span>
                    <span className="text-xs font-bold text-slate-855 text-slate-800 block mt-0.5">{selectedResult.details?.warrantyDetails || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Service Support</span>
                    <span className="text-xs font-bold text-slate-855 text-slate-800 block mt-0.5">{selectedResult.details?.serviceSupport || '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Deviation (if any)</span>
                    <span className="text-xs font-bold text-slate-855 text-slate-800 block mt-0.5">{selectedResult.details?.deviation || '—'}</span>
                  </div>
                </div>
              </div>

              {/* Section 2: Financial Offer Details */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 border-l-2 border-emerald-655 border-emerald-600 pl-2 mb-3">Financial Quote Details</h4>
                <div className="grid grid-cols-3 gap-4 bg-emerald-50/10 rounded-2xl p-4 border border-emerald-100/30">
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Quoted Base Amount</span>
                    <span className="text-xs font-black text-slate-800 block mt-0.5">{selectedResult.quotedAmount ? money(selectedResult.quotedAmount) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">GST Percentage</span>
                    <span className="text-xs font-bold text-slate-800 block mt-0.5">{selectedResult.gstPercentage ? `${selectedResult.gstPercentage}%` : '—'}</span>
                  </div>
                  <div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">Total Evaluated Price</span>
                    <span className="text-xs font-black text-emerald-700 block mt-0.5">{selectedResult.totalAmount ? money(selectedResult.totalAmount) : (selectedResult.totalPrice ? money(selectedResult.totalPrice) : '—')}</span>
                  </div>
                </div>
              </div>

              {/* Section 3: Uploaded Supplier Documents */}
              <div>
                <h4 className="text-xs font-black uppercase tracking-wider text-slate-800 border-l-2 border-orange-655 border-orange-600 pl-2 mb-3">Uploaded Documents</h4>
                {selectedResult.documents && selectedResult.documents.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                    {selectedResult.documents.map((doc: any, idx: number) => (
                      <div 
                        key={idx} 
                        onClick={() => {
                          if (doc.fileAssetId || doc.fileUrl || doc.url) {
                            openFileAsset({
                              id: doc.fileAssetId || doc.id,
                              fileAssetId: doc.fileAssetId,
                              originalName: doc.fileName || doc.originalName || 'Document',
                              url: doc.fileUrl || doc.url,
                            }, doc.fileName || 'Document').catch(err => {
                              toast.error(err instanceof Error ? err.message : 'Unable to open file');
                            });
                          }
                        }}
                        className="rounded-xl border border-slate-100 bg-slate-50/50 p-3 flex items-center gap-3 hover:shadow-2xs transition-all duration-200 cursor-pointer hover:border-blue-200"
                      >
                        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
                          <FileText className="h-4.5 w-4.5" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <span className="text-[11px] font-bold text-slate-800 block leading-tight truncate">{doc.fileName || doc.originalName || 'Attachment'}</span>
                          <span className="text-[9px] font-black text-slate-400 block mt-0.5 uppercase">{doc.documentType || 'Uploaded'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-xs font-bold text-slate-400 py-3 text-center border border-dashed border-slate-100 rounded-xl">No documents uploaded.</p>
                )}
              </div>
            </div>

            {/* Footer Actions */}
            <div className="border-t border-slate-100 pt-4 flex justify-end">
              <button
                onClick={() => setSelectedResult(null)}
                className="h-10 rounded-md bg-slate-100 hover:bg-slate-200 px-5 text-xs font-black text-slate-700 transition-colors"
              >
                Close Details
              </button>
            </div>

          </div>
        </div>
      )}
    </PageShell>
  );
}
