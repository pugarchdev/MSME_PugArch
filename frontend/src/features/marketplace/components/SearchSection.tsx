'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import type { MarketplaceCategory } from '../api';

// These chips are derived from real category names — not dummy data
// They only render on mobile (desktop search is in the header)
interface Props { categories: MarketplaceCategory[]; }

export function SearchSection({ categories }: Props) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [categoryId, setCategoryId] = useState('');

    const doSearch = (q = query) => {
        const params = new URLSearchParams();
        if (q.trim()) params.set('q', q.trim());
        if (categoryId) params.set('categoryId', categoryId);
        router.push(`/marketplace/products?${params.toString()}`);
    };

    const handleSubmit = (e: React.FormEvent) => { e.preventDefault(); doSearch(); };

    // Show top 8 categories as chips
    const chips = categories.slice(0, 8);

    return (
        <section className="bg-white border-b border-slate-100 md:hidden" aria-label="Mobile search">
            <div className="px-3 py-3 space-y-2">
                <form onSubmit={handleSubmit} className="flex gap-2">
                    <div className="relative flex-1">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search products, services…"
                            className="w-full h-10 pl-9 pr-3 rounded-lg border border-slate-200 bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 focus:border-[#0b2447]"
                        />
                    </div>
                    <button type="submit" className="h-10 px-4 rounded-lg bg-[#0b2447] text-white text-xs font-bold hover:bg-[#12335f] active:scale-95 transition">
                        Search
                    </button>
                </form>

                {chips.length > 0 && (
                    <div className="flex gap-1.5 overflow-x-auto no-scrollbar pb-1">
                        {chips.map(cat => (
                            <button
                                key={cat.id}
                                onClick={() => { setCategoryId(String(cat.id)); doSearch(); }}
                                className="shrink-0 px-3 py-1 rounded-full border border-slate-200 bg-slate-50 text-[10px] font-medium text-slate-600 hover:border-[#0b2447] hover:text-[#0b2447] active:scale-95 transition"
                            >
                                {cat.name}
                            </button>
                        ))}
                    </div>
                )}
            </div>
        </section>
    );
}
