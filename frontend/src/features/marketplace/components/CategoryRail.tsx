'use client';
import React, { useRef } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, Package, Wrench, Truck, Monitor, HardHat, Armchair, Zap, Printer, Shield, UtensilsCrossed, Boxes, Factory, Hammer, FlaskConical, Cog, Users } from 'lucide-react';
import type { MarketplaceCategory } from '../api';

const ICON_MAP: [string, React.ReactNode, string][] = [
    ['raw material', <Boxes className="h-7 w-7" />, 'bg-orange-50 text-orange-600'],
    ['machinery', <Cog className="h-7 w-7" />, 'bg-blue-50 text-blue-600'],
    ['electrical', <Zap className="h-7 w-7" />, 'bg-yellow-50 text-yellow-600'],
    ['construction', <Hammer className="h-7 w-7" />, 'bg-stone-50 text-stone-600'],
    ['packaging', <Printer className="h-7 w-7" />, 'bg-purple-50 text-purple-600'],
    ['it ', <Monitor className="h-7 w-7" />, 'bg-sky-50 text-sky-600'],
    ['software', <Monitor className="h-7 w-7" />, 'bg-sky-50 text-sky-600'],
    ['consulting', <Users className="h-7 w-7" />, 'bg-indigo-50 text-indigo-600'],
    ['repair', <Wrench className="h-7 w-7" />, 'bg-red-50 text-red-600'],
    ['maintenance', <Wrench className="h-7 w-7" />, 'bg-red-50 text-red-600'],
    ['logistics', <Truck className="h-7 w-7" />, 'bg-green-50 text-green-600'],
    ['transport', <Truck className="h-7 w-7" />, 'bg-green-50 text-green-600'],
    ['testing', <FlaskConical className="h-7 w-7" />, 'bg-teal-50 text-teal-600'],
    ['industrial', <Factory className="h-7 w-7" />, 'bg-slate-50 text-slate-600'],
    ['office', <Package className="h-7 w-7" />, 'bg-amber-50 text-amber-600'],
    ['furniture', <Armchair className="h-7 w-7" />, 'bg-pink-50 text-pink-600'],
    ['safety', <Shield className="h-7 w-7" />, 'bg-emerald-50 text-emerald-600'],
    ['food', <UtensilsCrossed className="h-7 w-7" />, 'bg-rose-50 text-rose-600'],
    ['hardware', <HardHat className="h-7 w-7" />, 'bg-amber-50 text-amber-700'],
];

const getIconStyle = (name: string): [React.ReactNode, string] => {
    const lower = name.toLowerCase();
    for (const [key, icon, style] of ICON_MAP) {
        if (lower.includes(key)) return [icon, style];
    }
    return [<Package className="h-7 w-7" />, 'bg-slate-50 text-slate-600'];
};

interface Props { categories: MarketplaceCategory[]; }

export function CategoryRail({ categories }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);

    if (categories.length === 0) return null;

    const scroll = (dir: 'left' | 'right') => {
        if (!scrollRef.current) return;
        scrollRef.current.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' });
    };

    return (
        <section className="bg-white border-b border-slate-100" id="categories">
            <div className="max-w-7xl mx-auto px-2 sm:px-4 relative">
                {/* Prev Arrow */}
                <button
                    onClick={() => scroll('left')}
                    className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-white border border-slate-200 rounded-full shadow-md flex items-center justify-center hover:bg-slate-50 active:scale-90 transition"
                    aria-label="Scroll left"
                >
                    <ChevronLeft className="h-4 w-4 text-slate-600" />
                </button>

                {/* Rail */}
                <div
                    ref={scrollRef}
                    className="flex gap-1 overflow-x-auto no-scrollbar py-4 px-8"
                >
                    {categories.map(cat => {
                        const [icon, style] = getIconStyle(cat.name);
                        return (
                            <Link
                                key={cat.id}
                                href={`/marketplace/products?categoryId=${cat.id}`}
                                className="group shrink-0 flex flex-col items-center gap-2 w-[90px] sm:w-[100px] cursor-pointer"
                            >
                                <div className={`w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center ${style} border border-slate-100 group-hover:scale-105 group-hover:shadow-md transition-all`}>
                                    {icon}
                                </div>
                                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-700 text-center leading-tight group-hover:text-[#0b2447] transition line-clamp-2">
                                    {cat.name}
                                </span>
                            </Link>
                        );
                    })}
                </div>

                {/* Next Arrow */}
                <button
                    onClick={() => scroll('right')}
                    className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-8 bg-white border border-slate-200 rounded-full shadow-md flex items-center justify-center hover:bg-slate-50 active:scale-90 transition"
                    aria-label="Scroll right"
                >
                    <ChevronRight className="h-4 w-4 text-slate-600" />
                </button>
            </div>
        </section>
    );
}
