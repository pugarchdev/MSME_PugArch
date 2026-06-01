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

export function FeaturedServices({ services }: Props) {
    if (services.length === 0) {
        return (
            <section className="py-10 bg-white" id="services">
                <div className="max-w-7xl mx-auto px-4 text-center py-8">
                    <Wrench className="h-12 w-12 text-slate-300 mx-auto mb-3" />
                    <h2 className="text-lg font-bold text-[#0b2447] mb-2">Featured Services</h2>
                    <p className="text-sm text-slate-500 max-w-md mx-auto">No services listed yet. Service providers can register and add services to appear here.</p>
                    <Link href="/seller/register" className="inline-flex items-center gap-2 mt-4 h-9 px-4 rounded-lg border border-[#0b2447] text-[#0b2447] text-xs font-semibold hover:bg-[#0b2447] hover:text-white transition">
                        Register as Service Provider
                    </Link>
                </div>
            </section>
        );
    }

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
                    {services.map(service => (
                        <ServiceCard key={service.id} service={service} />
                    ))}
                </div>
            </div>
        </section>
    );
}

function ServiceCard({ service }: { service: MarketplaceService }) {
    const isVerified = service.organization?.verificationStatus === 'VERIFIED';
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
        <div className="group bg-white rounded-lg border border-slate-200 overflow-hidden hover:shadow-lg hover:border-slate-300 transition-all duration-200 p-4 space-y-3">
            {/* Icon & Category */}
            <div className="flex items-start justify-between">
                <div className="w-10 h-10 rounded-lg bg-[#0b2447]/5 border border-[#0b2447]/10 flex items-center justify-center">
                    <Wrench className="h-5 w-5 text-[#0b2447]" />
                </div>
                {isVerified && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 border border-green-200 text-[9px] font-bold text-green-700">
                        <BadgeCheck className="h-3 w-3" /> Verified
                    </span>
                )}
            </div>

            {service.category && (
                <span className="text-[10px] font-bold text-[#0b2447]/60 uppercase tracking-wider">{service.category.name}</span>
            )}

            <Link 
                href={`/marketplace/services/${service.id}`} 
                onClick={() => {
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
                    href={`/marketplace/services/${service.id}`}
                    onClick={() => {
                        queryClient.setQueryData(['marketplaceService', service.id], { service });
                    }}
                    className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-md border border-slate-200 text-[11px] font-semibold text-slate-700 hover:bg-slate-50 active:scale-95 transition"
                >
                    View Details
                </Link>
                <button
                    onClick={handleRequestQuote}
                    className="flex-1 inline-flex items-center justify-center gap-1 h-8 rounded-md bg-[#0b2447] text-white text-[11px] font-semibold hover:bg-[#12335f] active:scale-95 transition"
                >
                    <FileText className="h-3 w-3" /> Request Quote
                </button>
            </div>
        </div>
    );
}
