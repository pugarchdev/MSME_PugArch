'use client';
import React from 'react';
import Link from 'next/link';
import { Store, Package, FileText, Users, BarChart3, ShieldCheck, Globe, Bell } from 'lucide-react';

const benefits = [
    { icon: <Store className="h-4 w-4" />, text: 'Create verified business profile' },
    { icon: <Package className="h-4 w-4" />, text: 'Add products and services' },
    { icon: <Bell className="h-4 w-4" />, text: 'Receive buyer inquiries' },
    { icon: <FileText className="h-4 w-4" />, text: 'Participate in procurement' },
    { icon: <BarChart3 className="h-4 w-4" />, text: 'Manage product catalog' },
    { icon: <Globe className="h-4 w-4" />, text: 'Reach institutional buyers' },
    { icon: <Users className="h-4 w-4" />, text: 'Connect with government buyers' },
    { icon: <ShieldCheck className="h-4 w-4" />, text: 'Build trust with verification' },
];

export function SellerInfoSection() {
    return (
        <section className="py-10 bg-slate-50 border-y border-slate-100" aria-labelledby="seller-info-heading">
            <div className="max-w-7xl mx-auto px-4">
                <div className="grid lg:grid-cols-2 gap-8 items-center">
                    <div className="bg-white rounded-xl border border-slate-200 p-6 order-2 lg:order-1">
                        <h3 className="text-sm font-bold text-[#0b2447] mb-4">Seller Verification Requirements</h3>
                        <ul className="space-y-2.5 text-xs text-slate-600">
                            <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 shrink-0" /> Valid GST Registration (auto-verified)</li>
                            <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 shrink-0" /> PAN Card verification</li>
                            <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 shrink-0" /> Udyam Registration (for MSMEs)</li>
                            <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 shrink-0" /> Bank account details</li>
                            <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 shrink-0" /> Business address verification</li>
                            <li className="flex items-start gap-2"><span className="w-1.5 h-1.5 rounded-full bg-green-600 mt-1.5 shrink-0" /> Admin approval (if required)</li>
                        </ul>
                    </div>

                    <div className="order-1 lg:order-2">
                        <span className="text-[10px] font-bold text-[#0b2447]/60 uppercase tracking-wider">For Sellers</span>
                        <h2 id="seller-info-heading" className="text-xl font-bold text-[#0b2447] mt-1 mb-3">Seller Registration Process</h2>
                        <p className="text-sm text-slate-600 leading-relaxed mb-6">
                            Register as a seller to list your products and services, receive buyer inquiries, participate in procurement opportunities, and grow your business through the MSME marketplace.
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
                            href="/seller/register"
                            className="inline-flex items-center gap-2 h-10 px-5 rounded-lg border-2 border-[#0b2447] text-[#0b2447] text-sm font-bold hover:bg-[#0b2447] hover:text-white active:scale-95 transition"
                        >
                            Register as Seller
                        </Link>
                    </div>
                </div>
            </div>
        </section>
    );
}
