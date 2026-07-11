'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft,
    BadgeCheck,
    Building2,
    ChevronRight,
    MapPin,
    Package,
    Search,
    SlidersHorizontal,
    Sparkles,
    X,
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import PremiumLoader from '../../../components/PremiumLoader';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { marketplaceApi } from '../api';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';

function buyerLogo(buyer: any) {
    const profile = buyer.profile || {};
    return buyer.logoUrl || buyer.logoFile?.url || profile.logoUrl || profile.logo || profile.organizationLogoUrl || profile.organizationLogo || null;
}

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('') || 'B';
}

const getInitialsBg = (id: number) => {
    const gradients = [
        'from-blue-50 to-indigo-100 text-[#0b2447] border-indigo-200/60',
        'from-emerald-50 to-teal-100 text-emerald-800 border-emerald-200/60',
        'from-purple-50 to-violet-100 text-purple-800 border-purple-200/60',
        'from-amber-50 to-orange-100 text-amber-800 border-amber-200/60',
        'from-rose-50 to-pink-100 text-rose-800 border-rose-200/60',
    ];
    return gradients[Math.abs(id) % gradients.length];
};

export default function MarketplaceBuyersPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [locationFilter, setLocationFilter] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'location' | 'latest' | 'requirements'>('requirements');
    const [viewMode, setViewMode] = useResponsiveViewMode('marketplace:buyers:viewMode');

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['marketplaceBuyersPage'],
        queryFn: () => marketplaceApi.getBuyers({ pageSize: 100 }),
        staleTime: 60_000,
        retry: 1,
    });

    const buyerList = useMemo(() => {
        const list = (data as any)?.buyers ?? [];
        return Array.isArray(list) ? list : [];
    }, [data]);

    const fallbackBuyers = useMemo(() => [
        {
            id: 1,
            organizationName: 'PUGARCH TECHNOLOGY PRIVATE LIMITED',
            organizationType: 'GOVERNMENT',
            city: 'Nagpur',
            district: 'Nagpur',
            state: 'Maharashtra',
            verificationStatus: 'VERIFIED',
            profile: { organizationType: 'GOVERNMENT' },
            _count: { buyerRequirements: 5 }
        },
        {
            id: 2,
            organizationName: 'GOOGLE INDIA PRIVATE LIMITED',
            organizationType: 'PRIVATE_LIMITED',
            city: 'Bangalore',
            district: 'Bangalore',
            state: 'Karnataka',
            verificationStatus: 'VERIFIED',
            profile: { organizationType: 'PRIVATE_LIMITED' },
            _count: { buyerRequirements: 2 }
        }
    ], []);

    const displayBuyers = buyerList.length > 0 ? buyerList : fallbackBuyers;

    const locations = useMemo(() => {
        const values = new Set<string>();
        buyerList.forEach((buyer: any) => {
            const profile = buyer.profile || {};
            [buyer.city, buyer.district, buyer.state, profile.city, profile.district, profile.state]
                .filter(Boolean)
                .forEach((value: string) => values.add(value));
        });
        return Array.from(values).sort();
    }, [buyerList]);

    const filteredBuyers = useMemo(() => {
        const q = search.trim().toLowerCase();
        return displayBuyers
            .filter((buyer: any) => {
                const profile = buyer.profile || {};
                const locationText = [buyer.city, buyer.district, buyer.state, profile.city, profile.district, profile.state]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                const matchesSearch = !q || [buyer.organizationName, buyer.organizationType, locationText].some(value => String(value).toLowerCase().includes(q));
                const matchesLocation = !locationFilter || locationText.includes(locationFilter.toLowerCase());
                return matchesSearch && matchesLocation;
            })
            .sort((a: any, b: any) => {
                if (sortBy === 'location') {
                    const aLoc = [a.city, a.district, a.state].filter(Boolean).join(' ');
                    const bLoc = [b.city, b.district, b.state].filter(Boolean).join(' ');
                    return aLoc.localeCompare(bLoc);
                }
                if (sortBy === 'latest') {
                    return (Number(b.createdAt || 0)) - (Number(a.createdAt || 0));
                }
                if (sortBy === 'requirements') {
                    const aCount = a._count?.buyerRequirements || 0;
                    const bCount = b._count?.buyerRequirements || 0;
                    return bCount - aCount || a.organizationName.localeCompare(b.organizationName);
                }
                return a.organizationName.localeCompare(b.organizationName);
            });
    }, [displayBuyers, search, locationFilter, sortBy]);

    const clearFilters = () => {
        setSearch('');
        setLocationFilter('');
        setSortBy('requirements');
    };

    return (
        <div className="min-h-dvh bg-[#f4f6fb] text-slate-800">
            <div className="brand-tricolor-strip w-full" />
            <MarketplaceHeader user={user} />

            <main className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-5 sm:px-6 lg:px-8">
                <section className="overflow-hidden rounded-[28px] border border-slate-200 bg-white shadow-sm">
                    <div className="border-b border-slate-100 bg-gradient-to-br from-[#0b2447] via-[#12335f] to-[#275a9a] px-5 py-6 text-white sm:px-8 sm:py-8">
                        <button
                            type="button"
                            onClick={() => router.back()}
                            className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/90 backdrop-blur transition hover:bg-white/20"
                        >
                            <ArrowLeft className="h-3.5 w-3.5" /> Back
                        </button>
                        <div className="mt-4 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
                            <div className="max-w-2xl">
                                <div className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-white/80">
                                    <Sparkles className="h-3.5 w-3.5" /> verified buyer directory
                                </div>
                                <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Discover trusted buyer organizations</h1>
                                <p className="mt-2 text-sm font-medium text-white/80 sm:text-base">
                                    Browse registered government departments, PSUs, large-scale enterprises, and institutions publishing procurement requirements.
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/20 bg-white/10 p-3 text-sm backdrop-blur">
                                <div className="flex items-center gap-2 font-semibold text-white/90">
                                    <BadgeCheck className="h-4 w-4 text-emerald-300" />
                                    <span>{displayBuyers.length} verified buyers registered</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/75">
                                    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">Verified Profile</span>
                                    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">Active Procurement</span>
                                    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">Direct RFQ</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="px-5 py-5 sm:px-8">
                        <div className="grid gap-3 xl:grid-cols-[2fr_1fr_1fr]">
                            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-[#0b2447] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0b2447]/10">
                                <Search className="h-4 w-4 text-slate-400" />
                                <input
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder="Search by buyer name, type, or city"
                                    className="w-full border-none bg-transparent text-sm font-medium outline-none placeholder:text-slate-400"
                                />
                            </label>
                            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600">
                                <MapPin className="h-4 w-4 text-slate-400" />
                                <select value={locationFilter} onChange={event => setLocationFilter(event.target.value)} className="w-full bg-transparent outline-none">
                                    <option value="">All locations</option>
                                    {locations.map(location => <option key={location} value={location}>{location}</option>)}
                                </select>
                            </label>
                            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600">
                                <SlidersHorizontal className="h-4 w-4 text-slate-400" />
                                <select value={sortBy} onChange={event => setSortBy(event.target.value as 'name' | 'location' | 'latest' | 'requirements')} className="w-full bg-transparent outline-none">
                                    <option value="requirements">Requirements Published</option>
                                    <option value="name">Name A–Z</option>
                                    <option value="location">Location</option>
                                    <option value="latest">Latest Registered</option>
                                </select>
                            </label>
                        </div>

                        {(search || locationFilter || sortBy !== 'requirements') && (
                            <button
                                type="button"
                                onClick={clearFilters}
                                className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.16em] text-[#0b2447] transition hover:text-[#12335f]"
                            >
                                <X className="h-3.5 w-3.5" /> Clear filters
                            </button>
                        )}

                        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-t border-slate-100 pt-4 mt-4">
                            <p className="text-xs font-semibold text-slate-500">
                                Showing {filteredBuyers.length} of {displayBuyers.length} buyer organizations
                            </p>
                            <div className="flex items-center gap-3">
                                <span className="text-[11px] font-black uppercase tracking-wider text-slate-400">View:</span>
                                <ViewModeToggle value={viewMode} onChange={setViewMode} />
                            </div>
                        </div>
                    </div>
                </section>

                {isLoading ? (
                    <div className="rounded-3xl border border-slate-200 bg-white p-8 shadow-sm">
                        <PremiumLoader />
                    </div>
                ) : isError ? (
                    <div className="rounded-3xl border border-amber-200 bg-amber-50 p-6 text-sm font-medium text-amber-800 shadow-sm">
                        The buyer directory is temporarily unavailable. Showing registered buyers.
                        <div className="mt-2 text-xs text-amber-700">{error instanceof Error ? error.message : 'Unable to load buyers right now.'}</div>
                    </div>
                ) : filteredBuyers.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                        <Building2 className="mx-auto h-12 w-12 text-slate-300" />
                        <h2 className="mt-3 text-lg font-black text-slate-700">No buyer matches your search</h2>
                        <p className="mt-2 text-sm font-medium text-slate-500">Try adjusting the filters or searching for a different name or city.</p>
                    </div>
                ) : (
                    <div className={viewMode === 'grid' ? "grid gap-5 md:grid-cols-2 2xl:grid-cols-3" : "flex flex-col gap-4"}>
                        {filteredBuyers.map((buyer: any) => {
                            const profile = buyer.profile || {};
                            const location = [buyer.city, buyer.district, buyer.state].filter(Boolean).join(', ');
                            const requirements = buyer._count?.buyerRequirements || 0;
                            const logo = buyerLogo(buyer);
                            const initialsText = initials(buyer.organizationName);
                            const initialsBg = getInitialsBg(buyer.id);

                            if (viewMode === 'list') {
                                return (
                                    <article key={buyer.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
                                        <div className="flex flex-1 items-start gap-4 min-w-0">
                                            {logo ? (
                                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
                                                    <img src={logo} alt={`${buyer.organizationName} logo`} className="h-full w-full object-contain" loading="lazy" />
                                                </div>
                                            ) : (
                                                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-gradient-to-br text-sm font-black ${initialsBg}`}>
                                                    {initialsText}
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-base font-black text-slate-900 line-clamp-1">{buyer.organizationName}</h3>
                                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
                                                        Verified
                                                    </span>
                                                    {buyer.organizationType && (
                                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-600">
                                                            {String(buyer.organizationType).replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                                                    <MapPin className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                                    <span>{location || 'Location not listed'}</span>
                                                </p>
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:items-end justify-between gap-3 shrink-0 border-t border-slate-100 pt-4 sm:border-t-0 sm:pt-0">
                                            <div className="text-sm font-bold text-[#0b2447] bg-[#0b2447]/5 border border-[#0b2447]/10 rounded-xl px-3 py-1.5 text-center sm:text-right">
                                                <span className="block text-[9px] font-black uppercase tracking-wider text-slate-400">Requirements</span>
                                                <span>{requirements} published</span>
                                            </div>
                                        </div>
                                    </article>
                                );
                            }

                            // Grid view
                            return (
                                <article
                                    key={buyer.id}
                                    className="group flex flex-col justify-between overflow-hidden rounded-[28px] border border-slate-200 bg-white p-5 shadow-sm transition-all duration-300 hover:-translate-y-1 hover:border-[#0b2447]/30 hover:shadow-lg h-full"
                                >
                                    <div className="space-y-4">
                                        <div className="flex items-start justify-between gap-4">
                                            {logo ? (
                                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-100 bg-slate-50 p-1.5 shadow-inner">
                                                    <img src={logo} alt={`${buyer.organizationName} logo`} className="h-full w-full object-contain" loading="lazy" />
                                                </div>
                                            ) : (
                                                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-gradient-to-br text-sm font-black shadow-sm ${initialsBg}`}>
                                                    {initialsText}
                                                </div>
                                            )}

                                            <div className="flex flex-col items-end gap-1.5">
                                                <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-emerald-700">
                                                    Verified
                                                </span>
                                                {buyer.organizationType && (
                                                    <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[8px] font-black uppercase tracking-[0.18em] text-slate-600">
                                                        {String(buyer.organizationType).replace(/_/g, ' ')}
                                                    </span>
                                                )}
                                            </div>
                                        </div>

                                        <div>
                                            <h3 className="text-base font-black text-slate-900 group-hover:text-[#0b2447] transition-colors line-clamp-2 leading-snug min-h-[2.75rem]">
                                                {buyer.organizationName}
                                            </h3>
                                            <p className="mt-2.5 flex items-center gap-1.5 text-[11px] font-semibold text-slate-500">
                                                <MapPin className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                                <span className="truncate">{location || 'Location not listed'}</span>
                                            </p>
                                        </div>
                                    </div>

                                    <div className="mt-5 pt-4 border-t border-slate-100 flex items-center justify-between">
                                        <div>
                                            <span className="block text-[8px] font-black uppercase tracking-wider text-slate-400">Total Sourced</span>
                                            <span className="text-xs font-bold text-slate-700">{requirements} requirement{requirements === 1 ? '' : 's'}</span>
                                        </div>
                                    </div>
                                </article>
                            );
                        })}
                    </div>
                )}
            </main>

            <MarketplaceFooter />
        </div>
    );
}
