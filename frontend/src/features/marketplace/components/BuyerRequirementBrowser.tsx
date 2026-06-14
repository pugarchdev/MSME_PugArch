'use client';
import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { BadgeCheck, Building2, ChevronRight, MapPin, List, LayoutGrid } from 'lucide-react';
import { marketplaceApi, type BuyerRequirement, type MarketplaceOrganization } from '../api';
import { RequirementCard } from './BuyerRequirementsSection';

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

                <div className="flex gap-3 overflow-x-auto pb-3 [scrollbar-width:thin]" role="list" aria-label="Buyers with requirements">
                    <button
                        type="button"
                        onClick={() => setSelectedBuyerId('all')}
                        className={`flex min-w-[150px] shrink-0 items-center gap-3 rounded-xl border p-3 text-left transition ${selectedBuyerId === 'all' ? 'border-[#0b2447] bg-[#0b2447] text-white shadow-md' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0b2447]/40'}`}
                    >
                        <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl ${selectedBuyerId === 'all' ? 'bg-white/15' : 'bg-white'} shadow-sm`}><Building2 className="h-5 w-5" /></span>
                        <span className="min-w-0">
                            <span className="block text-sm font-black">All Buyers</span>
                            <span className="block text-[11px] font-semibold opacity-80">{requirements.length} requirement{requirements.length === 1 ? '' : 's'}</span>
                        </span>
                    </button>

                    {buyerSummaries.length === 0 ? (
                        <div className="min-w-[260px] shrink-0 rounded-xl border border-dashed border-slate-300 bg-slate-50 p-4 text-sm font-bold text-slate-600">No verified buyers available right now.</div>
                    ) : buyerSummaries.map(buyer => {
                        const isActive = selectedBuyerId === buyer.id;
                        return (
                            <button
                                key={buyer.id}
                                type="button"
                                onClick={() => setSelectedBuyerId(buyer.id)}
                                className={`flex min-w-[220px] shrink-0 items-center gap-3 rounded-xl border p-3 text-left transition ${isActive ? 'border-[#0b2447] bg-[#0b2447] text-white shadow-md' : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-[#0b2447]/40 hover:bg-white'}`}
                                role="listitem"
                            >
                                <span className={`flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-xl ${isActive ? 'bg-white' : 'bg-white'} text-sm font-black text-[#0b2447] shadow-sm`}>
                                    {buyer.logoUrl ? <img src={buyer.logoUrl} alt={`${buyer.name} logo`} className="h-full w-full object-contain p-1.5" loading="lazy" /> : initials(buyer.name)}
                                </span>
                                <span className="min-w-0 flex-1">
                                    <span className="flex items-center gap-1.5">
                                        <span className="truncate text-sm font-black">{buyer.name}</span>
                                        {buyer.verified && <BadgeCheck className={`h-3.5 w-3.5 shrink-0 ${isActive ? 'text-emerald-200' : 'text-emerald-600'}`} />}
                                    </span>
                                    {buyer.location && <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold opacity-80"><MapPin className="h-3 w-3" /> {buyer.location}</span>}
                                    <span className="mt-1 block text-[11px] font-semibold opacity-80">{buyer.requirementCount} requirement{buyer.requirementCount === 1 ? '' : 's'}</span>
                                </span>
                            </button>
                        );
                    })}
                </div>

                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4 flex flex-col justify-between gap-2 sm:flex-row sm:items-center">
                        <div>
                            <h3 className="text-base font-black text-[#0b2447]">{selectedBuyer ? `${selectedBuyer.name} requirements` : 'All buyer requirements'}</h3>
                            <p className="text-xs font-medium text-slate-500">{selectedBuyerRequirementQuery.isFetching ? 'Loading published requirements...' : `${selectedRequirements.length} matching requirement${selectedRequirements.length === 1 ? '' : 's'} found.`}</p>
                        </div>
                        <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm self-start sm:self-auto">
                            <button
                                type="button"
                                onClick={() => setViewMode('list')}
                                className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                                    viewMode === 'list'
                                        ? 'bg-[#0b2447] text-white'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                                title="List View"
                            >
                                <List className="h-4 w-4" />
                            </button>
                            <button
                                type="button"
                                onClick={() => setViewMode('grid')}
                                className={`flex h-8 w-8 items-center justify-center rounded-md transition-colors ${
                                    viewMode === 'grid'
                                        ? 'bg-[#0b2447] text-white'
                                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                                }`}
                                title="Grid View"
                            >
                                <LayoutGrid className="h-4 w-4" />
                            </button>
                        </div>
                    </div>

                    {selectedBuyerRequirementQuery.isFetching ? (
                        viewMode === 'list' ? (
                            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm animate-pulse">
                                <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-black uppercase tracking-wider text-slate-400">
                                            <th className="px-5 py-4">Buyer / Org</th>
                                            <th className="px-5 py-4">Requirement</th>
                                            <th className="px-5 py-4">Type</th>
                                            <th className="px-5 py-4">Quantity</th>
                                            <th className="px-5 py-4">Location</th>
                                            <th className="px-5 py-4">Last Date</th>
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
                                                <td className="px-5 py-4"><div className="h-4 w-20 rounded bg-slate-100" /></td>
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
                                <table className="w-full min-w-[1000px] border-collapse text-left text-sm">
                                    <thead>
                                        <tr className="border-b border-slate-200 bg-slate-50/75 text-[11px] font-black uppercase tracking-wider text-slate-500">
                                            <th scope="col" className="px-5 py-4">Buyer / Org</th>
                                            <th scope="col" className="px-5 py-4">Requirement</th>
                                            <th scope="col" className="px-5 py-4">Type</th>
                                            <th scope="col" className="px-5 py-4">Quantity</th>
                                            <th scope="col" className="px-5 py-4">Location</th>
                                            <th scope="col" className="px-5 py-4">Last Date</th>
                                            <th scope="col" className="px-5 py-4">Status</th>
                                            <th scope="col" className="px-5 py-4 text-right">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 font-medium text-slate-700">
                                        {selectedRequirements.map(requirement => {
                                            const buyer = requirement.buyerOrganization;
                                            const lastDate = new Date(requirement.lastDate);
                                            const daysLeft = Math.ceil((lastDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
                                            const status = requirement.status === 'OPEN' && daysLeft <= 7 ? 'Closing Soon' : requirement.status.replace(/_/g, ' ');
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
                                                                {requirement.category?.name || 'Uncategorized'}
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
                                                    <td className="px-5 py-4 text-slate-600 font-semibold">
                                                        <div className="flex items-center gap-1">
                                                            <MapPin className="h-3.5 w-3.5 text-[#8a6a2f] shrink-0" />
                                                            <span className="truncate max-w-[150px]">
                                                                {requirement.location || buyer?.district || 'Confirmed on request'}
                                                            </span>
                                                        </div>
                                                    </td>
                                                    <td className="px-5 py-4 text-slate-900 font-bold">
                                                        {lastDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                                    </td>
                                                    <td className="px-5 py-4">
                                                        <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-black uppercase ${
                                                            status === 'Closing Soon' 
                                                                ? 'bg-amber-50 text-amber-700 border border-amber-200' 
                                                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                                                        }`}>
                                                            {status}
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
