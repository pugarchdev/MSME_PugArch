'use client';
import React from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type MarketplaceHomeData } from '../api';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';

// ── Layout
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';

// ── Hero & discovery
import { HeroBanner } from '../components/HeroBanner';
import { SearchSection } from '../components/SearchSection';
import { CategoryRail } from '../components/CategoryRail';
import { TrustBanner } from '../components/TrustBanner';

// ── Marketplace rows
import { ProductRow } from '../components/ProductRow';
import { ServiceRow } from '../components/ServiceRow';

// ── Ecosystem & bids
import { IndustryNetwork } from '../components/IndustryNetwork';
import { LatestBids } from '../components/LatestBids';
import { BuyerRequirementBrowser } from '../components/BuyerRequirementBrowser';

// ── Sellers
import { SellerStrip } from '../components/SellerStrip';

// ── CTA & process
import { RegistrationCTA } from '../components/RegistrationCTA';
import { HowItWorks } from '../components/HowItWorks';

// ── Misc
import { StatsSection } from '../components/StatsSection';
import { NoticeBoard } from '../components/NoticeBoard';

export default function MarketplaceHome() {
    const { user } = useAuth();

    const { data, isLoading } = useQuery<MarketplaceHomeData>({
        queryKey: ['marketplaceHome'],
        queryFn: marketplaceApi.getHomeData,
        placeholderData: (previous) => previous ?? api.peek('/api/marketplace/home') ?? undefined,
    });

    if (isLoading && !data) return <MarketplaceLoadingSkeleton />;

    return (
        <div className="min-h-dvh bg-[#f1f3f6] text-slate-800 flex flex-col">
            <div className="brand-tricolor-strip w-full" />
            <MarketplaceHeader user={user} />

            <main className="flex-1">
                {/* 1. Hero banner */}
                <HeroBanner banners={data?.banners || []} />

                {/* 2. Mobile search */}
                <SearchSection categories={data?.categories || []} />

                {/* 3. Category rail */}
                <CategoryRail categories={data?.categories || []} />

                {/* 4. Trust badges */}
                <TrustBanner />

                {/* 5. Featured products horizontal row */}
                <ProductRow
                    title="Featured Products"
                    subtitle="Quality products from verified MSME sellers"
                    products={data?.featuredProducts || []}
                    viewAllHref="/marketplace/products"
                />

                {/* 6. Featured services horizontal row */}
                <ServiceRow
                    title="Featured Services"
                    subtitle="Professional services from verified providers"
                    services={data?.featuredServices || []}
                    viewAllHref="/marketplace/services"
                />

                {/* 7. Industry & supplier network */}
                {/* <IndustryNetwork /> */}

                {/* 8. Buyer-wise requirement browser */}
                <BuyerRequirementBrowser buyers={data?.largeIndustries || []} requirements={data?.featuredRequirements || []} />

                {/* 9. Latest bids & buyer requirements */}
                <LatestBids requirements={data?.featuredRequirements} tenders={data?.latestTenders} bids={data?.latestBids} loading={isLoading && !data} />

                {/* 9. Verified seller strip */}
                <SellerStrip sellers={data?.verifiedSellers || []} />

                {/* 10. Register CTA */}
                {/* <RegistrationCTA /> */}

                {/* 11. How it works */}
                {/* <HowItWorks /> */}

                {/* 12. Stats (animated counters) */}
                <StatsSection stats={data?.stats} />

                {/* 13. Notices / announcements */}
                <NoticeBoard notices={data?.notices || []} />
            </main>

            <MarketplaceFooter />
        </div>
    );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
function MarketplaceLoadingSkeleton() {
    return (
        <div className="min-h-dvh bg-[#f1f3f6]">
            <div className="brand-tricolor-strip w-full" />
            {/* Utility bar */}
            <div className="h-9 bg-[#0b2447]" />
            {/* Navbar */}
            <div className="h-16 bg-white border-b border-slate-200" />
            {/* Hero */}
            <div className="h-72 sm:h-96 bg-slate-300 animate-pulse" />
            {/* Category rail */}
            <div className="bg-white border-b border-slate-100 py-4 px-4">
                <div className="max-w-7xl mx-auto flex gap-4 overflow-hidden">
                    {Array.from({ length: 10 }).map((_, i) => (
                        <div key={i} className="shrink-0 w-[90px] h-24 bg-slate-100 rounded-xl animate-pulse" />
                    ))}
                </div>
            </div>
            {/* Trust bar */}
            <div className="bg-white h-14 border-b border-slate-100 animate-pulse" />
            {/* Product row */}
            <div className="bg-white mt-2 border-b border-slate-100 p-4">
                <div className="max-w-7xl mx-auto">
                    <div className="h-4 w-40 bg-slate-200 rounded mb-4 animate-pulse" />
                    <div className="flex gap-0 overflow-hidden">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <div key={i} className="shrink-0 w-44 h-56 bg-slate-100 border-r border-slate-50 animate-pulse" />
                        ))}
                    </div>
                </div>
            </div>
            {/* Service row */}
            <div className="bg-white mt-2 border-b border-slate-100 p-4">
                <div className="max-w-7xl mx-auto">
                    <div className="h-4 w-40 bg-slate-200 rounded mb-4 animate-pulse" />
                    <div className="flex gap-0 overflow-hidden">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <div key={i} className="shrink-0 w-52 h-44 bg-slate-100 border-r border-slate-50 animate-pulse" />
                        ))}
                    </div>
                </div>
            </div>
            {/* Bids */}
            <div className="bg-[#f8fafc] mt-2 p-4">
                <div className="max-w-7xl mx-auto">
                    <div className="h-4 w-52 bg-slate-200 rounded mb-4 animate-pulse" />
                    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                        {Array.from({ length: 3 }).map((_, i) => (
                            <div key={i} className="h-44 bg-white rounded-xl border border-slate-200 animate-pulse" />
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
