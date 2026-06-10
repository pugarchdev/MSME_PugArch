'use client';
import React, { useRef } from 'react';
import Link from 'next/link';
import { Building2, BadgeCheck, ChevronLeft, ChevronRight, Package, Wrench, MapPin } from 'lucide-react';
import type { MarketplaceSeller } from '../api';

function sellerLogo(seller: MarketplaceSeller) {
    const profile = seller.profile || {};
    return seller.logoUrl || seller.logoFile?.url || profile.logoUrl || profile.logo || profile.organizationLogoUrl || profile.organizationLogo || null;
}

interface Props { sellers: MarketplaceSeller[]; }

export function SellerStrip({ sellers }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);
    const scroll = (dir: 'left' | 'right') => {
        scrollRef.current?.scrollBy({ left: dir === 'left' ? -320 : 320, behavior: 'smooth' });
    };

    return (
        <section className="bg-white mt-2 border-b border-slate-100">
            <div className="max-w-7xl mx-auto px-4 pt-4 pb-2">
                <div className="flex items-end justify-between mb-3">
                    <div>
                        <h2 className="text-sm sm:text-base font-bold text-[#0b2447]">Vendors & Verified Seller Organizations</h2>
                        <p className="text-[10px] text-slate-500 mt-0.5">Scrollable vendor row of trusted MSMEs with verified GST & Udyam</p>
                    </div>
                    <Link href="/marketplace/sellers" className="text-[11px] font-bold text-[#0b2447] hover:underline">View All →</Link>
                </div>
            </div>
            <div className="relative">
                <button onClick={() => scroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-16 bg-white/90 border border-slate-200 shadow-md flex items-center justify-center hover:bg-slate-50 transition rounded-r-md" aria-label="Scroll left">
                    <ChevronLeft className="h-4 w-4 text-slate-600" />
                </button>
                <div ref={scrollRef} className="flex gap-0 overflow-x-auto no-scrollbar pb-4">
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
                        return (
                            <Link
                                key={seller.id}
                                href={`/vendors/${seller.id}`}
                                className="group shrink-0 w-48 sm:w-52 flex flex-col items-center text-center gap-2 border-r border-slate-100 px-4 py-3 hover:bg-slate-50 transition cursor-pointer"
                            >
                                <div className="w-14 h-14 overflow-hidden rounded-full bg-[#0b2447]/5 border-2 border-[#0b2447]/10 flex items-center justify-center group-hover:border-[#0b2447]/30 transition">
                                    {logo ? <img src={logo} alt={`${seller.organizationName} logo`} className="h-full w-full object-contain p-1.5" loading="lazy" /> : <Building2 className="h-7 w-7 text-[#0b2447]/60" />}
                                </div>
                                <h3 className="text-xs font-semibold text-slate-800 line-clamp-2 leading-tight">{seller.organizationName}</h3>
                                {location && <p className="text-[9px] text-slate-400 inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{location}</p>}
                                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-green-700 bg-green-50 px-1.5 py-0.5 rounded-full border border-green-200"><BadgeCheck className="h-2.5 w-2.5" />GST</span>
                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-full border border-blue-200"><BadgeCheck className="h-2.5 w-2.5" />Udyam</span>
                                </div>
                                <div className="flex items-center gap-2 text-[9px] text-slate-500">
                                    {products > 0 && <span className="inline-flex items-center gap-0.5"><Package className="h-2.5 w-2.5" />{products}</span>}
                                    {services > 0 && <span className="inline-flex items-center gap-0.5"><Wrench className="h-2.5 w-2.5" />{services}</span>}
                                </div>
                                <span className="text-[10px] font-bold text-[#0b2447] group-hover:underline">View Store</span>
                            </Link>
                        );
                    })}
                </div>
                <button onClick={() => scroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-16 bg-white/90 border border-slate-200 shadow-md flex items-center justify-center hover:bg-slate-50 transition rounded-l-md" aria-label="Scroll right">
                    <ChevronRight className="h-4 w-4 text-slate-600" />
                </button>
            </div>
        </section>
    );
}
