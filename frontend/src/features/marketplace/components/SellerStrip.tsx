'use client';
import React, { useRef } from 'react';
import Link from 'next/link';
import { Building2, BadgeCheck, ChevronLeft, ChevronRight, Package, Wrench, MapPin } from 'lucide-react';
import { cn } from '../../../lib/utils';
import type { MarketplaceSeller } from '../api';

function sellerLogo(seller: MarketplaceSeller) {
    const profile = seller.profile || {};
    return seller.logoUrl || seller.logoFile?.url || profile.logoUrl || profile.logo || profile.organizationLogoUrl || profile.organizationLogo || null;
}

function initials(name: string) {
    return name
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 2)
        .map(part => part[0]?.toUpperCase())
        .join('') || 'V';
}

function getDeterministicIndex(str: string) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    return Math.abs(hash);
}

const getInitialsBg = (id: number) => {
    const gradients = [
        'from-blue-50 to-indigo-100 text-[#0b2447] border-indigo-200/60 shadow-inner',
        'from-emerald-50 to-teal-100 text-emerald-800 border-emerald-200/60 shadow-inner',
        'from-purple-50 to-violet-100 text-purple-800 border-purple-200/60 shadow-inner',
        'from-amber-50 to-orange-100 text-amber-800 border-amber-200/60 shadow-inner',
        'from-rose-50 to-pink-100 text-rose-800 border-rose-200/60 shadow-inner',
    ];
    return gradients[Math.abs(id) % gradients.length];
};

interface Props { sellers: MarketplaceSeller[]; }

export function SellerStrip({ sellers }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const scroll = (dir: 'left' | 'right') => {
        scrollRef.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' });
    };

    return (
        <section className="mt-2 border-b border-slate-100 bg-white" aria-labelledby="seller-strip-heading">
            <div className="mx-auto max-w-[1680px] px-4 py-8 sm:px-6 sm:py-10 2xl:px-8">
                <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a6a2f]">Trusted Partners</p>
                        <h2 id="seller-strip-heading" className="mt-1 text-xl font-black text-[#0b2447] sm:text-2xl">Vendors & Verified Seller Organizations</h2>
                        <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">Scrollable vendor row of trusted MSMEs with verified GST & Udyam</p>
                    </div>
                    <Link href="/marketplace/sellers" className="inline-flex h-9 items-center gap-1.5 self-start rounded-lg border border-[#0b2447] px-4 text-xs font-bold text-[#0b2447] transition hover:bg-[#0b2447] hover:text-white sm:self-end">
                        View All <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                </div>

                <div className="relative group/strip">
                    <button
                        type="button"
                        onClick={() => scroll('left')}
                        className="absolute -left-2 lg:-left-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/70 bg-white/90 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-[#0b2447] hover:text-white hover:border-[#0b2447] hover:shadow-lg active:scale-95 lg:flex text-slate-600"
                        aria-label="Scroll sellers left"
                    >
                        <ChevronLeft className="h-5 w-5" />
                    </button>

                    <div ref={scrollRef} className="flex gap-4 overflow-x-auto pb-4 pt-1 no-scrollbar lg:px-4">
                        {sellers.length === 0 ? (
                            <div className="mx-4 mb-2 w-full rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center">
                                <Building2 className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                                <p className="text-sm font-bold text-slate-700">No verified vendors available right now.</p>
                                <p className="mt-1 text-xs text-slate-500">Approved vendor organizations will appear here automatically.</p>
                            </div>
                        ) : sellers.map(seller => {
                            const location = seller.city || seller.district || seller.state;
                            const products = seller._count?.products || 0;
                            const services = seller._count?.services || 0;
                            const logo = sellerLogo(seller);
                            const orgInitials = initials(seller.organizationName);
                            const initialsBg = getInitialsBg(getDeterministicIndex(seller.organizationName));

                            return (
                                <Link
                                    key={seller.id}
                                    href={`/vendors/${seller.id}`}
                                    className="group flex w-[210px] shrink-0 snap-start flex-col items-center gap-3 rounded-2xl border border-slate-200/60 bg-white/85 backdrop-blur-md px-4 py-5 text-center shadow-sm transition-all duration-300 ease-out hover:-translate-y-1 hover:scale-[1.02] hover:border-[#0b2447]/30 hover:bg-white hover:shadow-md"
                                >
                                    {logo ? (
                                        <div className="w-14 h-14 overflow-hidden rounded-full bg-slate-50 border-2 border-slate-100 flex items-center justify-center group-hover:border-[#0b2447]/30 transition-all duration-300 shadow-inner group-hover:scale-105">
                                            <img src={logo} alt={`${seller.organizationName} logo`} className="h-full w-full object-contain p-1" loading="lazy" />
                                        </div>
                                    ) : (
                                        <div className={cn("w-14 h-14 rounded-full border border-slate-200/30 flex items-center justify-center text-sm font-extrabold tracking-wider transition-all duration-300 group-hover:scale-105 bg-gradient-to-br", initialsBg)}>
                                            {orgInitials}
                                        </div>
                                    )}

                                    <h3 className="text-xs font-extrabold text-slate-900 line-clamp-2 leading-tight min-h-[2.5rem] flex items-center justify-center group-hover:text-[#0b2447] transition-colors duration-200">
                                        {seller.organizationName}
                                    </h3>

                                    {location ? (
                                        <p className="text-[10px] font-bold text-slate-450 inline-flex items-center gap-1">
                                            <MapPin className="h-3 w-3 text-slate-400" />
                                            {location}
                                        </p>
                                    ) : (
                                        <div className="h-[15px]" />
                                    )}

                                    <div className="flex items-center gap-1.5 justify-center">
                                        <span className="inline-flex items-center gap-1 text-[9px] font-black tracking-wider uppercase text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200/60 shadow-sm">
                                            <BadgeCheck className="h-2.5 w-2.5" /> GST
                                        </span>
                                        <span className="inline-flex items-center gap-1 text-[9px] font-black tracking-wider uppercase text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200/60 shadow-sm">
                                            <BadgeCheck className="h-2.5 w-2.5" /> UDYAM
                                        </span>
                                    </div>

                                    <div className="flex items-center gap-3 text-[10px] font-bold text-slate-500/95 border-t border-slate-100 w-full pt-3 justify-center">
                                        {products > 0 || services > 0 ? (
                                            <>
                                                {products > 0 && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Package className="h-3.5 w-3.5 text-slate-450" />
                                                        <span>{products} {products === 1 ? 'product' : 'products'}</span>
                                                    </span>
                                                )}
                                                {products > 0 && services > 0 && <span className="text-slate-300">•</span>}
                                                {services > 0 && (
                                                    <span className="inline-flex items-center gap-1">
                                                        <Wrench className="h-3.5 w-3.5 text-slate-450" />
                                                        <span>{services} {services === 1 ? 'service' : 'services'}</span>
                                                    </span>
                                                )}
                                            </>
                                        ) : (
                                            <span className="text-slate-400 text-[9px] uppercase tracking-wider">New Partner</span>
                                        )}
                                    </div>

                                    <span className="mt-1 text-[10px] font-extrabold uppercase tracking-wider text-[#0b2447] border border-[#0b2447]/10 px-3 py-1.5 rounded-lg bg-[#0b2447]/5 transition-all duration-300 group-hover:bg-[#0b2447] group-hover:text-white group-hover:border-[#0b2447] group-hover:shadow-sm">
                                        View Store
                                    </span>
                                </Link>
                            );
                        })}
                    </div>

                    <button
                        type="button"
                        onClick={() => scroll('right')}
                        className="absolute -right-2 lg:-right-4 top-1/2 z-10 hidden h-10 w-10 -translate-y-1/2 items-center justify-center rounded-full border border-slate-200/70 bg-white/90 shadow-md backdrop-blur-md transition-all duration-300 hover:scale-110 hover:bg-[#0b2447] hover:text-white hover:border-[#0b2447] hover:shadow-lg active:scale-95 lg:flex text-slate-600"
                        aria-label="Scroll sellers right"
                    >
                        <ChevronRight className="h-5 w-5" />
                    </button>
                </div>
            </div>
        </section>
    );
}
