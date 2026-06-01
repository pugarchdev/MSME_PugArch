'use client';
import React, { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { MarketplaceBanner } from '../api';

interface BannerSlide extends MarketplaceBanner {
    bgImage?: string;
    bgGradient?: string;
}

const defaultBanners: BannerSlide[] = [
    {
        id: 1,
        title: 'Discover Verified MSME Products & Services',
        subtitle: 'Browse thousands of products from verified local manufacturers and service providers in Jharsuguda District',
        ctaText: 'Explore Marketplace',
        ctaLink: '#products',
        displayOrder: 1,
        bgImage: 'https://images.unsplash.com/photo-1581091226825-a6a2a5aee158?w=1400&q=80&auto=format',
        bgGradient: 'from-[#0b2447]/90 via-[#0b2447]/80 to-[#12335f]/70',
    },
    {
        id: 2,
        title: 'Register as Seller & Grow Your Business',
        subtitle: 'List your products and services, reach government and institutional buyers, and expand your market reach across the district',
        ctaText: 'Register Now',
        ctaLink: '/seller/register',
        displayOrder: 2,
        bgImage: 'https://images.unsplash.com/photo-1504384308090-c894fdcc538d?w=1400&q=80&auto=format',
        bgGradient: 'from-[#0b2447]/90 via-[#12335f]/80 to-[#1a4a7a]/70',
    },
    {
        id: 3,
        title: 'Transparent Procurement for All Buyers',
        subtitle: 'Access verified suppliers, compare products, request quotations, and manage procurement seamlessly through a single platform',
        ctaText: 'Start Buying',
        ctaLink: '/buyer/register',
        displayOrder: 3,
        bgImage: 'https://images.unsplash.com/photo-1553877522-43269d4ea984?w=1400&q=80&auto=format',
        bgGradient: 'from-[#0b2447]/90 via-[#0b2447]/75 to-[#1a4a7a]/65',
    },
    {
        id: 4,
        title: 'Support Local Industries & Service Providers',
        subtitle: 'Empowering MSMEs through digital marketplace access, transparent business opportunities, and verified procurement workflows',
        ctaText: 'Learn More',
        ctaLink: '#how-it-works',
        displayOrder: 4,
        bgImage: 'https://images.unsplash.com/photo-1565043666747-69f6646db940?w=1400&q=80&auto=format',
        bgGradient: 'from-[#0b2447]/90 via-[#12335f]/80 to-[#0b2447]/70',
    },
    {
        id: 5,
        title: 'Digital India — MSME Empowerment Initiative',
        subtitle: 'A government-backed initiative to bring local MSMEs online, enabling direct access to institutional and corporate buyers',
        ctaText: 'View Categories',
        ctaLink: '#categories',
        displayOrder: 5,
        bgImage: 'https://images.unsplash.com/photo-1486406146926-c627a92ad1ab?w=1400&q=80&auto=format',
        bgGradient: 'from-[#0b2447]/90 via-[#0b2447]/80 to-[#1a4a7a]/60',
    },
];

interface Props {
    banners: MarketplaceBanner[];
}

export function HeroBanner({ banners }: Props) {
    const slides: BannerSlide[] = banners.length > 0
        ? banners.map((b, i) => ({ ...b, bgImage: defaultBanners[i % defaultBanners.length]?.bgImage, bgGradient: defaultBanners[i % defaultBanners.length]?.bgGradient }))
        : defaultBanners;

    const [current, setCurrent] = useState(0);
    const [isTransitioning, setIsTransitioning] = useState(false);

    const goTo = useCallback((index: number) => {
        setIsTransitioning(true);
        setTimeout(() => {
            setCurrent(index);
            setIsTransitioning(false);
        }, 200);
    }, []);

    const next = useCallback(() => goTo((current + 1) % slides.length), [current, slides.length, goTo]);
    const prev = useCallback(() => goTo((current - 1 + slides.length) % slides.length), [current, slides.length, goTo]);

    useEffect(() => {
        const timer = setInterval(next, 6000);
        return () => clearInterval(timer);
    }, [next]);

    const slide = slides[current];

    const handleCtaClick = (e: React.MouseEvent, link: string) => {
        if (link.startsWith('#')) {
            e.preventDefault();
            const el = document.querySelector(link);
            if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    };

    return (
        <section className="relative overflow-hidden" aria-label="Hero Banner" role="region" aria-roledescription="carousel">
            {/* Background Image */}
            <div className="absolute inset-0">
                <img
                    src={slide.bgImage}
                    alt=""
                    className={`w-full h-full object-cover transition-opacity duration-500 ${isTransitioning ? 'opacity-0' : 'opacity-100'}`}
                    loading="eager"
                />
                {/* Gradient Overlay */}
                <div className={`absolute inset-0 bg-gradient-to-r ${slide.bgGradient || 'from-[#0b2447]/90 via-[#0b2447]/80 to-[#12335f]/70'}`} />
            </div>

            {/* Dot Pattern Overlay */}
            <div className="absolute inset-0 opacity-[0.03]">
                <div className="absolute inset-0" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '32px 32px' }} />
            </div>

            <div className="relative max-w-7xl mx-auto px-4 py-16 sm:py-20 lg:py-28">
                <div className={`max-w-3xl transition-all duration-300 ${isTransitioning ? 'opacity-0 translate-y-2' : 'opacity-100 translate-y-0'}`}>
                    {/* Badge */}
                    <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-white/10 border border-white/20 text-[10px] font-bold text-white/90 uppercase tracking-wider mb-5 backdrop-blur-sm">
                        <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                        Official MSME Marketplace — Jharsuguda District
                    </div>

                    {/* Title */}
                    <h2 className="text-2xl sm:text-3xl lg:text-[2.75rem] font-bold text-white leading-tight mb-4">
                        {slide.title}
                    </h2>

                    {/* Subtitle */}
                    {slide.subtitle && (
                        <p className="text-sm sm:text-base text-white/75 leading-relaxed mb-8 max-w-2xl">
                            {slide.subtitle}
                        </p>
                    )}

                    {/* CTA Button */}
                    {slide.ctaText && slide.ctaLink && (
                        <Link
                            href={slide.ctaLink}
                            onClick={(e) => handleCtaClick(e, slide.ctaLink!)}
                            className="inline-flex items-center gap-2 h-12 px-7 rounded-lg bg-white text-[#0b2447] text-sm font-bold hover:bg-slate-100 active:scale-95 transition-all shadow-lg shadow-black/10"
                        >
                            {slide.ctaText}
                            <ChevronRight className="h-4 w-4" />
                        </Link>
                    )}
                </div>

                {/* Slide Controls */}
                <div className="absolute bottom-6 right-4 sm:right-8 flex items-center gap-3">
                    <button
                        onClick={prev}
                        className="w-9 h-9 rounded-full bg-white/10 border border-white/25 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition backdrop-blur-sm"
                        aria-label="Previous slide"
                    >
                        <ChevronLeft className="h-4 w-4" />
                    </button>
                    <div className="flex gap-2">
                        {slides.map((_, i) => (
                            <button
                                key={i}
                                onClick={() => goTo(i)}
                                className={`rounded-full transition-all duration-300 ${i === current ? 'w-7 h-2 bg-white' : 'w-2 h-2 bg-white/40 hover:bg-white/60'}`}
                                aria-label={`Go to slide ${i + 1}`}
                                aria-current={i === current ? 'true' : undefined}
                            />
                        ))}
                    </div>
                    <button
                        onClick={next}
                        className="w-9 h-9 rounded-full bg-white/10 border border-white/25 flex items-center justify-center text-white hover:bg-white/20 active:scale-90 transition backdrop-blur-sm"
                        aria-label="Next slide"
                    >
                        <ChevronRight className="h-4 w-4" />
                    </button>
                </div>

                {/* Slide Counter */}
                <div className="absolute bottom-6 left-4 sm:left-8 text-[10px] font-bold text-white/50 tracking-wider">
                    {String(current + 1).padStart(2, '0')} / {String(slides.length).padStart(2, '0')}
                </div>
            </div>
        </section>
    );
}
