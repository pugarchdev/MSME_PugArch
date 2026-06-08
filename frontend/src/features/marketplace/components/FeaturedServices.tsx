'use client';
import React from 'react';
import Link from 'next/link';
import { BadgeCheck, MapPin, FileText, Wrench } from 'lucide-react';
import { marketplaceApi, type MarketplaceService } from '../api';
import { toast } from 'sonner';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const pricingLabels: Record<string, string> = {
    FIXED: 'Fixed Price',
    HOURLY: 'Per Hour',
    DAILY: 'Per Day',
    MONTHLY: 'Monthly',
    PER_PROJECT: 'Per Project',
    CUSTOM: 'Quote Based',
};

interface Props {
    services: MarketplaceService[];
}

const fallbackServices: MarketplaceService[] = [
    {
        id: -1,
        name: 'Industrial Equipment Maintenance',
        description: 'Preventive and breakdown maintenance support for plant and workshop equipment.',
        pricingModel: 'PER_PROJECT',
        basePrice: 15000,
        currency: 'INR',
        serviceArea: 'District-wide',
        status: 'ACTIVE',
        category: { id: 0, name: 'Maintenance Services' },
        organization: { id: 0, organizationName: 'Verified Service Provider', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        imageUrl: 'https://picsum.photos/seed/msme-industrial-maintenance/640/420'
    },
    {
        id: -2,
        name: 'Logistics and Local Transport',
        description: 'Material movement, last-mile delivery, and vendor dispatch coordination.',
        pricingModel: 'CUSTOM',
        currency: 'INR',
        serviceArea: 'Jharsuguda',
        status: 'ACTIVE',
        category: { id: 0, name: 'Logistics' },
        organization: { id: 0, organizationName: 'Registered MSME Logistics', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        imageUrl: 'https://picsum.photos/seed/msme-local-logistics/640/420'
    },
    {
        id: -3,
        name: 'IT Hardware Support',
        description: 'Installation, troubleshooting, and AMC support for office IT infrastructure.',
        pricingModel: 'MONTHLY',
        basePrice: 8000,
        currency: 'INR',
        serviceArea: 'On-site',
        status: 'ACTIVE',
        category: { id: 0, name: 'IT Services' },
        organization: { id: 0, organizationName: 'Local IT MSME', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        imageUrl: 'https://picsum.photos/seed/msme-it-support/640/420'
    },
    {
        id: -4,
        name: 'Civil Works and Repairs',
        description: 'Minor civil works, repair jobs, painting, and site maintenance services.',
        pricingModel: 'PER_PROJECT',
        basePrice: 22000,
        currency: 'INR',
        serviceArea: 'Jharsuguda',
        status: 'ACTIVE',
        category: { id: 0, name: 'Construction Services' },
        organization: { id: 0, organizationName: 'Verified Contractor MSME', district: 'Jharsuguda', verificationStatus: 'VERIFIED' },
        imageUrl: 'https://picsum.photos/seed/msme-civil-works/640/420'
    }
];

export function FeaturedServices({ services }: Props) {
    const visibleServices = services.length > 0 ? services : fallbackServices;

    return (
        <section className="py-10 bg-white" id="services" aria-labelledby="services-heading">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 id="services-heading" className="text-lg font-bold text-[#0b2447]">Featured Services</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Professional services from verified providers</p>
                    </div>
                    <Link href="/marketplace/services" className="text-xs font-bold text-[#0b2447] hover:underline inline-flex items-center gap-1 transition">
                        View All Services →
                    </Link>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    {visibleServices.map(service => (
                        <ServiceCard key={service.id} service={service} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function ServiceCard({ service }: { service: MarketplaceService }) {
    const isVerified = service.organization?.verificationStatus === 'VERIFIED';
    const isFallback = service.id < 0;
    const serviceHref = isFallback ? '/marketplace/services' : `/marketplace/services/${service.id}`;
    const imageUrl = service.imageUrl;
    const location = service.organization?.city || service.organization?.district || service.organization?.state;
    const queryClient = useQueryClient();

    const cartMutation = useMutation({
        mutationFn: async () => {
            return marketplaceApi.addGuestCartItem({ serviceId: service.id, quantity: 1 });
        },
        onMutate: async () => {
            await queryClient.cancelQueries({ queryKey: ['guestCart'] });
            const previousCart = queryClient.getQueryData(['guestCart']);
            const currentCart = previousCart as any || { items: [] };

            const existingIndex = currentCart.items?.findIndex((item: any) => item.serviceId === service.id);
            let newItems = [...(currentCart.items || [])];

            if (existingIndex >= 0) {
                newItems[existingIndex] = {
                    ...newItems[existingIndex],
                    quantity: (newItems[existingIndex].quantity || 0) + 1
                };
            } else {
                newItems.push({
                    id: Date.now(),
                    serviceId: service.id,
                    quantity: 1,
                    itemType: 'SERVICE',
                    service: { id: service.id, name: service.name }
                });
            }

            queryClient.setQueryData(['guestCart'], {
                ...currentCart,
                items: newItems
            });

            return { previousCart };
        },
        onSuccess: (data) => {
            if (data?.cart) {
                queryClient.setQueryData(['guestCart'], data.cart);
            }
            queryClient.invalidateQueries({ queryKey: ['guestCart'] });
        },
        onError: (error: any, variables, context: any) => {
            if (context?.previousCart) {
                queryClient.setQueryData(['guestCart'], context.previousCart);
            }
            toast.error(error?.message || 'Unable to update cart');
        }
    });

    const handleRequestQuote = () => {
        cartMutation.mutate();
    };

    return (
        <div className="group bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg hover:border-slate-300 transition-all duration-200">
            <Link href={serviceHref} className="block relative h-36 bg-slate-100 overflow-hidden">
                {imageUrl ? (
                    <img src={imageUrl} alt={service.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                ) : (
                    <div className="w-full h-full flex items-center justify-center">
                        <Wrench className="h-10 w-10 text-slate-300" />
                    </div>
                )}
                {isVerified && (
                    <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-[9px] font-bold text-green-700">
                        <BadgeCheck className="h-3 w-3" /> Verified
                    </span>
                )}
            </Link>

            <div className="p-4 space-y-3">

            {service.category && (
                <span className="text-[10px] font-bold text-[#0b2447]/60 uppercase tracking-wider">{service.category.name}</span>
            )}

            <Link 
                href={serviceHref}
                onClick={() => {
                    if (isFallback) return;
                    queryClient.setQueryData(['marketplaceService', service.id], { service });
                }}
                className="block"
            >
                <h3 className="text-sm font-semibold text-slate-800 leading-tight line-clamp-2 hover:text-[#0b2447] transition">{service.name}</h3>
            </Link>

            {service.organization && (
                <p className="text-[11px] text-slate-500 font-medium truncate">{service.organization.organizationName}</p>
            )}

            <div className="flex items-center gap-3 text-[10px] text-slate-400">
                {location && (
                    <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {location}
                    </span>
                )}
                {service.serviceArea && (
                    <span>Area: {service.serviceArea}</span>
                )}
            </div>

            {/* Pricing */}
            <div className="pt-1">
                {service.basePrice ? (
                    <p className="text-sm font-bold text-[#0b2447]">
                        ₹{Number(service.basePrice).toLocaleString('en-IN')}
                        <span className="text-[10px] font-normal text-slate-400 ml-1">{pricingLabels[service.pricingModel] || service.pricingModel}</span>
                    </p>
                ) : (
                    <p className="text-xs font-semibold text-amber-700 bg-amber-50 inline-block px-2 py-0.5 rounded border border-amber-200">
                        {pricingLabels[service.pricingModel] || 'Quote Based'}
                    </p>
                )}
            </div>

            {/* Actions */}
            <div className="flex gap-2 pt-1">
                <Link
                    href={serviceHref}
                    onClick={() => {
                        if (isFallback) return;
                        queryClient.setQueryData(['marketplaceService', service.id], { service });
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition"
                >
                    {isFallback ? 'Browse Services' : 'View Details'}
                </Link>
                {!isFallback && (
                    <button
                        onClick={handleRequestQuote}
                        className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-md bg-[#0b2447] text-white text-[11px] font-semibold hover:bg-[#12335f] active:scale-95 transition"
                    >
                        <FileText className="h-3 w-3" /> Request Quote
                    </button>
                )}
            </div>
            </div>
        </div>
    );
}
