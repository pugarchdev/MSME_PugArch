'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { toast } from 'sonner';
import { api, readJsonResponse, unwrapApiData } from '../../../lib/api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import {
    Building2, MapPin, Package, Wrench, BadgeCheck, Star,
    ArrowLeft, Search, SlidersHorizontal, ChevronRight,
    ShoppingCart, FileText, Globe, Mail, Phone, X, Plus, Minus
} from 'lucide-react';
import { useGuestCart } from '../hooks/useGuestCart';
import { useQueryClient } from '@tanstack/react-query';

const PRICING_LABELS: Record<string, string> = {
    FIXED: 'Fixed', HOURLY: '/hr', DAILY: '/day', MONTHLY: '/mo',
    PER_PROJECT: '/project', CUSTOM: 'Quote',
};

export default function MarketplaceSellerStore() {
    const { user } = useAuth();
    const pathname = usePathname() || '';
    const router = useRouter();
    const sellerId = Number(pathname.split('/').pop());
    const queryClient = useQueryClient();
    const { items: cartItems, add: addToCart, update: updateCartQty } = useGuestCart();

    const [vendor, setVendor] = useState<any>(null);
    const [products, setProducts] = useState<any[]>([]);
    const [services, setServices] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [tab, setTab] = useState<'products' | 'services' | 'about'>('products');

    // Filters
    const [q, setQ] = useState('');
    const [catId, setCatId] = useState('');
    const [sortBy, setSortBy] = useState('latest');
    const [minP, setMinP] = useState('');
    const [maxP, setMaxP] = useState('');
    const [showF, setShowF] = useState(false);

    useEffect(() => {
        if (!sellerId || sellerId < 1) return;
        Promise.all([
            api.get(`/api/vendors/${sellerId}`).then(r => readJsonResponse(r)).then(b => unwrapApiData(b)).catch(() => null),
            api.get(`/api/products/search?sellerId=${sellerId}&take=48`).then(r => readJsonResponse(r)).then(b => unwrapApiData<any>(b)).catch(() => ({ products: [] })),
            api.get(`/api/services/search?sellerId=${sellerId}&take=48`).then(r => readJsonResponse(r)).then(b => unwrapApiData<any>(b)).catch(() => ({ services: [] })),
        ]).then(([v, p, s]) => {
            setVendor(v);
            setProducts(Array.isArray(p?.records) ? p.records : (p?.products || []));
            setServices(Array.isArray(s?.records) ? s.records : (s?.services || []));
        }).finally(() => setLoading(false));
    }, [sellerId]);

    const filteredProducts = products.filter(p => {
        if (q && !p.name?.toLowerCase().includes(q.toLowerCase()) && !p.description?.toLowerCase().includes(q.toLowerCase())) return false;
        if (catId && String(p.categoryId) !== catId) return false;
        if (minP && Number(p.price || 0) < Number(minP)) return false;
        if (maxP && Number(p.price || 0) > Number(maxP)) return false;
        return true;
    }).sort((a, b) => {
        if (sortBy === 'price_asc') return Number(a.price || 0) - Number(b.price || 0);
        if (sortBy === 'price_desc') return Number(b.price || 0) - Number(a.price || 0);
        if (sortBy === 'name') return a.name.localeCompare(b.name);
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
    });

    const filteredServices = services.filter(s => {
        if (q && !s.name?.toLowerCase().includes(q.toLowerCase())) return false;
        return true;
    });

    const handleAddToCart = (product: any) => {
        const img = product.images?.[0]?.fileAsset?.url || product.imageUrl;
        addToCart({
            id: product.id,
            name: product.name,
            price: product.price ? Number(product.price) : undefined,
            unit: product.unitOfMeasure,
            imageUrl: img,
            category: product.category?.name,
            type: 'product',
        });
        toast.success(`${product.name} added to cart`);
    };

    const handleRequestQuote = (item: any) => {
        if (!user) {
            toast.info('Please login to request a quote', {
                action: { label: 'Login', onClick: () => router.push('/login') },
            });
            return;
        }
        toast.success(`Quote request sent for ${item.name}`);
    };

    const goToProductDetail = (p: any) => {
        queryClient.setQueryData(['marketplaceProduct', p.id], { product: p, relatedProducts: [] });
        router.push(`/marketplace/products/${p.id}`);
    };

    const goToServiceDetail = (s: any) => {
        queryClient.setQueryData(['marketplaceService', s.id], { service: s, relatedServices: [] });
        router.push(`/marketplace/services/${s.id}`);
    };

    if (loading) {
        return (
            <div className="min-h-dvh bg-white flex flex-col">
                <div className="brand-tricolor-strip w-full" />
                <MarketplaceHeader user={user} />
                <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
                    <div className="space-y-4 animate-pulse">
                        <div className="h-40 bg-slate-200 rounded-xl" />
                        <div className="h-10 bg-slate-100 rounded-lg" />
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
                            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-56 bg-slate-100 rounded-xl" />)}
                        </div>
                    </div>
                </main>
                <MarketplaceFooter />
            </div>
        );
    }

    if (!vendor) {
        return (
            <div className="min-h-dvh bg-white flex flex-col">
                <div className="brand-tricolor-strip w-full" />
                <MarketplaceHeader user={user} />
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <Building2 className="h-16 w-16 text-slate-200 mx-auto mb-4" />
                        <h2 className="text-lg font-bold text-slate-700 mb-2">Seller Not Found</h2>
                        <Link href="/" className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#0b2447] text-white text-xs font-semibold hover:bg-[#12335f] transition">Back to Marketplace</Link>
                    </div>
                </main>
                <MarketplaceFooter />
            </div>
        );
    }

    const profile = vendor.sellerProfile || {};
    const office = profile.offices?.[0] || {};
    const loc = [office.city, office.state].filter(Boolean).join(', ') || vendor.city || '';
    const name = profile.businessName || vendor.name || 'Seller';
    const initial = name.charAt(0).toUpperCase();

    return (
        <div className="min-h-dvh bg-[#f1f3f6] flex flex-col">
            <div className="brand-tricolor-strip w-full" />
            <MarketplaceHeader user={user} />

            <main className="flex-1">
                {/* Breadcrumb */}
                <div className="bg-white border-b border-slate-100">
                    <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2 text-[11px] text-slate-500">
                        <Link href="/" className="hover:text-[#0b2447] transition">Home</Link>
                        <ChevronRight className="h-3 w-3" />
                        <Link href="/marketplace/sellers" className="hover:text-[#0b2447] transition">Verified Sellers</Link>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-slate-700 font-medium truncate max-w-[200px]">{name}</span>
                    </div>
                </div>

                {/* Seller Hero Card */}
                <div className="bg-gradient-to-r from-[#07172e] via-[#0b2447] to-[#12335f]">
                    <div className="max-w-7xl mx-auto px-4 py-8">
                        <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/60 hover:text-white mb-5 transition [&:not(:disabled):hover]:translate-y-0">
                            <ArrowLeft className="h-3.5 w-3.5" /> Back
                        </button>
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5">
                            {/* Avatar */}
                            <div className="w-16 h-16 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-2xl font-black text-white shrink-0">
                                {initial}
                            </div>
                            {/* Info */}
                            <div className="flex-1 min-w-0">
                                <div className="flex flex-wrap items-center gap-2 mb-1">
                                    <span className="text-[9px] font-black uppercase tracking-widest text-blue-300">Verified Seller</span>
                                    {profile.isUdyamCertified && (
                                        <span className="inline-flex items-center gap-1 text-[9px] font-bold text-green-300 bg-green-400/15 px-2 py-0.5 rounded-full">
                                            <BadgeCheck className="h-2.5 w-2.5" /> Udyam Certified
                                        </span>
                                    )}
                                </div>
                                <h1 className="text-xl sm:text-2xl font-bold text-white">{name}</h1>
                                {profile.nameAsInPan && profile.nameAsInPan !== name && (
                                    <p className="text-[11px] text-white/50 mt-0.5">{profile.nameAsInPan}</p>
                                )}
                                <div className="flex flex-wrap gap-4 mt-2">
                                    {loc && <span className="text-xs text-white/60 inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{loc}</span>}
                                    {profile.organizationType && <span className="text-xs text-white/60">{profile.organizationType}</span>}
                                    {profile.msmeCategory && <span className="text-xs text-white/60">MSME: {profile.msmeCategory}</span>}
                                </div>
                            </div>
                            {/* Stats */}
                            <div className="flex gap-3 shrink-0">
                                <div className="text-center px-4 py-2 bg-white/8 border border-white/12 rounded-xl">
                                    <p className="text-lg font-black text-white">{products.length}</p>
                                    <p className="text-[9px] text-white/50">Products</p>
                                </div>
                                <div className="text-center px-4 py-2 bg-white/8 border border-white/12 rounded-xl">
                                    <p className="text-lg font-black text-white">{services.length}</p>
                                    <p className="text-[9px] text-white/50">Services</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-white border-b border-slate-200">
                    <div className="max-w-7xl mx-auto px-4 flex gap-0">
                        {([['products', `Products (${products.length})`], ['services', `Services (${services.length})`], ['about', 'About Seller']] as const).map(([id, label]) => (
                            <button
                                key={id}
                                onClick={() => setTab(id)}
                                className={`h-11 px-5 text-xs font-bold border-b-2 transition [&:not(:disabled):hover]:translate-y-0 ${tab === id ? 'border-[#0b2447] text-[#0b2447]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 py-6">
                    {/* ── Search + Filter bar (products/services tabs) ── */}
                    {tab !== 'about' && (
                        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-5 space-y-3">
                            <div className="flex gap-3 flex-col sm:flex-row">
                                <form onSubmit={e => e.preventDefault()} className="flex flex-1 items-center h-10 rounded-lg border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-[#0b2447]/20 overflow-hidden">
                                    <Search className="h-4 w-4 text-slate-400 ml-3 shrink-0" />
                                    <input
                                        value={q}
                                        onChange={e => setQ(e.target.value)}
                                        placeholder={tab === 'products' ? 'Search products…' : 'Search services…'}
                                        className="flex-1 h-full bg-transparent text-sm pl-2 pr-1 outline-none"
                                    />
                                    {q && <button type="button" onClick={() => setQ('')} className="px-2 [&:not(:disabled):hover]:translate-y-0"><X className="h-3.5 w-3.5 text-slate-400" /></button>}
                                </form>

                                {tab === 'products' && (
                                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium focus:outline-none sm:w-44">
                                        <option value="latest">Latest First</option>
                                        <option value="price_asc">Price: Low to High</option>
                                        <option value="price_desc">Price: High to Low</option>
                                        <option value="name">Name A–Z</option>
                                    </select>
                                )}

                                {tab === 'products' && (
                                    <button
                                        onClick={() => setShowF(v => !v)}
                                        className={`inline-flex items-center gap-2 h-10 px-4 rounded-lg border text-xs font-semibold transition [&:not(:disabled):hover]:translate-y-0 ${showF ? 'bg-[#0b2447] text-white border-[#0b2447]' : 'border-slate-200 text-slate-700 hover:bg-slate-50'}`}
                                    >
                                        <SlidersHorizontal className="h-3.5 w-3.5" /> Filters
                                    </button>
                                )}
                            </div>

                            {showF && tab === 'products' && (
                                <div className="grid sm:grid-cols-2 gap-3 pt-2 border-t border-slate-100">
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Min Price (₹)</label>
                                        <input type="number" value={minP} onChange={e => setMinP(e.target.value)} placeholder="0" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-1">Max Price (₹)</label>
                                        <input type="number" value={maxP} onChange={e => setMaxP(e.target.value)} placeholder="Any" className="w-full h-9 px-3 rounded-lg border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20" />
                                    </div>
                                    {(minP || maxP) && (
                                        <button onClick={() => { setMinP(''); setMaxP(''); }} className="text-xs font-bold text-red-600 hover:underline [&:not(:disabled):hover]:translate-y-0">Clear Price Filter</button>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Products tab ── */}
                    {tab === 'products' && (
                        <>
                            <p className="text-xs text-slate-500 mb-4">{filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found</p>
                            {filteredProducts.length === 0 ? (
                                <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                                    <Package className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                                    <p className="text-sm text-slate-500">No products found.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-4">
                                    {filteredProducts.map((p: any) => {
                                        const img = p.images?.[0]?.fileAsset?.url || p.imageUrl;
                                        const cartItem = cartItems.find((item: any) => item.id === p.id && item.type === 'product');
                                        const count = cartItem ? cartItem.quantity : 0;
                                        return (
                                            <div key={p.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg hover:border-slate-300 transition-all group">
                                                <Link 
                                                    href={`/marketplace/products/${p.id}`} 
                                                    onClick={(e) => { e.preventDefault(); goToProductDetail(p); }}
                                                    className="block relative h-36 bg-slate-100 overflow-hidden"
                                                >
                                                    {img
                                                        ? <img src={img} alt={p.name} loading="lazy" className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" />
                                                        : <div className="w-full h-full flex items-center justify-center"><Package className="h-10 w-10 text-slate-300" /></div>
                                                    }
                                                    {p.status === 'ACTIVE' && <span className="absolute top-1.5 left-1.5 px-1.5 py-0.5 rounded bg-green-600 text-[8px] font-bold text-white">Active</span>}
                                                </Link>
                                                <div className="p-3 space-y-1.5">
                                                    {p.category?.name && <p className="text-[9px] font-bold text-[#0b2447]/50 uppercase tracking-wider">{p.category.name}</p>}
                                                    <Link 
                                                        href={`/marketplace/products/${p.id}`}
                                                        onClick={(e) => { e.preventDefault(); goToProductDetail(p); }}
                                                    >
                                                        <h3 className="text-xs font-semibold text-slate-800 line-clamp-2 hover:text-[#0b2447] transition">{p.name}</h3>
                                                    </Link>
                                                    {p.brand && <p className="text-[10px] text-slate-400">{p.brand}</p>}
                                                    <div className="pt-1">
                                                        {p.price ? <p className="text-sm font-bold text-[#0b2447]">₹{Number(p.price).toLocaleString('en-IN')}<span className="text-[10px] font-normal text-slate-400 ml-1">/{p.unitOfMeasure || 'unit'}</span></p>
                                                            : <p className="text-[10px] font-semibold text-amber-700 bg-amber-50 inline-block px-1.5 py-0.5 rounded">Quote Based</p>}
                                                    </div>
                                                    <div className="flex gap-2 pt-1">
                                                        <Link 
                                                            href={`/marketplace/products/${p.id}`} 
                                                            onClick={(e) => { e.preventDefault(); goToProductDetail(p); }}
                                                            className="flex-1 inline-flex items-center justify-center h-7 rounded-md border border-slate-200 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                                                        >
                                                            Details
                                                        </Link>
                                                        {count > 0 ? (
                                                            <div className="flex-1 flex items-center justify-between h-7 rounded-md border-2 border-[#0b2447] overflow-hidden">
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); updateCartQty(p.id, 'product', count - 1); }}
                                                                    className="w-6 h-full flex items-center justify-center text-[#0b2447] hover:bg-[#0b2447]/10 transition [&:not(:disabled):hover]:translate-y-0"
                                                                >
                                                                    <Minus className="h-3 w-3" />
                                                                </button>
                                                                <span className="flex-1 text-center text-[10px] font-black text-[#0b2447]">{count}</span>
                                                                <button
                                                                    onClick={(e) => { e.stopPropagation(); updateCartQty(p.id, 'product', count + 1); }}
                                                                    className="w-6 h-full flex items-center justify-center text-[#0b2447] hover:bg-[#0b2447]/10 transition [&:not(:disabled):hover]:translate-y-0"
                                                                >
                                                                    <Plus className="h-3 w-3" />
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <button 
                                                                onClick={(e) => { e.stopPropagation(); handleAddToCart(p); }} 
                                                                className="w-7 h-7 rounded-md bg-[#0b2447] text-white flex items-center justify-center hover:bg-[#12335f] transition [&:not(:disabled):hover]:translate-y-0" 
                                                                aria-label="Add to cart"
                                                            >
                                                                <ShoppingCart className="h-3.5 w-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Services tab ── */}
                    {tab === 'services' && (
                        <>
                            <p className="text-xs text-slate-500 mb-4">{filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''} found</p>
                            {filteredServices.length === 0 ? (
                                <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
                                    <Wrench className="h-10 w-10 text-slate-200 mx-auto mb-3" />
                                    <p className="text-sm text-slate-500">No services found.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                                    {filteredServices.map((s: any) => {
                                        const img = s.images?.[0]?.fileAsset?.url || s.imageUrl;
                                        return (
                                            <div key={s.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden hover:shadow-lg hover:border-slate-300 transition-all group">
                                                {img ? (
                                                    <div className="h-32 overflow-hidden">
                                                        <img src={img} alt={s.name} loading="lazy" className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                                    </div>
                                                ) : (
                                                    <div className="h-24 bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center">
                                                        <Wrench className="h-10 w-10 text-[#0b2447]/20" />
                                                    </div>
                                                )}
                                                <div className="p-4 space-y-2">
                                                    {s.category?.name && <p className="text-[9px] font-bold text-[#0b2447]/50 uppercase tracking-wider">{s.category.name}</p>}
                                                    <Link 
                                                        href={`/marketplace/services/${s.id}`}
                                                        onClick={(e) => { e.preventDefault(); goToServiceDetail(s); }}
                                                    >
                                                        <h3 className="text-xs font-semibold text-slate-800 line-clamp-2 hover:text-[#0b2447] transition">{s.name}</h3>
                                                    </Link>
                                                    {s.description && <p className="text-[10px] text-slate-500 line-clamp-2">{s.description}</p>}
                                                    {s.serviceArea && <p className="text-[10px] text-slate-400 inline-flex items-center gap-1"><MapPin className="h-3 w-3" />{s.serviceArea}</p>}
                                                    <div className="pt-1">
                                                        {s.basePrice ? <p className="text-sm font-bold text-[#0b2447]">₹{Number(s.basePrice).toLocaleString('en-IN')}<span className="text-[9px] font-normal text-slate-400 ml-1">{PRICING_LABELS[s.pricingModel]}</span></p>
                                                            : <p className="text-[10px] font-semibold text-amber-700 bg-amber-50 inline-block px-1.5 py-0.5 rounded">Quote Based</p>}
                                                    </div>
                                                    <div className="flex gap-2">
                                                        <Link 
                                                            href={`/marketplace/services/${s.id}`} 
                                                            onClick={(e) => { e.preventDefault(); goToServiceDetail(s); }}
                                                            className="flex-1 inline-flex items-center justify-center h-8 rounded-lg border border-slate-200 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 transition"
                                                        >
                                                            View Details
                                                        </Link>
                                                        <button onClick={() => handleRequestQuote(s)} className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-lg bg-[#0b2447] text-white text-[10px] font-semibold hover:bg-[#12335f] transition [&:not(:disabled):hover]:translate-y-0">
                                                            <FileText className="h-3 w-3" /> Request Quote
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── About tab ── */}
                    {tab === 'about' && (
                        <div className="grid lg:grid-cols-2 gap-5">
                            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                                <h3 className="text-sm font-bold text-[#0b2447]">Business Profile</h3>
                                {[
                                    ['Business Name', name],
                                    ['Organization Type', profile.organizationType || '—'],
                                    ['MSME Category', profile.msmeCategory || profile.msmeType || '—'],
                                    ['Vendor Type', profile.vendorType || '—'],
                                    ['GST Status', profile.panVerified ? 'Verified' : 'Pending'],
                                ].map(([label, value]) => (
                                    <div key={label}>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                                        <p className="text-xs font-semibold text-slate-800 mt-0.5">{value}</p>
                                    </div>
                                ))}
                            </div>
                            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
                                <h3 className="text-sm font-bold text-[#0b2447]">Contact Information</h3>
                                {vendor.email && <div className="flex items-center gap-2 text-xs text-slate-700"><Mail className="h-4 w-4 text-slate-400 shrink-0" />{vendor.email}</div>}
                                {vendor.mobile && <div className="flex items-center gap-2 text-xs text-slate-700"><Phone className="h-4 w-4 text-slate-400 shrink-0" />{vendor.mobile}</div>}
                                {profile.website && <div className="flex items-center gap-2 text-xs text-slate-700"><Globe className="h-4 w-4 text-slate-400 shrink-0" /><a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-[#0b2447] hover:underline">{profile.website}</a></div>}
                                {loc && <div className="flex items-center gap-2 text-xs text-slate-700"><MapPin className="h-4 w-4 text-slate-400 shrink-0" />{loc}</div>}
                                {profile.productCategories?.length > 0 && (
                                    <div>
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Product Categories</p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {profile.productCategories.map((c: string) => (
                                                <span key={c} className="px-2 py-0.5 rounded-md bg-blue-50 border border-blue-100 text-[10px] font-semibold text-blue-700">{c}</span>
                                            ))}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <MarketplaceFooter />
        </div>
    );
}
