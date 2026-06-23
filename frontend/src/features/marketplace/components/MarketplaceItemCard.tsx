'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BadgeCheck, Eye, FileText, MapPin, Minus, Package, Plus, ShoppingCart, Wrench } from 'lucide-react';
import { toast } from 'sonner';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '../../../components/ui/button';
import { useAuth } from '../../../hooks/useAuth';
import { cn } from '../../../lib/utils';
import { marketplaceApi, type MarketplaceProduct, type MarketplaceService } from '../api';
import { useMarketplaceCart } from '../hooks/useMarketplaceCart';
import { CompareToggleButton } from './CompareToggleButton';
import { resolveMarketplaceImage } from '../utils/marketplaceImages';

export type MarketplaceDiscoveryItem = MarketplaceProduct | MarketplaceService | (Record<string, any> & {
    id: number;
    name: string;
});

type MarketplaceItemType = 'product' | 'service';

interface MarketplaceItemCardProps {
    item: MarketplaceDiscoveryItem;
    itemType?: MarketplaceItemType;
    showAddToCart?: boolean;
    showCompare?: boolean;
    showRequestQuote?: boolean;
    className?: string;
}

function inferItemType(item: MarketplaceDiscoveryItem, itemType?: MarketplaceItemType): MarketplaceItemType {
    if (itemType) return itemType;
    if ('pricingModel' in item || 'basePrice' in item || (item as any).itemType === 'SERVICE') return 'service';
    return 'product';
}

function getCurrentPrice(item: MarketplaceDiscoveryItem, type: MarketplaceItemType) {
    const discountPrice = Number((item as any).discountPrice || 0);
    if (discountPrice > 0) return discountPrice;
    return Number(type === 'service' ? (item as MarketplaceService).basePrice || 0 : (item as MarketplaceProduct).price || 0);
}

function getDiscount(item: MarketplaceDiscoveryItem) {
    const original = Number((item as any).originalPrice || 0);
    const discountPrice = Number((item as any).discountPrice || 0);
    const explicitPercent = Number((item as any).discountPercent || 0);
    const active = (item as any).isOfferActive !== false;
    if (!active || original <= 0 || discountPrice <= 0 || discountPrice >= original) {
        return null;
    }
    const percent = explicitPercent > 0 ? explicitPercent : Math.round(((original - discountPrice) / original) * 100);
    return { original, discountPrice, percent };
}

function formatMoney(value: number) {
    return `Rs. ${value.toLocaleString('en-IN')}`;
}

export function MarketplaceItemCard({
    item,
    itemType,
    showAddToCart = true,
    showCompare = true,
    showRequestQuote = true,
    className,
}: MarketplaceItemCardProps) {
    const type = inferItemType(item, itemType);
    const { user } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const { add, update, getQuantity } = useMarketplaceCart();
    const [imageFailed, setImageFailed] = React.useState(false);
    const resolvedImageUrl = resolveMarketplaceImage(item, type);
    const imageUrl = imageFailed ? '' : resolvedImageUrl;
    const detailHref = (item as any).detailUrl || `/marketplace/${type === 'service' ? 'services' : 'products'}/${item.id}`;
    const category = (item as any).category || ((item as any).categoryName ? { name: (item as any).categoryName, id: (item as any).categoryId } : undefined);
    const organization = (item as any).organization;
    const sellerName = organization?.organizationName || (item as any).sellerName || (item as any).seller?.name || 'Verified MSME seller';
    const sellerVerified = organization?.verificationStatus === 'VERIFIED' || (item as any).sellerVerified;
    const location = organization?.city || organization?.district || (item as any).district || (item as any).location;
    const price = getCurrentPrice(item, type);
    const discount = getDiscount(item);
    const quantity = getQuantity(item.id, type);

    React.useEffect(() => {
        setImageFailed(false);
    }, [resolvedImageUrl]);

    const isLocal = String(location || '').toLowerCase().includes('jharsuguda') || String(organization?.state || '').toLowerCase().includes('odisha');
    const isHerShg = [organization?.organizationType, organization?.profile?.groupType, organization?.profile?.category, (item as any).sellerType]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes('shg') || String(value).toLowerCase().includes('women'));

    const cacheDetail = () => {
        queryClient.setQueryData(
            [type === 'service' ? 'marketplaceService' : 'marketplaceProduct', item.id],
            type === 'service' ? { service: item, relatedServices: [] } : { product: item, relatedProducts: [] }
        );
        marketplaceApi.trackInteraction({
            itemId: item.id,
            itemType: type === 'service' ? 'SERVICE' : 'PRODUCT',
            categoryId: category?.id,
            action: 'VIEW',
            metadata: { source: 'marketplace-card', name: item.name },
        }).catch(() => undefined);
    };

    const addToCart = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        add(
            {
                id: item.id,
                name: item.name,
                price: price || undefined,
                unit: type === 'service' ? (item as MarketplaceService).pricingModel : (item as MarketplaceProduct).unitOfMeasure,
                imageUrl,
                category: category?.name,
                type,
            },
            { source: 'marketplace-card' }
        );
    };

    const changeQuantity = (event: React.MouseEvent, nextQuantity: number) => {
        event.preventDefault();
        event.stopPropagation();
        update(item.id, type, nextQuantity);
    };

    const requestQuote = (event: React.MouseEvent) => {
        event.preventDefault();
        event.stopPropagation();
        if (!user) {
            toast.info('Login to request a quote', {
                action: { label: 'Login', onClick: () => router.push(`/login?redirect=${encodeURIComponent(detailHref)}`) },
            });
            return;
        }
        marketplaceApi.trackInteraction({
            itemId: item.id,
            itemType: type === 'service' ? 'SERVICE' : 'PRODUCT',
            categoryId: category?.id,
            action: 'REQUIREMENT_POSTED',
            metadata: { source: 'request-quote-button' },
        }).catch(() => undefined);
        if (user.role !== 'buyer') {
            toast.info('Quote requests are available from buyer accounts.');
            return;
        }
        const sellerUserId = Number((item as any).seller?.id || (item as any).sellerId || 0);
        if (!sellerUserId) {
            router.push(detailHref);
            toast.info('Open the listing details to contact this seller.');
            return;
        }
        const params = new URLSearchParams({
            intent: 'quote',
            sellerId: String(sellerUserId),
            subject: `Quote request: ${item.name}`,
            message: `Hello, I would like to request a quotation for ${item.name}.\n\nCategory: ${category?.name || 'Not specified'}\nPlease share best price, availability, delivery timeline, payment terms, and applicable taxes.`
        });
        router.push(`/buyer/messages?${params.toString()}`);
    };

    return (
        <article className={cn('group flex min-h-[310px] w-52 shrink-0 snap-start flex-col overflow-hidden rounded-2xl border border-slate-200/60 bg-white/90 shadow-sm backdrop-blur-md transition-all duration-300 hover:-translate-y-1.5 hover:scale-[1.01] hover:border-[#0b2447]/30 hover:shadow-lg sm:w-56 2xl:w-60', className)}>
            <Link href={detailHref} onClick={cacheDetail} className="relative block h-32 overflow-hidden bg-gradient-to-b from-slate-50/50 to-slate-100/30 border-b border-slate-100">
                {imageUrl ? (
                    <img src={imageUrl} alt={item.name} loading="lazy" onError={() => setImageFailed(true)} className="h-full w-full object-contain p-3 transition-all duration-500 ease-out group-hover:scale-110 group-hover:rotate-1" />
                ) : (
                    <span className="flex h-full w-full items-center justify-center text-slate-300 transition-transform duration-500 group-hover:scale-110">
                        {type === 'service' ? <Wrench className="h-10 w-10" /> : <Package className="h-10 w-10" />}
                    </span>
                )}
                <span className="absolute left-2 top-2 rounded-full bg-white/90 backdrop-blur-sm px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-widest text-[#0b2447] shadow-sm border border-slate-200/50">
                    {type === 'service' ? 'Service' : 'Product'}
                </span>
                {discount && (
                    <span className="absolute right-2 top-2 rounded-full bg-orange-500/90 backdrop-blur-sm px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-widest text-white shadow-sm">
                        {discount.percent}% off
                    </span>
                )}
            </Link>

            <div className="flex flex-1 flex-col p-2.5">
                <div className="mb-1.5 flex flex-wrap gap-1">
                    {sellerVerified && (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-gradient-to-r from-emerald-50 to-emerald-100/50 px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-emerald-700 shadow-sm">
                            <BadgeCheck className="h-2.5 w-2.5 text-emerald-600" /> Verified
                        </span>
                    )}
                    {isLocal && (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-blue-200 bg-gradient-to-r from-blue-50 to-blue-100/50 px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-blue-700 shadow-sm">
                            Local MSME
                        </span>
                    )}
                    {isHerShg && (
                        <span className="inline-flex items-center gap-0.5 rounded-full border border-saffron/20 bg-gradient-to-r from-orange-50 to-orange-100/40 px-2 py-0.5 text-[8px] font-extrabold uppercase tracking-wide text-brand-saffron shadow-sm">
                            HerSHG
                        </span>
                    )}
                </div>

                {category?.name && (
                    <Link href={`/marketplace/${type === 'service' ? 'services' : 'products'}?categoryId=${category.id || ''}`} className="text-[9px] font-black uppercase tracking-wider text-[#0b2447]/55 hover:text-[#0b2447]">
                        {category.name}
                    </Link>
                )}
                <Link href={detailHref} onClick={cacheDetail}>
                    <h3 className="mt-1 line-clamp-2 text-xs font-extrabold leading-snug text-slate-900 transition-colors duration-200 group-hover:text-[#0b2447]">
                        {item.name}
                    </h3>
                </Link>
                <p className="mt-0.5 truncate text-[10px] font-semibold text-slate-500">{sellerName}</p>
                {location && (
                    <p className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                        <MapPin className="h-3 w-3" /> {location}
                    </p>
                )}

                <div className="mt-2">
                    {price > 0 ? (
                        <div>
                            <p className="text-sm font-black text-[#0b2447]">{formatMoney(price)}</p>
                            <div className="mt-0.5 flex flex-wrap items-center gap-1">
                                {discount && <span className="text-[10px] font-bold text-slate-400 line-through">{formatMoney(discount.original)}</span>}
                                <span className="text-[10px] font-bold text-slate-500">
                                    {type === 'service' ? ((item as MarketplaceService).pricingModel || 'Quote') : ((item as MarketplaceProduct).unitOfMeasure || (item as any).unit || 'Unit')}
                                </span>
                            </div>
                        </div>
                    ) : (
                        <span className="inline-flex rounded-md border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-black uppercase text-amber-700">
                            Request quote
                        </span>
                    )}
                </div>

                <div className="mt-auto space-y-1.5 pt-2.5">
                    <div className="grid grid-cols-[1fr_auto] gap-1.5">
                        <Link href={detailHref} onClick={cacheDetail} className="w-full">
                            <Button type="button" variant="outline" size="sm" className="w-full h-8 gap-1.5 rounded-lg border-slate-200/80 text-[10px] font-extrabold text-slate-700 transition-all hover:bg-slate-50/80 active:scale-98">
                                <Eye className="h-3 w-3 text-slate-500" /> Details
                            </Button>
                        </Link>
                        {showCompare && (
                            <CompareToggleButton item={{ type, id: item.id, categoryId: category?.id }} iconOnly className="h-8 w-8 rounded-lg border-slate-200/80 hover:bg-slate-50/80 transition-all" />
                        )}
                    </div>
                    {showAddToCart && (
                        quantity > 0 ? (
                            <div className="flex h-8 items-center justify-between overflow-hidden rounded-lg border-2 border-[#0b2447] bg-white transition-all duration-300 shadow-inner">
                                <button type="button" onClick={(event) => changeQuantity(event, quantity - 1)} className="flex h-full w-8 items-center justify-center text-[#0b2447] transition hover:bg-[#0b2447]/5 active:scale-90" aria-label="Decrease quantity">
                                    <Minus className="h-3 w-3" />
                                </button>
                                <span className="text-xs font-extrabold tabular-nums text-[#0b2447]">{quantity}</span>
                                <button type="button" onClick={(event) => changeQuantity(event, quantity + 1)} className="flex h-full w-8 items-center justify-center text-[#0b2447] transition hover:bg-[#0b2447]/5 active:scale-90" aria-label="Increase quantity">
                                    <Plus className="h-3 w-3" />
                                </button>
                            </div>
                        ) : (
                            <Button type="button" size="sm" onClick={addToCart} className="w-full h-8 gap-1.5 rounded-lg bg-gradient-to-r from-[#0b2447] to-[#07172e] font-black text-[10px] tracking-wide text-white transition-all duration-300 hover:from-[#12335f] hover:to-[#0b2447] hover:shadow-md active:scale-98">
                                <ShoppingCart className="h-3 w-3" /> Add to Cart
                            </Button>
                        )
                    )}
                    {showRequestQuote && (
                        <Button type="button" variant="outline" size="sm" onClick={requestQuote} className="w-full h-8 gap-1.5 rounded-lg border-[#0b2447]/20 text-[10px] font-extrabold text-[#0b2447] hover:bg-blue-50/40 active:scale-98 transition-all">
                            <FileText className="h-3 w-3" /> Request Quote
                        </Button>
                    )}
                </div>
            </div>
        </article>
    );
}
