'use client';

import React from 'react';
import Link from 'next/link';
import { Building2, ExternalLink, MessageSquare, Search, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { loadSavedSuppliers, removeSavedSupplier, type SavedSupplier } from '../utils/savedSuppliers';

const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Recently saved' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

export default function SavedSuppliersPage() {
    const [suppliers, setSuppliers] = React.useState<SavedSupplier[]>([]);
    const [query, setQuery] = React.useState('');

    const refresh = React.useCallback(() => setSuppliers(loadSavedSuppliers()), []);

    React.useEffect(() => {
        refresh();
        window.addEventListener('msme:saved-suppliers-updated', refresh);
        return () => window.removeEventListener('msme:saved-suppliers-updated', refresh);
    }, [refresh]);

    const filtered = suppliers.filter((supplier) => {
        const text = `${supplier.name} ${supplier.location || ''} ${supplier.verificationStatus || ''}`.toLowerCase();
        return text.includes(query.trim().toLowerCase());
    });

    const handleRemove = (supplier: SavedSupplier) => {
        removeSavedSupplier(supplier.id);
        refresh();
        toast.info(`${supplier.name} removed from saved suppliers`);
    };

    return (
        <div className="space-y-5">
            <div className="brand-tricolor-strip rounded-full" />
            <div className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Supplier Access</p>
                        <h1 className="mt-1 text-2xl font-black text-slate-950">Saved Suppliers</h1>
                        <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-600">
                            Keep verified suppliers ready for RFQ, direct purchase, and secure platform messaging.
                        </p>
                    </div>
                    <Link href="/buyer/vendors" className="inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wide text-[#12335f] hover:bg-slate-50">
                        Supplier Directory
                    </Link>
                </div>
            </div>

            <div className="grid gap-3 md:grid-cols-3">
                <SummaryCard label="Saved suppliers" value={String(suppliers.length)} />
                <SummaryCard label="Verified records" value={String(suppliers.filter((s) => s.verificationStatus === 'VERIFIED').length)} />
                <SummaryCard label="Ready for message" value={String(suppliers.filter((s) => s.sellerUserId).length)} />
            </div>

            <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3">
                    <Search className="h-4 w-4 text-slate-400" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search saved suppliers..."
                        className="h-full flex-1 bg-transparent text-sm font-semibold outline-none"
                    />
                </div>
            </div>

            {filtered.length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
                    <Building2 className="mx-auto h-10 w-10 text-slate-300" />
                    <h2 className="mt-3 text-base font-black text-slate-900">No saved suppliers found</h2>
                    <p className="mx-auto mt-1 max-w-md text-sm font-semibold text-slate-500">
                        Save suppliers from product, service, or seller detail pages to keep them available here.
                    </p>
                    <Link href="/buyer/marketplace" className="mt-4 inline-flex h-10 items-center justify-center rounded-md bg-[#12335f] px-4 text-xs font-black uppercase tracking-wide text-white hover:bg-[#0b2447]">
                        Browse Marketplace
                    </Link>
                </div>
            ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                    {filtered.map((supplier) => (
                        <article key={supplier.id} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
                            <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Saved {formatDate(supplier.savedAt)}</p>
                                    <h2 className="mt-1 text-base font-black text-slate-950 text-wrap-anywhere">{supplier.name}</h2>
                                    <p className="mt-1 text-xs font-semibold text-slate-500">{supplier.location || 'Location not provided'}</p>
                                </div>
                                <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[10px] font-black uppercase text-emerald-700">
                                    {supplier.verificationStatus || 'Saved'}
                                </span>
                            </div>
                            <div className="mt-4 flex flex-wrap gap-2">
                                <Link href={`/vendors/${supplier.id}`} className="inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50">
                                    <ExternalLink className="h-3.5 w-3.5" /> View Store
                                </Link>
                                <Link
                                    href={supplier.sellerUserId ? `/buyer/messages?sellerId=${supplier.sellerUserId}&subject=${encodeURIComponent(`Supplier inquiry: ${supplier.name}`)}` : '/buyer/messages'}
                                    className="inline-flex h-9 items-center gap-2 rounded-md bg-[#12335f] px-3 text-xs font-black text-white hover:bg-[#0b2447]"
                                >
                                    <MessageSquare className="h-3.5 w-3.5" /> Message
                                </Link>
                                <Button type="button" variant="outline" onClick={() => handleRemove(supplier)} className="h-9 gap-2 text-xs font-black text-red-700 hover:bg-red-50">
                                    <Trash2 className="h-3.5 w-3.5" /> Remove
                                </Button>
                            </div>
                        </article>
                    ))}
                </div>
            )}
        </div>
    );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</p>
            <p className="mt-2 text-2xl font-black text-[#12335f]">{value}</p>
        </div>
    );
}
