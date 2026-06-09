'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { toast } from 'sonner';
import { marketplaceApi, type BuyerRequirement } from '../api';
import {
    X, Package, Wrench, Landmark, BadgeCheck, MapPin,
    Tag, Hash, IndianRupee, Calendar, CheckCircle,
    Clock, FileText, Send, Flame
} from 'lucide-react';

function daysLeft(iso: string) {
    return Math.max(0, Math.ceil((new Date(iso).getTime() - Date.now()) / 86400000));
}

function statusBadge(req: BuyerRequirement) {
    const status = String(req.computedStatus || req.statusLabel || req.status || '').toUpperCase();
    const d = req.daysRemaining ?? daysLeft(req.lastDate);
    if (status === 'AWARDED') return { label: 'Awarded', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200', icon: <CheckCircle className="h-3 w-3" /> };
    if (status === 'CLOSED' || d <= 0) return { label: 'Closed', cls: 'bg-slate-100 text-slate-500 border-slate-200', icon: null };
    if (status === 'UNDER_EVALUATION' || status === 'UNDER REVIEW') return { label: 'Under Evaluation', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200', icon: null };
    if (status === 'CLOSING_SOON' || req.isUrgent || d <= 7) return { label: 'Closing Soon', cls: 'bg-red-50 text-red-700 border-red-200', icon: <Flame className="h-3 w-3" /> };
    return { label: 'Open', cls: 'bg-blue-50 text-blue-700 border-blue-200', icon: null };
}

interface Props { bid: BuyerRequirement; onClose: () => void; }

export function BidDetailModal({ bid, onClose }: Props) {
    const { user } = useAuth();
    const router = useRouter();
    const isService = bid.requirementType === 'SERVICE';
    const badge = statusBadge(bid);
    const days = bid.daysRemaining ?? daysLeft(bid.lastDate);
    const isLegacyRequirement = bid.sourceModel === 'REQUIREMENT' || bid.id < 0;
    const isResponseClosed = isLegacyRequirement || badge.label === 'Closed' || badge.label === 'Awarded';

    const [message, setMessage] = useState('');
    const [price, setPrice] = useState('');
    const [timeline, setTimeline] = useState('');
    const [submitting, setSubmitting] = useState(false);

    /* Lock body scroll */
    useEffect(() => {
        const prev = document.body.style.overflow;
        document.body.style.overflow = 'hidden';
        return () => { document.body.style.overflow = prev; };
    }, []);

    /* Escape key closes */
    useEffect(() => {
        const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', h);
        return () => window.removeEventListener('keydown', h);
    }, [onClose]);

    const handleSubmit = async () => {
        if (isResponseClosed) {
            toast.info(isLegacyRequirement ? 'This published requirement can be viewed here; seller responses are handled through its linked tender/RFQ flow.' : 'This requirement is no longer accepting seller responses.');
            return;
        }
        if (!user) {
            toast.info('Login to submit a response', {
                action: { label: 'Login', onClick: () => { onClose(); router.push('/login'); } },
            });
            return;
        }
        if (user.role !== 'seller') {
            toast.info('Only verified sellers can respond to buyer requirements.');
            return;
        }
        if (message.trim().length < 10) {
            toast.error('Message must be at least 10 characters.');
            return;
        }
        setSubmitting(true);
        try {
            await marketplaceApi.respondToRequirement(bid.id, {
                offeredPrice: price || undefined,
                deliveryTimeline: timeline || undefined,
                message: message.trim(),
            });
            toast.success('Response submitted successfully!');
            onClose();
        } catch (err: any) {
            toast.error(err?.message || 'Please complete seller verification to respond.');
        } finally {
            setSubmitting(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[9999] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal="true">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-[2px]" onClick={onClose} />

            {/* Panel */}
            <div className="relative z-10 w-full sm:max-w-2xl max-h-[92dvh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-white shadow-2xl overflow-hidden">

                {/* Header */}
                <div className={`flex items-start gap-3 p-4 sm:p-5 border-b border-slate-100 shrink-0 ${isService ? 'bg-purple-50' : 'bg-blue-50'}`}>
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isService ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {isService ? <Wrench className="h-5 w-5" /> : <Package className="h-5 w-5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className={`text-[9px] font-black uppercase tracking-widest mb-0.5 ${isService ? 'text-purple-600' : 'text-blue-600'}`}>
                            {isService ? 'Service Requirement' : 'Product Requirement'}
                        </p>
                        <h2 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">{bid.title}</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-lg bg-white/80 border border-slate-200 flex items-center justify-center shrink-0 hover:bg-white transition [&:not(:disabled):hover]:translate-y-0"
                        aria-label="Close"
                    >
                        <X className="h-4 w-4 text-slate-500" />
                    </button>
                </div>

                {/* Scrollable body */}
                <div className="flex-1 overflow-y-auto">
                    <div className="p-4 sm:p-5 space-y-5">

                        {/* Key facts */}
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                            {[
                                { icon: <Tag className="h-3.5 w-3.5 text-[#0b2447]" />, label: 'Category', value: bid.category?.name || bid.requirementType },
                                { icon: <MapPin className="h-3.5 w-3.5 text-[#0b2447]" />, label: 'Location', value: bid.location || bid.buyerOrganization?.city || '—' },
                                { icon: <Hash className="h-3.5 w-3.5 text-[#0b2447]" />, label: 'Quantity', value: bid.quantity ? `${bid.quantity} ${bid.unit || ''}`.trim() : 'As per scope' },
                                { icon: <IndianRupee className="h-3.5 w-3.5 text-[#0b2447]" />, label: 'Budget', value: bid.budgetMax ? `₹${Number(bid.budgetMin || 0).toLocaleString('en-IN')} – ₹${Number(bid.budgetMax).toLocaleString('en-IN')}` : 'Open / Negotiable' },
                                { icon: <Calendar className="h-3.5 w-3.5 text-[#0b2447]" />, label: 'Last Date', value: new Date(bid.lastDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
                                { icon: <CheckCircle className="h-3.5 w-3.5 text-green-600" />, label: 'Responses', value: `${bid._count?.responses || 0} received` },
                            ].map(item => (
                                <div key={item.label} className="bg-slate-50 rounded-lg px-3 py-2.5 border border-slate-100">
                                    <div className="flex items-center gap-1.5 mb-1">{item.icon}<p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">{item.label}</p></div>
                                    <p className="text-xs font-semibold text-slate-800">{item.value}</p>
                                </div>
                            ))}
                        </div>

                        {/* Status + deadline */}
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full border text-[10px] font-bold ${badge.cls}`}>
                                {badge.icon}{badge.label}
                            </span>
                            <span className={`text-xs font-semibold ${days <= 3 ? 'text-red-600' : days <= 7 ? 'text-amber-600' : 'text-slate-500'}`}>
                                <Clock className="h-3.5 w-3.5 inline mr-1" />
                                {days <= 0 ? 'Submission closed' : `${days} day${days !== 1 ? 's' : ''} remaining`}
                            </span>
                        </div>

                        {/* Buyer */}
                        {bid.buyerOrganization && (
                            <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white">
                                <div className="w-9 h-9 rounded-lg bg-[#0b2447]/5 flex items-center justify-center shrink-0">
                                    <Landmark className="h-4 w-4 text-[#0b2447]" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-xs font-bold text-slate-800">{bid.buyerOrganization.organizationName}</p>
                                    <p className="text-[10px] text-slate-500">{bid.buyerOrganization.organizationType?.replace(/_/g, ' ')} · {bid.buyerOrganization.city}, {bid.buyerOrganization.state}</p>
                                </div>
                                {bid.buyerOrganization.verificationStatus === 'VERIFIED' && (
                                    <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200 shrink-0">
                                        <BadgeCheck className="h-3 w-3" /> Verified
                                    </span>
                                )}
                            </div>
                        )}

                        {/* Description */}
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Description</p>
                            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{bid.description}</p>
                        </div>

                        {/* Required documents */}
                        {bid.requiredDocuments && bid.requiredDocuments.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Required Documents</p>
                                <div className="flex flex-wrap gap-2">
                                    {bid.requiredDocuments.map(doc => (
                                        <span key={doc} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-700">
                                            <FileText className="h-3 w-3 text-slate-400" />{doc}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Response form */}
                    <div className="border-t border-slate-100 bg-slate-50 p-4 sm:p-5 space-y-3 shrink-0">
                        <div className="flex items-center justify-between">
                            <p className="text-sm font-bold text-[#0b2447]">{isResponseClosed ? 'Requirement Details' : 'Submit Your Quote'}</p>
                            {!user && <p className="text-[10px] text-amber-600 font-semibold">Login required to submit</p>}
                            {user && user.role !== 'seller' && <p className="text-[10px] text-amber-600 font-semibold">Seller account required</p>}
                        </div>
                        <div className="grid sm:grid-cols-2 gap-2">
                            <input value={price} onChange={e => setPrice(e.target.value)} placeholder="Your offered price (₹)" className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 focus:border-[#0b2447] transition-colors" />
                            <input value={timeline} onChange={e => setTimeline(e.target.value)} placeholder="Delivery / completion timeline" className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 focus:border-[#0b2447] transition-colors" />
                        </div>
                        <textarea
                            value={message}
                            onChange={e => setMessage(e.target.value)}
                            placeholder="Your message or quotation details (min. 10 characters)…"
                            rows={3}
                            className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[#0b2447]/20 focus:border-[#0b2447] transition-colors resize-none"
                        />
                        <div className="flex gap-3">
                            <button
                                onClick={handleSubmit}
                                disabled={submitting || isResponseClosed}
                                className="flex-1 inline-flex items-center justify-center gap-2 h-10 rounded-lg bg-[#0b2447] text-white text-xs font-bold hover:bg-[#12335f] disabled:opacity-60 active:scale-95 transition [&:not(:disabled):hover]:translate-y-0"
                            >
                                <Send className="h-3.5 w-3.5" />
                                {submitting ? 'Submitting…' : 'Submit Response'}
                            </button>
                            <button
                                onClick={onClose}
                                className="h-10 px-5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-100 transition [&:not(:disabled):hover]:translate-y-0"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
