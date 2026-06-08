'use client';
import React, { useEffect, useRef, useState } from 'react';
import { Building2, Users, Package, Wrench, Layers, TrendingUp } from 'lucide-react';
import type { MarketplaceStats } from '../api';

// ─── Animated counter ─────────────────────────────────────────────────────────
function useCounter(target: number, running: boolean, duration = 1400) {
    const [count, setCount] = useState(0);
    useEffect(() => {
        if (!running || target === 0) return;
        let start = 0;
        const step = target / (duration / 16);
        const frame = () => {
            start += step;
            if (start >= target) { setCount(target); return; }
            setCount(Math.floor(start));
            requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
    }, [running, target, duration]);
    return target === 0 ? 0 : count;
}

function StatCard({
    icon, value, label, color, bg, delay, running
}: {
    icon: React.ReactNode; value: number; label: string; color: string; bg: string; delay: number; running: boolean;
}) {
    const animated = useCounter(value, running, 1200);
    return (
        <div
            className="flex flex-col items-center text-center p-5 rounded-2xl bg-white/7 border border-white/10 hover:bg-white/12 transition-all duration-300 hover:-translate-y-0.5 hover:shadow-lg hover:shadow-black/10 cursor-default"
            style={{
                opacity: running ? 1 : 0,
                transform: running ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.5s ease ${delay}ms, transform 0.5s ease ${delay}ms, background 0.25s, box-shadow 0.25s`,
            }}
        >
            <div className={`w-12 h-12 rounded-xl flex items-center justify-center mx-auto mb-3 ${bg}`}>
                {icon}
            </div>
            <p className={`text-2xl sm:text-3xl font-black mb-1 ${color}`}>
                {animated.toLocaleString('en-IN')}
                {value > 0 && <span className="text-lg">+</span>}
            </p>
            <p className="text-[11px] text-white/60 font-medium leading-tight">{label}</p>
        </div>
    );
}

interface Props { stats?: MarketplaceStats; }

export function StatsSection({ stats }: Props) {
    const ref = useRef<HTMLDivElement>(null);
    const [running, setRunning] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const obs = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { setRunning(true); obs.disconnect(); } },
            { threshold: 0.2 }
        );
        obs.observe(el);
        return () => obs.disconnect();
    }, []);

    const items = [
        { icon: <Building2 className="h-5 w-5" />, value: stats?.verifiedSellers || 0, label: 'Verified Sellers', color: 'text-blue-300', bg: 'bg-blue-400/20' },
        { icon: <Users className="h-5 w-5" />, value: stats?.registeredBuyers || 0, label: 'Registered Buyers', color: 'text-violet-300', bg: 'bg-violet-400/20' },
        { icon: <Package className="h-5 w-5" />, value: stats?.productsListed || 0, label: 'Products Listed', color: 'text-orange-300', bg: 'bg-orange-400/20' },
        { icon: <Wrench className="h-5 w-5" />, value: stats?.servicesListed || 0, label: 'Services Listed', color: 'text-teal-300', bg: 'bg-teal-400/20' },
        { icon: <Layers className="h-5 w-5" />, value: stats?.categories || 0, label: 'Categories', color: 'text-green-300', bg: 'bg-green-400/20' },
    ];

    const hasData = items.some(i => i.value > 0);
    if (!hasData) return null;

    return (
        <section
            ref={ref}
            className="mt-2 relative overflow-hidden"
            style={{ background: 'linear-gradient(135deg, #07172e 0%, #0b2447 55%, #12335f 100%)' }}
            aria-labelledby="stats-heading"
        >
            {/* Decorative glow */}
            <div className="absolute -top-24 -right-24 w-64 h-64 rounded-full bg-blue-400/8 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-violet-400/8 blur-3xl pointer-events-none" />

            <div className="relative max-w-7xl mx-auto px-4 py-12">
                <div
                    className="text-center mb-8"
                    style={{ opacity: running ? 1 : 0, transition: 'opacity 0.5s' }}
                >
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/8 border border-white/12 mb-3">
                        <TrendingUp className="h-3 w-3 text-green-400" />
                        <span className="text-[9px] font-bold text-white/70 uppercase tracking-widest">Live Platform Stats</span>
                    </div>
                    <h2 id="stats-heading" className="text-lg font-bold text-white">JsgSmile Portal at a Glance</h2>
                    <p className="text-[11px] text-white/50 mt-1">Real-time numbers from the Jharsuguda MSME Marketplace</p>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                    {items.map((item, i) => (
                        <StatCard key={item.label} {...item} delay={80 + i * 100} running={running} />
                    ))}
                </div>
            </div>
        </section>
    );
}
