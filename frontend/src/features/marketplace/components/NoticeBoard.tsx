'use client';
import React from 'react';
import { Bell, Calendar, AlertCircle, Info, Megaphone } from 'lucide-react';
import type { MarketplaceNotice } from '../api';

const TYPE_CONFIG: Record<string, { icon: React.ReactNode; color: string }> = {
    general: { icon: <Info className="h-4 w-4" />, color: 'text-blue-600 bg-blue-50' },
    procurement: { icon: <AlertCircle className="h-4 w-4" />, color: 'text-amber-600 bg-amber-50' },
    registration: { icon: <Bell className="h-4 w-4" />, color: 'text-green-600 bg-green-50' },
    verification: { icon: <AlertCircle className="h-4 w-4" />, color: 'text-purple-600 bg-purple-50' },
    announcement: { icon: <Megaphone className="h-4 w-4" />, color: 'text-red-600 bg-red-50' },
};

interface Props { notices: MarketplaceNotice[]; }

export function NoticeBoard({ notices }: Props) {
    if (notices.length === 0) return null;

    return (
        <section className="bg-white mt-2 border-b border-slate-100">
            <div className="max-w-7xl mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-4">
                    <div>
                        <h2 className="text-sm font-bold text-[#0b2447]">Important Notices & Announcements</h2>
                        <p className="text-[10px] text-slate-500 mt-0.5">Latest updates from the portal administration</p>
                    </div>
                    <span className="text-[10px] font-bold text-slate-400 inline-flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        {new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                    </span>
                </div>

                <div className="bg-slate-50 rounded-xl border border-slate-200 divide-y divide-slate-100">
                    {notices.map(notice => {
                        const cfg = TYPE_CONFIG[notice.type] || TYPE_CONFIG.general;
                        return (
                            <div key={notice.id} className="flex items-start gap-3 p-3 sm:p-4 hover:bg-white transition">
                                <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${cfg.color}`}>
                                    {cfg.icon}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <h3 className="text-xs font-semibold text-slate-800">{notice.title}</h3>
                                    {notice.description && <p className="text-[10px] text-slate-500 mt-0.5 line-clamp-2">{notice.description}</p>}
                                    <p className="text-[9px] text-slate-400 mt-1">
                                        {new Date(notice.publishedAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                                    </p>
                                </div>
                                <span className="text-[8px] font-bold uppercase tracking-wider text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded shrink-0">
                                    {notice.type}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </section>
    );
}
