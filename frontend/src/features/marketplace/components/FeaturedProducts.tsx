'use client';
import React from 'react';
import Link from 'next/link';
import { ShoppingCart, Eye, BadgeCheck, MapPin, Package } from 'lucide-react';
import type { MarketplaceProduct } from '../api';
import { marketplaceApi } from '../api';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';

interface Props {
    products: MarketplaceProduct[];
}

export function FeaturedProducts({ products }: Props) {
    if (products.length === 0) {
        return (
            <section className="py-10 bg-slate-50 border-y border-slate-100" id="products">
                <div className="max-w-7xl mx-auto px-4 text-center py-8">
                    <Package className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <h2 className="text-lg font-bold text-[#0b2447] mb-2">Featured Products</h2>
                    <p className="text-sm text-slate-500 max-w-md mx-auto">No products listed yet. Verified sellers can register and add products to appear here.</p>
                    <Link href="/seller/register" className="inline-flex items-center gap-2 mt-4 h-9 px-4 rounded-lg border border-[#0b2447] text-[#0b2447] text-xs font-semibold hover:bg-[#0b2447] hover:text-white transition">
                        Register as Seller
                    </Link>
                </div>
            </section>
        );
    }

    return (
        <section className="py-10 bg-slate-50 border-y border-slate-100" id="products" aria-labelledby="products-heading">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 id="products-heading" className="text-lg font-bold text-[#0b2447]">Featured Products</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Quality products from verified MSME sellers</p>
                    </div>
                    <Link href="/marketplace/products" className="text-xs font-bold text-[#0b2447] hover:underline inline-flex items-center gap-1 transition">
                        View All Products →
                    </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {products.map(product => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function ProductCard({ product }: { product: MarketplaceProduct }) {
    const imageUrl = product.images?.[0]?.fileAsset?.url;
    const isVerified = product.organization?.verificationStatus === 'VERIFIED';
    const location = product.organization?.city || product.organization?.district || product.organization?.state;
    const queryClient = useQueryClient();

    const cartMutation = useMutation({
        mutationFn: async () => {
            return marketplaceApi.addGuestCartItem({ productId: product.id, quantity: 1 });
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ['guestCart'] });
            const previousCart = queryClient.getQueryData(['guestCart']);
            const currentCart = previousCart as any || { items: [] };

            const existingIndex = currentCart.items?.findIndex((item: any) => item.productId === product.id);
            let newItems = [...(currentCart.items || [])];

            if (existingIndex >= 0) {
                newItems[existingIndex] = {
                    ...newItems[existingIndex],
                    quantity: (newItems[existingIndex].quantity || 0) + 1
                };
            } else {
                newItems.push({
                    id: Date.now(),
                    productId: product.id,
                    quantity: 1,
                    itemType: 'PRODUCT',
                    product: { id: product.id, name: product.name }
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

    const handleAddToCart = () => {
        cartMutation.mutate();
    };

    return (
        <div className="group bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg hover:border-slate-300 transition-all duration-200">
            {/* Image */}
            <Link 
                href={`/marketplace/products/${product.id}`} 
                onClick={() => {
                    queryClient.setQueryData(['marketplaceProduct', product.id], { product });
                }}
                className="block relative h-40 bg-slate-100 overflow-hidden"
            >
                {imageUrl ? (
                    <img src={imageUrl} alt={product.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Package className="h-12 w-12 text-slate-300" />
                    </div>
                )}
                {isVerified && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-[9px] font-bold text-green-700">
                        <BadgeCheck className="h-3 w-3" /> Verified Seller
                    </span>
                )}
            </Link>

            {/* Content */}
            <div className="p-3 space-y-2">
                {product.category && (
                    <span className="text-[10px] font-bold text-[#0b2447]/60 uppercase tracking-wider">{product.category.name}</span>
                )}

                <Link 
                    href={`/marketplace/products/${product.id}`} 
                    onClick={() => {
                        queryClient.setQueryData(['marketplaceProduct', product.id], { product });
                    }}
                    className="block"
                >
                    <h3 className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2 hover:text-[#0b2447] transition">{product.name}</h3>
                </Link>

                {product.organization && (
                    <p className="text-[11px] text-slate-500 font-medium truncate">{product.organization.organizationName}</p>
                )}

                {location && (
                    <p className="text-[10px] text-slate-400 inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {location}
                    </p>
                )}

                {/* Price */}
                <div className="pt-1">
                    {product.price ? (
                        <p className="text-sm font-bold text-[#0b2447]">
                            ₹{Number(product.price).toLocaleString('en-IN')}
                            <span className="text-[10px] font-normal text-slate-400 ml-1">/ {product.unitOfMeasure || 'unit'}</span>
                        </p>
                    ) : (
                        <p className="text-xs font-semibold text-amber-700 bg-amber-50 inline-block px-2 py-0.5 rounded border border-amber-200">Quote Based</p>
                    )}
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-2">
                    <Link
                        href={`/marketplace/products/${product.id}`}
                        onClick={() => {
                            queryClient.setQueryData(['marketplaceProduct', product.id], { product });
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition"
                    >
                        <Eye className="h-3 w-3" /> View Details
                    </Link>
                    <button
                        onClick={handleAddToCart}
                        className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-[#0b2447] text-white hover:bg-[#12335f] active:scale-90 transition"
                        aria-label="Add to cart"
                        title="Add to Cart"
                    >
                        <ShoppingCart className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </div>
    );
}
