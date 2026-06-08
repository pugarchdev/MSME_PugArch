'use client';
import React, { useEffect, useRef, useState } from 'react';
import { ShieldCheck, BadgeCheck, Truck, HeadphonesIcon, FileText, Lock } from 'lucide-react';

const BADGES = [
    { icon: ShieldCheck, title: 'Verified Sellers Only', sub: 'GST + Udyam checked', color: 'text-green-600' },
    { icon: BadgeCheck, title: 'Trusted Procurement', sub: 'Government-grade process', color: 'text-blue-600' },
    { icon: Truck, title: 'Local Delivery', sub: 'Jharsuguda & beyond', color: 'text-orange-500' },
    { icon: HeadphonesIcon, title: 'Dedicated Helpdesk', sub: 'Mon–Sat support', color: 'text-purple-600' },
    { icon: FileText, title: 'Quote-Based Buying', sub: 'Transparent pricing', color: 'text-[#0b2447]' },
    { icon: Lock, title: 'Secure Transactions', sub: 'Encrypted & audited', color: 'text-teal-600' },
];

export function TrustBanner() {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setVisible(true); obs.disconnect(); } },
            { threshold: 0.2 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    return (
        <div ref={ref} className="bg-white border-b border-slate-100">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-stretch divide-x divide-slate-100 overflow-x-auto no-scrollbar">
                    {BADGES.map((b, i) => {
                        const Icon = b.icon;
                        return (
                            <div
                                key={b.title}
                                className="flex items-center gap-3 px-5 py-3.5 shrink-0 group cursor-default"
                                style={{
                                    opacity: visible ? 1 : 0,
                                    transform: visible ? 'translateY(0)' : 'translateY(8px)',
                                    transition: `opacity 0.4s ease ${i * 60}ms, transform 0.4s ease ${i * 60}ms`,
                                }}
                            >
                                <div className="w-9 h-9 rounded-lg bg-slate-50 border border-slate-100 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-200">
                                    <Icon className={`h-4 w-4 ${b.color}`} />
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-slate-800 whitespace-nowrap">{b.title}</p>
                                    <p className="text-[9px] text-slate-400 whitespace-nowrap">{b.sub}</p>
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
