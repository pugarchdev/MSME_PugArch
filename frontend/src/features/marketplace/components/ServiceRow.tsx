'use client';
import React, { useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ChevronLeft, ChevronRight, FileText, BadgeCheck, Wrench, MapPin } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { toast } from 'sonner';
import type { MarketplaceService } from '../api';
import { useQueryClient } from '@tanstack/react-query';

const PRICING_LABELS: Record<string, string> = {
    FIXED: 'Fixed',
    HOURLY: '/hr',
    DAILY: '/day',
    MONTHLY: '/mo',
    PER_PROJECT: '/project',
    CUSTOM: 'Quote',
};

// Colour palette per pricing model - gives each card a subtle tint
const MODEL_COLORS: Record<string, string> = {
    FIXED: 'bg-blue-50',
    HOURLY: 'bg-violet-50',
    DAILY: 'bg-amber-50',
    MONTHLY: 'bg-teal-50',
    PER_PROJECT: 'bg-green-50',
    CUSTOM: 'bg-slate-50',
};

interface Props {
    title: string;
    subtitle?: string;
    services: MarketplaceService[];
    viewAllHref: string;
}

export function ServiceRow({ title, subtitle, services, viewAllHref }: Props) {
    const scrollRef = useRef<HTMLDivElement>(null);

    const scroll = (dir: 'left' | 'right') => {
        scrollRef.current?.scrollBy({ left: dir === 'left' ? -360 : 360, behavior: 'smooth' });
    };

    if (services.length === 0) {
        return (
            <section className="bg-white mt-2 border-b border-slate-100">
                <div className="max-w-7xl mx-auto px-4 py-6">
                    <div className="flex items-end justify-between mb-3">
                        <h2 className="text-sm sm:text-base font-bold text-[#0b2447]">{title}</h2>
                    </div>
                    <div className="text-center py-8">
                        <Wrench className="h-10 w-10 text-slate-200 mx-auto mb-2" />
                        <p className="text-xs text-slate-400">No services listed yet.</p>
                    </div>
                </div>
            </section>
        );
    }

    return (
        <section className="bg-white mt-2 border-b border-slate-100">
            <div className="max-w-7xl mx-auto px-4 pt-4 pb-2">
                <div className="flex items-end justify-between mb-3">
                    <div>
                        <h2 className="text-sm sm:text-base font-bold text-[#0b2447]">{title}</h2>
                        {subtitle && <p className="text-[10px] text-slate-500 mt-0.5">{subtitle}</p>}
                    </div>
                    <Link href={viewAllHref} className="text-[11px] font-bold text-[#0b2447] hover:underline">View All →</Link>
                </div>
            </div>
            <div className="relative">
                <button onClick={() => scroll('left')} className="absolute left-0 top-1/2 -translate-y-1/2 z-10 w-8 h-16 bg-white/90 border border-slate-200 shadow-md flex items-center justify-center hover:bg-slate-50 transition rounded-r-md" aria-label="Scroll left">
                    <ChevronLeft className="h-4 w-4 text-slate-600" />
                </button>
                <div ref={scrollRef} className="flex gap-0 overflow-x-auto no-scrollbar">
                    {services.map(service => (
                        <ServiceCard key={service.id} service={service} />
                    ))}
                    <Link href={viewAllHref} className="shrink-0 w-44 flex flex-col items-center justify-center gap-2 border-l border-slate-100 hover:bg-slate-50 transition px-4 cursor-pointer">
                        <span className="text-xs font-bold text-[#0b2447] text-center">View All Services</span>
                        <ChevronRight className="h-5 w-5 text-[#0b2447]" />
                    </Link>
                </div>
                <button onClick={() => scroll('right')} className="absolute right-0 top-1/2 -translate-y-1/2 z-10 w-8 h-16 bg-white/90 border border-slate-200 shadow-md flex items-center justify-center hover:bg-slate-50 transition rounded-l-md" aria-label="Scroll right">
                    <ChevronRight className="h-4 w-4 text-slate-600" />
                </button>
            </div>
        </section>
    );
}

function ServiceCard({ service }: { service: MarketplaceService }) {
    const { user } = useAuth();
    const router = useRouter();
    const queryClient = useQueryClient();
    const isVerified = service.organization?.verificationStatus === 'VERIFIED';
    const location = service.organization?.city || service.organization?.district;
    const bgColor = MODEL_COLORS[service.pricingModel] || 'bg-slate-50';

    const handleQuote = (e: React.MouseEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (!user) {
            toast.info('Login to request a quote', {
                action: { label: 'Login', onClick: () => router.push('/login') },
            });
            return;
        }
        toast.success(`Quote requested for ${service.name}`);
    };

    const goToDetail = () => {
        queryClient.setQueryData(['marketplaceService', service.id], { service, relatedServices: [] });
        router.push(`/marketplace/services/${service.id}`);
    };

    return (
        <div onClick={goToDetail} className="group shrink-0 w-52 sm:w-56 flex flex-col border-r border-slate-100 hover:bg-[#f8fafc] transition cursor-pointer p-3 gap-2">
            {/* Image area — shows uploaded image or icon fallback */}
            <div className={`h-20 ${bgColor} rounded-lg flex items-center justify-center border border-slate-100 overflow-hidden`}>
                {(service as any).imageUrl
                    ? <img src={(service as any).imageUrl} alt={service.name} loading="lazy" className="w-full h-full object-cover" />
                    : (service as any).images?.[0]?.fileAsset?.url
                        ? <img src={(service as any).images[0].fileAsset.url} alt={service.name} loading="lazy" className="w-full h-full object-cover" />
                        : <Wrench className="h-9 w-9 text-[#0b2447]/40" />
                }
            </div>
            {/* Category */}
            <p className="text-[9px] font-bold text-[#0b2447]/50 uppercase tracking-wider">{service.category?.name}</p>
            {/* Name */}
            <h3 className="text-xs font-semibold text-slate-800 line-clamp-2 leading-tight">{service.name}</h3>
            {/* Provider */}
            {service.organization && (
                <p className="text-[10px] text-slate-500 truncate">{service.organization.organizationName}</p>
            )}
            {/* Location + Verified */}
            <div className="flex items-center gap-2 flex-wrap">
                {location && <span className="text-[9px] text-slate-400 inline-flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5" />{location}</span>}
                {isVerified && <span className="text-[9px] font-bold text-green-700 inline-flex items-center gap-0.5"><BadgeCheck className="h-2.5 w-2.5" />Verified</span>}
            </div>
            {/* Certifications / Documents */}
            {(service as any).certifications && (service as any).certifications.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-0.5">
                    {(service as any).certifications.map((c: any) => {
                        const fileUrl = c.fileAsset?.url;
                        if (!fileUrl) return null;
                        return (
                            <a
                                key={c.id}
                                href={fileUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                onClick={(e) => e.stopPropagation()}
                                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-50 border border-blue-250 text-[8px] font-bold text-blue-700 hover:bg-blue-100 transition truncate max-w-[120px]"
                                title={c.name || c.fileAsset?.originalName || 'Certificate'}
                            >
                                <FileText className="h-2.5 w-2.5 shrink-0" />
                                <span className="truncate">{c.name || c.fileAsset?.originalName || 'Certificate'}</span>
                            </a>
                        );
                    })}
                </div>
            )}
            {/* Price + CTA */}
            <div className="flex items-center justify-between mt-auto pt-1">
                {service.basePrice
                    ? <span className="text-xs font-bold text-[#0b2447]">₹{Number(service.basePrice).toLocaleString('en-IN')}<span className="text-[9px] font-normal text-slate-400 ml-0.5">{PRICING_LABELS[service.pricingModel]}</span></span>
                    : <span className="text-[10px] font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">Quote Based</span>
                }
                <button
                    onClick={handleQuote}
                    className="inline-flex items-center gap-1 h-6 px-2 rounded-md bg-[#0b2447] text-white text-[9px] font-semibold hover:bg-[#12335f] active:scale-90 transition shrink-0"
                >
                    <FileText className="h-2.5 w-2.5" /> Quote
                </button>
            </div>
        </div>
    );
}
