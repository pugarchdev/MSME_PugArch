'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ArrowRight, ShieldCheck, Users, Package, Star } from 'lucide-react';
import type { MarketplaceBanner } from '../api';
import { DEFAULT_MARKETPLACE_BANNERS } from '../../banners/defaultBanners';
import { BASE_URL } from '../../../lib/api';

// Quick-stat pills shown on the right on desktop
const QUICK_STATS = [
    { icon: ShieldCheck, label: 'Verified Sellers', value: 'GST + Udyam', color: 'text-green-400' },
    { icon: Users, label: 'Buyer Types', value: 'Govt · MSME · Private', color: 'text-blue-300' },
    { icon: Package, label: 'Product Categories', value: '10+ categories', color: 'text-orange-300' },
    { icon: Star, label: 'Trusted Platform', value: 'Jharsuguda District', color: 'text-amber-300' },
];

interface Props { banners: MarketplaceBanner[]; }

const imageSrc = (url?: string) => {
    if (!url) return '';
    if (/^(https?:|data:|blob:)/i.test(url)) return url;
    if (url.startsWith('/')) return `${BASE_URL}${url}`;
    return url;
};

export function HeroBanner({ banners }: Props) {
    const slides = banners.length > 0 ? banners : DEFAULT_MARKETPLACE_BANNERS as unknown as MarketplaceBanner[];
    const [current, setCurrent] = useState(0);
    const [fading, setFading] = useState(false);

    const goTo = useCallback((idx: number) => {
        setFading(true);
        setTimeout(() => { setCurrent(idx); setFading(false); }, 220);
    }, []);

    const next = useCallback(() => goTo((current + 1) % slides.length), [current, slides.length, goTo]);
    const prev = useCallback(() => goTo((current - 1 + slides.length) % slides.length), [current, slides.length, goTo]);

    useEffect(() => {
        const t = setInterval(next, 5500);
        return () => clearInterval(t);
    }, [next]);

    const slide = slides[current];
    const ctaLink = slide.ctaLink || slide.targetUrl;
    const ctaText = slide.ctaText || (ctaLink ? 'View Details' : '');

    const handleCtaClick = (e: React.MouseEvent<HTMLAnchorElement>, link: string) => {
        if (link.startsWith('#')) {
            e.preventDefault();
            document.querySelector(link)?.scrollIntoView({ behavior: 'smooth' });
        }
    };

    return (
        <section
            className="relative overflow-hidden"
            aria-label="Hero Banner"
            style={{ background: 'linear-gradient(135deg, #07172e 0%, #0b2447 60%, #12335f 100%)' }}
        >
            {/* Background image */}
            <div className="absolute inset-0">
                {slide.imageUrl && (
                    <img
                        key={slide.id}
                        src={imageSrc(slide.imageUrl)}
                        alt=""
                        loading="eager"
                        className={`w-full h-full object-cover transition-opacity duration-300 ${fading ? 'opacity-0' : 'opacity-100'}`}
                    />
                )}
                {/* Strong gradient — left solid navy, right fades to transparent */}
                <div className="absolute inset-0 bg-gradient-to-r from-[#07172e]/96 via-[#0b2447]/82 to-[#0b2447]/40 lg:to-transparent" />
                {/* Bottom fade */}
                <div className="absolute bottom-0 left-0 right-0 h-24 bg-gradient-to-t from-[#07172e]/60 to-transparent" />
            </div>

            <div className="relative mx-auto flex min-h-[360px] max-w-[1680px] items-center px-4 py-12 sm:px-6 sm:py-16 lg:min-h-[430px] xl:min-h-[480px] 2xl:px-8 2xl:py-24">
                <div className="grid w-full gap-8 lg:grid-cols-[minmax(0,0.58fr)_minmax(360px,0.42fr)] lg:items-center">
                    {/* Left: main content */}
                    <div className={`transition-all duration-300 ${fading ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
                        {/* Trust badge */}
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[9px] font-bold text-white/80 uppercase tracking-widest mb-5">
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            Official MSME Marketplace · Jharsuguda District, Odisha
                        </div>

                        {/* Title — supports \n line breaks */}
                        <h1 className="mb-4 text-2xl font-black leading-tight tracking-tight text-white sm:text-3xl lg:text-[2.4rem] xl:text-[2.8rem]">
                            {slide.title.split('\n').map((line, i) => (
                                <React.Fragment key={i}>
                                    {i > 0 && <br />}
                                    {line}
                                </React.Fragment>
                            ))}
                        </h1>

                        {slide.subtitle && (
                            <p className="mb-7 max-w-xl text-sm leading-relaxed text-white/70 lg:text-base">
                                {slide.subtitle}
                            </p>
                        )}

                        {/* CTA buttons */}
                        <div className="flex flex-wrap gap-3">
                            {ctaText && ctaLink && (
                                <Link
                                    href={ctaLink}
                                    onClick={(e) => handleCtaClick(e, ctaLink)}
                                    className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-white text-[#0b2447] text-sm font-bold hover:bg-slate-100 active:scale-95 transition shadow-lg shadow-black/20"
                                >
                                    {ctaText}
                                    <ArrowRight className="h-4 w-4" />
                                </Link>
                            )}
                            <Link
                                href="/login"
                                className="inline-flex items-center gap-2 h-11 px-5 rounded-xl border border-white/30 text-white text-sm font-semibold hover:bg-white/10 active:scale-95 transition"
                            >
                                Login to Portal
                            </Link>
                        </div>
                    </div>

                    {/* Right: quick-stat cards — desktop only */}
                    {/* <div className="hidden lg:grid grid-cols-2 gap-3">
                        {QUICK_STATS.map((stat, i) => {
                            const Icon = stat.icon;
                            return (
                                <div
                                    key={stat.label}
                                    className="bg-white/8 border border-white/12 rounded-xl p-4 hover:bg-white/12 transition-all duration-300"
                                    style={{
                                        animationDelay: `${i * 100}ms`,
                                    }}
                                >
                                    <div className={`mb-2 ${stat.color}`}>
                                        <Icon className="h-5 w-5" />
                                    </div>
                                    <p className={`text-base font-bold mb-0.5 ${stat.color}`}>{stat.value}</p>
                                    <p className="text-[10px] text-white/50 font-medium">{stat.label}</p>
                                </div>
                            );
                        })}
                    </div> */}
                </div>
            </div>

            {/* Slide controls */}
            <div className="absolute bottom-4 left-4 sm:left-8 right-4 sm:right-8 flex items-center justify-between">
                <span className="text-[9px] font-bold text-white/35 tracking-widest tabular-nums">
                    {String(current + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
                </span>
                <div className="flex items-center gap-2">
                    <button onClick={prev} className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition" aria-label="Previous slide">
                        <ChevronLeft className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex gap-1.5">
                        {slides.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => goTo(i)}
                                className={`rounded-full transition-all duration-300 ${i === current ? 'w-6 h-2 bg-white' : 'w-2 h-2 bg-white/30 hover:bg-white/55'}`}
                                aria-label={`Go to slide ${i + 1}`}
                                aria-current={i === current ? 'true' : undefined}
                            />
                        ))}
                    </div>
                    <button onClick={next} className="w-7 h-7 rounded-full bg-white/10 border border-white/20 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition" aria-label="Next slide">
                        <ChevronRight className="h-3.5 w-3.5" />
                    </button>
                </div>
            </div>
        </section>
    );
}
