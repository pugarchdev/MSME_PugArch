'use client';
import React, { useMemo } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type MarketplaceHomeData, type MarketplaceSeller } from '../api';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import PremiumLoader from '../../../components/PremiumLoader';

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
import { CompareTray } from '../components/CompareTray';

type HomeBuyer = MarketplaceHomeData['largeIndustries'][number];
type HomeProductFallback = { products?: MarketplaceHomeData['featuredProducts'] };
type HomeSellerFallback = { sellers?: MarketplaceSeller[] };
type HomeBuyerFallback = { buyers?: HomeBuyer[] };

export default function MarketplaceHome() {
    const { user } = useAuth();

    const { data, isLoading: isHomeLoading } = useQuery<MarketplaceHomeData>({
        queryKey: ['marketplaceHome'],
        queryFn: marketplaceApi.getHomeData,
        placeholderData: (previous) => previous ?? api.peek('/api/marketplace/home') ?? undefined,
    });

    const { data: activeBannerData, isLoading: isBannerLoading } = useQuery({
        queryKey: ['activeHomeBanners'],
        queryFn: () => marketplaceApi.getActiveBanners('HOME_HERO'),
        staleTime: 60_000
    });

    const shouldFetchProductFallback = !isHomeLoading && (data?.featuredProducts?.length || 0) === 0;
    const { data: productFallbackData, isLoading: isProductFallbackLoading } = useQuery({
        queryKey: ['marketplaceHomeProductFallback'],
        queryFn: () => marketplaceApi.getProducts({ pageSize: 12, sort: 'latest' }),
        enabled: shouldFetchProductFallback,
        staleTime: 60_000
    });

    const visibleProducts = useMemo(() => {
        if (data?.featuredProducts?.length) return data.featuredProducts;
        return productFallbackData?.products || [];
    }, [data?.featuredProducts, productFallbackData]);

    const shouldFetchSellerFallback = !isHomeLoading && (data?.verifiedSellers?.length || 0) === 0;
    const { data: sellerFallbackData, isLoading: isSellerFallbackLoading } = useQuery<HomeSellerFallback>({
        queryKey: ['marketplaceHomeSellerFallback'],
        queryFn: () => marketplaceApi.getSellers({ pageSize: 16 }),
        enabled: shouldFetchSellerFallback,
        staleTime: 60_000
    });

    const shouldFetchBuyerFallback = !isHomeLoading && (data?.largeIndustries?.length || 0) === 0;
    const { data: buyerFallbackData, isLoading: isBuyerFallbackLoading } = useQuery<HomeBuyerFallback>({
        queryKey: ['marketplaceHomeBuyerFallback'],
        queryFn: () => marketplaceApi.getBuyers({ pageSize: 24 }),
        enabled: shouldFetchBuyerFallback,
        staleTime: 60_000
    });

    const homeSellers = useMemo(() => {
        const map = new Map<number, NonNullable<MarketplaceHomeData['verifiedSellers']>[number]>();
        [...(data?.verifiedSellers || []), ...(data?.bigMsmes || []), ...(sellerFallbackData?.sellers || [])].forEach(seller => map.set(seller.id, seller as any));
        return Array.from(map.values());
    }, [data?.verifiedSellers, data?.bigMsmes, sellerFallbackData?.sellers]);

    const homeBuyers = useMemo(() => {
        const map = new Map<number, HomeBuyer>();
        [...(data?.largeIndustries || []), ...(buyerFallbackData?.buyers || [])].forEach(buyer => map.set(buyer.id, buyer));
        (data?.featuredRequirements || []).forEach(requirement => {
            const buyer = requirement.buyerOrganization;
            if (buyer?.id) map.set(buyer.id, buyer as HomeBuyer);
        });
        return Array.from(map.values());
    }, [data?.largeIndustries, buyerFallbackData?.buyers, data?.featuredRequirements]);

    const isPreparingPage =
        (isHomeLoading && !data) ||
        (isBannerLoading && !activeBannerData) ||
        (shouldFetchProductFallback && isProductFallbackLoading && !productFallbackData) ||
        (shouldFetchSellerFallback && isSellerFallbackLoading && !sellerFallbackData) ||
        (shouldFetchBuyerFallback && isBuyerFallbackLoading && !buyerFallbackData);

    if (isPreparingPage) return <PremiumLoader />;

    return (
        <div className="flex min-h-dvh flex-col overflow-x-hidden bg-[#f1f3f6] text-slate-800">
            <div className="brand-tricolor-strip w-full" />
            <MarketplaceHeader user={user} />

            <main className="flex-1 overflow-x-hidden">
                {/* 1. Hero banner */}
                <HeroBanner banners={activeBannerData?.banners?.length ? activeBannerData.banners : (data?.banners || [])} />

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
                    products={visibleProducts}
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
                <BuyerRequirementBrowser buyers={homeBuyers} requirements={data?.featuredRequirements || []} />

                {/* 9. Latest bids & buyer requirements */}
                <LatestBids requirements={data?.featuredRequirements} tenders={data?.latestTenders} bids={data?.latestBids} loading={isHomeLoading && !data} />

                {/* 9. Verified seller strip */}
                <SellerStrip sellers={homeSellers} />

                {/* 10. Register CTA */}
                {/* <RegistrationCTA /> */}

                {/* 11. How it works */}
                {/* <HowItWorks /> */}

                {/* 12. Stats (animated counters) */}
                <StatsSection stats={data?.stats} />

                {/* 13. Notices / announcements */}
                <NoticeBoard notices={data?.notices || []} />
            </main>
            <CompareTray />

            <MarketplaceFooter />
        </div>
    );
}

// ─── Loading skeleton ─────────────────────────────────────────────────────────
