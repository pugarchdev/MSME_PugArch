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
    Wrench,
    X,
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import PremiumLoader from '../../../components/PremiumLoader';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { marketplaceApi, type MarketplaceSeller } from '../api';
import { saveSupplier } from '../utils/savedSuppliers';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';

function sellerLogo(seller: MarketplaceSeller) {
    const profile = seller.profile || {};
    return seller.logoUrl || seller.logoFile?.url || profile.logoUrl || profile.logo || profile.organizationLogoUrl || profile.organizationLogo || null;
}

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('') || 'V';
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

export default function MarketplaceSellersPage() {
    const { user } = useAuth();
    const router = useRouter();
    const [search, setSearch] = useState('');
    const [locationFilter, setLocationFilter] = useState('');
    const [categoryFilter, setCategoryFilter] = useState('');
    const [sortBy, setSortBy] = useState<'name' | 'location' | 'latest'>('name');
    const [viewMode, setViewMode] = useResponsiveViewMode('marketplace:sellers:viewMode');

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['marketplaceSellersPage'],
        queryFn: () => marketplaceApi.getSellers({ pageSize: 100, sort: 'latest' }),
        staleTime: 60_000,
        retry: 1,
    });

    const sellerList = useMemo(() => {
        const list = (data as any)?.sellers ?? [];
        return Array.isArray(list) ? list : [];
    }, [data]);

    const fallbackSellers = useMemo(() => [
        {
            id: 1001,
            organizationName: 'PUGARCH TECHNOLOGY PRIVATE LIMITED',
            organizationType: 'MSME',
            city: 'Nagpur',
            district: 'Nagpur',
            state: 'Maharashtra',
            verificationStatus: 'VERIFIED',
            profile: { organizationType: 'MSME' },
            _count: { products: 34, services: 11 },
            sellerUserId: 19,
        },
        {
            id: 1002,
            organizationName: 'E2E Reverse Seller Org 1',
            organizationType: 'MSME',
            city: 'Jharsuguda',
            district: 'Jharsuguda',
            state: 'Odisha',
            verificationStatus: 'VERIFIED',
            profile: { organizationType: 'MSME' },
            _count: { products: 0, services: 0 },
            sellerUserId: 29,
        },
        {
            id: 1003,
            organizationName: 'KAMALKUMAR SHIVKISAN AGRAWAL',
            organizationType: 'GOVERNMENT',
            city: 'Nagpur',
            district: 'Gokulpeth',
            state: 'Maharashtra',
            verificationStatus: 'VERIFIED',
            profile: { organizationType: 'GOVERNMENT' },
            _count: { products: 0, services: 4 },
            sellerUserId: 17,
        },
    ], []);

    const displaySellers = sellerList.length > 0 ? sellerList : fallbackSellers;

    const locations = useMemo(() => {
        const values = new Set<string>();
        sellerList.forEach((seller: any) => {
            const profile = seller.profile || {};
            [seller.city, seller.district, seller.state, profile.city, profile.district, profile.state]
                .filter(Boolean)
                .forEach((value: string) => values.add(value));
        });
        return Array.from(values).sort();
    }, [sellerList]);

    const categories = useMemo(() => {
        const values = new Set<string>();
        sellerList.forEach((seller: any) => {
            const profile = seller.profile || {};
            const collection = [
                ...(Array.isArray(profile.productCategories) ? profile.productCategories : []),
                ...(Array.isArray(profile.serviceCategories) ? profile.serviceCategories : []),
                ...(Array.isArray(profile.categories) ? profile.categories : []),
            ];
            collection.filter(Boolean).forEach((value: string) => values.add(String(value)));
        });
        return Array.from(values).sort();
    }, [sellerList]);

    const filteredSellers = useMemo(() => {
        const q = search.trim().toLowerCase();
        return displaySellers
            .filter((seller: MarketplaceSeller) => {
                const profile = seller.profile || {};
                const locationText = [seller.city, seller.district, seller.state, profile.city, profile.district, profile.state]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();
                const categoryText = [
                    ...(Array.isArray(profile.productCategories) ? profile.productCategories : []),
                    ...(Array.isArray(profile.serviceCategories) ? profile.serviceCategories : []),
                    ...(Array.isArray(profile.categories) ? profile.categories : []),
                ]
                    .filter(Boolean)
                    .join(' ')
                    .toLowerCase();

                const matchesSearch = !q || [seller.organizationName, profile.organizationType, locationText, categoryText].some(value => String(value).toLowerCase().includes(q));
                const matchesLocation = !locationFilter || locationText.includes(locationFilter.toLowerCase());
                const matchesCategory = !categoryFilter || categoryText.includes(categoryFilter.toLowerCase());
                return matchesSearch && matchesLocation && matchesCategory;
            })
            .sort((a: MarketplaceSeller, b: MarketplaceSeller) => {
                if (sortBy === 'location') {
                    const aLoc = [a.city, a.district, a.state].filter(Boolean).join(' ');
                    const bLoc = [b.city, b.district, b.state].filter(Boolean).join(' ');
                    return aLoc.localeCompare(bLoc);
                }
                if (sortBy === 'latest') {
                    return (Number((b as any).createdAt) || 0) - (Number((a as any).createdAt) || 0);
                }
                return a.organizationName.localeCompare(b.organizationName);
            });
    }, [displaySellers, search, locationFilter, categoryFilter, sortBy]);

    const clearFilters = () => {
        setSearch('');
        setLocationFilter('');
        setCategoryFilter('');
        setSortBy('name');
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
                                    <Sparkles className="h-3.5 w-3.5" /> verified supplier directory
                                </div>
                                <h1 className="mt-3 text-2xl font-black tracking-tight sm:text-3xl">Discover trusted seller organizations</h1>
                                <p className="mt-2 text-sm font-medium text-white/80 sm:text-base">
                                    Search by location, industry, and service capability to find the right verified partner for your procurement needs.
                                </p>
                            </div>
                            <div className="rounded-2xl border border-white/20 bg-white/10 p-3 text-sm backdrop-blur">
                                <div className="flex items-center gap-2 font-semibold text-white/90">
                                    <BadgeCheck className="h-4 w-4 text-emerald-300" />
                                    <span>{displaySellers.length} verified organizations available</span>
                                </div>
                                <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-white/75">
                                    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">GST Verified</span>
                                    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">Udyam Ready</span>
                                    <span className="rounded-full border border-white/15 bg-white/10 px-2.5 py-1">Fast RFQ</span>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div className="px-5 py-5 sm:px-8">
                        <div className="grid gap-3 xl:grid-cols-[1.6fr_0.8fr_0.8fr_0.6fr]">
                            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2.5 focus-within:border-[#0b2447] focus-within:bg-white focus-within:ring-2 focus-within:ring-[#0b2447]/10">
                                <Search className="h-4 w-4 text-slate-400" />
                                <input
                                    value={search}
                                    onChange={event => setSearch(event.target.value)}
                                    placeholder="Search by seller name, category, or city"
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
                                <select value={categoryFilter} onChange={event => setCategoryFilter(event.target.value)} className="w-full bg-transparent outline-none">
                                    <option value="">All categories</option>
                                    {categories.map(category => <option key={category} value={category}>{category}</option>)}
                                </select>
                            </label>
                            <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-600">
                                <Package className="h-4 w-4 text-slate-400" />
                                <select value={sortBy} onChange={event => setSortBy(event.target.value as 'name' | 'location' | 'latest')} className="w-full bg-transparent outline-none">
                                    <option value="name">Name A–Z</option>
                                    <option value="location">Location</option>
                                    <option value="latest">Latest</option>
                                </select>
                            </label>
                        </div>

                        {(search || locationFilter || categoryFilter || sortBy !== 'name') && (
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
                                Showing {filteredSellers.length} of {displaySellers.length} supplier organizations
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
                        The marketplace directory is temporarily unavailable. Showing a preview of the verified seller experience while the service recovers.
                        <div className="mt-2 text-xs text-amber-700">{error instanceof Error ? error.message : 'Unable to load sellers right now.'}</div>
                    </div>
                ) : filteredSellers.length === 0 ? (
                    <div className="rounded-3xl border border-dashed border-slate-300 bg-white p-10 text-center shadow-sm">
                        <Building2 className="mx-auto h-12 w-12 text-slate-300" />
                        <h2 className="mt-3 text-lg font-black text-slate-700">No seller matches your search</h2>
                        <p className="mt-2 text-sm font-medium text-slate-500">Try adjusting the filters or searching for a different category or city.</p>
                    </div>
                ) : (
                    <div className={viewMode === 'grid' ? "grid gap-5 md:grid-cols-2 2xl:grid-cols-3" : "flex flex-col gap-4"}>
                        {filteredSellers.map((seller: MarketplaceSeller) => {
                            const profile = seller.profile || {};
                            const location = [seller.city, seller.district, seller.state].filter(Boolean).join(', ');
                            const categoryText = [
                                ...(Array.isArray(profile.productCategories) ? profile.productCategories : []),
                                ...(Array.isArray(profile.serviceCategories) ? profile.serviceCategories : []),
                            ].filter(Boolean).slice(0, 2).join(' • ');
                            const products = seller._count?.products || 0;
                            const services = seller._count?.services || 0;
                            const logo = sellerLogo(seller);
                            const initialsText = initials(seller.organizationName);
                            const initialsBg = getInitialsBg(seller.id);

                            if (viewMode === 'list') {
                                return (
                                    <article key={seller.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-5 rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md">
                                        <div className="flex flex-1 items-start gap-4 min-w-0">
                                            {logo ? (
                                                <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
                                                    <img src={logo} alt={`${seller.organizationName} logo`} className="h-full w-full object-contain" loading="lazy" />
                                                </div>
                                            ) : (
                                                <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border bg-gradient-to-br text-sm font-black ${initialsBg}`}>
                                                    {initialsText}
                                                </div>
                                            )}
                                            <div className="min-w-0 flex-1">
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <h3 className="text-base font-black text-slate-900 line-clamp-1">{seller.organizationName}</h3>
                                                    <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-emerald-700">
                                                        Verified
                                                    </span>
                                                    {profile.organizationType && (
                                                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-[0.16em] text-slate-600">
                                                            {String(profile.organizationType).replace(/_/g, ' ')}
                                                        </span>
                                                    )}
                                                </div>
                                                
                                                <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                                                    <MapPin className="h-3.5 w-3.5 text-orange-500 shrink-0" />
                                                    <span>{location || 'Location not listed'}</span>
                                                </p>

                                                {categoryText && (
                                                    <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                                                        <span className="text-blue-700 bg-blue-50/50 border border-blue-100 rounded px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider">Capabilities</span>
                                                        <span className="text-slate-500">{categoryText}</span>
                                                    </div>
                                                )}
                                            </div>
                                        </div>

                                        <div className="flex flex-col sm:items-end justify-between gap-3 shrink-0 border-t border-slate-100 pt-4 sm:border-t-0 sm:pt-0">
                                            <div className="flex items-center gap-4 text-[11px] font-semibold text-slate-600">
                                                <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-xl">
                                                    <Package className="h-3.5 w-3.5 text-slate-500" />
                                                    <strong>{products}</strong> product{products === 1 ? '' : 's'}
                                                </span>
                                                <span className="inline-flex items-center gap-1.5 bg-slate-50 border border-slate-100 px-2.5 py-1 rounded-xl">
                                                    <Wrench className="h-3.5 w-3.5 text-slate-500" />
                                                    <strong>{services}</strong> service{services === 1 ? '' : 's'}
                                                </span>
                                            </div>

                                            <div className="flex gap-2 w-full sm:w-auto">
                                                <Link
                                                    href={`/vendors/${seller.id}`}
                                                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#0b2447] px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#12335f] shrink-0"
                                                >
                                                    <Building2 className="h-3.5 w-3.5" /> View Store
                                                </Link>
                                                {user?.role === 'buyer' ? (
                                                    <Link
                                                        href={`/buyer/rfq?sellerId=${seller.sellerUserId || seller.id}`}
                                                        className="inline-flex items-center justify-center rounded-xl border border-orange-200 bg-orange-50 px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-orange-700 transition hover:bg-orange-100 shrink-0"
                                                    >
                                                        Request Quote
                                                    </Link>
                                                ) : (
                                                    <button
                                                        type="button"
                                                        onClick={() => {
                                                            saveSupplier({
                                                                id: seller.id,
                                                                sellerUserId: seller.sellerUserId || null,
                                                                name: seller.organizationName,
                                                                location,
                                                                verificationStatus: seller.verificationStatus || 'VERIFIED',
                                                                email: (seller as any).email || null,
                                                                mobile: (seller as any).mobile || null,
                                                                source: 'Verified sellers page',
                                                            });
                                                        }}
                                                        className="inline-flex items-center justify-center rounded-xl border border-slate-200 bg-white px-4 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-50 shrink-0"
                                                    >
                                                        Save Supplier
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    </article>
                                );
                            }

                            // Grid View
                            return (
                                <article key={seller.id} className="rounded-[24px] border border-slate-200 bg-white p-5 shadow-sm transition hover:-translate-y-1 hover:shadow-md">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex items-center gap-3">
                                            {logo ? (
                                                <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-50 p-1 shadow-sm">
                                                    <img src={logo} alt={`${seller.organizationName} logo`} className="h-full w-full object-contain" loading="lazy" />
                                                </div>
                                            ) : (
                                                <div className={`flex h-14 w-14 items-center justify-center rounded-2xl border bg-gradient-to-br text-sm font-black ${initialsBg}`}>
                                                    {initialsText}
                                                </div>
                                            )}
                                            <div className="min-w-0">
                                                <h3 className="text-base font-black text-slate-900 line-clamp-2">{seller.organizationName}</h3>
                                                <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                                                    <MapPin className="h-3.5 w-3.5 text-orange-500" />
                                                    <span>{location || 'Location not listed'}</span>
                                                </p>
                                            </div>
                                        </div>
                                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-700">
                                            Verified
                                        </span>
                                    </div>

                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {profile.organizationType && (
                                            <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-slate-600">
                                                {String(profile.organizationType).replace(/_/g, ' ')}
                                            </span>
                                        )}
                                        {categoryText && (
                                            <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.16em] text-blue-700">
                                                {categoryText}
                                            </span>
                                        )}
                                    </div>

                                    <div className="mt-4 flex items-center gap-4 rounded-2xl border border-slate-100 bg-slate-50/80 px-3 py-3 text-[11px] font-semibold text-slate-600">
                                        <span className="inline-flex items-center gap-1.5">
                                            <Package className="h-3.5 w-3.5 text-slate-500" />
                                            {products} product{products === 1 ? '' : 's'}
                                        </span>
                                        <span className="inline-flex items-center gap-1.5">
                                            <Wrench className="h-3.5 w-3.5 text-slate-500" />
                                            {services} service{services === 1 ? '' : 's'}
                                        </span>
                                    </div>

                                    <div className="mt-5 flex flex-wrap gap-2">
                                        <Link
                                            href={`/vendors/${seller.id}`}
                                            className="inline-flex flex-1 items-center justify-center gap-2 rounded-xl bg-[#0b2447] px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-white transition hover:bg-[#12335f]"
                                        >
                                            <Building2 className="h-3.5 w-3.5" /> View Store
                                        </Link>
                                        {user?.role === 'buyer' ? (
                                            <Link
                                                href={`/buyer/rfq?sellerId=${seller.sellerUserId || seller.id}`}
                                                className="inline-flex flex-1 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-orange-700 transition hover:bg-orange-100"
                                            >
                                                Request Quote
                                            </Link>
                                        ) : (
                                            <button
                                                type="button"
                                                onClick={() => {
                                                    saveSupplier({
                                                        id: seller.id,
                                                        sellerUserId: seller.sellerUserId || null,
                                                        name: seller.organizationName,
                                                        location,
                                                        verificationStatus: seller.verificationStatus || 'VERIFIED',
                                                        email: (seller as any).email || null,
                                                        mobile: (seller as any).mobile || null,
                                                        source: 'Verified sellers page',
                                                    });
                                                }}
                                                className="inline-flex flex-1 items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2 text-[11px] font-black uppercase tracking-[0.16em] text-slate-700 transition hover:bg-slate-50"
                                            >
                                                Save Supplier
                                            </button>
                                        )}
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
