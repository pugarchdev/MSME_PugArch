'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { RefreshCw, Search } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Badge } from '../../../components/ui/card';
import { cn } from '../../../lib/utils';
import { marketplaceApi } from '../../marketplace/api';
import { procurementBidApi } from '../../procurementBid/api';
import { fetchQuoteRequests } from '../../rfq/api';
import { reverseAuctionApi } from '../../reverseAuctions/api';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';
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
  events: ProcurementLifecycleEvent[];
}

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

const toNumber = (value: unknown) => {
  const parsed = Number(value || 0);
  return Number.isFinite(parsed) ? parsed : 0;
};

const opportunityEvents = (status?: string): ProcurementLifecycleEvent[] => [
  {
    stage: 'PROCUREMENT_CREATED',
    status: status || 'open',
    description: 'Buyer opportunity is available for seller review',
  },
];

const typeFromQuery = (value: string | null): OpportunityType | '' => {
  if (value === 'quote') return 'Quick Quote';
  if (value === 'large') return 'Large Procurement';
  if (value === 'requirement') return 'Buyer Requirement';
  if (value === 'auction') return 'Auction';
  return '';
};

export default function SellerOpportunitiesPage() {
  const searchParams = useSearchParams();
  const [items, setItems] = useState<SellerOpportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<OpportunityType | ''>(() => typeFromQuery(searchParams.get('type')));
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [viewMode, setViewMode] = useResponsiveViewMode('seller:opportunities:view-mode');

  const load = React.useCallback(() => {
    let alive = true;
    setLoading(true);
    setError('');

    Promise.allSettled([
      procurementBidApi.list({ pageSize: 50 }),
      marketplaceApi.getRequirements({ pageSize: 50 }),
      fetchQuoteRequests({ pageSize: 50 }),
      reverseAuctionApi.list({ pageSize: 50 }),
    ]).then(results => {
      if (!alive) return;
      const next: SellerOpportunity[] = [];

      const bids = results[0].status === 'fulfilled' ? results[0].value?.items || [] : [];
      bids.forEach((bid: any) => {
        next.push({
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
          actionLabel: bid.participated ? 'View Bid' : 'Submit Bid',
          href: bid.sourceModel === 'TENDER' && bid.sourceId ? `/seller/tenders/${bid.sourceId}/bid` : `/bids/${bid.id}`,
          events: opportunityEvents(bid.status),
        });
      });

      const requirements = results[1].status === 'fulfilled' ? ((results[1].value as any)?.requirements || (results[1].value as any)?.items || results[1].value || []) : [];
      (Array.isArray(requirements) ? requirements : []).forEach((req: any) => {
        next.push({
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
          events: opportunityEvents(req.statusLabel || req.status),
        });
      });

      const quoteRequests = results[2].status === 'fulfilled' ? results[2].value?.records || [] : [];
      quoteRequests.forEach((rfq: any) => {
        next.push({
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
          events: opportunityEvents(rfq.status),
        });
      });

      const auctions = results[3].status === 'fulfilled' ? results[3].value?.auctions || [] : [];
      auctions.forEach((auction: any) => {
        next.push({
          id: `auction-${auction.id}`,
          type: 'Auction',
          title: auction.title || auction.auctionCode || 'Reverse auction',
          category: 'Negotiate Price',
          closingDate: auction.endTime,
          estimatedValue: toNumber(auction.currentLowestAmount || auction.startPrice),
          eligibility: 'Check invitation',
          status: auction.statusEnum || auction.status || 'Scheduled',
          actionLabel: 'Join Auction',
          href: `/reverse-auctions/${auction.id}`,
          events: opportunityEvents(auction.statusEnum || auction.status),
        });
      });

      setItems(next.sort((a, b) => new Date(a.closingDate || 0).getTime() - new Date(b.closingDate || 0).getTime()));
      if (!next.length && results.every(result => result.status === 'rejected')) {
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

  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items.filter(item => {
      const haystack = [item.title, item.buyer, item.category, item.location, item.status, item.type].join(' ').toLowerCase();
      if (text && !haystack.includes(text)) return false;
      if (type && item.type !== type) return false;
      if (status && item.status !== status) return false;
      if (location && item.location !== location) return false;
      if (closingDate === '7' && item.closingDate) {
        const diff = (new Date(item.closingDate).getTime() - Date.now()) / 86400000;
        if (diff > 7) return false;
      }
      return true;
    });
  }, [closingDate, items, location, query, status, type]);

  const reset = () => {
    setQuery('');
    setType('');
    setStatus('');
    setLocation('');
    setClosingDate('');
  };

  return (
    <div className="mx-auto max-w-7xl space-y-4 pb-6">
      <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-[#12335f]">Seller Opportunities</p>
            <h1 className="text-2xl font-black tracking-tight text-slate-950">New Opportunities</h1>
            <p className="mt-1 max-w-3xl text-sm font-semibold leading-relaxed text-slate-500">
              One place for request quotations, large procurements, buyer requirements, auctions, and procurement bids.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={load} className="h-10 rounded-md text-xs">
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
        </div>
      </div>

      <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
        <div className="grid gap-3 lg:grid-cols-[1fr_170px_170px_170px_150px_auto_auto] lg:items-center">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              value={query}
              onChange={event => setQuery(event.target.value)}
              placeholder="Search opportunity, buyer, category, location..."
              className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-10 pr-3 text-sm outline-none focus:border-[#12335f]"
            />
          </div>
          <SelectFilter value={type} onChange={(value) => setType(value as OpportunityType | '')} placeholder="All types" options={typeOptions} />
          <SelectFilter value={status} onChange={setStatus} placeholder="All statuses" options={statusOptions} />
          <SelectFilter value={location} onChange={setLocation} placeholder="All locations" options={locationOptions} />
          <select value={closingDate} onChange={event => setClosingDate(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none">
            <option value="">Any closing date</option>
            <option value="7">Next 7 days</option>
          </select>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <Button type="button" variant="outline" onClick={reset} className="h-10 rounded-md text-xs">Reset</Button>
        </div>
      </div>

      {loading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {[1, 2, 3, 4].map(item => <div key={item} className="h-40 rounded-lg border border-slate-200 bg-white p-4 shadow-sm"><div className="h-4 w-40 rounded bg-slate-100" /><div className="mt-4 h-20 rounded bg-slate-100" /></div>)}
        </div>
      ) : error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm font-semibold text-red-700">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h2 className="text-base font-black text-slate-950">No matching opportunities right now.</h2>
          <p className="mt-1 text-sm font-semibold text-slate-500">Check again later or update your marketplace categories.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.map(item => <OpportunityCard key={item.id} item={item} />)}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1060px] text-sm">
              <thead className="bg-slate-50 text-[10px] font-black uppercase tracking-wider text-slate-500">
                <tr>
                  <th className="px-4 py-3 text-left">Type</th>
                  <th className="px-4 py-3 text-left">Opportunity</th>
                  <th className="px-4 py-3 text-left">Buyer</th>
                  <th className="px-4 py-3 text-left">Location</th>
                  <th className="px-4 py-3 text-left">Closing</th>
                  <th className="px-4 py-3 text-right">Value</th>
                  <th className="px-4 py-3 text-left">Eligibility</th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(item => (
                  <tr key={item.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3"><TypeBadge type={item.type} /></td>
                    <td className="px-4 py-3">
                      <p className="text-xs font-black text-slate-950 text-wrap-anywhere">{item.title}</p>
                      <p className="mt-1 text-[10px] font-bold text-slate-500">{item.category || 'General procurement'} / {item.status}</p>
                    </td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.buyer || 'Buyer details controlled'}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.location || 'Not specified'}</td>
                    <td className="px-4 py-3 text-xs font-bold text-slate-700">{formatDate(item.closingDate)}</td>
                    <td className="px-4 py-3 text-right text-xs font-black text-[#12335f]">{formatMoney(item.estimatedValue)}</td>
                    <td className="px-4 py-3 text-xs font-semibold text-slate-600">{item.eligibility}</td>
                    <td className="px-4 py-3 text-right">
                      <Link href={item.href} className="inline-flex h-8 items-center rounded-md bg-[#12335f] px-3 text-[10px] font-black text-white">{item.actionLabel}</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
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
    <select value={value} onChange={event => onChange(event.target.value)} className="h-10 rounded-md border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none">
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

function OpportunityCard({ item }: { item: SellerOpportunity }) {
  return (
    <article className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <TypeBadge type={item.type} />
          <h2 className="mt-2 text-base font-black text-slate-950 text-wrap-anywhere">{item.title}</h2>
          <p className="mt-1 text-xs font-semibold text-slate-500">{item.buyer || 'Buyer details controlled'} / {item.category || 'General procurement'}</p>
        </div>
        <Link href={item.href} className="inline-flex h-9 shrink-0 items-center justify-center rounded-md bg-[#12335f] px-3 text-xs font-black text-white">
          {item.actionLabel}
        </Link>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-4">
        <Metric label="Location" value={item.location || 'Not specified'} />
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
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3">
      <p className="text-[9px] font-black uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-xs font-black text-slate-800 text-wrap-anywhere">{value}</p>
    </div>
  );
}
