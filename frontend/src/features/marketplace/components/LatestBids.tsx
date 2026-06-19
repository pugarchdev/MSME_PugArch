'use client';
import React, { memo, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    ArrowRight,
    CheckCircle,
    ChevronRight,
    Clock,
    Eye,
    Flame,
    Grid2X2,
    Landmark,
    List,
    MapPin,
    Package,
    Send,
    Wrench
} from 'lucide-react';
import { useAuth } from '../../../hooks/useAuth';
import { useResponsiveViewMode } from '../../shared/hooks';
import { BidDetailModal } from './BidDetailModal';
import type { BuyerRequirement, MarketplaceBid, MarketplaceTender } from '../api';
import { formatBudgetRange, formatDateIN, formatSingleBudget, getDeadlineLabel, getProcurementStatus, getStatusBadgeClass } from '../utils/procurementDisplay';

function statusBadge(req: BuyerRequirement) {
    const status = getProcurementStatus({
        status: req.status,
        computedStatus: req.computedStatus,
        statusLabel: req.statusLabel,
        dueDate: req.lastDate,
        isUrgent: req.isUrgent
    });
    return {
        ...status,
        cls: getStatusBadgeClass(status.code),
        icon: status.code === 'AWARDED'
            ? <CheckCircle className="h-3 w-3" />
            : status.code === 'CLOSING_SOON' || status.code === 'CLOSING_TODAY'
                ? <Flame className="h-3 w-3" />
                : null
    };
}

function useFadeIn() {
    const ref = useRef<HTMLDivElement>(null);
    const [visible, setVisible] = useState(false);

    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const observer = new IntersectionObserver(([entry]) => {
            if (entry.isIntersecting) {
                setVisible(true);
                observer.disconnect();
            }
        }, { threshold: 0.08 });
        observer.observe(el);
        return () => observer.disconnect();
    }, []);

    return { ref, visible };
}

function RequirementSkeleton() {
    return (
        <div className="rounded-xl border border-slate-200 bg-white p-4">
            <div className="mb-4 flex items-start gap-3">
                <div className="h-9 w-9 rounded-lg bg-slate-100 animate-pulse" />
                <div className="flex-1 space-y-2">
                    <div className="h-3 w-4/5 rounded bg-slate-100 animate-pulse" />
                    <div className="h-3 w-2/3 rounded bg-slate-100 animate-pulse" />
                </div>
            </div>
            <div className="space-y-2">
                <div className="h-3 w-full rounded bg-slate-100 animate-pulse" />
                <div className="h-3 w-3/4 rounded bg-slate-100 animate-pulse" />
            </div>
            <div className="mt-5 h-8 rounded-lg bg-slate-100 animate-pulse" />
        </div>
    );
}

const RequirementCard = memo(function RequirementCard({
    requirement,
    index,
    visible,
    onView,
    onSubmit,
    actionLabel
}: {
    requirement: BuyerRequirement;
    index: number;
    visible: boolean;
    onView: (requirement: BuyerRequirement) => void;
    onSubmit: (requirement: BuyerRequirement) => void;
    actionLabel: string;
}) {
    const badge = statusBadge(requirement);
    const deadlineLabel = getDeadlineLabel(requirement.lastDate);
    const publishedDate = formatDateIN(requirement.approvedAt || requirement.createdAt || requirement.updatedAt);
    const isService = requirement.requirementType === 'SERVICE';
    const responseCount = requirement._count?.responses ?? 0;
    const isLegacyRequirement = requirement.sourceModel === 'REQUIREMENT' || requirement.id < 0;
    const detailHref = isLegacyRequirement ? '' : `/marketplace/requirements/${requirement.id}`;

    return (
        <article
            className="group flex min-h-[270px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#0b2447]/30 hover:shadow-lg"
            style={{
                opacity: visible ? 1 : 0,
                transform: visible ? 'translateY(0)' : 'translateY(20px)',
                transition: `opacity 0.5s ease ${80 + index * 70}ms, transform 0.5s ease ${80 + index * 70}ms, box-shadow 0.25s, border-color 0.25s`
            }}
        >
            <div className={`h-1 w-full ${isService ? 'bg-teal-500' : 'bg-[#0b2447]'}`} />
            <div className="flex flex-1 flex-col gap-3 p-4">
                <div className="flex items-start justify-between gap-2">
                    <div className="flex min-w-0 items-start gap-2">
                        <div className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${isService ? 'bg-teal-50 text-teal-700' : 'bg-blue-50 text-blue-700'}`}>
                            {isService ? <Wrench className="h-4 w-4" /> : <Package className="h-4 w-4" />}
                        </div>
                        <h3 className="line-clamp-2 text-sm font-bold leading-snug text-slate-800 transition group-hover:text-[#0b2447]">
                            {requirement.title}
                        </h3>
                    </div>
                    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.cls}`}>
                        {badge.icon}
                        {badge.label}
                    </span>
                </div>

                {requirement.buyerOrganization && (
                    <div className="flex items-center gap-1.5">
                        <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100">
                            <Landmark className="h-3 w-3 text-slate-500" />
                        </div>
                        <p className="truncate text-[11px] font-semibold text-slate-600">{requirement.buyerOrganization.organizationName}</p>
                        {requirement.buyerOrganization.verificationStatus === 'VERIFIED' && <CheckCircle className="h-3 w-3 shrink-0 text-green-500" />}
                    </div>
                )}

                <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{requirement.description}</p>

                <div className="flex flex-wrap gap-x-3 gap-y-1">
                    {requirement.requirementNumber && <span className="rounded border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[10px] font-black text-[#0b2447]">{requirement.requirementNumber}</span>}
                    {requirement.category && <span className="rounded border border-slate-100 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">{requirement.category.name}</span>}
                    {requirement.location && <span className="inline-flex items-center gap-0.5 text-[10px] text-slate-500"><MapPin className="h-3 w-3" />{requirement.location}</span>}
                    {requirement.quantity && requirement.unit && <span className="text-[10px] text-slate-500">{requirement.quantity} {requirement.unit}</span>}
                </div>

                <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2 text-[11px]">
                    <span><span className="block text-[10px] font-bold uppercase text-slate-400">Published</span><span className="font-bold text-slate-700">{publishedDate}</span></span>
                    <span><span className="block text-[10px] font-bold uppercase text-slate-400">Last Date</span><span className="font-bold text-slate-700">{formatDateIN(requirement.lastDate)}</span></span>
                    <span><span className="block text-[10px] font-bold uppercase text-slate-400">Days Left</span><span className="font-bold text-[#0b2447]">{deadlineLabel}</span></span>
                    <span><span className="block text-[10px] font-bold uppercase text-slate-400">Budget</span><span className="font-bold text-[#0b2447]">{formatBudgetRange(requirement.budgetMin, requirement.budgetMax)}</span></span>
                </div>

                <p className="text-[11px] font-semibold text-slate-500">
                    {responseCount} seller response{responseCount === 1 ? '' : 's'}
                </p>

                <div className="mt-auto flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row sm:items-center sm:justify-between">
                    <span className={`flex items-center gap-1 text-[11px] font-semibold ${badge.code === 'CLOSING_TODAY' ? 'text-red-600' : badge.code === 'CLOSING_SOON' ? 'text-amber-600' : 'text-slate-500'}`}>
                        <Clock className="h-3 w-3" />
                        {badge.deadlineLabel}
                    </span>
                    <div className="flex items-center gap-2">
                        {isLegacyRequirement ? (
                            <button onClick={() => onView(requirement)} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 text-[11px] font-bold text-slate-700 transition hover:border-[#0b2447] hover:text-[#0b2447]">
                                <Eye className="h-3.5 w-3.5" />
                                View
                            </button>
                        ) : (
                            <Link href={detailHref} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg border border-slate-200 px-3 text-[11px] font-bold text-slate-700 transition hover:border-[#0b2447] hover:text-[#0b2447]">
                                <Eye className="h-3.5 w-3.5" />
                                View
                            </Link>
                        )}
                        <button onClick={() => isLegacyRequirement || badge.label === 'Closed' || badge.label === 'Awarded' ? onView(requirement) : onSubmit(requirement)} className="inline-flex h-8 items-center justify-center gap-1 rounded-lg bg-[#0b2447] px-3 text-[11px] font-bold text-white transition hover:bg-[#12335f] active:scale-95">
                            <Send className="h-3.5 w-3.5" />
                            {isLegacyRequirement || badge.label === 'Closed' || badge.label === 'Awarded' ? 'Details' : actionLabel}
                        </button>
                    </div>
                </div>
            </div>
        </article>
    );
});

function HomeSection({ title, href, empty, children, listHeaders, listChildren }: { title: string; href: string; empty: string; children: React.ReactNode; listHeaders?: string[]; listChildren?: React.ReactNode }) {
    const [viewMode, setViewMode] = useResponsiveViewMode(`phase7:marketplace-home:${title.toLowerCase().replace(/[^a-z0-9]+/g, '-')}:view-mode`);
    const gridList = React.Children.toArray(children).filter(Boolean);
    const rowList = React.Children.toArray(listChildren || children).filter(Boolean);
    const hasItems = gridList.length > 0;

    return (
        <div>
            <div className="mb-3 flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <h3 className="text-sm font-black uppercase tracking-wide text-slate-800">{title}</h3>
                <div className="flex flex-wrap items-center gap-2">
                    <div className="inline-flex rounded-lg border border-slate-200 bg-white p-1" aria-label={`${title} display mode`}>
                        <button
                            type="button"
                            onClick={() => setViewMode('grid')}
                            aria-pressed={viewMode === 'grid'}
                            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold transition ${viewMode === 'grid' ? 'bg-[#0b2447] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            <Grid2X2 className="h-3.5 w-3.5" /> Grid
                        </button>
                        <button
                            type="button"
                            onClick={() => setViewMode('list')}
                            aria-pressed={viewMode === 'list'}
                            className={`inline-flex h-8 items-center gap-1.5 rounded-md px-2.5 text-[11px] font-bold transition ${viewMode === 'list' ? 'bg-[#0b2447] text-white shadow-sm' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            <List className="h-3.5 w-3.5" /> List
                        </button>
                    </div>
                    <Link href={href} className="inline-flex h-9 items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 text-[11px] font-bold text-[#0b2447] hover:bg-slate-50">
                        View all <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                </div>
            </div>
            {hasItems ? (
                viewMode === 'grid' ? (
                    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">{gridList}</div>
                ) : (
                    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                        {listHeaders?.length ? (
                            <div className="hidden min-w-[1180px] grid-cols-[72px_minmax(220px,1.5fr)_minmax(150px,1fr)_minmax(130px,0.8fr)_130px_120px_120px_105px_130px_140px] gap-3 border-b border-slate-200 bg-slate-50 px-4 py-3 text-[11px] font-black uppercase tracking-wide text-slate-600 lg:grid">
                                {listHeaders.map(header => <span key={header}>{header}</span>)}
                            </div>
                        ) : null}
                        <div className="min-w-[1180px] divide-y divide-slate-100 lg:min-w-[1180px]">{rowList}</div>
                    </div>
                )
            ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white px-4 py-8 text-center">
                    <p className="text-sm font-bold text-slate-700">{empty}</p>
                    <p className="mt-1 text-xs text-slate-500">Fresh records will appear here immediately after publication.</p>
                </div>
            )}
        </div>
    );
}

function TenderCard({ tender, index, visible }: { tender: MarketplaceTender; index: number; visible: boolean }) {
    const publishedDate = tender.publishedAt || tender.createdAt;
    const status = getProcurementStatus({ status: tender.status, dueDate: tender.closesAt });
    const org = tender.buyer?.buyerProfile?.organizationName || tender.buyer?.name || 'Verified buyer';
    const location = [tender.buyer?.buyerProfile?.district, tender.buyer?.buyerProfile?.state].filter(Boolean).join(', ');

    return (
        <article className="group flex min-h-[280px] flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#0b2447]/30 hover:shadow-lg" style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transition: `opacity 0.5s ease ${80 + index * 70}ms, transform 0.5s ease ${80 + index * 70}ms` }}>
            <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#c86413]">{tender.tenderId}</p>
                    <h4 className="mt-1 line-clamp-2 text-sm font-bold text-slate-800 group-hover:text-[#0b2447]">{tender.title}</h4>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${getStatusBadgeClass(status.code)}`}>{status.label}</span>
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{tender.description}</p>
            <div className="mt-3 space-y-2 text-[11px] font-semibold text-slate-600">
                <p className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5 text-slate-400" /> {org}</p>
                <p className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5 text-slate-400" /> {tender.category}</p>
                {location && <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {location}</p>}
                <p className="font-black text-[#0b2447]">{formatSingleBudget(tender.budget)} estimated value</p>
                <p>{tender.bidsCount || 0} bid{(tender.bidsCount || 0) === 1 ? '' : 's'} submitted</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2 text-[11px]">
                <span><span className="block text-[10px] font-bold uppercase text-slate-400">Published</span><span className="font-bold text-slate-700">{formatDateIN(publishedDate)}</span></span>
                <span><span className="block text-[10px] font-bold uppercase text-slate-400">Closes</span><span className="font-bold text-slate-700">{formatDateIN(tender.closesAt)}</span></span>
                <span><span className="block text-[10px] font-bold uppercase text-slate-400">Days Left</span><span className="font-bold text-[#0b2447]">{status.deadlineLabel}</span></span>
                <span><span className="block text-[10px] font-bold uppercase text-slate-400">Status</span><span className="font-bold text-[#0b2447]">{status.label}</span></span>
            </div>
            <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
                <span className={`text-[11px] font-semibold ${status.code === 'CLOSING_TODAY' ? 'text-red-600' : status.code === 'CLOSING_SOON' ? 'text-amber-600' : 'text-slate-500'}`}><Clock className="mr-1 inline h-3 w-3" />{status.deadlineLabel}</span>
                <Link href={`/tenders?tender=${tender.id}`} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#0b2447] px-3 text-[11px] font-bold text-white hover:bg-[#12335f]">View Tender <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
        </article>
    );
}

function ProcurementBidCard({ bid, index, visible }: { bid: MarketplaceBid; index: number; visible: boolean }) {
    const status = getProcurementStatus({ status: bid.status || bid.lifecycleStage || bid.approvalStatus, dueDate: bid.endDate });
    const isTenderActivity = bid.sourceModel === 'TENDER';
    const href = isTenderActivity && bid.sourceId ? `/tenders?tender=${bid.sourceId}` : `/bids/${bid.bidNumber}`;
    const countLabel = isTenderActivity
        ? `${bid.participantsCount || 0} submitted bid${(bid.participantsCount || 0) === 1 ? '' : 's'}`
        : `${bid.participantsCount || 0} participant${(bid.participantsCount || 0) === 1 ? '' : 's'}`;
    return (
        <article className="group flex min-h-[280px] flex-col rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-all duration-300 hover:-translate-y-0.5 hover:border-[#0b2447]/30 hover:shadow-lg" style={{ opacity: visible ? 1 : 0, transform: visible ? 'translateY(0)' : 'translateY(20px)', transition: `opacity 0.5s ease ${80 + index * 70}ms, transform 0.5s ease ${80 + index * 70}ms` }}>
            <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#c86413]">{bid.bidNumber}</p>
                    <h4 className="mt-1 line-clamp-2 text-sm font-bold text-slate-800 group-hover:text-[#0b2447]">{bid.title}</h4>
                </div>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold ${getStatusBadgeClass(status.code)}`}>{isTenderActivity ? 'Tender bids' : status.label}</span>
            </div>
            <p className="line-clamp-2 text-xs leading-relaxed text-slate-500">{bid.description}</p>
            <div className="mt-3 space-y-2 text-[11px] font-semibold text-slate-600">
                <p className="flex items-center gap-1.5"><Landmark className="h-3.5 w-3.5 text-slate-400" /> {bid.buyerOrganizationName}</p>
                <p className="flex items-center gap-1.5"><MapPin className="h-3.5 w-3.5 text-slate-400" /> {[bid.district, bid.state].filter(Boolean).join(', ') || bid.deliveryLocation}</p>
                <p>{bid.quantity || 'Estimated'} {bid.unit || ''} - {bid.category}</p>
                <p className="font-black text-[#0b2447]">{formatSingleBudget(bid.estimatedValue)} estimated value</p>
                <p>{countLabel}</p>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg border border-slate-100 bg-slate-50/70 p-2 text-[11px]">
                <span><span className="block text-[10px] font-bold uppercase text-slate-400">Start</span><span className="font-bold text-slate-700">{formatDateIN(bid.startDate || bid.createdAt)}</span></span>
                <span><span className="block text-[10px] font-bold uppercase text-slate-400">Due</span><span className="font-bold text-slate-700">{formatDateIN(bid.endDate)}</span></span>
                <span><span className="block text-[10px] font-bold uppercase text-slate-400">Days Left</span><span className="font-bold text-[#0b2447]">{status.deadlineLabel}</span></span>
                <span><span className="block text-[10px] font-bold uppercase text-slate-400">Status</span><span className="font-bold text-[#0b2447]">{status.label}</span></span>
            </div>
            <div className="mt-auto flex items-center justify-between border-t border-slate-100 pt-3">
                <span className={`text-[11px] font-semibold ${status.code === 'CLOSING_TODAY' ? 'text-red-600' : status.code === 'CLOSING_SOON' ? 'text-amber-600' : 'text-slate-500'}`}><Clock className="mr-1 inline h-3 w-3" />{status.deadlineLabel}</span>
                <Link href={href} className="inline-flex h-8 items-center gap-1 rounded-lg bg-[#0b2447] px-3 text-[11px] font-bold text-white hover:bg-[#12335f]">{isTenderActivity ? 'View Tender' : 'View Bid'} <ArrowRight className="h-3.5 w-3.5" /></Link>
            </div>
        </article>
    );
}

function TenderListRow({ tender, srNo }: { tender: MarketplaceTender; srNo: number }) {
    const org = tender.buyer?.buyerProfile?.organizationName || tender.buyer?.name || 'Verified buyer';
    const status = getProcurementStatus({ status: tender.status, dueDate: tender.closesAt });
    return (
        <div className="grid gap-3 px-4 py-3 text-xs text-slate-700 lg:grid-cols-[72px_minmax(220px,1.5fr)_minmax(150px,1fr)_minmax(130px,0.8fr)_130px_120px_120px_105px_130px_140px] lg:items-center">
            <span className="font-black text-slate-500"><span className="lg:hidden">Sr. No. </span>{srNo}</span>
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-[#c86413]">{tender.tenderId}</p><p className="font-bold text-[#0b2447]">{tender.title}</p><p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{tender.description}</p></div>
            <span className="font-semibold">{org}</span>
            <span>{tender.category}</span>
            <span className="font-black text-[#0b2447]">{formatSingleBudget(tender.budget)}</span>
            <span><span className="font-bold text-slate-400 lg:hidden">Published: </span>{formatDateIN(tender.publishedAt || tender.createdAt)}</span>
            <span><span className="font-bold text-slate-400 lg:hidden">Closes: </span>{formatDateIN(tender.closesAt)}</span>
            <span className="font-bold text-[#0b2447]"><span className="font-bold text-slate-400 lg:hidden">Days Left: </span>{status.deadlineLabel}</span>
            <span><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${getStatusBadgeClass(status.code)}`}>{status.label}</span></span>
            <Link href={`/tenders?tender=${tender.id}`} className="inline-flex h-8 w-fit items-center gap-1 rounded-lg bg-[#0b2447] px-3 text-[11px] font-bold text-white hover:bg-[#12335f]">View Tender <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
    );
}

function ProcurementBidListRow({ bid, srNo }: { bid: MarketplaceBid; srNo: number }) {
    const isTenderActivity = bid.sourceModel === 'TENDER';
    const href = isTenderActivity && bid.sourceId ? `/tenders?tender=${bid.sourceId}` : `/bids/${bid.id}`;
    const status = getProcurementStatus({ status: bid.status || bid.lifecycleStage || bid.approvalStatus, dueDate: bid.endDate });
    return (
        <div className="grid gap-3 px-4 py-3 text-xs text-slate-700 lg:grid-cols-[72px_minmax(220px,1.5fr)_minmax(150px,1fr)_minmax(130px,0.8fr)_130px_120px_120px_105px_130px_140px] lg:items-center">
            <span className="font-black text-slate-500"><span className="lg:hidden">Sr. No. </span>{srNo}</span>
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-[#c86413]">{bid.bidNumber}</p><p className="font-bold text-[#0b2447]">{bid.title}</p><p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{bid.description}</p></div>
            <span className="font-semibold">{bid.buyerOrganizationName}</span>
            <span>{[bid.district, bid.state].filter(Boolean).join(', ') || bid.deliveryLocation}</span>
            <span className="font-black text-[#0b2447]">{formatSingleBudget(bid.estimatedValue)}</span>
            <span><span className="font-bold text-slate-400 lg:hidden">Start: </span>{formatDateIN(bid.startDate || bid.createdAt)}</span>
            <span><span className="font-bold text-slate-400 lg:hidden">Due: </span>{formatDateIN(bid.endDate)}</span>
            <span className="font-bold text-[#0b2447]"><span className="font-bold text-slate-400 lg:hidden">Days Left: </span>{status.deadlineLabel}</span>
            <span><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${getStatusBadgeClass(status.code)}`}>{isTenderActivity ? 'Tender bids' : status.label}</span></span>
            <Link href={href} className="inline-flex h-8 w-fit items-center gap-1 rounded-lg bg-[#0b2447] px-3 text-[11px] font-bold text-white hover:bg-[#12335f]">{isTenderActivity ? 'View Tender' : 'View Bid'} <ArrowRight className="h-3.5 w-3.5" /></Link>
        </div>
    );
}

function RequirementListRow({ requirement, srNo, onView }: { requirement: BuyerRequirement; srNo: number; onView: (requirement: BuyerRequirement) => void }) {
    const isLegacyRequirement = requirement.sourceModel === 'REQUIREMENT' || requirement.id < 0;
    const budget = formatBudgetRange(requirement.budgetMin, requirement.budgetMax);
    const buyer = requirement.buyerOrganization?.organizationName || 'Verified buyer';
    const detailHref = `/marketplace/requirements/${requirement.id}`;
    const badge = statusBadge(requirement);
    const responseCount = requirement._count?.responses ?? 0;
    return (
        <div className="grid gap-3 px-4 py-3 text-xs text-slate-700 lg:grid-cols-[72px_minmax(220px,1.5fr)_minmax(150px,1fr)_minmax(130px,0.8fr)_130px_120px_120px_105px_130px_140px] lg:items-center">
            <span className="font-black text-slate-500"><span className="lg:hidden">Sr. No. </span>{srNo}</span>
            <div className="min-w-0"><p className="text-[10px] font-black uppercase tracking-widest text-[#c86413]">{requirement.requirementNumber || 'Requirement'}</p><p className="font-bold text-[#0b2447]">{requirement.title}</p><p className="mt-1 line-clamp-1 text-[11px] text-slate-500">{requirement.description}</p></div>
            <span className="font-semibold">{buyer}</span>
            <span className="font-black text-[#0b2447]">{budget}</span>
            <span><span className="font-bold text-slate-400 lg:hidden">Published: </span>{formatDateIN(requirement.approvedAt || requirement.createdAt || requirement.updatedAt)}</span>
            <span><span className="font-bold text-slate-400 lg:hidden">Last Date: </span>{formatDateIN(requirement.lastDate)}</span>
            <span className="font-bold text-[#0b2447]"><span className="font-bold text-slate-400 lg:hidden">Days Left: </span>{badge.deadlineLabel}</span>
            <span><span className={`inline-flex rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${badge.cls}`}>{badge.label}</span></span>
            <span className="font-semibold text-slate-600">{responseCount} response{responseCount === 1 ? '' : 's'}</span>
            {isLegacyRequirement ? (
                <button onClick={() => onView(requirement)} className="inline-flex h-8 w-fit items-center gap-1 rounded-lg bg-[#0b2447] px-3 text-[11px] font-bold text-white hover:bg-[#12335f]">View Details <ArrowRight className="h-3.5 w-3.5" /></button>
            ) : (
                <Link href={detailHref} className="inline-flex h-8 w-fit items-center gap-1 rounded-lg bg-[#0b2447] px-3 text-[11px] font-bold text-white hover:bg-[#12335f]">View Details <ArrowRight className="h-3.5 w-3.5" /></Link>
            )}
        </div>
    );
}

interface Props {
    requirements?: BuyerRequirement[];
    tenders?: MarketplaceTender[];
    bids?: MarketplaceBid[];
    loading?: boolean;
}

export function LatestBids({ requirements, tenders, bids, loading = false }: Props) {
    const { ref, visible } = useFadeIn();
    const router = useRouter();
    const { user } = useAuth();
    const [selected, setSelected] = useState<BuyerRequirement | null>(null);

    const liveRequirements = useMemo(() => (requirements || []).slice(0, 5), [requirements]);
    const liveTenders = useMemo(() => (tenders || []).slice(0, 5), [tenders]);
    const liveBids = useMemo(() => (bids || []).slice(0, 5), [bids]);
    const isSeller = user?.role === 'seller' || user?.role === 'admin' || user?.role === 'master_admin';
    const actionLabel = user ? (isSeller ? 'Submit Quote' : 'View Details') : 'Login to Submit';

    const handleSubmit = (requirement: BuyerRequirement) => {
        if (!user) {
            router.push(`/login?redirect=${encodeURIComponent(`/marketplace/requirements/${requirement.id}`)}`);
            return;
        }
        setSelected(requirement);
    };

    return (
        <>
            {selected && <BidDetailModal bid={selected} onClose={() => setSelected(null)} />}
            <section ref={ref} className="mt-2 border-b border-slate-100 bg-[#f8fafc]" aria-labelledby="bids-heading">
                <div className="mx-auto max-w-[1680px] px-4 py-10 sm:px-6 sm:py-12 2xl:px-8">
                    {/* <div
                        className="mb-7 flex flex-col justify-between gap-3 sm:flex-row sm:items-end"
                        style={{ opacity: visible ? 1 : 0, transform: visible ? 'none' : 'translateY(-10px)', transition: 'opacity 0.5s, transform 0.5s' }}
                    >
                        <div>
                            <span className="mb-2 inline-block rounded-full border border-[#0b2447]/10 bg-[#0b2447]/5 px-3 py-1 text-[10px] font-bold uppercase tracking-widest text-[#0b2447]">Live Requirements</span>
                            <h2 id="bids-heading" className="text-lg font-bold text-[#0b2447] sm:text-xl">Latest Buyer Requirements &amp; Bids</h2>
                            <p className="mt-1 text-xs text-slate-500">Open procurement requirements from verified buyers, with live seller response counts.</p>
                        </div>
                        <Link href="/marketplace/requirements" className="inline-flex h-9 shrink-0 items-center gap-1.5 self-start rounded-lg border border-[#0b2447] px-4 text-xs font-bold text-[#0b2447] transition hover:bg-[#0b2447] hover:text-white active:scale-95 sm:self-end">
                            View All Requirements <ChevronRight className="h-3.5 w-3.5" />
                        </Link>
                    </div> */}

                    {loading ? (
                        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
                            {Array.from({ length: 6 }).map((_, index) => <RequirementSkeleton key={index} />)}
                        </div>
                    ) : (
                        <div className="space-y-8">
                            <HomeSection
                                title="Newly Published Tenders"
                                href="/tenders"
                                empty="No published tenders are available right now."
                                listHeaders={['Sr. No.', 'Tender', 'Buyer', 'Category', 'Value', 'Published', 'Closes', 'Days Left', 'Status', 'Action']}
                                listChildren={liveTenders.map((tender, index) => <TenderListRow key={tender.id} tender={tender} srNo={index + 1} />)}
                            >
                                {liveTenders.map((tender, index) => <TenderCard key={tender.id} tender={tender} index={index} visible={visible} />)}
                            </HomeSection>
                            <HomeSection
                                title="Live Procurement Bids"
                                href="/bids"
                                empty="No live procurement bids are available right now."
                                listHeaders={['Sr. No.', 'Bid/RFQ', 'Buyer', 'Location', 'Value', 'Start Date', 'Due Date', 'Days Left', 'Status', 'Action']}
                                listChildren={liveBids.map((bid, index) => <ProcurementBidListRow key={bid.id} bid={bid} srNo={index + 1} />)}
                            >
                                {liveBids.map((bid, index) => <ProcurementBidCard key={bid.id} bid={bid} index={index} visible={visible} />)}
                            </HomeSection>
                            <HomeSection
                                title="Buyer Requirements"
                                href="/marketplace/requirements"
                                empty="No live buyer requirements are available right now."
                                listHeaders={['Sr. No.', 'Requirement', 'Buyer', 'Budget', 'Published', 'Last Date', 'Days Left', 'Status', 'Responses', 'Action']}
                                listChildren={liveRequirements.map((requirement, index) => <RequirementListRow key={`${requirement.sourceModel || 'buyer'}-${requirement.id}`} requirement={requirement} srNo={index + 1} onView={setSelected} />)}
                            >
                                {liveRequirements.map((requirement, index) => (
                                    <RequirementCard
                                        key={`${requirement.sourceModel || 'buyer'}-${requirement.id}`}
                                        requirement={requirement}
                                        index={index}
                                        visible={visible}
                                        onView={setSelected}
                                        onSubmit={handleSubmit}
                                        actionLabel={actionLabel}
                                    />
                                ))}
                            </HomeSection>
                        </div>
                    )}

                </div>
            </section>
        </>
    );
}
