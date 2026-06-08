'use client';
import React from 'react';
import Link from 'next/link';
import { BadgeCheck, Building2, Factory, MapPin } from 'lucide-react';
import type { MarketplaceOrganization } from '../api';

const fallbackLarge = ['Vedanta Limited', 'JSW', 'Tata Steel', 'Aditya Birla Group'];
const fallbackMsmes = ['Registered MSMEs', 'Verified Seller Organizations', 'Service Providers', 'Local MSMEs'];

export function OrganizationShowcase({ largeIndustries, bigMsmes }: { largeIndustries: MarketplaceOrganization[]; bigMsmes: MarketplaceOrganization[] }) {
    return (
        <section className="border-y border-slate-100 bg-slate-50 py-12" id="industries">
            <div className="mx-auto max-w-7xl px-4">
                <div className="mb-6">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a6a2f]">Industry Network</p>
                    <h2 className="mt-1 text-2xl font-black text-[#0b2447]">Large Industries and Big MSMEs</h2>
                    <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">Discover verified buying organizations, anchor industries, and supplier ecosystems active on JsgSmile.</p>
                </div>
                <div className="grid gap-5 lg:grid-cols-2">
                    <OrgPanel title="Large Scale Industries" icon={Factory} organizations={largeIndustries} fallback={fallbackLarge} />
                    <OrgPanel title="Big MSMEs and Verified Suppliers" icon={Building2} organizations={bigMsmes} fallback={fallbackMsmes} />
                </div>
            </div>
        </section>
    );
}

function OrgPanel({ title, icon: Icon, organizations, fallback }: { title: string; icon: any; organizations: MarketplaceOrganization[]; fallback: string[] }) {
    const list = organizations.length > 0 ? organizations : fallback.map((name, index) => ({
        id: 0 - index,
        organizationName: name,
        organizationType: index === 0 ? 'PUBLIC_LIMITED' : 'MSME',
        verificationStatus: index < 2 ? 'VERIFIED' : 'PENDING',
        district: 'Jharsuguda'
    }));

    return (
        <div className="rounded-md border border-slate-200 bg-white p-4">
            <div className="mb-3 flex items-center gap-2">
                <span className="flex h-9 w-9 items-center justify-center rounded-md bg-[#0b2447] text-white"><Icon className="h-4 w-4" /></span>
                <h3 className="text-sm font-black text-slate-950">{title}</h3>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
                {list.slice(0, 6).map(org => (
                    <Link key={`${org.id}-${org.organizationName}`} href="/marketplace/sellers" className="rounded-md border border-slate-100 bg-slate-50 p-3 hover:border-slate-300 hover:bg-white">
                        <div className="flex items-start justify-between gap-2">
                            <p className="line-clamp-2 text-sm font-black text-[#0b2447]">{org.organizationName}</p>
                            {org.verificationStatus === 'VERIFIED' && <BadgeCheck className="h-4 w-4 shrink-0 text-emerald-600" />}
                        </div>
                        <p className="mt-1 text-[11px] font-bold uppercase tracking-wide text-slate-500">{org.organizationType.replace(/_/g, ' ')}</p>
                        <p className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500"><MapPin className="h-3 w-3" /> {org.city || org.district || org.state || 'Odisha'}</p>
                    </Link>
                ))}
            </div>
        </div>
    );
}
