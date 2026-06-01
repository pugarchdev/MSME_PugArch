'use client';
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';
import type { MarketplaceCategory } from '../api';

const popularChips = [
    'Industrial Products', 'Construction Materials', 'Office Supplies',
    'Logistics', 'IT Services', 'Maintenance Services', 'Safety Equipment', 'Machinery'
];

interface Props {
    categories: MarketplaceCategory[];
}

export function SearchSection({ categories }: Props) {
    const router = useRouter();
    const [query, setQuery] = useState('');
    const [selectedCategory, setSelectedCategory] = useState('');
    const [itemType, setItemType] = useState('all');

    const doSearch = (searchTerm?: string) => {
        const q = (searchTerm || query).trim();
        if (!q && !selectedCategory) return;
        const params = new URLSearchParams();
        if (q) params.set('q', q);
        if (selectedCategory) params.set('categoryId', selectedCategory);
        const path = itemType === 'services' ? '/marketplace/services' : '/marketplace/products';
        router.push(`${path}?${params.toString()}`);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        doSearch();
    };

    const handleChipClick = (chip: string) => {
        setQuery(chip);
        doSearch(chip);
    };

    return (
        <section className="bg-slate-50 border-b border-slate-200 py-8" id="search" aria-label="Search">
            <div className="max-w-7xl mx-auto px-4">
                <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3 max-w-5xl mx-auto">
                    {/* Category Dropdown */}
                    <select
                        value={selectedCategory}
                        onChange={e => setSelectedCategory(e.target.value)}
                        className="h-12 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 sm:w-48 cursor-pointer"
                    >
                        <option value="">All Categories</option>
                        {categories.map(cat => (
                            <option key={cat.id} value={cat.id}>{cat.name}</option>
                        ))}
                    </select>

                    {/* Product/Service Toggle */}
                    <select
                        value={itemType}
                        onChange={e => setItemType(e.target.value)}
                        className="h-12 px-4 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 sm:w-40 cursor-pointer"
                    >
                        <option value="all">Products & Services</option>
                        <option value="products">Products Only</option>
                        <option value="services">Services Only</option>
                    </select>

                    {/* Search Input */}
                    <div className="relative flex-1">
                        <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                        <input
                            type="text"
                            value={query}
                            onChange={e => setQuery(e.target.value)}
                            placeholder="Search products, services, sellers, categories..."
                            className="w-full h-12 pl-11 pr-4 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 focus:border-[#0b2447] transition"
                        />
                    </div>

                    {/* Search Button */}
                    <button
                        type="submit"
                        className="h-12 px-7 rounded-lg bg-[#0b2447] text-white text-sm font-bold hover:bg-[#12335f] active:scale-95 transition inline-flex items-center justify-center gap-2 shrink-0"
                    >
                        <Search className="h-4 w-4" />
                        Search
                    </button>
                </form>

                {/* Popular Search Chips */}
                <div className="mt-5 flex flex-wrap gap-2 justify-center items-center">
                    <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mr-1">Popular:</span>
                    {popularChips.map(chip => (
                        <button
                            key={chip}
                            type="button"
                            onClick={() => handleChipClick(chip)}
                            className="px-3 py-1.5 rounded-full bg-white border border-slate-200 text-[11px] font-medium text-slate-600 hover:border-[#0b2447] hover:text-[#0b2447] hover:bg-[#0b2447]/5 active:scale-95 transition cursor-pointer"
                        >
                            {chip}
                        </button>
                    ))}
                </div>
            </div>
        </section>
    );
}
