'use client';

import React, { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, PackageSearch } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { MarketplaceItemCard, type MarketplaceDiscoveryItem } from './MarketplaceItemCard';

interface MarketplaceSectionCarouselProps {
    title: string;
    subtitle?: string;
    items: MarketplaceDiscoveryItem[];
    loading?: boolean;
    emptyState?: string;
    viewAllUrl?: string;
    sectionKey: string;
    showArrows?: boolean;
    showCompare?: boolean;
    showAddToCart?: boolean;
    showRequestQuote?: boolean;
    className?: string;
}

export function MarketplaceSectionCarousel({
    title,
    subtitle,
    items,
    loading = false,
    emptyState,
    viewAllUrl,
    sectionKey,
    showArrows = true,
    showCompare = true,
    showAddToCart = true,
    showRequestQuote = true,
    className,
}: MarketplaceSectionCarouselProps) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (direction: 'left' | 'right') => {
        scrollRef.current?.scrollBy({ left: direction === 'left' ? -520 : 520, behavior: 'smooth' });
    };

    if (!loading && items.length === 0 && !emptyState) return null;

    return (
        <section className={cn('border-b border-slate-100 bg-white', className)} data-section={sectionKey}>
            <div className="mx-auto max-w-[1680px] px-4 pt-5 sm:px-6 2xl:px-8">
                <div className="mb-3 flex items-end justify-between gap-3">
                    <div className="min-w-0">
                        <h2 className="text-sm font-black text-[#0b2447] sm:text-base">{title}</h2>
                        {subtitle && <p className="mt-0.5 text-[11px] font-semibold text-slate-500">{subtitle}</p>}
                    </div>
                    {viewAllUrl && (
                        <Link href={viewAllUrl} className="shrink-0 text-[11px] font-black text-[#0b2447] hover:underline">
                            View all
                        </Link>
                    )}
                </div>
            </div>

            <div className="relative mx-auto max-w-[1680px] px-4 sm:px-6 2xl:px-8">
                {showArrows && items.length > 2 && (
                    <button
                        type="button"
                        onClick={() => scroll('left')}
                        className="absolute -left-2 lg:-left-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/70 bg-white/90 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-[#0b2447] hover:text-white hover:border-[#0b2447] hover:shadow-lg active:scale-95 lg:flex text-slate-600"
                        aria-label={`Scroll ${title} left`}
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>
                )}

                {loading ? (
                    <div className="flex gap-4 overflow-hidden pb-5">
                        {Array.from({ length: 5 }).map((_, index) => (
                            <div key={index} className="h-[370px] w-56 shrink-0 rounded-2xl border border-slate-200/60 bg-white/90 p-3 shadow-sm sm:w-60 2xl:w-64">
                                <div className="h-40 rounded-xl bg-slate-100" />
                                <div className="mt-4 h-3 w-24 rounded bg-slate-100" />
                                <div className="mt-3 h-4 w-full rounded bg-slate-100" />
                                <div className="mt-2 h-4 w-2/3 rounded bg-slate-100" />
                                <div className="mt-5 h-5 w-24 rounded bg-slate-100" />
                                <div className="mt-7 h-8 rounded bg-slate-100" />
                            </div>
                        ))}
                    </div>
                ) : items.length > 0 ? (
                    <div ref={scrollRef} className="flex snap-x gap-4 overflow-x-auto pb-5 pt-1 no-scrollbar xl:gap-5">
                        {items.map((item) => (
                            <MarketplaceItemCard
                                key={`${sectionKey}-${item.id}-${(item as any).itemType || ''}`}
                                item={item}
                                itemType={(item as any).itemType === 'SERVICE' ? 'service' : (item as any).itemType === 'PRODUCT' ? 'product' : undefined}
                                showCompare={showCompare}
                                showAddToCart={showAddToCart}
                                showRequestQuote={showRequestQuote}
                            />
                        ))}
                        {viewAllUrl && (
                            <Link
                                href={viewAllUrl}
                                className="flex min-h-[370px] w-48 shrink-0 snap-start flex-col items-center justify-center gap-2.5 rounded-2xl border border-dashed border-slate-200 bg-slate-50/50 px-4 text-center transition hover:bg-slate-100 hover:border-[#0b2447]/30 sm:w-56"
                            >
                                <PackageSearch className="h-8 w-8 text-[#0b2447] transition-transform duration-300 hover:scale-110" />
                                <span className="text-xs font-extrabold text-[#0b2447]">View complete section</span>
                            </Link>
                        )}
                    </div>
                ) : (
                    <div className="mb-5 rounded-2xl border border-dashed border-slate-200 bg-slate-50 px-4 py-8 text-center">
                        <PackageSearch className="mx-auto h-9 w-9 text-slate-300" />
                        <p className="mt-2 text-xs font-semibold text-slate-500">{emptyState}</p>
                    </div>
                )}

                {showArrows && items.length > 2 && (
                    <button
                        type="button"
                        onClick={() => scroll('right')}
                        className="absolute -right-2 lg:-right-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/70 bg-white/90 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-[#0b2447] hover:text-white hover:border-[#0b2447] hover:shadow-lg active:scale-95 lg:flex text-slate-600"
                        aria-label={`Scroll ${title} right`}
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                )}
            </div>
        </section>
    );
}
