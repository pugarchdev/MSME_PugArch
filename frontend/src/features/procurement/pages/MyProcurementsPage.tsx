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
  activeColorClass = "border-blue-500 bg-blue-50/20 ring-1 ring-blue-500/25 text-blue-600",
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
        "flex items-center justify-between rounded-2xl border p-4 transition-all duration-300 text-left hover:-translate-y-0.5 w-full cursor-pointer",
        isActive 
          ? activeColorClass
          : "border-slate-200/80 bg-white hover:border-[#12335f]/30 hover:shadow-sm"
      )}
    >
      <div>
        <p className={cn("text-xl font-black tabular-nums leading-none", isActive ? valueColorClass : "text-slate-900")}>{value}</p>
        <p className="text-[10px] font-bold text-slate-500 mt-1.5">{label}</p>
      </div>
      <div className={cn(
        "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
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
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between pt-4 px-4 sm:px-0">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-950">
            My Procurements
          </h1>
          <p className="text-xs font-semibold text-slate-500 mt-0.5">
            Unified view of all procurement activities — bids, tenders, cart checkout, direct purchases, and requirements. Click KPI cards to filter by status.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ViewModeToggle value={viewMode} onChange={setViewMode} />
          <Button
            type="button"
            variant="outline"
            onClick={loadData}
            disabled={loading}
            className="h-10 rounded-xl border border-slate-200 bg-white text-xs font-black uppercase text-slate-700 hover:bg-slate-50 cursor-pointer"
          >
            <RefreshCw className={cn('mr-2 h-4 w-4', loading && 'animate-spin')} /> Refresh
          </Button>
          <Button
            type="button"
            onClick={() => router.push('/buyer/procurement')}
            className="h-10 rounded-xl bg-blue-600 px-5 text-xs font-black uppercase text-white hover:bg-blue-700 shadow-sm transition-colors border-none cursor-pointer"
          >
            <ShoppingCart className="mr-2 h-4 w-4" /> New Procurement
          </Button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
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

      {/* ── Filters Bar ── */}
      <div className="flex flex-wrap items-center gap-3 py-2 border-y border-slate-100 px-4 sm:px-0">
        {/* Search bar */}
        <div className="relative w-full sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search procurements..."
            className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-xs font-semibold text-slate-800 placeholder-slate-400 outline-none transition focus:border-blue-600 focus:ring-2 focus:ring-blue-600/10 shadow-sm"
          />
        </div>

        {/* Type Select */}
        <div className="w-40">
          <select
            value={typeFilter}
            onChange={e => setTypeFilter(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-350 focus:border-[#12335f] shadow-sm cursor-pointer"
          >
            {TYPE_FILTERS.map(f => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Status Select */}
        <div className="w-40">
          <select
            value={statusFilter}
            onChange={e => {
              setStatusFilter(e.target.value);
              setActiveKpi(e.target.value || null);
            }}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-350 focus:border-[#12335f] shadow-sm cursor-pointer"
          >
            {STATUS_FILTERS.map(f => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Value Select */}
        <div className="w-40">
          <select
            value={valueFilter}
            onChange={e => setValueFilter(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-350 focus:border-[#12335f] shadow-sm cursor-pointer"
          >
            {VALUE_FILTERS.map(f => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </select>
        </div>

        {/* Date Select */}
        <div className="w-40">
          <select
            value={dateFilter}
            onChange={e => setDateFilter(e.target.value)}
            className="h-10 w-full rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none hover:border-slate-350 focus:border-[#12335f] shadow-sm cursor-pointer"
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
            className="text-xs font-black text-red-600 hover:text-red-800 transition-colors uppercase tracking-wider pl-2 cursor-pointer"
          >
            Reset
          </button>
        )}
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
                        className="bg-white shadow-[0_1px_0_rgba(15,23,42,0.04)] transition hover:shadow-md align-middle cursor-pointer"
                        onClick={() => openDetail(p)}
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
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="text-[10px] font-mono font-bold text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                              {p.referenceNumber}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-900 leading-snug line-clamp-2">
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
                            className="inline-flex h-8 min-w-[90px] items-center justify-center rounded-lg bg-blue-600 px-3 text-center text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-all duration-200 border-none cursor-pointer"
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
                        <span className="text-[10px] font-mono font-semibold text-slate-400 tabular-nums">
                          {p.referenceNumber}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm font-bold text-slate-900 leading-snug line-clamp-2">
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
                          className="inline-flex h-8 w-full items-center justify-center rounded-lg bg-blue-600 px-3 text-center text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition-all duration-200 border-none cursor-pointer"
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
    <div className="mx-auto max-w-[1600px] space-y-6 pb-8">

      {/* ── Breadcrumb Navigation ── */}
      <nav className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
        <span className="hover:text-slate-800 cursor-pointer" onClick={onBack}>My Procurements</span>
        <ChevronRight className="h-3 w-3" />
        <span className="hover:text-slate-800 cursor-pointer">{p.referenceNumber || p.title}</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-[#12335f]">Details</span>
      </nav>

      {/* ── Page Header ── */}
      <section className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
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
            className="h-10 rounded-xl border-slate-200 text-xs font-black uppercase text-slate-700 hover:bg-slate-50"
          >
            <ArrowLeft className="mr-2 h-4 w-4" /> Back to List
          </Button>
        </div>
      </section>

      {/* ── Timeline Section ── */}
      <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm overflow-x-auto">
        <div className="min-w-[700px] flex items-center justify-between relative px-6 py-4">
          {/* Horizontal Connection Line */}
          <div className="absolute top-[38px] left-[50px] right-[50px] h-[3px] bg-slate-100 -z-0" />

          {timelineSteps.map((step, idx) => (
            <div key={idx} className="flex flex-col items-center gap-3 relative z-10 w-28 text-center">
              <div
                className={cn(
                  'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-all duration-300',
                  step.active
                    ? 'bg-[#12335f] border-[#12335f] text-white shadow-md shadow-blue-100'
                    : 'bg-white border-slate-200 text-slate-400'
                )}
              >
                {step.active ? (
                  <Check className="h-4 w-4 stroke-[3]" />
                ) : (
                  <div className="h-2 w-2 rounded-full bg-slate-200" />
                )}
              </div>
              <div className="space-y-1">
                <p className={cn('text-xs font-black tracking-tight', step.active ? 'text-[#12335f]' : 'text-slate-800')}>
                  {step.label}
                </p>
                <p className="text-[10px] font-semibold text-slate-500">{step.date}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── Main Details Grid (3 columns) ── */}
      <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr_0.9fr]">

        {/* ═══ COLUMN 1: Procurement Overview ═══ */}
        <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
              Procurement Overview
            </h2>
            <div className="mt-4 space-y-4">
              <InfoRow label="Estimated Value" value={p.estimatedValue ? formatCurrency(p.estimatedValue) : undefined} />
              <InfoRow label="Type" value={p.typeLabel} />
              <InfoRow label="Reference Number" value={p.referenceNumber} mono />
              <InfoRow label="Method" value={p.methodLabel} />
              <InfoRow label="Category" value={p.category} />
              <InfoRow label="Delivery Location" value={p.deliveryLocation} />
              {p.quantity && <InfoRow label="Quantity" value={p.unit ? `${p.quantity} ${p.unit}` : p.quantity} />}
              <InfoRow label="Start Date" value={p.startDate ? formatDateTime(p.startDate) : undefined} />
              <InfoRow label="End / Closing Date" value={p.endDate ? formatDateTime(p.endDate) : undefined} highlight />
              <InfoRow label="Created" value={formatDateTime(p.createdAt)} />
              <InfoRow label="Last Updated" value={formatDateTime(p.updatedAt)} />
            </div>
          </div>

          {/* Payment Terms if available */}
          {p.paymentTerms && (
            <div className="mt-5 rounded-2xl bg-sky-50/40 border border-sky-100 p-4 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-sky-700">Payment Terms</span>
              <p className="mt-1.5 text-xs font-bold text-slate-800 leading-relaxed">{p.paymentTerms}</p>
            </div>
          )}

          {/* Consignee Delivery Details */}
          {(p.deliveryLocation || p.organizationName || p.detailSections) && (
            <div className="mt-5 rounded-2xl bg-indigo-50/40 border border-indigo-100 p-4 text-left">
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-700">Delivery Information</span>
              <div className="mt-2 space-y-1.5">
                {p.organizationName && <p className="text-xs font-bold text-slate-800"><span className="text-slate-500">Buyer:</span> {p.organizationName}</p>}
                {p.deliveryLocation && <p className="text-xs font-bold text-slate-800"><span className="text-slate-500">Location:</span> {p.deliveryLocation}</p>}
                {p.detailSections?.find((s: any) => s.title?.includes('Consignee') || s.title?.includes('Delivery'))?.fields?.map((field: any, fIdx: number) => (
                  <p key={fIdx} className="text-xs font-bold text-slate-800">
                    <span className="text-slate-500">{field.label}:</span> {field.value || '-'}
                  </p>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* ═══ COLUMN 2: Scope & Items ═══ */}
        <div className="space-y-6 flex flex-col">

          {/* Scope / Description */}
          <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-4">
            <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
              Scope & Description
            </h2>
            {(() => {
              const parsed = parseDescription(p.description);
              const hasParsed = parsed.method || parsed.value || parsed.urgency;
              
              const displayMethod = parsed.method
                ? formatDisplayValue(parsed.method)
                : p.methodLabel;
              const displayValue = parsed.value
                ? parsed.value
                : p.estimatedValue
                ? formatCurrency(p.estimatedValue)
                : '';
              const displayUrgency = parsed.urgency
                ? formatDisplayValue(parsed.urgency)
                : 'Normal';

              return (
                <div className="space-y-4">
                  {hasParsed || p.methodLabel ? (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50/50 rounded-2xl p-4 border border-slate-100">
                      {displayMethod && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <ClipboardList className="h-3.5 w-3.5 text-[#12335f]" /> Sourcing Method
                          </span>
                          <p className="text-xs font-extrabold text-[#12335f]">{displayMethod}</p>
                        </div>
                      )}
                      {displayValue && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <IndianRupee className="h-3.5 w-3.5 text-emerald-700" /> Estimated Value
                          </span>
                          <p className="text-xs font-black text-emerald-800">{displayValue}</p>
                        </div>
                      )}
                      {displayUrgency && (
                        <div className="space-y-1">
                          <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                            <AlertTriangle className={cn("h-3.5 w-3.5", displayUrgency.toLowerCase().includes('high') || displayUrgency.toLowerCase().includes('urgent') ? "text-rose-500" : "text-amber-500")} /> Urgency / Priority
                          </span>
                          <div>
                            <span className={cn(
                              "inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-black uppercase border",
                              displayUrgency.toLowerCase().includes('high') || displayUrgency.toLowerCase().includes('urgent')
                                ? "bg-rose-50 border-rose-200 text-rose-700"
                                : "bg-amber-50 border-amber-200 text-amber-700"
                            )}>
                              {displayUrgency}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  ) : null}

                  {parsed.text ? (
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Description / Scope of Work</span>
                      <p className="text-xs font-semibold leading-relaxed text-slate-600 whitespace-pre-wrap break-words">
                        {parsed.text}
                      </p>
                    </div>
                  ) : p.description && !hasParsed ? (
                    <div className="space-y-1">
                      <span className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Description / Scope of Work</span>
                      <p className="text-xs font-semibold leading-relaxed text-slate-600 whitespace-pre-wrap break-words">
                        {p.description}
                      </p>
                    </div>
                  ) : null}
                </div>
              );
            })()}

            {/* Color stat cards */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-2xl bg-purple-50/40 border border-purple-100 p-4 text-left">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-purple-700">Documents</span>
                <p className="mt-1.5 text-lg font-black text-purple-900 tabular-nums">{p.documents?.length || 0}</p>
              </div>
              <div className="rounded-2xl bg-amber-50/40 border border-amber-100 p-4 text-left">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">Line Items</span>
                <p className="mt-1.5 text-lg font-black text-amber-900 tabular-nums">{p.items?.length || 0}</p>
              </div>
            </div>

            {/* Required Documents & Attached Documents List */}
            {p.documents && p.documents.length > 0 && (
              <div className="border-t border-slate-100 pt-4 space-y-3">
                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                  <Paperclip className="h-3.5 w-3.5 text-[#12335f]" /> Documents & Bidder Checklist
                </h4>
                <div className="space-y-2">
                  {p.documents.map((doc, idx) => {
                    const isUploaded = doc.fileAssetId !== null && doc.fileAssetId !== undefined;
                    const isMandatory = doc.required || doc.documentType?.toLowerCase() === 'mandatory';

                    return (
                      <div
                        key={idx}
                        className={cn(
                          "flex flex-col sm:flex-row sm:items-center justify-between p-3.5 rounded-2xl border transition-all text-left gap-3",
                          isMandatory
                            ? "bg-rose-50/10 border-rose-100/50 hover:bg-rose-50/20"
                            : "bg-slate-50/20 border-slate-100 hover:bg-slate-50/40"
                        )}
                      >
                        <div className="flex items-start gap-2.5 min-w-0 flex-1">
                          <div className={cn(
                            "flex h-8 w-8 shrink-0 items-center justify-center rounded-xl",
                            isUploaded ? "bg-blue-50 text-[#12335f]" : "bg-slate-100 text-slate-500"
                          )}>
                            <FileText className="h-4 w-4" />
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <p className="text-xs font-bold text-slate-800 break-words">{doc.fileName}</p>
                              <span className={cn(
                                "rounded-full px-1.5 py-0.2 text-[8px] font-black uppercase border shrink-0",
                                isMandatory
                                  ? "border-rose-200 bg-rose-50 text-rose-700"
                                  : "border-slate-200 bg-slate-50 text-slate-500"
                              )}>
                                {isMandatory ? 'Mandatory' : 'Optional'}
                              </span>
                              {isUploaded && (
                                <span className="rounded-full px-1.5 py-0.2 text-[8px] font-black uppercase border border-blue-200 bg-blue-50 text-blue-700 shrink-0">
                                  Attachment
                                </span>
                              )}
                            </div>
                            {doc.instructions && (
                              <p className="text-[10px] font-semibold text-slate-500 leading-normal whitespace-pre-wrap break-words">{doc.instructions}</p>
                            )}
                          </div>
                        </div>
                        
                        {isUploaded && doc.fileAssetId ? (
                          <div className="flex items-center gap-1 shrink-0 self-end sm:self-center ml-auto sm:ml-2">
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                openFileAsset({ id: doc.fileAssetId!, fileAssetId: doc.fileAssetId!, originalName: doc.fileName }, doc.fileName).catch(err => {
                                  toast.error(err instanceof Error ? err.message : 'Unable to open document');
                                });
                              }}
                              className="h-7 px-2 text-[10px] font-black uppercase text-[#12335f] hover:bg-[#12335f]/10"
                            >
                              <Eye className="mr-1 h-3.5 w-3.5" /> View
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                openFileAsset({ id: doc.fileAssetId!, fileAssetId: doc.fileAssetId!, originalName: doc.fileName }, doc.fileName).catch(err => {
                                  toast.error(err instanceof Error ? err.message : 'Unable to open document');
                                });
                              }}
                              className="h-7 px-2 text-slate-450 hover:bg-slate-200"
                            >
                              <Download className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </section>

          {/* Items Table */}
          {p.items && p.items.length > 0 && (
            <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm overflow-hidden">
              <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
                Items & Specifications
              </h2>
              <div className="mt-4 overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-sm">
                <table className="min-w-[800px] w-full text-left border-collapse table-fixed">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 w-[250px]">Item Details</th>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 w-[100px] text-right">Qty / Unit</th>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 w-[120px] text-right">Est. Unit Price</th>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 w-[80px] text-center">GST</th>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 w-[200px]">Specifications & Brands</th>
                      <th className="px-4 py-2.5 text-[10px] font-black uppercase text-slate-500 w-[150px] text-center">Attachments</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {p.items.map((item, idx) => {
                      const spec = item.specifications || {};
                      const itemType = spec.itemType || (item as any).itemType;
                      const hsn = spec.hsn_sac_code;
                      const brandPref = spec.brand_preference;
                      const brandFlex = spec.brand_flexible;
                      const gstVal = spec.gst !== undefined ? spec.gst : (item as any).gst;
                      const files = spec.attachments || [];
                      const fileId = spec.fileAssetId || (item as any).fileAssetId;
                      const fileName = spec.specificationFileName || (item as any).specificationFileName;

                      return (
                        <tr key={idx} className="hover:bg-slate-50/30 transition-colors align-top">
                          {/* Item Details */}
                          <td className="px-4 py-3 space-y-1">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs font-black text-slate-900 break-words">{item.itemName}</span>
                              {itemType && (
                                <span className={cn(
                                  "rounded-full px-1.5 py-0.5 text-[8px] font-black uppercase border shrink-0",
                                  itemType.toLowerCase() === 'service' 
                                    ? "border-purple-100 bg-purple-50 text-purple-700" 
                                    : "border-blue-100 bg-blue-50 text-blue-700"
                                )}>
                                  {itemType}
                                </span>
                              )}
                            </div>
                            {item.description && (
                              <p className="text-[11px] font-semibold text-slate-500 leading-normal break-words whitespace-pre-wrap">{item.description}</p>
                            )}
                            {hsn && (
                              <p className="text-[9px] text-slate-400 font-extrabold uppercase tracking-wider">
                                HSN/SAC: <span className="font-mono font-bold text-slate-600">{hsn}</span>
                              </p>
                            )}
                          </td>
                          
                          {/* Qty / Unit */}
                          <td className="px-4 py-3 text-right font-bold text-slate-900 text-xs tabular-nums whitespace-nowrap">
                            {item.quantity} <span className="text-[9px] font-semibold text-slate-500 uppercase ml-0.5">{item.unitOfMeasure || 'Nos'}</span>
                          </td>
                          
                          {/* Est. Unit Price */}
                          <td className="px-4 py-3 text-right font-black text-slate-900 text-xs tabular-nums">
                            {item.estimatedUnitPrice !== undefined && item.estimatedUnitPrice !== null ? (
                              formatCurrency(item.estimatedUnitPrice)
                            ) : (
                              '—'
                            )}
                          </td>
                          
                          {/* GST */}
                          <td className="px-4 py-3 text-center font-bold text-slate-600 text-xs tabular-nums">
                            {gstVal !== undefined && gstVal !== null && Number(gstVal) > 0 ? `${gstVal}%` : '—'}
                          </td>
                          
                          {/* Specifications & Preferences */}
                          <td className="px-4 py-3 text-xs text-slate-600 space-y-1">
                            {brandPref ? (
                              <div className="space-y-0.5">
                                <p className="font-extrabold text-slate-400 text-[9px] uppercase tracking-wider">Brand Preference</p>
                                <div className="flex flex-wrap items-center gap-1">
                                  <span className="font-bold text-slate-700">{brandPref}</span>
                                  {brandFlex && (
                                    <span className={cn(
                                      "px-1 py-0.2 rounded text-[8px] uppercase font-black border",
                                      brandFlex.toLowerCase() === 'no'
                                        ? "text-amber-700 bg-amber-50 border-amber-200"
                                        : "text-emerald-700 bg-emerald-50 border-emerald-250"
                                    )}>
                                      {brandFlex.toLowerCase() === 'no' ? 'Strict' : 'Flexible'}
                                    </span>
                                  )}
                                </div>
                              </div>
                            ) : (
                              <span className="text-slate-400 italic text-[10px]">No brand preferences</span>
                            )}
                          </td>
                          
                          {/* Attachments */}
                          <td className="px-4 py-3 text-center text-xs">
                            {files.length > 0 ? (
                              <div className="flex flex-col gap-1 items-center">
                                {files.map((file: any, fidx: number) => (
                                  <button
                                    key={fidx}
                                    type="button"
                                    onClick={() => openFileAsset({ id: file.fileAssetId, fileAssetId: file.fileAssetId, originalName: file.fileName }, file.fileName)}
                                    className="inline-flex items-center gap-1 text-[#12335f] hover:underline font-bold text-[10px]"
                                  >
                                    <FileText className="h-3 w-3 shrink-0" />
                                    <span className="truncate max-w-[100px]" title={file.fileName}>{file.fileName}</span>
                                  </button>
                                ))}
                              </div>
                            ) : fileId ? (
                              <button
                                type="button"
                                onClick={() => openFileAsset({ id: fileId, fileAssetId: fileId, originalName: fileName || 'Specification' }, fileName || 'Specification')}
                                className="inline-flex items-center gap-1 text-[#12335f] hover:underline font-bold text-[10px] mx-auto"
                              >
                                <FileText className="h-3 w-3 shrink-0" />
                                <span className="truncate max-w-[100px]" title={fileName || 'Specification file'}>{fileName || 'Spec File'}</span>
                              </button>
                            ) : (
                              <span className="text-slate-400">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Terms & Eligibility */}
          {((p.eligibilityCriteria && p.eligibilityCriteria.length > 0) || (p.termsAndConditions && p.termsAndConditions.length > 0)) && (
            <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-4">
              <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
                Terms & Conditions
              </h2>
              {p.eligibilityCriteria && p.eligibilityCriteria.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#12335f] mb-2">Eligibility Criteria</p>
                  <ul className="list-disc pl-4 space-y-1.5">
                    {p.eligibilityCriteria.map((c, idx) => (
                      <li key={idx} className="text-xs font-medium text-slate-600 leading-normal">{c}</li>
                    ))}
                  </ul>
                </div>
              )}
              {p.termsAndConditions && p.termsAndConditions.length > 0 && (
                <div>
                  <p className="text-[10px] font-black uppercase tracking-wider text-[#12335f] mb-2">Special Terms</p>
                  <ul className="list-disc pl-4 space-y-1.5">
                    {p.termsAndConditions.map((t, idx) => (
                      <li key={idx} className="text-xs font-medium text-slate-600 leading-normal">{t}</li>
                    ))}
                  </ul>
                </div>
              )}
            </section>
          )}
        </div>

        {/* ═══ COLUMN 3: Organization & Activity ═══ */}
        <div className="space-y-6 flex flex-col">

          {/* Organization Info */}
          <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
              Organization
            </h2>
            <div className="mt-4 space-y-3">
              {p.organizationName && (
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#12335f]/10 text-[#12335f]">
                    <Building2 className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">{p.organizationName}</p>
                    <p className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Procuring Entity</p>
                  </div>
                </div>
              )}
              {p.deliveryLocation && (
                <div className="flex items-center gap-3 pt-2">
                  <MapPin className="h-4 w-4 text-slate-400" />
                  <p className="text-xs font-bold text-slate-700">{p.deliveryLocation}</p>
                </div>
              )}
            </div>
          </section>


          {/* Approval Trail */}
          {p.approvalTrail && p.approvalTrail.length > 0 && (
            <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
                Approval Trail
              </h2>
              <div className="mt-4 space-y-3">
                {p.approvalTrail.map((approval, idx) => (
                  <div key={`${approval.stage}-${idx}`} className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-xs font-black text-slate-900">{approval.label || approval.stage || `Stage ${idx + 1}`}</p>
                      <span className={cn('inline-flex rounded-md border px-2 py-0.5 text-[10px] font-black uppercase', statusTone(approval.decision))}>
                        {approval.decision || 'Pending'}
                      </span>
                    </div>
                    <p className="text-[10px] font-semibold text-slate-500">
                      {approval.approverName ? `${approval.approverName}${approval.approverEmail ? ` · ${approval.approverEmail}` : ''}` : 'Awaiting approver'}
                    </p>
                    {approval.remarks && <p className="text-xs font-semibold text-slate-600">{approval.remarks}</p>}
                    <p className="text-[10px] font-semibold text-slate-400">{approval.decidedAt ? formatDateTime(approval.decidedAt) : 'Not decided'}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Budget & Sanction */}
          {p.budgetDetails && Object.values(p.budgetDetails).some(v => v !== '' && v !== undefined && v !== null) && (
            <section className="border border-slate-100 rounded-3xl bg-white p-6 shadow-sm">
              <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100">
                Budget & Sanction
              </h2>
              <div className="mt-4 space-y-3">
                {p.budgetDetails.budgetHead && <InfoRow label="Budget Head" value={p.budgetDetails.budgetHead} />}
                {p.budgetDetails.financialYear && <InfoRow label="Financial Year" value={p.budgetDetails.financialYear} />}
                {p.budgetDetails.fundSource && <InfoRow label="Fund Source" value={p.budgetDetails.fundSource} />}
                {p.budgetDetails.sanctionAmount && <InfoRow label="Sanction Amount" value={formatCurrency(p.budgetDetails.sanctionAmount)} />}
                {p.budgetDetails.sanctionOrderNumber && <InfoRow label="Sanction Order No." value={p.budgetDetails.sanctionOrderNumber} mono />}
                {p.budgetDetails.sanctionDate && <InfoRow label="Sanction Date" value={formatDate(p.budgetDetails.sanctionDate)} />}
                {p.budgetDetails.approvingAuthority && <InfoRow label="Approving Authority" value={p.budgetDetails.approvingAuthority} />}
                {p.budgetDetails.paymentMode && <InfoRow label="Payment Mode" value={p.budgetDetails.paymentMode} />}
                {p.budgetDetails.costCenter && <InfoRow label="Cost Center" value={p.budgetDetails.costCenter} />}
                {p.budgetDetails.marketComparisonPrice && <InfoRow label="Market Price" value={formatCurrency(p.budgetDetails.marketComparisonPrice)} />}
                {p.budgetDetails.lastPurchasePrice && <InfoRow label="Last Purchase Price" value={formatCurrency(p.budgetDetails.lastPurchasePrice)} />}
              </div>
              {p.budgetDetails.justification && (
                <div className="mt-4 rounded-2xl bg-amber-50/40 border border-amber-100 p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-700">Justification</span>
                  <p className="mt-1.5 text-xs font-bold text-slate-800 leading-relaxed whitespace-pre-wrap">{p.budgetDetails.justification}</p>
                </div>
              )}
              {p.budgetDetails.remarks && (
                <div className="mt-3 rounded-2xl bg-slate-50/40 border border-slate-100 p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-600">Remarks</span>
                  <p className="mt-1.5 text-xs font-bold text-slate-800 leading-relaxed whitespace-pre-wrap">{p.budgetDetails.remarks}</p>
                </div>
              )}
            </section>
          )}

        </div>
      </div>

      {/* Filled Procurement Detail Sections - Moved to full-width container */}
      {p.detailSections && p.detailSections.length > 0 && (
        <section className="mt-8 border border-slate-100 rounded-3xl bg-white p-6 shadow-sm space-y-4">
          <h2 className="text-base font-black text-slate-900 pb-3 border-b border-slate-100 flex items-center justify-between">
            <span>Additional Details</span>
            <span className="text-[10px] font-black uppercase bg-[#12335f]/5 text-[#12335f] px-2.5 py-1 rounded-full border border-[#12335f]/10">
              {p.detailSections.length} {p.detailSections.length === 1 ? 'Section' : 'Sections'}
            </span>
          </h2>
          <div className="space-y-3">
            {(() => {
              // State hook for tracking accordion active index
              const [activeSection, setActiveSection] = React.useState<number | null>(0);

              // Function to pick relevant icons
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

              return p.detailSections.map((section, idx) => {
                const isOpen = activeSection === idx;
                const SectionIcon = getSectionIcon(section.title);
                return (
                  <div 
                    key={`${section.title}-${idx}`} 
                    className={cn(
                      "rounded-2xl border transition-all duration-300 overflow-hidden",
                      isOpen 
                        ? "border-[#12335f]/25 bg-slate-50/30 shadow-sm border-l-4 border-l-[#12335f]" 
                        : "border-slate-100 hover:border-slate-200 bg-white border-l-4 border-l-transparent"
                    )}
                  >
                    {/* Accordion Header */}
                    <button
                      type="button"
                      onClick={() => setActiveSection(isOpen ? null : idx)}
                      className="group w-full flex items-center justify-between p-4 text-left font-black text-xs uppercase tracking-wider text-[#12335f] hover:bg-slate-50/50 transition-colors"
                    >
                      <span className="flex items-center gap-2.5">
                        <span className={cn(
                          "flex h-7 w-7 items-center justify-center rounded-lg text-xs transition-colors font-black",
                          isOpen ? "bg-[#12335f] text-white" : "bg-[#12335f]/10 text-[#12335f]"
                        )}>
                          <SectionIcon className="h-3.5 w-3.5" />
                        </span>
                        <span className="transition-transform duration-200 group-hover:translate-x-0.5">
                          {section.title}
                        </span>
                      </span>
                      <ChevronRight className={cn(
                        "h-4 w-4 text-slate-400 transition-transform duration-300 group-hover:scale-110",
                        isOpen && "rotate-90 text-[#12335f]"
                      )} />
                    </button>

                    {/* Accordion Body */}
                    <div className={cn(
                      "grid transition-all duration-300 ease-in-out border-t border-slate-100/60 bg-white",
                      isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0 pointer-events-none"
                    )}>
                      <div className="overflow-hidden">
                        <div className="px-6 pb-6 pt-4">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                            {section.fields.map((field, fieldIdx) => (
                              <div key={`${field.label}-${fieldIdx}`} className="rounded-xl border border-slate-100 bg-slate-50/30 p-4 hover:bg-slate-50/60 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-2xs">
                                <p className="text-[9px] font-black uppercase tracking-[0.12em] text-slate-400">{field.label}</p>
                                <p className="mt-1.5 text-xs font-bold leading-relaxed text-slate-800 break-words whitespace-pre-wrap">{formatDisplayValue(field.value, field.label)}</p>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              });
            })()}
          </div>
        </section>
      )}
    </div>
  );
}
