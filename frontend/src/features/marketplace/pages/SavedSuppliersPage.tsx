'use client';

import React from 'react';
import Link from 'next/link';
import { Building2, ExternalLink, MessageSquare, Search, Trash2, Users, ShieldCheck, Mail, type LucideIcon } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { loadSavedSuppliers, removeSavedSupplier, type SavedSupplier } from '../utils/savedSuppliers';

const formatDate = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Recently saved' : date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

/* ── KpiCard ─────────────────────────────────────────── */
const KPI_COLORS: Record<string, string> = {
  blue:   'bg-blue-50 text-blue-700 ring-blue-200/60',
  green:  'bg-emerald-50 text-emerald-700 ring-emerald-200/60',
  purple: 'bg-purple-50 text-purple-700 ring-purple-200/60',
  amber:  'bg-amber-50 text-amber-700 ring-amber-200/60',
};

function KpiCard({ label, value, icon: Icon, color = 'blue' }: { label: string; value: string | number; icon: LucideIcon; color?: string }) {
  const palette = KPI_COLORS[color] ?? KPI_COLORS.blue;
  return (
    <div className={`rounded-2xl p-4 ring-1 ${palette} transition hover:scale-[1.02]`}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className="h-4 w-4 opacity-70" />
        <span className="text-[10px] font-black uppercase tracking-widest opacity-60">{label}</span>
      </div>
      <p className="text-2xl font-black">{value}</p>
    </div>
  );
}

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
        <div className="mx-auto max-w-[1560px] space-y-5 px-4 pb-12">
            {/* ── Header ── */}
            <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#12335f]">Supplier Access</p>
                <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                        <h1 className="text-2xl font-black tracking-tight text-slate-950">Saved Suppliers</h1>
                        <p className="mt-1 max-w-2xl text-sm font-semibold text-slate-500">
                            Keep verified suppliers ready for RFQ, direct purchase, and secure platform messaging.
                        </p>
                    </div>
                    <Link href="/buyer/vendors" className="inline-flex h-10 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-black uppercase tracking-wide text-[#12335f] shadow-sm hover:bg-slate-50 transition">
                        Supplier Directory
                    </Link>
                </div>
            </div>

            {/* ── KPI Cards ── */}
            <div className="grid gap-3 sm:grid-cols-3">
                <KpiCard label="Saved Suppliers" value={suppliers.length} icon={Users} color="blue" />
                <KpiCard label="Verified Records" value={suppliers.filter((s) => s.verificationStatus === 'VERIFIED').length} icon={ShieldCheck} color="green" />
                <KpiCard label="Ready for Message" value={suppliers.filter((s) => s.sellerUserId).length} icon={Mail} color="purple" />
            </div>

            {/* ── Filter Bar ── */}
            <div className="flex items-center gap-3 border-y border-slate-200 bg-slate-50/50 px-4 py-3">
                <div className="relative flex-1 max-w-md">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                        value={query}
                        onChange={(event) => setQuery(event.target.value)}
                        placeholder="Search saved suppliers..."
                        className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
                    />
                </div>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 ml-auto">
                    {filtered.length} of {suppliers.length} suppliers
                </span>
            </div>

            {/* ── Content ── */}
            {filtered.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
                    <Building2 className="mx-auto h-10 w-10 text-slate-300" />
                    <h2 className="mt-3 text-base font-black text-slate-900">No saved suppliers found</h2>
                    <p className="mx-auto mt-1 max-w-md text-sm font-semibold text-slate-500">
                        Save suppliers from product, service, or seller detail pages to keep them available here.
                    </p>
                    <Link href="/buyer/marketplace" className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-[#12335f] px-4 text-xs font-black uppercase tracking-wide text-white hover:bg-[#0b2447]">
                        Browse Marketplace
                    </Link>
                </div>
            ) : (
                <div className="grid gap-3 lg:grid-cols-2">
                    {filtered.map((supplier) => (
                        <article key={supplier.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:shadow-md transition">
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
                                <Link href={`/vendors/${supplier.id}`} className="inline-flex h-9 items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 transition">
                                    <ExternalLink className="h-3.5 w-3.5" /> View Store
                                </Link>
                                <Link
                                    href={supplier.sellerUserId ? `/buyer/messages?sellerId=${supplier.sellerUserId}&subject=${encodeURIComponent(`Supplier inquiry: ${supplier.name}`)}` : '/buyer/messages'}
                                    className="inline-flex h-9 items-center gap-2 rounded-lg bg-[#12335f] px-3 text-xs font-black text-white hover:bg-[#0b2447] transition"
                                >
                                    <MessageSquare className="h-3.5 w-3.5" /> Message
                                </Link>
                                <Button type="button" variant="outline" onClick={() => handleRemove(supplier)} className="h-9 gap-2 text-xs font-black text-red-700 hover:bg-red-50 rounded-lg">
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
