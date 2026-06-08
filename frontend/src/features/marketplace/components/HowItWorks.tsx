'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
    UserPlus, ClipboardCheck, ShieldCheck, Search,
    ShoppingCart, FileText, Package, Store, CheckCircle2,
    ArrowRight
} from 'lucide-react';

function useFadeIn() {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([e]) => { if (e.isIntersecting) { setVisible(true); obs.disconnect(); } },
            { threshold: 0.1 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);
    return { ref, visible };
}

const BUYER_STEPS = [
    { icon: UserPlus, num: '01', title: 'Register', desc: 'Sign up as a buyer with email & mobile' },
    { icon: ClipboardCheck, num: '02', title: 'Onboarding', desc: 'Complete your organisation details' },
    { icon: ShieldCheck, num: '03', title: 'Verification', desc: 'Admin approves your organisation' },
    { icon: Search, num: '04', title: 'Browse', desc: 'Search products & services' },
    { icon: ShoppingCart, num: '05', title: 'Cart / Quote', desc: 'Add to cart or request a quote' },
    { icon: FileText, num: '06', title: 'Order', desc: 'Place order or submit inquiry' },
];

const SELLER_STEPS = [
    { icon: UserPlus, num: '01', title: 'Register', desc: 'Sign up as a seller with email & mobile' },
    { icon: ClipboardCheck, num: '02', title: 'Onboarding', desc: 'Add GST, PAN, Udyam details' },
    { icon: ShieldCheck, num: '03', title: 'Verification', desc: 'Auto + admin verification' },
    { icon: Package, num: '04', title: 'Add Listings', desc: 'Upload products and services' },
    { icon: CheckCircle2, num: '05', title: 'Approval', desc: 'Admin approves your listings' },
    { icon: Store, num: '06', title: 'Go Live', desc: 'Start receiving buyer inquiries' },
];

export function HowItWorks() {
    const { ref, visible } = useFadeIn();

    return (
        <section ref={ref} className="bg-white mt-2 border-b border-slate-100" id="how-it-works">
            <div className="max-w-7xl mx-auto px-4 py-10 sm:py-12">
                {/* Header */}
                <div
                    className="text-center mb-8"
                    style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(-12px)', transition: 'opacity 0.5s, transform 0.5s' }}
                >
                    <span className="inline-block px-3 py-1 rounded-full bg-[#0b2447]/5 border border-[#0b2447]/10 text-[9px] font-bold text-[#0b2447] uppercase tracking-widest mb-2">
                        Simple Process
                    </span>
                    <h2 className="text-lg sm:text-xl font-bold text-[#0b2447]">How It Works</h2>
                    <p className="text-[11px] text-slate-500 mt-1">Get started on the marketplace in a few easy steps</p>
                </div>

                <div className="grid lg:grid-cols-2 gap-5">
                    {/* Buyer flow */}
                    <div
                        className="rounded-2xl border border-slate-200 overflow-hidden"
                        style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateX(-20px)', transition: 'opacity 0.55s ease 80ms, transform 0.55s ease 80ms' }}
                    >
                        <div className="px-5 py-3.5 bg-[#0b2447] flex items-center justify-between">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-white/15 text-white text-[10px] font-bold flex items-center justify-center">B</span>
                                Buyer Flow
                            </h3>
                            <Link href="/buyer/register" className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/75 hover:text-white transition">
                                Register <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                        <div className="bg-slate-50 divide-y divide-white">
                            {BUYER_STEPS.map((step, i) => {
                                const Icon = step.icon;
                                return (
                                    <div
                                        key={i}
                                        className="flex items-center gap-3 px-4 py-3 hover:bg-white transition-colors"
                                        style={{ opacity: visible ? 1 : 0, transition: `opacity 0.4s ease ${100 + i * 60}ms` }}
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                                            <Icon className="h-4 w-4 text-[#0b2447]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-semibold text-slate-800">{step.title}</p>
                                            <p className="text-[10px] text-slate-500">{step.desc}</p>
                                        </div>
                                        <span className="text-[9px] font-bold text-slate-300 shrink-0">{step.num}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Seller flow */}
                    <div
                        className="rounded-2xl border border-slate-200 overflow-hidden"
                        style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateX(20px)', transition: 'opacity 0.55s ease 160ms, transform 0.55s ease 160ms' }}
                    >
                        <div className="px-5 py-3.5 bg-[#1a5c2e] flex items-center justify-between">
                            <h3 className="text-sm font-bold text-white flex items-center gap-2">
                                <span className="w-6 h-6 rounded-full bg-white/15 text-white text-[10px] font-bold flex items-center justify-center">S</span>
                                Seller Flow
                            </h3>
                            <Link href="/seller/register" className="inline-flex items-center gap-1 text-[10px] font-semibold text-white/75 hover:text-white transition">
                                Register <ArrowRight className="h-3 w-3" />
                            </Link>
                        </div>
                        <div className="bg-slate-50 divide-y divide-white">
                            {SELLER_STEPS.map((step, i) => {
                                const Icon = step.icon;
                                return (
                                    <div
                                        key={i}
                                        className="flex items-center gap-3 px-4 py-3 hover:bg-white transition-colors"
                                        style={{ opacity: visible ? 1 : 0, transition: `opacity 0.4s ease ${120 + i * 60}ms` }}
                                    >
                                        <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0">
                                            <Icon className="h-4 w-4 text-[#1a5c2e]" />
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[11px] font-semibold text-slate-800">{step.title}</p>
                                            <p className="text-[10px] text-slate-500">{step.desc}</p>
                                        </div>
                                        <span className="text-[9px] font-bold text-slate-300 shrink-0">{step.num}</span>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
