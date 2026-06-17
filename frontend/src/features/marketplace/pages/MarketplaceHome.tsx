'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    MapPin,
    ShieldCheck,
    Sparkles,
    ArrowRight,
    Tag,
    Store,
    FileSearch,
    PlusCircle,
    ClipboardList,
    TrendingUp,
    X,
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
import { HowItWorks } from '../components/HowItWorks';

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

// ─── Quick-action ribbon for authenticated users ──────────────────────────────
function QuickActionsRibbon({ role }: { role?: string }) {
    const isSeller = role === 'SELLER' || role === 'VENDOR';
    const actions = isSeller
        ? [
            { icon: PlusCircle, label: 'Add Product', href: '/seller/products/new', color: 'text-blue-700 bg-blue-50 border-blue-200' },
            { icon: Store, label: 'My Store', href: '/seller/products', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
            { icon: ClipboardList, label: 'My Orders', href: '/seller/orders', color: 'text-violet-700 bg-violet-50 border-violet-200' },
            { icon: TrendingUp, label: 'Dashboard', href: '/seller/dashboard', color: 'text-amber-700 bg-amber-50 border-amber-200' },
        ]
        : [
            { icon: FileSearch, label: 'Browse Products', href: '/marketplace/products', color: 'text-blue-700 bg-blue-50 border-blue-200' },
            { icon: Tag, label: 'Active Offers', href: '/marketplace/products?discount=active', color: 'text-orange-700 bg-orange-50 border-orange-200' },
            { icon: ClipboardList, label: 'My Bids', href: '/my-bids', color: 'text-violet-700 bg-violet-50 border-violet-200' },
            { icon: Store, label: 'Find Sellers', href: '/marketplace/sellers', color: 'text-emerald-700 bg-emerald-50 border-emerald-200' },
        ];

    return (
        <div className="border-b border-slate-100 bg-gradient-to-r from-slate-50 via-white to-slate-50">
            <div className="mx-auto flex max-w-[1680px] items-center gap-2 overflow-x-auto px-4 py-2.5 no-scrollbar sm:px-6 2xl:px-8">
                <span className="shrink-0 text-[9px] font-black uppercase tracking-widest text-slate-400 mr-1">Quick Actions</span>
                <div className="flex gap-2">
                    {actions.map(action => {
                        const Icon = action.icon;
                        return (
                            <Link
                                key={action.label}
                                href={action.href}
                                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-bold transition hover:shadow-sm active:scale-95 ${action.color}`}
                            >
                                <Icon className="h-3 w-3" />
                                {action.label}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
