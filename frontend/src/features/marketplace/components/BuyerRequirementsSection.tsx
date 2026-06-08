'use client';
import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { BadgeCheck, Building2, Clock, FileText, MapPin, Send } from 'lucide-react';
import type { BuyerRequirement } from '../api';

const tabs = [
    { id: 'all', label: 'All' },
    { id: 'products', label: 'Products' },
    { id: 'services', label: 'Services' },
    { id: 'closing_soon', label: 'Closing Soon' },
    { id: 'large_industries', label: 'Large Industries' },
    { id: 'government', label: 'Government Buyers' }
] as const;

const fallbackRequirements: BuyerRequirement[] = [
    {
        id: 0,
        title: 'Industrial Safety Equipment Supply',
        requirementType: 'PRODUCT',
        description: 'Supply of certified PPE, safety helmets, gloves, and industrial safety kits.',
        quantity: '5000',
        unit: 'units',
        location: 'Jharsuguda',
        lastDate: '2026-06-25T00:00:00.000Z',
        visibility: 'PUBLIC',
        status: 'OPEN',
        isFeatured: true,
        isUrgent: false,
        category: { id: 0, name: 'Safety Equipment' },
        buyerOrganization: { id: 0, organizationName: 'Vedanta Limited', organizationType: 'PUBLIC_LIMITED', verificationStatus: 'VERIFIED', district: 'Jharsuguda' },
        _count: { responses: 0 }
    }
];

export function BuyerRequirementsSection({ requirements }: { requirements: BuyerRequirement[] }) {
    const [active, setActive] = useState<(typeof tabs)[number]['id']>('all');
    const source = requirements.length > 0 ? requirements : fallbackRequirements;
    const filtered = useMemo(() => {
        if (active === 'products') return source.filter(item => item.requirementType === 'PRODUCT');
        if (active === 'services') return source.filter(item => item.requirementType === 'SERVICE');
        if (active === 'closing_soon') return source.filter(item => new Date(item.lastDate).getTime() - Date.now() < 7 * 24 * 60 * 60 * 1000);
        if (active === 'large_industries') return source.filter(item => item.buyerOrganization?.profile?.isLargeIndustry || item.buyerOrganization?.organizationType === 'PUBLIC_LIMITED');
        if (active === 'government') return source.filter(item => ['GOVERNMENT', 'PSU'].includes(String(item.buyerOrganization?.organizationType)));
        return source;
    }, [active, source]);

    return (
        <section className="bg-white py-12" id="buyer-requirements" aria-labelledby="buyer-requirements-heading">
            <div className="mx-auto max-w-7xl px-4">
                <div className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a6a2f]">Procurement Demand Board</p>
                        <h2 id="buyer-requirements-heading" className="mt-1 text-2xl font-black text-[#0b2447]">Buyer Requirements from Large Industries</h2>
                        <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">Open requirements from verified buyers where MSMEs can review demand and submit quotations after seller verification.</p>
                    </div>
                    <Link href="/marketplace/requirements" className="inline-flex h-10 items-center justify-center rounded-md border border-[#0b2447] px-4 text-xs font-black uppercase tracking-wide text-[#0b2447] hover:bg-[#0b2447] hover:text-white">
                        View All Requirements
                    </Link>
                </div>

                <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            type="button"
                            onClick={() => setActive(tab.id)}
                            className={`h-9 shrink-0 rounded-md border px-3 text-xs font-bold ${active === tab.id ? 'border-[#0b2447] bg-[#0b2447] text-white' : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300'}`}
                        >
                            {tab.label}
                        </button>
                    ))}
                </div>

                <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {filtered.slice(0, 6).map(requirement => <RequirementCard key={`${requirement.id}-${requirement.title}`} requirement={requirement} />)}
                </div>
            </div>
        </section>
    );
}

export function RequirementCard({ requirement }: { requirement: BuyerRequirement }) {
    const buyer = requirement.buyerOrganization;
    const lastDate = new Date(requirement.lastDate);
    const daysLeft = Math.ceil((lastDate.getTime() - Date.now()) / (24 * 60 * 60 * 1000));
    const status = requirement.status === 'OPEN' && daysLeft <= 7 ? 'Closing Soon' : requirement.status.replace(/_/g, ' ');
    const detailHref = requirement.id ? `/marketplace/requirements/${requirement.id}` : '/marketplace/requirements';

    return (
        <article className="rounded-md border border-slate-200 bg-slate-50 p-4 shadow-sm transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
            <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                        <p className="truncate text-sm font-black text-[#0b2447]">{buyer?.organizationName || 'Verified Buyer'}</p>
                        {buyer?.verificationStatus === 'VERIFIED' && (
                            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[9px] font-black uppercase text-emerald-700">
                                <BadgeCheck className="h-3 w-3" /> Verified
                            </span>
                        )}
                    </div>
                    <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{buyerTypeLabel(buyer?.organizationType)}</p>
                </div>
                <span className={`shrink-0 rounded-full px-2 py-1 text-[10px] font-black uppercase ${status === 'Closing Soon' ? 'bg-amber-50 text-amber-700 border border-amber-200' : 'bg-blue-50 text-blue-700 border border-blue-200'}`}>
                    {status}
                </span>
            </div>

            <h3 className="mt-4 text-base font-black leading-snug text-slate-950">{requirement.title}</h3>
            <div className="mt-3 grid gap-2 text-xs font-semibold text-slate-600">
                <InfoLine icon={FileText} label={requirement.category?.name || requirement.requirementType} />
                <InfoLine icon={Building2} label={`${requirement.quantity || 'Estimated'} ${requirement.unit || 'requirement'}`} />
                <InfoLine icon={MapPin} label={requirement.location || buyer?.district || 'Location to be confirmed'} />
                <InfoLine icon={Clock} label={`Last date: ${lastDate.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}`} />
            </div>

            <div className="mt-4 flex gap-2">
                <Link href={detailHref} className="flex-1 rounded-md border border-slate-200 bg-white px-3 py-2 text-center text-xs font-black text-slate-700 hover:bg-slate-100">
                    View Requirement
                </Link>
                <Link href={`${detailHref}#respond`} className="inline-flex items-center justify-center gap-1 rounded-md bg-[#0b2447] px-3 py-2 text-xs font-black text-white hover:bg-[#12335f]">
                    <Send className="h-3.5 w-3.5" /> Submit Quote
                </Link>
            </div>
        </article>
    );
}

function InfoLine({ icon: Icon, label }: { icon: any; label: string }) {
    return <span className="inline-flex items-center gap-2"><Icon className="h-3.5 w-3.5 text-[#8a6a2f]" /> {label}</span>;
}

function buyerTypeLabel(type?: string) {
    if (type === 'GOVERNMENT' || type === 'PSU') return 'Government Buyer';
    if (type === 'MSME') return 'MSME Buyer';
    if (type === 'EDUCATIONAL_INSTITUTION') return 'Institution';
    if (type === 'PUBLIC_LIMITED' || type === 'PRIVATE_LIMITED') return 'Large Scale Industry';
    return 'Private Buyer';
}
