'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  PlusCircle,
  ClipboardList,
  FileText,
  CheckSquare,
  Globe,
  MessageSquare,
  Award,
  Package,
  ShoppingCart,
  BarChart3,
  Filter,
  RefreshCw,
  FolderOpen,
  ArrowRight,
  Eye,
  Calendar,
  Search,
  Building2,
  MapPin,
  ClipboardCheck,
  Layers,
  ShieldCheck,
  Clock
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { useQuery } from '@tanstack/react-query';
import { api, unwrapApiData } from '../../../lib/api';
import { useAuth } from '../../../hooks/useAuth';
import { cn } from '../../../lib/utils';
import {
  EmptyState,
  ProcurementStatusBadge,
  BuyerTypeBadge,
  MethodBadge,
  SectionCard
} from '../../procurementWizard/components/SourcingWizardComponents';

interface NormalizedProcurement {
  id: number;
  type: string;
  typeLabel: string;
  title: string;
  referenceNumber: string;
  status: string;
  statusLabel: string;
  statusGroup: string;
  method: string;
  methodLabel: string;
  estimatedValue: number;
  category: string;
  createdAt: string;
  updatedAt: string;
  actionUrl: string;
  startDate?: string;
  endDate?: string;
  quantity?: string;
  unit?: string;
  organizationName?: string;
  responsesCount?: number;
}

const formatCurrency = (val: number) => {
  if (!val) return '—';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0
  }).format(val);
};

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleDateString('en-IN', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return value;
  }
};

export default function BuyerProcurementHub() {
  const { token, user } = useAuth();
  const router = useRouter();
  const authHeaders = useMemo(() => (token ? { Authorization: `Bearer ${token}` } : {}), [token]) as Record<string, string>;

  // Detect buyer type workflow
  const buyerType = useMemo<'PRIVATE_BUYER' | 'GOVERNMENT_BUYER' | null>(() => {
    if (!user) return null;
    const u = user as any;
    const orgType = u?.buyerProfile?.organizationType || u?.organization?.organizationType || u?.organizationType || '';
    if (!orgType) return null;
    const isGov = String(orgType).toUpperCase().includes('GOVT') ||
      String(orgType).toUpperCase().includes('GOVERNMENT') ||
      String(orgType).toUpperCase().includes('MINISTRY') ||
      String(orgType).toUpperCase().includes('DEPT') ||
      String(orgType).toUpperCase().includes('PSU');
    return isGov ? 'GOVERNMENT_BUYER' : 'PRIVATE_BUYER';
  }, [user]);

  // Filters state
  const [buyerTypeFilter, setBuyerTypeFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [departmentFilter, setDepartmentFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [startDateFilter, setStartDateFilter] = useState('');
  const [endDateFilter, setEndDateFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch unified summary metrics
  const { data: summary, isLoading: isSummaryLoading, refetch: refetchSummary } = useQuery({
    queryKey: ['buyer-procurement-hub-summary'],
    queryFn: async () => {
      const res = await api.fetch('/api/dashboard/summary', { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch summary');
      const json = await res.json();
      return unwrapApiData<any>(json);
    },
    enabled: !!token,
    staleTime: 30000
  });

  // Fetch procurements list
  const { data: listResponse, isLoading: isListLoading, refetch: refetchList } = useQuery({
    queryKey: ['buyer-procurement-hub-list', buyerTypeFilter, methodFilter, statusFilter, categoryFilter],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (methodFilter) params.set('method', methodFilter);
      
      const res = await api.fetch(`/api/buyer/my-procurements?${params.toString()}`, { headers: authHeaders });
      if (!res.ok) throw new Error('Failed to fetch procurements');
      const json = await res.json();
      return unwrapApiData<any>(json);
    },
    enabled: !!token,
    staleTime: 30000
  });

  const allProcurements = useMemo<NormalizedProcurement[]>(() => {
    return listResponse?.procurements || [];
  }, [listResponse]);

  // Apply frontend filtering for department, buyer type, dates, and search query
  const filteredProcurements = useMemo(() => {
    let list = [...allProcurements];

    if (buyerTypeFilter) {
      list = list.filter(p => {
        // Infer or check buyer type
        const isGovType = p.typeLabel.toLowerCase().includes('bid') || p.type.toLowerCase().includes('bid') || p.method.toLowerCase().includes('tender') || p.type.toLowerCase().includes('tender');
        if (buyerTypeFilter === 'GOVERNMENT') return isGovType;
        if (buyerTypeFilter === 'PRIVATE') return !isGovType;
        return true;
      });
    }

    if (categoryFilter) {
      list = list.filter(p => (p.category || '').toLowerCase().includes(categoryFilter.toLowerCase()));
    }

    if (departmentFilter) {
      list = list.filter(p => (p.organizationName || '').toLowerCase().includes(departmentFilter.toLowerCase()));
    }

    if (startDateFilter) {
      const start = new Date(startDateFilter);
      list = list.filter(p => p.createdAt && new Date(p.createdAt) >= start);
    }

    if (endDateFilter) {
      const end = new Date(endDateFilter);
      list = list.filter(p => p.createdAt && new Date(p.createdAt) <= end);
    }

    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      list = list.filter(p =>
        (p.title || '').toLowerCase().includes(query) ||
        (p.referenceNumber || '').toLowerCase().includes(query) ||
        String(p.id).includes(query)
      );
    }

    return list;
  }, [allProcurements, buyerTypeFilter, categoryFilter, departmentFilter, startDateFilter, endDateFilter, searchQuery]);

  const handleRefresh = () => {
    refetchSummary();
    refetchList();
  };

  // KPI calculations
  const kpis = useMemo(() => {
    const activeRateContracts = allProcurements.filter(p => p.type === 'rate_contract' && p.statusGroup === 'active').length;
    const expiredRateContracts = allProcurements.filter(p => p.type === 'rate_contract' && p.status === 'EXPIRED').length;
    
    // Dynamic Awarded Value calculation
    const awardedProcurements = allProcurements.filter(p => 
      String(p.status).toUpperCase() === 'AWARDED' || 
      String(p.statusGroup).toLowerCase() === 'awarded'
    );
    const awardedCount = awardedProcurements.length;
    const awardedSum = awardedProcurements.reduce((sum, p) => sum + (Number(p.estimatedValue) || 0), 0);
    
    const formatAwardedValue = (val: number) => {
      if (!val) return 'Rs. 0';
      if (val >= 10000000) { // 1 Crore
        return `Rs. ${(val / 10000000).toFixed(1)} Cr`;
      }
      if (val >= 100000) { // 1 Lakh
        return `Rs. ${(val / 100000).toFixed(1)} L`;
      }
      return `Rs. ${val.toLocaleString('en-IN')}`;
    };

    return [
      { label: 'Total Procurements', value: summary?.myTendersCount || 0, change: '+12% this month', icon: FolderOpen, color: 'text-indigo-600 bg-indigo-50 border-indigo-150' },
      { label: 'Drafts', value: summary?.cartItemCount || 0, change: 'Saved drafts', icon: FileText, color: 'text-slate-600 bg-slate-50 border-slate-150' },
      { label: 'Pending Approvals', value: summary?.pendingApprovalsCount || 0, change: 'Action required', icon: CheckSquare, color: 'text-amber-600 bg-amber-50 border-amber-150' },
      { label: 'Active Events', value: summary?.myTendersCount || 0, change: 'Live sourcing', icon: Globe, color: 'text-blue-600 bg-blue-50 border-blue-150' },
      { label: 'Active Rate Contracts', value: activeRateContracts, change: 'Available for call-off', icon: ShieldCheck, color: 'text-teal-600 bg-teal-50 border-teal-150' },
      { label: 'Expired Contracts', value: expiredRateContracts, change: 'Renewal attention', icon: Clock, color: 'text-slate-600 bg-slate-50 border-slate-150' },
      { label: 'Supplier Responses', value: summary?.myRfqsCount || 0, change: 'Pending review', icon: MessageSquare, color: 'text-cyan-600 bg-cyan-50 border-cyan-150' },
      { label: 'Awarded Value', value: formatAwardedValue(awardedSum), change: `${awardedCount} award${awardedCount === 1 ? '' : 's'} granted`, icon: Award, color: 'text-emerald-600 bg-emerald-50 border-emerald-150' },
      { label: 'Open Purchase Orders', value: summary?.myActivePOsCount || 0, change: 'Sent to sellers', icon: ShoppingCart, color: 'text-sky-600 bg-sky-50 border-sky-150' },
      { label: 'Pending Deliveries', value: summary?.grnsToApproveCount || 0, change: 'Tracking live', icon: Package, color: 'text-violet-600 bg-violet-50 border-violet-150' },
    ];
  }, [allProcurements, summary]);

  // Unified Dashboard Cards list (10 cards)
  const dashboardCards = [
    {
      title: 'Create Procurement',
      description: 'Unified guided flow for RFQ, RFP, Tenders, BOQ, PAC or Direct Sourcing.',
      href: '/buyer/procurement/create',
      cta: 'Create Sourcing Event',
      icon: PlusCircle,
      badge: 'Start Here',
      badgeColor: 'bg-[#12335f] text-white',
    },
    {
      title: 'My Procurement Requests',
      description: 'View active sourcing requests, items, methods, and status details.',
      href: '/buyer/my-procurements',
      cta: 'View Requests',
      icon: ClipboardList,
    },
    {
      title: 'Drafts',
      description: 'Resume or modify saved sourcing templates and incomplete wizard states.',
      href: '/buyer/procurement/drafts',
      cta: 'Manage Drafts',
      icon: FileText,
      count: summary?.cartItemCount || 0,
    },
    {
      title: 'Pending Approvals',
      description: 'Review and approve sourcing requests, budget checks and PAC exemptions.',
      href: '/buyer/procurement/approvals',
      cta: 'Open Approvals Queue',
      icon: CheckSquare,
      count: summary?.pendingApprovalsCount || 0,
      highlight: true,
    },
    {
      title: 'Published Events',
      description: 'Live competitive bids, tenders, reverse auctions actively open for bidding.',
      href: '/buyer/tenders',
      cta: 'View Live Bids',
      icon: Globe,
    },
    {
      title: 'Supplier Responses',
      description: 'Review quotes, clarifying queries, and files submitted by sellers.',
      href: '/buyer/procurement/responses',
      cta: 'Analyze Responses',
      icon: MessageSquare,
      count: summary?.myRfqsCount || 0,
    },
    {
      title: 'Evaluations',
      description: 'Evaluate technical packets, score criteria matrices, and run L1 comparison reports.',
      href: '/buyer/tenders',
      cta: 'Technical / Price Eval',
      icon: Layers,
    },
    {
      title: 'Awards',
      description: 'Finalize L1 recommendations and publish award notices to selected suppliers.',
      href: '/orders',
      cta: 'Grant Awards',
      icon: Award,
    },
    {
      title: 'Purchase Orders',
      description: 'Create and dispatch purchase orders linked to successful sourcing events.',
      href: '/orders',
      cta: 'View POs list',
      icon: ShoppingCart,
      count: summary?.myActivePOsCount || 0,
    },
    {
      title: 'Reports',
      description: 'MIS dashboards, procurement audit trail logs, and saving reports.',
      href: '/reports',
      cta: 'View Reports',
      icon: BarChart3,
    },
  ];

  return (
    <div className="mx-auto max-w-[1560px] space-y-6 pb-10 px-4 sm:px-6 lg:px-8">
      {/* Page Title Header */}
      <div className="border border-slate-200/60 bg-gradient-to-r from-white via-slate-50/30 to-white p-6 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#12335f]/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-widest text-[#12335f] mb-1.5">
            <span className="h-1 w-1 rounded-full bg-[#12335f] animate-pulse" />
            Buyer Dashboard
          </span>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">Procurement Command Center</h1>
          
          {/* Buyer Type Badging & Custom Helper Text */}
          {buyerType === 'PRIVATE_BUYER' ? (
            <div className="flex flex-wrap items-center gap-2.5 mt-2.5">
              <BuyerTypeBadge buyerType="PRIVATE_BUYER" />
              <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                Supports corporate sourcing workflows (RFQ, RFP, Rate Contracts, Vendor comparison sheets, and internal approval flows).
              </p>
            </div>
          ) : buyerType === 'GOVERNMENT_BUYER' ? (
            <div className="flex flex-wrap items-center gap-2.5 mt-2.5">
              <BuyerTypeBadge buyerType="GOVERNMENT_BUYER" />
              <p className="text-[11px] text-slate-500 font-bold leading-relaxed">
                Supports public procurement workflows (Open Tender, PAC single source exemption, Two-Packet bidding, compliance document auditing, and CFA approvals).
              </p>
            </div>
          ) : (
            <p className="text-[11px] text-slate-500 font-bold mt-1.5">
              Supports private and government procurement workflows.
            </p>
          )}
        </div>
        <div className="flex gap-2 shrink-0 sm:self-center">
          <Button variant="outline" size="sm" onClick={handleRefresh} className="h-9.5 rounded-xl border-slate-200/80 hover:bg-slate-50 hover:text-slate-800 text-[10px] font-black uppercase tracking-wider shadow-2xs">
            <RefreshCw className="h-3.5 w-3.5 mr-1.5" /> Refresh Data
          </Button>
          <Link href="/buyer/procurement/create">
            <Button size="sm" className="h-9.5 rounded-xl bg-gradient-to-r from-[#12335f] to-[#0f2a4f] text-white hover:opacity-95 text-[10px] font-black uppercase tracking-wider shadow-sm transition-all">
              <PlusCircle className="h-3.5 w-3.5 mr-1.5" /> Create Procurement
            </Button>
          </Link>
        </div>
      </div>
 
      {/* KPI Cards Grid */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-8">
        {kpis.map((kpi, idx) => {
          const Icon = kpi.icon;
          return (
            <Card key={idx} className="border-slate-200/80 shadow-2xs hover:shadow-xs hover:border-[#12335f]/20 hover:-translate-y-0.5 transition-all duration-300 bg-white rounded-2xl overflow-hidden">
              <CardContent className="p-4 flex flex-col justify-between h-full min-h-[110px]">
                <div className="flex justify-between items-start gap-1">
                  <span className="text-[9px] font-black uppercase text-slate-400 tracking-widest leading-normal">
                    {kpi.label}
                  </span>
                  <span className={`p-1.5 rounded-xl border shrink-0 ${kpi.color}`}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                </div>
                <div className="mt-2">
                  <span className="text-xl font-black text-slate-950 block tracking-tight">
                    {isSummaryLoading ? '...' : kpi.value}
                  </span>
                  <span className="text-[8.5px] font-black text-slate-400 mt-1 block tracking-wider uppercase">
                    {kpi.change}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Sourcing Filters panel */}
      <Card className="border-slate-200/60 bg-white shadow-2xs rounded-2xl">
        <CardContent className="p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-black text-[#12335f] uppercase tracking-wider border-b border-slate-100 pb-2">
            <Filter className="h-4 w-4" /> Filters & Controls
          </div>
          <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 lg:grid-cols-7 text-xs font-semibold text-slate-700">
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-450 mb-1">Buyer Type</label>
              <select
                value={buyerTypeFilter}
                onChange={e => setBuyerTypeFilter(e.target.value)}
                className="w-full h-9 border border-slate-200 rounded px-2 focus:outline-none focus:ring-1 focus:ring-[#12335f]"
              >
                <option value="">All Buyer Types</option>
                <option value="PRIVATE">Private Buyer</option>
                <option value="GOVERNMENT">Government Buyer</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-450 mb-1">Sourcing Method</label>
              <select
                value={methodFilter}
                onChange={e => setMethodFilter(e.target.value)}
                className="w-full h-9 border border-slate-200 rounded px-2 focus:outline-none focus:ring-1 focus:ring-[#12335f]"
              >
                <option value="">All Sourcing Methods</option>
                <option value="DIRECT_PURCHASE">Direct Purchase</option>
                <option value="RFQ">RFQ / eRFQ</option>
                <option value="RFP">RFP / Solution Proposal</option>
                <option value="TENDER">Tender / Open Bid</option>
                <option value="REVERSE_AUCTION">Reverse Auction</option>
                <option value="RATE_CONTRACT">Rate Contract</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-450 mb-1">Sourcing Status</label>
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="w-full h-9 border border-slate-200 rounded px-2 focus:outline-none focus:ring-1 focus:ring-[#12335f]"
              >
                <option value="">All Statuses</option>
                <option value="DRAFT">Draft</option>
                <option value="PENDING_APPROVAL">Pending Approval</option>
                <option value="PUBLISHED">Published / Open</option>
                <option value="EVALUATION">Technical Evaluation</option>
                <option value="AWARDED">Awarded</option>
              </select>
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-450 mb-1">Date From</label>
              <input
                type="date"
                value={startDateFilter}
                onChange={e => setStartDateFilter(e.target.value)}
                className="w-full h-9 border border-slate-200 rounded px-2 focus:outline-none focus:ring-1 focus:ring-[#12335f]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-450 mb-1">Date To</label>
              <input
                type="date"
                value={endDateFilter}
                onChange={e => setEndDateFilter(e.target.value)}
                className="w-full h-9 border border-slate-200 rounded px-2 focus:outline-none focus:ring-1 focus:ring-[#12335f]"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-450 mb-1">Buying Department</label>
              <input
                value={departmentFilter}
                onChange={e => setDepartmentFilter(e.target.value)}
                className="w-full h-9 border border-slate-200 rounded px-2.5 focus:outline-none focus:ring-1 focus:ring-[#12335f]"
                placeholder="Department name"
              />
            </div>
            <div>
              <label className="block text-[10px] font-black uppercase text-slate-450 mb-1">Item Category</label>
              <select
                value={categoryFilter}
                onChange={e => setCategoryFilter(e.target.value)}
                className="w-full h-9 border border-slate-200 rounded px-2 focus:outline-none focus:ring-1 focus:ring-[#12335f]"
              >
                <option value="">All Categories</option>
                <option value="Office Supplies">Office Supplies & Stationery</option>
                <option value="IT Hardware">IT Hardware & Software</option>
                <option value="Raw Materials">Raw Sourcing Materials</option>
                <option value="Services">Consultancy / AMC Services</option>
              </select>
            </div>
          </div>
          
          <div className="flex gap-2 items-center border-t border-slate-100 pt-3">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full h-9 pl-9 pr-4 border border-slate-200 rounded text-xs focus:outline-none focus:ring-1 focus:ring-[#12335f]"
                placeholder="Search by Title, Ref Number or ID..."
              />
            </div>
            {(buyerTypeFilter || methodFilter || statusFilter || departmentFilter || categoryFilter || startDateFilter || endDateFilter || searchQuery) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setBuyerTypeFilter('');
                  setMethodFilter('');
                  setStatusFilter('');
                  setDepartmentFilter('');
                  setCategoryFilter('');
                  setStartDateFilter('');
                  setEndDateFilter('');
                  setSearchQuery('');
                }}
                className="h-9 text-rose-600 border-rose-250 bg-rose-50/50 hover:bg-rose-50 font-black text-[10px] uppercase"
              >
                Clear Filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Sourcing Hub Main Cards Grid (10 cards) */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        {dashboardCards.map((card, idx) => {
          const Icon = card.icon;
          return (
            <Card
              key={idx}
              className={cn(
                "group border border-slate-200/80 shadow-2xs hover:shadow-sm hover:border-[#12335f]/20 hover:-translate-y-0.5 transition-all duration-300 flex flex-col justify-between bg-white relative overflow-hidden rounded-2xl",
                card.highlight ? "border-l-4 border-amber-500" : ""
              )}
            >
              {/* Premium Subtle Top Stripe */}
              <div className={cn(
                "absolute top-0 left-0 right-0 h-1",
                card.highlight 
                  ? "bg-gradient-to-r from-amber-500 to-amber-300" 
                  : "bg-gradient-to-r from-[#12335f]/30 to-slate-200/20"
              )} />
              
              <CardContent className="p-5 flex flex-col justify-between h-full min-h-[185px]">
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-[#12335f]/10 to-[#12335f]/5 text-[#12335f] transition-colors group-hover:from-[#12335f]/20">
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    {card.badge && (
                      <span className={`text-[8.5px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${card.badgeColor}`}>
                        {card.badge}
                      </span>
                    )}
                    {card.count !== undefined && card.count > 0 && (
                      <span className="h-5 min-w-[20px] px-1.5 flex items-center justify-center bg-amber-500 text-white rounded-full text-[10px] font-black">
                        {card.count}
                      </span>
                    )}
                  </div>
                  <h3 className="text-xs font-black text-slate-900 uppercase tracking-wide group-hover:text-[#12335f] transition-colors">{card.title}</h3>
                  <p className="text-[10px] text-slate-500 font-semibold leading-relaxed mt-1.5">{card.description}</p>
                </div>
                <Link href={card.href} className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3 text-[10px] font-black uppercase tracking-wider text-[#12335f] group-hover:text-[#0f2a4f] transition-colors">
                  <span>{card.cta || 'Open List'}</span>
                  <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-1" />
                </Link>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Procurement Command Center Data List / Table */}
      <SectionCard
        title="Procurement Requests"
        description="Unified command list for auditing and resuming sourcing activities."
        icon={ClipboardList}
        className="rounded-2xl border-slate-200/60 shadow-2xs"
      >
        {isListLoading ? (
          <div className="py-20 flex flex-col items-center justify-center gap-3">
            <span className="animate-spin h-8 w-8 border-2 border-[#12335f] border-t-transparent rounded-full" />
            <p className="text-xs text-slate-500 font-semibold">Loading sourcing records...</p>
          </div>
        ) : filteredProcurements.length === 0 ? (
          <EmptyState
            title="No Sourcing Events Found"
            description={
              buyerType === 'PRIVATE_BUYER'
                ? "No matching corporate RFQ, RFP, or rate contracts. Start a new procurement event using the guided sourcing setup."
                : "No matching government bids, tenders, or direct purchases found. Click below to initialize a guided compliant workflow."
            }
            actionText="Create Sourcing Event"
            onAction={() => router.push('/buyer/procurement/create')}
          />
        ) : (
          <div className="overflow-x-auto rounded-2xl border border-slate-200/60">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/50">
                  <th className="px-4 py-3 font-black uppercase text-slate-500">Procurement Number</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-500">Title</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-500">Method</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-500">Buyer Type</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-500">Category</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-500">Estimated Value</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-500">Status</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-500">Created Date</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-500">Deadline</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-500">Responses</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-500">Approval Status</th>
                  <th className="px-4 py-3 font-black uppercase text-slate-500 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-700 bg-white">
                {filteredProcurements.map(p => {
                  // Infer or determine isGov for the row
                  const isRowGov = p.typeLabel.toLowerCase().includes('bid') || p.type.toLowerCase().includes('bid') || p.method.toLowerCase().includes('tender') || p.type.toLowerCase().includes('tender');
                  
                  // Map draft to direct creation wizard link
                  const isDraft = p.statusGroup === 'draft' || p.status.toLowerCase().includes('draft');
                  const finalActionUrl = isDraft ? `/buyer/procurement/create?draftId=${p.id}` : p.actionUrl;

                  return (
                    <tr key={`${p.type}-${p.id}`} className="hover:bg-slate-50/50 transition">
                      <td className="px-4 py-3.5 font-bold text-slate-900 truncate max-w-[120px]">
                        {p.referenceNumber || `REF-${p.id}`}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-900 max-w-[200px]">
                        <span className="line-clamp-1 truncate block">{p.title}</span>
                      </td>
                      <td className="px-4 py-3.5">
                        <MethodBadge method={p.methodLabel || p.method} />
                      </td>
                      <td className="px-4 py-3.5">
                        <BuyerTypeBadge buyerType={isRowGov ? 'GOVERNMENT_BUYER' : 'PRIVATE_BUYER'} />
                      </td>
                      <td className="px-4 py-3.5 truncate max-w-[120px] text-slate-500">
                        {p.category || '—'}
                      </td>
                      <td className="px-4 py-3.5 font-bold text-slate-950 tabular-nums">
                        {formatCurrency(p.estimatedValue)}
                      </td>
                      <td className="px-4 py-3.5">
                        <ProcurementStatusBadge status={p.status} />
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">
                        {formatDateTime(p.createdAt)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-500">
                        {formatDateTime(p.endDate || p.startDate)}
                      </td>
                      <td className="px-4 py-3.5 text-slate-950 font-bold tabular-nums text-center">
                        {p.responsesCount ?? 0}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className={cn(
                          "px-2 py-0.5 rounded text-[9px] uppercase font-bold border",
                          p.statusGroup === 'draft' ? "bg-slate-100 border-slate-200 text-slate-700" :
                          p.statusGroup === 'pending_approval' ? "bg-amber-100 border-amber-250 text-amber-800" :
                          "bg-emerald-100 border-emerald-200 text-emerald-800"
                        )}>
                          {p.statusGroup.replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-right shrink-0">
                        <Link href={finalActionUrl}>
                          <Button
                            size="sm"
                            className="h-7 text-[10px] uppercase font-black tracking-wide px-3 bg-[#12335f] text-white hover:bg-[#0f2a4f] rounded"
                          >
                            <Eye className="h-3 w-3 mr-1" /> {isDraft ? 'Resume' : 'View'}
                          </Button>
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
