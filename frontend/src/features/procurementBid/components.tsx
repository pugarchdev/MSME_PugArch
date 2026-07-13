'use client';

import React from 'react';
import Link from 'next/link';
import {
  ArrowRight,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Download,
  Eye,
  FileText,
  IndianRupee,
  Loader2,
  MapPin,
  MessageSquareText,
  Search,
  Send,
  Clock,
  Play,
  User,
  Gavel,
} from 'lucide-react';
import { formatDate, lifecycleLabels, money, type BidResultRow, type ProcurementBid } from './data';

export function StatusBadge({ label }: { label: string }) {
  const normalized = String(label || '').trim().toUpperCase();
  const tone =
    ['AWARDED', 'QUALIFIED', 'COMPLETED', 'PAYMENT_COMPLETED', 'CLOSED'].includes(normalized)
      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 shadow-emerald-100'
      : ['OPEN', 'OPEN_FOR_BIDDING', 'PUBLISHED'].includes(normalized)
        ? 'border-blue-200 bg-blue-50 text-blue-700 shadow-blue-100'
        : ['PO_GENERATED', 'IN_PROGRESS', 'DELIVERED', 'GRN_COMPLETED', 'INVOICE_SUBMITTED'].includes(normalized)
          ? 'border-purple-200 bg-purple-50 text-purple-700 shadow-purple-100'
          : ['CLOSING SOON', 'PENDING', 'REOPENED', 'UNDER_EVALUATION', 'TECHNICAL_EVALUATION', 'FINANCIAL_EVALUATION', 'NEGOTIATION'].includes(normalized)
            ? 'border-amber-200 bg-amber-50 text-amber-700 shadow-amber-100'
            : ['REJECTED', 'DISQUALIFIED', 'CANCELLED', 'EXPIRED'].includes(normalized)
              ? 'border-red-200 bg-red-50 text-red-700 shadow-red-100'
              : 'border-slate-200 bg-slate-50 text-slate-700 shadow-sm';

  const friendlyLabel = label ? label.replace(/_/g, ' ') : '';
  return <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-black shadow-sm ${tone}`}>{friendlyLabel}</span>;
}

export function PageShell({ children }: { children: React.ReactNode }) {
  return <div className="min-h-dvh bg-[linear-gradient(180deg,#f8fbff_0%,#f4f7fb_42%,#eef3f8_100%)] text-slate-800">{children}</div>;
}

export type ProcurementTheme = {
  /** Primary color for backgrounds, buttons */
  primary: string;
  /** Gradient start */
  gradientFrom: string;
  /** Gradient via */
  gradientVia: string;
  /** Gradient to */
  gradientTo: string;
  /** Accent for badges / glow */
  accent: string;
  /** Text on primary background */
  accentText: string;
  /** Light background wash */
  lightBg: string;
  /** Border ring on focus / active */
  ring: string;
  /** Badge label text */
  label: string;
};

const DEFAULT_THEME: ProcurementTheme = {
  primary: '#0b2447',
  gradientFrom: '#0b2447',
  gradientVia: '#12335f',
  gradientTo: '#1a447a',
  accent: 'bg-amber-500/10 border-amber-500/30',
  accentText: 'text-amber-400',
  lightBg: 'bg-blue-50',
  ring: 'ring-[#0b2447]/10',
  label: 'MSME Procurement Control',
};

export const PROCUREMENT_THEMES: Record<string, ProcurementTheme> = {
  RFQ: { primary: '#ea580c', gradientFrom: '#7c2d12', gradientVia: '#ea580c', gradientTo: '#f97316', accent: 'bg-orange-400/10 border-orange-400/30', accentText: 'text-orange-300', lightBg: 'bg-orange-50', ring: 'ring-orange-600/10', label: 'Request for Quotation' },
  RFP: { primary: '#4338ca', gradientFrom: '#312e81', gradientVia: '#4338ca', gradientTo: '#6366f1', accent: 'bg-indigo-400/10 border-indigo-400/30', accentText: 'text-indigo-300', lightBg: 'bg-indigo-50', ring: 'ring-indigo-600/10', label: 'Request for Proposal' },
  OPEN_TENDER: { primary: '#b45309', gradientFrom: '#78350f', gradientVia: '#b45309', gradientTo: '#d97706', accent: 'bg-amber-400/10 border-amber-400/30', accentText: 'text-amber-300', lightBg: 'bg-amber-50', ring: 'ring-amber-600/10', label: 'Open Tender' },
  LIMITED_TENDER: { primary: '#0284c7', gradientFrom: '#0c4a6e', gradientVia: '#0284c7', gradientTo: '#0ea5e9', accent: 'bg-sky-400/10 border-sky-400/30', accentText: 'text-sky-300', lightBg: 'bg-sky-50', ring: 'ring-sky-600/10', label: 'Limited Tender' },
  REVERSE_AUCTION: { primary: '#be123c', gradientFrom: '#881337', gradientVia: '#be123c', gradientTo: '#e11d48', accent: 'bg-rose-400/10 border-rose-400/30', accentText: 'text-rose-300', lightBg: 'bg-rose-50', ring: 'ring-rose-600/10', label: 'Reverse Auction' },
  RATE_CONTRACT: { primary: '#0d9488', gradientFrom: '#134e4a', gradientVia: '#0d9488', gradientTo: '#14b8a6', accent: 'bg-teal-400/10 border-teal-400/30', accentText: 'text-teal-300', lightBg: 'bg-teal-50', ring: 'ring-teal-600/10', label: 'Rate Contract' },
  REPEAT_ORDER: { primary: '#65a30d', gradientFrom: '#365314', gradientVia: '#65a30d', gradientTo: '#84cc16', accent: 'bg-lime-400/10 border-lime-400/30', accentText: 'text-lime-300', lightBg: 'bg-lime-50', ring: 'ring-lime-600/10', label: 'Repeat Order' },
};

export const getThemeForMethod = (procurementType?: string): ProcurementTheme => {
  if (!procurementType) return DEFAULT_THEME;
  const key = procurementType.toUpperCase().replace(/[\s-]+/g, '_');
  return PROCUREMENT_THEMES[key] || DEFAULT_THEME;
};

export function ProcurementHero({ title, subtitle, action, theme }: { title: string; subtitle: string; action?: React.ReactNode; theme?: ProcurementTheme }) {
  const t = theme || DEFAULT_THEME;
  return (
    <div
      className="relative overflow-hidden rounded-[24px] p-6 text-white shadow-lg border border-white/10 animate-in fade-in slide-in-from-top-3 duration-500"
      style={{ background: `linear-gradient(135deg, ${t.gradientFrom} 0%, ${t.gradientVia} 50%, ${t.gradientTo} 100%)` }}
    >
      {/* Soft decorative background blur circles */}
      <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-white/5 blur-3xl pointer-events-none" />
      <div className="absolute -left-20 -bottom-20 h-64 w-64 rounded-full bg-white/3 blur-3xl pointer-events-none" />

      <div className="relative grid gap-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <span className={`inline-flex items-center gap-1.5 rounded-full ${t.accent} px-3 py-1 text-[9px] font-black uppercase tracking-wider ${t.accentText} select-none`}>
            <span className="h-1.5 w-1.5 rounded-full bg-current animate-pulse" />
            {t.label}
          </span>
          <h1 className="mt-3 text-2xl font-black leading-tight tracking-tight sm:text-3xl text-white">
            {title}
          </h1>
          <p className="mt-2 max-w-3xl text-xs font-semibold leading-relaxed text-white/70">
            {subtitle}
          </p>
        </div>
        <div className="shrink-0 flex items-center">
          {action}
        </div>
      </div>
    </div>
  );
}

export function BidCard({ bid, viewHref, participationHref, participationLabel = 'Participate', onViewClick }: { bid: ProcurementBid; viewHref?: string; participationHref?: string; participationLabel?: string; onViewClick?: () => void }) {
  return (
    <article className="group flex h-full flex-col overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#0b2447]/30 hover:shadow-xl">
      <div className="h-1 bg-gradient-to-r from-[#0b2447] via-[#1f6feb] to-[#c86413]" />
      <div className="flex flex-1 flex-col gap-4 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{bid.id}</p>
            <h2 className="mt-1 text-sm font-black leading-snug text-slate-900">{bid.title}</h2>
          </div>
          <StatusBadge label={bid.status} />
        </div>
        <div className="grid gap-2 text-[11px] font-semibold text-slate-600 sm:grid-cols-2">
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-blue-50 px-2"><FileText className="h-3.5 w-3.5 text-[#0b2447]" />{bid.itemName}</span>
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-blue-50 px-2"><MapPin className="h-3.5 w-3.5 text-[#0b2447]" />{bid.location}</span>
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-emerald-50 px-2"><IndianRupee className="h-3.5 w-3.5 text-emerald-700" />{money(bid.estimatedValue)}</span>
          <span className="inline-flex min-h-9 items-center gap-1.5 rounded-md bg-amber-50 px-2"><CalendarClock className="h-3.5 w-3.5 text-amber-700" />Closes {formatDate(bid.endDate)}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          <StatusBadge label={bid.technicalStatus} />
          {bid.clarificationStatus && bid.clarificationStatus !== 'None' && (
            <StatusBadge label={bid.clarificationStatus} />
          )}
          <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-[10px] font-black text-slate-600">{bid.buyerType}</span>
        </div>
        <p className="line-clamp-2 text-xs leading-5 text-slate-500">{bid.description}</p>
        <div className="mt-auto flex flex-col gap-2 border-t border-slate-100 pt-3 sm:flex-row">
          {onViewClick ? (
            <button onClick={onViewClick} type="button" className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-[#0b2447] px-3 text-xs font-black text-white shadow-sm transition hover:bg-[#12335f]">
              <Eye className="h-3.5 w-3.5" /> View Details
            </button>
          ) : (
            <Link href={viewHref || `/bids/${bid.id}`} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md bg-[#0b2447] px-3 text-xs font-black text-white shadow-sm transition hover:bg-[#12335f]">
              <Eye className="h-3.5 w-3.5" /> View Details
            </Link>
          )}
          {['TECHNICAL_EVALUATION', 'TECHNICAL_EVALUATION_COMPLETED', 'L1_GENERATED', 'FINANCIAL_EVALUATION', 'UNDER_EVALUATION'].includes(String(bid.status)) ? (
            <Link href={`/bids/${bid.id}/compare`} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-[#c86413] bg-[#fff7ed] px-3 text-xs font-black text-[#9a4a0f] transition hover:bg-[#ffedd5]">
              <Gavel className="h-3.5 w-3.5" /> Compare Bids
            </Link>
          ) : (
            <Link href={participationHref || `/bids/${bid.id}/participate`} className="inline-flex h-9 flex-1 items-center justify-center gap-2 rounded-md border border-[#c86413] bg-[#fff7ed] px-3 text-xs font-black text-[#9a4a0f] transition hover:bg-[#ffedd5]">
              <Send className="h-3.5 w-3.5" /> {participationLabel}
            </Link>
          )}
          <button className="inline-flex h-9 items-center justify-center gap-2 rounded-md border border-slate-200 px-3 text-xs font-black text-slate-600 hover:bg-slate-50">
            <Download className="h-3.5 w-3.5" /> Docs
          </button>
        </div>
      </div>
    </article>
  );
}

export function LifecycleTracker({ current }: { current: string }) {
  const activeIndex = Math.max(0, lifecycleLabels.findIndex(label => label.includes(current.split(' ')[0])));
  return (
    <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {lifecycleLabels.map((label, index) => {
        const done = index <= activeIndex || current === 'Awarded';
        return (
            <div key={label} className={`rounded-lg border p-3 transition ${done ? 'border-emerald-200 bg-emerald-50 shadow-sm' : 'border-slate-200 bg-white'}`}>
            <div className={`mb-2 flex h-7 w-7 items-center justify-center rounded-full ${done ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-400'}`}>
              <CheckCircle2 className="h-4 w-4" />
            </div>
            <p className={`text-[11px] font-black leading-snug ${done ? 'text-emerald-800' : 'text-slate-500'}`}>{label}</p>
          </div>
        );
      })}
    </div>
  );
}

export function ResultsTable({ rows }: { rows: BidResultRow[] }) {
  return (
    <div className="table-shell">
      <div className="table-shell-scroller">
        <table className="min-w-[860px] w-full text-xs">
          <thead className="bg-slate-50 text-[10px] uppercase tracking-wider text-slate-500">
            <tr>
              {['Sr. No.', 'Seller name', 'Seller type', 'Offered item', 'Total price', 'Rank', 'Status'].map(head => <th key={head} className="px-4 py-3 font-black">{head}</th>)}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map((row, index) => (
              <tr key={row.sellerName} className="bg-white transition hover:bg-blue-50/50">
                <td className="px-4 py-3 font-bold text-slate-500">{index + 1}</td>
                <td className="px-4 py-3 font-black text-slate-800">{row.sellerName}</td>
                <td className="px-4 py-3">{row.sellerType}</td>
                <td className="px-4 py-3">{row.offeredItem}</td>
                <td className="px-4 py-3 font-black text-[#0b2447]">{row.totalPrice ? money(row.totalPrice) : 'Pending'}</td>
                <td className="px-4 py-3"><StatusBadge label={row.finalRank} /></td>
                <td className="px-4 py-3"><StatusBadge label={row.resultStatus} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function EmptyState({ onReset }: { onReset: () => void }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-14 text-center shadow-sm">
      <Search className="mx-auto h-10 w-10 text-slate-300" />
      <p className="mt-3 text-sm font-black text-slate-700">No bids match these filters</p>
      <p className="mt-1 text-xs text-slate-500">Clear filters or search for another buyer, category, location, or status.</p>
      <button onClick={onReset} className="mt-4 inline-flex h-9 items-center gap-2 rounded-md bg-[#0b2447] px-4 text-xs font-black text-white">
        Reset filters <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ProcurementLoadingState({ message = 'Loading live procurement data...' }: { message?: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
      <Loader2 className="mx-auto h-9 w-9 animate-spin text-[#0b2447]" />
      <p className="mt-3 text-sm font-black text-slate-700">{message}</p>
      <p className="mt-1 text-xs text-slate-500">Fetching the latest records.</p>
    </div>
  );
}

export function ProcurementErrorState({ message = 'Unable to load bids right now.', onRetry }: { message?: string; onRetry: () => void }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-12 text-center shadow-sm">
      <AlertTriangle className="mx-auto h-9 w-9 text-red-600" />
      <p className="mt-3 text-sm font-black text-red-800">{message}</p>
      <p className="mt-1 text-xs text-red-700/80">The live backend response could not be loaded. Please retry after checking the server connection.</p>
      <button onClick={onRetry} className="mt-4 inline-flex h-9 items-center justify-center rounded-md bg-red-600 px-4 text-xs font-black text-white">
        Retry
      </button>
    </div>
  );
}

export function ProcurementEmptyState({ title = 'No bids available currently.', message = 'Live procurement records will appear here once they are published.', action }: { title?: string; message?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-slate-300 bg-white px-4 py-12 text-center shadow-sm">
      <Search className="mx-auto h-9 w-9 text-slate-300" />
      <p className="mt-3 text-sm font-black text-slate-700">{title}</p>
      <p className="mt-1 text-xs text-slate-500">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ClarificationButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-xs font-black text-slate-700 hover:bg-slate-50">
      <MessageSquareText className="h-4 w-4 text-[#0b2447]" /> Clarification history
    </button>
  );
}

export interface TimelineStage {
  name: string;
  label: string;
  time: string | null;
  user: { name: string; role: string } | null;
  status: 'completed' | 'current' | 'pending';
}

export function ProcurementTimelineTracker({ stages }: { stages: TimelineStage[] }) {
  if (!stages || stages.length === 0) return null;

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
      {stages.map((stage, idx) => {
        const isDone = stage.status === 'completed';
        const isCurrent = stage.status === 'current';
        
        return (
          <div
            key={stage.name}
            className="relative animate-in fade-in slide-in-from-bottom-2 duration-300"
            style={{ animationDelay: `${idx * 75}ms` }}
          >
            {/* Stage content */}
            <div className={`h-full rounded-2xl border p-4 shadow-sm transition-all duration-300 hover:scale-[1.01] hover:shadow-md ${
              isDone ? 'border-emerald-100 bg-emerald-50/20 hover:bg-emerald-50' :
              isCurrent ? 'border-blue-300 bg-blue-50/30 ring-1 ring-blue-200 shadow-[0_4px_12px_rgba(59,130,246,0.06)]' :
              'border-slate-200/80 bg-white opacity-85 hover:opacity-100'
            }`}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 min-w-0">
                  <span className={`inline-block h-2 w-2 rounded-full shrink-0 ${
                    isDone ? 'bg-emerald-500 animate-pulse' : isCurrent ? 'bg-blue-500 animate-ping' : 'bg-slate-300'
                  }`} />
                  <span className={`text-[10px] font-black uppercase tracking-wider truncate ${
                    isDone ? 'text-emerald-700' : isCurrent ? 'text-blue-700' : 'text-slate-400'
                  }`}>
                    {stage.name}
                  </span>
                </div>
                <span className={`rounded-md px-2 py-0.5 text-[9px] font-black uppercase tracking-wide shrink-0 border ${
                  isDone ? 'bg-emerald-50 text-emerald-850 text-emerald-800 border-emerald-200' : 
                  isCurrent ? 'bg-blue-50 text-blue-800 border-blue-200' : 
                  'bg-slate-50 text-slate-500 border-slate-200'
                }`}>
                  {stage.status}
                </span>
              </div>
              <h4 className="mt-2 text-xs font-black text-slate-900 leading-snug">{stage.label}</h4>
              
              {stage.time && (
                <div className="mt-3 flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <Clock className="h-3.5 w-3.5 text-slate-400" />
                  <span>{new Date(stage.time).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              )}

              {stage.user && (
                <div className="mt-1 flex items-center gap-1.5 text-[10px] font-bold text-slate-500">
                  <User className="h-3.5 w-3.5 text-slate-400" />
                  <span className="truncate max-w-[120px]">{stage.user.name} ({stage.user.role.toUpperCase()})</span>
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
