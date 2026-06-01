'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, ShoppingCart, FileText, MapPin, BadgeCheck, Package, ArrowLeft, Star } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type MarketplaceProduct } from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { toast } from 'sonner';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api, unwrapApiData } from '../../../lib/api';

export default function MarketplaceProductDetail() {
    const { user } = useAuth();
    const pathname = usePathname() || '';
    const productId = Number(pathname.split('/').pop());
    const queryClient = useQueryClient();

    const { data: detailData, isLoading: loading } = useQuery({
        queryKey: ['marketplaceProduct', productId],
        queryFn: () => marketplaceApi.getProductDetail(productId),
        enabled: productId > 0,
        initialData: () => {
            const cached = api.peek(`/api/marketplace/products/${productId}`);
            return cached ? unwrapApiData(cached) : undefined;
        },
    });

    const product = detailData?.product;
    const related = detailData?.relatedProducts || [];

    const { data: cartData } = useQuery({
        queryKey: ['guestCart'],
        queryFn: () => marketplaceApi.getGuestCart(),
    });

    const [selectedImage, setSelectedImage] = useState(0);

    const cartItem = cartData?.items?.find((item: any) => item.productId === productId);
    const cartQuantity = cartItem ? Number(cartItem.quantity) : 0;

    const cartMutation = useMutation({
        mutationFn: async (newQuantity: number) => {
            if (newQuantity === 0 && cartQuantity === 0) return; // Prevent 0 to 0
            if (newQuantity > 0 && cartQuantity === 0) {
                return marketplaceApi.addGuestCartItem({ productId, quantity: newQuantity });
            }
            return marketplaceApi.updateGuestCartItem({ productId, quantity: newQuantity });
        },
        onMutate: async (newQuantity) => {
            await queryClient.cancelQueries({ queryKey: ['guestCart'] });
            const previousCart = queryClient.getQueryData(['guestCart']);
            const currentCart = previousCart as any || { items: [] };

            const existingIndex = currentCart.items?.findIndex((item: any) => item.productId === productId);
            let newItems = [...(currentCart.items || [])];

            if (newQuantity === 0) {
                newItems = newItems.filter((item: any) => item.productId !== productId);
            } else if (existingIndex >= 0) {
                newItems[existingIndex] = {
                    ...newItems[existingIndex],
                    quantity: newQuantity
                };
            } else {
                newItems.push({
                    id: Date.now(),
                    productId,
                    quantity: newQuantity,
                    itemType: 'PRODUCT',
                    product: { id: productId, name: product?.name || 'Product' }
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
        onError: (error: any, newQuantity, context: any) => {
            if (context?.previousCart) {
                queryClient.setQueryData(['guestCart'], context.previousCart);
            }
            toast.error(error?.message || 'Unable to update cart');
        }
    });

    const handleAddToCart = () => {
        if (cartQuantity === 0) {
            cartMutation.mutate(1);
        }
    };

    const handleQuantityChange = (delta: number) => {
        const newQuantity = Math.max(0, cartQuantity + delta);
        cartMutation.mutate(newQuantity);
    };

    const handleRequestQuote = () => {
        if (cartQuantity === 0) {
            handleAddToCart();
        }
        toast.info('Login is required only when you submit inquiry or checkout.', {
            action: { label: 'Continue', onClick: () => { window.location.href = '/cart'; } },
        });
    };

    if (loading) {
        return (
            <div className="min-h-dvh bg-white flex flex-col">
                <div className="brand-tricolor-strip w-full" />
                <MarketplaceHeader user={user} />
                <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
                    <div className="animate-pulse space-y-6">
                        <div className="h-4 w-48 bg-slate-200 rounded" />
                        <div className="grid lg:grid-cols-2 gap-8">
                            <div className="h-80 bg-slate-200 rounded-lg" />
                            <div className="space-y-4">
                                <div className="h-6 w-3/4 bg-slate-200 rounded" />
                                <div className="h-4 w-1/2 bg-slate-200 rounded" />
                                <div className="h-8 w-32 bg-slate-200 rounded" />
                                <div className="h-20 bg-slate-200 rounded" />
                            </div>
                        </div>
                    </div>
                </main>
                <MarketplaceFooter />
            </div>
        );
    }

    if (!product) {
        return (
            <div className="min-h-dvh bg-white flex flex-col">
                <div className="brand-tricolor-strip w-full" />
                <MarketplaceHeader user={user} />
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
                <MarketplaceFooter />
            </div>
        );
    }

    const images = product.images || [];
    const currentImage = images[selectedImage]?.fileAsset?.url;
    const isVerified = product.organization?.verificationStatus === 'VERIFIED';
    const location = product.organization?.city || product.organization?.district || product.organization?.state;

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

                    <div className="grid lg:grid-cols-2 gap-8">
                        {/* Image Gallery */}
                        <div>
                            <div className="aspect-square bg-slate-100 rounded-lg border border-slate-200 overflow-hidden flex items-center justify-center mb-3">
                                {currentImage ? (
                                    <img src={currentImage} alt={product.name} className="w-full h-full object-contain" />
                                ) : (
                                    <Package className="h-20 w-20 text-slate-300" />
                                )}
                            </div>
                            {images.length > 1 && (
                                <div className="flex gap-2 overflow-x-auto pb-2">
                                    {images.map((img: any, i: number) => (
                                        <button
                                            key={img.id}
                                            onClick={() => setSelectedImage(i)}
                                            className={`w-16 h-16 rounded-md border-2 overflow-hidden shrink-0 transition ${i === selectedImage ? 'border-[#0b2447]' : 'border-slate-200 hover:border-slate-300'}`}
                                        >
                                            <img src={img.fileAsset?.url} alt="" className="w-full h-full object-cover" />
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Product Info */}
                        <div className="space-y-4">
                            {product.category && (
                                <span className="text-[10px] font-bold text-[#0b2447]/60 uppercase tracking-wider">{product.category.name}</span>
                            )}

                            <h1 className="text-xl font-bold text-[#0b2447]">{product.name}</h1>

                            {/* Seller Info */}
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div className="w-9 h-9 rounded-md bg-[#0b2447]/5 flex items-center justify-center">
                                    <Package className="h-4 w-4 text-[#0b2447]" />
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
                                {product.price ? (
                                    <div>
                                        <p className="text-2xl font-bold text-[#0b2447]">₹{Number(product.price).toLocaleString('en-IN')}</p>
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

                            {/* Key Details */}
                            <div className="grid grid-cols-2 gap-3 text-xs">
                                {product.brand && (
                                    <div><span className="text-slate-500">Brand:</span> <span className="font-medium text-slate-700">{product.brand}</span></div>
                                )}
                                {product.unitOfMeasure && (
                                    <div><span className="text-slate-500">Unit:</span> <span className="font-medium text-slate-700">{product.unitOfMeasure}</span></div>
                                )}
                                {product.sku && (
                                    <div><span className="text-slate-500">SKU:</span> <span className="font-medium text-slate-700">{product.sku}</span></div>
                                )}
                                {product.hsnCode && (
                                    <div><span className="text-slate-500">HSN Code:</span> <span className="font-medium text-slate-700">{product.hsnCode}</span></div>
                                )}
                                {product.itemCondition && (
                                    <div><span className="text-slate-500">Condition:</span> <span className="font-medium text-slate-700">{product.itemCondition}</span></div>
                                )}
                                {product.isMsmeMade && (
                                    <div><span className="text-green-700 font-semibold">✓ MSME Made</span></div>
                                )}
                            </div>

                            {/* Description */}
                            {product.description && (
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 mb-1">Description</h3>
                                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{product.description}</p>
                                </div>
                            )}

                            {/* Action Buttons */}
                            <div className="flex gap-3 pt-4">
                                {cartQuantity > 0 ? (
                                    <div className="flex-1 inline-flex items-center justify-between h-11 rounded-lg border-2 border-[#0b2447] bg-white overflow-hidden shadow-sm">
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
                                        className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-[#0b2447] text-white text-sm font-bold hover:bg-[#12335f] active:scale-[0.97] transition shadow-sm"
                                    >
                                        <ShoppingCart className="h-4 w-4" /> Add to Cart
                                    </button>
                                )}
                                <button
                                    onClick={handleRequestQuote}
                                    className="flex-1 inline-flex items-center justify-center gap-2 h-11 rounded-lg border-2 border-[#0b2447] text-[#0b2447] text-sm font-bold hover:bg-[#0b2447] hover:text-white active:scale-[0.97] transition"
                                >
                                    <FileText className="h-4 w-4" /> Request Quote
                                </button>
                            </div>
                        </div>
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
                                            {p.images?.[0]?.fileAsset?.url ? (
                                                <img src={p.images[0].fileAsset.url} alt={p.name} className="w-full h-full object-cover" />
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

            <MarketplaceFooter />
        </div>
    );
}
