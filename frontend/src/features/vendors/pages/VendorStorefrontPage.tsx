/**
 * VendorStorefrontPage — public-style profile of a single seller with their
 * catalogue, certifications, ratings, and key stats.
 *
 * Route: /vendors/:id
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
    ArrowLeft, Award, Building2, Calendar, CheckCircle2, Globe, Loader2, Mail, MapPin,
    Package, Phone, Send, ShieldCheck, ShoppingCart, Star, Store, Wrench
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { useAuth } from '../../../hooks/useAuth';
import { EmptyState, InlineError, LoadingState } from '../../shared/FeatureStates';
import { formatCurrency, formatDate } from '../../shared/format';
import { getApi } from '../../shared/apiClient';
import { useSupplierSummary } from '../../ratings/hooks';

interface Props { id: number }

export default function VendorStorefrontPage({ id }: Props) {
    const router = useRouter();
    const { user } = useAuth();
    const [tab, setTab] = useState<'overview' | 'catalogue' | 'ratings'>('overview');

    const vendor = useQuery({
        queryKey: ['vendor', id] as const,
        queryFn: () => getApi<any>(`/api/vendors/${id}`),
        enabled: id > 0
    });

    const products = useQuery({
        queryKey: ['vendor-products', id] as const,
        queryFn: () => getApi<any>(`/api/products/search?sellerId=${id}&take=24`),
        enabled: id > 0 && tab === 'catalogue',
        staleTime: 60_000
    });

    const services = useQuery({
        queryKey: ['vendor-services', id] as const,
        queryFn: () => getApi<any>(`/api/services/search?sellerId=${id}&take=24`),
        enabled: id > 0 && tab === 'catalogue',
        staleTime: 60_000
    });

    const ratingSummary = useSupplierSummary(id);

    if (vendor.isLoading) return <LoadingState label="Loading vendor profile..." />;
    if (vendor.error) return <InlineError message={(vendor.error as Error).message} onRetry={() => vendor.refetch()} />;
    if (!vendor.data) return <InlineError message="Vendor not found" />;

    const v = vendor.data;
    const profile = v.sellerProfile || {};
    const office = profile.offices?.[0] || {};
    const isBuyer = user?.role === 'buyer';

    const productList = Array.isArray(products.data?.records) ? products.data.records : products.data?.products || [];
    const serviceList = Array.isArray(services.data?.records) ? services.data.records : services.data?.services || [];

    return (
        <div className="space-y-4">
            <button onClick={() => router.back()} className="inline-flex items-center text-[10px] font-black uppercase tracking-widest text-[#12335f] hover:underline">
                <ArrowLeft className="mr-1 h-3 w-3" /> Back
            </button>

            {/* Hero card */}
            <Card className="overflow-hidden border-slate-200/80">
                <div className="bg-gradient-to-r from-[#0b1f3a] to-[#12335f] px-6 py-6 text-white">
                    <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                        <div className="flex items-start gap-4 min-w-0">
                            <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-white/10 text-2xl font-black">
                                {(v.name || profile.businessName || '?').charAt(0).toUpperCase()}
                            </div>
                            <div className="min-w-0">
                                <p className="text-[10px] font-black uppercase tracking-widest text-blue-200">Verified Seller</p>
                                <h1 className="mt-1 text-2xl font-black text-wrap-anywhere">
                                    {profile.businessName || v.name}
                                </h1>
                                <p className="mt-1 text-xs font-semibold text-blue-100 text-wrap-anywhere">
                                    {profile.nameAsInPan && profile.nameAsInPan !== profile.businessName && profile.nameAsInPan} ·
                                    {profile.organizationType && ` ${profile.organizationType}`}
                                </p>
                                {office.city && (
                                    <p className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-blue-100">
                                        <MapPin className="h-3 w-3" /> {office.city}, {office.state}
                                    </p>
                                )}
                            </div>
                        </div>
                        <div className="flex gap-3 flex-wrap">
                            {ratingSummary.data && (
                                <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-center">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-blue-200">Rating</p>
                                    <p className="mt-1 inline-flex items-center gap-1 text-lg font-black">
                                        <Star className="h-4 w-4 fill-yellow-300 text-yellow-300" />
                                        {(ratingSummary.data as any).average?.toFixed(1) || '—'}
                                    </p>
                                    <p className="text-[9px] text-blue-200">{(ratingSummary.data as any).count || 0} reviews</p>
                                </div>
                            )}
                            {profile.isUdyamCertified && (
                                <div className="rounded-lg border border-white/20 bg-white/10 px-3 py-2 text-center">
                                    <p className="text-[9px] font-black uppercase tracking-widest text-blue-200">Status</p>
                                    <p className="mt-1 inline-flex items-center gap-1 text-xs font-black">
                                        <ShieldCheck className="h-4 w-4 text-emerald-300" /> Udyam
                                    </p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                <CardContent className="grid gap-3 p-4 md:grid-cols-3">
                    <ContactBlock icon={Mail} label="Email" value={v.email} />
                    {v.mobile && <ContactBlock icon={Phone} label="Mobile" value={v.mobile} />}
                    {profile.website && <ContactBlock icon={Globe} label="Website" value={profile.website} />}
                </CardContent>
            </Card>

            {/* Action bar (buyer only) */}
            {isBuyer && (
                <div className="flex flex-wrap gap-2">
                    <Button onClick={() => router.push(`/buyer/rfq?sellerId=${id}`)} className="bg-[#12335f] text-white">
                        <Send className="mr-2 h-4 w-4" /> Send RFQ
                    </Button>
                    <Button variant="outline" onClick={() => router.push(`/buyer/direct-purchase?sellerId=${id}`)}>
                        <ShoppingCart className="mr-2 h-4 w-4" /> Direct Purchase
                    </Button>
                    <Button variant="outline" onClick={() => router.push(`/buyer/messages?counterpartyId=${id}`)}>
                        <Send className="mr-2 h-4 w-4" /> Message
                    </Button>
                </div>
            )}

            {/* Tabs */}
            <div className="flex items-center gap-1 border-b border-slate-200">
                <Tab active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</Tab>
                <Tab active={tab === 'catalogue'} onClick={() => setTab('catalogue')}>Catalogue</Tab>
                <Tab active={tab === 'ratings'} onClick={() => setTab('ratings')}>Ratings</Tab>
            </div>

            {tab === 'overview' && <OverviewTab vendor={v} profile={profile} />}
            {tab === 'catalogue' && (
                <CatalogueTab
                    productsLoading={products.isLoading}
                    servicesLoading={services.isLoading}
                    products={productList}
                    services={serviceList}
                />
            )}
            {tab === 'ratings' && <RatingsTab ratingSummary={ratingSummary.data} />}
        </div>
    );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
    return (
        <button
            type="button"
            onClick={onClick}
            className={`px-4 py-2 text-xs font-black uppercase tracking-widest border-b-2 transition ${active ? 'border-[#12335f] text-[#12335f]' : 'border-transparent text-slate-500 hover:text-slate-700'}`}
        >
            {children}
        </button>
    );
}

function ContactBlock({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-slate-50/40 p-3">
            <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5 text-slate-400" />
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            </div>
            <p className="mt-1 text-xs font-semibold text-slate-900 text-wrap-anywhere">{value}</p>
        </div>
    );
}

function OverviewTab({ vendor, profile }: { vendor: any; profile: any }) {
    return (
        <div className="grid gap-3 lg:grid-cols-2">
            <Card><CardContent className="p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Business Profile</p>
                <Field label="Business Name" value={profile.businessName} />
                <Field label="PAN" value={profile.panMasked || '—'} />
                <Field label="Organization Type" value={profile.organizationType} />
                <Field label="Date of Incorporation" value={profile.dateOfIncorporation ? formatDate(profile.dateOfIncorporation) : '—'} />
                <Field label="MSME Category" value={profile.msmeCategory || profile.msmeType || 'Not registered'} />
                <Field label="Vendor Type" value={profile.vendorType || '—'} />
            </CardContent></Card>

            <Card><CardContent className="p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Capabilities</p>
                <div>
                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Categories</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                        {(profile.productCategories || []).length === 0 ? (
                            <p className="text-xs text-slate-500">No categories listed</p>
                        ) : (profile.productCategories || []).map((c: string, i: number) => (
                            <span key={i} className="inline-flex rounded-md border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-black text-blue-700">{c}</span>
                        ))}
                    </div>
                </div>
                <Field label="Brand" value={profile.brand} />
                <Field label="Detailed Products" value={profile.detailedProductName} />
                <Field label="Member Since" value={vendor.createdAt ? formatDate(vendor.createdAt) : '—'} />
            </CardContent></Card>
        </div>
    );
}

function Field({ label, value }: { label: string; value: string | undefined | null }) {
    return (
        <div>
            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-0.5 text-xs font-bold text-slate-900 text-wrap-anywhere">{value || '—'}</p>
        </div>
    );
}

function CatalogueTab({ productsLoading, servicesLoading, products, services }: {
    productsLoading: boolean; servicesLoading: boolean; products: any[]; services: any[];
}) {
    if (productsLoading || servicesLoading) {
        return <div className="flex justify-center py-16"><Loader2 className="h-8 w-8 animate-spin text-[#12335f]" /></div>;
    }

    return (
        <div className="space-y-4">
            <Section title="Products" count={products.length} icon={Package}>
                {products.length === 0 ? (
                    <EmptyState title="No products listed" />
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {products.map((p: any) => (
                            <ProductCard key={p.id} item={p} kind="product" />
                        ))}
                    </div>
                )}
            </Section>

            <Section title="Services" count={services.length} icon={Wrench}>
                {services.length === 0 ? (
                    <EmptyState title="No services listed" />
                ) : (
                    <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                        {services.map((s: any) => (
                            <ProductCard key={s.id} item={s} kind="service" />
                        ))}
                    </div>
                )}
            </Section>
        </div>
    );
}

function Section({ title, count, icon: Icon, children }: { title: string; count: number; icon: any; children: React.ReactNode }) {
    return (
        <div>
            <div className="mb-2 flex items-center gap-2">
                <Icon className="h-4 w-4 text-slate-500" />
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title} ({count})</p>
            </div>
            {children}
        </div>
    );
}

function ProductCard({ item, kind }: { item: any; kind: 'product' | 'service' }) {
    const price = kind === 'product' ? item.price : item.basePrice;
    return (
        <Card className="border-slate-200/80 hover:border-[#12335f]/30 hover:shadow-md transition">
            <CardContent className="p-4">
                <div className="flex items-start gap-3">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${kind === 'product' ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                        {kind === 'product' ? <Package className="h-5 w-5" /> : <Wrench className="h-5 w-5" />}
                    </div>
                    <div className="min-w-0 flex-1">
                        <p className="text-sm font-black text-slate-900 text-wrap-anywhere line-clamp-2">{item.name}</p>
                        {item.description && (
                            <p className="mt-1 text-[11px] text-slate-600 line-clamp-2 text-wrap-anywhere">{item.description}</p>
                        )}
                        <p className="mt-2 text-sm font-black text-emerald-700">{formatCurrency(price)}</p>
                    </div>
                </div>
            </CardContent>
        </Card>
    );
}

function RatingsTab({ ratingSummary }: { ratingSummary: any }) {
    if (!ratingSummary) return <EmptyState title="No ratings yet" description="This vendor has no ratings yet. Be the first to rate after a transaction." />;
    const dist: Array<{ star: number; count: number }> = ratingSummary.distribution || [];
    return (
        <div className="space-y-3">
            <Card><CardContent className="p-5 text-center">
                <div className="inline-flex items-center gap-2">
                    <Star className="h-8 w-8 fill-yellow-400 text-yellow-400" />
                    <p className="text-4xl font-black text-slate-950">{ratingSummary.average?.toFixed(1) || '—'}</p>
                </div>
                <p className="mt-1 text-xs font-semibold text-slate-600">Average from {ratingSummary.count || 0} reviews</p>
            </CardContent></Card>

            {dist.length > 0 && (
                <Card><CardContent className="p-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Rating Distribution</p>
                    {[5, 4, 3, 2, 1].map(stars => {
                        const bucket = dist.find(d => d.star === stars);
                        const count = bucket?.count || 0;
                        const total = ratingSummary.count || 1;
                        const pct = (count / total) * 100;
                        return (
                            <div key={stars} className="flex items-center gap-3">
                                <span className="w-12 text-[10px] font-black text-slate-600">{stars} ★</span>
                                <div className="h-2 flex-1 rounded-full bg-slate-100">
                                    <div className="h-full rounded-full bg-yellow-400" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="w-12 text-right text-[10px] font-bold text-slate-500">{count}</span>
                            </div>
                        );
                    })}
                </CardContent></Card>
            )}
        </div>
    );
}
