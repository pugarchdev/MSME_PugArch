'use client';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, usePathname } from 'next/navigation';
import { Search, ChevronRight, Package, MapPin, BadgeCheck, ShoppingCart, Eye, ChevronLeft, Wrench } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type MarketplaceProduct, type MarketplaceCategory, type MarketplaceService } from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, unwrapApiData } from '../../../lib/api';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';
import { SortableHeader, type SortDirection } from '../../shared/SortableHeader';

const fallbackProducts: MarketplaceProduct[] = [
    {
        id: -1,
        name: 'Industrial Safety Kit',
        price: 2499,
        currency: 'INR',
        unitOfMeasure: 'kit',
        status: 'ACTIVE',
        category: { id: 0, name: 'Safety Equipment' },
        organization: { id: 0, organizationName: 'Verified MSME Supplier', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        images: [{ id: -1, fileAsset: { id: -1, url: 'https://picsum.photos/seed/msme-safety-kit/640/420' } }]
    },
    {
        id: -2,
        name: 'Office Furniture Bundle',
        price: 18500,
        currency: 'INR',
        unitOfMeasure: 'set',
        status: 'ACTIVE',
        category: { id: 0, name: 'Office Supplies' },
        organization: { id: 0, organizationName: 'Registered MSME Vendor', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        images: [{ id: -2, fileAsset: { id: -2, url: 'https://picsum.photos/seed/msme-office-furniture/640/420' } }]
    },
    {
        id: -3,
        name: 'Electrical Maintenance Spares',
        price: 7200,
        currency: 'INR',
        unitOfMeasure: 'lot',
        status: 'ACTIVE',
        category: { id: 0, name: 'Electricals' },
        organization: { id: 0, organizationName: 'Verified Seller Organization', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        images: [{ id: -3, fileAsset: { id: -3, url: 'https://picsum.photos/seed/msme-electrical-spares/640/420' } }]
    },
    {
        id: -4,
        name: 'Construction Material Pack',
        price: 12800,
        currency: 'INR',
        unitOfMeasure: 'pack',
        status: 'ACTIVE',
        category: { id: 0, name: 'Construction Materials' },
        organization: { id: 0, organizationName: 'Local MSME Supplier', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        images: [{ id: -4, fileAsset: { id: -4, url: 'https://picsum.photos/seed/msme-construction-material/640/420' } }]
    }
];

const fallbackServices: MarketplaceService[] = [
    {
        id: -1,
        name: 'Industrial Equipment Maintenance',
        pricingModel: 'PER_PROJECT',
        basePrice: 15000,
        currency: 'INR',
        serviceArea: 'District-wide',
        status: 'ACTIVE',
        category: { id: 0, name: 'Maintenance Services' },
        organization: { id: 0, organizationName: 'Verified Service Provider', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        imageUrl: 'https://picsum.photos/seed/msme-industrial-maintenance/640/420'
    },
    {
        id: -2,
        name: 'Logistics and Local Transport',
        pricingModel: 'CUSTOM',
        currency: 'INR',
        serviceArea: 'Jharsuguda',
        status: 'ACTIVE',
        category: { id: 0, name: 'Logistics' },
        organization: { id: 0, organizationName: 'Registered MSME Logistics', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        imageUrl: 'https://picsum.photos/seed/msme-local-logistics/640/420'
    },
    {
        id: -3,
        name: 'IT Hardware Support',
        pricingModel: 'MONTHLY',
        basePrice: 8000,
        currency: 'INR',
        serviceArea: 'On-site',
        status: 'ACTIVE',
        category: { id: 0, name: 'IT Services' },
        organization: { id: 0, organizationName: 'Local IT MSME', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        imageUrl: 'https://picsum.photos/seed/msme-it-support/640/420'
    },
    {
        id: -4,
        name: 'Civil Works and Repairs',
        pricingModel: 'PER_PROJECT',
        basePrice: 22000,
        currency: 'INR',
        serviceArea: 'Jharsuguda',
        status: 'ACTIVE',
        category: { id: 0, name: 'Construction Services' },
        organization: { id: 0, organizationName: 'Verified Contractor MSME', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        imageUrl: 'https://picsum.photos/seed/msme-civil-works/640/420'
    }
];
type MarketplaceSortKey = 'name' | 'seller' | 'category' | 'price' | 'status';

export default function MarketplaceProductList() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const pathname = usePathname() || '';
    const isServices = pathname.includes('/services');
    const queryClient = useQueryClient();

    const [query, setQuery] = useState(searchParams?.get('q') || '');
    const [categoryId, setCategoryId] = useState(searchParams?.get('categoryId') || '');
    const [sort, setSort] = useState(searchParams?.get('sort') || 'latest');
    const [page, setPage] = useState(Number(searchParams?.get('page')) || 1);
    const [viewMode, setViewMode] = useResponsiveViewMode(`phase7:marketplace:${isServices ? 'services' : 'products'}:view-mode`);
    const [tableSortKey, setTableSortKey] = useState<MarketplaceSortKey>('name');
    const [tableSortDirection, setTableSortDirection] = useState<SortDirection>('asc');

    const { data: homeData } = useQuery({
        queryKey: ['marketplaceHomeData'],
        queryFn: () => marketplaceApi.getHomeData(),
        initialData: () => {
            const cached = api.peek('/api/marketplace/home');
            return cached ? unwrapApiData(cached) : undefined;
        }
    });
    const categories = homeData?.categories || [];

    const qs = new URLSearchParams({
        page: String(page),
        pageSize: '12',
        sort,
        ...(query ? { q: query } : {}),
        ...(categoryId ? { categoryId: String(categoryId) } : {}),
    }).toString();
    const cacheUrl = isServices ? `/api/marketplace/services?${qs}` : `/api/marketplace/products?${qs}`;

    const { data: listData, isLoading } = useQuery({
        queryKey: ['marketplaceList', isServices, query, categoryId, sort, page],
        queryFn: () => {
            const params: Record<string, string | number> = { page, pageSize: 12, sort };
            if (query) params.q = query;
            if (categoryId) params.categoryId = categoryId;
            return isServices ? marketplaceApi.getServices(params) : marketplaceApi.getProducts(params);
        },
        placeholderData: keepPreviousData,
        initialData: () => {
            const cached = api.peek(cacheUrl);
            return cached ? unwrapApiData(cached) : undefined;
        },
    });

    const apiItems = isServices ? (listData?.services || []) : (listData?.products || []);
    const isShowingFallback = apiItems.length === 0 && !query && !categoryId;
    const items = isShowingFallback ? (isServices ? fallbackServices : fallbackProducts) : apiItems;
    const total = isShowingFallback ? items.length : listData?.total || 0;
    const totalPages = isShowingFallback ? 1 : listData?.totalPages || 0;
    const sortedItems = useMemo(() => [...items].sort((a: any, b: any) => {
        const valueFor = (item: any) => {
            if (tableSortKey === 'seller') return item.organization?.organizationName || item.seller?.name || '';
            if (tableSortKey === 'category') return item.category?.name || '';
            if (tableSortKey === 'price') return Number(isServices ? item.basePrice || 0 : item.price || 0);
            if (tableSortKey === 'status') return item.status || '';
            return item.name || '';
        };
        const av = valueFor(a);
        const bv = valueFor(b);
        const result = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
        return tableSortDirection === 'asc' ? result : -result;
    }), [isServices, items, tableSortDirection, tableSortKey]);

    const toggleTableSort = (field: MarketplaceSortKey) => {
        setTableSortDirection(prev => tableSortKey === field && prev === 'asc' ? 'desc' : 'asc');
        setTableSortKey(field);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
    };

    const cartMutation = useMutation({
        mutationFn: async ({ id, isService }: { id: number; isService: boolean }) => {
            return marketplaceApi.addGuestCartItem(isService ? { serviceId: id, quantity: 1 } : { productId: id, quantity: 1 });
        },
        onMutate: async ({ id, isService }) => {
            await queryClient.cancelQueries({ queryKey: ['guestCart'] });
            const previousCart = queryClient.getQueryData(['guestCart']);
            const currentCart = previousCart as any || { items: [] };
            
            const existingIndex = currentCart.items?.findIndex((item: any) => 
                isService ? item.serviceId === id : item.productId === id
            );

            let newItems = [...(currentCart.items || [])];
            if (existingIndex >= 0) {
                newItems[existingIndex] = {
                    ...newItems[existingIndex],
                    quantity: (newItems[existingIndex].quantity || 0) + 1
                };
            } else {
                newItems.push({
                    id: Date.now(),
                    productId: isService ? undefined : id,
                    serviceId: isService ? id : undefined,
                    quantity: 1,
                    itemType: isService ? 'SERVICE' : 'PRODUCT'
                });
            }

            queryClient.setQueryData(['guestCart'], {
                ...currentCart,
                items: newItems
            });

            return { previousCart };
        },
        onSuccess: (data) => {
            if (data?.cart) {
                queryClient.setQueryData(['guestCart'], data.cart);
            }
            queryClient.invalidateQueries({ queryKey: ['guestCart'] });
        },
        onError: (error: any, variables, context: any) => {
            if (context?.previousCart) {
                queryClient.setQueryData(['guestCart'], context.previousCart);
            }
            toast.error(error?.message || 'Unable to update cart');
        }
    });

    const handleAddToCart = (id: number) => {
        cartMutation.mutate({ id, isService: isServices });
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
                        <span className="text-slate-700 font-medium">{isServices ? 'Services' : 'Products'}</span>
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
                                onChange={e => { setQuery(e.target.value); setPage(1); }}
                                placeholder={isServices ? "Search services..." : "Search products..."}
                                className="w-full h-10 pl-10 pr-4 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20"
                            />
                        </form>
                        <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setPage(1); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                            <option value="">All Categories</option>
                            {categories.filter((c: any) => isServices ? c.type === 'SERVICE' : c.type === 'PRODUCT').map((c: any) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                            <option value="latest">Latest First</option>
                            <option value="price_asc">Price: Low to High</option>
                            <option value="price_desc">Price: High to Low</option>
                            <option value="name">Name A-Z</option>
                        </select>
                        <ViewModeToggle value={viewMode} onChange={setViewMode} />
                    </div>

                    {/* Results Count */}
                    <p className="text-xs text-slate-500 mb-4">{total} {isServices ? 'service' : 'product'}{total !== 1 ? 's' : ''} found</p>

                    {/* Product / Service Grid */}
                    {isLoading && items.length === 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-64 bg-slate-100 rounded-lg animate-pulse" />)}
                        </div>
                    ) : items.length === 0 ? (
                        <div className="text-center py-16">
                            {isServices ? <Wrench className="h-12 w-12 text-slate-300 mx-auto mb-3" /> : <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />}
                            <p className="text-sm text-slate-500">No {isServices ? 'services' : 'products'} found matching your criteria.</p>
                        </div>
                    ) : viewMode === 'list' ? (
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[920px] text-left text-sm">
                                    <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                                        <tr>
                                            <th className="px-4 py-3"><SortableHeader label={isServices ? 'Service' : 'Product'} field="name" activeField={tableSortKey} direction={tableSortDirection} onSort={toggleTableSort} /></th>
                                            <th className="px-4 py-3"><SortableHeader label="Seller" field="seller" activeField={tableSortKey} direction={tableSortDirection} onSort={toggleTableSort} /></th>
                                            <th className="px-4 py-3"><SortableHeader label="Category" field="category" activeField={tableSortKey} direction={tableSortDirection} onSort={toggleTableSort} /></th>
                                            <th className="px-4 py-3 text-right"><SortableHeader label="Price" field="price" activeField={tableSortKey} direction={tableSortDirection} onSort={toggleTableSort} className="justify-end" /></th>
                                            <th className="px-4 py-3"><SortableHeader label="Status" field="status" activeField={tableSortKey} direction={tableSortDirection} onSort={toggleTableSort} /></th>
                                            <th className="px-4 py-3 text-right font-black">Actions</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100">
                                        {sortedItems.map((item: any) => {
                                            const isFallback = item.id < 0;
                                            const isVerified = item.organization?.verificationStatus === 'VERIFIED';
                                            const location = item.organization?.city || item.organization?.district || item.organization?.state;
                                            const itemPrice = isServices ? item.basePrice : item.price;
                                            const detailUrl = isFallback
                                                ? (isServices ? '/marketplace/services' : '/marketplace/products')
                                                : (isServices ? `/marketplace/services/${item.id}` : `/marketplace/products/${item.id}`);
                                            return (
                                                <tr key={item.id} className="bg-white transition hover:bg-blue-50/50">
                                                    <td className="px-4 py-3">
                                                        <Link
                                                            href={detailUrl}
                                                            onClick={() => {
                                                                if (isFallback) return;
                                                                queryClient.setQueryData(
                                                                    [isServices ? 'marketplaceService' : 'marketplaceProduct', item.id],
                                                                    isServices ? { service: item } : { product: item }
                                                                );
                                                            }}
                                                            className="text-xs font-black text-slate-900 hover:text-[#0b2447]"
                                                        >
                                                            {item.name}
                                                        </Link>
                                                        <p className="mt-1 text-[10px] font-semibold text-slate-500">{isServices ? item.pricingModel || 'Service' : item.unitOfMeasure || 'Unit'}{location ? ` | ${location}` : ''}</p>
                                                    </td>
                                                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">
                                                        <span className="text-wrap-anywhere">{item.organization?.organizationName || item.seller?.name || 'Verified seller'}</span>
                                                        {isVerified && <span className="ml-2 inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">Verified</span>}
                                                    </td>
                                                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.category?.name || '-'}</td>
                                                    <td className="px-4 py-3 text-right text-xs font-black text-[#0b2447]">{itemPrice ? `INR ${Number(itemPrice).toLocaleString('en-IN')}` : 'Request quote'}</td>
                                                    <td className="px-4 py-3">
                                                        <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-black uppercase text-blue-700">{item.status || 'ACTIVE'}</span>
                                                    </td>
                                                    <td className="px-4 py-3">
                                                        <div className="flex justify-end gap-2">
                                                            <Link href={detailUrl} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-700 hover:bg-slate-50">
                                                                <Eye className="h-3 w-3" /> {isFallback ? 'Browse' : 'Details'}
                                                            </Link>
                                                            {!isFallback && (
                                                                <button onClick={() => handleAddToCart(item.id)} className="inline-flex h-8 items-center gap-1 rounded-md bg-[#0b2447] px-3 text-[10px] font-black text-white hover:bg-[#12335f]">
                                                                    <ShoppingCart className="h-3 w-3" /> Cart
                                                                </button>
                                                            )}
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {sortedItems.map((item: any) => {
                                const isFallback = item.id < 0;
                                const imageUrl = item.imageUrl || (!isServices ? item.images?.[0]?.fileAsset?.url : undefined);
                                const isVerified = item.organization?.verificationStatus === 'VERIFIED';
                                const location = item.organization?.city || item.organization?.district || item.organization?.state;
                                const itemPrice = isServices ? item.basePrice : item.price;
                                const detailUrl = isFallback
                                    ? (isServices ? '/marketplace/services' : '/marketplace/products')
                                    : (isServices ? `/marketplace/services/${item.id}` : `/marketplace/products/${item.id}`);
                                return (
                                    <div key={item.id} className="bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg hover:border-slate-300 transition-all flex flex-col justify-between">
                                        <div>
                                            <Link 
                                                href={detailUrl} 
                                                onClick={() => {
                                                    if (isFallback) return;
                                                    queryClient.setQueryData(
                                                        [isServices ? 'marketplaceService' : 'marketplaceProduct', item.id],
                                                        isServices ? { service: item } : { product: item }
                                                    );
                                                }}
                                                className="block relative h-36 bg-slate-100 overflow-hidden"
                                            >
                                                {imageUrl ? (
                                                    <img src={imageUrl} alt={item.name} className="w-full h-full object-cover hover:scale-105 transition-transform duration-300" />
                                                ) : (
                                                    <div className="w-full h-full flex items-center justify-center">
                                                        {isServices ? <Wrench className="h-10 w-10 text-slate-300" /> : <Package className="h-10 w-10 text-slate-300" />}
                                                    </div>
                                                )}
                                                {isVerified && (
                                                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-green-50 border border-green-200 text-[8px] font-bold text-green-700">
                                                        <BadgeCheck className="h-2.5 w-2.5" />Verified
                                                    </span>
                                                )}
                                            </Link>
                                            <div className="p-3 space-y-1.5">
                                                {item.category && <span className="text-[9px] font-bold text-[#0b2447]/60 uppercase tracking-wider">{item.category.name}</span>}
                                                <Link 
                                                    href={detailUrl}
                                                    onClick={() => {
                                                        if (isFallback) return;
                                                        queryClient.setQueryData(
                                                            [isServices ? 'marketplaceService' : 'marketplaceProduct', item.id],
                                                            isServices ? { service: item } : { product: item }
                                                        );
                                                    }}
                                                >
                                                    <h3 className="text-xs font-semibold text-slate-800 line-clamp-2 hover:text-[#0b2447] transition">{item.name}</h3>
                                                </Link>
                                                {item.organization && <p className="text-[10px] text-slate-500 truncate">{item.organization.organizationName}</p>}
                                                {location && <p className="text-[9px] text-slate-400 inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{location}</p>}
                                            </div>
                                        </div>
                                        <div className="p-3 pt-0 space-y-1.5">
                                            <div className="pt-1">
                                                {itemPrice ? (
                                                    <p className="text-sm font-bold text-[#0b2447]">
                                                        ₹{Number(itemPrice).toLocaleString('en-IN')}
                                                        {isServices && item.pricingModel && (
                                                            <span className="text-[9px] font-normal text-slate-400 ml-1">/ {item.pricingModel.toLowerCase()}</span>
                                                        )}
                                                    </p>
                                                ) : (
                                                    <p className="text-[10px] font-semibold text-amber-700 bg-amber-50 inline-block px-1.5 py-0.5 rounded">Quote Based</p>
                                                )}
                                            </div>
                                            <div className="flex gap-2 pt-1.5">
                                                <Link 
                                                    href={detailUrl} 
                                                    onClick={() => {
                                                        if (isFallback) return;
                                                        queryClient.setQueryData(
                                                            [isServices ? 'marketplaceService' : 'marketplaceProduct', item.id],
                                                            isServices ? { service: item } : { product: item }
                                                        );
                                                    }}
                                                    className="flex-1 inline-flex items-center justify-center gap-1 h-7 rounded-md border border-slate-200 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition"
                                                >
                                                    <Eye className="h-3 w-3" />{isFallback ? 'Browse' : 'Details'}
                                                </Link>
                                                {!isFallback && (
                                                    <button onClick={() => handleAddToCart(item.id)} className="inline-flex items-center justify-center h-7 w-7 rounded-md bg-[#0b2447] text-white hover:bg-[#12335f] active:scale-90 transition" aria-label="Add to cart"><ShoppingCart className="h-3 w-3" /></button>
                                                )}
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
