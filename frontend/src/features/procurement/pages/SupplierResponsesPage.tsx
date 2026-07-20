'use client';

import React, { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  FileText,
  Clock,
  Gavel,
  Users,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Filter,
  IndianRupee,
  AlertTriangle,
  XCircle,
  Tag,
  Layers,
  Building2,
  ShoppingCart,
  TrendingUp,
  Package,
  MapPin,
  ShieldCheck,
  ArrowRight
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../../hooks/useAuth';
import { procurementBidApi } from '../../procurementBid/api';
import { marketplaceApi } from '../../marketplace/api';
import { formatDate } from '../../shared/format';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';
import { EmptyState, LoadingState } from '../../shared/FeatureStates';

const formatCurrency = (value: number | string | null | undefined) => {
  const num = Number(value || 0);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  return `₹${num.toLocaleString('en-IN')}`;
};

const TYPE_FILTERS = [
  { key: '', label: 'All Types' },
  { key: 'RFQ', label: 'RFQ' },
  { key: 'RFP', label: 'RFP' },
  { key: 'Reverse Auction', label: 'Reverse Auction' },
  { key: 'Cart Checkout', label: 'Cart Checkout' },
  { key: 'OpenTender', label: 'OpenTender' },
  { key: 'Draft', label: 'Draft' },
  { key: 'Rate Contract', label: 'Rate Contract' },
  { key: 'Limited Tender', label: 'Limited Tender' },
  { key: 'Repeat order', label: 'Repeat order' },
];

const getConsolidatedType = (b: any): string => {
  const status = String(b.status || '').toLowerCase();
  const approvalStatus = String(b.approvalStatus || '').toLowerCase();
  const title = String(b.title || '').toLowerCase();
  
  // Try checking bidType, procurementType, method, type
  const pt = String(b.procurementType || '').toLowerCase();
  const bt = String(b.bidType || '').toLowerCase();
  const rawType = String(b.type || '').toLowerCase();
  const rawMethod = String(b.method || '').toLowerCase();

  // 1. Draft
  if (status === 'draft' || approvalStatus === 'draft' || title.includes('draft')) {
    return 'Draft';
  }
  // 2. RFQ
  if (pt.includes('rfq') || bt.includes('rfq') || rawType.includes('rfq') || rawMethod.includes('rfq')) {
    return 'RFQ';
  }
  // 3. RFP
  if (pt.includes('rfp') || pt.includes('rfi') || bt.includes('rfp') || bt.includes('rfi') || rawType.includes('rfp') || rawType.includes('rfi') || rawMethod.includes('rfp') || rawMethod.includes('rfi')) {
    return 'RFP';
  }
  // 4. Reverse Auction
  if (pt.includes('auction') || bt.includes('auction') || rawType.includes('auction') || rawMethod.includes('auction')) {
    return 'Reverse Auction';
  }
  // 5. Cart Checkout
  if (pt.includes('cart') || pt.includes('checkout') || bt.includes('cart') || bt.includes('checkout') || rawType.includes('cart') || rawType.includes('checkout')) {
    return 'Cart Checkout';
  }
  // 6. OpenTender
  if (pt.includes('open') || pt.includes('tender') || bt.includes('open') || bt.includes('tender') || rawType.includes('open') || rawType.includes('tender')) {
    return 'OpenTender';
  }
  // 7. Rate Contract
  if (pt.includes('rate') || bt.includes('rate') || rawType.includes('rate') || rawMethod.includes('rate')) {
    return 'Rate Contract';
  }
  // 8. Limited Tender
  if (pt.includes('limited') || bt.includes('limited') || rawType.includes('limited') || rawMethod.includes('limited')) {
    return 'Limited Tender';
  }
  // 9. Repeat order
  if (pt.includes('repeat') || bt.includes('repeat') || rawType.includes('repeat') || rawMethod.includes('repeat')) {
    return 'Repeat order';
  }

  return 'RFQ';
};

const TYPE_BADGE_STYLES: Record<string, string> = {
  'RFQ': 'border-blue-200 bg-blue-50 text-blue-800',
  'RFP': 'border-indigo-200 bg-indigo-50 text-indigo-800',
  'Reverse Auction': 'border-indigo-200 bg-indigo-50 text-indigo-800',
  'Cart Checkout': 'border-violet-200 bg-violet-50 text-violet-800',
  'OpenTender': 'border-emerald-200 bg-emerald-50 text-emerald-800',
  'Draft': 'border-slate-200 bg-slate-50 text-slate-700',
  'Rate Contract': 'border-teal-200 bg-teal-50 text-teal-800',
  'Limited Tender': 'border-amber-200 bg-amber-50 text-amber-800',
  'Repeat order': 'border-pink-200 bg-pink-50 text-pink-850 text-pink-800',
};

const getTypeIcon = (type: string) => {
  switch (type) {
    case 'RFQ': return Tag;
    case 'RFP': return Layers;
    case 'Reverse Auction': return TrendingUp;
    case 'Cart Checkout': return ShoppingCart;
    case 'OpenTender': return Building2;
    case 'Draft': return FileText;
    case 'Rate Contract': return ShieldCheck;
    case 'Limited Tender': return Users;
    case 'Repeat order': return RefreshCw;
    default: return Package;
  }
};

export default function SupplierResponsesPage() {
  const { user } = useAuth();

  // Filters
  type StatusTab = 'All' | 'Open' | 'Under Evaluation' | 'Awarded' | 'Closed';
  const [activeTab, setActiveTab] = useState<StatusTab>('All');
  const [typeFilter, setTypeFilter] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useResponsiveViewMode('supplier-responses:view-mode');

  // Debounce search
  React.useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const fetchBids = async () => {
    const [bidsData, reqsData] = await Promise.allSettled([
      procurementBidApi.getBuyerBids(),
      marketplaceApi.getRequirements({ pageSize: 50 })
    ]);
    const bids = bidsData.status === 'fulfilled' ? bidsData.value : [];
    const requirements = reqsData.status === 'fulfilled'
      ? reqsData.value?.requirements || reqsData.value?.items || reqsData.value || []
      : [];
    const buyerRequirements = (requirements || []).filter(
      (r: any) => r.buyerId === user?.id || r.buyerOrganization?.id === user?.organizationId
    );
    const bidTitles = new Set(bids.map((b: any) => (b.title || '').trim().toLowerCase()));
    const uniqueRequirements = buyerRequirements.filter((req: any) => {
      const title = (req.title || '').trim().toLowerCase();
      return !bidTitles.has(title);
    });
    const normalizedRequirements = uniqueRequirements.map((req: any) => {
      const realId = req.sourceId || Math.abs(Number(req.id));
      return {
        id: `req-${realId}`,
        title: req.title || 'Marketplace Requirement',
        itemName: req.title || 'Marketplace Requirement',
        buyerName: req.buyerOrganization?.organizationName || 'You',
        estimatedValue: req.budgetMax || req.budgetMin,
        status: req.status === 'PUBLISHED' ? 'Open' : req.status === 'CLOSED' ? 'Closed' : req.status === 'AWARDED' ? 'Awarded' : 'Open',
        participantsCount: req._count?.responses || req.responsesCount || 0,
        endDate: req.lastDate,
        startDate: req.approvedAt || req.createdAt,
        procurementType: req.canonicalMethod || req.procurementMethod || 'RFQ',
        bidType: 'Product',
        isMarketplaceRequirement: true,
        requirementId: realId,
      };
    });
    return [...bids, ...normalizedRequirements];
  };

  const { data: bids = [], isLoading: loading, isError, error: queryError, refetch, isFetching } = useQuery<any[]>({
    queryKey: ['supplier-responses', user?.id],
    queryFn: fetchBids,
    staleTime: 60_000,
    enabled: !!user?.id,
  });

  const error = isError ? (queryError as any)?.message || 'Unable to load supplier responses.' : '';
  const refreshing = isFetching && !loading;

  const handleViewResponses = (bid: any) => {
    if (bid.isMarketplaceRequirement) {
      const method = String(bid.procurementType || '').toUpperCase();
      if (method === 'REVERSE_AUCTION' || method.includes('AUCTION')) {
        window.location.href = `/reverse-auctions/${bid.requirementId}`;
      } else {
        window.location.href = `/marketplace/requirements/${bid.requirementId}`;
      }
    } else {
      window.location.href = `/bids/${bid.id}`;
    }
  };

  // KPI metrics
  const kpis = useMemo(() => {
    const total = bids.length;
    const open = bids.filter(b => b.status === 'Open').length;
    const underEval = bids.filter(b => b.status === 'Under Evaluation').length;
    const awarded = bids.filter(b => b.status === 'Awarded').length;
    const closed = bids.filter(b => b.status === 'Closed').length;
    const totalParticipants = bids.reduce((s, b) => s + (b.participantsCount || 0), 0);
    const totalValue = bids.reduce((s, b) => s + (b.estimatedValue || 0), 0);
    return { total, open, underEval, awarded, closed, totalParticipants, totalValue };
  }, [bids]);

  // Filtered & sorted bids
  const filteredBids = useMemo(() => {
    const text = debouncedSearch.toLowerCase();
    let items = bids.filter(bid => {
      // Tab filter
      if (activeTab !== 'All' && bid.status !== activeTab) return false;
      // Type filter
      if (typeFilter && getConsolidatedType(bid) !== typeFilter) return false;
      // Search
      if (text) {
        const haystack = [bid.id, bid.title, bid.itemName, bid.buyerName, bid.category, bid.location].join(' ').toLowerCase();
        if (!haystack.includes(text)) return false;
      }
      return true;
    });

    // Sort
    items.sort((a, b) => {
      if (sortBy === 'newest') return new Date(b.startDate).getTime() - new Date(a.startDate).getTime();
      if (sortBy === 'oldest') return new Date(a.startDate).getTime() - new Date(b.startDate).getTime();
      if (sortBy === 'value_high') return (b.estimatedValue || 0) - (a.estimatedValue || 0);
      if (sortBy === 'value_low') return (a.estimatedValue || 0) - (b.estimatedValue || 0);
      if (sortBy === 'responses') return (b.participantsCount || 0) - (a.participantsCount || 0);
      if (sortBy === 'title_asc') return (a.title || '').localeCompare(b.title || '');
      if (sortBy === 'closing') return new Date(a.endDate).getTime() - new Date(b.endDate).getTime();
      return 0;
    });

    return items;
  }, [bids, activeTab, typeFilter, debouncedSearch, sortBy]);

  const statusColor = (status: string) => {
    if (status === 'Open') return 'border-blue-200 bg-blue-50 text-blue-700';
    if (status === 'Under Evaluation') return 'border-amber-200 bg-amber-50 text-amber-700';
    if (status === 'Awarded') return 'border-green-200 bg-green-50 text-green-700';
    if (status === 'Closed') return 'border-slate-200 bg-slate-50 text-slate-600';
    return 'border-slate-200 bg-slate-50 text-slate-600';
  };

  const stageColor = (stage: string) => {
    if (stage === 'Technical Evaluation') return 'bg-amber-100 text-amber-800';
    if (stage === 'Financial Evaluation') return 'bg-indigo-100 text-indigo-800';
    if (stage === 'Qualified') return 'bg-emerald-100 text-emerald-800';
    if (stage === 'Awarded') return 'bg-green-100 text-green-800';
    return 'bg-slate-100 text-slate-600';
  };

  if (loading) return <LoadingState label="Loading your procurement responses..." />;

  return (
    <div className="mx-auto max-w-[1560px] space-y-5 px-4 pb-12">
      {/* ── Transparent Header ── */}
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#12335f]">Procurement Control</p>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 mt-1">Supplier Responses</h1>
            <p className="mt-1 text-sm font-semibold text-slate-500">Track bids, quotes, and proposals received from suppliers across your procurements.</p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => refetch()} className="h-10 rounded-lg text-xs font-black uppercase shadow-sm bg-white hover:bg-slate-50 border-slate-200">
              <RefreshCw className={cn("mr-2 h-4 w-4 text-[#12335f]", refreshing && "animate-spin")} />Refresh
            </Button>
          </div>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-6">
        <KpiCard
          label="Total Procurements"
          value={kpis.total}
          icon={FileText}
          isActive={activeTab === 'All'}
          onClick={() => setActiveTab('All')}
          activeColorClass="border-blue-500 bg-blue-50/20 ring-1 ring-blue-500/25 text-blue-650"
          inactiveColorClass="text-blue-600 bg-blue-50 hover:bg-blue-100"
          valueColorClass="text-blue-800"
        />
        <KpiCard
          label="Open"
          value={kpis.open}
          icon={Clock}
          isActive={activeTab === 'Open'}
          onClick={() => setActiveTab('Open')}
          activeColorClass="border-sky-500 bg-sky-50/20 ring-1 ring-sky-500/25 text-sky-600"
          inactiveColorClass="text-sky-600 bg-sky-50 hover:bg-sky-100"
          valueColorClass="text-sky-700"
        />
        <KpiCard
          label="Under Evaluation"
          value={kpis.underEval}
          icon={Gavel}
          isActive={activeTab === 'Under Evaluation'}
          onClick={() => setActiveTab('Under Evaluation')}
          activeColorClass="border-amber-500 bg-amber-50/20 ring-1 ring-amber-500/25 text-amber-600"
          inactiveColorClass="text-amber-600 bg-amber-50 hover:bg-amber-100"
          valueColorClass="text-amber-700"
        />
        <KpiCard
          label="Awarded"
          value={kpis.awarded}
          icon={CheckCircle2}
          isActive={activeTab === 'Awarded'}
          onClick={() => setActiveTab('Awarded')}
          activeColorClass="border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-500/25 text-emerald-650"
          inactiveColorClass="text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
          valueColorClass="text-emerald-700"
        />
        <KpiCard
          label="Total Responses"
          value={kpis.totalParticipants}
          icon={Users}
          activeColorClass="border-violet-500 bg-violet-50/20 ring-1 ring-violet-500/25 text-violet-600"
          inactiveColorClass="text-violet-600 bg-violet-50 hover:bg-violet-100"
          valueColorClass="text-violet-700"
        />
        <KpiCard
          label="Total Value"
          value={formatCurrency(kpis.totalValue)}
          icon={IndianRupee}
          activeColorClass="border-purple-500 bg-purple-50/20 ring-1 ring-purple-500/25 text-purple-650"
          inactiveColorClass="text-purple-600 bg-purple-50 hover:bg-purple-100"
          valueColorClass="text-purple-700"
        />
      </div>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-55/10 p-4 text-xs font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0 text-red-500" />
          <span>{error}</span>
          <Button variant="outline" onClick={() => refetch()} className="ml-auto h-8 text-[10px] font-black uppercase rounded-lg border-red-200 hover:bg-red-50">Retry</Button>
        </div>
      )}

      {/* ── Filter Bar (border-y) ── */}
      <div className="flex flex-wrap items-center gap-3 border-y border-slate-200 bg-slate-50/50 px-4 py-3">
        <div className="relative min-w-[200px] flex-1 max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by title..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20 shadow-sm"
          />
        </div>

        <select
          value={typeFilter}
          onChange={e => setTypeFilter(e.target.value)}
          className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20 shadow-sm cursor-pointer"
        >
          {TYPE_FILTERS.map(f => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </select>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value)}
          className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20 shadow-sm cursor-pointer"
        >
          <option value="newest">Newest First</option>
          <option value="oldest">Oldest First</option>
          <option value="value_high">Value: High to Low</option>
          <option value="value_low">Value: Low to High</option>
          <option value="responses">Most Responses</option>
          <option value="closing">Closing Soon</option>
          <option value="title_asc">Title A-Z</option>
        </select>

        <div className="flex items-center gap-3 ml-auto">
          {!!(typeFilter || searchTerm || activeTab !== 'All') && (
            <button
              type="button"
              onClick={() => {
                setTypeFilter('');
                setSearchTerm('');
                setActiveTab('All');
              }}
              className="text-xs font-black text-rose-600 hover:text-rose-800 transition-colors uppercase tracking-wider pr-2 cursor-pointer border-none bg-transparent"
            >
              Reset
            </button>
          )}
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Content */}
      {filteredBids.length === 0 ? (
        <EmptyState
          title="No Supplier Responses Found"
          description={searchTerm || activeTab !== 'All'
            ? 'No procurements match the current filters.'
            : 'Your published procurements will appear here once suppliers start responding.'}
        />
      ) : (
        <>
          {/* ═══ LIST VIEW ═══ */}
          {viewMode === 'list' && (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-slate-50/20 p-2 shadow-sm">
              <table className="w-full min-w-[950px] border-separate border-spacing-y-2 text-left">
                <thead>
                  <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3 text-center w-16">Sr. No.</th>
                    <th className="px-4 py-3 w-32">Type</th>
                    <th className="px-4 py-3 w-96">Title & Reference</th>
                    <th className="px-4 py-3 w-36">Status</th>
                    <th className="px-4 py-3 w-36">Est. Value</th>
                    <th className="px-4 py-3 w-40">Responses</th>
                    <th className="px-4 py-3 w-32">Closing Date</th>
                    <th className="px-4 py-3 text-right w-32">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredBids.map((bid, idx) => {
                    const typeVal = getConsolidatedType(bid);
                    const TypeIcon = getTypeIcon(typeVal);
                    return (
                      <tr
                        key={bid.id}
                        className="bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)] transition hover:shadow-md align-middle cursor-pointer"
                        onClick={() => handleViewResponses(bid)}
                      >
                        {/* Serial Number */}
                        <td className="rounded-l-xl px-4 py-4 text-xs font-black text-slate-400 text-center">
                          {String(idx + 1).padStart(2, '0')}
                        </td>

                        {/* Type Badge */}
                        <td className="px-4 py-4">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border",
                            TYPE_BADGE_STYLES[typeVal] || 'border-slate-200 bg-slate-50 text-slate-700'
                          )}>
                            <TypeIcon className="h-3.5 w-3.5 shrink-0" />
                            {typeVal}
                          </span>
                        </td>

                        {/* Title & Reference */}
                        <td className="px-4 py-4 space-y-1">
                          {bid.location && (
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-slate-400">
                                <MapPin className="h-3 w-3 shrink-0" />
                                {bid.location}
                              </span>
                            </div>
                          )}
                          <p className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                            {bid.title}
                          </p>
                          {bid.category && (
                            <p className="text-[10px] font-semibold text-slate-400 line-clamp-1">
                              Category: {bid.category}
                            </p>
                          )}
                        </td>

                        {/* Status / Stage */}
                        <td className="px-4 py-4 space-y-1">
                          <span className={cn('inline-flex whitespace-nowrap rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wide border', statusColor(bid.status))}>
                            {bid.status}
                          </span>
                          {bid.currentStage && bid.currentStage !== 'Pending' && (
                            <span className={cn('block text-[8px] font-bold uppercase text-slate-400 mt-1', stageColor(bid.currentStage))}>
                              {bid.currentStage}
                            </span>
                          )}
                        </td>

                        {/* Est Value */}
                        <td className="px-4 py-4">
                          <span className="text-xs font-extrabold text-slate-900 block">
                            {formatCurrency(bid.estimatedValue)}
                          </span>
                        </td>

                        {/* Responses */}
                        <td className="px-4 py-4">
                          <span className={cn(
                            'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[9px] font-black border',
                            (bid.participantsCount || 0) > 0 ? 'border-green-200 bg-green-50/20 text-green-700' : 'border-slate-200 bg-slate-50 text-slate-500'
                          )}>
                            <Users className="h-3 w-3 shrink-0" />
                            {bid.participantsCount || 0} responses
                          </span>
                        </td>

                        {/* Closing Date */}
                        <td className="px-4 py-4 text-xs font-bold text-slate-500 whitespace-nowrap">
                          {formatDate(bid.endDate)}
                        </td>

                        {/* Actions */}
                        <td className="rounded-r-xl px-4 py-4 text-right">
                          <Button
                            onClick={(e) => { e.stopPropagation(); handleViewResponses(bid); }}
                            className="inline-flex h-8 min-w-[90px] items-center justify-center rounded-lg bg-blue-600 px-3 text-center text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-all duration-200 border-none cursor-pointer"
                          >
                            View
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* ═══ GRID VIEW ═══ */}
          {viewMode === 'grid' && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {filteredBids.map(bid => {
                const typeVal = getConsolidatedType(bid);
                return (
                  <div
                    key={bid.id}
                    onClick={() => handleViewResponses(bid)}
                    className={cn(
                      "rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-all duration-300 border-slate-200/80 hover:border-slate-350 flex flex-col justify-between min-h-[220px] cursor-pointer"
                    )}
                  >
                    <div className="space-y-3">
                      {/* Top row: Badges */}
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "inline-flex rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border whitespace-nowrap",
                          TYPE_BADGE_STYLES[typeVal] || 'border-slate-200 bg-slate-50 text-slate-700'
                        )}>
                          {typeVal}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                        {bid.title}
                      </h3>

                      {/* Category & Location */}
                      <div className="text-[11px] text-slate-500 font-bold space-y-1">
                        {bid.category && <p className="line-clamp-1">Category: {bid.category}</p>}
                        {bid.location && (
                          <p className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                            <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                            {bid.location}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-4 space-y-3">
                      {/* Status & Responses */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Status</p>
                          <div className="mt-1">
                            <span className={cn('inline-flex rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wide border', statusColor(bid.status))}>
                              {bid.status}
                            </span>
                          </div>
                        </div>

                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Est. Value</p>
                          <div className="mt-1">
                            <span className="text-xs font-extrabold text-slate-900 block">
                              {formatCurrency(bid.estimatedValue)}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Responses</p>
                          <span className="text-xs font-extrabold text-slate-800 block mt-0.5">
                            {bid.participantsCount || 0}
                          </span>
                        </div>
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Closing</p>
                          <span className="text-xs font-bold text-slate-600 block mt-0.5">
                            {formatDate(bid.endDate)}
                          </span>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); handleViewResponses(bid); }}
                          className="inline-flex h-8 w-full items-center justify-center rounded-lg bg-blue-600 px-3 text-center text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-all duration-200 border-none cursor-pointer"
                        >
                          View Responses
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: React.ComponentType<{ className?: string }>;
  isActive?: boolean;
  onClick?: () => void;
  activeColorClass: string;
  inactiveColorClass: string;
  valueColorClass: string;
}

function KpiCard({
  label,
  value,
  icon: Icon,
  isActive = false,
  onClick,
  activeColorClass,
  inactiveColorClass,
  valueColorClass,
}: KpiCardProps) {
  const isClickable = !!onClick;
  return (
    <div
      onClick={onClick}
      className={cn(
        'flex flex-col justify-between rounded-2xl border p-4 shadow-sm transition-all duration-200 min-h-[92px]',
        isClickable ? 'cursor-pointer' : '',
        isActive
          ? cn('bg-white border-transparent ring-2', activeColorClass)
          : 'bg-white border-slate-200/80 hover:border-slate-350'
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-black uppercase tracking-wider text-slate-450 leading-tight">
          {label}
        </p>
        <div
          className={cn(
            'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border transition-all duration-200',
            isActive ? activeColorClass : inactiveColorClass
          )}
        >
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <p className={cn('mt-2 text-lg font-black tracking-tight leading-none', valueColorClass)}>
        {value}
      </p>
    </div>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-250 bg-slate-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-xs font-bold text-slate-800">{value || '-'}</p>
    </div>
  );
}
