'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import { BadgeCheck, Clock, FileText, MapPin, Send } from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type BuyerRequirement } from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { RequirementCard } from '../components/BuyerRequirementsSection';

export default function BuyerRequirementDetailPage() {
    const { user } = useAuth();
    const pathname = usePathname() || '';
    const requirementId = Number(pathname.split('/').pop());
    const [requirement, setRequirement] = useState<BuyerRequirement | null>(null);
    const [similar, setSimilar] = useState<BuyerRequirement[]>([]);
    const [loading, setLoading] = useState(true);
    const [message, setMessage] = useState('');
    const [price, setPrice] = useState('');
    const [timeline, setTimeline] = useState('');
    const [submitting, setSubmitting] = useState(false);

    useEffect(() => {
        if (!requirementId) return;
        marketplaceApi.getRequirementDetail(requirementId)
            .then((data: any) => {
                setRequirement(data.requirement);
                setSimilar(data.similarRequirements || []);
            })
            .catch(() => toast.error('Failed to load requirement'))
            .finally(() => setLoading(false));
    }, [requirementId]);

    const submitResponse = async () => {
        if (!user) {
            toast.info('Please login to submit a quote.', { action: { label: 'Login', onClick: () => { window.location.href = '/login'; } } });
            return;
        }
        if (user.role !== 'seller') {
            toast.info('Only verified sellers can respond to buyer requirements.');
            return;
        }
        setSubmitting(true);
        try {
            await marketplaceApi.respondToRequirement(requirementId, { offeredPrice: price || undefined, deliveryTimeline: timeline, message });
            toast.success('Response submitted');
            setMessage('');
            setPrice('');
            setTimeline('');
        } catch (error: any) {
            toast.error(error?.message || 'Please complete seller onboarding and verification to respond to this requirement.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="flex min-h-dvh flex-col bg-white">
            <div className="brand-tricolor-strip w-full" />
            <MarketplaceHeader user={user} />
            <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
                {loading || !requirement ? (
                    <div className="h-96 animate-pulse rounded-md bg-slate-100" />
                ) : (
                    <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
                        <section className="rounded-md border border-slate-200 bg-white p-5 shadow-sm">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a6a2f]">Buyer Requirement</p>
                                    <h1 className="mt-1 text-2xl font-black text-[#0b2447]">{requirement.title}</h1>
                                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-500">
                                        <span>{requirement.buyerOrganization?.organizationName || 'Verified Buyer'}</span>
                                        {requirement.buyerOrganization?.verificationStatus === 'VERIFIED' && <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700"><BadgeCheck className="h-3 w-3" /> Verified Buyer</span>}
                                    </div>
                                </div>
                                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black uppercase text-blue-700">{requirement.status.replace(/_/g, ' ')}</span>
                            </div>
                            <div className="mt-5 grid gap-3 rounded-md bg-slate-50 p-4 text-sm font-semibold text-slate-600 sm:grid-cols-2">
                                <span className="inline-flex items-center gap-2"><FileText className="h-4 w-4 text-[#8a6a2f]" /> {requirement.category?.name || requirement.requirementType}</span>
                                <span className="inline-flex items-center gap-2"><MapPin className="h-4 w-4 text-[#8a6a2f]" /> {requirement.location || requirement.buyerOrganization?.district || 'Location to be confirmed'}</span>
                                <span>Quantity: {requirement.quantity || 'Estimated'} {requirement.unit || ''}</span>
                                <span className="inline-flex items-center gap-2"><Clock className="h-4 w-4 text-[#8a6a2f]" /> Last date: {new Date(requirement.lastDate).toLocaleDateString('en-IN')}</span>
                            </div>
                            <div className="prose prose-sm mt-5 max-w-none text-slate-700">
                                <p>{requirement.description}</p>
                            </div>
                            {requirement.requiredDocuments?.length ? (
                                <div className="mt-5">
                                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">Required Documents / Certifications</p>
                                    <div className="mt-2 flex flex-wrap gap-2">{requirement.requiredDocuments.map(doc => <span key={doc} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600">{doc}</span>)}</div>
                                </div>
                            ) : null}
                        </section>

                        <aside id="respond" className="h-fit rounded-md border border-slate-200 bg-slate-50 p-4">
                            <h2 className="text-sm font-black text-[#0b2447]">Respond / Submit Quote</h2>
                            <p className="mt-1 text-xs font-semibold text-slate-500">Verified sellers can submit a response. Public visitors can review this requirement without logging in.</p>
                            <input value={price} onChange={e => setPrice(e.target.value)} placeholder="Offered price" className="mt-4 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#0b2447]" />
                            <input value={timeline} onChange={e => setTimeline(e.target.value)} placeholder="Delivery timeline" className="mt-2 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#0b2447]" />
                            <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Message / quotation notes" className="mt-2 min-h-28 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0b2447]" />
                            <button onClick={submitResponse} disabled={submitting || message.trim().length < 10} className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#0b2447] text-xs font-black uppercase tracking-wide text-white hover:bg-[#12335f] disabled:opacity-50">
                                <Send className="h-4 w-4" /> Submit Response
                            </button>
                            {!user && <Link href="/login" className="mt-2 block text-center text-xs font-bold text-[#0b2447] underline underline-offset-4">Login / Register to continue</Link>}
                        </aside>
                    </div>
                )}

                {similar.length > 0 && (
                    <section className="mt-8">
                        <h2 className="mb-3 text-lg font-black text-[#0b2447]">Similar Requirements</h2>
                        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">{similar.map(item => <RequirementCard key={item.id} requirement={item} />)}</div>
                    </section>
                )}
            </main>
            <MarketplaceFooter />
        </div>
    );
}
