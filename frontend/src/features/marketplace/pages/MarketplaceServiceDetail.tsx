'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, FileText, MapPin, BadgeCheck, Wrench, ArrowLeft, ShoppingCart } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type MarketplaceService } from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { toast } from 'sonner';

const pricingLabels: Record<string, string> = {
    FIXED: 'Fixed Price',
    HOURLY: 'Per Hour',
    DAILY: 'Per Day',
    MONTHLY: 'Monthly',
    PER_PROJECT: 'Per Project',
    CUSTOM: 'Quote Based',
};

export default function MarketplaceServiceDetail() {
    const { user } = useAuth();
    const pathname = usePathname() || '';
    const serviceId = Number(pathname.split('/').pop());

    const [service, setService] = useState<any>(null);
    const [related, setRelated] = useState<MarketplaceService[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        if (!serviceId || serviceId < 1) return;
        setLoading(true);
        marketplaceApi.getServiceDetail(serviceId)
            .then((data: any) => {
                setService(data.service);
                setRelated(data.relatedServices || []);
            })
            .catch(() => toast.error('Failed to load service details'))
            .finally(() => setLoading(false));
    }, [serviceId]);

    const handleRequestQuote = async () => {
        await handleAddToCart();
        toast.info('Login is required only when you submit inquiry or checkout.', {
            action: { label: 'Continue', onClick: () => { window.location.href = '/cart'; } },
        });
    };

    const handleAddToCart = async () => {
        try {
            await marketplaceApi.addGuestCartItem({ serviceId, quantity: 1 });
            toast.success('Item added to cart.');
        } catch (error: any) {
            toast.error(error?.message || 'Unable to add service to cart');
        }
    };

    if (loading) {
        return (
            <div className="min-h-dvh bg-white flex flex-col">
                <div className="brand-tricolor-strip w-full" />
                <MarketplaceHeader user={user} />
                <main className="flex-1 max-w-7xl mx-auto px-4 py-8 w-full">
                    <div className="animate-pulse space-y-6">
                        <div className="h-4 w-48 bg-slate-200 rounded" />
                        <div className="grid lg:grid-cols-3 gap-8">
                            <div className="lg:col-span-2 space-y-4">
                                <div className="h-6 w-3/4 bg-slate-200 rounded" />
                                <div className="h-4 w-1/2 bg-slate-200 rounded" />
                                <div className="h-32 bg-slate-200 rounded" />
                            </div>
                            <div className="h-64 bg-slate-200 rounded-lg" />
                        </div>
                    </div>
                </main>
                <MarketplaceFooter />
            </div>
        );
    }

    if (!service) {
        return (
            <div className="min-h-dvh bg-white flex flex-col">
                <div className="brand-tricolor-strip w-full" />
                <MarketplaceHeader user={user} />
                <main className="flex-1 flex items-center justify-center">
                    <div className="text-center">
                        <Wrench className="h-16 w-16 text-slate-300 mx-auto mb-4" />
                        <h2 className="text-lg font-bold text-slate-700 mb-2">Service Not Found</h2>
                        <p className="text-sm text-slate-500 mb-4">This service may have been removed or is no longer available.</p>
                        <Link href="/" className="inline-flex items-center gap-2 h-9 px-4 rounded-lg bg-[#0b2447] text-white text-xs font-semibold hover:bg-[#12335f] transition">
                            Back to Marketplace
                        </Link>
                    </div>
                </main>
                <MarketplaceFooter />
            </div>
        );
    }

    const isVerified = service.organization?.verificationStatus === 'VERIFIED';
    const location = service.organization?.city || service.organization?.district || service.organization?.state;

    return (
        <div className="min-h-dvh bg-white flex flex-col">
            <div className="brand-tricolor-strip w-full" />
            <MarketplaceHeader user={user} />

            <main className="flex-1">
                {/* Breadcrumb */}
                <div className="bg-slate-50 border-b border-slate-200">
                    <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2 text-[11px] text-slate-500">
                        <Link href="/" className="hover:text-[#0b2447] transition">Home</Link>
                        <ChevronRight className="h-3 w-3" />
                        <Link href="/marketplace/services" className="hover:text-[#0b2447] transition">Services</Link>
                        <ChevronRight className="h-3 w-3" />
                        {service.category && (
                            <>
                                <Link href={`/marketplace/services?categoryId=${service.category.id}`} className="hover:text-[#0b2447] transition">{service.category.name}</Link>
                                <ChevronRight className="h-3 w-3" />
                            </>
                        )}
                        <span className="text-slate-700 font-medium truncate max-w-[200px]">{service.name}</span>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 py-8">
                    <button onClick={() => window.history.back()} className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-[#0b2447] mb-6 transition">
                        <ArrowLeft className="h-3.5 w-3.5" /> Back to results
                    </button>

                    <div className="grid lg:grid-cols-3 gap-8">
                        {/* Service Details */}
                        <div className="lg:col-span-2 space-y-5">
                            <div className="flex items-start gap-4">
                                <div className="w-14 h-14 rounded-lg bg-[#0b2447]/5 border border-[#0b2447]/10 flex items-center justify-center shrink-0">
                                    <Wrench className="h-7 w-7 text-[#0b2447]" />
                                </div>
                                <div>
                                    {service.category && (
                                        <span className="text-[10px] font-bold text-[#0b2447]/60 uppercase tracking-wider">{service.category.name}</span>
                                    )}
                                    <h1 className="text-xl font-bold text-[#0b2447] mt-0.5">{service.name}</h1>
                                </div>
                            </div>

                            {/* Provider Info */}
                            <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg border border-slate-100">
                                <div>
                                    <p className="text-xs font-semibold text-slate-700">{service.organization?.organizationName || service.seller?.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {location && <span className="text-[10px] text-slate-500 inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{location}</span>}
                                        {isVerified && <span className="text-[10px] text-green-700 font-bold inline-flex items-center gap-0.5"><BadgeCheck className="h-3 w-3" />Verified Provider</span>}
                                    </div>
                                </div>
                            </div>

                            {/* Key Details */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-lg border border-slate-100">
                                <div>
                                    <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Pricing Model</p>
                                    <p className="text-sm font-semibold text-slate-800 mt-0.5">{pricingLabels[service.pricingModel] || service.pricingModel}</p>
                                </div>
                                {service.basePrice && (
                                    <div>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Base Price</p>
                                        <p className="text-sm font-semibold text-[#0b2447] mt-0.5">₹{Number(service.basePrice).toLocaleString('en-IN')}</p>
                                    </div>
                                )}
                                {service.serviceArea && (
                                    <div>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">Service Area</p>
                                        <p className="text-sm font-semibold text-slate-800 mt-0.5">{service.serviceArea}</p>
                                    </div>
                                )}
                                {service.taxRate && (
                                    <div>
                                        <p className="text-[10px] text-slate-500 uppercase tracking-wider font-bold">GST Rate</p>
                                        <p className="text-sm font-semibold text-slate-800 mt-0.5">{service.taxRate}%</p>
                                    </div>
                                )}
                            </div>

                            {/* Description */}
                            {service.description && (
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 mb-2">Service Description</h3>
                                    <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{service.description}</p>
                                </div>
                            )}

                            {/* Certifications */}
                            {service.certifications?.length > 0 && (
                                <div>
                                    <h3 className="text-sm font-bold text-slate-700 mb-2">Certifications</h3>
                                    <div className="space-y-2">
                                        {service.certifications.map((cert: any) => (
                                            <div key={cert.id} className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 px-3 py-2 rounded border border-slate-100">
                                                <BadgeCheck className="h-4 w-4 text-green-600 shrink-0" />
                                                <span className="font-medium">{cert.name}</span>
                                                {cert.issuingAuthority && <span className="text-slate-400">— {cert.issuingAuthority}</span>}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>

                        {/* Sidebar - Actions */}
                        <div className="lg:col-span-1">
                            <div className="sticky top-28 bg-white rounded-lg border border-slate-200 p-5 space-y-4 shadow-sm">
                                <h3 className="text-sm font-bold text-[#0b2447]">Interested in this service?</h3>

                                {service.basePrice ? (
                                    <div className="py-3 border-y border-slate-100">
                                        <p className="text-2xl font-bold text-[#0b2447]">₹{Number(service.basePrice).toLocaleString('en-IN')}</p>
                                        <p className="text-[10px] text-slate-500 mt-0.5">{pricingLabels[service.pricingModel] || 'Per engagement'}</p>
                                    </div>
                                ) : (
                                    <div className="py-3 border-y border-slate-100">
                                        <p className="text-sm font-semibold text-amber-700 bg-amber-50 px-3 py-2 rounded border border-amber-200 text-center">
                                            Contact for Pricing
                                        </p>
                                    </div>
                                )}

                                <button
                                    onClick={handleRequestQuote}
                                    className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg bg-[#0b2447] text-white text-sm font-bold hover:bg-[#12335f] active:scale-[0.97] transition"
                                >
                                    <FileText className="h-4 w-4" /> Request Quote
                                </button>

                                <button
                                    onClick={handleAddToCart}
                                    className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg border-2 border-[#0b2447] text-[#0b2447] text-sm font-bold hover:bg-[#0b2447] hover:text-white active:scale-[0.97] transition"
                                >
                                    <ShoppingCart className="h-4 w-4" /> Add to Requirements
                                </button>

                                <p className="text-[10px] text-slate-400 text-center">
                                    {user ? 'You are logged in and can submit requests.' : 'Login required to submit requests.'}
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Related Services */}
                    {related.length > 0 && (
                        <div className="mt-10">
                            <h3 className="text-sm font-bold text-[#0b2447] mb-4">Related Services</h3>
                            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                {related.map((s: any) => (
                                    <Link
                                        key={s.id}
                                        href={`/marketplace/services/${s.id}`}
                                        className="bg-white rounded-lg border border-slate-200 p-3 hover:shadow-md hover:border-slate-300 transition space-y-2"
                                    >
                                        <div className="w-9 h-9 rounded-md bg-[#0b2447]/5 flex items-center justify-center">
                                            <Wrench className="h-4 w-4 text-[#0b2447]" />
                                        </div>
                                        <h4 className="text-xs font-semibold text-slate-700 line-clamp-2">{s.name}</h4>
                                        <p className="text-[10px] text-slate-500">{s.organization?.organizationName}</p>
                                        <p className="text-[10px] text-slate-400">{pricingLabels[s.pricingModel] || 'Quote Based'}</p>
                                    </Link>
                                ))}
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <MarketplaceFooter />
        </div>
    );
}
