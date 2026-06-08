'use client';
import React from 'react';
import Link from 'next/link';
import { BadgeCheck, MapPin, Building2, Package, Wrench } from 'lucide-react';
import type { MarketplaceSeller } from '../api';

interface Props {
    sellers: MarketplaceSeller[];
}

export function VerifiedSellers({ sellers }: Props) {
    if (sellers.length === 0) return null;

    return (
        <section className="py-10 bg-slate-50 border-y border-slate-100" aria-labelledby="sellers-heading">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 id="sellers-heading" className="text-lg font-bold text-[#0b2447]">Verified Seller Organizations</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Trusted and verified MSME organizations</p>
                    </div>
                    <Link href="/marketplace/sellers" className="text-xs font-bold text-[#0b2447] hover:underline inline-flex items-center gap-1 transition">
                        View All Sellers →
                    </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {sellers.map(seller => (
                        <SellerCard key={seller.id} seller={seller} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function SellerCard({ seller }: { seller: MarketplaceSeller }) {
    const location = seller.city || seller.district || seller.state;
    const productCount = seller._count?.products || 0;
    const serviceCount = seller._count?.services || 0;

    return (
        <div className="bg-white rounded-lg border border-slate-200 p-4 hover:shadow-md hover:border-slate-300 transition-all duration-200 space-y-3">
            <div className="flex items-start gap-3">
                <div className="w-11 h-11 rounded-lg bg-[#0b2447]/5 border border-[#0b2447]/10 flex items-center justify-center shrink-0">
                    <Building2 className="h-5 w-5 text-[#0b2447]" />
                </div>
                <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-800 truncate">{seller.organizationName}</h3>
                    <p className="text-[10px] text-slate-500 font-medium">{seller.organizationType?.replace(/_/g, ' ')}</p>
                </div>
            </div>

            {location && (
                <p className="text-[11px] text-slate-500 inline-flex items-center gap-1">
                    <MapPin className="h-3 w-3" /> {location}
                </p>
            )}

            <div className="flex items-center gap-2 flex-wrap">
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200">
                    <BadgeCheck className="h-3 w-3" /> GST Verified
                </span>
                <span className="inline-flex items-center gap-1 text-[9px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
                    <BadgeCheck className="h-3 w-3" /> Udyam
                </span>
            </div>

            <div className="flex items-center gap-4 text-[10px] text-slate-500 font-medium">
                {productCount > 0 && (
                    <span className="inline-flex items-center gap-1"><Package className="h-3 w-3" /> {productCount} Products</span>
                )}
                {serviceCount > 0 && (
                    <span className="inline-flex items-center gap-1"><Wrench className="h-3 w-3" /> {serviceCount} Services</span>
                )}
                {productCount === 0 && serviceCount === 0 && (
                    <span className="text-slate-400">Newly registered</span>
                )}
            </div>

            <Link
                href={`/vendors/${seller.id}`}
                className="block w-full text-center h-8 leading-8 rounded-md border border-slate-200 text-[11px] font-semibold text-[#0b2447] hover:bg-[#0b2447] hover:text-white active:scale-95 transition"
            >
                View Store
            </Link>
        </div>
    );
}
