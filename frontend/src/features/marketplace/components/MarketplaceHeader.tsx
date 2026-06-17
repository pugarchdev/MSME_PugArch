'use client';
import React, { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { useGuestCart } from '../hooks/useGuestCart';
import {
    Search, ShoppingCart, User, Phone, Mail, Globe,
    HelpCircle, LogIn, Store, Building2, ChevronDown,
    Sun, Moon, Menu, X
} from 'lucide-react';

interface Props { user: any; }

const signupOptions = [
    { href: '/seller/register', label: 'Sign Up as Seller', icon: <Store className="h-4 w-4" /> },
    { href: '/buyer/register', label: 'Sign Up as Buyer', icon: <Building2 className="h-4 w-4" /> },
    { href: '/hershg/register', label: 'Sign Up as SHG', icon: <User className="h-4 w-4" /> }
];

function SignupMenu({ onSelect }: { onSelect: () => void }) {
    return (
        <div className="absolute right-0 top-full z-50 mt-2 w-56 overflow-hidden rounded-xl border border-slate-200 bg-white py-2 shadow-xl" role="menu">
            {signupOptions.map(option => (
                <Link
                    key={option.href}
                    href={option.href}
                    onClick={onSelect}
                    className="flex items-center gap-2.5 px-3 py-2.5 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
                    role="menuitem"
                >
                    <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#0b2447]/5 text-[#0b2447]">{option.icon}</span>
                    {option.label}
                </Link>
            ))}
        </div>
    );
}

/* ── Persisted font-size ─────────────────────────────────────────────────── */
function useFontSize() {
    const [size, setSize] = useState(100);

    useEffect(() => {
        const saved = Number(localStorage.getItem('jsg_font_size') || 100);
        setSize(saved);
        document.documentElement.style.fontSize = `${saved}%`;
    }, []);

    const adjust = useCallback((delta: number) => {
        setSize(prev => {
            const next = Math.max(80, Math.min(130, prev + delta));
            document.documentElement.style.fontSize = `${next}%`;
            localStorage.setItem('jsg_font_size', String(next));
            return next;
        });
    }, []);

    const reset = useCallback(() => {
        setSize(100);
        document.documentElement.style.fontSize = '100%';
        localStorage.setItem('jsg_font_size', '100');
    }, []);

    return { size, adjust, reset };
}

/* ── Persisted high-contrast ─────────────────────────────────────────────── */
function useContrast() {
    const [on, setOn] = useState(false);

    useEffect(() => {
        const saved = localStorage.getItem('jsg_high_contrast') === 'true';
        setOn(saved);
        if (saved) document.documentElement.classList.add('high-contrast');
    }, []);

    const toggle = useCallback(() => {
        setOn(prev => {
            const next = !prev;
            next
                ? document.documentElement.classList.add('high-contrast')
                : document.documentElement.classList.remove('high-contrast');
            localStorage.setItem('jsg_high_contrast', String(next));
            return next;
        });
    }, []);

    return { on, toggle };
}

export function MarketplaceHeader({ user }: Props) {
    const router = useRouter();
    const { size, adjust, reset } = useFontSize();
    const { on: highContrast, toggle: toggleContrast } = useContrast();
    const { count: cartCount } = useGuestCart();

    const [searchQ, setSearchQ] = useState('');
    const [showLogin, setShowLogin] = useState(false);
    const [showSignup, setShowSignup] = useState(false);
    const [showLang, setShowLang] = useState(false);
    const [mobileOpen, setMobileOpen] = useState(false);

    const loginRef = useRef<HTMLDivElement>(null);
    const signupRef = useRef<HTMLDivElement>(null);
    const langRef = useRef<HTMLDivElement>(null);

    /* Close dropdowns on outside click */
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (loginRef.current && !loginRef.current.contains(e.target as Node)) setShowLogin(false);
            if (signupRef.current && !signupRef.current.contains(e.target as Node)) setShowSignup(false);
            if (langRef.current && !langRef.current.contains(e.target as Node)) setShowLang(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const handleSearch = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQ.trim()) router.push(`/marketplace/products?q=${encodeURIComponent(searchQ.trim())}`);
    };

    /* Utility-bar buttons share this style — we override the global hover
       translate so they don't fly out of the 36px bar. */
    const utilBtn =
        'inline-flex items-center justify-center rounded text-white ' +
        'hover:bg-white/15 active:bg-white/25 transition-colors ' +
        // ↓ cancel the global translate-y hover from index.css
        '[&:not(:disabled):hover]:translate-y-0 [&:not(:disabled):hover]:filter-none';

    return (
        <header className="sticky top-0 z-40 bg-white shadow-sm">

            {/* ════════════════════════════════════════════════════════════════════
          TOP UTILITY BAR  (navy, 36 px)
          Left  : portal name · email · phone
          Right : A- A A+ · contrast · language
          ════════════════════════════════════════════════════════════════════ */}
            <div className="bg-[#0b2447] text-white marketplace-util-bar" style={{ height: 36 }}>
                <div className="mx-auto flex h-full max-w-[1680px] items-center justify-between px-4 sm:px-6 2xl:px-8">

                    {/* Left */}
                    <div className="flex items-center gap-4 overflow-hidden text-[10px] font-medium">
                        <span className="hidden sm:inline-flex items-center gap-1.5 shrink-0 text-white/90">
                            <Building2 className="h-3 w-3 opacity-60 shrink-0" />
                            Jharsuguda District MSME Marketplace
                        </span>
                        <a
                            href="mailto:support@jsgsmile.in"
                            className="hidden md:inline-flex items-center gap-1 text-white/65 hover:text-white transition-colors"
                        >
                            <Mail className="h-3 w-3 shrink-0" />
                            support@jsgsmile.in
                        </a>
                        <a
                            href="tel:18001234567"
                            className="hidden lg:inline-flex items-center gap-1 text-white/65 hover:text-white transition-colors"
                        >
                            <Phone className="h-3 w-3 shrink-0" />
                            1800-123-4567
                        </a>
                    </div>

                    {/* Right */}
                    <div className="flex items-center gap-0 shrink-0">

                        {/* ── High-contrast toggle ───────────────────────────── */}
                        <button
                            onClick={toggleContrast}
                            title={highContrast ? 'Disable high contrast' : 'Enable high contrast'}
                            aria-label="Toggle high contrast"
                            className={`${utilBtn} h-6 w-6 border-r border-white/20 mr-2`}
                        >
                            {highContrast
                                ? <Sun className="h-3 w-3" />
                                : <Moon className="h-3 w-3" />}
                        </button>

                        {/* ── Language selector ─────────────────────────────── */}
                        {/* <div className="relative" ref={langRef}>
                            <button
                                onClick={() => { setShowLang(v => !v); setShowLogin(false); }}
                                className={`${utilBtn} h-6 px-2 gap-1 text-[10px] font-medium`}
                            >
                                <Globe className="h-3 w-3 opacity-70 shrink-0" />
                                <span className="hidden sm:inline">English</span>
                                <ChevronDown className="h-2.5 w-2.5 opacity-60 shrink-0" />
                            </button>

                            {showLang && (
                                <div className="absolute right-0 top-full mt-1 w-32 bg-white border border-slate-200 rounded-lg shadow-xl py-1 z-50">
                                    {(['English', 'हिन्दी', 'ଓଡ଼ିଆ'] as const).map((lang, i) => (
                                        <button
                                            key={lang}
                                            onClick={() => setShowLang(false)}
                                            className={
                                                'w-full text-left px-3 py-2 text-[11px] font-medium transition-colors ' +
                                                '[&:not(:disabled):hover]:translate-y-0 [&:not(:disabled):hover]:filter-none ' +
                                                (i === 0
                                                    ? 'bg-slate-50 text-[#0b2447] font-bold'
                                                    : 'text-slate-600 hover:bg-slate-50')
                                            }
                                        >
                                            {lang}
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div> */}
                    </div>
                </div>
            </div>

            {/* ════════════════════════════════════════════════════════════════════
          MAIN NAVBAR  (white, 64 px)
          [Logo]  [Search bar──────────────────]  [Login][Buyer][Seller][Cart][Help]
          ════════════════════════════════════════════════════════════════════ */}
            <nav className="border-b border-slate-100 bg-white" aria-label="Main navigation">
                <div className="mx-auto flex h-16 max-w-[1680px] items-center gap-3 px-4 sm:px-6 2xl:px-8">

                    {/* Logo ── always visible */}
                    <Link href="/" className="flex items-center gap-2.5 shrink-0">
                        <div className="w-10 h-10 rounded-lg bg-white flex items-center justify-center overflow-hidden shrink-0 p-0.5 shadow-sm border border-slate-200 transition-all hover:scale-105">
                            <img src="/logoo.png" alt="SMiLE MSME Logo" className="w-full h-full object-contain" />
                        </div>
                        <div className="hidden sm:block leading-none">
                            <p className="text-sm font-black text-[#0b2447]">JsgSmile</p>
                            <p className="text-[9px] text-slate-400 font-medium mt-0.5">MSME Marketplace Portal</p>
                        </div>
                    </Link>

                    {/* Search bar ── grows to fill space, hidden on mobile */}
                    <form onSubmit={handleSearch} className="hidden md:flex flex-1 min-w-0 items-center h-10 rounded-lg border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-[#0b2447]/20 focus-within:border-[#0b2447] transition-colors overflow-hidden">
                        <Search className="h-4 w-4 text-slate-400 shrink-0 ml-3 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQ}
                            onChange={e => setSearchQ(e.target.value)}
                            placeholder="Search products, services, sellers…"
                            className="flex-1 min-w-0 h-full bg-transparent text-sm pl-2 pr-1 outline-none"
                        />
                        <button
                            type="submit"
                            className="h-full px-4 rounded-none bg-[#0b2447] text-white text-[11px] font-bold hover:bg-[#12335f] transition-colors shrink-0 [&:not(:disabled):hover]:translate-y-0 [&:not(:disabled):hover]:filter-none"
                        >
                            Search
                        </button>
                    </form>

                    {/* Mobile spacer */}
                    <div className="flex-1 md:hidden" />

                    {/* Right action cluster */}
                    <div className="flex items-center gap-1.5 shrink-0">

                        {!user ? (
                            <>
                                {/* Login dropdown */}
                                <div className="relative" ref={loginRef}>
                                    <button
                                        onClick={() => { setShowLogin(v => !v); setShowLang(false); }}
                                        className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 active:scale-95 transition-colors [&:not(:disabled):hover]:translate-y-0"
                                    >
                                        <LogIn className="h-3.5 w-3.5 shrink-0" />
                                        <span className="hidden sm:inline">Login</span>
                                        <ChevronDown className="h-3 w-3 opacity-50 shrink-0" />
                                    </button>

                                    {showLogin && (
                                        <div className="absolute right-0 top-[calc(100%+4px)] w-44 bg-white border border-slate-200 rounded-xl shadow-xl py-1.5 z-50">
                                            <p className="px-3 pb-1 text-[9px] font-bold text-slate-400 uppercase tracking-widest">
                                                Sign in as
                                            </p>
                                            {[
                                                { href: '/login', label: 'Buyer Login', icon: <Building2 className="h-3 w-3 text-blue-600" />, bg: 'bg-blue-50' },
                                                { href: '/login', label: 'Seller Login', icon: <Store className="h-3 w-3 text-green-600" />, bg: 'bg-green-50' },
                                                { href: '/login', label: 'SHG Login', icon: <User className="h-3 w-3 text-emerald-600" />, bg: 'bg-emerald-50' },
                                            ].map(item => (
                                                <Link
                                                    key={item.label}
                                                    href={item.href}
                                                    onClick={() => setShowLogin(false)}
                                                    className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                                                >
                                                    <span className={`w-5 h-5 rounded-full ${item.bg} flex items-center justify-center shrink-0`}>
                                                        {item.icon}
                                                    </span>
                                                    {item.label}
                                                </Link>
                                            ))}
                                            <div className="border-t border-slate-100 my-1" />
                                            <Link
                                                href="/login"
                                                onClick={() => setShowLogin(false)}
                                                className="flex items-center gap-2.5 px-3 py-2 text-xs font-medium text-slate-500 hover:bg-slate-50 transition-colors"
                                            >
                                                <span className="w-5 h-5 rounded-full bg-purple-50 flex items-center justify-center shrink-0">
                                                    <User className="h-3 w-3 text-purple-600" />
                                                </span>
                                                Admin Login
                                            </Link>
                                        </div>
                                    )}
                                </div>

                                {/* Sign Up dropdown */}
                                <div ref={signupRef} className="relative hidden sm:block">
                                    <button
                                        type="button"
                                        onClick={() => setShowSignup(v => !v)}
                                        className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#0b2447] px-3 text-xs font-semibold text-white transition-colors hover:bg-[#12335f] active:scale-95 [&:not(:disabled):hover]:translate-y-0"
                                        aria-haspopup="menu"
                                        aria-expanded={showSignup}
                                    >
                                        <User className="h-3.5 w-3.5 shrink-0" />
                                        Sign Up
                                        <ChevronDown className={`h-3 w-3 transition-transform ${showSignup ? 'rotate-180' : ''}`} />
                                    </button>
                                    {showSignup && <SignupMenu onSelect={() => setShowSignup(false)} />}
                                </div>
                            </>
                        ) : (
                            /* Dashboard (logged in) */
                            <Link
                                href="/dashboard"
                                className="inline-flex items-center gap-1.5 h-9 px-4 rounded-lg bg-[#0b2447] text-white text-xs font-semibold hover:bg-[#12335f] active:scale-95 transition-colors"
                            >
                                <User className="h-3.5 w-3.5 shrink-0" />
                                Dashboard
                            </Link>
                        )}

                        {/* Cart — shows badge count, routes to guest cart or real cart */}
                        <button
                            onClick={() => {
                                if (user) {
                                    router.push('/cart');
                                } else {
                                    router.push('/marketplace/cart');
                                }
                            }}
                            className="relative inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 active:scale-95 transition-colors [&:not(:disabled):hover]:translate-y-0"
                            aria-label={`Cart${cartCount > 0 ? ` (${cartCount} items)` : ''}`}
                        >
                            <ShoppingCart className="h-4 w-4 text-slate-600" />
                            {cartCount > 0 && (
                                <span className="absolute -right-2 -top-2 z-10 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#ef4444] px-1.5 text-[10px] font-black leading-none text-white shadow-sm ring-2 ring-white tabular-nums">
                                    {cartCount > 99 ? '99+' : cartCount}
                                </span>
                            )}
                        </button>

                        {/* Help (desktop) */}
                        <button
                            onClick={() => document.getElementById('help')?.scrollIntoView({ behavior: 'smooth' })}
                            className="hidden lg:inline-flex items-center gap-1.5 h-9 px-3 rounded-lg text-xs font-medium text-slate-600 bg-white hover:bg-slate-50 active:scale-95 transition-colors [&:not(:disabled):hover]:translate-y-0"
                        >
                            <HelpCircle className="h-3.5 w-3.5 shrink-0" />
                            Help
                        </button>

                        {/* Mobile hamburger */}
                        <button
                            onClick={() => setMobileOpen(v => !v)}
                            className="sm:hidden inline-flex items-center justify-center h-9 w-9 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 transition-colors [&:not(:disabled):hover]:translate-y-0"
                            aria-label={mobileOpen ? 'Close menu' : 'Open menu'}
                        >
                            {mobileOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
                        </button>
                    </div>
                </div>

                {/* ── Mobile search bar ── */}
                <div className="md:hidden px-4 pb-3 pt-0">
                    <form onSubmit={handleSearch} className="flex items-center h-10 rounded-lg border border-slate-200 bg-slate-50 focus-within:ring-2 focus-within:ring-[#0b2447]/20 focus-within:border-[#0b2447] transition-colors overflow-hidden">
                        <Search className="h-4 w-4 text-slate-400 shrink-0 ml-3 pointer-events-none" />
                        <input
                            type="text"
                            value={searchQ}
                            onChange={e => setSearchQ(e.target.value)}
                            placeholder="Search products, services…"
                            className="flex-1 min-w-0 h-full bg-transparent text-sm pl-2 pr-1 outline-none"
                        />
                        <button
                            type="submit"
                            className="h-full px-4 rounded-none bg-[#0b2447] text-white text-[11px] font-bold hover:bg-[#12335f] transition-colors shrink-0 [&:not(:disabled):hover]:translate-y-0 [&:not(:disabled):hover]:filter-none"
                        >
                            Search
                        </button>
                    </form>
                </div>

                {/* ── Mobile expanded menu ── */}
                {mobileOpen && (
                    <div className="sm:hidden border-t border-slate-100 bg-white px-4 py-3 space-y-2.5">
                        {!user ? (
                            <>
                                <div className="rounded-xl border border-slate-200 bg-slate-50 p-2">
                                    <p className="mb-2 flex items-center justify-center gap-2 rounded-lg bg-[#0b2447] px-4 py-2.5 text-xs font-semibold text-white">
                                        <User className="h-4 w-4" /> Sign Up
                                    </p>
                                    <div className="grid gap-2">
                                        {signupOptions.map(option => (
                                            <Link
                                                key={option.href}
                                                href={option.href}
                                                onClick={() => setMobileOpen(false)}
                                                className="flex items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700"
                                            >
                                                {option.icon}
                                                {option.label}
                                            </Link>
                                        ))}
                                    </div>
                                </div>
                                <Link
                                    href="/login"
                                    onClick={() => setMobileOpen(false)}
                                    className="flex items-center justify-center gap-2 h-10 px-4 rounded-lg border border-slate-200 text-slate-700 text-xs font-semibold w-full"
                                >
                                    <LogIn className="h-4 w-4" /> Login
                                </Link>
                            </>
                        ) : (
                            <Link
                                href="/dashboard"
                                onClick={() => setMobileOpen(false)}
                                className="flex items-center justify-center gap-2 h-10 px-4 rounded-lg bg-[#0b2447] text-white text-xs font-semibold w-full"
                            >
                                <User className="h-4 w-4" /> Go to Dashboard
                            </Link>
                        )}
                    </div>
                )}
            </nav>
        </header>
    );
}
