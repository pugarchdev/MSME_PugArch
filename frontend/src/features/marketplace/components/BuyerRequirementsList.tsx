'use client';

import React, { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
    Search, Filter, SlidersHorizontal, MapPin, Package,
    Wrench, Clock, Flame, CheckCircle, Landmark,
    BadgeCheck, Eye, X, Grid2X2, List, Send
} from 'lucide-react';
import { toast } from 'sonner';

import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type BuyerRequirement } from '../api';
import { BidDetailModal } from './BidDetailModal';
import { 
    formatBudgetRange, 
    formatDateIN, 
    getDeadlineLabel, 
    getProcurementStatus, 
    getStatusBadgeClass 
} from '../utils/procurementDisplay';
import { useResponsiveViewMode } from '../../shared/hooks';
import { cn } from '../../../lib/utils';

// Helper labels
function buyerTypeLabel(type?: string) {
    if (type === 'GOVERNMENT' || type === 'PSU') return 'Government Buyer';
    if (type === 'MSME') return 'MSME Buyer';
    if (type === 'EDUCATIONAL_INSTITUTION') return 'Institution';
    if (type === 'PUBLIC_LIMITED' || type === 'PRIVATE_LIMITED') return 'Large Scale Industry';
    return 'Private Buyer';
}

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('') || 'B';
}

function statusBadge(req: BuyerRequirement) {
    const status = getProcurementStatus({
        status: req.status,
        computedStatus: req.computedStatus,
        statusLabel: req.statusLabel,
        dueDate: req.lastDate,
        isUrgent: req.isUrgent
    });
    return {
        ...status,
        cls: getStatusBadgeClass(status.code),
        icon: status.code === 'AWARDED'
            ? <CheckCircle className="h-3 w-3" />
            : status.code === 'CLOSING_SOON' || status.code === 'CLOSING_TODAY'
                ? <Flame className="h-3 w-3" />
                : null
    };
}

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

interface Props {
    buyerOrganizationId?: number | 'all';
    limit?: number;
    showFilters?: boolean;
    showSearch?: boolean;
    showTabs?: boolean;
    showPagination?: boolean;
}

export function BuyerRequirementsList({
    buyerOrganizationId = 'all',
    limit,
    showFilters = false,
    showSearch = false,
    showTabs = false,
    showPagination = false
}: Props) {
    const { user } = useAuth();
    const router = useRouter();

    const [tab, setTab] = useState('all');
    const [query, setQuery] = useState('');
    const [sort, setSort] = useState('latest');
    const [location, setLocation] = useState('');
    const [minBudget, setMinBudget] = useState('');
    const [maxBudget, setMaxBudget] = useState('');
    const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
    const [page, setPage] = useState(1);
    const [viewMode, setViewMode] = useResponsiveViewMode('marketplace:requirements:view-mode');
    const [selected, setSelected] = useState<BuyerRequirement | null>(null);

    const isSeller = user?.role === 'seller' || user?.role === 'admin' || user?.role === 'master_admin';
    const actionLabel = user ? (isSeller ? 'Submit Quote' : 'View Details') : 'Login to Submit';
    const pageSize = limit || 12;

    const queryParams = useMemo(() => {
        const params: Record<string, string | number> = {
            page,
            pageSize,
        };

        if (buyerOrganizationId !== 'all') {
            params.buyerOrganizationId = buyerOrganizationId;
        } else {
            params.tab = tab;
        }

        if (query.trim()) params.q = query.trim();
        if (location.trim()) params.location = location.trim();

        return params;
    }, [buyerOrganizationId, tab, query, location, page, pageSize]);

    const { data, isLoading, isFetching } = useQuery({
        queryKey: ['marketplaceRequirements', queryParams, sort, minBudget, maxBudget],
        queryFn: () => marketplaceApi.getRequirements(queryParams),
        staleTime: 60_000,
    });

    const processedRequirements = useMemo(() => {
        let rows: BuyerRequirement[] = data?.requirements || [];

        // client-side sort fallback
        if (sort === 'deadline') {
            rows = [...rows].sort((a, b) => new Date(a.lastDate).getTime() - new Date(b.lastDate).getTime());
        } else if (sort === 'budget') {
            rows = [...rows].sort((a, b) => Number(b.budgetMax || 0) - Number(a.budgetMax || 0));
        }

        // client-side budget filter
        if (minBudget) {
            rows = rows.filter(r => Number(r.budgetMax || r.budgetMin || 0) >= Number(minBudget));
        }
        if (maxBudget) {
            rows = rows.filter(r => Number(r.budgetMin || r.budgetMax || 0) <= Number(maxBudget));
        }

        return rows;
    }, [data, sort, minBudget, maxBudget]);

    const total = data?.total || processedRequirements.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const activeFilters = [location, minBudget, maxBudget].filter(Boolean).length;

    // Reset page on filter/search change
    useEffect(() => {
        setPage(1);
    }, [tab, query, sort, location, minBudget, maxBudget, buyerOrganizationId]);

    const getRequirementHref = (req: BuyerRequirement) => {
        const method = String(req.canonicalMethod || req.procurementMethod || '').toUpperCase();
        const sourceId = req.sourceId || Math.abs(req.id);
        
        if (['RFQ', 'DIRECT_PURCHASE', 'CATALOG_PURCHASE', 'REPEAT_ORDER', 'RATE_CONTRACT'].includes(method)) {
            return `/seller/rfq?requirementId=${sourceId}`;
        } else if (['RFP', 'SINGLE_SOURCE', 'PAC'].includes(method)) {
            return `/seller/rfp?requirementId=${sourceId}`;
        } else if (['OPEN_TENDER', 'LIMITED_TENDER', 'TWO_STAGE_TENDER', 'EMERGENCY_PURCHASE'].includes(method)) {
            return `/seller/rfq?requirementId=${sourceId}`;
        } else if (method === 'REVERSE_AUCTION') {
            return `/seller/rfq?requirementId=${sourceId}`;
        }
        
        return `/seller/rfq?requirementId=${sourceId}`;
    };

    const handleViewDetails = (req: BuyerRequirement) => {
        router.push(getRequirementHref(req));
    };

    const isLegacyRequirement = (req: BuyerRequirement) => {
        return req.sourceModel === 'REQUIREMENT' || req.id < 0;
    };

    return (
        <>
            {selected && <BidDetailModal bid={selected} onClose={() => setSelected(null)} />}

            <div className="space-y-4">
                {/* ── Search + filter bar ── */}
                {showSearch && (
                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3 shadow-sm">
                        <div className="flex gap-3 flex-col sm:flex-row">
                            {/* Search */}
                            <form
                                onSubmit={e => { e.preventDefault(); }}
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
                                    <button type="button" onClick={() => setQuery('')} className="px-2 hover:bg-slate-100 rounded-md">
                                        <X className="h-3.5 w-3.5 text-slate-400" />
                                    </button>
                                )}
                            </form>

                            {/* Sort */}
                            <select
                                value={sort}
                                onChange={e => setSort(e.target.value)}
                                className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 sm:w-48 text-slate-700 cursor-pointer"
                            >
                                {SORT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                            </select>

                            {/* Advanced filter toggle */}
                            {showFilters && (
                                <button
                                    onClick={() => setShowAdvancedFilters(v => !v)}
                                    className={cn(
                                        "inline-flex items-center justify-center gap-2 h-10 px-4 rounded-lg border text-xs font-bold transition-all shadow-sm",
                                        showAdvancedFilters 
                                            ? 'bg-[#0b2447] text-white border-[#0b2447]' 
                                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                                    )}
                                >
                                    <SlidersHorizontal className="h-3.5 w-3.5" />
                                    Filters {activeFilters > 0 && <span className="w-4 h-4 rounded-full bg-orange-500 text-white text-[9px] flex items-center justify-center font-bold">{activeFilters}</span>}
                                </button>
                            )}
                        </div>

                        {/* Advanced filters panel */}
                        {showAdvancedFilters && showFilters && (
                            <div className="grid sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100">
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Location</label>
                                    <input value={location} onChange={e => setLocation(e.target.value)} placeholder="e.g. Jharsuguda" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 bg-white" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Min Budget (₹)</label>
                                    <input type="number" value={minBudget} onChange={e => setMinBudget(e.target.value)} placeholder="0" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 bg-white" />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1">Max Budget (₹)</label>
                                    <input type="number" value={maxBudget} onChange={e => setMaxBudget(e.target.value)} placeholder="Any" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 bg-white" />
                                </div>
                                {activeFilters > 0 && (
                                    <button onClick={() => { setLocation(''); setMinBudget(''); setMaxBudget(''); }} className="text-xs font-bold text-red-600 hover:underline self-end pb-2">
                                        Clear Filters
                                    </button>
                                )}
                            </div>
                        )}
                    </div>
                )}

                {/* ── Category tabs ── */}
                {showTabs && buyerOrganizationId === 'all' && (
                    <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                        {TABS.map(t => (
                            <button
                                key={t.id}
                                onClick={() => setTab(t.id)}
                                className={cn(
                                    "h-9 shrink-0 rounded-lg border px-4 text-xs font-black transition-all",
                                    tab === t.id 
                                        ? 'border-[#0b2447] bg-[#0b2447] text-white shadow-sm' 
                                        : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
                                )}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>
                )}

                {/* ── Results status header ── */}
                <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between text-xs text-slate-500 font-semibold">
                    <p>
                        {isLoading || isFetching ? 'Syncing with registry...' : `${total} requirement${total !== 1 ? 's' : ''} found`}
                    </p>
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" aria-label="Display mode">
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            className={cn(
                                "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-black transition-all",
                                viewMode === 'grid' ? 'bg-[#0b2447] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                            )}
                            title="Grid view"
                        >
                            <Grid2X2 className="h-3.5 w-3.5" /> Grid
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            className={cn(
                                "inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-black transition-all",
                                viewMode === 'list' ? 'bg-[#0b2447] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                            )}
                            title="List view"
                        >
                            <List className="h-3.5 w-3.5" /> List
                        </button>
                    </div>
                </div>

                {/* ── Main content (Loading / Empty / Cards / Table) ── */}
                {isLoading ? (
                    viewMode === 'list' ? (
                        <TableSkeleton />
                    ) : (
                        <GridSkeleton />
                    )
                ) : processedRequirements.length === 0 ? (
                    <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
                        <Package className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm font-bold text-slate-800">No buyer requirements found.</p>
                        <p className="mt-1 text-xs text-slate-500">Try adjusting your active query or category filters.</p>
                        {activeFilters > 0 && (
                            <button onClick={() => { setQuery(''); setLocation(''); setMinBudget(''); setMaxBudget(''); setTab('all'); }} className="mt-3 text-xs font-black text-[#0b2447] hover:underline">
                                Reset all filters
                            </button>
                        )}
                    </div>
                ) : viewMode === 'list' ? (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                        <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-black uppercase tracking-wider text-slate-500">
                                    <th className="px-5 py-4">Buyer / Organization</th>
                                    <th className="px-5 py-4">Requirement Details</th>
                                    <th className="px-5 py-4">Type</th>
                                    <th className="px-5 py-4">Quantity</th>
                                    <th className="px-5 py-4">Budget Value</th>
                                    <th className="px-5 py-4">Location</th>
                                    <th className="px-5 py-4">Timeline</th>
                                    <th className="px-5 py-4">Status</th>
                                    <th className="px-5 py-4 text-right">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {processedRequirements.map(req => {
                                    const buyer = req.buyerOrganization;
                                    const badge = statusBadge(req);
                                    const isLegacy = isLegacyRequirement(req);
                                    const detailHref = isLegacy ? '' : `/marketplace/requirements/${req.id}`;
                                    const daysRemaining = Math.max(0, Math.ceil((new Date(req.lastDate).getTime() - Date.now()) / 86400000));

                                    return (
                                        <tr key={`${req.sourceModel || 'buyer'}-${req.id}`} className="hover:bg-slate-50/40 transition-colors">
                                            <td className="px-5 py-4">
                                                <div className="flex items-center gap-3">
                                                    <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-xs font-black text-[#0b2447] border border-slate-200/80 shadow-sm">
                                                        {buyer?.logoUrl ? (
                                                            <img src={buyer.logoUrl} alt={`${buyer.organizationName} logo`} className="h-full w-full object-contain p-1" />
                                                        ) : (
                                                            initials(buyer?.organizationName || 'Verified Buyer')
                                                        )}
                                                    </span>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5">
                                                            <span className="truncate font-black text-slate-900 text-xs">{buyer?.organizationName || 'Verified Buyer'}</span>
                                                            {buyer?.verificationStatus === 'VERIFIED' && (
                                                                <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                                            )}
                                                        </div>
                                                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                                            {buyerTypeLabel(buyer?.organizationType)}
                                                        </span>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <div className="max-w-[280px]">
                                                    <p className="truncate text-xs font-black text-slate-900" title={req.title}>
                                                        {req.title}
                                                    </p>
                                                    <p className="mt-0.5 truncate text-[10px] font-bold text-slate-500">
                                                        {req.requirementNumber || 'Ref N/A'} - {req.category?.name || 'General Category'}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={cn(
                                                    "inline-flex items-center rounded px-1.5 py-0.5 text-[9px] font-black uppercase border",
                                                    req.requirementType === 'PRODUCT' 
                                                        ? 'bg-blue-50 text-blue-700 border-blue-100' 
                                                        : 'bg-purple-50 text-purple-700 border-purple-100'
                                                )}>
                                                    {req.requirementType}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-slate-900 font-bold text-xs">
                                                {req.quantity || 'Estimated'} {req.unit || ''}
                                            </td>
                                            <td className="px-5 py-4 text-[#0b2447] font-black text-xs">
                                                {formatBudgetRange(req.budgetMin, req.budgetMax)}
                                            </td>
                                            <td className="px-5 py-4 text-slate-600 font-semibold text-xs">
                                                <div className="flex items-center gap-1">
                                                    <MapPin className="h-3.5 w-3.5 text-[#8a6a2f] shrink-0" />
                                                    <span className="truncate max-w-[150px]">
                                                        {req.location || buyer?.district || 'Jharsuguda'}
                                                    </span>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4 text-slate-800 text-xs">
                                                <div className="space-y-0.5">
                                                    <p className="font-bold">{new Date(req.lastDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' })}</p>
                                                    <p className={cn(
                                                        "text-[9px] font-extrabold uppercase",
                                                        daysRemaining <= 3 ? 'text-red-600' : daysRemaining <= 7 ? 'text-amber-600' : 'text-slate-400'
                                                    )}>
                                                        {daysRemaining <= 0 ? 'Closed' : `${daysRemaining}d remaining`}
                                                    </p>
                                                </div>
                                            </td>
                                            <td className="px-5 py-4">
                                                <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase", badge.cls)}>
                                                    {badge.label}
                                                </span>
                                            </td>
                                            <td className="px-5 py-4 text-right">
                                                <div className="flex items-center justify-end gap-2">
                                                    <button 
                                                        onClick={() => handleViewDetails(req)} 
                                                        className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-center text-xs font-black text-slate-700 hover:bg-slate-100 transition shadow-sm"
                                                    >
                                                        View Details
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                ) : (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {processedRequirements.map(req => {
                            const buyer = req.buyerOrganization;
                            const badge = statusBadge(req);
                            const isLegacy = isLegacyRequirement(req);
                            const daysRemaining = Math.max(0, Math.ceil((new Date(req.lastDate).getTime() - Date.now()) / 86400000));
                            const publishedDate = formatDateIN(req.approvedAt || req.createdAt || req.updatedAt);

                            return (
                                <article
                                    key={`${req.sourceModel || 'buyer'}-${req.id}`}
                                    className="group flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#0b2447]/30 hover:shadow-lg h-full"
                                >
                                    <div className={cn("h-1 w-full", req.requirementType === 'SERVICE' ? 'bg-teal-500' : 'bg-[#0b2447]')} />
                                    <div className="flex flex-1 flex-col gap-3 p-4">
                                        <div className="flex items-start justify-between gap-2">
                                            <div className="flex min-w-0 items-start gap-2">
                                                <div className={cn(
                                                    "mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                                                    req.requirementType === 'SERVICE' ? 'bg-teal-50 text-teal-700' : 'bg-blue-50 text-blue-700'
                                                )}>
                                                    {req.requirementType === 'SERVICE' ? <Wrench className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                                                </div>
                                                <h3 className="line-clamp-2 text-xs font-black leading-snug text-slate-800 transition group-hover:text-[#0b2447]">
                                                    {req.title}
                                                </h3>
                                            </div>
                                            <span className={cn("inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase whitespace-nowrap", badge.cls)}>
                                                {badge.icon}
                                                {badge.label}
                                            </span>
                                        </div>

                                        {buyer && (
                                            <div className="flex items-center gap-1.5">
                                                <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100">
                                                    <Landmark className="h-3 w-3 text-slate-500" />
                                                </div>
                                                <p className="truncate text-[10px] font-bold text-slate-600">{buyer.organizationName}</p>
                                                {buyer.verificationStatus === 'VERIFIED' && <BadgeCheck className="h-3 w-3 shrink-0 text-emerald-600" />}
                                            </div>
                                        )}

                                        <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-500">{req.description}</p>

                                        <div className="flex flex-wrap gap-x-2 gap-y-1">
                                            {req.requirementNumber && <span className="rounded border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[9px] font-black text-[#0b2447]">{req.requirementNumber}</span>}
                                            {req.category && <span className="rounded border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[9px] font-semibold text-slate-500">{req.category.name}</span>}
                                            {req.location && <span className="inline-flex items-center gap-0.5 text-[9px] text-slate-400 font-semibold"><MapPin className="h-3 w-3 text-[#8a6a2f]" />{req.location}</span>}
                                        </div>

                                        <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-100 bg-slate-50/70 p-2 text-[10px] font-semibold text-slate-700">
                                            <span>
                                                <span className="block text-[9px] font-black uppercase text-slate-400">Published</span>
                                                <span className="font-bold">{publishedDate}</span>
                                            </span>
                                            <span>
                                                <span className="block text-[9px] font-black uppercase text-slate-400">Days Left</span>
                                                <span className="font-bold text-[#0b2447]">{getDeadlineLabel(req.lastDate)}</span>
                                            </span>
                                            <span>
                                                <span className="block text-[9px] font-black uppercase text-slate-400">Qty / Unit</span>
                                                <span className="font-bold">{req.quantity || 'Estimated'} {req.unit || ''}</span>
                                            </span>
                                            <span>
                                                <span className="block text-[9px] font-black uppercase text-slate-400">Budget</span>
                                                <span className="font-bold text-[#0b2447]">{formatBudgetRange(req.budgetMin, req.budgetMax)}</span>
                                            </span>
                                        </div>

                                        <div className="mt-auto flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                                            <span className={cn(
                                                "flex items-center gap-1 text-[10px] font-bold",
                                                daysRemaining <= 3 ? 'text-red-600' : daysRemaining <= 7 ? 'text-amber-600' : 'text-slate-400'
                                            )}>
                                                <Clock className="h-3 w-3" />
                                                {daysRemaining <= 0 ? 'Closed' : `${daysRemaining}d remaining`}
                                            </span>
                                            <div className="flex items-center gap-2">
                                                 <button onClick={() => handleViewDetails(req)} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-[#0b2447] px-3 text-[11px] font-black text-white hover:bg-[#12335f] transition active:scale-95 shadow-sm">
                                                     <Eye className="h-3.5 w-3.5" />
                                                     View Details
                                                 </button>
                                             </div>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}

                {/* ── Pagination ── */}
                {showPagination && totalPages > 1 && (
                    <div className="flex items-center justify-center gap-2 mt-6">
                        <button 
                            disabled={page <= 1} 
                            onClick={() => setPage(p => p - 1)} 
                            className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-black bg-white shadow-sm disabled:opacity-40 hover:bg-slate-50 transition"
                        >
                            ← Prev
                        </button>
                        <span className="text-xs text-slate-500 font-bold">Page {page} of {totalPages}</span>
                        <button 
                            disabled={page >= totalPages} 
                            onClick={() => setPage(p => p + 1)} 
                            className="h-9 px-4 rounded-lg border border-slate-200 text-xs font-black bg-white shadow-sm disabled:opacity-40 hover:bg-slate-50 transition"
                        >
                            Next →
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}

// Loading Skeleton components
function TableSkeleton() {
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm animate-pulse">
            <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-black uppercase tracking-wider text-slate-400">
                        <th className="px-5 py-4">Buyer / Org</th>
                        <th className="px-5 py-4">Requirement</th>
                        <th className="px-5 py-4">Type</th>
                        <th className="px-5 py-4">Quantity</th>
                        <th className="px-5 py-4">Budget</th>
                        <th className="px-5 py-4">Location</th>
                        <th className="px-5 py-4">Timeline</th>
                        <th className="px-5 py-4">Status</th>
                        <th className="px-5 py-4 text-right">Actions</th>
                    </tr>
                </thead>
                <tbody>
                    {Array.from({ length: 4 }).map((_, index) => (
                        <tr key={index} className="border-b border-slate-100">
                            <td className="px-5 py-4"><div className="h-4 w-32 rounded bg-slate-100" /></td>
                            <td className="px-5 py-4"><div className="h-4 w-48 rounded bg-slate-100" /></td>
                            <td className="px-5 py-4"><div className="h-4 w-16 rounded bg-slate-100" /></td>
                            <td className="px-5 py-4"><div className="h-4 w-16 rounded bg-slate-100" /></td>
                            <td className="px-5 py-4"><div className="h-4 w-24 rounded bg-slate-100" /></td>
                            <td className="px-5 py-4"><div className="h-4 w-24 rounded bg-slate-100" /></td>
                            <td className="px-5 py-4"><div className="h-4 w-20 rounded bg-slate-100" /></td>
                            <td className="px-5 py-4"><div className="h-4 w-16 rounded bg-slate-100" /></td>
                            <td className="px-5 py-4"><div className="ml-auto h-8 w-24 rounded bg-slate-100" /></td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

function GridSkeleton() {
    return (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="h-64 rounded-xl border border-slate-200 bg-white p-4 shadow-sm animate-pulse space-y-4">
                    <div className="flex gap-2">
                        <div className="h-8 w-8 rounded bg-slate-100" />
                        <div className="flex-1 space-y-2">
                            <div className="h-3 w-3/4 rounded bg-slate-100" />
                            <div className="h-3 w-1/2 rounded bg-slate-100" />
                        </div>
                    </div>
                    <div className="h-3 w-full rounded bg-slate-100" />
                    <div className="h-3 w-2/3 rounded bg-slate-100" />
                    <div className="h-10 rounded bg-slate-100 mt-auto" />
                </div>
            ))}
        </div>
    );
}
