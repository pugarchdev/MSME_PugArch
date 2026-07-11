'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Building2, CalendarDays, ChevronDown, ChevronUp, ClipboardList, Eye, FileText, Gavel, MapPin, RefreshCw, Search, ShieldCheck, X, SlidersHorizontal, type LucideIcon } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { marketplaceApi } from '../../marketplace/api';
import { procurementBidApi } from '../../procurementBid/api';
import { fetchQuoteRequests } from '../../rfq/api';
import { reverseAuctionApi } from '../../reverseAuctions/api';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';
import { Pagination } from '../../shared/Pagination';
import ProcurementLifecycleTracker from '../../procurementLifecycle/components/ProcurementLifecycleTracker';
import type { ProcurementLifecycleEvent } from '../../procurementLifecycle/statusMapper';

type OpportunityType = 'Quick Quote' | 'Large Procurement' | 'Buyer Requirement' | 'Auction';

interface SellerOpportunity {
  id: string;
  type: OpportunityType;
  title: string;
  buyer?: string;
  category?: string;
  location?: string;
  closingDate?: string;
  estimatedValue?: number;
  eligibility: string;
  status: string;
  actionLabel: string;
  href: string;
  detailsHref: string;
  sourceRef: string;
  publishedAt?: string;
  quantity?: string;
  description?: string;
  documents?: string[];
  responseCount?: number;
  nextAction: string;
  buyerType?: string;
  department?: string;
  deliveryLocation?: string;
  procurementType?: string;
  documentsCount?: number;
  terms?: string[];
  detailRows?: Array<{ label: string; value: string }>;
  events: ProcurementLifecycleEvent[];
}

const pageSize = 10;

const formatDate = (value?: string) => {
  if (!value) return 'Not set';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Not set';
  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
};

const formatMoney = (value?: number) => {
  if (!value || Number.isNaN(value)) return 'Value not shown';
  return `Rs. ${value.toLocaleString('en-IN')}`;
};

const formatQuantity = (quantity?: unknown, unit?: unknown) => {
  const value = String(quantity || '').trim();
  const suffix = String(unit || '').trim();
  if (!value) return '';
  return [value, suffix].filter(Boolean).join(' ');
};

const asTextList = (value: unknown): string[] => {
  if (Array.isArray(value)) return value.map(item => String(item || '').trim()).filter(Boolean);
  const text = String(value || '').trim();
  return text ? [text] : [];
};

const toNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const opportunityEvents = (status?: string, createdAt?: string): ProcurementLifecycleEvent[] => [
  {
    stage: 'PROCUREMENT_CREATED',
    status: status || 'open',
    description: 'Buyer opportunity is available for seller review',
    createdAt,
  },
];

const nextActionFor = (item: Pick<SellerOpportunity, 'type' | 'status' | 'eligibility'>) => {
  const status = String(item.status || '').toLowerCase();
  if (status.includes('closed') || status.includes('awarded')) return 'This opportunity is no longer open for a new seller response. Review details and track the result.';
  if (item.eligibility.toLowerCase().includes('participated')) return 'Your participation is recorded. Track buyer evaluation, award, PO, delivery, invoice, and settlement from this panel.';
  if (item.type === 'Auction') return 'Open auction details, verify invitation and timeline, then join the live auction when it is active.';
  if (item.type === 'Quick Quote') return 'Open RFQ details, verify commercial terms and deadline, then submit the quotation before closure.';
  return 'Open details, review documents and eligibility, then submit the bid or response before the closing date.';
};

const typeFromQuery = (value: string | null): OpportunityType | '' => {
  if (value === 'quote') return 'Quick Quote';
  if (value === 'large') return 'Large Procurement';
  if (value === 'requirement') return 'Buyer Requirement';
  if (value === 'auction') return 'Auction';
  return '';
};

let globalOpportunitiesCache: SellerOpportunity[] | null = null;

const isSameOpportunities = (a: SellerOpportunity[] | null, b: SellerOpportunity[]) => {
  if (!a) return false;
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id || 
        a[i].status !== b[i].status || 
        a[i].responseCount !== b[i].responseCount ||
        a[i].title !== b[i].title ||
        a[i].estimatedValue !== b[i].estimatedValue ||
        a[i].closingDate !== b[i].closingDate) {
      return false;
    }
  }
  return true;
};

export default function SellerOpportunitiesPage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<SellerOpportunity[]>(() => globalOpportunitiesCache || []);
  const [loading, setLoading] = useState(() => !globalOpportunitiesCache);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<OpportunityType | ''>(() => typeFromQuery(searchParams.get('type')));
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SellerOpportunity | null>(null);
  const [viewMode, setViewMode] = useResponsiveViewMode('seller:opportunities:view-mode');
  const [kpiFilter, setKpiFilter] = useState<'all' | 'open' | 'dueSoon' | 'auctions'>('all');
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [category, setCategory] = useState('');
  const [valueRange, setValueRange] = useState('');

  const load = React.useCallback(() => {
    let alive = true;
    if (!globalOpportunitiesCache) {
      setLoading(true);
    }
    setError('');

    Promise.allSettled([
      procurementBidApi.list({ pageSize: 200 }),
      marketplaceApi.getRequirements({ pageSize: 200 }),
      fetchQuoteRequests({ pageSize: 200 }),
      reverseAuctionApi.list({ pageSize: 200 }),
    ]).then(results => {
      if (!alive) return;
      const next: SellerOpportunity[] = [];

      const bids = results[0].status === 'fulfilled' ? results[0].value?.items || [] : [];
      bids.forEach((bid: any) => {
        const documents = asTextList(bid.requiredDocuments);
        const terms = asTextList(bid.terms);
        
        const method = String(bid.procurementType || bid.bidType || '').toUpperCase();
        let actionLabel = bid.participated ? 'Track Status' : 'Submit Bid';
        let href = `/bids/${bid.id}/participate`;
        let detailsHref = `/bids/${bid.id}`;

        if (bid.sourceModel === 'TENDER' && bid.sourceId) {
          href = `/seller/tenders/${bid.sourceId}/bid`;
          detailsHref = `/tenders?tender=${bid.sourceId}`;
          actionLabel = bid.participated ? 'Track Status' : 'Submit Quote';
        } else {
          if (method === 'RFI') {
            actionLabel = bid.participated ? 'Track Info Request' : 'Submit Information';
          } else if (method === 'REVERSE_AUCTION') {
            actionLabel = 'Enter Auction Lobby';
            href = `/reverse-auctions/${bid.id}/live`;
            detailsHref = `/reverse-auctions/${bid.id}`;
          } else if (method === 'BID_WITH_REVERSE_AUCTION') {
            actionLabel = bid.participated ? 'Enter Auction Lobby' : 'Submit Bid & Participate';
            if (bid.participated) {
              href = `/reverse-auctions/${bid.id}/live`;
            }
          } else if (['DIRECT_PURCHASE', 'PAC', 'SINGLE_SOURCE', 'EMERGENCY_PURCHASE'].includes(method)) {
            actionLabel = bid.participated ? 'Track Order/Quote' : 'Submit Quotation';
          } else if (method === 'BOQ_BASED_BID') {
            actionLabel = bid.participated ? 'Track BOQ Bid' : 'Submit BOQ Rates';
          } else if (method === 'RATE_CONTRACT') {
            actionLabel = bid.participated ? 'Track Rate Contract' : 'Submit Rate Schedule';
          }
        }

        const opportunity: SellerOpportunity = {
          id: `bid-${bid.id}`,
          type: bid.sourceModel === 'TENDER' ? 'Large Procurement' : 'Large Procurement',
          title: bid.title || bid.itemName || 'Procurement opportunity',
          buyer: bid.buyerName,
          category: bid.category,
          location: bid.location,
          closingDate: bid.endDate,
          estimatedValue: toNumber(bid.estimatedValue),
          eligibility: bid.participated ? 'Already participated' : 'Check documents',
          status: bid.status || 'Open',
          actionLabel,
          href,
          detailsHref,
          sourceRef: bid.id || `BID-${bid.sourceId || ''}`,
          publishedAt: bid.startDate,
          quantity: bid.quantity,
          description: bid.description,
          documents,
          responseCount: bid.participantsCount,
          buyerType: bid.buyerType,
          department: bid.departmentName,
          deliveryLocation: bid.deliveryLocation,
          procurementType: bid.procurementType || bid.bidType,
          documentsCount: documents.length || bid.bidDocuments?.length,
          terms,
          nextAction: '',
          detailRows: [
            { label: 'Bid type', value: bid.bidType || 'Not specified' },
            { label: 'Procurement type', value: bid.procurementType || 'Open Bid' },
            { label: 'Department', value: bid.departmentName || 'Procurement' },
            { label: 'Delivery location', value: bid.deliveryLocation || 'Not specified' },
            { label: 'Participants', value: bid.participantsCount !== undefined ? Number(bid.participantsCount).toLocaleString('en-IN') : 'Not shown' },
            { label: 'Technical status', value: bid.technicalStatus || 'Pending' },
          ],
          events: opportunityEvents(bid.status, bid.startDate),
        };
        opportunity.nextAction = nextActionFor(opportunity);
        next.push(opportunity);
      });

      const requirements = results[1].status === 'fulfilled' ? ((results[1].value as any)?.requirements || (results[1].value as any)?.items || results[1].value || []) : [];
      (Array.isArray(requirements) ? requirements : []).forEach((req: any) => {
        const documents = asTextList(req.requiredDocuments);
        const opportunity: SellerOpportunity = {
          id: `req-${req.id}`,
          type: 'Buyer Requirement',
          title: req.title || 'Buyer requirement',
          buyer: req.buyerOrganization?.organizationName,
          category: req.category?.name,
          location: req.location || [req.buyerOrganization?.district, req.buyerOrganization?.state].filter(Boolean).join(', '),
          closingDate: req.lastDate,
          estimatedValue: toNumber(req.budgetMax || req.budgetMin),
          eligibility: req.visibility === 'VERIFIED_SELLERS_ONLY' ? 'Verified sellers only' : 'Open',
          status: req.statusLabel || req.status || 'Open',
          actionLabel: 'Respond',
          href: `/marketplace/requirements/${req.sourceId || req.id}`,
          detailsHref: `/marketplace/requirements/${req.sourceId || req.id}`,
          sourceRef: req.requirementNumber || `REQ-${req.sourceId || req.id}`,
          publishedAt: req.approvedAt || req.createdAt,
          quantity: formatQuantity(req.quantity, req.unit),
          description: req.description,
          documents,
          responseCount: req.responsesCount || req.responses?.length,
          buyerType: req.buyerOrganization?.organizationType,
          deliveryLocation: req.location,
          procurementType: req.requirementType,
          documentsCount: documents.length,
          terms: asTextList(req.terms),
          nextAction: '',
          detailRows: [
            { label: 'Requirement type', value: req.requirementType || 'Not specified' },
            { label: 'Visibility', value: req.visibility || 'Public' },
            { label: 'Budget min', value: formatMoney(toNumber(req.budgetMin)) },
            { label: 'Budget max', value: formatMoney(toNumber(req.budgetMax)) },
            { label: 'Days remaining', value: req.daysRemaining !== undefined ? String(req.daysRemaining) : req.timeRemaining || 'Not shown' },
            { label: 'Urgency', value: req.isUrgent ? 'Urgent' : req.isFeatured ? 'Featured' : 'Standard' },
          ],
          events: opportunityEvents(req.statusLabel || req.status, req.approvedAt || req.createdAt),
        };
        opportunity.nextAction = nextActionFor(opportunity);
        next.push(opportunity);
      });

      const quoteRequests = results[2].status === 'fulfilled' ? results[2].value?.records || [] : [];
      quoteRequests.forEach((rfq: any) => {
        const documents = asTextList(rfq.documentUrl ? ['RFQ attachment available'] : rfq.requiredDocuments);
        const opportunity: SellerOpportunity = {
          id: `rfq-${rfq.id}`,
          type: 'Quick Quote',
          title: rfq.subject || 'Request quotation',
          buyer: rfq.buyer?.buyerProfile?.organizationName || rfq.buyer?.name,
          category: 'Request Quotations',
          location: [rfq.buyer?.buyerProfile?.city, rfq.buyer?.buyerProfile?.state].filter(Boolean).join(', '),
          closingDate: rfq.deadlineDate,
          estimatedValue: toNumber(rfq.estimatedValue),
          eligibility: 'Invited supplier',
          status: rfq.status || 'Pending',
          actionLabel: 'Submit Quote',
          href: '/seller/rfq',
          detailsHref: `/seller/rfq${rfq.id ? `?requestId=${rfq.id}` : ''}`,
          sourceRef: rfq.requestNumber || `RFQ-${rfq.id}`,
          publishedAt: rfq.createdAt,
          quantity: formatQuantity(rfq.quantity, rfq.unit),
          description: rfq.message || rfq.description || rfq.notes,
          documents,
          responseCount: rfq.responsesCount || rfq.responses?.length,
          buyerType: rfq.buyer?.buyerProfile?.organizationType,
          procurementType: 'RFQ',
          documentsCount: documents.length,
          terms: asTextList(rfq.notes),
          nextAction: '',
          detailRows: [
            { label: 'Buyer email', value: rfq.buyer?.email || 'Not shown' },
            { label: 'Buyer mobile', value: rfq.buyer?.mobile || 'Not shown' },
            { label: 'Seller', value: rfq.seller?.sellerProfile?.businessName || rfq.seller?.name || 'Assigned seller' },
            { label: 'Responses', value: Array.isArray(rfq.quoteResponses) ? rfq.quoteResponses.length.toLocaleString('en-IN') : 'Not shown' },
            { label: 'Last updated', value: formatDate(rfq.updatedAt) },
            { label: 'Attachment', value: rfq.documentUrl ? 'Available' : 'Not attached' },
          ],
          events: opportunityEvents(rfq.status, rfq.createdAt),
        };
        opportunity.nextAction = nextActionFor(opportunity);
        next.push(opportunity);
      });

      const auctions = results[3].status === 'fulfilled' ? results[3].value?.auctions || [] : [];
      auctions.forEach((auction: any) => {
        const documents = asTextList(auction.documents);
        const opportunity: SellerOpportunity = {
          id: `auction-${auction.id}`,
          type: 'Auction',
          title: auction.title || auction.auctionCode || 'Reverse auction',
          category: 'Negotiate Price',
          closingDate: auction.endTime,
          estimatedValue: toNumber(auction.currentLowestAmount || auction.startPrice),
          eligibility: 'Check invitation',
          status: auction.statusEnum || auction.status || 'Scheduled',
          actionLabel: 'Join Auction',
          href: `/reverse-auctions/${auction.id}/live`,
          detailsHref: `/reverse-auctions/${auction.id}`,
          sourceRef: auction.auctionCode || `RA-${auction.id}`,
          publishedAt: auction.startTime,
          description: auction.description,
          documents,
          responseCount: auction.participantsCount || auction.invitedSellersCount,
          procurementType: 'Reverse Auction',
          documentsCount: documents.length,
          terms: asTextList(auction.terms),
          nextAction: '',
          detailRows: [
            { label: 'Auction start', value: formatDate(auction.startTime) },
            { label: 'Auction end', value: formatDate(auction.endTime) },
            { label: 'Start price', value: formatMoney(toNumber(auction.startPrice)) },
            { label: 'Current L1', value: auction.currentLowestAmount ? formatMoney(toNumber(auction.currentLowestAmount)) : 'Not available' },
            { label: 'Minimum decrement', value: auction.minDecrementAmount ? formatMoney(toNumber(auction.minDecrementAmount)) : 'Not shown' },
            { label: 'Participants', value: auction.participantsCount !== undefined ? Number(auction.participantsCount).toLocaleString('en-IN') : 'Not shown' },
          ],
          events: opportunityEvents(auction.statusEnum || auction.status, auction.startTime),
        };
        opportunity.nextAction = nextActionFor(opportunity);
        next.push(opportunity);
      });

      const sorted = next.sort((a, b) => new Date(a.closingDate || 0).getTime() - new Date(b.closingDate || 0).getTime());
      if (!isSameOpportunities(globalOpportunitiesCache, sorted)) {
        globalOpportunitiesCache = sorted;
        setItems(sorted);
      }
      if (!sorted.length && results.every(result => result.status === 'rejected')) {
        setError('Unable to load seller opportunities from the existing modules.');
      }
    }).catch((err: any) => {
      if (!alive) return;
      setError(err?.message || 'Unable to load opportunities.');
      setItems([]);
    }).finally(() => {
      if (alive) setLoading(false);
    });

    return () => { alive = false; };
  }, []);

  useEffect(() => load(), [load]);

  useEffect(() => {
    setType(typeFromQuery(searchParams.get('type')));
  }, [searchParams]);

  const typeOptions = useMemo(() => Array.from(new Set(items.map(item => item.type))).sort(), [items]);
  const statusOptions = useMemo(() => Array.from(new Set(items.map(item => item.status).filter(Boolean))).sort(), [items]);
  const locationOptions = useMemo(() => Array.from(new Set(items.map(item => item.location).filter((value): value is string => Boolean(value)))).sort(), [items]);
  const categoryOptions = useMemo(() => Array.from(new Set(items.map(item => item.category).filter((value): value is string => Boolean(value)))).sort(), [items]);

  const baseFiltered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items.filter(item => {
      const haystack = [item.title, item.buyer, item.category, item.location, item.status, item.type, item.sourceRef, item.description].join(' ').toLowerCase();
      if (text && !haystack.includes(text)) return false;
      if (type && item.type !== type) return false;
      if (status && item.status !== status) return false;
      if (location && item.location !== location) return false;
      if (category && item.category !== category) return false;
      if (valueRange) {
        const val = item.estimatedValue || 0;
        if (valueRange === '5l' && val >= 500000) return false;
        if (valueRange === '25l' && (val < 500000 || val >= 2500000)) return false;
        if (valueRange === '1cr' && (val < 2500000 || val >= 10000000)) return false;
        if (valueRange === 'above1cr' && val < 10000000) return false;
      }
      if (closingDate === '7' && item.closingDate) {
        const diff = (new Date(item.closingDate).getTime() - Date.now()) / 86400000;
        if (diff > 7) return false;
      }
      return true;
    });
  }, [closingDate, items, location, query, status, type, category, valueRange]);

  const summary = useMemo(() => {
    const openStatuses = new Set(['open', 'scheduled', 'live', 'pending', 'closing soon']);
    const dueSoon = baseFiltered.filter(item => {
      if (!item.closingDate) return false;
      const diff = (new Date(item.closingDate).getTime() - Date.now()) / 86400000;
      return diff >= 0 && diff <= 7;
    }).length;
    return {
      total: baseFiltered.length,
      open: baseFiltered.filter(item => openStatuses.has(String(item.status).toLowerCase())).length,
      dueSoon,
      auctions: baseFiltered.filter(item => item.type === 'Auction').length,
    };
  }, [baseFiltered]);

  const filtered = useMemo(() => {
    const openStatuses = new Set(['open', 'scheduled', 'live', 'pending', 'closing soon']);
    return baseFiltered.filter(item => {
      if (kpiFilter === 'open' && !openStatuses.has(String(item.status).toLowerCase())) return false;
      if (kpiFilter === 'dueSoon') {
        if (!item.closingDate) return false;
        const diff = (new Date(item.closingDate).getTime() - Date.now()) / 86400000;
        if (diff < 0 || diff > 7) return false;
      }
      if (kpiFilter === 'auctions' && item.type !== 'Auction') return false;
      return true;
    });
  }, [baseFiltered, kpiFilter]);

  // Reset KPI filter when dropdown filters change
  useEffect(() => {
    setKpiFilter('all');
  }, [query, type, status, location, closingDate, category, valueRange]);

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [closingDate, location, query, status, type, viewMode, kpiFilter, category, valueRange]);

  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

  const reset = () => {
    setQuery('');
    setType('');
    setStatus('');
    setLocation('');
    setClosingDate('');
    setCategory('');
    setValueRange('');
    setKpiFilter('all');
    setPage(1);
    setShowAdvanced(false);
  };

  return (
    <div className="mx-auto max-w-[1560px] space-y-5 px-4 pb-8">
      <div className="rounded-[24px] bg-white/95 p-5 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#12335f]">Bidding Opportunities</p>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">New Bidding Opportunities</h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              One place to review requests for quotations (RFQs), public tenders, auctions, and direct buyer requirements.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={load} className="h-10 rounded-md text-xs">
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryTile
          icon={ClipboardList}
          label="Matching opportunities"
          value={summary.total.toLocaleString('en-IN')}
          active={kpiFilter === 'all'}
          onClick={() => setKpiFilter('all')}
        />
        <SummaryTile
          icon={FileText}
          label="Open items"
          value={summary.open.toLocaleString('en-IN')}
          active={kpiFilter === 'open'}
          onClick={() => setKpiFilter('open')}
        />
        <SummaryTile
          icon={CalendarDays}
          label="Closing in 7 days"
          value={summary.dueSoon.toLocaleString('en-IN')}
          active={kpiFilter === 'dueSoon'}
          onClick={() => setKpiFilter('dueSoon')}
        />
        <SummaryTile
          icon={Gavel}
          label="Auctions"
          value={summary.auctions.toLocaleString('en-IN')}
          active={kpiFilter === 'auctions'}
          onClick={() => setKpiFilter('auctions')}
        />
      </div>

      {/* Filters & Search Control Panel */}
      <div className="rounded-[24px] bg-slate-50/80 p-4 shadow-[0_8px_24px_rgba(15,23,42,0.04)] ring-1 ring-slate-200/60">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          {/* Search bar */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={event => { setQuery(event.target.value); setPage(1); }}
              placeholder="Search opportunity reference, title, category, buyer..."
              className="h-10 w-full rounded-2xl border border-slate-200 bg-white pl-10 pr-4 text-sm font-semibold text-slate-800 placeholder-slate-400 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10 shadow-[inset_0_1px_2px_rgba(15,23,42,0.02)]"
            />
          </div>

          {/* Quick Filters Group */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-40">
              <SelectFilter value={type} onChange={(value) => { setType(value as OpportunityType | ''); setPage(1); }} placeholder="All types" options={typeOptions} />
            </div>
            <div className="w-40">
              <SelectFilter value={status} onChange={(value) => { setStatus(value); setPage(1); }} placeholder="All statuses" options={statusOptions} />
            </div>
            
            <button
              type="button"
              onClick={() => setShowAdvanced(!showAdvanced)}
              className={cn(
                "inline-flex h-10 items-center justify-center gap-1.5 rounded-2xl border px-4 text-xs font-black transition-all",
                showAdvanced 
                  ? "border-[#12335f] bg-[#12335f]/5 text-[#12335f]" 
                  : "border-slate-200 bg-white text-slate-700 hover:border-slate-305"
              )}
            >
              <SlidersHorizontal className="h-4 w-4" />
              Advanced Filters
            </button>

            <div className="h-6 w-px bg-slate-200 mx-1 hidden sm:block" />

            <ViewModeToggle value={viewMode} onChange={setViewMode} />
            <Button type="button" variant="outline" onClick={reset} className="h-10 rounded-2xl text-xs font-bold border-slate-200 bg-white hover:border-slate-300">Reset</Button>
          </div>
        </div>

        {/* Collapsible Advanced Filters Section */}
        {showAdvanced && (
          <div className="mt-4 grid gap-4 sm:grid-cols-2 md:grid-cols-4 rounded-2xl bg-white p-4 border border-slate-200/80 shadow-sm animate-in slide-in-from-top-1.5 duration-200">
            <div className="space-y-1.5">
              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-455 text-slate-400">Category</span>
              <SelectFilter value={category} onChange={(value) => { setCategory(value); setPage(1); }} placeholder="All Categories" options={categoryOptions} />
            </div>
            <div className="space-y-1.5">
              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-455 text-slate-400">Location</span>
              <SelectFilter value={location} onChange={(value) => { setLocation(value); setPage(1); }} placeholder="All Locations" options={locationOptions} />
            </div>
            <div className="space-y-1.5">
              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-455 text-slate-400">Estimated Value</span>
              <select 
                value={valueRange} 
                onChange={event => { setValueRange(event.target.value); setPage(1); }}
                className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10"
              >
                <option value="">Any value</option>
                <option value="5l">&lt; ₹5 Lakhs</option>
                <option value="25l">₹5 Lakhs - ₹25 Lakhs</option>
                <option value="1cr">₹25 Lakhs - ₹1 Crore</option>
                <option value="above1cr">&gt; ₹1 Crore</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <span className="block text-[10px] font-black uppercase tracking-wider text-slate-455 text-slate-400">Closing Date</span>
              <select 
                value={closingDate} 
                onChange={event => { setClosingDate(event.target.value); setPage(1); }}
                className="h-10 w-full rounded-2xl border border-slate-200 bg-white px-3.5 text-xs font-bold text-slate-700 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10"
              >
                <option value="">Any closing date</option>
                <option value="7">Next 7 days</option>
              </select>
            </div>
          </div>
        )}
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2, 3, 4].map(item => <div key={item} className="h-40 rounded-[22px] bg-white/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70"><div className="h-4 w-40 rounded bg-slate-100" /><div className="mt-4 h-20 rounded bg-slate-100" /></div>)}
        </div>
      ) : error ? (
        <div className="rounded-[22px] bg-red-50 p-4 text-sm font-semibold text-red-700 ring-1 ring-red-200">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-[24px] bg-white/95 p-8 text-center shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70">
          <h2 className="text-base font-black text-slate-950">No matching opportunities right now.</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Check again later or update your marketplace categories.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="space-y-3">
          <div className="grid gap-4 xl:grid-cols-2">
            {pageRows.map((item, index) => <OpportunityCard key={item.id} item={item} serial={(page - 1) * pageSize + index + 1} onView={() => setSelectedItem(item)} />)}
          </div>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} label="opportunities" />
        </div>
      ) : (
        <div className="overflow-hidden rounded-[24px] bg-white/95 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70">
          <div className="overflow-x-auto bg-slate-50/70 p-2 pb-3">
            <table className="w-full min-w-[1200px] border-separate border-spacing-y-3 text-sm">
              <thead className="text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left w-28 min-w-[110px]">Reference</th>
                  <th className="px-4 py-3 text-left w-36 min-w-[130px]">Type</th>
                  <th className="px-4 py-3 text-left">Opportunity</th>
                  <th className="px-4 py-3 text-left w-52 min-w-[190px]">Buyer / Location</th>
                  <th className="px-4 py-3 text-left w-32 min-w-[110px]">Timeline</th>
                  <th className="px-4 py-3 text-left w-40 min-w-[140px]">Tracking</th>
                  <th className="px-4 py-3 text-right w-36 min-w-[120px]">Commercials</th>
                  <th className="sticky right-0 z-20 w-44 min-w-[170px] bg-slate-50/95 px-4 py-3 text-right whitespace-nowrap shadow-[-10px_0_16px_-16px_rgba(15,23,42,0.45)]">Actions</th>
                </tr>
              </thead>
              <tbody>
                {pageRows.map((item, index) => {
                  const expanded = expandedId === item.id;
                  return (
                    <React.Fragment key={item.id}>
                      <tr className={cn('bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)] transition hover:shadow-sm', expanded && 'bg-blue-50/50')}>
                        {/* 1. Reference */}
                        <td className="rounded-l-2xl px-4 py-3.5">
                          <div className="flex items-center gap-1.5">
                            <span className="inline-flex h-5 items-center rounded-md border border-slate-200 bg-slate-50 px-1.5 text-[9px] font-black text-slate-400 select-none">
                              #{(page - 1) * pageSize + index + 1}
                            </span>
                            <button
                              type="button"
                              onClick={() => setSelectedItem(item)}
                              className="text-left text-xs font-black text-[#c86413] underline-offset-4 hover:underline"
                            >
                              {item.sourceRef}
                            </button>
                          </div>
                        </td>

                        {/* 2. Type */}
                        <td className="px-4 py-3.5 whitespace-nowrap">
                          <TypeBadge type={item.type} />
                        </td>

                        {/* 3. Opportunity Title & Subtext */}
                        <td className="px-4 py-3.5">
                          <div>
                            <p className="text-xs font-black text-slate-950 leading-snug">{item.title}</p>
                            <p className="mt-1 text-[10px] font-bold text-slate-500">
                              {[item.category || 'General procurement', item.quantity].filter(Boolean).join(' / ')}
                            </p>
                          </div>
                        </td>

                        {/* 4. Buyer & Location */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-1.5 text-[10px] font-bold text-slate-500">
                            <span className="flex items-center gap-1.5">
                              <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[170px]" title={item.buyer}>{item.buyer || 'Buyer details controlled'}</span>
                            </span>
                            <span className="flex items-center gap-1.5">
                              <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                              <span className="truncate max-w-[170px]" title={item.location}>{item.location || 'Not specified'}</span>
                            </span>
                          </div>
                        </td>

                        {/* 5. Timeline */}
                        <td className="px-4 py-3.5">
                          <div className="flex flex-col gap-1 text-[10px] font-bold">
                            <div className="flex flex-col">
                              <span className="text-[9px] font-extrabold uppercase tracking-wide text-slate-400">Published</span>
                              <span className="text-slate-600">{formatDate(item.publishedAt)}</span>
                            </div>
                            <div className="flex flex-col mt-0.5">
                              <span className="text-[9px] font-extrabold uppercase tracking-wide text-slate-400">Closing</span>
                              <span className="text-slate-800 font-extrabold">{formatDate(item.closingDate)}</span>
                            </div>
                          </div>
                        </td>

                        {/* 6. Tracking */}
                        <td className="px-4 py-3.5">
                          <OpportunityProgress item={item} />
                        </td>

                        {/* 7. Commercials */}
                        <td className="px-4 py-3.5 text-right">
                          <div className="flex flex-col gap-0.5">
                            <span className="text-xs font-black text-[#12335f]">{formatMoney(item.estimatedValue)}</span>
                            <span className="text-[10px] font-bold text-slate-500">{item.eligibility}</span>
                          </div>
                        </td>

                        {/* 8. Actions */}
                        <td className="sticky right-0 z-10 w-44 min-w-[170px] rounded-r-2xl bg-white px-4 py-3.5 whitespace-nowrap shadow-[-10px_0_16px_-16px_rgba(15,23,42,0.45)]">
                          <div className="flex items-center justify-end gap-1.5">
                            <button
                              type="button"
                              onClick={() => setExpandedId(expanded ? null : item.id)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-555 hover:border-[#12335f] hover:text-[#12335f] transition-all"
                              title={expanded ? "Collapse details" : "Expand tracking details"}
                            >
                              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                            </button>
                            <button
                              type="button"
                              onClick={() => setSelectedItem(item)}
                              className="inline-flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-555 hover:border-[#12335f] hover:text-[#12335f] transition-all"
                              title="View details"
                            >
                              <Eye className="h-4 w-4" />
                            </button>
                            <Link href={item.href} title={item.actionLabel} className="inline-flex h-8 min-w-[80px] max-w-[100px] items-center justify-center rounded-md bg-[#12335f] px-2.5 text-center text-[10px] font-black leading-tight text-white shadow-sm hover:bg-[#0e2a4f] transition-all">
                              {shortActionLabel(item.actionLabel)}
                            </Link>
                          </div>
                        </td>
                      </tr>
                      {expanded && (
                        <tr className="bg-blue-50/25">
                          <td colSpan={8} className="px-4 py-4">
                            <OpportunityDetailPanel item={item} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} label="opportunities" />
        </div>
      )}
      {selectedItem && <OpportunityDetailsDialog item={selectedItem} onClose={() => setSelectedItem(null)} />}
    </div>
  );
}

function shortActionLabel(label: string) {
  if (!label || typeof label !== 'string') return '';
  const normalized = label.toLowerCase();
  if (normalized.includes('auction')) return 'Join';
  if (normalized.includes('respond')) return 'Respond';
  if (normalized.includes('track')) return 'Track';
  if (normalized.includes('quote')) return 'Quote';
  if (normalized.includes('information')) return 'Info';
  if (normalized.includes('rate')) return 'Rates';
  if (normalized.includes('submit')) return 'Submit';
  return label.length > 12 ? `${label.slice(0, 10)}...` : label;
}

function SummaryTile({
  icon: Icon,
  label,
  value,
  active,
  onClick,
}: {
  icon: LucideIcon;
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "w-full rounded-[22px] bg-white/95 p-4 text-left shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70 transition-all focus:outline-none focus:ring-2 focus:ring-[#12335f]/20",
        active
          ? "ring-2 ring-[#12335f]/20 shadow-md bg-blue-50/30"
          : "hover:ring-[#12335f]/30 hover:shadow-md"
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{label}</p>
          <p className="mt-2 text-2xl font-black text-slate-950">{value}</p>
        </div>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#12335f] text-white shadow-sm">
          <Icon className="h-5 w-5" />
        </span>
      </div>
    </button>
  );
}

function OpportunityProgress({ item }: { item: SellerOpportunity }) {
  const normalized = `${item.status} ${item.eligibility}`.toLowerCase();
  const activeIndex = normalized.includes('awarded') || normalized.includes('closed')
    ? 4
    : normalized.includes('evaluation')
      ? 3
      : normalized.includes('participated') || normalized.includes('submitted')
        ? 2
        : 1;
  const steps = ['Published', 'Response', 'Evaluation', 'Award'];
  return (
    <div className="min-w-40">
      <div className="flex items-center gap-1.5">
        {steps.map((step, index) => {
          const done = index + 1 <= activeIndex;
          return (
            <span
              key={step}
              title={step}
              className={cn('h-2 flex-1 rounded-full', done ? 'bg-[#12335f]' : 'bg-slate-200')}
            />
          );
        })}
      </div>
      <p className="mt-1 text-[10px] font-black uppercase tracking-wide text-slate-500">{item.status}</p>
    </div>
  );
}

function OpportunityDetailPanel({ item }: { item: SellerOpportunity }) {
  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.4fr)]">
      <section className="rounded-[22px] bg-white/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Opportunity Details</p>
            <h3 className="mt-1 text-base font-black text-slate-950 text-wrap-anywhere">{item.title}</h3>
            <p className="mt-1 text-xs font-semibold text-slate-500">{item.sourceRef} / {item.type}</p>
          </div>
          <TypeBadge type={item.type} />
        </div>

        {item.description && (
          <p className="mt-3 line-clamp-3 text-xs font-semibold leading-relaxed text-slate-600 text-wrap-anywhere">{item.description}</p>
        )}

        <div className="mt-4 grid gap-2 sm:grid-cols-2">
          <Metric label="Buyer" value={item.buyer || 'Buyer details controlled'} />
          <Metric label="Category" value={item.category || 'General procurement'} />
          <Metric label="Quantity" value={item.quantity || 'Not specified'} />
          <Metric label="Commercial value" value={formatMoney(item.estimatedValue)} />
          <Metric label="Published" value={formatDate(item.publishedAt)} />
          <Metric label="Closing" value={formatDate(item.closingDate)} />
          <Metric label="Responses" value={item.responseCount !== undefined ? item.responseCount.toLocaleString('en-IN') : 'Not shown'} />
          <Metric label="Eligibility" value={item.eligibility} />
        </div>

        <div className="mt-4 rounded-[18px] bg-blue-50 p-3 ring-1 ring-blue-100">
          <div className="flex items-start gap-2">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#12335f]" />
            <p className="text-xs font-semibold leading-relaxed text-slate-700">{item.nextAction}</p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <Link href={item.detailsHref} className="inline-flex h-9 items-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:border-[#12335f] hover:text-[#12335f]">
            <Eye className="mr-1.5 h-4 w-4" /> View Details
          </Link>
          <Link href={item.href} className="inline-flex h-9 items-center rounded-2xl bg-[#12335f] px-3 text-xs font-black text-white">{item.actionLabel}</Link>
        </div>
      </section>

      <ProcurementLifecycleTracker
        events={item.events}
        currentStage="PROCUREMENT_CREATED"
        nextAction={item.nextAction}
        role="seller"
        sourceType={item.type}
        showTechnicalStatus
      />
    </div>
  );
}

function OpportunityDetailsDialog({ item, onClose }: { item: SellerOpportunity; onClose: () => void }) {
  const detailRows = item.detailRows || [];
  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/60 p-3 backdrop-blur-sm sm:p-5" role="dialog" aria-modal="true" aria-labelledby="opportunity-dialog-title">
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[24px] bg-white/95 shadow-2xl ring-1 ring-slate-200/70">
        <div className="border-b border-slate-200 bg-slate-50/80 px-5 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <TypeBadge type={item.type} />
                <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-[#c86413]">{item.sourceRef}</span>
                <span className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[10px] font-black uppercase tracking-widest text-slate-500">{item.status}</span>
              </div>
              <h2 id="opportunity-dialog-title" className="mt-2 text-xl font-black text-slate-950 text-wrap-anywhere">{item.title}</h2>
              <p className="mt-1 text-sm font-semibold text-slate-600">{[item.buyer || 'Buyer details controlled', item.category || 'General procurement', item.location || 'Location not specified'].join(' / ')}</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 hover:border-[#12335f] hover:text-[#12335f]"
              aria-label="Close opportunity details"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-y-auto p-5">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
            <div className="space-y-4">
              <section className="rounded-[22px] bg-white p-4 ring-1 ring-slate-200/70">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Procurement Brief</p>
                <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-700 text-wrap-anywhere">
                  {item.description || 'No detailed description was provided by the buyer for this opportunity.'}
                </p>
                <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  <Metric label="Published" value={formatDate(item.publishedAt)} />
                  <Metric label="Closing" value={formatDate(item.closingDate)} />
                  <Metric label="Estimated value" value={formatMoney(item.estimatedValue)} />
                  <Metric label="Quantity" value={item.quantity || 'Not specified'} />
                </div>
              </section>

              <section className="rounded-[22px] bg-white p-4 ring-1 ring-slate-200/70">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Commercial And Buyer Information</p>
                <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  <Metric label="Buyer" value={item.buyer || 'Buyer details controlled'} />
                  <Metric label="Buyer type" value={item.buyerType || 'Not specified'} />
                  <Metric label="Department" value={item.department || 'Not specified'} />
                  <Metric label="Procurement type" value={item.procurementType || item.type} />
                  <Metric label="Delivery location" value={item.deliveryLocation || item.location || 'Not specified'} />
                  <Metric label="Responses" value={item.responseCount !== undefined ? item.responseCount.toLocaleString('en-IN') : 'Not shown'} />
                </div>
                {detailRows.length > 0 && (
                  <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {detailRows.map(row => <Metric key={`${row.label}-${row.value}`} label={row.label} value={row.value} />)}
                  </div>
                )}
              </section>

              <section className="rounded-[22px] bg-white p-4 ring-1 ring-slate-200/70">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Documents, Terms And Compliance</p>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <ListBlock title={`Required documents (${item.documentsCount || item.documents?.length || 0})`} items={item.documents || []} fallback="No mandatory documents are listed in this feed." />
                  <ListBlock title="Terms and buyer notes" items={item.terms || []} fallback="No separate terms are listed in this feed." />
                </div>
              </section>
            </div>

            <aside className="space-y-4">
              <section className="rounded-[22px] bg-blue-50 p-4 ring-1 ring-blue-100">
                <div className="flex items-start gap-2">
                  <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#12335f]" />
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-[#12335f]">Seller Next Step</p>
                    <p className="mt-1 text-sm font-semibold leading-relaxed text-slate-700">{item.nextAction}</p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Link href={item.href} className="inline-flex h-9 items-center rounded-2xl bg-[#12335f] px-3 text-xs font-black text-white">{item.actionLabel}</Link>
                  <Link href={item.detailsHref} className="inline-flex h-9 items-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:border-[#12335f] hover:text-[#12335f]">Open source page</Link>
                </div>
              </section>
              <ProcurementLifecycleTracker
                events={item.events}
                currentStage="PROCUREMENT_CREATED"
                nextAction={item.nextAction}
                role="seller"
                sourceType={item.type}
                compact
                showTechnicalStatus
              />
            </aside>
          </div>
        </div>
      </div>
    </div>
  );
}

function ListBlock({ title, items, fallback }: { title: string; items: string[]; fallback: string }) {
  return (
    <div className="rounded-[18px] bg-slate-50 p-3 ring-1 ring-slate-200/70">
      <p className="text-[10px] font-black uppercase tracking-widest text-slate-500">{title}</p>
      {items.length > 0 ? (
        <ul className="mt-2 space-y-1.5">
          {items.map(item => (
            <li key={item} className="flex gap-2 text-xs font-semibold leading-relaxed text-slate-700">
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#12335f]" />
              <span className="text-wrap-anywhere">{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-2 text-xs font-semibold leading-relaxed text-slate-500">{fallback}</p>
      )}
    </div>
  );
}

function SelectFilter({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  options: string[];
}) {
  return (
    <select value={value} onChange={event => onChange(event.target.value)} className="h-10 rounded-2xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none transition focus:border-[#12335f] focus:ring-2 focus:ring-[#12335f]/10">
      <option value="">{placeholder}</option>
      {options.map(option => <option key={option} value={option}>{option}</option>)}
    </select>
  );
}

function TypeBadge({ type }: { type: OpportunityType }) {
  const tone = type === 'Quick Quote'
    ? 'border-blue-200 bg-blue-50 text-blue-700'
    : type === 'Auction'
      ? 'border-amber-200 bg-amber-50 text-amber-700'
      : type === 'Buyer Requirement'
        ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
        : 'border-indigo-200 bg-indigo-50 text-indigo-700';
  return <Badge className={cn('rounded-md', tone)}>{type}</Badge>;
}

function OpportunityCard({ item, serial, onView }: { item: SellerOpportunity; serial: number; onView: () => void }) {
  return (
    <article className="rounded-[22px] bg-white/95 p-4 shadow-[0_10px_30px_rgba(15,23,42,0.06)] ring-1 ring-slate-200/70 transition hover:shadow-md">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex h-6 items-center rounded-md border border-slate-200 bg-slate-50 px-2 text-[10px] font-black text-slate-500">#{serial}</span>
            <button type="button" onClick={onView} className="text-[10px] font-black uppercase tracking-widest text-[#c86413] underline-offset-4 hover:underline">{item.sourceRef}</button>
            <TypeBadge type={item.type} />
          </div>
          <h2 className="mt-2 text-base font-black text-slate-950 text-wrap-anywhere">{item.title}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">{[item.buyer || 'Buyer details controlled', item.category || 'General procurement', item.quantity].filter(Boolean).join(' / ')}</p>
        </div>
        <div className="flex shrink-0 flex-wrap gap-2">
          <button type="button" onClick={onView} className="inline-flex h-9 items-center justify-center rounded-2xl border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:border-[#12335f] hover:text-[#12335f]">
            <Eye className="mr-1.5 h-4 w-4" /> View
          </button>
          <Link href={item.href} className="inline-flex h-9 items-center justify-center rounded-2xl bg-[#12335f] px-3 text-xs font-black text-white">
            {item.actionLabel}
          </Link>
        </div>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Metric label="Location" value={item.location || 'Not specified'} />
        <Metric label="Published" value={formatDate(item.publishedAt)} />
        <Metric label="Closing" value={formatDate(item.closingDate)} />
        <Metric label="Value" value={formatMoney(item.estimatedValue)} />
        <Metric label="Eligibility" value={item.eligibility} />
      </div>
      <div className="mt-4">
        <ProcurementLifecycleTracker
          events={item.events}
          currentStage="PROCUREMENT_CREATED"
          role="seller"
          sourceType={item.type}
          compact
        />
      </div>
    </article>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-slate-50 p-3 ring-1 ring-slate-200/70">
      <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-black text-slate-800 text-wrap-anywhere">{value}</p>
    </div>
  );
}
