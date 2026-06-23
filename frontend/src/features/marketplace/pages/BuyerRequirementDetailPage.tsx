'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { toast } from 'sonner';
import {
    BadgeCheck,
    Building2,
    Calendar,
    Clock,
    FileText,
    Hash,
    IndianRupee,
    LogIn,
    MapPin,
    Package,
    Send,
    UserPlus,
    Wrench,
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type BuyerRequirement } from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { RequirementCard } from '../components/BuyerRequirementsSection';

const formatMoney = (value: unknown, currency = 'INR') => {
    const amount = Number(value || 0);
    if (!Number.isFinite(amount) || amount <= 0) return 'Not specified';
    return `${currency === 'INR' ? 'Rs.' : currency} ${amount.toLocaleString('en-IN')}`;
};

const formatDate = (value?: string | null) => {
    if (!value) return 'Not specified';
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Not specified' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatLabel = (value?: string | null) => {
    if (!value) return 'Not specified';
    return String(value).replace(/_/g, ' ');
};

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">{label}</p>
            <p className="mt-1 text-xs font-bold text-slate-800 text-wrap-anywhere">{value}</p>
        </div>
    );
}

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

    const loginRedirect = `/login?redirect=${encodeURIComponent(pathname)}`;
    const registerRedirect = `/seller/register?redirect=${encodeURIComponent(pathname)}`;

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

    const isLegacyRequirement = requirement?.sourceModel === 'REQUIREMENT' || (requirement?.id ?? 0) < 0;
    const isSeller = user?.role === 'seller';
    const showGuestCta = !user;

    const budgetLabel = useMemo(() => {
        if (!requirement) return 'Not specified';
        if (requirement.budgetMin && requirement.budgetMax && Number(requirement.budgetMin) !== Number(requirement.budgetMax)) {
            return `${formatMoney(requirement.budgetMin, requirement.currency || 'INR')} – ${formatMoney(requirement.budgetMax, requirement.currency || 'INR')}`;
        }
        if (requirement.estimatedValue) return formatMoney(requirement.estimatedValue, requirement.currency || 'INR');
        if (requirement.budgetMax) return formatMoney(requirement.budgetMax, requirement.currency || 'INR');
        return 'Open / negotiable';
    }, [requirement]);

    const submitResponse = async () => {
        if (!user) {
            toast.info('Please login to submit a quote.');
            return;
        }
        if (user.role !== 'seller') {
            toast.info('Only verified sellers can respond to buyer requirements.');
            return;
        }
        if (isLegacyRequirement) {
            toast.info('This requirement is managed through its linked procurement flow.');
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
                                        {requirement.buyerOrganization?.verificationStatus === 'VERIFIED' && (
                                            <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-emerald-700">
                                                <BadgeCheck className="h-3 w-3" /> Verified Buyer
                                            </span>
                                        )}
                                    </div>
                                    {requirement.requirementNumber && (
                                        <p className="mt-1 text-[11px] font-semibold text-slate-400">Ref: {requirement.requirementNumber}</p>
                                    )}
                                </div>
                                <span className="rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-black uppercase text-blue-700">
                                    {(requirement.statusLabel || requirement.status).replace(/_/g, ' ')}
                                </span>
                            </div>

                            <div className="mt-5 grid gap-3 rounded-md bg-slate-50 p-4 text-sm font-semibold text-slate-600 sm:grid-cols-2 lg:grid-cols-3">
                                <span className="inline-flex items-center gap-2">
                                    {requirement.requirementType === 'SERVICE' ? <Wrench className="h-4 w-4 text-[#8a6a2f]" /> : <Package className="h-4 w-4 text-[#8a6a2f]" />}
                                    {requirement.category?.name || requirement.requirementType}
                                </span>
                                <span className="inline-flex items-center gap-2">
                                    <MapPin className="h-4 w-4 text-[#8a6a2f]" />
                                    {requirement.location || [requirement.buyerOrganization?.city, requirement.buyerOrganization?.district, requirement.buyerOrganization?.state].filter(Boolean).join(', ') || 'Location to be confirmed'}
                                </span>
                                <span className="inline-flex items-center gap-2">
                                    <Hash className="h-4 w-4 text-[#8a6a2f]" />
                                    Quantity: {requirement.quantity ? `${requirement.quantity}${requirement.unit ? ` ${requirement.unit}` : ''}` : requirement.itemSummary || 'As per scope'}
                                </span>
                                <span className="inline-flex items-center gap-2">
                                    <IndianRupee className="h-4 w-4 text-[#8a6a2f]" />
                                    Budget: {budgetLabel}
                                </span>
                                <span className="inline-flex items-center gap-2">
                                    <Clock className="h-4 w-4 text-[#8a6a2f]" />
                                    Last date: {formatDate(requirement.lastDate)}
                                </span>
                                <span className="inline-flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-[#8a6a2f]" />
                                    Published: {formatDate(requirement.createdAt)}
                                </span>
                            </div>

                            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                                <DetailField label="Procurement Method" value={formatLabel(requirement.procurementMethodLabel || requirement.procurementMethod)} />
                                <DetailField label="Visibility" value={formatLabel(requirement.visibility)} />
                                <DetailField label="Responses Received" value={String(requirement._count?.responses ?? 0)} />
                                <DetailField label="Contact Person" value={requirement.contactPerson || 'Shared after login'} />
                                <DetailField label="Days Remaining" value={requirement.daysRemaining != null ? `${requirement.daysRemaining} day(s)` : requirement.timeRemaining || 'Open'} />
                                <DetailField label="Urgency" value={requirement.isUrgent ? 'Urgent requirement' : 'Standard'} />
                            </div>

                            {requirement.buyerOrganization && (
                                <div className="mt-5 flex items-center gap-3 rounded-md border border-slate-200 bg-white p-4">
                                    <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0b2447]/5">
                                        <Building2 className="h-5 w-5 text-[#0b2447]" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-black text-slate-900">{requirement.buyerOrganization.organizationName}</p>
                                        <p className="text-xs font-semibold text-slate-500">
                                            {[requirement.buyerOrganization.city, requirement.buyerOrganization.district, requirement.buyerOrganization.state].filter(Boolean).join(', ') || 'Buyer location available on enquiry'}
                                        </p>
                                    </div>
                                </div>
                            )}

                            <div className="mt-5">
                                <p className="text-xs font-black uppercase tracking-wide text-slate-500">Requirement Description</p>
                                <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">
                                    {requirement.description || 'No additional description provided.'}
                                </p>
                            </div>

                            {requirement.items && requirement.items.length > 0 && (
                                <div className="mt-6">
                                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">Requested Items</p>
                                    <div className="mt-3 overflow-hidden rounded-md border border-slate-200">
                                        <table className="w-full text-left text-xs">
                                            <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
                                                <tr>
                                                    <th className="px-3 py-2.5">Item</th>
                                                    <th className="px-3 py-2.5">Qty</th>
                                                    <th className="px-3 py-2.5">Unit Price</th>
                                                    <th className="px-3 py-2.5">Line Total</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-slate-100">
                                                {requirement.items.map((item) => {
                                                    const qty = Number(item.quantity || 0);
                                                    const unitPrice = Number(item.estimatedUnitPrice || 0);
                                                    const lineTotal = qty * unitPrice;
                                                    return (
                                                        <tr key={item.id} className="bg-white">
                                                            <td className="px-3 py-3">
                                                                <p className="font-black text-slate-900">{item.itemName}</p>
                                                                {item.description && <p className="mt-1 font-semibold text-slate-500">{item.description}</p>}
                                                                {item.product?.hsnCode && <p className="mt-1 text-[10px] font-semibold text-slate-400">HSN: {item.product.hsnCode}</p>}
                                                            </td>
                                                            <td className="px-3 py-3 font-bold text-slate-700">
                                                                {qty} {item.unitOfMeasure || ''}
                                                            </td>
                                                            <td className="px-3 py-3 font-bold text-slate-700">
                                                                {unitPrice > 0 ? formatMoney(unitPrice, requirement.currency || 'INR') : 'Quote based'}
                                                            </td>
                                                            <td className="px-3 py-3 font-black text-[#0b2447]">
                                                                {lineTotal > 0 ? formatMoney(lineTotal, requirement.currency || 'INR') : '—'}
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            )}

                            {requirement.directPurchase && (
                                <div className="mt-6">
                                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">Procurement Details</p>
                                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                        <DetailField label="Department" value={requirement.directPurchase.department || 'Not specified'} />
                                        <DetailField label="Budget Head" value={requirement.directPurchase.budgetHead || 'Not specified'} />
                                        <DetailField label="Cost Center" value={requirement.directPurchase.costCenter || 'Not specified'} />
                                        <DetailField label="Required Delivery Date" value={formatDate(requirement.directPurchase.requiredDeliveryDate)} />
                                        <DetailField label="Delivery Address" value={requirement.directPurchase.deliveryAddressText || 'Not specified'} />
                                        <DetailField label="Estimated Total" value={formatMoney(requirement.directPurchase.totalAmount, requirement.currency || 'INR')} />
                                    </div>
                                    {requirement.directPurchase.justification && (
                                        <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Justification</p>
                                            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{requirement.directPurchase.justification}</p>
                                        </div>
                                    )}
                                    {requirement.directPurchase.deliveryInstructions && (
                                        <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Delivery Instructions</p>
                                            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{requirement.directPurchase.deliveryInstructions}</p>
                                        </div>
                                    )}
                                    {requirement.directPurchase.remarks && (
                                        <div className="mt-3 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
                                            <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Remarks</p>
                                            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-700">{requirement.directPurchase.remarks}</p>
                                        </div>
                                    )}
                                </div>
                            )}

                            {requirement.terms && (
                                <div className="mt-5 rounded-md border border-slate-100 bg-slate-50 px-3 py-2.5">
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Terms & Conditions</p>
                                    <p className="mt-1 whitespace-pre-line text-xs font-semibold leading-relaxed text-slate-700">{requirement.terms}</p>
                                </div>
                            )}

                            {requirement.requiredDocuments?.length ? (
                                <div className="mt-5">
                                    <p className="text-xs font-black uppercase tracking-wide text-slate-500">Required Documents / Certifications</p>
                                    <div className="mt-2 flex flex-wrap gap-2">
                                        {requirement.requiredDocuments.map(doc => (
                                            <span key={doc} className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-xs font-bold text-slate-600">
                                                <FileText className="h-3 w-3" /> {doc}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            ) : null}

                            {requirement.attachmentUrl && (
                                <div className="mt-5">
                                    <a
                                        href={requirement.attachmentUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-2 rounded-md border border-[#0b2447]/20 bg-white px-3 py-2 text-xs font-black text-[#0b2447] hover:bg-slate-50"
                                    >
                                        <FileText className="h-4 w-4" /> View attached document
                                    </a>
                                </div>
                            )}
                        </section>

                        <aside id="respond" className="h-fit rounded-md border border-slate-200 bg-slate-50 p-4">
                            <h2 className="text-sm font-black text-[#0b2447]">Respond to Requirement</h2>

                            {showGuestCta ? (
                                <>
                                    <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                                        You are viewing this requirement as a guest. Sign in or register as a verified seller to submit your quotation response.
                                    </p>
                                    <div className="mt-4 space-y-2">
                                        <Link
                                            href={loginRedirect}
                                            className="flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#0b2447] text-xs font-black uppercase tracking-wide text-white hover:bg-[#12335f]"
                                        >
                                            <LogIn className="h-4 w-4" /> Login to Respond
                                        </Link>
                                        <Link
                                            href={registerRedirect}
                                            className="flex h-10 w-full items-center justify-center gap-2 rounded-md border border-[#0b2447]/20 bg-white text-xs font-black uppercase tracking-wide text-[#0b2447] hover:bg-blue-50"
                                        >
                                            <UserPlus className="h-4 w-4" /> Register to Respond
                                        </Link>
                                    </div>
                                    <p className="mt-3 text-[11px] font-semibold text-slate-400">
                                        Buyer contact details and response submission are available after seller login.
                                    </p>
                                </>
                            ) : isLegacyRequirement ? (
                                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                                    This published requirement is linked to an active procurement workflow. Seller responses are handled through the linked tender or direct purchase process.
                                </p>
                            ) : !isSeller ? (
                                <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">
                                    Only verified seller accounts can submit a quotation for this requirement. Switch to a seller account to respond.
                                </p>
                            ) : (
                                <>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">
                                        Submit your quotation with price, delivery timeline, and message for the buyer to review.
                                    </p>
                                    <input value={price} onChange={e => setPrice(e.target.value)} placeholder="Offered price" className="mt-4 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#0b2447]" />
                                    <input value={timeline} onChange={e => setTimeline(e.target.value)} placeholder="Delivery timeline" className="mt-2 h-10 w-full rounded-md border border-slate-200 px-3 text-sm outline-none focus:border-[#0b2447]" />
                                    <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Message / quotation notes" className="mt-2 min-h-28 w-full rounded-md border border-slate-200 px-3 py-2 text-sm outline-none focus:border-[#0b2447]" />
                                    <button
                                        onClick={submitResponse}
                                        disabled={submitting || message.trim().length < 10}
                                        className="mt-3 flex h-10 w-full items-center justify-center gap-2 rounded-md bg-[#0b2447] text-xs font-black uppercase tracking-wide text-white hover:bg-[#12335f] disabled:opacity-50"
                                    >
                                        <Send className="h-4 w-4" /> Submit Response
                                    </button>
                                </>
                            )}
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
