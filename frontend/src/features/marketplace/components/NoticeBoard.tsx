'use client';
import React from 'react';
import { Bell, Calendar, AlertCircle, Info } from 'lucide-react';
import type { MarketplaceNotice } from '../api';

const typeIcons: Record<string, React.ReactNode> = {
    general: <Info className="h-4 w-4 text-blue-600" />,
    procurement: <AlertCircle className="h-4 w-4 text-amber-600" />,
    registration: <Bell className="h-4 w-4 text-green-600" />,
    verification: <AlertCircle className="h-4 w-4 text-purple-600" />,
};

const defaultNotices: MarketplaceNotice[] = [
    { id: 1, title: 'New seller registrations are now open for Jharsuguda District', type: 'registration', description: 'All MSMEs in Jharsuguda can now register on the portal.', publishedAt: new Date().toISOString() },
    { id: 2, title: 'GST verification is mandatory for all sellers', type: 'verification', description: 'Sellers must complete GST verification before listing products.', publishedAt: new Date().toISOString() },
    { id: 3, title: 'Buyer organizations can now request quotations online', type: 'procurement', description: 'Use the Request Quote feature to get competitive pricing.', publishedAt: new Date().toISOString() },
];

interface Props {
    notices: MarketplaceNotice[];
}

export function NoticeBoard({ notices }: Props) {
    const items = notices.length > 0 ? notices : defaultNotices;

    return (
        <section className="py-10 bg-white" aria-labelledby="notices-heading">
            <div className="max-w-7xl mx-auto px-4">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 id="notices-heading" className="text-lg font-bold text-[#0b2447]">Important Notices & Announcements</h2>
                        <p className="text-xs text-slate-500 mt-0.5">Latest updates from the portal administration</p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        <Calendar className="h-3 w-3 inline mr-1" />
                        Updated: {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                </div>

                <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-200">
                    {items.map(notice => (
                        <div key={notice.id} className="flex items-start gap-3 p-4 hover:bg-white transition">
                            <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 mt-0.5">
                                {typeIcons[notice.type] || typeIcons.general}
                            </div>
                            <div className="min-w-0 flex-1">
                                <h3 className="text-sm font-semibold text-slate-800">{notice.title}</h3>
                                {notice.description && (
                                    <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{notice.description}</p>
                                )}
                                <p className="text-[10px] text-slate-400 mt-1">
                                    {new Date(notice.publishedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                </p>
                            </div>
                            <span className="text-[9px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-2 py-0.5 rounded shrink-0">
                                {notice.type}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </section>
    );
}
