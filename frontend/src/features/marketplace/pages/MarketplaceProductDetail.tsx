'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, ShoppingCart, FileText, MapPin, BadgeCheck, Package, ArrowLeft, Building2, ShieldCheck, ClipboardList, Tags, BookmarkPlus } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type MarketplaceProduct } from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { toast } from 'sonner';
import { useGuestCart } from '../hooks/useGuestCart';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrapApiData } from '../../../lib/api';
import PremiumLoader from '../../../components/PremiumLoader';
import { getMarketplaceImageCandidates, resolveMarketplaceImage } from '../utils/marketplaceImages';
import { CompareToggleButton } from '../components/CompareToggleButton';
import { saveSupplier } from '../utils/savedSuppliers';

const formatValue = (value: unknown, fallback = 'Not provided') => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
};

const formatMoney = (value: unknown) => {
    const amount = Number(value || 0);
    return amount > 0 ? `Rs. ${amount.toLocaleString('en-IN')}` : 'Not provided';
};

const formatDate = (value: unknown) => {
    if (!value) return 'Not provided';
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const isImageFile = (file: any) => String(file?.mimeType || '').toLowerCase().startsWith('image/');

export default function MarketplaceProductDetail() {
    const { user } = useAuth();
    const pathname = usePathname() || '';
    const router = useRouter();
    const productId = Number(pathname.split('/').pop());
    const queryClient = useQueryClient();
    const useDashboardShell = Boolean(user);

    const { data: detailData, isLoading: loading } = useQuery({
        queryKey: ['marketplaceProduct', productId],
        queryFn: () => marketplaceApi.getProductDetail(productId),
        enabled: productId > 0,
        initialData: () => {
            const cachedDetail = queryClient.getQueryData<any>(['marketplaceProduct', productId]);
            if (cachedDetail) return cachedDetail;

            const peeked = api.peek(`/api/marketplace/products/${productId}`);
            if (peeked) return unwrapApiData(peeked);

            const cacheState = queryClient.getQueryCache().getAll();
            for (const query of cacheState) {
                const data = query.state.data as any;
                if (data?.featuredProducts) {
                    const found = data.featuredProducts.find((p: any) => p.id === productId);
                    if (found) return { product: found, relatedProducts: [] };
                }
                if (data?.products) {
                    const found = data.products.find((p: any) => p.id === productId);
                    if (found) return { product: found, relatedProducts: [] };
                }
                if (data?.records) {
                    const found = data.records.find((p: any) => p.id === productId);
                    if (found) return { product: found, relatedProducts: [] };
                }
            }
            return undefined;
        },
    });

    const product = detailData?.product;
    const related = detailData?.relatedProducts || [];

    const { items: cartItems, add: addGuestItem, update: updateGuestItemQty } = useGuestCart();

    const [selectedImage, setSelectedImage] = useState(0);
    const [failedImages, setFailedImages] = useState<string[]>([]);

    useEffect(() => {
        setSelectedImage(0);
        setFailedImages([]);
    }, [productId]);

    const cartItem = cartItems.find((item: any) => item.id === productId && item.type === 'product');
    const cartQuantity = cartItem ? Number(cartItem.quantity) : 0;

    const handleAddToCart = () => {
        if (cartQuantity === 0 && product) {
            const img = resolveMarketplaceImage(product, 'product');
            addGuestItem({
                id: product.id,
                name: product.name,
                price: product.price ? Number(product.price) : undefined,
                unit: product.unitOfMeasure,
                imageUrl: img,
                category: product.category?.name,
                type: 'product',
            });
            toast.success(`${product.name} added to cart`);
        }
    };

    const handleQuantityChange = (delta: number) => {
        const newQuantity = Math.max(0, cartQuantity + delta);
        updateGuestItemQty(productId, 'product', newQuantity);
        if (newQuantity === 0 && product) {
            toast.info(`${product.name} removed from cart`);
        }
    };

    const handleRequestQuote = () => {
        if (!product) return;
        if (!user) {
            toast.info('Login is required to send a quote request.', {
                action: { label: 'Login', onClick: () => router.push(`/login?redirect=${encodeURIComponent(pathname)}`) },
            });
            return;
        }
        if (user.role !== 'buyer') {
            toast.info('Quote requests are available from buyer accounts.');
            return;
        }
        const sellerUserId = Number(product.seller?.id || 0);
        if (!sellerUserId) {
            toast.error('Seller contact is not available for this listing.');
            return;
        }
        const params = new URLSearchParams({
            sellerId: String(sellerUserId),
            subject: `Quote request: ${product.name}`,
            message: `Hello, I would like to request a quotation for ${product.name}.\n\nCategory: ${product.category?.name || 'Not specified'}\nQuantity: Please confirm minimum order quantity and availability.\nDelivery: Please share delivery timeline, payment terms, and applicable taxes.`
        });
        router.push(`/buyer/messages?${params.toString()}`);
    };

    if (loading) return <PremiumLoader />;

    if (!product) {
        return (
            <div className={useDashboardShell ? "min-h-full bg-white" : "min-h-dvh bg-white flex flex-col"}>
                {!useDashboardShell && <div className="brand-tricolor-strip w-full" />}
                {!useDashboardShell && <MarketplaceHeader user={user} />}
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <Package className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                        <h2 className="text-lg font-bold text-slate-700 mb-2">Product Not Found</h2>
                        <p className="text-sm text-slate-500 mb-4">This product may have been removed or is no longer available.</p>
                        <Link href="/" className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#0b2447] text-white text-xs font-semibold hover:bg-[#12335f] transition">
                            Back to Marketplace
                        </Link>
                    </div>
                </main>
                {!useDashboardShell && <MarketplaceFooter />}
            </div>
        );
    }

    const imageCandidates = getMarketplaceImageCandidates(product).filter((image) => !failedImages.includes(image));
    const currentImage = imageCandidates[selectedImage] || imageCandidates[0] || '';
    const isVerified = product.organization?.verificationStatus === 'VERIFIED';
    const location = product.organization?.city || product.organization?.district || product.organization?.state;
    const productAny = product as any;
    const price = Number(product.price || 0);

    const handleSaveSupplier = () => {
        if (!product.organization?.id) {
            toast.error('Supplier details are not available for this listing.');
            return;
        }
        saveSupplier({
            id: product.organization.id,
            sellerUserId: product.seller?.id || null,
            name: product.organization.organizationName || product.seller?.name || 'Verified supplier',
            location: [product.organization.city, product.organization.district, product.organization.state].filter(Boolean).join(', '),
            verificationStatus: product.organization.verificationStatus,
            source: product.name,
        });
        toast.success('Supplier saved');
    };
    const discountPrice = Number(productAny.discountPrice || 0);
    const hasOffer = discountPrice > 0 && price > 0 && discountPrice < price;
    const displayPrice = hasOffer ? discountPrice : price;
    const productDocuments = [
        ...(productAny.certifications || []),
        ...(productAny.catalogueFiles || [])
            .filter((file: any) => !isImageFile(file))
            .map((file: any) => ({
                id: `catalogue-file-${file.id}`,
                name: file.originalName || 'Uploaded catalogue document',
                verificationStatus: 'UPLOADED',
                fileAsset: file,
            })),
    ];
    const productDetails = [
        ['Category', product.category?.name],
        ['Listing Status', product.status],
        ['Seller', product.organization?.organizationName || product.seller?.name],
        ['Seller Location', location],
        ['Currency', product.currency],
        ['List Price', formatMoney(product.price)],
        ['Original Price', formatMoney(productAny.originalPrice)],
        ['Discount Price', formatMoney(productAny.discountPrice)],
        ['Discount Percent', productAny.discountPercent ? `${productAny.discountPercent}%` : undefined],
        ['GST Rate', productAny.taxRate ? `${productAny.taxRate}%` : undefined],
        ['Unit', product.unitOfMeasure],
        ['Brand', product.brand],
        ['Model Number', productAny.modelNumber],
        ['SKU', product.sku],
        ['HSN Code', product.hsnCode],
        ['Condition', product.itemCondition],
        ['MSME Made', product.isMsmeMade],
        ['Bulk Deal', productAny.bulkDealAvailable],
        ['Bulk Minimum Quantity', productAny.bulkMinQuantity ? `${productAny.bulkMinQuantity} ${product.unitOfMeasure || ''}` : undefined],
        ['Offer Label', productAny.offerLabel],
        ['Offer Starts', formatDate(productAny.offerStartAt)],
        ['Offer Ends', formatDate(productAny.offerEndAt)],
        ['Created', formatDate(product.createdAt)],
        ['Last Updated', formatDate(product.updatedAt)],
    ];

    return (
        <div className={useDashboardShell ? "min-h-full bg-white" : "min-h-dvh bg-white flex flex-col"}>
            {!useDashboardShell && <div className="brand-tricolor-strip w-full" />}
            {!useDashboardShell && <MarketplaceHeader user={user} />}

            <main className="flex-1">
                {/* Breadcrumb */}
                <div className="bg-slate-50 border-b border-slate-200">
                    <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2 text-[11px] text-slate-500">
                        <Link href="/" className="hover:text-[#0b2447] transition">Home</Link>
                        <ChevronRight className="h-3 w-3" />
                        <Link href="/marketplace/products" className="hover:text-[#0b2447] transition">Products</Link>
                        <ChevronRight className="h-3 w-3" />
                        {product.category && (
                            <>
                                <Link href={`/marketplace/products?categoryId=${product.category.id}`} className="hover:text-[#0b2447] transition">{product.category.name}</Link>
                                <ChevronRight className="h-3 w-3" />
                            </>
                        )}
                        <span className="text-slate-700 font-medium truncate max-w-[200px]">{product.name}</span>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 py-8">
                    {/* Back Button */}
                    <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#0b2447] mb-6 transition">
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to results
                    </button>

                    <div className="grid gap-8 lg:grid-cols-2 xl:grid-cols-[minmax(0,0.95fr)_minmax(0,1fr)_320px]">
                        {/* Image Gallery */}
                        <div>
                            <div className="flex aspect-[4/3] max-h-[440px] items-center justify-center overflow-hidden rounded-lg border border-slate-200 bg-white mb-3">
                                {currentImage ? (
                                    <img
                                        src={currentImage}
                                        alt={product.name}
                                        onError={() => setFailedImages((current) => current.includes(currentImage) ? current : [...current, currentImage])}
                                        className="w-full h-full object-contain p-3"
                                    />
                                ) : (
                                    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
                                        <Package className="h-12 w-12 text-slate-300" />
                                        <p className="mt-3 text-xs font-bold text-slate-500">Product image unavailable</p>
                                    </div>
                                )}
                            </div>
                            {imageCandidates.length > 1 && (
                                <div className="flex gap-2 overflow-x-auto pb-2">
                                    {imageCandidates.map((img: string, i: number) => (
                                        <button
                                            key={`${img}-${i}`}
                                            onClick={() => setSelectedImage(i)}
                                            className={`w-16 h-16 rounded-md border-2 overflow-hidden shrink-0 transition ${i === selectedImage ? 'border-[#0b2447]' : 'border-slate-200 hover:border-slate-300'}`}
                                        >
                                            <img src={img} alt={`${product.name} image ${i + 1}`} className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                            <div className="mt-3 grid grid-cols-3 gap-2 text-center">
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                    <ShieldCheck className="mx-auto h-4 w-4 text-[#0b2447]" />
                                    <p className="mt-1 text-[10px] font-bold text-slate-600">Verified listing</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                    <ClipboardList className="mx-auto h-4 w-4 text-[#0b2447]" />
                                    <p className="mt-1 text-[10px] font-bold text-slate-600">Quote ready</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-3">
                                    <Tags className="mx-auto h-4 w-4 text-[#0b2447]" />
                                    <p className="mt-1 text-[10px] font-bold text-slate-600">MSME supply</p>
                                </div>
                            </div>
                        </div>

                        {/* Product Info */}
                        <div className="space-y-4">
                            {product.category && (
                                <span className="text-[10px] font-bold text-[#0b2447]/60 uppercase tracking-wider">{product.category.name}</span>
                            )}

                            <h1 className="text-2xl font-bold text-[#0b2447]">{product.name}</h1>
                            <p className="text-xs font-semibold text-slate-500">
                                Official MSME marketplace listing for procurement discovery and buyer enquiry.
                            </p>

                            {/* Seller Info */}
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="w-9 h-9 rounded-md bg-[#0b2447]/5 flex items-center justify-center">
                                    <Building2 className="h-4 w-4 text-[#0b2447]" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-slate-700">{product.organization?.organizationName || product.seller?.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {location && <span className="text-[10px] text-slate-500 inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{location}</span>}
                                        {isVerified && <span className="text-[10px] text-green-700 font-bold inline-flex items-center gap-0.5"><BadgeCheck className="h-3 w-3" />Verified</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Price */}
                            <div className="py-3 border-y border-slate-100">
                                {displayPrice > 0 ? (
                                    <div>
                                        <div className="flex flex-wrap items-end gap-2">
                                            <p className="text-3xl font-bold text-[#0b2447]">Rs. {displayPrice.toLocaleString('en-IN')}</p>
                                            {hasOffer && <p className="pb-1 text-sm font-bold text-slate-400 line-through">Rs. {price.toLocaleString('en-IN')}</p>}
                                        </div>
                                        <p className="text-xs text-slate-500 mt-0.5">
                                            Per {product.unitOfMeasure || 'unit'}
                                            {product.taxRate ? ` • GST ${product.taxRate}% extra` : ''}
                                        </p>
                                    </div>
                                ) : (
                                    <p className="text-sm font-semibold text-amber-700 bg-amber-50 inline-block px-3 py-1.5 rounded border border-amber-200">
                                        Price on Request — Contact Seller for Quote
                                    </p>
                                )}
                            </div>

                            <section className="rounded-lg border border-slate-200 bg-white p-4">
                                <h3 className="mb-3 text-sm font-bold text-[#0b2447]">Product Information</h3>
                                <div className="grid gap-3 text-xs sm:grid-cols-2">
                                    {productDetails.map(([label, value]) => (
                                        <div key={String(label)} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                                            <span className="mt-1 block font-bold text-slate-800 text-wrap-anywhere">{formatValue(value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            {/* Description */}
                            {product.description && (
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 mb-1">Description</h3>
                                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{product.description}</p>
                                </div>
                            )}

                        </div>

                        {/* Sidebar - Buyer Actions */}
                        <aside className="lg:col-span-2 xl:col-span-1">
                            <div className="sticky top-28 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                                <div className="space-y-1">
                                    <h2 className="text-sm font-bold text-[#0b2447]">Procurement actions</h2>
                                    <p className="text-[11px] font-semibold leading-relaxed text-slate-500">
                                        Add this listing to cart, compare suppliers, or request a quote from the seller.
                                    </p>
                                </div>

                                <div className="my-4 border-y border-slate-100 py-4">
                                    {displayPrice > 0 ? (
                                        <div>
                                            <div className="flex flex-wrap items-end gap-2">
                                                <p className="text-2xl font-bold text-[#0b2447]">Rs. {displayPrice.toLocaleString('en-IN')}</p>
                                                {hasOffer && <p className="pb-0.5 text-xs font-bold text-slate-400 line-through">Rs. {price.toLocaleString('en-IN')}</p>}
                                            </div>
                                            <p className="mt-0.5 text-[10px] font-semibold text-slate-500">
                                                Per {product.unitOfMeasure || 'unit'}
                                                {product.taxRate ? ` | GST ${product.taxRate}% extra` : ''}
                                            </p>
                                        </div>
                                    ) : (
                                        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs font-bold text-amber-700">
                                            Price on Request
                                        </p>
                                    )}
                                </div>

                                <div className="space-y-3">
                                {cartQuantity > 0 ? (
                                    <div className="inline-flex h-11 w-full items-center justify-between overflow-hidden rounded-lg border-2 border-[#0b2447] bg-white shadow-sm">
                                        <button 
                                            onClick={() => handleQuantityChange(-1)} 
                                            className="w-12 h-full flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-[#0b2447] transition"
                                        >
                                            <span className="text-xl font-bold leading-none select-none">−</span>
                                        </button>
                                        <div className="flex-1 flex items-center justify-center text-[#0b2447] font-bold select-none">
                                            {cartQuantity}
                                        </div>
                                        <button 
                                            onClick={() => handleQuantityChange(1)} 
                                            className="w-12 h-full flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-[#0b2447] transition"
                                        >
                                            <span className="text-xl font-bold leading-none select-none">+</span>
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleAddToCart}
                                        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[#0b2447] text-sm font-bold text-white shadow-sm transition hover:bg-[#12335f] active:scale-[0.97]"
                                    >
                                        <ShoppingCart className="h-4 w-4" /> Add to Cart
                                    </button>
                                )}
                                <button
                                    onClick={handleRequestQuote}
                                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border-2 border-[#0b2447] text-sm font-bold text-[#0b2447] transition hover:bg-[#0b2447] hover:text-white active:scale-[0.97]"
                                >
                                    <FileText className="h-4 w-4" /> Request Quote
                                </button>
                                <CompareToggleButton
                                    item={{ type: 'product', id: product.id, categoryId: product.category?.id }}
                                    className="h-11 w-full border-[#0b2447]/20 text-[#0b2447]"
                                />
                                <button
                                    type="button"
                                    onClick={handleSaveSupplier}
                                    className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 transition hover:bg-slate-50 active:scale-[0.97]"
                                >
                                    <BookmarkPlus className="h-4 w-4" /> Save Supplier
                                </button>
                                </div>

                                <div className="mt-4 rounded-md border border-slate-100 bg-slate-50 p-3">
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Seller</p>
                                    <p className="mt-1 text-xs font-bold text-slate-800">{product.organization?.organizationName || product.seller?.name || 'Verified supplier'}</p>
                                    <div className="mt-2 flex flex-wrap gap-1.5">
                                        {isVerified && <span className="rounded-full bg-green-50 px-2 py-1 text-[10px] font-bold text-green-700">Verified</span>}
                                        {location && <span className="rounded-full bg-white px-2 py-1 text-[10px] font-bold text-slate-600">{location}</span>}
                                    </div>
                                </div>

                                <p className="mt-3 text-center text-[10px] font-semibold text-slate-400">
                                    {user ? 'You are logged in and can submit requests.' : 'Login required to submit quote requests.'}
                                </p>
                            </div>
                        </aside>
                    </div>

                    {/* Specifications */}
                    {product.specifications?.length > 0 && (
                        <div className="mt-10">
                            <h3 className="text-sm font-bold text-[#0b2447] mb-3">Specifications</h3>
                            <div className="bg-slate-50 rounded-lg border border-slate-200 overflow-hidden">
                                <table className="w-full text-xs">
                                    <tbody>
                                        {product.specifications.map((spec: any, i: number) => (
                                            <tr key={spec.id || i} className={i % 2 === 0 ? 'bg-white' : 'bg-slate-50'}>
                                                <td className="px-4 py-2.5 font-medium text-slate-600 w-1/3 border-r border-slate-100">{spec.name}</td>
                                                <td className="px-4 py-2.5 text-slate-800">{spec.value}{spec.unit ? ` ${spec.unit}` : ''}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <div className="mt-10 grid gap-4 lg:grid-cols-2">
                        <section className="rounded-lg border border-slate-200 bg-white p-5">
                            <h3 className="text-sm font-bold text-[#0b2447] mb-3">Procurement Summary</h3>
                            <div className="grid gap-3 text-xs sm:grid-cols-2">
                                <div><span className="block text-slate-500">Listing Status</span><span className="font-bold text-slate-800">{product.status || 'ACTIVE'}</span></div>
                                <div><span className="block text-slate-500">Category</span><span className="font-bold text-slate-800">{product.category?.name || 'General procurement'}</span></div>
                                <div><span className="block text-slate-500">Supply Location</span><span className="font-bold text-slate-800">{location || 'Seller location available on enquiry'}</span></div>
                                <div><span className="block text-slate-500">Buyer Action</span><span className="font-bold text-slate-800">Add to cart or request quote</span></div>
                                {productAny.hsnCode && <div><span className="block text-slate-500">HSN Code</span><span className="font-bold text-slate-800">{productAny.hsnCode}</span></div>}
                                {productAny.minimumOrderQuantity && <div><span className="block text-slate-500">Minimum Order</span><span className="font-bold text-slate-800">{productAny.minimumOrderQuantity} {product.unitOfMeasure || ''}</span></div>}
                            </div>
                        </section>
                        <section className="rounded-lg border border-slate-200 bg-white p-5">
                            <h3 className="text-sm font-bold text-[#0b2447] mb-3">Seller Verification</h3>
                            <p className="text-xs leading-relaxed text-slate-600">
                                {product.organization?.organizationName || product.seller?.name || 'Verified seller'} is listed on the official JsgSmile MSME marketplace.
                                {isVerified ? ' The seller profile is marked verified for procurement discovery.' : ' Buyers can review seller details before enquiry submission.'}
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                                {isVerified && <span className="rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[10px] font-bold uppercase text-blue-700">Verified Seller</span>}
                                {location && <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-bold uppercase text-slate-600">{location}</span>}
                            </div>
                        </section>
                    </div>

                    <div className="mt-10">
                        <h3 className="text-sm font-bold text-[#0b2447] mb-3">Uploaded Documents and Certifications</h3>
                        {productDocuments.length > 0 ? (
                            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                {productDocuments.map((cert: any) => {
                                    const content = (
                                        <>
                                            <FileText className="h-5 w-5 shrink-0 text-[#0b2447]" />
                                            <span className="min-w-0 flex-1">
                                                <span className="block truncate font-black text-slate-800">{cert.name || cert.fileAsset?.originalName || 'Seller document'}</span>
                                                <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                                                    {cert.issuingAuthority || 'Authority not provided'} | {cert.verificationStatus || 'PENDING'}
                                                </span>
                                                {cert.certificateNumber && <span className="mt-1 block text-[10px] font-semibold text-slate-500">Certificate: {cert.certificateNumber}</span>}
                                                <span className="mt-1 block text-[10px] font-semibold text-slate-500">Issued: {formatDate(cert.issuedAt)} | Expires: {formatDate(cert.expiresAt)}</span>
                                            </span>
                                        </>
                                    );
                                    return cert.fileAsset?.url ? (
                                        <a
                                            key={cert.id}
                                            href={cert.fileAsset.url}
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs hover:border-[#0b2447]/30 hover:bg-white"
                                        >
                                            {content}
                                        </a>
                                    ) : (
                                        <div key={cert.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                                            {content}
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-xs font-semibold text-slate-500">
                                No uploaded documents are attached to this product listing yet.
                            </div>
                        )}
                    </div>

                    {/* Related Products */}
                    {related.length > 0 && (
                        <div className="mt-10">
                            <h3 className="text-sm font-bold text-[#0b2447] mb-4">Related Products</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {related.map((p: any) => (
                                    <Link
                                        key={p.id}
                                        href={`/marketplace/products/${p.id}`}
                                        className="bg-white rounded-lg border border-slate-200 p-3 hover:shadow-md hover:border-slate-300 transition space-y-2"
                                    >
                                        <div className="h-28 bg-slate-100 rounded-md flex items-center justify-center overflow-hidden">
                                            {resolveMarketplaceImage(p, 'product') ? (
                                                <img src={resolveMarketplaceImage(p, 'product')} alt={p.name} className="w-full h-full object-cover" />
                                            ) : (
                                                <Package className="h-8 w-8 text-slate-300" />
                                            )}
                                        </div>
                                        <h4 className="text-xs font-semibold text-slate-700 line-clamp-2">{p.name}</h4>
                                        <p className="text-[10px] text-slate-500">{p.organization?.organizationName}</p>
                                        {p.price && <p className="text-xs font-bold text-[#0b2447]">₹{Number(p.price).toLocaleString('en-IN')}</p>}
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            {!useDashboardShell && <MarketplaceFooter />}
        </div>
    );
}
