'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
    Building2, Store, ArrowRight, CheckCircle2
} from 'lucide-react';

function useFadeIn() {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
            { threshold: 0.1 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);
    return { ref, visible };
}

const BUYER_FEATURES = [
    'Verified seller directory',
    'Request for Quote (RFQ)',
    'Manage orders & invoices',
    'Compare supplier prices',
    'Government-grade procurement',
];

const SELLER_FEATURES = [
    'List products & services',
    'Receive buyer inquiries',
    'Participate in tenders',
    'GST-verified business profile',
    'Reach institutional buyers',
];

export function RegistrationCTA() {
    const { ref, visible } = useFadeIn();

    return (
        <section ref={ref} className="mt-2 bg-white border-b border-slate-100">
            <div className="max-w-7xl mx-auto px-4 py-10 sm:py-12">
                {/* Heading */}
                <div
                    className="text-center mb-8"
                    style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(-12px)', transition: 'opacity 0.5s, transform 0.5s' }}
                >
                    <span className="inline-block px-3 py-1 rounded-full bg-[#0b2447]/5 border border-[#0b2447]/10 text-[9px] font-bold text-[#0b2447] uppercase tracking-widest mb-2">
                        Get Started Today
                    </span>
                    <h2 className="text-lg sm:text-xl font-bold text-[#0b2447]">Join the JsgSmile Marketplace</h2>
                    <p className="text-[11px] text-slate-500 mt-1 max-w-md mx-auto">
                        Whether you're a buyer sourcing materials or a seller offering products — we have you covered.
                    </p>
                </div>

                <div className="grid sm:grid-cols-2 gap-5">
                    {/* Buyer card */}
                    <div
                        className="relative overflow-hidden rounded-2xl flex flex-col"
                        style={{
                            opacity: visible ? 1 : 0,
                            transform: visible ? 'translateX(0)' : 'translateX(-24px)',
                            transition: 'opacity 0.55s ease 80ms, transform 0.55s ease 80ms',
                            background: 'linear-gradient(135deg, #07172e 0%, #0b2447 60%, #12335f 100%)',
                        }}
                    >
                        {/* Decorative circle */}
                        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/4 pointer-events-none" />
                        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-blue-400/8 pointer-events-none" />

                        <div className="relative p-6 flex flex-col gap-4 flex-1">
                            <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                                <Building2 className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white">Register as Buyer</h3>
                                <p className="text-[11px] text-white/65 mt-1.5 leading-relaxed">
                                    Access verified MSME sellers, request quotations, and manage your procurement in one unified platform.
                                </p>
                            </div>
                            <ul className="space-y-1.5">
                                {BUYER_FEATURES.map(f => (
                                    <li key={f} className="flex items-center gap-2 text-[11px] text-white/80">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-green-400 shrink-0" /> {f}
                                    </li>
                                ))}
                            </ul>
                            <Link
                                href="/buyer/register"
                                className="mt-auto inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-white text-[#0b2447] text-xs font-bold hover:bg-slate-100 active:scale-95 transition self-start shadow-md"
                            >
                                Get Started <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </div>

                    {/* Seller card */}
                    <div
                        className="relative overflow-hidden rounded-2xl flex flex-col"
                        style={{
                            opacity: visible ? 1 : 0,
                            transform: visible ? 'translateX(0)' : 'translateX(24px)',
                            transition: 'opacity 0.55s ease 160ms, transform 0.55s ease 160ms',
                            background: 'linear-gradient(135deg, #0e4020 0%, #1a5c2e 60%, #1d6e35 100%)',
                        }}
                    >
                        <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/4 pointer-events-none" />
                        <div className="absolute -bottom-8 -left-8 w-32 h-32 rounded-full bg-yellow-400/8 pointer-events-none" />

                        <div className="relative p-6 flex flex-col gap-4 flex-1">
                            <div className="w-12 h-12 rounded-xl bg-white/10 border border-white/15 flex items-center justify-center">
                                <Store className="h-6 w-6 text-white" />
                            </div>
                            <div>
                                <h3 className="text-base font-bold text-white">Register as Seller</h3>
                                <p className="text-[11px] text-white/65 mt-1.5 leading-relaxed">
                                    List your products and services, receive buyer inquiries, and grow your MSME business through digital procurement.
                                </p>
                            </div>
                            <ul className="space-y-1.5">
                                {SELLER_FEATURES.map(f => (
                                    <li key={f} className="flex items-center gap-2 text-[11px] text-white/80">
                                        <CheckCircle2 className="h-3.5 w-3.5 text-yellow-300 shrink-0" /> {f}
                                    </li>
                                ))}
                            </ul>
                            <Link
                                href="/seller/register"
                                className="mt-auto inline-flex items-center gap-2 h-10 px-5 rounded-xl bg-white text-[#1a5c2e] text-xs font-bold hover:bg-slate-100 active:scale-95 transition self-start shadow-md"
                            >
                                Start Selling <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
