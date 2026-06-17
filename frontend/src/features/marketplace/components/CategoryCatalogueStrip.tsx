'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import {
    Armchair,
    BadgeIndianRupee,
    Boxes,
    ChevronLeft,
    ChevronRight,
    Cog,
    Factory,
    FlaskConical,
    Hammer,
    HardHat,
    Monitor,
    Package,
    Printer,
    Shield,
    Truck,
    Users,
    UtensilsCrossed,
    Wrench,
    Zap,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import { marketplaceApi, type MarketplaceCategory } from '../api';

const iconRules: [string, React.ReactNode, string][] = [
    ['electrical', <Zap className="h-5 w-5" />, 'bg-gradient-to-br from-amber-50 to-amber-100/50 text-amber-600 border-amber-200/60 shadow-inner'],
    ['machinery', <Cog className="h-5 w-5" />, 'bg-gradient-to-br from-blue-50 to-blue-100/50 text-blue-600 border-blue-200/60 shadow-inner'],
    ['mechanical', <Factory className="h-5 w-5" />, 'bg-gradient-to-br from-slate-50 to-slate-100/50 text-slate-600 border-slate-200/60 shadow-inner'],
    ['safety', <Shield className="h-5 w-5" />, 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 text-emerald-600 border-emerald-200/60 shadow-inner'],
    ['construction', <Hammer className="h-5 w-5" />, 'bg-gradient-to-br from-stone-50 to-stone-100/50 text-stone-600 border-stone-200/60 shadow-inner'],
    ['office', <Printer className="h-5 w-5" />, 'bg-gradient-to-br from-sky-50 to-sky-100/50 text-sky-600 border-sky-200/60 shadow-inner'],
    ['it ', <Monitor className="h-5 w-5" />, 'bg-gradient-to-br from-indigo-50 to-indigo-100/50 text-indigo-600 border-indigo-200/60 shadow-inner'],
    ['computer', <Monitor className="h-5 w-5" />, 'bg-gradient-to-br from-indigo-50 to-indigo-100/50 text-indigo-600 border-indigo-200/60 shadow-inner'],
    ['furniture', <Armchair className="h-5 w-5" />, 'bg-gradient-to-br from-rose-50 to-rose-100/50 text-rose-600 border-rose-200/60 shadow-inner'],
    ['packaging', <Boxes className="h-5 w-5" />, 'bg-gradient-to-br from-violet-50 to-violet-100/50 text-violet-600 border-violet-200/60 shadow-inner'],
    ['chemical', <FlaskConical className="h-5 w-5" />, 'bg-gradient-to-br from-teal-50 to-teal-100/50 text-teal-600 border-teal-200/60 shadow-inner'],
    ['logistics', <Truck className="h-5 w-5" />, 'bg-gradient-to-br from-green-50 to-green-100/50 text-green-600 border-green-200/60 shadow-inner'],
    ['transport', <Truck className="h-5 w-5" />, 'bg-gradient-to-br from-green-50 to-green-100/50 text-green-600 border-green-200/60 shadow-inner'],
    ['fabrication', <HardHat className="h-5 w-5" />, 'bg-gradient-to-br from-orange-50 to-orange-100/50 text-orange-600 border-orange-200/60 shadow-inner'],
    ['maintenance', <Wrench className="h-5 w-5" />, 'bg-gradient-to-br from-cyan-50 to-cyan-100/50 text-cyan-600 border-cyan-200/60 shadow-inner'],
    ['textile', <Package className="h-5 w-5" />, 'bg-gradient-to-br from-pink-50 to-pink-100/50 text-pink-600 border-pink-200/60 shadow-inner'],
    ['food', <UtensilsCrossed className="h-5 w-5" />, 'bg-gradient-to-br from-lime-50 to-lime-100/50 text-lime-600 border-lime-200/60 shadow-inner'],
    ['shg', <Users className="h-5 w-5" />, 'bg-gradient-to-br from-emerald-50 to-emerald-100/50 text-emerald-600 border-emerald-200/60 shadow-inner'],
    ['local', <BadgeIndianRupee className="h-5 w-5" />, 'bg-gradient-to-br from-orange-50 to-orange-100/50 text-orange-600 border-orange-200/60 shadow-inner'],
];

function iconFor(categoryName: string) {
    const lower = ` ${categoryName.toLowerCase()} `;
    const match = iconRules.find(([key]) => lower.includes(key));
    return match ? [match[1], match[2]] as const : [<Package className="h-5 w-5" />, 'bg-gradient-to-br from-slate-50 to-slate-100/50 text-slate-600 border-slate-200/60 shadow-inner'] as const;
}

function categoryCount(category: MarketplaceCategory) {
    const productCount = category.productCount ?? category._count?.products ?? 0;
    const serviceCount = category.serviceCount ?? category._count?.services ?? 0;
    const count = productCount + serviceCount;
    if (!count) return '';
    if (productCount && serviceCount) return `${count} listings`;
    return productCount ? `${productCount} products` : `${serviceCount} services`;
}

interface CategoryCatalogueStripProps {
    categories: MarketplaceCategory[];
    selectedCategoryId?: string | number | null;
    onSelect?: (category: MarketplaceCategory) => void;
    title?: string;
    subtitle?: string;
    className?: string;
}

export function CategoryCatalogueStrip({
    categories,
    selectedCategoryId,
    onSelect,
    title = 'Browse by procurement category',
    subtitle = 'Find verified MSME products and services by work area',
    className,
}: CategoryCatalogueStripProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    if (!categories.length) return null;

    const scroll = (direction: 'left' | 'right') => {
        scrollRef.current?.scrollBy({ left: direction === 'left' ? -360 : 360, behavior: 'smooth' });
    };

    const trackCategory = (category: MarketplaceCategory) => {
        marketplaceApi.trackInteraction({
            categoryId: category.id,
            action: 'CATEGORY_CLICK',
            metadata: { categoryName: category.name, source: 'category-strip' },
        }).catch(() => undefined);
    };

    return (
        <section className={cn('border-y border-slate-100 bg-white/50 backdrop-blur-md', className)} id="categories">
            <div className="mx-auto max-w-[1680px] px-4 py-5 sm:px-6 2xl:px-8">
                {/* <div className="mb-4 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-sm font-extrabold tracking-tight text-[#0b2447] sm:text-base">{title}</h2>
                        <p className="mt-0.5 text-[11px] font-semibold text-slate-500/95">{subtitle}</p>
                    </div>
                    <Link href="/marketplace/products" className="shrink-0 text-[11px] font-black text-[#0b2447] transition hover:text-brand-amber hover:underline">
                        All categories
                    </Link>
                </div> */}

                <div className="relative group/strip">
                    <button
                        type="button"
                        onClick={() => scroll('left')}
                        className="absolute -left-2 lg:-left-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/70 bg-white/90 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-[#0b2447] hover:text-white hover:border-[#0b2447] hover:shadow-lg active:scale-95 lg:flex text-slate-600"
                        aria-label="Scroll categories left"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>

                    <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-2 pt-1 no-scrollbar lg:px-4">
                        {categories.map((category) => {
                            const selected = String(selectedCategoryId || '') === String(category.id);
                            const [icon, iconClassName] = iconFor(category.name);
                            const content = (
                                <>
                                    <span className={cn('flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border transition-all duration-300 group-hover:scale-110 group-hover:rotate-3', iconClassName)}>
                                        {icon}
                                    </span>
                                    <span className="min-w-0 flex-1">
                                        <span className="block line-clamp-2 text-[11px] font-extrabold leading-snug text-slate-800 transition-colors duration-200 group-hover:text-[#0b2447]">
                                            {category.name}
                                        </span>
                                        {categoryCount(category) && (
                                            <span className={cn(
                                                "mt-1.5 inline-block rounded-full px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wider transition-colors duration-300",
                                                selected
                                                    ? "bg-[#0b2447]/10 text-[#0b2447]"
                                                    : "bg-slate-100 text-slate-500 group-hover:bg-blue-50 group-hover:text-blue-600"
                                            )}>
                                                {categoryCount(category)}
                                            </span>
                                        )}
                                    </span>
                                </>
                            );

                            const cardClassName = cn(
                                'group flex h-[78px] w-[190px] shrink-0 items-center gap-3.5 rounded-2xl border px-3.5 text-left transition-all duration-300 ease-out',
                                selected
                                    ? 'border-[#0b2447] bg-gradient-to-r from-blue-50/70 to-white/95 shadow-md ring-2 ring-[#0b2447]/15'
                                    : 'border-slate-200/60 bg-white/80 backdrop-blur-md shadow-sm hover:-translate-y-1 hover:scale-[1.02] hover:border-[#0b2447]/30 hover:bg-white hover:shadow-md'
                            );

                            if (onSelect) {
                                return (
                                    <button
                                        key={category.id}
                                        type="button"
                                        aria-pressed={selected}
                                        onClick={() => {
                                            trackCategory(category);
                                            onSelect(category);
                                        }}
                                        className={cardClassName}
                                    >
                                        {content}
                                    </button>
                                );
                            }

                            return (
                                <Link
                                    key={category.id}
                                    href={`/marketplace/products?categoryId=${category.id}`}
                                    onClick={() => trackCategory(category)}
                                    className={cardClassName}
                                >
                                    {content}
                                </Link>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        onClick={() => scroll('right')}
                        className="absolute -right-2 lg:-right-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/70 bg-white/90 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-[#0b2447] hover:text-white hover:border-[#0b2447] hover:shadow-lg active:scale-95 lg:flex text-slate-600"
                        aria-label="Scroll categories right"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </section>
    );
}
