'use client';
import React from 'react';
import Link from 'next/link';
import { Search, ShoppingCart, FileText, BarChart3, Truck, Download, Users, ShieldCheck } from 'lucide-react';

const benefits = [
    { icon: <Search className="h-4 w-4" />, text: 'Access verified sellers and products' },
    { icon: <ShoppingCart className="h-4 w-4" />, text: 'Add products/services to cart' },
    { icon: <FileText className="h-4 w-4" />, text: 'Request quotations from sellers' },
    { icon: <Users className="h-4 w-4" />, text: 'Compare multiple suppliers' },
    { icon: <Truck className="h-4 w-4" />, text: 'Track orders and inquiries' },
    { icon: <BarChart3 className="h-4 w-4" />, text: 'Manage procurement workflows' },
    { icon: <Download className="h-4 w-4" />, text: 'Download reports and invoices' },
    { icon: <ShieldCheck className="h-4 w-4" />, text: 'Secure and transparent process' },
];

export function BuyerInfoSection() {
    return (
        <section className="py-10 bg-white" aria-labelledby="buyer-info-heading">
            <div className="max-w-7xl mx-auto px-4">
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                    <div>
                        <span className="text-[10px] font-bold text-[#0b2447]/60 uppercase tracking-wider">For Buyers</span>
                        <h2 id="buyer-info-heading" className="text-xl font-bold text-[#0b2447] mt-1 mb-3">Buyer Registration Process</h2>
                        <p className="text-sm text-slate-600 leading-relaxed mb-6">
                            Register as a buyer to access verified MSME sellers, browse products and services, request quotations, and manage your procurement needs through a single unified platform.
                        </p>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-6">
                            {benefits.map((b, i) => (
                                <div key={i} className="flex items-center gap-2.5 text-xs text-slate-700 font-medium">
                                    <span className="w-7 h-7 rounded-md bg-[#0b2447]/5 flex items-center justify-center text-[#0b2447] shrink-0">{b.icon}</span>
                                    {b.text}
                                </div>
                            ))}
                        </div>

                        <Link
                            href="/buyer/register"
                            className="inline-flex items-center gap-2 h-10 px-5 rounded-lg bg-[#0b2447] text-white text-sm font-bold hover:bg-[#12335f] active:scale-95 transition shadow-sm"
                        >
                            Register as Buyer
                        </Link>
                    </div>

                    <div className="bg-slate-50 rounded-xl border border-slate-200 p-6">
                        <h3 className="text-sm font-bold text-[#0b2447] mb-4">Who Can Register as Buyer?</h3>
                        <ul className="space-y-2.5 text-xs text-slate-600">
                            <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#0b2447] mt-1.5 shrink-0" /> Government departments and PSUs</li>
                            <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#0b2447] mt-1.5 shrink-0" /> Private companies and corporations</li>
                            <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#0b2447] mt-1.5 shrink-0" /> MSME organizations</li>
                            <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#0b2447] mt-1.5 shrink-0" /> Educational institutions</li>
                            <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#0b2447] mt-1.5 shrink-0" /> Trusts, societies, and NGOs</li>
                            <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-[#0b2447] mt-1.5 shrink-0" /> Any organization with valid PAN/GST</li>
                        </ul>
                    </div>
                </div>
            </div>
        </section>
    );
}
