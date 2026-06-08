'use client';
import React from 'react';
import Link from 'next/link';
import { Mail, Phone, MapPin, ExternalLink } from 'lucide-react';

export function MarketplaceFooter() {
    return (
        <footer className="bg-[#0b2447] text-white" id="help">
            {/* Main Footer */}
            <div className="max-w-7xl mx-auto px-4 py-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    {/* About */}
                    <div>
                        <h3 className="text-sm font-bold mb-3">About JsgSmile</h3>
                        <p className="text-xs text-white/60 leading-relaxed">
                            JsgSmile is the official MSME Marketplace Portal for Jharsuguda District, providing a transparent and efficient platform for buyers and sellers to connect, trade, and grow.
                        </p>
                        <div className="mt-4 space-y-2">
                            <p className="text-[11px] text-white/50 flex items-center gap-2">
                                <MapPin className="h-3 w-3 shrink-0" /> Jharsuguda, Odisha, India
                            </p>
                            <p className="text-[11px] text-white/50 flex items-center gap-2">
                                <Mail className="h-3 w-3 shrink-0" /> support@jsgsmile.in
                            </p>
                            <p className="text-[11px] text-white/50 flex items-center gap-2">
                                <Phone className="h-3 w-3 shrink-0" /> 1800-XXX-XXXX (Toll Free)
                            </p>
                        </div>
                    </div>

                    {/* Quick Links */}
                    <div>
                        <h3 className="text-sm font-bold mb-3">Quick Links</h3>
                        <ul className="space-y-2">
                            <li><Link href="/buyer/register" className="text-xs text-white/60 hover:text-white transition">Register as Buyer</Link></li>
                            <li><Link href="/seller/register" className="text-xs text-white/60 hover:text-white transition">Register as Seller</Link></li>
                            <li><Link href="/login" className="text-xs text-white/60 hover:text-white transition">Login</Link></li>
                            <li><Link href="/marketplace/products" className="text-xs text-white/60 hover:text-white transition">Browse Products</Link></li>
                            <li><Link href="/marketplace/services" className="text-xs text-white/60 hover:text-white transition">Browse Services</Link></li>
                            <li><Link href="/marketplace/sellers" className="text-xs text-white/60 hover:text-white transition">Verified Sellers</Link></li>
                        </ul>
                    </div>

                    {/* Policies */}
                    <div>
                        <h3 className="text-sm font-bold mb-3">Policies</h3>
                        <ul className="space-y-2">
                            <li><Link href="#terms" className="text-xs text-white/60 hover:text-white transition">Terms & Conditions</Link></li>
                            <li><Link href="#privacy" className="text-xs text-white/60 hover:text-white transition">Privacy Policy</Link></li>
                            <li><Link href="#accessibility" className="text-xs text-white/60 hover:text-white transition">Accessibility Statement</Link></li>
                            <li><Link href="#disclaimer" className="text-xs text-white/60 hover:text-white transition">Disclaimer</Link></li>
                            <li><Link href="#sitemap" className="text-xs text-white/60 hover:text-white transition">Sitemap</Link></li>
                        </ul>
                    </div>

                    {/* Helpdesk */}
                    <div>
                        <h3 className="text-sm font-bold mb-3">Helpdesk & Support</h3>
                        <ul className="space-y-2">
                            <li><Link href="#help" className="text-xs text-white/60 hover:text-white transition">Help Center</Link></li>
                            <li><Link href="#faq" className="text-xs text-white/60 hover:text-white transition">FAQs</Link></li>
                            <li><Link href="#grievance" className="text-xs text-white/60 hover:text-white transition">Grievance Redressal</Link></li>
                            <li><Link href="#feedback" className="text-xs text-white/60 hover:text-white transition">Feedback</Link></li>
                            <li><Link href="/user-guide" className="text-xs text-white/60 hover:text-white transition">User Guide</Link></li>
                        </ul>
                        <div className="mt-4 p-3 rounded-lg bg-white/5 border border-white/10">
                            <p className="text-[10px] font-bold text-white/80 uppercase tracking-wider mb-1">Helpline</p>
                            <p className="text-sm font-bold text-white">1800-XXX-XXXX</p>
                            <p className="text-[10px] text-white/50 mt-0.5">Mon-Sat, 9:00 AM - 6:00 PM</p>
                        </div>
                    </div>
                </div>
            </div>

            {/* Bottom Bar */}
            <div className="border-t border-white/10">
                <div className="max-w-7xl mx-auto px-4 py-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                    <p className="text-[10px] text-white/40 text-center sm:text-left">
                        © {new Date().getFullYear()} JsgSmile - Jharsuguda Synergy for MSME and Industry Linkage Ecosystem. All Rights Reserved.
                    </p>
                    <p className="text-[10px] text-white/40">
                        Last Updated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </p>
                </div>
            </div>

            {/* Tricolor Strip at bottom */}
            <div className="brand-tricolor-strip w-full" />
        </footer>
    );
}
