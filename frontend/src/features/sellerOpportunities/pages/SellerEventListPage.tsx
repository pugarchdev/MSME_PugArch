'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { Search, RefreshCw, Eye, CalendarDays, ClipboardList, Filter, Gavel, FileText, Users, CheckCircle2, type LucideIcon } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { procurementBidApi } from '../../procurementBid/api';
import type { ProcurementBid } from '../../procurementBid/data';
import { MethodBadge, ProcurementStatusBadge, BuyerTypeBadge } from '../../procurementWizard/components/SourcingWizardComponents';
import { Pagination } from '../../shared/Pagination';
import { usePagination } from '../../shared/hooks';


type SellerEventView = 'all' | 'invited' | 'submitted' | 'clarifications';

const getEventView = (filter: string | null): SellerEventView => {
  if (filter === 'invited') return 'invited';
  if (filter === 'submitted') return 'submitted';
  if (filter === 'clarifications') return 'clarifications';
  return 'all';
};

const isInvitedBid = (bid: ProcurementBid) => {
  const eligibility = Array.isArray(bid.eligibility) ? bid.eligibility.join(' ') : String(bid.eligibility || '');
  const method = String(bid.procurementType || bid.bidType || '').toUpperCase();
  return eligibility.toLowerCase().includes('invite') || method === 'RFQ';
};

const hasClarification = (bid: ProcurementBid) => {
  const status = String(bid.clarificationStatus || '').toLowerCase();
  return status === 'pending' || status === 'responded' || Boolean(bid.clarifications?.length);
};

/* ── KpiCard ─────────────────────────────────────────── */
const KPI_COLORS: Record<string, string> = {
  blue:   'bg-blue-50 text-blue-700 ring-blue-200/60',
  green:  'bg-emerald-50 text-emerald-700 ring-emerald-200/60',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200/60',
  amber:  'bg-amber-50 text-amber-700 ring-amber-200/60',
  red:    'bg-red-50 text-red-700 ring-red-200/60',
  indigo: 'bg-indigo-50 text-indigo-700 ring-indigo-200/60',
};

function KpiCard({ label, value, icon: Icon, color = 'blue' }: { label: string; value: string | number; icon: LucideIcon; color?: string }) {
  const palette = KPI_COLORS[color] ?? KPI_COLORS.blue;
  return (
    <div className={`rounded-2xl p-4 ring-1 ${palette} transition hover:scale-[1.02]`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 opacity-70" />
        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</span>
      </div>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}

export default function SellerEventListPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterParam = searchParams.get('filter');
  const activeView = getEventView(filterParam);

  const [bids, setBids] = useState<ProcurementBid[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  
  // Filters
  const [method, setMethod] = useState('');
  const [status, setStatus] = useState('');
  const [submissionStatus, setSubmissionStatus] = useState('');
  const [techStatus, setTechStatus] = useState(() => {
    if (filterParam === 'technical-pending') return 'Pending';
    return '';
  });
  const [finStatus, setFinStatus] = useState(() => {
    if (filterParam === 'financial-pending') return 'Pending';
    return '';
  });
  const [deadlineRange, setDeadlineRange] = useState('');
  const [category, setCategory] = useState('');
  const [buyerOrg, setBuyerOrg] = useState('');

  const loadData = React.useCallback(() => {
    setLoading(true);
    setError('');
    procurementBidApi.list({ pageSize: 100 })
      .then(res => {
        setBids(res.items || []);
      })
      .catch(err => {
        setError(err.message || 'Failed to load procurement opportunities');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    setPage(1);
    setQuery('');
    setMethod('');
    setStatus('');
    setSubmissionStatus('');
    setTechStatus('');
    setFinStatus('');
    setDeadlineRange('');
    setCategory('');
    setBuyerOrg('');
  }, [activeView]);

  // Unique values for filter dropdowns
  const categories = useMemo(() => Array.from(new Set(bids.map(b => b.category).filter(Boolean))).sort(), [bids]);
  const buyerOrgs = useMemo(() => Array.from(new Set(bids.map(b => b.buyerName).filter(Boolean))).sort(), [bids]);
  const methods = useMemo(() => Array.from(new Set(bids.map(b => b.procurementType).filter(Boolean))).sort(), [bids]);
  const statuses = useMemo(() => Array.from(new Set(bids.map(b => b.status).filter(Boolean))).sort(), [bids]);

  // Apply filters
  const filteredBids = useMemo(() => {
    return bids.filter(bid => {
      // Free-text search
      if (query.trim()) {
        const text = query.toLowerCase();
        const match = [bid.id, bid.title, bid.buyerName, bid.category, bid.description]
          .join(' ')
          .toLowerCase()
          .includes(text);
        if (!match) return false;
      }

      // Dropdown filters
      if (method && bid.procurementType !== method) return false;
      if (status && bid.status !== status) return false;
      if (category && bid.category !== category) return false;
      if (buyerOrg && bid.buyerName !== buyerOrg) return false;

      // Route-level views. These make sidebar pages distinct instead of cosmetic duplicates.
      if (activeView === 'invited' && !isInvitedBid(bid)) return false;
      if (activeView === 'submitted' && !bid.participated) return false;
      if (activeView === 'clarifications' && !hasClarification(bid)) return false;

      // Manual submission filter for the All view.
      if (activeView === 'all' && submissionStatus === 'invited' && !isInvitedBid(bid)) return false;
      if (activeView === 'all' && submissionStatus === 'submitted' && !bid.participated) return false;

      // Packet status filters
      if (techStatus && bid.technicalStatus !== techStatus) return false;
      if (finStatus && bid.currentStage !== finStatus) return false;

      // Deadline filter
      if (deadlineRange === '7' && bid.endDate) {
        const diff = (new Date(bid.endDate).getTime() - Date.now()) / 86400000;
        if (diff < 0 || diff > 7) return false;
      }

      return true;
    });
  }, [activeView, bids, query, method, status, category, buyerOrg, submissionStatus, techStatus, finStatus, deadlineRange]);

  const { page, pageSize, total, pageItems, setPage } = usePagination(filteredBids, 10);

  const resetFilters = () => {
    setQuery('');
    setMethod('');
    setStatus('');
    setSubmissionStatus('');
    setTechStatus('');
    setFinStatus('');
    setDeadlineRange('');
    setCategory('');
    setBuyerOrg('');
    setPage(1);
  };

  const getSubmissionStatusBadge = (bid: ProcurementBid) => {
    if (bid.participated) {
      return <span className="inline-flex items-center rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-bold text-emerald-800">SUBMITTED</span>;
    }
    return <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-100 px-2 py-0.5 text-[9px] font-bold text-slate-650">PENDING</span>;
  };

  const viewMeta = {
    all: {
      title: 'Bids & Tenders Portal',
      label: 'All Bids & Tenders',
      desc: 'Live procurement bids, RFQs, RFPs, reverse auctions, and rate contracts open for participation.',
      empty: 'No active opportunities found'
    },
    invited: {
      title: 'Invited Bids & Tenders',
      label: 'Invited Bids',
      desc: 'Procurement bids where your organization was invited or matched through an RFQ-style sourcing event.',
      empty: 'No invited bids found'
    },
    submitted: {
      title: 'Submitted Bids',
      label: 'Submitted Bids',
      desc: 'Bids and tenders where your organization has already submitted participation or commercial response.',
      empty: 'No submitted bids found'
    },
    clarifications: {
      title: 'Bid Clarifications',
      label: 'Clarifications',
      desc: 'Clarification requests and responses connected to your tender participation lifecycle.',
      empty: 'No clarification items found'
    }
  }[activeView];

  const viewTabs: Array<{ label: string; href: string; view: SellerEventView }> = [
    { label: 'All', href: '/seller/procurement/events', view: 'all' },
    { label: 'Invited', href: '/seller/procurement/events?filter=invited', view: 'invited' },
    { label: 'Submitted', href: '/seller/procurement/events?filter=submitted', view: 'submitted' },
    { label: 'Clarifications', href: '/seller/procurement/events?filter=clarifications', view: 'clarifications' },
  ];

  /* KPI counts */
  const kpiTotal = bids.length;
  const kpiInvited = bids.filter(isInvitedBid).length;
  const kpiSubmitted = bids.filter(b => b.participated).length;
  const kpiClosingSoon = bids.filter(b => {
    if (!b.endDate) return false;
    const diff = (new Date(b.endDate).getTime() - Date.now()) / 86400000;
    return diff >= 0 && diff <= 7;
  }).length;

  return (
    <div className="mx-auto max-w-[1560px] space-y-5 px-4 pb-12">
      {/* ── Header (transparent) ── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#12335f]">{viewMeta.label}</p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">{viewMeta.title}</h1>
            <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-500">{viewMeta.desc}</p>
          </div>
          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" onClick={() => router.push('/seller/procurement')} className="h-10 rounded-lg text-xs font-black uppercase shadow-sm">
              Hub Dashboard
            </Button>
            <Button type="button" variant="outline" onClick={loadData} className="h-10 rounded-lg text-xs font-black uppercase shadow-sm">
              <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap gap-2">
          {viewTabs.map(tab => (
            <Link
              key={tab.view}
              href={tab.href}
              className={cn(
                'inline-flex h-8 items-center rounded-lg border px-3 text-[10px] font-black uppercase tracking-wide transition',
                activeView === tab.view
                  ? 'border-[#12335f] bg-[#12335f] text-white'
                  : 'border-slate-200 bg-white text-slate-600 hover:border-[#12335f] hover:text-[#12335f]'
              )}
            >
              {tab.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard label="Total Bids" value={kpiTotal} icon={ClipboardList} color="blue" />
        <KpiCard label="Invited" value={kpiInvited} icon={Users} color="purple" />
        <KpiCard label="Submitted" value={kpiSubmitted} icon={CheckCircle2} color="green" />
        <KpiCard label="Closing in 7 Days" value={kpiClosingSoon} icon={CalendarDays} color="amber" />
      </div>

      {activeView === 'submitted' ? (
        <div className="p-8 text-center text-slate-500">Submitted bids section is currently disabled.</div>
      ) : (
        <>
          {/* ── Filter Bar (border-y) ── */}
          <div className="flex flex-wrap items-center gap-3 border-y border-slate-200 bg-slate-50/50 px-4 py-3">
            <div className="relative min-w-[200px] flex-1 max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Search..."
                className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
              />
            </div>

            <select value={method} onChange={e => setMethod(e.target.value)} className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
              <option value="">All Types</option>
              {methods.map(m => <option key={m} value={m}>{m}</option>)}
            </select>

            <select value={status} onChange={e => setStatus(e.target.value)} className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
              <option value="">All Statuses</option>
              {statuses.map(s => <option key={s} value={s}>{s}</option>)}
            </select>

            <select value={submissionStatus} onChange={e => setSubmissionStatus(e.target.value)} className="h-10 min-w-[150px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
              <option value="">All Submissions</option>
              <option value="invited">Invited Bids</option>
              <option value="submitted">Submitted Only</option>
            </select>

            <select value={deadlineRange} onChange={e => setDeadlineRange(e.target.value)} className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20">
              <option value="">Any Deadline</option>
              <option value="7">Closing in 7 Days</option>
            </select>

            <Button type="button" variant="ghost" onClick={resetFilters} className="h-10 px-3 text-xs text-rose-600 hover:text-rose-700 font-black uppercase">
              Reset
            </Button>

            <span className="ml-auto text-[10px] font-black uppercase tracking-wider text-slate-400">
              {filteredBids.length} of {bids.length}
            </span>
          </div>

          {/* ── Table ── */}
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            {loading ? (
              <div className="p-8 text-center space-y-2">
                <RefreshCw className="h-6 w-6 animate-spin mx-auto text-[#12335f]" />
                <p className="text-xs text-slate-500 font-bold">Loading bids & tenders...</p>
              </div>
            ) : error ? (
              <div className="p-8 text-center text-rose-600 font-bold text-xs">{error}</div>
            ) : pageItems.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <ClipboardList className="h-10 w-10 mx-auto text-slate-350" />
                <p className="text-sm font-bold text-slate-800">{viewMeta.empty}</p>
                <p className="text-xs text-slate-500 max-w-sm mx-auto font-semibold">
                  {activeView === 'all'
                    ? 'Adjust filters or search query, or verify with buyer organization invitations.'
                    : 'This section is intentionally filtered. Use All Bids & Tenders to see the full list.'}
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-slate-100 bg-slate-50/70 text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                      <th className="px-4 py-3">Sr.</th>
                      <th className="px-4 py-3">Bid / Tender ID</th>
                      <th className="px-4 py-3">Title & Org</th>
                      <th className="px-4 py-3">Type</th>
                      <th className="px-4 py-3">Category</th>
                      <th className="px-4 py-3">Deadline</th>
                      <th className="px-4 py-3">Tender Status</th>
                      <th className="px-4 py-3">My Status</th>
                      <th className="px-4 py-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pageItems.map((bid, index) => (
                      <tr key={bid.id} className="transition hover:bg-slate-50/60">
                        <td className="px-4 py-3.5 text-xs font-black text-slate-400">{String((page - 1) * pageSize + index + 1).padStart(2, '0')}</td>
                        <td className="px-4 py-3.5 text-xs font-black text-slate-900">{bid.id}</td>
                        <td className="px-4 py-3.5 space-y-0.5">
                          <p className="text-xs font-bold text-slate-800 leading-snug line-clamp-1">{bid.title}</p>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-semibold text-slate-500">{bid.buyerName}</span>
                            {bid.buyerType && <BuyerTypeBadge buyerType={bid.buyerType} />}
                          </div>
                        </td>
                        <td className="px-4 py-3.5">
                          <MethodBadge method={bid.procurementType || 'Open Bid'} />
                        </td>
                        <td className="px-4 py-3.5 text-xs font-semibold text-slate-600">{bid.category}</td>
                        <td className="px-4 py-3.5 text-xs font-semibold text-slate-600">
                          {bid.endDate ? new Date(bid.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : 'NA'}
                        </td>
                        <td className="px-4 py-3.5">
                          <ProcurementStatusBadge status={bid.status} />
                        </td>
                        <td className="px-4 py-3.5 space-y-1">
                          <div>{getSubmissionStatusBadge(bid)}</div>
                          <div className="flex gap-1">
                            <span className="text-[8px] font-black uppercase text-slate-450">Tech: {bid.technicalStatus || 'Pending'}</span>
                            <span className="text-[8px] font-black uppercase text-slate-450">Fin: {bid.currentStage || 'Pending'}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-center">
                          <div className="flex items-center justify-center gap-1.5">
                            <Link href={`/seller/procurement/events/${bid.id}`}>
                              <Button type="button" size="sm" variant="outline" className="h-8 rounded-lg text-[10px] font-extrabold uppercase tracking-wide">
                                <Eye className="mr-1 h-3.5 w-3.5" /> View
                              </Button>
                            </Link>
                            {bid.participated && (
                              <Link href={`/quotations?tenderId=${bid.id}`}>
                                <Button type="button" size="sm" className="h-8 rounded-lg bg-[#12335f] text-white hover:bg-[#0b2445] text-[10px] font-extrabold uppercase tracking-wide">
                                  Quote
                                </Button>
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {/* Pagination */}
            {total > pageSize && (
              <div className="border-t border-slate-100 p-3 flex justify-center bg-slate-50/50">
                <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} />
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
