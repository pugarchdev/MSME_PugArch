'use client';

import React, { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import {
  UserCheck, Globe, ClipboardCheck, MessageSquare, FileText,
  Landmark, Gavel, Award, ShoppingCart, Receipt, ArrowRight,
  ClipboardList, CalendarDays, Truck, RefreshCw
} from 'lucide-react';
import { getApi } from '../../shared/apiClient';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../../hooks/useAuth';

interface DashboardSummary {
  cartItemCount?: number;
  pendingApprovalsCount?: number;
  cartApprovalsCount?: number;
  techReviewCount?: number;
  grnsToApproveCount?: number;
  activeDeliveriesCount?: number;
  // Buyer-side
  myTendersCount?: number;
  myActivePOsCount?: number;
  myPendingInvoicesCount?: number;
  myRfqsCount?: number;
  // Seller-side
  sellerOpenTendersCount?: number;
  sellerOpportunitiesCount?: number;
  sellerActivePOsCount?: number;
  sellerCatalogueItemsCount?: number;
  sellerPendingInvoicesCount?: number;
  sellerQuotationsCount?: number;
  reverseAuctionsActive?: number;
  reverseAuctionsScheduled?: number;
  reverseAuctionsClosed?: number;
  reverseAuctionInvites?: number;
  reverseAuctionsLive?: number;
  reverseAuctionBidsSubmitted?: number;
}

export default function SellerProcurementHub() {
  const router = useRouter();
  const { user } = useAuth();

  const summaryQuery = useQuery({
    queryKey: ['dashboard', 'summary'] as const,
    queryFn: () => getApi<DashboardSummary>('/api/dashboard/summary', true).catch(() => null),
    enabled: !!user && user.role === 'seller',
    staleTime: 15_000,
    refetchOnWindowFocus: true
  });

  const data: DashboardSummary = summaryQuery.data || {};
  const isLoading = summaryQuery.isLoading && !summaryQuery.data;

  // Primary Metrics Banner (Unified Row Layout)
  const summaryMetrics = useMemo(() => [
    { label: 'Bidding Opportunities', value: data.sellerOpportunitiesCount || 0, color: 'text-blue-600' },
    { label: 'Submitted Bids', value: data.sellerQuotationsCount || 0, color: 'text-emerald-600' },
    { label: 'Active POs', value: data.sellerActivePOsCount || 0, color: 'text-indigo-600' },
    { label: 'Pending Invoices', value: data.sellerPendingInvoicesCount || 0, color: 'text-rose-600' },
  ], [data]);

  // Group 1: Opportunities and Bidding Leads
  const opportunityActions = useMemo(() => [
    {
      label: 'Invited Bids',
      desc: 'Bids and auctions where buyers have explicitly invited your organization.',
      count: data.reverseAuctionInvites || 0,
      href: '/seller/procurement/events?filter=invited',
      icon: UserCheck,
      tone: 'indigo'
    },
    {
      label: 'Bidding Opportunities',
      desc: 'Review marketplace quote requests, direct inquiries, and active bidding opportunities.',
      count: data.sellerOpportunitiesCount || 0,
      href: '/seller/opportunities',
      icon: Globe,
      tone: 'blue'
    },
    {
      label: 'All Bids & Tenders',
      desc: 'All wizard-based procurement bids, RFQs, RFPs, public tenders, and rate contracts.',
      count: 0,
      href: '/seller/procurement/events',
      icon: ClipboardList,
      tone: 'indigo'
    },
    {
      label: 'Reverse Auctions',
      desc: 'Participate in live dynamic price auctions and scheduled downward bids.',
      count: data.reverseAuctionsLive || 0,
      href: '/reverse-auctions',
      icon: Gavel,
      tone: 'rose'
    },
    {
      label: 'Public Tenders',
      desc: 'Search and participate in active public buyer bids and tender publications.',
      count: 0,
      href: '/seller/tenders',
      icon: Globe,
      tone: 'slate'
    }
  ], [data]);

  // Group 2: Bid Proposals & Execution Fulfillment
  const fulfillmentActions = useMemo(() => [
    {
      label: 'Submitted Bids',
      desc: 'Manage your active quotations, bidding proposals, and technical packages.',
      count: data.sellerQuotationsCount || 0,
      href: '/quotations',
      icon: ClipboardCheck,
      tone: 'purple'
    },
    {
      label: 'Bid Clarifications',
      desc: 'Respond to buyer-initiated queries or submit request details on active bids.',
      count: 0,
      href: '/seller/procurement/events?filter=clarifications',
      icon: MessageSquare,
      tone: 'cyan'
    },
    {
      label: 'Technical Bid Pending',
      desc: 'Bids requiring technical parameters, spec compliance files, or certifications.',
      count: data.techReviewCount || 0,
      href: '/quotations',
      icon: FileText,
      tone: 'amber'
    },
    {
      label: 'Financial Bid Pending',
      desc: 'Bids requiring commercial breakdowns, price sheets, and final rate submissions.',
      count: 0,
      href: '/quotations',
      icon: Landmark,
      tone: 'amber'
    },
    {
      label: 'Awarded Orders',
      desc: 'Contracts where your organization has been recommended, finalized, or selected.',
      count: 0,
      href: '/orders',
      icon: Award,
      tone: 'emerald'
    },
    {
      label: 'Purchase Orders',
      desc: 'Accept and manage direct purchase orders issued by buyer departments.',
      count: data.sellerActivePOsCount || 0,
      href: '/orders',
      icon: ShoppingCart,
      tone: 'indigo'
    },
    {
      label: 'Fulfilment & Payments',
      desc: 'Track logistics updates, submit delivery invoices, and view payment escrow transactions.',
      count: data.sellerPendingInvoicesCount || 0,
      href: '/payments/transactions',
      icon: Receipt,
      tone: 'teal'
    }
  ], [data]);

  const toneColors: Record<string, { bg: string, text: string }> = {
    indigo: { bg: 'bg-indigo-50 border-indigo-150', text: 'text-indigo-650' },
    blue: { bg: 'bg-blue-50 border-blue-150', text: 'text-blue-650' },
    purple: { bg: 'bg-purple-50 border-purple-150', text: 'text-purple-650' },
    cyan: { bg: 'bg-cyan-50 border-cyan-150', text: 'text-cyan-650' },
    amber: { bg: 'bg-amber-50 border-amber-150', text: 'text-amber-650' },
    rose: { bg: 'bg-rose-50 border-rose-150', text: 'text-rose-650' },
    emerald: { bg: 'bg-emerald-50 border-emerald-150', text: 'text-emerald-650' },
    teal: { bg: 'bg-teal-50 border-teal-150', text: 'text-teal-650' },
    slate: { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600' }
  };

  return (
    <div className="mx-auto max-w-[1560px] space-y-6 px-4 pb-12">
      {/* Premium Header */}
      <div className="relative overflow-hidden rounded-[28px] bg-[radial-gradient(circle_at_20%_20%,#23517f_0,#12335f_42%,#07172e_100%)] p-6 text-white shadow-[0_18px_55px_rgba(15,23,42,0.18)] flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div className="pointer-events-none absolute right-[-8%] top-[-35%] h-72 w-72 rounded-full bg-emerald-400/10 blur-[80px]" />
        <div>
          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold bg-white/10 text-blue-100 border border-white/10 mb-2 uppercase tracking-wider">
            <ClipboardList className="h-3 w-3" /> Supplier Portal
          </span>
          <h1 className="text-xl font-black uppercase text-white tracking-tight">Bidding & Tenders Dashboard</h1>
          <p className="mt-1 text-xs font-semibold text-blue-100/85 max-w-2xl leading-relaxed">
            Access buyer bidding requirements, submit Bid Proposals / RFPs, participate in downward price Auctions, and manage your delivery fulfillment.
          </p>
        </div>
        <Button 
          type="button" 
          variant="outline" 
          onClick={() => summaryQuery.refetch()} 
          className="h-10 text-xs font-bold text-white bg-white/10 hover:bg-white/15 border-white/20 self-start md:self-center"
        >
          <RefreshCw className={cn('mr-1.5 h-3.5 w-3.5', isLoading && 'animate-spin')} /> Refresh
        </Button>
      </div>
 
      {/* Unified Key Metrics Banner (Less Boxy) */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {summaryMetrics.map((metric) => (
          <div key={metric.label} className="rounded-[22px] bg-white/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70">
            <span className="text-[9px] font-black uppercase tracking-wider text-slate-400">{metric.label}</span>
            {isLoading ? (
              <div className="h-6 w-12 rounded bg-slate-100 animate-pulse mt-1" />
            ) : (
              <span className={cn("text-2xl font-black tracking-tight mt-0.5", metric.color)}>
                {metric.value}
              </span>
            )}
          </div>
        ))}
      </div>
 
      {/* Modern categorized opportunity and operations list rows */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Left Side: Opportunities */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[#12335f] pl-1 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500 animate-ping" />
            Bids & Opportunities
          </h3>
          <div className="overflow-hidden rounded-[24px] bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70 divide-y divide-slate-100">
            {opportunityActions.map((card) => {
              const Icon = card.icon;
              const colors = toneColors[card.tone] || toneColors.indigo;
              return (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => router.push(card.href)}
                  className="w-full text-left p-4 hover:bg-slate-50/70 transition-all flex items-start gap-3.5 group focus:outline-none focus:bg-slate-50"
                >
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm", colors.bg, colors.text)}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase tracking-wide text-slate-900 group-hover:text-[#12335f]">{card.label}</h4>
                      {card.count > 0 && (
                        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase", colors.bg, colors.text)}>
                          {card.count} Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed mt-1">{card.desc}</p>
                  </div>
                  <div className="shrink-0 flex items-center h-9">
                    <ArrowRight className="h-4 w-4 text-slate-350 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-slate-650" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Right Side: Bid Proposals & Execution */}
        <div className="space-y-3">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-[#12335f] pl-1 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            Execution & Operations
          </h3>
          <div className="overflow-hidden rounded-[24px] bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70 divide-y divide-slate-100">
            {fulfillmentActions.map((card) => {
              const Icon = card.icon;
              const colors = toneColors[card.tone] || toneColors.indigo;
              return (
                <button
                  key={card.label}
                  type="button"
                  onClick={() => router.push(card.href)}
                  className="w-full text-left p-4 hover:bg-slate-50/70 transition-all flex items-start gap-3.5 group focus:outline-none focus:bg-slate-50"
                >
                  <div className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full border shadow-sm", colors.bg, colors.text)}>
                    <Icon className="h-4.5 w-4.5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-xs font-black uppercase tracking-wide text-slate-900 group-hover:text-[#12335f]">{card.label}</h4>
                      {card.count > 0 && (
                        <span className={cn("inline-flex items-center px-1.5 py-0.5 rounded text-[8px] font-bold uppercase", colors.bg, colors.text)}>
                          {card.count} Active
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 font-semibold leading-relaxed mt-1">{card.desc}</p>
                  </div>
                  <div className="shrink-0 flex items-center h-9">
                    <ArrowRight className="h-4 w-4 text-slate-350 transition-transform duration-200 group-hover:translate-x-1 group-hover:text-slate-650" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
