'use client';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuth } from '../../../hooks/useAuth';
import { useGuestCart } from '../hooks/useGuestCart';
import { MarketplaceHeader } from '../components/MarketplaceHeader';
import { MarketplaceFooter } from '../components/MarketplaceFooter';
import {
    ShoppingCart, Package, Trash2, Plus, Minus,
    ArrowRight, LogIn, Store, ChevronRight,
    Lock, Shield, ShieldCheck, X
} from 'lucide-react';

export default function GuestCartPage() {
    const { user } = useAuth();
    const router = useRouter();
    const { items, count, update, remove, clear } = useGuestCart();
    const [showCheckoutModal, setShowCheckoutModal] = useState(false);

    const total = items.reduce((sum, i) => sum + (i.price || 0) * i.quantity, 0);
    const hasPrice = items.some(i => i.price && i.price > 0);

    // Logged-in users go to the real cart
    React.useEffect(() => {
        if (user) {
            router.replace('/cart');
        }
    }, [user, router]);

    if (user) {
        return null;
    }

    return (
        <div className="min-h-dvh bg-[#f1f3f6] flex flex-col">
            <div className="brand-tricolor-strip w-full" />
            <MarketplaceHeader user={user} />

            <main className="flex-1">
                {/* Breadcrumb - Aligned to max-w-7xl */}
                <div className="bg-white border-b border-slate-100">
                    <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-2 text-[11px] text-slate-500">
                        <Link href="/" className="hover:text-[#0b2447] transition">Home</Link>
                        <ChevronRight className="h-3 w-3" />
                        <span className="text-slate-700 font-semibold">My Cart</span>
                    </div>
                </div>

                <div className="max-w-7xl mx-auto px-4 py-8 space-y-6">
                    {/* Header bar */}
                    <div className="flex items-center justify-between border-b border-slate-200 pb-3">
                        <h1 className="text-xl font-extrabold text-[#0b2447] flex items-center gap-2.5">
                            <ShoppingCart className="h-5.5 w-5.5 text-[#0b2447]" /> My Shopping Cart
                            {count > 0 && (
                                <span className="text-xs font-semibold px-2 py-0.5 bg-[#0b2447]/10 text-[#0b2447] rounded-full">
                                    {count} item{count !== 1 ? 's' : ''}
                                </span>
                            )}
                        </h1>
                        {items.length > 0 && (
                            <button
                                onClick={clear}
                                className="text-xs font-bold text-red-500 hover:text-red-700 flex items-center gap-1 transition duration-150 underline [&:not(:disabled):hover]:translate-y-0"
                            >
                                <Trash2 className="h-3.5 w-3.5" /> Clear Cart
                            </button>
                        )}
                    </div>

                    {/* Premium Login Info Banner */}
                    <div className="bg-gradient-to-r from-[#0b2447] via-[#0f2d56] to-[#174175] text-white rounded-xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-md">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                                <Shield className="h-5 w-5 text-blue-300" />
                            </div>
                            <div>
                                <p className="text-sm font-bold">Sign in to proceed with your MSME procurement</p>
                                <p className="text-xs text-white/70 mt-0.5">
                                    Your cart items will be saved in this browser session. Login or register to submit inquiries, request quotes, and place orders.
                                </p>
                            </div>
                        </div>
                        <div className="flex gap-2 shrink-0 w-full sm:w-auto">
                            <Link href="/login?returnUrl=%2Fcart" className="flex-1 sm:flex-none inline-flex justify-center items-center gap-1.5 h-9 px-4 rounded-lg bg-white text-[#0b2447] text-xs font-bold hover:bg-slate-100 transition shadow">
                                <LogIn className="h-3.5 w-3.5" /> Login
                            </Link>
                            <Link href="/buyer/register" className="flex-1 sm:flex-none inline-flex justify-center items-center gap-1.5 h-9 px-4 rounded-lg border border-white/30 bg-white/10 text-white text-xs font-bold hover:bg-white/20 transition">
                                <Store className="h-3.5 w-3.5" /> Register
                            </Link>
                        </div>
                    </div>

                    {items.length === 0 ? (
                        /* Empty state */
                        <div className="bg-white rounded-2xl border border-slate-200 py-20 text-center shadow-sm">
                            <ShoppingCart className="h-16 w-16 text-slate-200 mx-auto mb-4" />
                            <h2 className="text-lg font-extrabold text-slate-650 mb-2">Your cart is empty</h2>
                            <p className="text-sm text-slate-400 mb-6 max-w-sm mx-auto">Explore JSG Smile MSME Marketplace to add quality products or services to your procurement requirements.</p>
                            <Link href="/" className="inline-flex items-center gap-2 h-10 px-6 rounded-lg bg-[#0b2447] text-white text-xs font-bold hover:bg-[#12335f] transition shadow-md">
                                Browse Marketplace <ArrowRight className="h-3.5 w-3.5" />
                            </Link>
                        </div>
                    ) : (
                        <div className="grid lg:grid-cols-3 gap-6 items-start">
                            {/* Cart items */}
                            <div className="lg:col-span-2 space-y-4">
                                {items.map(item => (
                                    <div
                                        key={`${item.type}-${item.id}`}
                                        className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-sm p-5 flex gap-5 items-center relative hover:shadow-md transition duration-200 border-l-4 border-l-[#0b2447] group"
                                    >
                                        {/* Image */}
                                        <div className="w-24 h-24 bg-slate-50 rounded-xl overflow-hidden shrink-0 flex items-center justify-center border border-slate-100 relative group-hover:scale-[1.02] transition duration-300">
                                            {item.imageUrl ? (
                                                <img src={item.imageUrl} alt={item.name} className="w-full h-full object-contain p-1.5" />
                                            ) : (
                                                <Package className="h-10 w-10 text-slate-350" />
                                            )}
                                        </div>

                                        {/* Info */}
                                        <div className="flex-1 min-w-0 pr-4">
                                            {item.category && (
                                                <span className="inline-block text-[9px] font-black bg-[#0b2447]/6 text-[#0b2447] px-2 py-0.5 rounded uppercase tracking-wider mb-1">
                                                    {item.category}
                                                </span>
                                            )}
                                            <h3 className="text-sm font-bold text-slate-800 hover:text-[#0b2447] transition line-clamp-2 leading-snug">
                                                {item.name}
                                            </h3>

                                            <p className="text-[10px] text-slate-400 mt-1 font-medium flex items-center gap-1">
                                                <span className="capitalize">{item.type}</span> • Verified Fulfillment • <span className="text-green-600 font-bold">In Stock</span>
                                            </p>

                                            {/* Quantity controls inline beneath the title */}
                                            <div className="flex items-center gap-4 mt-4">
                                                <div className="flex items-center h-8 rounded-lg border border-slate-300 bg-slate-50 overflow-hidden shadow-sm">
                                                    <button
                                                        onClick={() => update(item.id, item.type, item.quantity - 1)}
                                                        className="w-8 h-full flex items-center justify-center text-slate-650 hover:bg-slate-200 hover:text-[#0b2447] active:bg-slate-300 transition [&:not(:disabled):hover]:translate-y-0"
                                                        aria-label="Decrease"
                                                    >
                                                        <Minus className="h-3 w-3" />
                                                    </button>
                                                    <span className="w-8 text-center text-xs font-black text-slate-800">{item.quantity}</span>
                                                    <button
                                                        onClick={() => update(item.id, item.type, item.quantity + 1)}
                                                        className="w-8 h-full flex items-center justify-center text-slate-650 hover:bg-slate-200 hover:text-[#0b2447] active:bg-slate-300 transition [&:not(:disabled):hover]:translate-y-0"
                                                        aria-label="Increase"
                                                    >
                                                        <Plus className="h-3 w-3" />
                                                    </button>
                                                </div>

                                                <span className="text-slate-300 text-sm">|</span>

                                                <button
                                                    onClick={() => remove(item.id, item.type)}
                                                    className="text-xs font-bold text-red-500 hover:text-red-700 hover:underline flex items-center gap-1 transition duration-150 [&:not(:disabled):hover]:translate-y-0"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" /> Remove
                                                </button>
                                            </div>
                                        </div>

                                        {/* Far right price column */}
                                        <div className="text-right shrink-0 flex flex-col justify-center items-end">
                                            {item.price ? (
                                                <>
                                                    <p className="text-base font-black text-[#0b2447]">
                                                        Rs {Number(item.price * item.quantity).toLocaleString('en-IN')}
                                                    </p>
                                                    <p className="text-[10px] text-slate-400 font-medium mt-0.5">
                                                        Rs {Number(item.price).toLocaleString('en-IN')} each
                                                    </p>
                                                </>
                                            ) : (
                                                <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded border border-amber-150">
                                                    Quote Based
                                                </span>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Order summary */}
                            <div className="lg:col-span-1">
                                <div className="bg-white rounded-xl border border-slate-200 p-6 sticky top-28 space-y-5 shadow-sm">
                                    <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider pb-2 border-b border-slate-100">
                                        Price Details
                                    </h3>

                                    <div className="space-y-3 text-xs font-medium">
                                        <div className="flex justify-between text-slate-500">
                                            <span>Price ({count} item{count !== 1 ? 's' : ''})</span>
                                            <span className="font-semibold text-slate-700">
                                                {hasPrice ? `Rs ${total.toLocaleString('en-IN')}` : 'Quote required'}
                                            </span>
                                        </div>
                                        <div className="flex justify-between text-slate-500">
                                            <span>Delivery Charges</span>
                                            <span className="text-green-600 font-bold">FREE</span>
                                        </div>
                                        <div className="flex justify-between text-slate-500">
                                            <span>Platform Handling</span>
                                            <span className="text-green-600 font-bold">FREE</span>
                                        </div>
                                        {hasPrice && items.some(i => !i.price) && (
                                            <p className="text-[10px] text-amber-600 italic bg-amber-50/50 p-2 rounded border border-amber-100">+ Additional quote requests required for some items</p>
                                        )}
                                    </div>

                                    <div className="border-t border-slate-100 pt-4 space-y-4">
                                        {hasPrice && (
                                            <div className="flex justify-between items-baseline mb-4">
                                                <span className="text-sm font-bold text-slate-800">Estimated Total</span>
                                                <span className="text-xl font-black text-[#0b2447]">Rs {total.toLocaleString('en-IN')}</span>
                                            </div>
                                        )}

                                        {/* Security Banner Box */}
                                        <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 flex items-start gap-2 shadow-sm">
                                            <Lock className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                                            <div>
                                                <p className="text-[10px] font-bold text-amber-800">Authorization Required</p>
                                                <p className="text-[9px] text-amber-700 leading-normal mt-0.5">
                                                    Login is required for checkout, inquiry, request quote, or procurement continuation.
                                                </p>
                                            </div>
                                        </div>

                                        <button
                                            onClick={() => setShowCheckoutModal(true)}
                                            className="w-full h-11 bg-[#0b2447] text-white rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-[#12335f] active:scale-[0.98] transition shadow-md flex items-center justify-center gap-2"
                                        >
                                            Checkout / Submit Inquiry <ArrowRight className="h-4 w-4" />
                                        </button>

                                        <div className="grid grid-cols-2 gap-2 mt-2">
                                            <Link
                                                href="/buyer/register"
                                                className="h-9 border border-[#0b2447] text-[#0b2447] hover:bg-[#0b2447]/5 rounded-lg text-xs font-bold flex items-center justify-center transition"
                                            >
                                                Buyer Signup
                                            </Link>
                                            <Link
                                                href="/login?returnUrl=%2Fcart"
                                                className="h-9 border border-slate-200 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold flex items-center justify-center transition"
                                            >
                                                Onboarding
                                            </Link>
                                        </div>
                                    </div>

                                    {/* Security check footer */}
                                    <div className="flex items-center justify-center gap-1.5 text-[9px] text-slate-400 font-bold border-t border-slate-100 pt-3.5">
                                        <ShieldCheck className="h-4 w-4 text-slate-450 shrink-0" /> Safe & Secure MSME Transaction
                                    </div>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </main>

            <MarketplaceFooter />

            {/* Premium Authentication Checkout Modal */}
            {showCheckoutModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fadeIn">
                    <div className="bg-white rounded-2xl border border-slate-100 shadow-2xl max-w-md w-full p-6 space-y-5 animate-scaleUp relative">
                        <button
                            onClick={() => setShowCheckoutModal(false)}
                            className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-slate-100 text-slate-450 hover:text-slate-650 transition duration-150 [&:not(:disabled):hover]:translate-y-0"
                            aria-label="Close"
                        >
                            <X className="h-4 w-4" />
                        </button>

                        <div className="text-center space-y-2">
                            <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center mx-auto text-amber-600 border border-amber-100">
                                <Lock className="h-6 w-6" />
                            </div>
                            <h3 className="text-lg font-black text-slate-800">Authentication Required</h3>
                            <p className="text-xs text-slate-500 leading-relaxed max-w-sm mx-auto">
                                To proceed with your procurement checkout, request official quotes, or submit inquiries to MSME sellers, please sign in to your profile.
                            </p>
                        </div>

                        <div className="space-y-2 pt-2">
                            <Link
                                href="/login?returnUrl=%2Fcart"
                                className="block w-full text-center h-11 leading-[44px] rounded-xl bg-[#0b2447] text-white text-xs font-bold uppercase tracking-wider hover:bg-[#12335f] transition shadow-md"
                            >
                                Log In to Your Account
                            </Link>
                            <Link
                                href="/buyer/register"
                                className="block w-full text-center h-11 leading-[44px] rounded-xl border-2 border-[#0b2447] text-[#0b2447] text-xs font-bold uppercase tracking-wider hover:bg-[#0b2447] hover:text-white transition"
                            >
                                Register as a Buyer
                            </Link>
                            <button
                                onClick={() => setShowCheckoutModal(false)}
                                className="block w-full text-center h-9 text-xs font-bold text-slate-400 hover:text-slate-600 hover:underline transition duration-150 [&:not(:disabled):hover]:translate-y-0"
                            >
                                Cancel & Continue Browsing
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
