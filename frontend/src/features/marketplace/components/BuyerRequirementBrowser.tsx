'use client';
import React, { useMemo, useState, useEffect } from 'react';
import Link from 'next/link';
import { BadgeCheck, Building2, ChevronLeft, ChevronRight, MapPin } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { type BuyerRequirement, type MarketplaceOrganization } from '../api';
import { BuyerRequirementsList } from './BuyerRequirementsList';

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
    gstin?: string | null;
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

function BuyerStripSkeleton() {
    return (
        <div className="flex gap-4 overflow-x-auto pb-4 pt-1 no-scrollbar lg:px-4">
            {Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-col h-[175px] w-[160px] shrink-0 items-center justify-center gap-3.5 rounded-2xl border border-slate-200/60 bg-white/85 p-3.5 animate-pulse">
                    <div className="h-20 w-20 rounded-xl bg-slate-100 shrink-0" />
                    <div className="h-3.5 w-3/4 rounded bg-slate-100" />
                    <div className="h-2.5 w-1/2 rounded bg-slate-100" />
                </div>
            ))}
        </div>
    );
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
                requirementCount: Math.max(buyer._count?.buyerRequirements || 0, matchingRequirements),
                gstin: buyer.gstin
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
                requirementCount: requirementCounts.get(buyer.id) || 0,
                gstin: (buyer as any).gstin
            });
        });

        return Array.from(map.values()).sort((a, b) => b.requirementCount - a.requirementCount || a.name.localeCompare(b.name));
    }, [buyers, requirements]);

    const [selectedBuyerId, setSelectedBuyerId] = useState<number | 'all'>('all');
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

    const selectedBuyer = selectedBuyerId === 'all' ? null : buyerSummaries.find(buyer => buyer.id === selectedBuyerId) || null;

    return (
        <section className="mt-2 border-b border-slate-100 bg-white" aria-labelledby="buyer-browser-heading">
            <div className="mx-auto max-w-[1680px] px-4 pt-8 pb-3 sm:px-6 sm:pt-10 sm:pb-4 2xl:px-8">
                <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a6a2f]">Verified Buyer Strip</p>
                        <div className="flex flex-wrap items-center gap-2.5 mt-1">
                            <h2 id="buyer-browser-heading" className="text-xl font-black text-[#0b2447] sm:text-2xl">Verified buyers &amp; published requirements</h2>
                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-black text-emerald-800 border border-emerald-200 shadow-sm">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                                {buyerSummaries.filter(b => b.verified).length} Active Buyers
                            </span>
                        </div>
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

                    {buyers.length === 0 ? (
                        <BuyerStripSkeleton />
                    ) : (
                        <div
                            ref={scrollRef}
                            className="flex gap-4 overflow-x-auto pb-4 pt-1 no-scrollbar lg:px-4"
                            role="list"
                            aria-label="Buyers with requirements"
                        >
                            <Link
                                href="/marketplace/requirements"
                                className="group flex flex-col h-[175px] w-[160px] shrink-0 items-center justify-center gap-3.5 rounded-2xl border border-slate-200/60 bg-white/85 p-3.5 text-center backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:border-[#0b2447]/35 hover:bg-white hover:shadow-lg hover:shadow-[#0b2447]/5 text-slate-800"
                            >
                                <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-slate-50 to-slate-100 border border-slate-200/80 text-slate-600 shadow-sm transition-all duration-300 group-hover:scale-105">
                                    <Building2 className="h-9 w-9 text-[#0b2447]" />
                                </span>
                                <span className="block text-xs font-extrabold leading-snug text-[#0b2447] transition-colors line-clamp-2 mt-1 px-1">
                                    All Buyers
                                </span>
                            </Link>

                            {buyerSummaries.map(buyer => {
                                const initialsText = initials(buyer.name);
                                const initialsBgClass = getInitialsBg(buyer.id);

                                return (
                                    <Link
                                        key={buyer.id}
                                        href={`/buyer-requirements/${buyer.id}`}
                                        className="group flex flex-col h-[175px] w-[160px] shrink-0 items-center justify-center gap-3.5 rounded-2xl border border-slate-200/60 bg-white/85 p-3.5 text-center backdrop-blur-md shadow-sm transition-all duration-300 hover:-translate-y-1 hover:scale-[1.03] hover:border-[#0b2447]/35 hover:bg-white hover:shadow-lg hover:shadow-[#0b2447]/5 text-slate-800"
                                        role="listitem"
                                    >
                                        <span className={cn(
                                            "flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200/80 transition-all duration-300 group-hover:scale-105 shadow-sm bg-white",
                                            !buyer.logoUrl && `bg-gradient-to-br ${initialsBgClass}`
                                        )}>
                                            {buyer.logoUrl ? (
                                                <img src={buyer.logoUrl} alt={`${buyer.name} logo`} className="h-full w-full object-contain p-1.5 bg-white" loading="lazy" />
                                            ) : (
                                                <span className="text-sm font-black tracking-wider">{initialsText}</span>
                                            )}
                                        </span>
                                        <span className="block text-xs font-extrabold leading-snug text-slate-850 group-hover:text-[#0b2447] transition-colors line-clamp-2 mt-1 px-1">
                                            {buyer.name}
                                        </span>
                                    </Link>
                                );
                            })}
                        </div>
                    )}

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

                {/* <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <div className="mb-4">
                        <h3 className="text-base font-black text-[#0b2447]">{selectedBuyer ? `${selectedBuyer.name} requirements` : 'All buyer requirements'}</h3>
                        <p className="text-xs font-medium text-slate-500">Procurement requirements from verified buyers</p>
                    </div>

                    <BuyerRequirementsList 
                        buyerOrganizationId={selectedBuyerId}
                        limit={12}
                        showFilters={false}
                        showSearch={false}
                        showTabs={false}
                        showPagination={false}
                    />
                </div> */}
            </div>
        </section>
    );
}

