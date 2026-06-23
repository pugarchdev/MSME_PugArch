'use client';

import React, { useState, useMemo, useRef, useEffect } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowRight, CheckCircle, ChevronRight, Clock, Eye,
    Flame, Grid2X2, Landmark, List, MapPin, Package,
    ShieldAlert
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useResponsiveViewMode } from '../../shared/hooks';
import type { MarketplaceBid, MarketplaceTender } from '../api';
import { 
    formatSingleBudget, 
    formatDateIN, 
    getProcurementStatus, 
    getStatusBadgeClass,
    type ProcurementStatusCode
} from '../utils/procurementDisplay';
import { cn } from '../../../lib/utils';

interface OpportunityData {
    id: number;
    displayId: string;
    title: string;
    description: string;
    category: string;
    budget: number | string | null;
    buyerName: string;
    location: string;
    startDate?: string | null;
    endDate?: string | null;
    participantsCount?: number;
    isTender: boolean;
    link: string;
    daysRemaining: number;
    deadlineLabel: string;
    statusCode: ProcurementStatusCode;
    statusLabel: string;
}

function mapTender(t: MarketplaceTender): OpportunityData {
    const status = getProcurementStatus({ status: t.status, dueDate: t.closesAt });
    const days = Math.max(0, Math.ceil((new Date(t.closesAt || '').getTime() - Date.now()) / 86400000));
    return {
        id: t.id,
        displayId: t.tenderId,
        title: t.title,
        description: t.description || 'No description provided.',
        category: t.category,
        budget: t.budget ?? null,
        buyerName: t.buyer?.buyerProfile?.organizationName || t.buyer?.name || 'Government Buyer',
        location: [t.buyer?.buyerProfile?.district, t.buyer?.buyerProfile?.state].filter(Boolean).join(', ') || 'Odisha, IN',
        startDate: t.publishedAt || t.createdAt,
        endDate: t.closesAt,
        isTender: true,
        link: `/tenders?tender=${t.id}`,
        daysRemaining: days,
        deadlineLabel: status.deadlineLabel,
        statusCode: status.code,
        statusLabel: status.label,
        participantsCount: t.bidsCount || 0
    };
}

function mapBid(b: MarketplaceBid): OpportunityData {
    const status = getProcurementStatus({ status: b.status || b.lifecycleStage || b.approvalStatus, dueDate: b.endDate });
    const days = Math.max(0, Math.ceil((new Date(b.endDate || '').getTime() - Date.now()) / 86400000));
    const isTenderActivity = b.sourceModel === 'TENDER';
    return {
        id: b.id,
        displayId: b.bidNumber,
        title: b.title,
        description: b.description || 'No description provided.',
        category: b.category,
        budget: b.estimatedValue ?? null,
        buyerName: b.buyerOrganizationName || 'Verified Buyer',
        location: [b.district, b.state].filter(Boolean).join(', ') || b.deliveryLocation || 'Jharsuguda, Odisha',
        startDate: b.startDate || b.createdAt,
        endDate: b.endDate,
        isTender: false,
        link: isTenderActivity && b.sourceId ? `/tenders?tender=${b.sourceId}` : `/bids/${b.bidNumber}`,
        daysRemaining: days,
        deadlineLabel: status.deadlineLabel,
        statusCode: status.code,
        statusLabel: isTenderActivity ? 'Tender Bids' : status.label,
        participantsCount: b.participantsCount || 0
    };
}

function useFadeIn() {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setVisible(true);
                observer.disconnect();
            }
        }, { threshold: 0.08 });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return { ref, visible };
}

function OpportunitySkeleton() {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4 animate-pulse space-y-4">
            <div className="flex items-start justify-between gap-3">
                <div className="h-4 w-28 rounded bg-slate-100" />
                <div className="h-4 w-16 rounded bg-slate-100" />
            </div>
            <div className="space-y-2">
                <div className="h-4 w-5/6 rounded bg-slate-100" />
                <div className="h-3 w-2/3 rounded bg-slate-100" />
            </div>
            <div className="space-y-2 pt-2 border-t border-slate-50">
                <div className="h-3 w-1/2 rounded bg-slate-100" />
                <div className="h-3 w-1/3 rounded bg-slate-100" />
            </div>
            <div className="flex justify-between items-center pt-2">
                <div className="h-4 w-20 rounded bg-slate-100" />
                <div className="h-8 w-24 rounded bg-slate-100" />
            </div>
        </div>
    );
}

function OpportunityCard({ item, index, visible }: { item: OpportunityData; index: number; visible: boolean }) {
    const isService = item.category.toLowerCase().includes('service');
    const badgeColor = getStatusBadgeClass(item.statusCode);
    const deadlineAlert = item.statusCode === 'CLOSING_TODAY' || item.statusCode === 'CLOSING_SOON';

    return (
        <article
            className="group flex flex-col justify-between overflow-hidden rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#0b2447]/30 hover:shadow-lg h-full"
            style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.5s ease ${80 + index * 70}ms, transform 0.5s ease ${80 + index * 70}ms`
            }}
        >
            <div className="space-y-3.5">
                <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                        <span className="text-[9px] font-black uppercase tracking-widest text-[#c86413] bg-orange-50 px-1.5 py-0.5 rounded border border-orange-100">
                            {item.displayId}
                        </span>
                        <h4 className="mt-1.5 line-clamp-2 text-xs font-black text-slate-800 leading-snug group-hover:text-[#0b2447] transition-colors">
                            {item.title}
                        </h4>
                    </div>
                    <span className={cn("shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase whitespace-nowrap", badgeColor)}>
                        {item.statusLabel}
                    </span>
                </div>

                <p className="line-clamp-2 text-[11px] leading-relaxed text-slate-500 font-medium">
                    {item.description}
                </p>

                <div className="space-y-1.5 pt-2 border-t border-slate-50 text-[11px] font-semibold text-slate-600">
                    <p className="flex items-center gap-1.5 truncate">
                        <Landmark className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{item.buyerName}</span>
                    </p>
                    <p className="flex items-center gap-1.5 truncate">
                        <Package className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{item.category}</span>
                    </p>
                    {item.location && (
                        <p className="flex items-center gap-1.5 truncate">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{item.location}</span>
                        </p>
                    )}
                </div>
            </div>

            <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-3">
                <div className="flex justify-between items-end">
                    <div>
                        <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400">Est. Value</span>
                        <span className="text-xs font-black text-[#0b2447]">{formatSingleBudget(item.budget)}</span>
                    </div>
                    <div className="text-right">
                        <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400">Responses</span>
                        <span className="text-xs font-bold text-slate-700">{item.participantsCount} bid{item.participantsCount === 1 ? '' : 's'}</span>
                    </div>
                </div>

                <div className="flex items-center justify-between gap-2">
                    <span className={cn(
                        "inline-flex items-center gap-1 text-[10px] font-bold",
                        deadlineAlert ? 'text-red-600' : 'text-slate-400'
                    )}>
                        <Clock className="h-3.5 w-3.5" />
                        {item.deadlineLabel}
                    </span>
                    <Link 
                        href={item.link} 
                        className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#0b2447] px-3 text-[10px] font-bold text-white hover:bg-[#12335f] transition active:scale-95 shadow-sm"
                    >
                        {item.isTender ? 'View Tender' : 'View Bid'} 
                        <ArrowRight className="h-3 w-3" />
                    </Link>
                </div>
            </div>
        </article>
    );
}

function OpportunityListRow({ item, srNo }: { item: OpportunityData; srNo: number }) {
    const badgeColor = getStatusBadgeClass(item.statusCode);
    return (
        <tr className="hover:bg-slate-50/40 transition-colors">
            <td className="px-5 py-4 font-black text-slate-400 text-xs">{srNo}</td>
            <td className="px-5 py-4">
                <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 whitespace-nowrap">
                    {item.displayId}
                </span>
            </td>
            <td className="px-5 py-4">
                <div className="max-w-[280px]">
                    <p className="truncate font-black text-slate-900 text-xs" title={item.title}>
                        {item.title}
                    </p>
                    <p className="mt-0.5 truncate text-[10px] text-slate-500 leading-relaxed">
                        {item.description}
                    </p>
                </div>
            </td>
            <td className="px-5 py-4 truncate text-slate-800 text-xs font-bold max-w-[150px]">{item.buyerName}</td>
            <td className="px-5 py-4 truncate text-slate-600 text-xs">{item.category}</td>
            <td className="px-5 py-4 text-[#0b2447] font-black text-xs whitespace-nowrap">
                {formatSingleBudget(item.budget)}
            </td>
            <td className="px-5 py-4 text-slate-800 text-xs whitespace-nowrap">
                <div className="space-y-0.5">
                    <p className="font-bold">{item.endDate ? new Date(item.endDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : 'N/A'}</p>
                    <p className="text-[9px] font-extrabold uppercase text-[#0b2447]">{item.deadlineLabel}</p>
                </div>
            </td>
            <td className="px-5 py-4">
                <span className={cn("inline-flex rounded-full border px-2 py-0.5 text-[9px] font-black uppercase whitespace-nowrap", badgeColor)}>
                    {item.statusLabel}
                </span>
            </td>
            <td className="px-5 py-4 text-right">
                <Link 
                    href={item.link} 
                    className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#0b2447] px-3 text-[10px] font-bold text-white hover:bg-[#12335f] transition shadow-sm"
                >
                    {item.isTender ? 'View Tender' : 'View Bid'} 
                    <ArrowRight className="h-3 w-3" />
                </Link>
            </td>
        </tr>
    );
}

interface Props {
    requirements?: any; // Ignored/legacy
    tenders?: MarketplaceTender[];
    bids?: MarketplaceBid[];
    loading?: boolean;
}

export function LatestBids({ tenders = [], bids = [], loading = false }: Props) {
    const { ref, visible } = useFadeIn();
    const [viewMode, setViewMode] = useResponsiveViewMode('phase7:marketplace-opportunities:view-mode');

    const activeOpportunities = useMemo(() => {
        const mappedTenders = tenders.map(mapTender);
        const mappedBids = bids.map(mapBid);
        const combined = [...mappedTenders, ...mappedBids];
        return combined.sort((a, b) => {
            const dateA = new Date(a.startDate || a.endDate || 0).getTime();
            const dateB = new Date(b.startDate || b.endDate || 0).getTime();
            return dateB - dateA;
        });
    }, [tenders, bids]);

    const viewAllHref = '/bids';
    const emptyMessage = 'No active procurement opportunities found matching current records.';

    return (
        <section ref={ref} className="mt-0 border-b border-slate-100 bg-[#f8fafc]" aria-labelledby="opportunities-heading">
            <div className="mx-auto max-w-[1680px] px-4 pt-5 pb-5 sm:px-6 sm:pt-6 sm:pb-6 2xl:px-8">
                {/* Header */}
                <div
                    className="mb-8 flex flex-col justify-between gap-4 md:flex-row md:items-end"
                    style={{ 
                        opacity: visible ? 1 : 0, 
                        transform: visible ? 'none' : 'translateY(-10px)', 
                        transition: 'opacity 0.5s, transform 0.5s' 
                    }}
                >
                    <div>
                        <span className="mb-2 inline-flex items-center gap-1 rounded-full border border-blue-100 bg-blue-50 px-3 py-1 text-[9px] font-black uppercase tracking-wider text-blue-800">
                            🏛️ Procurement Hub
                        </span>
                        <h2 id="opportunities-heading" className="text-xl font-black text-[#0b2447] sm:text-2xl tracking-tight">
                            Active Procurement Opportunities
                        </h2>
                        <p className="mt-1 text-sm text-slate-500 font-medium">
                            Bid on active opportunities, view government e-tenders, or submit quotes for portal-native contracts.
                        </p>
                    </div>

                    <div className="flex flex-wrap items-center gap-2">
                        {/* Layout grid/list switcher */}
                        <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm">
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={cn(
                                    "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-black transition-all",
                                    viewMode === 'grid' ? 'bg-[#0b2447] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                                )}
                                title="Grid view"
                            >
                                <Grid2X2 className="h-3.5 w-3.5" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('list')}
                                className={cn(
                                    "inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-xs font-black transition-all",
                                    viewMode === 'list' ? 'bg-[#0b2447] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'
                                )}
                                title="List view"
                            >
                                <List className="h-3.5 w-3.5" />
                            </button>
                        </div>

                        {/* View All Button */}
                        <Link 
                            href={viewAllHref} 
                            className="inline-flex h-11 items-center gap-1 rounded-xl border border-slate-200 bg-white px-4 text-xs font-black text-[#0b2447] shadow-sm hover:bg-slate-50 active:scale-98 transition"
                        >
                            View All <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                    </div>
                </div>

                {/* Sourcing list rendering */}
                {loading ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {Array.from({ length: 4 }).map((_, index) => <OpportunitySkeleton key={index} />)}
                    </div>
                ) : activeOpportunities.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white px-4 py-12 text-center shadow-sm">
                        <ShieldAlert className="h-10 w-10 text-slate-300 mx-auto mb-3" />
                        <p className="text-sm font-bold text-slate-800">{emptyMessage}</p>
                        <p className="mt-1 text-xs text-slate-500">Fresh records will appear here immediately after publication.</p>
                    </div>
                ) : viewMode === 'grid' ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                        {activeOpportunities.slice(0, 8).map((item, index) => (
                            <OpportunityCard 
                                key={`${item.isTender ? 'tender' : 'bid'}-${item.id}`} 
                                item={item} 
                                index={index} 
                                visible={visible} 
                            />
                        ))}
                    </div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                        <table className="w-full min-w-[1100px] border-collapse text-left text-sm">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-black uppercase tracking-wider text-slate-500">
                                    <th className="px-5 py-4 w-12">#</th>
                                    <th className="px-5 py-4 w-28">Ref ID</th>
                                    <th className="px-5 py-4">Title / Description</th>
                                    <th className="px-5 py-4">Buyer Organization</th>
                                    <th className="px-5 py-4">Category</th>
                                    <th className="px-5 py-4">Est. Budget</th>
                                    <th className="px-5 py-4">Closes / Timeline</th>
                                    <th className="px-5 py-4">Status</th>
                                    <th className="px-5 py-4 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                {activeOpportunities.slice(0, 8).map((item, index) => (
                                    <OpportunityListRow 
                                        key={`${item.isTender ? 'tender' : 'bid'}-${item.id}`} 
                                        item={item} 
                                        srNo={index + 1} 
                                    />
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </section>
    );
}
