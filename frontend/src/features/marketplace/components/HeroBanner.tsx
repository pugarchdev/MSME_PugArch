'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight, ArrowRight, ShieldCheck, Users, Package, Star } from 'lucide-react';
import type { MarketplaceBanner } from '../api';

const FALLBACK_BANNERS: MarketplaceBanner[] = [
    {
        id: 1,
        title: 'Discover Verified MSME\nProducts & Services',
        subtitle: 'Browse quality products from verified local manufacturers and service providers in Jharsuguda District',
        ctaText: 'Explore Marketplace',
        ctaLink: '#products',
        imageUrl: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1400&q=75&auto=format&fit=crop',
        displayOrder: 1,
    },
    {
        id: 2,
        title: 'Register as Seller &\nGrow Your Business',
        subtitle: 'List your products and services. Reach government, institutional, and enterprise buyers across the district.',
        ctaText: 'Register as Seller',
        ctaLink: '/seller/register',
        imageUrl: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1400&q=75&auto=format&fit=crop',
        displayOrder: 2,
    },
    {
        id: 3,
        title: 'Transparent Procurement\nfor All Buyers',
        subtitle: 'Access verified suppliers, compare products, request quotations, and manage your procurement needs in one place.',
        ctaText: 'Register as Buyer',
        ctaLink: '/buyer/register',
        imageUrl: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=1400&q=75&auto=format&fit=crop',
        displayOrder: 3,
    },
    {
        id: 4,
        title: 'Empowering Jharsuguda\nMSMEs Digitally',
        subtitle: 'A government-grade marketplace connecting local industries, suppliers, and buyers through transparent digital procurement.',
        ctaText: 'Learn More',
        ctaLink: '#how-it-works',
        imageUrl: 'https://images.unsplash.com/photo-1565043666747-69f6646db940?w=1400&q=75&auto=format&fit=crop',
        displayOrder: 4,
    },
];

// Quick-stat pills shown on the right on desktop
const QUICK_STATS = [
    { icon: ShieldCheck, label: 'Verified Sellers', value: 'GST + Udyam', color: 'text-green-400' },
    { icon: Users, label: 'Buyer Types', value: 'Govt · MSME · Private', color: 'text-blue-300' },
    { icon: Package, label: 'Product Categories', value: '10+ categories', color: 'text-orange-300' },
    { icon: Star, label: 'Trusted Platform', value: 'Jharsuguda District', color: 'text-amber-300' },
];

interface Props { banners: MarketplaceBanner[]; }

export function HeroBanner({ banners }: Props) {
    const slides = banners.length > 0 ? banners : FALLBACK_BANNERS;
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
            style={{ minHeight: '380px', background: 'linear-gradient(135deg, #07172e 0%, #0b2447 60%, #12335f 100%)' }}
        >
            {/* Background image */}
            <div className="absolute inset-0">
                {slide.imageUrl && (
                    <img
                        key={slide.id}
                        src={slide.imageUrl}
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

            <div className="relative max-w-7xl mx-auto px-4 py-12 sm:py-16 lg:py-20">
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                    {/* Left: main content */}
                    <div className={`transition-all duration-300 ${fading ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
                        {/* Trust badge */}
                        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/15 text-[9px] font-bold text-white/80 uppercase tracking-widest mb-5">
                            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                            Official MSME Marketplace · Jharsuguda District, Odisha
                        </div>

                        {/* Title — supports \n line breaks */}
                        <h1 className="text-2xl sm:text-3xl lg:text-[2.4rem] font-black text-white leading-tight mb-4 tracking-tight">
                            {slide.title.split('\n').map((line, i) => (
                                <React.Fragment key={i}>
                                    {i > 0 && <br />}
                                    {line}
                                </React.Fragment>
                            ))}
                        </h1>

                        {slide.subtitle && (
                            <p className="text-sm text-white/65 leading-relaxed mb-7 max-w-md">
                                {slide.subtitle}
                            </p>
                        )}

                        {/* CTA buttons */}
                        <div className="flex flex-wrap gap-3">
                            {slide.ctaText && slide.ctaLink && (
                                <Link
                                    href={slide.ctaLink}
                                    onClick={(e) => handleCtaClick(e, slide.ctaLink!)}
                                    className="inline-flex items-center gap-2 h-11 px-6 rounded-xl bg-white text-[#0b2447] text-sm font-bold hover:bg-slate-100 active:scale-95 transition shadow-lg shadow-black/20"
                                >
                                    {slide.ctaText}
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
