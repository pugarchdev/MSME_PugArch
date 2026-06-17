'use client';
import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Building2, ChevronLeft, ChevronRight, MapPin, List, Grid2X2 } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { marketplaceApi, type BuyerRequirement, type MarketplaceOrganization } from '../api';
import { RequirementCard } from './BuyerRequirementsSection';
import { formatBudgetRange, formatDateIN, getProcurementStatus, getStatusBadgeClass } from '../utils/procurementDisplay';

function buyerTypeLabel(type?: string) {
    if (type === 'GOVERNMENT' || type === 'PSU') return 'Government Buyer';
    if (type === 'MSME') return 'MSME Buyer';
    if (type === 'EDUCATIONAL_INSTITUTION') return 'Institution';
    if (type === 'PUBLIC_LIMITED' || type === 'PRIVATE_LIMITED') return 'Large Scale Industry';
    return 'Private Buyer';
}

interface BuyerSummary {
    id: number;
    name: string;
    type?: string;
    location?: string;
    logoUrl?: string | null;
    verified: boolean;
    requirementCount: number;
}

interface Props {
    buyers?: MarketplaceOrganization[];
    requirements?: BuyerRequirement[];
}

function organizationLogo(org?: Partial<MarketplaceOrganization> | null) {
    const profile = org?.profile || {};
    return org?.logoUrl || org?.logoFile?.url || profile.logoUrl || profile.logo || profile.organizationLogoUrl || profile.organizationLogo || null;
}

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('') || 'B';
}

export function BuyerRequirementBrowser({ buyers = [], requirements = [] }: Props) {
    const buyerSummaries = useMemo<BuyerSummary[]>(() => {
        const requirementCounts = new Map<number, number>();
        requirements.forEach(requirement => {
            const buyerId = requirement.buyerOrganization?.id;
            if (buyerId) requirementCounts.set(buyerId, (requirementCounts.get(buyerId) || 0) + 1);
        });

        const map = new Map<number, BuyerSummary>();

        buyers.forEach(buyer => {
            const matchingRequirements = requirementCounts.get(buyer.id) || 0;
            map.set(buyer.id, {
                id: buyer.id,
                name: buyer.organizationName,
                type: buyer.organizationType,
                location: [buyer.district, buyer.state].filter(Boolean).join(', ') || buyer.city,
                logoUrl: organizationLogo(buyer),
                verified: buyer.verificationStatus === 'VERIFIED',
                requirementCount: Math.max(buyer._count?.buyerRequirements || 0, matchingRequirements)
            });
        });

        requirements.forEach(requirement => {
            const buyer = requirement.buyerOrganization;
            if (!buyer?.id || map.has(buyer.id)) return;
            const location = [buyer.district, buyer.state].filter(Boolean).join(', ') || buyer.city;
            map.set(buyer.id, {
                id: buyer.id,
                name: buyer.organizationName || 'Verified Buyer',
                type: buyer.organizationType,
                location,
                logoUrl: organizationLogo(buyer as any),
                verified: buyer.verificationStatus === 'VERIFIED',
                requirementCount: requirementCounts.get(buyer.id) || 0
            });
        });

        return Array.from(map.values()).sort((a, b) => b.requirementCount - a.requirementCount || a.name.localeCompare(b.name));
    }, [buyers, requirements]);

    const [selectedBuyerId, setSelectedBuyerId] = useState<number | 'all'>('all');
    const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');
    const scrollRef = React.useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        scrollRef.current?.scrollBy({ left: direction === 'left' ? -320 : 320, behavior: 'smooth' });
    };

    const getInitialsBg = (id: number) => {
        const gradients = [
            'from-blue-50 to-indigo-100 text-[#0b2447] border-indigo-200/60 shadow-inner',
            'from-emerald-50 to-teal-100 text-emerald-800 border-emerald-200/60 shadow-inner',
            'from-purple-50 to-violet-100 text-purple-800 border-purple-200/60 shadow-inner',
            'from-amber-50 to-orange-100 text-amber-800 border-amber-200/60 shadow-inner',
            'from-rose-50 to-pink-100 text-rose-800 border-rose-200/60 shadow-inner',
        ];
        return gradients[Math.abs(id) % gradients.length];
    };

    useEffect(() => {
        if (typeof window !== 'undefined' && window.innerWidth < 1024) {
            setViewMode('grid');
        }
    }, []);

    const selectedBuyer = selectedBuyerId === 'all' ? null : buyerSummaries.find(buyer => buyer.id === selectedBuyerId) || null;
    const selectedBuyerRequirementQuery = useQuery({
        queryKey: ['marketplaceRequirementsByBuyer', selectedBuyerId],
        queryFn: () => marketplaceApi.getRequirements({ buyerOrganizationId: selectedBuyerId as number, pageSize: 12 }),
        enabled: selectedBuyerId !== 'all',
        staleTime: 60_000
    });
    const selectedRequirements = useMemo(() => {
        if (selectedBuyerId === 'all') return requirements;
        const fetched = selectedBuyerRequirementQuery.data?.requirements as BuyerRequirement[] | undefined;
        return fetched?.length ? fetched : requirements.filter(requirement => requirement.buyerOrganization?.id === selectedBuyerId);
    }, [requirements, selectedBuyerId, selectedBuyerRequirementQuery.data]);


    return (
        <section className="mt-2 border-b border-slate-100 bg-white" aria-labelledby="buyer-browser-heading">
            <div className="mx-auto max-w-[1680px] px-4 py-8 sm:px-6 sm:py-10 2xl:px-8">
                <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a6a2f]">Verified Buyer Strip</p>
                        <h2 id="buyer-browser-heading" className="mt-1 text-xl font-black text-[#0b2447] sm:text-2xl">Verified buyers & published requirements</h2>
                        <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">Scroll verified buyer logos and click any buyer to list only requirements published by that buyer below.</p>
                    </div>
                    <Link href="/marketplace/requirements" className="inline-flex h-9 items-center gap-1.5 self-start rounded-lg border border-[#0b2447] px-4 text-xs font-bold text-[#0b2447] transition hover:bg-[#0b2447] hover:text-white sm:self-end">
                        View All Requirements <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                </div>

                <div className="relative group/strip">
                    {/* Left Scroll Button */}
                    <button
                        type="button"
                        onClick={() => scroll('left')}
                        className="absolute -left-2 lg:-left-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/70 bg-white/90 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-[#0b2447] hover:text-white hover:border-[#0b2447] hover:shadow-lg active:scale-95 lg:flex text-slate-600"
                        aria-label="Scroll buyers left"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>

                    <div
                        ref={scrollRef}
                        className="flex gap-4 overflow-x-auto pb-4 pt-1 no-scrollbar lg:px-4"
                        role="list"
                        aria-label="Buyers with requirements"
                    >
                        <button
                            type="button"
                            onClick={() => setSelectedBuyerId('all')}
                            className={cn(
                                "group flex h-[82px] min-w-[210px] shrink-0 items-center gap-3.5 rounded-2xl border px-3.5 text-left transition-all duration-300 ease-out",
                                selectedBuyerId === 'all'
                                    ? "border-[#0b2447] bg-gradient-to-r from-[#0b2447] to-[#12335f] text-white shadow-lg shadow-[#0b2447]/15 ring-2 ring-[#0b2447]/15"
                                    : "border-slate-200/60 bg-white/85 backdrop-blur-md shadow-sm hover:-translate-y-0.5 hover:scale-[1.02] hover:border-[#0b2447]/30 hover:bg-white hover:shadow-md text-slate-800"
                            )}
                        >
                            <span className={cn(
                                "flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 group-hover:scale-105",
                                selectedBuyerId === 'all' ? "bg-white/15 border-white/20 text-white" : "bg-gradient-to-br from-slate-50 to-slate-100 text-slate-600 border-slate-200"
                            )}>
                                <Building2 className="h-5 w-5" />
                            </span>
                            <span className="min-w-0 flex-1">
                                <span className="block text-xs font-black tracking-tight">All Buyers</span>
                                <span className={cn("mt-1.5 inline-block rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider", selectedBuyerId === 'all' ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500")}>
                                    {requirements.length} requirement{requirements.length === 1 ? '' : 's'}
                                </span>
                            </span>
                        </button>

                        {buyerSummaries.length === 0 ? (
                            <div className="min-w-[260px] shrink-0 rounded-2xl border border-dashed border-slate-300 bg-slate-50/50 p-4 text-xs font-bold text-slate-500 flex items-center justify-center">
                                No verified buyers available right now.
                            </div>
                        ) : buyerSummaries.map(buyer => {
                            const isActive = selectedBuyerId === buyer.id;
                            const initialsText = initials(buyer.name);
                            const initialsBgClass = getInitialsBg(buyer.id);

                            return (
                                <button
                                    key={buyer.id}
                                    type="button"
                                    onClick={() => setSelectedBuyerId(buyer.id)}
                                    className={cn(
                                        "group flex h-[82px] min-w-[240px] max-w-[320px] shrink-0 items-center gap-3.5 rounded-2xl border px-3.5 text-left transition-all duration-300 ease-out",
                                        isActive
                                            ? "border-[#0b2447] bg-gradient-to-r from-[#0b2447] to-[#12335f] text-white shadow-lg shadow-[#0b2447]/15 ring-2 ring-[#0b2447]/15"
                                            : "border-slate-200/60 bg-white/85 backdrop-blur-md shadow-sm hover:-translate-y-0.5 hover:scale-[1.02] hover:border-[#0b2447]/30 hover:bg-white hover:shadow-md text-slate-800"
                                    )}
                                    role="listitem"
                                >
                                    <span className={cn(
                                        "flex h-13 w-13 shrink-0 items-center justify-center overflow-hidden rounded-xl border transition-all duration-300 group-hover:scale-105 shadow-inner",
                                        isActive ? "bg-white border-white/20 text-[#0b2447]" : `bg-gradient-to-br ${initialsBgClass}`
                                    )}>
                                        {buyer.logoUrl ? (
                                            <img src={buyer.logoUrl} alt={`${buyer.name} logo`} className="h-full w-full object-contain p-1.5" loading="lazy" />
                                        ) : (
                                            <span className="text-xs font-black tracking-wider">{initialsText}</span>
                                        )}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="flex items-center gap-1.5">
                                            <span className="truncate text-xs font-black leading-tight">{buyer.name}</span>
                                            {buyer.verified && (
                                                <BadgeCheck className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-blue-200" : "text-emerald-600")} />
                                            )}
                                        </span>
                                        {buyer.location && (
                                            <span className="mt-0.5 flex items-center gap-1 text-[10px] font-bold opacity-80 truncate">
                                                <MapPin className="h-3 w-3 shrink-0 text-[#8a6a2f]" /> {buyer.location}
                                            </span>
                                        )}
                                        <span className={cn(
                                            "mt-1.5 inline-block rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider",
                                            isActive ? "bg-white/20 text-white" : "bg-slate-100 text-slate-500"
                                        )}>
                                            {buyer.requirementCount} requirement{buyer.requirementCount === 1 ? '' : 's'}
                                        </span>
                                    </span>
                                </button>
                            );
                        })}
                    </div>

                    {/* Right Scroll Button */}
                    <button
                        type="button"
                        onClick={() => scroll('right')}
                        className="absolute -right-2 lg:-right-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/70 bg-white/90 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-[#0b2447] hover:text-white hover:border-[#0b2447] hover:shadow-lg active:scale-95 lg:flex text-slate-600"
                        aria-label="Scroll buyers right"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                        <div>
                            <h3 className="text-base font-black text-[#0b2447]">{selectedBuyer ? `${selectedBuyer.name} requirements` : 'All buyer requirements'}</h3>
                            <p className="text-xs font-medium text-slate-500">{selectedBuyerRequirementQuery.isFetching ? 'Loading published requirements...' : `${selectedRequirements.length} matching requirement${selectedRequirements.length === 1 ? '' : 's'} found.`}</p>
                        </div>
                        <div className="inline-flex self-start rounded-lg border border-slate-200 bg-white p-1 sm:self-auto" aria-label="Requirement display mode">
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                aria-pressed={viewMode === 'grid'}
                                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold transition ${
                                    viewMode === 'grid'
                                        ? 'bg-[#0b2447] text-white shadow-sm'
                                        : 'text-slate-600 hover:bg-slate-50'
                                }`}
                                title="Grid view"
                            >
                                <Grid2X2 className="h-3.5 w-3.5" /> Grid
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('list')}
                                aria-pressed={viewMode === 'list'}
                                className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold transition ${
                                    viewMode === 'list'
                                        ? 'bg-[#0b2447] text-white shadow-sm'
                                        : 'text-slate-600 hover:bg-slate-50'
                                }`}
                                title="List view"
                            >
                                <List className="h-3.5 w-3.5" /> List
                            </button>
                        </div>
                    </div>

                    {selectedBuyerRequirementQuery.isFetching ? (
                        viewMode === 'list' ? (
                            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm animate-pulse">
                                <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-black uppercase tracking-wider text-slate-400">
                                            <th className="px-5 py-4">Buyer / Org</th>
                                            <th className="px-5 py-4">Requirement</th>
                                            <th className="px-5 py-4">Type</th>
                                            <th className="px-5 py-4">Quantity</th>
                                            <th className="px-5 py-4">Budget</th>
                                            <th className="px-5 py-4">Location</th>
                                            <th className="px-5 py-4">Published</th>
                                            <th className="px-5 py-4">Last Date</th>
                                            <th className="px-5 py-4">Days Left</th>
                                            <th className="px-5 py-4">Status</th>
                                            <th className="px-5 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {Array.from({ length: 3 }).map((_, index) => (
                                            <tr key={index} className="border-b border-slate-100">
                                                <td className="px-5 py-4"><div className="h-4 w-32 rounded bg-slate-100" /></td>
                                                <td className="px-5 py-4"><div className="h-4 w-48 rounded bg-slate-100" /></td>
                                                <td className="px-5 py-4"><div className="h-4 w-16 rounded bg-slate-100" /></td>
                                                <td className="px-5 py-4"><div className="h-4 w-16 rounded bg-slate-100" /></td>
                                                <td className="px-5 py-4"><div className="h-4 w-24 rounded bg-slate-100" /></td>
                                                <td className="px-5 py-4"><div className="h-4 w-24 rounded bg-slate-100" /></td>
                                                <td className="px-5 py-4"><div className="h-4 w-20 rounded bg-slate-100" /></td>
                                                <td className="px-5 py-4"><div className="h-4 w-20 rounded bg-slate-100" /></td>
                                                <td className="px-5 py-4"><div className="h-4 w-16 rounded bg-slate-100" /></td>
                                                <td className="px-5 py-4"><div className="h-4 w-16 rounded bg-slate-100" /></td>
                                                <td className="px-5 py-4"><div className="ml-auto h-8 w-24 rounded bg-slate-100" /></td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                {Array.from({ length: 3 }).map((_, index) => <div key={index} className="h-56 rounded-xl border border-slate-200 bg-white p-4 shadow-sm animate-pulse"><div className="mb-4 h-4 w-3/4 rounded bg-slate-100" /><div className="mb-2 h-3 w-full rounded bg-slate-100" /><div className="h-3 w-2/3 rounded bg-slate-100" /></div>)}
                            </div>
                        )
                    ) : selectedRequirements.length ? (
                        viewMode === 'list' ? (
                            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                                <table className="w-full min-w-[1320px] border-collapse text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-black uppercase tracking-wider text-slate-500">
                                            <th scope="col" className="px-5 py-4">Buyer / Org</th>
                                            <th scope="col" className="px-5 py-4">Requirement</th>
                                            <th scope="col" className="px-5 py-4">Type</th>
                                            <th scope="col" className="px-5 py-4">Quantity</th>
                                            <th scope="col" className="px-5 py-4">Budget</th>
                                            <th scope="col" className="px-5 py-4">Location</th>
                                            <th scope="col" className="px-5 py-4">Published</th>
                                            <th scope="col" className="px-5 py-4">Last Date</th>
                                            <th scope="col" className="px-5 py-4">Days Left</th>
                                            <th scope="col" className="px-5 py-4">Status</th>
                                            <th scope="col" className="px-5 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                        {selectedRequirements.map(requirement => {
                                            const buyer = requirement.buyerOrganization;
                                            const status = getProcurementStatus({
                                                status: requirement.status,
                                                computedStatus: requirement.computedStatus,
                                                statusLabel: requirement.statusLabel,
                                                dueDate: requirement.lastDate,
                                                isUrgent: requirement.isUrgent
                                            });
                                            const detailHref = requirement.id ? `/marketplace/requirements/${requirement.id}` : '/marketplace/requirements';

                                            return (
                                                <tr key={`${requirement.sourceModel || 'buyer'}-${requirement.id}`} className="hover:bg-slate-50/50 transition">
                                                    <td className="px-5 py-4">
                                                        <div className="flex items-center gap-3">
                                                            <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-white text-xs font-black text-[#0b2447] border border-slate-200 shadow-sm">
                                                                {buyer?.logoUrl ? (
                                                                    <img src={buyer.logoUrl} alt={`${buyer.organizationName} logo`} className="h-full w-full object-contain p-1" />
                                                                ) : (
                                                                    initials(buyer?.organizationName || 'Verified Buyer')
                                                                )}
                                                            </span>
                                                            <div className="min-w-0">
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className="truncate font-black text-slate-900">{buyer?.organizationName || 'Verified Buyer'}</span>
                                                                    {buyer?.verificationStatus === 'VERIFIED' && (
                                                                        <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-emerald-600" />
                                                                    )}
                                                                </div>
                                                                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
                                                                    {buyerTypeLabel(buyer?.organizationType)}
                                                                </span>
                                                            </div>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <div className="max-w-[280px]">
                                                            <p className="truncate font-bold text-slate-950" title={requirement.title}>
                                                                {requirement.title}
                                                            </p>
                                                            <p className="mt-0.5 truncate text-[11px] font-semibold text-slate-500">
                                                                {requirement.requirementNumber || 'Requirement'} - {requirement.category?.name || 'Uncategorized'}
                                                            </p>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <span className={`inline-flex items-center rounded-md px-2 py-0.5 text-[10px] font-black uppercase ${
                                                            requirement.requirementType === 'PRODUCT' 
                                                                ? 'bg-blue-50 text-blue-700 border border-blue-100' 
                                                                : 'bg-purple-50 text-purple-700 border border-purple-100'
                                                        }`}>
                                                            {requirement.requirementType}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4 text-slate-900 font-bold">
                                                        {requirement.quantity || 'Estimated'} {requirement.unit || ''}
                                                    </td>
                                                    <td className="px-5 py-4 text-[#0b2447] font-black">
                                                        {formatBudgetRange(requirement.budgetMin, requirement.budgetMax)}
                                                    </td>
                                                    <td className="px-5 py-4 text-slate-600 font-semibold">
                                                        <div className="flex items-center gap-1">
                                                            <MapPin className="h-3.5 w-3.5 text-[#8a6a2f] shrink-0" />
                                                            <span className="truncate max-w-[150px]">
                                                                {requirement.location || buyer?.district || 'Confirmed on request'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 text-slate-900 font-bold">
                                                        {formatDateIN(requirement.approvedAt || requirement.createdAt || requirement.updatedAt)}
                                                    </td>
                                                    <td className="px-5 py-4 text-slate-900 font-bold">
                                                        {formatDateIN(requirement.lastDate)}
                                                    </td>
                                                    <td className="px-5 py-4 text-[#0b2447] font-black">
                                                        {status.deadlineLabel}
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${getStatusBadgeClass(status.code)}`}>
                                                            {status.label}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4 text-right">
                                                        <div className="flex items-center justify-end gap-2">
                                                            <Link href={detailHref} className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-center text-xs font-black text-slate-700 hover:bg-slate-100 transition">
                                                                View
                                                            </Link>
                                                            <Link href={`${detailHref}#respond`} className="inline-flex items-center justify-center gap-1 rounded-md bg-[#0b2447] px-2.5 py-1.5 text-xs font-black text-white hover:bg-[#12335f] transition">
                                                                Quote
                                                            </Link>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ) : (
                            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
                                {selectedRequirements.map(requirement => <RequirementCard key={`${requirement.sourceModel || 'buyer'}-${requirement.id}`} requirement={requirement} />)}
                            </div>
                        )
                    ) : (
                        <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
                            <p className="text-sm font-bold text-slate-700">No requirements available for this buyer right now.</p>
                            <p className="mt-1 text-xs text-slate-500">Choose another buyer or view all requirements.</p>
                        </div>
                    )}
                </div>
            </div>
        </section>
    );
}
