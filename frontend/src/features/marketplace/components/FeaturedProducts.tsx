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

const fallbackProducts: MarketplaceProduct[] = [
    {
        id: -1,
        name: 'Industrial Safety Kit',
        description: 'PPE kit with helmet, gloves, reflective vest, and safety shoes for plant teams.',
        price: 2499,
        currency: 'INR',
        unitOfMeasure: 'kit',
        brand: 'Jharsuguda MSME',
        status: 'ACTIVE',
        category: { id: 0, name: 'Safety Equipment' },
        organization: { id: 0, organizationName: 'Verified MSME Supplier', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        images: [{ id: -1, fileAsset: { id: -1, url: 'https://picsum.photos/seed/msme-safety-kit/640/420' } }]
    },
    {
        id: -2,
        name: 'Office Furniture Bundle',
        description: 'Workstation desks, ergonomic chairs, and storage units for government and industry offices.',
        price: 18500,
        currency: 'INR',
        unitOfMeasure: 'set',
        brand: 'Local Fabrication Unit',
        status: 'ACTIVE',
        category: { id: 0, name: 'Office Supplies' },
        organization: { id: 0, organizationName: 'Registered MSME Vendor', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        images: [{ id: -2, fileAsset: { id: -2, url: 'https://picsum.photos/seed/msme-office-furniture/640/420' } }]
    },
    {
        id: -3,
        name: 'Electrical Maintenance Spares',
        description: 'Industrial-grade switches, cable accessories, and control panel consumables.',
        price: 7200,
        currency: 'INR',
        unitOfMeasure: 'lot',
        brand: 'Industrial Supplies',
        status: 'ACTIVE',
        category: { id: 0, name: 'Electricals' },
        organization: { id: 0, organizationName: 'Verified Seller Organization', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        images: [{ id: -3, fileAsset: { id: -3, url: 'https://picsum.photos/seed/msme-electrical-spares/640/420' } }]
    },
    {
        id: -4,
        name: 'Construction Material Pack',
        description: 'Frequently procured materials for civil maintenance and small works packages.',
        price: 12800,
        currency: 'INR',
        unitOfMeasure: 'pack',
        brand: 'Local Building Supply',
        status: 'ACTIVE',
        category: { id: 0, name: 'Construction Materials' },
        organization: { id: 0, organizationName: 'Local MSME Supplier', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        images: [{ id: -4, fileAsset: { id: -4, url: 'https://picsum.photos/seed/msme-construction-material/640/420' } }]
    }
];

export function FeaturedProducts({ products }: Props) {
    const visibleProducts = products.length > 0 ? products : fallbackProducts;

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
                    {visibleProducts.map(product => (
                        <ProductCard key={product.id} product={product} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function ProductCard({ product }: { product: MarketplaceProduct }) {
    const imageUrl = product.imageUrl || product.images?.[0]?.fileAsset?.url;
    const isVerified = product.organization?.verificationStatus === 'VERIFIED';
    const isFallback = product.id < 0;
    const productHref = isFallback ? '/marketplace/products' : `/marketplace/products/${product.id}`;
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
                href={productHref}
                onClick={() => {
                    if (isFallback) return;
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
                    href={productHref}
                    onClick={() => {
                        if (isFallback) return;
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
                        href={productHref}
                        onClick={() => {
                            if (isFallback) return;
                            queryClient.setQueryData(['marketplaceProduct', product.id], { product });
                        }}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 h-8 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition"
                    >
                        <Eye className="h-3 w-3" /> {isFallback ? 'Browse Products' : 'View Details'}
                    </Link>
                    {!isFallback && (
                        <button
                            onClick={handleAddToCart}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-[#0b2447] text-white hover:bg-[#12335f] active:scale-90 transition"
                            aria-label="Add to cart"
                            title="Add to Cart"
                        >
                            <ShoppingCart className="h-3.5 w-3.5" />
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
