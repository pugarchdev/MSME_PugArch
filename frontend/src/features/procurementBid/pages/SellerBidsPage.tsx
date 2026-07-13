'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Search,
  RefreshCw,
  Eye,
  CheckCircle2,
  FileText,
  Clock,
  Gavel,
  Trophy,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  Filter,
  IndianRupee,
  AlertTriangle,
  XCircle,
  FileEdit
} from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Card, CardContent } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { useAuth } from '../../../hooks/useAuth';
import { procurementBidApi } from '../api';
import { formatDate } from '../../shared/format';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';
import { EmptyState, LoadingState } from '../../shared/FeatureStates';

type BidTypeFilter = 'all' | 'submitted' | 'draft' | 'awarded';

const formatCurrency = (value: number | string | null | undefined) => {
  const num = Number(value || 0);
  if (num >= 10000000) return `₹${(num / 10000000).toFixed(2)} Cr`;
  if (num >= 100000) return `₹${(num / 100000).toFixed(2)} L`;
  return `₹${num.toLocaleString('en-IN')}`;
};

export default function SellerBidsPage({ subRouteType = 'all' }: { subRouteType?: BidTypeFilter }) {
  const { user } = useAuth();
  const router = useRouter();

  // Data state
  const [participations, setParticipations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [sortBy, setSortBy] = useState('newest');
  const [viewMode, setViewMode] = useResponsiveViewMode('seller-bids:view-mode');

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => setDebouncedSearch(searchTerm), 400);
    return () => clearTimeout(handler);
  }, [searchTerm]);

  const loadData = useCallback(async (isRefresh = false) => {
    try {
      if (isRefresh) setRefreshing(true);
      else setLoading(true);
      setError('');
      
      const [bidsData, mrData] = await Promise.allSettled([
        procurementBidApi.getSellerBids(),
        procurementBidApi.getSellerMarketplaceResponses()
      ]);
      
      const bids = bidsData.status === 'fulfilled' ? bidsData.value : [];
      const marketplaceResponses = mrData.status === 'fulfilled' ? mrData.value : [];
      
      const normalizedMarketplace = (marketplaceResponses || []).map((res: any) => ({
        id: `mr-${res.id}`,
        bidId: `req-${res.requirementId}`,
        status: String(res.status || 'SUBMITTED').toUpperCase(),
        createdAt: res.createdAt,
        updatedAt: res.updatedAt,
        quotedAmount: res.offeredPrice,
        isMarketplaceResponse: true,
        requirementId: res.requirementId,
        bid: {
          id: `req-${res.requirementId}`,
          title: res.requirement?.title || res.requirement?.description || 'Quotation Response',
          itemName: res.requirement?.title || 'Quotation Response',
          buyerName: res.requirement?.buyerOrganization?.organizationName || 'Verified Buyer',
          category: res.requirement?.category?.name || 'RFQ Response',
          endDate: res.requirement?.lastDate,
          estimatedValue: res.requirement?.budgetMax || res.requirement?.budgetMin,
          status: res.requirement?.status || 'OPEN',
          lifecycleStage: 'EVALUATION'
        }
      }));
      
      setParticipations([...bids, ...normalizedMarketplace]);
    } catch (err: any) {
      console.error('[Seller Bids]', err);
      setError(err?.message || 'Unable to load your bids.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Page Header Text based on Route
  const headerContent = useMemo(() => {
    switch (subRouteType) {
      case 'submitted':
        return {
          eyebrow: 'Bids Participation',
          title: 'My Submitted Bids',
          desc: 'Monitor status, clarifications, and evaluation stages of all bids you have submitted.'
        };
      case 'draft':
        return {
          eyebrow: 'In-Progress Bids',
          title: 'Draft Bids',
          desc: 'Resume and complete your unfinished bid participations before the closing dates.'
        };
      case 'awarded':
        return {
          eyebrow: 'Contracts & Awards',
          title: 'Awarded Contracts',
          desc: 'Review procurement opportunities and tenders awarded to your organization.'
        };
      default:
        return {
          eyebrow: 'My Workspace',
          title: 'All Bid Participations',
          desc: 'Overview of all your drafted, submitted, and awarded bid activities.'
        };
    }
  }, [subRouteType]);

  // Calculate Metrics/KPIs dynamically based on sub-route
  const kpiData = useMemo(() => {
    const all = participations;
    const submitted = all.filter(p => String(p.status).toUpperCase() === 'SUBMITTED');
    const drafts = all.filter(p => String(p.status).toUpperCase() === 'DRAFT');
    const awarded = all.filter(p => p.awards && p.awards.length > 0);

    const underTech = submitted.filter(p => p.bid?.lifecycleStage === 'TECHNICAL_EVALUATION').length;
    const underFin = submitted.filter(p => p.bid?.lifecycleStage === 'FINANCIAL_EVALUATION').length;
    const totalAwardedValue = awarded.reduce((sum, p) => sum + (Number(p.quotedAmount) || Number(p.bid?.estimatedValue) || 0), 0);

    const draftsDueSoon = drafts.filter(p => {
      if (!p.bid?.endDate) return false;
      const diff = (new Date(p.bid.endDate).getTime() - Date.now()) / 86400000;
      return diff >= 0 && diff <= 7;
    }).length;

    return {
      totalAll: all.length,
      totalSubmitted: submitted.length,
      totalDrafts: drafts.length,
      totalAwarded: awarded.length,
      underTech,
      underFin,
      totalAwardedValue,
      draftsDueSoon
    };
  }, [participations]);

  // Filter and Sort participations
  const filteredItems = useMemo(() => {
    let list = participations;

    // Filter by route category
    if (subRouteType === 'submitted') {
      list = list.filter(p => String(p.status).toUpperCase() === 'SUBMITTED');
    } else if (subRouteType === 'draft') {
      list = list.filter(p => String(p.status).toUpperCase() === 'DRAFT');
    } else if (subRouteType === 'awarded') {
      list = list.filter(p => p.awards && p.awards.length > 0);
    }

    // Filter by search query
    const text = debouncedSearch.toLowerCase();
    if (text) {
      list = list.filter(p => {
        const bid = p.bid || {};
        const haystack = [
          bid.id,
          bid.title,
          bid.itemName,
          bid.buyerName,
          bid.category,
          p.id,
          p.status
        ].join(' ').toLowerCase();
        return haystack.includes(text);
      });
    }

    // Sort
    list.sort((a, b) => {
      const dateA = new Date(a.updatedAt || a.createdAt).getTime();
      const dateB = new Date(b.updatedAt || b.createdAt).getTime();
      const valA = Number(a.quotedAmount) || Number(a.bid?.estimatedValue) || 0;
      const valB = Number(b.quotedAmount) || Number(b.bid?.estimatedValue) || 0;

      if (sortBy === 'newest') return dateB - dateA;
      if (sortBy === 'oldest') return dateA - dateB;
      if (sortBy === 'value_high') return valB - valA;
      if (sortBy === 'value_low') return valA - valB;
      if (sortBy === 'title_asc') return (a.bid?.title || '').localeCompare(b.bid?.title || '');
      return 0;
    });

    return list;
  }, [participations, subRouteType, debouncedSearch, sortBy]);

  const toggleSort = (key: string) => {
    if (key === 'value') setSortBy(sortBy === 'value_low' ? 'value_high' : 'value_low');
    else if (key === 'title') setSortBy(sortBy === 'title_asc' ? 'title_desc' : 'title_asc');
    else if (key === 'updated') setSortBy(sortBy === 'updated_asc' ? 'updated_desc' : 'updated_asc');
  };

  const SortHeader = ({ label, columnKey, className = '' }: { label: string; columnKey: string; className?: string }) => {
    let isActive = false;
    let isAsc = true;
    if (columnKey === 'value') { isActive = sortBy === 'value_low' || sortBy === 'value_high'; isAsc = sortBy === 'value_low'; }
    else if (columnKey === 'title') { isActive = sortBy === 'title_asc' || sortBy === 'title_desc'; isAsc = sortBy === 'title_asc'; }
    else if (columnKey === 'updated') { isActive = sortBy === 'updated_asc' || sortBy === 'updated_desc'; isAsc = sortBy === 'updated_asc'; }
    return (
      <button type="button" onClick={() => toggleSort(columnKey)} className={cn("inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider text-slate-500 hover:text-[#12335f] transition-colors", isActive && "text-[#12335f]", className)}>
        {label}
        {isActive ? (isAsc ? <ArrowUp className="h-3 w-3 text-[#12335f]" /> : <ArrowDown className="h-3 w-3 text-[#12335f]" />) : <ArrowUpDown className="h-3 w-3 opacity-40" />}
      </button>
    );
  };

  const participationStatusColor = (status: string) => {
    const s = String(status).toUpperCase();
    if (s === 'SUBMITTED') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (s === 'DRAFT') return 'border-amber-200 bg-amber-50 text-amber-700';
    if (s === 'WITHDRAWN') return 'border-red-200 bg-red-50 text-red-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
  };

  const bidStatusColor = (status: string) => {
    const s = String(status).toUpperCase();
    if (s === 'OPEN' || s === 'LIVE') return 'bg-blue-100 text-blue-800';
    if (s === 'TECHNICAL_EVALUATION' || s === 'FINANCIAL_EVALUATION') return 'bg-purple-100 text-purple-800';
    if (s === 'AWARDED') return 'bg-green-100 text-green-800';
    return 'bg-slate-100 text-slate-700';
  };

  const handleAction = (item: any) => {
    if (item.isMarketplaceResponse) {
      const targetPath = item.bid?.category?.toLowerCase().includes('proposal') || item.bid?.category?.toLowerCase().includes('rfp') 
        ? '/seller/rfp' 
        : '/seller/rfq';
      window.location.href = `${targetPath}?requirementId=${item.requirementId}`;
      return;
    }
    const bidId = item.bid?.id || item.bidId;
    if (String(item.status).toUpperCase() === 'DRAFT') {
      window.location.href = `/bids/${bidId}/participate`;
    } else {
      window.location.href = `/bids/${bidId}`;
    }
  };

  return (
    <div className="space-y-6">
      {/* Transparent Header */}
      <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between py-2">
        <div className="min-w-0">
          <span className="text-[10px] font-black uppercase tracking-widest text-[#12335f] bg-[#12335f]/10 px-2.5 py-1 rounded-full">{headerContent.eyebrow}</span>
          <h1 className="text-3xl font-black tracking-tight text-slate-900 mt-2">{headerContent.title}</h1>
          <p className="text-xs font-semibold text-slate-500 mt-1">{headerContent.desc}</p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => loadData(true)} className="h-10 rounded-lg text-xs font-black uppercase bg-white hover:bg-slate-50 border-slate-200 shadow-sm">
            <RefreshCw className={cn("mr-2 h-4 w-4 text-[#12335f]", refreshing && "animate-spin")} /> Refresh
          </Button>
        </div>
      </div>

      {/* Dynamic KPI Metrics based on tab */}
      {subRouteType === 'submitted' && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="Submitted Bids" value={kpiData.totalSubmitted} icon={CheckCircle2} active={true} color="green" />
          <KpiCard label="Under Technical Eval" value={kpiData.underTech} icon={Clock} active={false} color="purple" />
          <KpiCard label="Under Financial Eval" value={kpiData.underFin} icon={Gavel} active={false} color="amber" />
          <KpiCard label="Awarded Bids" value={kpiData.totalAwarded} icon={Trophy} active={false} color="indigo" />
        </div>
      )}

      {subRouteType === 'draft' && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <KpiCard label="Total Draft Bids" value={kpiData.totalDrafts} icon={FileEdit} active={true} color="amber" />
          <KpiCard label="Closing in 7 Days" value={kpiData.draftsDueSoon} icon={Clock} active={false} color="red" />
          <KpiCard label="All Drafts Value" value={formatCurrency(filteredItems.reduce((s, p) => s + (p.bid?.estimatedValue || 0), 0))} icon={IndianRupee} active={false} color="blue" />
        </div>
      )}

      {subRouteType === 'awarded' && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
          <KpiCard label="Awarded Contracts" value={kpiData.totalAwarded} icon={Trophy} active={true} color="indigo" />
          <KpiCard label="Total Awarded Value" value={formatCurrency(kpiData.totalAwardedValue)} icon={IndianRupee} active={false} color="green" />
          <KpiCard label="Active Bid Value" value={formatCurrency(filteredItems.reduce((s, p) => s + (p.quotedAmount || 0), 0))} icon={CheckCircle2} active={false} color="blue" />
        </div>
      )}

      {subRouteType === 'all' && (
        <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
          <KpiCard label="All Bids" value={kpiData.totalAll} icon={FileText} active={true} color="blue" />
          <KpiCard label="Submitted" value={kpiData.totalSubmitted} icon={CheckCircle2} active={false} color="green" />
          <KpiCard label="Drafts" value={kpiData.totalDrafts} icon={FileEdit} active={false} color="amber" />
          <KpiCard label="Awarded" value={kpiData.totalAwarded} icon={Trophy} active={false} color="indigo" />
        </div>
      )}

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
          <AlertTriangle className="h-4 w-4 flex-shrink-0" />
          <span>{error}</span>
          <Button variant="outline" onClick={() => loadData()} className="ml-auto h-8 text-[10px] font-black uppercase">Retry</Button>
        </div>
      )}

      {/* Inline Filters Bar */}
      <div className="flex flex-col gap-3 md:flex-row md:items-center justify-between border-y border-slate-200 bg-slate-50/50 py-3 px-1">
        <div className="relative min-w-0 flex-1 max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            placeholder="Search by title, buyer, bid number..."
            className="h-10 w-full rounded-lg border border-slate-200 bg-white pl-10 pr-3 text-xs font-semibold outline-none focus:ring-2 focus:ring-[#12335f]/20"
          />
        </div>

        <div className="flex items-center gap-3 justify-end">
          <select
            value={sortBy}
            onChange={e => setSortBy(e.target.value)}
            className="h-10 min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-[#12335f]/20"
          >
            <option value="newest">Newest First</option>
            <option value="oldest">Oldest First</option>
            <option value="value_high">Value: High to Low</option>
            <option value="value_low">Value: Low to High</option>
            <option value="title_asc">Title A-Z</option>
          </select>

          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Content representation */}
      {filteredItems.length === 0 ? (
        <EmptyState
          title={`No ${headerContent.title} Found`}
          description={searchTerm
            ? 'No entries match your search query.'
            : `You don't have any entries under ${headerContent.title.toLowerCase()} right now.`}
        />
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {filteredItems.map((item, index) => {
            const bid = item.bid || {};
            const rowIndex = index + 1;
            return (
              <div key={item.id} className="group rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-sm transition hover:border-[#12335f]/40 hover:shadow-md flex flex-col justify-between">
                <div className="w-full space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-slate-100 font-mono text-[9px] font-black text-slate-500">
                          {String(rowIndex).padStart(2, '0')}
                        </span>
                        <p className="text-[10px] font-black uppercase tracking-wider text-[#c86413]">Bid ID #{bid.id || item.bidId}</p>
                      </div>
                      <h3 className="mt-2 text-sm font-black text-slate-900 group-hover:text-[#12335f] transition-colors line-clamp-2 leading-snug">{bid.title || 'Untitled Bid Sourcing'}</h3>
                    </div>
                    <span className={cn('inline-flex rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide whitespace-nowrap', participationStatusColor(item.status))}>
                      {item.status}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 gap-2.5 text-[10px] font-semibold text-slate-500 border-t border-slate-100 pt-3">
                    <InfoTile label="Buyer Organization" value={bid.buyerName || 'Private Buyer'} />
                    <InfoTile label="Your Quote" value={item.quotedAmount ? formatCurrency(item.quotedAmount) : 'Pending'} />
                    <InfoTile label="Category" value={bid.category || 'General'} />
                    <InfoTile label="Est. Budget" value={formatCurrency(bid.estimatedValue)} />
                    <InfoTile label="Submitted On" value={formatDate(item.createdAt)} />
                    <InfoTile label="Closing Date" value={formatDate(bid.endDate)} />
                  </div>

                  <div className="flex flex-wrap gap-2 pt-2 border-t border-slate-100 items-center justify-between">
                    <span className={cn('inline-block rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wide', bidStatusColor(bid.status || 'OPEN'))}>
                      Bid: {String(bid.status || 'OPEN').replace(/_/g, ' ')}
                    </span>

                    <Button onClick={() => handleAction(item)} className="h-8 bg-[#12335f] text-[10px] font-black uppercase text-white hover:bg-[#0b2445] rounded-lg px-4">
                      {String(item.status).toUpperCase() === 'DRAFT' ? 'Resume Draft' : 'View Details'}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-slate-200/80 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[920px] border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 hover:bg-transparent">
                  <th className="p-3 text-[10px] font-black uppercase tracking-wider text-slate-500 w-16">Sr. No</th>
                  <th className="p-3 w-28">Bid ID</th>
                  <th className="p-3"><SortHeader label="Title & Details" columnKey="title" /></th>
                  <th className="p-3">Buyer</th>
                  <th className="p-3"><SortHeader label="Your Quote" columnKey="value" /></th>
                  <th className="p-3 w-32">Est. Budget</th>
                  <th className="p-3 w-32">Closing Date</th>
                  <th className="p-3 w-32">Participation</th>
                  <th className="p-3 w-32">Bid Stage</th>
                  <th className="p-3 text-right w-24">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {filteredItems.map((item, index) => {
                  const bid = item.bid || {};
                  const rowIndex = index + 1;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/50 transition cursor-pointer" onClick={() => handleAction(item)}>
                      <td className="p-3 font-mono text-xs text-slate-500">
                        {String(rowIndex).padStart(2, '0')}
                      </td>
                      <td className="p-3 font-mono font-bold text-slate-900 whitespace-nowrap">#{bid.id || item.bidId}</td>
                      <td className="p-3">
                        <p className="font-bold text-slate-900 line-clamp-1 max-w-[220px]">{bid.title || 'Untitled Bid'}</p>
                        <p className="text-[10px] text-slate-500">{bid.category}</p>
                      </td>
                      <td className="p-3 text-slate-700">{bid.buyerName || 'Private Buyer'}</td>
                      <td className="p-3 font-bold text-slate-900 whitespace-nowrap">{item.quotedAmount ? formatCurrency(item.quotedAmount) : 'Pending'}</td>
                      <td className="p-3 font-bold text-slate-700 whitespace-nowrap">{formatCurrency(bid.estimatedValue)}</td>
                      <td className="p-3 text-slate-500 whitespace-nowrap">{formatDate(bid.endDate)}</td>
                      <td className="p-3">
                        <span className={cn('inline-flex rounded-lg border px-2 py-0.5 text-[9px] font-black uppercase tracking-wide whitespace-nowrap', participationStatusColor(item.status))}>
                          {item.status}
                        </span>
                      </td>
                      <td className="p-3">
                        <span className={cn('inline-block rounded px-2 py-0.5 text-[9px] font-black uppercase whitespace-nowrap', bidStatusColor(bid.status || 'OPEN'))}>
                          {String(bid.status || 'OPEN').replace(/_/g, ' ')}
                        </span>
                      </td>
                      <td className="p-3 text-right" onClick={e => e.stopPropagation()}>
                        <Button onClick={() => handleAction(item)} className="h-8 bg-[#12335f] text-[10px] font-black uppercase text-white hover:bg-[#0b2445] rounded-lg">
                          {String(item.status).toUpperCase() === 'DRAFT' ? 'Resume' : 'View'}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────

interface KpiCardProps {
  label: string;
  value: string | number;
  icon: any;
  onClick?: () => void;
  active?: boolean;
  color?: 'blue' | 'green' | 'red' | 'purple' | 'amber' | 'indigo' | 'slate';
}

function KpiCard({ label, value, icon: Icon, onClick, active, color = 'slate' }: KpiCardProps) {
  const colorMap = {
    blue: 'border-blue-100 bg-blue-50/50 hover:bg-blue-50 text-blue-700 hover:border-blue-300 ring-blue-600/10',
    green: 'border-green-100 bg-green-50/50 hover:bg-green-50 text-green-700 hover:border-green-300 ring-green-600/10',
    red: 'border-red-100 bg-red-50/50 hover:bg-red-50 text-red-700 hover:border-red-300 ring-red-600/10',
    purple: 'border-purple-100 bg-purple-50/50 hover:bg-purple-50 text-purple-700 hover:border-purple-300 ring-purple-600/10',
    amber: 'border-amber-100 bg-amber-50/50 hover:bg-amber-50 text-amber-700 hover:border-amber-300 ring-amber-600/10',
    indigo: 'border-indigo-100 bg-indigo-50/50 hover:bg-indigo-50 text-indigo-700 hover:border-indigo-300 ring-indigo-600/10',
    slate: 'border-slate-100 bg-slate-50/50 hover:bg-slate-50 text-slate-700 hover:border-slate-300 ring-slate-600/10',
  };

  const activeColorMap = {
    blue: 'border-blue-500 bg-blue-50 text-blue-800 ring-2 ring-blue-500/20',
    green: 'border-green-500 bg-green-50 text-green-800 ring-2 ring-green-500/20',
    red: 'border-red-500 bg-red-50 text-red-800 ring-2 ring-red-500/20',
    purple: 'border-purple-500 bg-purple-50 text-purple-800 ring-2 ring-purple-500/20',
    amber: 'border-amber-500 bg-amber-50 text-amber-800 ring-2 ring-amber-500/20',
    indigo: 'border-indigo-500 bg-indigo-50 text-indigo-800 ring-2 ring-indigo-500/20',
    slate: 'border-slate-500 bg-slate-50 text-slate-800 ring-2 ring-slate-500/20',
  };

  const iconBgMap = {
    blue: 'bg-blue-500 text-white',
    green: 'bg-green-500 text-white',
    red: 'bg-red-500 text-white',
    purple: 'bg-purple-500 text-white',
    amber: 'bg-amber-500 text-white',
    indigo: 'bg-indigo-500 text-white',
    slate: 'bg-slate-500 text-white',
  };

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left rounded-2xl border p-4 shadow-sm transition-all duration-300 flex items-center justify-between',
        active ? activeColorMap[color] : colorMap[color]
      )}
    >
      <div className="min-w-0">
        <p className="text-[10px] font-black uppercase tracking-widest opacity-80">{label}</p>
        <p className="mt-1 text-xl font-black tracking-tight leading-none">{value}</p>
      </div>
      <div className={cn('flex h-9 w-9 shrink-0 items-center justify-center rounded-xl shadow-sm transition-transform duration-300 group-hover:scale-110', iconBgMap[color])}>
        <Icon className="h-4.5 w-4.5" />
      </div>
    </button>
  );
}

function InfoTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-2.5">
      <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{label}</p>
      <p className="mt-1 break-words text-xs font-bold text-slate-800">{value || '-'}</p>
    </div>
  );
}
