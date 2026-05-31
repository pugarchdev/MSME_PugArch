'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Search, ChevronRight, Package, MapPin, BadgeCheck, ShoppingCart, Eye, ChevronLeft } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type MarketplaceProduct, type MarketplaceCategory } from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { toast } from 'sonner';

export default function MarketplaceProductList() {
    const { user } = useAuth();
    const searchParams = useSearchParams();

    const [products, setProducts] = useState<MarketplaceProduct[]>([]);
    const [categories, setCategories] = useState<MarketplaceCategory[]>([]);
    const [total, setTotal] = useState(0);
    const [totalPages, setTotalPages] = useState(0);
    const [loading, setLoading] = useState(true);

    const [query, setQuery] = useState(searchParams?.get('q') || '');
    const [categoryId, setCategoryId] = useState(searchParams?.get('categoryId') || '');
    const [sort, setSort] = useState(searchParams?.get('sort') || 'latest');
    const [page, setPage] = useState(Number(searchParams?.get('page')) || 1);

    useEffect(() => {
        marketplaceApi.getHomeData().then(d => setCategories(d.categories)).catch(() => { });
    }, []);

    useEffect(() => {
        setLoading(true);
        const params: Record<string, string | number> = { page, pageSize: 12, sort };
        if (query) params.q = query;
        if (categoryId) params.categoryId = categoryId;

        marketplaceApi.getProducts(params)
            .then((data: any) => {
                setProducts(data.products || []);
                setTotal(data.total || 0);
                setTotalPages(data.totalPages || 0);
            })
            .catch(() => toast.error('Failed to load products'))
            .finally(() => setLoading(false));
    }, [query, categoryId, sort, page]);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
    };

    const handleAddToCart = async (product: MarketplaceProduct) => {
        try {
            await marketplaceApi.addGuestCartItem({ productId: product.id, quantity: 1 });
            toast.success('Item added to cart.');
        } catch (error: any) {
            toast.error(error?.message || 'Unable to add item to cart');
        }
    };

    return (
        <div className="min-h-dvh bg-white flex flex-col">
            <div className="brand-tricolor-strip w-full" />
            <MarketplaceHeader user={user} />

            <main className="flex-1">
                {/* Breadcrumb */}
                <div className="bg-slate-50 border-b border-slate-200">
                    <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2 text-[11px] text-slate-500">
                        <Link href="/" className="hover:text-[#0b2447] transition">Home</Link>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-slate-700 font-medium">Products</span>
                        {query && <><ChevronRight className="h-3 w-3" /><span className="text-slate-700">Search: {query}</span></>}
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 py-6">
                    {/* Filters Bar */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        <form onSubmit={handleSearch} className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                value={query}
                                onChange={e => setQuery(e.target.value)}
                                placeholder="Search products..."
                                className="w-full h-10 pl-10 pr-4 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20"
                            />
                        </form>
                        <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setPage(1); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                            <option value="">All Categories</option>
                            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                        <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                            <option value="latest">Latest First</option>
                            <option value="price_asc">Price: Low to High</option>
                            <option value="price_desc">Price: High to Low</option>
                            <option value="name">Name A-Z</option>
                        </select>
                    </div>

                    {/* Results Count */}
                    <p className="text-xs text-slate-500 mb-4">{total} product{total !== 1 ? 's' : ''} found</p>

                    {/* Product Grid */}
                    {loading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-64 bg-slate-100 rounded-lg animate-pulse" />)}
                        </div>
                    ) : products.length === 0 ? (
                        <div className="text-center py-16">
                            <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-sm text-slate-500">No products found matching your criteria.</p>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {products.map(product => {
                                const imageUrl = product.images?.[0]?.fileAsset?.url;
                                const isVerified = product.organization?.verificationStatus === 'VERIFIED';
                                const location = product.organization?.city || product.organization?.district || product.organization?.state;
                                return (
                                    <div key={product.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg hover:border-slate-300 transition-all">
                                        <Link href={`/marketplace/products/${product.id}`} className="block relative h-36 bg-slate-100 overflow-hidden">
                                            {imageUrl ? <img src={imageUrl} alt={product.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" /> : <div className="w-full h-full flex items-center justify-center"><Package className="h-10 w-10 text-slate-300" /></div>}
                                            {isVerified && <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-[8px] font-bold text-green-700"><BadgeCheck className="h-2.5 w-2.5" />Verified</span>}
                                        </Link>
                                        <div className="p-3 space-y-1.5">
                                            {product.category && <span className="text-[9px] font-bold text-[#0b2447]/60 uppercase tracking-wider">{product.category.name}</span>}
                                            <Link href={`/marketplace/products/${product.id}`}><h3 className="text-xs font-semibold text-slate-800 line-clamp-2 hover:text-[#0b2447] transition">{product.name}</h3></Link>
                                            {product.organization && <p className="text-[10px] text-slate-500 truncate">{product.organization.organizationName}</p>}
                                            {location && <p className="text-[9px] text-slate-400 inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{location}</p>}
                                            <div className="pt-1">{product.price ? <p className="text-sm font-bold text-[#0b2447]">₹{Number(product.price).toLocaleString('en-IN')}</p> : <p className="text-[10px] font-semibold text-amber-700 bg-amber-50 inline-block px-1.5 py-0.5 rounded">Quote Based</p>}</div>
                                            <div className="flex gap-2 pt-1.5">
                                                <Link href={`/marketplace/products/${product.id}`} className="flex-1 inline-flex items-center justify-center gap-1 h-7 rounded-md border border-slate-200 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition"><Eye className="h-3 w-3" />Details</Link>
                                                <button onClick={() => handleAddToCart(product)} className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-[#0b2447] text-white hover:bg-[#12335f] active:scale-90 transition" aria-label="Add to cart"><ShoppingCart className="h-3 w-3" /></button>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Pagination */}
                    {totalPages > 1 && (
                        <div className="flex items-center justify-center gap-2 mt-8">
                            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1} className="h-8 px-3 rounded-md border border-slate-200 text-xs font-medium disabled:opacity-40 hover:bg-slate-50 active:scale-95 transition">
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                const p = page <= 3 ? i + 1 : page + i - 2;
                                if (p < 1 || p > totalPages) return null;
                                return (
                                    <button key={p} onClick={() => setPage(p)} className={`h-8 w-8 rounded-md text-xs font-semibold transition ${p === page ? 'bg-[#0b2447] text-white' : 'border border-slate-200 hover:bg-slate-50'}`}>{p}</button>
                                );
                            })}
                            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages} className="h-8 px-3 rounded-md border border-slate-200 text-xs font-medium disabled:opacity-40 hover:bg-slate-50 active:scale-95 transition">
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                </div>
            </main>

            <MarketplaceFooter />
        </div>
    );
}
