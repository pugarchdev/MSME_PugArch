'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  SlidersHorizontal,
  X,
  CalendarDays,
  FileText,
  Download,
  Landmark,
  MapPin,
  IndianRupee,
  Shield,
  FileCheck,
  Info
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { BidCard, EmptyState, PageShell, ProcurementEmptyState, ProcurementErrorState, ProcurementHero, ProcurementLoadingState, StatusBadge } from '../components';
import { formatDate, money, type ProcurementBid } from '../data';
import { procurementBidApi } from '../api';
import { Pagination } from '../../shared/Pagination';
import { useResponsiveViewMode } from '../../shared/hooks';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { SortableHeader, type SortDirection } from '../../shared/SortableHeader';
import { openFileAsset } from '../../../lib/files';

const pageSize = 10;
const selectClass = 'h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none focus:border-[#0b2447] focus:ring-2 focus:ring-[#0b2447]/10';
type BidSortKey = 'id' | 'title' | 'buyer' | 'category' | 'status' | 'value' | 'startDate' | 'endDate';

let globalBidsCache: ProcurementBid[] | null = null;

const isSameBids = (a: ProcurementBid[] | null, b: ProcurementBid[]) => {
  if (!a) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || 
        a[i].status !== b[i].status || 
        a[i].participated !== b[i].participated ||
        a[i].title !== b[i].title ||
        a[i].estimatedValue !== b[i].estimatedValue ||
        a[i].endDate !== b[i].endDate) {
      return false;
    }
  }
  return true;
};

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
  const [bids, setBids] = useState<ProcurementBid[]>(() => globalBidsCache || []);
  const [loading, setLoading] = useState(() => !globalBidsCache);
  const [error, setError] = useState('');
  const [viewMode, setViewMode] = useResponsiveViewMode('phase7:bids-listing:view-mode');

  // Modal states
  const [selectedBidId, setSelectedBidId] = useState<string | null>(null);
  const [detailedBid, setDetailedBid] = useState<ProcurementBid | null>(null);
  const [isDetailsModalOpen, setIsDetailsModalOpen] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [isPublishModalOpen, setIsPublishModalOpen] = useState(false);

  const isTenderBid = (bid: ProcurementBid) => bid.sourceModel === 'TENDER';
  const viewHref = (bid: ProcurementBid) => isTenderBid(bid) && bid.sourceId ? `/tenders?tender=${bid.sourceId}` : `/bids/${bid.id}`;
  const participationHref = (bid: ProcurementBid) => {
    const target = isTenderBid(bid) && bid.sourceId ? `/seller/tenders/${bid.sourceId}/bid` : `/bids/${bid.id}/participate`;
    return user ? target : `/login?returnUrl=${encodeURIComponent(target)}`;
  };

  const handleViewDetails = (bidId: string) => {
    setSelectedBidId(bidId);
    setDetailedBid(null);
    setIsDetailsModalOpen(true);
    setLoadingDetails(true);

    procurementBidApi.detail(bidId)
      .then(data => {
        setDetailedBid(data);
      })
      .catch(err => {
        console.error('Error loading bid details:', err);
      })
      .finally(() => {
        setLoadingDetails(false);
      });
  };

  const handleDownloadDoc = async (doc: any) => {
    try {
      await openFileAsset({ id: doc.fileAssetId, url: doc.url }, doc.name);
    } catch (err: any) {
      alert(err?.message || 'Failed to open document.');
    }
  };

  const loadBids = React.useCallback(() => {
    let alive = true;
    if (!globalBidsCache) {
      setLoading(true);
    }
    setError('');
    procurementBidApi.list({ pageSize: 50 })
      .then(data => {
        if (!alive) return;
        const items = data.items || [];
        if (!isSameBids(globalBidsCache, items)) {
          globalBidsCache = items;
          setBids(items);
        }
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
    setSortKey(currentKey => {
      const newDirection = currentKey === field ? (sortDirection === 'asc' ? 'desc' : 'asc') : 'asc';
      setSortDirection(newDirection);
      return field;
    });
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
      <main className="mx-auto w-full max-w-7xl">
        <ProcurementHero
          title="Latest Buyer Requirements & Bids"
          subtitle="Search, filter, participate, download documents, and track procurement opportunities from private buyers, MSMEs, large industries, government buyers, PSUs, suppliers, and service providers."
          action={
            user?.role === 'buyer' ? (
              <Link href="/buyer/publish-bid" className="inline-flex h-10 items-center justify-center rounded-md bg-[#0b2447] px-4 text-xs font-black text-white">Publish Requirement</Link>
            ) : (
              <button onClick={() => setIsPublishModalOpen(true)} type="button" className="inline-flex h-10 items-center justify-center rounded-md bg-[#0b2447] px-4 text-xs font-black text-white">Publish Requirement</button>
            )
          }
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
                <div className="grid gap-4 xl:grid-cols-2">{pageRows.map(bid => <BidCard key={bid.id} bid={bid} viewHref={viewHref(bid)} participationHref={participationHref(bid)} participationLabel={user ? 'Participate' : 'Login to Participate'} onViewClick={() => handleViewDetails(bid.id)} />)}</div>
              ) : (
                <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[1040px] text-left text-sm">
                      <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                        <tr>
                          <th className="w-16 px-4 py-3 font-black">S.No.</th>
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
                        {pageRows.map((bid, index) => (
                          <tr key={bid.id} className="bg-white transition hover:bg-blue-50/50">
                            <td className="px-4 py-3 text-xs font-black text-slate-500">{(page - 1) * pageSize + index + 1}</td>
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
                                <button onClick={() => handleViewDetails(bid.id)} type="button" className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-700">View</button>
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

      {isDetailsModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative flex h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl animate-in zoom-in-95 duration-200">
            
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-slate-50/50 px-6 py-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-black uppercase tracking-wider text-[#c86413] bg-orange-50 px-2 py-0.5 rounded border border-orange-100">
                    {detailedBid?.id || selectedBidId}
                  </span>
                  {detailedBid && (
                    <span className="text-xs font-semibold text-slate-500">• {detailedBid.buyerType}</span>
                  )}
                </div>
                <h2 className="mt-1 text-base font-black text-slate-900 truncate pr-6" title={detailedBid?.title || 'Loading details...'}>
                  {detailedBid?.title || 'Loading detailed opportunity view...'}
                </h2>
              </div>
              <button
                onClick={() => setIsDetailsModalOpen(false)}
                className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:bg-slate-50 hover:text-slate-600 active:scale-95 shadow-sm"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto px-6 py-5 bg-slate-50/30">
              {loadingDetails ? (
                <div className="flex h-full flex-col items-center justify-center py-20">
                  <div className="h-8 w-8 animate-spin rounded-full border-4 border-slate-200 border-t-[#0b2447]"></div>
                  <p className="mt-3 text-xs font-bold text-slate-500">Fetching comprehensive details...</p>
                </div>
              ) : !detailedBid ? (
                <div className="text-center py-20">
                  <p className="text-sm font-bold text-red-500">Failed to load detailed information for this record.</p>
                </div>
              ) : (
                <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
                  
                  {/* Left Column: Details */}
                  <div className="space-y-6">
                    
                    {/* Badges & Key Stats */}
                    <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                      <div className="flex flex-wrap gap-2 mb-4">
                        <StatusBadge label={detailedBid.status} />
                        <StatusBadge label={detailedBid.technicalStatus} />
                        <StatusBadge label={detailedBid.clarificationStatus} />
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Buyer Entity</p>
                          <p className="mt-1 text-xs font-black text-slate-800 truncate">{detailedBid.buyerName}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Procurement Category</p>
                          <p className="mt-1 text-xs font-black text-slate-800 truncate">{detailedBid.category}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Department</p>
                          <p className="mt-1 text-xs font-black text-slate-800 truncate">{detailedBid.departmentName || 'Procurement'}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Quantity / Scope</p>
                          <p className="mt-1 text-xs font-black text-slate-800">{detailedBid.quantity || 'As specified'}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Estimated Value</p>
                          <p className="mt-1 text-xs font-black text-emerald-700">{money(detailedBid.estimatedValue)}</p>
                        </div>
                        <div className="rounded-lg border border-slate-100 bg-white p-3 shadow-sm">
                          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Bid Type</p>
                          <p className="mt-1 text-xs font-black text-slate-800">{detailedBid.bidType}</p>
                        </div>
                      </div>
                    </div>

                    {/* Description */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-black text-[#0b2447] flex items-center gap-1.5 uppercase tracking-wider">
                        <Info className="h-4 w-4" /> Description & Scope of Work
                      </h3>
                      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm text-xs leading-relaxed text-slate-600 whitespace-pre-line font-medium">
                        {detailedBid.description}
                      </div>
                    </div>

                    {/* Eligibility Criteria */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-black text-[#0b2447] flex items-center gap-1.5 uppercase tracking-wider">
                        <FileCheck className="h-4 w-4" /> Eligibility & Bidder Qualification Criteria
                      </h3>
                      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                        {detailedBid.eligibility && detailedBid.eligibility.length > 0 ? (
                          <ul className="space-y-2 text-xs text-slate-600">
                            {detailedBid.eligibility.map((crit, idx) => (
                              <li key={idx} className="flex gap-2 items-start bg-slate-50 px-3 py-2 rounded-md font-semibold">
                                <span className="text-blue-600 font-black">✓</span>
                                <span>{crit}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-500 font-bold bg-slate-50 p-3 rounded-md text-center">No explicit eligibility criteria listed. Basic compliance rules apply.</p>
                        )}
                      </div>
                    </div>

                    {/* Terms and Conditions */}
                    <div className="space-y-2">
                      <h3 className="text-xs font-black text-[#0b2447] flex items-center gap-1.5 uppercase tracking-wider">
                        <Shield className="h-4 w-4" /> Commercial Terms & Conditions
                      </h3>
                      <div className="rounded-xl border border-slate-100 bg-white p-4 shadow-sm">
                        {detailedBid.terms && detailedBid.terms.length > 0 ? (
                          <ul className="space-y-2 text-xs text-slate-600">
                            {detailedBid.terms.map((term, idx) => (
                              <li key={idx} className="flex gap-2 items-start bg-slate-50 px-3 py-2 rounded-md font-semibold">
                                <span className="text-blue-600 font-black">•</span>
                                <span>{term}</span>
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-xs text-slate-500 font-bold bg-slate-50 p-3 rounded-md text-center">Standard portal terms and procurement guidelines apply.</p>
                        )}
                      </div>
                    </div>

                  </div>

                  {/* Right Column: Timelines & Documents */}
                  <div className="space-y-6">
                    
                    {/* Important Timelines */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="text-xs font-black text-[#0b2447] flex items-center gap-1.5 border-b border-slate-100 pb-3 uppercase tracking-wider">
                        <CalendarDays className="h-4 w-4 text-[#0b2447]" /> Key Milestones & Dates
                      </h3>
                      <div className="mt-3 space-y-3">
                        {[
                          ['Published Date', detailedBid.startDate],
                          ['Closing Date', detailedBid.endDate],
                          ...((detailedBid.importantDates || []).filter(d => !d.label.toLowerCase().includes('published') && !d.label.toLowerCase().includes('closes')).map(d => [d.label, d.date]))
                        ].map(([label, value], idx) => (
                          <div key={idx} className="flex justify-between items-center text-xs border-b border-slate-50 pb-2 last:border-0 last:pb-0">
                            <span className="font-semibold text-slate-500">{label}</span>
                            <span className="font-black text-slate-800">{formatDate(String(value))}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Required Submissions Checklist */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="text-xs font-black text-[#0b2447] flex items-center gap-1.5 border-b border-slate-100 pb-3 uppercase tracking-wider">
                        <FileText className="h-4 w-4 text-[#0b2447]" /> Required Submissions
                      </h3>
                      <div className="mt-3">
                        {detailedBid.requiredDocuments && detailedBid.requiredDocuments.length > 0 ? (
                          <div className="flex flex-wrap gap-1.5">
                            {detailedBid.requiredDocuments.map((docName, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1 rounded bg-slate-100 border border-slate-200 px-2 py-1 text-[10px] font-black text-slate-700">
                                📄 {docName}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-500 font-bold bg-slate-50 p-3 rounded-md text-center">No special submission documents requested.</p>
                        )}
                      </div>
                    </div>

                    {/* Uploaded Bid Documents */}
                    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
                      <h3 className="text-xs font-black text-[#0b2447] flex items-center gap-1.5 border-b border-slate-100 pb-3 uppercase tracking-wider">
                        <Download className="h-4 w-4 text-[#0b2447]" /> Uploaded Specifications & BOQ
                      </h3>
                      <div className="mt-3 space-y-2">
                        {detailedBid.bidDocuments && detailedBid.bidDocuments.length > 0 ? (
                          detailedBid.bidDocuments.map((doc, idx) => (
                            <button
                              key={idx}
                              onClick={() => handleDownloadDoc(doc)}
                              type="button"
                              className="flex w-full items-center gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left transition hover:bg-slate-50 hover:border-slate-300"
                            >
                              <FileText className="h-4 w-4 text-[#0b2447] shrink-0" />
                              <span className="min-w-0 flex-1">
                                <span className="block text-[11px] font-black text-slate-800 truncate" title={doc.name}>
                                  {doc.name}
                                </span>
                                <span className="text-[9px] text-slate-500">
                                  {doc.meta}
                                </span>
                              </span>
                              <Download className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            </button>
                          ))
                        ) : (
                          <p className="text-xs text-slate-500 font-bold bg-slate-50 p-3 rounded-md text-center">No documents uploaded for this procurement draft.</p>
                        )}
                      </div>
                    </div>

                  </div>

                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-end gap-3 border-t border-slate-100 bg-slate-50/50 px-6 py-4">
              <button
                onClick={() => setIsDetailsModalOpen(false)}
                className="inline-flex h-10 items-center justify-center rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50"
              >
                Close View
              </button>
              {detailedBid && (
                <Link
                  href={participationHref(detailedBid)}
                  className="inline-flex h-10 items-center justify-center rounded-xl bg-[#0b2447] px-5 text-xs font-black text-white shadow-sm transition hover:bg-[#12335f] active:scale-98"
                >
                  {user ? 'Participate in Bid' : 'Login to Participate'}
                </Link>
              )}
            </div>

          </div>
        </div>
      )}

      {isPublishModalOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="relative w-full max-w-md overflow-hidden rounded-2xl bg-white p-6 shadow-2xl animate-in zoom-in-95 duration-200 text-center">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-orange-100 text-orange-600">
              <Landmark className="h-6 w-6" />
            </div>
            <h3 className="mt-4 text-lg font-black text-[#0b2447]">
              Publish Procurement Requirement
            </h3>
            <p className="mt-2 text-xs leading-relaxed text-slate-500 font-semibold">
              To publish a new RFQ, Tender, or procurement requirement on JSGSMILE, please login or register with a verified Buyer organization account.
            </p>
            <div className="mt-6 flex flex-col gap-2">
              <Link
                href="/login?returnUrl=/buyer/publish-bid"
                className="inline-flex h-10 w-full items-center justify-center rounded-xl bg-[#0b2447] text-xs font-black text-white shadow-sm transition hover:bg-[#12335f] active:scale-98"
              >
                Login as Buyer
              </Link>
              <Link
                href="/buyer/register"
                className="inline-flex h-10 w-full items-center justify-center rounded-xl border border-slate-200 bg-white text-xs font-black text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-98"
              >
                Register as Buyer
              </Link>
              <button
                onClick={() => setIsPublishModalOpen(false)}
                className="mt-4 text-xs font-black text-slate-400 hover:text-slate-600 transition"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </PageShell>
  );
}
