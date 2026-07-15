'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Building2, CalendarDays, ChevronDown, ChevronUp, ClipboardList, Eye, FileText, Gavel, MapPin, RefreshCw, Search, ShieldCheck, X, IndianRupee, Clock, Users, CheckCircle2, type LucideIcon } from 'lucide-react';
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
import { useAuth } from '../../../hooks/useAuth';

type OpportunityType = 'RFQ' | 'RFP' | 'Open Tender' | 'Limited Tender' | 'Reverse Auction' | 'Direct Purchase' | 'Rate Contract' | 'Repeat Order';

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
  isInvitation?: boolean;
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

/**
 * Procurement descriptions are stored as "Sourcing Method: X\nValue: Y\nUrgency: Z" and render
 * as an unreadable run-on. Strip that machine blob so the cell shows only the human summary text
 * (the method/value/urgency already have their own columns). Returns '' when nothing is left.
 */
const cleanOpportunitySummary = (desc?: string | null): string => {
  if (!desc) return '';
  return desc
    .replace(/\r/g, '')
    .replace(/Sourcing Method:\s*(.*?)(?=(?:Value:|Urgency:|$))/is, '')
    .replace(/Value:\s*(.*?)(?=(?:Urgency:|$))/is, '')
    .replace(/Urgency:\s*(.*?)(?=$)/is, '')
    .replace(/[\n\r|]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
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
  if (item.type === 'Reverse Auction') return 'Open auction details, verify invitation and timeline, then join the live auction when it is active.';
  if (item.type === 'RFQ') return 'Open RFQ details, verify commercial terms and deadline, then submit the quotation before closure.';
  return 'Open details, review documents and eligibility, then submit the bid or response before the closing date.';
};

const typeFromQuery = (value: string | null): OpportunityType | '' => {
  if (value === 'rfq' || value === 'quote') return 'RFQ';
  if (value === 'rfp') return 'RFP';
  if (value === 'open-tender' || value === 'large') return 'Open Tender';
  if (value === 'limited-tender' || value === 'invitations') return 'Limited Tender';
  if (value === 'reverse-auction' || value === 'auction') return 'Reverse Auction';
  return '';
};

const getSubRouteType = (): OpportunityType | '' => {
  if (typeof window === 'undefined') return '';
  const path = window.location.pathname;
  if (path.endsWith('/rfqs')) return 'RFQ';
  if (path.endsWith('/rfps')) return 'RFP';
  if (path.endsWith('/open-tenders')) return 'Open Tender';
  if (path.endsWith('/invitations')) return 'Limited Tender';
  if (path.endsWith('/auctions')) return 'Reverse Auction';
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

const getDaysLeftText = (closingDate?: string) => {
  if (!closingDate) return '';
  const diff = (new Date(closingDate).getTime() - Date.now()) / 86400000;
  if (diff < 0) return 'Closed';
  const days = Math.ceil(diff);
  return `${days} Day${days > 1 ? 's' : ''} Left`;
};

function CountdownTimer({ endDate }: { endDate?: string }) {
  const [timeLeft, setTimeLeft] = useState('');

  useEffect(() => {
    if (!endDate) return;
    const calculateTime = () => {
      const diff = new Date(endDate).getTime() - Date.now();
      if (diff <= 0) {
        setTimeLeft('Ended');
        return;
      }
      const hrs = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const secs = Math.floor((diff % 60000) / 1000);
      
      const pad = (n: number) => String(n).padStart(2, '0');
      setTimeLeft(`${pad(hrs)}h : ${pad(mins)}m : ${pad(secs)}s`);
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [endDate]);

  return <span className="font-mono text-xs font-black text-red-600 animate-pulse">{timeLeft}</span>;
}

export default function SellerOpportunitiesPage({ subRouteType = '' }: { subRouteType?: OpportunityType | '' }) {
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const [items, setItems] = useState<SellerOpportunity[]>(() => globalOpportunitiesCache || []);
  const [loading, setLoading] = useState(() => !globalOpportunitiesCache);
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [type, setType] = useState<OpportunityType | ''>(() => subRouteType || typeFromQuery(searchParams?.get('type')));

  useEffect(() => {
    setType(subRouteType);
  }, [subRouteType]);
  const [status, setStatus] = useState('');
  const [location, setLocation] = useState('');
  const [closingDate, setClosingDate] = useState('');
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<SellerOpportunity | null>(null);
  const [viewMode, setViewMode] = useResponsiveViewMode('seller:opportunities:view-mode');
  const [kpiFilter, setKpiFilter] = useState<'all' | 'open' | 'dueSoon' | 'auctions' | 'invitations'>('all');
  const [category, setCategory] = useState('');
  const [valueRange, setValueRange] = useState('');
  const [buyerFilter, setBuyerFilter] = useState('');
  const [sortField, setSortField] = useState<'type' | 'title' | 'buyer' | 'publishedAt' | 'closingDate' | 'estimatedValue' | ''>('');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('asc');

  const handleSort = (field: 'type' | 'title' | 'buyer' | 'publishedAt' | 'closingDate' | 'estimatedValue') => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const renderSortIcon = (field: 'type' | 'title' | 'buyer' | 'publishedAt' | 'closingDate' | 'estimatedValue') => {
    if (sortField !== field) {
      return <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-slate-300 opacity-40 group-hover:opacity-100 transition-opacity" />;
    }
    return sortDirection === 'asc' 
      ? <ChevronUp className="ml-1 h-3.5 w-3.5 shrink-0 text-blue-600 font-extrabold" />
      : <ChevronDown className="ml-1 h-3.5 w-3.5 shrink-0 text-blue-600 font-extrabold" />;
  };

  const load = React.useCallback(() => {
    let alive = true;
    if (!globalOpportunitiesCache) {
      setLoading(true);
    }
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
        const method = String(bid.procurementType || bid.bidType || '').toUpperCase();
        const allowedMethods = ['RFQ', 'RFP', 'OPEN_TENDER', 'LIMITED_TENDER', 'REVERSE_AUCTION', 'TENDER', 'REPEAT_ORDER', 'RATE_CONTRACT'];
        if (!allowedMethods.includes(method)) return;

        // Public/invited visibility is enforced by the backend list endpoint
        // (GET /api/bids filters by visibility + invitation membership). We intentionally
        // do NOT re-derive privacy here — a client-side heuristic would diverge from the
        // server rule and either hide invited opportunities or leak private ones.

        const documents = asTextList(bid.requiredDocuments);
        const terms = asTextList(bid.terms);
        
        let actionLabel = bid.participated ? 'Track Status' : 'Submit Bid';
        let href = `/bids/${bid.id}/participate`;
        let detailsHref = `/bids/${bid.id}`;

        if (bid.sourceModel === 'TENDER' && bid.sourceId) {
          href = `/seller/tenders/${bid.sourceId}/bid`;
          detailsHref = `/tenders?tender=${bid.sourceId}`;
          actionLabel = bid.participated ? 'Track Status' : 'Submit Quote';
        } else if (method === 'RFQ') {
          href = `/seller/rfq?requestId=${bid.id}`;
          detailsHref = `/seller/rfq?requestId=${bid.id}`;
          actionLabel = 'Submit Quote';
        } else if (method === 'RFP') {
          href = `/seller/rfp?requestId=${bid.id}`;
          detailsHref = `/seller/rfp?requestId=${bid.id}`;
          actionLabel = 'Submit Proposal';
        }

        let opportunityType: OpportunityType = 'RFQ';
        if (method === 'RFP') opportunityType = 'RFP';
        else if (method === 'OPEN_TENDER' || method === 'TENDER') opportunityType = 'Open Tender';
        else if (method === 'LIMITED_TENDER') opportunityType = 'Limited Tender';
        else if (method === 'REVERSE_AUCTION') opportunityType = 'Reverse Auction';
        else if (method === 'REPEAT_ORDER') opportunityType = 'Repeat Order';
        else if (method === 'RATE_CONTRACT') opportunityType = 'Rate Contract';

        const opportunity: SellerOpportunity = {
          id: `bid-${bid.id}`,
          type: opportunityType,
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
          isInvitation: method === 'LIMITED_TENDER' || bid.isInvited || bid.visibility === 'INVITED_SUPPLIERS',
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
        const reqMethod = String(req.canonicalMethod || req.procurementMethod || 'RFQ').toUpperCase();
        const allowedMethods = ['RFQ', 'RFP', 'OPEN_TENDER', 'LIMITED_TENDER', 'REVERSE_AUCTION', 'TENDER', 'REPEAT_ORDER', 'RATE_CONTRACT'];
        if (reqMethod && !allowedMethods.includes(reqMethod)) return;

        const reqInvites = Array.isArray(req.payload?.vendors?.invitedSellers) 
          ? req.payload.vendors.invitedSellers 
          : (Array.isArray(req.invitedSellers) ? req.invitedSellers : []);
        
        const isReqPrivate = req.visibility === 'VERIFIED_SELLERS_ONLY' || req.visibility === 'INVITED_SUPPLIERS' || ['LIMITED_TENDER', 'REPEAT_ORDER', 'RATE_CONTRACT'].includes(reqMethod);
        
        if (isReqPrivate) {
          const isInvited = reqInvites.includes(user?.id) || reqInvites.includes(user?.organizationId) || req.responsesCount > 0;
          if (!isInvited) return;
        }

        let opportunityType: OpportunityType = 'RFQ';
        if (reqMethod === 'RFP') opportunityType = 'RFP';
        else if (reqMethod === 'OPEN_TENDER' || reqMethod === 'TENDER') opportunityType = 'Open Tender';
        else if (reqMethod === 'LIMITED_TENDER') opportunityType = 'Limited Tender';
        else if (reqMethod === 'REVERSE_AUCTION') opportunityType = 'Reverse Auction';
        else if (reqMethod === 'RATE_CONTRACT') opportunityType = 'Rate Contract';
        else if (reqMethod === 'REPEAT_ORDER') opportunityType = 'Repeat Order';

        const documents = asTextList(req.requiredDocuments);
        const linkedBidId = req.payload?.linkedProcurementBidId;
        // Reverse auctions go straight to the auction page. The backend resolves a requirement
        // id to its linked auction, so we skip the /marketplace bridge + its extra redirect hop.
        const buildDetailHref = () => {
          if (opportunityType === 'RFQ') return `/seller/rfq?requirementId=${req.id}`;
          if (opportunityType === 'RFP') return `/seller/rfp?requirementId=${req.id}`;
          if (opportunityType === 'Reverse Auction') return `/reverse-auctions/${req.sourceId || req.id}`;
          return `/marketplace/requirements/${req.sourceId || req.id}`;
        };
        const detailHref = buildDetailHref();
        const responseHref = linkedBidId ? `/bids/${linkedBidId}/participate` : detailHref;
        const opportunity: SellerOpportunity = {
          id: `req-${req.id}`,
          type: opportunityType,
          title: req.title || 'Buyer requirement',
          buyer: req.buyerOrganization?.organizationName,
          category: req.category?.name,
          location: req.location || [req.buyerOrganization?.district, req.buyerOrganization?.state].filter(Boolean).join(', '),
          closingDate: req.lastDate,
          estimatedValue: toNumber(req.budgetMax || req.budgetMin),
          eligibility: req.visibility === 'VERIFIED_SELLERS_ONLY' ? 'Verified sellers only' : 'Open',
          status: req.statusLabel || req.status || 'Open',
          actionLabel: opportunityType === 'RFP' ? 'Submit Proposal' : opportunityType === 'RFQ' ? 'Submit Quote' : 'Respond',
          href: responseHref,
          detailsHref: detailHref,
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
          isInvitation: reqMethod === 'LIMITED_TENDER' || req.visibility === 'INVITED_SUPPLIERS',
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
          type: 'RFQ',
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
          isInvitation: true,
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
        const isAuctionPrivate = auction.visibilityMode === 'INVITED_SELLERS_ONLY';
        const auctionInvites = Array.isArray(auction.invitedSellers) 
          ? auction.invitedSellers.map((v: any) => v?.sellerOrgId || v) 
          : [];
        
        if (isAuctionPrivate) {
          const isInvited = auctionInvites.includes(user?.id) || auctionInvites.includes(user?.organizationId) || auction.participated;
          if (!isInvited) return;
        }

        const documents = asTextList(auction.documents);
        const opportunity: SellerOpportunity = {
          id: `auction-${auction.id}`,
          type: 'Reverse Auction',
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
          isInvitation: auction.visibilityMode === 'INVITED_SELLERS_ONLY' || auction.isInvited || auction.invitedSellers?.some((v: any) => (v?.sellerOrgId || v) === user?.organizationId),
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

      // Title-based deduplication to prevent showing the same procurement multiple times
      const seenTitles = new Set<string>();
      const deduped: SellerOpportunity[] = [];
      next.forEach(opportunity => {
        const normalizedTitle = (opportunity.title || '').trim().toLowerCase();
        if (!seenTitles.has(normalizedTitle)) {
          seenTitles.add(normalizedTitle);
          deduped.push(opportunity);
        }
      });

      const sorted = deduped.sort((a, b) => new Date(a.closingDate || 0).getTime() - new Date(b.closingDate || 0).getTime());
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
    if (subRouteType) return;
    setType(typeFromQuery(searchParams?.get('type')));
  }, [searchParams, subRouteType]);

  const typeOptions = useMemo(() => Array.from(new Set(items.map(item => item.type))).sort(), [items]);
  const statusOptions = useMemo(() => Array.from(new Set(items.map(item => item.status).filter(Boolean))).sort(), [items]);
  const locationOptions = useMemo(() => Array.from(new Set(items.map(item => item.location).filter((value): value is string => Boolean(value)))).sort(), [items]);
  const categoryOptions = useMemo(() => Array.from(new Set(items.map(item => item.category).filter((value): value is string => Boolean(value)))).sort(), [items]);
  const buyerOptions = useMemo(() => Array.from(new Set(items.map(item => item.buyer).filter((value): value is string => Boolean(value)))).sort(), [items]);

  const baseFiltered = useMemo(() => {
    const text = query.trim().toLowerCase();
    return items.filter(item => {
      const haystack = [item.title, item.buyer, item.category, item.location, item.status, item.type, item.sourceRef, item.description].join(' ').toLowerCase();
      if (text && !haystack.includes(text)) return false;
      if (type) {
        if (type === 'Limited Tender') {
          if (!item.isInvitation) return false;
        } else if (item.type !== type) {
          return false;
        }
      }
      if (status && item.status !== status) return false;
      if (location && item.location !== location) return false;
      if (category && item.category !== category) return false;
      if (buyerFilter && item.buyer !== buyerFilter) return false;
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
  }, [closingDate, items, location, query, status, type, category, buyerFilter, valueRange]);

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
      auctions: baseFiltered.filter(item => item.type === 'Reverse Auction').length,
    };
  }, [baseFiltered]);

  const filtered = useMemo(() => {
    const openStatuses = new Set(['open', 'scheduled', 'live', 'pending', 'closing soon']);
    const list = baseFiltered.filter(item => {
      if (kpiFilter === 'open' && !openStatuses.has(String(item.status).toLowerCase())) return false;
      if (kpiFilter === 'dueSoon') {
        if (!item.closingDate) return false;
        const diff = (new Date(item.closingDate).getTime() - Date.now()) / 86400000;
        if (diff < 0 || diff > 7) return false;
      }
      if (kpiFilter === 'auctions' && item.type !== 'Reverse Auction') return false;
      if (kpiFilter === 'invitations' && !item.isInvitation) return false;
      return true;
    });

    if (sortField) {
      list.sort((a, b) => {
        let valA: any = a[sortField];
        let valB: any = b[sortField];

        if (sortField === 'estimatedValue') {
          valA = Number(valA) || 0;
          valB = Number(valB) || 0;
        } else if (sortField === 'publishedAt' || sortField === 'closingDate') {
          valA = valA ? new Date(valA).getTime() : 0;
          valB = valB ? new Date(valB).getTime() : 0;
        } else {
          valA = String(valA || '').toLowerCase();
          valB = String(valB || '').toLowerCase();
        }

        if (valA < valB) return sortDirection === 'asc' ? -1 : 1;
        if (valA > valB) return sortDirection === 'asc' ? 1 : -1;
        return 0;
      });
    }

    return list;
  }, [baseFiltered, kpiFilter, sortField, sortDirection]);

  // Reset KPI filter when dropdown filters change
  useEffect(() => {
    setKpiFilter('all');
  }, [query, type, status, location, closingDate, category, buyerFilter, valueRange]);

  useEffect(() => {
    setPage(1);
    setExpandedId(null);
  }, [closingDate, location, query, status, type, viewMode, kpiFilter, category, buyerFilter, valueRange]);

  const pageRows = useMemo(() => filtered.slice((page - 1) * pageSize, page * pageSize), [filtered, page]);

  const reset = () => {
    setQuery('');
    setType('');
    setStatus('');
    setLocation('');
    setClosingDate('');
    setCategory('');
    setBuyerFilter('');
    setValueRange('');
    setKpiFilter('all');
    setSortField('');
    setSortDirection('asc');
    setPage(1);
  };

  const headerContent = useMemo(() => {
    switch (subRouteType) {
      case 'RFQ':
        return {
          eyebrow: 'RFQ Sourcing',
          title: 'Requests for Quotation (RFQs)',
          desc: 'Submit quick pricing quotes for standard goods and materials requested by buyers.'
        };
      case 'RFP':
        return {
          eyebrow: 'Strategic RFPs',
          title: 'Requests for Proposal (RFPs)',
          desc: 'Review detailed requirements and submit proposals for complex services, projects, and custom solutions.'
        };
      case 'Open Tender':
        return {
          eyebrow: 'Open Tenders',
          title: 'Open Competitive Tenders',
          desc: 'Participate in public procurement tenders and high-value competitive bidding opportunities.'
        };
      case 'Limited Tender':
        return {
          eyebrow: 'Direct Invitations',
          title: 'Restricted Sourcing & Invitations',
          desc: 'View limited bidding invitations and requests sent specifically to your organization.'
        };
      case 'Reverse Auction':
        return {
          eyebrow: 'Reverse Auctions',
          title: 'Live Reverse Auctions',
          desc: 'Compete in real-time dynamic bidding events to secure contracts by offering competitive pricing.'
        };
      default:
        return {
          eyebrow: 'Bidding Opportunities',
          title: 'New Bidding Opportunities',
          desc: 'One place to review requests for quotations (RFQs), public tenders, auctions, and direct buyer requirements.'
        };
    }
  }, [subRouteType]);

  const kpis = useMemo(() => {
    const total = items.length;
    const closingSoon = items.filter(item => {
      if (!item.closingDate) return false;
      const diff = (new Date(item.closingDate).getTime() - Date.now()) / 86400000;
      return diff >= 0 && diff <= 7;
    }).length;
    const auctionsLive = items.filter(item => item.type === 'Reverse Auction' && ['LIVE', 'OPEN', 'ACTIVE'].includes(String(item.status).toUpperCase())).length;
    const invitations = items.filter(item => item.isInvitation).length;

    return { total, closingSoon, auctionsLive, invitations };
  }, [items]);


  return (
    <div className="mx-auto max-w-7xl space-y-6 px-4 pb-12 pt-4">
      {/* Title Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-black text-slate-950 tracking-tight">{headerContent.title}</h1>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">{headerContent.desc}</p>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
        {/* Card 1: Total Opportunities */}
        <button
          type="button"
          onClick={() => setKpiFilter(kpiFilter === 'all' ? 'all' : 'all')}
          className={cn(
            "flex items-center justify-between rounded-2xl border p-4 transition-all duration-300 text-left hover:-translate-y-0.5",
            kpiFilter === 'all' 
              ? "border-blue-500 bg-blue-50/20 ring-1 ring-blue-500/25 shadow-sm"
              : "border-slate-200/80 bg-white hover:border-blue-300 hover:shadow-sm"
          )}
        >
          <div>
            <p className="text-xl font-black text-blue-600">{kpis.total}</p>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">Total Opportunities</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
            <ClipboardList className="h-4.5 w-4.5" />
          </div>
        </button>

        {/* Card 2: Closing Soon */}
        <button
          type="button"
          onClick={() => setKpiFilter(kpiFilter === 'dueSoon' ? 'all' : 'dueSoon')}
          className={cn(
            "flex items-center justify-between rounded-2xl border p-4 transition-all duration-300 text-left hover:-translate-y-0.5",
            kpiFilter === 'dueSoon' 
              ? "border-amber-500 bg-amber-50/20 ring-1 ring-amber-500/25 shadow-sm"
              : "border-slate-200/80 bg-white hover:border-amber-300 hover:shadow-sm"
          )}
        >
          <div>
            <p className="text-xl font-black text-amber-600">{kpis.closingSoon}</p>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">Closing Soon</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600">
            <Clock className="h-4.5 w-4.5" />
          </div>
        </button>

        {/* Card 3: Reverse Auctions Live */}
        <button
          type="button"
          onClick={() => setKpiFilter(kpiFilter === 'auctions' ? 'all' : 'auctions')}
          className={cn(
            "flex items-center justify-between rounded-2xl border p-4 transition-all duration-300 text-left hover:-translate-y-0.5",
            kpiFilter === 'auctions' 
              ? "border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-500/25 shadow-sm"
              : "border-slate-200/80 bg-white hover:border-emerald-300 hover:shadow-sm"
          )}
        >
          <div>
            <p className="text-xl font-black text-emerald-600">{kpis.auctionsLive}</p>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">Reverse Auctions Live</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
            <CheckCircle2 className="h-4.5 w-4.5" />
          </div>
        </button>

        {/* Card 4: Invitations */}
        <button
          type="button"
          onClick={() => setKpiFilter(kpiFilter === 'invitations' ? 'all' : 'invitations')}
          className={cn(
            "flex items-center justify-between rounded-2xl border p-4 transition-all duration-300 text-left hover:-translate-y-0.5",
            kpiFilter === 'invitations' 
              ? "border-purple-500 bg-purple-50/20 ring-1 ring-purple-500/25 shadow-sm"
              : "border-slate-200/80 bg-white hover:border-purple-300 hover:shadow-sm"
          )}
        >
          <div>
            <p className="text-xl font-black text-purple-600">{kpis.invitations}</p>
            <p className="text-[10px] font-bold text-slate-500 mt-0.5">Invitations</p>
          </div>
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-50 text-purple-600">
            <Users className="h-4.5 w-4.5" />
          </div>
        </button>
      </div>

      {/* Dynamic Inline Selector Filters */}
      <div className="flex flex-wrap items-center gap-3 py-2 border-y border-slate-100">
        {/* Search bar */}
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={event => { setQuery(event.target.value); setPage(1); }}
            placeholder="Search opportunities..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 shadow-sm"
          />
        </div>

        {/* Type Dropdown */}
        {!subRouteType && (
          <div className="w-40">
            <select
              value={type}
              onChange={e => { setType(e.target.value as OpportunityType | ''); setPage(1); }}
              className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-300 focus:border-[#12335f] shadow-sm cursor-pointer"
            >
              <option value="">All Types</option>
              {typeOptions.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
            </select>
          </div>
        )}

        {/* Category Dropdown */}
        <div className="w-44">
          <select
            value={category}
            onChange={e => { setCategory(e.target.value); setPage(1); }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-300 focus:border-[#12335f] shadow-sm cursor-pointer"
          >
            <option value="">All Categories</option>
            {categoryOptions.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Buyer Dropdown */}
        <div className="w-44">
          <select
            value={buyerFilter}
            onChange={e => { setBuyerFilter(e.target.value); setPage(1); }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-300 focus:border-[#12335f] shadow-sm cursor-pointer"
          >
            <option value="">All Buyers</option>
            {buyerOptions.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Location Dropdown */}
        <div className="w-40">
          <select
            value={location}
            onChange={e => { setLocation(e.target.value); setPage(1); }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-300 focus:border-[#12335f] shadow-sm cursor-pointer"
          >
            <option value="">All Locations</option>
            {locationOptions.map((opt, i) => <option key={i} value={opt}>{opt}</option>)}
          </select>
        </div>

        {/* Closing Date Dropdown */}
        <div className="w-40">
          <select
            value={closingDate}
            onChange={e => { setClosingDate(e.target.value); setPage(1); }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-300 focus:border-[#12335f] shadow-sm cursor-pointer"
          >
            <option value="">Closing Date</option>
            <option value="7">Next 7 days</option>
          </select>
        </div>

        {/* Reset Trigger */}
        <button
          type="button"
          onClick={reset}
          className="text-xs font-black text-blue-600 hover:text-blue-800 transition-colors uppercase tracking-wider pl-2"
        >
          Reset
        </button>

        {/* View Mode & Count */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs font-semibold text-slate-500">
            {filtered.length} opportunity{filtered.length !== 1 ? 's' : ''}
          </span>
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
        </div>
      </div>

      {/* Main Content Area */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map(item => (
            <div key={item} className="h-32 rounded-2xl border border-slate-100 bg-white p-4 shadow-sm animate-pulse flex items-center justify-between">
              <div className="space-y-2 flex-1"><div className="h-4 w-48 rounded bg-slate-100" /><div className="h-3 w-32 rounded bg-slate-100" /></div>
              <div className="h-8 w-24 rounded bg-slate-100" />
            </div>
          ))}
        </div>
      ) : error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">{error}</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center shadow-sm">
          <p className="text-sm font-black text-slate-950">No opportunities match your filter criteria.</p>
          <p className="text-xs font-semibold text-slate-500 mt-1">Try resetting the filters or typing a different search term.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {viewMode === 'grid' ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {pageRows.map((item, index) => {
                const isLiveAuction = item.type === 'Reverse Auction' && String(item.status).toUpperCase() === 'OPEN';
                return (
                  <div
                    key={item.id}
                    className={cn(
                      "rounded-2xl border bg-white p-5 shadow-sm hover:shadow-md transition-all duration-300 border-slate-200/80 hover:border-slate-350 flex flex-col justify-between min-h-[220px] animate-in fade-in duration-200",
                      isLiveAuction && "border-blue-400 bg-blue-50/5 ring-1 ring-blue-400/25 shadow-blue-50/20"
                    )}
                  >
                    <div className="space-y-3">
                      {/* Top row: Badges */}
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "inline-flex rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border",
                          item.type === 'Reverse Auction' ? "border-red-200 bg-red-50 text-red-600" :
                          item.type === 'RFQ' ? "border-orange-200 bg-orange-50 text-orange-600" :
                          item.type === 'RFP' ? "border-purple-200 bg-purple-50 text-purple-600" :
                          item.type === 'Open Tender' ? "border-emerald-200 bg-emerald-50 text-emerald-600" :
                          "border-amber-200 bg-amber-50 text-amber-600" // Limited Tender / Invitation
                        )}>
                          {item.type === 'Limited Tender' ? 'INVITATION ONLY' : item.type}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
                        {item.title}
                      </h3>

                      {/* Source Ref & Buyer */}
                      <div className="text-[11px] text-slate-500 font-bold space-y-1">
                        <p className="font-mono text-slate-400">Ref: {item.sourceRef}</p>
                        <p>Buyer: {item.buyer || 'Buyer details controlled'}</p>
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-4 space-y-3">
                      {/* Timeline & Commercials */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Closing Date</p>
                          {isLiveAuction ? (
                            <div className="mt-1 space-y-1">
                              <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase text-emerald-600 tracking-wider">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                                Live
                              </span>
                              <CountdownTimer endDate={item.closingDate} />
                            </div>
                          ) : (
                            <div className="mt-1">
                              <span className="text-xs font-black text-slate-700 block">{formatDate(item.closingDate)}</span>
                              <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider">
                                {getDaysLeftText(item.closingDate)}
                              </span>
                            </div>
                          )}
                        </div>

                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Est. Value</p>
                          <div className="mt-1">
                            <span className="text-xs font-extrabold text-slate-900 block">
                              {formatMoney(item.estimatedValue)}
                            </span>
                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">
                              {item.type === 'Reverse Auction' ? 'Negotiate Price' : 
                               item.type === 'RFP' ? 'Negotiable' : 'Fixed Price'}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="flex justify-end pt-1">
                        <Link
                          href={item.type === 'Limited Tender' ? item.href : item.detailsHref}
                          className="inline-flex h-8 w-full items-center justify-center rounded-lg bg-blue-600 px-3 text-center text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-all duration-200"
                        >
                          {item.type === 'Limited Tender' ? 'Respond' : 'View Details'}
                        </Link>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-slate-200/80 bg-slate-50/20 p-2 shadow-sm">
              <table className="w-full min-w-[950px] border-separate border-spacing-y-2 text-left">
                <thead>
                  <tr className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    <th className="px-4 py-3 text-center w-16 select-none">Sr. No.</th>
                    <th onClick={() => handleSort('type')} className="px-4 py-3 w-28 cursor-pointer select-none hover:text-[#12335f] transition-colors group">
                      <div className="flex items-center">
                        Type {renderSortIcon('type')}
                      </div>
                    </th>
                    <th onClick={() => handleSort('title')} className="px-4 py-3 w-80 cursor-pointer select-none hover:text-[#12335f] transition-colors group">
                      <div className="flex items-center">
                        Title & Reference {renderSortIcon('title')}
                      </div>
                    </th>
                    <th onClick={() => handleSort('buyer')} className="px-4 py-3 w-64 cursor-pointer select-none hover:text-[#12335f] transition-colors group">
                      <div className="flex items-center">
                        Buyer & Location {renderSortIcon('buyer')}
                      </div>
                    </th>
                    <th onClick={() => handleSort('publishedAt')} className="px-4 py-3 w-32 cursor-pointer select-none hover:text-[#12335f] transition-colors group">
                      <div className="flex items-center">
                        Published Date {renderSortIcon('publishedAt')}
                      </div>
                    </th>
                    <th onClick={() => handleSort('closingDate')} className="px-4 py-3 w-36 cursor-pointer select-none hover:text-[#12335f] transition-colors group">
                      <div className="flex items-center">
                        Closing Date {renderSortIcon('closingDate')}
                      </div>
                    </th>
                    <th onClick={() => handleSort('estimatedValue')} className="px-4 py-3 w-40 cursor-pointer select-none hover:text-[#12335f] transition-colors group">
                      <div className="flex items-center">
                        Est. Value {renderSortIcon('estimatedValue')}
                      </div>
                    </th>
                    <th className="px-4 py-3 text-right w-32 select-none">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((item, index) => {
                    const isLiveAuction = item.type === 'Reverse Auction' && String(item.status).toUpperCase() === 'OPEN';
                    
                    return (
                      <tr
                        key={item.id}
                        className={cn(
                          "bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)] transition hover:shadow-md align-middle",
                          isLiveAuction && "bg-blue-50/5 hover:bg-blue-50/10"
                        )}
                      >
                        {/* Serial Number */}
                        <td className="rounded-l-xl px-4 py-4 text-xs font-black text-slate-400 text-center">
                          {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                        </td>

                        {/* Opportunity Type Badge */}
                        <td className="px-4 py-4">
                          <span className={cn(
                            "inline-flex rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border whitespace-nowrap",
                            item.type === 'Reverse Auction' ? "border-red-200 bg-red-50 text-red-600" :
                            item.type === 'RFQ' ? "border-orange-200 bg-orange-50 text-orange-600" :
                            item.type === 'RFP' ? "border-purple-200 bg-purple-50 text-purple-600" :
                            item.type === 'Open Tender' ? "border-emerald-200 bg-emerald-50 text-emerald-600" :
                            "border-amber-200 bg-amber-50 text-amber-600" // Limited Tender / Invitation
                          )}>
                            {item.type === 'Limited Tender' ? 'INVITATION' : item.type}
                          </span>
                        </td>

                        {/* Title and Reference */}
                        <td className="px-4 py-4 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {item.sourceRef}
                            </span>
                            {item.category && (
                              <span className="text-[9px] font-bold text-slate-400 bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100">
                                {item.category}
                              </span>
                            )}
                          </div>
                          <p className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
                            {item.title}
                          </p>
                          {cleanOpportunitySummary(item.description) && (
                            <p className="text-[10px] font-semibold text-slate-400 line-clamp-1">
                              {cleanOpportunitySummary(item.description)}
                            </p>
                          )}
                        </td>

                        {/* Buyer and Location */}
                        <td className="px-4 py-4 space-y-1">
                          <p className="text-xs font-bold text-slate-800 leading-tight">
                            {item.buyer || 'Buyer details controlled'}
                          </p>
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                            {item.buyerType && (
                              <span className="text-[9px] font-extrabold text-slate-400 uppercase tracking-wide">
                                {item.buyerType}
                              </span>
                            )}
                            {item.location && (
                              <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-slate-400">
                                <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                                {item.location}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Published Date */}
                        <td className="px-4 py-4 text-xs font-bold text-slate-600">
                          {formatDate(item.publishedAt)}
                        </td>

                        {/* Closing Date / Countdown */}
                        <td className="px-4 py-4 text-xs">
                          {isLiveAuction ? (
                            <div className="space-y-1">
                              <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase text-emerald-600 tracking-wider">
                                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-ping" />
                                Live
                              </span>
                              <div className="block leading-none">
                                <CountdownTimer endDate={item.closingDate} />
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="font-bold text-slate-700 block">{formatDate(item.closingDate)}</span>
                              <span className="text-[9px] font-black text-amber-600 uppercase tracking-wider block">
                                {getDaysLeftText(item.closingDate)}
                              </span>
                            </div>
                          )}
                        </td>

                        {/* Estimated Value */}
                        <td className="px-4 py-4 space-y-0.5">
                          <span className="text-xs font-extrabold text-slate-900 block">
                            {formatMoney(item.estimatedValue)}
                          </span>
                          <span className="text-[9px] font-bold text-slate-400 uppercase tracking-wider block">
                            {item.type === 'Reverse Auction' ? 'Negotiate Price' : 
                             item.type === 'RFP' ? 'Negotiable' : 'Fixed Price'}
                          </span>
                        </td>

                        {/* Action Link */}
                        <td className="rounded-r-xl px-4 py-4 text-right">
                          <Link
                            href={item.type === 'Limited Tender' ? item.href : item.detailsHref}
                            className="inline-flex h-8 min-w-[90px] items-center justify-center rounded-lg bg-blue-600 px-3 text-center text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-all duration-200"
                          >
                            {item.type === 'Limited Tender' ? 'Respond' : 'View Details'}
                          </Link>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

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

        {cleanOpportunitySummary(item.description) && (
          <p className="mt-3 line-clamp-3 text-xs font-semibold leading-relaxed text-slate-600 text-wrap-anywhere">{cleanOpportunitySummary(item.description)}</p>
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
                  {cleanOpportunitySummary(item.description) || 'No detailed description was provided by the buyer for this opportunity.'}
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
  const tone = type === 'RFQ'
    ? 'border-orange-200 bg-orange-50 text-orange-700'
    : type === 'RFP'
      ? 'border-indigo-200 bg-indigo-50 text-indigo-750'
      : type === 'Open Tender'
        ? 'border-amber-200 bg-amber-50 text-amber-700'
        : type === 'Limited Tender'
          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
          : type === 'Direct Purchase'
            ? 'border-teal-200 bg-teal-50 text-teal-700'
            : 'border-rose-200 bg-rose-50 text-rose-700';
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
