'use client';
import React from 'react';
import Link from 'next/link';
import { Package, Wrench, Truck, Monitor, HardHat, Armchair, Zap, Printer, Shield, UtensilsCrossed, Boxes, Factory, Hammer, FlaskConical, Cog, Users } from 'lucide-react';
import type { MarketplaceCategory } from '../api';

const categoryIcons: Record<string, React.ReactNode> = {
    'raw materials': <Boxes className="h-6 w-6" />,
    'machinery': <Cog className="h-6 w-6" />,
    'electrical': <Zap className="h-6 w-6" />,
    'construction': <Hammer className="h-6 w-6" />,
    'packaging': <Printer className="h-6 w-6" />,
    'it': <Monitor className="h-6 w-6" />,
    'consulting': <Users className="h-6 w-6" />,
    'repair': <Wrench className="h-6 w-6" />,
    'maintenance': <Wrench className="h-6 w-6" />,
    'logistics': <Truck className="h-6 w-6" />,
    'transport': <Truck className="h-6 w-6" />,
    'testing': <FlaskConical className="h-6 w-6" />,
    'industrial': <Factory className="h-6 w-6" />,
    'office': <Package className="h-6 w-6" />,
    'furniture': <Armchair className="h-6 w-6" />,
    'safety': <Shield className="h-6 w-6" />,
    'food': <UtensilsCrossed className="h-6 w-6" />,
    'catering': <UtensilsCrossed className="h-6 w-6" />,
    'hardware': <HardHat className="h-6 w-6" />,
};

const getIcon = (name: string) => {
    const lower = name.toLowerCase();
    for (const [key, icon] of Object.entries(categoryIcons)) {
        if (lower.includes(key)) return icon;
    }
    return <Package className="h-6 w-6" />;
};

interface Props {
    categories: MarketplaceCategory[];
}

export function CategorySection({ categories }: Props) {
    if (categories.length === 0) return null;

    return (
        <section className="py-10 bg-white" id="categories" aria-labelledby="categories-heading">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 id="categories-heading" className="text-lg font-bold text-[#0b2447]">Marketplace Categories</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Browse products and services by category</p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">{categories.length} Categories</span>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                    {categories.map(cat => {
                        const count = (cat._count?.products || 0) + (cat._count?.services || 0);
                        return (
                            <Link
                                key={cat.id}
                                href={`/marketplace/products?categoryId=${cat.id}`}
                                className="group flex flex-col items-center gap-2.5 p-4 rounded-lg border border-slate-100 bg-white hover:border-[#0b2447]/30 hover:shadow-md active:scale-[0.97] transition-all duration-200 text-center cursor-pointer"
                            >
                                <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center text-[#0b2447] group-hover:bg-[#0b2447]/5 group-hover:border-[#0b2447]/20 transition">
                                    {getIcon(cat.name)}
                                </div>
                                <h3 className="text-xs font-semibold text-slate-700 leading-tight group-hover:text-[#0b2447] transition">{cat.name}</h3>
                                {count > 0 && (
                                    <span className="text-[10px] font-medium text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">{count} items</span>
                                )}
                            </Link>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
