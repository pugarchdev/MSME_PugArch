'use client';
/**
 * ProductRow — horizontal scroll of product cards.
 *
 * FIX: The previous version nested <Link> inside <Link> (a inside a)
 * causing a React hydration error. This version uses a <div> as the
 * outer card wrapper; all navigation is done via useRouter().push()
 * and separate non-nested <Link> / <button> elements.
 */
import React, { useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ChevronLeft, ChevronRight, ShoppingCart,
    BadgeCheck, Package, MapPin, Plus, Minus, Eye
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useGuestCart } from '../hooks/useGuestCart';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { MarketplaceProduct } from '../api';

interface Props {
    title: string;
    subtitle?: string;
    products: MarketplaceProduct[];
    viewAllHref: string;
}

export function ProductRow({ title, subtitle, products, viewAllHref }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (dir: 'left' | 'right') =>
        scrollRef.current?.scrollBy({ left: dir === 'left' ? -360 : 360, behavior: 'smooth' });

    if (products.length === 0) {
        return (
            <section className="bg-white mt-2 border-b border-slate-100">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <SectionHeader title={title} subtitle={subtitle} viewAllHref={viewAllHref} />
                    <div className="text-center py-10">
                        <Package className="h-10 w-10 text-slate-200 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">No products listed yet. Be the first to add products.</p>
                        <Link href="/seller/register" className="inline-flex mt-3 h-8 px-4 items-center rounded-lg bg-[#0b2447] text-white text-xs font-semibold hover:bg-[#12335f] transition">
                            Register as Seller
                        </Link>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="bg-white mt-2 border-b border-slate-100">
            <div className="max-w-7xl mx-auto px-4 pt-4 pb-2">
                <SectionHeader title={title} subtitle={subtitle} viewAllHref={viewAllHref} />
            </div>
            <div className="relative">
                {/* Prev arrow — uses inline style to avoid translate conflict with global CSS */}
                <button
                    onClick={() => scroll('left')}
                    style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', left: 0 }}
                    className="z-10 w-8 h-16 bg-white/90 border border-slate-200 shadow-md flex items-center justify-center hover:bg-slate-50 transition rounded-r-md [&:not(:disabled):hover]:translate-y-0"
                    aria-label="Scroll left"
                >
                    <ChevronLeft className="h-4 w-4 text-slate-600" />
                </button>

                <div ref={scrollRef} className="flex gap-0 overflow-x-auto no-scrollbar">
                    {products.map(p => <ProductCard key={p.id} product={p} />)}

                    {/* View All tile */}
                    <Link
                        href={viewAllHref}
                        className="shrink-0 w-40 flex flex-col items-center justify-center gap-2 border-l border-slate-100 hover:bg-slate-50 transition px-4"
                    >
                        <span className="text-xs font-bold text-[#0b2447] text-center">View All Products</span>
                        <ChevronRight className="h-5 w-5 text-[#0b2447]" />
                    </Link>
                </div>

                {/* Next arrow */}
                <button
                    onClick={() => scroll('right')}
                    style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', right: 0 }}
                    className="z-10 w-8 h-16 bg-white/90 border border-slate-200 shadow-md flex items-center justify-center hover:bg-slate-50 transition rounded-l-md [&:not(:disabled):hover]:translate-y-0"
                    aria-label="Scroll right"
                >
                    <ChevronRight className="h-4 w-4 text-slate-600" />
                </button>
            </div>
        </section>
    );
}

/* ─── Product card ─────────────────────────────────────────────────────────────
   IMPORTANT: Outer wrapper is <div>, NOT <Link>.
   Navigation happens via router.push() and separate non-nested elements.
   This avoids the "<a> cannot be a descendant of <a>" hydration error.
──────────────────────────────────────────────────────────────────────────────── */
function ProductCard({ product }: { product: MarketplaceProduct }) {
    const { user } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { items: cartItems, add: addGuestItem, update: updateGuestItemQty } = useGuestCart();
    const [hovered, setHovered] = useState(false);

    const imageUrl = product.images?.[0]?.fileAsset?.url || product.imageUrl;
    const isVerified = product.organization?.verificationStatus === 'VERIFIED';
    const location = product.organization?.city || product.organization?.district;
    const detailHref = `/marketplace/products/${product.id}`;

    const cartItem = cartItems.find(i => i.id === product.id && i.type === 'product');
    const count = cartItem ? cartItem.quantity : 0;

    /* Cart helpers */
    const addToCart = (e: React.MouseEvent) => {
        e.stopPropagation();
        addGuestItem({
            id: product.id,
            name: product.name,
            price: product.price ? Number(product.price) : undefined,
            unit: product.unitOfMeasure,
            imageUrl: imageUrl,
            category: product.category?.name,
            type: 'product',
        });
        toast.success(`${product.name} added to cart`);
    };

    const increment = (e: React.MouseEvent) => {
        e.stopPropagation();
        updateGuestItemQty(product.id, 'product', count + 1);
    };

    const decrement = (e: React.MouseEvent) => {
        e.stopPropagation();
        updateGuestItemQty(product.id, 'product', count - 1);
        if (count - 1 === 0) {
            toast.info(`${product.name} removed from cart`);
        }
    };

    const goToDetail = () => {
        queryClient.setQueryData(['marketplaceProduct', product.id], { product, relatedProducts: [] });
        router.push(detailHref);
    };

    return (
        /* ⚠️ outer wrapper is <div> — no <a> here */
        <div
            className="group shrink-0 w-44 sm:w-48 flex flex-col border-r border-slate-100 hover:bg-slate-50 transition relative"
            onMouseEnter={() => setHovered(true)}
            onMouseLeave={() => setHovered(false)}
        >
            {/* ── Image area — click navigates to detail ── */}
            <div
                onClick={goToDetail}
                className="relative h-44 sm:h-48 bg-slate-100 overflow-hidden cursor-pointer"
            >
                {imageUrl
                    ? <img src={imageUrl} alt={product.name} loading="lazy" className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-300" />
                    : <div className="w-full h-full flex items-center justify-center"><Package className="h-14 w-14 text-slate-300" /></div>
                }
                {isVerified && (
                    <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-green-600 text-[8px] font-bold text-white pointer-events-none">
                        <BadgeCheck className="h-2.5 w-2.5" /> Verified
                    </span>
                )}

                {/* Hover quick-view overlay — uses <button> not <Link> to avoid nesting */}
                {hovered && (
                    <div className="absolute inset-0 bg-[#0b2447]/82 flex flex-col items-center justify-center gap-2 p-3">
                        {product.description && (
                            <p className="text-[10px] text-white/85 text-center line-clamp-4 leading-relaxed">
                                {product.description}
                            </p>
                        )}
                        {/* <button> navigates — no nested anchor */}
                        <button
                            onClick={(e) => { e.stopPropagation(); router.push(detailHref); }}
                            className="inline-flex items-center gap-1 h-7 px-3 rounded-lg bg-white text-[#0b2447] text-[10px] font-bold hover:bg-slate-100 transition [&:not(:disabled):hover]:translate-y-0 mt-1"
                        >
                            <Eye className="h-3 w-3" /> View Details
                        </button>
                    </div>
                )}
            </div>

            {/* ── Info area — click navigates ── */}
            <div
                onClick={goToDetail}
                className="flex-1 flex flex-col p-3 gap-1 cursor-pointer min-h-0"
            >
                {product.category?.name && (
                    <p className="text-[10px] font-bold text-[#0b2447]/50 uppercase tracking-wider truncate">
                        {product.category.name}
                    </p>
                )}
                <h3 className="text-xs font-semibold text-slate-800 line-clamp-2 leading-tight group-hover:text-[#0b2447] transition">
                    {product.name}
                </h3>
                {product.organization?.organizationName && (
                    <p className="text-[10px] text-slate-400 truncate">{product.organization.organizationName}</p>
                )}
                {location && (
                    <p className="text-[9px] text-slate-400 inline-flex items-center gap-0.5">
                        <MapPin className="h-2.5 w-2.5" />{location}
                    </p>
                )}
                <div className="mt-1">
                    {product.price
                        ? <span className="text-sm font-bold text-[#0b2447]">₹{Number(product.price).toLocaleString('en-IN')}</span>
                        : <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Quote Based</span>
                    }
                </div>
            </div>

            {/* ── Cart controls ── (always <button>, never <a>) */}
            <div className="px-3 pb-3">
                {count === 0 ? (
                    <button
                        onClick={addToCart}
                        className="w-full h-8 rounded-lg bg-[#0b2447] text-white text-[10px] font-bold flex items-center justify-center gap-1.5 hover:bg-[#12335f] active:scale-95 transition [&:not(:disabled):hover]:translate-y-0"
                        aria-label={`Add ${product.name} to cart`}
                    >
                        <ShoppingCart className="h-3.5 w-3.5" /> Add to Cart
                    </button>
                ) : (
                    <div className="flex items-center justify-between h-8 rounded-lg border-2 border-[#0b2447] overflow-hidden">
                        <button
                            onClick={decrement}
                            className="w-9 h-full flex items-center justify-center text-[#0b2447] hover:bg-[#0b2447]/10 active:bg-[#0b2447]/20 transition [&:not(:disabled):hover]:translate-y-0"
                            aria-label="Decrease quantity"
                        >
                            <Minus className="h-3.5 w-3.5" />
                        </button>
                        <span className="flex-1 text-center text-xs font-black text-[#0b2447] tabular-nums">{count}</span>
                        <button
                            onClick={increment}
                            className="w-9 h-full flex items-center justify-center text-[#0b2447] hover:bg-[#0b2447]/10 active:bg-[#0b2447]/20 transition [&:not(:disabled):hover]:translate-y-0"
                            aria-label="Increase quantity"
                        >
                            <Plus className="h-3.5 w-3.5" />
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}

function SectionHeader({ title, subtitle, viewAllHref }: { title: string; subtitle?: string; viewAllHref: string }) {
    return (
        <div className="flex items-end justify-between mb-3">
            <div>
                <h2 className="text-sm sm:text-base font-bold text-[#0b2447]">{title}</h2>
                {subtitle && <p className="text-[10px] text-slate-500 mt-0.5">{subtitle}</p>}
            </div>
            <Link href={viewAllHref} className="text-[11px] font-bold text-[#0b2447] hover:underline whitespace-nowrap">
                View All →
            </Link>
        </div>
    );
}
