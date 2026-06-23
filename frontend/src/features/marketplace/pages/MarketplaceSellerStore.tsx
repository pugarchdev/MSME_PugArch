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
    ShoppingCart, FileText, Globe, Mail, Phone, X, User,
    Send, MessageSquare
} from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { MarketplaceItemCard } from '../components/MarketplaceItemCard';
import { saveSupplier } from '../utils/savedSuppliers';

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
            api.get(`/api/marketplace/sellers/${sellerId}`)
                .then(r => readJsonResponse(r))
                .then(b => b && b.success !== false ? unwrapApiData(b) : null)
                .catch(() => null),
            api.get(`/api/products/search?organizationId=${sellerId}&take=48`)
                .then(r => readJsonResponse(r))
                .then(b => unwrapApiData<any>(b))
                .catch(() => ({ products: [] })),
            api.get(`/api/services/search?organizationId=${sellerId}&take=48`)
                .then(r => readJsonResponse(r))
                .then(b => unwrapApiData<any>(b))
                .catch(() => ({ services: [] })),
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
    const sellerUserId = Number(vendor.sellerUserId || 0);

    const handleSaveSupplier = () => {
        saveSupplier({
            id: vendor.id,
            sellerUserId: sellerUserId || null,
            name,
            location: loc,
            verificationStatus: 'VERIFIED',
            email: vendor.email,
            mobile: vendor.mobile,
            source: 'Seller store',
        });
        toast.success('Supplier saved');
    };

    return (
        <div className="min-h-dvh bg-slate-50 flex flex-col font-sans">
            <div className="brand-tricolor-strip w-full" />
            <MarketplaceHeader user={user} />

            <main className="flex-1 pb-16">
                {/* Breadcrumb */}
                <div className="bg-white/80 backdrop-blur-md border-b border-slate-200/50 sticky top-0 z-10">
                    <div className="max-w-7xl mx-auto px-4 py-3.5 flex items-center gap-2 text-[11px] text-slate-500 font-medium">
                        <Link href="/" className="hover:text-[#0b2447] transition">Home</Link>
                        <ChevronRight className="h-3 w-3 text-slate-400" />
                        <Link href="/marketplace/sellers" className="hover:text-[#0b2447] transition">Verified Sellers</Link>
                        <ChevronRight className="h-3 w-3 text-slate-400" />
                        <span className="text-slate-700 font-extrabold truncate max-w-[200px]">{name}</span>
                    </div>
                </div>

                {/* Seller Hero Card */}
                <div className="bg-white border-b border-slate-200">
                    {/* Banner Area */}
                    <div className="w-full h-48 sm:h-64 md:h-80 relative overflow-hidden bg-gradient-to-r from-[#07172e] via-[#0b2447] to-[#12335f]">
                        {vendor.bannerUrl ? (
                            <img
                                src={vendor.bannerUrl}
                                alt={`${name} Banner`}
                                className="w-full h-full object-cover"
                            />
                        ) : (
                            <>
                                <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_30%,rgba(255,145,0,0.1),transparent_40%)]" />
                                <div className="absolute inset-0 bg-[linear-gradient(to_bottom,transparent_50%,rgba(7,23,46,0.4))]" />
                            </>
                        )}
                        <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/20 to-transparent" />
                        
                        {/* Back Button overlay on banner */}
                        <div className="absolute top-4 left-4 z-20">
                            <button
                                onClick={() => router.back()}
                                className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white bg-slate-950/40 hover:bg-slate-950/60 border border-white/10 px-3 py-1.5 rounded-lg backdrop-blur-sm transition-all"
                            >
                                <ArrowLeft className="h-3.5 w-3.5" /> Back
                            </button>
                        </div>
                    </div>

                    {/* Profile Header Info with Overlapping Logo */}
                    <div className="max-w-7xl mx-auto px-4 pb-6 pt-16 sm:pt-20 relative">
                        {/* Logo Box */}
                        <div className="absolute -top-16 sm:-top-20 left-4 w-28 h-28 sm:w-36 sm:h-36 rounded-2xl bg-white border border-slate-200/80 shadow-lg flex items-center justify-center p-2 z-20 transition-transform duration-300 hover:scale-105">
                            {vendor.logoUrl ? (
                                <img 
                                    src={vendor.logoUrl} 
                                    alt={`${name} Logo`} 
                                    className="w-full h-full object-contain rounded-xl bg-white" 
                                />
                            ) : (
                                <div className="w-full h-full rounded-xl flex items-center justify-center text-4xl sm:text-5xl font-black bg-gradient-to-br from-blue-50 to-indigo-100 text-[#0b2447] border border-indigo-150">
                                    {initial}
                                </div>
                            )}
                        </div>

                        {/* Content Grid */}
                        <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 pl-0 sm:pl-40 pt-2 sm:pt-0">
                            <div className="min-w-0 space-y-2">
                                <div className="flex flex-wrap items-center gap-2">
                                    <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-blue-700">
                                        Verified Seller
                                    </span>
                                    {profile.isUdyamCertified && (
                                        <span className="inline-flex items-center gap-1 rounded-full border border-green-200 bg-green-50 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest text-green-700">
                                            <BadgeCheck className="h-3.5 w-3.5 text-green-600" /> Udyam Certified
                                        </span>
                                    )}
                                </div>
                                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 leading-tight">{name}</h1>

                                {/* Representative Name */}
                                {vendor.sellerName && (
                                    <p className="text-xs text-slate-600 font-medium inline-flex items-center gap-1.5 bg-slate-100 px-3 py-1 rounded-lg border border-slate-200">
                                        <User className="h-3.5 w-3.5 text-blue-600" />
                                        Representative: <span className="text-slate-800 font-bold">{vendor.sellerName}</span>
                                    </p>
                                )}

                                <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-2 text-xs font-semibold text-slate-500">
                                    {loc && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-orange-500" />{loc}</span>}
                                    {profile.organizationType && <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">{profile.organizationType.replace(/_/g, ' ')}</span>}
                                    {profile.msmeCategory && <span className="px-2 py-0.5 rounded bg-slate-100 border border-slate-200">MSME: {profile.msmeCategory}</span>}
                                </div>
                            </div>

                            {/* Stats */}
                            <div className="flex gap-4 shrink-0">
                                <div className="text-center min-w-[90px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm hover:border-slate-300 transition-all">
                                    <p className="text-2xl font-black text-[#0b2447] leading-tight">{products.length}</p>
                                    <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mt-0.5">Products</p>
                                </div>
                                <div className="text-center min-w-[90px] px-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl shadow-sm hover:border-slate-300 transition-all">
                                    <p className="text-2xl font-black text-[#0b2447] leading-tight">{services.length}</p>
                                    <p className="text-[9px] font-extrabold uppercase tracking-wider text-slate-400 mt-0.5">Services</p>
                                </div>
                            </div>
                        </div>

                        {/* Action buttons for logged-in Buyers */}
                        {user?.role === 'buyer' && (
                            <div className="flex flex-wrap gap-3 mt-6 pt-6 border-t border-slate-100 pl-0 sm:pl-40">
                                <button
                                    onClick={() => router.push(`/buyer/rfq?sellerId=${sellerUserId || vendor.id}`)}
                                    className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-orange-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-orange-600 active:scale-95 transition-all shadow-md shadow-orange-500/25 cursor-pointer"
                                >
                                    <Send className="h-4 w-4" /> Send RFQ
                                </button>
                                <button
                                    onClick={() => router.push(`/buyer/direct-purchase?sellerId=${sellerUserId || vendor.id}`)}
                                    className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-[#0b2447] hover:bg-[#12335f] text-white text-xs font-bold uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
                                >
                                    <ShoppingCart className="h-4 w-4" /> Direct Purchase
                                </button>
                                <button
                                    onClick={() => sellerUserId ? router.push(`/buyer/messages?sellerId=${sellerUserId}&subject=${encodeURIComponent(`Supplier inquiry: ${name}`)}`) : toast.error('Seller contact is not available for this store.')}
                                    className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
                                >
                                    <MessageSquare className="h-4 w-4 text-slate-500" /> Message Seller
                                </button>
                                <button
                                    onClick={handleSaveSupplier}
                                    className="inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-bold uppercase tracking-wider active:scale-95 transition-all cursor-pointer"
                                >
                                    <Building2 className="h-4 w-4 text-slate-500" /> Save Supplier
                                </button>
                            </div>
                        )}
                    </div>
                </div>

                {/* Tabs */}
                <div className="bg-white border-b border-slate-200 sticky top-[45px] z-10 shadow-sm">
                    <div className="max-w-7xl mx-auto px-4 flex gap-1">
                        {([['products', `Products (${products.length})`], ['services', `Services (${services.length})`], ['about', 'About Seller']] as const).map(([id, label]) => (
                            <button
                                key={id}
                                onClick={() => setTab(id)}
                                className={`relative h-12 px-6 text-xs font-black uppercase tracking-wider border-b-2 transition-all duration-300 active:scale-95 [&:not(:disabled):hover]:translate-y-0 ${tab === id
                                    ? 'border-[#0b2447] text-[#0b2447] font-extrabold'
                                    : 'border-transparent text-slate-500 hover:text-slate-800 hover:border-slate-300'
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 py-8">
                    {/* ── Search + Filter bar (products/services tabs) ── */}
                    {tab !== 'about' && (
                        <div className="bg-white/95 backdrop-blur-md rounded-2xl border border-slate-200/80 p-5 mb-8 shadow-sm space-y-4">
                            <div className="flex gap-4 flex-col sm:flex-row">
                                <form onSubmit={e => e.preventDefault()} className="flex flex-1 items-center h-11 rounded-xl border border-slate-200 bg-slate-50/50 focus-within:ring-2 focus-within:ring-[#0b2447]/20 overflow-hidden transition-all duration-200">
                                    <Search className="h-4 w-4 text-slate-400 ml-4 shrink-0" />
                                    <input
                                        value={q}
                                        onChange={e => setQ(e.target.value)}
                                        placeholder={tab === 'products' ? 'Search products by name or brand…' : 'Search services by name…'}
                                        className="flex-1 h-full bg-transparent text-sm pl-3 pr-2 outline-none font-medium placeholder-slate-400"
                                    />
                                    {q && <button type="button" onClick={() => setQ('')} className="px-3 hover:bg-slate-100 transition-colors h-full"><X className="h-4 w-4 text-slate-400" /></button>}
                                </form>

                                {tab === 'products' && (
                                    <select value={sortBy} onChange={e => setSortBy(e.target.value)} className="h-11 px-4 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 sm:w-48 transition-all font-medium">
                                        <option value="latest">Latest First</option>
                                        <option value="price_asc">Price: Low to High</option>
                                        <option value="price_desc">Price: High to Low</option>
                                        <option value="name">Name A–Z</option>
                                    </select>
                                )}

                                {tab === 'products' && (
                                    <button
                                        onClick={() => setShowF(v => !v)}
                                        className={`inline-flex items-center justify-center gap-2 h-11 px-5 rounded-xl border text-xs font-bold tracking-wide transition-all active:scale-95 [&:not(:disabled):hover]:translate-y-0 ${showF
                                            ? 'bg-[#0b2447] text-white border-[#0b2447] shadow-md'
                                            : 'border-slate-200 text-slate-700 hover:bg-slate-50/80 bg-white'
                                            }`}
                                    >
                                        <SlidersHorizontal className="h-4 w-4" /> Filters
                                    </button>
                                )}
                            </div>

                            {showF && tab === 'products' && (
                                <div className="grid sm:grid-cols-2 gap-4 pt-4 border-t border-slate-100 animate-fadeIn">
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Min Price (₹)</label>
                                        <input type="number" value={minP} onChange={e => setMinP(e.target.value)} placeholder="0" className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 transition-all font-medium" />
                                    </div>
                                    <div>
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">Max Price (₹)</label>
                                        <input type="number" value={maxP} onChange={e => setMaxP(e.target.value)} placeholder="Any" className="w-full h-10 px-3 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 transition-all font-medium" />
                                    </div>
                                    {(minP || maxP) && (
                                        <div className="sm:col-span-2 pt-2">
                                            <button onClick={() => { setMinP(''); setMaxP(''); }} className="text-xs font-bold text-red-600 hover:text-red-700 hover:underline inline-flex items-center gap-1 transition">Reset Price Filter</button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    )}

                    {/* ── Products tab ── */}
                    {tab === 'products' && (
                        <>
                            <div className="flex items-center justify-between mb-5">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{filteredProducts.length} product{filteredProducts.length !== 1 ? 's' : ''} found</p>
                            </div>
                            {filteredProducts.length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
                                    <Package className="h-12 w-12 text-slate-300 mx-auto mb-4 animate-pulse" />
                                    <h3 className="text-sm font-extrabold text-slate-700">No Products Available</h3>
                                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">This vendor hasn't posted any products matching the filter criteria yet.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">
                                    {filteredProducts.map((p: any) => (
                                        <MarketplaceItemCard key={p.id} item={p} itemType="product" className="w-full sm:w-full 2xl:w-full" />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── Services tab ── */}
                    {tab === 'services' && (
                        <>
                            <div className="flex items-center justify-between mb-5">
                                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider">{filteredServices.length} service{filteredServices.length !== 1 ? 's' : ''} found</p>
                            </div>
                            {filteredServices.length === 0 ? (
                                <div className="text-center py-20 bg-white rounded-2xl border border-slate-200/80 shadow-sm">
                                    <Wrench className="h-12 w-12 text-slate-300 mx-auto mb-4 animate-pulse" />
                                    <h3 className="text-sm font-extrabold text-slate-700">No Services Available</h3>
                                    <p className="text-xs text-slate-400 mt-1 max-w-md mx-auto">This vendor hasn't posted any services matching the search terms yet.</p>
                                </div>
                            ) : (
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                                    {filteredServices.map((s: any) => (
                                        <MarketplaceItemCard key={s.id} item={s} itemType="service" className="w-full sm:w-full 2xl:w-full" />
                                    ))}
                                </div>
                            )}
                        </>
                    )}

                    {/* ── About tab ── */}
                    {tab === 'about' && (
                        <div className="max-w-3xl mx-auto space-y-6">
                            <div className="bg-white rounded-2xl border border-slate-200/80 p-6 space-y-5 shadow-sm">
                                <h3 className="text-sm font-black uppercase tracking-wider text-[#0b2447] border-b border-slate-100 pb-3">Business Profile</h3>
                                <div className="grid sm:grid-cols-2 gap-4">
                                    {[
                                        ['Business Name', name],
                                        ['Organization Type', profile.organizationType || '—'],
                                        ['MSME Category', profile.msmeCategory || profile.msmeType || '—'],
                                        ['Vendor Type', profile.vendorType || '—'],
                                    ].map(([label, value]) => (
                                        <div key={label} className="space-y-0.5">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
                                            <p className="text-xs font-bold text-slate-800">{value}</p>
                                        </div>
                                    ))}
                                    {profile.website && (
                                        <div className="space-y-0.5 sm:col-span-2">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Website</p>
                                            <a href={profile.website} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-[#0b2447] hover:underline truncate block">
                                                {profile.website}
                                            </a>
                                        </div>
                                    )}
                                </div>

                                {profile.productCategories?.length > 0 && (
                                    <div className="pt-4 border-t border-slate-100">
                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Product Categories</p>
                                        <div className="flex flex-wrap gap-2">
                                            {profile.productCategories.map((c: string) => (
                                                <span key={c} className="px-3 py-1 rounded-lg bg-blue-50/60 border border-blue-100 text-[10px] font-black uppercase tracking-wider text-blue-700">{c}</span>
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
