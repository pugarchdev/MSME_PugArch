'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import {
    Building2, Factory, Landmark, Briefcase, Users, ShieldCheck,
    Package, Wrench, Truck, Award, Store, Globe
} from 'lucide-react';

// ─── Buyer side ───────────────────────────────────────────────────────────────
const BUYER_CATEGORIES = [
    {
        icon: Factory,
        label: 'Large Scale Industries',
        desc: 'Steel, power, mining & heavy manufacturing units',
        accent: 'bg-blue-50 text-blue-700 border-blue-100',
        dot: 'bg-blue-500',
    },
    {
        icon: Building2,
        label: 'MSME Buyers',
        desc: 'Small & medium enterprises procuring inputs',
        accent: 'bg-indigo-50 text-indigo-700 border-indigo-100',
        dot: 'bg-indigo-500',
    },
    {
        icon: Landmark,
        label: 'Government Buyers',
        desc: 'Central, state & local government departments',
        accent: 'bg-sky-50 text-sky-700 border-sky-100',
        dot: 'bg-sky-500',
    },
    {
        icon: Briefcase,
        label: 'Private Enterprises',
        desc: 'Corporates & private sector procurement teams',
        accent: 'bg-purple-50 text-purple-700 border-purple-100',
        dot: 'bg-purple-500',
    },
    {
        icon: Users,
        label: 'Corporate Procurement',
        desc: 'Large volume institutional buyers & SCM teams',
        accent: 'bg-violet-50 text-violet-700 border-violet-100',
        dot: 'bg-violet-500',
    },
    {
        icon: ShieldCheck,
        label: 'Public Sector Units',
        desc: 'PSUs and government-owned enterprises',
        accent: 'bg-cyan-50 text-cyan-700 border-cyan-100',
        dot: 'bg-cyan-500',
    },
    {
        icon: Package,
        label: 'Bulk Requirement Buyers',
        desc: 'High-volume, repeat procurement organisations',
        accent: 'bg-teal-50 text-teal-700 border-teal-100',
        dot: 'bg-teal-500',
    },
];

// ─── Supplier side ────────────────────────────────────────────────────────────
const SUPPLIER_CATEGORIES = [
    {
        icon: Store,
        label: 'MSME Suppliers',
        desc: 'Verified micro, small & medium enterprises',
        accent: 'bg-orange-50 text-orange-700 border-orange-100',
        dot: 'bg-orange-500',
    },
    {
        icon: Factory,
        label: 'Industry Suppliers',
        desc: 'Tier-1 & Tier-2 industrial suppliers',
        accent: 'bg-amber-50 text-amber-700 border-amber-100',
        dot: 'bg-amber-500',
    },
    {
        icon: Building2,
        label: 'Manufacturers',
        desc: 'Original manufacturers & OEM producers',
        accent: 'bg-yellow-50 text-yellow-700 border-yellow-100',
        dot: 'bg-yellow-500',
    },
    {
        icon: Wrench,
        label: 'Service Providers',
        desc: 'Maintenance, IT, logistics & professional services',
        accent: 'bg-red-50 text-red-700 border-red-100',
        dot: 'bg-red-500',
    },
    {
        icon: Truck,
        label: 'Local Vendors',
        desc: 'Jharsuguda-district registered vendors',
        accent: 'bg-rose-50 text-rose-700 border-rose-100',
        dot: 'bg-rose-500',
    },
    {
        icon: Award,
        label: 'Verified Sellers',
        desc: 'GST + Udyam verified & admin-approved sellers',
        accent: 'bg-green-50 text-green-700 border-green-100',
        dot: 'bg-green-500',
    },
    {
        icon: Globe,
        label: 'Product & Service Providers',
        desc: 'Broad catalogue of goods and managed services',
        accent: 'bg-emerald-50 text-emerald-700 border-emerald-100',
        dot: 'bg-emerald-500',
    },
];

// ─── Intersection-observer fade-in hook ──────────────────────────────────────
function useFadeIn() {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
            { threshold: 0.12 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);
    return { ref, visible };
}

interface CategoryCardProps {
    icon: React.ElementType;
    label: string;
    desc: string;
    accent: string;
    dot: string;
    delay: number;
    visible: boolean;
}

function CategoryCard({ icon: Icon, label, desc, accent, dot, delay, visible }: CategoryCardProps) {
    return (
        <div
            className="group flex items-start gap-3 p-3.5 rounded-xl border border-slate-100 bg-white hover:border-slate-200 hover:shadow-md hover:-translate-y-0.5 transition-all duration-300 cursor-default"
            style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(16px)',
                transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms, box-shadow 0.2s, border-color 0.2s`,
            }}
        >
            <div className={`w-9 h-9 rounded-lg flex items-center justify-center border shrink-0 group-hover:scale-110 transition-transform duration-200 ${accent}`}>
                <Icon className="h-4.5 w-4.5" style={{ width: 18, height: 18 }} />
            </div>
            <div className="min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${dot}`} />
                    <p className="text-[12px] font-bold text-slate-800 leading-tight">{label}</p>
                </div>
                <p className="text-[10px] text-slate-500 leading-relaxed">{desc}</p>
            </div>
        </div>
    );
}

export function IndustryNetwork() {
    const { ref, visible } = useFadeIn();

    return (
        <section
            ref={ref}
            className="mt-2 bg-white border-b border-slate-100 overflow-hidden"
            aria-labelledby="network-heading"
        >
            {/* Subtle background pattern */}
            <div
                className="absolute inset-0 pointer-events-none opacity-[0.025]"
                style={{
                    backgroundImage:
                        'radial-gradient(circle at 1px 1px, #0b2447 1px, transparent 0)',
                    backgroundSize: '28px 28px',
                }}
            />

            <div className="relative max-w-7xl mx-auto px-4 py-10 sm:py-12">
                {/* Section header */}
                <div
                    className="text-center mb-8"
                    style={{
                        opacity: visible ? 1 : 0,
                        transform: visible ? 'translateY(0)' : 'translateY(-12px)',
                        transition: 'opacity 0.5s ease 0ms, transform 0.5s ease 0ms',
                    }}
                >
                    <span className="inline-block px-3 py-1 rounded-full bg-[#0b2447]/5 border border-[#0b2447]/10 text-[9px] font-bold text-[#0b2447] uppercase tracking-widest mb-3">
                        Ecosystem
                    </span>
                    <h2 id="network-heading" className="text-lg sm:text-xl font-bold text-[#0b2447]">
                        Large Industries, MSME Buyers &amp; Supplier Network
                    </h2>
                    <p className="text-[11px] text-slate-500 mt-2 max-w-xl mx-auto">
                        A trusted ecosystem connecting large-scale industries, government buyers, and private enterprises with verified MSME suppliers, manufacturers, and service providers.
                    </p>
                </div>

                {/* Two-column grid */}
                <div className="grid lg:grid-cols-2 gap-6">
                    {/* ── Buyers column ── */}
                    <div>
                        <div
                            className="flex items-center gap-2 mb-4"
                            style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease 80ms' }}
                        >
                            <div className="w-7 h-7 rounded-lg bg-[#0b2447] flex items-center justify-center shrink-0">
                                <Landmark className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div>
                                <p className="text-[11px] font-black text-[#0b2447] uppercase tracking-wider">Buyer Organisations</p>
                                <p className="text-[9px] text-slate-400">Who procures on this platform</p>
                            </div>
                            <Link
                                href="/buyer/register"
                                className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-[#0b2447] hover:underline shrink-0"
                            >
                                Register as Buyer →
                            </Link>
                        </div>
                        <div className="space-y-2">
                            {BUYER_CATEGORIES.map((cat, i) => (
                                <CategoryCard key={cat.label} {...cat} delay={100 + i * 60} visible={visible} />
                            ))}
                        </div>
                    </div>

                    {/* ── Suppliers column ── */}
                    <div>
                        <div
                            className="flex items-center gap-2 mb-4"
                            style={{ opacity: visible ? 1 : 0, transition: 'opacity 0.5s ease 80ms' }}
                        >
                            <div className="w-7 h-7 rounded-lg bg-[#137735] flex items-center justify-center shrink-0">
                                <Store className="h-3.5 w-3.5 text-white" />
                            </div>
                            <div>
                                <p className="text-[11px] font-black text-[#137735] uppercase tracking-wider">Supplier Network</p>
                                <p className="text-[9px] text-slate-400">Who supplies on this platform</p>
                            </div>
                            <Link
                                href="/seller/register"
                                className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold text-[#137735] hover:underline shrink-0"
                            >
                                Register as Seller →
                            </Link>
                        </div>
                        <div className="space-y-2">
                            {SUPPLIER_CATEGORIES.map((cat, i) => (
                                <CategoryCard key={cat.label} {...cat} delay={120 + i * 60} visible={visible} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
