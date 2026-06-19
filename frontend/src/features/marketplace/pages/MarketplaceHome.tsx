'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    MapPin,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../../../hooks/useAuth';
import { api } from '../../../lib/api';
import PremiumLoader from '../../../components/PremiumLoader';
import {
    marketplaceApi,
    type MarketplaceHomeData,
    type MarketplaceLayoutSection,
    type MarketplaceProduct,
    type MarketplaceSeller,
    type MarketplaceService,
} from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { HeroBanner } from '../components/HeroBanner';
import { SearchSection } from '../components/SearchSection';
import { TrustBanner } from '../components/TrustBanner';
import { CategoryCatalogueStrip } from '../components/CategoryCatalogueStrip';
import { MarketplaceSectionCarousel } from '../components/MarketplaceSectionCarousel';
import type { MarketplaceDiscoveryItem } from '../components/MarketplaceItemCard';
import { BuyerRequirementBrowser } from '../components/BuyerRequirementBrowser';
import { LatestBids } from '../components/LatestBids';
import { SellerStrip } from '../components/SellerStrip';
import { StatsSection } from '../components/StatsSection';
import { NoticeBoard } from '../components/NoticeBoard';
import { CompareTray } from '../components/CompareTray';

type HomeBuyer = MarketplaceHomeData['largeIndustries'][number];
type HomeSellerFallback = { sellers?: MarketplaceSeller[] };
type HomeBuyerFallback = { buyers?: HomeBuyer[] };

const CATEGORY_KEYWORDS = {
    industrial: ['safety', 'electrical', 'mechanical', 'machinery', 'tools', 'construction', 'fabrication', 'industrial'],
    local: ['jharsuguda', 'odisha'],
    hershg: ['hershg', 'shg', 'women', 'self help'],
};

const hasActiveDiscount = (item: MarketplaceDiscoveryItem) => {
    const original = Number((item as any).originalPrice || 0);
    const discountPrice = Number((item as any).discountPrice || 0);
    return (item as any).isOfferActive !== false && original > 0 && discountPrice > 0 && discountPrice < original;
};

const byCategory = <T extends MarketplaceProduct | MarketplaceService>(items: T[], categoryId: string) => {
    if (!categoryId) return items;
    return items.filter((item: any) => String(item.category?.id || item.categoryId || '') === categoryId);
};

const uniqueItems = <T extends MarketplaceDiscoveryItem>(items: T[]) => {
    const seen = new Set<string>();
    return items.filter((item: any) => {
        const key = `${item.itemType || (item.pricingModel ? 'SERVICE' : 'PRODUCT')}:${item.id}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
    });
};

export default function MarketplaceHome() {
    const { user } = useAuth();
    const router = useRouter();
    const searchParams = useSearchParams();
    const [activeCategoryId, setActiveCategoryId] = useState(searchParams?.get('categoryId') || '');

    const { data, isLoading: isHomeLoading } = useQuery<MarketplaceHomeData>({
        queryKey: ['marketplaceHome'],
        queryFn: marketplaceApi.getHomeData,
        placeholderData: (previous) => previous ?? api.peek('/api/marketplace/home') ?? undefined,
    });

    const { data: activeBannerData, isLoading: isBannerLoading } = useQuery({
        queryKey: ['activeHomeBanners'],
        queryFn: () => marketplaceApi.getActiveBanners('HOME_HERO'),
        staleTime: 60_000,
    });

    const { data: homeLayoutData } = useQuery({
        queryKey: ['marketplaceHomeLayout', activeCategoryId],
        queryFn: () => marketplaceApi.getHomeLayout(activeCategoryId ? { categoryId: activeCategoryId } : {}),
        staleTime: 60_000,
        retry: 1,
    });

    const shouldFetchProductFallback = !isHomeLoading && (data?.featuredProducts?.length || 0) === 0;
    const { data: productFallbackData, isLoading: isProductFallbackLoading } = useQuery({
        queryKey: ['marketplaceHomeProductFallback'],
        queryFn: () => marketplaceApi.getProducts({ pageSize: 12, sort: 'latest' }),
        enabled: shouldFetchProductFallback,
        staleTime: 60_000,
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
        staleTime: 60_000,
    });

    const shouldFetchBuyerFallback = !isHomeLoading && (data?.largeIndustries?.length || 0) === 0;
    const { data: buyerFallbackData, isLoading: isBuyerFallbackLoading } = useQuery<HomeBuyerFallback>({
        queryKey: ['marketplaceHomeBuyerFallback'],
        queryFn: () => marketplaceApi.getBuyers({ pageSize: 24 }),
        enabled: shouldFetchBuyerFallback,
        staleTime: 60_000,
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

    const categories = homeLayoutData?.categories?.length ? homeLayoutData.categories : data?.categories || [];
    const layoutSections = homeLayoutData?.sections || [];
    const itemLayoutSections = layoutSections.filter((section: MarketplaceLayoutSection) =>
        section.items?.some((item: any) => item?.itemType === 'PRODUCT' || item?.itemType === 'SERVICE')
    );
    const activeCategory = categories.find(category => String(category.id) === activeCategoryId);
    const filteredProducts = byCategory(visibleProducts, activeCategoryId);
    const filteredServices = byCategory(data?.featuredServices || [], activeCategoryId);
    const discoveryItems = uniqueItems<MarketplaceDiscoveryItem>([
        ...filteredProducts.map(item => ({ ...item, itemType: 'PRODUCT' as const })),
        ...filteredServices.map(item => ({ ...item, itemType: 'SERVICE' as const })),
    ]);

    const productsByProcurementFit = [...filteredProducts].sort((a: any, b: any) => {
        const aScore = Number(a.totalOrders || a.orderCount || 0) + (a.organization?.verificationStatus === 'VERIFIED' ? 2 : 0);
        const bScore = Number(b.totalOrders || b.orderCount || 0) + (b.organization?.verificationStatus === 'VERIFIED' ? 2 : 0);
        return bScore - aScore;
    });
    const mostPurchased = filteredProducts
        .filter((item: any) => Number(item.totalOrders || item.orderCount || 0) > 0)
        .sort((a: any, b: any) => Number(b.totalOrders || b.orderCount || 0) - Number(a.totalOrders || a.orderCount || 0));
    const discountedItems = discoveryItems.filter(hasActiveDiscount);
    const localProducts = filteredProducts.filter((item: any) => {
        const text = [item.organization?.district, item.organization?.state, item.district, item.location].filter(Boolean).join(' ').toLowerCase();
        return CATEGORY_KEYWORDS.local.some(keyword => text.includes(keyword));
    });
    const herShgItems = discoveryItems.filter((item: any) => {
        const text = [
            item.organization?.organizationType,
            item.organization?.profile?.groupType,
            item.organization?.profile?.category,
            item.sellerType,
            item.category?.name,
        ].filter(Boolean).join(' ').toLowerCase();
        return CATEGORY_KEYWORDS.hershg.some(keyword => text.includes(keyword));
    });
    const industrialEssentials = filteredProducts.filter((item: any) => {
        const text = [item.category?.name, item.name, item.description].filter(Boolean).join(' ').toLowerCase();
        return CATEGORY_KEYWORDS.industrial.some(keyword => text.includes(keyword));
    });

    return (
        <div className="flex min-h-dvh flex-col overflow-x-hidden bg-[#f1f3f6] text-slate-800">
            <div className="brand-tricolor-strip w-full" />
            <MarketplaceHeader user={user} />

            <main className="flex-1 overflow-x-hidden">
                <HeroBanner banners={activeBannerData?.banners?.length ? activeBannerData.banners : (data?.banners || [])} />
                <div className="hidden md:block">
                    <SearchSection categories={categories} />
                </div>

                <CategoryCatalogueStrip
                    categories={categories}
                    selectedCategoryId={activeCategoryId}
                    onSelect={(category) => {
                        const next = String(category.id);
                        const selected = activeCategoryId === next ? '' : next;
                        setActiveCategoryId(selected);
                        router.replace(selected ? `/?categoryId=${selected}` : '/', { scroll: false });
                    }}
                    title="Official category catalogue"
                    subtitle="Select a work category to focus products, services, sellers, and buyer actions"
                    className="md:hidden"
                />

                {activeCategory && (
                    <div className="border-b border-blue-100 bg-blue-50/70">
                        <div className="mx-auto flex max-w-[1680px] flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6 2xl:px-8">
                            <p className="text-xs font-bold text-[#0b2447]">
                                Showing marketplace discovery for {activeCategory.name}
                            </p>
                            <div className="flex flex-wrap gap-2">
                                <Link href={`/marketplace/products?categoryId=${activeCategory.id}`} className="inline-flex h-8 items-center rounded-md bg-[#0b2447] px-3 text-[11px] font-black text-white transition hover:bg-[#12335f]">
                                    Browse products
                                </Link>
                                <Link href={`/marketplace/services?categoryId=${activeCategory.id}`} className="inline-flex h-8 items-center rounded-md border border-[#0b2447]/20 bg-white px-3 text-[11px] font-black text-[#0b2447] transition hover:bg-slate-50">
                                    Browse services
                                </Link>
                                <button type="button" onClick={() => { setActiveCategoryId(''); router.replace('/', { scroll: false }); }} className="inline-flex h-8 items-center rounded-md border border-slate-200 bg-white px-3 text-[11px] font-black text-slate-600 transition hover:bg-slate-50">
                                    Clear category
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <TrustBanner />

                {itemLayoutSections.length > 0 ? (
                    <>
                        {itemLayoutSections.map(section => (
                            <MarketplaceSectionCarousel
                                key={section.key}
                                sectionKey={section.key}
                                title={section.title}
                                subtitle={section.subtitle}
                                items={section.items as MarketplaceDiscoveryItem[]}
                                emptyState={`No listings available for ${section.title}.`}
                                viewAllUrl={section.key === 'services' ? '/marketplace/services' : section.key === 'most_purchased' ? '/marketplace/products?sort=most_purchased' : '/marketplace/products'}
                                showAddToCart={section.key !== 'services'}
                                showRequestQuote={section.key !== 'most_purchased'}
                            />
                        ))}
                        <MarketplacePromoTiles
                            hasDiscounts={Boolean(layoutSections.find(section => section.key === 'discounted_products')?.items?.length)}
                            hasLocal={Boolean(layoutSections.find(section => section.key === 'local_msme')?.items?.length)}
                            hasHerShg={Boolean(layoutSections.find(section => section.key === 'hershg_products')?.items?.length)}
                        />
                    </>
                ) : (
                    <>
                        <MarketplaceSectionCarousel
                            sectionKey="popular-picks"
                            title="Popular Picks"
                            subtitle="Verified marketplace listings arranged for fast procurement browsing"
                            items={productsByProcurementFit.slice(0, 12).map(item => ({ ...item, itemType: 'PRODUCT' as const }))}
                            loading={isHomeLoading && !data}
                            emptyState="No active marketplace products are available for this category yet."
                            viewAllUrl={activeCategoryId ? `/marketplace/products?categoryId=${activeCategoryId}` : '/marketplace/products'}
                        />

                        <MarketplaceSectionCarousel
                            sectionKey="most-purchased"
                            title="Mostly Purchased Items"
                            subtitle="Shown only when completed procurement history is available"
                            items={mostPurchased.slice(0, 12).map(item => ({ ...item, itemType: 'PRODUCT' as const }))}
                            emptyState="Settled purchase history is not available yet, so no artificial most-purchased items are shown."
                            viewAllUrl={activeCategoryId ? `/marketplace/products?categoryId=${activeCategoryId}&sort=most_purchased` : '/marketplace/products?sort=most_purchased'}
                            showRequestQuote={false}
                        />

                        <MarketplacePromoTiles hasDiscounts={discountedItems.length > 0} hasLocal={localProducts.length > 0} hasHerShg={herShgItems.length > 0} />

                        <MarketplaceSectionCarousel
                            sectionKey="discounted-products"
                            title="Discounted Products and Offers"
                            subtitle="Real offers only; no placeholder discounts are generated"
                            items={discountedItems.slice(0, 12)}
                            emptyState="No active discount offers are published right now."
                            viewAllUrl="/marketplace/products?discount=active"
                        />

                        <MarketplaceSectionCarousel
                            sectionKey="local-msme-products"
                            title="Local MSME Products"
                            subtitle="Prioritised listings from Jharsuguda and Odisha sellers where available"
                            items={localProducts.slice(0, 12).map(item => ({ ...item, itemType: 'PRODUCT' as const }))}
                            viewAllUrl={activeCategoryId ? `/marketplace/products?categoryId=${activeCategoryId}&district=Jharsuguda` : '/marketplace/products?district=Jharsuguda'}
                        />

                        <MarketplaceSectionCarousel
                            sectionKey="hershg-products"
                            title="HerSHG and Women SHG Products"
                            subtitle="Listings are shown when seller metadata identifies HerSHG or women SHG participation"
                            items={herShgItems.slice(0, 12)}
                            emptyState="HerSHG listings will appear here once verified seller metadata is available."
                            viewAllUrl="/marketplace/products?tag=hershg"
                        />

                        <MarketplaceSectionCarousel
                            sectionKey="industrial-essentials"
                            title="Industrial Essentials"
                            subtitle="Safety, electrical, mechanical, machinery, tools, and construction supplies"
                            items={industrialEssentials.slice(0, 12).map(item => ({ ...item, itemType: 'PRODUCT' as const }))}
                            viewAllUrl={activeCategoryId ? `/marketplace/products?categoryId=${activeCategoryId}` : '/marketplace/products'}
                        />

                        <MarketplaceSectionCarousel
                            sectionKey="services-marketplace"
                            title="Services You May Need"
                            subtitle="Professional services from verified providers for buyer requirements and operations"
                            items={filteredServices.slice(0, 12).map(item => ({ ...item, itemType: 'SERVICE' as const }))}
                            emptyState="No services are listed in this category yet."
                            viewAllUrl={activeCategoryId ? `/marketplace/services?categoryId=${activeCategoryId}` : '/marketplace/services'}
                            showAddToCart={false}
                        />
                    </>
                )}

                <BuyerRequirementBrowser buyers={homeBuyers} requirements={data?.featuredRequirements || []} />
                <LatestBids requirements={data?.featuredRequirements} tenders={data?.latestTenders} bids={data?.latestBids} loading={isHomeLoading && !data} />
                <SellerStrip sellers={homeSellers} />
                <StatsSection stats={data?.stats} />
                <NoticeBoard notices={data?.notices || []} />
            </main>

            <CompareTray />
            <MarketplaceFooter />
        </div>
    );
}

function MarketplacePromoTiles({ hasDiscounts, hasLocal, hasHerShg }: { hasDiscounts: boolean; hasLocal: boolean; hasHerShg: boolean }) {
    const tiles = [
        {
            href: hasDiscounts ? '/marketplace/products?discount=active' : '/marketplace/products',
            icon: Sparkles,
            title: 'Rate contracts and offers',
            detail: hasDiscounts ? 'Active offers published by sellers' : 'Offers appear only after verified data is available',
            tone: 'border-orange-100 bg-orange-50 text-[#9a4f12]',
        },
        {
            href: hasLocal ? '/marketplace/products?district=Jharsuguda' : '/marketplace/sellers',
            icon: MapPin,
            title: 'Local MSME sourcing',
            detail: 'Prioritise district and Odisha suppliers',
            tone: 'border-blue-100 bg-blue-50 text-[#0b2447]',
        },
        {
            href: hasHerShg ? '/marketplace/products?tag=hershg' : '/hershg/register',
            icon: ShieldCheck,
            title: 'HerSHG procurement',
            detail: 'Women SHG listings when metadata is present',
            tone: 'border-emerald-100 bg-emerald-50 text-emerald-800',
        },
    ];

    return (
        <section className="border-b border-slate-100 bg-white">
            <div className="mx-auto grid max-w-[1680px] gap-3 px-4 py-4 sm:grid-cols-3 sm:px-6 2xl:px-8">
                {tiles.map(tile => {
                    const Icon = tile.icon;
                    return (
                        <Link key={tile.title} href={tile.href} className={`flex min-h-[92px] items-center gap-3 rounded-lg border p-4 transition hover:-translate-y-0.5 hover:shadow-sm ${tile.tone}`}>
                            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-white/80">
                                <Icon className="h-5 w-5" />
                            </span>
                            <span className="min-w-0">
                                <span className="block text-xs font-black">{tile.title}</span>
                                <span className="mt-1 block text-[11px] font-semibold opacity-80">{tile.detail}</span>
                            </span>
                        </Link>
                    );
                })}
            </div>
        </section>
    );
}
