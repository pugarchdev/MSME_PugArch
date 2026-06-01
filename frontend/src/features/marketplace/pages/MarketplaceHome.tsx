'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type MarketplaceHomeData } from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { HeroBanner } from '../components/HeroBanner';
import { SearchSection } from '../components/SearchSection';
import { CategorySection } from '../components/CategorySection';
import { FeaturedProducts } from '../components/FeaturedProducts';
import { FeaturedServices } from '../components/FeaturedServices';
import { VerifiedSellers } from '../components/VerifiedSellers';
import { BuyerInfoSection } from '../components/BuyerInfoSection';
import { SellerInfoSection } from '../components/SellerInfoSection';
import { HowItWorks } from '../components/HowItWorks';
import { StatsSection } from '../components/StatsSection';
import { NoticeBoard } from '../components/NoticeBoard';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { BuyerRequirementsSection } from '../components/BuyerRequirementsSection';
import { OrganizationShowcase } from '../components/OrganizationShowcase';

export default function MarketplaceHome() {
    const { user } = useAuth();
    const [data, setData] = useState<MarketplaceHomeData | null>(null);
    const [loading, setLoading] = useState(true);

    const loadData = useCallback(async () => {
        try {
            const result = await marketplaceApi.getHomeData();
            setData(result);
        } catch (err) {
            console.error('Failed to load marketplace data:', err);
            // Set fallback empty data
            setData({
                banners: [],
                categories: [],
                featuredProducts: [],
                featuredServices: [],
                featuredRequirements: [],
                verifiedSellers: [],
                largeIndustries: [],
                bigMsmes: [],
                notices: [],
                stats: { verifiedSellers: 0, registeredBuyers: 0, productsListed: 0, servicesListed: 0, categories: 0 }
            });
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    if (loading) {
        return <MarketplaceLoadingSkeleton />;
    }

    return (
        <div className="min-h-dvh bg-white text-slate-800 flex flex-col">
            {/* Tricolor Strip */}
            <div className="brand-tricolor-strip w-full" />

            {/* Header */}
            <MarketplaceHeader user={user} />

            {/* Main Content */}
            <main className="flex-1">
                {/* Hero Banner */}
                <HeroBanner banners={data?.banners || []} />

                {/* Search & Quick Filters */}
                <SearchSection categories={data?.categories || []} />

                {/* Categories */}
                <CategorySection categories={data?.categories || []} />

                {/* Featured Products */}
                <FeaturedProducts products={data?.featuredProducts || []} />

                {/* Featured Services */}
                <FeaturedServices services={data?.featuredServices || []} />

                <BuyerRequirementsSection requirements={data?.featuredRequirements || []} />

                {/* Verified Sellers */}
                <VerifiedSellers sellers={data?.verifiedSellers || []} />

                <OrganizationShowcase largeIndustries={data?.largeIndustries || []} bigMsmes={data?.bigMsmes || []} />

                {/* Buyer Info */}
                <BuyerInfoSection />

                {/* Seller Info */}
                <SellerInfoSection />

                {/* How It Works */}
                <HowItWorks />

                {/* Statistics */}
                <StatsSection stats={data?.stats} />

                {/* Notices */}
                <NoticeBoard notices={data?.notices || []} />
            </main>

            {/* Footer */}
            <MarketplaceFooter />
        </div>
    );
}

function MarketplaceLoadingSkeleton() {
    return (
        <div className="min-h-dvh bg-white">
            <div className="brand-tricolor-strip w-full" />
            <div className="h-12 bg-slate-50 border-b border-slate-200" />
            <div className="h-16 bg-white border-b border-slate-200" />
            <div className="h-72 bg-slate-100 animate-pulse" />
            <div className="max-w-7xl mx-auto px-4 py-8 space-y-8">
                <div className="h-16 bg-slate-100 rounded-lg animate-pulse" />
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4, 5, 6, 7, 8].map(i => (
                        <div key={i} className="h-28 bg-slate-100 rounded-lg animate-pulse" />
                    ))}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {[1, 2, 3, 4].map(i => (
                        <div key={i} className="h-64 bg-slate-100 rounded-lg animate-pulse" />
                    ))}
                </div>
            </div>
        </div>
    );
}
