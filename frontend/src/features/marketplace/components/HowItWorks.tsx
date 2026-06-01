'use client';
import React from 'react';
import { UserPlus, ClipboardCheck, ShieldCheck, Search, ShoppingCart, FileText, Package, Store, CheckCircle } from 'lucide-react';

const buyerSteps = [
    { icon: <UserPlus className="h-5 w-5" />, title: 'Register', desc: 'Create buyer account with basic details' },
    { icon: <ClipboardCheck className="h-5 w-5" />, title: 'Onboarding', desc: 'Complete organization details and documents' },
    { icon: <ShieldCheck className="h-5 w-5" />, title: 'Verification', desc: 'Admin verifies your organization' },
    { icon: <Search className="h-5 w-5" />, title: 'Browse', desc: 'Search products and services' },
    { icon: <ShoppingCart className="h-5 w-5" />, title: 'Cart / Quote', desc: 'Add to cart or request quotation' },
    { icon: <FileText className="h-5 w-5" />, title: 'Order', desc: 'Place order or submit inquiry' },
];

const sellerSteps = [
    { icon: <UserPlus className="h-5 w-5" />, title: 'Register', desc: 'Create seller account' },
    { icon: <ClipboardCheck className="h-5 w-5" />, title: 'Onboarding', desc: 'Add GST, PAN, Udyam details' },
    { icon: <ShieldCheck className="h-5 w-5" />, title: 'Verification', desc: 'Auto + admin verification' },
    { icon: <Package className="h-5 w-5" />, title: 'Add Listings', desc: 'Add products and services' },
    { icon: <CheckCircle className="h-5 w-5" />, title: 'Approval', desc: 'Admin approves listings' },
    { icon: <Store className="h-5 w-5" />, title: 'Go Live', desc: 'Start receiving inquiries' },
];

export function HowItWorks() {
    return (
        <section className="py-10 bg-white" id="how-it-works" aria-labelledby="how-it-works-heading">
            <div className="max-w-7xl mx-auto px-4">
                <div className="text-center mb-8">
                    <h2 id="how-it-works-heading" className="text-xl font-bold text-[#0b2447]">How It Works</h2>
                    <p className="text-xs text-slate-500 mt-1">Simple steps to get started on the marketplace</p>
                </div>

                <div className="grid lg:grid-cols-2 gap-8">
                    {/* Buyer Flow */}
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
                        <h3 className="text-sm font-bold text-[#0b2447] mb-4 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#0b2447] text-white text-[10px] font-bold flex items-center justify-center">B</span>
                            Buyer Flow
                        </h3>
                        <div className="space-y-3">
                            {buyerSteps.map((step, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#0b2447] shrink-0">
                                        {step.icon}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-slate-800">{step.title}</p>
                                        <p className="text-[10px] text-slate-500">{step.desc}</p>
                                    </div>
                                    {i < buyerSteps.length - 1 && (
                                        <span className="text-slate-300 text-xs ml-auto shrink-0">→</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Seller Flow */}
                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
                        <h3 className="text-sm font-bold text-[#0b2447] mb-4 flex items-center gap-2">
                            <span className="w-6 h-6 rounded-full bg-[#0b2447] text-white text-[10px] font-bold flex items-center justify-center">S</span>
                            Seller Flow
                        </h3>
                        <div className="space-y-3">
                            {sellerSteps.map((step, i) => (
                                <div key={i} className="flex items-center gap-3">
                                    <div className="w-9 h-9 rounded-lg bg-white border border-slate-200 flex items-center justify-center text-[#0b2447] shrink-0">
                                        {step.icon}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-xs font-semibold text-slate-800">{step.title}</p>
                                        <p className="text-[10px] text-slate-500">{step.desc}</p>
                                    </div>
                                    {i < sellerSteps.length - 1 && (
                                        <span className="text-slate-300 text-xs ml-auto shrink-0">→</span>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    );
}
