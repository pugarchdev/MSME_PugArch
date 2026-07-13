'use client';

import React, { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { api, unwrapApiData } from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';
import {
    ArrowLeft, Award, Info, CheckCircle2, AlertTriangle, Star,
    X, Printer, Users, Eye, Download, Shield
} from 'lucide-react';
import { formatCurrency, formatDateTime, formatRelative } from '../../shared/format';
import { Badge } from '../../../components/ui/card';
import { toast } from 'sonner';

function StatusBadgeInline({ label, className }: { label: string; className?: string }) {
    const tone: Record<string, string> = {
        SUBMITTED: 'border-blue-200 bg-blue-50 text-blue-700',
        ACCEPTED: 'border-emerald-200 bg-emerald-50 text-emerald-700',
        REJECTED: 'border-red-200 bg-red-50 text-red-700',
        EXPIRED: 'border-orange-200 bg-orange-50 text-orange-700',
        WITHDRAWN: 'border-slate-200 bg-slate-100 text-slate-500',
        DRAFT: 'border-slate-200 bg-slate-100 text-slate-500',
    };
    return (
        <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[10px] font-black uppercase ${tone[label] || tone.SUBMITTED} ${className || ''}`}>
            {label}
        </span>
    );
}

function money(v: number | string | null | undefined) {
    const n = Number(v || 0);
    if (!Number.isFinite(n) || n === 0) return '—';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);
}

const parsePriceBreakup = (notes: string | null | undefined) => {
    if (!notes) return null;
    const lines = notes.split('\n');
    const breakupLine = lines.find(l => l.startsWith('Price breakup:'));
    if (!breakupLine) return null;
    const parts = breakupLine.replace('Price breakup: ', '').replace(/\.$/, '').split(';').map(s => s.trim());
    const result: Record<string, string> = {};
    for (const part of parts) {
        if (part.includes(' - ')) {
            const idx = part.indexOf(' - ');
            result[part.substring(0, idx).trim()] = part.substring(idx + 3).trim();
        } else if (part.toLowerCase().includes(' rs. ')) {
            const idx = part.toLowerCase().indexOf(' rs. ');
            result[part.substring(0, idx).trim()] = part.substring(idx).trim();
        } else {
            result[part] = part;
        }
    }
    return result;
};

const extractCustomNotes = (notes: string | null | undefined) => {
    if (!notes) return '';
    return notes.split('\n').filter(l => !l.startsWith('Price breakup:')).join('\n').trim();
};

const getDeliveryDays = (d: number | null | undefined) => d || Infinity;

const getWarrantyMonths = (w: string | null | undefined) => {
    if (!w) return 0;
    const match = String(w).match(/(\d+)/);
    if (!match) return 0;
    const val = Number(match[1]);
    if (String(w).toLowerCase().includes('year')) return val * 12;
    return val;
};

const RANK_META: Record<number, { label: string; emoji: string; colorClass: string }> = {
    1: { label: 'L1', emoji: '🟢', colorClass: 'text-emerald-800 bg-emerald-100 border-emerald-200' },
    2: { label: 'L2', emoji: '🟡', colorClass: 'text-amber-800 bg-amber-100 border-amber-200' },
    3: { label: 'L3', emoji: '🟠', colorClass: 'text-orange-800 bg-orange-100 border-orange-200' },
};

function RankBadge({ rank, isDisqualified }: { rank: number | null; isDisqualified?: boolean }) {
    if (isDisqualified) {
        return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase text-red-800 bg-red-100 border-red-200`}><span>❌</span><span>Disqualified</span></span>;
    }
    if (rank && RANK_META[rank]) {
        const m = RANK_META[rank];
        return <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase ${m.colorClass}`}><span>{m.emoji}</span><span>{m.label}</span></span>;
    }
    return <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-black uppercase text-slate-400 bg-slate-100 border-slate-200"><span>⚪</span><span>—</span></span>;
}

export default function RfqComparisonPage({ id: propId }: { id?: number }) {
    const router = useRouter();
    const { token, user } = useAuth();
    const queryClient = useQueryClient();

    const [activeTab, setActiveTab] = useState<'l1' | 'matrix'>('l1');
    const [sortBy, setSortBy] = useState('lowest-price');
    const [filterStatus, setFilterStatus] = useState('all');
    const [awardModal, setAwardModal] = useState<{
        show: boolean; responseId: number; sellerName: string; amount: number; rank: number; confirmed: boolean; remarks: string;
    }>({ show: false, responseId: 0, sellerName: '', amount: 0, rank: 999, confirmed: false, remarks: '' });

    const authHeaders = useMemo(() => {
        const h: Record<string, string> = {};
        if (token) h.Authorization = `Bearer ${token}`;
        return h;
    }, [token]);

    const { data, isLoading, error, refetch } = useQuery({
        queryKey: ['quote-request-compare', propId],
        queryFn: async () => {
            const res = await api.fetch(`/api/quote-requests/${propId}/responses/compare`, { headers: authHeaders });
            if (!res.ok) throw new Error('Failed to fetch comparison data');
            const json = await res.json();
            return unwrapApiData<any>(json);
        },
        enabled: !!propId && !!token
    });

    const acceptMut = useMutation({
        mutationFn: async ({ responseId, title }: { responseId: number; title: string }) => {
            const res = await api.fetch(`/api/quote-responses/${responseId}/accept`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ title })
            });
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Accept failed'); }
            return res.json();
        },
        onSuccess: () => { toast.success('Quotation accepted and PO generated!'); setAwardModal(s => ({ ...s, show: false })); refetch(); queryClient.invalidateQueries({ queryKey: ['quote-requests'] }); },
        onError: (e: any) => { toast.error(e.message || 'Failed to accept'); }
    });

    const rejectMut = useMutation({
        mutationFn: async (responseId: number) => {
            const res = await api.fetch(`/api/quote-responses/${responseId}/reject`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({})
            });
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Reject failed'); }
            return res.json();
        },
        onSuccess: () => { toast.success('Quotation rejected'); refetch(); queryClient.invalidateQueries({ queryKey: ['quote-requests'] }); },
        onError: (e: any) => { toast.error(e.message || 'Failed to reject'); }
    });

    const techEvalMut = useMutation({
        mutationFn: async ({ responseId, status, remarks }: { responseId: number; status: string; remarks?: string }) => {
            const res = await api.fetch(`/api/quote-responses/${responseId}/technical-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ status, remarks })
            });
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Evaluation failed'); }
            return res.json();
        },
        onSuccess: () => { toast.success('Technical evaluation updated'); refetch(); },
        onError: (e: any) => { toast.error(e.message || 'Evaluation failed'); }
    });

    const finEvalMut = useMutation({
        mutationFn: async ({ responseId, status, remarks }: { responseId: number; status: string; remarks?: string }) => {
            const res = await api.fetch(`/api/quote-responses/${responseId}/financial-status`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ status, remarks })
            });
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'Evaluation failed'); }
            return res.json();
        },
        onSuccess: () => { toast.success('Financial evaluation updated'); refetch(); },
        onError: (e: any) => { toast.error(e.message || 'Evaluation failed'); }
    });

    const generateL1Mut = useMutation({
        mutationFn: async () => {
            const res = await api.fetch(`/api/quote-requests/${propId}/generate-l1`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders },
                body: JSON.stringify({ techQualifiedOnly: true })
            });
            if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e?.error || 'L1 generation failed'); }
            return res.json();
        },
        onSuccess: () => { toast.success('L1 rankings generated!'); refetch(); },
        onError: (e: any) => { toast.error(e.message || 'L1 generation failed'); }
    });

    const qr = data?.quoteRequest;
    const rawResponses: any[] = data?.responses || [];
    const highlights = data?.highlights || {};

    const filteredAndSorted = useMemo(() => {
        let items = [...rawResponses];
        if (filterStatus !== 'all') {
            items = items.filter(r => {
                const s = String(r.status || '').toUpperCase();
                if (filterStatus === 'submitted') return s === 'SUBMITTED';
                if (filterStatus === 'accepted') return s === 'ACCEPTED';
                if (filterStatus === 'rejected') return s === 'REJECTED';
                if (filterStatus === 'pending-review') return s === 'SUBMITTED';
                return true;
            });
        }
        items.sort((a, b) => {
            if (sortBy === 'lowest-price') return (Number(a.totalAmount || 0)) - (Number(b.totalAmount || 0));
            if (sortBy === 'highest-price') return (Number(b.totalAmount || 0)) - (Number(a.totalAmount || 0));
            if (sortBy === 'earliest-submission') return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
            if (sortBy === 'fastest-delivery') return getDeliveryDays(a.deliveryDays) - getDeliveryDays(b.deliveryDays);
            if (sortBy === 'supplier-name') return String(a.seller?.name || '').localeCompare(String(b.seller?.name || ''));
            return 0;
        });
        return items;
    }, [rawResponses, filterStatus, sortBy]);

    // L1 sheet: determine if we should show disqualified status
    const l1Participants = useMemo(() => [...rawResponses]
        .sort((a, b) => {
            const aRank = a.rank || 999;
            const bRank = b.rank || 999;
            if (a.isDisqualified && !b.isDisqualified) return 1;
            if (!a.isDisqualified && b.isDisqualified) return -1;
            return aRank - bRank;
        }), [rawResponses]);

    const isBuyer = user?.role === 'buyer';
    const isResponded = qr?.status === 'responded';

    if (isLoading) {
        return (
            <div className="container mx-auto p-6 space-y-4">
                <div className="animate-pulse space-y-4">
                    <div className="h-8 w-48 rounded bg-slate-200" />
                    <div className="grid gap-4 sm:grid-cols-4"><div className="h-20 rounded-xl bg-slate-200" /><div className="h-20 rounded-xl bg-slate-200" /><div className="h-20 rounded-xl bg-slate-200" /><div className="h-20 rounded-xl bg-slate-200" /></div>
                    <div className="h-96 rounded-2xl bg-slate-200" />
                </div>
            </div>
        );
    }

    if (error || !qr) {
        return (
            <div className="container mx-auto p-6">
                <div className="flex flex-col items-center justify-center gap-4 py-20">
                    <AlertTriangle className="h-10 w-10 text-red-400" />
                    <h3 className="text-base font-black text-slate-700">Failed to load comparison</h3>
                    <p className="text-xs text-slate-500">Check the RFQ ID or try again later.</p>
                    <button onClick={() => refetch()} className="rounded-lg bg-[#12335f] px-4 py-2 text-xs font-black text-white">Retry</button>
                </div>
            </div>
        );
    }

    return (
        <div className="container mx-auto space-y-6 p-6">
            <div className="flex items-center justify-between">
                <button onClick={() => router.back()} className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-[#0b2447] transition">
                    <ArrowLeft className="h-4 w-4" /> Back to RFQ
                </button>
                <button onClick={() => window.print()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-indigo-200 bg-white px-3 text-xs font-bold text-indigo-700 hover:bg-indigo-50 transition shadow-sm">
                    <Printer className="h-3.5 w-3.5" /> Export Report
                </button>
            </div>

            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Quotation Comparison</p>
                <h1 className="text-xl font-black tracking-tight text-slate-950">
                    Compare Quotations — RFQ-{String(qr.id).padStart(5, '0')}
                </h1>
                <p className="mt-1 text-xs font-semibold text-slate-500 max-w-2xl">
                    {qr.subject} — {rawResponses.length} seller response{rawResponses.length !== 1 ? 's' : ''} received
                </p>
            </div>

            {/* RFQ summary card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">RFQ</span>
                            <Badge className="rounded-md px-2 py-0.5 text-[10px] font-black uppercase bg-slate-100 text-slate-700">{String(qr.status).replace(/_/g, ' ')}</Badge>
                        </div>
                        <h3 className="mt-1 text-base font-extrabold text-slate-900">{qr.subject}</h3>
                        <p className="mt-1 text-xs text-slate-500 font-semibold">
                            Estimated Value: {formatCurrency(qr.estimatedValue)} | Responses: {rawResponses.length}
                        </p>
                    </div>
                </div>
            </div>

            {/* Highlights */}
            {highlights && (
                <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Lowest Price</p>
                        <p className="text-lg font-black text-emerald-600">{money(highlights.lowestPrice)}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Highest Price</p>
                        <p className="text-lg font-black text-red-600">{money(highlights.highestPrice)}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Average Quotation Value</p>
                        <p className="text-lg font-black text-slate-800">{money(highlights.averagePrice)}</p>
                    </div>
                    <div className="space-y-1">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">L1 to Highest Spread</p>
                        <p className="text-lg font-black text-indigo-600">{money(highlights.priceDiff)}</p>
                    </div>
                </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200">
                <button onClick={() => setActiveTab('l1')}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition ${
                        activeTab === 'l1' ? 'border-indigo-650 text-indigo-700 bg-indigo-50/10' : 'border-transparent text-slate-400 hover:text-slate-700'
                    }`}>
                    <Shield className="h-4 w-4" /> L1 Ranking Sheet
                </button>
                <button onClick={() => setActiveTab('matrix')}
                    className={`flex items-center gap-1.5 px-4 py-2.5 text-xs font-black uppercase tracking-wider border-b-2 transition ${
                        activeTab === 'matrix' ? 'border-indigo-650 text-indigo-700 bg-indigo-50/10' : 'border-transparent text-slate-400 hover:text-slate-700'
                    }`}>
                    <Users className="h-4 w-4" /> Compare Matrix Table
                </button>
            </div>

            {/* Sort & Filter controls for Matrix tab */}
            {activeTab === 'matrix' && (
                <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                    <div className="flex flex-wrap items-center gap-4">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500">Filter:</span>
                            <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
                                className="rounded-lg border border-slate-250 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400">
                                <option value="all">All Quotations</option>
                                <option value="submitted">Submitted</option>
                                <option value="accepted">Accepted</option>
                                <option value="rejected">Rejected</option>
                                <option value="pending-review">Pending Review</option>
                            </select>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-500">Sort by:</span>
                            <select value={sortBy} onChange={e => setSortBy(e.target.value)}
                                className="rounded-lg border border-slate-250 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-400">
                                <option value="lowest-price">Lowest Price</option>
                                <option value="highest-price">Highest Price</option>
                                <option value="earliest-submission">Earliest Submission</option>
                                <option value="fastest-delivery">Fastest Delivery</option>
                                <option value="supplier-name">Company Name</option>
                            </select>
                        </div>
                    </div>
                </div>
            )}

            {/* L1 Ranking Tab */}
            {activeTab === 'l1' ? (
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
                    <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex items-center justify-between">
                        <div>
                            <h4 className="text-xs font-black uppercase text-slate-700 tracking-wider">L1 Comparison Sheet</h4>
                            <p className="text-[11px] font-semibold text-slate-500 mt-0.5">Ranked by evaluated price. Technically disqualified sellers excluded from ranking.</p>
                        </div>
                        <div className="flex items-center gap-2">
                            {isBuyer && (
                                <button onClick={() => generateL1Mut.mutate()} disabled={generateL1Mut.isPending}
                                    className="inline-flex h-7 items-center gap-1 rounded bg-[#0b2447] px-2.5 text-[9px] font-black text-white hover:bg-[#12335f] transition shadow-sm">
                                    <Shield className="h-3 w-3" /> Generate L1 Rankings
                                </button>
                            )}
                            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2 py-0.5 text-[9px] font-bold text-indigo-700 uppercase tracking-wide">
                                Financial Evaluation Ranks
                            </span>
                        </div>
                    </div>
                    <div className="overflow-x-auto">
                        <table className="w-full min-w-[900px] border-collapse text-left text-xs">
                            <thead>
                                <tr className="border-b border-slate-200 bg-slate-50 font-black text-slate-600 uppercase tracking-wider">
                                    <th className="p-4 w-[100px]">Rank</th>
                                    <th className="p-4">Seller</th>
                                    <th className="p-4">Technical Status</th>
                                    <th className="p-4">Commercial Status</th>
                                    <th className="p-4">Evaluated Price</th>
                                    <th className="p-4">Delivery</th>
                                    <th className="p-4">Warranty</th>
                                    <th className="p-4 w-32">Eligibility</th>
                                    {isBuyer && isResponded && <th className="p-4 text-center w-[180px]">Evaluation</th>}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200">
                                {l1Participants.map((r: any) => {
                                    const isQualified = r.technicalStatus !== 'NOT_QUALIFIED';
                                    const evaluatedPrice = r.evaluatedPrice || r.totalAmount || 0;
                                    const isL1 = r.rank === 1;

                                    let eligibilityText = 'Under Evaluation';
                                    let eligibilityColor = 'text-slate-500 font-semibold';
                                    if (r.isDisqualified || r.technicalStatus === 'NOT_QUALIFIED') {
                                        eligibilityText = 'Technically Disqualified';
                                        eligibilityColor = 'text-red-600 font-black';
                                    } else if (r.financialStatus === 'NOT_QUALIFIED') {
                                        eligibilityText = 'Financially Disqualified';
                                        eligibilityColor = 'text-red-600 font-black';
                                    } else if (isL1) {
                                        eligibilityText = 'Eligible for Award';
                                        eligibilityColor = 'text-emerald-600 font-black';
                                    } else if (r.rank) {
                                        eligibilityText = `L${r.rank} — Under Evaluation`;
                                        eligibilityColor = 'text-slate-500';
                                    }

                                    return (
                                        <tr key={r.id} className={`hover:bg-slate-50/40 transition ${r.isDisqualified ? 'bg-slate-50/20 text-slate-400' : ''}`}>
                                            <td className="p-4"><RankBadge rank={r.rank} isDisqualified={r.isDisqualified} /></td>
                                            <td className="p-4">
                                                <div className="font-extrabold text-slate-800">{r.seller?.sellerProfile?.businessName || r.seller?.name || `Seller #${r.sellerId}`}</div>
                                                <div className="text-[10px] text-slate-450 mt-0.5">{r.responseNumber || `QR-${r.id}`}</div>
                                                <div className="text-[10px] text-slate-400 mt-0.5">{formatDateTime(r.createdAt)}</div>
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-black uppercase ${
                                                    r.technicalStatus === 'QUALIFIED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                                                    r.technicalStatus === 'NOT_QUALIFIED' ? 'border-red-200 bg-red-50 text-red-700' :
                                                    'border-slate-200 bg-slate-100 text-slate-500'
                                                }`}>
                                                    {r.technicalStatus || 'PENDING'}
                                                </span>
                                            </td>
                                            <td className="p-4">
                                                <span className={`inline-flex items-center rounded-md border px-2 py-0.5 text-[9px] font-black uppercase ${
                                                    r.financialStatus === 'QUALIFIED' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                                                    r.financialStatus === 'NOT_QUALIFIED' ? 'border-red-200 bg-red-50 text-red-700' :
                                                    'border-slate-200 bg-slate-100 text-slate-500'
                                                }`}>
                                                    {r.financialStatus || 'PENDING'}
                                                </span>
                                            </td>
                                            <td className={`p-4 font-extrabold ${isL1 ? 'text-emerald-700' : r.isDisqualified ? 'text-slate-400' : 'text-slate-800'}`}>
                                                {isQualified ? money(evaluatedPrice) : '—'}
                                                {isL1 && <span className="block text-[8px] font-black text-emerald-600 uppercase">Lowest Bidder</span>}
                                            </td>
                                            <td className="p-4 font-semibold text-slate-650">{r.deliveryDays ? `${r.deliveryDays} days` : '—'}</td>
                                            <td className="p-4 font-semibold text-slate-650">{r.warrantyPeriod || '—'}</td>
                                            <td className={`p-4 ${eligibilityColor}`}>{eligibilityText}</td>
                                            {isBuyer && isResponded && (
                                                <td className="p-4 text-center">
                                                    <div className="flex flex-col gap-1">
                                                        <div className="flex items-center gap-1">
                                                            <select defaultValue={r.technicalStatus || 'PENDING'}
                                                                onChange={e => techEvalMut.mutate({ responseId: r.id, status: e.target.value })}
                                                                className="w-full rounded border border-slate-200 px-1 py-0.5 text-[9px] font-bold focus:outline-none">
                                                                <option value="PENDING">Tech: Pending</option>
                                                                <option value="QUALIFIED">Tech: Qualified</option>
                                                                <option value="NOT_QUALIFIED">Tech: Disqualified</option>
                                                            </select>
                                                        </div>
                                                        <div className="flex items-center gap-1">
                                                            <select defaultValue={r.financialStatus || 'PENDING'}
                                                                onChange={e => finEvalMut.mutate({ responseId: r.id, status: e.target.value })}
                                                                className="w-full rounded border border-slate-200 px-1 py-0.5 text-[9px] font-bold focus:outline-none">
                                                                <option value="PENDING">Fin: Pending</option>
                                                                <option value="QUALIFIED">Fin: Qualified</option>
                                                                <option value="NOT_QUALIFIED">Fin: Disqualified</option>
                                                            </select>
                                                        </div>
                                                        {isQualified && isL1 && (
                                                            <button onClick={() => setAwardModal({ show: true, responseId: r.id, sellerName: r.seller?.name || `Seller #${r.sellerId}`, amount: Number(evaluatedPrice), rank: r.rank, confirmed: false, remarks: '' })}
                                                                className="inline-flex h-6 items-center justify-center gap-1 rounded bg-[#0b2447] px-2 text-[8px] font-black text-white hover:bg-[#12335f] transition shadow-sm mt-1">
                                                                <Award className="h-3 w-3" /> Award
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                            )}
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>
            ) : (
                /* Compare Matrix Tab */
                filteredAndSorted.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center shadow-sm">
                        <Users className="mx-auto h-12 w-12 text-slate-300" />
                        <h4 className="mt-3 text-sm font-black text-slate-700">No Quotations Match</h4>
                        <p className="mt-1 text-xs text-slate-500">Adjust your filtering parameters.</p>
                    </div>
                ) : (
                    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-md">
                        <div className="overflow-x-auto">
                            <table className="w-full min-w-[1000px] border-collapse text-left text-xs">
                                <thead>
                                    <tr className="border-b border-slate-200 bg-slate-50 font-black text-slate-600 uppercase tracking-wider">
                                        <th className="p-4 border-r border-slate-200 w-[200px]">Comparison Parameter</th>
                                        {filteredAndSorted.map(r => {
                                            const price = Number(r.totalAmount || 0);
                                            const isLowest = highlights?.lowestPrice > 0 && price === highlights.lowestPrice;
                                            return (
                                                <th key={r.id} className={`p-4 border-r border-slate-200 text-center ${isLowest ? 'bg-emerald-50/40' : ''}`}>
                                                    <div className="font-extrabold text-slate-900 text-sm">
                                                        {r.seller?.sellerProfile?.businessName || r.seller?.name || `Seller #${r.sellerId}`}
                                                    </div>
                                                    <div className="text-[10px] text-slate-450 font-bold mt-1">
                                                        {r.responseNumber || `R-${r.id}`} {r.rank ? `| L${r.rank}` : ''}
                                                    </div>
                                                    {isLowest && (
                                                        <span className="inline-block rounded bg-emerald-100 px-1.5 py-0.5 text-[8px] font-black text-emerald-800 uppercase tracking-wide mt-1.5">
                                                            Lowest Quote
                                                        </span>
                                                    )}
                                                </th>
                                            );
                                        })}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-200">
                                    <Row label="Seller Name">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-bold text-slate-800">
                                                {r.seller?.sellerProfile?.businessName || r.seller?.name || `Seller #${r.sellerId}`}
                                            </td>
                                        ))}
                                    </Row>
                                    <Row label="Company Rating">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500">—</td>
                                        ))}
                                    </Row>
                                    <Row label="Submission Date & Time">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500">
                                                <p>{formatDateTime(r.createdAt)}</p>
                                                <p className="text-[10px] text-slate-400">{formatRelative(r.createdAt)}</p>
                                            </td>
                                        ))}
                                    </Row>
                                    <Row label="Quotation Status">
                                        {filteredAndSorted.map(r => {
                                            const isExpired = r.validityDate && new Date(r.validityDate) < new Date();
                                            return (
                                                <td key={r.id} className={`p-4 border-r border-slate-200 text-center ${isExpired ? 'bg-orange-50/40' : ''}`}>
                                                    <StatusBadgeInline label={r.status} />
                                                    {isExpired && <div className="text-[8px] font-black text-orange-700 mt-1 uppercase">Expired</div>}
                                                </td>
                                            );
                                        })}
                                    </Row>
                                    <Row label="Total Quoted Amount">
                                        {filteredAndSorted.map(r => {
                                            const price = Number(r.totalAmount || 0);
                                            const isLowest = highlights?.lowestPrice > 0 && price === highlights.lowestPrice;
                                            return (
                                                <td key={r.id} className={`p-4 border-r border-slate-200 text-center font-extrabold text-sm ${isLowest ? 'bg-emerald-50 text-emerald-800' : 'text-slate-900'}`}>
                                                    {money(price)}
                                                </td>
                                            );
                                        })}
                                    </Row>
                                    <Row label="Currency">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-bold text-slate-600">{r.currency || 'INR'}</td>
                                        ))}
                                    </Row>
                                    <Row label="Item-wise Price Breakdown">
                                        {filteredAndSorted.map(r => {
                                            const breakup = parsePriceBreakup(r.notes);
                                            return (
                                                <td key={r.id} className="p-4 border-r border-slate-200 text-left font-semibold text-slate-600">
                                                    {breakup ? (
                                                        <div className="space-y-0.5 text-[10px]">
                                                            {Object.entries(breakup).map(([k, v]) => (
                                                                <div key={k} className="flex justify-between gap-2 border-b border-slate-100 pb-0.5">
                                                                    <span className="capitalize text-slate-500">{k}</span>
                                                                    <span className="font-bold text-slate-800">{v}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400">{money(r.totalAmount)}</span>
                                                    )}
                                                </td>
                                            );
                                        })}
                                    </Row>
                                    <Row label="Taxes (GST)">
                                        {filteredAndSorted.map(r => {
                                            const breakup = parsePriceBreakup(r.notes);
                                            return <td key={r.id} className="p-4 border-r border-slate-200 text-center font-bold text-slate-600">{breakup?.['tax'] || r.gstRate ? `${r.gstRate}%` : '—'}</td>;
                                        })}
                                    </Row>
                                    <Row label="Discounts Offered">
                                        {filteredAndSorted.map(r => {
                                            const breakup = parsePriceBreakup(r.notes);
                                            return <td key={r.id} className="p-4 border-r border-slate-200 text-center font-bold text-slate-600">{breakup?.['discount'] || r.discountPercent ? `${r.discountPercent}%` : '—'}</td>;
                                        })}
                                    </Row>
                                    <Row label="Evaluated Price (L1 Basis)">
                                        {filteredAndSorted.map(r => {
                                            const evalPrice = r.evaluatedPrice || r.totalAmount || 0;
                                            const isLowest = highlights?.lowestPrice > 0 && Number(evalPrice) === highlights.lowestPrice;
                                            return (
                                                <td key={r.id} className={`p-4 border-r border-slate-200 text-center font-extrabold text-sm ${isLowest ? 'bg-emerald-50 text-emerald-800' : 'text-slate-900'}`}>
                                                    {money(evalPrice)}
                                                    {r.rank === 1 && <div className="text-[8px] font-black text-emerald-600 uppercase">L1</div>}
                                                </td>
                                            );
                                        })}
                                    </Row>
                                    <Row label="Delivery Timeline">
                                        {filteredAndSorted.map(r => {
                                            const days = getDeliveryDays(r.deliveryDays);
                                            const isFastest = highlights?.minDeliveryDays !== Infinity && days === highlights.minDeliveryDays;
                                            return (
                                                <td key={r.id} className={`p-4 border-r border-slate-200 text-center font-bold ${isFastest ? 'bg-emerald-50 text-emerald-800' : 'text-slate-700'}`}>
                                                    {r.deliveryDays ? `${r.deliveryDays} days` : 'Not specified'}
                                                </td>
                                            );
                                        })}
                                    </Row>
                                    <Row label="Delivery Location">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500">
                                                {r.deliveryLocation || [r.seller?.sellerProfile?.city, r.seller?.sellerProfile?.state].filter(Boolean).join(', ') || '—'}
                                            </td>
                                        ))}
                                    </Row>
                                    <Row label="Warranty Period">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500">{r.warrantyPeriod || 'Not provided'}</td>
                                        ))}
                                    </Row>
                                    <Row label="Payment Terms">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500">{r.paymentTerms || 'Not provided'}</td>
                                        ))}
                                    </Row>
                                    <Row label="Quotation Validity">
                                        {filteredAndSorted.map(r => {
                                            const isExpired = r.validityDate && new Date(r.validityDate) < new Date();
                                            return (
                                                <td key={r.id} className={`p-4 border-r border-slate-200 text-center font-bold ${isExpired ? 'bg-orange-50 text-orange-700' : 'text-slate-600'}`}>
                                                    {r.validityDate ? formatDateTime(r.validityDate) : 'Not specified'}
                                                </td>
                                            );
                                        })}
                                    </Row>
                                    <Row label="Compliance with Specifications">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500">{r.complianceStatus || 'Not assessed'}</td>
                                        ))}
                                    </Row>
                                    <Row label="Required Certifications">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500">Not provided</td>
                                        ))}
                                    </Row>
                                    <Row label="Documents Uploaded">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className={`p-4 border-r border-slate-200 text-center ${!r.documentUrl ? 'bg-red-50/40' : ''}`}>
                                                {r.documentUrl ? (
                                                    <div className="flex flex-col items-center gap-1">
                                                        <a href={r.documentUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:underline"><Eye className="h-3 w-3" /> Preview</a>
                                                        <a href={r.documentUrl} download className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:underline"><Download className="h-3 w-3" /> Download</a>
                                                    </div>
                                                ) : (
                                                    <span className="text-[10px] font-extrabold text-red-700">Missing</span>
                                                )}
                                            </td>
                                        ))}
                                    </Row>
                                    <Row label="Technical Remarks">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500">{r.technicalRemarks || '—'}</td>
                                        ))}
                                    </Row>
                                    <Row label="Commercial Remarks">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500 max-w-[200px]">
                                                {r.commercialRemarks || extractCustomNotes(r.notes) || '—'}
                                            </td>
                                        ))}
                                    </Row>
                                    <Row label="Buyer Remarks">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500">{r.buyerRemarks || '—'}</td>
                                        ))}
                                    </Row>
                                    <Row label="Previous Performance Rating">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500">—</td>
                                        ))}
                                    </Row>
                                    <Row label="Past Procurement History">
                                        {filteredAndSorted.map(r => (
                                            <td key={r.id} className="p-4 border-r border-slate-200 text-center font-semibold text-slate-500">—</td>
                                        ))}
                                    </Row>
                                    {isBuyer && isResponded && (
                                        <Row label="Buyer Action">
                                            {filteredAndSorted.map(r => {
                                                const canAct = String(r.status || '').toUpperCase() === 'SUBMITTED';
                                                return (
                                                    <td key={r.id} className="p-4 border-r border-slate-200 text-center">
                                                        {canAct ? (
                                                            <div className="flex items-center justify-center gap-1">
                                                                <button onClick={() => rejectMut.mutate(r.id)} disabled={rejectMut.isPending}
                                                                    className="inline-flex h-7 items-center rounded-md border border-red-200 bg-white px-2 text-[9px] font-black uppercase text-red-600 hover:bg-red-50 disabled:opacity-50">
                                                                    <X className="mr-0.5 h-3 w-3" /> Reject
                                                                </button>
                                                                <button onClick={() => setAwardModal({ show: true, responseId: r.id, sellerName: r.seller?.name || `Seller #${r.sellerId}`, amount: Number(r.totalAmount || 0), rank: r.rank || 999, confirmed: false, remarks: '' })}
                                                                    className="inline-flex h-7 items-center rounded-md bg-emerald-600 px-2 text-[9px] font-black uppercase text-white hover:bg-emerald-700 disabled:opacity-50">
                                                                    <CheckCircle2 className="mr-0.5 h-3 w-3" /> Accept & PO
                                                                </button>
                                                            </div>
                                                        ) : (
                                                            <StatusBadgeInline label={r.status} />
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </Row>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                )
            )}

            {/* Info card */}
            <div className="rounded-2xl border border-slate-200 bg-slate-50/80 p-5 space-y-3">
                <div className="flex gap-2">
                    <Info className="h-5 w-5 text-indigo-650 shrink-0 mt-0.5" />
                    <div>
                        <h5 className="text-xs font-black uppercase text-indigo-900 tracking-wider">Evaluation Rules & L1 Protocol</h5>
                        <p className="mt-1 text-xs text-slate-600 leading-relaxed font-semibold">
                            L1 is determined by evaluated price. Technically disqualified bidders cannot receive L1/L2/L3 ranking.
                            Two-bid process: technical evaluation completes before financial ranking.
                            Every buyer action notifies the affected seller and is recorded in the audit log.
                            Non-L1 award requires mandatory justification remarks.
                        </p>
                    </div>
                </div>
                <div className="border-t border-slate-200 pt-3">
                    <p className="text-[10px] font-black uppercase text-slate-500 tracking-wider">Legend:</p>
                    <ul className="list-disc list-inside mt-1 text-[11px] font-bold text-slate-550 space-y-1">
                        <li><span className="text-emerald-600 font-black">Green</span> = L1 Lowest Bidder / Lowest price</li>
                        <li><span className="text-amber-600 font-black">Yellow</span> = L2 Second Lowest</li>
                        <li><span className="text-orange-600 font-black">Orange</span> = L3 Third Lowest</li>
                        <li><span className="text-red-600 font-black">Red</span> = Technically disqualified / Missing documents</li>
                        <li><span className="text-orange-600 font-black">Orange</span> = Expired validity</li>
                    </ul>
                </div>
            </div>

            {/* Award Modal */}
            {awardModal.show && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
                    <div className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-xl space-y-5 animate-in fade-in zoom-in duration-250">
                        <button onClick={() => setAwardModal(s => ({ ...s, show: false }))} className="absolute top-4 right-4 text-slate-400 hover:text-slate-600">
                            <X className="h-5 w-5" />
                        </button>
                        <div>
                            <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 flex items-center gap-1.5">
                                <Award className="h-5 w-5 text-indigo-650" /> Confirm Award Decision
                            </h3>
                            <p className="text-xs text-slate-500 font-semibold mt-1">Officially award the RFQ to the selected supplier.</p>
                        </div>
                        <div className="rounded-xl border border-slate-150 bg-slate-50/50 p-4 space-y-3 text-xs">
                            <div className="flex justify-between border-b border-slate-200/60 pb-2">
                                <span className="font-bold text-slate-500">Seller:</span>
                                <span className="font-black text-slate-900">{awardModal.sellerName}</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-200/60 pb-2">
                                <span className="font-bold text-slate-500">RFQ:</span>
                                <span className="font-extrabold text-slate-900">RFQ-{String(qr.id).padStart(5, '0')} ({qr.subject})</span>
                            </div>
                            <div className="flex justify-between border-b border-slate-200/60 pb-2">
                                <span className="font-bold text-slate-500">Rank:</span>
                                <span className="font-black text-slate-900">{awardModal.rank === 1 ? 'L1 (Lowest Bidder)' : `L${awardModal.rank}`}</span>
                            </div>
                            <div className="flex justify-between pb-1">
                                <span className="font-bold text-slate-500">Award Value:</span>
                                <span className="font-black text-emerald-700 text-sm">{money(awardModal.amount)}</span>
                            </div>
                        </div>
                        {awardModal.rank !== 1 && (
                            <div className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900">
                                <AlertTriangle className="h-5 w-5 text-amber-700 shrink-0 mt-0.5" />
                                <div>
                                    <p className="font-black">L1 Non-Selection Override Warning</p>
                                    <p className="mt-0.5 text-amber-800/90 font-semibold">
                                        You have selected a supplier other than L1. Procurement policy requires a detailed justification.
                                    </p>
                                </div>
                            </div>
                        )}
                        <div className="space-y-1.5">
                            <label className="text-[11px] font-black uppercase text-slate-500 tracking-wider">
                                Award Justification / Remarks {awardModal.rank !== 1 && <span className="text-red-500">*</span>}
                            </label>
                            <textarea value={awardModal.remarks} onChange={e => setAwardModal(s => ({ ...s, remarks: e.target.value }))}
                                placeholder={awardModal.rank === 1 ? 'Optional remarks...' : 'Mandatory justification for non-L1 selection...'}
                                rows={3} className="w-full rounded-lg border border-slate-250 p-2.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                        </div>
                        <label className="flex items-start gap-2.5 select-none cursor-pointer">
                            <input type="checkbox" checked={awardModal.confirmed} onChange={e => setAwardModal(s => ({ ...s, confirmed: e.target.checked }))}
                                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-indigo-650 focus:ring-indigo-500" />
                            <span className="text-xs font-bold text-slate-600 leading-snug">
                                I confirm this award complies with procurement evaluation criteria and policy.
                            </span>
                        </label>
                        <div className="flex justify-end gap-2.5 pt-2">
                            <button onClick={() => setAwardModal(s => ({ ...s, show: false }))}
                                className="inline-flex h-9 items-center justify-center rounded-lg border border-slate-200 bg-white px-4 text-xs font-bold text-slate-700 hover:bg-slate-50 transition">
                                Cancel
                            </button>
                            <button onClick={() => acceptMut.mutate({ responseId: awardModal.responseId, title: qr.subject })}
                                disabled={acceptMut.isPending || !awardModal.confirmed || (awardModal.rank !== 1 && !awardModal.remarks.trim())}
                                className="inline-flex h-9 items-center gap-1.5 justify-center rounded-lg bg-[#0b2447] px-4 text-xs font-black text-white hover:bg-[#12335f] transition disabled:opacity-50 disabled:cursor-not-allowed">
                                <Award className="h-4 w-4" /> Confirm & Issue PO
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <tr className="hover:bg-slate-50/30">
            <td className="p-4 border-r border-slate-200 font-black text-slate-700 bg-slate-50/50 text-[11px]">{label}</td>
            {children}
        </tr>
    );
}
