'use client';
import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronRight, FileText, MapPin, BadgeCheck, Wrench, ArrowLeft, ShoppingCart, Building2, ShieldCheck, ClipboardList, BookmarkPlus } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type MarketplaceService } from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { toast } from 'sonner';
import { useGuestCart } from '../hooks/useGuestCart';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, unwrapApiData } from '../../../lib/api';
import PremiumLoader from '../../../components/PremiumLoader';
import { resolveMarketplaceImage } from '../utils/marketplaceImages';
import { saveSupplier } from '../utils/savedSuppliers';

const pricingLabels: Record<string, string> = {
    FIXED: 'Fixed Price',
    HOURLY: 'Per Hour',
    DAILY: 'Per Day',
    MONTHLY: 'Monthly',
    PER_PROJECT: 'Per Project',
    CUSTOM: 'Quote Based',
};

const formatValue = (value: unknown, fallback = 'Not provided') => {
    if (value === null || value === undefined || value === '') return fallback;
    if (typeof value === 'boolean') return value ? 'Yes' : 'No';
    return String(value);
};

const formatMoney = (value: unknown) => {
    const amount = Number(value || 0);
    return amount > 0 ? `Rs. ${amount.toLocaleString('en-IN')}` : 'Not provided';
};

const formatDate = (value: unknown) => {
    if (!value) return 'Not provided';
    const date = new Date(String(value));
    return Number.isNaN(date.getTime()) ? 'Not provided' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const isImageFile = (file: any) => String(file?.mimeType || '').toLowerCase().startsWith('image/');

export default function MarketplaceServiceDetail() {
    const { user } = useAuth();
    const pathname = usePathname() || '';
    const router = useRouter();
    const serviceId = Number(pathname.split('/').pop());
    const queryClient = useQueryClient();

    const { data: detailData, isLoading: loading } = useQuery({
        queryKey: ['marketplaceService', serviceId],
        queryFn: () => marketplaceApi.getServiceDetail(serviceId),
        enabled: serviceId > 0,
        initialData: () => {
            const cachedDetail = queryClient.getQueryData<any>(['marketplaceService', serviceId]);
            if (cachedDetail) return cachedDetail;

            const peeked = api.peek(`/api/marketplace/services/${serviceId}`);
            if (peeked) return unwrapApiData(peeked);

            const cacheState = queryClient.getQueryCache().getAll();
            for (const query of cacheState) {
                const data = query.state.data as any;
                if (data?.featuredServices) {
                    const found = data.featuredServices.find((s: any) => s.id === serviceId);
                    if (found) return { service: found, relatedServices: [] };
                }
                if (data?.services) {
                    const found = data.services.find((s: any) => s.id === serviceId);
                    if (found) return { service: found, relatedServices: [] };
                }
                if (data?.records) {
                    const found = data.records.find((s: any) => s.id === serviceId);
                    if (found) return { service: found, relatedServices: [] };
                }
            }
            return undefined;
        },
    });

    const service = detailData?.service;
    const related = detailData?.relatedServices || [];

    const { items: cartItems, add: addGuestItem, update: updateGuestItemQty } = useGuestCart();
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        setImageFailed(false);
    }, [serviceId]);

    const cartItem = cartItems.find((item: any) => item.id === serviceId && item.type === 'service');
    const cartQuantity = cartItem ? Number(cartItem.quantity) : 0;

    const handleAddToCart = () => {
        if (cartQuantity === 0 && service) {
            addGuestItem({
                id: service.id,
                name: service.name,
                price: service.basePrice ? Number(service.basePrice) : undefined,
                unit: pricingLabels[service.pricingModel] || 'engagement',
                imageUrl: resolveMarketplaceImage(service, 'service'),
                category: service.category?.name,
                type: 'service',
            });
            toast.success(`${service.name} added to requirement cart`);
        }
    };

    const handleQuantityChange = (delta: number) => {
        const newQuantity = Math.max(0, cartQuantity + delta);
        updateGuestItemQty(serviceId, 'service', newQuantity);
        if (newQuantity === 0 && service) {
            toast.info(`${service.name} removed from cart`);
        }
    };

    const handleRequestQuote = () => {
        if (!service) return;
        if (!user) {
            toast.info('Login is required to send a quote request.', {
                action: { label: 'Login', onClick: () => router.push(`/login?redirect=${encodeURIComponent(pathname)}`) },
            });
            return;
        }
        if (user.role !== 'buyer') {
            toast.info('Quote requests are available from buyer accounts.');
            return;
        }
        const sellerUserId = Number(service.seller?.id || 0);
        if (!sellerUserId) {
            toast.error('Seller contact is not available for this listing.');
            return;
        }
        const params = new URLSearchParams({
            sellerId: String(sellerUserId),
            subject: `Quote request: ${service.name}`,
            message: `Hello, I would like to request a quotation for ${service.name}.\n\nCategory: ${service.category?.name || 'Not specified'}\nService area: ${service.serviceArea || 'Please confirm'}\nPlease share scope, delivery timeline, payment terms, and applicable taxes.`
        });
        router.push(`/buyer/messages?${params.toString()}`);
    };

    if (loading) return <PremiumLoader />;

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

    const handleSaveSupplier = () => {
        if (!service.organization?.id) {
            toast.error('Supplier details are not available for this listing.');
            return;
        }
        saveSupplier({
            id: service.organization.id,
            sellerUserId: service.seller?.id || null,
            name: service.organization.organizationName || service.seller?.name || 'Verified supplier',
            location: [service.organization.city, service.organization.district, service.organization.state].filter(Boolean).join(', '),
            verificationStatus: service.organization.verificationStatus,
            source: service.name,
        });
        toast.success('Supplier saved');
    };
    const imageUrl = imageFailed ? '' : resolveMarketplaceImage(service, 'service');
    const serviceAny = service as any;
    const serviceDocuments = [
        ...(service.certifications || []),
        ...(serviceAny.catalogueFiles || [])
            .filter((file: any) => !isImageFile(file))
            .map((file: any) => ({
                id: `catalogue-file-${file.id}`,
                name: file.originalName || 'Uploaded service document',
                verificationStatus: 'UPLOADED',
                fileAsset: file,
            })),
    ];
    const serviceDetails = [
        ['Category', service.category?.name],
        ['Listing Status', service.status],
        ['Provider', service.organization?.organizationName || service.seller?.name],
        ['Provider Location', location],
        ['Service Area', service.serviceArea],
        ['Pricing Model', pricingLabels[service.pricingModel] || service.pricingModel],
        ['Base Price', formatMoney(service.basePrice)],
        ['Original Price', formatMoney(service.originalPrice)],
        ['Discount Price', formatMoney(service.discountPrice)],
        ['Discount Percent', service.discountPercent ? `${service.discountPercent}%` : undefined],
        ['GST Rate', service.taxRate ? `${service.taxRate}%` : undefined],
        ['Currency', service.currency],
        ['Bulk Deal', service.bulkDealAvailable],
        ['Bulk Minimum Quantity', service.bulkMinQuantity],
        ['Offer Label', service.offerLabel],
        ['Offer Starts', formatDate(service.offerStartAt)],
        ['Offer Ends', formatDate(service.offerEndAt)],
        ['Provider GSTIN', serviceAny.organization?.gstin],
        ['Created', formatDate(service.createdAt)],
        ['Last Updated', formatDate(service.updatedAt)],
    ];

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
                            <div className="relative overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                <div className={imageUrl ? 'aspect-[16/7] min-h-52' : 'h-40'}>
                                    {imageUrl ? (
                                        <img
                                            src={imageUrl}
                                            alt={service.name}
                                            onError={() => setImageFailed(true)}
                                            className="h-full w-full object-cover"
                                        />
                                    ) : (
                                        <div className="flex h-full w-full items-center justify-center bg-blue-50">
                                            <div className="text-center">
                                                <Wrench className="mx-auto h-12 w-12 text-[#0b2447]/35" />
                                                <p className="mt-3 text-xs font-bold text-[#0b2447]/55">Service image unavailable</p>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                <div className="absolute left-3 top-3 flex flex-wrap gap-2">
                                    <span className="rounded bg-white/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-[#0b2447] shadow-sm">Service</span>
                                    {isVerified && <span className="inline-flex items-center gap-1 rounded bg-blue-50/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-wider text-blue-700 shadow-sm"><BadgeCheck className="h-3 w-3" />Verified Provider</span>}
                                </div>
                            </div>

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
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-white text-[#0b2447] shadow-sm">
                                    <Building2 className="h-4 w-4" />
                                </div>
                                <div>
                                    <p className="text-xs font-semibold text-slate-700">{service.organization?.organizationName || service.seller?.name}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                        {location && <span className="text-[10px] text-slate-500 inline-flex items-center gap-0.5"><MapPin className="h-3 w-3" />{location}</span>}
                                        {isVerified && <span className="text-[10px] text-green-700 font-bold inline-flex items-center gap-0.5"><BadgeCheck className="h-3 w-3" />Verified Provider</span>}
                                    </div>
                                </div>
                            </div>

                            <section className="rounded-lg border border-slate-200 bg-white p-4">
                                <h3 className="mb-3 text-sm font-bold text-[#0b2447]">Service Information</h3>
                                <div className="grid gap-3 text-xs sm:grid-cols-2 lg:grid-cols-3">
                                    {serviceDetails.map(([label, value]) => (
                                        <div key={String(label)} className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2">
                                            <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">{label}</span>
                                            <span className="mt-1 block font-bold text-slate-800 text-wrap-anywhere">{formatValue(value)}</span>
                                        </div>
                                    ))}
                                </div>
                            </section>

                            <div>
                                <h3 className="text-sm font-bold text-slate-700 mb-2">Service Description</h3>
                                <p className="text-xs text-slate-600 leading-relaxed whitespace-pre-line">{service.description || 'No detailed service description has been provided for this listing yet.'}</p>
                            </div>

                            <div className="grid gap-3 sm:grid-cols-3">
                                <div className="rounded-lg border border-slate-200 bg-white p-4">
                                    <ShieldCheck className="h-4 w-4 text-[#0b2447]" />
                                    <p className="mt-2 text-[10px] font-bold uppercase text-slate-500">Procurement Fit</p>
                                    <p className="mt-1 text-xs font-bold text-slate-800">{service.category?.name || 'Service requirement'}</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-4">
                                    <MapPin className="h-4 w-4 text-[#0b2447]" />
                                    <p className="mt-2 text-[10px] font-bold uppercase text-slate-500">Delivery Area</p>
                                    <p className="mt-1 text-xs font-bold text-slate-800">{service.serviceArea || location || 'Shared on enquiry'}</p>
                                </div>
                                <div className="rounded-lg border border-slate-200 bg-white p-4">
                                    <ClipboardList className="h-4 w-4 text-[#0b2447]" />
                                    <p className="mt-2 text-[10px] font-bold uppercase text-slate-500">Buyer Action</p>
                                    <p className="mt-1 text-xs font-bold text-slate-800">Request quote</p>
                                </div>
                            </div>

                            <div>
                                <h3 className="text-sm font-bold text-slate-700 mb-2">Uploaded Documents and Certifications</h3>
                                {serviceDocuments.length > 0 ? (
                                    <div className="grid gap-3 sm:grid-cols-2">
                                        {serviceDocuments.map((cert: any) => {
                                            const content = (
                                                <>
                                                    <BadgeCheck className="h-5 w-5 shrink-0 text-green-600" />
                                                    <span className="min-w-0 flex-1">
                                                        <span className="block truncate font-black text-slate-800">{cert.name || cert.fileAsset?.originalName || 'Service document'}</span>
                                                        <span className="mt-1 block text-[10px] font-semibold text-slate-500">
                                                            {cert.issuingAuthority || 'Authority not provided'} | {cert.verificationStatus || 'PENDING'}
                                                        </span>
                                                        {cert.certificateNumber && <span className="mt-1 block text-[10px] font-semibold text-slate-500">Certificate: {cert.certificateNumber}</span>}
                                                        <span className="mt-1 block text-[10px] font-semibold text-slate-500">Issued: {formatDate(cert.issuedAt)} | Expires: {formatDate(cert.expiresAt)}</span>
                                                    </span>
                                                </>
                                            );
                                            return cert.fileAsset?.url ? (
                                                <a
                                                    key={cert.id}
                                                    href={cert.fileAsset.url}
                                                    target="_blank"
                                                    rel="noopener noreferrer"
                                                    className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs hover:border-[#0b2447]/30 hover:bg-white"
                                                >
                                                    {content}
                                                </a>
                                            ) : (
                                                <div key={cert.id} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs">
                                                    {content}
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-xs font-semibold text-slate-500">
                                        No uploaded documents are attached to this service listing yet.
                                    </div>
                                )}
                            </div>
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
                                    type="button"
                                    onClick={handleSaveSupplier}
                                    className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg border border-slate-200 bg-white text-sm font-bold text-slate-700 hover:bg-slate-50 active:scale-[0.97] transition"
                                >
                                    <BookmarkPlus className="h-4 w-4" /> Save Supplier
                                </button>

                                {cartQuantity > 0 ? (
                                    <div className="w-full inline-flex items-center justify-between h-11 rounded-lg border-2 border-[#0b2447] bg-white overflow-hidden shadow-sm">
                                        <button 
                                            onClick={() => handleQuantityChange(-1)} 
                                            className="w-12 h-full flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-[#0b2447] transition"
                                        >
                                            <span className="text-xl font-bold leading-none select-none">−</span>
                                        </button>
                                        <div className="flex-1 flex items-center justify-center text-[#0b2447] font-bold select-none">
                                            {cartQuantity}
                                        </div>
                                        <button 
                                            onClick={() => handleQuantityChange(1)} 
                                            className="w-12 h-full flex items-center justify-center bg-slate-50 hover:bg-slate-100 text-[#0b2447] transition"
                                        >
                                            <span className="text-xl font-bold leading-none select-none">+</span>
                                        </button>
                                    </div>
                                ) : (
                                    <button
                                        onClick={handleAddToCart}
                                        className="w-full inline-flex items-center justify-center gap-2 h-11 rounded-lg border-2 border-[#0b2447] text-[#0b2447] text-sm font-bold hover:bg-[#0b2447] hover:text-white active:scale-[0.97] transition"
                                    >
                                        <ShoppingCart className="h-4 w-4" /> Add to Requirements
                                    </button>
                                )}

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
                                        <div className="h-28 rounded-md bg-slate-100 flex items-center justify-center overflow-hidden">
                                            {resolveMarketplaceImage(s, 'service') ? (
                                                <img src={resolveMarketplaceImage(s, 'service')} alt={s.name} className="h-full w-full object-cover" />
                                            ) : (
                                                <Wrench className="h-8 w-8 text-[#0b2447]/35" />
                                            )}
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
