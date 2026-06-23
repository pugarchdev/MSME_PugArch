'use client';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { toast } from 'sonner';
import { marketplaceApi, type BuyerRequirement } from '../api';
import { openFileAsset } from '../../../lib/files';
import {
    X, Package, Wrench, Landmark, BadgeCheck, MapPin,
    Tag, Hash, IndianRupee, Calendar, CheckCircle,
    Clock, FileText, Send, Flame, Loader2, ShieldCheck,
    Truck, Info, Coins, FileDown, User
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
    
    const [requirement, setRequirement] = useState<BuyerRequirement>(bid);
    const [loading, setLoading] = useState(true);

    const isService = requirement.requirementType === 'SERVICE';
    const badge = statusBadge(requirement);
    const days = requirement.daysRemaining ?? daysLeft(requirement.lastDate);
    const isLegacyRequirement = requirement.sourceModel === 'REQUIREMENT' || requirement.id < 0;
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

    /* Load detailed requirement from backend */
    useEffect(() => {
        let active = true;
        setLoading(true);
        marketplaceApi.getRequirementDetail(bid.id)
            .then(data => {
                if (active && data?.requirement) {
                    setRequirement(data.requirement);
                }
            })
            .catch(err => {
                console.error("Failed to load requirement details:", err);
            })
            .finally(() => {
                if (active) setLoading(false);
            });
        return () => { active = false; };
    }, [bid.id]);

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
            await marketplaceApi.respondToRequirement(requirement.id, {
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
                        <h2 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">{requirement.title}</h2>
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
                    {loading ? (
                        <div className="flex flex-col items-center justify-center p-12 text-slate-500 min-h-[400px]">
                            <Loader2 className="h-8 w-8 animate-spin text-[#0b2447] mb-2" />
                            <p className="text-xs font-semibold">Syncing requirement details...</p>
                        </div>
                    ) : (
                        <div className="p-4 sm:p-5 space-y-5">

                            {/* Key facts */}
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                {[
                                    { icon: <Tag className="h-3.5 w-3.5 text-[#0b2447]" />, label: 'Category', value: requirement.category?.name || requirement.requirementType },
                                    { icon: <MapPin className="h-3.5 w-3.5 text-[#0b2447]" />, label: 'Location', value: requirement.location || requirement.buyerOrganization?.city || '—' },
                                    { icon: <Hash className="h-3.5 w-3.5 text-[#0b2447]" />, label: 'Quantity', value: requirement.quantity ? `${requirement.quantity} ${requirement.unit || ''}`.trim() : 'As per scope' },
                                    { icon: <IndianRupee className="h-3.5 w-3.5 text-[#0b2447]" />, label: 'Budget', value: requirement.budgetMax ? `₹${Number(requirement.budgetMin || 0).toLocaleString('en-IN')} – ₹${Number(requirement.budgetMax).toLocaleString('en-IN')}` : 'Open / Negotiable' },
                                    { icon: <Calendar className="h-3.5 w-3.5 text-[#0b2447]" />, label: 'Last Date', value: new Date(requirement.lastDate).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) },
                                    { icon: <CheckCircle className="h-3.5 w-3.5 text-green-600" />, label: 'Responses', value: `${requirement._count?.responses || 0} received` },
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
                            {requirement.buyerOrganization && (
                                <div className="flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white">
                                    <div className="w-9 h-9 rounded-lg bg-[#0b2447]/5 flex items-center justify-center shrink-0">
                                        <Landmark className="h-4 w-4 text-[#0b2447]" />
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-800">{requirement.buyerOrganization.organizationName}</p>
                                        <p className="text-[10px] text-slate-500">{requirement.buyerOrganization.organizationType?.replace(/_/g, ' ')} · {requirement.buyerOrganization.city}, {requirement.buyerOrganization.state}</p>
                                    </div>
                                    {requirement.buyerOrganization.verificationStatus === 'VERIFIED' && (
                                        <span className="ml-auto inline-flex items-center gap-1 text-[9px] font-bold text-green-700 bg-green-50 px-2 py-0.5 rounded-full border border-green-200 shrink-0">
                                            <BadgeCheck className="h-3 w-3" /> Verified
                                        </span>
                                    )}
                                </div>
                            )}

                            {/* Description */}
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Description</p>
                                <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">{requirement.description}</p>
                            </div>

                            {/* Rich Procurement details from wizard payload */}
                            {requirement.payload && (
                                <div className="space-y-5 border-t border-slate-100 pt-5">
                                    <h3 className="text-sm font-black text-[#0b2447] flex items-center gap-1.5">
                                        <Info className="h-4 w-4" />
                                        Procurement Creation Details
                                    </h3>

                                    {/* Basics Details Grid */}
                                    {requirement.payload.basics && (
                                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 space-y-3">
                                            <p className="text-[11px] font-black text-[#0b2447] uppercase tracking-wider flex items-center gap-1">
                                                <Landmark className="h-3.5 w-3.5" /> Department & Funding
                                            </p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Department:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.basics.department || '—'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Priority Level:</span>{' '}
                                                    <span className={`font-black ${requirement.payload.basics.priority === 'Urgent' || requirement.payload.basics.priority === 'Emergency' ? 'text-red-600' : 'text-slate-800'}`}>
                                                        {requirement.payload.basics.priority || 'Normal'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Funding Source:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.basics.fundingSource || '—'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Cost Center:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.basics.costCenter || '—'}</span>
                                                </div>
                                                {requirement.payload.basics.justification && (
                                                    <div className="md:col-span-2">
                                                        <span className="text-slate-400 font-semibold block mb-0.5">Procurement Justification:</span>
                                                        <p className="text-slate-700 italic bg-white p-2 border border-slate-100 rounded text-xs">{requirement.payload.basics.justification}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Bidding Rules and Criteria */}
                                    {requirement.payload.rules && (
                                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 space-y-3">
                                            <p className="text-[11px] font-black text-[#0b2447] uppercase tracking-wider flex items-center gap-1">
                                                <ShieldCheck className="h-3.5 w-3.5" /> Bidding Configuration & Evaluation
                                            </p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Bid Format:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.rules.bidType || 'Single Bid'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Evaluation Mode:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.rules.evaluation || 'L1 Lowest Price'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-semibold">EMD Required:</span>{' '}
                                                    <span className="font-bold text-slate-800">
                                                        {requirement.payload.rules.emdRequired 
                                                            ? `Yes (INR ${Number(requirement.payload.rules.emdAmount || 0).toLocaleString('en-IN')})` 
                                                            : 'No'}
                                                    </span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Performance Security:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.rules.performanceSecurity ? 'Yes' : 'No'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Reverse Auction:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.rules.reverseAuctionIntent ? 'Yes' : 'No'}</span>
                                                </div>
                                            </div>
                                        </div>
                                    )}

                                    {/* Supplier Preferences & Pre-requisites */}
                                    {requirement.payload.vendors && (
                                        <div className="bg-slate-50/50 p-4 rounded-xl border border-slate-200/60 space-y-3">
                                            <p className="text-[11px] font-black text-[#0b2447] uppercase tracking-wider flex items-center gap-1">
                                                <Coins className="h-3.5 w-3.5" /> Supplier Pre-requisites & Preferences
                                            </p>
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Supplier Selection:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.vendors.selection || 'Open'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Min Years of Experience:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.vendors.experienceYears ? `${requirement.payload.vendors.experienceYears} Years` : 'None'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Min Annual Turnover:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.vendors.minimumTurnover ? `INR ${Number(requirement.payload.vendors.minimumTurnover).toLocaleString('en-IN')}` : 'None'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-semibold">MSME Preference:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.vendors.msmePreference ? 'Applicable' : 'Not Applicable'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Make in India Preference:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.vendors.makeInIndiaPreference ? 'Applicable' : 'Not Applicable'}</span>
                                                </div>
                                                <div>
                                                    <span className="text-slate-400 font-semibold">Local Supplier Preference:</span>{' '}
                                                    <span className="font-bold text-slate-800">{requirement.payload.vendors.localVendorPreference ? 'Applicable' : 'Not Applicable'}</span>
                                                </div>
                                                {requirement.payload.vendors.complianceNotes && (
                                                    <div className="md:col-span-2">
                                                        <span className="text-slate-400 font-semibold block mb-0.5">Compliance Notes:</span>
                                                        <p className="text-slate-700 italic bg-white p-2 border border-slate-100 rounded text-xs">{requirement.payload.vendors.complianceNotes}</p>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {/* Line Items Table */}
                                    {requirement.payload.items && requirement.payload.items.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[11px] font-black text-[#0b2447] uppercase tracking-wider flex items-center gap-1">
                                                <Package className="h-3.5 w-3.5" /> Line Items Specification Checklist
                                            </p>
                                            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                                <table className="w-full text-left border-collapse text-xs">
                                                    <thead>
                                                        <tr className="bg-slate-50 border-b border-slate-200 font-black text-slate-500 uppercase text-[10px]">
                                                            <th className="p-2.5">Item Name</th>
                                                            <th className="p-2.5">Specifications</th>
                                                            <th className="p-2.5">Qty / Unit</th>
                                                            <th className="p-2.5">Est. Price</th>
                                                            <th className="p-2.5">Brand Policy</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                                                        {requirement.payload.items.map((item: any, idx: number) => (
                                                            <tr key={idx} className="hover:bg-slate-50/50">
                                                                <td className="p-2.5 font-bold text-slate-900">{item.name}</td>
                                                                <td className="p-2.5 max-w-[200px] truncate" title={item.specification}>{item.specification || '—'}</td>
                                                                <td className="p-2.5">{item.quantity} {item.unit}</td>
                                                                <td className="p-2.5 text-[#0b2447] font-bold">
                                                                    {item.unitPrice ? `₹${Number(item.unitPrice).toLocaleString('en-IN')}` : '—'}
                                                                </td>
                                                                <td className="p-2.5 text-slate-500 font-semibold">{item.brandPolicy || 'Any Brand'}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Consignee Distribution */}
                                    {requirement.payload.consigneeDetails && requirement.payload.consigneeDetails.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[11px] font-black text-[#0b2447] uppercase tracking-wider flex items-center gap-1">
                                                <Truck className="h-3.5 w-3.5" /> Consignee & Shipping Allocations
                                            </p>
                                            <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                                                <table className="w-full text-left border-collapse text-xs">
                                                    <thead>
                                                        <tr className="bg-slate-50 border-b border-slate-200 font-black text-slate-500 uppercase text-[10px]">
                                                            <th className="p-2.5">Consignee Name</th>
                                                            <th className="p-2.5">Delivery Destination</th>
                                                            <th className="p-2.5">Quantity</th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-100 text-slate-700 font-medium">
                                                        {requirement.payload.consigneeDetails.map((consignee: any, idx: number) => (
                                                            <tr key={idx} className="hover:bg-slate-50/50">
                                                                <td className="p-2.5 font-bold text-slate-900">{consignee.name || '—'}</td>
                                                                <td className="p-2.5">{consignee.location || '—'}</td>
                                                                <td className="p-2.5 font-bold">{consignee.quantity}</td>
                                                            </tr>
                                                        ))}
                                                    </tbody>
                                                </table>
                                            </div>
                                        </div>
                                    )}

                                    {/* Documents checklist */}
                                    {requirement.payload.documents && requirement.payload.documents.length > 0 && (
                                        <div className="space-y-2">
                                            <p className="text-[11px] font-black text-[#0b2447] uppercase tracking-wider block mb-2">
                                                Attached Procurement Documents
                                            </p>
                                            <div className="grid gap-2 sm:grid-cols-2">
                                                {requirement.payload.documents.map((doc: any, index: number) => {
                                                    const hasFile = doc.fileName && doc.documentUrl;
                                                    return (
                                                        <div key={index} className={`flex items-start gap-2.5 p-2.5 border rounded-lg ${hasFile ? 'bg-blue-50/40 border-blue-100' : 'bg-slate-50/50 border-slate-200'}`}>
                                                            <FileText className={`h-4 w-4 mt-0.5 shrink-0 ${hasFile ? 'text-blue-600' : 'text-slate-400'}`} />
                                                            <div className="min-w-0 flex-1">
                                                                <p className="text-xs font-bold text-slate-800 truncate">{doc.name}</p>
                                                                <p className="text-[10px] text-slate-500 font-medium">{doc.requirement} Checklist Document</p>
                                                                {hasFile && (
                                                                    <button
                                                                        type="button"
                                                                        onClick={() => {
                                                                            openFileAsset({ id: doc.fileAssetId, url: doc.documentUrl }, doc.name).catch(() => {});
                                                                        }}
                                                                        className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-black text-blue-600 hover:text-blue-800 transition"
                                                                    >
                                                                        <FileDown className="h-3.5 w-3.5 text-blue-600" /> View / Download File
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Standard Required Documents checklist (from requiredDocuments array) */}
                            {!requirement.payload && requirement.requiredDocuments && requirement.requiredDocuments.length > 0 && (
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Required Seller Documents</p>
                                    <div className="flex flex-wrap gap-2">
                                        {requirement.requiredDocuments.map(doc => (
                                            <span key={doc} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-50 border border-slate-200 text-[11px] font-semibold text-slate-700">
                                                <FileText className="h-3 w-3 text-slate-400" />{doc}
                                            </span>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Terms and Conditions for Standard/Non-Legacy */}
                            {!requirement.payload && requirement.terms && (
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Terms & Conditions</p>
                                    <p className="text-xs text-slate-700 bg-slate-50 p-3 rounded-lg border border-slate-100 whitespace-pre-line leading-relaxed">{requirement.terms}</p>
                                </div>
                            )}

                            {/* Standard uploaded attachments */}
                            {!requirement.payload && requirement.attachmentUrl && (
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Uploaded Bid Documents</p>
                                    <div className="grid gap-2 sm:grid-cols-2">
                                        {requirement.attachmentUrl.split(',').map((url, idx) => {
                                            const cleanUrl = url.trim();
                                            if (!cleanUrl) return null;
                                            const fileName = cleanUrl.substring(cleanUrl.lastIndexOf('/') + 1) || `Document #${idx + 1}`;
                                            return (
                                                <button
                                                    key={idx}
                                                    type="button"
                                                    onClick={() => {
                                                        openFileAsset({ url: cleanUrl }, 'Attached Document').catch(() => {});
                                                    }}
                                                    className="flex items-center gap-2 p-2.5 rounded-lg border border-blue-100 bg-blue-50/40 hover:bg-blue-50 transition text-left"
                                                >
                                                    <FileText className="h-4 w-4 text-blue-600" />
                                                    <div className="min-w-0 flex-1">
                                                        <p className="text-xs font-bold text-slate-800 truncate">{decodeURIComponent(fileName)}</p>
                                                        <p className="text-[10px] text-slate-500 font-medium">Click to view attached document</p>
                                                    </div>
                                                </button>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Contact Person Details */}
                            {requirement.contactPerson && (
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Contact Authority</p>
                                    <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 bg-slate-50/50 p-2.5 border border-slate-100 rounded-lg max-w-xs">
                                        <User className="h-4 w-4 text-slate-500" />
                                        <span>{requirement.contactPerson}</span>
                                    </div>
                                </div>
                            )}

                        </div>
                    )}
                </div>

                {/* Response form */}
                {!loading && (
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
                )}
            </div>
        </div>
    );
}
