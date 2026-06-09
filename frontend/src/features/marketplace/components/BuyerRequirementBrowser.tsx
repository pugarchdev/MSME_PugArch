'use client';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Building2, ChevronRight, MapPin } from 'lucide-react';
import type { BuyerRequirement, MarketplaceOrganization } from '../api';
import { RequirementCard } from './BuyerRequirementsSection';

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
    return org?.logoUrl || profile.logoUrl || profile.logo || profile.organizationLogoUrl || profile.organizationLogo || null;
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

    const selectedBuyer = selectedBuyerId === 'all' ? null : buyerSummaries.find(buyer => buyer.id === selectedBuyerId) || null;
    const selectedRequirements = useMemo(() => {
        if (selectedBuyerId === 'all') return requirements;
        return requirements.filter(requirement => requirement.buyerOrganization?.id === selectedBuyerId);
    }, [requirements, selectedBuyerId]);

    if (!buyerSummaries.length && !requirements.length) return null;

    return (
        <section className="mt-2 border-b border-slate-100 bg-white" aria-labelledby="buyer-browser-heading">
            <div className="mx-auto max-w-7xl px-4 py-8 sm:py-10">
                <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a6a2f]">Buyer Requirement Directory</p>
                        <h2 id="buyer-browser-heading" className="mt-1 text-xl font-black text-[#0b2447] sm:text-2xl">Browse requirements by buyer</h2>
                        <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">Select a buyer logo to view only that buyer&apos;s open requirements below.</p>
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

                    {buyerSummaries.map(buyer => {
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
                            <p className="text-xs font-medium text-slate-500">{selectedRequirements.length} matching requirement{selectedRequirements.length === 1 ? '' : 's'} found.</p>
                        </div>
                    </div>

                    {selectedRequirements.length ? (
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                            {selectedRequirements.map(requirement => <RequirementCard key={`${requirement.sourceModel || 'buyer'}-${requirement.id}`} requirement={requirement} />)}
                        </div>
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
