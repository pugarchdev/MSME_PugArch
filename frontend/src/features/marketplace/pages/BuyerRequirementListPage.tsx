'use client';
import React, { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type BuyerRequirement, type MarketplaceCategory } from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { LatestBids } from '../components/LatestBids';
import {
    Search, Filter, ChevronRight, SlidersHorizontal,
    MapPin, Package, Wrench, Clock, Flame, CheckCircle,
    Landmark, BadgeCheck, Eye, X
} from 'lucide-react';

/* ── filter tabs ── */
const TABS = [
    { id: 'all', label: 'All Requirements' },
    { id: 'products', label: 'Products Only' },
    { id: 'services', label: 'Services Only' },
    { id: 'closing_soon', label: 'Closing Soon' },
    { id: 'large_industries', label: 'Large Industries' },
    { id: 'government', label: 'Government' },
] as const;

const SORT_OPTIONS = [
    { value: 'latest', label: 'Latest First' },
    { value: 'deadline', label: 'Deadline Soonest' },
    { value: 'budget', label: 'Highest Budget' },
];

function daysLeft(iso: string) {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function statusBadge(req: BuyerRequirement) {
    const status = String(req.computedStatus || req.statusLabel || req.status || '').toUpperCase();
    const d = req.daysRemaining ?? daysLeft(req.lastDate);
    if (status === 'AWARDED') return { label: 'Awarded', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="h-3 w-3" /> };
    if (status === 'CLOSED' || d <= 0) return { label: 'Closed', cls: 'bg-slate-100 text-slate-500 border-slate-200', icon: null };
    if (status === 'UNDER_EVALUATION' || status === 'UNDER REVIEW') return { label: 'Under Evaluation', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: null };
    if (status === 'CLOSING_SOON' || req.isUrgent || d <= 7) return { label: 'Closing Soon', cls: 'bg-red-50 text-red-700 border-red-200', icon: <Flame className="h-3 w-3" /> };
    return { label: 'Open', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: null };
}

/* ── Bid detail modal (reuses same pattern as LatestBids) ── */
import { BidDetailModal } from '../components/BidDetailModal';

export default function BuyerRequirementListPage() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const router = useRouter();

    const [tab, setTab] = useState(searchParams?.get('tab') || 'all');
    const [query, setQuery] = useState(searchParams?.get('q') || '');
    const [sort, setSort] = useState('latest');
    const [location, setLocation] = useState('');
    const [minBudget, setMinBudget] = useState('');
    const [maxBudget, setMaxBudget] = useState('');
    const [showFilters, setShowFilters] = useState(false);
    const [page, setPage] = useState(1);

    const [requirements, setRequirements] = useState<BuyerRequirement[]>([]);
    const [total, setTotal] = useState(0);
    const [loading, setLoading] = useState(true);
    const [selected, setSelected] = useState<BuyerRequirement | null>(null);

    const PAGE_SIZE = 12;

    const load = useCallback(() => {
        setLoading(true);
        const params: Record<string, string | number> = { tab, pageSize: PAGE_SIZE, page };
        if (query.trim()) params.q = query.trim();
        if (location.trim()) params.location = location.trim();

        marketplaceApi.getRequirements(params)
            .then((data: any) => {
                let rows: BuyerRequirement[] = data.requirements || [];
                // client-side sort fallback
                if (sort === 'deadline') rows = [...rows].sort((a, b) => new Date(a.lastDate).getTime() - new Date(b.lastDate).getTime());
                if (sort === 'budget') rows = [...rows].sort((a, b) => Number(b.budgetMax || 0) - Number(a.budgetMax || 0));
                // client-side budget filter
                if (minBudget) rows = rows.filter(r => Number(r.budgetMax || r.budgetMin || 0) >= Number(minBudget));
                if (maxBudget) rows = rows.filter(r => Number(r.budgetMin || r.budgetMax || 0) <= Number(maxBudget));
                setRequirements(rows);
                setTotal(data.total || rows.length);
            })
            .catch(() => { toast.error('Failed to load requirements'); setRequirements([]); })
            .finally(() => setLoading(false));
    }, [tab, query, sort, location, minBudget, maxBudget, page]);

    useEffect(() => { setPage(1); }, [tab, query, sort, location, minBudget, maxBudget]);
    useEffect(() => { load(); }, [load]);

    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const activeFilters = [location, minBudget, maxBudget].filter(Boolean).length;

    return (
        <>
            {selected && <BidDetailModal bid={selected} onClose={() => setSelected(null)} />}

            <div className="flex min-h-dvh flex-col bg-[#f1f3f6]">
                <div className="brand-tricolor-strip w-full" />
                <MarketplaceHeader user={user} />

                <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-6">
                    {/* ── Page header ── */}
                    <div className="mb-6">
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 mb-2">
                            <Link href="/" className="hover:text-[#0b2447]">Home</Link>
                            <ChevronRight className="h-3 w-3" />
                            <span className="font-semibold text-slate-700">Buyer Requirements & Bids</span>
                        </div>
                        <h1 className="text-xl sm:text-2xl font-bold text-[#0b2447]">Latest Buyer Requirements &amp; Bids</h1>
                        <p className="mt-1 text-sm text-slate-500">
                            Open procurement requirements from verified buyers. Public can view — sellers can respond.
                        </p>
                    </div>

                    {/* ── Search + filter bar ── */}
                    <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 space-y-3">
                        <div className="flex gap-3 flex-col sm:flex-row">
                            {/* Search */}
                            <form
                                onSubmit={e => { e.preventDefault(); load(); }}
                                className="flex flex-1 items-center h-10 rounded-lg border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-[#0b2447]/20 focus-within:border-[#0b2447] overflow-hidden"
                            >
                                <Search className="h-4 w-4 text-slate-400 ml-3 shrink-0" />
                                <input
                                    value={query}
                                    onChange={e => setQuery(e.target.value)}
                                    placeholder="Search requirements by title, description, location…"
                                    className="flex-1 h-full bg-transparent text-sm pl-2 pr-1 outline-none"
                                />
                                {query && (
                                    <button type="button" onClick={() => setQuery('')} className="px-2 [&:not(:disabled):hover]:translate-y-0">
                                        <X className="h-3.5 w-3.5 text-slate-400" />
                                    </button>
                                )}
                                <button type="submit" className="h-full px-4 bg-[#0b2447] text-white text-[11px] font-bold hover:bg-[#12335f] transition [&:not(:disabled):hover]:translate-y-0">
                                    Search
                                </button>
                            </form>

                            {/* Sort */}
                            <select
                                value={sort}
                                onChange={e => setSort(e.target.value)}
                                className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 sm:w-48"
                            >
                                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>

                            {/* Advanced filter toggle */}
                            <button
                                onClick={() => setShowFilters(v => !v)}
                                className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg border text-xs font-semibold transition [&:not(:disabled):hover]:translate-y-0 ${showFilters ? 'bg-[#0b2447] text-white border-[#0b2447]' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                            >
                                <SlidersHorizontal className="h-3.5 w-3.5" />
                                Filters {activeFilters > 0 && <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] flex items-center justify-center">{activeFilters}</span>}
                            </button>
                        </div>

                        {/* Advanced filters panel */}
                        {showFilters && (
                            <div className="grid sm:grid-cols-3 gap-3 pt-2 border-t border-slate-100">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Location</label>
                                    <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Jharsuguda" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Min Budget (₹)</label>
                                    <input type="number" value={minBudget} onChange={e => setMinBudget(e.target.value)} placeholder="0" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Max Budget (₹)</label>
                                    <input type="number" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} placeholder="Any" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20" />
                                </div>
                                {activeFilters > 0 && (
                                    <button onClick={() => { setLocation(''); setMinBudget(''); setMaxBudget(''); }} className="text-xs font-bold text-red-600 hover:underline self-end [&:not(:disabled):hover]:translate-y-0">
                                        Clear Filters
                                    </button>
                                )}
                            </div>
                        )}
                    </div>

                    {/* ── Category tabs ── */}
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1 mb-5">
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                className={`h-9 shrink-0 rounded-lg border px-4 text-xs font-bold transition [&:not(:disabled):hover]:translate-y-0 ${tab === t.id ? 'border-[#0b2447] bg-[#0b2447] text-white' : 'border-slate-200 bg-white text-slate-600 hover:border-[#0b2447]/30'}`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    {/* ── Results header ── */}
                    <div className="flex items-center justify-between mb-4">
                        <p className="text-xs text-slate-500">
                            {loading ? 'Loading…' : `${total} requirement${total !== 1 ? 's' : ''} found`}
                        </p>
                    </div>

                    {/* ── Grid ── */}
                    {loading ? (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {Array.from({ length: 6 }).map((_, i) => (
                                <div key={i} className="h-64 animate-pulse rounded-xl bg-white border border-slate-200" />
                            ))}
                        </div>
                    ) : requirements.length === 0 ? (
                        <div className="text-center py-20 bg-white rounded-xl border border-slate-200">
                            <Package className="h-12 w-12 text-slate-200 mx-auto mb-3" />
                            <p className="text-sm font-semibold text-slate-500">No requirements found matching your criteria.</p>
                            <button onClick={() => { setQuery(''); setLocation(''); setMinBudget(''); setMaxBudget(''); setTab('all'); }} className="mt-3 text-xs font-bold text-[#0b2447] hover:underline [&:not(:disabled):hover]:translate-y-0">
                                Clear all filters
                            </button>
                        </div>
                    ) : (
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {requirements.map(req => {
                                const badge = statusBadge(req);
                                const days = daysLeft(req.lastDate);
                                const isSvc = req.requirementType === 'SERVICE';
                                return (
                                    <div
                                        key={`${req.sourceModel || 'buyer'}-${req.id}`}
                                        className="group bg-white rounded-xl border border-slate-200 hover:border-[#0b2447]/30 hover:shadow-lg hover:-translate-y-0.5 transition-all duration-300 flex flex-col overflow-hidden"
                                    >
                                        <div className={`h-1 w-full ${isSvc ? 'bg-purple-400' : 'bg-[#0b2447]'}`} />
                                        <div className="p-4 flex-1 flex flex-col gap-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="flex items-start gap-2 min-w-0">
                                                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${isSvc ? 'bg-purple-50 text-purple-600' : 'bg-blue-50 text-blue-600'}`}>
                                                        {isSvc ? <Wrench className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                                                    </div>
                                                    <h3 className="text-xs font-bold text-slate-800 line-clamp-2 leading-snug group-hover:text-[#0b2447] transition">
                                                        {req.title}
                                                    </h3>
                                                </div>
                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[9px] font-bold shrink-0 ${badge.cls}`}>
                                                    {badge.icon}{badge.label}
                                                </span>
                                            </div>

                                            {req.buyerOrganization && (
                                                <div className="flex items-center gap-1.5">
                                                    <div className="w-5 h-5 rounded bg-slate-100 flex items-center justify-center shrink-0">
                                                        <Landmark className="h-3 w-3 text-slate-500" />
                                                    </div>
                                                    <p className="text-[10px] font-semibold text-slate-600 truncate">{req.buyerOrganization.organizationName}</p>
                                                    {req.buyerOrganization.verificationStatus === 'VERIFIED' && <BadgeCheck className="h-3 w-3 text-green-500 shrink-0" />}
                                                </div>
                                            )}

                                            <div className="flex flex-wrap gap-x-3 gap-y-1">
                                                {req.category && <span className="text-[9px] font-medium text-slate-500 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">{req.category.name}</span>}
                                                {req.location && <span className="text-[9px] text-slate-400 inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{req.location}</span>}
                                                {req.quantity && req.unit && <span className="text-[9px] text-slate-400">{req.quantity} {req.unit}</span>}
                                            </div>

                                            {(req.budgetMin || req.budgetMax) && (
                                                <p className="text-[10px]">
                                                    <span className="font-bold text-[#0b2447]">
                                                        ₹{Number(req.budgetMin || req.budgetMax).toLocaleString('en-IN')}
                                                        {req.budgetMax && req.budgetMin && req.budgetMax !== req.budgetMin && <> – ₹{Number(req.budgetMax).toLocaleString('en-IN')}</>}
                                                    </span>
                                                    <span className="text-slate-400 ml-1">est. budget</span>
                                                </p>
                                            )}

                                            {req.description && (
                                                <p className="text-[10px] text-slate-500 line-clamp-2">{req.description}</p>
                                            )}

                                            <div className="flex items-center justify-between pt-2 border-t border-slate-50 mt-auto">
                                                <span className={`flex items-center gap-1 text-[10px] font-semibold ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-slate-500'}`}>
                                                    <Clock className="h-3 w-3" />
                                                    {days <= 0 ? 'Closed' : `${days}d left`}
                                                    <span className="text-[9px] font-normal text-slate-400 ml-0.5">· {new Date(req.lastDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</span>
                                                </span>
                                                <button
                                                    onClick={() => setSelected(req)}
                                                    className="inline-flex items-center gap-1 h-7 px-3 rounded-lg bg-[#0b2447] text-white text-[10px] font-bold hover:bg-[#12335f] active:scale-95 transition [&:not(:disabled):hover]:translate-y-0"
                                                >
                                                    <Eye className="h-3 w-3" /> View Details
                                                </button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ── Pagination ── */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-8">
                            <button disabled={page <= 1} onClick={() => setPage(p => p - 1)} className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-40 hover:bg-slate-50 [&:not(:disabled):hover]:translate-y-0">← Prev</button>
                            <span className="text-xs text-slate-500 font-medium">Page {page} of {totalPages}</span>
                            <button disabled={page >= totalPages} onClick={() => setPage(p => p + 1)} className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-semibold disabled:opacity-40 hover:bg-slate-50 [&:not(:disabled):hover]:translate-y-0">Next →</button>
                        </div>
                    )}
                </main>

                <MarketplaceFooter />
            </div>
        </>
    );
}
