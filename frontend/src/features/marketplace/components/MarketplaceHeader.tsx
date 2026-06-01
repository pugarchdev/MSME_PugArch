'use client';
import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
    Building2,
    ChevronDown,
    ChevronRight,
    Factory,
    FileText,
    HelpCircle,
    LifeBuoy,
    LogIn,
    Mail,
    Menu,
    Package,
    Phone,
    Search,
    ShieldCheck,
    ShoppingCart,
    Store,
    User,
    Wrench,
    X
} from 'lucide-react';

interface Props {
    user: any;
}

const sidebarGroups = [
    { title: 'Marketplace', icon: Package, items: [
        ['All Products', '/marketplace/products'],
        ['All Services', '/marketplace/services'],
        ['Categories', '/marketplace/products'],
        ['Featured Products', '/#products'],
        ['Featured Services', '/#services'],
        ['Cart', '/cart']
    ] },
    { title: 'Buyer Requirements', icon: FileText, items: [
        ['Large Buyer Requirements', '/marketplace/requirements?tab=large_industries'],
        ['Government Buyer Requirements', '/marketplace/requirements?tab=government'],
        ['Private Buyer Requirements', '/marketplace/requirements'],
        ['MSME Buyer Requirements', '/marketplace/requirements'],
        ['Closing Soon Requirements', '/marketplace/requirements?tab=closing_soon'],
        ['Post Requirement', '/buyer/requirements/new']
    ] },
    { title: 'Industries / Organizations', icon: Factory, items: [
        ['Large Scale Industries', '/marketplace/sellers'],
        ['Big MSMEs', '/marketplace/sellers'],
        ['Verified Buyers', '/marketplace/sellers'],
        ['Verified Sellers', '/marketplace/sellers'],
        ['Local MSMEs', '/marketplace/sellers'],
        ['Service Providers', '/marketplace/services']
    ] },
    { title: 'Procurement', icon: ShieldCheck, items: [
        ['Tender Management', '/login'],
        ['Reverse Auction', '/login'],
        ['Rate Contract', '/login'],
        ['Request Quote', '/marketplace/products'],
        ['Procurement Notices', '/#notices']
    ] },
    { title: 'Registration', icon: User, items: [
        ['Sign Up as Buyer', '/buyer/register'],
        ['Sign Up as Seller', '/seller/register'],
        ['Login', '/login']
    ] },
    { title: 'Help & Support', icon: LifeBuoy, items: [
        ['Helpdesk', '/#footer'],
        ['Grievance', '/#footer'],
        ['Contact', '/#footer'],
        ['FAQs', '/user-guide']
    ] }
].map(group => ({ ...group, items: group.items.map(([label, href]) => ({ label, href })) }));

export function MarketplaceHeader({ user }: Props) {
    const router = useRouter();
    const [showLoginMenu, setShowLoginMenu] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [openGroups, setOpenGroups] = useState<Record<string, boolean>>({ Marketplace: true, 'Buyer Requirements': true });
    const [searchQuery, setSearchQuery] = useState('');
    const loginRef = useRef<HTMLDivElement>(null);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/marketplace/products?q=${encodeURIComponent(searchQuery.trim())}`);
        }
    };

    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (loginRef.current && !loginRef.current.contains(e.target as Node)) setShowLoginMenu(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    return (
        <header className="sticky top-0 z-40 bg-white shadow-sm">
            {sidebarOpen && <div className="fixed inset-0 z-40 bg-slate-900/35 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />}
            <aside className={`fixed left-0 top-0 z-50 h-dvh w-[88vw] max-w-[390px] transform border-r border-slate-200 bg-white shadow-2xl transition-transform duration-300 ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
                <div className="brand-tricolor-strip w-full" />
                <div className="flex items-center justify-between border-b border-slate-200 p-4">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0b2447] text-sm font-black text-white">JS</div>
                        <div>
                            <p className="text-sm font-black text-[#0b2447]">JsgSmile</p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-500">MSME Marketplace</p>
                        </div>
                    </div>
                    <button onClick={() => setSidebarOpen(false)} className="flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50" aria-label="Close menu">
                        <X className="h-4 w-4" />
                    </button>
                </div>
                <div className="border-b border-slate-100 p-4">
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                        <input className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm outline-none focus:border-[#0b2447]" placeholder="Search marketplace" />
                    </div>
                </div>
                <nav className="h-[calc(100dvh-137px)] overflow-y-auto p-3">
                    {sidebarGroups.map(group => {
                        const open = openGroups[group.title] ?? false;
                        return (
                            <div key={group.title} className="mb-2 rounded-md border border-slate-100 bg-slate-50">
                                <button type="button" onClick={() => setOpenGroups(prev => ({ ...prev, [group.title]: !open }))} className="flex w-full items-center justify-between px-3 py-2 text-left text-xs font-black uppercase tracking-wide text-[#0b2447]">
                                    <span className="inline-flex items-center gap-2"><group.icon className="h-4 w-4 text-[#8a6a2f]" /> {group.title}</span>
                                    <ChevronDown className={`h-4 w-4 transition ${open ? 'rotate-180' : ''}`} />
                                </button>
                                {open && (
                                    <div className="space-y-1 border-t border-slate-100 bg-white p-2">
                                        {group.items.map(item => (
                                            <Link key={item.label} href={item.href} onClick={() => setSidebarOpen(false)} className="flex items-center justify-between rounded-md px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 hover:text-[#0b2447]">
                                                {item.label}
                                                <ChevronRight className="h-3.5 w-3.5" />
                                            </Link>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                    <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">Major Organizations</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                            {['Vedanta Limited', 'JSW', 'Tata Steel', 'Aditya Birla Group', 'NTPC', 'MCL', 'Ultratech Cement', 'Registered MSMEs'].map(name => (
                                <span key={name} className="rounded-full border border-slate-200 bg-slate-50 px-2 py-1 text-[10px] font-bold text-slate-600">{name}</span>
                            ))}
                        </div>
                    </div>
                </nav>
            </aside>

            <div className="bg-[#0b2447] text-white">
                <div className="mx-auto flex h-9 max-w-7xl items-center justify-between px-4 text-[10px] font-medium">
                    <div className="flex items-center gap-4">
                        <span className="hidden items-center gap-1.5 sm:inline-flex"><Building2 className="h-3 w-3" /> Jharsuguda District MSME Marketplace</span>
                        <a href="mailto:support@jsgsmile.in" className="hidden items-center gap-1 hover:text-white/80 md:inline-flex"><Mail className="h-3 w-3" /> support@jsgsmile.in</a>
                        <a href="tel:1800XXXXXXX" className="hidden items-center gap-1 hover:text-white/80 md:inline-flex"><Phone className="h-3 w-3" /> 1800-XXX-XXXX</a>
                    </div>
                    <span className="font-bold uppercase tracking-wide text-white/80">Last updated: {new Date().toLocaleDateString('en-IN')}</span>
                </div>
            </div>

            <nav className="border-b border-slate-200">
                <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4">
                    <div className="flex shrink-0 items-center gap-2">
                        <button onClick={() => setSidebarOpen(true)} className="flex h-10 w-10 items-center justify-center rounded-md border border-slate-200 hover:bg-slate-50" aria-label="Open menu">
                            <Menu className="h-5 w-5 text-[#0b2447]" />
                        </button>
                        <Link href="/" className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-[#0b2447]">
                                <span className="text-sm font-bold text-white">JS</span>
                            </div>
                            <div className="hidden sm:block">
                                <h1 className="text-base font-bold leading-tight text-[#0b2447]">JsgSmile</h1>
                                <p className="text-[10px] font-medium text-slate-500">MSME Marketplace Portal</p>
                            </div>
                        </Link>
                    </div>

                    <form onSubmit={handleSearch} className="hidden max-w-xl flex-1 md:block">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search products, services, sellers, requirements..."
                                className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-10 pr-20 text-sm outline-none transition focus:border-[#0b2447] focus:ring-2 focus:ring-[#0b2447]/20"
                            />
                            <button type="submit" className="absolute right-1 top-1/2 h-8 -translate-y-1/2 rounded-md bg-[#0b2447] px-3 text-[11px] font-semibold text-white hover:bg-[#12335f]">
                                Search
                            </button>
                        </div>
                    </form>

                    <div className="flex items-center gap-2">
                        {!user ? (
                            <>
                                <div className="relative" ref={loginRef}>
                                    <button onClick={() => setShowLoginMenu(!showLoginMenu)} className="inline-flex h-9 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-semibold text-slate-700 transition hover:bg-slate-50">
                                        <LogIn className="h-3.5 w-3.5" />
                                        <span className="hidden sm:inline">Login</span>
                                        <ChevronDown className="h-3 w-3" />
                                    </button>
                                    {showLoginMenu && (
                                        <div className="absolute right-0 top-full z-50 mt-1 w-44 rounded-md border border-slate-200 bg-white py-1 shadow-lg">
                                            <Link href="/login" onClick={() => setShowLoginMenu(false)} className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Building2 className="h-3.5 w-3.5 text-blue-600" /> Buyer Login</Link>
                                            <Link href="/login" onClick={() => setShowLoginMenu(false)} className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><Store className="h-3.5 w-3.5 text-green-600" /> Seller Login</Link>
                                            <div className="my-1 border-t border-slate-100" />
                                            <Link href="/login" onClick={() => setShowLoginMenu(false)} className="flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50"><User className="h-3.5 w-3.5 text-purple-600" /> Admin Login</Link>
                                        </div>
                                    )}
                                </div>
                                <Link href="/buyer/register" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0b2447] px-3 text-xs font-semibold text-white transition hover:bg-[#12335f]">
                                    <Building2 className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">Sign Up as Buyer</span>
                                </Link>
                                <Link href="/seller/register" className="inline-flex h-9 items-center gap-1.5 rounded-md border-2 border-[#0b2447] px-3 text-xs font-semibold text-[#0b2447] transition hover:bg-[#0b2447] hover:text-white">
                                    <Store className="h-3.5 w-3.5" />
                                    <span className="hidden lg:inline">Sign Up as Seller</span>
                                </Link>
                            </>
                        ) : (
                            <Link href="/dashboard" className="inline-flex h-9 items-center gap-1.5 rounded-md bg-[#0b2447] px-4 text-xs font-semibold text-white transition hover:bg-[#12335f]">
                                <User className="h-3.5 w-3.5" /> Dashboard
                            </Link>
                        )}
                        <Link href="/cart" className="relative inline-flex h-9 w-9 items-center justify-center rounded-md border border-slate-200 transition hover:bg-slate-50" aria-label="Cart">
                            <ShoppingCart className="h-4 w-4 text-slate-600" />
                        </Link>
                        <button onClick={() => window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' })} className="hidden h-9 items-center gap-1 rounded-md px-3 text-xs font-medium text-slate-600 transition hover:bg-slate-50 lg:inline-flex" aria-label="Help and Support">
                            <HelpCircle className="h-3.5 w-3.5" /> Help
                        </button>
                    </div>
                </div>
            </nav>
        </header>
    );
}
