'use client';
import React, { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { useAuth } from '../../../hooks/useAuth';
import { marketplaceApi, type BuyerRequirement } from '../api';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import { RequirementCard } from '../components/BuyerRequirementsSection';

const tabs = [
    ['all', 'All'],
    ['products', 'Products'],
    ['services', 'Services'],
    ['closing_soon', 'Closing Soon'],
    ['large_industries', 'Large Industries'],
    ['government', 'Government Buyers']
] as const;

export default function BuyerRequirementListPage() {
    const { user } = useAuth();
    const searchParams = useSearchParams();
    const [tab, setTab] = useState(searchParams?.get('tab') || 'all');
    const [requirements, setRequirements] = useState<BuyerRequirement[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        setLoading(true);
        marketplaceApi.getRequirements({ tab, pageSize: 24 })
            .then((data: any) => setRequirements(data.requirements || []))
            .catch(() => toast.error('Failed to load buyer requirements'))
            .finally(() => setLoading(false));
    }, [tab]);

    return (
        <div className="flex min-h-dvh flex-col bg-white">
            <div className="brand-tricolor-strip w-full" />
            <MarketplaceHeader user={user} />
            <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8">
                <div className="mb-6">
                    <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#8a6a2f]">Procurement Demand Board</p>
                    <h1 className="mt-1 text-2xl font-black text-[#0b2447]">Buyer Requirements from Large Industries</h1>
                    <p className="mt-1 max-w-2xl text-sm font-medium text-slate-600">Public users can view requirements. Verified sellers can respond and submit quotations.</p>
                </div>
                <div className="mb-5 flex gap-2 overflow-x-auto pb-1">
                    {tabs.map(([id, label]) => (
                        <button key={id} onClick={() => setTab(id)} className={`h-9 shrink-0 rounded-md border px-3 text-xs font-bold ${tab === id ? 'border-[#0b2447] bg-[#0b2447] text-white' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>{label}</button>
                    ))}
                </div>
                {loading ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{[1,2,3,4,5,6].map(i => <div key={i} className="h-64 animate-pulse rounded-md bg-slate-100" />)}</div>
                ) : (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                        {requirements.map(item => <RequirementCard key={item.id} requirement={item} />)}
                        {requirements.length === 0 && <div className="col-span-full rounded-md border border-slate-200 bg-slate-50 p-10 text-center text-sm font-semibold text-slate-500">No requirements found in this view.</div>}
                    </div>
                )}
            </main>
            <MarketplaceFooter />
        </div>
    );
}
