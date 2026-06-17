'use client';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, usePathname, useRouter } from 'next/navigation';
import { Search, ChevronRight, Package, MapPin, BadgeCheck, ShoppingCart, Eye, ChevronLeft, Wrench, SlidersHorizontal, FileText, Minus, Plus } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi } from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient, keepPreviousData } from '@tanstack/react-query';
import { api, unwrapApiData } from '../../../lib/api';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';
import { SortableHeader, type SortDirection } from '../../shared/SortableHeader';
import { useDebounce } from '../../../hooks/useDebounce';
import { CompareToggleButton } from '../components/CompareToggleButton';
import { CompareTray } from '../components/CompareTray';
import { CategoryCatalogueStrip } from '../components/CategoryCatalogueStrip';
import { resolveMarketplaceImage } from '../utils/marketplaceImages';
import { useGuestCart } from '../hooks/useGuestCart';
import { cn } from '../../../lib/utils';

type MarketplaceSortKey = 'name' | 'seller' | 'category' | 'price' | 'status';

export default function MarketplaceProductList() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const pathname = usePathname() || '';
    const isBuyerMarketplace = pathname === '/buyer/marketplace';
    const router = useRouter();
    const isServices = pathname.includes('/services') || searchParams?.get('type') === 'services';
    const queryClient = useQueryClient();
    const { items: cartItems, add: addGuestCartItem, update: updateGuestCartItem } = useGuestCart();

    const [query, setQuery] = useState(searchParams?.get('q') || '');
    const [categoryId, setCategoryId] = useState(searchParams?.get('categoryId') || '');
    const [sort, setSort] = useState(searchParams?.get('sort') || 'latest');
    const [statusFilter, setStatusFilter] = useState('');
    const [priceFilter, setPriceFilter] = useState('');
    const [verificationFilter, setVerificationFilter] = useState('');
    const [conditionFilter, setConditionFilter] = useState(searchParams?.get('condition') || '');
    const [pricingModelFilter, setPricingModelFilter] = useState(searchParams?.get('pricingModel') || '');
    const [districtFilter, setDistrictFilter] = useState(searchParams?.get('district') || '');
    const [discountFilter, setDiscountFilter] = useState(searchParams?.get('discount') || '');
    const [page, setPage] = useState(Number(searchParams?.get('page')) || 1);
    const [viewMode, setViewMode] = useResponsiveViewMode(`phase7:marketplace:${isServices ? 'services' : 'products'}:view-mode`);

    const handleToggleType = (type: 'products' | 'services') => {
        setCategoryId('');
        setPage(1);
        setConditionFilter('');
        setPricingModelFilter('');
        
        if (isBuyerMarketplace) {
            const params = new URLSearchParams(searchParams?.toString() || '');
            if (type === 'services') {
                params.set('type', 'services');
            } else {
                params.delete('type');
            }
            params.delete('categoryId');
            params.delete('condition');
            params.delete('pricingModel');
            params.set('page', '1');
            router.replace(`${pathname}?${params.toString()}`, { scroll: false });
        } else {
            const targetPath = type === 'services' ? '/marketplace/services' : '/marketplace/products';
            const params = new URLSearchParams(searchParams?.toString() || '');
            params.delete('type');
            params.delete('categoryId');
            params.delete('condition');
            params.delete('pricingModel');
            params.set('page', '1');
            const queryString = params.toString();
            router.push(queryString ? `${targetPath}?${queryString}` : targetPath);
        }
    };
    const [tableSortKey, setTableSortKey] = useState<MarketplaceSortKey>('name');
    const [tableSortDirection, setTableSortDirection] = useState<SortDirection>('asc');
    const debouncedQuery = useDebounce(query.trim(), 250);

    const { data: homeData } = useQuery({
        queryKey: ['marketplaceHomeData'],
        queryFn: () => marketplaceApi.getHomeData(),
        initialData: () => {
            const cached = api.peek('/api/marketplace/home');
            return cached ? unwrapApiData(cached) : undefined;
        }
    });
    const { data: featuredCategoryData } = useQuery({
        queryKey: ['marketplaceFeaturedCategories'],
        queryFn: () => marketplaceApi.getFeaturedCategories(),
        staleTime: 5 * 60_000
    });
    const categories = featuredCategoryData?.categories?.length ? featuredCategoryData.categories : homeData?.categories || [];
    const activeCategory = categories.find((category: any) => String(category.id) === String(categoryId));

    const syncUrl = (next: Record<string, string | number | undefined>) => {
        const params = new URLSearchParams(searchParams?.toString() || '');
        Object.entries(next).forEach(([key, value]) => {
            if (value === undefined || value === '') params.delete(key);
            else params.set(key, String(value));
        });
        const queryString = params.toString();
        router.replace(queryString ? `${pathname}?${queryString}` : pathname, { scroll: false });
    };

    const qs = new URLSearchParams({
        page: String(page),
        pageSize: '12',
        sort,
        ...(debouncedQuery ? { q: debouncedQuery } : {}),
        ...(categoryId ? { categoryId: String(categoryId) } : {}),
        ...(districtFilter ? { district: districtFilter } : {}),
        ...(discountFilter ? { discount: discountFilter } : {}),
        ...(verificationFilter === 'VERIFIED' ? { verifiedSeller: 'true' } : {}),
    }).toString();
    const cacheUrl = isServices ? `/api/marketplace/services?${qs}` : `/api/marketplace/products?${qs}`;

    const { data: listData, isLoading } = useQuery({
        queryKey: ['marketplaceList', isServices, debouncedQuery, categoryId, sort, page, districtFilter, discountFilter, verificationFilter],
        queryFn: () => {
            const params: Record<string, string | number> = { page, pageSize: 12, sort };
            if (debouncedQuery) params.q = debouncedQuery;
            if (categoryId) params.categoryId = categoryId;
            if (districtFilter) params.district = districtFilter;
            if (discountFilter) params.discount = discountFilter;
            if (verificationFilter === 'VERIFIED') params.verifiedSeller = 'true';
            return isServices ? marketplaceApi.getServices(params) : marketplaceApi.getProducts(params);
        },
        placeholderData: keepPreviousData,
        initialData: () => {
            const cached = api.peek(cacheUrl);
            return cached ? unwrapApiData(cached) : undefined;
        },
    });

    const hasLoadedList = Boolean(listData);
    const apiItems = isServices ? (listData?.services || []) : (listData?.products || []);
    const items = apiItems;
    const filteredItems = useMemo(() => items.filter((item: any) => {
        const status = String(item.status || '').toUpperCase();
        const verification = String(item.organization?.verificationStatus || '').toUpperCase();
        const price = Number(isServices ? item.basePrice || 0 : item.price || 0);
        const matchesStatus = !statusFilter || status === statusFilter;
        const matchesVerification = !verificationFilter || verification === verificationFilter;
        const matchesPrice = !priceFilter ||
            (priceFilter === 'quote' ? price <= 0 :
                priceFilter === 'low' ? price > 0 && price < 1000 :
                    priceFilter === 'mid' ? price >= 1000 && price < 10000 :
                        price >= 10000);
        const matchesCondition = isServices || !conditionFilter || String(item.itemCondition || '').toUpperCase() === conditionFilter.toUpperCase();
        const matchesPricingModel = !isServices || !pricingModelFilter || String(item.pricingModel || '').toUpperCase() === pricingModelFilter.toUpperCase();
        return matchesStatus && matchesVerification && matchesPrice && matchesCondition && matchesPricingModel;
    }), [isServices, items, priceFilter, statusFilter, verificationFilter, conditionFilter, pricingModelFilter]);
    const total = statusFilter || priceFilter || verificationFilter || conditionFilter || pricingModelFilter ? filteredItems.length : listData?.total || 0;
    const totalPages = listData?.totalPages || 0;
    const sortedItems = useMemo(() => [...filteredItems].sort((a: any, b: any) => {
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
    }), [filteredItems, isServices, tableSortDirection, tableSortKey]);

    const toggleTableSort = (field: MarketplaceSortKey) => {
        setTableSortDirection(prev => tableSortKey === field && prev === 'asc' ? 'desc' : 'asc');
        setTableSortKey(field);
    };

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        setPage(1);
        if (query.trim()) {
            marketplaceApi.trackInteraction({
                action: 'SEARCH',
                metadata: { q: query.trim(), surface: isServices ? 'services-list' : 'products-list' },
            }).catch(() => undefined);
        }
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
            toast.info(error?.message || 'Item saved locally. Cart sync will retry when the server is available.');
        }
    });

    const cartQuantityMutation = useMutation({
        mutationFn: async ({ id, isService, quantity }: { id: number; isService: boolean; quantity: number }) => {
            return marketplaceApi.updateGuestCartItem(isService ? { serviceId: id, quantity } : { productId: id, quantity });
        },
        onSuccess: (data) => {
            if (data?.cart) {
                queryClient.setQueryData(['guestCart'], data.cart);
            }
            queryClient.invalidateQueries({ queryKey: ['guestCart'] });
        },
        onError: (error: any) => {
            toast.info(error?.message || 'Cart quantity saved locally. Cart sync will retry when the server is available.');
        }
    });

    const handleAddToCart = (item: any, options: { showToast?: boolean } = {}) => {
        if (!item || item.id < 0) {
            toast.info(`Open a live ${isServices ? 'service' : 'product'} listing to add it to cart.`);
            return;
        }

        const itemType = isServices ? 'service' : 'product';
        const itemPrice = Number(isServices ? item.basePrice || 0 : item.price || 0);
        addGuestCartItem({
            id: item.id,
            name: item.name,
            price: Number.isFinite(itemPrice) && itemPrice > 0 ? itemPrice : undefined,
            unit: isServices ? item.pricingModel : item.unitOfMeasure,
            imageUrl: resolveMarketplaceImage(item, itemType),
            category: item.category?.name,
            type: itemType
        });

        cartMutation.mutate({ id: item.id, isService: isServices });
        if (options.showToast !== false) {
            toast.success(`${item.name} added to cart`);
        }
        marketplaceApi.trackInteraction({
            itemId: item.id,
            itemType: isServices ? 'SERVICE' : 'PRODUCT',
            action: 'ADD_TO_CART',
            metadata: { source: isServices ? 'services-list' : 'products-list' },
        }).catch(() => undefined);
    };

    const getCartQuantity = (itemId: number) => {
        const itemType = isServices ? 'service' : 'product';
        return cartItems.find(item => item.id === itemId && item.type === itemType)?.quantity || 0;
    };

    const handleCartQuantityChange = (item: any, nextQuantity: number) => {
        const itemType = isServices ? 'service' : 'product';
        const quantity = Math.max(0, nextQuantity);
        updateGuestCartItem(item.id, itemType, quantity);
        cartQuantityMutation.mutate({ id: item.id, isService: isServices, quantity });
        if (quantity === 0) {
            toast.info(`${item.name} removed from cart`);
        }
    };

    const handleRequestQuote = (item: any) => {
        if (item.id < 0) {
            toast.info(`Open a live ${isServices ? 'service' : 'product'} listing to request a quote.`);
            return;
        }

        handleAddToCart(item, { showToast: false });
        marketplaceApi.trackInteraction({
            itemId: item.id,
            itemType: isServices ? 'SERVICE' : 'PRODUCT',
            categoryId: item.category?.id,
            action: 'REQUIREMENT_POSTED',
            metadata: { source: isServices ? 'services-list' : 'products-list' },
        }).catch(() => undefined);

        toast.info('Login is required only when you submit inquiry or checkout.', {
            action: { label: 'Continue', onClick: () => { window.location.href = '/cart'; } },
        });
    };

    const cacheAndTrackItem = (item: any) => {
        queryClient.setQueryData(
            [isServices ? 'marketplaceService' : 'marketplaceProduct', item.id],
            isServices ? { service: item } : { product: item }
        );
        marketplaceApi.trackInteraction({
            itemId: item.id,
            itemType: isServices ? 'SERVICE' : 'PRODUCT',
            categoryId: item.category?.id,
            action: 'VIEW',
            metadata: { source: isServices ? 'services-list' : 'products-list' },
        }).catch(() => undefined);
    };

    return (
        <div className={isBuyerMarketplace ? "w-full" : "min-h-dvh bg-white flex flex-col"}>
            {!isBuyerMarketplace && <div className="brand-tricolor-strip w-full" />}
            {!isBuyerMarketplace && <MarketplaceHeader user={user} />}

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
                    {/* Products & Services Toggle Tabs */}
                    <div className="mb-6 flex border-b border-slate-200">
                        <button
                            type="button"
                            onClick={() => handleToggleType('products')}
                            className={cn(
                                "flex items-center gap-2 pb-3 px-4 text-xs font-black tracking-wider uppercase transition-all border-b-2 relative -mb-[2px]",
                                !isServices
                                    ? "border-[#0b2447] text-[#0b2447]"
                                    : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300"
                            )}
                        >
                            <Package className="h-4 w-4" />
                            Products Catalog
                        </button>
                        <button
                            type="button"
                            onClick={() => handleToggleType('services')}
                            className={cn(
                                "flex items-center gap-2 pb-3 px-4 text-xs font-black tracking-wider uppercase transition-all border-b-2 relative -mb-[2px]",
                                isServices
                                    ? "border-[#0b2447] text-[#0b2447]"
                                    : "border-transparent text-slate-400 hover:text-slate-600 hover:border-slate-300"
                            )}
                        >
                            <Wrench className="h-4 w-4" />
                            Services Directory
                        </button>
                    </div>

                    <div className="-mx-4 mb-5 sm:mx-0">
                        <CategoryCatalogueStrip
                            categories={categories.filter((c: any) => isServices ? ['SERVICE', 'BOTH'].includes(c.type) : ['PRODUCT', 'BOTH'].includes(c.type))}
                            selectedCategoryId={categoryId}
                            onSelect={(category) => {
                                const nextCategoryId = String(category.id) === String(categoryId) ? '' : String(category.id);
                                setCategoryId(nextCategoryId);
                                setPage(1);
                                syncUrl({ categoryId: nextCategoryId, page: 1 });
                            }}
                            // title={isServices ? 'Service categories' : 'Product categories'}
                            // subtitle="Select a category without leaving the marketplace list"
                            // className="rounded-lg border"
                        />
                    </div>

                    {activeCategory && (
                        <div className="mb-4 flex flex-col gap-2 rounded-lg border border-blue-100 bg-blue-50 p-3 sm:flex-row sm:items-center sm:justify-between">
                            <p className="text-xs font-black text-[#0b2447]">Showing items in {activeCategory.name}</p>
                            <button
                                type="button"
                                onClick={() => {
                                    setCategoryId('');
                                    setPage(1);
                                    syncUrl({ categoryId: '', category: '', page: 1 });
                                }}
                                className="inline-flex h-8 items-center justify-center rounded-md border border-[#0b2447]/20 bg-white px-3 text-[11px] font-black text-[#0b2447] hover:bg-slate-50"
                            >
                                Clear category
                            </button>
                        </div>
                    )}

                    {/* Filters Bar */}
                    <div className="flex flex-col sm:flex-row gap-3 mb-6">
                        <form onSubmit={handleSearch} className="flex-1 relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
                            <input
                                type="text"
                                value={query}
                                onChange={e => { setQuery(e.target.value); setPage(1); syncUrl({ q: e.target.value, page: 1 }); }}
                                placeholder={isServices ? "Search services..." : "Search products..."}
                                className="w-full h-10 pl-10 pr-4 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20"
                            />
                        </form>
                        <select value={statusFilter} onChange={e => { setStatusFilter(e.target.value); setPage(1); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                            <option value="">All Statuses</option>
                            <option value="ACTIVE">Active</option>
                            <option value="DRAFT">Draft</option>
                            <option value="INACTIVE">Inactive</option>
                        </select>
                        <select value={priceFilter} onChange={e => { setPriceFilter(e.target.value); setPage(1); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                            <option value="">All Prices</option>
                            <option value="quote">Quote Based</option>
                            <option value="low">Below Rs. 1k</option>
                            <option value="mid">Rs. 1k to 10k</option>
                            <option value="high">Above Rs. 10k</option>
                        </select>
                        <select value={verificationFilter} onChange={e => { setVerificationFilter(e.target.value); setPage(1); syncUrl({ verifiedSeller: e.target.value === 'VERIFIED' ? 'true' : '', page: 1 }); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                            <option value="">All Sellers</option>
                            <option value="VERIFIED">Verified</option>
                            <option value="PENDING">Pending</option>
                        </select>
                        <select value={districtFilter} onChange={e => { setDistrictFilter(e.target.value); setPage(1); syncUrl({ district: e.target.value, page: 1 }); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                            <option value="">All Locations</option>
                            <option value="Jharsuguda">Jharsuguda</option>
                            <option value="Odisha">Odisha</option>
                        </select>
                        <select value={discountFilter} onChange={e => { setDiscountFilter(e.target.value); setPage(1); syncUrl({ discount: e.target.value, page: 1 }); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                            <option value="">All Offers</option>
                            <option value="active">Active Discounts</option>
                        </select>
                        {!isServices && (
                            <select value={conditionFilter} onChange={e => { setConditionFilter(e.target.value); setPage(1); syncUrl({ condition: e.target.value, page: 1 }); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                                <option value="">All Conditions</option>
                                <option value="NEW">New</option>
                                <option value="USED">Used/Refurbished</option>
                            </select>
                        )}
                        {isServices && (
                            <select value={pricingModelFilter} onChange={e => { setPricingModelFilter(e.target.value); setPage(1); syncUrl({ pricingModel: e.target.value, page: 1 }); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                                <option value="">All Billing Types</option>
                                <option value="PER_PROJECT">Per Project</option>
                                <option value="MONTHLY">Monthly</option>
                                <option value="HOURLY">Hourly</option>
                                <option value="CUSTOM">Custom/Quote</option>
                            </select>
                        )}
                        <select value={categoryId} onChange={e => { setCategoryId(e.target.value); setPage(1); syncUrl({ categoryId: e.target.value, page: 1 }); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                            <option value="">All Categories</option>
                            {categories.filter((c: any) => isServices ? ['SERVICE', 'BOTH'].includes(c.type) : ['PRODUCT', 'BOTH'].includes(c.type)).map((c: any) => (
                                <option key={c.id} value={c.id}>{c.name}</option>
                            ))}
                        </select>
                        <select value={sort} onChange={e => { setSort(e.target.value); setPage(1); syncUrl({ sort: e.target.value, page: 1 }); }} className="h-10 px-3 rounded-lg border border-slate-200 text-sm font-medium cursor-pointer">
                            <option value="popular">Popular</option>
                            <option value="latest">Newest</option>
                            <option value="price_asc">Price: Low to High</option>
                            <option value="price_desc">Price: High to Low</option>
                            <option value="discount">Discount</option>
                            <option value="most_purchased">Most Purchased</option>
                            <option value="verified">Verified Sellers First</option>
                            <option value="name">Name A-Z</option>
                        </select>
                        <ViewModeToggle value={viewMode} onChange={setViewMode} />
                    </div>

                    {/* Results Count */}
                    <div className="mb-4 flex flex-col gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-center sm:justify-between">
                        <p className="text-xs font-semibold text-slate-500">
                            {activeCategory ? `Showing ${total} item${total !== 1 ? 's' : ''} in ${activeCategory.name}` : `${total} ${isServices ? 'service' : 'product'}${total !== 1 ? 's' : ''} found`}
                        </p>
                        <div className="inline-flex items-center gap-2 text-[10px] font-black uppercase tracking-wider text-[#12335f]">
                            <SlidersHorizontal className="h-3.5 w-3.5" />
                            Select any 4 items to compare
                        </div>
                    </div>

                    {/* Product / Service Grid */}
                    {(isLoading || !hasLoadedList) && items.length === 0 ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                            {[1, 2, 3, 4, 5, 6, 7, 8].map(i => <div key={i} className="h-64 bg-slate-100 rounded-lg animate-pulse" />)}
                        </div>
                    ) : sortedItems.length === 0 ? (
                        <div className="text-center py-16 rounded-lg border border-dashed border-slate-200 bg-slate-50">
                            {isServices ? <Wrench className="h-12 w-12 text-slate-300 mx-auto mb-3" /> : <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />}
                            <h3 className="text-sm font-black text-slate-800">{activeCategory ? 'No products or services found in this category.' : `No ${isServices ? 'services' : 'products'} found matching your criteria.`}</h3>
                            <p className="mt-1 text-xs font-semibold text-slate-500">Publish your requirement so verified MSMEs can respond.</p>
                            <div className="mt-4 flex flex-wrap justify-center gap-2">
                                <Link href="/buyer/requirements/new" className="inline-flex h-9 items-center rounded-md bg-[#0b2447] px-4 text-xs font-black text-white hover:bg-[#12335f]">Publish Requirement</Link>
                                <button type="button" onClick={() => { setCategoryId(''); setQuery(''); setPage(1); syncUrl({ categoryId: '', q: '', page: 1 }); }} className="inline-flex h-9 items-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-[#0b2447] hover:bg-slate-50">Browse All Categories</button>
                            </div>
                        </div>
                    ) : viewMode === 'list' ? (
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
                            <div className="overflow-x-auto">
                                <table className="w-full min-w-[1040px] text-left text-sm">
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
                                            const imageUrl = resolveMarketplaceImage(item, isServices ? 'service' : 'product');
                                            const cartQuantity = isFallback ? 0 : getCartQuantity(item.id);
                                            const detailUrl = isFallback
                                                ? (isServices ? '/marketplace/services' : '/marketplace/products')
                                                : (isServices ? `/marketplace/services/${item.id}` : `/marketplace/products/${item.id}`);
                                            return (
                                                <tr key={item.id} className="bg-white transition hover:bg-blue-50/50">
                                                    <td className="px-4 py-3">
                                                        <div className="flex min-w-[240px] items-center gap-3">
                                                            <Link
                                                                href={detailUrl}
                                                                onClick={() => {
                                                                    if (isFallback) return;
                                                                    cacheAndTrackItem(item);
                                                                }}
                                                                className="flex h-14 w-16 shrink-0 items-center justify-center overflow-hidden rounded-md border border-slate-200 bg-slate-50"
                                                                aria-label={`View ${item.name}`}
                                                            >
                                                                {imageUrl ? (
                                                                    <img src={imageUrl} alt={item.name} className="h-full w-full object-contain p-1" />
                                                                ) : (
                                                                    isServices ? <Wrench className="h-6 w-6 text-slate-300" /> : <Package className="h-6 w-6 text-slate-300" />
                                                                )}
                                                            </Link>
                                                            <div className="min-w-0">
                                                                <Link
                                                                    href={detailUrl}
                                                                    onClick={() => {
                                                                        if (isFallback) return;
                                                                        cacheAndTrackItem(item);
                                                                    }}
                                                                    className="line-clamp-2 text-xs font-black text-slate-900 hover:text-[#0b2447]"
                                                                >
                                                                    {item.name}
                                                                </Link>
                                                                <p className="mt-1 text-[10px] font-semibold text-slate-500">{isServices ? item.pricingModel || 'Service' : item.unitOfMeasure || 'Unit'}{location ? ` | ${location}` : ''}</p>
                                                            </div>
                                                        </div>
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
                                                            <Link href={detailUrl} onClick={() => { if (!isFallback) cacheAndTrackItem(item); }} className="inline-flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-3 text-[10px] font-black text-slate-700 hover:bg-slate-50">
                                                                <Eye className="h-3 w-3" /> {isFallback ? 'Browse' : 'Details'}
                                                            </Link>
                                                            {!isFallback && (
                                                                <CompareToggleButton item={{ type: isServices ? 'service' : 'product', id: item.id, categoryId: item.category?.id }} iconOnly />
                                                            )}
                                                            {!isFallback && (
                                                                <button type="button" onClick={() => handleRequestQuote(item)} className="inline-flex h-8 items-center gap-1 rounded-md border border-[#0b2447]/20 bg-white px-3 text-[10px] font-black text-[#0b2447] hover:bg-blue-50">
                                                                    <FileText className="h-3 w-3" /> Request Quote
                                                                </button>
                                                            )}
                                                            {!isFallback && (
                                                                cartQuantity > 0 ? (
                                                                    <div className="inline-flex h-8 min-w-[96px] items-center justify-between overflow-hidden rounded-md border border-[#0b2447]/25 bg-white text-[#0b2447] shadow-sm">
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleCartQuantityChange(item, cartQuantity - 1)}
                                                                            className="flex h-full w-8 items-center justify-center bg-slate-50 transition hover:bg-[#0b2447]/5"
                                                                            aria-label={`Decrease ${item.name} quantity`}
                                                                        >
                                                                            <Minus className="h-3 w-3" />
                                                                        </button>
                                                                        <span className="min-w-8 px-2 text-center text-[11px] font-black tabular-nums">
                                                                            {cartQuantity}
                                                                        </span>
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => handleCartQuantityChange(item, cartQuantity + 1)}
                                                                            className="flex h-full w-8 items-center justify-center bg-slate-50 transition hover:bg-[#0b2447]/5"
                                                                            aria-label={`Increase ${item.name} quantity`}
                                                                        >
                                                                            <Plus className="h-3 w-3" />
                                                                        </button>
                                                                    </div>
                                                                ) : (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => handleAddToCart(item)}
                                                                        className="inline-flex h-8 min-w-[76px] items-center justify-center gap-1 rounded-md bg-[#0b2447] px-3 text-[10px] font-black text-white transition hover:bg-[#12335f]"
                                                                        aria-label={`Add ${item.name} to cart`}
                                                                    >
                                                                        <ShoppingCart className="h-3 w-3" />
                                                                        Cart
                                                                    </button>
                                                                )
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
                                const imageUrl = resolveMarketplaceImage(item, isServices ? 'service' : 'product');
                                const isVerified = item.organization?.verificationStatus === 'VERIFIED';
                                const location = item.organization?.city || item.organization?.district || item.organization?.state;
                                const itemPrice = isServices ? item.basePrice : item.price;
                                const cartQuantity = isFallback ? 0 : getCartQuantity(item.id);
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
                                                    cacheAndTrackItem(item);
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
                                                        cacheAndTrackItem(item);
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
                                                        Rs. {Number(itemPrice).toLocaleString('en-IN')}
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
                                                        cacheAndTrackItem(item);
                                                    }}
                                                    className="flex-1 inline-flex items-center justify-center gap-1 h-7 rounded-md border border-slate-200 text-[10px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition"
                                                >
                                                    <Eye className="h-3 w-3" />{isFallback ? 'Browse' : 'Details'}
                                                </Link>
                                                {!isFallback && (
                                                    <CompareToggleButton item={{ type: isServices ? 'service' : 'product', id: item.id, categoryId: item.category?.id }} iconOnly className="h-7 w-7" />
                                                )}
                                                {!isFallback && (
                                                    <button type="button" onClick={() => handleRequestQuote(item)} className="inline-flex items-center justify-center h-7 w-7 rounded-md border border-[#0b2447]/20 bg-white text-[#0b2447] hover:bg-blue-50 active:scale-90 transition" aria-label="Request quote" title="Request quote"><FileText className="h-3 w-3" /></button>
                                                )}
                                                {!isFallback && (
                                                    cartQuantity > 0 ? (
                                                        <div className="inline-flex h-7 min-w-[82px] items-center justify-between overflow-hidden rounded-md border border-[#0b2447]/25 bg-white text-[#0b2447] shadow-sm">
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCartQuantityChange(item, cartQuantity - 1)}
                                                                className="flex h-full w-7 items-center justify-center bg-slate-50 transition hover:bg-[#0b2447]/5"
                                                                aria-label={`Decrease ${item.name} quantity`}
                                                            >
                                                                <Minus className="h-3 w-3" />
                                                            </button>
                                                            <span className="min-w-7 px-1 text-center text-[10px] font-black tabular-nums">
                                                                {cartQuantity}
                                                            </span>
                                                            <button
                                                                type="button"
                                                                onClick={() => handleCartQuantityChange(item, cartQuantity + 1)}
                                                                className="flex h-full w-7 items-center justify-center bg-slate-50 transition hover:bg-[#0b2447]/5"
                                                                aria-label={`Increase ${item.name} quantity`}
                                                            >
                                                                <Plus className="h-3 w-3" />
                                                            </button>
                                                        </div>
                                                    ) : (
                                                        <button
                                                            type="button"
                                                            onClick={() => handleAddToCart(item)}
                                                            className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-[#0b2447] text-white transition hover:bg-[#12335f] active:scale-90"
                                                            aria-label="Add to cart"
                                                            title="Add to cart"
                                                        >
                                                            <ShoppingCart className="h-3 w-3" />
                                                        </button>
                                                    )
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
                            <button onClick={() => { const nextPage = Math.max(1, page - 1); setPage(nextPage); syncUrl({ page: nextPage }); }} disabled={page <= 1} className="h-8 px-3 rounded-md border border-slate-200 text-xs font-medium disabled:opacity-40 hover:bg-slate-50 active:scale-95 transition">
                                <ChevronLeft className="h-3.5 w-3.5" />
                            </button>
                            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                const p = page <= 3 ? i + 1 : page + i - 2;
                                if (p < 1 || p > totalPages) return null;
                                return (
                                    <button key={p} onClick={() => { setPage(p); syncUrl({ page: p }); }} className={`h-8 w-8 rounded-md text-xs font-semibold transition ${p === page ? 'bg-[#0b2447] text-white' : 'border border-slate-200 hover:bg-slate-50'}`}>{p}</button>
                                );
                            })}
                            <button onClick={() => { const nextPage = Math.min(totalPages, page + 1); setPage(nextPage); syncUrl({ page: nextPage }); }} disabled={page >= totalPages} className="h-8 px-3 rounded-md border border-slate-200 text-xs font-medium disabled:opacity-40 hover:bg-slate-50 active:scale-95 transition">
                                <ChevronRight className="h-3.5 w-3.5" />
                            </button>
                        </div>
                    )}
                </div>
            </main>

            <MarketplaceFooter />
            <CompareTray />
        </div>
    );
}
