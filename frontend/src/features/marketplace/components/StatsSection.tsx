'use client';
import React from 'react';
import { Building2, Users, Package, Wrench, Layers } from 'lucide-react';
import type { MarketplaceStats } from '../api';

interface Props {
    stats?: MarketplaceStats;
}

export function StatsSection({ stats }: Props) {
    const items = [
        { icon: <Building2 className="h-6 w-6" />, value: stats?.verifiedSellers || 0, label: 'Verified Sellers' },
        { icon: <Users className="h-6 w-6" />, value: stats?.registeredBuyers || 0, label: 'Registered Buyers' },
        { icon: <Package className="h-6 w-6" />, value: stats?.productsListed || 0, label: 'Products Listed' },
        { icon: <Wrench className="h-6 w-6" />, value: stats?.servicesListed || 0, label: 'Services Listed' },
        { icon: <Layers className="h-6 w-6" />, value: stats?.categories || 0, label: 'Categories' },
    ];

    return (
        <section className="py-10 bg-[#0b2447]" aria-labelledby="stats-heading">
            <div className="max-w-7xl mx-auto px-4">
                <h2 id="stats-heading" className="text-center text-lg font-bold text-white mb-8">Portal Statistics</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                    {items.map((item, i) => (
                        <div key={i} className="text-center p-4 rounded-lg bg-white/5 border border-white/10">
                            <div className="w-12 h-12 rounded-lg bg-white/10 flex items-center justify-center text-white mx-auto mb-3">
                                {item.icon}
                            </div>
                            <p className="text-2xl font-bold text-white">{item.value.toLocaleString('en-IN')}</p>
                            <p className="text-[11px] text-white/60 font-medium mt-1">{item.label}</p>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
