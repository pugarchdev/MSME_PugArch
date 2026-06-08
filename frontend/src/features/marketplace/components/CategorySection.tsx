// CategorySection is superseded by CategoryRail on the home page.
// It is kept for the standalone /marketplace/products category grid view.
'use client';
import React from 'react';
import Link from 'next/link';
import {
    Package, Wrench, Truck, Monitor, HardHat, Armchair, Zap,
    Printer, Shield, UtensilsCrossed, Boxes, Factory, Hammer,
    FlaskConical, Cog, Users
} from 'lucide-react';
import type { MarketplaceCategory } from '../api';

const ICON_MAP: [string, React.ReactNode, string][] = [
    ['raw material', <Boxes className="h-6 w-6" />, 'bg-orange-50 text-orange-600 border-orange-100'],
    ['machinery', <Cog className="h-6 w-6" />, 'bg-blue-50 text-blue-600 border-blue-100'],
    ['electrical', <Zap className="h-6 w-6" />, 'bg-yellow-50 text-yellow-600 border-yellow-100'],
    ['construction', <Hammer className="h-6 w-6" />, 'bg-stone-50 text-stone-600 border-stone-100'],
    ['packaging', <Printer className="h-6 w-6" />, 'bg-purple-50 text-purple-600 border-purple-100'],
    ['it', <Monitor className="h-6 w-6" />, 'bg-sky-50 text-sky-600 border-sky-100'],
    ['software', <Monitor className="h-6 w-6" />, 'bg-sky-50 text-sky-600 border-sky-100'],
    ['consulting', <Users className="h-6 w-6" />, 'bg-indigo-50 text-indigo-600 border-indigo-100'],
    ['repair', <Wrench className="h-6 w-6" />, 'bg-red-50 text-red-600 border-red-100'],
    ['maintenance', <Wrench className="h-6 w-6" />, 'bg-red-50 text-red-600 border-red-100'],
    ['logistics', <Truck className="h-6 w-6" />, 'bg-green-50 text-green-600 border-green-100'],
    ['transport', <Truck className="h-6 w-6" />, 'bg-green-50 text-green-600 border-green-100'],
    ['testing', <FlaskConical className="h-6 w-6" />, 'bg-teal-50 text-teal-600 border-teal-100'],
    ['industrial', <Factory className="h-6 w-6" />, 'bg-slate-50 text-slate-600 border-slate-100'],
    ['office', <Package className="h-6 w-6" />, 'bg-amber-50 text-amber-600 border-amber-100'],
    ['furniture', <Armchair className="h-6 w-6" />, 'bg-pink-50 text-pink-600 border-pink-100'],
    ['safety', <Shield className="h-6 w-6" />, 'bg-emerald-50 text-emerald-600 border-emerald-100'],
    ['food', <UtensilsCrossed className="h-6 w-6" />, 'bg-rose-50 text-rose-600 border-rose-100'],
    ['hardware', <HardHat className="h-6 w-6" />, 'bg-amber-50 text-amber-700 border-amber-100'],
];

function getIconStyle(name: string): [React.ReactNode, string] {
    const lower = name.toLowerCase();
    for (const [key, icon, style] of ICON_MAP) {
        if (lower.includes(key)) return [icon, style];
    }
    return [<Package className="h-6 w-6" />, 'bg-slate-50 text-slate-500 border-slate-100'];
}

interface Props {
    categories: MarketplaceCategory[];
    compact?: boolean;
}

export function CategorySection({ categories, compact = false }: Props) {
    if (categories.length === 0) return null;

    return (
        <section className={compact ? '' : 'py-8 bg-white'} id="categories" aria-labelledby="categories-heading">
            <div className={compact ? '' : 'max-w-7xl mx-auto px-4'}>
                {!compact && (
                    <div className="flex items-center justify-between mb-5">
                        <div>
                            <h2 id="categories-heading" className="text-base font-bold text-[#0b2447]">All Categories</h2>
                            <p className="text-[11px] text-slate-500 mt-0.5">Browse by product or service category</p>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                            {categories.length} categories
                        </span>
                    </div>
                )}

                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-6 xl:grid-cols-8 gap-2 sm:gap-3">
                    {categories.map(cat => {
                        const [icon, style] = getIconStyle(cat.name);
                        const count = (cat._count?.products || 0) + (cat._count?.services || 0);
                        return (
                            <Link
                                key={cat.id}
                                href={`/marketplace/products?categoryId=${cat.id}`}
                                className="group flex flex-col items-center gap-2 p-3 rounded-xl border border-slate-100 bg-white hover:border-[#0b2447]/25 hover:shadow-md active:scale-[0.97] transition-all duration-200 text-center"
                            >
                                <div className={`w-11 h-11 rounded-xl flex items-center justify-center border ${style} group-hover:scale-110 transition-transform`}>
                                    {icon}
                                </div>
                                <p className="text-[10px] sm:text-[11px] font-semibold text-slate-700 leading-tight group-hover:text-[#0b2447] transition line-clamp-2">
                                    {cat.name}
                                </p>
                                {count > 0 && !compact && (
                                    <span className="text-[9px] text-slate-400">{count}</span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
