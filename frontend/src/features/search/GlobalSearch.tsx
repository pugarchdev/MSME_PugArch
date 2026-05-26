/**
 * GlobalSearch — Cmd/Ctrl+K palette to find tenders, products, services,
 * vendors, or jump to common pages.
 *
 * Mounts in App.tsx so it's available on every authenticated page.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
    ArrowRight, FileText, Loader2, Package, Search, ShoppingCart,
    Store, X, Wrench
} from 'lucide-react';
import { useAuth } from '../../hooks/useAuth';
import { getApi } from '../shared/apiClient';

interface Result {
    id: string;
    label: string;
    secondary?: string;
    icon: any;
    href: string;
    badge?: string;
}

const QUICK_PAGES = (role: string): Result[] => {
    const all: Array<Result & { roles?: string[] }> = [
        { id: 'p:dashboard', label: 'Dashboard', icon: ArrowRight, href: '/dashboard' },
        { id: 'p:cart', label: 'My Cart', icon: ShoppingCart, href: '/cart', roles: ['buyer', 'seller'] },
        { id: 'p:approvals', label: 'Approval Queue', icon: ArrowRight, href: '/approvals', roles: ['buyer', 'seller'] },
        { id: 'p:grn', label: 'Goods Receipt Notes', icon: ArrowRight, href: '/grn', roles: ['buyer', 'seller'] },
        { id: 'p:tenders-buyer', label: 'My Tenders', icon: FileText, href: '/buyer/tenders', roles: ['buyer'] },
        { id: 'p:tenders-seller', label: 'Browse Tenders', icon: FileText, href: '/seller/tenders', roles: ['seller'] },
        { id: 'p:rfq-buyer', label: 'My RFQs', icon: FileText, href: '/buyer/rfq', roles: ['buyer'] },
        { id: 'p:rfq-seller', label: 'RFQs Received', icon: FileText, href: '/seller/rfq', roles: ['seller'] },
        { id: 'p:orders-buyer', label: 'Purchase Orders', icon: ArrowRight, href: '/buyer/orders', roles: ['buyer'] },
        { id: 'p:orders-seller', label: 'Sales Orders', icon: ArrowRight, href: '/seller/orders', roles: ['seller'] },
        { id: 'p:delivery-mgmt', label: 'Delivery Management', icon: ArrowRight, href: '/seller/delivery-management', roles: ['seller'] },
        { id: 'p:invoices-buyer', label: 'Invoices', icon: ArrowRight, href: '/buyer/invoices', roles: ['buyer'] },
        { id: 'p:invoices-seller', label: 'Invoices', icon: ArrowRight, href: '/seller/invoices', roles: ['seller'] },
        { id: 'p:disputes', label: 'Disputes', icon: ArrowRight, href: role === 'admin' ? '/admin/disputes' : `/${role}/disputes` },
        { id: 'p:messages', label: 'Messages', icon: ArrowRight, href: `/${role}/messages`, roles: ['buyer', 'seller'] },
        { id: 'p:settings-security', label: 'Security Settings', icon: ArrowRight, href: '/settings/security' },
        { id: 'p:settings-notifications', label: 'Notification Preferences', icon: ArrowRight, href: '/settings/notifications' },
        { id: 'p:team', label: 'Team Management', icon: ArrowRight, href: '/org/team', roles: ['buyer', 'seller'] }
    ];
    return all.filter(p => !p.roles || p.roles.includes(role));
};

export default function GlobalSearch() {
    const { user } = useAuth();
    const router = useRouter();
    const [open, setOpen] = useState(false);
    const [q, setQ] = useState('');
    const [activeIdx, setActiveIdx] = useState(0);
    const [results, setResults] = useState<Result[]>([]);
    const [searching, setSearching] = useState(false);
    const inputRef = useRef<HTMLInputElement>(null);

    // Cmd/Ctrl+K to open
    useEffect(() => {
        const handler = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
                e.preventDefault();
                setOpen(o => !o);
            }
            if (e.key === 'Escape' && open) {
                setOpen(false);
            }
        };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [open]);

    useEffect(() => {
        if (open) {
            setQ('');
            setActiveIdx(0);
            setTimeout(() => inputRef.current?.focus(), 50);
        }
    }, [open]);

    // Compute results: quick pages always; product/service/tender search on >= 2 chars
    const quickPages = useMemo(() => user ? QUICK_PAGES(user.role) : [], [user]);

    useEffect(() => {
        let cancelled = false;
        const run = async () => {
            const term = q.trim();
            if (!term) {
                setResults([]);
                return;
            }
            // Filter quick pages
            const lower = term.toLowerCase();
            const pageMatches = quickPages.filter(p => p.label.toLowerCase().includes(lower));

            if (term.length < 2) {
                setResults(pageMatches);
                return;
            }

            setSearching(true);
            try {
                const [products, services, tenders] = await Promise.allSettled([
                    getApi<any>(`/api/products/search?q=${encodeURIComponent(term)}&take=5`),
                    getApi<any>(`/api/services/search?q=${encodeURIComponent(term)}&take=5`),
                    user?.role === 'seller'
                        ? getApi<any>(`/api/tenders/public?q=${encodeURIComponent(term)}&take=5`)
                        : getApi<any>(`/api/tenders?q=${encodeURIComponent(term)}&take=5`)
                ]);

                const productList = extract(products, 'products', 'records');
                const serviceList = extract(services, 'services', 'records');
                const tenderList = extract(tenders, 'tenders', 'records');

                if (cancelled) return;

                const all: Result[] = [
                    ...pageMatches,
                    ...productList.slice(0, 5).map((p: any) => ({
                        id: `prd:${p.id}`,
                        label: p.name,
                        secondary: p.seller?.name || '',
                        icon: Package,
                        href: '/buyer/marketplace',
                        badge: 'PRD'
                    })),
                    ...serviceList.slice(0, 5).map((s: any) => ({
                        id: `svc:${s.id}`,
                        label: s.name,
                        secondary: s.seller?.name || '',
                        icon: Wrench,
                        href: '/buyer/marketplace',
                        badge: 'SVC'
                    })),
                    ...tenderList.slice(0, 5).map((t: any) => ({
                        id: `tnd:${t.id}`,
                        label: t.title,
                        secondary: t.tenderId,
                        icon: FileText,
                        href: user?.role === 'seller' ? '/seller/tenders' : `/buyer/tenders/${t.id}`,
                        badge: 'TND'
                    }))
                ];

                if (!cancelled) {
                    setResults(all);
                    setActiveIdx(0);
                }
            } finally {
                if (!cancelled) setSearching(false);
            }
        };
        const t = setTimeout(run, 250);
        return () => { cancelled = true; clearTimeout(t); };
    }, [q, quickPages, user?.role]);

    const handleSelect = (r: Result) => {
        router.push(r.href);
        setOpen(false);
    };

    if (!user || !open) return null;

    return (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/30 backdrop-blur-sm pt-24" onClick={() => setOpen(false)}>
            <div className="w-full max-w-xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3">
                    <Search className="h-4 w-4 text-slate-500 shrink-0" />
                    <input
                        ref={inputRef}
                        type="text"
                        value={q}
                        onChange={e => setQ(e.target.value)}
                        onKeyDown={e => {
                            if (e.key === 'ArrowDown') {
                                e.preventDefault();
                                setActiveIdx(i => Math.min(i + 1, results.length - 1));
                            } else if (e.key === 'ArrowUp') {
                                e.preventDefault();
                                setActiveIdx(i => Math.max(i - 1, 0));
                            } else if (e.key === 'Enter') {
                                e.preventDefault();
                                if (results[activeIdx]) handleSelect(results[activeIdx]);
                            }
                        }}
                        placeholder="Search tenders, products, services, pages..."
                        className="flex-1 bg-transparent outline-none text-sm font-semibold text-slate-900"
                    />
                    {searching && <Loader2 className="h-4 w-4 animate-spin text-slate-400" />}
                    <button onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-600">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="max-h-96 overflow-y-auto">
                    {results.length === 0 ? (
                        <p className="p-8 text-center text-xs font-semibold text-slate-500">
                            {q.trim() ? 'No results.' : 'Start typing to search. Press Esc to close.'}
                        </p>
                    ) : (
                        <div className="divide-y divide-slate-100">
                            {results.map((r, idx) => {
                                const active = idx === activeIdx;
                                return (
                                    <button
                                        key={r.id}
                                        type="button"
                                        onClick={() => handleSelect(r)}
                                        onMouseEnter={() => setActiveIdx(idx)}
                                        className={`w-full text-left px-4 py-2.5 flex items-center gap-3 transition ${active ? 'bg-[#12335f]/5' : ''}`}
                                    >
                                        <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${active ? 'bg-[#12335f] text-white' : 'bg-slate-100 text-slate-600'}`}>
                                            <r.icon className="h-4 w-4" />
                                        </div>
                                        <div className="min-w-0 flex-1">
                                            <p className="text-xs font-black text-slate-900 text-wrap-anywhere line-clamp-1">{r.label}</p>
                                            {r.secondary && (
                                                <p className="text-[10px] text-slate-500 text-wrap-anywhere line-clamp-1">{r.secondary}</p>
                                            )}
                                        </div>
                                        {r.badge && (
                                            <span className="inline-flex rounded border border-slate-200 bg-white px-1.5 py-0.5 text-[9px] font-black uppercase text-slate-600">
                                                {r.badge}
                                            </span>
                                        )}
                                        <ArrowRight className="h-3 w-3 text-slate-400" />
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="border-t border-slate-100 bg-slate-50 px-4 py-2 flex items-center justify-between text-[10px] font-bold text-slate-500">
                    <span>↑↓ navigate · ↵ select · esc to close</span>
                    <span>Ctrl/⌘ K to open</span>
                </div>
            </div>
        </div>
    );
}

function extract(settled: PromiseSettledResult<any>, ...keys: string[]): any[] {
    if (settled.status !== 'fulfilled') return [];
    const data = settled.value;
    if (Array.isArray(data)) return data;
    for (const k of keys) {
        if (Array.isArray(data?.[k])) return data[k];
    }
    if (Array.isArray(data?.data)) return data.data;
    return [];
}
