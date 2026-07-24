'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpDown,
  BarChart3,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  Eye,
  FileText,
  Filter,
  Gavel,
  Loader2,
  MapPin,
  Package,
  RefreshCw,
  Search,
  Share2,
  ShoppingCart,
  TrendingUp,
  X,
  XCircle,
  ClipboardCheck,
  ClipboardList,
  AlertTriangle,
  CalendarDays,
  IndianRupee,
  Tag,
  Hash,
  Info,
  Layers,
  Building2,
  ExternalLink,
  Paperclip,
  Download,
  ShieldCheck,
  Globe,
  Users,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../../../components/ui/button';
import { cn } from '../../../lib/utils';
import { getApi } from '../../shared/apiClient';
import { openFileAsset } from '../../../lib/files';
import { formatDate } from '../../shared/format';
import { ViewModeToggle } from '../../shared/ViewModeToggle';
import { useResponsiveViewMode } from '../../shared/hooks';
import { getBuyerRegisterAdapter } from '../adapters';

/* ═══════════════════════════════════════════════
   TYPES
   ═══════════════════════════════════════════════ */

interface NormalizedProcurement {
  id: number;
  type: string;
  typeLabel: string;
  linkedAuctionId?: number | null;
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
  description?: string;
  deliveryLocation?: string;
  startDate?: string;
  endDate?: string;
  quantity?: string;
  unit?: string;
  organizationName?: string;
  documents?: Array<{ fileAssetId: number | null; fileName: string; documentType?: string; required?: boolean; instructions?: string }>;
  items?: Array<{
    itemName: string;
    quantity: string;
    unitOfMeasure: string;
    description?: string;
    estimatedUnitPrice?: number;
    specifications?: {
      itemType?: string;
      hsn_sac_code?: string;
      brand_preference?: string;
      brand_flexible?: string;
      gst?: number;
      discount?: number;
      fileAssetId?: number | null;
      specificationFileName?: string;
      attachments?: Array<{ fileAssetId: number; fileName: string }>;
    };
  }>;
  paymentTerms?: string;
  eligibilityCriteria?: string[];
  termsAndConditions?: string[];
  budgetDetails?: {
    budgetHead?: string;
    financialYear?: string;
    fundSource?: string;
    sanctionAmount?: number;
    sanctionOrderNumber?: string;
    sanctionDate?: string;
    approvingAuthority?: string;
    payingAuthorityDesignation?: string;
    paymentMode?: string;
    priceReasonabilityRemarks?: string;
    marketComparisonPrice?: number;
    lastPurchasePrice?: number;
    costCenter?: string;
    justification?: string;
    remarks?: string;
  };
  detailSections?: Array<{
    title: string;
    fields: Array<{ label: string; value: string }>;
  }>;
  approvalTrail?: Array<{
    stage?: string;
    label?: string;
    decision?: string;
    remarks?: string;
    decidedAt?: string;
    approverName?: string;
    approverEmail?: string;
  }>;
  tracking?: Array<{
    label: string;
    status: string;
    date?: string;
  }>;
}

interface KpiData {
  totalProcurements: number;
  drafts: number;
  pendingApproval: number;
  active: number;
  completed: number;
  cancelled: number;
  totalValue: number;
}

const resolveProcurementActionUrl = (p: NormalizedProcurement) => {
  const statusLower = String(p.status || '').toLowerCase();
  const statusGroup = String(p.statusGroup || '').toLowerCase();
  const typeLower = String(p.type || '').toLowerCase();
  const rawActionUrl = String(p.actionUrl || '');

  if (statusLower === 'converted_to_order' || statusLower === 'completed') return '/buyer/orders';
  if (typeLower === 'direct_purchase' && (statusLower === 'approved' || statusLower === 'completed')) return '/buyer/orders';
  if (statusGroup === 'pending_approval') return '/buyer/procurement/approvals';
  if (statusGroup === 'draft' || statusLower.includes('draft')) return '/buyer/procurement/drafts';
  if (/\/buyer\/procurement\/checkout\?/i.test(rawActionUrl)) return '/buyer/my-procurements';
  if (rawActionUrl.startsWith('/bids/')) return '/buyer/my-procurements';
  return rawActionUrl || '/buyer/my-procurements';
};

const procurementActionLabel = (p: NormalizedProcurement) => {
  const statusLower = String(p.status || '').toLowerCase();
  const statusGroup = String(p.statusGroup || '').toLowerCase();
  const typeLower = String(p.type || '').toLowerCase();

  if (typeLower === 'reverse_auction') {
    if (['published', 'open', 'active', 'sourcing', 'live'].includes(statusLower)) return 'Join Live Auction';
    if (['closed', 'completed', 'awarded', 'fulfilled', 'finalized'].includes(statusLower)) return 'View Auction Results';
    return 'View Auction Details';
  }

  if (statusLower === 'converted_to_order' || statusLower === 'completed') return 'View Purchase Order';
  if (typeLower === 'direct_purchase' && (statusLower === 'approved' || statusLower === 'completed')) return 'View Purchase Order';
  if (statusGroup === 'pending_approval') return 'View Approvals';
  if (typeLower === 'bid_draft') return 'Resume Bid Wizard';
  if (statusGroup === 'draft' || statusLower.includes('draft')) return 'View Drafts';
  return 'Go to Procurement';
};

/* ═══════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════ */
const TYPE_FILTERS = [
  { key: '', label: 'All Types' },
  { key: 'RFQ', label: 'RFQ' },
  { key: 'RFP', label: 'RFP' },
  { key: 'Reverse Auction', label: 'Reverse Auction' },
  { key: 'Cart Checkout', label: 'Cart Checkout' },
  { key: 'OpenTender', label: 'OpenTender' },
  { key: 'Rate Contract', label: 'Rate Contract' },
  { key: 'Limited Tender', label: 'Limited Tender' },
  { key: 'Repeat order', label: 'Repeat order' },
];

const STATUS_FILTERS = [
  { key: '', label: 'All Statuses' },
  { key: 'pending_approval', label: 'Pending Approval' },
  { key: 'active', label: 'Active' },
  { key: 'completed', label: 'Completed' },
  { key: 'cancelled', label: 'Cancelled' },
];

const VALUE_FILTERS = [
  { key: '', label: 'All Values' },
  { key: 'under-10k', label: 'Under ₹10,000' },
  { key: '10k-1l', label: '₹10,000 - ₹1 Lakh' },
  { key: '1l-10l', label: '₹1 Lakh - ₹10 Lakhs' },
  { key: '10l-50l', label: '₹10 Lakhs - ₹50 Lakhs' },
  { key: 'above-50l', label: 'Above ₹50 Lakhs' },
];

const DATE_FILTERS = [
  { key: '', label: 'All Time' },
  { key: '24h', label: 'Last 24 Hours' },
  { key: '7d', label: 'Last 7 Days' },
  { key: '30d', label: 'Last 30 Days' },
];

const getConsolidatedType = (p: NormalizedProcurement): string => {
  const status = String(p.status || '').toLowerCase();
  const statusGroup = String(p.statusGroup || '').toLowerCase();
  const type = String(p.type || '').toLowerCase();
  const method = String(p.method || '').toLowerCase();
  const title = String(p.title || '').toLowerCase();

  // 1. Draft
  if (status === 'draft' || statusGroup === 'draft' || type === 'bid_draft' || title.includes('draft')) {
    return 'Draft';
  }
  // 2. RFQ
  if (method === 'rfq' || type.includes('rfq')) {
    return 'RFQ';
  }
  // 3. RFP
  if (method === 'rfp' || method === 'rfi' || type.includes('rfp') || type.includes('rfi')) {
    return 'RFP';
  }
  // 4. Reverse Auction
  if (method === 'reverse-auction' || method === 'reverse_auction' || type === 'reverse_auction') {
    return 'Reverse Auction';
  }
  // 5. Cart Checkout
  if (type === 'procurement_request' || type.includes('checkout') || type.includes('cart') || method.includes('direct') || type.includes('direct')) {
    return 'Cart Checkout';
  }
  // 6. OpenTender
  if (method === 'open-tender' || method === 'open_tender') {
    return 'OpenTender';
  }
  // 7. Rate Contract
  if (method === 'rate-contract' || method === 'rate_contract' || type === 'rate_contract') {
    return 'Rate Contract';
  }
  // 8. Limited Tender
  if (method === 'limited-tender' || method === 'limited_tender') {
    return 'Limited Tender';
  }
  // 9. Repeat order
  if (method === 'repeat-order' || method === 'repeat_order' || method === 'repeat-purchase') {
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

const STATUS_BADGE_STYLES: Record<string, string> = {
  draft: 'border-slate-200 bg-slate-55/20 text-slate-700',
  pending_approval: 'border-amber-200 bg-amber-55/20 text-amber-800',
  active: 'border-sky-200 bg-sky-55/20 text-sky-850 text-sky-800',
  completed: 'border-emerald-200 bg-emerald-55/20 text-emerald-800',
  cancelled: 'border-red-200 bg-red-55/20 text-red-700',
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

type SortKey = 'title' | 'type' | 'status' | 'estimatedValue' | 'updatedAt' | 'referenceNumber';
type SortDir = 'asc' | 'desc';

const formatCurrency = (v: number) =>
  v ? `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 0 })}` : '—';

const formatDateTime = (value?: string) => {
  if (!value) return '—';
  try {
    return new Date(value).toLocaleString('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      hour12: true,
    });
  } catch {
    return value;
  }
};

/* ═══════════════════════════════════════════════
   KPI CARD
   ═══════════════════════════════════════════════ */

function KpiCard({
  icon: Icon,
  label,
  value,
  isActive,
  onClick,
  activeColorClass = "border-blue-500 bg-blue-50/30 ring-2 ring-blue-500/20 text-blue-600 shadow-sm",
  inactiveColorClass = "text-[#12335f] bg-[#12335f]/5 hover:bg-[#12335f]/10",
  valueColorClass = "text-blue-600",
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  isActive: boolean;
  onClick: () => void;
  activeColorClass?: string;
  inactiveColorClass?: string;
  valueColorClass?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex items-center justify-between rounded-2xl border p-4 transition-all duration-300 ease-out text-left hover:-translate-y-1 hover:shadow-md active:scale-95 w-full cursor-pointer overflow-hidden",
        isActive 
          ? activeColorClass
          : "border-slate-200/80 bg-white hover:border-[#12335f]/30"
      )}
    >
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[#12335f] via-blue-600 to-sky-500" />
      )}
      <div>
        <p className={cn("text-xl font-black tabular-nums leading-none transition-transform duration-300 group-hover:scale-105", isActive ? valueColorClass : "text-slate-900")}>{value}</p>
        <p className="text-[10px] font-bold text-slate-500 mt-1.5 uppercase tracking-wider">{label}</p>
      </div>
      <div className={cn(
        "flex h-9 w-9 items-center justify-center rounded-xl transition-all duration-300 group-hover:rotate-6 group-hover:scale-110",
        isActive ? "bg-white shadow-xs" : inactiveColorClass
      )}>
        <Icon className="h-4.5 w-4.5" />
      </div>
    </button>
  );
}

/* ═══════════════════════════════════════════════
   SORT HEADER CELL
   ═══════════════════════════════════════════════ */

function ThSort({
  children,
  sortKey,
  currentSort,
  sortDir,
  onSort,
  className,
}: {
  children: React.ReactNode;
  sortKey: SortKey;
  currentSort: SortKey;
  sortDir: SortDir;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const isActive = currentSort === sortKey;
  return (
    <th
      className={cn(
        'cursor-pointer select-none px-4 py-3 text-[10px] font-black uppercase tracking-wide text-slate-500 transition-colors hover:text-slate-700',
        className
      )}
      onClick={() => onSort(sortKey)}
    >
      <span className="inline-flex items-center gap-1">
        {children}
        <ArrowUpDown
          className={cn('h-3 w-3 transition-colors', isActive ? 'text-[#12335f]' : 'text-slate-300')}
        />
        {isActive && (
          <span className="text-[8px] text-[#12335f]">{sortDir === 'asc' ? '↑' : '↓'}</span>
        )}
      </span>
    </th>
  );
}

/* ═══════════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════════ */

export default function MyProcurementsPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialType = searchParams?.get('type') || '';
  const [loading, setLoading] = useState(true);
  const [procurements, setProcurements] = useState<NormalizedProcurement[]>([]);
  const [kpis, setKpis] = useState<KpiData>({
    totalProcurements: 0,
    drafts: 0,
    pendingApproval: 0,
    active: 0,
    completed: 0,
    cancelled: 0,
    totalValue: 0,
  });

  // Filters
  const [typeFilter, setTypeFilter] = useState(initialType);
  const [statusFilter, setStatusFilter] = useState('');
  const [methodFilter, setMethodFilter] = useState('');
  const [valueFilter, setValueFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeKpi, setActiveKpi] = useState<string | null>(null);

  // Sort & View
  const [sortKey, setSortKey] = useState<SortKey>('updatedAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [viewMode, setViewMode] = useResponsiveViewMode('my-procurements:view-mode');
  const [detailOpen, setDetailOpen] = useState(false);
  const [selectedProcurement, setSelectedProcurement] = useState<NormalizedProcurement | null>(null);

  const openDetail = (p: NormalizedProcurement, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    
    const typeLower = String(p.type || '').toLowerCase();
    const methodLower = String(p.method || '').toLowerCase();
    
    const isReverseAuction =
      typeLower === 'reverse_auction' ||
      methodLower === 'reverse_auction' ||
      methodLower === 'reverse-auction' ||
      methodLower === 'bid-with-reverse-auction' ||
      methodLower === 'bid_with_reverse_auction';

    let route: string | null = null;
    if (isReverseAuction) {
      // A reverse auction is stored as a Requirement; the biddable entity is the
      // linked Auction. Use its id (falling back to the auction row's own id).
      const auctionId = p.linkedAuctionId || (typeLower === 'reverse_auction' ? p.id : null);
      route = auctionId ? `/reverse-auctions/${auctionId}` : null;
    } else if (typeLower === 'bid_tender') {
      const consolidated = getConsolidatedType(p);
      if (consolidated === 'OpenTender' || consolidated === 'Limited Tender') {
        route = `/tenders?tender=${p.id}`;
      } else {
        route = `/bids/${p.id}`;
      }
    } else if (typeLower === 'requirement') {
      if (methodLower === 'rfp') {
        route = `/buyer/rfp/detail?requirementId=${p.id}`;
      } else {
        route = `/buyer/rfq/detail?requirementId=${p.id}`;
      }
    }

    if (route) {
      router.push(route);
    } else {
      setSelectedProcurement(p);
      setDetailOpen(true);
    }
  };
  const closeDetail = () => {
    setDetailOpen(false);
    setSelectedProcurement(null);
  };

  /* ── Data Loading ── */
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const result = await getApi<any>(
        '/api/buyer/my-procurements',
        true
      );
      setKpis(result?.kpis || kpis);
      setProcurements(result?.procurements || []);
    } catch (err) {
      toast.error('Failed to load procurements');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  /* ── KPI Click Handler ── */
  const handleKpiClick = (group: string | null) => {
    if (activeKpi === group) {
      setActiveKpi(null);
      setStatusFilter('');
    } else {
      setActiveKpi(group);
      setStatusFilter(group || '');
    }
  };

  /* ── Sort Handler ── */
  const handleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir(d => (d === 'asc' ? 'desc' : 'asc'));
    else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  /* ── Rendered Data ── */
  const displayData = useMemo(() => {
    // Drafts live only on the dedicated Drafts page — never in the My Procurements list.
    let data = procurements.filter(p => String(p.statusGroup || '').toLowerCase() !== 'draft');

    // Deduplicate by reference number / ID so converted requirements/contracts never show twice
    const seen = new Set<string>();
    data = data.filter(p => {
      const key = p.referenceNumber ? `ref-${p.referenceNumber}` : `id-${p.type}-${p.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    // Client-side Search Query Filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      data = data.filter(p =>
        p.title?.toLowerCase().includes(q) ||
        p.referenceNumber?.toLowerCase().includes(q) ||
        p.category?.toLowerCase().includes(q) ||
        p.typeLabel?.toLowerCase().includes(q) ||
        p.methodLabel?.toLowerCase().includes(q)
      );
    }

    // Consolidated Type Filter
    if (typeFilter) {
      data = data.filter(p => getConsolidatedType(p) === typeFilter);
    }

    // Status Filter (linked to KPI card group/statusFilter)
    if (statusFilter) {
      data = data.filter(p => String(p.statusGroup || '').toLowerCase() === statusFilter.toLowerCase());
    }

    // Method Filter
    if (methodFilter) {
      data = data.filter(p => String(p.method || '').toLowerCase() === methodFilter.toLowerCase());
    }

    // Value filter
    if (valueFilter) {
      data = data.filter(p => {
        const val = p.estimatedValue || 0;
        if (valueFilter === 'under-10k') return val < 10000;
        if (valueFilter === '10k-1l') return val >= 10000 && val < 100000;
        if (valueFilter === '1l-10l') return val >= 100000 && val < 1000000;
        if (valueFilter === '10l-50l') return val >= 1000000 && val < 5000000;
        if (valueFilter === 'above-50l') return val >= 5000000;
        return true;
      });
    }

    // Date filter
    if (dateFilter) {
      const now = new Date();
      data = data.filter(p => {
        if (!p.updatedAt) return false;
        const updated = new Date(p.updatedAt);
        const diffMs = now.getTime() - updated.getTime();
        const diffHours = diffMs / (1000 * 60 * 60);
        const diffDays = diffHours / 24;

        if (dateFilter === '24h') return diffHours <= 24;
        if (dateFilter === '7d') return diffDays <= 7;
        if (dateFilter === '30d') return diffDays <= 30;
        return true;
      });
    }

    // Client-side sort (API already sorts, but for instant re-sorting)
    data.sort((a: any, b: any) => {
      const dir = sortDir === 'asc' ? 1 : -1;
      const va = a[sortKey] ?? '';
      const vb = b[sortKey] ?? '';
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir;
      return String(va).localeCompare(String(vb)) * dir;
    });
    return data;
  }, [procurements, searchQuery, typeFilter, statusFilter, methodFilter, valueFilter, dateFilter, sortKey, sortDir]);

  const hasActiveFilters = !!(typeFilter || statusFilter || valueFilter || dateFilter || searchQuery);

  /* ═══════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════ */

  if (detailOpen && selectedProcurement) {
    return (
      <ProcurementDetailView
        procurement={selectedProcurement}
        onBack={closeDetail}
        onGoTo={() => {
          closeDetail();
          router.push(resolveProcurementActionUrl(selectedProcurement));
        }}
      />
    );
  }

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-8">
      {/* ── Page Header ── */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pt-2 px-4 sm:px-0">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#12335f]/10 text-[#12335f] font-bold">
              <ClipboardList className="h-5 w-5" />
            </span>
            <h1 className="text-2xl font-black tracking-tight text-slate-900">
              My Procurements
            </h1>
          </div>
          <p className="text-xs font-semibold text-slate-500">
            Unified view of all procurement activities — bids, tenders, rate contracts, direct purchases, and BOQ requirements. Click KPI cards to filter by status.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <Button
            type="button"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="h-10 rounded-xl border border-slate-200 bg-white text-xs font-black uppercase text-slate-700 hover:bg-slate-50 transition-all active:scale-95 cursor-pointer shadow-2xs"
          >
            <RefreshCw className={cn('mr-2 h-4 w-4 text-slate-500', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button
            type="button"
            onClick={() => router.push('/buyer/procurement')}
            className="h-10 rounded-xl bg-[#12335f] px-5 text-xs font-black uppercase tracking-wider text-white hover:bg-[#12335f]/90 shadow-sm transition-all active:scale-95 border-none cursor-pointer"
          >
            <ShoppingCart className="mr-2 h-4 w-4" /> New Procurement
          </Button>
        </div>
      </div>

      {/* ── KPI Cards Grid ── */}
      <div className="grid gap-4 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 px-4 sm:px-0">
        <KpiCard
          icon={BarChart3}
          label="Total"
          value={kpis.totalProcurements}
          isActive={activeKpi === null && !statusFilter}
          onClick={() => handleKpiClick(null)}
          activeColorClass="border-blue-500 bg-blue-50/20 ring-1 ring-blue-500/25 text-blue-600"
          inactiveColorClass="text-blue-600 bg-blue-50 hover:bg-blue-100"
          valueColorClass="text-blue-600"
        />
        <KpiCard
          icon={Clock}
          label="Pending"
          value={kpis.pendingApproval}
          isActive={activeKpi === 'pending_approval'}
          onClick={() => handleKpiClick('pending_approval')}
          activeColorClass="border-amber-500 bg-amber-50/20 ring-1 ring-amber-500/25 text-amber-600"
          inactiveColorClass="text-amber-600 bg-amber-50 hover:bg-amber-100"
          valueColorClass="text-amber-600"
        />
        <KpiCard
          icon={TrendingUp}
          label="Active"
          value={kpis.active}
          isActive={activeKpi === 'active'}
          onClick={() => handleKpiClick('active')}
          activeColorClass="border-sky-500 bg-sky-50/20 ring-1 ring-sky-500/25 text-sky-600"
          inactiveColorClass="text-sky-600 bg-sky-50 hover:bg-sky-100"
          valueColorClass="text-sky-650"
        />
        <KpiCard
          icon={CheckCircle2}
          label="Completed"
          value={kpis.completed}
          isActive={activeKpi === 'completed'}
          onClick={() => handleKpiClick('completed')}
          activeColorClass="border-emerald-500 bg-emerald-50/20 ring-1 ring-emerald-500/25 text-emerald-650"
          inactiveColorClass="text-emerald-600 bg-emerald-50 hover:bg-emerald-100"
          valueColorClass="text-emerald-700"
        />
        <KpiCard
          icon={XCircle}
          label="Cancelled"
          value={kpis.cancelled}
          isActive={activeKpi === 'cancelled'}
          onClick={() => handleKpiClick('cancelled')}
          activeColorClass="border-red-500 bg-red-50/20 ring-1 ring-red-500/25 text-red-600"
          inactiveColorClass="text-red-600 bg-red-50 hover:bg-red-100"
          valueColorClass="text-red-600"
        />
        <KpiCard
          icon={Package}
          label="Est. Value"
          value={formatCurrency(kpis.totalValue)}
          isActive={false}
          onClick={() => {}}
          activeColorClass="border-purple-500 bg-purple-50/20 ring-1 ring-purple-500/25 text-purple-600"
          inactiveColorClass="text-purple-600 bg-purple-50 hover:bg-purple-100"
          valueColorClass="text-purple-650"
        />
      </div>

      {/* ── Floating Filters Bar ── */}
      <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-2xs space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Search bar with Icon */}
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search by Title, Ref No, Category, or Type..."
              className="h-10 w-full rounded-xl border border-slate-200 bg-slate-50/50 pl-10 pr-4 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition-all focus:border-[#12335f] focus:bg-white focus:ring-2 focus:ring-[#12335f]/10 shadow-inner"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* Type Select */}
            <div className="w-36">
              <select
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-300 focus:border-[#12335f] transition-colors shadow-2xs cursor-pointer"
              >
                {TYPE_FILTERS.map(f => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Status Select */}
            <div className="w-36">
              <select
                value={statusFilter}
                onChange={e => {
                  setStatusFilter(e.target.value);
                  setActiveKpi(e.target.value || null);
                }}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-300 focus:border-[#12335f] transition-colors shadow-2xs cursor-pointer"
              >
                {STATUS_FILTERS.map(f => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Value Select */}
            <div className="w-36">
              <select
                value={valueFilter}
                onChange={e => setValueFilter(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-300 focus:border-[#12335f] transition-colors shadow-2xs cursor-pointer"
              >
                {VALUE_FILTERS.map(f => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Date Select */}
            <div className="w-32">
              <select
                value={dateFilter}
                onChange={e => setDateFilter(e.target.value)}
                className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-300 focus:border-[#12335f] transition-colors shadow-2xs cursor-pointer"
              >
                {DATE_FILTERS.map(f => (
                  <option key={f.key} value={f.key}>
                    {f.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Reset Trigger */}
            {hasActiveFilters && (
              <button
                type="button"
                onClick={() => {
                  setTypeFilter('');
                  setStatusFilter('');
                  setValueFilter('');
                  setDateFilter('');
                  setSearchQuery('');
                  setActiveKpi(null);
                }}
                className="h-10 px-3 rounded-xl border border-rose-200 bg-rose-50 text-xs font-extrabold text-rose-700 hover:bg-rose-100 transition-all active:scale-95 cursor-pointer"
              >
                Reset Filters
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      {loading ? (
        <section className="flex h-[400px] items-center justify-center border border-slate-100 rounded-3xl bg-white shadow-sm">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="h-8 w-8 animate-spin text-[#12335f]" />
            <p className="text-sm font-semibold text-slate-500">Loading procurements…</p>
          </div>
        </section>
      ) : displayData.length > 0 ? (
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
                    <th className="px-4 py-3 w-44">Category & Location</th>
                    <th className="px-4 py-3 w-32">Updated</th>
                    <th className="px-4 py-3 text-right w-32">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {displayData.map((p, idx) => {
                    const typeVal = getConsolidatedType(p);
                    const TypeIcon = getTypeIcon(typeVal);
                    return (
                      <tr
                        key={`${p.type}-${p.id}`}
                        className="group bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)] hover:shadow-md hover:-translate-y-0.5 hover:bg-slate-50/70 transition-all duration-300 ease-out align-middle cursor-pointer"
                        onClick={() => openDetail(p)}
                      >
                        {/* Serial Number */}
                        <td className="rounded-l-xl px-4 py-4 text-xs font-black text-slate-400 text-center">
                          {String(idx + 1).padStart(2, '0')}
                        </td>

                        {/* Type Badge */}
                        <td className="px-4 py-4">
                          <span className={cn(
                            "inline-flex items-center gap-1.5 whitespace-nowrap rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border transition-transform group-hover:scale-105",
                            TYPE_BADGE_STYLES[typeVal] || 'border-slate-200 bg-slate-50 text-slate-700'
                          )}>
                            <TypeIcon className="h-3.5 w-3.5 shrink-0" />
                            {typeVal}
                          </span>
                        </td>

                        {/* Title & Reference */}
                        <td className="px-4 py-4 space-y-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {p.referenceNumber}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
                            {p.title}
                          </p>
                          {p.description && (
                            <p className="text-[10px] font-semibold text-slate-400 line-clamp-1">
                              {p.description}
                            </p>
                          )}
                        </td>

                        {/* Status */}
                        <td className="px-4 py-4">
                          <span className={cn(
                            'inline-flex whitespace-nowrap rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wide border',
                            p.statusGroup === 'draft' ? 'border-slate-200 bg-slate-50 text-slate-600' :
                            p.statusGroup === 'pending_approval' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                            p.statusGroup === 'active' ? 'border-sky-200 bg-sky-50 text-sky-700' :
                            p.statusGroup === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                            'border-red-200 bg-red-50 text-red-700'
                          )}>
                            {p.statusLabel}
                          </span>
                        </td>

                        {/* Est Value */}
                        <td className="px-4 py-4">
                          <span className="text-xs font-extrabold text-slate-900 block">
                            {formatCurrency(p.estimatedValue)}
                          </span>
                        </td>

                        {/* Category & Location */}
                        <td className="px-4 py-4 space-y-1">
                          <span className="text-xs font-bold text-slate-600 line-clamp-1">{p.category || '—'}</span>
                          {p.deliveryLocation && (
                            <span className="inline-flex items-center gap-1 text-[9px] font-semibold text-slate-400">
                              <MapPin className="h-3 w-3 shrink-0 text-slate-400" />
                              {p.deliveryLocation}
                            </span>
                          )}
                        </td>

                        {/* Updated */}
                        <td className="px-4 py-4 text-xs font-bold text-slate-500">
                          {formatDateTime(p.updatedAt)}
                        </td>

                        {/* Action */}
                        <td className="rounded-r-xl px-4 py-4 text-right">
                          <Button
                            type="button"
                            size="sm"
                            onClick={e => openDetail(p, e)}
                            className="inline-flex h-8 min-w-[90px] items-center justify-center rounded-lg bg-blue-600 px-3 text-center text-xs font-bold text-white shadow-sm hover:bg-blue-700 hover:shadow-md active:scale-95 transition-all duration-200 border-none cursor-pointer"
                          >
                            View Details
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
              {displayData.map(p => {
                const typeVal = getConsolidatedType(p);
                return (
                  <div
                    key={`${p.type}-${p.id}`}
                    onClick={() => openDetail(p)}
                    className={cn(
                      "group rounded-2xl border bg-white p-5 shadow-2xs hover:shadow-lg transition-all duration-300 ease-out hover:-translate-y-1 border-slate-200/80 hover:border-blue-300 flex flex-col justify-between min-h-[220px] cursor-pointer"
                    )}
                  >
                    <div className="space-y-3">
                      {/* Top row: Badges */}
                      <div className="flex items-center justify-between">
                        <span className={cn(
                          "inline-flex rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wider border whitespace-nowrap transition-transform group-hover:scale-105",
                          TYPE_BADGE_STYLES[typeVal] || 'border-slate-200 bg-slate-50 text-slate-700'
                        )}>
                          {typeVal}
                        </span>
                        <span className="text-[10px] font-mono font-semibold text-slate-400 tabular-nums">
                          {p.referenceNumber}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2 group-hover:text-blue-600 transition-colors">
                        {p.title}
                      </h3>

                      {/* Source Ref & Category */}
                      <div className="text-[11px] text-slate-500 font-bold space-y-1">
                        {p.category && <p className="line-clamp-1">Category: {p.category}</p>}
                        {p.description && <p className="text-[10px] font-semibold text-slate-400 line-clamp-1">{p.description}</p>}
                      </div>
                    </div>

                    <div className="pt-4 border-t border-slate-100 mt-4 space-y-3">
                      {/* Timeline & Commercials */}
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Status</p>
                          <div className="mt-1">
                            <span className={cn(
                              'inline-flex rounded px-2 py-0.5 text-[9px] font-black uppercase tracking-wide border',
                              p.statusGroup === 'draft' ? 'border-slate-200 bg-slate-50 text-slate-600' :
                              p.statusGroup === 'pending_approval' ? 'border-amber-200 bg-amber-50 text-amber-700' :
                              p.statusGroup === 'active' ? 'border-sky-200 bg-sky-50 text-sky-700' :
                              p.statusGroup === 'completed' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' :
                              'border-red-200 bg-red-50 text-red-700'
                            )}>
                              {p.statusLabel}
                            </span>
                          </div>
                        </div>

                        <div>
                          <p className="text-[9px] text-slate-400 font-bold uppercase tracking-wider leading-none">Est. Value</p>
                          <div className="mt-1">
                            <span className="text-xs font-extrabold text-slate-900 block">
                              {formatCurrency(p.estimatedValue)}
                            </span>
                          </div>
                        </div>
                      </div>

                      {/* Action Button */}
                      <div className="flex justify-end pt-1">
                        <button
                          type="button"
                          onClick={e => openDetail(p, e)}
                          className="inline-flex h-8 w-full items-center justify-center rounded-lg bg-blue-600 px-3 text-center text-xs font-bold text-white shadow-sm hover:bg-blue-700 hover:shadow-md active:scale-95 transition-all duration-200 border-none cursor-pointer"
                        >
                          View Details
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* ── Empty State ── */
        <section className="border border-dashed border-slate-200 rounded-3xl bg-white p-12 text-center shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-[#12335f]/5 text-[#12335f]">
            <ClipboardList className="h-8 w-8" />
          </div>
          <h2 className="mt-5 text-lg font-black text-slate-900">
            {hasActiveFilters ? 'No procurements match your filters' : 'No procurements yet'}
          </h2>
          <p className="mx-auto mt-2 max-w-xl text-sm font-semibold text-slate-500">
            {hasActiveFilters
              ? 'Try adjusting your filters or clearing them to see all procurements.'
              : 'Start a procurement process from the Buying Dashboard. Your bids, tenders, direct purchases, and requirements will appear here.'}
          </p>
          <div className="mt-6 flex justify-center gap-3">
            {hasActiveFilters && (
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setTypeFilter('');
                  setStatusFilter('');
                  setSearchQuery('');
                  setActiveKpi(null);
                }}
                className="h-10 rounded-xl text-xs font-black uppercase"
              >
                Clear Filters
              </Button>
            )}
            <Button
              type="button"
              onClick={() => router.push('/buyer/procurement')}
              className="h-10 rounded-xl bg-[#12335f] px-6 text-xs font-black uppercase text-white hover:bg-[#0b2445] shadow-sm transition-colors"
            >
              Go to Buying Dashboard <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
        </section>
      )}


    </div>
  );
}

/* ── Helpers for details formatting ── */
const parseDescription = (desc?: string) => {
  if (!desc) return { method: '', value: '', urgency: '', text: '' };
  
  const cleanedDesc = desc.replace(/\r/g, '');

  const methodMatch = cleanedDesc.match(/Sourcing Method:\s*(.*?)(?=(?:Value:|Urgency:|$))/i);
  const valueMatch = cleanedDesc.match(/Value:\s*(.*?)(?=(?:Urgency:|$))/i);
  const urgencyMatch = cleanedDesc.match(/Urgency:\s*(.*?)(?=$)/i);

  let cleanText = cleanedDesc;
  if (methodMatch || valueMatch || urgencyMatch) {
    cleanText = cleanedDesc
      .replace(/Sourcing Method:[^\n]*/gi, '')
      .replace(/Value:[^\n]*/gi, '')
      .replace(/Urgency:[^\n]*/gi, '')
      .replace(/\n+/g, '\n')
      .trim();
  }

  return {
    method: methodMatch ? methodMatch[1].trim() : '',
    value: valueMatch ? valueMatch[1].trim() : '',
    urgency: urgencyMatch ? urgencyMatch[1].trim() : '',
    text: cleanText
  };
};

const formatDisplayValue = (val: string, label?: string) => {
  if (!val) return '—';
  if (val.match(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/) || val.match(/^\d{4}-\d{2}-\d{2}$/)) {
    return formatDate(val);
  }
  if (val.match(/^[A-Z][A-Z0-9_]*$/)) {
    return val
      .split('_')
      .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
      .join(' ');
  }
  if (val.includes('Sourcing Method:')) {
    const parsed = parseDescription(val);
    return `Sourcing Method: ${parsed.method || '—'}\nValue: ${parsed.value || '—'}\nUrgency: ${parsed.urgency || '—'}`;
  }
  return val;
};

/* ═══════════════════════════════════════════════
   PROCUREMENT DETAIL VIEW (Full Page – TenderDetailPage-style)
   ═══════════════════════════════════════════════ */

function ProcurementDetailView({
  procurement: p,
  onBack,
  onGoTo,
}: {
  procurement: NormalizedProcurement;
  onBack: () => void;
  onGoTo: () => void;
}) {
  const statusTone = (status?: string) => {
    const s = String(status || '').toLowerCase();
    if (s === 'completed' || s === 'approved') return 'border-emerald-200 bg-emerald-50 text-emerald-700';
    if (s === 'active' || s === 'pending') return 'border-amber-200 bg-amber-50 text-amber-700';
    if (s === 'rejected' || s === 'cancelled') return 'border-red-200 bg-red-50 text-red-700';
    return 'border-slate-200 bg-slate-50 text-slate-600';
  };


  /* Timeline steps from tracking data */
  const timelineSteps = p.tracking && p.tracking.length > 0
    ? p.tracking.map(t => ({
        label: t.label,
        date: t.date ? formatDateTime(t.date) : 'Pending',
        active: String(t.status || '').toLowerCase() === 'completed' || String(t.status || '').toLowerCase() === 'approved',
      }))
    : [
        { label: 'Created', date: formatDateTime(p.createdAt), active: true },
        { label: p.statusGroup === 'pending_approval' ? 'Pending Approval' : 'Review', date: p.statusGroup === 'pending_approval' ? 'In Progress' : 'Pending', active: p.statusGroup === 'pending_approval' },
        { label: 'Active', date: p.statusGroup === 'active' ? 'In Progress' : 'Pending', active: p.statusGroup === 'active' || p.statusGroup === 'completed' },
        { label: 'Completed', date: p.statusGroup === 'completed' ? formatDateTime(p.updatedAt) : 'Pending', active: p.statusGroup === 'completed' },
      ];

  /* Row helper used in columns */
  const InfoRow = ({ label, value, mono, highlight }: { label: string; value?: string | number | null; mono?: boolean; highlight?: boolean }) => {
    if (!value && value !== 0) return null;
    return (
      <div className="flex justify-between items-start gap-4">
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{label}</span>
        <span className={cn('text-xs font-black text-right', mono ? 'font-mono font-bold text-slate-700' : highlight ? 'font-extrabold text-red-600 tabular-nums' : 'text-slate-800')}>{value}</span>
      </div>
    );
  };

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-8 animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out scroll-smooth">

      {/* ── Breadcrumb Navigation ── */}
      <nav className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <span className="hover:text-slate-800 transition-colors cursor-pointer" onClick={onBack}>My Procurements</span>
        <ChevronRight className="h-3 w-3" />
        <span className="hover:text-slate-800 transition-colors cursor-pointer">{p.referenceNumber || p.title}</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-[#12335f] font-extrabold">Details</span>
      </nav>

      {/* ── Page Header ── */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border border-slate-100 rounded-3xl bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300">
        <div className="space-y-1.5">
          <div className="flex flex-wrap items-center gap-3">
            <h1 className="text-xl md:text-2xl font-black tracking-tight text-slate-900">
              {p.title}
            </h1>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold tracking-wide border',
                TYPE_BADGE_STYLES[p.type] || 'border-slate-200 bg-slate-50 text-slate-700'
              )}
            >
              {p.typeLabel}
            </span>
            <span
              className={cn(
                'inline-flex items-center rounded-full px-3 py-1 text-xs font-extrabold tracking-wide border',
                STATUS_BADGE_STYLES[p.statusGroup] || 'border-slate-200 bg-slate-50 text-slate-700'
              )}
            >
              {p.statusLabel}
            </span>
          </div>
          <p className="text-sm font-semibold text-slate-500">
            <span className="font-mono font-bold text-slate-600">{p.referenceNumber}</span>
            <span className="mx-2">•</span>
            Created on {formatDateTime(p.createdAt)}
            {p.organizationName && <>{' '}by {p.organizationName}</>}
          </p>
        </div>

        {/* Header Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onBack}
            className="group h-10 rounded-xl border-slate-200 text-xs font-black uppercase text-slate-700 hover:bg-slate-50 hover:border-slate-300 transition-all duration-200 active:scale-95 cursor-pointer"
          >
            <ArrowLeft className="mr-2 h-4 w-4 transition-transform duration-200 group-hover:-translate-x-1" /> Back to List
          </Button>
        </div>
      </section>

      {/* ── Timeline Section ── */}
      <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm hover:shadow-md transition-all duration-300 overflow-x-auto">
        <div className="min-w-[700px] flex items-center justify-between relative px-6 py-4">
          {/* Horizontal Connection Line */}
          <div className="absolute top-[38px] left-[50px] right-[50px] h-[3px] bg-slate-100 -z-0" />

          {timelineSteps.map((step, idx) => (
            <div key={idx} className="flex flex-col items-center gap-3 relative z-10 w-28 text-center group cursor-pointer">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300 group-hover:scale-110',
                  step.active
                    ? 'bg-[#12335f] border-[#12335f] text-white shadow-md shadow-blue-100 ring-4 ring-[#12335f]/15'
                    : 'bg-white border-slate-200 text-slate-400 group-hover:border-slate-350'
                )}
              >
                {step.active ? (
                  <Check className="h-4 w-4 stroke-[3]" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-slate-200 group-hover:bg-slate-400 transition-colors" />
                )}
              </div>
              <div className="space-y-1">
                <p className={cn('text-xs font-black tracking-tight transition-colors', step.active ? 'text-[#12335f]' : 'text-slate-800 group-hover:text-[#12335f]')}>
                  {step.label}
                </p>
                <p className="text-[10px] font-semibold text-slate-500">{step.date}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Main Structured Specification Cards Grid ── */}
      <div className="space-y-6">

        {/* ── 1. ITEM / BOQ DETAILS Table ── */}
        <section className="border border-slate-200/80 rounded-2xl bg-white p-6 shadow-xs space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <div className="w-1.5 h-4 bg-[#12335f] rounded-full" />
              <h2 className="text-sm font-black text-[#12335f] uppercase tracking-wider">
                ITEM / BOQ DETAILS
              </h2>
            </div>
            <span className="text-xs font-bold text-slate-500">
              {(p.items || []).length} {(p.items || []).length === 1 ? 'Item' : 'Items'} Listed
            </span>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-2xs">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 font-extrabold text-[10px] uppercase text-slate-500 tracking-wider">
                <tr>
                  <th className="p-3 w-12 text-center">S.NO</th>
                  <th className="p-3 min-w-[180px]">ITEM NAME / DESCRIPTION</th>
                  <th className="p-3 min-w-[160px]">TECHNICAL SPECS & FILES</th>
                  <th className="p-3 min-w-[140px]">BRAND/MAKE/MODEL</th>
                  <th className="p-3 min-w-[120px]">HSN/SAC/GST</th>
                  <th className="p-3 w-24 text-center">QTY & UNIT</th>
                  <th className="p-3 w-28 text-right">UNIT PRICE</th>
                  <th className="p-3 w-28 text-right">TOTAL PRICE</th>
                  <th className="p-3 min-w-[130px] text-center">DELIVERY / WARRANTY</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium text-slate-800">
                {(p.items && p.items.length > 0) ? (
                  p.items.map((item: any, idx: number) => {
                    const spec = item.specifications || {};
                    const unitPrice = item.estimatedUnitPrice || item.price || item.unitPrice || 0;
                    const qty = Number(item.quantity || 1);
                    const totalPrice = unitPrice ? unitPrice * qty : 0;
                    const hsn = spec.hsn_sac_code || spec.hsn || '-';
                    const gst = spec.gst !== undefined ? `${spec.gst}%` : (spec.gstPercent ? `${spec.gstPercent}%` : '18%');
                    const brandPref = spec.brand_preference || item.brand || '-';

                    return (
                      <tr key={idx} className="hover:bg-slate-50/60 transition-colors align-top">
                        <td className="p-3 text-center font-extrabold text-slate-400">{idx + 1}</td>
                        <td className="p-3 space-y-1">
                          <p className="font-extrabold text-slate-900 leading-snug">{item.itemName}</p>
                          {item.description && (
                            <p className="text-[11px] font-medium text-slate-500 leading-relaxed whitespace-pre-wrap">{item.description}</p>
                          )}
                        </td>
                        <td className="p-3 text-[11px] text-slate-600">
                          <p>{spec.technicalSpecs || item.technicalSpecs || 'Refer to BOQ Details'}</p>
                        </td>
                        <td className="p-3 text-[11px] space-y-0.5 text-slate-700">
                          <div><span className="font-semibold text-slate-400">Brand:</span> {brandPref}</div>
                          <div><span className="font-semibold text-slate-400">Alt Allowed:</span> {spec.brand_flexible?.toLowerCase() === 'no' ? 'No' : 'Yes'}</div>
                        </td>
                        <td className="p-3 text-[11px] space-y-0.5 text-slate-700">
                          <div><span className="font-semibold text-slate-400">HSN:</span> {hsn}</div>
                          <div><span className="font-semibold text-slate-400">GST:</span> {gst}</div>
                        </td>
                        <td className="p-3 text-center">
                          <p className="font-black text-slate-900">{qty}</p>
                          <p className="text-[10px] font-semibold text-slate-400 uppercase">{item.unitOfMeasure || 'Nos'}</p>
                        </td>
                        <td className="p-3 text-right font-bold text-slate-900 tabular-nums">
                          {unitPrice ? formatCurrency(unitPrice) : '—'}
                        </td>
                        <td className="p-3 text-right font-black text-emerald-800 tabular-nums">
                          {totalPrice ? formatCurrency(totalPrice) : (p.estimatedValue ? formatCurrency(p.estimatedValue) : '—')}
                        </td>
                        <td className="p-3 text-center text-[11px] text-slate-600 space-y-1">
                          <div><span className="font-semibold text-slate-400 block">Delivery:</span> {spec.deliverySchedule || 'As per SLA'}</div>
                          <div><span className="font-semibold text-slate-400 block">Warranty:</span> {spec.warranty || '12 Months'}</div>
                        </td>
                      </tr>
                    );
                  })
                ) : (
                  <tr className="hover:bg-slate-50/50">
                    <td className="p-3 text-center font-extrabold text-slate-400">1</td>
                    <td className="p-3">
                      <p className="font-black text-slate-900">{p.title || 'Procurement Item'}</p>
                      <p className="text-[11px] text-slate-500 mt-0.5">{p.description || 'Item specifications as requested'}</p>
                    </td>
                    <td className="p-3 text-[11px] text-slate-600">Refer to attached documents</td>
                    <td className="p-3 text-[11px] text-slate-700">
                      <div><span className="font-semibold text-slate-400">Brand:</span> -</div>
                      <div><span className="font-semibold text-slate-400">Alt Allowed:</span> Yes</div>
                    </td>
                    <td className="p-3 text-[11px] text-slate-700">
                      <div><span className="font-semibold text-slate-400">HSN:</span> -</div>
                      <div><span className="font-semibold text-slate-400">GST:</span> 18%</div>
                    </td>
                    <td className="p-3 text-center">
                      <p className="font-black text-slate-900">{p.quantity || 1}</p>
                      <p className="text-[10px] font-semibold text-slate-400 uppercase">{p.unit || 'Nos'}</p>
                    </td>
                    <td className="p-3 text-right font-bold text-slate-900 tabular-nums">{p.estimatedValue ? formatCurrency(p.estimatedValue) : '—'}</td>
                    <td className="p-3 text-right font-black text-emerald-800 tabular-nums">{p.estimatedValue ? formatCurrency(p.estimatedValue) : '—'}</td>
                    <td className="p-3 text-center text-[11px] text-slate-600">
                      <div><span className="font-semibold text-slate-400 block">Delivery:</span> -</div>
                      <div><span className="font-semibold text-slate-400 block">Warranty:</span> -</div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ── 2. TWO-COLUMN GRID: DELIVERY & CONSIGNEE & SUPPLIER CONFIGURATION ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* DELIVERY & CONSIGNEE */}
          <div className="group bg-white rounded-2xl p-6 shadow-2xs hover:shadow-md border border-slate-200/90 hover:border-slate-300 transition-all duration-300 ease-out hover:-translate-y-1 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-1.5 h-4 bg-[#12335f] rounded-full transition-transform duration-300 group-hover:scale-y-125" />
              <h3 className="text-xs font-black text-[#12335f] uppercase tracking-wider">DELIVERY & CONSIGNEE</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">DELIVERY LOCATION</span>
                <span className="font-bold text-slate-900 text-right max-w-[65%] break-words">{p.deliveryLocation || 'Mahabad: jalgaon, Jalgaon, Jalgaon, Maharashtra - 425001.'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">DELIVERY PERIOD</span>
                <span className="font-bold text-slate-900">{p.endDate ? formatDateTime(p.endDate) : '7 Working Days'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">CONSIGNEE NAME</span>
                <span className="font-bold text-slate-900">{p.organizationName || 'VANSIKA DAWANI'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">TOTAL QUANTITY</span>
                <span className="font-bold text-slate-900">{p.quantity ? `${p.quantity} ${p.unit || 'Nos'}` : '1 Nos'}</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">INSTALLATION ADDRESS</span>
                <span className="font-bold text-slate-900 text-right max-w-[65%] break-words">{p.deliveryLocation || 'Same as Delivery Location'}</span>
              </div>
            </div>
          </div>

          {/* SUPPLIER CONFIGURATION & ELIGIBILITY */}
          <div className="group bg-white rounded-2xl p-6 shadow-2xs hover:shadow-md border border-slate-200/90 hover:border-slate-300 transition-all duration-300 ease-out hover:-translate-y-1 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-1.5 h-4 bg-[#12335f] rounded-full transition-transform duration-300 group-hover:scale-y-125" />
              <h3 className="text-xs font-black text-[#12335f] uppercase tracking-wider">SUPPLIER CONFIGURATION & ELIGIBILITY</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">VENDOR SELECTION</span>
                <span className="font-bold text-slate-900">Open</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">STARTUP/MSME PREF.</span>
                <span className="font-bold text-emerald-700">Yes</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">EXCLUDE BLACKLISTED</span>
                <span className="font-bold text-emerald-700">Yes</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">EXPERIENCE REQ.</span>
                <span className="font-bold text-slate-900">0 Years</span>
              </div>
            </div>
            {(p.eligibilityCriteria && p.eligibilityCriteria.length > 0) && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">Qualifications & Eligibility</h4>
                <ul className="space-y-1 text-xs text-slate-700">
                  {p.eligibilityCriteria.map((crit, idx) => (
                    <li key={idx} className="flex items-start gap-1.5">
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0 mt-0.5" />
                      <span>{crit}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ── 3. TWO-COLUMN GRID: EVALUATION BASIS & FINANCIAL REQUIREMENTS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* EVALUATION BASIS */}
          <div className="group bg-white rounded-2xl p-6 shadow-2xs hover:shadow-md border border-slate-200/90 hover:border-slate-300 transition-all duration-300 ease-out hover:-translate-y-1 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-1.5 h-4 bg-[#12335f] rounded-full transition-transform duration-300 group-hover:scale-y-125" />
              <h3 className="text-xs font-black text-[#12335f] uppercase tracking-wider">EVALUATION BASIS</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">EVALUATION METHOD</span>
                <span className="font-bold text-slate-900">L1 total value</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">TECHNICAL WEIGHT</span>
                <span className="font-bold text-slate-900">70%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">COMMERCIAL WEIGHT</span>
                <span className="font-bold text-slate-900">30%</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">MIN QUAL MARKS</span>
                <span className="font-bold text-slate-900">60</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">TECH SPECS</span>
                <span className="font-bold text-slate-900">Refer to BOQ Details</span>
              </div>
            </div>
          </div>

          {/* FINANCIAL REQUIREMENTS */}
          <div className="group bg-white rounded-2xl p-6 shadow-2xs hover:shadow-md border border-slate-200/90 hover:border-slate-300 transition-all duration-300 ease-out hover:-translate-y-1 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-1.5 h-4 bg-[#12335f] rounded-full transition-transform duration-300 group-hover:scale-y-125" />
              <h3 className="text-xs font-black text-[#12335f] uppercase tracking-wider">FINANCIAL REQUIREMENTS</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">ESTIMATED VALUE</span>
                <span className="font-black text-emerald-800">{p.estimatedValue ? formatCurrency(p.estimatedValue) : '—'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">EMD AMOUNT</span>
                <span className="font-bold text-slate-900">Exempted</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">PAYMENT TERMS</span>
                <span className="font-bold text-slate-900">{p.paymentTerms || '100% after delivery and acceptance'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">GST INCLUDED</span>
                <span className="font-bold text-slate-900">No</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">FREIGHT INCLUDED</span>
                <span className="font-bold text-emerald-700">Yes</span>
              </div>
            </div>
          </div>
        </div>

        {/* ── 4. TWO-COLUMN GRID: REQUIRED SELLER DOCUMENTS & TERMS & CONDITIONS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* REQUIRED SELLER DOCUMENTS */}
          <div className="group bg-white rounded-2xl p-6 shadow-2xs hover:shadow-md border border-slate-200/90 hover:border-slate-300 transition-all duration-300 ease-out hover:-translate-y-1 space-y-4">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-1.5 h-4 bg-[#12335f] rounded-full transition-transform duration-300 group-hover:scale-y-125" />
              <h3 className="text-xs font-black text-[#12335f] uppercase tracking-wider">REQUIRED SELLER DOCUMENTS</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {['GST Certificate', 'PAN Card', 'Bank Details', 'Technical Compliance Sheet', 'Detailed Price Breakup', 'Experience Certificate', 'Turnover Certificate', 'No-Deviation Certificate'].map((docName, idx) => (
                <div key={idx} className="flex items-center gap-2.5 p-3 rounded-xl border border-slate-200/90 bg-slate-50/50 text-xs font-bold text-slate-800 hover:bg-indigo-50/40 hover:border-indigo-200 hover:scale-[1.02] transition-all duration-200 cursor-default">
                  <FileText className="h-4 w-4 text-blue-600 shrink-0" />
                  <span>{docName}</span>
                </div>
              ))}
            </div>
          </div>

          {/* TERMS & CONDITIONS */}
          <div className="group bg-white rounded-2xl p-6 shadow-2xs hover:shadow-md border border-slate-200/90 hover:border-slate-300 transition-all duration-300 ease-out hover:-translate-y-1 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-1.5 h-4 bg-[#12335f] rounded-full transition-transform duration-300 group-hover:scale-y-125" />
              <h3 className="text-xs font-black text-[#12335f] uppercase tracking-wider">TERMS & CONDITIONS</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">WITHDRAWAL</span>
                <span className="font-bold text-emerald-700">Allowed</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">REVISION</span>
                <span className="font-bold text-emerald-700">Allowed</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">SELLER QUERIES</span>
                <span className="font-bold text-emerald-700">Allowed</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">DELIVERY TERMS</span>
                <span className="font-bold text-slate-900">Door delivery to site</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">WARRANTY TERMS</span>
                <span className="font-bold text-slate-900">12 Months standard warranty</span>
              </div>
            </div>
            {(p.termsAndConditions && p.termsAndConditions.length > 0) && (
              <div className="mt-3 pt-3 border-t border-slate-100">
                <h4 className="text-[10px] font-black text-slate-500 uppercase tracking-wider mb-2">ADDITIONAL T&C</h4>
                <ul className="space-y-1 text-xs text-slate-700 list-disc pl-4">
                  {p.termsAndConditions.map((term, idx) => (
                    <li key={idx}>{term}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </div>

        {/* ── 5. TWO-COLUMN GRID: APPROVAL & WORKFLOW & ACTIVITY & STATUS ── */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* APPROVAL & WORKFLOW */}
          <div className="group bg-white rounded-2xl p-6 shadow-2xs hover:shadow-md border border-slate-200/90 hover:border-slate-300 transition-all duration-300 ease-out hover:-translate-y-1 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-1.5 h-4 bg-[#12335f] rounded-full transition-transform duration-300 group-hover:scale-y-125" />
              <h3 className="text-xs font-black text-[#12335f] uppercase tracking-wider">APPROVAL & WORKFLOW</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">WORKFLOW</span>
                <span className="font-bold text-slate-900">Finance + Procurement</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">NOTES</span>
                <span className="font-bold text-slate-900">{p.description || 'Approved as per departmental requirement.'}</span>
              </div>
            </div>
          </div>

          {/* ACTIVITY & STATUS */}
          <div className="group bg-white rounded-2xl p-6 shadow-2xs hover:shadow-md border border-slate-200/90 hover:border-slate-300 transition-all duration-300 ease-out hover:-translate-y-1 space-y-3">
            <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
              <div className="w-1.5 h-4 bg-[#12335f] rounded-full transition-transform duration-300 group-hover:scale-y-125" />
              <h3 className="text-xs font-black text-[#12335f] uppercase tracking-wider">ACTIVITY & STATUS</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">STATUS</span>
                <span className="font-black text-emerald-700 uppercase">{p.status || 'ACTIVE'}</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">CURRENT STAGE</span>
                <span className="font-bold text-slate-900">Open for Bidding / Active Contract</span>
              </div>
              <div className="flex justify-between py-1 border-b border-slate-100">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">PARTICIPANTS</span>
                <span className="font-bold text-slate-900">0</span>
              </div>
              <div className="flex justify-between py-1">
                <span className="font-semibold text-slate-500 uppercase tracking-wide text-[10px]">CLARIFICATIONS</span>
                <span className="font-bold text-slate-900">0</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Comprehensive Detail Sections (Creative Side-by-Side 2-Column Grid) */}
      {p.detailSections && p.detailSections.length > 0 && (
        <section className="mt-8 space-y-6">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h2 className="text-base font-black text-[#12335f] uppercase tracking-wider flex items-center gap-2">
              <span>COMPREHENSIVE PROCUREMENT SPECIFICATIONS</span>
            </h2>
            <span className="text-xs font-extrabold bg-[#12335f] text-white px-3 py-1 rounded-full shadow-2xs">
              {p.detailSections.length} {p.detailSections.length === 1 ? 'Section' : 'Sections'} Defined
            </span>
          </div>

          <div className="columns-1 lg:columns-2 gap-6 space-y-6 [&>div]:break-inside-avoid-column">
            {p.detailSections.map((section, idx) => {
              const getSectionIcon = (title: string) => {
                const t = title.toLowerCase();
                if (t.includes('intent') || t.includes('scope')) return ClipboardList;
                if (t.includes('buyer') || t.includes('user') || t.includes('contact') || t.includes('org')) return Info;
                if (t.includes('item') || t.includes('qty')) return Package;
                if (t.includes('date') || t.includes('time') || t.includes('schedule')) return CalendarDays;
                if (t.includes('price') || t.includes('budget') || t.includes('cost') || t.includes('value')) return IndianRupee;
                if (t.includes('terms') || t.includes('eligibility') || t.includes('criteria') || t.includes('rule')) return ClipboardCheck;
                return Layers;
              };

              const SectionIcon = getSectionIcon(section.title);

              const longTextFields = section.fields.filter(f => {
                const val = String(f.value || '');
                return val.length > 80 || f.label.toLowerCase().includes('description') || f.label.toLowerCase().includes('reason') || f.label.toLowerCase().includes('justification') || f.label.toLowerCase().includes('notes') || f.label.toLowerCase().includes('scope') || f.label.toLowerCase().includes('terms');
              });

              const propertyFields = section.fields.filter(f => !longTextFields.includes(f));
              const titleField = propertyFields.find(f => f.label.toLowerCase().includes('title'));
              const normalFields = propertyFields.filter(f => f !== titleField);

              return (
                <div 
                  key={`${section.title}-${idx}`} 
                  className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-2xs hover:shadow-md hover:border-slate-300 transition-all duration-200 space-y-3.5 inline-block w-full"
                >
                  {/* Card Header */}
                  <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                    <div className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#12335f]/10 text-[#12335f] font-black shrink-0">
                        <SectionIcon className="h-4 w-4" />
                      </span>
                      <div>
                        <h3 className="text-xs font-black uppercase tracking-wider text-[#12335f]">{section.title}</h3>
                        <p className="text-[10px] text-slate-400 font-semibold">{section.fields.length} {section.fields.length === 1 ? 'parameter' : 'parameters'}</p>
                      </div>
                    </div>
                    <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200 shrink-0">
                      #{idx + 1}
                    </span>
                  </div>

                  {/* Title Banner if available */}
                  {titleField && (
                    <div className="rounded-xl bg-slate-50/80 border border-slate-200/80 p-3">
                      <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block mb-0.5">{titleField.label}</span>
                      <p className="text-xs font-bold text-slate-900 leading-snug">{formatDisplayValue(titleField.value, titleField.label)}</p>
                    </div>
                  )}

                  {/* Parameters Grid */}
                  {normalFields.length > 0 && (
                    <div className="rounded-xl border border-slate-200/70 bg-slate-50/40 p-3.5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3">
                        {normalFields.map((field, fieldIdx) => {
                          const formattedVal = formatDisplayValue(field.value, field.label);
                          const isValueKey = field.label.toLowerCase().includes('value') || field.label.toLowerCase().includes('price') || field.label.toLowerCase().includes('budget');

                          return (
                            <div key={`${field.label}-${fieldIdx}`} className="space-y-0.5">
                              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider block">
                                {field.label}
                              </span>
                              <p className={cn(
                                "text-xs font-medium text-slate-900 leading-snug break-words",
                                isValueKey ? "text-emerald-700 font-bold" : ""
                              )}>
                                {formattedVal}
                              </p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Unified Long-text callout block at bottom */}
                  {longTextFields.length > 0 && (
                    <div className="rounded-xl border border-sky-100 bg-sky-50/30 p-3.5 space-y-2.5 divide-y divide-sky-100/80 text-left">
                      {longTextFields.map((field, fieldIdx) => (
                        <div
                          key={`long-${field.label}-${fieldIdx}`}
                          className={cn("space-y-1", fieldIdx > 0 ? "pt-2.5" : "")}
                        >
                          <span className="text-[10px] font-bold uppercase text-sky-900 tracking-wider block">
                            {field.label}
                          </span>
                          <p className="text-xs font-normal text-slate-700 leading-relaxed whitespace-pre-wrap break-words">
                            {formatDisplayValue(field.value, field.label)}
                          </p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
