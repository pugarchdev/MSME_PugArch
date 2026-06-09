'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { SlidersHorizontal } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { MarketplaceHeader } from '../../marketplace/components/MarketplaceHeader';
import { MarketplaceFooter } from '../../marketplace/components/MarketplaceFooter';
import { BidCard, EmptyState, PageShell, ProcurementEmptyState, ProcurementErrorState, ProcurementHero, ProcurementLoadingState, StatusBadge } from '../components';
import { formatDate, money, type ProcurementBid } from '../data';
import { procurementBidApi } from '../api';
import { Pagination } from '../../shared/Pagination';
import { useResponsiveViewMode } from '../../shared/hooks';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { SortableHeader, type SortDirection } from '../../shared/SortableHeader';

const pageSize = 10;
const selectClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-[#0b2447] focus:ring-2 focus:ring-[#0b2447]/10';
type BidSortKey = 'id' | 'title' | 'buyer' | 'category' | 'status' | 'value' | 'startDate' | 'endDate';

export default function BidsListingPage() {
  const { user } = useAuth();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('All');
  const [bidType, setBidType] = useState('All');
  const [category, setCategory] = useState('All');
  const [location, setLocation] = useState('All');
  const [buyerType, setBuyerType] = useState('All');
  const [bidValue, setBidValue] = useState('All');
  const [closingDate, setClosingDate] = useState('All');
  const [participation, setParticipation] = useState('All');
  const [sortKey, setSortKey] = useState<BidSortKey>('endDate');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');
  const [page, setPage] = useState(1);
  const [mobileFilters, setMobileFilters] = useState(false);
  const [bids, setBids] = useState<ProcurementBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useResponsiveViewMode('phase7:bids-listing:view-mode');
  const participationHref = (bid: ProcurementBid) => user ? `/bids/${bid.id}/participate` : `/login?returnUrl=${encodeURIComponent(`/bids/${bid.id}/participate`)}`;

  const loadBids = React.useCallback(() => {
    let alive = true;
    setLoading(true);
    setError('');
    procurementBidApi.list({ pageSize: 50 })
      .then(data => {
        if (!alive) return;
        const items = data.items || [];
        setBids(items);
      })
      .catch((err: any) => {
        if (!alive) return;
        setBids([]);
        setError(err?.message || 'Unable to load bids right now.');
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    return loadBids();
  }, [loadBids]);

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    const rows = bids.filter(bid => {
      const haystack = [bid.id, bid.title, bid.itemName, bid.buyerName, bid.category, bid.location, bid.buyerType].join(' ').toLowerCase();
      if (text && !haystack.includes(text)) return false;
      if (status !== 'All' && bid.status !== status) return false;
      if (bidType !== 'All' && bid.bidType !== bidType) return false;
      if (category !== 'All' && bid.category !== category) return false;
      if (location !== 'All' && !bid.location.includes(location)) return false;
      if (buyerType !== 'All' && bid.buyerType !== buyerType) return false;
      if (bidValue === 'Below 10L' && bid.estimatedValue >= 1000000) return false;
      if (bidValue === '10L to 25L' && (bid.estimatedValue < 1000000 || bid.estimatedValue > 2500000)) return false;
      if (bidValue === 'Above 25L' && bid.estimatedValue <= 2500000) return false;
      if (participation === 'Participated' && !bid.participated) return false;
      if (participation === 'Not participated' && bid.participated) return false;
      if (closingDate === 'Next 7 days') {
        const diff = (new Date(`${bid.endDate}T00:00:00`).getTime() - Date.now()) / 86400000;
        if (diff > 7) return false;
      }
      return true;
    });
    return rows.sort((a, b) => {
      const valueFor = (bid: ProcurementBid) => {
        if (sortKey === 'id') return bid.id;
        if (sortKey === 'title') return bid.title || bid.itemName;
        if (sortKey === 'buyer') return bid.buyerName;
        if (sortKey === 'category') return bid.category;
        if (sortKey === 'status') return bid.status;
        if (sortKey === 'value') return bid.estimatedValue || 0;
        if (sortKey === 'startDate') return new Date(bid.startDate || 0).getTime();
        return new Date(bid.endDate || 0).getTime();
      };
      const av = valueFor(a);
      const bv = valueFor(b);
      const result = typeof av === 'number' && typeof bv === 'number'
        ? av - bv
        : String(av).localeCompare(String(bv));
      return sortDirection === 'asc' ? result : -result;
    });
  }, [bidType, bidValue, bids, buyerType, category, closingDate, location, participation, query, sortDirection, sortKey, status]);

  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);

  const toggleSort = (field: BidSortKey) => {
    setSortDirection(prev => sortKey === field && prev === 'asc' ? 'desc' : 'asc');
    setSortKey(field);
    setPage(1);
  };

  const resetFilters = () => {
    setQuery('');
    setStatus('All');
    setBidType('All');
    setCategory('All');
    setLocation('All');
    setBuyerType('All');
    setBidValue('All');
    setClosingDate('All');
    setParticipation('All');
    setPage(1);
  };

  const filterPanel = (
    <aside className="space-y-4 rounded-lg border border-slate-200 bg-white p-4 lg:sticky lg:top-28">
      <div className="flex items-center justify-between">
        <p className="text-sm font-black text-[#0b2447]">Filters</p>
        <button onClick={resetFilters} className="text-[11px] font-black text-[#c86413]">Clear</button>
      </div>
      {[
        ['Bid status', status, setStatus, ['All', 'Open', 'Closing Soon', 'Under Evaluation', 'Awarded', 'Closed']],
        ['Bid type', bidType, setBidType, ['All', 'Product', 'Service', 'Works', 'Rate Contract']],
        ['Category', category, setCategory, ['All', 'Safety Equipment', 'Repair and Maintenance', 'IT Hardware and Software', 'Furniture']],
        ['Location', location, setLocation, ['All', 'Jharsuguda', 'Raigarh', 'Bhubaneswar', 'Sambalpur']],
        ['Buyer type', buyerType, setBuyerType, ['All', 'Large Industry', 'MSME Buyer', 'Government Buyer', 'Private Enterprise', 'PSU Buyer']],
        ['Bid value', bidValue, setBidValue, ['All', 'Below 10L', '10L to 25L', 'Above 25L']],
        ['Closing date', closingDate, setClosingDate, ['All', 'Next 7 days']],
        ['Participation', participation, setParticipation, ['All', 'Participated', 'Not participated']],
      ].map(([label, value, setter, options]) => (
        <label key={label as string} className="block">
          <span className="mb-1 block text-[10px] font-black uppercase tracking-wider text-slate-500">{label as string}</span>
          <select value={value as string} onChange={event => { (setter as React.Dispatch<React.SetStateAction<string>>)(event.target.value); setPage(1); }} className={selectClass}>
            {(options as string[]).map(option => <option key={option}>{option}</option>)}
          </select>
        </label>
      ))}
    </aside>
  );

  return (
    <PageShell>
      <div className="brand-tricolor-strip w-full" />
      <MarketplaceHeader user={user} />
      <main className="mx-auto w-full max-w-7xl px-4 py-5">
        <ProcurementHero
          title="Latest Buyer Requirements & Bids"
          subtitle="Search, filter, participate, download documents, and track procurement opportunities from private buyers, MSMEs, large industries, government buyers, PSUs, suppliers, and service providers."
          action={<Link href="/buyer/publish-bid" className="inline-flex h-10 items-center justify-center rounded-md bg-[#0b2447] px-4 text-xs font-black text-white">Publish Requirement</Link>}
        />

        <div className="mt-5 grid gap-5 lg:grid-cols-[280px_1fr]">
          <div className="hidden lg:block">{filterPanel}</div>
          <section className="min-w-0 space-y-4">
            <div className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="grid gap-3 md:grid-cols-[1fr_auto_auto]">
                <input value={query} onChange={event => { setQuery(event.target.value); setPage(1); }} placeholder="Search by bid ID, buyer, category, item or location" className="h-10 rounded-md border border-slate-200 bg-slate-50 px-3 text-sm outline-none focus:border-[#0b2447]" />
                <ViewModeToggle value={viewMode} onChange={setViewMode} />
                <button onClick={() => setMobileFilters(v => !v)} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 px-4 text-xs font-black text-slate-700 lg:hidden">
                  <SlidersHorizontal className="h-4 w-4" /> Filters
                </button>
              </div>
              {mobileFilters && <div className="mt-3 lg:hidden">{filterPanel}</div>}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-xs font-bold text-slate-500">{loading ? 'Loading live bids...' : error ? 'Live bids unavailable' : `${filtered.length} bids found`}</p>
              <div className="flex flex-wrap gap-2">
                <StatusBadge label="Technical Evaluation" />
                <StatusBadge label="Financial Evaluation" />
                <StatusBadge label="Awarded" />
              </div>
            </div>

            {loading ? (
              <ProcurementLoadingState message="Loading live bids..." />
            ) : error ? (
              <ProcurementErrorState message={error || 'Unable to load bids right now.'} onRetry={loadBids} />
            ) : !bids.length ? (
              <ProcurementEmptyState
                title="No bids available currently."
                message="Approved live procurement bids will appear here once buyers publish them."
                action={<Link href="/buyer/publish-bid" className="inline-flex h-9 items-center justify-center rounded-md bg-[#0b2447] px-4 text-xs font-black text-white">Publish Requirement</Link>}
              />
            ) : pageRows.length ? (
              viewMode === 'grid' ? (
                <div className="grid gap-4 xl:grid-cols-2">{pageRows.map(bid => <BidCard key={bid.id} bid={bid} participationHref={participationHref(bid)} participationLabel={user ? 'Participate' : 'Login to Participate'} />)}</div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1040px] text-left text-sm">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="px-4 py-3"><SortableHeader label="Bid ID" field="id" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                          <th className="px-4 py-3"><SortableHeader label="Title" field="title" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                          <th className="px-4 py-3"><SortableHeader label="Buyer" field="buyer" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                          <th className="px-4 py-3"><SortableHeader label="Category" field="category" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                          <th className="px-4 py-3"><SortableHeader label="Status" field="status" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                          <th className="px-4 py-3 text-right"><SortableHeader label="Value" field="value" activeField={sortKey} direction={sortDirection} onSort={toggleSort} className="justify-end" /></th>
                          <th className="px-4 py-3"><SortableHeader label="Closing" field="endDate" activeField={sortKey} direction={sortDirection} onSort={toggleSort} /></th>
                          <th className="px-4 py-3 text-right font-black">Actions</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {pageRows.map(bid => (
                          <tr key={bid.id} className="bg-white transition hover:bg-blue-50/50">
                            <td className="px-4 py-3 text-xs font-black text-[#c86413]">{bid.id}</td>
                            <td className="px-4 py-3">
                              <p className="text-xs font-black text-slate-900">{bid.title}</p>
                              <p className="mt-1 text-[10px] font-semibold text-slate-500">{bid.itemName}</p>
                            </td>
                            <td className="px-4 py-3 text-xs font-semibold text-slate-600">{bid.buyerName}</td>
                            <td className="px-4 py-3 text-xs font-semibold text-slate-600">{bid.category}</td>
                            <td className="px-4 py-3"><StatusBadge label={bid.status} /></td>
                            <td className="px-4 py-3 text-right text-xs font-black text-[#0b2447]">{money(bid.estimatedValue)}</td>
                            <td className="px-4 py-3 text-xs font-semibold text-slate-600">{formatDate(bid.endDate)}</td>
                            <td className="px-4 py-3">
                              <div className="flex justify-end gap-2">
                                <Link href={`/bids/${bid.id}`} className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-700">View</Link>
                                <Link href={participationHref(bid)} className="inline-flex h-8 items-center rounded-md bg-[#0b2447] px-3 text-[10px] font-black text-white">{user ? 'Participate' : 'Login'}</Link>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )
            ) : (
              <EmptyState onReset={resetFilters} />
            )}

            {!loading && !error && bids.length > 0 && (
              <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} label="bids" />
            )}
          </section>
        </div>
      </main>
      <MarketplaceFooter />
    </PageShell>
  );
}
