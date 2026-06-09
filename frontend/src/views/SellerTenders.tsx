import React, { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import {
  Search,
  Filter,
  Clock,
  MapPin,
  Building2,
  ChevronRight,
  FileText,
  Paperclip,
  CheckCircle2,
  Eye,
  X,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  IndianRupee
} from 'lucide-react';
import { Loader2 } from '@/components/ui/loader';
import { cn } from '../lib/utils';
import { toast } from 'sonner';
import { useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from '../features/shared/Pagination';
import { usePagination, useResponsiveViewMode } from '../features/shared/hooks';
import { ViewModeToggle } from '../features/shared/ViewModeToggle';
import { DocumentPreviewModal } from '../components/DocumentPreviewModal';
import { getFileAssetPreview, type DocumentPreview } from '../lib/files';
import { useAuth } from '../hooks/useAuth';

interface TenderDoc {
  id: number;
  title: string;
  documentType: string;
  url: string;
  originalName?: string;
}

interface PublicTender {
  id: number;
  tenderId: string;
  title: string;
  category: string;
  budget: number;
  status: string;
  closesAt: string;
  createdAt?: string;
  description: string;
  bidsCount?: number;
  documentUrl?: string;
  tenderDocuments?: TenderDoc[];
  hasParticipated?: boolean;
  participationStatus?: string;
  myBidId?: number;
  buyer: {
    name: string;
    buyerProfile?: {
      organizationName: string;
      city: string;
      state: string;
    }
  }
}

const parseDate = (value?: string | null) => {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const formatShortDate = (value?: string | null) => {
  const parsed = parseDate(value);
  return parsed ? parsed.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'Date pending';
};

const PUBLIC_TENDERS_ENDPOINT = '/api/tenders/public?take=50';
const PUBLIC_TENDERS_SESSION_KEY = 'seller.publicTenders.v1';

const readStoredPublicTenders = (): PublicTender[] | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(PUBLIC_TENDERS_SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const storePublicTenders = (rows: PublicTender[]) => {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(PUBLIC_TENDERS_SESSION_KEY, JSON.stringify(rows.slice(0, 50)));
  } catch {
    // Storage quota/private mode should never block rendering.
  }
};

export default function SellerTenders() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const authOptions = { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } };
  const cachedTenders = api.peek(PUBLIC_TENDERS_ENDPOINT, authOptions) || api.peek('/api/tenders/public', authOptions) || readStoredPublicTenders();
  const [tenders, setTenders] = useState<PublicTender[]>(cachedTenders || []);
  const [loading, setLoading] = useState(!cachedTenders);

  // Enhanced Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [budgetRange, setBudgetRange] = useState('All');
  const [selectedState, setSelectedState] = useState('All');
  const [sortBy, setSortBy] = useState('newest');
  // Column-header sort overrides the dropdown preset when the user clicks a
  // sortable header. Clearing it (via the dropdown) hands control back to the
  // preset selector. Keeping both in one place avoids the two controls
  // fighting each other.
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);
  const [previewDocument, setPreviewDocument] = useState<DocumentPreview | null>(null);
  const [showMobileFilters, setShowMobileFilters] = useState(false);

  const router = useRouter();
  const requestedTenderId = searchParams?.get('tender');
  const [selectedTenderForDetails, setSelectedTenderForDetails] = useState<PublicTender | null>(null);
  const [viewMode, setViewMode] = useResponsiveViewMode();

  useEffect(() => {
    fetchPublicTenders();
  }, []);

  useEffect(() => {
    if (!requestedTenderId || selectedTenderForDetails) return;
    const match = tenders.find(tender => String(tender.id) === requestedTenderId || tender.tenderId === requestedTenderId);
    if (match) setSelectedTenderForDetails(match);
  }, [requestedTenderId, selectedTenderForDetails, tenders]);

  useEffect(() => {
    return () => {
      if (previewDocument?.url?.startsWith('blob:')) URL.revokeObjectURL(previewDocument.url);
    };
  }, [previewDocument?.url]);

  const handlePreviewDocument = async (url: string, title: string, event?: React.MouseEvent) => {
    event?.stopPropagation();
    try {
      setPreviewDocument(await getFileAssetPreview({ url }, title));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Unable to open document');
    }
  };

  const handlePreviewTenderDocument = async (tender: PublicTender, event?: React.MouseEvent) => {
    if (tender.documentUrl) {
      await handlePreviewDocument(tender.documentUrl, `${tender.tenderId} Specifications`, event);
    }
  };

  const fetchPublicTenders = async () => {
    try {
      const res = await api.get(PUBLIC_TENDERS_ENDPOINT, authOptions);
      if (res.ok) {
        const data = await res.json();
        setTenders(data);
        storePublicTenders(data);
      }
    } catch (err: any) {
      console.error('Failed to fetch public tenders', err);
      toast.error(`Could not load tenders: ${err.message || 'Network error'}`);
    } finally {
      setLoading(false);
    }
  };

  const uniqueCategories = ['All', ...Array.from(new Set(tenders.map(t => t.category).filter(Boolean)))];
  const uniqueStates = ['All', ...Array.from(new Set(tenders.map(t => t.buyer?.buyerProfile?.state).filter(Boolean)))];
  const tenderMetrics = useMemo(() => {
    const now = Date.now();
    const closingSoon = tenders.filter(tender => {
      const closesAt = parseDate(tender.closesAt)?.getTime();
      if (!closesAt) return false;
      const days = Math.ceil((closesAt - now) / (1000 * 60 * 60 * 24));
      return days >= 0 && days <= 7;
    }).length;
    const participated = tenders.filter(tender => tender.hasParticipated).length;
    const totalBudget = tenders.reduce((sum, tender) => sum + Number(tender.budget || 0), 0);
    return {
      total: tenders.length,
      participated,
      closingSoon,
      totalBudget
    };
  }, [tenders]);
  const activeFilterCount = [
    selectedCategory !== 'All',
    budgetRange !== 'All',
    selectedState !== 'All',
    sortBy !== 'newest'
  ].filter(Boolean).length;

  const filteredTenders = tenders.filter(t => {
    const matchesSearch =
      t.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.tenderId.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (t.buyer?.buyerProfile?.organizationName || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.category.toLowerCase().includes(searchTerm.toLowerCase());

    const matchesCategory = selectedCategory === 'All' || t.category === selectedCategory;
    const matchesState = selectedState === 'All' || t.buyer?.buyerProfile?.state === selectedState;

    let matchesBudget = true;
    if (budgetRange === 'under_10l') matchesBudget = t.budget < 1000000;
    else if (budgetRange === '10l_50l') matchesBudget = t.budget >= 1000000 && t.budget <= 5000000;
    else if (budgetRange === 'above_50l') matchesBudget = t.budget > 5000000;

    return matchesSearch && matchesCategory && matchesState && matchesBudget;
  }).sort((a, b) => {
    // Explicit column-header sort wins when active.
    if (sortConfig) {
      const direction = sortConfig.direction === 'asc' ? 1 : -1;
      const valueFor = (t: PublicTender): string | number => {
        switch (sortConfig.key) {
          case 'tenderId': return t.tenderId || '';
          case 'title': return t.title || '';
          case 'category': return t.category || '';
          case 'buyer': return t.buyer?.buyerProfile?.organizationName || t.buyer?.name || '';
          case 'budget': return Number(t.budget || 0);
          case 'closes': return parseDate(t.closesAt)?.getTime() || Number.MAX_SAFE_INTEGER;
          case 'posted': return parseDate(t.createdAt)?.getTime() || 0;
          default: return t.id;
        }
      };
      const aValue = valueFor(a);
      const bValue = valueFor(b);
      if (typeof aValue === 'number' && typeof bValue === 'number') return (aValue - bValue) * direction;
      return String(aValue).localeCompare(String(bValue)) * direction;
    }
    // Otherwise use the preset dropdown.
    if (sortBy === 'newest') return (parseDate(b.createdAt)?.getTime() || 0) - (parseDate(a.createdAt)?.getTime() || 0);
    if (sortBy === 'budget_high') return b.budget - a.budget;
    if (sortBy === 'budget_low') return a.budget - b.budget;
    if (sortBy === 'deadline') return (parseDate(a.closesAt)?.getTime() || Number.MAX_SAFE_INTEGER) - (parseDate(b.closesAt)?.getTime() || Number.MAX_SAFE_INTEGER);
    return 0;
  });
  const { page, pageSize, pageItems: pagedTenders, total, setPage, setPageSize } = usePagination(filteredTenders, 10);

  const getDaysLeft = (date: string) => {
    const closesAt = parseDate(date);
    if (!closesAt) return 'Date pending';
    const diff = closesAt.getTime() - new Date().getTime();
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));

    return days > 0 ? `${days}d` : 'Closing soon';
  };

  const toggleSort = (key: string) => {
    setSortConfig(prev => ({
      key,
      direction: prev?.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };


  const getTenderActionHref = (tender: PublicTender) => {
    if (!user) return `/login?returnUrl=${encodeURIComponent(`/seller/tenders/${tender.id}/bid`)}`;
    if (tender.hasParticipated) {
      return tender.myBidId
        ? `/quotations?bidId=${tender.myBidId}`
        : `/quotations?tenderId=${tender.id}`;
    }
    return `/seller/tenders/${tender.id}/bid`;
  };

  const SortHeader = ({ label, sortKey, className = '' }: { label: string; sortKey: string; className?: string }) => {
    const isActive = sortConfig?.key === sortKey;
    return (
      <button
        type="button"
        onClick={() => toggleSort(sortKey)}
        className={cn("inline-flex items-center gap-1.5 text-[11px] font-bold uppercase text-slate-500 hover:text-indigo-600 transition-colors", className)}
      >
        {label}
        {isActive ? (
          sortConfig?.direction === 'asc' ? <ArrowUp className="h-3.5 w-3.5 text-indigo-600" /> : <ArrowDown className="h-3.5 w-3.5 text-indigo-600" />
        ) : (
          <ArrowUpDown className="h-3.5 w-3.5 opacity-40" />
        )}
      </button>
    );
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 p-2 md:p-4">
      <div className="max-w-7xl mx-auto">
        {/* Compact Header Section */}
        <div className="flex flex-col gap-3 mb-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="space-y-0.5 text-center md:text-left">
              <div className="flex items-center justify-center gap-2 md:justify-start">
                <h1 className="text-xl font-black text-slate-900 tracking-tight">Active Tenders</h1>
                <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[10px] font-bold">
                  {filteredTenders.length} Found
                </span>
                {loading && (
                  <span className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    Refreshing
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium">
                Discover procurement opportunities.
              </p>
            </div>

            <div className="flex items-center justify-center gap-2 md:justify-end">
              <button
                type="button"
                onClick={() => setShowMobileFilters(value => !value)}
                className={cn(
                  "inline-flex h-9 items-center justify-center gap-2 rounded-lg border px-3 text-xs font-black uppercase tracking-wide shadow-sm md:hidden",
                  showMobileFilters ? "border-indigo-200 bg-indigo-50 text-indigo-700" : "border-slate-200 bg-white text-slate-700"
                )}
                aria-expanded={showMobileFilters}
              >
                <Filter className="h-4 w-4" />
                Filters
                {activeFilterCount > 0 && (
                  <span className="flex h-5 min-w-5 items-center justify-center rounded bg-indigo-600 px-1 text-[10px] text-white">
                    {activeFilterCount}
                  </span>
                )}
              </button>

              <ViewModeToggle value={viewMode} onChange={setViewMode} size="sm" />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
            <MetricTile label="Open Tenders" value={tenderMetrics.total.toLocaleString('en-IN')} icon={FileText} />
            <MetricTile label="My Bids" value={tenderMetrics.participated.toLocaleString('en-IN')} icon={CheckCircle2} />
            <MetricTile label="Closing Soon" value={tenderMetrics.closingSoon.toLocaleString('en-IN')} icon={Clock} />
            <MetricTile label="Visible Value" value={`Rs. ${tenderMetrics.totalBudget.toLocaleString('en-IN')}`} icon={IndianRupee} />
          </div>

          <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-end">
            <div className="relative w-full md:max-w-sm lg:w-64">
              <Search className="absolute inset-y-0 left-3 flex items-center h-full w-3.5 text-slate-400 pointer-events-none" />
              <input
                type="text"
                placeholder="Search keyword, ID or company..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full h-9 bg-white border border-slate-200 rounded-lg pl-9 pr-3 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500/30 outline-none shadow-sm"
              />
            </div>

            <div className={cn(
              "gap-2",
              showMobileFilters ? "grid grid-cols-1 sm:grid-cols-2" : "hidden",
              "md:grid md:grid-cols-[minmax(110px,auto)_minmax(110px,auto)_minmax(110px,auto)_minmax(150px,auto)] md:items-center"
            )}>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="h-9 w-full px-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500/30 outline-none shadow-sm min-w-[110px] cursor-pointer"
              >
                <option value="All">All Sectors</option>
                {uniqueCategories.filter(c => c !== 'All').map(cat => <option key={cat} value={cat}>{cat}</option>)}
              </select>

              <select
                value={budgetRange}
                onChange={(e) => setBudgetRange(e.target.value)}
                className="h-9 w-full px-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500/30 outline-none shadow-sm min-w-[110px] cursor-pointer"
              >
                <option value="All">All Budgets</option>
                <option value="under_10l">Under 10 Lakh</option>
                <option value="10l_50l">10L - 50L</option>
                <option value="above_50l">Above 50L</option>
              </select>

              <select
                value={selectedState}
                onChange={(e) => setSelectedState(e.target.value)}
                className="h-9 w-full px-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 focus:ring-1 focus:ring-indigo-500/30 outline-none shadow-sm min-w-[100px] cursor-pointer"
              >
                <option value="All">All Locations</option>
                {uniqueStates.filter(s => s !== 'All').map(st => <option key={st} value={st}>{st}</option>)}
              </select>

              <select
                value={sortConfig ? '' : sortBy}
                onChange={(e) => { setSortConfig(null); setSortBy(e.target.value); }}
                className="h-9 w-full px-2 bg-slate-50 border border-slate-200 rounded-lg text-[10px] font-black uppercase text-slate-600 hover:bg-slate-100 focus:ring-1 focus:ring-indigo-500/30 outline-none shadow-sm cursor-pointer tracking-wide"
              >
                {sortConfig && <option value="">Custom (column sort)</option>}
                <option value="newest">Newest Posted</option>
                <option value="deadline">Expiring Soonest</option>
                <option value="budget_high">Budget (High to Low)</option>
                <option value="budget_low">Budget (Low to High)</option>
              </select>
            </div>
          </div>
        </div>

        {/* Tenders List/Grid Container */}
        {loading && tenders.length === 0 ? (
          <TenderListSkeleton viewMode={viewMode} />
        ) : filteredTenders.length === 0 ? (
          <div className="bg-white border border-dashed border-slate-200 rounded-xl p-12 text-center">
            <FileText className="h-10 w-10 text-slate-200 mx-auto mb-2" />
            <p className="text-base font-bold text-slate-900">No active tenders found</p>
          </div>
        ) : viewMode === 'grid' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {pagedTenders.map((tender, index) => {
              const participated = Boolean(tender.hasParticipated);
              const participationLabel = tender.participationStatus
                ? tender.participationStatus.replace(/_/g, ' ')
                : 'submitted';

              return (
                <Card
                  key={tender.id}
                  onClick={() => setSelectedTenderForDetails(tender)}
                  className={cn(
                    "shadow-sm hover:shadow-md transition-all duration-200 overflow-hidden group cursor-pointer flex flex-col border h-full bg-white",
                    participated ? "border-emerald-200 bg-emerald-50/10" : "border-slate-200"
                  )}
                >
                  <CardContent className="p-5 flex flex-col h-full justify-between relative">
                    {/* Indicator Line */}
                    <div className={cn(
                      "absolute left-0 right-0 top-0 h-1 transition-colors",
                      participated ? "bg-emerald-500" : "bg-indigo-500/20 group-hover:bg-indigo-500"
                    )} />

                    <div className="space-y-4">
                      {/* Header: Category, Index, Closes */}
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[10px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {(page - 1) * pageSize + index + 1}
                          </span>
                          <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100 uppercase">
                            {tender.category}
                          </span>
                        </div>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100">
                          <Clock className="h-3 w-3" />
                          {getDaysLeft(tender.closesAt)}
                        </span>
                      </div>

                      {/* Tender ID */}
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                          {tender.tenderId}
                        </span>
                        {participated && (
                          <span className="flex items-center gap-1 text-[9px] font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded border border-emerald-200 uppercase">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Participated
                          </span>
                        )}
                      </div>

                      {/* Title & Desc */}
                      <div className="space-y-1">
                        <h3 className="text-sm font-bold text-slate-800 group-hover:text-indigo-600 transition-colors line-clamp-2 min-h-[40px] leading-snug">
                          {tender.title}
                        </h3>
                        <p className="text-[11px] text-slate-500 line-clamp-3 font-medium leading-relaxed">
                          {tender.description}
                        </p>
                      </div>

                      {/* Specs Doc if available */}
                      {((tender.tenderDocuments && tender.tenderDocuments.length > 0) || tender.documentUrl) && (
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            if (tender.tenderDocuments && tender.tenderDocuments.length > 0) {
                              const firstDoc = tender.tenderDocuments[0];
                              handlePreviewDocument(firstDoc.url, firstDoc.title, e);
                            } else if (tender.documentUrl) {
                              handlePreviewDocument(tender.documentUrl, `${tender.tenderId} Specifications`, e);
                            }
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 hover:border-emerald-300 rounded-md transition-all cursor-pointer shadow-sm group/spec active:scale-98"
                          title="View Specifications Document"
                        >
                          <FileText className="h-3.5 w-3.5 text-emerald-600 shrink-0 transition-transform group-hover/spec:scale-110" />
                          <span className="text-[10px] font-extrabold text-emerald-800 tracking-wide">Spec Doc</span>
                        </div>
                      )}
                    </div>

                    {/* Divider */}
                    <div className="h-px bg-slate-100 my-4" />

                    {/* Footer details */}
                    <div className="space-y-4">
                      {/* Buyer & Location */}
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <p className="text-[11px] font-semibold text-slate-700 line-clamp-1">
                            {tender.buyer?.buyerProfile?.organizationName || tender.buyer?.name || 'Unknown Buyer'}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                          <p className="text-[11px] font-semibold text-slate-500 line-clamp-1">
                            {tender.buyer?.buyerProfile?.city || 'City N/A'}, {tender.buyer?.buyerProfile?.state || 'State N/A'}
                          </p>
                        </div>
                      </div>

                      {/* Budget & Actions */}
                      <div className="pt-2 flex items-center justify-between gap-4 border-t border-slate-50">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Budget</p>
                          <p className="text-sm font-black text-slate-800">₹{tender.budget?.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedTenderForDetails(tender);
                            }}
                            variant="outline"
                            className="h-8 w-8 p-0 border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-all rounded-lg shrink-0 flex items-center justify-center shadow-sm"
                            title="View Full Tender Details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={(e) => {
                              e.stopPropagation();
                              router.push(getTenderActionHref(tender));
                            }}
                            className={cn(
                              "h-8 px-3 text-white rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm transition-colors",
                              participated ? "bg-emerald-600 hover:bg-emerald-700" : "bg-indigo-600 hover:bg-indigo-700"
                            )}
                          >
                            {participated ? 'View Bid' : 'Apply'}
                            {participated ? <CheckCircle2 className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        ) : (
          <>
            {/* ── Desktop / tablet: sortable table ───────────────────────── */}
            <div className="hidden md:block overflow-x-auto border border-slate-200 rounded-lg bg-white shadow-sm">
              <table className="w-full text-left border-collapse min-w-[920px]">
                <thead className="bg-slate-50/60 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase text-slate-500 w-14">#</th>
                    <th className="px-4 py-3 w-32"><SortHeader label="Tender ID" sortKey="tenderId" /></th>
                    <th className="px-4 py-3"><SortHeader label="Title" sortKey="title" /></th>
                    <th className="px-4 py-3"><SortHeader label="Category" sortKey="category" /></th>
                    <th className="px-4 py-3"><SortHeader label="Buyer" sortKey="buyer" /></th>
                    <th className="px-4 py-3 text-right"><SortHeader label="Budget" sortKey="budget" className="justify-end" /></th>
                    <th className="px-4 py-3"><SortHeader label="Closes" sortKey="closes" /></th>
                    <th className="px-4 py-3 text-[11px] font-bold uppercase text-slate-500 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedTenders.map((tender, index) => {
                    const participated = Boolean(tender.hasParticipated);
                    const hasSpec = (tender.tenderDocuments && tender.tenderDocuments.length > 0) || Boolean(tender.documentUrl);
                    return (
                      <tr
                        key={tender.id}
                        onClick={() => setSelectedTenderForDetails(tender)}
                        className={cn(
                          "cursor-pointer transition-colors hover:bg-slate-50/70",
                          participated && "bg-emerald-50/30"
                        )}
                      >
                        <td className="px-4 py-3 text-xs font-mono font-bold text-slate-400">
                          {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[11px] font-mono font-bold text-slate-500 bg-slate-50 px-2 py-0.5 rounded border border-slate-100 whitespace-nowrap">
                            {tender.tenderId}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[260px]">
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-bold text-slate-800 line-clamp-1">{tender.title}</p>
                            {participated && (
                              <span title="Participated" className="shrink-0">
                                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 line-clamp-1 font-medium">{tender.description}</p>
                          {hasSpec && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                if (tender.tenderDocuments && tender.tenderDocuments.length > 0) {
                                  const firstDoc = tender.tenderDocuments[0];
                                  handlePreviewDocument(firstDoc.url, firstDoc.title, e);
                                } else if (tender.documentUrl) {
                                  handlePreviewDocument(tender.documentUrl, `${tender.tenderId} Specifications`, e);
                                }
                              }}
                              className="mt-1 inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide text-emerald-600 hover:text-emerald-700"
                              title="View specifications document"
                            >
                              <FileText className="h-3 w-3" /> View Spec
                            </button>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-[10px] font-black bg-indigo-50 text-indigo-600 px-2 py-1 rounded border border-indigo-100 uppercase whitespace-nowrap">
                            {tender.category}
                          </span>
                        </td>
                        <td className="px-4 py-3 max-w-[180px]">
                          <p className="text-xs font-semibold text-slate-700 line-clamp-1">
                            {tender.buyer?.buyerProfile?.organizationName || tender.buyer?.name || 'Unknown Buyer'}
                          </p>
                          <p className="text-[10px] font-medium text-slate-400 line-clamp-1 flex items-center gap-1">
                            <MapPin className="h-2.5 w-2.5" />
                            {tender.buyer?.buyerProfile?.city || 'City N/A'}, {tender.buyer?.buyerProfile?.state || 'State N/A'}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm font-black text-slate-800 text-right whitespace-nowrap">
                          ₹{tender.budget?.toLocaleString()}
                        </td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-1 rounded border border-amber-100 whitespace-nowrap">
                            <Clock className="h-3 w-3" />
                            {getDaysLeft(tender.closesAt)}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1.5">
                            <Button
                              onClick={(e) => { e.stopPropagation(); setSelectedTenderForDetails(tender); }}
                              variant="outline"
                              className="h-8 w-8 p-0 border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-all rounded-lg shrink-0 flex items-center justify-center shadow-sm"
                              title="View full tender details"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                            <Button
                              onClick={(e) => { e.stopPropagation(); router.push(getTenderActionHref(tender)); }}
                              className={cn(
                                "h-8 px-3 text-white rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm transition-colors whitespace-nowrap",
                                participated ? "bg-emerald-600 hover:bg-emerald-700" : "bg-indigo-600 hover:bg-indigo-700"
                              )}
                            >
                              {participated ? 'View Bid' : 'Apply'}
                              {participated ? <CheckCircle2 className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* ── Mobile: stacked cards (tables don't fit small screens) ──── */}
            <div className="grid grid-cols-1 gap-3 md:hidden">
              {pagedTenders.map((tender, index) => {
                const participated = Boolean(tender.hasParticipated);
                const hasSpec = (tender.tenderDocuments && tender.tenderDocuments.length > 0) || Boolean(tender.documentUrl);
                return (
                  <Card
                    key={tender.id}
                    onClick={() => setSelectedTenderForDetails(tender)}
                    className={cn(
                      "shadow-sm transition-all duration-200 overflow-hidden cursor-pointer bg-white",
                      participated ? "border-emerald-200 bg-emerald-50/25" : "border-slate-200"
                    )}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-black text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                          {String((page - 1) * pageSize + index + 1).padStart(2, '0')}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 font-bold bg-slate-50 px-2 py-0.5 rounded border border-slate-100">
                          {tender.tenderId}
                        </span>
                        <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-2 py-0.5 rounded border border-indigo-100 uppercase">
                          {tender.category}
                        </span>
                        <span className="flex items-center gap-1 text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded border border-amber-100 ml-auto">
                          <Clock className="h-3 w-3" />
                          {getDaysLeft(tender.closesAt)}
                        </span>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="text-sm font-bold text-slate-800 line-clamp-2">{tender.title}</h3>
                          {participated && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />}
                        </div>
                        <p className="text-[11px] text-slate-500 line-clamp-2 font-medium mt-0.5">{tender.description}</p>
                      </div>

                      <div className="flex items-center gap-2">
                        <Building2 className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <p className="text-[11px] font-semibold text-slate-700 line-clamp-1">
                          {tender.buyer?.buyerProfile?.organizationName || tender.buyer?.name || 'Unknown Buyer'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                        <p className="text-[11px] font-semibold text-slate-500 line-clamp-1">
                          {tender.buyer?.buyerProfile?.city || 'City N/A'}, {tender.buyer?.buyerProfile?.state || 'State N/A'}
                        </p>
                      </div>

                      {hasSpec && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (tender.tenderDocuments && tender.tenderDocuments.length > 0) {
                              const firstDoc = tender.tenderDocuments[0];
                              handlePreviewDocument(firstDoc.url, firstDoc.title, e);
                            } else if (tender.documentUrl) {
                              handlePreviewDocument(tender.documentUrl, `${tender.tenderId} Specifications`, e);
                            }
                          }}
                          className="inline-flex items-center gap-2 px-3 py-1 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 rounded-md transition-all cursor-pointer shadow-sm"
                          title="View specifications document"
                        >
                          <FileText className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                          <span className="text-[10px] font-extrabold text-emerald-800 tracking-wide">View Spec</span>
                        </button>
                      )}

                      <div className="flex items-center justify-between gap-3 pt-2 border-t border-slate-100">
                        <div>
                          <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider">Budget</p>
                          <p className="text-sm font-black text-slate-800">₹{tender.budget?.toLocaleString()}</p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Button
                            onClick={(e) => { e.stopPropagation(); setSelectedTenderForDetails(tender); }}
                            variant="outline"
                            className="h-8 w-8 p-0 border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50 text-slate-500 hover:text-indigo-600 transition-all rounded-lg shrink-0 flex items-center justify-center shadow-sm"
                            title="View full tender details"
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={(e) => { e.stopPropagation(); router.push(getTenderActionHref(tender)); }}
                            className={cn(
                              "h-8 px-4 text-white rounded text-[11px] font-bold uppercase tracking-wider flex items-center gap-1.5 shadow-sm transition-colors",
                              participated ? "bg-emerald-600 hover:bg-emerald-700" : "bg-indigo-600 hover:bg-indigo-700"
                            )}
                          >
                            {participated ? 'View Bid' : 'Participate'}
                            {participated ? <CheckCircle2 className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </>
        )}
        {filteredTenders.length > 0 && (
          <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-white">
            <Pagination page={page} pageSize={pageSize} total={total} onPageChange={setPage} onPageSizeChange={setPageSize} label="tenders" />
          </div>
        )}
      </div>
      {/* TENDER DETAILS MODAL */}
      {selectedTenderForDetails && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-blue-900/60 backdrop-blur-sm animate-in fade-in duration-300"
            onClick={() => setSelectedTenderForDetails(null)}
          />
          <div className="relative w-full max-w-2xl overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-slate-100 bg-gradient-to-r from-blue-900 to-indigo-800 px-6 py-4 text-white">
              <div className="space-y-0.5">
                <p className="text-[10px] font-black uppercase tracking-wider text-indigo-200">Tender Specifications & Details</p>
                <h3 className="text-base font-bold leading-tight">
                  {selectedTenderForDetails.title}
                </h3>
              </div>
              <button
                onClick={() => setSelectedTenderForDetails(null)}
                className="flex h-8 w-8 items-center justify-center rounded-lg border border-white/10 bg-white/5 text-white transition-colors hover:bg-white/10"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="max-h-[70vh] overflow-y-auto p-6 space-y-6">
              {/* Participation Status Banner */}
              {selectedTenderForDetails.hasParticipated && (
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center shrink-0">
                    <CheckCircle2 className="h-4 w-4" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-emerald-950">You have already participated in this Tender</p>
                    <p className="text-[10px] font-medium text-emerald-700">
                      Status: <span className="font-bold capitalize">{selectedTenderForDetails.participationStatus || 'Submitted'}</span>
                      {selectedTenderForDetails.myBidId && ` | Bid ID: ${selectedTenderForDetails.myBidId}`}
                    </p>
                  </div>
                </div>
              )}

              {/* Metadata Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Tender ID</p>
                  <p className="text-xs font-mono font-bold text-slate-900 mt-0.5">{selectedTenderForDetails.tenderId}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Category</p>
                  <p className="text-xs font-bold text-indigo-700 mt-0.5 uppercase">{selectedTenderForDetails.category}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Budget</p>
                  <p className="text-xs font-bold text-emerald-700 mt-0.5">₹{selectedTenderForDetails.budget?.toLocaleString()}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Total Bids</p>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">{selectedTenderForDetails.bidsCount || 0} Bid(s)</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Posted On</p>
                  <p className="text-xs font-bold text-slate-700 mt-0.5">{formatShortDate(selectedTenderForDetails.createdAt)}</p>
                </div>
                <div className="bg-slate-50 border border-slate-100 rounded-lg p-3">
                  <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Closing Date</p>
                  <p className="text-xs font-bold text-amber-600 mt-0.5">{formatShortDate(selectedTenderForDetails.closesAt)} ({getDaysLeft(selectedTenderForDetails.closesAt)})</p>
                </div>
              </div>

              {/* Description / Requirements */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Detailed Requirements & Scope</h4>
                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <p className="text-xs font-medium text-slate-700 whitespace-pre-wrap leading-relaxed">
                    {selectedTenderForDetails.description || 'No detailed description provided.'}
                  </p>
                </div>
              </div>

              {/* Specifications Documents */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest font-bold">Specifications Documents</h4>
                {((selectedTenderForDetails.tenderDocuments && selectedTenderForDetails.tenderDocuments.length > 0) || selectedTenderForDetails.documentUrl) ? (
                  <div className="space-y-2">
                    {/* Render legacy/main documentUrl if it exists */}
                    {selectedTenderForDetails.documentUrl && !(selectedTenderForDetails.tenderDocuments && selectedTenderForDetails.tenderDocuments.length > 0) && (
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-emerald-50/40 border border-emerald-100 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0 shadow-sm">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-bold text-slate-800">Main Specifications Sheet</p>
                            <p className="text-[10px] text-slate-500 font-medium">Specs and compliance sheet uploaded by buyer</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handlePreviewDocument(selectedTenderForDetails.documentUrl!, `${selectedTenderForDetails.tenderId} Specifications`, e)}
                          className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                          View Document
                        </button>
                      </div>
                    )}
                    {/* Render tenderDocuments array */}
                    {(selectedTenderForDetails.tenderDocuments || []).map((doc, idx) => (
                      <div key={doc.id || idx} className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-50 border border-slate-100 rounded-xl p-4">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center shrink-0 shadow-sm">
                            <FileText className="h-5 w-5" />
                          </div>
                          <div className="text-left">
                            <p className="text-xs font-bold text-slate-800">{doc.title || `Document #${idx + 1}`}</p>
                            <p className="text-[10px] text-slate-500 font-medium capitalize">{doc.documentType} Document {doc.originalName && `(${doc.originalName})`}</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={(e) => handlePreviewDocument(doc.url, doc.title, e)}
                          className="w-full sm:w-auto px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-1.5 shadow-sm transition-colors"
                        >
                          <Eye className="h-4 w-4" />
                          View Document
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-6 text-center">
                    <Paperclip className="h-8 w-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-xs font-bold text-slate-400">No specifications documents uploaded by buyer.</p>
                  </div>
                )}
              </div>

              {/* Buyer Details */}
              <div className="space-y-2">
                <h4 className="text-[11px] font-black text-slate-400 uppercase tracking-widest">Buyer Information</h4>
                <div className="grid md:grid-cols-2 gap-4 bg-slate-50 border border-slate-100 rounded-xl p-4">
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Organization</p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5">
                      {selectedTenderForDetails.buyer?.buyerProfile?.organizationName || selectedTenderForDetails.buyer?.name || 'Unknown Buyer'}
                    </p>
                  </div>
                  <div>
                    <p className="text-[9px] font-bold text-slate-400 uppercase tracking-wider">Location</p>
                    <p className="text-xs font-semibold text-slate-700 mt-0.5">
                      {selectedTenderForDetails.buyer?.buyerProfile?.city || 'City N/A'}, {selectedTenderForDetails.buyer?.buyerProfile?.state || 'State N/A'}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="border-t border-slate-100 bg-slate-50/50 px-6 py-4 flex items-center justify-end gap-3">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setSelectedTenderForDetails(null)}
                className="h-9 px-4 rounded-md font-bold uppercase text-[10px] tracking-widest text-slate-500 hover:text-slate-900"
              >
                Close
              </Button>
              <Button
                onClick={() => {
                  setSelectedTenderForDetails(null);
                  router.push(getTenderActionHref(selectedTenderForDetails));
                }}
                className={cn(
                  "h-9 px-6 text-white rounded-md font-bold uppercase text-[10px] tracking-widest flex items-center justify-center gap-2 transition-all active:scale-98 shadow-sm",
                  selectedTenderForDetails.hasParticipated ? "bg-emerald-600 hover:bg-emerald-700" : "bg-[#12335f] hover:bg-[#0b2445]"
                )}
              >
                {selectedTenderForDetails.hasParticipated ? 'View Submitted Bid' : 'Participate & Submit Bid'}
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
      <DocumentPreviewModal previewDocument={previewDocument} onClose={() => setPreviewDocument(null)} />
    </div>
  );
}

function MetricTile({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">{label}</p>
          <p className="mt-1 truncate text-lg font-black text-slate-950">{value}</p>
        </div>
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-50 text-indigo-700">
          <Icon className="h-4 w-4" />
        </div>
      </div>
    </div>
  );
}

function TenderListSkeleton({ viewMode }: { viewMode: 'grid' | 'list' }) {
  if (viewMode === 'grid') {
    return (
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, index) => (
          <div key={index} className="h-64 animate-pulse rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="h-4 w-24 rounded bg-slate-100" />
            <div className="mt-6 h-4 w-3/4 rounded bg-slate-100" />
            <div className="mt-3 h-3 w-full rounded bg-slate-100" />
            <div className="mt-2 h-3 w-5/6 rounded bg-slate-100" />
            <div className="mt-8 h-3 w-1/2 rounded bg-slate-100" />
            <div className="mt-6 flex justify-between">
              <div className="h-5 w-24 rounded bg-slate-100" />
              <div className="h-8 w-24 rounded bg-slate-100" />
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
      {Array.from({ length: 6 }).map((_, index) => (
        <div key={index} className="grid animate-pulse grid-cols-[56px_140px_1fr_140px_140px_120px] gap-4 border-b border-slate-100 px-4 py-4 last:border-b-0">
          <div className="h-4 rounded bg-slate-100" />
          <div className="h-4 rounded bg-slate-100" />
          <div className="h-4 rounded bg-slate-100" />
          <div className="h-4 rounded bg-slate-100" />
          <div className="h-4 rounded bg-slate-100" />
          <div className="h-4 rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}
